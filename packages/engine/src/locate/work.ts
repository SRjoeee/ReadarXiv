// The record locate's phases work over: the index, built once from the instrument, A's ink and the
// mapping and never written after; the record each phase reads and writes (the order locate.ts calls them in is the contract);
// the types of what locate states (Member, Located, Place); and the names two or more phase files read.
import type { El, Ink, Label, Line, LinkBorder, Piece, Room, Style } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import { setPagesOf } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import type { PageInk } from '../ink.ts'
import type { Instrument, InstrumentUnit, TexFrame } from '../instrument.ts'
import { fixedFacesOf } from './facts.ts'
import type { DisplayLine, InkInput, InkStats } from './ink.ts'
import { r2 } from './lines.ts'
import type { FloatLine } from './ledger.ts'
import type { Word } from './words.ts'

/** where a located unit stands on A against B */
export type Place = 'same' | 'shifted' | 'respaced' | 'rebroken'

export interface Member {
  ord: number
  /** the instrument's unit (-1: born on A) */
  unit: number
  id: string
  kind: string
  /** a babel name's key, for a name's occurrence */
  name?: string
  located: boolean
  /** why it is not located: the class of its first unmatched glyph, `box`, `no ink` or the instrument's why */
  cause?: string
  place?: Place
  /** its ink stays (a kept block): in no group */
  fixed: boolean
  /** its unit is the paper's as it is, never translated (InstrumentUnit.kept): a fixed one holds no text a translation could
   *  stand for (a kept block); a fixed one not kept holds text held for its drawing (a figure text the figure reading keeps, a
   *  cell held for its decorated word, §18.61), which the bundle states unwrapped (bundle.ts stateOf) */
  kept: boolean
  figure: boolean
  /** its elements made of a group set wholly in a face of one pitch on lines of their own (Rule 1 by group, PDF-READER §18.22):
   *  TeX's vertical box, its rows kept where TeX set them as a display's are, by piece id */
  ownRows?: Set<string>
  /** A's glyphs (global) by role; elements by piece id. These seven lists are written by the ownership alone (ownership.ts),
   *  with the owner of each glyph of `text`, `label` and `els`: read-only everywhere else */
  readonly text: readonly number[]
  readonly label: readonly number[]
  readonly els: ReadonlyMap<string, readonly number[]>
  /** A's boxes ([page, index]) by role */
  readonly textBoxes: readonly [number, number][]
  readonly elBoxes: ReadonlyMap<string, readonly [number, number][]>
  /** each element box's partner on B ([page index, index]), by piece id, in elBoxes' order: where TeX shipped it in B's stream */
  readonly elBoxesB: ReadonlyMap<string, readonly [number, number][]>
  /** A's turned glyphs ([page, index among the page's turned]): a figure text set turned */
  readonly turned: readonly [number, number][]
  lines: Line[]
  elements: [string, El][]
  /** the elements (by piece id) of a symbol's class whose ink is not that symbol as its reading draws it (a letter or digit among
   *  its glyphs, or a raise or a drop the reading does not draw): drawn as their ink, a formula's (bundle.ts classed) */
  asInk?: Set<string>
  /** the share an element's faked small capitals are set at, by its id, where its text is in TeX's case for them (facts.ts
   *  elementCase): its style states it (facts-pass, El.style.sc) */
  smallCaps?: Map<string, number>
  labelAt?: Label
  /** where its label stands on none of its lines: TeX's measure for the label's own line (columnsAndMeasures), what its alignment
   *  is read against (facts-pass.ts, Label.align) */
  labelMeasure?: [number, number]
  style: Style
  align: 'j' | 'l' | 'c' | 'r'
  lead: number
  room: Room
  pages: number[]
  join?: [number] | [number, 1]
  dir?: [number, number]
  /** a figure text set turned (`dir`): its run, its first glyph's origin, its box's length along `dir` and its room before and
   *  after its box along it (Placed.run; its line is its box on the page), as today's figure reading tells them */
  run?: [x: number, y: number, length: number, before: number, after: number]
  /** a babel name's own text on A, as the text layer reads it (Placed.plain: S.names tells by it a target word the original's) */
  plain?: string
  /** a babel name TeX set right before a unit on that unit's first line (amsthm's "Proof.", IEEEtran's "Abstract—"): the ord of
   *  the member it leads (Placed.bound: drawn as that member's lead, in its flow before it) */
  leads?: number
  /** the name that leads it, by its ord: its glyphs are its lead's, no ink beside its first line */
  leader?: number
  /** a babel name's counter TeX set after it on its line, where it leads no unit (IEEEtran's "APPENDIX A", "Appendix A:" in a
   *  contents list: Word.counter): its A glyphs, those of its occurrence after its end point on B (marks.mjs `n<occ>.<key>.e`;
   *  the wrap gives them the name's group, own.mjs, names.mjs counterAfter) */
  counterA?: number[]
  counter?: [string, Ink]
  /** its first and last glyph on B (global), -1 for none */
  bFirst: number
  bLast: number
  /** the class's marks after its text (C20) */
  tail?: [string, Style][]
  /** the groups TeX opened a paragraph at inside it (C13, C15: SpanAt.opens), by their open piece's id: that paragraph's first
   *  line */
  spanOpens?: Map<string, number>
  /** paragraphs TeX opened inside it where a group the instrument wrote as its content stood (InstrumentUnit.passed): none is
   *  stated, and stage 1a fails the paper (Located.stats.opensLost) */
  opensLost?: number
  /** paragraph ends of B inside it (its glyphs on both sides) that state no point (no SpanAt.opens, no El.opens): where an open or
   *  an element stands where the next paragraph begins in the source, and where plain text does (facts-pass.ts) */
  opensUnstated?: [anchored: number, plain: number]
  /** a figure text's runs in another face than its own, by their group's piece id: each one's style, read off its glyphs on A
   *  (ink.ts figureRuns; SpanAt.style) */
  spanStyles?: [string, Style][]
  /** its groups whose text TeX set in a fill other than the fill around it, read off its glyphs on A (group-style.ts;
   *  SpanAt.colour where the instrument states none): each one's open piece id and fill */
  spanFills?: [string, number][]
  /** its groups whose command names no face and whose own text TeX set in a face other than the face around it, read off its
   *  glyphs on A (group-style.ts; SpanAt.style where the instrument states none): each one's open piece id and style */
  spanFaces?: [string, Style][]
  /** the facts it carries as read on A by today's reader's rule, not stated by TeX (stage 1b states them) */
  read: string[]
  /** its alignment read centred by its own block (facts.ts centredByBlock, a single line's stack): read again on TeX's line once
   *  the flows say which members share it (the row's) */
  byBlock?: true
  /** each line's glyphs on A (global), by line, for the facts read after the lines */
  lineGlyphs: number[][]
  /** where on A a sentence of its may begin: each word of its projection at its first glyph (words.ts; Placed.words), for a
   *  unit lit by sentence */
  words?: Word[]
}

