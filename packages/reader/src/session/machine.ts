// The session as an explicit machine (interfaces/host DECISION, design-b §1: the session's machine first): `step(state, input)`
// pure and total; the resources each state owns declared by `resources(state)`, a map of tickets the runtime acquires and
// releases by diffing it after every step (nobody writes "release"); every asynchronous result returned as an input carrying its
// ticket, and dropped (before step) where that ticket is no longer live, so that a stale open, a late answer or a result of a
// let-go read cannot reach the state. What is content-addressed (objects by digest, rows by unit id) carries no ticket. Time is
// an input too: `step` takes the time it is applied at, and every timer is minted from it.
//
// `step = settle ∘ apply`: `apply` folds the input into its region; `settle` mints the tickets now wanted and clears the ones no
// longer wanted, in this order (design-b §1.3): the original while there is a paper; `engaged` once a translated display is chosen
// in a visible document (never back within a visit); the link while engaged, online and shown, the target one the reader sets,
// the layer not refused, the look not stopped, something still to come of our server (rows made here: until the layer is final),
// and no open asked meanwhile of a paper the follow says is not opened; the open (our server's: a follow never starts work, the
// open starts what is missing) once for each need of the visit the document shows that nothing in flight will meet, while the
// link would be wanted (`needsOf`: as our server's open would start it), with a timer for the soonest wait our server names for
// one; the gate open on the left's first page drawn, its 1.5 s, or the original's failure; the layer's code while it is ready and
// the gate open; the composed document while the code is in, the head read and drawing, and the original open; the rows while
// engaged, for a target the reader sets, once a units digest is known (rows made here: once a head that draws is read), until
// complete or failed for that target (and again for a run our server starts again; rows made here, for a newer layer of other
// units); arXiv's HTML version once the bilingual one cannot be had; a timer for each retry, wait and deadline held.
//
// Our server's pacing (PDF-READER §8, §11.10, UI.md S-R-24, S-R-26): a 429 waits the time our server names, as it names it
// (the one source of the time said, of the retry's and of the session's own next ask), and asks again, REFUSED_ASKS times in a
// row at most, then the look stops until a retry, which asks once that time has come, for as many more; an answer that moves the
// paper on ends a run of them. Our server out of reach (an ask failed twice,
// the client's) stops the look until a retry; so does a prepare followed for PREPARE_DEADLINE_MS with the tab shown. Nothing is
// asked of our server while the tab is hidden, and that time is not counted. A head that cannot draw ends the look before a unit
// goes to the service; a head over another original than the left shows puts our copy of it on the left before the layer is used.
import type { Head } from '@readarxiv/format'
import type { Prefs } from '../prefs.ts'

export type { Prefs }
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
/** a 429's wait where our server names none */
export const WAIT_MIN_MS = 1000
/** the longest reconnection time a stream may name that a follow waits (client.ts): its polling's pace alone, never a time said */
export const WAIT_MAX_MS = 600_000
/** how many 429s in a row are waited out and asked again by the reader itself; the next stops the look, said as our server's
 *  limit with its time, and a retry asks once that time has come (R run.ts REFUSED_ASKS: a visitor's limit lasts up to a day,
 *  and a tab left open asked again for as long as it stayed open, #88 E5) */
export const REFUSED_ASKS = 3
/** a prepare followed this long with the tab shown is given up: the bilingual version not to be had now, a retry asks again
 *  (R run.ts PREPARE_DEADLINE_MS) */
export const PREPARE_DEADLINE_MS = 600_000
/** the formats of the bundle this reader reads */
export const FORMATS = [1] as const

export type OriginalWhy = 'network' | 'not-found' | 'unreadable'
export type LayerWhy =
  | 'unreachable'
  | 'busy'
  | 'limit'
  /** the visitor's rate of asks (a 429 our server words so) */
  | 'rate'
  /** the network itself failed (the fetch rejected), or the browser is offline */
  | 'network'
  | 'no-source'
  | 'not-found'
  | 'cannot-prepare'
  | 'too-large'
  | 'outdated'
  | 'mismatch'
  | 'broken'
/** the refusals that last the visit (no retry, the translated displays held): the paper's own. The rest are passing: a retry
 *  asks again (today's: a layer the side refused, our copy of the original not to be had, an object not its bytes, S-R-24) */
export const LASTING: ReadonlySet<LayerWhy> = new Set([
  'no-source',
  'not-found',
  'cannot-prepare',
  'too-large',
  'outdated',
])
/** why a unit got no translation, as the translator says (format's Why, the abort aside) */
export type RowsStop =
  | { kind: 'refused' }
  | { kind: 'unavailable'; retryAfterMs?: number }
  | { kind: 'unconfigured'; code: string }
export type RowsWhy =
  | { kind: 'unavailable'; retryAfterMs?: number }
  | { kind: 'unconfigured'; code: string }
  | { kind: 'target' }
  /** our server's run of the target failed: `retryAt` the time its document names for the next (the retry's; the session's own
   *  next ask is its open's, needsOf) */
  | { kind: 'server'; retryAt?: number | null }

