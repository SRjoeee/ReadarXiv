// The session as a reducer (stage 2's exit: every transition of design-b's table; a stale result of every kind dropped by its
// ticket; every resource released on close; a second reader on the same page), through `step` and `resources` alone, then
// through the runtime with recording handlers. Stage 5a's part B adds today's pacing of our server (PDF-READER §11.10, UI.md
// S-R-24, S-R-26), the holds of the original, the paper's title and HTML version, and the heads that cannot be used.
import type { Head } from '@readarxiv/format'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../src/prefs.ts'
import {
  type Doc,
  displayOf,
  holdOf,
  init,
  type Input,
  linkSaid,
  PREPARE_DEADLINE_MS,
  type Prefs,
  REFUSED_ASKS,
  type Ref,
  resources,
  type State,
  step,
  type Ticket,
  translationShown,
  WAIT_MAX_MS,
} from '../src/session/machine.ts'
import { createRuntime, type Handlers } from '../src/session/runtime.ts'

const PREFS: Prefs = { ...DEFAULTS, display: 'bilingual', target: 'zh-Hans', sync: true }
const ref = (c: string): Ref => ({ path: `p/2600_00001v1/x/${c.repeat(64)}`, sha256: c.repeat(64), bytes: 10 })
const CATALOG = ref('a'),
  UNITS = [ref('b')]
/** a head over original `o`, its add-on `addOn` (null: the add-on was refused, nothing can be drawn) */
const headOf = (o = 'o', addOn: boolean = true) =>
  ({
    format: 1,
    paper: { id: '2600.00001', version: 1, pages: 4 },
    made: 'x',
    original: { bytes: 9, sha256: o.repeat(64), chunk: 65536, chunks: '' },
    addOn: addOn ? { digest: 'd'.repeat(64), bytes: 10 } : null,
    units: [],
    parts: [],
  }) as unknown as Head
const HEAD = headOf()
const ZH = 'zh-Hans'
const doc = (rev: number, o: Partial<Doc> = {}): Doc => ({
  epoch: 'e1',
  rev,
  prepare: { state: 'none', why: null, retryAt: null, stage: null, units: [] },
  layer: null,
  targets: {},
  ...o,
})
/** a target's run as our server's document names it (worker v2 machine.ts docOf): `none`, made by an open and not started */
const run = (state: 'none' | 'running' | 'done' | 'failed', o: Partial<NonNullable<Doc['targets'][string]>> = {}) => ({
  state,
  why: state === 'failed' ? 'unavailable' : null,
  retryAt: null,
  rows: [],
  done: 0,
  total: 0,
  attempt: state === 'none' ? 0 : 1,
  ...o,
})
/** a paper being prepared for the target an open made (its run started once the prepare tells its units) */
const preparing = (rev: number, units: Ref[] = []) =>
  doc(rev, {
    prepare: { state: 'running', why: null, retryAt: null, stage: 'compiling', units },
    targets: { [ZH]: run('none') },
  })
/** a paper whose layer is of the deployed build, translated into the target */
const ready = (rev: number, catalog = CATALOG) =>
  doc(rev, {
    prepare: { state: 'done', why: null, retryAt: null, stage: null, units: UNITS },
    layer: { catalog, units: UNITS, format: 1, stale: false },
    targets: { [ZH]: run('done', { units: UNITS }) },
  })

/** step over inputs (each at the machine's time, `at` moving it); the tickets of a slot live now */
function machine(
  o: { visible?: boolean; here?: boolean; display?: Prefs['display']; targets?: string[]; online?: boolean } = {},
) {
  let s = init({
    paper: { id: '2600.00001', version: 1 },
    here: !!o.here,
    defaults: { ...PREFS, display: o.display ?? 'bilingual' },
    now: 0,
    visible: o.visible ?? true,
    online: o.online ?? true,
    ...(o.targets ? { targets: o.targets } : {}),
  })
  const effects: unknown[] = []
  let released: Ticket[] = []
  let dropped = 0
  let now = 0
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
    /** the timer a region holds, by its ticket's spec: the one due at `at` */
    timerAt: (at: number): Ticket => {
      const t = [...resources(s)].find(([, spec]) => spec.slot === 'timer' && spec.at === at)?.[0]
      if (!t) throw new Error(`no timer at ${at} in ${JSON.stringify([...resources(s)])}`)
      return t
    },
    /** the time moved to `t` (the next inputs applied then) */
    at(t: number) {
      now = t
      return m
    },
    feed(...xs: Input[]) {
      for (const x of xs) {
        const t = 't' in x ? (x as { t: Ticket }).t : null
        const before = new Set(resources(s).keys())
        if (t !== null && !before.has(t)) {
          dropped++
          continue
        }
        const out = step(s, x, x.i === 'time' ? x.now : now)
        if (x.i === 'time') now = x.now
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
/** a machine whose layer is ready, its head read and its code in, the original open: the composed document live */
function composedNow(o: Parameters<typeof machine>[0] = {}, head: Head = HEAD) {
  const m = machine(o)
  m.feed(
    { i: 'original.opened', t: m.live('original'), pages: 4, bytes: 9 },
    { i: 'panes.drawn' },
    { i: 'paper', t: m.live('link'), doc: ready(1) },
  )
  m.feed({ i: 'code.loaded', t: m.live('code') }, { i: 'head', digest: CATALOG.sha256, head })
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
    expect(m.s.original).toMatchObject({ s: 'opening', loaded: 65536, total: 0 })
    m.feed({ i: 'original.progress', t: t1, loaded: 131072, total: 1_000_000 })
    expect(m.s.original).toMatchObject({ s: 'opening', loaded: 131072, total: 1_000_000 })
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
    const m = composedNow()
    const t1 = m.live('original')
    const composed = m.live('composed')
    m.feed({ i: 'original.mismatch', t: t1 })
    expect(m.s.original).toMatchObject({ s: 'opening', pin: true })
    expect(m.released).toEqual(expect.arrayContaining([t1, composed]))
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'original', pin: true })
    m.feed({ i: 'original.mismatch', t: m.live('original') })
    expect(m.s.layer).toMatchObject({ s: 'refused', why: 'mismatch' })
    // (passing, as today's: our copy not to be had is the bilingual version not to be had now, with its retry)
    expect(holdOf(m.s)).toBeNull()
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
    expect(m.s.bound).toBe(HEAD.original.sha256)
  })
  it("the follow's stream lost and asked again: reconnecting until a document is heard on it, the link kept (the website's word)", () => {
    const m = machine()
    const link = m.live('link')
    m.feed({ i: 'paper', t: link, doc: preparing(1) })
    expect(m.s.link).toMatchObject({ s: 'on', heard: true, lost: false })
    m.feed({ i: 'link.quiet', t: link })
    expect(m.s.link).toMatchObject({ s: 'on', lost: true })
    expect(m.live('link')).toBe(link)
    m.feed({ i: 'paper', t: link, doc: preparing(2) })
    expect(m.s.link).toMatchObject({ s: 'on', lost: false })
    // (a stale ticket's word dropped)
    const dropped = m.dropped
    m.feed({ i: 'link.quiet', t: 'gone' as Ticket })
    expect([m.dropped, m.s.link]).toMatchObject([dropped + 1, { lost: false }])
  })
  it('a paper the server has not opened is opened (the POST, the follow waiting for it), then followed again', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    const open = m.live('open')
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'open', target: 'zh-Hans' })
    // (nothing followed while the open is asked: no 404s in a row)
    expect(m.has('link')).toBe(false)
    m.feed({ i: 'open.answered', t: open, doc: preparing(1, UNITS) })
    expect(m.s.layer.s).toBe('preparing')
    expect(m.has('open')).toBe(false)
    expect(m.has('link')).toBe(true)
  })
  it('a paper still not opened after its open cannot be had: the prepare is asked once a visit', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: null })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    expect(m.s.layer).toMatchObject({ s: 'refused', why: 'cannot-prepare' })
    expect(m.has('open')).toBe(false)
    expect(holdOf(m.s)).toBe('paper')
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
  it('a deployment newer than the tab: outdated, told once, whether the follow, the open or the layer says it', () => {
    const byLayer = machine()
    byLayer.feed({
      i: 'paper',
      t: byLayer.live('link'),
      doc: doc(1, { layer: { catalog: CATALOG, units: UNITS, format: 9 } }),
    })
    expect(byLayer.s.layer).toMatchObject({ s: 'refused', why: 'outdated' })
    expect(byLayer.effects).toEqual([{ e: 'outdated' }])
    const byFollow = machine()
    byFollow.feed({ i: 'follow.lost', t: byFollow.live('link'), why: 'update' })
    expect(byFollow.s.layer).toMatchObject({ s: 'refused', why: 'outdated' })
    expect(byFollow.effects).toEqual([{ e: 'outdated' }])
    const byOpen = machine()
    byOpen.feed({ i: 'follow.lost', t: byOpen.live('link'), why: 'not-opened' })
    byOpen.feed({ i: 'open.failed', t: byOpen.live('open'), why: 'update' })
    expect(byOpen.s.layer).toMatchObject({ s: 'refused', why: 'outdated' })
    expect(byOpen.effects).toEqual([{ e: 'outdated' }])
    // (lasting: nothing more asked, the translated displays held, the host's to act on: the website reloads once)
    expect(byOpen.has('link') || byOpen.has('open')).toBe(false)
    expect(displayOf(byOpen.s)).toBe('original')
  })
  it('an id unknown to our server is none to be had (not-found, lasting)', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-found' })
    expect(m.s.layer).toMatchObject({ s: 'refused', why: 'not-found' })
    expect(m.has('link')).toBe(false)
  })
})

