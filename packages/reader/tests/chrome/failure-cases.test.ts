// A run of our server's that fails, over a whole visit (PDF-READER §8 "Some paragraphs failed", §6.6): the session's machine
// stepped through our server's documents, the rows read as reader.ts reads them, the reader's state told to the chrome
// (eventsOf), folded (reduce) and drawn (capsuleOf, cardOf) by the website's rules. Three ways a run ends failed: some units
// not answered past their window's retries (the chain's `unavailable`: the attempt ends `translation-down`, its rows those
// of the windows done), the attempt ended by our server's machine after rows were told (its status unknown: `unavailable`,
// no rows of its end), and the same before any page is laid.
import type { Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { textOf } from '../../src/chrome/capsule-words.ts'
import { eventsOf } from '../../src/chrome/events.ts'
import { INITIAL, reduce, type ReaderState as ChromeState } from '../../src/chrome/model.ts'
import type { StateWords } from '../../src/chrome/parts.tsx'
import {
  type Capsule,
  type Card,
  capsuleOf,
  cardOf,
  heldOf,
  refusedNow,
  retryOffered,
} from '../../src/chrome/status.ts'
import { DEFAULTS, type Prefs } from '../../src/prefs.ts'
import type { ReaderState } from '../../src/reader.ts'
import {
  againOf,
  linkSaid,
  type Doc,
  displayOf,
  type Input,
  init,
  REFUSED_ASKS,
  type Ref,
  resources,
  type State,
  step,
} from '../../src/session/machine.ts'
import { runOf, viewOf } from '../../src/session/rows.ts'
import { LANGUAGES } from './parts.ts'

const ZH = 'zh-Hans'
const PREFS: Prefs = { ...DEFAULTS, display: 'bilingual', target: ZH }
/** the website's words for the states these cases reach (its v2 words.ts), the time as given */
const WORDS: StateWords = {
  translating: (got, total) => (total > 0 ? `translating ${got}/${total}` : 'translating'),
  notNow: (at) => (at === null ? 'unavailable' : `unavailable until ${at}`),
  limited: (at) => (at === null ? 'limit' : `limit until ${at}`),
  rate: 'too many asks',
  network: 'network down',
  failed: (kind) => `failed: ${kind}`,
}

let digests = 0
const ref = (bytes = 10): Ref => {
  const sha256 = (++digests).toString(16).padStart(64, '0')
  return { path: `p/2610_00002v1/x/${sha256}`, sha256, bytes }
}
interface Store {
  units: Map<string, { id: string; kind: string; kept?: boolean }[]>
  rows: Map<string, Row[]>
}
const ids = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => `u${a + i}`)
/** a units object: paragraphs, then the units of `other` (a kind the toggles hide by default, a unit the paper keeps) */
const unitsObject = (store: Store, of: string[], other: { id: string; kind: string; kept?: boolean }[] = []): Ref => {
  const r = ref()
  store.units.set(r.sha256, [...of.map((id) => ({ id, kind: 'para' })), ...other])
  return r
}
/** a rows object: a translation for each unit named, and a row that is none (the chain's word) for each `none` names */
const rowsObject = (store: Store, ok: string[], none: string[] = []): Ref => {
  const r = ref()
  store.rows.set(r.sha256, [
    ...ok.map((id) => ({ id, ok: true, content: [{ t: 'text', s: id }], by: 'x' }) as Row),
    ...none.map((id) => ({ id, ok: false, why: { kind: 'unavailable' } }) as Row),
  ])
  return r
}
const HEAD = {
  format: 1,
  paper: { id: '2610.00002', version: 1, pages: 4 },
  original: { bytes: 9, sha256: 'o'.repeat(64), chunk: 65536, chunks: '' },
  addOn: { digest: 'd'.repeat(64), bytes: 10 },
}
type Target = NonNullable<Doc['targets'][string]>
const target = (state: Target['state'], o: Partial<Target> = {}): Target => ({
  state,
  why: null,
  retryAt: null,
  rows: [],
  done: 0,
  total: 0,
  attempt: 1,
  ...o,
})
const doc = (rev: number, layer: Doc['layer'], t: Target): Doc => ({
  epoch: 'e1',
  rev,
  prepare: { state: 'done', why: null, retryAt: null, stage: null, units: [], attempt: 1 },
  layer,
  targets: { [ZH]: t },
})

type Refusal = { why: 'quota' | 'busy' | 'rate'; afterMs: number | null; at?: number | null }
type Beat =
  | { at: number; doc: Doc }
  | { at: number; opened: true }
  | { at: number; laid: number }
  | { at: number; retry: true }
  | { at: number; set: Partial<Prefs> }
  /** the follow's end as the client tells it (a paper not opened, a 429, the network) */
  | { at: number; lost: string; afterMs?: number }
  /** the session's timers due by `at` fired, in their order */
  | { at: number; timers: true }
  /** the browser's word on the network */
  | { at: number; online: boolean }
  /** the open under way answered with this document (the visit's `hold`: opens are answered by these beats alone) */
  | { at: number; answer: Doc }