export interface Located {
  /** the units the members are of (a member's `unit` its index here): the instrument's, then those locate made on A (ink.ts:
   *  its ink units, kept blocks and figure texts) */
  units: InstrumentUnit[]
  members: Member[]
  /** the units born on A (their content, for Units) by member ord */
  born: Map<number, { kind: string; content: Piece[] }>
  flows: number[][]
  ties: ({ rule: 'cells'; cells: number[][]; head?: 1 } | { rule: 'size'; ords: number[] })[]
  links: Map<
    number,
    {
      box: [number, number, number, number]
      to: { url: string } | { dest: string }
      owner?: [number, string]
      text?: string
      label?: 1
      whole?: 1
      page?: number
      border?: LinkBorder
    }[]
  >
  /** per A page (index p - 1): each glyph's and each box's group (the wrap's plan), null for none */
  groups: { glyphs: (string | null)[]; boxes: (string | null)[]; turned: (string | null)[] }[]
  /** groups that are figure texts' (the wrap writes their runs inside a form in the form) */
  figureGroups: Set<string>
  /** what the ownership's check finds (ownership.ts): each glyph whose owner and the members' lists disagree, and a fixed
   *  member's glyph in a group; read by the package's tests (none found) and the lab's stage 1a (`ownership/<id>.json`) */
  disagreements: Disagreement[]
  /** the lines on A the units made there read as a display's formula (ink.ts DisplayLine), where A's pages were given: what the
   *  lab's stage states a unit absent from the candidate by (lab/pdf/prepare-back/stated.mjs) */
  displays: DisplayLine[]
  /** the lines on A TeX set inside a counted float that no unit owns, read as their float's text by depth alone, where A's pages
   *  were given (ink.ts; today's ledger, PDF-READER §18.45): stated beside the units, never read by them; the lab's stage lists
   *  them and its report counts them */
  floatLines: FloatLine[]
  stats: {
    units: number
    located: number
    unlocated: Record<string, number>
    places: Record<Place, number>
    born: number
    bornGlyphs: number
    /** the units made on A by today's rule (ink.ts), where A's pages were given */
    made?: InkStats
    /** the source units kept as artefacts (Rule 1, PDF-READER §18.22), and whether the paper's body face is one of one pitch */
    artefacts?: { units: number; bodyFixed: boolean; groups?: number; read?: number }
    /** paragraphs TeX opened inside a unit where a group the instrument wrote as its content stood (InstrumentUnit.passed), no
     *  group left to state it on (SpanAt.opens): a gate, which must count none (stage 1a fails a paper with one) */
    opensLost?: number
    /** paragraph ends of B inside a unit that state no point, by what stands where the next paragraph begins in the source: an
     *  open or an element (`anchored`: a gate, which must count none) or plain text (`plain`: no anchor exists for it) */
    opensUnstated?: { anchored: number; plain: number }
    /** the units' end marks claimed after their end points (El.end) */
    ends?: number
  }
}