describe('the session: the open, wherever the document lacks what the visit needs and nothing in flight brings it (our server: a follow never starts work, the open starts what is missing)', () => {
  const NEW = [ref('n')],
    CATALOG2 = ref('c')
  /** a layer of another build than the one our server runs (`stale`): served while the paper is prepared again */
  const stale = (rev: number, o: Partial<Doc> = {}): Doc =>
    doc(rev, {
      prepare: { state: 'done', why: null, retryAt: null, stage: null, units: UNITS, attempt: 1 },
      layer: { catalog: CATALOG, units: UNITS, format: 1, stale: true },
      ...o,
    })
  const prep = (state: Doc['prepare']['state'], o: Partial<Doc['prepare']> = {}): Doc['prepare'] => ({
    state,
    why: state === 'failed' ? 'unavailable' : null,
    retryAt: null,
    stage: state === 'running' ? 'compiling' : null,
    units: [],
    attempt: 1,
    ...o,
  })
  const opens = (m: ReturnType<typeof machine>) => [...resources(m.s).values()].filter((x) => x.slot === 'open')
  it('a stale layer with no prepare running and no run of the target (staging, 1706.03762v7 after PIPELINE 77 to 78): opened at once, once; the old layer shown and followed meanwhile; the new catalog taken when it lands', () => {
    const m = machine()
    const link = m.live('link')
    m.feed({ i: 'paper', t: link, doc: stale(1) })
    expect(opens(m)).toEqual([{ slot: 'open', target: ZH }])
    // (followed meanwhile, the old layer ready and drawn: the design's "a stale layer keeps serving")
    expect(m.live('link')).toBe(link)
    expect(m.s.layer).toMatchObject({ s: 'ready', catalog: CATALOG })
    // (our server prepares again and makes the target's work, its run started once the prepare tells its units; the follow
    // asked again at once, at the pace of what now runs)
    m.feed({
      i: 'open.answered',
      t: m.live('open'),
      doc: stale(2, { prepare: prep('running', { attempt: 2 }), targets: { [ZH]: run('none') } }),
    })
    expect(opens(m)).toEqual([])
    expect(m.s.layer).toMatchObject({ s: 'ready', catalog: CATALOG })
    expect(m.live('link')).not.toBe(link)
    m.feed({
      i: 'paper',
      t: m.live('link'),
      doc: stale(3, { prepare: prep('running', { attempt: 2, units: NEW }), targets: { [ZH]: run('running') } }),
    })
    expect(opens(m)).toEqual([])
    m.feed({
      i: 'paper',
      t: m.live('link'),
      doc: doc(4, {
        prepare: prep('done', { attempt: 2, units: NEW }),
        layer: { catalog: CATALOG2, units: NEW, format: 1, stale: false },
        targets: { [ZH]: run('running', { units: NEW }) },
      }),
    })
    expect(m.s.layer).toMatchObject({ s: 'ready', catalog: CATALOG2, head: null })
    expect(opens(m)).toEqual([])
    expect(m.has('rows')).toBe(true)
  })
  /** a visit whose rows are made here (the extension's), the original open and the gate open */
  const hereNow = () => {
    const m = machine({ here: true })
    m.feed({ i: 'original.opened', t: m.live('original'), pages: 4, bytes: 9 }, { i: 'panes.drawn' })
    return m
  }
  /** the new build's layer, of other units than the stale one's */
  const rebuilt = (rev: number) =>
    doc(rev, {
      prepare: prep('done', { attempt: 2, units: NEW }),
      layer: { catalog: CATALOG2, units: NEW, format: 1, stale: false },
    })
  it('rows made here over a stale layer: opened once, naming no target; followed while the paper is prepared again, the old layer drawn and its rows made meanwhile; the new catalog taken when it lands, then nothing more asked of our server (#634 review)', () => {
    const m = hereNow()
    m.feed({ i: 'paper', t: m.live('link'), doc: stale(1) })
    expect(opens(m)).toEqual([{ slot: 'open', target: null }])
    // (a stale layer is served while the paper is prepared again: its replacement is still to come, so the follow stays)
    expect(m.has('link')).toBe(true)
    m.feed({ i: 'code.loaded', t: m.live('code') }, { i: 'head', digest: CATALOG.sha256, head: HEAD })
    expect(m.has('composed')).toBe(true)
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'rows', target: ZH, from: 'here', units: UNITS })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: stale(2, { prepare: prep('running', { attempt: 2 }) }) })
    expect(opens(m)).toEqual([])
    expect(m.has('link')).toBe(true)
    m.feed({ i: 'paper', t: m.live('link'), doc: stale(3, { prepare: prep('running', { attempt: 2, units: NEW }) }) })
    expect(m.has('link')).toBe(true)
    m.feed({ i: 'paper', t: m.live('link'), doc: rebuilt(4) })
    expect(m.s.layer).toMatchObject({ s: 'ready', catalog: CATALOG2, head: null })
    // (the layer our server runs: nothing more can come for rows made here)
    expect(m.has('link') || m.has('open')).toBe(false)
    // (a prepare running over the layer our server runs (the harness's `recatalog`): its end writes a layer, so followed too)
    const p = hereNow()
    p.feed({
      i: 'paper',
      t: p.live('link'),
      doc: { ...ready(1), prepare: prep('running', { attempt: 2 }), targets: {} },
    })
    expect(p.has('link')).toBe(true)
    expect(opens(p)).toEqual([])
  })
  it("rows made here that ended over one layer are made again for a newer catalog's units once its head is read; a newer catalog of the same units keeps them", () => {
    const m = hereNow()
    m.feed({ i: 'paper', t: m.live('link'), doc: stale(1) })
    m.feed({ i: 'code.loaded', t: m.live('code') }, { i: 'head', digest: CATALOG.sha256, head: HEAD })
    m.feed({ i: 'rows.end', t: m.live('rows') })
    expect(m.has('rows')).toBe(false)
    // (the open's answer carries the new build's layer: a prepare another visit asked ended meanwhile)
    m.feed({ i: 'open.answered', t: m.live('open'), doc: rebuilt(2) })
    expect(m.has('rows')).toBe(false)
    m.feed({ i: 'head', digest: CATALOG2.sha256, head: HEAD })
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'rows', target: ZH, from: 'here', units: NEW })
    const same = hereNow()
    same.feed({ i: 'paper', t: same.live('link'), doc: stale(1) })
    same.feed({ i: 'code.loaded', t: same.live('code') }, { i: 'head', digest: CATALOG.sha256, head: HEAD })
    same.feed({ i: 'rows.end', t: same.live('rows') })
    same.feed({
      i: 'open.answered',
      t: same.live('open'),
      doc: doc(2, { prepare: prep('done', { attempt: 2 }), layer: { catalog: CATALOG2, units: UNITS, format: 1 } }),
    })
    same.feed({ i: 'head', digest: CATALOG2.sha256, head: HEAD })
    expect(same.s.rows.s).toBe('complete')
    expect(same.has('rows')).toBe(false)
  })
  it('nothing asked where what the visit needs is there or in flight: the target running or done on the layer, a prepare running over a stale layer or none; rows made here name no target', () => {
    const cases: Doc[] = [
      ready(1),
      doc(1, { ...ready(1), targets: { [ZH]: run('running') } }),
      stale(1, { prepare: prep('running', { attempt: 2 }), targets: { [ZH]: run('none') } }),
      stale(1, { prepare: prep('running', { attempt: 2 }), targets: { [ZH]: run('failed', { retryAt: 5 }) } }),
      preparing(1, UNITS),
    ]
    for (const d of cases) {
      const m = machine()
      m.feed({ i: 'paper', t: m.live('link'), doc: d })
      expect([d, opens(m)]).toEqual([d, []])
    }
    const here = machine({ here: true })
    here.feed({ i: 'paper', t: here.live('link'), doc: { ...ready(1), targets: {} } })
    expect(opens(here)).toEqual([])
  })
  it('a target the paper has never been translated into (a second language): opened at once, the layer kept; switched to mid-visit, the new target’s document taken though its revision is the one held', () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: { ...ready(1), targets: {} } })
    expect(opens(m)).toEqual([{ slot: 'open', target: ZH }])
    expect(m.s.layer.s).toBe('ready')
    m.feed({ i: 'open.answered', t: m.live('open'), doc: { ...ready(2), targets: { [ZH]: run('running') } } })
    expect(opens(m)).toEqual([])
    // (a language switched to: its follow's first document is of the paper's revision held, and names that target alone)
    const s = composedNow()
    s.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(opens(s)).toEqual([])
    s.feed({ i: 'paper', t: s.live('link'), doc: { ...ready(1), targets: {} } })
    expect(opens(s)).toEqual([{ slot: 'open', target: 'ja' }])
    s.feed({ i: 'open.answered', t: s.live('open'), doc: { ...ready(2), targets: { ja: run('running') } } })
    expect(s.s.doc?.targets.ja?.state).toBe('running')
    expect(s.s.rows).toMatchObject({ s: 'arriving', target: 'ja' })
    expect(opens(s)).toEqual([])
  })
  it('once for each need a visit: an open answered whose document still shows it asks nothing more, a later failure of the run it started is another; a retry asks again', () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: stale(1) })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: stale(1) })
    m.feed({ i: 'paper', t: m.live('link'), doc: stale(2) })
    expect(opens(m)).toEqual([])
    m.feed({ i: 'cmd.retry' })
    expect(opens(m)).toEqual([{ slot: 'open', target: ZH }])
    // (the prepare it started failed for now: asked again once our server's wait is over, never before)
    m.feed({ i: 'open.answered', t: m.live('open'), doc: stale(3, { prepare: prep('running', { attempt: 2 }) }) })
    m.at(1000).feed({
      i: 'paper',
      t: m.live('link'),
      doc: stale(4, { prepare: prep('failed', { attempt: 2, retryAt: 31_000 }), targets: { [ZH]: run('none') } }),
    })
    expect(opens(m)).toEqual([])
    m.feed({ i: 'time', t: m.timerAt(31_000), now: 31_000 })
    expect(opens(m)).toEqual([{ slot: 'open', target: ZH }])
  })
  it('a need our server holds back by a wait (its retryAt) is asked once it is over: a prepare refused or failed for now with no layer, a target failed; the rows of a run started again taken again', () => {
    // (an open refused by Admission leaves the paper stored, the prepare not started: a follow answers it, never not-opened)
    const none = machine()
    none.feed({
      i: 'paper',
      t: none.live('link'),
      doc: doc(1, { prepare: prep('none', { attempt: 0, retryAt: 10_000 }), targets: { [ZH]: run('none') } }),
    })
    expect(opens(none)).toEqual([])
    none.feed({ i: 'time', t: none.timerAt(10_000), now: 10_000 })
    expect(opens(none)).toEqual([{ slot: 'open', target: ZH }])
    // (failed for now, no layer: refused until its time, the layer's timer, then opened)
    const failed = machine()
    failed.feed({ i: 'paper', t: failed.live('link'), doc: doc(1, { prepare: prep('failed', { retryAt: 20_000 }) }) })
    expect(failed.s.layer).toMatchObject({ s: 'refused', why: 'unreachable', retryAt: 20_000 })
    expect(opens(failed)).toEqual([])
    failed.feed({ i: 'time', t: failed.timerAt(20_000), now: 20_000 })
    expect(opens(failed)).toEqual([{ slot: 'open', target: ZH }])
    // (a target failed: opened at its time; the rows it failed with taken again once its run is under way)
    const t = composedNow()
    t.feed({
      i: 'paper',
      t: t.live('link'),
      doc: { ...ready(2), targets: { [ZH]: run('failed', { retryAt: 5000, units: UNITS }) } },
    })
    t.feed({ i: 'rows.failed', t: t.live('rows'), why: { kind: 'server' } })
    expect(opens(t)).toEqual([])
    t.feed({ i: 'time', t: t.timerAt(5000), now: 5000 })
    expect(opens(t)).toEqual([{ slot: 'open', target: ZH }])
    t.feed({
      i: 'open.answered',
      t: t.live('open'),
      doc: { ...ready(3), targets: { [ZH]: run('running', { attempt: 2 }) } },
    })
    expect(t.s.rows).toMatchObject({ s: 'arriving', target: ZH })
    // (rows complete, then a run our server starts again, a re-prepare's new units: taken again)
    const c = composedNow()
    c.feed({ i: 'rows.end', t: c.live('rows') })
    expect(c.s.rows.s).toBe('complete')
    c.feed({ i: 'paper', t: c.live('link'), doc: { ...ready(2), targets: { [ZH]: run('running', { attempt: 2 }) } } })
    expect(c.s.rows).toMatchObject({ s: 'arriving', target: ZH })
    // (a run started and ended between two documents heard, a newer catalog's (staging, 1706.03762v7: the reader's rows of
    // the old units complete, the new run's never read): taken again; the same run heard again, not)
    const w = composedNow()
    w.feed({ i: 'rows.end', t: w.live('rows') })
    w.feed({ i: 'paper', t: w.live('link'), doc: { ...ready(2), targets: { [ZH]: run('done', { units: UNITS }) } } })
    expect(w.s.rows.s).toBe('complete')
    const NEWER = {
      ...ready(3, ref('c')),
      targets: { [ZH]: run('done', { attempt: 2, units: UNITS, rows: [ref('r')] }) },
    }
    w.feed({ i: 'paper', t: w.live('link'), doc: NEWER })
    expect(w.s.rows).toMatchObject({ s: 'arriving', target: ZH })
    w.feed({ i: 'rows.end', t: w.live('rows') })
    w.feed({ i: 'paper', t: w.live('link'), doc: { ...NEWER, rev: 4 } })
    expect(w.s.rows.s).toBe('complete')
  })
  it('a refused open backs off as now: given back, asked again once the 429’s wait is over, three in a row at most whatever the follow hears meanwhile (no answer of a paper still lacking moves it on); a retry asks at once', () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: stale(1) })
    /** the open refused for capacity, our server's document beside it (its wait stored as the prepare's retryAt) */
    const refuse = (why: 'busy' | 'quota', afterMs: number) =>
      m.feed({
        i: 'open.answered',
        t: m.live('open'),
        doc: stale((m.s.doc?.rev ?? 0) + 1, { prepare: prep('done', { retryAt: m.s.now + afterMs }) }),
        refused: { why, afterMs },
      })
    refuse('quota', 30_000)
    expect(m.s.open).toMatchObject({ t: null, asked: [] })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'limit', retryAt: 30_000 })
    expect(opens(m)).toEqual([])
    m.feed({ i: 'cmd.retry' })
    expect(opens(m)).toEqual([])
    m.feed({ i: 'time', t: m.timerAt(30_000), now: 30_000 })
    expect(opens(m)).toEqual([{ slot: 'open', target: ZH }])
    expect(m.has('link')).toBe(true)
    for (let n = 2; n <= REFUSED_ASKS; n++) {
      refuse('quota', 1000)
      // (the follow meanwhile: the paper still lacks what was asked, so the run of 429s goes on)
      m.feed({ i: 'time', t: (m.s.link as { timer: Ticket }).timer, now: m.s.now + 1000 })
      m.feed({
        i: 'paper',
        t: m.live('link'),
        doc: stale(m.s.doc?.rev ?? 0, { prepare: prep('done', { retryAt: m.s.now }) }),
      })
      expect(opens(m)).toEqual([{ slot: 'open', target: ZH }])
    }
    refuse('quota', 1000)
    const due = m.s.now + 1000
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'limit', retryAt: due, wake: null })
    expect(opens(m)).toEqual([])
    // (a retry before our server's time asks nothing; at it, at once)
    m.feed({ i: 'cmd.retry' })
    expect(opens(m)).toEqual([])
    m.at(due).feed({ i: 'cmd.retry' })
    expect(opens(m)).toEqual([{ slot: 'open', target: ZH }])
  })
})

