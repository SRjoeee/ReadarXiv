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
import { type Capsule, type Card, capsuleOf, cardOf } from '../../src/chrome/status.ts'
import { DEFAULTS, type Prefs } from '../../src/prefs.ts'
import type { ReaderState } from '../../src/reader.ts'
import {
  type Doc,
  displayOf,
  type Input,
  init,
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

type Beat =
  | { at: number; doc: Doc }
  | { at: number; opened: true }
  | { at: number; laid: number }
  | { at: number; retry: true }
  | { at: number; set: Partial<Prefs> }

/** a visit: every resource the machine asks answered at once, our server's rows read as reader.ts reads them (every ref the
 *  document names for the target, each once a ticket; at the run's end read whole, its end told), drawn at the end */
function visit(store: Store, beats: Beat[]) {
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
  const toldOf = (): ReaderState => {
    const r = s.rows
    const view = viewOf({
      units:
        s.layer.s === 'ready' && headRead === s.layer.catalog.sha256
          ? s.layer.units.flatMap((x) => store.units.get(x.sha256) ?? [])
          : null,
      classes: s.prefs.value.classes,
      held: rows,
      shown: s.layer.s === 'ready',
      laid: s.panes.laid > 0,
      ...runOf(s),
    })
    const count = { got: view.got, total: view.total, lost: view.lost }
    const base = { target: r.target, from: 'server' as const }
    return {
      paper: { id: '2610.00002', version: 1, title: '', html: null, pdf: '' },
      prefs: s.prefs.value,
      settings: { s: s.prefs.s, refused: s.prefs.refused },
      original: s.original.s === 'open' ? { s: 'open', pages: 4, ours: false } : { s: 'opening', loaded: 0, total: 0 },
      layer:
        s.layer.s === 'ready'
          ? { s: 'ready', laid: s.panes.laid, total: 4, asOriginal: 0 }
          : s.layer.s === 'refused'
            ? { s: 'refused', why: s.layer.why, retryAt: s.layer.retryAt }
            : { s: 'none' },
      rows:
        r.s === 'none'
          ? { ...base, s: 'none' }
          : r.s === 'arriving'
            ? { ...base, s: 'arriving', ...count, waits: view.waits }
            : r.s === 'complete'
              ? { ...base, s: 'complete', ...count, stopped: r.stopped }
              : { ...base, s: 'failed', why: r.why, ...count, retryAt: r.retryAt },
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
      reconnecting: false,
      faces: null,
      crashed: false,
    } as ReaderState
  }
  const draw = () => {
    const next = toldOf()
    for (const e of eventsOf(told, next)) chrome = reduce(chrome, e)
    told = next
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
    if (open && s.doc) queue.push({ i: 'open.answered', t: open, doc: s.doc })
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
  draw()
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
    else feed({ i: 'cmd.retry' })
  }
  /** the capsule as the website's rules draw it at `at` (the last beat's time by default) */
  const capsuleAt = (at = now, closed = 0): Capsule | null =>
    capsuleOf(chrome, { noticeClosed: closed, narrowShown: false, refusalsSeen: 0 }, LANGUAGES, WORDS, {
      retry: 'when-due',
      now: at,
    })
  const card: Card | null = cardOf(chrome, () => 'reason', WORDS)
  return { capsule: capsuleAt(), capsuleAt, card, chrome, s, opens: () => live('open') }
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
    // (the retry withheld until our server's time, when a press asks: the website's rule)
    expect(v.capsule).toMatchObject({ kind: 'notice', action: null })
    expect(words(v.capsule)).toBe('5 passages failed')
    expect(v.capsuleAt(39_000)).toMatchObject({ kind: 'notice', action: 'retry' })
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
  it("(c) the same before any page is laid: the card, its retry and its line at our server's time", () => {
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
