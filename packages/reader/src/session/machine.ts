// The session as an explicit machine (interfaces/host DECISION, design-b §1: the session's machine first): `step(state, input)`
// pure and total; the resources each state owns declared by `resources(state)`, a map of tickets the runtime acquires and
// releases by diffing it after every step (nobody writes "release"); every asynchronous result returned as an input carrying its
// ticket, and dropped (before step) where that ticket is no longer live, so that a stale open, a late answer or a result of a
// let-go read cannot reach the state. What is content-addressed (objects by digest, rows by unit id) carries no ticket.
//
// `step = settle ∘ apply`: `apply` folds the input into its region; `settle` mints the tickets now wanted and clears the ones no
// longer wanted, in this order (design-b §1.3): the original while there is a paper; `engaged` once a translated display is shown
// in a visible document (never back within a visit); the link while engaged and online and the layer is not refused for good;
// the gate open on the left's first page drawn, its 1.5 s, or the original's failure; the layer's code while it is ready and the
// gate open; the composed document while the code is in, the head read and the original open (its bytes proved); the rows while
// engaged, for a target, once a units digest is known, until complete or failed for that target; a timer for each retry held.
import type { Head } from '@readarxiv/format'

export type Ticket = string
export type Display = 'original' | 'bilingual' | 'translation'
export interface PaperRef {
  id: string
  version: number | null
}
/** an immutable object on our server (L5's Ref) */
export interface Ref {
  path: string
  sha256: string
  bytes: number
}

/** the policy's constants, the same in both hosts (design-b §4) */
export const GATE_MS = 1500
export const PREFS_MS = 1500
export const BACKOFF_MS = 1000
export const BACKOFF_MAX_MS = 30_000
/** the formats of the bundle this reader reads */
export const FORMATS = [1] as const

export type OriginalWhy = 'network' | 'not-found' | 'unreadable'
export type LayerWhy =
  | 'unreachable'
  | 'busy'
  | 'limit'
  | 'no-source'
  | 'not-found'
  | 'cannot-prepare'
  | 'too-large'
  | 'outdated'
  | 'mismatch'
  | 'broken'
export const LASTING: ReadonlySet<LayerWhy> = new Set([
  'no-source',
  'not-found',
  'cannot-prepare',
  'too-large',
  'outdated',
  'mismatch',
  'broken',
])
export type RowsWhy =
  | { kind: 'unavailable'; retryAfterMs?: number }
  | { kind: 'unconfigured'; code: string }
  | { kind: 'target' }
  | { kind: 'server' }

/** a document from the server's follow (L5's PaperDoc), as the machine reads it */
export interface Doc {
  epoch: string
  rev: number
  prepare: {
    state: 'none' | 'running' | 'done' | 'failed'
    why: string | null
    retryAt: number | null
    stage: string | null
    units: Ref[]
  }
  layer: { catalog: Ref; units: Ref[]; format: number } | null
  targets: Record<
    string,
    | {
        state: 'none' | 'running' | 'done' | 'failed'
        why: string | null
        retryAt: number | null
        rows: Ref[]
        done: number
        total: number
      }
    | undefined
  >
  position?: number | null
  progress?: number | null
}

import type { Prefs } from '../prefs.ts'

export type { Prefs }

export type OriginalRegion =
  | { s: 'opening'; t: Ticket; pin: boolean; loaded: number }
  | { s: 'open'; t: Ticket; pin: boolean; pages: number; bytes: number }
  | { s: 'failed'; why: OriginalWhy; pin: boolean; retryAt: number | null; timer: Ticket | null; tries: number }
export type LinkRegion =
  | { s: 'off' }
  | { s: 'on'; t: Ticket; target: string | null; heard: boolean }
  | { s: 'lost'; why: string; tries: number; timer: Ticket }