/** what the ownership's check finds (ownership.ts): a glyph a member's lists and the table state otherwise, or a fixed member's
 *  glyph in a group */
export interface Disagreement {
  kind: 'owned, not listed' | 'listed, not owned' | 'listed twice' | 'fixed, in a group'
  /** the glyph: its page (1-based) and its index there */
  page: number
  glyph: number
  /** the member whose list or claim it is, and its role there: 'text', 'label', an element id, '' where it lists none */
  member: number
  role: string
  /** the table's answer: a member's ord, -1 free, -2 held */
  owner: number
  /** a glyph a `takeAsStated` left on one side alone: a fault known before the check and carried as it is, not found by it */
  carried?: true
}

/** locate's index: built once by `open` from the instrument, A's ink and the mapping, never written after; every phase reads it */
export interface Index {
  readonly ins: Instrument
  readonly inkA: Doc
  readonly m: Mapping
  /** B's ink (the instrument's) */
  readonly B: Doc
  /** B's glyphs, all pages */
  readonly NB: number
  /** each B glyph's unit (-1 none), role and piece (-1 none), and page (1-based), by global index */
  readonly unitB: Int32Array
  readonly roleB: Uint8Array
  readonly pieceB: Int32Array
  readonly pageB: Int32Array
  /** each A glyph's page (1-based), by global index */
  readonly pageA: Int32Array
  /** each placeholder's span on B by `unit|piece`, NaN for a side the instrument does not state */
  readonly placeSpan: ReadonlyMap<string, [number, number]>
  /** the pieces the instrument states set no ink (`empty`), and those TeX set outside their unit's text (`outside`) */
  readonly emptyPiece: ReadonlySet<string>
  readonly outsidePiece: ReadonlySet<string>
  /** a glyph of A or B by global index; with its page */
  readonly gA: (a: number) => DocGlyph
  readonly gB: (b: number) => DocGlyph
  readonly atA: (a: number) => { page: number; g: DocGlyph }
  readonly atB: (b: number) => { page: number; g: DocGlyph }
  /** each instrument unit's B glyphs (global), boxes ([page index, index]) and turned glyphs ([page index, index]) */
  readonly glyphsOf: ReadonlyMap<number, number[]>
  readonly boxesOf: ReadonlyMap<number, [number, number][]>
  readonly turnedOf: ReadonlyMap<number, [number, number][]>
  /** the A pages our compile sets (setPagesOf) */
  readonly setA: readonly boolean[]
  /** the faces of one pitch, read off A's glyphs (facts.ts fixedFacesOf) */
  readonly fixedFaces: ReadonlySet<string>
  /** each A page's text frame as TeX shipped it (framesOnA) */
  readonly framesA: ReadonlyMap<number, TexFrame>
}

