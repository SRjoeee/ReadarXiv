// locate(instrument, inkA, mapping): every unit the instrument owns, on arXiv's page (design §4.1, §4.2's Located, §4.3).
//
// - A unit is LOCATED where every glyph it owns on B has a partner on A (or is a line-end hyphen a `hyphen` hunk holds, or lies
//   off its page), and every rule and image it owns pairs with A's (S1d). No partial credit, no threshold; a unit that is not
//   located stays the original's, with the cause: `content difference: <class>` (the hunk class that holds its first
//   unmatched glyph, B's and A's glyphs differing there; or a rule, an image, a turned glyph with no partner), `no ink` (the
//   instrument gives it none), or the instrument's own why.
// - Its ink on A: its glyphs' partners, each in the role and piece its B glyph has, and A's own unmatched glyphs inside its A
//   span whose matched neighbours on both sides are its own (a word TeX broke on A and not on B: its hyphen; a content
//   difference: A's own glyphs there), in their neighbours' role where both have one, else its text's.
// - Everything geometric is A's: lines cut in its own glyph run (lines.ts), elements' ink per line, its label, its room, its
//   style's size and fill; TeX's statements where the instrument has them (its alignment). Where it stands on A against B:
//   `same` (every pair within 0.01 pt on its page), `shifted` (each of B's lines moved whole), `respaced`, `rebroken`.
// - Members: one placement per unit, a babel name's every occurrence its own; then the units no source unit is, made on A by
//   today's rule where A's pages are given (ink.ts: ink units, kept blocks, figure texts, of A's glyphs no source unit owns, B's
//   marks carried onto A); then the units born on A (born.ts) from the glyphs B never printed that today's rule makes nothing of. Flows: members that share a TeX line, consecutive in the stream. Ties: a table's cells; a
//   figure's set. Links: A's annotations, each owned by the element or the text its rectangle lies over.
// - Groups (design §4.5): per member and page, `<ord>.<page>.t` its text (and a name's or figure text's word), `.e` its
//   travelling elements, `.l` its label; a display, a kept block and what is not located are in no group.
import { type El, type Ink, type Label, type Line, type Piece, type Room, type Style, unitId } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import { HUNK, hunkName } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { isImage, isPath } from '../doc.ts'
import type { PageInk } from '../ink.types.ts'
import { type Instrument, type InstrumentUnit, ROLE } from '../instrument.ts'
import { bracketsOf, fakedCaps, fillRunsOf, sourceText, styleOf, textOf, unitSize } from './facts.ts'
import { bornOf } from './born.ts'
import { factsOf } from './facts-pass.ts'
import { type InkInput, type InkStats, inkOf } from './ink.ts'
import { type CutLine, cutLines, lineSize, r2 } from './lines.ts'
import { type RowBox, rowsOf } from './rows.ts'
import { regionsOf } from './today/today.types.ts'

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
  figure: boolean
  /** A's glyphs (global) by role; elements by piece id */
  text: number[]
  label: number[]
  els: Map<string, number[]>
  /** A's boxes ([page, index]) by role */
  textBoxes: [number, number][]
  elBoxes: Map<string, [number, number][]>
  /** A's turned glyphs ([page, index among the page's turned]): a figure text set turned */
  turned: [number, number][]
  lines: Line[]
  elements: [string, El][]
  labelAt?: Label
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
  /** the facts it carries as read on A by today's reader's rule, not stated by TeX (stage 1b states them) */
  read: string[]
  /** each line's glyphs on A (global), by line, for the facts read after the lines */
  lineGlyphs: number[][]
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
      page?: number
    }[]
  >
  /** per A page (index p - 1): each glyph's and each box's group (the wrap's plan), null for none */
  groups: { glyphs: (string | null)[]; boxes: (string | null)[]; turned: (string | null)[] }[]
  /** groups that are figure texts' (the wrap writes their runs inside a form in the form) */
  figureGroups: Set<string>
  stats: {
    units: number
    located: number
    unlocated: Record<string, number>
    places: Record<Place, number>
    born: number
    bornGlyphs: number
    /** the units made on A by today's rule (ink.ts), where A's pages were given */
    made?: InkStats
  }
}

/** an A glyph's owner in `claimedA` where no member owns it: free (born.ts may make a unit of it), or held as A's ink inside a
 *  unit that stays the original's */
export const FREE = -1
export const HELD = -2

/** an element kind whose glyphs are a reading of it: its text is stated */
/** a babel name's end point on B (marks.mjs NAMES_TEX: `n<occurrence>.<key>.e`) */
const NAME_END = /^n\d+\.[a-z]{1,16}\.e$/
const TEXT_KINDS = new Set(['cite', 'ref', 'eqref', 'url', 'number', 'footnote', 'macro'])
/** the classes the typesetter draws as the page's text (drawnAs L2:1757: a citation, a reference, a macro) */
const TEXT_CLASSES = new Set(['cite', 'num', 'macro', 'umacro'])
const LABEL_KIND: Record<string, Label['kind']> = {
  caption: 'float',
  heading: 'head',
  theorem: 'head',
  footnote: 'mark',
}

/** a unit's pieces by id, spans opened */
function piecesOf(content: readonly Piece[], out = new Map<string, Piece>()): Map<string, Piece> {
  for (const p of content) {
    if (p.t === 'el' || p.t === 'unit') out.set(p.id, p)
    else if (p.t === 'span') {
      out.set(p.id, p)
      piecesOf(p.content, out)
    }
  }
  return out
}

const mostOf = <T>(xs: Iterable<T>): T | undefined => {
  const n = new Map<T, number>()
  let best: T | undefined
  let k = 0
  for (const x of xs) {
    const c = (n.get(x) ?? 0) + 1
    n.set(x, c)
    if (c > k) {
      k = c
      best = x
    }
  }
  return best
}

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

export interface LocateOptions {
  /** each A page's annotations as PDF.js gives them (getAnnotations), for the links */
  annotations?: (unknown[] | null)[]
  /** each A page as pageInk read it (read.ts `raw`): given, locate makes the units no source unit is on A (ink.ts) */
  pages?: readonly (PageInk | null)[]
  /** what the front half reads of an ink unit's pieces (the adapter's classesOf) */
  classesOf?: InkInput['classesOf']
}

