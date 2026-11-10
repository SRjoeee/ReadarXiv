// The reader's state told to the chrome (chrome/events.ts) and folded by the chrome's model (`reduce`): the transitions both
// hosts' pages go through, the website's (our server's rows, an address's target) and the extension's (rows made here, a key),
// each as the chrome shows it.
import { describe, expect, it } from 'vitest'
import { DEFAULTS, eventsOf, INITIAL, kindOf, LAYER_WHY, type ReaderState, reduce } from '../../src/index.ts'

const base: ReaderState = {
  paper: { id: '2601.00002', version: 1, title: '', html: null, pdf: 'https://arxiv.org/pdf/2601.00002v1' },
  prefs: { ...DEFAULTS, target: 'zh' },
  settings: { s: 'landed', refused: 0 },
  original: { s: 'opening', loaded: 0, total: 0 },
  layer: { s: 'none' },
  rows: { target: 'de', from: 'server', s: 'none' },
  view: {
    display: 'bilingual',
    sync: { on: true, available: true },
    scale: 1,
    zoom: 'page-width',
    narrow: false,
    sides: { left: { page: 1, pages: 0 }, right: { page: 1, pages: 0 } },
    outline: [],
    heading: null,
  },
  reconnecting: false,
  faces: null,
  crashed: false,
}
/** the chrome's state after the reader went through `states`, each told as its events */
const fold = (states: ReaderState[]) => {
  let chrome = INITIAL
  let prev: ReaderState | null = null
  for (const s of states) {
    for (const e of eventsOf(prev, s)) chrome = reduce(chrome, e)
    prev = s
  }
  return chrome
}
const open = {
  ...base,
  original: { s: 'open' as const, pages: 2, ours: true },
  view: { ...base.view, sides: { left: { page: 1, pages: 2 }, right: { page: 1, pages: 2 } } },
}

describe("the reader's state as the chrome's", () => {
  it("a paper being prepared, then laid, its rows arriving, then complete: the chrome's phases in turn", () => {
    const preparing = { ...open, layer: { s: 'preparing' as const, position: 3, progress: null } }
    const ready = {
      ...open,
      layer: { s: 'ready' as const, laid: 0, total: 2, asOriginal: 0 },
      rows: { target: 'de', from: 'server' as const, s: 'arriving' as const, got: 4, total: 15, lost: 0 },
    }
    const complete = {
      ...ready,
      layer: { s: 'ready' as const, laid: 2, total: 2, asOriginal: 0 },
      rows: {
        target: 'de',
        from: 'server' as const,
        s: 'complete' as const,
        got: 15,
        total: 15,
        lost: 0,
        stopped: null,
      },
    }
    expect(fold([base]).phase).toBe('loading')
    expect(fold([base, open, preparing])).toMatchObject({
      phase: 'preparing',
      preparing: { position: 3, progress: null },
    })
    expect(fold([base, open, preparing, ready])).toMatchObject({ phase: 'translating', progress: 4 / 15 })
    const done = fold([base, open, preparing, ready, complete])
    expect(done.phase).toBe('ready')
    expect(done.layer).toMatchObject({ laid: 2, total: 2 })
  })
  it("the chrome's preferences carry the target shown (the visit's), never the stored one over it", () => {
    expect(fold([base]).prefs?.target).toBe('de')
    expect(fold([base, { ...base, rows: { target: 'fr', from: 'server', s: 'none' } }]).prefs?.target).toBe('fr')
    // (with no visit of its own the stored preferences are told as they are)
    const own = { ...base, rows: { target: 'zh', from: 'server' as const, s: 'none' as const } }
    expect(fold([own]).prefs).toBe(own.prefs)
  })
  it("the paper's id with its version, the title once known; nothing told twice", () => {
    const titled = { ...base, paper: { ...base.paper, title: 'A paper' } }
    expect(fold([base, titled]).paper).toEqual({ id: '2601.00002v1', title: 'A paper' })
    expect(eventsOf(titled, titled)).toEqual([])
  })
  it('a layer refused for good greys the translated displays; one refused for a while says so and keeps them', () => {
    for (const [why, unavailable] of Object.entries(LAYER_WHY)) {
      const s = { ...open, layer: { s: 'refused' as const, why: why as never, retryAt: null } }
      expect(fold([base, open, s]).unavailable?.why, why).toBe(unavailable)
    }
    expect(LAYER_WHY.outdated).toBe('unknown-versions')
    expect(fold([open, { ...open, layer: { s: 'refused', why: 'no-source', retryAt: null } }]).available).toBe(false)
    expect(fold([open, { ...open, layer: { s: 'refused', why: 'busy', retryAt: 5 } }])).toMatchObject({
      available: true,
      unavailable: { why: 'busy', retryAt: 5 },
    })
  })
  it("rows failing: a key missing is the settings' card; out of reach the network; a refusal a bad request; a target the reader does not set its own notice", () => {
    expect(kindOf({ kind: 'server' })).toBe('network')
    expect(kindOf({ kind: 'unavailable' })).toBe('network')
    expect(kindOf({ kind: 'refused' })).toBe('bad-request')
    expect(kindOf({ kind: 'unconfigured', code: 'auth' })).toBe('auth')
    const ready = { ...open, layer: { s: 'ready' as const, laid: 0, total: 2, asOriginal: 0 } }
    const noKey = {
      ...ready,
      rows: {
        target: 'de',
        from: 'here' as const,
        s: 'failed' as const,
        why: { kind: 'unconfigured' as const, code: 'no-key' },
        got: 0,
        total: 10,
        lost: 0,
      },
    }
    expect(fold([base, ready, noKey])).toMatchObject({ phase: 'failed', failure: 'no-key', failureAt: null })
    // (a wait the translator named: when a retry is due, for a host that offers it at its time; a new run clears it)
    const waiting = { ...noKey, rows: { ...noKey.rows, why: { kind: 'unavailable' as const }, retryAt: 9_000 } }
    expect(fold([base, ready, waiting])).toMatchObject({ phase: 'failed', failure: 'network', failureAt: 9_000 })
    const again = {
      ...ready,
      rows: { target: 'de', from: 'here' as const, s: 'arriving' as const, got: 1, total: 10, lost: 0 },
    }
    expect(fold([base, ready, waiting, again]).failureAt).toBeNull()
    const target = {
      ...ready,
      rows: {
        target: 'ar',
        from: 'here' as const,
        s: 'failed' as const,
        why: { kind: 'target' as const },
        got: 0,
        total: 0,
        lost: 0,
      },
    }
    expect(fold([base, ready, target])).toMatchObject({ languageSupported: false, unavailable: { why: 'target' } })
  })
  it("whether the sides can scroll together, as the reader knows it (L11's second round, gap 9); a session that does not say leaves them able", () => {
    const apart = { ...open, view: { ...open.view, sync: { on: true, available: false } } }
    expect(fold([base, apart])).toMatchObject({ sync: true, syncAvailable: false })
    expect(fold([base, apart, open])).toMatchObject({ sync: true, syncAvailable: true })
    expect(eventsOf(open, apart)).toEqual([{ type: 'sync', on: true, available: false }])
    // (the extension's today session tells the sync with no word of it)
    expect(reduce({ ...INITIAL, syncAvailable: false }, { type: 'sync', on: false }).syncAvailable).toBe(true)
  })
})