/** a visit: every resource the machine asks answered at once, our server's rows read as reader.ts reads them (every ref the
 *  document names for the target, each once a ticket; at the run's end read whole, its end told), drawn at the end; the opens
 *  answered by `refusals` in turn (none left: the document held), each drawn capsule kept with its time (`seen`) */
/** `hold`: an open the refusals do not answer is answered by an `answer` beat alone */
function visit(store: Store, beats: Beat[], refusals: Refusal[] = [], hold = false) {
  let s: State = init({
    paper: { id: '2610.00002', version: 1 },
    here: false,
    defaults: PREFS,
    now: 0,
    visible: true,
    online: true,
  })
  let now = 0
  const rows = new Map<string, Row>()
  let reading: { t: string; read: Set<string> } | null = null
  let headRead = ''
  const queue: Input[] = []
  let chrome: ChromeState = INITIAL
  let told: ReaderState | null = null
  const live = (slot: string) => [...resources(s)].find(([, spec]) => spec.slot === slot)?.[0] ?? null
  const answers = [...refusals]
  const seen: { at: number; capsule: Capsule | null; card: Card | null; chrome?: ChromeState }[] = []
  const toldOf = (): ReaderState => {
    const r = s.rows
    const run = runOf(s)
    const view = viewOf({
      units:
        s.layer.s === 'ready' && headRead === s.layer.catalog.sha256
          ? s.layer.units.flatMap((x) => store.units.get(x.sha256) ?? [])
          : null,
      classes: s.prefs.value.classes,
      held: rows,
      shown: s.layer.s === 'ready',
      laid: s.panes.laid > 0,
      run: run.run,
      failed: run.failed,
    })
    const count = { got: view.got, total: view.total, lost: view.lost }
    const base = { target: r.target, from: 'server' as const }
    const again = againOf(s)
    const l = s.link
    return {
      paper: { id: '2610.00002', version: 1, title: '', html: null, pdf: '' },
      prefs: s.prefs.value,
      settings: { s: s.prefs.s, refused: s.prefs.refused },
      original: s.original.s === 'open' ? { s: 'open', pages: 4, ours: false } : { s: 'opening', loaded: 0, total: 0 },
      layer:
        s.layer.s === 'ready'
          ? { s: 'ready', laid: s.panes.laid, total: 4, asOriginal: 0 }
          : s.layer.s === 'refused'
            ? { s: 'refused', why: s.layer.why, retryAt: s.layer.retryAt, ...(again.layer ? { self: true } : {}) }
            : l.s === 'stopped'
              ? { s: 'refused', why: l.why, retryAt: l.retryAt, ...(again.layer ? { self: true } : {}) }
              : { s: 'none' },
      rows:
        r.s === 'none'
          ? { ...base, s: 'none' }
          : r.s === 'arriving' || run.asking
            ? { ...base, s: 'arriving', ...count, waits: view.waits }
            : r.s === 'complete'
              ? { ...base, s: 'complete', ...count, stopped: r.stopped }
              : {
                  ...base,
                  s: 'failed',
                  why: r.why,
                  ...count,
                  retryAt: r.retryAt,
                  ...(again.rows !== null ? { self: true } : {}),
                },
      view: {
        display: displayOf(s),
        sync: { on: true, available: true },
        scale: 1,
        zoom: 'page-width',
        narrow: false,
        sides: { left: { page: 1, pages: 4 }, right: { page: 1, pages: 4 } },
        outline: [],
        heading: null,
      },
      ...linkSaid(s, (r.s === 'arriving' || run.asking) && view.waits),
      faces: null,
      crashed: false,
    } as ReaderState
  }
  /** the capsule as the website's rules draw it at `at` (the last beat's time by default) */
  const capsuleAt = (at = now, closed = 0): Capsule | null =>
    capsuleOf(chrome, { noticeClosed: closed, narrowShown: false, refusalsSeen: 0 }, LANGUAGES, WORDS, {
      retry: 'when-due',
      now: at,
    })
  const draw = () => {
    const next = toldOf()
    for (const e of eventsOf(told, next)) chrome = reduce(chrome, e)
    told = next
    seen.push({ at: now, capsule: capsuleAt(), card: cardOf(chrome, () => 'reason', WORDS), chrome })
  }
  const react = () => {
    if (s.layer.s === 'ready' && s.layer.code && !s.layer.loaded) queue.push({ i: 'code.loaded', t: s.layer.code })
    if (s.layer.s === 'ready' && s.layer.code && !s.layer.head && headRead !== s.layer.catalog.sha256) {
      headRead = s.layer.catalog.sha256
      queue.push({ i: 'head', digest: s.layer.catalog.sha256, head: HEAD as never })
    }
    const composed = live('composed')
    if (composed && s.layer.s === 'ready' && !s.layer.open) queue.push({ i: 'composed.opened', t: composed })
    const open = live('open')
    if (open && answers.length) queue.push({ i: 'open.answered', t: open, doc: s.doc, refused: answers.shift() })
    else if (open && s.doc && !hold) queue.push({ i: 'open.answered', t: open, doc: s.doc })
    const t = live('rows')
    if (s.rows.s === 'arriving' && t) {
      if (reading?.t !== t) reading = { t, read: new Set() }
      const tg = s.doc?.targets[s.rows.target]
      for (const r of tg?.rows ?? []) {
        if (reading.read.has(r.sha256)) continue
        reading.read.add(r.sha256)
        for (const row of store.rows.get(r.sha256) ?? []) rows.set(row.id, row)
      }
      if (tg && (tg.state === 'done' || tg.state === 'failed') && tg.rows.every((r) => reading?.read.has(r.sha256)))
        queue.push(
          tg.state === 'failed'
            ? { i: 'rows.failed', t, why: { kind: 'server', retryAt: tg.retryAt } }
            : { i: 'rows.end', t },
        )
    }
  }
  const feed = (x: Input) => {
    queue.push(x)
    let guard = 0
    while (queue.length) {
      if (++guard > 10_000) throw new Error('the visit does not settle')
      const y = queue.shift() as Input
      const tk = 't' in y ? (y as { t: string }).t : null
      if (tk !== null && !resources(s).has(tk)) continue
      s = step(s, y, now).state
      react()
      draw()
    }
  }
  // (the preferences land at once: a settings page's own word is no part of these cases)
  feed({ i: 'prefs.read', value: PREFS })
  for (const b of beats) {
    now = b.at
    if ('opened' in b) {
      const t = live('original')
      if (t) feed({ i: 'original.opened', t, pages: 4, bytes: 9 })
      feed({ i: 'panes.drawn' })
    } else if ('doc' in b) {
      const link = live('link')
      if (link) feed({ i: 'paper', t: link, doc: b.doc })
    } else if ('laid' in b) feed({ i: 'panes.laid', laid: b.laid, total: 4 })
    else if ('set' in b) feed({ i: 'cmd.set', prefs: b.set })
    else if ('lost' in b) {
      const link = live('link')
      if (link)
        feed({ i: 'follow.lost', t: link, why: b.lost, ...(b.afterMs !== undefined ? { afterMs: b.afterMs } : {}) })
    } else if ('timers' in b) {
      for (;;) {
        const due = [...resources(s)]
          .filter(([, spec]) => spec.slot === 'timer' && spec.at <= b.at)
          .sort((x, y) => (x[1] as { at: number }).at - (y[1] as { at: number }).at)[0]
        if (!due) break
        now = (due[1] as { at: number }).at
        feed({ i: 'time', t: due[0], now })
      }
      now = b.at
    } else if ('online' in b) feed({ i: 'env.online', on: b.online })
    else if ('answer' in b) {
      const open = live('open')
      if (open) feed({ i: 'open.answered', t: open, doc: b.answer })
    } else feed({ i: 'cmd.retry' })
    seen.push({ at: now, capsule: capsuleAt(), card: cardOf(chrome, () => 'reason', WORDS) })
  }
  const card: Card | null = cardOf(chrome, () => 'reason', WORDS)
  return { capsule: capsuleAt(), capsuleAt, card, chrome, s, opens: () => live('open'), seen }
}