export type LayerRegion =
  | { s: 'none'; asked: Ticket | null }
  | { s: 'preparing'; stage: string | null; position: number | null; progress: number | null; units: Ref[] }
  | {
      s: 'ready'
      catalog: Ref
      units: Ref[]
      head: Head | null
      code: Ticket | null
      loaded: boolean
      composed: Ticket | null
      open: boolean
    }
  | { s: 'refused'; why: LayerWhy; retryAt: number | null; timer: Ticket | null }
export type RowsRegion =
  | { s: 'none'; target: string }
  | { s: 'arriving'; t: Ticket; target: string; got: number; total: number; lost: number }
  | { s: 'complete'; target: string; got: number; total: number; lost: number }
  | {
      s: 'failed'
      target: string
      why: RowsWhy
      got: number
      total: number
      lost: number
      retryAt: number | null
      timer: Ticket | null
    }

export interface State {
  paper: PaperRef
  /** rows made here (the host's translate): the open names no target, the link asks for none */
  here: boolean
  next: number
  now: number
  visible: boolean
  online: boolean
  engaged: boolean
  gate: { open: boolean; timer: Ticket | null }
  prefs: {
    s: 'reading' | 'landed' | 'unreadable'
    value: Prefs
    chosen: string[]
    refused: number
    timer: Ticket | null
  }
  visit: Partial<Pick<Prefs, 'display' | 'target' | 'sync'>>
  original: OriginalRegion
  doc: Doc | null
  link: LinkRegion
  /** the link's losses in a row (its backoff's exponent), none since a document was heard */
  linkTries: number
  layer: LayerRegion
  rows: RowsRegion
  panes: { drawn: boolean; laid: number; total: number }
  closed: boolean
  crashed: boolean
}

export type Input =
  | { i: 'env.visible'; on: boolean }
  | { i: 'env.online'; on: boolean }
  | { i: 'time'; t: Ticket; now: number }
  | { i: 'prefs.read'; value: Prefs | null }
  | { i: 'prefs.landed'; value: Prefs }
  | { i: 'prefs.refused' }
  | { i: 'original.progress'; t: Ticket; loaded: number }
  | { i: 'original.opened'; t: Ticket; pages: number; bytes: number }
  | { i: 'original.failed'; t: Ticket; why: OriginalWhy }
  /** the head's chunk digests do not hold the bytes read: our copy for both panes */
  | { i: 'original.mismatch'; t: Ticket }
  | { i: 'paper'; t: Ticket; doc: Doc }
  | { i: 'follow.lost'; t: Ticket; why: string; retryAt?: number | null }
  | { i: 'open.answered'; t: Ticket; doc: Doc | null; refused?: { why: 'quota' | 'busy'; retryAt: number } }
  | { i: 'open.failed'; t: Ticket; why: string }
  | { i: 'head'; digest: string; head: Head }
  | { i: 'object.refused'; digest: string; why: 'gone' | 'bad' | 'network' }
  | { i: 'code.loaded'; t: Ticket }
  | { i: 'code.failed'; t: Ticket }
  | { i: 'composed.opened'; t: Ticket }
  | { i: 'composed.failed'; t: Ticket }
  | { i: 'rows.batch'; t: Ticket; got: number; total: number; lost: number }
  | { i: 'rows.end'; t: Ticket; got: number; total: number; lost: number }
  | { i: 'rows.failed'; t: Ticket; why: RowsWhy }
  | { i: 'panes.drawn' }
  | { i: 'panes.laid'; laid: number; total: number }
  | { i: 'cmd.set'; prefs: Partial<Prefs> }
  | { i: 'cmd.retry' }
  | { i: 'cmd.translator' }
  | { i: 'close' }

export type Effect = { e: 'prefs.write'; patch: Partial<Prefs> } | { e: 'outdated' }

export type Spec =
  | { slot: 'original'; pin: boolean }
  | { slot: 'link'; target: string | null }
  | { slot: 'open'; target: string | null }
  | { slot: 'code' }
  | { slot: 'composed'; head: Head }
  | { slot: 'rows'; target: string; from: 'server' | 'here'; units: Ref[] }
  | { slot: 'timer'; at: number }