/** a document from the server's follow (L5's PaperDoc), as the machine reads it */
export interface Doc {
  epoch: string
  rev: number
  /** the paper's version the document is of (the latest, for an id followed with none) */
  version?: number
  prepare: {
    state: 'none' | 'running' | 'done' | 'failed'
    why: string | null
    retryAt: number | null
    stage: string | null
    units: Ref[]
    /** the prepare's attempt, numbered by our server (0 before any; none: it does not say) */
    attempt?: number
    /** after a prepare that cannot be made (`cannot`, `too-large`): whether arXiv has an HTML version of the paper, as our
     *  server knows it (null, or none: it does not say) */
    html?: boolean | null
  }
  /** `stale`: made by another build than the one our server runs, served while the paper is prepared again */
  layer: { catalog: Ref; units: Ref[]; format: number; stale?: boolean } | null
  /** the target the document was asked for, alone: its run, where an open made one */
  targets: Record<
    string,
    | {
        state: 'none' | 'running' | 'done' | 'failed'
        why: string | null
        retryAt: number | null
        rows: Ref[]
        done: number
        total: number
        /** the run's attempt (0 before any), and the units it was given (null before it is) */
        attempt?: number
        units?: Ref[] | null
      }
    | undefined
  >
}

export type OriginalRegion =
  | { s: 'opening'; t: Ticket; pin: boolean; loaded: number; total: number }
  | { s: 'open'; t: Ticket; pin: boolean; pages: number; bytes: number }
  | { s: 'failed'; why: OriginalWhy; pin: boolean; retryAt: number | null; timer: Ticket | null; tries: number }
/** why the look at our server stopped: a 429's (`busy`, `limit`, `rate`), the network itself (`network`), or our server out of
 *  reach or at fault (`unreachable`) */
export type StopWhy = 'busy' | 'limit' | 'rate' | 'network' | 'unreachable'
export type LinkRegion =
  | { s: 'off' }
  /** `lost`: its stream broke, fell silent or ended while work runs, and is asked again, nothing heard since (the website's
   *  "reconnecting"); a stream our server ended after a document in which nothing runs is not lost (client.ts follow) */
  | { s: 'on'; t: Ticket; target: string | null; heard: boolean; lost?: boolean }
  /** the look stopped: `retryAt` our server's time (a 429's, as it named it: said, and a retry before it asks nothing; null where
   *  it named none), `wake` when the session asks again by itself (null: a retry alone asks), its timer */
  | { s: 'stopped'; why: StopWhy; retryAt: number | null; wake: number | null; timer: Ticket | null }
export type LayerRegion =
  | { s: 'none' }
  /** `stage`: the prepare's, as our server's record names it (PREPARE_STAGES: fetching, compiling, units, laying-out, bundle), null
   *  before the first */
  | { s: 'preparing'; stage: string | null; units: Ref[] }
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
/** the rows of the target: taken, ended or failed. Their counts are none of the session's: the reader counts the rows it holds
 *  over the units of the layer shown (session/rows.ts viewOf), one statement, which neither our server's per attempt `done` and
 *  `total` nor the rows a source told are */
export type RowsRegion =
  | { s: 'none'; target: string }
  | { s: 'arriving'; t: Ticket; target: string }
  /** `stopped`: why the units lost were lost (the service's word for them: the run stopped short), null where none was */
  | { s: 'complete'; target: string; stopped: RowsStop | null }
  | { s: 'failed'; target: string; why: RowsWhy; retryAt: number | null; timer: Ticket | null }
/** the open (POST /api/v2/open: our server starts what the paper lacks): the ask under way (`t`, for the needs `for`, its target
 *  `target`), the needs an answered open was asked for this visit (`asked`: each once; a refused or failed ask gives its needs
 *  back), whether the follow said the paper is not opened (`missing`), and the timer of the soonest wait our server names for a
 *  need not yet asked (`at`) */
export interface OpenRegion {
  t: Ticket | null
  for: readonly string[]
  target: string | null
  asked: readonly string[]
  missing: boolean
  at: number | null
  timer: Ticket | null
}
/** arXiv's HTML version of the paper, asked once a visit and again where our server's word on it changes: not yet, under way
 *  (the answer before kept meanwhile, where there was one), or its address (null: arXiv has none). `said`: our server's word the
 *  ask was made on (its document's `prepare.html`; null where it said none), which the answer is taken from first */
export type HtmlRegion =
  | { s: 'unknown' }
  | { s: 'asking'; t: Ticket; said: boolean | null; url?: string | null }
  | { s: 'known'; url: string | null; said: boolean | null }
/** our server's word on arXiv's HTML version of the paper, where its document gives one */
const htmlSaid = (d: Doc | null): boolean | null => (typeof d?.prepare.html === 'boolean' ? d.prepare.html : null)

export interface State {
  paper: PaperRef
  /** rows made here (the host's translate): the open names no target, the link asks for none */
  here: boolean
  /** the target languages the reader sets (the typesetter's); null: every one */
  targets: readonly string[] | null
  next: number
  now: number
  visible: boolean
  online: boolean
  /** the page put away (a `pagehide` into the back-forward cache) until it is shown again: our server neither followed nor asked,
   *  no timer live; the original's reading, the panes, the rows and the layer kept as they are */
  away: boolean
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
  /** the original held on screen by the host for now (its rule: the website's narrow window while the paper is made, a
   *  refusal for now with nothing laid), whatever display is chosen, until the reader chooses one; not a choice, so the run
   *  the display chosen engages goes on */
  held: boolean
  original: OriginalRegion
  doc: Doc | null
  /** the target the document held was read for (null: none named): its `targets` speak for that one alone */
  docFor: string | null
  link: LinkRegion
  open: OpenRegion
  /** the 429s answered in a row (REFUSED_ASKS): none since an answer moved the paper on, or a retry */
  refusals: number
  /** the network's failures in a row, since a document was heard: the pace of asking again while the browser says it is online */
  netTries: number
  /** how long the prepare has been followed with the tab shown (its deadline's), since when it is now, and the deadline's timer */
  prepare: { spent: number; since: number | null; timer: Ticket | null }
  layer: LayerRegion
  /** the original the left is taken to show (the digest of the head's original a composed document was opened over), null before */
  bound: string | null
  rows: RowsRegion
  /** the paper's title once known ('' until then): the PDF's, else the abstract page's; never put back */
  title: string
  html: HtmlRegion
  panes: { drawn: boolean; laid: number; total: number }
  closed: boolean
  crashed: boolean
}

