// The TeX page's warm-up, decided in the background (DESIGN §16): as early as possible — once the extension is installed
// or updated and the target language is known, again when that language changes, and at a worker's start when the
// last warm-up is not the current language's of the last day (how a new page version is noticed: the page's files are
// versioned, and the warm-up downloads only what the store lacks) — the files a first visit in the target language
// fetches from the TeX page are downloaded into the extension's store by the offscreen document
// (entrypoints/ocr/tex-warm.ts), for the reader to hand to its page. Never under Save-Data, never for a language
// nothing is typeset in yet, never while a reader that typesets is open (it shares the lock: a warm-up would compete
// with its compiles for the link); one at a time, the document's to keep — it ignores a second for the language it
// runs for, and stops one for a language no longer wanted, whose files a reader opened now would otherwise wait for.
// A failure is tried again at the next trigger, a worker's start no sooner than a quarter of an hour later. Nothing a
// reader sees: the diagnostics log alone says what happened.
import { toBcp47 } from '@/config/languages'
import { verified } from '@/pdf-reader/engine/verified.mjs'
import type { TexWarmRequest, TexWarmResult } from '@/shared/tex-warm'

export type WarmReason = 'install' | 'update' | 'language' | 'check'

/** the last warm-up: when one was last tried, and what the last that succeeded kept */
export interface WarmRecord {
  tried: number
  lang?: string
  /** the TeX page's versions (cv/eid/tid/index) it was made under */
  versions?: string
  at?: number
  /** the bytes it downloaded (decoded) and how long it took */
  bytes?: number
  ms?: number
}

export interface WarmupDeps {
  /** the TeX page's site (pdf-reader/engine/addresses.mjs TEX_PAGE) */
  site: string
  /** the target language in force, as the configuration stores it (ISO 639-3) */
  target(): Promise<string>
  /** the browser asks to save data (Save-Data) */
  saveData(): boolean
  /** a reader that typesets is open, or waits to: it shares the lock */
  readerOpen(): Promise<boolean>
  /** the offscreen document asked to warm → whether it started one (not while one for that language runs; one for
   *  another it stops first) */
  start(request: TexWarmRequest): Promise<boolean>
  load(): Promise<WarmRecord | null>
  save(record: WarmRecord): Promise<void>
  now(): number
  log(line: string): void
}

const DAY = 24 * 3600_000
const RETRY = 15 * 60_000

export function createWarmup(deps: WarmupDeps) {
  let chain: Promise<void> = Promise.resolve()
  const say = (line: string) => deps.log(`[axt] TeX warm-up: ${line}`)

  async function attempt(reason: WarmReason): Promise<void> {
    if (deps.saveData()) return say(`${reason}: skipped, the browser asks to save data`)
    const lang = toBcp47(await deps.target())
    // the reader typesets no other language yet (scripts.mjs VERIFIED): nothing it would ask for
    if (!verified(lang)) return
    const record = await deps.load()
    const now = deps.now()
    if (reason === 'check') {
      // never tried: the install's or the update's own trigger comes first, with the language it chose
      if (!record) return
      const current = record.lang === lang && record.at !== undefined && now - record.at < DAY
      const failedLately = record.tried > (record.at ?? 0) && now - record.tried < RETRY
      if (current || failedLately) return
    }
    if (await deps.readerOpen()) return say(`${reason}: deferred, a reader that typesets is open`)
    await deps.save({ ...record, tried: now })
    const started = await deps.start({ site: deps.site, lang })
    say(started ? `${reason}: started for ${lang}` : `${reason}: not started, one runs`)
  }

  /** one at a time, in the order they came; one that fails is said and the next goes on */
  const trigger = (reason: WarmReason): Promise<void> =>
    (chain = chain.then(() => attempt(reason)).catch((e: unknown) => say(`${reason}: ${e instanceof Error ? e.message : String(e)}`)))

  return {
    trigger,
    /** the document's report of a warm-up; after one that succeeded, a look again: the language may have changed meanwhile */
    async done(result: TexWarmResult): Promise<void> {
      if (!result.ok) return say(`${result.deferred ? 'deferred' : 'failed'} for ${result.lang}: ${result.error}${result.network?.length ? ` (${result.network.join(', ')})` : ''}`)
      const now = deps.now()
      await deps.save({ tried: now, lang: result.lang, versions: result.versions, at: now, bytes: result.bytes, ms: result.ms })
      say(`done for ${result.lang} under ${result.versions}: ${result.files} files, ${(result.bytes / 1e6).toFixed(1)} MB downloaded in ${(result.ms / 1000).toFixed(1)} s`)
      await trigger('check')
    },
  }
}
