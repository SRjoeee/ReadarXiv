// The background's side of the TeX page's warm-up (src/entrypoints/background/warmup.ts, DESIGN §16): when it asks the
// offscreen document for one — on install and update once the target language is known, on a change of it, and at a
// worker's start when the record says the store is not the current language's of the last day — and when it does not:
// under Save-Data, for a language nothing is typeset in yet, while a reader that typesets is open, or again within a
// quarter of an hour of a failure, later after each in a row; and one at a time — the document runs one, and gives way to
// another language, or to a reader that needs the page. A page that takes no warm-up is asked again a day on, and a
// reader that sees the page under new versions has the next worker's start warm again. The document, the lock and
// storage are fakes; the warm-up itself is tex-warm.test.ts's, and the two together end this file
import { describe, expect, it, vi } from 'vitest'
import { createWarmup, type WarmRecord, type WarmupDeps } from '@/entrypoints/background/warmup'
import { warmSlot } from '@/entrypoints/ocr/tex-warm'
import type { TexWarmRequest, TexWarmResult } from '@/shared/tex-warm'

const SITE = 'https://tex.readarxiv.org'
const MINUTE = 60_000
const HOUR = 3600_000
const DAY = 24 * HOUR
const T0 = 1_000_000_000

/** `target`: the stored target language (ISO 639-3), changeable mid-test through `setTarget` */
function harness(over: Omit<Partial<WarmupDeps>, 'target'> & { record?: WarmRecord | null; target?: string } = {}) {
  let record: WarmRecord | null = over.record ?? null
  let target = over.target ?? 'cmn'
  let clock = T0
  /** the language the document's warm-up runs for */
  let running: string | null = null
  const started: TexWarmRequest[] = []
  const lines: string[] = []
  const { record: _record, target: _target, ...rest } = over
  const deps: WarmupDeps = {
    site: SITE,
    target: async () => target,
    saveData: () => false,
    readerOpen: async () => false,
    // the document: one warm-up at a time, a new language's in place of the running one (tex-warm.ts, ocr/main.ts)
    start: vi.fn(async (request: TexWarmRequest) => {
      if (running === request.lang) return false
      started.push(request)
      running = request.lang
      return true
    }),
    stop: vi.fn(async () => running !== null),
    load: async () => record,
    save: async r => { record = r },
    now: () => clock,
    log: line => { lines.push(line) },
    ...rest,
  }
  const warmup = createWarmup(deps)
  return {
    warmup, started, lines, deps,
    record: () => record,
    now: () => clock,
    tick: (ms: number) => { clock += ms },
    setTarget: (code: string) => { target = code },
    /** the document's warm-up ends */
    finish: () => { running = null },
  }
}