export interface Init {
  paper: PaperRef
  here: boolean
  defaults: Prefs
  visit?: State['visit']
  now: number
  visible: boolean
  online: boolean
}

/** the display shown: the address's word, else the stored one */
export const displayOf = (s: State): Display => s.visit.display ?? s.prefs.value.display
export const targetOf = (s: State): string => s.visit.target ?? s.prefs.value.target

const mint = (s: State, slot: string): [Ticket, number] => [`${slot}#${s.next}`, s.next + 1]

export function init(o: Init): State {
  const s: State = {
    paper: o.paper,
    here: o.here,
    next: 1,
    now: o.now,
    visible: o.visible,
    online: o.online,
    engaged: false,
    gate: { open: false, timer: null },
    prefs: { s: 'reading', value: o.defaults, chosen: [], refused: 0, timer: null },
    visit: o.visit ?? {},
    original: { s: 'opening', t: '', pin: false, loaded: 0 },
    doc: null,
    link: { s: 'off' },
    linkTries: 0,
    layer: { s: 'none', asked: null },
    rows: { s: 'none', target: '' },
    panes: { drawn: false, laid: 0, total: 0 },
    closed: false,
    crashed: false,
  }
  // the original's ticket first, before anything else: its first range is out before openReader returns
  const [t, next] = mint(s, 'original')
  s.original = { s: 'opening', t, pin: false, loaded: 0 }
  s.next = next
  const [g, n2] = mint(s, 'timer')
  s.gate = { open: false, timer: g }
  s.next = n2
  const [p, n3] = mint(s, 'timer')
  s.prefs = { ...s.prefs, timer: p }
  s.next = n3
  s.rows = { s: 'none', target: targetOf(s) }
  return settle(s)
}

/** a document is newer than the one held: another epoch, or a higher revision */
const newer = (held: Doc | null, d: Doc) => !held || d.epoch !== held.epoch || d.rev > held.rev

const backoff = (tries: number) => Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 2 ** Math.max(0, tries - 1))
const WHY: Record<string, LayerWhy> = {
  'not-found': 'not-found',
  'no-source': 'no-source',
  cannot: 'cannot-prepare',
  'cannot-typeset': 'cannot-prepare',
  'no-main': 'cannot-prepare',
  corrupt: 'cannot-prepare',
  'too-large': 'too-large',
  busy: 'busy',
  quota: 'limit',
  limit: 'limit',
}

/** the layer as a document states it */
function layerOfDoc(s: State, d: Doc): LayerRegion {
  const l = s.layer
  if (d.layer && (FORMATS as readonly number[]).includes(d.layer.format)) {
    if (l.s === 'ready' && l.catalog.sha256 === d.layer.catalog.sha256) return l
    // (a newer catalog: its head read again, its composed document opened anew)
    return {
      s: 'ready',
      catalog: d.layer.catalog,
      units: d.layer.units,
      head: null,
      code: l.s === 'ready' ? l.code : null,
      loaded: l.s === 'ready' && l.loaded,
      composed: null,
      open: false,
    }
  }
  if (d.layer) return { s: 'refused', why: 'outdated', retryAt: null, timer: null }
  const p = d.prepare
  if (p.state === 'running')
    return {
      s: 'preparing',
      stage: p.stage,
      position: d.position ?? null,
      progress: d.progress ?? null,
      units: p.units,
    }
  if (p.state === 'failed')
    return {
      s: 'refused',
      why: WHY[p.why ?? ''] ?? 'unreachable',
      retryAt: p.retryAt,
      timer: l.s === 'refused' ? l.timer : null,
    }
  return l.s === 'none' ? l : { s: 'none', asked: null }
}