const words = (c: Capsule | null) => (c && 'words' in c ? textOf(c.words) : null)

/** ten paragraphs on one layer, with two references (hidden by the toggles' defaults) and a unit the paper keeps; the run's
 *  first window of five paragraphs translated and told, then the run ends (failed by default, at 9 s, our server's time for
 *  the next 39 s: its rows then as `end` names them), the first page laid at `laidAt` where given, then `more` */
function run(o: {
  end: (store: Store) => Ref[]
  why?: string
  state?: 'failed' | 'done'
  laidAt?: number
  more?: (layer: Doc['layer'], units: Ref, store: Store) => Beat[]
}) {
  const store: Store = { units: new Map(), rows: new Map() }
  const units = unitsObject(store, ids(0, 10), [
    { id: 'r1', kind: 'reference' },
    { id: 'r2', kind: 'reference' },
    { id: 'k1', kind: 'para', kept: true },
  ])
  const layer = { catalog: ref(), units: [units], format: 1, stale: false }
  const w1 = rowsObject(store, ids(0, 5))
  const state = o.state ?? 'failed'
  const beats: Beat[] = [
    { at: 100, opened: true },
    { at: 1000, doc: doc(1, layer, target('running', { units: [units], total: 10 })) },
    { at: 3000, doc: doc(2, layer, target('running', { units: [units], rows: [w1], done: 5, total: 10 })) },
    ...(o.laidAt ? [{ at: o.laidAt, laid: 1 }] : []),
    {
      at: 9000,
      doc: doc(
        3,
        layer,
        target(state, {
          ...(state === 'failed' ? { why: o.why ?? 'translation-down', retryAt: 39_000 } : {}),
          units: [units],
          rows: o.end(store),
        }),
      ),
    },
    ...(o.more?.(layer, units, store) ?? []),
  ]
  return visit(store, beats)
}