export type Input =
  | { i: 'env.visible'; on: boolean }
  | { i: 'env.online'; on: boolean }
  /** the page put away into the back-forward cache, or shown from it again */
  | { i: 'env.away'; on: boolean }
  | { i: 'time'; t: Ticket; now: number }
  | { i: 'prefs.read'; value: Prefs | null }
  | { i: 'prefs.landed'; value: Prefs }
  | { i: 'prefs.refused' }
  | { i: 'original.progress'; t: Ticket; loaded: number; total?: number }
  | { i: 'original.opened'; t: Ticket; pages: number; bytes: number }
  | { i: 'original.failed'; t: Ticket; why: OriginalWhy }
  /** the head's chunk digests do not hold the bytes read, or a chunk read again is not the one first read: our copy for both
   *  panes */
  | { i: 'original.mismatch'; t: Ticket }
  | { i: 'paper'; t: Ticket; doc: Doc }
  /** the follow's stream lost, asked again (client.ts onQuiet) */
  | { i: 'link.quiet'; t: Ticket }
  /** the follow's end (client.ts Refused): its why, a 429's wait and the document it carried */
  | { i: 'follow.lost'; t: Ticket; why: string; afterMs?: number | null; doc?: Doc | null }
  | {
      i: 'open.answered'
      t: Ticket
      doc: Doc | null
      refused?: { why: 'quota' | 'busy' | 'rate'; afterMs: number | null }
    }
  | { i: 'open.failed'; t: Ticket; why: string }
  | { i: 'head'; digest: string; head: Head }
  | { i: 'object.refused'; digest: string; why: 'gone' | 'bad' | 'network' }
  | { i: 'code.loaded'; t: Ticket }
  | { i: 'code.failed'; t: Ticket }
  | { i: 'composed.opened'; t: Ticket }
  | { i: 'composed.failed'; t: Ticket }
  | { i: 'rows.end'; t: Ticket; stopped?: RowsStop | null }
  | { i: 'rows.failed'; t: Ticket; why: RowsWhy }
  /** the paper's title as the original's document names it, or the abstract page's ('' for none): the first one known stays */
  | { i: 'paper.title'; title: string }
  | { i: 'html.answered'; t: Ticket; url: string | null }
  | { i: 'panes.drawn' }
  | { i: 'panes.laid'; laid: number; total: number }
  | { i: 'cmd.set'; prefs: Partial<Prefs> }
  | { i: 'cmd.retry' }
  /** the host's hold of the original on screen, on or off (Command hold) */
  | { i: 'cmd.hold'; on: boolean }
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
  | { slot: 'html' }
  | { slot: 'timer'; at: number }

export interface Init {
  paper: PaperRef
  here: boolean
  defaults: Prefs
  visit?: State['visit']
  /** the target languages the reader sets; none: every one */
  targets?: readonly string[] | null
  now: number
  visible: boolean
  online: boolean
}

/** the display chosen: the address's word, else the stored one */
export const chosenOf = (s: State): Display => s.visit.display ?? s.prefs.value.display
export const targetOf = (s: State): string => s.visit.target ?? s.prefs.value.target
/** whether the reader sets a target */
export const supported = (s: State, target: string): boolean => !s.targets || s.targets.includes(target)
/**
 * Why the original is held for the visit, whatever display is chosen (R session/host.ts `held`, `heldFor`): the paper's own (a
 * lasting refusal: no language mends it), or the target language's (one the reader does not set, lifted by a language it sets);
 * null where nothing holds it
 */
export function holdOf(s: State): 'paper' | 'target' | null {
  if (s.layer.s === 'refused' && LASTING.has(s.layer.why)) return 'paper'
  return s.engaged && !supported(s, targetOf(s)) ? 'target' : null
}
/** the display shown: the one chosen, the original where it is held (the paper's, the language's, or the host's for now) */
export const displayOf = (s: State): Display => (holdOf(s) || s.held ? 'original' : chosenOf(s))
/** whether a composed translation is to be shown: the display shows the translation and the reader sets the target (what is
 *  read ahead for laying it waits on this: a visit that shows the original asks none of it) */
export const translationShown = (s: State): boolean => displayOf(s) !== 'original' && supported(s, targetOf(s))

const mint = (s: State, slot: string): [Ticket, number] => [`${slot}#${s.next}`, s.next + 1]

