// The session as a reducer (stage 2's exit: every transition of design-b's table; a stale result of every kind dropped by its
// ticket; every resource released on close; a second reader on the same page), through `step` and `resources` alone, then
// through the runtime with recording handlers.
import type { Head } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import {
  type Doc,
  init,
  type Input,
  type Prefs,
  type Ref,
  resources,
  type State,
  step,
  type Ticket,
} from '../src/session/machine.ts'
import { DEFAULTS } from '../src/prefs.ts'
import { createRuntime, type Handlers } from '../src/session/runtime.ts'

const PREFS: Prefs = { ...DEFAULTS, display: 'bilingual', target: 'zh-Hans', sync: true }
const ref = (c: string): Ref => ({ path: `p/2600_00001v1/x/${c.repeat(64)}`, sha256: c.repeat(64), bytes: 10 })
const CATALOG = ref('a'),
  UNITS = [ref('b')]
const HEAD = { format: 1, paper: { id: '2600.00001', version: 1, pages: 4 } } as unknown as Head
const doc = (rev: number, o: Partial<Doc> = {}): Doc => ({
  epoch: 'e1',
  rev,
  prepare: { state: 'none', why: null, retryAt: null, stage: null, units: [] },
  layer: null,
  targets: {},
  ...o,
})
const preparing = (rev: number, units: Ref[] = []) =>
  doc(rev, { prepare: { state: 'running', why: null, retryAt: null, stage: 'compiling', units } })
const ready = (rev: number) =>
  doc(rev, {
    prepare: { state: 'done', why: null, retryAt: null, stage: null, units: UNITS },
    layer: { catalog: CATALOG, units: UNITS, format: 1 },
  })

/** step over inputs; the tickets of a slot live now */
function machine(o: { visible?: boolean; here?: boolean; display?: Prefs['display'] } = {}) {
  let s = init({
    paper: { id: '2600.00001', version: 1 },
    here: !!o.here,
    defaults: { ...PREFS, display: o.display ?? 'bilingual' },
    now: 0,
    visible: o.visible ?? true,
    online: true,
  })
  const effects: unknown[] = []
  let released: Ticket[] = []
  let dropped = 0
  const m = {
    get s() {
      return s
    },
    get effects() {
      return effects
    },
    get released() {
      return released
    },
    get dropped() {
      return dropped
    },
    live: (slot: string): Ticket => {
      const t = [...resources(s)].find(([, spec]) => spec.slot === slot)?.[0]
      if (!t) throw new Error(`no ${slot} live in ${JSON.stringify([...resources(s).keys()])}`)
      return t
    },
    has: (slot: string) => [...resources(s).values()].some((spec) => spec.slot === slot),
    feed(...xs: Input[]) {
      for (const x of xs) {
        const t = 't' in x ? (x as { t: Ticket }).t : null
        const before = new Set(resources(s).keys())
        if (t !== null && !before.has(t)) {
          dropped++
          continue
        }
        const out = step(s, x)
        s = out.state
        effects.push(...out.effects)
        const after = resources(s)
        released = [...released, ...[...before].filter((k) => !after.has(k))]
      }
      return m
    },
  }
  return m
}