describe('a run of our server that ends failed (PDF-READER §8)', () => {
  // (our server's compact: the windows done, in one rows object, as worker v2 translate.ts writes it)
  const windowsDone = (store: Store) => [rowsObject(store, ids(0, 5))]
  it("(a) some units not answered past their retries (the chain's unavailable; the attempt translation-down): told, its retry at our server's time", () => {
    const v = run({ laidAt: 4000, end: windowsDone })
    expect(v.chrome.phase).toBe('ready')
    expect(v.card).toBeNull()
    expect(v.chrome.failureAt).toBe(39_000)
    // (no retry offered, at our server's time either: the session asks again by itself then, PDF-READER §8.1)
    expect(v.capsule).toMatchObject({ kind: 'notice', action: null })
    expect(words(v.capsule)).toBe('5 passages failed')
    expect(v.capsuleAt(39_000)).toMatchObject({ kind: 'notice', action: null })
    // (the session's own next ask is its open's, at that time; the rows wait for nothing of their own)
    expect([...resources(v.s).values()]).toContainEqual({ slot: 'timer', at: 39_000 })
    expect([...resources(v.s).values()].filter((x) => x.slot === 'timer' && x.at === 39_000)).toHaveLength(1)
  })
  it('(b) the attempt ended by our machine after rows were told and a page laid (no rows of its end): told', () => {
    const v = run({ why: 'unavailable', laidAt: 4000, end: () => [] })
    expect(v.chrome.phase).toBe('ready')
    expect(v.card).toBeNull()
    expect(words(v.capsule)).toBe('5 passages failed')
  })
  it("(c) the same before any page is laid: the card and its line at our server's time (no retry: the session asks again by itself then)", () => {
    const v = run({ end: windowsDone })
    expect(v.chrome.phase).toBe('failed')
    expect(v.card?.reason).toBe('failed: network')
    expect(v.chrome.failureAt).toBe(39_000)
    expect(v.capsule).toBeNull()
  })
  it('a run that ends done never tells failed passages, whatever rows are missing for kept or toggled-off units', () => {
    const v = run({ state: 'done', laidAt: 4000, end: (store) => [rowsObject(store, ids(0, 10))] })
    expect(v.chrome).toMatchObject({ phase: 'ready', failedUnits: 0, translated: { got: 10, total: 10 } })
    expect(v.capsule).toBeNull()
  })
  it("the count is the view's after the end too: a toggle that shows passages the run did not translate counts them", () => {
    const v = run({
      laidAt: 4000,
      end: windowsDone,
      more: () => [{ at: 12_000, set: { classes: { ...DEFAULTS.classes, references: true } } }],
    })
    expect(v.chrome.failedUnits).toBe(7)
    expect(words(v.capsule)).toBe('7 passages failed')
    const off = run({
      laidAt: 4000,
      end: windowsDone,
      more: () => [
        { at: 12_000, set: { classes: { ...DEFAULTS.classes, references: true } } },
        { at: 13_000, set: { classes: { ...DEFAULTS.classes, references: false } } },
      ],
    })
    expect(off.chrome.failedUnits).toBe(5)
  })
  it("our server's run started again at its time: the wait's own statement while it runs, the passages it brings leave the count", () => {
    const v = run({
      laidAt: 4000,
      end: windowsDone,
      more: (layer, units, store) => {
        const w2 = rowsObject(store, ids(5, 8))
        const all = rowsObject(store, ids(0, 10))
        return [
          {
            at: 40_000,
            doc: doc(4, layer, target('running', { attempt: 2, units: [units], rows: [...windowsDone(store), w2] })),
          },
          { at: 45_000, doc: doc(5, layer, target('done', { attempt: 2, units: [units], rows: [all] })) },
        ]
      },
    })
    expect(v.chrome).toMatchObject({
      phase: 'ready',
      failedUnits: 0,
      failure: null,
      translated: { got: 10, total: 10 },
    })
    expect(v.capsule).toBeNull()
  })
})

/** whether a retry is offered anywhere at a time drawn: the capsule's chip or the card's button */
const offered = (x: { capsule: Capsule | null; card: Card | null }) =>
  (!!x.capsule && retryOffered(x.capsule)) || x.card?.action === 'retry'