export function init(o: Init): State {
  const s: State = {
    paper: o.paper,
    here: o.here,
    targets: o.targets ?? null,
    next: 1,
    now: o.now,
    visible: o.visible,
    online: o.online,
    away: false,
    engaged: false,
    gate: { open: false, timer: null },
    prefs: { s: 'reading', value: o.defaults, chosen: [], refused: 0, timer: null },
    visit: o.visit ?? {},
    held: false,
    original: { s: 'opening', t: '', pin: false, loaded: 0, total: 0 },
    doc: null,
    docFor: null,
    link: { s: 'off' },
    open: { t: null, for: [], target: null, asked: [], missing: false, at: null, timer: null },
    refusals: 0,
    netTries: 0,
    prepare: { spent: 0, since: null, timer: null },
    layer: { s: 'none' },
    bound: null,
    rows: { s: 'none', target: '' },
    title: '',
    html: { s: 'unknown' },
    panes: { drawn: false, laid: 0, total: 0 },
    closed: false,
    crashed: false,
  }
  // the original's ticket first, before anything else: its first range is out before openReader returns
  const [t, next] = mint(s, 'original')
  s.original = { s: 'opening', t, pin: false, loaded: 0, total: 0 }
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
const sameRefs = (a: readonly Ref[], b: readonly Ref[]) =>
  a.length === b.length && a.every((x, i) => x.sha256 === b[i]?.sha256)

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
  if (p.state === 'running') return { s: 'preparing', stage: p.stage, units: p.units }
  if (p.state === 'failed')
    return {
      s: 'refused',
      why: WHY[p.why ?? ''] ?? 'unreachable',
      retryAt: p.retryAt,
      timer: l.s === 'refused' ? l.timer : null,
    }
  return { s: 'none' }
}

/** the rows as a document read for their target states them. Rows that ended are taken again (those held kept, the missing
 *  alone asked: reader.ts rows) for a run our server started again (a retry, a prepare's new units), whether it is heard running
 *  or only ended (frames coalesce, a follow asked again lands after the end): the target's run running, or another attempt or
 *  rows than the document before named (`was`). Rows made here are the host's, of the layer's units: those that ended are taken
 *  again where the layer is now of other units than the one before (`before`: a stale layer's replacement) */
function rowsOfDoc(s: State, d: Doc, was: Doc['targets'][string], before: LayerRegion): RowsRegion {
  const r = s.rows
  if (s.here) {
    const same = before.s === 'ready' && s.layer.s === 'ready' && sameRefs(before.units, s.layer.units)
    return r.s === 'complete' && s.layer.s === 'ready' && !same ? { s: 'none', target: r.target } : r
  }
  if (s.docFor !== r.target) return r
  const t = d.targets[r.target]
  if (!t) return r
  const ended = r.s === 'complete' || (r.s === 'failed' && r.why.kind === 'server')
  const again =
    t.state === 'running' ||
    !was ||
    (t.attempt ?? 0) !== (was.attempt ?? 0) ||
    t.rows.some((x) => !was.rows.some((y) => y.sha256 === x.sha256))
  return ended && again ? { s: 'none', target: r.target } : r
}
/**
 * A document heard, read for `target` (null: none named): held where it is newer, the layer and the rows as it states them. One
 * read for another target than the one held is newer where it is the visit's target now: our server's revision is the paper's,
 * not the view's, and a document names the asked target alone (a language switched to is answered at the revision held)
 */
function heard(s: State, d: Doc, target: string | null) {
  const now = s.here ? null : targetOf(s)
  if (s.doc && (target === s.docFor ? !newer(s.doc, d) : target !== now)) return
  const was = s.docFor === target && target !== null ? s.doc?.targets[target] : undefined
  const before = s.layer
  s.doc = d
  s.docFor = target
  s.layer = layerOfDoc(s, d)
  s.rows = rowsOfDoc(s, d, was, before)
}
/** a need of the visit (`needsOf`): its name, which carries the attempt it follows (an open is asked once for each), and the
 *  time our server's wait for it ends (null: none, or over) */
export interface Need {
  id: string
  at: number | null
}
/**
 * What the paper lacks for this visit that nothing in flight will bring, as our server's open would start it (its R3: worker v2
 * machine.ts `wantPrepare`, `wantTranslate` by an open), each with the end of the wait our server names for it:
 * - the paper itself, and the target's run with it, where the follow says the paper is not opened;
 * - the prepare, where there is no layer or the layer is stale, none runs, and no failure of the paper's own stands (failed with
 *   no retry: our server prepares it again under another build alone, which the document does not say);
 * - the target's run (rows made here: none), where the document read for the target names none (only an open makes one), or,
 *   over a layer with no prepare running (a prepare's units start a run our server has; with neither, nothing can start one),
 *   one not started, failed, or done on other units than the layer's
 */
export function needsOf(s: State): Need[] {
  const target = s.here ? null : targetOf(s)
  if (s.open.missing) return [{ id: 'paper', at: null }, ...(target ? [{ id: `${target}#0`, at: null }] : [])]
  const d = s.doc
  if (!d) return []
  const due = (at: number | null) => (at === null || at <= s.now ? null : at)
  const out: Need[] = []
  const p = d.prepare
  if ((!d.layer || d.layer.stale) && p.state !== 'running' && !(p.state === 'failed' && p.retryAt === null))
    out.push({ id: `prepare#${p.attempt ?? 0}`, at: due(p.retryAt) })
  if (target !== null && s.docFor === target) {
    const t = d.targets[target]
    if (!t) out.push({ id: `${target}#0`, at: null })
    else if (
      p.state !== 'running' &&
      !!d.layer &&
      (t.state === 'none' ||
        t.state === 'failed' ||
        (t.state === 'done' && !!t.units && !sameRefs(t.units, d.layer.units)))
    )
      out.push({ id: `${target}#${t.attempt ?? 0}`, at: due(t.retryAt) })
  }
  return out
}
/** whether the layer shown is our server's last word on it: ready, of the build our server runs, and no prepare running. A layer
 *  is replaced by a prepare alone: one running (its end writes a layer), or one to come (a stale layer is served while the paper
 *  is prepared again). Rows made here take nothing else of our server: past this, nothing more can come for them */