describe('the session: the original', () => {
  it('asks the original first, before anything of the layer', () => {
    const m = machine()
    const r = [...resources(m.s)]
    expect(r[0]?.[1]).toEqual({ slot: 'original', pin: false })
    expect(m.s.original.s).toBe('opening')
  })
  it('opening → open; opening → failed by the network, its retry timed, then opening again with a new ticket', () => {
    const m = machine()
    const t1 = m.live('original')
    m.feed({ i: 'original.progress', t: t1, loaded: 65536 })
    expect(m.s.original).toMatchObject({ s: 'opening', loaded: 65536 })
    m.feed({ i: 'original.failed', t: t1, why: 'network' })
    expect(m.s.original).toMatchObject({ s: 'failed', why: 'network', retryAt: 1000 })
    expect(m.released).toContain(t1)
    // (the gate opens on the original's failure)
    expect(m.s.gate.open).toBe(true)
    const timer = (m.s.original as { timer: Ticket }).timer
    m.feed({ i: 'time', t: timer, now: 1000 })
    expect(m.s.original.s).toBe('opening')
    const t2 = m.live('original')
    expect(t2).not.toBe(t1)
    m.feed({ i: 'original.opened', t: t2, pages: 4, bytes: 1000 })
    expect(m.s.original).toMatchObject({ s: 'open', pages: 4 })
  })
  it("a failure that is no network's waits for a retry, which never comes before its time", () => {
    const m = machine()
    m.feed({ i: 'original.failed', t: m.live('original'), why: 'not-found' })
    expect(m.s.original).toMatchObject({ s: 'failed', retryAt: null })
    expect(m.has('original')).toBe(false)
    m.feed({ i: 'cmd.retry' })
    expect(m.s.original.s).toBe('opening')
  })
  it("a tab's bytes not the layer's: our copy for both panes (pin), the composed document let go; again: the layer refused", () => {
    const m = machine()
    const t1 = m.live('original')
    m.feed(
      { i: 'original.opened', t: t1, pages: 4, bytes: 9 },
      { i: 'panes.drawn' },
      { i: 'paper', t: m.live('link'), doc: ready(1) },
    )
    m.feed({ i: 'code.loaded', t: m.live('code') }, { i: 'head', digest: CATALOG.sha256, head: HEAD })
    const composed = m.live('composed')
    m.feed({ i: 'original.mismatch', t: t1 })
    expect(m.s.original).toMatchObject({ s: 'opening', pin: true })
    expect(m.released).toEqual(expect.arrayContaining([t1, composed]))
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'original', pin: true })
    m.feed({ i: 'original.mismatch', t: m.live('original') })
    expect(m.s.layer).toMatchObject({ s: 'refused', why: 'mismatch' })
  })
})

describe('the session: engaged, the link, the layer', () => {
  it('takes nothing of the layer before a translated display is shown in a visible document, and stays engaged', () => {
    const hidden = machine({ visible: false })
    expect(hidden.has('link')).toBe(false)
    const original = machine({ display: 'original' })
    expect(original.has('link')).toBe(false)
    original.feed({ i: 'cmd.set', prefs: { display: 'bilingual' } })
    expect(original.s.engaged).toBe(true)
    original.feed({ i: 'cmd.set', prefs: { display: 'original' } })
    expect(original.s.engaged).toBe(true)
    expect(original.has('link')).toBe(true)
  })
  it("follows the server: preparing, the rows from the prepare's units on, then ready; the code after the gate; the composed document after the code, the head and the original", () => {
    const m = machine()
    const link = m.live('link')
    m.feed({ i: 'paper', t: link, doc: preparing(1) })
    expect(m.s.layer).toMatchObject({ s: 'preparing', stage: 'compiling' })
    expect(m.has('rows')).toBe(false)
    m.feed({ i: 'paper', t: link, doc: preparing(2, UNITS) })
    expect(m.has('rows')).toBe(true)
    // (an older document dropped: the newest held)
    m.feed({ i: 'paper', t: link, doc: preparing(1) })
    expect(m.s.doc?.rev).toBe(2)
    m.feed({ i: 'paper', t: link, doc: ready(3) })
    expect(m.s.layer.s).toBe('ready')
    expect(m.has('code')).toBe(false)
    m.feed({ i: 'time', t: m.s.gate.timer as Ticket, now: 1500 })
    expect(m.has('code')).toBe(true)
    m.feed({ i: 'code.loaded', t: m.live('code') }, { i: 'head', digest: CATALOG.sha256, head: HEAD })
    expect(m.has('composed')).toBe(false)
    m.feed({ i: 'original.opened', t: m.live('original'), pages: 4, bytes: 9 })
    m.feed({ i: 'composed.opened', t: m.live('composed') })
    expect(m.s.layer).toMatchObject({ s: 'ready', open: true })
  })
  it('a paper the server has not opened is opened (the POST), then followed again', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    const open = m.live('open')
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'open', target: 'zh-Hans' })
    m.feed({ i: 'open.answered', t: open, doc: preparing(1, UNITS) })
    expect(m.s.layer.s).toBe('preparing')
    expect(m.has('open')).toBe(false)
    expect(m.has('link')).toBe(true)
  })
  it('a lost link backs off (1 s, doubling to 30 s) and follows again; a refusal for capacity is retried at its time only', () => {
    const m = machine()
    for (const ms of [1000, 2000, 4000]) {
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'network' })
      expect(m.s.link).toMatchObject({ s: 'lost' })
      expect([...resources(m.s).values()]).toContainEqual({ slot: 'timer', at: ms })
      m.feed({
        i: 'time',
        t:
          m.live('timer') === m.s.gate.timer
            ? (m.s.link as { timer: Ticket }).timer
            : (m.s.link as { timer: Ticket }).timer,
        now: 0,
      })
      expect(m.s.link.s).toBe('on')
    }
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: null, refused: { why: 'busy', retryAt: 30_000 } })
    expect(m.s.layer).toMatchObject({ s: 'refused', why: 'busy', retryAt: 30_000 })
    m.feed({ i: 'cmd.retry' })
    expect(m.s.layer.s).toBe('refused')
    m.feed({ i: 'time', t: (m.s.layer as { timer: Ticket }).timer, now: 30_000 })
    expect(m.s.layer.s).toBe('none')
  })
  it('a lasting refusal keeps the original, lets the link go and asks nothing more', () => {
    const m = machine()
    m.feed({
      i: 'paper',
      t: m.live('link'),
      doc: doc(1, { prepare: { state: 'failed', why: 'too-large', retryAt: null, stage: null, units: [] } }),
    })
    expect(m.s.layer).toMatchObject({ s: 'refused', why: 'too-large' })
    expect(m.has('link')).toBe(false)
    expect(m.has('original')).toBe(true)
    m.feed({ i: 'cmd.retry' })
    expect(m.s.layer.s).toBe('refused')
  })
  it('a layer of a format this reader does not read: outdated, told', () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: doc(1, { layer: { catalog: CATALOG, units: UNITS, format: 9 } }) })
    expect(m.s.layer).toMatchObject({ s: 'refused', why: 'outdated' })
    expect(m.effects).toContainEqual({ e: 'outdated' })
  })
})