/** the rows as a document states them, for the target followed (rows made here are the host's, never the server's) */
function rowsOfDoc(s: State, d: Doc): RowsRegion {
  const r = s.rows
  if (s.here || r.s !== 'arriving') return r
  const t = d.targets[r.target]
  if (!t) return r
  return { ...r, got: t.done, total: t.total }
}

/** the input folded into its region */
function apply(s0: State, x: Input): { s: State; effects: Effect[] } {
  const s: State = { ...s0 }
  const effects: Effect[] = []
  switch (x.i) {
    case 'env.visible':
      s.visible = x.on
      break
    case 'env.online':
      s.online = x.on
      // (a failed original or a lost link tried again at once when the browser comes online)
      if (x.on && s.original.s === 'failed' && s.original.why === 'network')
        s.original = { ...s.original, retryAt: null, timer: null }
      if (x.on && s.link.s === 'lost') s.link = { s: 'off' }
      break
    case 'time':
      s.now = x.now
      if (x.t === s.gate.timer) s.gate = { open: true, timer: null }
      else if (x.t === s.prefs.timer)
        s.prefs = { ...s.prefs, s: s.prefs.s === 'reading' ? 'unreadable' : s.prefs.s, timer: null }
      else if (s.original.s === 'failed' && x.t === s.original.timer)
        s.original = { ...s.original, retryAt: null, timer: null }
      else if (s.link.s === 'lost' && x.t === s.link.timer) s.link = { s: 'off' }
      else if (s.layer.s === 'refused' && x.t === s.layer.timer) s.layer = { s: 'none', asked: null }
      else if (s.rows.s === 'failed' && x.t === s.rows.timer) s.rows = { s: 'none', target: s.rows.target }
      break
    case 'prefs.read':
    case 'prefs.landed': {
      const v = x.value
      if (!v) break
      // (a field chosen here, or named by the address, is not undone by a landing)
      const value: Record<string, unknown> = { ...v }
      for (const k of s.prefs.chosen) value[k] = (s.prefs.value as unknown as Record<string, unknown>)[k]
      s.prefs = { ...s.prefs, s: 'landed', value: value as unknown as Prefs, timer: null }
      if (s.rows.s === 'none') s.rows = { s: 'none', target: targetOf(s) }
      break
    }
    case 'prefs.refused':
      s.prefs = { ...s.prefs, refused: s.prefs.refused + 1 }
      break
    case 'original.progress':
      if (s.original.s === 'opening' && x.t === s.original.t) s.original = { ...s.original, loaded: x.loaded }
      break
    case 'original.opened':
      if (s.original.s === 'opening' && x.t === s.original.t)
        s.original = { s: 'open', t: x.t, pin: s.original.pin, pages: x.pages, bytes: x.bytes }
      break
    case 'original.failed':
      if ((s.original.s === 'opening' || s.original.s === 'open') && x.t === s.original.t) {
        const tries = 1
        s.original = {
          s: 'failed',
          why: x.why,
          pin: s.original.pin,
          retryAt: x.why === 'network' ? s.now + backoff(tries) : null,
          timer: null,
          tries,
        }
        // (the gate opens on the original's failure: nothing waits for a page that will not come)
        s.gate = { open: true, timer: null }
      }
      break
    case 'original.mismatch':
      // the tab's bytes are not the layer's: our copy for both panes, once; a second mismatch refuses the layer
      if (s.original.s !== 'failed' && x.t === s.original.t) {
        if (s.original.pin) s.layer = { s: 'refused', why: 'mismatch', retryAt: null, timer: null }
        else {
          s.original = { s: 'opening', t: '', pin: true, loaded: 0 }
          if (s.layer.s === 'ready') s.layer = { ...s.layer, composed: null, open: false }
        }
      }
      break
    case 'paper':
      if (s.link.s === 'on' && x.t === s.link.t && newer(s.doc, x.doc)) {
        s.doc = x.doc
        s.link = { ...s.link, heard: true }
        s.linkTries = 0
        s.layer = layerOfDoc(s, x.doc)
        s.rows = rowsOfDoc(s, x.doc)
      }
      break
    case 'follow.lost':
      if (s.link.s === 'on' && x.t === s.link.t) {
        // (a paper the server has not opened: the open asked, then followed again)
        if (x.why === 'not-opened') {
          s.link = { s: 'off' }
          if (s.layer.s === 'none' && !s.layer.asked) s.layer = { s: 'none', asked: 'want' }
        } else if (x.why === 'update') s.layer = { s: 'refused', why: 'outdated', retryAt: null, timer: null }
        else {
          s.linkTries++
          s.link = { s: 'lost', why: x.why, tries: s.linkTries, timer: '' }
        }
      }
      break
    case 'open.answered':
      if (s.layer.s === 'none' && x.t === s.layer.asked) {
        if (x.refused)
          s.layer = {
            s: 'refused',
            why: x.refused.why === 'busy' ? 'busy' : 'limit',
            retryAt: x.refused.retryAt,
            timer: null,
          }
        else {
          if (x.doc && newer(s.doc, x.doc)) {
            s.doc = x.doc
            s.layer = layerOfDoc(s, x.doc)
          }
          if (s.layer.s === 'none') s.layer = { s: 'none', asked: 'done' }
        }
      }
      break
    case 'open.failed':
      if (s.layer.s === 'none' && x.t === s.layer.asked)
        s.layer = { s: 'refused', why: 'unreachable', retryAt: s.now + backoff(1), timer: null }
      break
    case 'head':
      if (s.layer.s === 'ready' && x.digest === s.layer.catalog.sha256) s.layer = { ...s.layer, head: x.head }
      break
    case 'object.refused':
      if (s.layer.s === 'ready' && (x.digest === s.layer.catalog.sha256 || x.why === 'bad'))
        s.layer =
          x.why === 'gone' ? { s: 'none', asked: null } : { s: 'refused', why: 'broken', retryAt: null, timer: null }
      break
    case 'code.loaded':
      if (s.layer.s === 'ready' && x.t === s.layer.code) s.layer = { ...s.layer, loaded: true }
      break
    case 'code.failed':
    case 'composed.failed':
      if (s.layer.s === 'ready' && (x.t === s.layer.code || x.t === s.layer.composed))
        s.layer = { s: 'refused', why: 'broken', retryAt: null, timer: null }
      break
    case 'composed.opened':
      if (s.layer.s === 'ready' && x.t === s.layer.composed) s.layer = { ...s.layer, open: true }
      break
    case 'rows.batch':
      if (s.rows.s === 'arriving' && x.t === s.rows.t) s.rows = { ...s.rows, got: x.got, total: x.total, lost: x.lost }
      break
    case 'rows.end':
      if (s.rows.s === 'arriving' && x.t === s.rows.t)
        s.rows = { s: 'complete', target: s.rows.target, got: x.got, total: x.total, lost: x.lost }
      break
    case 'rows.failed':
      if (s.rows.s === 'arriving' && x.t === s.rows.t) {
        const after = x.why.kind === 'unavailable' ? (x.why.retryAfterMs ?? null) : null
        s.rows = {
          s: 'failed',
          target: s.rows.target,
          why: x.why,
          got: s.rows.got,
          total: s.rows.total,
          lost: s.rows.lost,
          retryAt: after === null ? null : s.now + after,
          timer: null,
        }
      }
      break
    case 'panes.drawn':
      s.panes = { ...s.panes, drawn: true }
      s.gate = { open: true, timer: null }
      break
    case 'panes.laid':
      s.panes = { ...s.panes, laid: x.laid, total: x.total }
      break
    case 'cmd.set': {
      const value = { ...s.prefs.value, ...x.prefs } as Prefs
      const chosen = [...new Set([...s.prefs.chosen, ...Object.keys(x.prefs)])]
      s.prefs = { ...s.prefs, value, chosen }
      // (a choice of the visit's own fields replaces the address's word for them)
      const visit = { ...s.visit }
      for (const k of Object.keys(x.prefs)) delete visit[k as keyof typeof visit]
      s.visit = visit
      effects.push({ e: 'prefs.write', patch: x.prefs })
      // a target changed: the rows of the old one let go (the layer, the composed document and the place kept)
      if (x.prefs.target !== undefined && x.prefs.target !== s.rows.target)
        s.rows = { s: 'none', target: x.prefs.target }
      break
    }
    case 'cmd.retry':
      // (never before a named time: retryAt holds)
      if (s.original.s === 'failed' && (s.original.retryAt === null || s.original.retryAt <= s.now))
        s.original = { s: 'opening', t: '', pin: s.original.pin, loaded: 0 }
      if (
        s.layer.s === 'refused' &&
        !LASTING.has(s.layer.why) &&
        (s.layer.retryAt === null || s.layer.retryAt <= s.now)
      )
        s.layer = { s: 'none', asked: null }
      if (s.rows.s === 'failed' && (s.rows.retryAt === null || s.rows.retryAt <= s.now))
        s.rows = { s: 'none', target: s.rows.target }
      if (s.link.s === 'lost') s.link = { s: 'off' }
      break
    case 'cmd.translator':
      if (s.rows.s === 'failed') s.rows = { s: 'none', target: s.rows.target }
      break
    case 'close':
      s.closed = true
      break
  }
  if (x.i === 'paper' && s.layer.s === 'refused' && s.layer.why === 'outdated') effects.push({ e: 'outdated' })
  return { s, effects }
}