export function locate(ins: Instrument, inkA: Doc, m: Mapping, o: LocateOptions = {}): Located {
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
  // (the pieces TeX said set no ink: the instrument's `empty`)
  const emptyPiece = new Set((ins.empty ?? []).map((x) => `${x.unit}|${x.piece}`))
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
  /** A's boxes ([page, index]) as rows.ts takes them */
  const boxesOf_ = (l: readonly [number, number][]): RowBox[] =>
    l.map(([ap, ai]) => {
      const b = inkA.pages[ap - 1]!.boxes
      return { page: ap, x0: b[4 * ai]!, y0: b[4 * ai + 1]!, x1: b[4 * ai + 2]!, y1: b[4 * ai + 3]! }
    })
  const atB = (b: number) => ({ page: pageB[b] as number, g: gB(b) })
  // (each B glyph's region by B's brackets, stream.mjs regionsOf's: a float's depth, a column's body or not; read once a page)
  const regionsB = new Map<number, Int32Array>()
  const regionB = (b: number): number => {
    const p = (pageB[b] as number) - 1
    let r = regionsB.get(p)
    if (!r) {
      const pg = B.pages[p]!
      r = regionsOf({ glyphs: { n: pg.glyphs.length }, boxes: pg.boxes, points: pg.points }).glyph as Int32Array
      regionsB.set(p, r)
    }
    return r[b - (m.offB[p] as number)] as number
  }

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
  const claimedA = new Int32Array(NA).fill(FREE)
  /** the instrument's units, then those made on A */
  const units: InstrumentUnit[] = [...ins.units]
  const members: Member[] = []
  const stats: Located['stats'] = {
    units: ins.units.length,
    located: 0,
    unlocated: {},
    places: { same: 0, shifted: 0, respaced: 0, rebroken: 0 },
    born: 0,
    bornGlyphs: 0,
  }
  const noteUnlocated = (c: string) => {
    stats.unlocated[c] = (stats.unlocated[c] ?? 0) + 1
  }
  const empty = (u: number, kind: string, id: string): Member => ({
    ord: members.length,
    unit: u,
    id,
    kind,
    located: false,
    fixed: false,
    figure: false,
    text: [],
    label: [],
    els: new Map(),
    textBoxes: [],
    elBoxes: new Map(),
    turned: [],
    lines: [],
    elements: [],
    style: { role: 'serif', size: 10 },
    align: 'j',
    lead: 12,
    room: { below: 0 },
    pages: [],
    bFirst: -1,
    bLast: -1,
    read: [],
    lineGlyphs: [],
  })

  /** one placement of unit u from its B glyphs `list` and boxes `boxes` */
  const place = (
    u: number,
    list: number[],
    boxes: [number, number][],
    name?: string,
    turnedB: [number, number][] = [],
  ): Member => {
    const unit = ins.units[u]!
    const mem = empty(u, name !== undefined ? 'name' : unit.kind, unit.id)
    if (name !== undefined) mem.name = name
    mem.fixed = !!unit.fixed
    mem.figure = !!unit.figure
    if (unit.figure?.dir) mem.dir = unit.figure.dir
    if (list.length) {
      mem.bFirst = list[0] as number
      mem.bLast = list.at(-1) as number
    }
    mem.align = unit.align ?? 'j'
    // (no glyph of its own: nothing a translation replaces and no line to lay it on. Where it owns rules or images alone, they
    // stay A's ink, in no group, as a kept element's: `no text`)
    if (!list.length && !turnedB.length) {
      mem.cause = unit.why ?? (boxes.length ? 'no text' : 'no ink')
      return mem
    }
    let bad: string | null = null
    const aIdx: number[] = []
    for (const b of list) {
      const a = m.bToA[b] as number
      if (a >= 0) {
        aIdx.push(a)
        continue
      }
      if (m.hunkB[b] === HUNK.hyphen || m.offpageB[b]) continue
      bad ??= `content difference: ${hunkName(m.hunkB[b] as number) === 'none' ? 'bonly' : hunkName(m.hunkB[b] as number)}`
    }
    const boxPartners: [ap: number, ai: number, p: number, x: number][] = []
    for (const [p, x] of boxes) {
      const kind = B.pages[p]!.kinds[x] as number
      const ap = m.boxPage[p]?.[x] ?? 0
      if (!(isPath(kind) || isImage(kind)) || ap === 0) {
        bad ??= 'content difference: a rule or image with no partner'
        continue
      }
      boxPartners.push([ap, m.boxIndex[p]![x] as number, p, x])
    }
    const turnedA: [number, number][] = []
    let turnedSame = true
    for (const [p, j] of turnedB) {
      const ap = m.turnedPage[p]?.[j] ?? 0
      if (ap === 0) {
        bad ??= 'content difference: a turned glyph with no partner'
        continue
      }
      const aj = m.turnedIndex[p]![j] as number
      turnedA.push([ap, aj])
      const tb = B.pages[p]!.turned![j]!
      const ta = inkA.pages[ap - 1]!.turned![aj]!
      if (ap !== p + 1 || Math.abs(ta.ox - tb.ox) > 0.01 || Math.abs(ta.oy - tb.oy) > 0.01) turnedSame = false
    }
    // its A ink by role
    const roleOfB = (b: number): [number, number] => [roleB[b] as number, pieceB[b] as number]
    const roleAt = new Map<number, [number, number]>()
    for (const b of list) {
      const a = m.bToA[b] as number
      if (a >= 0) roleAt.set(a, roleOfB(b))
    }
    // (A's glyphs with no partner inside its span, between two matched glyphs of its own: its ink only where the alignment
    // shows they are its text. That is a hunk align classes `hyphen` (A's glyphs there spell B's once line-end hyphens are out:
    // a word arXiv's page broke at a line end where our compile did not) whose B side holds the unit's glyphs alone, or none.
    // A glyph drawn inside a form XObject between glyphs that are not is an included figure's own text, no glyph of the unit's
    // text: it stays unclaimed (born.ts gives it to a figure text). Any other is text A sets inside the unit that our compile
    // does not: a content difference, and the unit stays the original's (as for B's glyphs with no partner; no fuzzy rescue).
    // A unit that stays the original's holds those glyphs as A's ink (HELD): they are no unit born on A)
    const claims: [number, [number, number]][] = []
    if (aIdx.length) {
      const sorted = [...aIdx].sort((x, y) => x - y)
      const lo = sorted[0] as number
      const hi = sorted.at(-1) as number
      // (one walk, eachBetweenPaired's; the B range between the two partners read once for a run of unpaired glyphs)
      let run = -1
      let between: boolean | undefined
      eachBetweenPaired(
        lo,
        hi,
        (a) => (m.aToB[a] as number) >= 0,
        (a, pv, nx) => {
          if (nx !== run) {
            run = nx
            between = undefined
          }
          if (m.offpageA[a] || (claimedA[a] as number) !== FREE) return
          const bp = m.aToB[pv] as number
          const bn = m.aToB[nx] as number
          if (unitB[bp] !== u || unitB[bn] !== u) return
          // (B's glyphs between the two partners: none with no partner of another unit's)
          if (m.hunkA[a] === HUNK.hyphen && between === undefined) {
            between = true
            for (let b = Math.min(bp, bn) + 1; between && b < Math.max(bp, bn); b++)
              if ((m.bToA[b] as number) < 0 && unitB[b] !== u) between = false
          }
          const own = m.hunkA[a] === HUNK.hyphen && between === true
          if (own) {
            const rp = roleOfB(bp)
            const rn = roleOfB(bn)
            claims.push([a, rp[0] === rn[0] && rp[1] === rn[1] ? rp : [ROLE.text, -1]])
            return
          }
          if (gA(a).form && !gA(pv).form && !gA(nx).form) return
          claims.push([a, [ROLE.none, -1]])
          const h = hunkName(m.hunkA[a] as number)
          bad ??= `content difference: ${h === 'none' || h === 'hyphen' ? 'aonly' : h}`
        },
      )
    }
    if (bad || (!aIdx.length && !turnedA.length)) {
      for (const [a] of claims) claimedA[a] = HELD
      mem.cause = bad ?? 'no ink'
      return mem
    }
    for (const [a, r] of claims) roleAt.set(a, r)
    mem.located = true
    mem.turned = turnedA
    if (!aIdx.length) {
      mem.place = turnedSame ? 'same' : 'shifted'
      return mem
    }
    // (an element's glyph of no piece is no glyph of the unit's text: the instrument's u<id>.p glyphs no placeholder's points stand
    // round, which no El states. They stay A's ink where they stand (HELD), and so does a label they cut from the unit's text,
    // the glyphs of no unit TeX set between them: 2610.37818v1 p14, sub-caption (a), which has no unit, given to (b)'s, "(a)" its
    // label and "Dark rim band" an element of no piece; read as (b)'s text its line ran over (a), (a)'s English was erased with
    // nothing drawn there, and "(a)" drawn before "(b)" (the checkpoint's measure-4))
    const sortedRoles = [...roleAt].sort((x, y) => x[0] - y[0])
    const loose = sortedRoles.filter(([, [role, k]]) => role === ROLE.element && k < 0).map(([a]) => a)
    if (loose.length) {
      const firstText = sortedRoles.find(([, [role]]) => role === ROLE.text)?.[0] ?? Number.POSITIVE_INFINITY
      const cut = (a: number) => loose.some((x) => x > a && x < firstText)
      for (const [a, [role, k]] of sortedRoles)
        if ((role === ROLE.element && k < 0) || (role === ROLE.label && cut(a))) {
          claimedA[a] = HELD
          roleAt.delete(a)
        }
    }
    for (const [a, [role, k]] of [...roleAt].sort((x, y) => x[0] - y[0])) {
      claimedA[a] = mem.ord
      if (role === ROLE.label) mem.label.push(a)
      else if (role === ROLE.element && k >= 0) {
        const id = String(k)
        const l = mem.els.get(id)
        if (l) l.push(a)
        else mem.els.set(id, [a])
      } else mem.text.push(a)
    }
    for (const [ap, ai, p, x] of boxPartners) {
      const role = ins.boxes[p]!.role[x] as number
      const k = ins.boxes[p]!.piece[x] as number
      if (role === ROLE.element && k >= 0) {
        const id = String(k)
        const l = mem.elBoxes.get(id)
        if (l) l.push([ap, ai])
        else mem.elBoxes.set(id, [[ap, ai]])
      } else mem.textBoxes.push([ap, ai])
    }
    // where it stands on A against B
    {
      const own = list.filter((b) => (m.bToA[b] as number) >= 0)
      const linesB = cutLines(own, atB)
      const lineOf = new Map<number, number>()
      linesB.forEach((l, q) => {
        for (const b of l.gs) lineOf.set(b, q)
      })
      let same = true
      let rigid = true
      const off = new Map<number, [number, number, number]>()
      for (const b of own) {
        const a = m.bToA[b] as number
        const g = gB(b)
        const h = gA(a)
        const dx = h.x0 - g.x0
        const dy = h.y - g.y
        const pg = (pageA[a] as number) - (pageB[b] as number)
        if (pg !== 0 || Math.max(Math.abs(dx), Math.abs(dy)) > 0.01) same = false
        const q = lineOf.get(b)
        if (q === undefined) continue
        const o0 = off.get(q)
        if (!o0) off.set(q, [dx, dy, pg])
        else if (o0[2] !== pg || Math.abs(o0[0] - dx) > 0.01 || Math.abs(o0[1] - dy) > 0.01) rigid = false
      }
      const linesA = cutLines(
        own.map((b) => m.bToA[b] as number),
        atA,
      )
      const rebroken = linesA.length !== linesB.length || linesA.some((l, q) => l.gs.length !== linesB[q]?.gs.length)
      mem.place = rebroken ? 'rebroken' : same ? 'same' : rigid ? 'shifted' : 'respaced'
    }
    return mem
  }

  // ---- the instrument's units, a name's every occurrence its own member
  for (let u = 0; u < ins.units.length; u++) {
    const unit = ins.units[u]!
    const list = glyphsOf.get(u) ?? []
    const boxes = boxesOf.get(u) ?? []
    if (unit.name === undefined) {
      members.push(place(u, list, boxes, undefined, turnedOf.get(u) ?? []))
      continue
    }
    // (a name's occurrences: each maximal run of its glyphs in B's stream on one page)
    const runs: number[][] = []
    for (const b of list) {
      const last = runs.at(-1)
      if (last && last.at(-1) === b - 1 && pageB[b] === pageB[b - 1]) last.push(b)
      else runs.push([b])
    }
    if (!runs.length) members.push(place(u, [], []))
    for (const r of runs) {
      const mem = place(u, r, [], unit.name)
      // (its counter: its glyphs after its end point, which stands inside the run)
      const p = (pageB[r[0] as number] as number) - 1
      const o = m.offB[p] as number
      const end = (B.pages[p]?.points ?? []).find(
        (x) => NAME_END.test(x.name) && o + x.glyph > (r[0] as number) && o + x.glyph <= (r.at(-1) as number),
      )
      if (end) {
        const after = r.filter((b) => b >= o + end.glyph && !gB(b).blank).map((b) => m.bToA[b] as number)
        if (after.length && after.every((a) => a >= 0)) mem.counterA = after
      }
      members.push(mem)
    }
  }

  // ---- the units no source unit is, made on A by today's rule (ink.ts): from A's glyphs no source unit owns after the transfer,
  // those B never printed among them; each a member as an instrument's unit is, its ink A's own (`same`), its span on B its
  // glyphs' partners' (a paragraph end of TeX's between two of them tells their flows apart, as it tells a source unit's)
  if (o.pages) {
    const owned = (a: number) => {
      const c = claimedA[a] as number
      const b = m.aToB[a] as number
      return c >= 0 || c === HELD || (b >= 0 && (unitB[b] as number) >= 0)
    }
    const { made, stats: st } = inkOf({ ins, inkA, raws: o.pages, m, pageA, owned, classesOf: o.classesOf })
    for (const x of made) {
      const u = units.length
      units.push(x.unit)
      const mem = empty(u, x.unit.kind, x.unit.id)
      mem.fixed = !!x.unit.fixed
      mem.figure = !!x.unit.figure
      if (x.unit.figure?.dir) mem.dir = x.unit.figure.dir
      mem.align = x.unit.align ?? 'j'
      // (a figure text's own text on A, which S.figures tells a translation that says nothing else by: Placed.plain)
      if (x.unit.figure) mem.plain = x.unit.content.map((p) => (p.t === 'text' ? p.s : '')).join('')
      members.push(mem)
      if (!x.text.length && !x.ph.length && !x.turned.length) {
        mem.cause = 'no ink'
        continue
      }
      // (a glyph B never printed between two of its own that B printed is text arXiv's page sets inside the unit and our compile
      // does not, 2610.21084v1's initials: a content difference, and the unit stays the original's, as a source unit does (no
      // fuzzy rescue), those glyphs A's ink (HELD), no unit born of them; a line-end hyphen A breaks at is none, nor an included
      // figure's glyph inside it)
      const mine = [...x.text, ...x.ph].sort((p, q) => p - q)
      const aOnly: number[] = []
      eachBetweenPaired(
        0,
        mine.length - 1,
        (i) => (m.aToB[mine[i] as number] as number) >= 0,
        (i, pv, nx) => {
          const a = mine[i] as number
          if (m.offpageA[a] || m.hunkA[a] === HUNK.hyphen) return
          if (gA(a).form && !gA(mine[pv] as number).form && !gA(mine[nx] as number).form) return
          aOnly.push(a)
        },
      )
      if (aOnly.length) {
        const h = hunkName(m.hunkA[aOnly[0] as number] as number)
        mem.cause = `content difference: ${h === 'none' ? 'aonly' : h}`
        for (const a of aOnly) claimedA[a] = HELD
        continue
      }
      mem.located = true
      mem.place = 'same'
      mem.text = x.text
      if (x.phId !== null && x.ph.length)
        mem.els.set(
          x.phId,
          [...x.ph].sort((p, q) => p - q),
        )
      mem.turned = x.turned
      mem.textBoxes = x.textBoxes
      if (x.phId !== null && x.elBoxes.length) mem.elBoxes.set(x.phId, x.elBoxes)
      for (const a of [...x.text, ...x.ph]) {
        claimedA[a] = mem.ord
        const b = m.aToB[a] as number
        if (b < 0) continue
        if (mem.bFirst < 0 || b < mem.bFirst) mem.bFirst = b
        if (b > mem.bLast) mem.bLast = b
      }
    }
    stats.made = st
  }

  // ---- the units born on A, from the glyphs B never printed
  const born = new Map<number, { kind: string; content: Piece[] }>()
  for (const b of bornOf(inkA, m, claimedA, pageA)) {
    const mem = empty(-1, b.kind, unitId(b.kind, b.content))
    mem.located = true
    // (text inside an included figure, a form XObject: a figure's text, which the wrap writes in its form, as today's figure units)
    mem.figure = b.kind === 'inkfigures'
    mem.text = b.glyphs
    for (const a of b.glyphs) claimedA[a] = mem.ord
    born.set(mem.ord, { kind: b.kind, content: b.content })
    members.push(mem)
    stats.born++
    stats.bornGlyphs += b.glyphs.length
  }

  // ---- geometry: lines, columns and measures, elements, labels, style, lead, room
  for (const mem of members) {
    if (!mem.located && !mem.text.length) continue
    const unit = mem.unit >= 0 ? units[mem.unit]! : null
    const pieces = unit ? piecesOf(unit.content) : new Map<string, Piece>()
    const kindOf = (id: string) => (pieces.get(id) as { kind?: string } | undefined)?.kind ?? 'other'
    const classOf = new Map(unit?.classes ?? [])
    // (an element whose ink stands apart from the unit's text lines: outside the unit (B11 OUTSIDE), kept where it stands
    // and no line of the unit's)
    const textCut = cutLines(
      [...mem.text].sort((x, y) => x - y),
      atA,
    )
    const outside = new Set<string>()
    if (textCut.length)
      for (const [id, l] of mem.els)
        if (
          kindOf(id) !== 'display' &&
          l.length &&
          // (beside its text lines: within two sizes over their first and under their last on a page, a line of formulas alone at
          // its end or a script between two of them; outside, only ink apart from all of them: a mark set in a margin, a float)
          l.every((a) => {
            const g = gA(a)
            const on = textCut.filter((t) => t.page === pageA[a])
            return (
              !on.length ||
              g.y > Math.max(...on.map((t) => t.top)) + 2 * g.size ||
              g.y < Math.min(...on.map((t) => t.bottom)) - 2 * g.size
            )
          })
        )
          outside.add(id)
    const inline: number[] = [...mem.text]
    for (const [id, l] of mem.els) if (kindOf(id) !== 'display' && !outside.has(id)) inline.push(...l)
    inline.sort((x, y) => x - y)
    const cut = cutLines(inline, atA)
    // (the lines whose ink stays, KEPT, in their place in the stream: a display's rows; and a held line, the glyphs inside its
    // span on A that B printed and no unit owns: the lines its source does not write (B17; today's heldOf MAKE:1855 read them
    // by the source's words, under a 0.2 share: ownership says it))
    // (a display's rows by rows.ts: its ink's bands joined where its glyphs interleave in the stream, never the text line rule,
    // which cuts a row's stacked parts apart)
    const kept: CutLine[] = []
    const displayRows = new Map<string, CutLine[]>()
    for (const [id, l] of mem.els)
      if (kindOf(id) === 'display') {
        const rows = rowsOf(l, atA, boxesOf_(mem.elBoxes.get(id) ?? []))
        displayRows.set(id, rows)
        kept.push(...rows)
      }
    if (inline.length && unit) {
      const own = [...inline, ...mem.label].sort((x, y) => x - y)
      // (within its own lines' extent on each page: a page's furniture, a float the stream passes between two of its lines
      // on another part of the page, are none of its)
      const box = new Map<number, [number, number, number, number]>()
      for (const l of cut) {
        const q = box.get(l.page)
        box.set(
          l.page,
          q
            ? [Math.min(q[0], l.x0), Math.min(q[1], l.bottom), Math.max(q[2], l.x1), Math.max(q[3], l.top)]
            : [l.x0, l.bottom, l.x1, l.top],
        )
      }
      const held: number[] = []
      // (a float TeX set inside the paragraph, between two of its lines, is none of its held lines: a glyph in another float depth
      // than the unit's text by B's brackets, or, where B brackets none, drawn inside a form XObject where its text is not (L1's
      // second held-line fault, 2610.10492v1 ord 21: a float's glyphs no unit owns read as the paragraph's KEPT lines))
      const firstText = mem.text.length ? (mem.text[0] as number) : -1
      const textB = firstText >= 0 ? (m.aToB[firstText] as number) : -1
      const depthOf = (b: number) => regionB(b) >> 1
      const textDepth = textB >= 0 ? depthOf(textB) : 0
      const textForm = firstText >= 0 && !!gA(firstText).form
      for (let a = own[0] as number; a <= (own.at(-1) as number); a++) {
        const b = m.aToB[a] as number
        if ((claimedA[a] as number) >= 0 || b < 0 || (unitB[b] as number) >= 0) continue
        if (depthOf(b) !== textDepth || (!textForm && gA(a).form)) continue
        const g = gA(a)
        const q = box.get(pageA[a] as number)
        // (a glyph that stands on one of its own text lines (the line rule's band, within the line's extent) is none of a held
        // line's: ink in no group on the unit's line, never a KEPT line over it)
        const onOwn = cut.some(
          (l) =>
            l.page === pageA[a] &&
            Math.abs(g.y - l.base) < 0.5 * Math.max(l.size, g.size) &&
            g.x1 > l.x0 &&
            g.x0 < l.x1,
        )
        if (q && !onOwn && /\S/.test(g.u) && g.y >= q[1] && g.y <= q[3] && g.x1 > q[0] && g.x0 < q[2]) held.push(a)
      }
      kept.push(...cutLines(held, atA))
    }
    const all = [...cut.map((l) => ({ l, kept: false })), ...kept.map((l) => ({ l, kept: true }))].sort(
      (x, y) => (x.l.gs[0] as number) - (y.l.gs[0] as number),
    )
    mem.lines = all.map(
      ({ l, kept: k }) =>
        [
          l.page,
          0,
          r2(l.x0),
          r2(l.x1),
          l.base,
          r2(l.top),
          r2(l.bottom),
          r2(l.x0),
          r2(l.x1),
          k ? 1 : 0,
          lineSize(l.gs.map(gA)),
        ] as Line,
    )
    mem.lineGlyphs = all.map(({ l }) => l.gs)
    // (a run set turned: its band's box on the page, from its first glyph's origin to its last one's end, its descent to its
    // ascent across; its baseline the first glyph's origin's height)
    if (mem.turned.length) {
      const byPage = new Map<number, number[]>()
      for (const [ap, aj] of mem.turned) (byPage.get(ap) ?? byPage.set(ap, []).get(ap)!).push(aj)
      for (const [ap, js] of byPage) {
        const T = inkA.pages[ap - 1]!.turned!
        let x0 = Number.POSITIVE_INFINITY
        let x1 = Number.NEGATIVE_INFINITY
        let y0 = Number.POSITIVE_INFINITY
        let y1 = Number.NEGATIVE_INFINITY
        for (const j of js) {
          const t = T[j]!
          for (const [x, y] of [
            [t.ox, t.oy],
            [t.ex, t.ey],
          ] as const)
            for (const e of [t.ascent, t.descent]) {
              const X = x - t.uy * e * t.size
              const Y = y + t.ux * e * t.size
              x0 = Math.min(x0, X)
              x1 = Math.max(x1, X)
              y0 = Math.min(y0, Y)
              y1 = Math.max(y1, Y)
            }
        }
        const first = T[js[0]!]!
        mem.lines.push([ap, 0, r2(x0), r2(x1), r2(first.oy), r2(y1), r2(y0), r2(x0), r2(x1), 0])
      }
    }
    // (the pages it has ink of its own on, which a group of its holds: a KEPT line's page alone is none of them)
    mem.pages = [...new Set(mem.lines.filter((l) => !(l[9] & 1)).map((l) => l[0]))]
    // style: TeX's font state is not stated by today's instrument: read off its own glyphs on A as today's reader reads it
    // (facts.ts styleOf: the role, weight and slant of its fonts' names, the size, fill and design; stage 1b states it)
    // (its size today's reader's: the median of its text glyphs' sizes along the line, math fonts aside, facts.ts unitSize;
    // where it has none, the most common size of its glyphs, `read` 'size:lines': today then reads it off its lines' bands)
    const txt = mem.text.map(gA).filter((g) => /\S/.test(g.u))
    // (its faked small capitals aside, as today's originalStyle reads its size: smallCapsOf's, facts.ts fakedCaps; their share
    // Style.sc)
    const caps = fakedCaps(txt, unit ? sourceText(unit.content) : null, mem.kind.startsWith('ink'))
    const read = unitSize(caps.small.size ? txt.filter((g) => !caps.small.has(g)) : txt)
    const size =
      read ??
      mostOf(txt.map((g) => r2(g.size))) ??
      (mem.turned[0] ? r2(inkA.pages[mem.turned[0][0] - 1]!.turned![mem.turned[0][1]]!.size) : 10)
    if (read === undefined && mem.lines.length) mem.read.push('size:lines')
    // (in the text's capitals by fakedCaps' `upper`: a faked small capital is no case change; an ink unit's by its capitals' share)
    const { upper: _upper, ...read0 } = styleOf(mem.text.map(gA), size, unit ? sourceText(unit.content) : null)
    void _upper
    mem.style = {
      ...read0,
      size,
      ...(caps.upper ? { upper: 1 as const } : {}),
      ...(caps.ratio !== undefined ? { sc: caps.ratio } : {}),
    }
    // (a babel name's own text, its counter aside: S.names leaves it the original's where the target's word is it already, and
    // sets the counter after the target's word)
    if (mem.name !== undefined) {
      const ctr = new Set(mem.counterA ?? [])
      mem.plain = textOf(mem.text.filter((a) => !ctr.has(a)).map(gA))
      const cs = [...ctr].map(gA).filter((g) => !g.blank)
      if (cs.length && cs.length < mem.text.length)
        mem.counter = [
          textOf(cs),
          [
            pageA[mem.counterA![0] as number] as number,
            r2(Math.min(...cs.map((g) => g.x0))),
            r2(Math.min(...cs.map((g) => g.bottom))),
            r2(Math.max(...cs.map((g) => g.x1))),
            r2(Math.max(...cs.map((g) => g.top))),
            r2(cs[0]!.y),
          ],
        ]
    }
    // the lead: the pitch of its lines, where it has two on one page; else its size's
    const pitches: number[] = []
    for (let q = 1; q < cut.length; q++)
      if (cut[q]!.page === cut[q - 1]!.page) {
        const d = cut[q - 1]!.base - cut[q]!.base
        if (d > 0 && d < 3 * size) pitches.push(r2(d))
      }
    if (mem.lines.length) mem.read.push('style', 'lead')
    pitches.sort((x, y) => x - y)
    mem.lead = pitches.length ? (pitches[Math.floor(pitches.length / 2)] as number) : r2(1.2 * size)
    // elements: each one's own ink, one box per line it stands on (its glyphs and its rules)
    for (const [id, p0] of pieces) {
      if (p0.t !== 'el' && p0.t !== 'unit') continue
      const gl = mem.els.get(id) ?? []
      // (a nested unit, a footnote set inside the unit: its mark, the glyphs TeX set for it in the unit's text, an element of
      // the unit's as today's placeholdersOf reads it (L2:1066, a footnote mark); one B gives none an element of no ink, so that
      // the part says which of the unit's pieces are its nested units: the instrument's class `nested`)
      const p = p0.t === 'unit' ? { kind: 'note-mark' } : p0
      const bx = mem.elBoxes.get(id) ?? []
      // (each line's box of its own ink: across its glyphs' advances and their outlines (an italic glyph's overhang past its
      // advance is its ink), top to bottom; on the baseline of the unit's own text line it stands on, where it stands on one (the line TeX
      // set it on: a radical's glyph origin is at its bar, a subscript's below the line), else its own. As today's file's
      // segment of a piece (layout/stream.mjs: the piece's own ink, on its line's baseline), which the typesetter crops. A
      // display's rows are its own lines)
      const onLine = (page: number, lo: number, hi: number, own: number) => {
        const j = standsOn(mem.lines, page, lo, hi, own)
        return j >= 0 ? (mem.lines[j] as Line)[4] : own
      }
      const ink: Ink[] =
        p.kind === 'display'
          ? (displayRows.get(id) ?? []).map((l) => [l.page, r2(l.x0), r2(l.bottom), r2(l.x1), r2(l.top), l.base] as Ink)
          : cutLines(gl, atA).map((l) => {
              const outlined = l.gs.map(gA).filter((g) => g.ix1 > g.ix0)
              const x0 = Math.min(l.x0, ...outlined.map((g) => g.ix0))
              const x1 = Math.max(l.x1, ...outlined.map((g) => g.ix1))
              return [l.page, r2(x0), r2(l.bottom), r2(x1), r2(l.top), onLine(l.page, l.bottom, l.top, l.base)] as Ink
            })
      for (const [ap, ai] of bx) {
        const pg = inkA.pages[ap - 1]!
        const [x0, y0, x1, y1] = [
          pg.boxes[4 * ai]!,
          pg.boxes[4 * ai + 1]!,
          pg.boxes[4 * ai + 2]!,
          pg.boxes[4 * ai + 3]!,
        ]
        const hit = ink.find((k) => k[0] === ap && y1 >= k[2] - 0.5 && y0 <= k[4] + 0.5)
        if (hit) {
          hit[1] = r2(Math.min(hit[1], x0))
          hit[2] = r2(Math.min(hit[2], y0))
          hit[3] = r2(Math.max(hit[3], x1))
          hit[4] = r2(Math.max(hit[4], y1))
        } else ink.push([ap, r2(x0), r2(y0), r2(x1), r2(y1), r2(y0)])
      }
      const el: El = { kind: p.kind, ink }
      if (p.kind === 'display' || outside.has(id)) el.keep = 1
      // (its text where every glyph's Unicode is a reading of it: none `nu`, A17; else the typesetter crops it, TEX:420. Read
      // as the page's text layer reads it, today's rendering (tex.mjs renderingOf over PDF.js's text content): a space between two
      // glyphs PDF.js's text content sets one between (facts.ts textOf). Stated where the typesetter may draw it as text: a
      // kind of text, a class drawn as the page's text (a citation, a reference, a macro: the instrument's), its own brackets
      // (U.brackets reads the text inside them), ink over lines (a formula broken over lines is drawn as text where its
      // segments make no crops))
      const asText =
        TEXT_KINDS.has(p.kind) ||
        TEXT_CLASSES.has(classOf.get(id)?.cls ?? '') ||
        ink.length > 1 ||
        !!bracketsOf(gl.map(gA))
      if (asText && gl.length && !gl.some((a) => gA(a).nu)) {
        el.text = textOf(gl.map(gA))
        // (its runs of one fill, where its glyphs hold more than one: a link's text coloured, its brackets black)
        const runs = fillRunsOf(gl.map(gA))
        if (runs) el.fills = runs
      }
      // (a text macro none of whose glyphs the instrument gives it, 1810.04805v2's \bert set as "BERT", the unit's text: its
      // text the unit's own text glyphs between its two points on B, as today's reader finds its rendering among the unit's
      // characters (texParts: TEX:487-495); its ink stays the unit's text's)
      const cls = classOf.get(id)?.cls
      const span = placeSpan.get(`${mem.unit}|${id}`)
      if (!gl.length && (cls === 'macro' || cls === 'umacro') && span) {
        const mine = new Set(mem.text)
        const between: number[] = []
        for (let b = span[0]; b < span[1]; b++) {
          const a = m.bToA[b] as number
          if (unitB[b] === mem.unit && roleB[b] === ROLE.text && a >= 0 && mine.has(a)) between.push(a)
        }
        if (between.length && !between.some((a) => gA(a).nu)) el.text = textOf(between.map(gA))
      }
      // (a text macro whose span the instrument states with nothing in it: both its places stated and no glyph of B between them,
      // or TeX's probe said it sets none: TeX set none for it, its text '' (2610.19159v1's `\trajectoryMark{}`, whose argument
      // is empty: its end point and the point after its group hold no glyph). The reading draws it as nothing, and may: no glyph of
      // it is erased with any group)
      const emptySpan = !!span && span[0] === span[1]
      const macro = cls ?? p.kind
      if (
        !ink.length &&
        el.text === undefined &&
        (macro === 'macro' || macro === 'umacro') &&
        (emptySpan || emptyPiece.has(`${mem.unit}|${id}`))
      )
        el.text = ''
      mem.elements.push([id, el])
    }
    // its label: the class's mark before it
    if (mem.label.length) {
      const L = cutLines(mem.label, atA)[0]
      const lg = mem.label.map(gA)
      if (L) {
        // (the line of its own it stands on, by an element's rule: a footnote's mark raised over the row it shares with the note
        // before stands on that row, its first line)
        const on = standsOn(mem.lines, L.page, L.bottom, L.top, L.base)
        mem.labelAt = {
          kind: LABEL_KIND[mem.kind] ?? 'number',
          // (its glyphs' advances, as an element's ink and a line's extent)
          ink: [L.page, r2(L.x0), r2(L.bottom), r2(L.x1), r2(L.top), L.base],
          style: { role: 'serif', size: L.most },
          ...(on >= 0 ? { line: on } : {}),
        }
      }
    }
  }
  columnsAndMeasures(members, inkA, gA)
  const floors = floorsOf(members)
  const under = inkUnder(inkA)
  for (const mem of members) if (mem.lines.length) mem.room = roomOf(mem, inkA, m.offA, floors, under)
  // ---- a babel name that leads a unit (today's RUN_IN, make.mjs leadAt: the first unit start after the name's end on its line,
  // in its column, in our compile): the unit whose glyph TeX set next after the name's in B's stream (glyphs of no unit between
  // aside), that glyph its first, on the name's baseline on B (0.5 pt, leadAt's) from the name's end on (0.05 pt, leadAt's).
  // TeX's stream tells the column: after a column's last line it goes on at the next column's top, never at a line beside it
  {
    const memberOfUnit = new Map<number, Member>()
    for (const mem of members) if (mem.name === undefined && mem.unit >= 0) memberOfUnit.set(mem.unit, mem)
    for (const n of members) {
      if (n.name === undefined || !n.located || n.bLast < 0) continue
      let b = n.bLast + 1
      while (b < NB && pageB[b] === pageB[n.bLast] && (unitB[b] as number) < 0) b++
      if (b >= NB || pageB[b] !== pageB[n.bLast]) continue
      const led = memberOfUnit.get(unitB[b] as number)
      if (!led || led.bFirst !== b) continue
      const g = gB(b),
        e = gB(n.bLast)
      if (Math.abs(g.y - e.y) > 0.5 || g.x0 < e.x1 - 0.05) continue
      // (in its column: a left column's last line and the right column's first can share a baseline, the stream going on from
      // the one to the other; the columns as columnsAndMeasures read them on A, a line over both (2) of either)
      const nc = n.lines.at(-1)?.[1],
        lc = led.lines[0]?.[1]
      if (nc !== undefined && lc !== undefined && nc !== 2 && lc !== 2 && nc !== lc) continue
      n.leads = led.ord
      led.leader = n.ord
    }
  }
  // ---- the facts today's reader works out from the page before it typesets (stage 1a-2: facts-pass.ts)
  factsOf({ ins, inkA, m, members, claimedA, pageA, unitB, roleB, pieceB, units })

  // ---- flows: a member whose first line is the one before's last line, on its baseline after its end, in one paragraph of
  // TeX's (no paragraph end of B's between the one's last glyph and the other's first, where the instrument states them); a
  // table's cell and a figure's text are set in boxes of their own, never in a paragraph with another
  const ends: number[] = []
  ;(ins.tex.paragraphEnds ?? []).forEach((l, p) => {
    for (const g of l) ends.push((m.offB[p] as number) + g)
  })
  ends.sort((x, y) => x - y)
  const endBetween = (lo: number, hi: number) => {
    let a = 0
    let b = ends.length
    while (a < b) {
      const mid = (a + b) >> 1
      if ((ends[mid] as number) <= lo) a = mid + 1
      else b = mid
    }
    return a < ends.length && (ends[a] as number) <= hi
  }
  const ownBox = (x: Member) => x.kind === 'cell' || x.figure || x.kind === 'inkfigures'
  // (TeX keeps a paragraph open across the inserts set inside it: a float's caption and cells, a figure's text, a footnote's
  // text, each in a box of its own; so the member of the body before a member of the body is the last one before it that is
  // no insert's, and the paragraph ends inside those inserts (their own paragraphs: a caption's, a footnote's) are none of
  // its. 2608.06701v1 p6: a run-in head, a table and a footnote in the stream, then the head's paragraph on its row)
  const insert = (x: Member) => ownBox(x) || x.kind === 'caption' || x.kind === 'footnote'
  const flowOf = new Map<number, number[]>()
  const flows: number[][] = []
  let body: number | null = null
  for (let q = 0; q < members.length; q++) {
    const mem = members[q]!
    let k = q - 1
    if (!insert(mem) && k >= 0 && insert(members[k]!) && body !== null) k = body
    const prev = k >= 0 ? members[k]! : null
    // (the paragraph ends between the two that are not inside the inserts between them)
    const insideInsert = (e: number) => {
      for (let j = k + 1; j < q; j++) {
        const x = members[j]!
        if (x.bFirst >= 0 && e > x.bFirst && e <= x.bLast + 1) return true
      }
      return false
    }
    const endsBetween = (lo: number, hi: number) =>
      k === q - 1 ? endBetween(lo, hi) : ends.some((e) => e > lo && e <= hi && !insideInsert(e))
    const a = prev?.lines.at(-1)
    const b = mem.lines[0]
    const shares =
      !!a &&
      !!b &&
      !!prev?.located &&
      mem.located &&
      mem.unit >= 0 &&
      prev.unit >= 0 &&
      a[0] === b[0] &&
      a[1] === b[1] &&
      Math.abs(a[4] - b[4]) < 0.5 * Math.min(prev.style.size, mem.style.size) &&
      b[2] >= a[3] - 0.5 &&
      !ownBox(prev) &&
      !ownBox(mem) &&
      (prev.bLast < 0 || mem.bFirst < 0 || !endsBetween(prev.bLast, mem.bFirst))
    const into = shares ? flowOf.get(prev.ord) : undefined
    if (into) {
      mem.join = mem.labelAt && mem.labelAt.ink[0] === b![0] ? [r2(b![2] - a![3]), 1] : [r2(b![2] - a![3])]
      into.push(mem.ord)
      flowOf.set(mem.ord, into)
    } else {
      const flow = [mem.ord]
      flows.push(flow)
      flowOf.set(mem.ord, flow)
    }
    if (!insert(mem)) body = q
  }

  // ---- ties: a table's cells, laid together; a figure's set, at one size; a flow's members, at one size
  const ties: Located['ties'] = []
  {
    const tables = new Map<number, Map<number, number[]>>()
    const heads = new Set<number>()
    const sets = new Map<number, number[]>()
    for (const mem of members) {
      const unit = mem.unit >= 0 ? units[mem.unit] : undefined
      if (!unit || !mem.located) continue
      if (unit.cell) {
        const t = tables.get(unit.cell.table) ?? tables.set(unit.cell.table, new Map()).get(unit.cell.table)!
        const key = unit.cell.row * 4096 + unit.cell.col
        const l = t.get(key)
        if (l) l.push(mem.ord)
        else t.set(key, [mem.ord])
        if (unit.cell.head) heads.add(unit.cell.table)
      }
      if (unit.figure) {
        const l = sets.get(unit.figure.set)
        if (l) l.push(mem.ord)
        else sets.set(unit.figure.set, [mem.ord])
      }
    }
    for (const [t, cells] of tables)
      ties.push({
        rule: 'cells',
        cells: [...cells].sort((x, y) => x[0] - y[0]).map(([, o]) => o),
        ...(heads.has(t) ? { head: 1 as const } : {}),
      })
    for (const ords of sets.values()) if (ords.length > 1) ties.push({ rule: 'size', ords })
    // (the members of one flow: one paragraph of TeX's, a member's first line the one before's last, on its baseline after its
    // end, no paragraph end between them — a paragraph the front end cut at a float set inside it (2608.16117v1 p19, the
    // checkpoint's free-9: one part laid at its size, the other shrunk), a run-in head and its paragraph — laid at one size)
    for (const ords of flows) if (ords.length > 1) ties.push({ rule: 'size', ords: [...ords] })
  }
  // (a name that leads a unit stands before it in its flow, the unit's join its separation from the name (the joint, the unit's
  // label, kept between): design-a's `bound`, set only with the member after it. Where the unit's first line on A is not the
  // name's line (its page, its baseline within leadAt's 0.5 pt, from the name's end on), the name keeps its own flow, bound to a
  // member its part does not hold after it. (No column read: B's stream told it, and a name's short line is given the column its
  // own extent falls in, the left of a one-column page's, 2610.18513v1 p21.) No size tie: the name is drawn at its unit's size)
  for (const n of members) {
    if (n.leads === undefined) continue
    const led = members[n.leads]!
    const flow = flowOf.get(led.ord)
    const l = n.lines[0]
    const f = led.lines[0]
    if (!flow || !l || !f || n.lines.length !== 1) continue
    if (f[0] !== l[0] || Math.abs(f[4] - l[4]) > 0.5 || f[2] < l[3] - 0.05) continue
    const own = flowOf.get(n.ord)
    if (own) flows.splice(flows.indexOf(own), 1)
    const k = flow.indexOf(led.ord)
    const prev = k > 0 ? members[flow[k - 1] as number]?.lines.at(-1) : undefined
    if (prev && led.join) n.join = [r2(l[2] - prev[3])]
    flow.splice(k, 0, n.ord)
    flowOf.set(n.ord, flow)
    led.join = led.labelAt && led.labelAt.ink[0] === f[0] ? [r2(f[2] - l[3]), 1] : [r2(f[2] - l[3])]
  }

  // ---- links: A's annotations, each owned by the member that owns most of the glyphs under it (today's links.mjs ownersOf: the
  // unit whose rectangles hold more than half of its glyph points; by exact ownership, the member that owns more than half of
  // them), and within it by the element that owns more than half of them, else its text. A glyph point is a glyph's advance
  // centre on its baseline strictly inside the annotation's rectangle or one of its quads (PDF.js's overlaidText rule, today's
  // pointsOf). A link over no glyph: the member one of whose lines or elements holds its rectangle's centre
  const links: Located['links'] = new Map()
  ;(o.annotations ?? []).forEach((list, p) => {
    if (!list?.length) return
    const out: NonNullable<ReturnType<typeof links.get>> = []
    const pg = inkA.pages[p]!
    const off = m.offA[p] as number
    for (const an of list as {
      annotationType?: number
      rect?: number[]
      quadPoints?: ArrayLike<number> | null
      url?: string
      unsafeUrl?: string
      dest?: unknown
    }[]) {
      if (an.annotationType !== 2 || !Array.isArray(an.rect) || an.rect.length !== 4) continue
      const to =
        (an.url ?? an.unsafeUrl)
          ? { url: String(an.url ?? an.unsafeUrl) }
          : an.dest !== undefined
            ? { dest: JSON.stringify(an.dest) }
            : null
      if (!to) continue
      const [x0, y0, x1, y1] = an.rect.map(r2) as [number, number, number, number]
      const boxes = quadBoxesOf(an.quadPoints) ?? [
        [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
      ]
      const inside = (x: number, y: number) => boxes.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3])
      const pts: number[] = []
      pg.glyphs.forEach((g, j) => {
        if (/\S/.test(g.u) && inside((g.x0 + g.x1) / 2, g.y)) pts.push(off + j)
      })
      let owner: [number, string] | undefined
      if (pts.length) {
        const by = new Map<number, number>()
        for (const a of pts)
          if ((claimedA[a] as number) >= 0) by.set(claimedA[a] as number, (by.get(claimedA[a] as number) ?? 0) + 1)
        const top = [...by].find(([, n]) => 2 * n > pts.length)
        if (top) {
          const mem = members[top[0]]!
          const els = [...mem.els].map(([id, l]) => [id, pts.filter((a) => l.includes(a)).length] as const)
          const el = els.find(([, n]) => 2 * n > pts.length)
          owner = [mem.ord, el ? el[0] : '']
        }
      } else {
        const cx = (x0 + x1) / 2
        const cy = (y0 + y1) / 2
        const holds = (a: number, b: number, c: number, d: number) => cx >= a && cx <= c && cy >= b && cy <= d
        for (const mem of members) {
          if (!mem.pages.includes(p + 1)) continue
          const el = mem.elements.find(([, e]) => e.ink.some((k) => k[0] === p + 1 && holds(k[1], k[2], k[3], k[4])))
          if (el) owner = [mem.ord, el[0]]
          else if (mem.lines.some((l) => l[0] === p + 1 && holds(l[2], l[6], l[3], l[5]))) owner = [mem.ord, '']
          if (owner) break
        }
      }
      // (the characters of the glyphs under it, its glyph points' in their order: today's annotation's own (links.mjs g2.ch, which
      // its placeText finds among a piece's drawn characters where PDF.js's overlaidText is not read: the server's reading
      // skips it, pdf-lite.mjs's text guard)
      const text = pts.map((a) => pg.glyphs[a - off]!.u).join('')
      out.push({ box: [x0, y0, x1, y1], to, ...(owner ? { owner } : {}), ...(text ? { text } : {}) })
    }
    if (out.length) links.set(p + 1, out)
  })

  // ---- groups for the wrap
  const groups = inkA.pages.map((pg) => ({
    glyphs: new Array<string | null>(pg.glyphs.length).fill(null),
    boxes: new Array<string | null>(pg.kinds.length).fill(null),
    turned: new Array<string | null>(pg.turned?.length ?? 0).fill(null),
  }))
  const figureGroups = new Set<string>()
  const set = (a: number, g: string) => {
    const p = (pageA[a] as number) - 1
    groups[p]!.glyphs[a - (m.offA[p] as number)] = g
  }
  for (const mem of members) {
    if (!mem.located || mem.fixed) continue
    const unit = mem.unit >= 0 ? units[mem.unit] : undefined
    const pieces = unit ? piecesOf(unit.content) : new Map<string, Piece>()
    const name = (a: number, c: string) => `${mem.ord}.${pageA[a]}.${c}`
    // (an element whose ink stays, a display's, one outside the unit or on a held line: in no group)
    const keptEl = new Set(mem.elements.filter(([, el]) => el.keep).map(([id]) => id))
    for (const a of mem.text) {
      set(a, name(a, 't'))
      if (mem.figure) figureGroups.add(name(a, 't'))
    }
    for (const a of mem.label) set(a, name(a, 'l'))
    for (const [ap, aj] of mem.turned) {
      groups[ap - 1]!.turned[aj] = `${mem.ord}.${ap}.t`
      if (mem.figure) figureGroups.add(`${mem.ord}.${ap}.t`)
    }
    for (const [id, l] of mem.els) {
      if ((pieces.get(id) as { kind?: string } | undefined)?.kind === 'display' || keptEl.has(id)) continue
      for (const a of l) set(a, name(a, 'e'))
    }
    for (const [ap, ai] of mem.textBoxes) groups[ap - 1]!.boxes[ai] = `${mem.ord}.${ap}.t`
    for (const [id, l] of mem.elBoxes) {
      if ((pieces.get(id) as { kind?: string } | undefined)?.kind === 'display' || keptEl.has(id)) continue
      for (const [ap, ai] of l) groups[ap - 1]!.boxes[ai] = `${mem.ord}.${ap}.e`
    }
  }

  for (const mem of members) {
    if (mem.unit < 0 || mem.unit >= ins.units.length) continue
    if (mem.located) {
      stats.located++
      if (mem.place) stats.places[mem.place]++
    } else noteUnlocated(mem.cause ?? 'no ink')
  }
  return { units, members, born, flows, ties, links, groups, figureGroups, stats }
}

