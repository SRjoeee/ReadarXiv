// The capsule over whole visits (PDF-READER §6.6, §8): the session's machine stepped through our server's documents as staging
// told them (the coordinator's timelines of 2026-11-11: a paper prepared again after a deploy with its rows stored, a settled
// paper opened again, a new paper's first open), the rows read as the reader reads them, the reader's state told to the chrome
// (eventsOf), folded (reduce) and drawn (capsuleOf) in the website's words. Each case counts the capsule's appearances by
// stage and checks the count it shows: one statement over the layer shown, never falling within an appearance.
import { writeFileSync } from 'node:fs'
import type { Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { R } from '@readarxiv/ui'
import { textOf } from '../../src/chrome/capsule-words.ts'
import { capsuleOf, type Capsule, firstOf, lineOf, spokenOf } from '../../src/chrome/status.ts'
import { eventsOf } from '../../src/chrome/events.ts'
import { INITIAL, reduce, type ReaderState as ChromeState } from '../../src/chrome/model.ts'
import type { StateWords } from '../../src/chrome/parts.tsx'
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
  targetOf,
} from '../../src/session/machine.ts'
import { rowsTold, runOf, viewOf } from '../../src/session/rows.ts'
import { LANGUAGES } from './parts.ts'

const ZH = 'zh-Hans'
const PREFS: Prefs = { ...DEFAULTS, display: 'bilingual', target: ZH }
/** the website's words for a run's stages (its v2 words.ts: the first making's words, the bare word before a count) */
const FIRST = 'translating, the first time takes 1-2 minutes'
const WORDS: StateWords = {
  queued: 'queued',
  reconnecting: 'reconnecting',
  translating: (got, total, _chip, first) =>
    first ? FIRST : total > 0 ? `translating ${got}/${total}` : 'translating',
}

let digests = 0
const ref = (bytes = 10): Ref => {
  const sha256 = (++digests).toString(16).padStart(64, '0')
  return { path: `p/2610_00001v1/x/${sha256}`, sha256, bytes }
}
/** our server's objects: units objects (their units' ids and kinds) and rows objects */
interface Store {
  units: Map<string, { id: string; kind: string; kept?: boolean }[]>
  rows: Map<string, Row[]>
}
const idOf = (n: number) => `u${n}`
const unitsObject = (store: Store, ids: string[], kind = 'para'): Ref => {
  const r = ref()
  store.units.set(
    r.sha256,
    ids.map((id) => ({ id, kind })),
  )
  return r
}
const rowsObject = (store: Store, ids: string[], by = 'x'): Ref => {
  const r = ref()
  store.rows.set(
    r.sha256,
    ids.map((id) => ({ id, ok: true, content: [{ t: 'text', s: `${id} ${by}` }], by }) as Row),
  )
  return r
}
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => idOf(a + i))
const HEAD = (pages = 4) =>
  ({
    format: 1,
    paper: { id: '2610.00001', version: 1, pages },
    made: 'x',
    original: { bytes: 9, sha256: 'o'.repeat(64), chunk: 65536, chunks: '' },
    addOn: { digest: 'd'.repeat(64), bytes: 10 },
    units: [],
    parts: [],
  }) as never

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
const doc = (rev: number, o: Partial<Doc>): Doc => ({
  epoch: 'e1',
  rev,
  prepare: { state: 'none', why: null, retryAt: null, stage: null, units: [] },
  layer: null,
  targets: {},
  ...o,
})

/** what happens at a time of a visit: a document heard, the original opened, the first page laid, a setting changed */
type Beat =
  | { at: number; doc: Doc }
  | { at: number; opened: true }
  | { at: number; laid: number }
  | { at: number; set: Partial<Prefs> }
  /** the look's timer fired: our server's wait after a refusal over, the open asked again */
  | { at: number; wake: true }
  /** the open under way answered now, with our server's document after it started what it asked (`holdOpen`) */
  | { at: number; answer: Doc }

interface Shown {
  at: number
  until: number | null
  stage: string
  /** the counts it showed, each once in turn */
  counts: [number, number][]
  /** its words, each once in turn, with the time they came */
  said: [number, string][]
  /** the count the chrome held as it went (the wait's end told with its count) */
  end?: [number, number]
}

/**
 * A visit: the machine stepped through the beats, every resource it asks answered at once (the code, the head, the composed
 * document; the open with the document), the rows read as reader.ts reads our server's (every ref the document names for the
 * target, each once a ticket, the target's rows let go for another target), the reader's state told as reader.ts tells it,
 * folded and drawn. Returns each appearance of a run's capsule: its stage, when it came and went, the counts it showed
 */