describe('an action is offered only where the session will not take it by itself (PDF-READER §8.1; the flow-demo of 2026-11-11, F2)', () => {
  // (the recording: a quota refused at 20:17:10 until 21:00:00, the page's clock moved to 20:59:50; at 21:00:00 the chip came and,
  // the same instant, the session asked again by itself: the chip stood about 0.25 s)
  const T = 1_000_000
  const END = T + 2_570_000
  const quota: Refusal = { why: 'quota', afterMs: 2_570_000, at: END }
  const ask = (at: number): Beat => ({ at, lost: 'not-opened' })
  it("the limit of new papers, asked again by the session at our server's time: no retry offered before it, at it, or after", () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const v = visit(
      store,
      [{ at: 100, opened: true }, ask(T), { at: END - 10_000, timers: true }, { at: END, timers: true }],
      [quota],
    )
    const said = v.seen.filter((x) => x.capsule?.kind === 'notNow')
    expect(said.length).toBeGreaterThan(0)
    expect(words(said[0]?.capsule ?? null)).toBe(`limit until ${END}`)
    for (const x of v.seen) expect(offered(x), `at ${x.at}`).toBe(false)
    // (drawn at our server's time, before the session's own timer is applied: the moment the chip stood)
    const before = visit(store, [{ at: 100, opened: true }, ask(T)], [quota])
    expect(before.capsuleAt(END)).toMatchObject({ kind: 'notNow' })
    expect(retryOffered(before.capsuleAt(END) as Capsule)).toBe(false)
    expect(before.capsuleAt(END + 60_000) && retryOffered(before.capsuleAt(END + 60_000) as Capsule)).toBe(false)
    // (asked again by itself at that time: our server followed again, and the open asked once it says the paper is not opened)
    expect(v.s.link.s).toBe('on')
    // (the clocks agreeing and the wait to the millisecond: the session's own ask at the instant itself, its timer due then; and the
    // sentence keeps its time until the ask begins, never the bare title between the two: the flow-demo's 0.42 s, (a))
    expect([...resources(before.s).values()]).toContainEqual({ slot: 'timer', at: END })
    for (const t of [END, END + 420]) expect(words(before.capsuleAt(t)), `at ${t}`).toBe(`limit until ${END}`)
  })
  it("a time the session does not ask at by itself drops from its sentence once it has come (the chrome's to decide, the host's words saying the time they are given)", () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const v = visit(store, [
      { at: 100, opened: true },
      { at: T, lost: 'server' },
    ])
    expect(v.chrome.unavailable).toMatchObject({ why: 'unreachable' })
    const beats: Beat[] = [{ at: 100, opened: true }]
    let t = T
    for (let n = 1; n <= REFUSED_ASKS + 1; n++) {
      beats.push(ask(t))
      if (n <= REFUSED_ASKS) beats.push({ at: t + 1000, timers: true })
      t += 1000
    }
    const past = visit(
      store,
      beats,
      Array.from({ length: REFUSED_ASKS + 1 }, () => ({ why: 'quota', afterMs: 1000, at: null })),
    )
    const due = (past.s.link as { retryAt: number }).retryAt
    expect(words(past.capsuleAt(due - 1))).toBe(`limit until ${due}`)
    expect(words(past.capsuleAt(due))).toBe('limit')
  })
  it("past the refusals the session waits out by itself, the limit is the reader's to retry: offered at its time", () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const beats: Beat[] = [{ at: 100, opened: true }]
    let t = T
    for (let n = 1; n <= REFUSED_ASKS + 1; n++) {
      beats.push(ask(t))
      if (n <= REFUSED_ASKS) beats.push({ at: t + 1000, timers: true })
      t += 1000
    }
    const v = visit(
      store,
      beats,
      Array.from({ length: REFUSED_ASKS + 1 }, () => ({ why: 'quota', afterMs: 1000, at: null })),
    )
    expect(v.s.link).toMatchObject({ s: 'stopped', why: 'limit', wake: null })
    const due = (v.s.link as { retryAt: number }).retryAt
    expect(retryOffered(v.capsuleAt(due - 1) as Capsule)).toBe(false)
    expect(retryOffered(v.capsuleAt(due) as Capsule)).toBe(true)
  })
  it("the visitor's rate of asks and the network itself, which the session waits out by itself: never a retry", () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const rate = visit(
      store,
      [{ at: 100, opened: true }, ask(T), { at: T + 4000, timers: true }],
      [{ why: 'rate', afterMs: 4000, at: null }],
    )
    expect(rate.seen.some((x) => words(x.capsule) === 'too many asks')).toBe(true)
    for (const x of rate.seen) expect(offered(x), `rate at ${x.at}`).toBe(false)
    expect(
      retryOffered(
        visit(store, [{ at: 100, opened: true }, ask(T)], [{ why: 'rate', afterMs: 4000, at: null }]).capsuleAt(
          T + 4000,
        ) as Capsule,
      ),
    ).toBe(false)
    const net = visit(store, [
      { at: 100, opened: true },
      { at: T, lost: 'network' },
      { at: T + 500, online: false },
    ])
    expect(words(net.capsule)).toBe('network down')
    for (const x of net.seen) expect(offered(x), `network at ${x.at}`).toBe(false)
  })
  it('our server out of reach, which the session stops asking: its retry offered at once', () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const v = visit(store, [
      { at: 100, opened: true },
      { at: T, lost: 'server' },
    ])
    expect(v.capsule).toMatchObject({ kind: 'notNow' })
    expect(retryOffered(v.capsule as Capsule)).toBe(true)
  })
  it("passages that failed, asked again by the session at our server's time: no retry, before or at it; nothing laid, the card's neither", () => {
    const laid = run({ laidAt: 4000, end: (store) => [rowsObject(store, ids(0, 5))] })
    for (const at of [9000, 38_999, 39_000]) expect(retryOffered(laid.capsuleAt(at) as Capsule), `at ${at}`).toBe(false)
    const bare = run({ end: (store) => [rowsObject(store, ids(0, 5))] })
    expect(bare.card).toMatchObject({ reason: 'failed: network', action: null })
  })
})

