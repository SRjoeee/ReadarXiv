// The TeX page's warm-up, decided in the background (DESIGN §16): as early as possible — once the extension is installed
// or updated and the target language is known, again when that language changes, and at a worker's start when the
// last warm-up is not the current language's of the last day, or a reader has since seen the page under other
// versions (how a new page version is noticed: the page's files are versioned, and the warm-up downloads only what the
// store lacks) — the files a first visit in the target language fetches from the TeX page are downloaded into the
// extension's store by the offscreen document (entrypoints/ocr/tex-warm.ts), for the reader to hand to its page. Never
// under Save-Data, never for a language nothing is typeset in yet, never while a reader that typesets is open (it shares
// the lock: a warm-up would compete with its compiles for the link), and a reader opened during one has it stopped when
// it is for another language or would not be done within the reader's patience (entrypoints/ocr/tex-warm.ts); one
// at a time, the document's to keep — it ignores a second for the language it runs for, and stops one for a language no
// longer wanted, whose files a reader opened now would otherwise wait for. A failure is tried again at the next
// trigger, a worker's start no sooner than a quarter of an hour later, doubled with each failure in a row up to a day (a
// disk that cannot keep the files); a page that takes no warm-up (one from before it) is asked again a day on. Nothing
// a reader sees: the diagnostics log alone says what happened, a state that lasts once.
import { toBcp47 } from '@/config/languages'
import { verified } from '@/pdf-reader/session/verified.mjs'
import type { TexWarmRequest, TexWarmResult } from '@/shared/tex-warm'

export type WarmReason = 'install' | 'update' | 'language' | 'check'

/** the last warm-up: when one was last tried, and what the last that succeeded kept */
export interface WarmRecord {
  tried?: number
  lang?: string
  /** the TeX page's versions (cv/eid/tid/index) it was made under */
  versions?: string
  at?: number
  /** the bytes it downloaded (decoded) and how long it took */
  bytes?: number
  ms?: number
  /** failures in a row since the last that succeeded: the back-off's */
  failures?: number
  /** the page's versions under which it took no warm-up ('1': a page of protocol 1) */
  unsupported?: string
  /** the state last said in the log (a skip under Save-Data, a deferral for a reader), said again only once it changed */
  said?: string
}

export interface WarmupDeps {
  /** the TeX page's site (pdf-reader/addresses.mjs TEX_PAGE) */
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
  /** the document's running warm-up stopped for a reader that typesets into `lang`, if there is one and it is for
   *  another language or would outlast the reader's patience → whether one was stopped */
  stop(lang: string): Promise<boolean>
  load(): Promise<WarmRecord | null>
  save(record: WarmRecord): Promise<void>
  now(): number
  log(line: string): void
}

const DAY = 24 * 3600_000
const RETRY = 15 * 60_000
/** how long after a try that did not succeed a worker's start tries again: a quarter of an hour, doubled with each
 *  failure in a row, at most a day */