/** the artefacts' reading the units made on A take (artefacts.ts): whether a unit set wholly in a face of one pitch is kept as
 *  an artefact (the paper's body face is none of them), and the test a figure text is kept by */
export interface Pitch {
  artefacts: boolean
  figureArtefact: (text: readonly number[], turned: readonly [number, number][]) => boolean
}

/**
 * The record locate's phases work over. Each shared field has one writer, named here with its readers (phases by their number
 * in the order locate.ts calls them); those `open` makes are the record from the start, those of `Assigned` are assigned once
 * by their writer and read through `field`, which throws where the writer has not run:
 * - `jointPiece`: written by 4 unitsMadeOnA; read by 6 lineGeometry.
 * - `displays`, `floatLines`: written by 4 unitsMadeOnA; read by close.
 * - `trailSep`: written by 2 claimTrails; read by 6 lineGeometry.
 * - `pitch`: written by 3 keepArtefacts; read by 4 unitsMadeOnA.
 * - `born`: written by 5 unitsBornOnA; read by 7 sentenceStarts and close.
 * - `flows`, `ties`: written by 13 flowsAndTies; read by 14 rowAligns and close (`flows`), close (`ties`).
 * - `links`: written by 15 linksOnA; read by close.
 * Three fields have several writers, and are named so: `members` (pushed by 1, 4, 5; their glyph and box lists written by
 * the ownership alone, through which 1 placeUnits, 2 claimTrails, 3 keepArtefacts, 4 unitsMadeOnA, 5 unitsBornOnA and 9 endMarks
 * claim; their other facts by the phases after), `units` (written by 3 and 4), `stats` (by 3, 4, 5, 9 and close). The ownership
 * of A's glyphs is no field: locate makes it and hands each phase the face it may use (ownership.ts).
 */
export interface Work {
  readonly ix: Index
  readonly members: Member[]
  readonly units: InstrumentUnit[]
  readonly stats: Located['stats']
  readonly jointPiece: Set<string>
  readonly displays: DisplayLine[]
  readonly floatLines: FloatLine[]
  /** the fields one phase assigns once (`assign`), read through `field` */
  readonly assigned: Partial<Assigned>
}

/** the fields of the record one phase assigns once (Work's comment names each one's writer and readers) */
export interface Assigned {
  trailSep: Map<number, number>
  pitch: Pitch
  born: Map<number, { kind: string; content: Piece[] }>
  flows: number[][]
  ties: Located['ties']
  links: Located['links']
}

/** a field one phase assigns, read: it throws where the phase that writes it has not run (locate's order is the contract) */
export function field<K extends keyof Assigned>(w: Work, k: K): Assigned[K] {
  const v = w.assigned[k]
  if (v === undefined) throw new Error(`locate: ${k} read before the phase that writes it ran`)
  return v
}

/** a field one phase assigns, written: once, by that phase */
export function assign<K extends keyof Assigned>(w: Work, k: K, v: Assigned[K]): void {
  if (w.assigned[k] !== undefined) throw new Error(`locate: ${k} assigned twice`)
  w.assigned[k] = v
}

export interface LocateOptions {
  /** each A page's annotations as PDF.js gives them (getAnnotations), for the links */
  annotations?: (unknown[] | null)[]
  /** each A page as pageInk read it (read.ts `raw`): given, locate makes the units no source unit is on A (ink.ts) */
  pages?: (PageInk | null)[]
  /** the pages are locate's (prepareBack's, unless it keeps them): it lets each go (its entry null) once the ink step has read it,
   *  and each page's shapes once its figure texts are read; untaken, it reads them and leaves them as they are */
  take?: boolean
  /** what the front half reads of an ink unit's pieces (the adapter's classesOf) */
  classesOf?: InkInput['classesOf']
}