describe('the network down while the reader waits on our server (PDF-READER §8.1; the flow-demo of 2026-11-11, F3)', () => {
  // (the recording: the layer shown, "translating 7 / 17" up, the network gone: the count stood for the whole outage)
  const counted = (more: (layer: Doc['layer'], units: Ref, store: Store) => Beat[]) => {
    const store: Store = { units: new Map(), rows: new Map() }
    const units = unitsObject(store, ids(0, 10))
    const layer = { catalog: ref(), units: [units], format: 1, stale: false }
    const w1 = rowsObject(store, ids(0, 5))
    return visit(store, [
      { at: 100, opened: true },
      { at: 1000, doc: doc(1, layer, target('running', { units: [units], total: 10 })) },
      { at: 2000, laid: 1 },
      { at: 3000, doc: doc(2, layer, target('running', { units: [units], rows: [w1], done: 5, total: 10 })) },
      ...more(layer, units, store),
    ])
  }
  it('the browser offline: the network said over the count for as long as it is so, the count back once it is online and heard', () => {
    const v = counted((layer, units, store) => [
      { at: 4000, online: false },
      { at: 9000, timers: true },
      { at: 9500, online: true },
      {
        at: 9600,
        doc: doc(3, layer, target('running', { units: [units], rows: [rowsObject(store, ids(0, 7))], total: 10 })),
      },
    ])
    const at = (t: number) => v.seen.filter((x) => x.at === t).at(-1)?.capsule ?? null
    expect(words(at(3000))).toBe('translating 5/10')
    expect(words(at(4000))).toBe('network down')
    expect(at(4000)).toMatchObject({ kind: 'notNow' })
    expect(retryOffered(at(4000) as Capsule)).toBe(false)
    expect(words(at(9000))).toBe('network down')
    expect(words(at(9600))).toBe('translating 7/10')
    // (the progress line stays the run's: its phase stays translating, nothing jumps)
    expect(v.chrome.phase).toBe('translating')
  })
  it('a rejected fetch while the browser says it is online: the network, also while the session asks again, until a document is heard', () => {
    const v = counted((layer, units, store) => [
      { at: 4000, lost: 'network' },
      // (the session's own next ask, a second on: the follow asked again, nothing heard yet)
      { at: 5000, timers: true },
      {
        at: 6000,
        doc: doc(3, layer, target('running', { units: [units], rows: [rowsObject(store, ids(0, 7))], total: 10 })),
      },
    ])
    const at = (t: number) => v.seen.filter((x) => x.at === t).at(-1)?.capsule ?? null
    expect(words(at(4000))).toBe('network down')
    expect(v.seen.filter((x) => x.at === 5000).every((x) => words(x.capsule) === 'network down')).toBe(true)
    expect(words(at(6000))).toBe('translating 7/10')
  })
  it('a finished translation being read: the network lost tells nothing (nothing is waited for)', () => {
    const v = counted((layer, units, store) => [
      {
        at: 5000,
        doc: doc(3, layer, target('done', { units: [units], rows: [rowsObject(store, ids(0, 10))], total: 10 })),
      },
      { at: 6000, online: false },
      { at: 7000, lost: 'network' },
    ])
    expect(v.capsuleAt(7000)).toBeNull()
  })
})