describe('the session: the rows', () => {
  const engagedReady = (o: { here?: boolean } = {}) => {
    const m = machine(o)
    m.feed({ i: 'paper', t: m.live('link'), doc: ready(1) })
    return m
  }
  it('arriving → complete', () => {
    const m = engagedReady()
    const r = m.live('rows')
    m.feed({ i: 'rows.batch', t: r, got: 10, total: 80, lost: 0 }, { i: 'rows.end', t: r, got: 80, total: 80, lost: 1 })
    expect(m.s.rows).toEqual({ s: 'complete', target: 'zh-Hans', got: 80, total: 80, lost: 1 })
    expect(m.has('rows')).toBe(false)
  })
  it('failed, then arriving again at its retryAfter, by a retry not before it, and on a translator changed', () => {
    const m = engagedReady({ here: true })
    m.feed({ i: 'rows.failed', t: m.live('rows'), why: { kind: 'unavailable', retryAfterMs: 5000 } })
    expect(m.s.rows).toMatchObject({ s: 'failed', retryAt: 5000 })
    m.feed({ i: 'cmd.retry' })
    expect(m.s.rows.s).toBe('failed')
    m.feed({ i: 'time', t: (m.s.rows as { timer: Ticket }).timer, now: 5000 })
    expect(m.s.rows.s).toBe('arriving')
    m.feed({ i: 'rows.failed', t: m.live('rows'), why: { kind: 'unconfigured', code: 'no-key' } })
    m.feed({ i: 'cmd.translator' })
    expect(m.s.rows.s).toBe('arriving')
  })
  it('a language switch lets the old rows and the link go, keeps the original, the code and the composed document', () => {
    const m = engagedReady()
    m.feed({ i: 'original.opened', t: m.live('original'), pages: 4, bytes: 9 }, { i: 'panes.drawn' })
    m.feed({ i: 'code.loaded', t: m.live('code') }, { i: 'head', digest: CATALOG.sha256, head: HEAD })
    const keep = ['original', 'code', 'composed'].map(m.live)
    const rows = m.live('rows'),
      link = m.live('link')
    const n = m.released.length
    m.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(m.released.slice(n).sort()).toEqual([link, rows].sort())
    for (const t of keep) expect(resources(m.s).has(t)).toBe(true)
    expect(m.s.rows).toMatchObject({ s: 'arriving', target: 'ja' })
    expect(m.effects).toContainEqual({ e: 'prefs.write', patch: { target: 'ja' } })
  })
  it('rows made here: the link names no target, a switch keeps the link', () => {
    const m = engagedReady({ here: true })
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'link', target: null })
    expect([...resources(m.s).values()]).toContainEqual(expect.objectContaining({ slot: 'rows', from: 'here' }))
    const link = m.live('link')
    m.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(m.live('link')).toBe(link)
  })
})