const backOff = (failures = 0) => Math.min(RETRY * 2 ** Math.max(0, failures - 1), DAY)
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function createWarmup(deps: WarmupDeps) {
  let chain: Promise<void> = Promise.resolve()
  const say = (line: string) => deps.log(`[axt] TeX warm-up: ${line}`)
  /** a state that lasts (a skip, a deferral): said once, and again only after another */
  const note = async (record: WarmRecord | null, state: string, line: string) => {
    if (record?.said === state) return
    await deps.save({ ...record, said: state })
    say(line)
  }

  async function attempt(reason: WarmReason): Promise<void> {
    const record = await deps.load()
    if (deps.saveData()) return note(record, 'save-data', `${reason}: skipped, the browser asks to save data`)
    const lang = toBcp47(await deps.target())
    // the reader typesets no other language yet (scripts.mjs VERIFIED): nothing it would ask for
    if (!verified(lang)) return
    const now = deps.now()
    // a page that takes no warm-up: asked again a day on, or once a reader has seen it under other versions (seen)
    if (record?.unsupported !== undefined && now - (record.tried ?? 0) < DAY) return
    if (reason === 'check') {
      // never tried: the install's or the update's own trigger comes first, with the language it chose
      if (record?.tried === undefined) return
      // a try since the last success that did not succeed — failed, stopped, or never reported (its document closed
      // under it) — is what counts, tried again after its back-off however recent that success (Codex on #311); else the
      // success, while it is the current language's of the last day
      const since = record.tried > (record.at ?? 0)
      if (since ? now - record.tried < backOff(record.failures) : record.lang === lang && now - (record.at ?? 0) < DAY) return
    }
    if (await deps.readerOpen()) return note(record, 'reader-open', `${reason}: deferred, a reader that typesets is open`)
    await deps.save({ ...record, tried: now, said: undefined })
    const started = await deps.start({ site: deps.site, lang })
    say(started ? `${reason}: started for ${lang}` : `${reason}: not started, one runs`)
  }

  /** the document's report: a success recorded (and a look again — the language may have changed meanwhile), a page
   *  that takes no warm-up remembered under its versions, a failure counted, and its back-off counted from now; a stop
   *  or a deferral is none */
  async function report(result: TexWarmResult): Promise<void> {
    const now = deps.now()
    if (result.ok) {
      await deps.save({ tried: now, lang: result.lang, versions: result.versions, at: now, bytes: result.bytes, ms: result.ms })
      say(`done for ${result.lang} under ${result.versions}: ${result.files} files, ${(result.bytes / 1e6).toFixed(1)} MB downloaded in ${(result.ms / 1000).toFixed(1)} s`)
      // not awaited: this runs in the chain, which the look joins after it
      void trigger('check')
      return
    }
    if (result.deferred || result.stopped) return say(`${result.deferred ? 'deferred' : 'stopped'} for ${result.lang}: ${result.error}`)
    const record = await deps.load()
    if (result.unsupported) {
      await deps.save({ ...record, unsupported: result.versions ?? '1' })
      if (record?.unsupported !== result.versions) say(`the TeX page (${result.versions}) takes no warm-up: asked again in a day`)
      return
    }
    const failures = (record?.failures ?? 0) + 1
    // tried now, whatever the record says: a success reported meanwhile by a warm-up this one replaced (the review's M1
    // race) wrote its own time as both the try's and the success's, under which this failure would back off nothing
    // (the re-review's m3)
    await deps.save({ ...record, tried: now, failures })
    say(`failed for ${result.lang} (${failures} in a row; again in ${Math.round(backOff(failures) / 60_000)} min at the earliest): ${result.error}${result.network?.length ? ` (${result.network.join(', ')})` : ''}`)
  }

  /** a reader saw the page under these versions: a warm-up made under others, or a verdict that the page takes none,
   *  holds no longer — the next worker's start warms again */
  async function seen(versions: string): Promise<void> {
    const record = await deps.load()
    if (!record) return
    const stale = record.at !== undefined && record.versions !== undefined && record.versions !== versions
    const changed = record.unsupported !== undefined && record.unsupported !== versions
    if (!stale && !changed) return
    const { at: _at, unsupported: _unsupported, ...rest } = record
    // the try those versions overturn — the success, or the verdict that the page takes none — holds back nothing: kept
    // as tried, it would read as a try that did not succeed and wait out a back-off (Codex on #311). Tried at 0 is long
    // ago, not never; a failure since the success keeps its own back-off
    await deps.save(changed || record.tried === record.at ? { ...rest, tried: 0 } : rest)
    say(`a reader saw the TeX page under ${versions}: warmed again at the next start`)
  }

  /** each in turn, after what came before — the record is read and written by one at a time; one that fails is said
   *  and the next goes on */
  const run = (what: string, step: () => Promise<void>): Promise<void> =>
    (chain = chain.then(step).catch((e: unknown) => say(`${what}: ${messageOf(e)}`)))
  const trigger = (reason: WarmReason): Promise<void> => run(reason, () => attempt(reason))

  return {
    trigger,
    /** the document's report of a warm-up → settles once it and what it set off are done */
    done: (result: TexWarmResult): Promise<void> => run('report', () => report(result)).then(() => chain),
    /** the versions a reader's TeX page said (its `ready`) */
    seen: (versions: string): Promise<void> => run('versions', () => seen(versions)),
    /** a reader that typesets into `lang` needs the page now (the lock a warm-up holds): the warm-up stops, keeping
     *  what came, unless it is for that language and will be done within the reader's patience — asked at once, not in
     *  turn, since a step in turn may be waiting on the document */
    giveWay: async (lang: string): Promise<void> => { await deps.stop(lang).catch(() => false) },
  }
}