/** the tickets now wanted minted, those no longer wanted cleared (see the head of this file) */
export function settle(s0: State): State {
  const s: State = { ...s0 }
  const take = (slot: string): Ticket => {
    const t = `${slot}#${s.next}`
    s.next++
    return t
  }
  if (s.closed) return s
  // 1. the original, while there is a paper: a new ticket for every (re)opening
  if (s.original.s === 'opening' && !s.original.t) s.original = { ...s.original, t: take('original') }
  if (s.original.s === 'failed') {
    const o = s.original
    if (o.retryAt !== null && !o.timer) s.original = { ...o, timer: take('timer') }
    else if (o.retryAt === null && o.why === 'network' && s.online)
      s.original = { s: 'opening', t: take('original'), pin: o.pin, loaded: 0 }
  }
  // 2. engaged: a translated display shown in a visible document, once
  if (!s.engaged && s.visible && displayOf(s) !== 'original') s.engaged = true
  const lasting = s.layer.s === 'refused' && LASTING.has(s.layer.why)
  // 3. the link: while engaged and online, the layer not refused for good
  const target = s.here ? null : targetOf(s)
  if (s.engaged && s.online && !lasting) {
    if (s.link.s === 'off') s.link = { s: 'on', t: take('link'), target, heard: false }
    else if (s.link.s === 'on' && s.link.target !== target) s.link = { s: 'on', t: take('link'), target, heard: false }
    else if (s.link.s === 'lost' && !s.link.timer) s.link = { ...s.link, timer: take('timer') }
  } else if (s.link.s !== 'lost' || lasting) s.link = { s: 'off' }
  // (the open: asked once the follow says the paper is not opened)
  if (s.layer.s === 'none' && s.layer.asked === 'want' && s.engaged && s.online)
    s.layer = { s: 'none', asked: take('open') }
  // 4. the gate (opened by its inputs); 5. the code while ready and the gate open
  if (s.layer.s === 'ready') {
    const l = s.layer
    let code = l.code
    if (!code && s.gate.open) code = take('code')
    // 6. the composed document while the code is in, its head read, the original open
    let composed = l.composed
    if (!composed && code && l.loaded && l.head && s.original.s === 'open') composed = take('composed')
    if (composed && s.original.s !== 'open') composed = null
    s.layer = { ...l, code, composed, open: composed ? l.open : false }
  }
  if (s.layer.s === 'refused' && s.layer.retryAt !== null && !s.layer.timer)
    s.layer = { ...s.layer, timer: take('timer') }
  // 7. the rows: engaged, a target, a units digest known (the prepare's, from `preparing` on), until complete or failed for it
  const units = s.layer.s === 'ready' ? s.layer.units : s.layer.s === 'preparing' ? s.layer.units : []
  const t = targetOf(s)
  if (s.rows.target !== t && s.rows.s !== 'none') s.rows = { s: 'none', target: t }
  if (s.rows.s === 'none') {
    s.rows = { ...s.rows, target: t }
    if (s.engaged && units.length && !lasting)
      s.rows = { s: 'arriving', t: take('rows'), target: t, got: 0, total: 0, lost: 0 }
  }
  if (s.rows.s === 'arriving' && (!s.engaged || !units.length || lasting)) s.rows = { s: 'none', target: s.rows.target }
  if (s.rows.s === 'failed' && s.rows.retryAt !== null && !s.rows.timer) s.rows = { ...s.rows, timer: take('timer') }
  return s
}