describe('the session: preferences', () => {
  it("a read that does not answer in 1.5 s is unreadable; a late landing never undoes a field set meanwhile; the address's word is never written", () => {
    let s = init({
      paper: { id: 'x', version: 1 },
      here: false,
      defaults: PREFS,
      now: 0,
      visible: true,
      online: true,
      visit: { display: 'translation' },
    })
    const effects: unknown[] = []
    const go = (x: Input) => {
      const o = step(s, x)
      s = o.state
      effects.push(...o.effects)
    }
    go({ i: 'time', t: s.prefs.timer as Ticket, now: 1500 })
    expect(s.prefs.s).toBe('unreadable')
    go({ i: 'cmd.set', prefs: { sync: false } })
    go({ i: 'prefs.landed', value: { ...PREFS, display: 'original', target: 'ja', sync: true } })
    expect(s.prefs).toMatchObject({ s: 'landed', value: { display: 'original', target: 'ja', sync: false } })
    expect(s.visit.display).toBe('translation')
    expect(effects).toEqual([{ e: 'prefs.write', patch: { sync: false } }])
  })
})

describe('the session: tickets', () => {
  it('drops a stale result of every kind by its ticket', () => {
    const m = machine()
    const link = m.live('link')
    m.feed({ i: 'paper', t: link, doc: ready(1) }, { i: 'panes.drawn' })
    const t = { original: m.live('original'), code: m.live('code'), rows: m.live('rows'), link }
    // every resource let go: a language switch, then a mismatch and a close
    m.feed({ i: 'cmd.set', prefs: { target: 'ja' } }, { i: 'original.mismatch', t: t.original })
    const held: State = m.s
    const stale: Input[] = [
      { i: 'original.opened', t: t.original, pages: 1, bytes: 1 },
      { i: 'original.failed', t: t.original, why: 'network' },
      { i: 'original.progress', t: t.original, loaded: 5 },
      { i: 'original.mismatch', t: t.original },
      { i: 'paper', t: t.link, doc: preparing(9) },
      { i: 'follow.lost', t: t.link, why: 'network' },
      { i: 'rows.batch', t: t.rows, got: 1, total: 1, lost: 0 },
      { i: 'rows.end', t: t.rows, got: 1, total: 1, lost: 0 },
      { i: 'rows.failed', t: t.rows, why: { kind: 'server' } },
      { i: 'code.failed', t: 'code#999' },
      { i: 'composed.opened', t: 'composed#999' },
      { i: 'composed.failed', t: 'composed#999' },
      { i: 'open.answered', t: 'open#999', doc: null },
      { i: 'open.failed', t: 'open#999', why: 'x' },
      { i: 'time', t: 'timer#999', now: 1 },
    ]
    const before = m.dropped
    m.feed(...stale)
    expect(m.dropped - before).toBe(stale.length)
    expect(m.s).toBe(held)
    void t.code
  })
  it('releases every resource on close', () => {
    const m = machine()
    m.feed(
      { i: 'paper', t: m.live('link'), doc: ready(1) },
      { i: 'panes.drawn' },
      { i: 'original.opened', t: m.live('original'), pages: 1, bytes: 1 },
    )
    m.feed({ i: 'code.loaded', t: m.live('code') }, { i: 'head', digest: CATALOG.sha256, head: HEAD })
    expect(resources(m.s).size).toBeGreaterThan(4)
    m.feed({ i: 'close' })
    expect(resources(m.s).size).toBe(0)
  })
})

