// The OCR service (DESIGN §15.2): the OCR cache first, the backend only on a miss, the result written back. The
// cache is the Dexie store the translations use (cachePortOf); `ocrCacheKey` derives the key from the image bytes
// and the recogniser's version alone. Which backend answers is `OcrBackend`'s business (DESIGN §15.3).
import { ocrCacheKey } from '@/cache/key'
import type { CancelledScopeRegistry } from '@/providers/request/cancellation'
import { CACHE_READ_BUDGET_MS, type CachePort, readWithBudget } from '@/providers/translate-service'
import type { OcrCall, OcrMessageResponse, OcrResult } from '@/shared/ocr'
import { type OcrBackend, OcrBackendError } from './ocr-backend'

export interface OcrServiceDeps {
  backend: OcrBackend
  cache: CachePort
  /** Where a warning goes besides the console: the diagnostics log (issue #156) */
  warn?: (line: string) => void
  /**
   * Scopes the session router has ended for certain (DESIGN §8.5), the same registry the translate services read.
   * Checked at entry and again after the cache read: a drop can land in that window, when the request is not yet in
   * the backend's queue and its `cancel` finds nothing (seen on a real machine)
   */
  cancelled: Pick<CancelledScopeRegistry, 'has'>
  /** The cache read's waiting cap (tests); the same CACHE_READ_BUDGET_MS as translations by default */
  cacheReadBudgetMs?: number
}

export interface OcrService {
  ocr(call: OcrCall): Promise<OcrMessageResponse>
  /** Drain the scope's queued and in-flight recognitions; returns how many. Refusing the scope's later calls is the registry's job */
  cancel(scope: string): number
}

/** A cached record has to be the shape we wrote; anything else that collides with the key cannot serve as a result */
function parseCached(raw: string | null | undefined): OcrResult | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<OcrResult>
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number' || !Array.isArray(parsed.lines)) return null
    return parsed as OcrResult
  } catch {
    return null
  }
}

export function createOcrService(deps: OcrServiceDeps): OcrService {
  const aborted = (): OcrMessageResponse => ({ ok: false, error: { kind: 'aborted', message: 'session withdrawn' } })

  return {
    async ocr(call) {
      if (call.scope && deps.cancelled.has(call.scope)) return aborted()
      const key = await ocrCacheKey(call.imageHash, deps.backend.version)
      // IndexedDB may hang rather than reject: over budget counts as a miss, or the backend's timeout could never start and the message channel would stay open (Codex on #87)
      const [hit] = await readWithBudget(deps.cache, [key], deps.cacheReadBudgetMs ?? CACHE_READ_BUDGET_MS, deps.warn)
      // Dropped while the cache was being read: a hit is not returned either, and nothing goes to the backend
      // (Codex on #87)
      if (call.scope && deps.cancelled.has(call.scope)) return aborted()
      // OCR goes through the same cache port but stores its own JSON, unrelated to sentence alignment: the translation column only
      const cached = parseCached(hit?.translation)
      if (cached) return { ok: true, result: cached, cached: true }
      try {
        const result = await deps.backend.ocr({ image: call.image, mime: call.mime }, call.scope)
        // Writing the cache is an optimisation and is not awaited: with IndexedDB hung the recognition result goes back all the same (Codex on #87)
        deps.cache.putMany([{ key, translation: JSON.stringify(result), paper: call.paper }]).catch((e: unknown) => { console.warn('[axt] OCR result cache write failed', e); deps.warn?.(`[axt] OCR result cache write failed: ${e instanceof Error ? e.message : String(e)}`) })
        return { ok: true, result, cached: false }
      } catch (e) {
        if (e instanceof OcrBackendError) return { ok: false, error: { kind: e.kind, message: e.message } }
        return { ok: false, error: { kind: 'unknown', message: e instanceof Error ? e.message : String(e) } }
      }
    },

    // Drain only: whether the scope is dead from now on is the session router's decision, recorded in the shared
    // registry (DESIGN §8.5) — a guessed end (`tabs.onUpdated` cannot tell a hash change from a navigation) must not
    // leave every image the page scrolls to afterwards aborted (Codex on #143)
    cancel: scope => deps.backend.cancel(scope),
  }
}