describe('failed passages are told only where the session is not already asking for them again (PDF-READER §8.1; the flow-demo of 2026-11-11, F4)', () => {
  const failedRun = (retryAt: number | null) => {
    const store: Store = { units: new Map(), rows: new Map() }
    const units = unitsObject(store, ids(0, 10))
    const layer = { catalog: ref(), units: [units], format: 1, stale: false }
    const done = rowsObject(store, ids(0, 5))
    const running = doc(1, layer, target('running', { units: [units], rows: [done], done: 5, total: 10 }))
    const failed = doc(2, layer, target('failed', { why: 'translation-down', retryAt, units: [units], rows: [done] }))
    const again = doc(3, layer, target('running', { attempt: 2, units: [units], rows: [done], total: 10 }))
    return { store, running, failed, again }
  }
  const at = (v: ReturnType<typeof visit>, t: number) => v.seen.filter((x) => x.at === t).at(-1)?.capsule ?? null
  it('a run the visit did not open, found failed with no time to wait, is asked again at once: the wait told (its count), never the notice', () => {
    // (the recording: "3 passages failed [retry]" stood 150 ms while the session's open, asked at once, was under way)
    const { store, running, failed, again } = failedRun(null)
    const v = visit(
      store,
      [
        { at: 100, opened: true },
        { at: 1000, doc: running },
        { at: 1100, laid: 1 },
        { at: 2000, doc: failed },
        { at: 2150, answer: again },
      ],
      [],
      true,
    )
    for (const x of v.seen) expect(x.capsule?.kind, `at ${x.at}`).not.toBe('notice')
    expect(words(at(v, 2000))).toBe('translating 5/10')
    expect(words(at(v, 2150))).toBe('translating 5/10')
    // (nothing laid yet: no card either)
    const bare = visit(
      store,
      [
        { at: 100, opened: true },
        { at: 1000, doc: running },
        { at: 2000, doc: failed },
        { at: 2150, answer: again },
      ],
      [],
      true,
    )
    for (const x of bare.seen) expect(x.card, `at ${x.at}`).toBeNull()
  })
  it("a run failed with our server's time to wait: the notice for that wait, no retry; at the time the ask begins, the wait's own words", () => {
    const { store, running, failed, again } = failedRun(39_000)
    const v = visit(
      store,
      [
        { at: 100, opened: true },
        { at: 1000, doc: running },
        { at: 1100, laid: 1 },
        { at: 2000, doc: failed },
        { at: 39_000, timers: true },
        { at: 39_150, answer: again },
      ],
      [],
      true,
    )
    expect(at(v, 2000)).toMatchObject({ kind: 'notice', action: null })
    expect(words(at(v, 2000))).toBe('5 passages failed')
    expect(words(at(v, 39_000))).toBe('translating 5/10')
    expect(words(at(v, 39_150))).toBe('translating 5/10')
  })
  it('a run failed that the session will not ask again by itself (this visit asked it already): the notice, with its retry', () => {
    const { store, running, failed } = failedRun(null)
    // (its open answered with the run failed still: nothing more the session asks by itself)
    const v = visit(
      store,
      [
        { at: 100, opened: true },
        { at: 1000, doc: running },
        { at: 1100, laid: 1 },
        { at: 2000, doc: failed },
        { at: 2150, answer: failed },
      ],
      [],
      true,
    )
    expect(v.capsule).toMatchObject({ kind: 'notice', action: 'retry' })
  })
})

describe('waiting in line is a wait, not a refusal (the coordinator, 2026-11-12; the flow-demo of 2026-11-11, F5)', () => {
  // (the recording: our server at capacity, the open refused busy at 0 s, asked again at 4.2 s and 12.4 s, then taken: the website
  // showed the original alone, zoomed to fit, and jumped to side by side once the open was taken)
  it("while queued the page stands as in the first-time wait: the display chosen kept, the translated displays not greyed; the narrow window's hold kept", () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const busy: Refusal = { why: 'busy', afterMs: 4200, at: null }
    const v = visit(
      store,
      [
        { at: 100, opened: true },
        { at: 200, lost: 'not-opened' },
        { at: 4400, timers: true },
        { at: 4400, lost: 'not-opened' },
        { at: 12_800, timers: true },
        { at: 12_800, lost: 'not-opened' },
        { at: 12_900, answer: preparingDoc() },
      ],
      [busy, busy],
      true,
    )
    const site = { refusal: 'original' as const, narrow: 'shown' as const }
    const queued = v.seen.filter((x) => x.chrome?.unavailable?.why === 'busy')
    expect(queued.length).toBeGreaterThan(1)
    for (const x of v.seen.filter((y) => y.chrome)) {
      const c = x.chrome as ChromeState
      // (the site's rules: the original held, the translated displays greyed, only for a true refusal for now)
      expect(heldOf(c, site), `held at ${x.at}`).toBe(false)
      expect(refusedNow(c), `greyed at ${x.at}`).toBe(false)
    }
    // (a narrow window holds the original while the paper waits its turn, as it does while the paper is made)
    for (const x of queued)
      expect(heldOf({ ...(x.chrome as ChromeState), narrow: true }, site), `narrow at ${x.at}`).toBe(true)
    expect(heldOf({ ...v.chrome, narrow: true }, site)).toBe(true)
    // (a true refusal for now keeps today's hold)
    const quota = visit(
      store,
      [
        { at: 100, opened: true },
        { at: 200, lost: 'not-opened' },
      ],
      [{ why: 'quota', afterMs: 60_000, at: null }],
    )
    expect(heldOf(quota.chrome, site)).toBe(true)
    expect(refusedNow(quota.chrome)).toBe(true)
  })
})

