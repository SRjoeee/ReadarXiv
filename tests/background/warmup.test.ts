// The background's side of the TeX page's warm-up (src/entrypoints/background/warmup.ts, DESIGN §16): when it asks the
// offscreen document for one — on install and update once the target language is known, on a change of it, and at a
// worker's start when the record says the store is not the current language's of the last day — and when it does not:
// under Save-Data, for a language nothing is typeset in yet, while the TeX page is in use, twice at once, or again
// within a quarter of an hour of a failure. The document, the lock and storage are fakes; the warm-up itself is
// tex-warm.test.ts's
import { describe, expect, it, vi } from 'vitest'
import { createWarmup, type WarmRecord, type WarmupDeps } from '@/entrypoints/background/warmup'
import type { TexWarmRequest } from '@/shared/tex-warm'

const SITE = 'https://tex.readarxiv.org'
const HOUR = 3600_000
const T0 = 1_000_000_000

/** `target`: the stored target language (ISO 639-3), changeable mid-test through `setTarget` */
function harness(over: Omit<Partial<WarmupDeps>, 'target'> & { record?: WarmRecord | null; target?: string } = {}) {
  let record: WarmRecord | null = over.record ?? null
  let target = over.target ?? 'cmn'
  let clock = T0
  let running = false
  const started: TexWarmRequest[] = []
  const lines: string[] = []
  const { record: _record, target: _target, ...rest } = over
  const deps: WarmupDeps = {
    site: SITE,
    target: async () => target,
    saveData: () => false,
    busy: async () => running,
    start: vi.fn(async (request: TexWarmRequest) => { started.push(request); running = true; return true }),
    load: async () => record,
    save: async r => { record = r },
    now: () => clock,
    log: line => { lines.push(line) },
    ...rest,
  }
  const warmup = createWarmup(deps)
  return {
    warmup, started, lines,
    record: () => record,
    now: () => clock,
    tick: (ms: number) => { clock += ms },
    setTarget: (code: string) => { target = code },
    /** the document's warm-up ends: the lock let go */
    finish: () => { running = false },
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

  it('never under Save-Data, never for a language nothing is typeset in yet, never while the TeX page is in use', async () => {
    const saving = harness({ saveData: () => true })
    await saving.warmup.trigger('install')
    expect(saving.started).toEqual([])
    const arabic = harness({ target: 'arb' })
    await arabic.warmup.trigger('language')
    expect(arabic.started).toEqual([])
    const reading = harness({ busy: async () => true })
    await reading.warmup.trigger('language')
    expect(reading.started).toEqual([])
    expect(reading.record()).toBeNull()
  })

  it('never twice at once: a trigger while one runs is let go', async () => {
    const t = harness()
    await Promise.all([t.warmup.trigger('install'), t.warmup.trigger('language')])
    expect(t.started).toHaveLength(1)
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
    // changed in the settings while the Chinese warm-up ran: that trigger finds the page in use
    t.setTarget('jpn')
    await t.warmup.trigger('language')
    expect(t.started).toHaveLength(1)
    t.tick(30_000)
    t.finish()
    await t.warmup.done({ ok: true, lang: 'zh', versions: 'c1/e1/t1/index-1.txt', files: 41, bytes: 37_000_000, ms: 30_000 })
    expect(t.record()).toMatchObject({ lang: 'zh', versions: 'c1/e1/t1/index-1.txt', at: T0 + 30_000, bytes: 37_000_000 })
    expect(t.started.map(r => r.lang)).toEqual(['zh', 'ja'])
  })

  it('a warm-up that failed or was deferred is not recorded as done, and not tried again at once', async () => {
    const t = harness()
    await t.warmup.trigger('install')
    t.finish()
    await t.warmup.done({ ok: false, lang: 'zh', error: 'could not fetch b0.bin', network: ['b0.bin'] })
    expect(t.record()).toEqual({ tried: T0 })
    expect(t.started).toHaveLength(1)
    expect(t.lines.some(l => l.includes('b0.bin'))).toBe(true)
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