/** the record of a locate: its index, and the fields the phases fill from the start */
export function open(ins: Instrument, inkA: Doc, m: Mapping): Work {
  const B = ins.ink
  const NB = m.offB[B.pages.length] as number
  const NA = m.offA[inkA.pages.length] as number
  // flat owners of B, and each document's glyph by global index
  const unitB = new Int32Array(NB).fill(-1)
  const roleB = new Uint8Array(NB)
  const pieceB = new Int32Array(NB).fill(-1)
  const pageB = new Int32Array(NB)
  B.pages.forEach((pg, p) => {
    const o0 = m.offB[p] as number
    const ow = ins.glyphs[p]
    for (let j = 0; j < pg.glyphs.length; j++) {
      pageB[o0 + j] = p + 1
      if (!ow) continue
      unitB[o0 + j] = ow.unit[j] as number
      roleB[o0 + j] = ow.role[j] as number
      pieceB[o0 + j] = ow.piece[j] as number
    }
  })
  // (each placeholder's span on B between its two points (the marked compile's p<unit>.<piece>a and b), global, by unit and piece;
  // NaN for a side the instrument does not state)
  const placeSpan = new Map<string, [number, number]>()
  for (const pl of ins.places ?? []) {
    const k = `${pl.unit}|${pl.piece}`
    const at = (m.offB[pl.page - 1] as number) + pl.glyph
    const was = placeSpan.get(k)
    if (!pl.end) placeSpan.set(k, [at, was?.[1] ?? Number.NaN])
    else placeSpan.set(k, [was?.[0] ?? Number.NaN, at])
  }
  // (the pieces TeX said set no ink, or whose points prove they set none of their own: the instrument's `empty`; and those TeX
  // set before their unit's start point, outside its text: its `outside`)
  const emptyPiece = new Set((ins.empty ?? []).map((x) => `${x.unit}|${x.piece}`))
  const outsidePiece = new Set((ins.outside ?? []).map((x) => `${x.unit}|${x.piece}`))
  // (an ink unit's elements of no kept run of its (inkOf: each element its own run's; an echoed unit's that sets nothing, for which
  // the ink unit has no run): none of their own, as the instrument's `empty` states it of a source unit's piece; by unit and
  // piece. One whose run's glyphs another unit owns is not found, as before)
  const jointPiece = new Set<string>()
  const pageA = new Int32Array(NA)
  inkA.pages.forEach((pg, p) => {
    for (let j = 0; j < pg.glyphs.length; j++) pageA[(m.offA[p] as number) + j] = p + 1
  })
  const gA = (a: number): DocGlyph => {
    const p = (pageA[a] as number) - 1
    return inkA.pages[p]!.glyphs[a - (m.offA[p] as number)]!
  }
  const gB = (b: number): DocGlyph => {
    const p = (pageB[b] as number) - 1
    return B.pages[p]!.glyphs[b - (m.offB[p] as number)]!
  }
  const atA = (a: number) => ({ page: pageA[a] as number, g: gA(a) })
  const atB = (b: number) => ({ page: pageB[b] as number, g: gB(b) })

  // each unit's B glyphs and boxes
  const glyphsOf = new Map<number, number[]>()
  for (let b = 0; b < NB; b++) {
    const u = unitB[b] as number
    if (u < 0) continue
    const l = glyphsOf.get(u)
    if (l) l.push(b)
    else glyphsOf.set(u, [b])
  }
  const boxesOf = new Map<number, [number, number][]>()
  B.pages.forEach((pg, p) => {
    const ow = ins.boxes[p]
    if (!ow) return
    for (let x = 0; x < pg.kinds.length; x++) {
      const u = ow.unit[x] as number
      if (u < 0) continue
      const l = boxesOf.get(u)
      if (l) l.push([p, x])
      else boxesOf.set(u, [[p, x]])
    }
  })

  const turnedOf = new Map<number, [number, number][]>()
  ;(ins.turned ?? []).forEach((ow, p) => {
    for (let j = 0; j < ow.unit.length; j++) {
      const u = ow.unit[j] as number
      if (u < 0) continue
      const l = turnedOf.get(u)
      if (l) l.push([p, j])
      else turnedOf.set(u, [[p, j]])
    }
  })
  /** the instrument's units, then those made on A */
  const units: InstrumentUnit[] = [...ins.units]
  const members: Member[] = []
  const displays: DisplayLine[] = []
  const floatLines: FloatLine[] = []
  const stats: Located['stats'] = {
    units: ins.units.length,
    located: 0,
    unlocated: {},
    places: { same: 0, shifted: 0, respaced: 0, rebroken: 0 },
    born: 0,
    bornGlyphs: 0,
  }
  // (the A pages our compile sets: a page with a glyph paired with B's, or a turned one (setPagesOf))
  const setA = setPagesOf(m)
  // (the faces of one pitch, read off A's glyphs (facts.ts fixedFacesOf): what the artefacts read a unit's text by)
  const fixedFaces = fixedFacesOf(inkA.pages.flatMap((pg) => pg.glyphs))
  // (each A page's text frame as TeX shipped it, B's carried onto A by its partners)
  const framesA = framesOnA(ins.tex.frames, B, m, pageA, gA, gB)
  return {
    ix: {
      ins,
      inkA,
      m,
      B,
      NB,
      unitB,
      roleB,
      pieceB,
      pageB,
      pageA,
      placeSpan,
      emptyPiece,
      outsidePiece,
      gA,
      gB,
      atA,
      atB,
      glyphsOf,
      boxesOf,
      turnedOf,
      setA,
      fixedFaces,
      framesA,
    },
    members,
    units,
    stats,
    jointPiece,
    displays,
    floatLines,
    assigned: {},
  }
}