const layerFinal = (s: State) => s.layer.s === 'ready' && !s.doc?.layer?.stale && s.doc?.prepare.state !== 'running'
/** whether the open is asked for some need now: one whose wait is over, not yet asked this visit */
const openWanted = (s: State) => needsOf(s).some((n) => n.at === null && !s.open.asked.includes(n.id))
/** a 429: our server's time as it names it (a second where it names none), waited out and asked again (REFUSED_ASKS in a row
 *  at most), then the look stopped until a retry, which asks once that time has come */
function refusedFor(s: State, why: 'busy' | 'limit' | 'rate', afterMs: number | null | undefined) {
  // (the visitor's rate of asks is no limit to stop at: its wait is a minute, waited out and asked again by itself; our server's
  // capacity neither: the paper waits in line, asked again at our server's time for as long as it answers so, the coordinator's
  // decision 5 of 2026-11-11)
  if (why === 'limit') s.refusals++
  const retryAt =
    s.now + (typeof afterMs === 'number' && Number.isFinite(afterMs) && afterMs >= 0 ? afterMs : WAIT_MIN_MS)
  const wake = why === 'busy' || s.refusals <= REFUSED_ASKS ? retryAt : null
  s.link = { s: 'stopped', why, retryAt, wake, timer: null }
}
/** the network itself failed: asked again by itself, at once when the browser comes online (env.online), and meanwhile, while it
 *  says it is online, at a growing pace (a second, doubled to thirty at most); no time said */
const networkLost = (s: State) => {
  s.netTries++
  s.link = {
    s: 'stopped',
    why: 'network',
    retryAt: null,
    wake: s.online ? s.now + backoff(s.netTries) : null,
    timer: null,
  }
}
const outOfReach = (s: State) => {
  s.link = { s: 'stopped', why: 'unreachable', retryAt: null, wake: null, timer: null }
}