describe("the session's runtime", () => {
  /** handlers that record acquisitions and releases, and keep each one's emit */
  function recording() {
    const log: string[] = []
    const emits = new Map<Ticket, (x: Input) => void>()
    const handler = () => (_spec: unknown, t: Ticket, emit: (x: Input) => void, signal: AbortSignal) => {
      log.push(`+${t}`)
      emits.set(t, emit)
      signal.addEventListener('abort', () => log.push(`-${t}`))
      return () => {
        log.push(`released ${t}`)
      }
    }
    const handlers = Object.fromEntries(
      ['original', 'link', 'open', 'code', 'composed', 'rows', 'timer'].map((s) => [s, handler()]),
    ) as unknown as Handlers
    return { log, emits, handlers }
  }
  const start = () =>
    init({ paper: { id: '2600.00001', version: 1 }, here: false, defaults: PREFS, now: 0, visible: true, online: true })
  it("acquires the first state's resources at once, the original first; keeps the live tickets the resources' (I1)", () => {
    const r = recording()
    const crashes: unknown[] = []
    const rt = createRuntime({
      state: start(),
      handlers: r.handlers,
      effect() {},
      crash: (e) => crashes.push(e),
      check: true,
    })
    expect(r.log[0]).toBe('+original#1')
    expect([...rt.live.keys()].sort()).toEqual([...resources(rt.state).keys()].sort())
    const link = [...rt.live].find(([, s]) => s === 'link')?.[0] as Ticket
    r.emits.get(link)?.({ i: 'paper', t: link, doc: ready(1) })
    expect([...rt.live.values()]).toContain('rows')
    expect(crashes).toEqual([])
  })
  it('drops a result of a resource let go, releases dependents first, and everything on dispose', async () => {
    const r = recording()
    const rt = createRuntime({ state: start(), handlers: r.handlers, effect() {}, crash() {}, check: true })
    const get = (slot: string) => [...rt.live].find(([, s]) => s === slot)?.[0] as Ticket
    const original = get('original'),
      link = get('link')
    r.emits.get(original)?.({ i: 'original.opened', t: original, pages: 1, bytes: 1 })
    r.emits.get(link)?.({ i: 'paper', t: link, doc: ready(1) })
    rt.input({ i: 'panes.drawn' })
    const code = get('code')
    r.emits.get(code)?.({ i: 'code.loaded', t: code })
    rt.input({ i: 'head', digest: CATALOG.sha256, head: HEAD })
    const composed = get('composed'),
      rows = get('rows')
    rt.input({ i: 'original.mismatch', t: original })
    // (the composed document before the original's source)
    expect(r.log.indexOf(`-${composed}`)).toBeLessThan(r.log.indexOf(`-${original}`))
    const dropped = rt.counts.dropped
    r.emits.get(original)?.({ i: 'original.failed', t: original, why: 'network' })
    r.emits.get(composed)?.({ i: 'composed.opened', t: composed })
    expect(rt.counts.dropped).toBe(dropped + 2)
    await rt.dispose()
    expect(rt.live.size).toBe(0)
    expect(r.log).toContain(`released ${rows}`)
  })
  it('two sessions on one page never move each other', () => {
    const a = recording(),
      b = recording()
    const ra = createRuntime({ state: start(), handlers: a.handlers, effect() {}, crash() {}, check: true })
    const rb = createRuntime({ state: start(), handlers: b.handlers, effect() {}, crash() {}, check: true })
    const la = [...ra.live].find(([, s]) => s === 'link')?.[0] as Ticket
    a.emits.get(la)?.({ i: 'paper', t: la, doc: ready(1) })
    expect(ra.state.layer.s).toBe('ready')
    expect(rb.state.layer.s).toBe('none')
    void ra.dispose()
    expect(rb.live.size).toBeGreaterThan(0)
    expect(b.log.some((l) => l.startsWith('-'))).toBe(false)
  })
})