/** the kinds of the author block's units (latex-front.mjs AUTHOR_KINDS: its names and its places) */
export const AUTHOR_KINDS = new Set(['author', 'affiliation'])
/** the classes of an element the typesetter draws from the ink TeX set for it (its reading's VISIBLE, a symbol aside: drawn from
 *  its source where it has no ink): one of no ink states which of three it is, TeX set nothing for it (El.text ''), it stands
 *  outside the unit's text (El.keep), or neither (its ink not found: the typesetter leaves its unit the original's) */
export const INKED_CLASSES = new Set(['cite', 'num', 'other', 'display', 'macro', 'umacro'])

/** a unit's pieces by id, spans opened */
export function piecesOf(content: readonly Piece[], out = new Map<string, Piece>()): Map<string, Piece> {
  for (const p of content) {
    if (p.t === 'el' || p.t === 'unit') out.set(p.id, p)
    else if (p.t === 'span') {
      out.set(p.id, p)
      piecesOf(p.content, out)
    }
  }
  return out
}

/** the letters of a text, a modifier letter aside (a spacing accent TeX sets as a glyph of its own: ˇ, ˆ), a decomposed character's
 *  marks aside (č is one letter, as its source's \\v{c} is) */
export const lettersIn = (t: string): number => (t.normalize('NFKD').match(/[\p{Lu}\p{Ll}\p{Lt}\p{Lo}]/gu) ?? []).length

/** Each index of lo..hi with no partner that stands between two with one, with `pv` the last paired index before it and `nx` the
 * first after it. One walk: `pv` is the last paired index passed, `nx` found once for the whole run of unpaired indices it ends,
 * so each index is read at most twice (linear in the span; a walk back and forth from each unpaired index is quadratic in its run:
 * PR #620's finding 1, and the same walk in the units made on A) */
export function eachBetweenPaired(
  lo: number,
  hi: number,
  paired: (i: number) => boolean,
  visit: (i: number, pv: number, nx: number) => void,
): void {
  let pv = lo - 1
  let nx = lo - 1
  for (let i = lo; i <= hi; i++) {
    // (`nx`, once found, is paired: not read again)
    if (i === nx || paired(i)) {
      pv = i
      continue
    }
    if (i > nx) {
      nx = i + 1
      while (nx <= hi && !paired(nx)) nx++
    }
    if (pv >= lo && nx <= hi) visit(i, pv, nx)
  }
}

/** whether a run-in lead's line and the line TeX set after it stand in one column as columnsAndMeasures reads them: the same,
 *  or either over both (2). One rule for a name that leads a unit and a run-in head before its paragraph: on a one-column page
 *  that reads as two (a table's cells on both halves, 1706.03762v7 p10), the head's line keeps to the left half and its
 *  paragraph's first line, after it on its row, spans both. Members a tabular row sets side by side (an author block's names,
 *  the middle one over the page's middle, 1706.03762v7 p1) are no lead and its text: their columns must be the same */
