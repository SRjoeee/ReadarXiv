// The session as a reducer (stage 2's exit: every transition of design-b's table; a stale result of every kind dropped by its
// ticket; every resource released on close; a second reader on the same page), through `step` and `resources` alone, then
// through the runtime with recording handlers. Stage 5a's part B adds today's pacing of our server (PDF-READER §11.10, UI.md
// S-R-24, S-R-26), the holds of the original, the paper's title and HTML version, and the heads that cannot be used.
import type { Head } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../src/prefs.ts'
import {
  type Doc,
  displayOf,
  holdOf,
  init,
  type Input,
  PREPARE_DEADLINE_MS,
  type Prefs,
  REFUSED_ASKS,
  type Ref,
  resources,
  type State,
  step,
  type Ticket,
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
const ready = (rev: number, catalog = CATALOG) =>
  doc(rev, {
    prepare: { state: 'done', why: null, retryAt: null, stage: null, units: UNITS },
    layer: { catalog, units: UNITS, format: 1 },
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
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'limit', retryAt: null })
    expect((m.s.link as { timer: Ticket | null }).timer).toBeNull()
    // a retry at the limit asks at once, for three more
    m.feed({ i: 'cmd.retry' })
    expect(m.has('link')).toBe(true)
    expect(m.s.refusals).toBe(0)
    for (let n = 1; n <= REFUSED_ASKS; n++) {
      m.feed({ i: 'follow.lost', t: m.live('link'), why: 'busy', afterMs: 1000 })
      m.feed({ i: 'time', t: (m.s.link as { timer: Ticket }).timer, now: m.s.now + 1000 })
    }
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'busy', afterMs: 1000 })
    expect(m.s.link).toMatchObject({ s: 'stopped', retryAt: null })
  })
  it("a 429's wait is at least a second and at most ten minutes; one with no time named waits a second", () => {
    const m = machine()
    m.at(5).feed({ i: 'follow.lost', t: m.live('link'), why: 'limit', afterMs: 86_400_000 })
    expect(m.s.link).toMatchObject({ retryAt: 5 + WAIT_MAX_MS })
    m.feed({ i: 'time', t: m.timerAt(5 + WAIT_MAX_MS), now: 5 + WAIT_MAX_MS })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'busy', afterMs: null })
    expect(m.s.link).toMatchObject({ retryAt: 5 + WAIT_MAX_MS + 1000 })
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
  it('an open refused for capacity is given back and asked again after its wait; its 429s count with the follow’s', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.answered', t: m.live('open'), doc: null, refused: { why: 'busy', afterMs: 30_000 } })
    expect(m.s.layer).toEqual({ s: 'none', asked: null })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'busy', retryAt: 30_000 })
    expect(m.s.refusals).toBe(1)
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
  it('our server out of reach (an ask failed twice, the client’s): the look stopped, said, and asked again by a retry alone', () => {
    const m = machine()
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'network' })
    expect(m.s.link).toEqual({ s: 'stopped', why: 'unreachable', retryAt: null, timer: null })
    expect(m.has('link')).toBe(false)
    m.feed({ i: 'env.online', on: true })
    expect(m.has('link')).toBe(false)
    m.feed({ i: 'cmd.retry' })
    expect(m.has('link')).toBe(true)
    // (an open that never reached our server: given back, so that a retry asks it again)
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    m.feed({ i: 'open.failed', t: m.live('open'), why: 'network' })
    expect(m.s.layer).toEqual({ s: 'none', asked: null })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'unreachable' })
    m.feed({ i: 'cmd.retry' })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'not-opened' })
    expect(m.has('open')).toBe(true)
  })
  it('offline with no layer is out of reach at once, as every ask would fail', () => {
    const m = machine({ online: false })
    expect(m.s.link).toMatchObject({ s: 'stopped', why: 'unreachable' })
    const later = machine()
    later.feed({ i: 'env.online', on: false })
    expect(later.s.link).toMatchObject({ s: 'stopped', why: 'unreachable' })
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
  it('rows made here need nothing more of our server once the layer is ready', () => {
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
    m.feed(
      { i: 'rows.batch', t: r, got: 10, total: 80, lost: 0 },
      { i: 'rows.end', t: r, got: 80, total: 80, lost: 1, stopped: { kind: 'unavailable' } },
    )
    expect(m.s.rows).toEqual({
      s: 'complete',
      target: 'zh-Hans',
      got: 80,
      total: 80,
      lost: 1,
      stopped: { kind: 'unavailable' },
    })
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
    m.feed({ i: 'rows.end', t: m.live('rows'), got: 5, total: 8, lost: 3 })
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
    expect(m.s.html).toEqual({ s: 'known', url: 'https://arxiv.org/html/2600.00001v1#readarxiv' })
    m.feed({ i: 'time', t: (m.s.link as { timer: Ticket }).timer, now: 1000 })
    m.feed({ i: 'follow.lost', t: m.live('link'), why: 'network' })
    expect(m.has('html')).toBe(false)
    const lang = machine({ targets: ['ja'] })
    expect(lang.has('html')).toBe(true)
    const none = machine()
    none.feed({ i: 'follow.lost', t: none.live('link'), why: 'not-found' })
    none.feed({ i: 'html.answered', t: none.live('html'), url: null })
    expect(none.s.html).toEqual({ s: 'known', url: null })
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