describe("the display the reader chose is kept while the session goes on by itself, with no period to end and nothing of the reader's (the coordinator, 2026-11-12; the flow-demo, (b))", () => {
  const site = { refusal: 'original' as const, narrow: 'shown' as const }
  const steps = (v: ReturnType<typeof visit>) => v.seen.filter((x) => x.chrome) as { at: number; chrome: ChromeState }[]
  it("the visitor's rate of asks: neither held nor greyed at any step; a narrow window's hold as before", () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const v = visit(
      store,
      [
        { at: 100, opened: true },
        { at: 355, lost: 'not-opened' },
        { at: 4602, timers: true },
        { at: 4602, lost: 'not-opened' },
        { at: 4700, answer: preparingDoc() },
      ],
      [{ why: 'rate', afterMs: 4000, at: null }],
      true,
    )
    const rated = steps(v).filter((x) => x.chrome.unavailable?.why === 'rate')
    expect(rated.length).toBeGreaterThan(0)
    for (const x of steps(v)) {
      expect(heldOf(x.chrome, site), `held at ${x.at}`).toBe(false)
      expect(refusedNow(x.chrome), `greyed at ${x.at}`).toBe(false)
    }
    for (const x of rated) expect(heldOf({ ...x.chrome, narrow: true }, site), `narrow at ${x.at}`).toBe(true)
  })
  it("the network down during a first making: neither held nor greyed at any step, back to the making once online; a narrow window's hold as before", () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const v = visit(store, [
      { at: 100, opened: true },
      { at: 1000, doc: preparingDoc() },
      { at: 2750, online: false },
      { at: 9052, online: true },
      { at: 9100, doc: { ...preparingDoc(), rev: 2 } },
    ])
    const down = steps(v).filter((x) => x.chrome.unavailable?.why === 'network')
    expect(down.length).toBeGreaterThan(0)
    for (const x of steps(v)) {
      expect(heldOf(x.chrome, site), `held at ${x.at}`).toBe(false)
      expect(refusedNow(x.chrome), `greyed at ${x.at}`).toBe(false)
    }
    for (const x of down) expect(heldOf({ ...x.chrome, narrow: true }, site), `narrow at ${x.at}`).toBe(true)
  })
  it("where the translation cannot come before a period ends (the limit) or for our server's fault with its time: held and greyed, as today's site", () => {
    const store: Store = { units: new Map(), rows: new Map() }
    const quota = visit(
      store,
      [
        { at: 100, opened: true },
        { at: 200, lost: 'not-opened' },
      ],
      [{ why: 'quota', afterMs: 60_000, at: null }],
    )
    expect([heldOf(quota.chrome, site), refusedNow(quota.chrome)]).toEqual([true, true])
    const server = visit(store, [
      { at: 100, opened: true },
      { at: 200, lost: 'server' },
    ])
    expect([heldOf(server.chrome, site), refusedNow(server.chrome)]).toEqual([true, true])
  })
})

/** a paper being prepared for the target, its run made by the open */
function preparingDoc(): Doc {
  return {
    epoch: 'e1',
    rev: 1,
    prepare: { state: 'running', why: null, retryAt: null, stage: 'compiling', units: [], attempt: 1 },
    layer: null,
    targets: { [ZH]: target('none', { attempt: 0 }) },
  }
}

describe("a prepare our server failed by its own trouble, not the paper's (the feature list's R08: these words were in no table)", () => {
  /** the paper's prepare failed for `why`, our server's next attempt at `retryAt` */
  const failedPrepare = (why: string, retryAt: number): Doc => ({
    ...preparingDoc(),
    rev: 2,
    prepare: { state: 'failed', why, retryAt, stage: null, units: [], attempt: 1 },
  })
  for (const why of ['internal', 'deadline', 'translation-down', 'unavailable'])
    it(`${why}: our server's for now, with the time of its next attempt, never the paper's own (the wait flow's "server" cause)`, () => {
      const store: Store = { units: new Map(), rows: new Map() }
      const v = visit(store, [
        { at: 100, opened: true },
        { at: 200, doc: failedPrepare(why, 90_000) },
      ])
      expect(v.s.layer).toMatchObject({ s: 'refused', why: 'unreachable', retryAt: 90_000 })
      expect(words(v.capsule)).toBe('unavailable until 90000')
      expect(v.capsule).toMatchObject({ kind: 'notNow' })
    })
})
