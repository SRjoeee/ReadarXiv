// The reader's rows made here (its Host's `translate`, interfaces/host design-a §1.1) through the background: the one function of
// the extension's reader host that knows the messages (shared/transport.ts; their shapes, lanes/L4-reader.md 5a.5b).
// `axt:provider-status` binds a scope to the chain built from the settings as stored; `axt:translate` takes a call's units and
// answers one result a unit, the chain's (packages/translate: the translators, their fall-through and acceptance, the rows and
// the store are the background's); `axt:cancel-scope` withdraws the scope, on the reader's abort and when the page goes (an
// extension page is no tab the background watches).
import type { Row as Result, Unit } from '@readarxiv/format'
import type { UnitIn } from '@readarxiv/translate'
import type { TranslationTransport } from '@/providers/transport'
import { isPermanentErrorKind } from '@/providers/types'

/** the chain's error kinds a reader fixes in the settings: the rows unconfigured, with the kind as its code */
const KEYS = new Set(['no-key', 'auth'])
const failed = (id: string, kind: string): Result => (KEYS.has(kind) ? { id, ok: false, why: { kind: 'unconfigured', code: kind } } : isPermanentErrorKind(kind as never) ? { id, ok: false, why: { kind: 'refused' } } : { id, ok: false, why: { kind: 'unavailable' } })

/** a unit's text, by its length the call's size is planned */
const lengthOf = (pieces: readonly Unit['content'][number][]): number => pieces.reduce((n, p) => n + (p.t === 'text' ? p.s.length : p.t === 'span' ? lengthOf(p.content) : p.t === 'el' ? 3 : 0), 0)

export function hostTranslate(o: { transport: TranslationTransport; paper: string }) {
  return async function* translate(units: readonly Unit[], _target: string, x: { signal: AbortSignal; context?: { title?: string; abstract?: string } }): AsyncIterable<Result> {
    const { transport } = o
    const scope = `axt-pdf-${crypto.randomUUID()}`
    const withdraw = () => void transport.cancel(scope)
    addEventListener('pagehide', withdraw, { once: true })
    x.signal.addEventListener('abort', withdraw, { once: true })
    try {
      const status = await transport.status(scope, { fresh: true })
      if (!status.available && !status.fallback) {
        const kind = status.demotions?.find(d => d.id === status.providerId)?.kind ?? 'no-key'
        for (const u of units) yield failed(u.id, kind)
        return
      }
      // calls the size of the chain's batches, in the reader's order (the nearest first): each call's results are given as it
      // answers, the chain putting the latest call first
      const calls: Unit[][] = []
      let cur: Unit[] = [], n = 0
      for (const u of units) {
        const len = lengthOf(u.content)
        if (cur.length && (n + len > status.maxBatchChars || cur.length >= status.maxBatchItems)) { calls.push(cur); cur = []; n = 0 }
        cur.push(u)
        n += len
      }
      if (cur.length) calls.push(cur)
      const context = x.context && (x.context.title || x.context.abstract) ? { context: { ...(x.context.title ? { paperTitle: x.context.title } : {}), ...(x.context.abstract ? { abstract: x.context.abstract } : {}) } } : {}
      let stopped: string | null = null
      let next = 0
      for (const call of calls) {
        if (x.signal.aborted || stopped) break
        const res = await transport.translate({ units: call as unknown as UnitIn[], target: status.targetLanguage, ...context, scope })
        if (!res.ok) { stopped = res.error.kind; break }
        for (const r of res.results) {
          // the reader's Result: the chain's, without the page's words about who answered or why it failed
          if (r.ok) { const { engine: _e, kind: _k, ...row } = r; yield row as Result }
          else { const { error: _x, ...row } = r; yield row as Result }
        }
        next += call.length
      }
      for (const u of units.slice(next)) yield failed(u.id, stopped ?? 'aborted')
    } finally {
      removeEventListener('pagehide', withdraw)
      x.signal.removeEventListener('abort', withdraw)
      void transport.cancel(scope)
    }
  }
}