/** the input folded into its region */
function apply(s0: State, x: Input): { s: State; effects: Effect[] } {
  const s: State = { ...s0 }
  const effects: Effect[] = []
  switch (x.i) {
    case 'env.visible':
      s.visible = x.on
      break
    case 'env.away':
      s.away = x.on
      break
    case 'env.online':
      s.online = x.on
      // (a failed original tried again at once when the browser comes online)
      if (x.on && s.original.s === 'failed' && s.original.why === 'network')
        s.original = { ...s.original, retryAt: null, timer: null }
      // (the look the network stopped: asked again at once when the browser comes online, not before while it is offline)
      if (s.link.s === 'stopped' && s.link.why === 'network')
        s.link = x.on ? { s: 'off' } : { ...s.link, wake: null, timer: null }
      break
    case 'time':
      s.now = x.now
      if (x.t === s.gate.timer) s.gate = { open: true, timer: null }
      else if (x.t === s.prefs.timer)
        s.prefs = { ...s.prefs, s: s.prefs.s === 'reading' ? 'unreadable' : s.prefs.s, timer: null }
      else if (s.original.s === 'failed' && x.t === s.original.timer)
        s.original = { ...s.original, retryAt: null, timer: null }
      else if (s.link.s === 'stopped' && x.t === s.link.timer) s.link = { s: 'off' }
      else if (x.t === s.open.timer) s.open = { ...s.open, at: null, timer: null }
      else if (x.t === s.prepare.timer) {
        // (the prepare followed past its deadline: given up for now, a retry asks again)
        s.prepare = { spent: PREPARE_DEADLINE_MS, since: null, timer: null }
        outOfReach(s)
      } else if (s.layer.s === 'refused' && x.t === s.layer.timer) s.layer = { s: 'none' }
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
      if (s.original.s === 'opening' && x.t === s.original.t)
        s.original = { ...s.original, loaded: x.loaded, total: x.total ?? s.original.total }
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
          s.original = { s: 'opening', t: '', pin: true, loaded: 0, total: 0 }
          if (s.layer.s === 'ready') s.layer = { ...s.layer, composed: null, open: false }
        }
      }
      break
    case 'link.quiet':
      if (s.link.s === 'on' && x.t === s.link.t && !s.link.lost) s.link = { ...s.link, lost: true }
      break
    case 'paper':
      if (s.link.s === 'on' && x.t === s.link.t) {
        const target = s.link.target
        s.link = { ...s.link, heard: true, lost: false }
        s.netTries = 0
        heard(s, x.doc, target)
        // (an answer that moves the paper on ends a run of 429s: one in which the paper lacks nothing the open is wanted for, as
        // today's catalog or prepare under way; one of a paper still lacking it does not, as today's 404 between two prepares)
        if (!openWanted(s)) s.refusals = 0
      }
      break
    case 'follow.lost':
      if (s.link.s === 'on' && x.t === s.link.t) {
        const target = s.link.target
        s.link = { s: 'off' }
        if (x.why === 'not-opened') {
          // (a paper the server has not opened: the open asked, once a visit; still not opened after it, it cannot be had)
          if (s.open.asked.includes('paper'))
            s.layer = { s: 'refused', why: 'cannot-prepare', retryAt: null, timer: null }
          else s.open = { ...s.open, missing: true }
        } else if (x.why === 'not-found') s.layer = { s: 'refused', why: 'not-found', retryAt: null, timer: null }
        else if (x.why === 'update') s.layer = { s: 'refused', why: 'outdated', retryAt: null, timer: null }
        else if (x.why === 'busy' || x.why === 'limit' || x.why === 'rate') {
          if (x.doc) heard(s, x.doc, target)
          refusedFor(s, x.why, x.afterMs)
        } else if (x.why === 'network') networkLost(s)
        else outOfReach(s)
      }
      break
    case 'open.answered':
      if (x.t === s.open.t) {
        const o = s.open
        // (refused for capacity, nothing was started: its needs given back, so that the look after the wait asks them again)
        s.open = { ...o, t: null, for: [], missing: false, asked: x.refused ? o.asked : [...o.asked, ...o.for] }
        if (x.doc) heard(s, x.doc, o.target)
        if (x.refused)
          refusedFor(
            s,
            x.refused.why === 'quota' ? 'limit' : x.refused.why === 'rate' ? 'rate' : 'busy',
            x.refused.afterMs,
          )
        else {
          s.refusals = 0
          // (the follow asked again at once: one of a paper in which nothing ran asks again a minute on, client.ts IDLE_MS,
          // and what the open started is followed at its own pace)
          if (s.link.s === 'on') s.link = { s: 'off' }
        }
      }
      break
    case 'open.failed':
      if (x.t === s.open.t) {
        s.open = { ...s.open, t: null, for: [], missing: false }
        if (x.why === 'update') s.layer = { s: 'refused', why: 'outdated', retryAt: null, timer: null }
        else if (x.why === 'not-found') s.layer = { s: 'refused', why: 'not-found', retryAt: null, timer: null }
        // (an open that never reached our server: given back, so that a retry asks it again)
        else if (x.why === 'network') networkLost(s)
        else outOfReach(s)
      }
      break
    case 'head':
      if (s.layer.s === 'ready' && x.digest === s.layer.catalog.sha256) {
        s.layer = { ...s.layer, head: x.head }
        // a head that cannot draw (its add-on refused: nothing laid on any page) ends the look, before a unit goes to the service
        if (!x.head.addOn) s.layer = { s: 'refused', why: 'cannot-prepare', retryAt: null, timer: null }
        else if (s.bound !== null && s.bound !== x.head.original.sha256 && s.original.s !== 'failed') {
          // the left is known to show another PDF than this head's original (a retry, a layer made again over a file arXiv
          // replaced): our copy of it shown first, never this layer over the old one
          s.original = { s: 'opening', t: '', pin: true, loaded: 0, total: 0 }
          s.layer = { ...s.layer, composed: null, open: false }
        }
      }
      break
    case 'object.refused':
      if (s.layer.s === 'ready' && (x.digest === s.layer.catalog.sha256 || x.why === 'bad'))
        s.layer =
          x.why === 'gone'
            ? { s: 'none' }
            : { s: 'refused', why: x.why === 'network' ? 'unreachable' : 'broken', retryAt: null, timer: null }
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
      if (s.layer.s === 'ready' && x.t === s.layer.composed) {
        s.layer = { ...s.layer, open: true }
        s.bound = s.layer.head?.original.sha256 ?? s.bound
      }
      break
    case 'rows.end':
      if (s.rows.s === 'arriving' && x.t === s.rows.t)
        s.rows = { s: 'complete', target: s.rows.target, stopped: x.stopped ?? null }
      break
    case 'rows.failed':
      if (s.rows.s === 'arriving' && x.t === s.rows.t) {
        const after = x.why.kind === 'unavailable' ? (x.why.retryAfterMs ?? null) : null
        s.rows = {
          s: 'failed',
          target: s.rows.target,
          why: x.why,
          retryAt: x.why.kind === 'server' ? (x.why.retryAt ?? null) : after === null ? null : s.now + after,
          timer: null,
        }
      }
      break
    case 'paper.title':
      if (!s.title && x.title) s.title = x.title
      break
    case 'html.answered':
      if (s.html.s === 'asking' && x.t === s.html.t) s.html = { s: 'known', url: x.url, said: s.html.said }
      break
    case 'panes.drawn':
      s.panes = { ...s.panes, drawn: true }
      s.gate = { open: true, timer: null }
      break
    case 'panes.laid':
      s.panes = { ...s.panes, laid: x.laid, total: x.total }
      break
    case 'cmd.set': {
      const patch = { ...x.prefs }
      // (a translated display asked while the original is held: nothing, not written either)
      if (patch.display !== undefined && patch.display !== 'original' && holdOf(s)) delete patch.display
      if (!Object.keys(patch).length) break
      const value = { ...s.prefs.value, ...patch } as Prefs
      const chosen = [...new Set([...s.prefs.chosen, ...Object.keys(patch)])]
      s.prefs = { ...s.prefs, value, chosen }
      // (a choice of the visit's own fields replaces the address's word for them)
      const visit = { ...s.visit }
      for (const k of Object.keys(patch)) delete visit[k as keyof typeof visit]
      s.visit = visit
      // (the reader's own choice of a display ends the host's hold)
      if (patch.display !== undefined) s.held = false
      effects.push({ e: 'prefs.write', patch })
      // a target changed: the rows of the old one let go (the layer, the composed document and the place kept)
      if (patch.target !== undefined && patch.target !== s.rows.target) s.rows = { s: 'none', target: patch.target }
      break
    }
    case 'cmd.retry':
      // (never before a named time: retryAt holds)
      if (s.original.s === 'failed' && (s.original.retryAt === null || s.original.retryAt <= s.now))
        s.original = { s: 'opening', t: '', pin: s.original.pin, loaded: 0, total: 0 }
      if (
        s.layer.s === 'refused' &&
        !LASTING.has(s.layer.why) &&
        (s.layer.retryAt === null || s.layer.retryAt <= s.now)
      )
        s.layer = { s: 'none' }
      // (the reader's retry asks our server again for what the paper still lacks, each need once more)
      s.open = { ...s.open, asked: [] }
      if (s.rows.s === 'failed' && (s.rows.retryAt === null || s.rows.retryAt <= s.now))
        s.rows = { s: 'none', target: s.rows.target }
      // (a 429's wait under way: the look asks again once it has passed, never sooner; a look stopped asks at once, the 429s
      // and the prepare's deadline counted anew)
      if (s.link.s === 'stopped' && (s.link.retryAt === null || s.link.retryAt <= s.now)) {
        s.link = { s: 'off' }
        s.refusals = 0
        s.prepare = { spent: 0, since: null, timer: null }
      }
      break
    case 'cmd.hold':
      s.held = x.on
      break
    case 'cmd.translator':
      if (s.rows.s === 'failed') s.rows = { s: 'none', target: s.rows.target }
      break
    case 'close':
      s.closed = true
      break
  }
  if (
    s.layer.s === 'refused' &&
    s.layer.why === 'outdated' &&
    !(s0.layer.s === 'refused' && s0.layer.why === 'outdated')
  )
    effects.push({ e: 'outdated' })
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
      s.original = { s: 'opening', t: take('original'), pin: o.pin, loaded: 0, total: 0 }
  }
  // 2. engaged: a translated display chosen in a visible document, once
  if (!s.engaged && s.visible && chosenOf(s) !== 'original') s.engaged = true
  const lasting = s.layer.s === 'refused' && LASTING.has(s.layer.why)
  const target = targetOf(s)
  const sets = supported(s, target)
  // 3. the link: engaged, online and shown, a target the reader sets, the layer not refused, the look not stopped, something
  // still to come of our server (rows made here: until the layer is final, `layerFinal`), and no open wanted or under way of a
  // paper the follow says is not opened (no 404s in a row); none while the page is put away (the follow let go, an open under
  // way given back, to be asked again once it is shown)
  if (s.away && s.open.t) s.open = { ...s.open, t: null, for: [] }
  const opening = s.open.missing
  // (offline with no layer: the network's, as every ask of today's failed at once; asked again once the browser is online)
  if (s.engaged && !s.online && sets && s.layer.s !== 'ready' && s.layer.s !== 'refused' && s.link.s !== 'stopped')
    s.link = { s: 'stopped', why: 'network', retryAt: null, wake: null, timer: null }
  const wantLink =
    s.engaged &&
    s.online &&
    s.visible &&
    !s.away &&
    sets &&
    s.layer.s !== 'refused' &&
    !opening &&
    !(s.here && layerFinal(s))
  const linkTarget = s.here ? null : target
  if (s.link.s === 'stopped') {
    if (lasting) s.link = { s: 'off' }
    else if (s.link.wake !== null && !s.link.timer) s.link = { ...s.link, timer: take('timer') }
  } else if (!wantLink) s.link = { s: 'off' }
  else if (s.link.s === 'off') s.link = { s: 'on', t: take('link'), target: linkTarget, heard: false }
  else if (s.link.target !== linkTarget) s.link = { s: 'on', t: take('link'), target: linkTarget, heard: false }
  // (the open: once for each need the document shows (needsOf) whose wait is over, while the link would be wanted, the layer not
  // refused; the soonest wait of one not yet asked timed)
  const may = s.engaged && s.online && s.visible && !s.away && sets && s.layer.s !== 'refused' && s.link.s !== 'stopped'
  if (may && !s.open.t) {
    const needs = needsOf(s).filter((n) => !s.open.asked.includes(n.id))
    const now = needs.filter((n) => n.at === null).map((n) => n.id)
    if (now.length) s.open = { ...s.open, t: take('open'), for: now, target: linkTarget, at: null, timer: null }
    else {
      const at = needs.reduce<number | null>((a, n) => (n.at !== null && (a === null || n.at < a) ? n.at : a), null)
      if (at === null) s.open = { ...s.open, at: null, timer: null }
      else if (at !== s.open.at || !s.open.timer) s.open = { ...s.open, at, timer: take('timer') }
    }
  } else if (s.open.timer) s.open = { ...s.open, at: null, timer: null }
  // (the prepare's deadline: the time it is followed with the tab shown)
  const timing = s.layer.s === 'preparing' && s.link.s === 'on'
  if (timing && s.prepare.since === null) s.prepare = { ...s.prepare, since: s.now }
  if (!timing && s.prepare.since !== null)
    s.prepare = { spent: s.prepare.spent + Math.max(0, s.now - s.prepare.since), since: null, timer: null }
  if (timing && !s.prepare.timer) s.prepare = { ...s.prepare, timer: take('timer') }
  // 4. the gate (opened by its inputs); 5. the code while ready and the gate open
  if (s.layer.s === 'ready') {
    const l = s.layer
    let code = l.code
    if (!code && s.gate.open) code = take('code')
    // 6. the composed document while the code is in, its head read and drawing, the original open
    let composed = l.composed
    if (!composed && code && l.loaded && l.head?.addOn && s.original.s === 'open') composed = take('composed')
    if (composed && s.original.s !== 'open') composed = null
    s.layer = { ...l, code, composed, open: composed ? l.open : false }
  }
  if (s.layer.s === 'refused' && s.layer.retryAt !== null && !s.layer.timer)
    s.layer = { ...s.layer, timer: take('timer') }
  // 7. the rows: engaged, a target the reader sets, a units digest known (the prepare's, from `preparing` on; rows made here
  // once a head that draws is read), until complete or failed for it
  const units = unitsOf(s)
  if (s.rows.target !== target && s.rows.s !== 'none') s.rows = { s: 'none', target }
  if (s.engaged && !sets) {
    if (s.rows.s !== 'failed') s.rows = { s: 'failed', target, why: { kind: 'target' }, retryAt: null, timer: null }
  } else if (s.rows.s === 'none') {
    s.rows = { ...s.rows, target }
    if (s.engaged && units.length && !lasting) s.rows = { s: 'arriving', t: take('rows'), target }
  }
  if (s.rows.s === 'arriving' && (!s.engaged || !units.length || lasting)) s.rows = { s: 'none', target: s.rows.target }
  // (a translator's wait is the rows' own to wait out; our server's is its open's, timed by needsOf from the document)
  if (s.rows.s === 'failed' && s.rows.retryAt !== null && !s.rows.timer && s.rows.why.kind !== 'server')
    s.rows = { ...s.rows, timer: take('timer') }
  // 8. arXiv's HTML version, once the bilingual one cannot be had (now or for the paper, or in the language): once a visit, and
  // again where our server's word on it changes (a refusal for now that said nothing, then a lasting one saying arXiv has it)
  const said = htmlSaid(s.doc)
  if (s.html.s === 'unknown' && s.engaged && (s.layer.s === 'refused' || s.link.s === 'stopped' || holdOf(s)))
    s.html = { s: 'asking', t: take('html'), said }
  else if (s.html.s !== 'unknown' && s.html.said !== said)
    s.html = { s: 'asking', t: take('html'), said, ...(s.html.url !== undefined ? { url: s.html.url } : {}) }
  return s
}