/** one step: the input folded, then settled; an input whose ticket is not live is the caller's to drop (routing) */
export function step(s: State, x: Input): { state: State; effects: Effect[] } {
  const { s: a, effects } = apply(s, x)
  return { state: settle(a), effects }
}

/** the resources the state owns, by ticket */
export function resources(s: State): Map<Ticket, Spec> {
  const out = new Map<Ticket, Spec>()
  if (s.closed) return out
  if (s.original.s !== 'failed' && s.original.t) out.set(s.original.t, { slot: 'original', pin: s.original.pin })
  if (s.original.s === 'failed' && s.original.timer)
    out.set(s.original.timer, { slot: 'timer', at: s.original.retryAt ?? s.now })
  if (s.gate.timer) out.set(s.gate.timer, { slot: 'timer', at: s.now + GATE_MS })
  if (s.prefs.timer) out.set(s.prefs.timer, { slot: 'timer', at: s.now + PREFS_MS })
  if (s.link.s === 'on') out.set(s.link.t, { slot: 'link', target: s.link.target })
  if (s.link.s === 'lost' && s.link.timer) out.set(s.link.timer, { slot: 'timer', at: s.now + backoff(s.link.tries) })
  if (s.layer.s === 'none' && s.layer.asked && s.layer.asked !== 'want' && s.layer.asked !== 'done')
    out.set(s.layer.asked, { slot: 'open', target: s.here ? null : targetOf(s) })
  if (s.layer.s === 'ready') {
    if (s.layer.code) out.set(s.layer.code, { slot: 'code' })
    if (s.layer.composed && s.layer.head) out.set(s.layer.composed, { slot: 'composed', head: s.layer.head })
  }
  if (s.layer.s === 'refused' && s.layer.timer) out.set(s.layer.timer, { slot: 'timer', at: s.layer.retryAt ?? s.now })
  if (s.rows.s === 'arriving') {
    const units = s.layer.s === 'ready' ? s.layer.units : s.layer.s === 'preparing' ? s.layer.units : []
    out.set(s.rows.t, { slot: 'rows', target: s.rows.target, from: s.here ? 'here' : 'server', units })
  }
  if (s.rows.s === 'failed' && s.rows.timer) out.set(s.rows.timer, { slot: 'timer', at: s.rows.retryAt ?? s.now })
  return out
}

/** the objects wanted now, content-addressed, in priority order: the catalog (the head) while it is not read */
export function wanted(s: State): Ref[] {
  return s.layer.s === 'ready' && !s.layer.head && s.layer.code ? [s.layer.catalog] : []
}

/** the tickets an input carries (none: content-addressed or the reader's own) */
export const ticketOf = (x: Input): Ticket | null => ('t' in x ? (x as { t: Ticket }).t : null)