describe("the session: our server's pacing (today's run)", () => {
  it('a 429 waits its time and asks again, three times in a row at most; the next stops the look until a retry', () => {
    const m = machine()
    for (let n = 1; n <= REFUSED_ASKS; n++) {
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 60_000 })
      expect(m.s.link).toMatchObject({ s: 'stopped', why: 'limit', retryAt: (n - 1) * 60_000 + 60_000 })
      expect(m.has('link')).toBe(false)
      // (a retry within the wait waits it out)
      m.feed({ i: 'cmd.retry' })
      expect(m.s.link.s).toBe('stopped')
      m.feed({ i: 'time', t: m.timerAt(n * 60_000), now: n * 60_000 })
      expect(m.has('link')).toBe(true)
    }
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 60_000 })
    // (the fourth: our server's time kept, said and the retry's, but not asked again by the session itself)
    const due = m.s.now + 60_000
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'limit', retryAt: due, wake: null, timer: null })
    m.feed({ i: 'cmd.retry' })
    expect(m.has('link')).toBe(false)
    // a retry at our server's time asks at once, for three more
    m.at(due).feed({ i: 'cmd.retry' })
    expect(m.has('link')).toBe(true)
    expect(m.s.refusals).toBe(0)
    for (let n = 1; n <= REFUSED_ASKS; n++) {
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 1000 })
      m.feed({ i: 'time', t: (m.s.link as { timer: Ticket }).timer, now: m.s.now + 1000 })
    }
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 1000 })
    expect(m.s.link).toMatchObject({ s: 'stopped', retryAt: m.s.now + 1000, wake: null })
  })
  it("our server at capacity (busy) is a line the paper waits in: asked again by itself at our server's time however many times, never counted with the limit's 429s (the coordinator's decision 5, 2026-11-11)", () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    for (let n = 1; n <= REFUSED_ASKS + 3; n++) {
      m.feed({ i: 'open.answered', t: m.live('open'), doc: null, refused: { why: 'busy', afterMs: 30_000 } })
      const due = m.s.now + 30_000
      expect(m.s.link, `refusal ${n}`).toMatchObject({ s: 'stopped', why: 'busy', retryAt: due, wake: due })
      expect(m.s.refusals).toBe(0)
      m.feed({ i: 'time', t: m.timerAt(due), now: due })
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
      expect(m.has('open'), `asked again after refusal ${n}`).toBe(true)
    }
    // (the visitor's new papers spent beside it still stop the look past their three)
    for (let n = 1; n <= REFUSED_ASKS + 1; n++) {
      m.feed({ i: 'open.answered', t: m.live('open'), doc: null, refused: { why: 'quota', afterMs: 1000 } })
      if (n <= REFUSED_ASKS) {
        m.feed({ i: 'time', t: m.timerAt(m.s.now + 1000), now: m.s.now + 1000 })
        m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
      }
    }
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'limit', wake: null })
  })
  it("a 429's wait is our server's as it names it, however long: the time said, the retry's and the session's own next ask; one with no time named waits a second", () => {
    const m = machine()
    // (a visitor's day of new papers spent: the window ends 20 hours on)
    m.at(5).feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 72_000_000 })
    expect(m.s.link).toMatchObject({ retryAt: 5 + 72_000_000, wake: 5 + 72_000_000 })
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'timer', at: 5 + 72_000_000 })
    // (nothing asked of our server before it: not at ten minutes, the old cap)
    expect(() => m.timerAt(5 + WAIT_MAX_MS)).toThrow()
    m.feed({ i: 'time', t: m.timerAt(5 + 72_000_000), now: 5 + 72_000_000 })
    expect(m.has('link')).toBe(true)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'busy', afterMs: null })
    expect(m.s.link).toMatchObject({ retryAt: 5 + 72_000_000 + 1000 })
  })
  it("the visitor's new papers spent: the time said is the instant our server names (its period's end), never its wait added to the viewer's clock; the session asks again once both that wait has passed and the viewer's clock reads the time said (a viewer's clock 90 s ahead, 90 s behind, on time)", () => {
    // (our server's clock at the answer: 20:17:10 at Shanghai; its hour ends at 21:00:00; its wait, as admission.ts rounds it)
    const server = Date.UTC(2026, 10, 11, 12, 17, 10)
    const end = Date.UTC(2026, 10, 11, 13, 0, 0)
    const wait = Math.ceil((end - server) / 1000) * 1000
    for (const skew of [90_000, -90_000, 0]) {
      const m = machine()
      m.at(server + skew).feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
      m.feed({ i: 'open.answered', t: m.live('open'), doc: null, refused: { why: 'quota', afterMs: wait, at: end } })
      // (said: 21:00:00 exactly, whatever the viewer's clock)
      expect(m.s.link, `skew ${skew}`).toMatchObject({ s: 'stopped', why: 'limit', retryAt: end })
      // (asked again at the later of the two: our server's hour over, and the viewer's clock past the time said)
      const wake = Math.max(server + skew + wait, end)
      expect((m.s.link as { wake: number }).wake, `skew ${skew}`).toBe(wake)
      expect([...resources(m.s).values()]).toContainEqual({ slot: 'timer', at: wake })
    }
  })
  it("the network down is said where the view waits on our server's rows (linkSaid); rows made here wait on the host's translator, which tells its own failures", () => {
    const m = composedNow()
    m.feed({ i: 'env.online', on: false })
    expect(linkSaid(m.s, true)).toEqual({ reconnecting: false, network: true })
    expect(linkSaid(m.s, false)).toEqual({ reconnecting: false, network: false })
    const here = composedNow({ here: true })
    here.feed({ i: 'env.online', on: false })
    expect(linkSaid(here.s, true)).toEqual({ reconnecting: false, network: false })
  })
  it('an answer that moves the paper on ends a run of 429s', () => {
    const m = machine()
    for (let n = 1; n <= REFUSED_ASKS; n++) {
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 1000 })
      m.feed({ i: 'time', t: (m.s.link as { timer: Ticket }).timer, now: n * 1000 })
    }
    m.feed({ i: 'paper', t: m.live('link'), doc: preparing(1, UNITS) })
    expect(m.s.refusals).toBe(0)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 1000 })
    expect(m.s.link).toMatchObject({ s: 'stopped', retryAt: m.s.now + 1000 })
  })
  it('an open refused for capacity is given back and asked again after its wait; not counted with the limit’s 429s', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: null, refused: { why: 'busy', afterMs: 30_000 } })
    expect(m.s.layer).toEqual({ s: 'none' })
    expect(m.s.open).toMatchObject({ t: null, asked: [], missing: false })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'busy', retryAt: 30_000 })
    expect(m.s.refusals).toBe(0)
    m.feed({ i: 'cmd.retry' })
    expect(m.s.link.s).toBe('stopped')
    m.feed({ i: 'time', t: m.timerAt(30_000), now: 30_000 })
    // (the follow first, then, not opened, the open asked again)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    expect(m.has('open')).toBe(true)
  })
  it('a 429 that carries the document takes it; a prepare under way keeps its units and its rows meanwhile', () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: preparing(1, UNITS) })
    const rows = m.live('rows')
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 5000, doc: preparing(2, UNITS) })
    expect(m.s.doc?.rev).toBe(2)
    expect(m.s.layer.s).toBe('preparing')
    expect(m.live('rows')).toBe(rows)
  })
  it('a language changed during a 429’s wait is retargeted in place, our server asked no sooner', () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: preparing(1, UNITS) })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 20_000 })
    m.at(1000).feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(m.s.rows).toMatchObject({ s: 'arriving', target: 'ja' })
    expect(m.has('link') || m.has('open')).toBe(false)
    expect(m.s.link).toMatchObject({ s: 'stopped', retryAt: 20_000 })
    m.feed({ i: 'time', t: m.timerAt(20_000), now: 20_000 })
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'link', target: 'ja' })
    // (rows made here: the same wait, the rows of the new target from the layer as it is)
    const here = composedNow({ here: true })
    here.feed({ i: 'object.refused', digest: CATALOG.sha256, why: 'gone' })
    here.feed({ i: 'follow.lost', t: here.live('link'), why: 'busy', afterMs: 9000 })
    here.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(here.has('link')).toBe(false)
    expect(here.s.rows.target).toBe('ja')
  })
  it("the visitor's rate of asks (a 429 our server words `rate-limited`): its own cause, waited out and asked again by itself, never counted as a limit", () => {
    const m = machine()
    for (let n = 1; n <= REFUSED_ASKS + 2; n++) {
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'rate', afterMs: 60_000 })
      expect(m.s.link).toMatchObject({ s: 'stopped', why: 'rate', retryAt: m.s.now + 60_000, wake: m.s.now + 60_000 })
      m.feed({ i: 'time', t: m.timerAt(m.s.now + 60_000), now: m.s.now + 60_000 })
      expect(m.has('link')).toBe(true)
    }
    expect(m.s.refusals).toBe(0)
    // (the open refused for the rate: the same)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: null, refused: { why: 'rate', afterMs: 60_000 } })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'rate', wake: m.s.now + 60_000 })
  })
  it("a 429 that names no wait (0 s) is asked again no sooner than a second on, and the same refusal again backs off, doubled to thirty seconds or our server's time at most; the time said stays our server's", () => {
    // (the visitor's rate, and our server at capacity, the queue's, which neither counts toward REFUSED_ASKS)
    for (const why of ['rate', 'busy'] as const) {
      const q = machine()
      const asks: number[] = []
      for (let n = 1; n <= 10; n++) {
        q.feed({ i: 'follow.lost', t: q.live('link'), why: 'not-opened' })
        asks.push(q.s.now)
        q.feed({ i: 'open.answered', t: q.live('open'), doc: null, refused: { why, afterMs: 0 } })
        // (said as our server named it: due now; the session's own next ask its own)
        expect(q.s.link).toMatchObject({ s: 'stopped', why, retryAt: q.s.now })
        const wake = (q.s.link as { wake: number }).wake
        expect(wake - q.s.now, `${why} ask ${n}`).toBe(Math.min(30_000, 1000 * 2 ** (n - 1)))
        q.feed({ i: 'time', t: q.timerAt(wake), now: wake })
      }
      const gaps = asks.slice(1).map((t, k) => t - (asks[k] as number))
      expect(gaps, why).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000, 30_000])
    }
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: null, refused: { why: 'rate', afterMs: 0 } })
    m.feed({ i: 'time', t: m.timerAt(m.s.now + 1000), now: m.s.now + 1000 })
    // (another answer ends the run: the next refusal waits a second again)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: preparing(1, UNITS) })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'rate', afterMs: 0 })
    expect((m.s.link as { wake: number }).wake - m.s.now).toBe(1000)
    // (a time our server names past thirty seconds is the cap: never asked sooner than it)
    m.feed({ i: 'time', t: m.timerAt(m.s.now + 1000), now: m.s.now + 1000 })
    for (let n = 1; n <= 3; n++) {
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'rate', afterMs: 60_000 })
      expect((m.s.link as { wake: number }).wake - m.s.now).toBe(60_000)
      m.feed({ i: 'time', t: m.timerAt(m.s.now + 60_000), now: m.s.now + 60_000 })
    }
  })
  it('the network itself failed (the fetch rejected twice): its own cause, asked again by itself once the connection is back, or at a growing pace while the browser says it is online', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'network' })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'network', retryAt: null, wake: 1000 })
    m.feed({ i: 'time', t: m.timerAt(1000), now: 1000 })
    expect(m.has('link')).toBe(true)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'network' })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'network', wake: 3000 })
    // (the browser offline: nothing asked until it is back, then at once)
    m.feed({ i: 'env.online', on: false })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'network', wake: null, timer: null })
    m.at(50_000).feed({ i: 'env.online', on: true })
    expect(m.has('link')).toBe(true)
    // (a document heard: the pace begins again)
    m.feed({ i: 'paper', t: m.live('link'), doc: preparing(1, UNITS) })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'network' })
    expect(m.s.link).toMatchObject({ wake: 51_000 })
    // (a retry asks at once)
    m.feed({ i: 'cmd.retry' })
    expect(m.has('link')).toBe(true)
  })
  it('our server at fault (a 5xx twice, the client’s): the look stopped, said, and asked again by a retry alone', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'server' })
    expect(m.s.link).toEqual({ s: 'stopped', why: 'unreachable', retryAt: null, wake: null, timer: null })
    expect(m.has('link')).toBe(false)
    m.feed({ i: 'env.online', on: true })
    expect(m.has('link')).toBe(false)
    m.feed({ i: 'cmd.retry' })
    expect(m.has('link')).toBe(true)
    // (an open that never reached our server: given back, so that a retry asks it again)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.failed', t: m.live('open'), why: 'server' })
    expect(m.s.layer).toEqual({ s: 'none' })
    expect(m.s.open).toMatchObject({ t: null, asked: [], missing: false })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'unreachable' })
    m.feed({ i: 'cmd.retry' })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    expect(m.has('open')).toBe(true)
  })
  it('offline with no layer is the network at once, as every ask would fail; back online, asked at once', () => {
    const m = machine({ online: false })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'network', wake: null })
    const later = machine()
    later.feed({ i: 'env.online', on: false })
    expect(later.s.link).toMatchObject({ s: 'stopped', why: 'network' })
    later.feed({ i: 'env.online', on: true })
    expect(later.has('link')).toBe(true)
  })
  it('nothing is asked of our server while the tab is hidden, and it is followed again once shown', () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: preparing(1, UNITS) })
    const rows = m.live('rows')
    m.feed({ i: 'env.visible', on: false })
    expect(m.has('link')).toBe(false)
    // (the rows from the prepare's units go on)
    expect(m.live('rows')).toBe(rows)
    m.feed({ i: 'env.visible', on: true })
    expect(m.has('link')).toBe(true)
    // (a 429's wait that ends while hidden: followed again once shown)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'busy', afterMs: 1000 }, { i: 'env.visible', on: false })
    m.feed({ i: 'time', t: m.timerAt(1000), now: 1000 })
    expect(m.has('link')).toBe(false)
    m.feed({ i: 'env.visible', on: true })
    expect(m.has('link')).toBe(true)
  })
  it('a prepare followed ten minutes with the tab shown is given up, the hidden time not counted; a retry asks again', () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: preparing(1, UNITS) })
    expect(m.s.prepare.since).toBe(0)
    m.at(200_000).feed({ i: 'env.visible', on: false })
    expect(m.s.prepare).toEqual({ spent: 200_000, since: null, timer: null })
    // (an hour hidden)
    m.at(3_800_000).feed({ i: 'env.visible', on: true })
    m.feed({ i: 'paper', t: m.live('link'), doc: preparing(2, UNITS) })
    const due = 3_800_000 + PREPARE_DEADLINE_MS - 200_000
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'timer', at: due })
    m.feed({ i: 'time', t: m.timerAt(due), now: due })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'unreachable', retryAt: null })
    expect(m.has('link')).toBe(false)
    m.feed({ i: 'cmd.retry' })
    expect(m.s.prepare.spent).toBe(0)
    expect(m.has('link')).toBe(true)
  })
  it('rows made here need nothing more of our server once the layer is final: ready, of the build our server runs, no prepare running', () => {
    const m = composedNow({ here: true })
    expect(m.has('link')).toBe(false)
    expect(m.has('rows')).toBe(true)
  })
})