/** the units the rows are made of: the layer's, or the prepare's from `preparing` on; rows made here only once a head that draws
 *  is read (nothing goes to the visitor's service for a paper whose pages the layer will not draw) */
function unitsOf(s: State): Ref[] {
  if (s.layer.s === 'ready') return s.here && !s.layer.head?.addOn ? [] : s.layer.units
  if (s.layer.s === 'preparing' && !s.here) return s.layer.units
  return []
}

/** one step at `now` (the time it is applied at; the state's own where none is given): the input folded, then settled; an input
 *  whose ticket is not live is the caller's to drop (routing) */
export function step(s: State, x: Input, now?: number): { state: State; effects: Effect[] } {
  const at = now === undefined || now === s.now ? s : { ...s, now }
  const { s: a, effects } = apply(at, x)
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
  if (s.link.s === 'stopped' && s.link.timer) out.set(s.link.timer, { slot: 'timer', at: s.link.wake ?? s.now })
  if (s.prepare.timer)
    out.set(s.prepare.timer, {
      slot: 'timer',
      at: (s.prepare.since ?? s.now) + PREPARE_DEADLINE_MS - s.prepare.spent,
    })
  if (s.open.t) out.set(s.open.t, { slot: 'open', target: s.open.target })
  if (s.open.timer) out.set(s.open.timer, { slot: 'timer', at: s.open.at ?? s.now })
  if (s.layer.s === 'ready') {
    if (s.layer.code) out.set(s.layer.code, { slot: 'code' })
    if (s.layer.composed && s.layer.head) out.set(s.layer.composed, { slot: 'composed', head: s.layer.head })
  }
  if (s.layer.s === 'refused' && s.layer.timer) out.set(s.layer.timer, { slot: 'timer', at: s.layer.retryAt ?? s.now })
  if (s.rows.s === 'arriving')
    out.set(s.rows.t, { slot: 'rows', target: s.rows.target, from: s.here ? 'here' : 'server', units: unitsOf(s) })
  if (s.rows.s === 'failed' && s.rows.timer) out.set(s.rows.timer, { slot: 'timer', at: s.rows.retryAt ?? s.now })
  if (s.html.s === 'asking') out.set(s.html.t, { slot: 'html' })
  // (put away: no timer live; each comes back with the page, its time kept, one due meanwhile told at once)
  if (s.away) for (const [t, x] of out) if (x.slot === 'timer') out.delete(t)
  return out
}

/** the objects wanted now, content-addressed, in priority order: the catalog (the head) while it is not read, then the layer's
 *  units (the contents' headings, and the rows made here) */
export function wanted(s: State): Ref[] {
  if (s.layer.s !== 'ready' || !s.layer.code) return []
  return s.layer.head ? s.layer.units : [s.layer.catalog]
}

/** the tickets an input carries (none: content-addressed or the reader's own) */
export const ticketOf = (x: Input): Ticket | null => ('t' in x ? (x as { t: Ticket }).t : null)