export const sameColumn = (a: number, b: number) => a === b || a === 2 || b === 2
/** an author's call the marked compile states: the point `<i>c` before the command or the \and that opens unit i's block */
export const CALL = /^\d+c$/
/** a unit's start or end mark: `<i>s`, `<i>e`, a heading's `h<i>…`, a cell's `t<i>…` */
export const UNIT_MARK = /^[ht]?\d+[se]$/
/** a body's or a float's bracket in B's stream (LAYOUT_TEX) */
export const BRACKET = /^[bf][se]\d+$/

/** a glyph stands on a row where its baseline is within this share of the row's size of the row's (today's keptBetween and
 *  ownLabelOnRow, RUN:1592-1626; columnsAndMeasures' label on its line, MAKE's) */
export const ON_ROW = 0.4

/** the unit's own text line an ink stands on (the line TeX set it on: a radical's glyph origin is at its bar, a subscript's below
 *  the line, a footnote's mark raised over it): of its text lines on the ink's page whose band (its fonts' boxes, half a point
 *  out) the ink, `lo` to `hi`, meets, the one nearest its own baseline; -1 for none */
export function standsOn(lines: readonly Line[], page: number, lo: number, hi: number, own: number): number {
  let best = -1
  let d = Number.POSITIVE_INFINITY
  lines.forEach((l, j) => {
    if (l[9] & 1 || l[0] !== page || hi < l[6] - 0.5 || lo > l[5] + 0.5) return
    const e = Math.abs(l[4] - own)
    if (e < d) {
      d = e
      best = j
    }
  })
  return best
}

/**
 * Each A page's text frame as TeX shipped it (Instrument.tex.frames, B's pages), by A page: a B page's frame on the A page its
 * glyphs' partners stand on most, moved by the shift along x most of them share (the page set elsewhere as a whole; none where
 * A and B share their geometry, arXiv's compile of the same source, nor on a page TeX set its lines apart on A and B: a list
 * of figures whose entries' numbers differ in width moved most of its words by 3 pt and its numbers by none, 2610.19274v1
 * p67, a median of them 1.9 pt), the B page with the most partners there where two land on one
 */
function framesOnA(
  frames: readonly (TexFrame | null)[] | undefined,
  B: Doc,
  m: Mapping,
  pageA: Int32Array,
  gA: (a: number) => DocGlyph,
  gB: (b: number) => DocGlyph,
): Map<number, TexFrame> {
  const out = new Map<number, TexFrame>()
  const most = new Map<number, number>()
  if (!frames?.length) return out
  frames.forEach((f, pb) => {
    if (!f || !B.pages[pb]) return
    const o0 = m.offB[pb] as number
    const dx = new Map<number, number[]>()
    const dy = new Map<number, number[]>()
    for (let j = 0; j < B.pages[pb]!.glyphs.length; j++) {
      const a = m.bToA[o0 + j] as number
      if (a < 0) continue
      const pa = pageA[a] as number
      ;(dx.get(pa) ?? dx.set(pa, []).get(pa)!).push(gA(a).x0 - gB(o0 + j).x0)
      ;(dy.get(pa) ?? dy.set(pa, []).get(pa)!).push(gA(a).y - gB(o0 + j).y)
    }
    let best = 0
    let on: number[] = []
    for (const [pa, d] of dx)
      if (d.length > on.length) {
        best = pa
        on = d
      }
    if (!best || on.length <= (most.get(best) ?? 0)) return
    // (the shift most of them share, along x and, for the text block's bottom, along y; none where none is shared)
    const shared = (ds: readonly number[]) => {
      const by100 = new Map<number, number>()
      for (const d of ds) by100.set(r2(d), (by100.get(r2(d)) ?? 0) + 1)
      let v = 0
      for (const [d, n] of by100) if (2 * n > ds.length) v = d
      return v
    }
    const shift = shared(on)
    const by = (x: [number, number]): [number, number] => [r2(x[0] + shift), r2(x[1] + shift)]
    most.set(best, on.length)
    out.set(best, {
      block: by(f.block),
      columns: f.columns.map(by),
      ...(f.foot !== undefined ? { foot: r2(f.foot + shared(dy.get(best) ?? [])) } : {}),
    })
  })
  return out
}