describe('createWarmup', () => {
  it('on install: the target language\'s parts, from the build\'s TeX page', async () => {
    const t = harness()
    await t.warmup.trigger('install')
    expect(t.started).toEqual([{ site: SITE, lang: 'zh' }])
    expect(t.record()).toEqual({ tried: T0 })
  })

  it('on update, for the language stored', async () => {
    const t = harness({ target: 'deu' })
    await t.warmup.trigger('update')
    expect(t.started).toEqual([{ site: SITE, lang: 'de' }])
  })

  it('never under Save-Data, never for a language nothing is typeset in yet, never while a reader that typesets is open', async () => {
    const saving = harness({ saveData: () => true })
    await saving.warmup.trigger('install')
    expect(saving.started).toEqual([])
    const arabic = harness({ target: 'arb' })
    await arabic.warmup.trigger('language')
    expect(arabic.started).toEqual([])
    const reading = harness({ readerOpen: async () => true })
    await reading.warmup.trigger('language')
    expect(reading.started).toEqual([])
    expect(reading.record()?.tried).toBeUndefined()
  })

  it('never twice at once: a trigger for the language a warm-up runs for starts nothing more', async () => {
    const t = harness()
    await Promise.all([t.warmup.trigger('install'), t.warmup.trigger('language')])
    expect(t.started).toHaveLength(1)
  })

  it('a language changed while a warm-up runs: the new one asked for at once, the document giving it the place', async () => {
    const t = harness()
    await t.warmup.trigger('install')
    t.setTarget('deu')
    await t.warmup.trigger('language')
    expect(t.started.map(r => r.lang)).toEqual(['zh', 'de'])
  })

  it('a worker\'s start before anything was tried waits for the install\'s own trigger', async () => {
    const t = harness()
    await t.warmup.trigger('check')
    expect(t.started).toEqual([])
  })

  it('a worker\'s start: nothing while the store holds this language\'s parts of the last day; again after a day, or for another language', async () => {
    const done: WarmRecord = { tried: T0, lang: 'zh', versions: 'c/e/t/i', at: T0, bytes: 5 }
    const t = harness({ record: done })
    await t.warmup.trigger('check')
    expect(t.started).toEqual([])
    t.tick(25 * HOUR)
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(1)
    const other = harness({ target: 'jpn', record: done })
    await other.warmup.trigger('check')
    expect(other.started.map(r => r.lang)).toEqual(['ja'])
  })

  it('a failure is tried again at the next trigger: a worker\'s start a quarter of an hour on, or a change at once', async () => {
    const t = harness({ record: { tried: T0 } })
    await t.warmup.trigger('check')
    expect(t.started).toEqual([])
    t.tick(16 * 60_000)
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(1)
    const changed = harness({ record: { tried: T0 } })
    await changed.warmup.trigger('language')
    expect(changed.started).toHaveLength(1)
  })

  it('done: the language, the page\'s versions and the bytes kept; a language changed meanwhile is warmed next', async () => {
    const t = harness()
    await t.warmup.trigger('install')
    // changed while the Chinese warm-up ran, and its trigger missed (a worker that stopped meanwhile)
    t.setTarget('jpn')
    expect(t.started).toHaveLength(1)
    t.tick(30_000)
    t.finish()
    await t.warmup.done({ ok: true, lang: 'zh', versions: 'c1/e1/t1/index-1.txt', files: 41, bytes: 37_000_000, ms: 30_000 })
    expect(t.record()).toMatchObject({ lang: 'zh', versions: 'c1/e1/t1/index-1.txt', at: T0 + 30_000, bytes: 37_000_000, ms: 30_000 })
    expect(t.started.map(r => r.lang)).toEqual(['zh', 'ja'])
  })

  it('a warm-up that failed or was deferred is not recorded as done, and not tried again at once', async () => {
    const t = harness()
    await t.warmup.trigger('install')
    t.finish()
    await t.warmup.done({ ok: false, lang: 'zh', error: 'could not fetch b0.bin', network: ['b0.bin'] })
    expect(t.record()).toEqual({ tried: T0, failures: 1 })
    expect(t.started).toHaveLength(1)
    expect(t.lines.some(l => l.includes('b0.bin'))).toBe(true)
  })

  it('failures in a row are tried again later each time — a quarter of an hour, half an hour, an hour… at most a day —, and a success starts the count again (the review\'s M2: a disk that cannot keep the files)', async () => {
    const t = harness()
    const failed = async () => { t.finish(); await t.warmup.done({ ok: false, lang: 'zh', error: 'the extension\'s store could not keep b0.bin' }) }
    await t.warmup.trigger('install')
    await failed()
    t.tick(16 * MINUTE)
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(2)
    await failed()
    expect(t.record()).toMatchObject({ failures: 2 })
    t.tick(16 * MINUTE)
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(2)
    t.tick(15 * MINUTE)
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(3)
    for (let i = 0; i < 8; i++) await failed()
    t.tick(23 * HOUR)
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(3)
    t.tick(2 * HOUR)
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(4)
    t.finish()
    await t.warmup.done({ ok: true, lang: 'zh', versions: 'v', files: 1, bytes: 1, ms: 1 })
    expect(t.record()?.failures).toBeUndefined()
  })

  it('a page that takes no warm-up: remembered under its versions, said once, and asked again at a day\'s check only (the review\'s M3)', async () => {
    const t = harness()
    await t.warmup.trigger('install')
    t.finish()
    const none: TexWarmResult = { ok: false, lang: 'zh', error: 'the TeX page takes no warm-up', unsupported: true, versions: 'c0/e0/t0/i0' }
    await t.warmup.done(none)
    expect(t.record()).toMatchObject({ unsupported: 'c0/e0/t0/i0' })
    expect(t.record()?.failures).toBeUndefined()
    t.tick(HOUR)
    await t.warmup.trigger('check')
    t.setTarget('deu')
    await t.warmup.trigger('language')
    expect(t.started).toHaveLength(1)
    t.tick(DAY)
    await t.warmup.trigger('check')
    expect(t.started.map(r => r.lang)).toEqual(['zh', 'de'])
    t.finish()
    await t.warmup.done({ ...none, lang: 'de' })
    expect(t.lines.filter(l => l.includes('takes no warm-up'))).toHaveLength(1)
  })

  it('a reader that sees the page under versions other than the warm-up\'s: the next worker\'s start warms again (the review\'s M5)', async () => {
    const t = harness({ record: { tried: T0, lang: 'zh', versions: 'c1/e1/t1/i1', at: T0 } })
    t.tick(HOUR)
    await t.warmup.seen('c1/e1/t1/i1')
    await t.warmup.trigger('check')
    expect(t.started).toEqual([])
    await t.warmup.seen('c2/e1/t1/i1')
    expect(t.record()?.at).toBeUndefined()
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(1)
    // a page remembered as taking no warm-up, seen under other versions: asked again at the next start too
    const none = harness({ record: { tried: T0, unsupported: 'c0/e0/t0/i0' } })
    none.tick(HOUR)
    await none.warmup.seen('c0/e0/t0/i0')
    await none.warmup.trigger('check')
    expect(none.started).toEqual([])
    await none.warmup.seen('c1/e1/t1/i1')
    await none.warmup.trigger('check')
    expect(none.started).toHaveLength(1)
  })

  it('a reader that needs the page while a warm-up runs has the document stop it; that is no failure (the review\'s M4)', async () => {
    const t = harness()
    await t.warmup.trigger('install')
    await t.warmup.giveWay()
    expect(t.deps.stop).toHaveBeenCalledTimes(1)
    t.finish()
    await t.warmup.done({ ok: false, lang: 'zh', error: 'a reader needs the page', stopped: true })
    expect(t.record()).toEqual({ tried: T0 })
    // tried again at a worker's start, the reader gone, a quarter of an hour on
    t.tick(16 * MINUTE)
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(2)
  })

  it('a skip or a deferral is said once, not at every worker\'s start, and again once it has changed (the review\'s M6)', async () => {
    let saving = true, reading = false
    const t = harness({ saveData: () => saving, readerOpen: async () => reading, record: { tried: T0 - 2 * DAY, lang: 'zh', versions: 'v', at: T0 - 2 * DAY } })
    for (let i = 0; i < 3; i++) await t.warmup.trigger('check')
    saving = false
    reading = true
    for (let i = 0; i < 3; i++) await t.warmup.trigger('check')
    saving = true
    await t.warmup.trigger('check')
    expect(t.lines).toEqual([
      '[axt] TeX warm-up: check: skipped, the browser asks to save data',
      '[axt] TeX warm-up: check: deferred, a reader that typesets is open',
      '[axt] TeX warm-up: check: skipped, the browser asks to save data',
    ])
    saving = false
    reading = false
    await t.warmup.trigger('check')
    expect(t.started).toHaveLength(1)
    t.finish()
    saving = true
    await t.warmup.trigger('language')
    expect(t.lines.filter(l => l.includes('save data'))).toHaveLength(3)
  })

  it('a trigger that fails is said in the log and does not stop the next', async () => {
    let fail = true
    const t = harness({ target: undefined, load: async () => { if (fail) throw new Error('storage gone'); return null } })
    await t.warmup.trigger('install')
    expect(t.lines.some(l => l.includes('storage gone'))).toBe(true)
    fail = false
    await t.warmup.trigger('install')
    expect(t.started).toHaveLength(1)
  })
})