describe('the session: heads that cannot be used as they are', () => {
  it('a head that cannot draw ends the look before a unit goes to the service', () => {
    const m = machine({ here: true })
    m.feed({ i: 'original.opened', t: m.live('original'), pages: 4, bytes: 9 }, { i: 'panes.drawn' })
    m.feed({ i: 'paper', t: m.live('link'), doc: ready(1) })
    // (rows made here wait for the head: nothing is sent for a paper whose pages the layer may not draw)
    expect(m.has('rows')).toBe(false)
    m.feed({ i: 'code.loaded', t: m.live('code') }, { i: 'head', digest: CATALOG.sha256, head: headOf('o', false) })
    expect(m.s.layer).toMatchObject({ s: 'refused', why: 'cannot-prepare' })
    expect(m.has('rows') || m.has('link') || m.has('composed')).toBe(false)
    expect(holdOf(m.s)).toBe('paper')
    // a head that draws: the rows made here then
    const ok = composedNow({ here: true })
    expect([...resources(ok.s).values()]).toContainEqual(expect.objectContaining({ slot: 'rows', from: 'here' }))
  })
  it('a later head over another original than the left shows: our copy of it shown first, before the layer is used', () => {
    const m = composedNow()
    m.feed({ i: 'composed.opened', t: m.live('composed') })
    expect(m.s.bound).toBe(HEAD.original.sha256)
    const left = m.live('original')
    // a retry (a layer made again over a file arXiv replaced): its catalog, its head over another original
    const other = ref('c')
    m.feed({ i: 'paper', t: m.live('link'), doc: ready(2, other) })
    m.feed({ i: 'head', digest: other.sha256, head: headOf('n') })
    expect(m.s.original).toMatchObject({ s: 'opening', pin: true })
    expect(m.released).toContain(left)
    expect(m.has('composed')).toBe(false)
    m.feed({ i: 'original.opened', t: m.live('original'), pages: 4, bytes: 9 })
    expect(m.has('composed')).toBe(true)
  })
})