/** an annotation's quads (PDF.js's quadPoints, eight numbers a quad) as boxes, null where it has none or they are ill formed
 *  (today's links.mjs quadBoxes) */
function quadBoxesOf(q: ArrayLike<number> | null | undefined): [number, number, number, number][] | null {
  if (!q || typeof q.length !== 'number' || !q.length) return null
  const flat = Array.from(q)
  if (flat.length % 8 || !flat.every(Number.isFinite)) return null
  const out: [number, number, number, number][] = []
  for (let i = 0; i < flat.length; i += 8) {
    const xs = [flat[i]!, flat[i + 2]!, flat[i + 4]!, flat[i + 6]!]
    const ys = [flat[i + 1]!, flat[i + 3]!, flat[i + 5]!, flat[i + 7]!]
    out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  return out
}

/** each line's column and measure on A: on a page of two columns (lines on both halves that keep to their half), a line
 *  keeps to the left half (0), the right (1), or spans (2); its measure today's column of it (below; TeX's \parshape and
 *  \hangindent measures: stage 1b) */
function columnsAndMeasures(members: Member[], inkA: Doc, gA: (a: number) => DocGlyph): void {
  const byPage = new Map<number, Line[]>()
  for (const mem of members) for (const l of mem.lines) (byPage.get(l[0]) ?? byPage.set(l[0], []).get(l[0])!).push(l)
  for (const [p, lines] of byPage) {
    const v = inkA.pages[p - 1]!.view
    const mid = (v[0] + v[2]) / 2
    const left = lines.filter((l) => l[3] <= mid + 2).length
    const right = lines.filter((l) => l[2] >= mid - 2).length
    const two = left >= 3 && right >= 3
    for (const l of lines) l[1] = !two ? 0 : l[3] <= mid + 2 ? 0 : l[2] >= mid - 2 ? 1 : 2
  }
  // (each line's measure, today's column of it (run.mjs columnOf RUN:1557-1569, which U.decor widens a line of its own to): the
  // page's paragraphs' lines over its middle, three at least, else those of the nearest page before it that has three, else
  // the page's text area (its members' lines' hull); from their leftmost start to their furthest end, but a line TeX set
  // overfull: an end past the furthest end two lines share (within 0.2 pt) by less than the line's size is no edge)
  const paras = new Map<number, Line[]>()
  const area = new Map<number, [number, number]>()
  // (text lines: a display's rows and a held line, which today's rectangles leave out, are none; each by the extent of its
  // own text glyphs, which today's rectangles are (its words', an inline formula that overruns the line's end aside))
  for (const mem of members) {
    const text = new Set(mem.text)
    mem.lines.forEach((l, j) => {
      if (l[9] & 1) return
      const own = (mem.lineGlyphs[j] ?? []).filter((a) => text.has(a)).map(gA)
      const t: Line = own.length
        ? ([
            ...l.slice(0, 2),
            Math.min(...own.map((g) => g.x0)),
            Math.max(...own.map((g) => g.x1)),
            ...l.slice(4),
          ] as Line)
        : l
      const a = area.get(l[0])
      area.set(l[0], a ? [Math.min(a[0], t[2]), Math.max(a[1], t[3])] : [t[2], t[3]])
      if (mem.kind === 'para' && mem.located) (paras.get(l[0]) ?? paras.set(l[0], []).get(l[0])!).push(t)
    })
  }
  const columnOf = (l: Line, x0 = l[2]): [number, number] => {
    const mid = (x0 + l[3]) / 2
    const over = (q: number) => (paras.get(q) ?? []).filter((c) => c[2] <= mid && c[3] >= mid)
    let own = over(l[0])
    for (let q = l[0] - 1; own.length < 3 && q >= 1; q--) {
      const o = over(q)
      if (o.length >= 3) own = o
    }
    if (own.length < 3) return area.get(l[0]) ?? [l[2], l[3]]
    const ends = own.map((c) => c[3]).sort((x, y) => y - x)
    let right = ends[0] as number
    for (let i = 0; i + 1 < ends.length; i++)
      if ((ends[i] as number) - (ends[i + 1] as number) <= 0.2) {
        if ((ends[0] as number) - (ends[i] as number) < (l[10] ?? 10)) right = ends[i] as number
        break
      }
    return [Math.min(...own.map((c) => c[2])), right]
  }
  const measures = new Map<Line, [number, number]>()
  // (a line's middle as today's widened block has it: from its label's start where its label stands on it, the label drawn
  // anew beginning the block (U.decor's first rectangle, RUN:2039); 1512.03385v1 p11's "Table 9." caption across both columns,
  // whose words' middle stands in the right column and whose block's in neither: the page's text area)
  for (const mem of members)
    for (const l of mem.lines) {
      const lb = mem.labelAt?.ink
      const on = lb && lb[0] === l[0] && Math.abs(lb[5] - l[4]) < 0.4 * (l[10] ?? mem.style.size) && lb[1] < l[2]
      measures.set(l, columnOf(l, on ? lb[1] : l[2]))
    }
  for (const [l, [m0, m1]] of measures) {
    l[7] = r2(m0)
    l[8] = r2(m1)
  }
}

/** the unit's own text line an ink stands on (the line TeX set it on: a radical's glyph origin is at its bar, a subscript's below
 *  the line, a footnote's mark raised over it): of its text lines on the ink's page whose band (its fonts' boxes, half a point
 *  out) the ink, `lo` to `hi`, meets, the one nearest its own baseline; -1 for none */
function standsOn(lines: readonly Line[], page: number, lo: number, hi: number, own: number): number {
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

/** the first ink under a height on a page across x0..x1: the highest top under `foot` of a glyph with ink by its text (no blank,
 *  something of it shown) or of a box (a page-sized one aside: a background), -Infinity for none; each page's ink sorted by its
 *  tops once, read by halving from the top down (roomOf asks it under every line of every member) */
type InkUnder = (page: number, foot: number, x0: number, x1: number) => number
function inkUnder(inkA: Doc): InkUnder {
  const byPage = new Map<number, { top: Float64Array; x0: Float64Array; x1: Float64Array }>()
  const indexOf = (page: number) => {
    const got = byPage.get(page)
    if (got) return got
    const pg = inkA.pages[page - 1]!
    const W = pg.view[2] - pg.view[0]
    const H = pg.view[3] - pg.view[1]
    const all: [number, number, number][] = []
    for (const g of pg.glyphs) if (/\S/.test(g.u) && !g.unseen) all.push([g.top, g.x0, g.x1])
    for (let b = 0; b < pg.kinds.length; b++) {
      const qx0 = pg.boxes[4 * b]!
      const qy0 = pg.boxes[4 * b + 1]!
      const qx1 = pg.boxes[4 * b + 2]!
      const qy1 = pg.boxes[4 * b + 3]!
      if (!(qx1 - qx0 >= 0.9 * W && qy1 - qy0 >= 0.75 * H)) all.push([qy1, qx0, qx1])
    }
    all.sort((a, b) => b[0] - a[0])
    const ix = {
      top: Float64Array.from(all, (a) => a[0]),
      x0: Float64Array.from(all, (a) => a[1]),
      x1: Float64Array.from(all, (a) => a[2]),
    }
    byPage.set(page, ix)
    return ix
  }
  return (page, foot, x0, x1) => {
    const ix = indexOf(page)
    let lo = 0
    let hi = ix.top.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((ix.top[mid] as number) >= foot) lo = mid + 1
      else hi = mid
    }
    for (let k = lo; k < ix.top.length; k++)
      if ((ix.x1[k] as number) > x0 && (ix.x0[k] as number) < x1) return ix.top[k] as number
    return Number.NEGATIVE_INFINITY
  }
}

/** each page's lowest unit baseline: the lowest line there of its members' but a figure text's, an ink figure's and a name's
 *  (today's pageBottom, RUN:911: no unit borrows below it) */
function floorsOf(members: readonly Member[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const mem of members) {
    if (mem.figure || mem.kind === 'inkfigures' || mem.kind === 'name') continue
    for (const l of mem.lines) out.set(l[0], Math.min(out.get(l[0]) ?? Number.POSITIVE_INFINITY, l[4]))
  }
  return out
}

/** the free depth under a member's last line in its column, to the first ink not its own (a page's glyph or box), the page's
 *  bottom edge where there is none; the same under each run of its text lines, with its page's lowest unit baseline (`ends`);
 *  and the distance to the next text line of its column, baseline to baseline */
function roomOf(
  mem: Member,
  inkA: Doc,
  offA: Int32Array,
  floors: ReadonlyMap<number, number>,
  inkBelow: InkUnder,
): Room {
  const last = mem.lines.at(-1)!
  // (its last block, as Room.below and Room.next read it, from its line `at` up: its lines on the page each standing above the one
  // under it and across its column, to a kept row (a display, a held line: today's blocks split there); across: the block's
  // column, its lines' measures, as design-a's "the next text line of its column" reads it, which a translation's last line may
  // fill whatever the original's extent; never a column of its before a column break (a caption whose short last line keeps to
  // one column of a block across both stands in the block over it))
  const lastBlockOf = (at: number) => {
    const end = mem.lines[at] as Line
    let x0 = Math.min(end[7], end[2])
    let x1 = Math.max(end[8], end[3])
    let over = end[4]
    let from = at
    for (let q = at - 1; q >= 0; q--) {
      const l = mem.lines[q] as Line
      if (l[9] & 1 || l[0] !== end[0] || l[4] <= over || Math.max(l[8], l[3]) <= x0 || Math.min(l[7], l[2]) >= x1) break
      x0 = Math.min(x0, l[7], l[2])
      x1 = Math.max(x1, l[8], l[3])
      over = l[4]
      from = q
    }
    return { from, x0, x1 }
  }
  // (the free depth under a line across x0..x1: from its bottom to the first ink under it, whoever's it is (its own kept rows and
  // elements under it are ink a line borrowed there meets), the page's bottom edge where there is none)
  const depthUnder = (l: Line, x0: number, x1: number): number => {
    const pg = inkA.pages[l[0] - 1]!
    const next = inkBelow(l[0], l[6] - 0.5, x0, x1)
    return r2(Math.min(pg.view[3] - pg.view[1], Math.max(0, l[6] - (Number.isFinite(next) ? next : pg.view[1]))))
  }
  // (its last text line: the last line not kept, the first where every line is; its block)
  let at = mem.lines.length - 1
  while (at > 0 && (mem.lines[at] as Line)[9] & 1) at--
  const lastText = mem.lines[at] as Line
  const tp = lastText[0]
  const { x0: bx0, x1: bx1 } = lastBlockOf(at)
  // (the room below: from its last line's bottom to the first ink under it across its last block (its lines' measures, as for the
  // next line: a translation's lines span the block, so a line borrowed under a short last line meets what stands under the
  // block's full lines, a display, the checkpoint's free-11))
  const [p, , lx0, lx1] = last
  const below = depthUnder(last, p === tp ? Math.min(lx0, bx0) : lx0, p === tp ? Math.max(lx1, bx1) : lx1)
  // (the room under each run of its text lines, from its last up (today's freeFor, RUN:1677, which RUN:2193 gives every block:
  // a member running on to the next page or column borrows at the foot of the one it leaves, and a run over a kept row of its
  // own only down to that row), with its page's lowest unit baseline; a page with none states no room there. A run: its lines
  // on one page each standing above the one under it and across its column (its lines' measures), with no other ink between
  // the two (the first ink under the upper the lower's own: a float TeX set between two lines of a paragraph ends a run, as
  // today's blocks end at its gap), to a kept row. Its room is read across it as its lines are laid (today's block's extent):
  // from its lines' own start (a member's first line on a row it shares starts there) to its column's end (a single line
  // widened to it, RUN:1576))
  const ends: [number, number, number][] = []
  for (let e = mem.lines.length - 1; e >= 0; ) {
    const end = mem.lines[e] as Line
    if (end[9] & 1) {
      e--
      continue
    }
    let mx0 = Math.min(end[7], end[2])
    let mx1 = Math.max(end[8], end[3])
    let ox0 = end[2]
    let from = e
    for (let q = e - 1; q >= 0; q--) {
      const l = mem.lines[q] as Line
      const lower = mem.lines[q + 1] as Line
      if (l[9] & 1 || l[0] !== end[0] || l[4] <= lower[4] || Math.max(l[8], l[3]) <= mx0 || Math.min(l[7], l[2]) >= mx1)
        break
      // (another's ink between: the first under the upper higher than the lower's own top, its hundredth aside)
      if (inkBelow(l[0], l[6] - 0.5, Math.min(ox0, l[2]), Math.max(mx1, l[8], l[3])) > lower[5] + 0.005) break
      mx0 = Math.min(mx0, l[7], l[2])
      mx1 = Math.max(mx1, l[8], l[3])
      ox0 = Math.min(ox0, l[2])
      from = q
    }
    const floor = floors.get(end[0])
    if (floor !== undefined) ends.push([e, depthUnder(end, ox0, mx1), r2(floor)])
    e = from - 1
  }
  ends.reverse()
  // (the next line under its last text line (today's edgesOf `below` RUN:1655): from that line's baseline, across its last
  // block, the page's glyphs under that baseline by more than three quarters of its pitch, its own travelling ink aside (its text,
  // label and elements set anew: a script of its last line) and its kept rows counted (a display that stays under it is the next
  // ink the fill meets); of the highest, those within half a size, their median baseline)
  const travels = new Set<number>([...mem.text, ...mem.label])
  for (const [id, l] of mem.els) if (!mem.elements.find(([k]) => k === id)?.[1].keep) for (const a of l) travels.add(a)
  const T = lastText[4] - 0.75 * (mem.lead > 0 ? mem.lead : 1.2 * mem.style.size)
  const off = offA[tp - 1] as number
  const under: DocGlyph[] = []
  inkA.pages[tp - 1]!.glyphs.forEach((g, j) => {
    if (/\S/.test(g.u) && !g.unseen && g.y < T && g.x1 > bx0 && g.x0 < bx1 && !travels.has(off + j)) under.push(g)
  })
  let nextBase: number | null = null
  if (under.length) {
    const top = Math.max(...under.map((g) => g.y))
    const ys = under
      .filter((g) => g.y > top - 0.5 * g.size)
      .map((g) => g.y)
      .sort((a, b) => a - b)
    nextBase = ys[(ys.length - 1) >> 1] as number
  }
  return {
    below,
    ...(nextBase !== null ? { next: r2(lastText[4] - nextBase) } : {}),
    ...(ends.length ? { ends } : {}),
  }
}