describe('the background and the document together', () => {
  const flush = async () => { for (let i = 0; i < 50; i++) await new Promise(r => setTimeout(r, 0)) }

  // the review's repro (M1): message hops that, like runtime.sendMessage, settle only once the other side's handler has;
  // the document's slot wired as ocr/main.ts wires it. A warm-up that succeeds while a request for another language is
  // on its way to the document used to hold both sides until Chrome stopped the worker
  it('a warm-up done as another language is asked for: both sides answer, and the new language\'s warm-up starts', async () => {
    const toDocument: Array<() => void> = [], toBackground: Array<() => void> = []
    let target = 'cmn', record: WarmRecord | null = null
    const finishers = new Map<string, (r: TexWarmResult) => void>()
    // the background → the document: axt:tex-warm, answered once the slot's start settles
    const start = (request: TexWarmRequest) => new Promise<boolean>(resolve => { toDocument.push(() => { void slot.start(request).then(resolve) }) })
    // the document → the background: axt:tex-warmed, answered once the handler (warmup.done) settles
    const report = (result: TexWarmResult) => new Promise<void>(resolve => { toBackground.push(() => { void warmup.done(result).then(() => resolve()) }) })
    const slot = warmSlot((request, signal) => new Promise<TexWarmResult>(resolve => {
      finishers.set(request.lang, resolve)
      signal.addEventListener('abort', () => resolve({ ok: false, lang: request.lang, error: 'stopped', stopped: true }))
    }), { report, idle: () => {} })
    const warmup = createWarmup({ site: SITE, target: async () => target, saveData: () => false, readerOpen: async () => false, start, stop: async () => slot.stop(), load: async () => record, save: async r => { record = r }, now: () => T0, log: () => {} })

    void warmup.trigger('install')
    await flush()
    toDocument.shift()?.()
    await flush()
    expect(slot.running).toBe(true)
    // the reader picks German; the background asks the document for it
    target = 'deu'
    let languageSettled = false
    void warmup.trigger('language').then(() => { languageSettled = true })
    await flush()
    expect(toDocument.length).toBe(1)
    // the Chinese warm-up ends well just then: its report is on its way to the background
    finishers.get('zh')?.({ ok: true, lang: 'zh', versions: 'v', files: 1, bytes: 1, ms: 1 })
    await flush()
    expect(toBackground.length).toBe(1)
    // the document takes the German request, the background the Chinese report
    toDocument.shift()?.()
    await flush()
    toBackground.shift()?.()
    await flush()
    expect({ languageSettled, germanStarted: finishers.has('de') }).toEqual({ languageSettled: true, germanStarted: true })
    expect(record).toMatchObject({ lang: 'zh', versions: 'v' })
  })
})