describe('the session: the rows', () => {
  const engagedReady = (o: { here?: boolean } = {}) => (o.here ? composedNow(o) : composedNow())
  it('arriving → complete', () => {
    const m = engagedReady()
    const r = m.live('rows')
    m.feed({ i: 'rows.end', t: r, stopped: { kind: 'unavailable' } })
    // (no count of its own: the reader counts the rows it holds over the layer shown, session/rows.ts viewOf)
    expect(m.s.rows).toEqual({ s: 'complete', target: 'zh-Hans', stopped: { kind: 'unavailable' } })
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
  it('a same-target retry is the rows again for the same target, nothing else let go', () => {
    const m = engagedReady({ here: true })
    m.feed({ i: 'rows.end', t: m.live('rows') })
    const keep = ['original', 'code', 'composed'].map(m.live)
    m.feed({ i: 'cmd.retry' })
    // (complete with gaps: the rows' handler holds its rows; a failed run is asked again at once)
    m.feed({ i: 'cmd.translator' })
    for (const t of keep) expect(resources(m.s).has(t)).toBe(true)
    const f = engagedReady({ here: true })
    f.feed({ i: 'rows.failed', t: f.live('rows'), why: { kind: 'unavailable' } })
    f.feed({ i: 'cmd.retry' })
    expect([...resources(f.s).values()]).toContainEqual(expect.objectContaining({ slot: 'rows', target: 'zh-Hans' }))
  })
  it('a language switch lets the old rows and the link go, keeps the original, the code and the composed document', () => {
    const m = engagedReady()
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
  it('rows made here: the link names no target, a switch asks our server nothing', () => {
    const m = machine({ here: true })
    expect([...resources(m.s).values()]).toContainEqual({ slot: 'link', target: null })
    const link = m.live('link')
    m.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(m.live('link')).toBe(link)
    const r = composedNow({ here: true })
    expect([...resources(r.s).values()]).toContainEqual(expect.objectContaining({ slot: 'rows', from: 'here' }))
    r.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(r.has('link') || r.has('open')).toBe(false)
  })
})

describe('the session: a composed translation to be shown', () => {
  it('where the display shows the translation and the reader sets the target, and not before (what is read ahead for it waits on this)', () => {
    const m = machine()
    expect(translationShown(m.s)).toBe(true)
    m.feed({ i: 'cmd.set', prefs: { display: 'original' } })
    expect(translationShown(m.s)).toBe(false)
    m.feed({ i: 'cmd.set', prefs: { display: 'translation' } })
    expect(translationShown(m.s)).toBe(true)
    // (a target the reader does not set: none, until a language it sets is chosen)
    const held = machine({ targets: ['ja'] })
    expect(translationShown(held.s)).toBe(false)
    held.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(translationShown(held.s)).toBe(true)
  })
})

describe("the session: the original held for the visit (today's holds)", () => {
  it('a target the reader does not set: the original shown, the rows failed `target`, nothing asked of our server', () => {
    const m = machine({ targets: ['ja', 'de'] })
    expect(m.s.rows).toMatchObject({ s: 'failed', why: { kind: 'target' } })
    expect(holdOf(m.s)).toBe('target')
    expect(displayOf(m.s)).toBe('original')
    expect(m.has('link') || m.has('open') || m.has('rows')).toBe(false)
    // (a translated display asked meanwhile: nothing, not written)
    m.feed({ i: 'cmd.set', prefs: { display: 'translation' } })
    expect(m.effects).toEqual([])
    expect(displayOf(m.s)).toBe('original')
    // (the address's or the settings' display is kept for when the hold lifts)
    expect(m.s.prefs.value.display).toBe('bilingual')
  })
  it('lifted by a language the reader sets, chosen here or landed from elsewhere: the translated display shown again', () => {
    const here = machine({ targets: ['ja'] })
    here.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(holdOf(here.s)).toBeNull()
    expect(displayOf(here.s)).toBe('bilingual')
    expect(here.has('link')).toBe(true)
    const landed = machine({ targets: ['ja'] })
    landed.feed({ i: 'prefs.landed', value: { ...PREFS, target: 'ja', display: 'translation' } })
    expect(displayOf(landed.s)).toBe('translation')
    expect(landed.s.rows).toMatchObject({ s: 'none', target: 'ja' })
    expect(landed.has('link')).toBe(true)
  })
  it("the paper's own hold (a lasting refusal) is not lifted by a language", () => {
    const m = machine({ targets: ['ja', 'zh-Hans'] })
    m.feed({
      i: 'paper',
      t: m.live('link'),
      doc: doc(1, { prepare: { state: 'failed', why: 'no-source', retryAt: null, stage: null, units: [] } }),
    })
    expect(holdOf(m.s)).toBe('paper')
    m.feed({ i: 'cmd.set', prefs: { target: 'ja' } })
    expect(holdOf(m.s)).toBe('paper')
    expect(displayOf(m.s)).toBe('original')
  })
  it("the host's hold for now (L11's second round, gaps 7 and 8): the original shown, nothing written, the run it engages going on; let go, or ended by the reader's own choice", () => {
    const m = machine()
    m.feed({ i: 'paper', t: m.live('link'), doc: preparing(1, UNITS) })
    m.feed({ i: 'cmd.hold', on: true })
    expect([displayOf(m.s), m.s.engaged, m.has('link'), m.has('rows'), m.effects]).toEqual([
      'original',
      true,
      true,
      true,
      [],
    ])
    expect(m.s.prefs.value.display).toBe('bilingual')
    m.feed({ i: 'cmd.hold', on: false })
    expect(displayOf(m.s)).toBe('bilingual')
    m.feed({ i: 'cmd.hold', on: true }, { i: 'cmd.set', prefs: { display: 'translation' } })
    expect([displayOf(m.s), m.s.held]).toEqual(['translation', false])
    // (a choice of something else keeps it)
    m.feed({ i: 'cmd.hold', on: true }, { i: 'cmd.set', prefs: { sync: false } })
    expect(displayOf(m.s)).toBe('original')
  })
})

describe('the session: the paper', () => {
  it('the title: the first one known stays, never put back', () => {
    const m = machine()
    m.feed({ i: 'paper.title', title: '' })
    expect(m.s.title).toBe('')
    m.feed({ i: 'paper.title', title: 'Attention Is All You Need' }, { i: 'paper.title', title: 'Another' })
    expect(m.s.title).toBe('Attention Is All You Need')
  })
  it("arXiv's HTML version asked once a visit, once the bilingual version cannot be had (now, for the paper, or the language)", () => {
    const m = machine()
    expect(m.has('html')).toBe(false)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 1000 })
    const t = m.live('html')
    m.feed({ i: 'html.answered', t, url: 'https://arxiv.org/html/2600.00001v1#readarxiv' })
    expect(m.s.html).toEqual({ s: 'known', url: 'https://arxiv.org/html/2600.00001v1#readarxiv', said: null })
    m.feed({ i: 'time', t: (m.s.link as { timer: Ticket }).timer, now: 1000 })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'network' })
    expect(m.has('html')).toBe(false)
    const lang = machine({ targets: ['ja'] })
    expect(lang.has('html')).toBe(true)
    const none = machine()
    none.feed({ i: 'follow.lost', t: none.live('link'), why: 'not-found' })
    none.feed({ i: 'html.answered', t: none.live('html'), url: null })
    expect(none.s.html).toEqual({ s: 'known', url: null, said: null })
  })
  it("arXiv's HTML version taken again where our server's word on it changes: a refusal for now, then a lasting one saying it has one (L11 third round, gap 7)", () => {
    const said = (rev: number, state: 'none' | 'failed', html?: boolean) =>
      doc(rev, {
        prepare: {
          state,
          why: state === 'failed' ? 'cannot' : null,
          retryAt: null,
          stage: null,
          units: [],
          ...(html === undefined ? {} : { html }),
        },
      })
    /** a 429 that names its wait, with the document our server answered beside it, then followed again at its time */
    const refused = (m: ReturnType<typeof machine>, d: Doc, at: number) => {
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 1000, doc: d })
      return () => m.feed({ i: 'time', t: (m.s.link as { timer: Ticket }).timer, now: at })
    }
    const m = machine()
    // (a 429: our server says nothing of arXiv's HTML version, which the reader's own ask answers, none here)
    const again = refused(m, said(1, 'none'), 1000)
    const t1 = m.live('html')
    m.feed({ i: 'html.answered', t: t1, url: null })
    expect(m.s.html).toMatchObject({ s: 'known', url: null })
    // (another 429, the same word in a newer document: nothing asked)
    again()
    refused(m, said(2, 'none'), 2000)()
    expect(m.has('html')).toBe(false)
    // (the prepare cannot be made, and our server says arXiv has the version: asked again, the answer the new word's)
    m.feed({ i: 'paper', t: m.live('link'), doc: said(3, 'failed', true) })
    const t2 = m.live('html')
    expect(t2).not.toBe(t1)
    m.feed({ i: 'html.answered', t: t2, url: 'https://arxiv.org/html/2600.00001v1#readarxiv' })
    expect(m.s.html).toMatchObject({ s: 'known', url: 'https://arxiv.org/html/2600.00001v1#readarxiv' })
    // (a word changed again: the answer it had kept while the new one is asked)
    const k = machine()
    refused(k, said(1, 'none', true), 1000)()
    k.feed({ i: 'html.answered', t: k.live('html'), url: 'https://arxiv.org/html/2600.00001v1#readarxiv' })
    refused(k, said(2, 'none', false), 2000)
    expect(k.s.html).toMatchObject({ s: 'asking', url: 'https://arxiv.org/html/2600.00001v1#readarxiv' })
    k.feed({ i: 'html.answered', t: k.live('html'), url: null })
    expect(k.s.html).toMatchObject({ s: 'known', url: null })
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
    const m = composedNow()
    const link = m.live('link')
    const t = {
      original: m.live('original'),
      code: m.live('code'),
      rows: m.live('rows'),
      link,
      composed: m.live('composed'),
    }
    // a newer catalog: the older one's composed document let go, the newer one's made over its head; the older one's result
    // (its document and its layout, come late) dropped while the newer one is live, which it never opens
    m.feed({ i: 'paper', t: link, doc: ready(2, ref('c')) }, { i: 'head', digest: ref('c').sha256, head: HEAD })
    const newer = m.live('composed')
    expect(newer).not.toBe(t.composed)
    const live: State = m.s
    const dropped = m.dropped
    m.feed({ i: 'composed.opened', t: t.composed }, { i: 'composed.failed', t: t.composed })
    expect(m.dropped - dropped).toBe(2)
    expect(m.s).toBe(live)
    expect(m.s.layer).toMatchObject({ s: 'ready', composed: newer, open: false })
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
      { i: 'rows.end', t: t.rows },
      { i: 'rows.failed', t: t.rows, why: { kind: 'server' } },
      { i: 'code.failed', t: 'code#999' },
      { i: 'composed.opened', t: 'composed#999' },
      { i: 'composed.failed', t: 'composed#999' },
      { i: 'composed.opened', t: t.composed },
      { i: 'composed.opened', t: newer },
      { i: 'composed.failed', t: newer },
      { i: 'open.answered', t: 'open#999', doc: null },
      { i: 'open.failed', t: 'open#999', why: 'x' },
      { i: 'html.answered', t: 'html#999', url: null },
      { i: 'time', t: 'timer#999', now: 1 },
    ]
    const before = m.dropped
    m.feed(...stale)
    expect(m.dropped - before).toBe(stale.length)
    expect(m.s).toBe(held)
    void t.code
  })
  it('releases every resource on close', () => {
    const m = composedNow()
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
      ['original', 'link', 'open', 'code', 'composed', 'rows', 'html', 'timer'].map((s) => [s, handler()]),
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
  it('applies every input at the time it comes: a wait is minted from it', () => {
    const r = recording()
    let now = 50_000
    const rt = createRuntime({ state: start(), handlers: r.handlers, effect() {}, crash() {}, now: () => now })
    const link = [...rt.live].find(([, s]) => s === 'link')?.[0] as Ticket
    now = 90_000
    r.emits.get(link)?.({ i: 'follow.lost', t: link, why: 'limit', afterMs: 2000 })
    expect(rt.state.link).toMatchObject({ s: 'stopped', retryAt: 92_000 })
  })
  it('drops a result of a resource let go, releases dependents first, and everything on dispose', async () => {
    const r = recording()
    const rt = createRuntime({
      state: start(),
      handlers: r.handlers,
      effect() {},
      crash() {},
      check: true,
      now: () => 0,
    })
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
  it("acquires a replacement once the outgoing resource of its slot has been released, never while its release is under way (a PDF.js role's worker goes only after its document's destroy)", async () => {
    // the original's and the composed document's releases are slow, as a PDF.js document's destroy() is: each held until let go
    const log: string[] = []
    const emits = new Map<Ticket, (x: Input) => void>()
    const slow = new Map<Ticket, () => void>()
    const handler = (slot: string) => (_spec: unknown, t: Ticket, emit: (x: Input) => void, signal: AbortSignal) => {
      log.push(`+${t}`)
      emits.set(t, emit)
      signal.addEventListener('abort', () => log.push(`-${t}`))
      if (slot !== 'original' && slot !== 'composed') return () => {}
      return () =>
        new Promise<void>((done) =>
          slow.set(t, () => {
            log.push(`released ${t}`)
            done()
          }),
        )
    }
    const handlers = Object.fromEntries(
      ['original', 'link', 'open', 'code', 'composed', 'rows', 'html', 'timer'].map((s) => [s, handler(s)]),
    ) as unknown as Handlers
    const rt = createRuntime({ state: start(), handlers, effect() {}, crash() {}, check: true, now: () => 0 })
    const get = (slot: string) => [...rt.live].find(([, s]) => s === slot)?.[0] as Ticket
    const original = get('original'),
      link = get('link')
    emits.get(original)?.({ i: 'original.opened', t: original, pages: 4, bytes: 9 })
    rt.input({ i: 'panes.drawn' })
    emits.get(link)?.({ i: 'paper', t: link, doc: ready(1) })
    const code = get('code')
    emits.get(code)?.({ i: 'code.loaded', t: code })
    rt.input({ i: 'head', digest: CATALOG.sha256, head: HEAD })
    const composed = get('composed')
    // a newer catalog: its composed document's ticket live at once (I1), its acquisition held until the outgoing one is released
    emits.get(link)?.({ i: 'paper', t: link, doc: ready(2, ref('c')) })
    rt.input({ i: 'head', digest: ref('c').sha256, head: HEAD })
    const newer = get('composed')
    expect(newer).not.toBe(composed)
    expect(log).toContain(`-${composed}`)
    await Promise.resolve()
    expect(log).not.toContain(`+${newer}`)
    slow.get(composed)?.()
    await vi.waitFor(() => expect(log).toContain(`+${newer}`))
    expect(log.indexOf(`released ${composed}`)).toBeLessThan(log.indexOf(`+${newer}`))
    // the original's the same: a mismatch opens our copy once the tab's document is released (the composed document let go
    // first, a dependent)
    rt.input({ i: 'original.mismatch', t: original })
    const ours = get('original')
    expect(ours).not.toBe(original)
    await Promise.resolve()
    expect(log).not.toContain(`+${ours}`)
    slow.get(original)?.()
    await vi.waitFor(() => expect(log).toContain(`+${ours}`))
    expect(log.indexOf(`released ${original}`)).toBeLessThan(log.indexOf(`+${ours}`))
    // (the newer composed document released by the mismatch, then a close while nothing waits: everything drained)
    slow.get(newer)?.()
    const closing = rt.dispose()
    slow.get(ours)?.()
    await closing
    expect(rt.live.size).toBe(0)
  })
  it('a replacement let go while it waits is never acquired, and the next still waits for the outgoing release', async () => {
    const log: string[] = []
    const emits = new Map<Ticket, (x: Input) => void>()
    const slow = new Map<Ticket, () => void>()
    const handler = (slot: string) => (_spec: unknown, t: Ticket, emit: (x: Input) => void, signal: AbortSignal) => {
      log.push(`+${t}`)
      emits.set(t, emit)
      signal.addEventListener('abort', () => log.push(`-${t}`))
      if (slot !== 'original') return () => {}
      return () =>
        new Promise<void>((done) =>
          slow.set(t, () => {
            log.push(`released ${t}`)
            done()
          }),
        )
    }
    const handlers = Object.fromEntries(
      ['original', 'link', 'open', 'code', 'composed', 'rows', 'html', 'timer'].map((s) => [s, handler(s)]),
    ) as unknown as Handlers
    const rt = createRuntime({ state: start(), handlers, effect() {}, crash() {}, check: true, now: () => 0 })
    const get = (slot: string) => [...rt.live].find(([, s]) => s === slot)?.[0] as Ticket
    const first = get('original')
    rt.input({ i: 'original.mismatch', t: first })
    const waiting = get('original')
    // the replacement fails before it was acquired (its ticket live, its input taken), and a retry mints another
    rt.input({ i: 'original.failed', t: waiting, why: 'unreadable' })
    rt.input({ i: 'cmd.retry' })
    const third = get('original')
    expect(third).not.toBe(waiting)
    await Promise.resolve()
    expect(log).not.toContain(`+${waiting}`)
    expect(log).not.toContain(`+${third}`)
    slow.get(first)?.()
    await vi.waitFor(() => expect(log).toContain(`+${third}`))
    expect(log).not.toContain(`+${waiting}`)
    expect(slow.has(waiting)).toBe(false)
    const closing = rt.dispose()
    slow.get(third)?.()
    await closing
    expect(rt.live.size).toBe(0)
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

describe('the session put away and back (the back-forward cache: L11 third round, item 8)', () => {
  it("away: our server not followed nor asked, no timer live; back: the document followed anew, a timer due meanwhile told at once, the original's kept", () => {
    const m = machine()
    const link1 = m.live('link')
    // (a 429 that names its wait: the link stopped, its timer live)
    m.feed({ i: 'follow.lost', t: link1, why: 'limit', afterMs: 1000 })
    const timer = (m.s.link as { timer: Ticket }).timer
    expect(m.has('timer')).toBe(true)
    const original = m.live('original')
    m.feed({ i: 'env.away', on: true })
    expect(m.has('link')).toBe(false)
    expect([...resources(m.s).values()].filter((x) => x.slot === 'timer')).toEqual([])
    expect(m.released).toContain(timer)
    // (the original's reading kept: its panes stay as they are)
    expect(m.live('original')).toBe(original)
    // (a timer's time, come while away, is no live ticket's: dropped)
    const dropped = m.dropped
    m.feed({ i: 'time', t: timer, now: 5000 })
    expect([m.dropped - dropped, m.s.link.s]).toEqual([1, 'stopped'])
    m.feed({ i: 'env.away', on: false })
    // (back: the wait's timer live again, its time past: told, the link followed anew under a ticket of its own)
    expect(m.timerAt(1000)).toBe(timer)
    m.feed({ i: 'time', t: timer, now: 5000 })
    const link2 = m.live('link')
    expect(link2).not.toBe(link1)
    m.feed({ i: 'paper', t: link2, doc: preparing(2) })
    expect(m.s.layer.s).toBe('preparing')
  })
  it('a link heard while away is let go and followed again on return; an open under way asked again', () => {
    const m = machine()
    const link1 = m.live('link')
    m.feed({ i: 'env.away', on: true })
    expect(m.released).toContain(link1)
    // (the follow's late word, its ticket let go: dropped)
    const dropped = m.dropped
    m.feed({ i: 'paper', t: link1, doc: ready(1) })
    expect(m.dropped - dropped).toBe(1)
    m.feed({ i: 'env.away', on: false })
    expect(m.live('link')).not.toBe(link1)
    // (the open asked as the follow says the paper is not opened, then put away under way: asked again on return)
    const o = machine()
    o.feed({ i: 'follow.lost', t: o.live('link'), why: 'not-opened' })
    const open1 = o.live('open')
    o.feed({ i: 'env.away', on: true })
    expect([o.has('open'), o.released.includes(open1)]).toEqual([false, true])
    o.feed({ i: 'env.away', on: false })
    expect(o.live('open')).not.toBe(open1)
  })
  it('through the runtime, with fake timers and a fake fetch: nothing asked while away, however long; heard again once back', async () => {
    vi.useFakeTimers()
    try {
      const asks: string[] = []
      /** our server's follow: each acquisition one ask of the fake fetch, its document told; a stream held open until let go */
      const fetch = (url: string, signal: AbortSignal) => {
        asks.push(url)
        return new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      }
      const none = () => () => undefined
      const handlers = {
        original: none(),
        code: none(),
        composed: none(),
        rows: none(),
        html: none(),
        open: none(),
        link: (_s: unknown, t: Ticket, emit: (x: Input) => void, signal: AbortSignal) => {
          void fetch(`/api/v2/papers/2600.00001v1?follow ${t}`, signal)
          // (our server answers a 429 that names a wait of 2 s, then nothing until it is asked again)
          setTimeout(() => {
            if (!signal.aborted) emit({ i: 'follow.lost', t, why: 'limit', afterMs: 2000 })
          }, 10)
          return undefined
        },
        timer: (s: { at: number }, t: Ticket, emit: (x: Input) => void) => {
          const id = setTimeout(() => emit({ i: 'time', t, now: Date.now() }), Math.max(0, s.at - Date.now()))
          return () => clearTimeout(id)
        },
      } as unknown as Handlers
      const rt = createRuntime({
        state: init({
          paper: { id: '2600.00001', version: 1 },
          here: false,
          defaults: PREFS,
          now: Date.now(),
          visible: true,
          online: true,
        }),
        handlers,
        effect() {},
        crash(e) {
          throw e
        },
        now: () => Date.now(),
      })
      await vi.advanceTimersByTimeAsync(20)
      expect([asks.length, rt.state.link.s]).toEqual([1, 'stopped'])
      rt.input({ i: 'env.away', on: true })
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(asks.length).toBe(1)
      expect([...rt.live.values()].filter((x) => x === 'timer' || x === 'link')).toEqual([])
      rt.input({ i: 'env.away', on: false })
      // (the 429's wait was over while away: asked again at once)
      await vi.advanceTimersByTimeAsync(5)
      expect(asks.length).toBe(2)
      expect(rt.state.link.s).toBe('on')
      await rt.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