function visit(
  store: Store,
  beats: Beat[],
  first: Partial<Prefs> = {},
  o: { busy?: number; rate?: number; holdOpen?: boolean } = {},
) {
  /** the opens our server refuses first: for its capacity (the admission's busy, in the open's answer), or for the visitor's
   *  rate of asks (a 429 that says so) */
  let busy = o.busy ?? 0,
    rate = o.rate ?? 0
  let s: State = init({
    paper: { id: '2610.00001', version: 1 },
    here: false,
    defaults: { ...PREFS, ...first },
    now: 0,
    visible: true,
    online: true,
  })
  let now = 0
  let rows = new Map<string, Row>()
  let rowsTarget = ''
  let reading: { t: string; read: Set<string> } | null = null
  let headRead = ''
  const queue: Input[] = []
  let chrome: ChromeState = INITIAL
  let told: ReaderState | null = null
  const shown: Shown[] = []
  const live = (slot: string) => [...resources(s)].find(([, spec]) => spec.slot === slot)?.[0] ?? null
  const counted: { at: number; got: number; total: number }[] = []
  /** every capsule drawn, by kind, with the time */
  const kinds: [number, string][] = []
  /** what the status region says in its own line where no run's capsule says it (StatusCapsule `spoken`), each once in turn */
  const spoken: [number, string][] = []
  /** the progress line as ProgressLine draws it: its length while on (the longest of its showing), -1 while hidden */
  const lines: [number, number][] = []
  const line = { on: false, last: 0.02, prepared: false }
  /** the units the view counts, as reader.ts holds them: those last read (a layer's once its head is read), the layer's before
   *  it while a new layer's are not */
  let unitsRead: { id: string; kind: string; kept?: boolean }[] | null = null
  const viewUnits = () => {
    if (s.layer.s !== 'ready') return null
    if (headRead === s.layer.catalog.sha256) unitsRead = s.layer.units.flatMap((r) => store.units.get(r.sha256) ?? [])
    return unitsRead
  }
  const toldOf = (): ReaderState => {
    const r = s.rows
    // (the run as the session states it: the reader's own predicate, rows.ts runOf)
    const run = runOf(s)
    const view = viewOf({
      units: viewUnits(),
      classes: s.prefs.value.classes,
      held: rows,
      shown: s.layer.s === 'ready',
      laid: s.panes.laid > 0,
      run: run.run,
      failed: run.failed,
    })
    return {
      paper: { id: '2610.00001', version: 1, title: '', html: null, pdf: '' },
      prefs: s.prefs.value,
      settings: { s: s.prefs.s, refused: s.prefs.refused },
      original: s.original.s === 'open' ? { s: 'open', pages: 4, ours: false } : { s: 'opening', loaded: 0, total: 0 },
      layer:
        s.layer.s === 'ready'
          ? { s: 'ready', laid: s.panes.laid, total: 4, asOriginal: 0 }
          : s.link.s === 'stopped'
            ? { s: 'refused', why: s.link.why, retryAt: s.link.retryAt }
            : s.layer.s === 'preparing'
              ? { s: 'preparing', stage: s.layer.stage }
              : { s: 'none' },
      rows: rowsTold(s, view, run),
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
      network: false,
      faces: null,
      crashed: false,
    } as ReaderState
  }
  const draw = () => {
    const next = toldOf()
    for (const e of eventsOf(told, next)) chrome = reduce(chrome, e)
    told = next
    const c: Capsule | null = capsuleOf(
      chrome,
      { noticeClosed: 0, narrowShown: false, refusalsSeen: 0 },
      LANGUAGES,
      WORDS,
    )
    if (c && kinds.at(-1)?.[1] !== c.kind) kinds.push([now, c.kind])
    const said = c?.kind === 'progress' ? '' : spokenOf(chrome)
    if (spoken.at(-1)?.[1] !== said) spoken.push([now, said])
    // (ProgressLine: a showing starts at its sliver, then holds the longest it reached; the prepare's stretch where it had one)
    const plain = lineOf(chrome, false, false),
      making = chrome.phase === 'preparing' || firstOf(chrome)
    if (plain.on && !line.on) Object.assign(line, { last: 0.02, prepared: making })
    else if (making) line.prepared = true
    line.on = plain.on
    if (plain.on) line.last = Math.max(line.last, lineOf(chrome, false, line.prepared).value)
    const drawnLine = plain.on ? Math.round(line.last * 1000) / 1000 : -1
    if (lines.at(-1)?.[1] !== drawnLine) lines.push([now, drawnLine])
    const stage = c?.kind === 'progress' ? c.stage : null
    const last = shown.at(-1)
    const open = last && last.until === null ? last : null
    if (open && open.stage !== stage) {
      open.until = now
      open.end = [chrome.translated.got, chrome.translated.total]
    }
    if (stage && (!open || open.stage !== stage)) shown.push({ at: now, until: null, stage, counts: [], said: [] })
    const cur = shown.at(-1)
    if (c && stage && cur && cur.until === null && cur.said.at(-1)?.[1] !== textOf(c.words))
      cur.said.push([now, textOf(c.words)])
    if (stage === 'translating' && cur && cur.until === null) {
      const { got, total } = chrome.translated
      const pair: [number, number] = [got, total]
      const prev = cur.counts.at(-1)
      if (!prev || prev[0] !== got || prev[1] !== total) cur.counts.push(pair)
      counted.push({ at: now, got, total })
    }
  }
  /** what reader.ts does after a step: the resources it holds answered, our server's rows read */
  const react = () => {
    const code = s.layer.s === 'ready' && s.layer.code && !s.layer.loaded ? s.layer.code : null
    if (code) queue.push({ i: 'code.loaded', t: code })
    if (s.layer.s === 'ready' && s.layer.code && !s.layer.head && headRead !== s.layer.catalog.sha256) {
      headRead = s.layer.catalog.sha256
      queue.push({ i: 'head', digest: s.layer.catalog.sha256, head: HEAD() })
    }
    const composed = live('composed')
    if (composed && s.layer.s === 'ready' && !s.layer.open) queue.push({ i: 'composed.opened', t: composed })
    const open = live('open')
    if (open && s.doc && !o.holdOpen) {
      const refused =
        busy > 0
          ? { why: 'busy' as const, afterMs: 30_000 }
          : rate > 0
            ? { why: 'rate' as const, afterMs: 60_000 }
            : null
      if (refused?.why === 'busy') busy--
      else if (refused) rate--
      queue.push(
        refused ? { i: 'open.answered', t: open, doc: null, refused } : { i: 'open.answered', t: open, doc: s.doc },
      )
    }
    const t = live('rows')
    if (s.rows.s === 'arriving' && t) {
      if (reading?.t !== t) {
        if (s.rows.target !== rowsTarget) {
          rows = new Map()
          rowsTarget = s.rows.target
        }
        reading = { t, read: new Set() }
      }
      const tg = s.doc?.targets[s.rows.target]
      for (const r of tg?.rows ?? []) {
        if (reading.read.has(r.sha256)) continue
        reading.read.add(r.sha256)
        for (const row of store.rows.get(r.sha256) ?? []) rows.set(row.id, row)
      }
      if (tg && (tg.state === 'done' || tg.state === 'failed') && tg.rows.every((r) => reading?.read.has(r.sha256)))
        queue.push(tg.state === 'failed' ? { i: 'rows.failed', t, why: { kind: 'server' } } : { i: 'rows.end', t })
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
  for (const b of [...beats].sort((a, c) => a.at - c.at)) {
    now = b.at
    if ('opened' in b) {
      const t = live('original')
      if (t) feed({ i: 'original.opened', t, pages: 4, bytes: 9 })
      feed({ i: 'panes.drawn' })
    } else if ('doc' in b) {
      const link = live('link')
      if (link) feed({ i: 'paper', t: link, doc: b.doc })
    } else if ('answer' in b) {
      const open = live('open')
      if (open) feed({ i: 'open.answered', t: open, doc: b.answer })
    } else if ('wake' in b) {
      if (s.link.s === 'stopped' && s.link.timer) feed({ i: 'time', t: s.link.timer, now })
    } else if ('laid' in b) feed({ i: 'panes.laid', laid: b.laid, total: 4 })
    else feed({ i: 'cmd.set', prefs: b.set })
  }
  const last = shown.at(-1)
  if (last && last.until === null) last.until = now
  return { shown, counted, chrome, kinds, spoken, lines, target: targetOf(s) }
}

const stages = (shown: Shown[], stage: string) => shown.filter((x) => x.stage === stage)
const table: string[] = []
const report = (name: string, shown: Shown[]) => {
  table.push(
    `${name}: ${shown.map((x) => `${x.stage} ${x.at}-${x.until}${x.counts.length ? ` [${x.counts.map((c) => c.join('/')).join(' ')}]` : ''}`).join('; ') || 'none'}`,
  )
}
/** within each appearance of "translating": the count never falls, its total never changes, and it never passes its total */
const steady = (shown: Shown[]) => {
  for (const x of stages(shown, 'translating')) {
    const counted = x.counts.filter(([, total]) => total > 0)
    for (const [got, total] of counted) expect(got).toBeLessThanOrEqual(total)
    for (let i = 1; i < counted.length; i++) {
      expect((counted[i] as [number, number])[0]).toBeGreaterThanOrEqual((counted[i - 1] as [number, number])[0])
      expect((counted[i] as [number, number])[1]).toBe((counted[0] as [number, number])[1])
    }
  }
}

/** a paper prepared at an older build, its target done on that layer's 476 units, opened once after a deploy (2610.21924v1,
 *  staging 2026-11-11): the stale layer and its stored rows read, the paper prepared again, the prepare's 393 early units
 *  translated again (attempt 3: 346 reused, two windows), then the new layer of 476 (attempt 4: 320 reused, four windows).
 *  `fresh`: units of the new layer that no layer had before (their ids new), whose rows only attempt 4's last window brings */
function reprepared(fresh = 0) {
  const store: Store = { units: new Map(), rows: new Map() }
  const old = unitsObject(store, range(0, 476))
  const early = unitsObject(store, range(0, 393))
  const bundle = unitsObject(store, [...range(393, 476 - fresh), ...range(1000, 1000 + fresh)])
  const c0 = ref(),
    c1 = ref()
  const w2 = rowsObject(store, range(0, 476))
  const h3 = rowsObject(store, range(0, 346)),
    f3a = rowsObject(store, range(346, 371)),
    f3b = rowsObject(store, range(371, 393))
  const w3 = rowsObject(store, range(0, 393))
  const layerIds = [...range(0, 476 - fresh), ...range(1000, 1000 + fresh)]
  const h4 = rowsObject(store, layerIds.slice(0, 320)),
    f4 = [0, 1, 2, 3].map((k) => rowsObject(store, layerIds.slice(320 + 39 * k, k === 3 ? 476 : 320 + 39 * (k + 1))))
  const w4 = rowsObject(store, layerIds)
  const staleLayer = { catalog: c0, units: [old], format: 1, stale: true }
  const done = { state: 'done' as const, why: null, retryAt: null, stage: null, units: [] }
  const running = (stage: string, units: Ref[] = []) => ({
    state: 'running' as const,
    why: null,
    retryAt: null,
    stage,
    units,
    attempt: 2,
  })
  const tr = (o: Partial<Target>) => ({ [ZH]: target('done', o) })
  const beats: Beat[] = [
    { at: 1900, opened: true },
    {
      at: 2230,
      doc: doc(35, {
        prepare: done,
        layer: staleLayer,
        targets: tr({ attempt: 2, rows: [w2], done: 476, total: 476, units: [old] }),
      }),
    },
    {
      at: 2956,
      doc: doc(36, {
        prepare: running('bundle'),
        layer: staleLayer,
        targets: tr({ attempt: 2, rows: [w2], done: 476, total: 476, units: [old] }),
      }),
    },
    { at: 3700, laid: 1 },
    {
      at: 14006,
      doc: doc(40, {
        prepare: running('compiling', [early]),
        layer: staleLayer,
        targets: tr({ attempt: 2, rows: [w2], done: 476, total: 476, units: [old] }),
      }),
    },
    {
      at: 19166,
      doc: doc(43, {
        prepare: running('compiling', [early]),
        layer: staleLayer,
        targets: tr({ state: 'running', attempt: 3, rows: [w2], units: [early] }),
      }),
    },
    {
      at: 22676,
      doc: doc(44, {
        prepare: running('compiling', [early]),
        layer: staleLayer,
        targets: tr({ state: 'running', attempt: 3, rows: [w2, h3], done: 346, total: 393, units: [early] }),
      }),
    },
    {
      at: 23262,
      doc: doc(45, {
        prepare: running('compiling', [early]),
        layer: staleLayer,
        targets: tr({ state: 'running', attempt: 3, rows: [w2, h3, f3a], done: 371, total: 393, units: [early] }),
      }),
    },
    {
      at: 23499,
      doc: doc(46, {
        prepare: running('compiling', [early]),
        layer: staleLayer,
        targets: tr({ state: 'running', attempt: 3, rows: [w2, h3, f3a, f3b], done: 393, total: 393, units: [early] }),
      }),
    },
    {
      at: 24214,
      doc: doc(48, {
        prepare: running('compiling', [early]),
        layer: staleLayer,
        targets: tr({ attempt: 3, rows: [w3], done: 393, total: 393, units: [early] }),
      }),
    },
    {
      at: 98803,
      doc: doc(53, {
        prepare: { ...done, attempt: 2 },
        layer: { catalog: c1, units: [early, bundle], format: 1, stale: false },
        targets: tr({ state: 'running', attempt: 4, rows: [w3], done: 393, total: 393, units: [early, bundle] }),
      }),
    },
    {
      at: 98869,
      doc: doc(54, {
        prepare: { ...done, attempt: 2 },
        layer: { catalog: c1, units: [early, bundle], format: 1, stale: false },
        targets: tr({ state: 'running', attempt: 4, rows: [w3], done: 0, total: 0, units: [early, bundle] }),
      }),
    },
    {
      at: 104993,
      doc: doc(55, {
        prepare: { ...done, attempt: 2 },
        layer: { catalog: c1, units: [early, bundle], format: 1, stale: false },
        targets: tr({ state: 'running', attempt: 4, rows: [w3, h4], done: 320, total: 476, units: [early, bundle] }),
      }),
    },
    ...f4.map((_, k) => ({
      at: 105500 + 500 * k,
      doc: doc(56 + k, {
        prepare: { ...done, attempt: 2 },
        layer: { catalog: c1, units: [early, bundle], format: 1, stale: false },
        targets: tr({
          state: 'running' as const,
          attempt: 4,
          rows: [w3, h4, ...f4.slice(0, k + 1)],
          done: 320 + Math.min(156, 39 * (k + 1)),
          total: 476,
          units: [early, bundle],
        }),
      }),
    })),
    {
      at: 107432,
      doc: doc(61, {
        prepare: { ...done, attempt: 2 },
        layer: { catalog: c1, units: [early, bundle], format: 1, stale: false },
        targets: tr({ attempt: 4, rows: [w4], done: 476, total: 476, units: [early, bundle] }),
      }),
    },
  ]
  return visit(store, beats)
}

/** a paper settled at the build our server runs, opened again (2610.21313v1: its target done, 203 of 203) */
function settled() {
  const store: Store = { units: new Map(), rows: new Map() }
  const units = unitsObject(store, range(0, 203))
  const w = rowsObject(store, range(0, 203))
  const layer = { catalog: ref(), units: [units], format: 1, stale: false }
  const prepare = { state: 'done' as const, why: null, retryAt: null, stage: null, units: [] }
  return visit(store, [
    { at: 150, opened: true },
    {
      at: 1273,
      doc: doc(9, {
        prepare,
        layer,
        targets: { [ZH]: target('done', { attempt: 2, rows: [w], done: 203, total: 203, units: [units] }) },
      }),
    },
    { at: 1950, laid: 1 },
  ])
}

/** a new paper's first open (2610.20266v1): prepared from nothing, its 222 early units translated while it compiles (attempt 1),
 *  then the layer of 227 (5 units the early ones lack) translated again (attempt 2: 98 reused, the rest in four windows, the 5
 *  new in the last); its first page laid once the layer's document opens over rows held */
function first() {
  const store: Store = { units: new Map(), rows: new Map() }
  const early = unitsObject(store, range(0, 222))
  const bundle = unitsObject(store, range(222, 227))
  const f1 = rowsObject(store, range(0, 222))
  const w1 = rowsObject(store, range(0, 222))
  const h2 = rowsObject(store, range(0, 98))
  const f2 = [0, 1, 2, 3].map((k) => rowsObject(store, range(98 + 31 * k, k === 3 ? 227 : 98 + 31 * (k + 1))))
  const w2 = rowsObject(store, range(0, 227))
  const layer = { catalog: ref(), units: [early, bundle], format: 1, stale: false }
  const running = (stage: string | null, units: Ref[] = []) => ({
    state: 'running' as const,
    why: null,
    retryAt: null,
    stage,
    units,
    attempt: 1,
  })
  const done = { state: 'done' as const, why: null, retryAt: null, stage: null, units: [], attempt: 1 }
  const tr = (state: Target['state'], o: Partial<Target> = {}) => ({ [ZH]: target(state, o) })
  return visit(store, [
    { at: 66, opened: true },
    { at: 2132, doc: doc(2, { prepare: running(null), targets: tr('none', { attempt: 0 }) }) },
    { at: 4200, doc: doc(3, { prepare: running('fetching'), targets: tr('none', { attempt: 0 }) }) },
    { at: 23406, doc: doc(5, { prepare: running('compiling', [early]), targets: tr('running', { units: [early] }) }) },
    {
      at: 26654,
      doc: doc(6, { prepare: running('compiling', [early]), targets: tr('running', { total: 222, units: [early] }) }),
    },
    {
      at: 35046,
      doc: doc(7, {
        prepare: running('compiling', [early]),
        targets: tr('running', { rows: [f1], done: 222, total: 222, units: [early] }),
      }),
    },
    {
      at: 36227,
      doc: doc(8, {
        prepare: running('units', [early]),
        targets: tr('done', { rows: [w1], done: 222, total: 222, units: [early] }),
      }),
    },
    {
      at: 90049,
      doc: doc(12, {
        prepare: done,
        layer,
        targets: tr('running', { attempt: 2, rows: [w1], units: [early, bundle] }),
      }),
    },
    { at: 92000, laid: 1 },
    {
      at: 97854,
      doc: doc(13, {
        prepare: done,
        layer,
        targets: tr('running', { attempt: 2, rows: [w1, h2], done: 98, total: 227, units: [early, bundle] }),
      }),
    },
    ...f2.map((_, k) => ({
      at: 98500 + 500 * k,
      doc: doc(14 + k, {
        prepare: done,
        layer,
        targets: tr('running', {
          attempt: 2,
          rows: [w1, h2, ...f2.slice(0, k + 1)],
          done: k === 3 ? 227 : 98 + 31 * (k + 1),
          total: 227,
          units: [early, bundle],
        }),
      }),
    })),
    {
      at: 101057,
      doc: doc(19, {
        prepare: done,
        layer,
        targets: tr('done', { attempt: 2, rows: [w2], done: 227, total: 227, units: [early, bundle] }),
      }),
    },
  ])
}

/** a paper settled and laid, then a toggle that shows more of what was made (references on): nothing is translated again */
function toggled() {
  const store: Store = { units: new Map(), rows: new Map() }
  const body = unitsObject(store, range(0, 100))
  const refs = unitsObject(store, range(100, 140), 'reference')
  const w = rowsObject(store, range(0, 140))
  const layer = { catalog: ref(), units: [body, refs], format: 1, stale: false }
  const prepare = { state: 'done' as const, why: null, retryAt: null, stage: null, units: [] }
  return visit(store, [
    { at: 100, opened: true },
    {
      at: 1000,
      doc: doc(3, {
        prepare,
        layer,
        targets: { [ZH]: target('done', { attempt: 1, rows: [w], done: 140, total: 140, units: [body, refs] }) },
      }),
    },
    { at: 1500, laid: 1 },
    { at: 5000, set: { classes: { ...PREFS.classes, references: true } } },
  ])
}

/** a paper settled and laid in one target, then a language switched to: `stored` one our server holds rows of, else a target
 *  it has never translated (the open starts its run) */
function switched(stored: boolean) {
  const store: Store = { units: new Map(), rows: new Map() }
  const units = unitsObject(store, range(0, 120))
  const zh = rowsObject(store, range(0, 120), 'zh')
  const ja = rowsObject(store, range(0, 120), 'ja')
  const jaHalf = rowsObject(store, range(0, 60), 'ja')
  const layer = { catalog: ref(), units: [units], format: 1, stale: false }
  const prepare = { state: 'done' as const, why: null, retryAt: null, stage: null, units: [] }
  const zhDone = target('done', { rows: [zh], done: 120, total: 120, units: [units] })
  const beats: Beat[] = [
    { at: 100, opened: true },
    { at: 1000, doc: doc(3, { prepare, layer, targets: { [ZH]: zhDone } }) },
    { at: 1500, laid: 1 },
    { at: 5000, set: { target: 'ja' } },
  ]
  if (stored)
    beats.push({
      at: 5300,
      doc: doc(3, {
        prepare,
        layer,
        targets: { ja: target('done', { rows: [ja], done: 120, total: 120, units: [units] }) },
      }),
    })
  else
    beats.push(
      { at: 5300, doc: doc(3, { prepare, layer, targets: {} }) },
      { at: 5600, doc: doc(4, { prepare, layer, targets: { ja: target('running', { units: [units] }) } }) },
      {
        at: 8000,
        doc: doc(5, {
          prepare,
          layer,
          targets: { ja: target('running', { rows: [jaHalf], done: 60, total: 120, units: [units] }) },
        }),
      },
      {
        at: 11000,
        doc: doc(6, {
          prepare,
          layer,
          targets: { ja: target('done', { rows: [ja], done: 120, total: 120, units: [units] }) },
        }),
      },
    )
  return visit(store, beats)
}

/** a new paper opened while our server is at capacity: its open refused busy twice (30 s each, in the open's answer), asked again
 *  by itself, then admitted and prepared; `rate`: the visitor's rate of asks instead (a 429 that says so), refused once */
function queuedFirst(o: { busy?: number; rate?: number }) {
  const store: Store = { units: new Map(), rows: new Map() }
  const early = unitsObject(store, range(0, 20))
  const none = { state: 'none' as const, why: null, retryAt: null, stage: null, units: [] }
  const running = (stage: string, units: Ref[] = []) => ({
    ...none,
    state: 'running' as const,
    stage,
    units,
    attempt: 1,
  })
  const tr = { [ZH]: target('none', { attempt: 0 }) }
  return visit(
    store,
    [
      { at: 66, opened: true },
      { at: 900, doc: doc(1, { prepare: none, targets: {} }) },
      { at: 30_900, wake: true },
      { at: 60_900, wake: true },
      { at: 61_500, doc: doc(2, { prepare: running('fetching'), targets: tr }) },
      { at: 70_000, doc: doc(3, { prepare: running('compiling', [early]), targets: tr }) },
    ],
    {},
    o,
  )
}

/** a paper whose layer is stale with no translation under the chain (staging 2010.11929v2, 2026-11-12, scaled: 435 -> 100 passages):
 *  the open starts the prepare; the target's attempt 1 on the prepare's early units brings 70 of the 100 the layer shown counts and
 *  is DONE while the prepare still runs (laying-out, bundle); the new layer lands (its units in objects of their own, the same
 *  passages) with attempt 2, whose first frame restates the 70, then 0/0, then the 30 missing */
function staleNoTarget() {
  const store: Store = { units: new Map(), rows: new Map() }
  const old = unitsObject(store, range(0, 100))
  const early = unitsObject(store, range(0, 70))
  const rest = unitsObject(store, range(70, 100))
  const h1 = rowsObject(store, range(0, 30)),
    h2 = rowsObject(store, range(30, 70))
  const w1 = rowsObject(store, range(0, 70))
  const h3 = rowsObject(store, range(70, 85)),
    h4 = rowsObject(store, range(85, 100))
  const w2 = rowsObject(store, range(0, 100))
  const stale = { catalog: ref(), units: [old], format: 1, stale: true }
  const fresh = { catalog: ref(), units: [early, rest], format: 1, stale: false }
  const prep = (state: 'done' | 'running', stage: string | null, attempt: number, units: Ref[] = []) => ({
    state,
    why: null,
    retryAt: null,
    stage,
    units,
    attempt,
  })
  const zh = (state: Target['state'], o: Partial<Target>) => ({ [ZH]: target(state, o) })
  return visit(
    store,
    [
      { at: 100, opened: true },
      { at: 300, doc: doc(1, { prepare: prep('done', null, 6, [old]), layer: stale, targets: {} }) },
      // (the open: the prepare started, the target asked; our server's document after it)
      { at: 500, answer: doc(2, { prepare: prep('running', null, 7), layer: stale, targets: {} }) },
      { at: 2000, laid: 1 },
      { at: 2100, doc: doc(3, { prepare: prep('running', 'fetching', 7), layer: stale, targets: {} }) },
      {
        at: 6200,
        doc: doc(4, {
          prepare: prep('running', 'compiling', 7),
          layer: stale,
          targets: zh('running', { units: [early] }),
        }),
      },
      {
        at: 9300,
        doc: doc(5, {
          prepare: prep('running', 'compiling', 7),
          layer: stale,
          targets: zh('running', { rows: [h1], done: 30, total: 70, units: [early] }),
        }),
      },
      {
        at: 12000,
        doc: doc(6, {
          prepare: prep('running', 'compiling', 7),
          layer: stale,
          targets: zh('running', { rows: [h1, h2], done: 70, total: 70, units: [early] }),
        }),
      },
      {
        at: 15900,
        doc: doc(7, {
          prepare: prep('running', 'laying-out', 7, [early]),
          layer: stale,
          targets: zh('done', { rows: [w1], done: 70, total: 70, units: [early] }),
        }),
      },
      {
        at: 20900,
        doc: doc(8, {
          prepare: prep('running', 'bundle', 7, [early]),
          layer: stale,
          targets: zh('done', { rows: [w1], done: 70, total: 70, units: [early] }),
        }),
      },
      {
        at: 23400,
        doc: doc(9, {
          prepare: prep('done', null, 7, [early, rest]),
          layer: fresh,
          targets: zh('running', { attempt: 2, rows: [w1], done: 70, total: 70, units: [early, rest] }),
        }),
      },
      {
        at: 23500,
        doc: doc(10, {
          prepare: prep('done', null, 7, [early, rest]),
          layer: fresh,
          targets: zh('running', { attempt: 2, rows: [w1], units: [early, rest] }),
        }),
      },
      {
        at: 29000,
        doc: doc(11, {
          prepare: prep('done', null, 7, [early, rest]),
          layer: fresh,
          targets: zh('running', { attempt: 2, rows: [w1, h3], done: 15, total: 30, units: [early, rest] }),
        }),
      },
      {
        at: 31900,
        doc: doc(12, {
          prepare: prep('done', null, 7, [early, rest]),
          layer: fresh,
          targets: zh('running', { attempt: 2, rows: [w1, h3, h4], done: 30, total: 30, units: [early, rest] }),
        }),
      },
      {
        at: 32800,
        doc: doc(13, {
          prepare: prep('done', null, 7, [early, rest]),
          layer: fresh,
          targets: zh('done', { attempt: 2, rows: [w2], done: 100, total: 100, units: [early, rest] }),
        }),
      },
    ],
    {},
    { holdOpen: true },
  )
}

/** a stale layer whose stored rows hold 80 of its 100 passages (its target done on its units), loaded before the prepare's first
 *  stage arrives (the open, which the stale layer asks, answered 3.5 s on), then the prepare, attempt 2 on its units bringing the
 *  20 missing, and the new layer, which that attempt covers (the flow-staging record's case D, scripted) */
function staleLoaded() {
  const store: Store = { units: new Map(), rows: new Map() }
  const old = unitsObject(store, range(0, 100))
  const fresh = unitsObject(store, range(0, 100))
  const w1 = rowsObject(store, range(0, 80))
  const f2 = rowsObject(store, range(80, 100))
  const w2 = rowsObject(store, range(0, 100))
  const stale = { catalog: ref(), units: [old], format: 1, stale: true }
  const made = { catalog: ref(), units: [fresh], format: 1, stale: false }
  const prep = (state: 'done' | 'running', stage: string | null, attempt: number, units: Ref[] = []) => ({
    state,
    why: null,
    retryAt: null,
    stage,
    units,
    attempt,
  })
  const stored = { [ZH]: target('done', { rows: [w1], done: 80, total: 80, units: [old] }) }
  return visit(
    store,
    [
      { at: 100, opened: true },
      { at: 300, doc: doc(1, { prepare: prep('done', null, 1, [old]), layer: stale, targets: stored }) },
      { at: 1000, laid: 1 },
      { at: 3800, answer: doc(2, { prepare: prep('running', 'fetching', 2), layer: stale, targets: stored }) },
      { at: 5000, doc: doc(3, { prepare: prep('running', 'compiling', 2), layer: stale, targets: stored }) },
      {
        at: 6000,
        doc: doc(4, {
          prepare: prep('running', 'units', 2, [fresh]),
          layer: stale,
          targets: { [ZH]: target('running', { attempt: 2, rows: [w1], total: 20, units: [fresh] }) },
        }),
      },
      {
        at: 7000,
        doc: doc(5, {
          prepare: prep('running', 'units', 2, [fresh]),
          layer: stale,
          targets: { [ZH]: target('running', { attempt: 2, rows: [w1, f2], done: 20, total: 20, units: [fresh] }) },
        }),
      },
      {
        at: 7500,
        doc: doc(6, {
          prepare: prep('running', 'laying-out', 2, [fresh]),
          layer: stale,
          targets: { [ZH]: target('done', { attempt: 2, rows: [w2], done: 100, total: 100, units: [fresh] }) },
        }),
      },
      {
        at: 12000,
        doc: doc(7, {
          prepare: prep('done', null, 2, [fresh]),
          layer: made,
          targets: { [ZH]: target('done', { attempt: 2, rows: [w2], done: 100, total: 100, units: [fresh] }) },
        }),
      },
    ],
    {},
    { holdOpen: true },
  )
}
/** the line drawn never shorter than it was within one showing (R5: a showing that ended and a new one begun is a line of its own) */
const lineSteady = (lines: [number, number][]) => {
  for (let i = 1; i < lines.length; i++) {
    const [, was] = lines[i - 1] as [number, number],
      [, is] = lines[i] as [number, number]
    if (was >= 0 && is >= 0) expect(is).toBeGreaterThanOrEqual(was)
  }
}

describe('the capsule over whole visits (the website’s words): it says what the view shown waits for', () => {
  it('a paper prepared again after a deploy, its rows stored: no capsule at all, its runs on units the view holds, its first page a load', () => {
    const v = reprepared()
    report('(b) re-prepared, stored rows', v.shown)
    expect(v.shown).toEqual([])
  })
  it('the same paper where its new layer has units no layer had: one "translating", over the new layer, until their rows come', () => {
    const v = reprepared(5)
    report('(b5) re-prepared, 5 new units', v.shown)
    const t = stages(v.shown, 'translating')
    expect(v.shown).toHaveLength(1)
    expect(t).toHaveLength(1)
    // (from the new layer's landing, 471 of its 476 held, until the last window brings the 5: it leaves as they are held)
    expect([t[0]?.at, t[0]?.until]).toEqual([98803, 107000])
    expect(t[0]?.counts).toEqual([[471, 476]])
    expect(t[0]?.end).toEqual([476, 476])
    steady(v.shown)
  })
  it('a settled paper opened again: no capsule at all (its stored rows read are no run, its first page a load), and the status region never says it is translating: its first page is a load (R2, the coordinator 2026-11-12)', () => {
    const v = settled()
    report('(c) settled reopened', v.shown)
    expect(v.shown).toEqual([])
    expect(v.spoken.map(([, w]) => w)).not.toContain(R.status.translating)
    expect(v.spoken.map(([, w]) => w)).toContain(R.status.loading)
  })
  it('a new paper\'s first open: one "translating", the first making\'s words from the prepare told until the layer shows, then its count over the layer shown, from 222 of 227 until 227 are held; never "preparing"', () => {
    const v = first()
    report('(a) new paper', v.shown)
    const t = stages(v.shown, 'translating')
    expect(v.shown).toHaveLength(1)
    expect(t).toHaveLength(1)
    // (one wait, the translation's, from the prepare told to the last of the 5 held: the making is never said)
    expect([t[0]?.at, t[0]?.until]).toEqual([2132, 100000])
    // (nothing counted before the layer lands: the early units' run is the prepare's, the view shows no layer yet)
    expect(t[0]?.said).toEqual([
      [2132, FIRST],
      [90049, 'translating 222/227'],
    ])
    // (222 of 227 at the landing; the restated rows of attempt 2's windows move nothing; it leaves as the 5 are held)
    expect(t[0]?.counts.filter(([, total]) => total > 0)).toEqual([[222, 227]])
    expect(t[0]?.end).toEqual([227, 227])
    steady(v.shown)
  })
  it('a toggle that shows more of what was made: no capsule at all', () => {
    const v = toggled()
    report('(d) toggle on', v.shown)
    expect(v.shown).toEqual([])
  })
  it('a language switched to a target with stored rows: no capsule; to a new target: one, 0 of 120 to 60, until all 120 are held', () => {
    const a = switched(true)
    report('(e) switch, stored', a.shown)
    expect(a.shown).toEqual([])
    const b = switched(false)
    report('(f) switch, new target', b.shown)
    const t = stages(b.shown, 'translating')
    expect(b.shown).toHaveLength(1)
    expect(t).toHaveLength(1)
    expect(t[0]?.counts).toEqual([
      [0, 120],
      [60, 120],
    ])
    expect(t[0]?.end).toEqual([120, 120])
    steady(b.shown)
  })
  it("a new paper whose open our server refuses for its capacity: \"queued\" from the refusal, with no retry, asked again by itself, then the first making's words; never a refusal's capsule (the coordinator's decision 5, 2026-11-11)", () => {
    const v = queuedFirst({ busy: 2 })
    report('(q) busy, then made', v.shown)
    expect(v.shown.map((x) => [x.stage, x.at, x.until])).toEqual([
      ['queued', 900, 61_500],
      ['translating', 61_500, 70_000],
    ])
    expect(v.shown[0]?.said).toEqual([[900, 'queued']])
    expect(v.shown[1]?.said).toEqual([[61_500, FIRST]])
    expect(v.kinds.map(([, k]) => k)).toEqual(['progress'])
  })
  it("the visitor's rate of asks is not the queue: its refusal's capsule, as the sibling lane words it", () => {
    const v = queuedFirst({ rate: 1 })
    report('(r) rate, then made', v.shown)
    expect(v.kinds[0]).toEqual([900, 'notNow'])
    expect(stages(v.shown, 'queued')).toEqual([])
  })
  it('a stale layer with no translation, its prepare running: one "translating" from its first count to the last passage held, through attempt 1 done while the prepare runs and the new layer landing; the count never falls nor drops to the bare word (R3, staging case B 2026-11-12)', () => {
    const v = staleNoTarget()
    report('(B) stale, attempt 1 done while the prepare runs', v.shown)
    const t = stages(v.shown, 'translating')
    expect(v.shown).toHaveLength(1)
    expect(t).toHaveLength(1)
    // (from the stale layer's first document, which names no target (the open makes its run), to the last of the 30 held at 31900)
    expect([t[0]?.at, t[0]?.until]).toEqual([300, 31900])
    expect(t[0]?.counts.filter(([, total]) => total > 0)).toEqual([
      [0, 100],
      [30, 100],
      [70, 100],
      [85, 100],
    ])
    // (once counted, never the bare word again: the new layer's units, not read yet, leave the count of the layer before)
    const bare = t[0]?.said.filter(([, w]) => !/\d/.test(w)) ?? []
    expect(bare).toEqual([])
    expect(t[0]?.end).toEqual([100, 100])
    steady(v.shown)
    lineSteady(v.lines)
  })
  it('a stale layer whose stored rows hold 80 of its 100 passages, loaded before the prepare\'s first stage: one "translating" from the open asked to the last passage held, never "finished" between (R3, R5, staging case D 2026-11-12)', () => {
    const v = staleLoaded()
    report('(D) stale layer loaded before the prepare', v.shown)
    const t = stages(v.shown, 'translating')
    expect(v.shown).toHaveLength(1)
    expect([t[0]?.at, t[0]?.until]).toEqual([300, 7000])
    expect(t[0]?.counts.filter(([, total]) => total > 0)).toEqual([[80, 100]])
    expect(t[0]?.end).toEqual([100, 100])
    // (the line never full while 20 passages are missing and work for them goes on; within a showing it never falls)
    const full = v.lines.filter(([at, l]) => l === 1 && at < 7000)
    expect(full).toEqual([])
    lineSteady(v.lines)
  })
  // (AXT_CAPSULE_TABLE=<file>: the appearances of every case written there, the lane's table)
  it('writes the table where asked', () => {
    const to = process.env.AXT_CAPSULE_TABLE
    if (to) writeFileSync(to, `${table.join('\n')}\n`)
  })
})
