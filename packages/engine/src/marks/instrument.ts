// The instrument from the plan (contract stage 1c-2, item 3): the marked compile's outputs — its points in B's content
// streams, its log's channels — joined to the units through the plan (markSource's), never by running the marking again or
// reading our own TeX: a point's name is looked up in the plan, which says which unit and which piece it brackets.
//
// The ownership is today's (layout/own.mjs MR 1-7, stream.mjs ownedOf: the per-unit erasure's reading), ported where the
// marks state it, each rule with its source:
//   1. a region is a column's body or not × a depth of floats (the bracket points);
//   2. a unit's text: from its start point to its end point, in the start's region; across pages inside the bodies; 2a: a
//      range outside the bodies from a page to the next at one depth (a footnote run on) is the first page's from its start
//      to the next unit's start there, and the next page's from after the last other unit's end there to its end point;
//      2b: and the rules TeX painted on the text's own lines (\underline, OT1's \_, ulem's): any other box in its range — a
//      table's rules, a coloured box behind a cell, a frame — is not the text's (an image, a turned glyph's box: none either);
//   3. an end point alone (a title TeX sets in vertical mode): from the point before it on its page, its glyphs alone; a unit
//      whose points TeX set more than once is its first occurrence where that is an end point alone and every later one a pair;
//   4. a placeholder's ink: stream.ts (the plan's Follow of each opening mark); a text symbol's glyphs that set its character
//      are its unit's text; (4b, the raised glyphs of a footnote call with no mark after a unit's end: the call's points instead);
//      end point on that line; 4c: the closing punctuation TeX sets right after the end point, abutting, on its line;
//   5. a label: the glyphs on the start's first glyph's baseline, in its region, back to the last end point before the start,
//      the placeholders' and names' ranges passed over; the closing punctuation a head sets abutting the unit before it, that
//      unit's text; none for a cell, none for an author (LaTeX's \author sets no counter);
//   6. a babel name: between its two points; 7. an image painted between a placeholder's points, bounded on both sides by TeX's
//      facts (its closing point, or the text after it), is the placeholder's.
// A glyph is one claim's: the text's first (in the units' order), a label's where none is, a placeholder's and a name's over
// both. What the lane file lists as not ported (the spell check's releases, the label's form, own.mjs's thresholds) is not here.
//
// TRANSITION: `Instrument`, `Owners`, `ROLE` are copied from lane L1's packages/engine/src/instrument.ts (branch
// rebuild/prepare); at the merge this module imports them from there and the copies go.
import { unitId } from '../source/id.ts'
import type { SourceDoc } from '../source/read.ts'
import type { Piece } from '../source/types.ts'
import { classOf, symbolText } from './classes.ts'
import { followsOf, spellOf, writtenOf } from './follows.ts'
import { type Plan, pieceIdsOf } from './mark.ts'
import { IMAGE_BOX, type PageGlyph, type PagePoint, type PageRead } from './page.ts'
import { readStates, SENTENCE_POINT, type TexState } from './statements.ts'
import { framedOf, type Ink, OWNED, piecesInk, type Regions } from './stream.ts'

export type { PageGlyph, PagePoint, PageRead } from './page.ts'

// ---------------------------------------------------------------- L1's seam (copied: see the header)
export const ROLE = Object.freeze({ none: 0, text: 1, element: 2, label: 4, name: 8 })
export interface Owners {
  unit: Int32Array
  role: Uint8Array
  piece: Int32Array
}
export interface InstrumentUnit {
  id: string
  kind: string
  content: Piece[]
  depth?: number
  kept?: true
  fixed?: true
  echo?: number
  cell?: { table: number; row: number; col: number; span?: number; rows?: number; head?: true }
  align?: 'j' | 'l' | 'c' | 'r'
  name?: string
  figure?: { set: number; dir?: [number, number] }
  why?: string
}
export interface Instrument<Doc = unknown> {
  ink: Doc
  units: InstrumentUnit[]
  glyphs: Owners[]
  boxes: Owners[]
  turned?: Owners[]
  places?: { unit: number; piece: string; page: number; glyph: number; end: boolean }[]
  tex: {
    lineskip?: [number, number]
    paragraphEnds?: number[][]
    /** TeX's state where a unit (piece null) or a placeholder (its content id) opens (marks/statements.ts STATE_TEX) */
    states?: { unit: number; piece: string | null; state: TexState }[]
    /** where TeX ended a sentence inside a unit (SENTENCE_TEX): the glyphs before the point on its page; the next sentence
     *  begins at the next glyph */
    sentences?: { unit: number; page: number; glyph: number }[]
    /** the colour TeX was in after a colour piece (\textcolor's, \color's), as the driver names it (\current@color) */
    colours?: { unit: number; piece: string | null; colour: string }[]
  }
  made: { compiler: string; tree: string; front: string }
}
/** the instrument's bound on its work: the glyphs, boxes and lines its readings visit in all (today's own.mjs OWN_WORK and
 *  stream.mjs WORK, 20 million each). Real ranges never overlap and cost the paper's ink a few times over; a paper past it
 *  (points that delimit nothing, ranges each running to the document's end) has no layer and says why, it never hangs */
export const OWN_WORK = 20_000_000
export class WorkBound extends Error {
  constructor(bound: number) {
    super(`the instrument's reading passed its bound of ${bound} glyphs, boxes and lines visited`)
    this.name = 'WorkBound'
  }
}
export const ownersOf = (n: number): Owners => ({
  unit: new Int32Array(n).fill(-1),
  role: new Uint8Array(n),
  piece: new Int32Array(n).fill(-1),
})

const BRACKET = /^([bf])([se])\d+$/
/** each glyph's, box's and point's region: a column's body or not, a depth of floats (stream.mjs regionsOf) */
function regionsOf(pg: PageRead): Regions {
  const nBoxes = Math.floor(pg.boxes.length / 4)
  const glyph = new Int32Array(pg.glyphs.length)
  const box = new Int32Array(nBoxes)
  const at = new Int32Array(pg.points.length)
  const code = (body: boolean, depth: number) => depth * 2 + (body ? 1 : 0)
  let body = false
  let depth = 0
  const apply = (name: string) => {
    const m = BRACKET.exec(name)
    if (!m) return
    if (m[1] === 'b') body = m[2] === 's'
    else depth = m[2] === 's' ? depth + 1 : Math.max(0, depth - 1)
  }
  for (let q = 0, g = 0; g <= pg.glyphs.length; g++) {
    while (q < pg.points.length && (pg.points[q] as PagePoint).glyph <= g) {
      apply((pg.points[q] as PagePoint).name)
      at[q] = code(body, depth)
      q++
    }
    if (g < pg.glyphs.length) glyph[g] = code(body, depth)
  }
  body = false
  depth = 0
  for (let q = 0, b = 0; b < nBoxes; b++) {
    while (q < pg.points.length && (pg.points[q] as PagePoint).box <= b) apply((pg.points[q++] as PagePoint).name)
    box[b] = code(body, depth)
  }
  return { glyph, box, at }
}

// ---------------------------------------------------------------- the log's channels (marks.mjs readAlign, readSkipProbe)
/** the code of a paragraph's skips (marks.mjs alignCode): both sides stretching and \parfillskip none past them, centred;
 *  \rightskip alone flush left; \leftskip alone flush right; neither justified */
const alignCode = (lo: number, ls: number, ro: number, rs: number, po: number, ps: number): 'j' | 'l' | 'c' | 'r' => {
  const L = lo > 0 || ls > 0
  const R = ro > 0 || rs > 0
  const F = po > 0 || ps > 0
  if (L && R) return !F || po < Math.min(lo, ro) ? 'c' : 'j'
  return L ? 'r' : R ? 'l' : 'j'
}
/** each unit's alignment as its end mark states it (AXT-ALIGN, its 79-column wrap joined): none for one set in an \hbox, nor
 *  for one TeX set in two alignments (marks.mjs readAlign) */
export function readAlign(log: string): Map<number, 'j' | 'l' | 'c' | 'r'> {
  const last = new Map<number, 'j' | 'l' | 'c' | 'r' | null>()
  const told = new Map<number, 'j' | 'l' | 'c' | 'r' | false>()
  const text = log.replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  for (const m of text.matchAll(
    /^AXT-ALIGN h?(\d{1,9}) ([phv]) ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt$/gm,
  )) {
    const v = [m[3], m[4], m[5], m[6], m[7], m[8]].map(Number) as [number, number, number, number, number, number]
    if (!v.every(Number.isFinite)) continue
    const id = Number(m[1])
    const code = m[2] === 'h' ? null : alignCode(...v)
    last.set(id, code)
    if (code !== null) told.set(id, told.has(id) && told.get(id) !== code ? false : code)
  }
  const out = new Map<number, 'j' | 'l' | 'c' | 'r'>()
  for (const [id, c] of [...last].sort((a, b) => a[0] - b[0])) {
    const t = told.get(id)
    if (c !== null && t !== false) out.set(id, c)
  }
  return out
}
const TEX_PT = /^(-?\d+(?:\.\d+)?)pt$/
const BP_PER_PT = 72 / 72.27
/** the paper's \lineskip and \lineskiplimit in PDF units from the probe's row (marks.mjs readSkipProbe) */
export function readLineskip(log: string): [number, number] | null {
  const rows = [...log.matchAll(/^LAYOUT-PROBE (\d+) ([a-z][a-z0-9-]*)((?: [^ \n]+)*) *$/gm)]
    .map((m) => ({ schema: Number(m[1]), tag: m[2], fields: (m[3] as string).trim().split(' ').filter(Boolean) }))
    .filter((r) => r.schema === 1 && r.tag === 'lineskip')
  if (rows.length !== 1 || rows[0]?.fields.length !== 2) return null
  const pt = rows[0].fields.map((f) => Number(TEX_PT.exec(f)?.[1] ?? Number.NaN))
  return pt.every((x) => Number.isFinite(x) && Math.abs(x) <= 16384)
    ? (pt.map((x) => x * BP_PER_PT) as [number, number])
    : null
}

// ---------------------------------------------------------------- ownership
/** the closing punctuation glued past a unit's end mark on its line that is the unit's text (own.mjs MR 4c, TAIL_PUNCT) */
const TAIL_PUNCT = /^[.,;:!?)\]]$/
/** a head macro's closing punctuation after the unit before a start (own.mjs MR 5, HEAD_PUNCT) */
const HEAD_PUNCT = /^[)\]}.,:;!?’”]$/u
const NAME_START = /^n(\d+)\.([a-z]{1,16})\.s$/
const NAME_END = /^n(\d+)\.([a-z]{1,16})\.e$/
/** a word's space at a glyph's size (TeX's interword space is a third of an em in Computer Modern, fontdimen 2: a gap of a
 *  fifth of an em or more is one; a kern between letters, an italic correction, is less) */
const WORD_SPACE = 0.2
/** the same baseline: two glyphs whose baselines are within half the larger size */
const onLine = (a: PageGlyph, b: PageGlyph) => Math.abs(a.y - b.y) < 0.5 * Math.max(a.size, b.size)
type At = [number, number]
const before = (a: At, b: At) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

/**
 * The instrument of a marked compile: `pages` B's pages as pageInk read them (the reading `ink` is of, handed through), `plan`
 * and `doc` what markSource wrote and what it wrote it from, `log` the marked compile's last pass's log, `inkless` the macros
 * TeX said set no ink and `texts` the text the probe showed each macro sets (the probe's answers markSource took)
 */
export function instrumentFromPlan<Doc>({
  ink,
  pages,
  plan,
  doc,
  log = '',
  made,
  inkless = [],
  texts = null,
  work = OWN_WORK,
}: {
  ink: Doc
  /** the bound on the readings' work (OWN_WORK); past it WorkBound is thrown */
  work?: number
  inkless?: readonly string[]
  texts?: ReadonlyMap<string, string> | null
  pages: readonly PageRead[]
  plan: Plan
  doc: SourceDoc
  log?: string
  made: { compiler: string; tree: string }
}): Instrument<Doc> {
  // (TeX's sentence ends: points no reading of ownership takes, read on their own)
  const sentences: NonNullable<Instrument['tex']['sentences']> = []
  if (pages.some((pg) => pg.points.some((x) => SENTENCE_POINT.test(x.name)))) {
    pages = pages.map((pg, p) => {
      for (const x of pg.points)
        if (SENTENCE_POINT.test(x.name))
          sentences.push({ unit: Number(x.name.slice(1, x.name.indexOf('.'))), page: p + 1, glyph: x.glyph })
      return { ...pg, points: pg.points.filter((x) => !SENTENCE_POINT.test(x.name)) }
    })
  }
  const noInk = new Set(inkless)
  let spent = 0
  const spend = (n: number) => {
    spent += n
    if (spent > work) throw new WorkBound(work)
  }
  // (every point by its name: [page, index])
  const where = new Map<string, At[]>()
  pages.forEach((pg, p) => {
    pg.points.forEach((pt, q) => {
      const l = where.get(pt.name)
      if (l) l.push([p, q])
      else where.set(pt.name, [[p, q]])
    })
  })
  const read = new Set(where.keys())
  const w = writtenOf(plan, read)
  const byName = new Map(plan.marks.map((m) => [m.name, m]))
  const pt = ([p, q]: At) => (pages[p] as PageRead).points[q] as PagePoint
  const regions = pages.map(regionsOf)
  const at = ([p, q]: At) => (regions[p] as Regions).at[q] as number
  const glyphs = pages.map((pg) => ownersOf(pg.glyphs.length))
  const boxes = pages.map((pg) => ownersOf(Math.floor(pg.boxes.length / 4)))
  const units: InstrumentUnit[] = doc.units.map((u) => ({
    id: u.id,
    kind: u.kind,
    content: u.content,
    ...(u.depth !== undefined ? { depth: u.depth } : {}),
  }))
  readAlign(log).forEach((code, i) => {
    if (units[i]) (units[i] as InstrumentUnit).align = code
  })
  const marksOf = (u: number) => units[u] as InstrumentUnit
  const glyphOf = (p: number, g: number) => (pages[p] as PageRead).glyphs[g] as PageGlyph
  const pathOf = (p: number, b: number) => ((pages[p] as PageRead).paths?.[b] as number | undefined) ?? 0
  const ownerAt = (p: number, g: number) => (glyphs[p] as Owners).unit[g] as number
  const roleAt = (p: number, g: number) => (glyphs[p] as Owners).role[g] as number
  const set = (O: Owners, j: number, unit: number, role: number, piece = -1) => {
    O.unit[j] = unit
    O.role[j] = role
    O.piece[j] = piece
  }
  /** a text's claim: glyphs and painted paths where nothing is (the first text's) */
  const claimText = (unit: number, gs: readonly At[], bs: readonly At[] = []) => {
    for (const [p, g] of gs) if (ownerAt(p, g) < 0) set(glyphs[p] as Owners, g, unit, ROLE.text)
    for (const [p, b] of bs) {
      const O = boxes[p] as Owners
      if (pathOf(p, b) >= 0 && (O.unit[b] as number) < 0) set(O, b, unit, ROLE.text)
    }
  }
  /** a placeholder's claim, over a text's and a label's: glyphs, painted paths, and images where its reading is bounded */
  const claimPiece = (unit: number, piece: number, gs: readonly At[], bs: readonly At[], images: boolean) => {
    for (const [p, g] of gs) set(glyphs[p] as Owners, g, unit, ROLE.element, piece)
    for (const [p, b] of bs) {
      const path = pathOf(p, b)
      if (path < 0 && !(images && path === IMAGE_BOX)) continue
      set(boxes[p] as Owners, b, unit, ROLE.element, piece)
    }
  }
  /** a range's glyphs and boxes of region r from point A to point B (pages between whole) */
  const take = (A: At, B: At, r: number) => {
    const gs: At[] = []
    const bs: At[] = []
    for (let p = A[0]; p <= B[0]; p++) {
      const pg = pages[p] as PageRead
      const R = regions[p] as Regions
      const g0 = p === A[0] ? pt(A).glyph : 0
      const g1 = p === B[0] ? pt(B).glyph : pg.glyphs.length
      const b0 = p === A[0] ? pt(A).box : 0
      const b1 = p === B[0] ? pt(B).box : Math.floor(pg.boxes.length / 4)
      spend(Math.max(0, g1 - g0) + Math.max(0, b1 - b0))
      for (let g = g0; g < g1; g++) if (R.glyph[g] === r) gs.push([p, g])
      for (let b = b0; b < b1; b++) if (R.box[b] === r) bs.push([p, b])
    }
    return { gs, bs }
  }
  const takeToEnd = (A: At, r: number) => {
    const gs: At[] = []
    const bs: At[] = []
    const pg = pages[A[0]] as PageRead
    const R = regions[A[0]] as Regions
    spend(pg.glyphs.length - pt(A).glyph + Math.floor(pg.boxes.length / 4) - pt(A).box)
    for (let g = pt(A).glyph; g < pg.glyphs.length; g++) if (R.glyph[g] === r) gs.push([A[0], g])
    for (let b = pt(A).box; b < Math.floor(pg.boxes.length / 4); b++) if (R.box[b] === r) bs.push([A[0], b])
    return { gs, bs }
  }
  const takeFromStart = (B: At, r: number) => {
    const gs: At[] = []
    const bs: At[] = []
    const R = regions[B[0]] as Regions
    spend(pt(B).glyph + pt(B).box)
    for (let g = 0; g < pt(B).glyph; g++) if (R.glyph[g] === r) gs.push([B[0], g])
    for (let b = 0; b < pt(B).box; b++) if (R.box[b] === r) bs.push([B[0], b])
    return { gs, bs }
  }
  const startUnit = new Map<string, number>()
  const endUnit = new Map<string, number>()
  doc.units.forEach((_, i) => {
    const s = w.start(i)
    const e = w.end(i)
    if (s) startUnit.set(s, i)
    if (e) endUnit.set(e, i)
  })

  // ---- the text of each unit (MR 1-3, 2a), in the units' order: the first text's claim stands
  const textOf = new Map<number, { s: At | null; e: At }>()
  for (let id = 0; id < units.length; id++) {
    const S = where.get(w.start(id) ?? '') ?? []
    const E = where.get(w.end(id) ?? '') ?? []
    let s: At | null = S[0] ?? null
    const e: At | null = E[0] ?? null
    if (S.length > 1 || E.length > 1) {
      // (points TeX set more than once: the first occurrence where that is an end point alone and every later one a pair, a
      // title its class sets again in a line (acmart's ACM Reference Format); anything else is not delimited)
      const startsIn = (k: number) =>
        S.filter((y) => before(y, E[k] as At) && (k === 0 || before(E[k - 1] as At, y))).length
      if (startsIn(0) !== 0 || S.length !== E.length - 1 || E.some((_, k) => k > 0 && startsIn(k) !== 1)) {
        marksOf(id).why = 'marks'
        continue
      }
      s = null
    }
    if (!e || (s && before(e, s))) {
      marksOf(id).why = 'marks'
      continue
    }
    let list: { gs: At[]; bs: At[] }
    if (s) {
      const r = at(s)
      if (s[0] === e[0] || r % 2 === 1) list = take(s, e, r)
      else if (e[0] === s[0] + 1 && at(e) === r) {
        // 2a: the start's page to the next unit's start in its region, the next page from after the last other unit's end
        const P1 = (pages[s[0]] as PageRead).points
        let stop: At | null = null
        for (let q = s[1] + 1; q < P1.length && !stop; q++) {
          const u = startUnit.get((P1[q] as PagePoint).name)
          if ((regions[s[0]] as Regions).at[q] === r && u !== undefined && u !== id) stop = [s[0], q]
        }
        let from: At | null = null
        for (let q = 0; q < e[1]; q++) {
          const u = endUnit.get(((pages[e[0]] as PageRead).points[q] as PagePoint).name)
          if ((regions[e[0]] as Regions).at[q] === r && u !== undefined && u !== id) from = [e[0], q]
        }
        const a = stop ? take(s, stop, r) : takeToEnd(s, r)
        const b = from ? take(from, e, r) : takeFromStart(e, r)
        list = { gs: [...a.gs, ...b.gs], bs: [...a.bs, ...b.bs] }
      } else {
        marksOf(id).why = 'marks'
        continue
      }
    } else {
      // MR 3: from the point before the end point on its page (its own placeholders' points passed over), its glyphs alone
      const P1 = (pages[e[0]] as PageRead).points
      let q0 = e[1] - 1
      for (; q0 >= 0; q0--) {
        const m = byName.get((P1[q0] as PagePoint).name)
        if (!m || m.unit !== id || (m.kind !== 'open' && m.kind !== 'close')) break
      }
      list = q0 >= 0 ? take([e[0], q0], e, at(e)) : takeFromStart(e, at(e))
      list = { gs: list.gs, bs: [] }
    }
    textOf.set(id, { s, e })
    claimText(id, list.gs, lineRules(pages, list.gs, list.bs, spend))
  }
  for (let id = 0; id < units.length; id++) if (!textOf.has(id) && !marksOf(id).why) marksOf(id).why = 'marks'

  // ---- a unit's lead text symbols with no point of their own (own.mjs headSymbolsOf, MR 5b's symbols): TeX sets their
  // characters right before the unit's start point, on its line; the glyphs there, in stream order, that set exactly those
  // characters are the unit's text (the layer draws a text symbol as its character: `\#\# Role`, an affiliation's `\{kahe,
  // …\}`, a cell's `\#`). Before the labels, which take what is left. Not ported: a cell's lead macro by the text the probe
  // showed it sets (CELL_ABUT, a threshold), which stays no unit's
  const symbolsInText = new Set<string>()
  for (const [id, { s }] of textOf) {
    if (!s) continue
    const ps = doc.units[id]?.pieces ?? []
    let want = ''
    const ks: number[] = []
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k] as (typeof ps)[number]
      if (p.t === 'text') {
        if (/\S/.test(p.s)) break
        continue
      }
      if (!classOf(p)) continue
      const sym = p.t === 'ph' ? symbolText(p.src) : null
      if (sym === null || w.opening(id, k) || w.closing(id, k)) {
        want = ''
        break
      }
      want += sym.normalize('NFKC').replace(/\s/g, '')
      ks.push(k)
    }
    if (!want) continue
    const [p] = s
    const S = pt(s)
    const F = (pages[p] as PageRead).glyphs[S.glyph]
    if (!F) continue
    const run: number[] = []
    let end = want.length
    for (let g = S.glyph - 1; g >= 0 && end > 0; g--) {
      const G = glyphOf(p, g)
      const t = (G.u ?? '').normalize('NFKC').replace(/\s/g, '')
      if ((regions[p] as Regions).glyph[g] !== at(s) || ownerAt(p, g) >= 0 || !onLine(G, F)) break
      if (!t) continue
      if (!want.slice(0, end).endsWith(t)) break
      run.push(g)
      end -= t.length
    }
    if (end !== 0) continue
    for (const g of run) set(glyphs[p] as Owners, g, id, ROLE.text)
    for (const k of ks) symbolsInText.add(`${id}.${k}`)
  }

  // ---- the labels (MR 5): before the placeholders, so that a placeholder's ink is never a label's
  /** each page's glyphs inside an included graphic or a picture, between our points around it (an \includegraphics frame's
   *  g<n>a and g<n>b, pgf's picture zs and ze): a figure's own text, never a label */
  const pictured = pages.map((pg) => {
    let out: Uint8Array | null = null
    const open = new Map<string, number>()
    for (const x of pg.points) {
      const m = /^(?:g(\d+)([ab])|z([se]))$/.exec(x.name)
      if (!m) continue
      const key = m[1] ?? 'z'
      if (m[2] === 'a' || m[3] === 's') open.set(key, x.glyph)
      else if (open.has(key)) {
        out ??= new Uint8Array(pg.glyphs.length)
        out.fill(1, open.get(key) as number, Math.min(x.glyph, pg.glyphs.length))
        open.delete(key)
      }
    }
    return out
  })
  const openOf = new Map<string, string>()
  for (const m of plan.marks) if (m.kind === 'close') openOf.set(m.name, m.name.replace(/b$/, 'a'))
  /** a unit's head piece of ink with no mark of its own, before its first text (-1 none) */
  const headPiece = (unit: number): number => {
    const ps = doc.units[unit]?.pieces ?? []
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k] as (typeof ps)[number]
      if (p.t === 'text') {
        if (/\S/.test(p.s)) return -1
        continue
      }
      const c = classOf(p)
      if (!c || (c === 'macro' && p.t === 'ph' && noInk.has(p.src))) continue
      if (c === 'footnote') continue
      return w.opening(unit, k) || w.closing(unit, k) ? -1 : k
    }
    return -1
  }
  for (const [id, { s }] of textOf) {
    // (a cell carries no label: what stands before it on its line is another cell's; nor does an author: LaTeX's \author
    // sets no counter before a name, and what stands between two names is the separator \and sets and the marks after the
    // name before it)
    // (none for a figure's text either: a TikZ node or an axis label sets no counter, and the glyphs on its baseline before
    // it are the figure's other texts)
    const kind = doc.units[id]?.kind
    if (!s || kind === 'cell' || kind === 'author' || kind === 'figure') continue
    const [p, q] = s
    const pg = pages[p] as PageRead
    const S = pt(s)
    const r = at(s)
    const R = regions[p] as Regions
    const F = pg.glyphs[S.glyph]
    if (!F) continue
    const lead: number[] = []
    let g = S.glyph - 1
    const inside = pictured[p]
    const glyphAt = (i: number) => {
      if (R.glyph[i] !== r || ownerAt(p, i) >= 0 || inside?.[i]) return
      if (onLine(glyphOf(p, i), F)) lead.push(i)
    }
    const passed: { unit: number; from: number; to: number }[] = []
    let qq = q - 1
    for (; qq >= 0; qq--) {
      const X = pg.points[qq] as PagePoint
      for (; g >= X.glyph; g--) glyphAt(g)
      if (endUnit.has(X.name)) break
      const open = openOf.get(X.name) ?? (NAME_END.test(X.name) ? X.name.replace(/\.e$/, '.s') : null)
      const o = open ? (where.get(open) ?? []).find(([op, oq]) => op === p && oq < qq) : undefined
      const c = open && !NAME_END.test(X.name) ? byName.get(X.name) : undefined
      if (o && c) passed.push({ unit: c.unit, from: pt(o).glyph, to: X.glyph })
      if (o) {
        qq = o[1]
        g = Math.min(g, (pg.points[qq] as PagePoint).glyph - 1)
      }
    }
    if (qq < 0) for (; g >= 0; g--) glyphAt(g)
    if (!lead.length) continue
    lead.reverse()
    // (the closing punctuation a head macro sets after the unit before it, abutting that unit's last glyph on this line, is
    // that unit's text: amsthm's "(Note).")
    const prevEnd = qq >= 0 ? endUnit.get((pg.points[qq] as PagePoint).name) : undefined
    if (prevEnd !== undefined && prevEnd !== id) {
      const L = lead[0] as number
      const its =
        (L > 0 && ownerAt(p, L - 1) === prevEnd && roleAt(p, L - 1) === ROLE.text) ||
        (L > 0 && ownerAt(p, L - 1) < 0 && passed.some((x) => x.unit === prevEnd && L - 1 >= x.from && L - 1 < x.to))
      let k = 0
      let left = its ? glyphOf(p, L - 1) : null
      while (left && k < lead.length) {
        const G = glyphOf(p, lead[k] as number)
        if (
          !HEAD_PUNCT.test((G.u ?? '').normalize('NFKC')) ||
          G.x0 - left.x1 >= WORD_SPACE * Math.max(G.size, left.size) ||
          !onLine(G, left)
        )
          break
        left = G
        k++
      }
      if (k) {
        claimText(
          prevEnd,
          lead.slice(0, k).map((j) => [p, j] as At),
        )
        lead.splice(0, k)
      }
      if (!lead.length) continue
    }
    // (a unit whose head is a piece of ink the marking passed over, before its first text: that piece's ink stands between the
    // label and the start; the label ends at the first word space, and with none the run is the piece's)
    const head = headPiece(id)
    let cut = lead.length
    if (head >= 0) {
      cut = 0
      for (let j = 1; j < lead.length; j++) {
        const a = glyphOf(p, lead[j - 1] as number)
        const b = glyphOf(p, lead[j] as number)
        if (b.x0 - a.x1 >= WORD_SPACE * Math.max(a.size, b.size)) {
          cut = j
          break
        }
      }
    }
    lead.forEach((j, x) => {
      if (x < cut) set(glyphs[p] as Owners, j, id, ROLE.label)
      else set(glyphs[p] as Owners, j, id, ROLE.element, head)
    })
  }

  // ---- the placeholders (MR 4, 7)
  const follows = followsOf(doc, plan, w, { texts, inkless: noInk })
  const owned = piecesInk(pages, regions, follows, {
    startUnit,
    endName: (u) => w.end(u),
    startName: (u) => w.start(u),
    spend,
  })
  for (const [name, e0] of owned) {
    const f = follows.get(name)
    if (!f) continue
    let e: Ink | null = e0.how < OWNED ? e0 : null
    // (a text symbol's glyphs that set its character are its unit's text: the layer draws it as its character; nothing past
    // them is its ink)
    const piece = doc.units[f.unit]?.pieces[f.piece]
    const sym = piece?.t === 'ph' ? symbolText(piece.src) : null
    if (e && sym !== null) {
      const n = settingOf(pages, e.glyphs, sym)
      if (n > 0) {
        for (const [p, g] of e.glyphs.slice(0, n)) set(glyphs[p] as Owners, g, f.unit, ROLE.text)
        symbolsInText.add(`${f.unit}.${f.piece}`)
        e = null
      }
    }
    if (e) claimPiece(f.unit, f.piece, e.glyphs, e.boxes, e.how <= 1)
    else if (e0.how >= OWNED && textOf.has(f.unit) && !marksOf(f.unit).why) marksOf(f.unit).why = 'marks'
  }

  // (MR 4b, a footnote's call after the unit's last word that TeX gave no mark, read by the raised glyphs after the end point
  // within today's SHIFT 0.2 and CELL_ABUT 0.6 of a size, is not here: the call's own points answer it — stage 1b's count,
  // lanes/L2-source.md: 39 of 40 such calls carry their points with the probe's vetoes, 40 of 40 without them)
  // ---- the closing punctuation TeX sets after a unit's end point (MR 4c): right of the glyph before it, abutting, on its
  // line, in its region, in no claim, the first after the unit's own
  for (const [id, { e }] of textOf) {
    const [p] = e
    const pg = pages[p] as PageRead
    const E = pt(e)
    const r = at(e)
    let left = E.glyph - 1
    if (left < 0 || ownerAt(p, left) !== id || (roleAt(p, left) !== ROLE.text && roleAt(p, left) !== ROLE.element))
      continue
    for (let g = E.glyph; g < pg.glyphs.length; g++) {
      const A = glyphOf(p, g)
      const L = glyphOf(p, left)
      if (
        (regions[p] as Regions).glyph[g] !== r ||
        ownerAt(p, g) >= 0 ||
        !TAIL_PUNCT.test(A.u ?? '') ||
        (A.x0 + A.x1) / 2 <= L.x1 ||
        A.x0 - L.x1 >= WORD_SPACE * A.size ||
        !onLine(A, L)
      )
        break
      set(glyphs[p] as Owners, g, id, ROLE.text)
      left = g
    }
  }

  // ---- babel's names (MR 6): one unit a key, its occurrences its own (over a text's and a label's, not a placeholder's)
  const keyUnit = new Map<string, number>()
  for (const [name, list] of where) {
    const m = NAME_START.exec(name)
    if (!m || list.length !== 1) continue
    const close = where.get(`n${m[1]}.${m[2]}.e`) ?? []
    const A = list[0] as At
    if (close.length !== 1 || before(close[0] as At, A) || at(close[0] as At) !== at(A)) continue
    const key = m[2] as string
    if (!keyUnit.has(key)) {
      keyUnit.set(key, units.length)
      const content: Piece[] = [{ t: 'text', s: key }]
      units.push({ id: unitId('name', content), kind: 'name', content, name: key, kept: true })
    }
    const unit = keyUnit.get(key) as number
    for (const [p, g] of take(A, close[0] as At, at(A)).gs)
      if (roleAt(p, g) !== ROLE.element) set(glyphs[p] as Owners, g, unit, ROLE.name)
  }

  // ---- the lines of a unit's range its source does not spell (own.mjs spells: releaseLines, trimLead): a unit's text glyphs
  // must spell its source (stream.mjs spellOf: letters and digits, accents and case dropped); where they do not, the lines of
  // its range that stand on lines of their own and that its source does not go on with are let go — REVTeX's e-mail notes at a
  // column's foot inside a paragraph, a folio after a footnote run on —, and a title's lead TeX set on lines of its own
  // (amsart's date above its title). Not ported: own.mjs's slotted reading (a wrapper's own words, OPEN_WORDS letters at most:
  // a threshold), which only says a unit spells; a unit that does not spell is not refused here (the instrument states its
  // ink; whether a unit is drawn is locate's)
  // (an \includegraphics frame's glyphs and boxes, g<n>a to g<n>b: on the draft its frame and file name, on a final pass the
  // figure's own; no unit's either way, and kept out of the alignment's sequence: the figure's text is read from A)
  pages.forEach((pg, p) => {
    const F = framedOf(pg)
    if (!F) return
    F.glyph.forEach((f, g) => {
      if (f) set(glyphs[p] as Owners, g, -1, ROLE.none)
    })
    F.box.forEach((f, b) => {
      if (f) set(boxes[p] as Owners, b, -1, ROLE.none)
    })
  })
  const textGlyphs = new Map<number, At[]>()
  glyphs.forEach((O, p) => {
    for (let g = 0; g < O.unit.length; g++)
      if (O.role[g] === ROLE.text) {
        const u = O.unit[g] as number
        ;(textGlyphs.get(u) ?? (textGlyphs.set(u, []).get(u) as At[])).push([p, g])
      }
  })
  const letGo = (gs: readonly At[]) => {
    for (const [p, g] of gs) set(glyphs[p] as Owners, g, -1, ROLE.none)
  }
  const spelled = (a: At) => spellOf(glyphOf(a[0], a[1]).u ?? '')
  for (const [id, { s }] of textOf) {
    if (marksOf(id).why || doc.units[id]?.kind === 'name') continue
    const list = textGlyphs.get(id) ?? []
    if (!list.length) continue
    const src = sourceOf(
      doc.units[id]?.pieces ?? [],
      (k) => !!(w.opening(id, k) || w.closing(id, k)),
      (k) => symbolsInText.has(`${id}.${k}`),
    )
    const ink = list.map(spelled).join('')
    if (ink === src.text || ink === src.bare) continue
    if (!s && trimLead(id, list, src.text)) continue
    releaseLines(id, list, src.text)
  }
  /** whether a unit opens (before any text but white space) with a placeholder of ink that has no point of its own */
  function opensUnmarked(id: number): boolean {
    const ps = doc.units[id]?.pieces ?? []
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k] as (typeof ps)[number]
      if (p.t === 'text') {
        if (/\S/.test(p.s)) return false
        continue
      }
      const c = classOf(p)
      if (!c || (c === 'macro' && p.t === 'ph' && noInk.has(p.src))) continue
      if (c !== 'footnote' && !w.opening(id, k) && !w.closing(id, k)) return true
    }
    return false
  }
  /** a title (an end point alone) whose range opens with ink TeX set on lines of its own before it: where the range's last glyphs
   *  spell its source exactly and every glyph before them stands on no line of theirs, those are let go */
  function trimLead(id: number, list: readonly At[], want: string): boolean {
    if (opensUnmarked(id)) return false
    let acc = ''
    let k = list.length
    while (k > 0 && acc.length < want.length) {
      k--
      acc = spelled(list[k] as At) + acc
    }
    if (acc !== want || k === 0) return false
    const lead = list.slice(0, k)
    const rest = list.slice(k)
    for (const a of lead) {
      const A = glyphOf(a[0], a[1])
      if (!/\S/.test(A.u ?? '')) continue
      if (rest.some((b) => b[0] === a[0] && onLine(glyphOf(b[0], b[1]), A))) return false
    }
    letGo(lead)
    return true
  }
  /** a unit's lines its source does not spell, each on a line of its own and below every kept line it meets, let go, where the
   *  other lines spell the source in order, whole; none from a unit with a visible placeholder of no point of its own */
  function releaseLines(id: number, list: readonly At[], want: string): boolean {
    const ps = doc.units[id]?.pieces ?? []
    const unmarked = ps.some((p, k) => {
      const c = classOf(p)
      if (!c || (c === 'macro' && p.t === 'ph' && noInk.has(p.src)) || (p.t === 'ph' && symbolText(p.src) !== null))
        return false
      return !w.opening(id, k) && !w.closing(id, k)
    })
    if (unmarked) return false
    const lines: At[][] = []
    for (const a of list) {
      const last = lines.at(-1)
      const b = last?.at(-1)
      if (last && b && b[0] === a[0] && onLine(glyphOf(b[0], b[1]), glyphOf(a[0], a[1]))) last.push(a)
      else lines.push([a])
    }
    const box = (l: At[]) => {
      let x0 = Number.POSITIVE_INFINITY
      let x1 = Number.NEGATIVE_INFINITY
      for (const a of l) {
        const G = glyphOf(a[0], a[1])
        x0 = Math.min(x0, G.x0)
        x1 = Math.max(x1, G.x1)
      }
      const F = glyphOf((l[0] as At)[0], (l[0] as At)[1])
      return { p: (l[0] as At)[0], y: F.y, size: F.size, x0, x1 }
    }
    const boxesOf = lines.map(box)
    const alone = (k: number) => {
      const K = boxesOf[k] as ReturnType<typeof box>
      return boxesOf.every(
        (o, m) =>
          m === k ||
          o.p !== K.p ||
          Math.abs(o.y - K.y) >= 0.5 * Math.max(o.size, K.size) ||
          o.x1 <= K.x0 ||
          K.x1 <= o.x0,
      )
    }
    let j = 0
    const released: number[] = []
    for (let k = 0; k < lines.length; k++) {
      const t = (lines[k] as At[]).map(spelled).join('')
      if (want.startsWith(t, j)) {
        j += t.length
        continue
      }
      if (!alone(k)) return false
      released.push(k)
    }
    if (j !== want.length || !released.length) return false
    const out = new Set(released)
    type Line = ReturnType<typeof box>
    const meets = (o: Line, b: Line) => o.p === b.p && o.x0 < b.x1 && b.x0 < o.x1
    for (const k of out) {
      const K = boxesOf[k] as Line
      if (boxesOf.some((o, m) => !out.has(m) && meets(o, K) && o.y < K.y)) return false
    }
    for (const k of out) letGo(lines[k] as At[])
    return true
  }

  // ---- where each element begins and ends in B's stream (its points)
  const places: NonNullable<Instrument['places']> = []
  pages.forEach((pg, p) => {
    for (const x of pg.points) {
      const m = byName.get(x.name)
      if (!m || (m.kind !== 'open' && m.kind !== 'close') || m.pieceId === null) continue
      places.push({ unit: m.unit, piece: m.pieceId, page: p + 1, glyph: x.glyph, end: m.kind === 'close' })
    }
  })
  // ---- the colour TeX was in after each colour piece (AXT-COLOUR c<u>.<k> <\current@color>, its 79-column wrap joined)
  const colours: NonNullable<Instrument['tex']['colours']> = []
  for (const m of log.replace(/^(AXT-COLOUR .{68})\n/gm, '$1').matchAll(/^AXT-COLOUR c(\d+)\.(\d+) (.*)$/gm)) {
    const unit = Number(m[1])
    const ids = doc.units[unit] ? pieceIdsOf(doc.units[unit].pieces) : []
    colours.push({ unit, piece: ids[Number(m[2])] ?? null, colour: (m[3] as string).trim() })
  }
  // ---- TeX's state where each unit, cell, heading and placeholder opens (STATE_TEX: its font, \baselineskip and measure)
  const told = readStates(log)
  const states: NonNullable<Instrument['tex']['states']> = []
  for (const m of plan.marks) {
    if (m.kind !== 'start' && m.kind !== 'cell-start' && m.kind !== 'heading-start' && m.kind !== 'open') continue
    const state = told.get(m.name)
    if (state) states.push({ unit: m.unit, piece: m.kind === 'open' ? m.pieceId : null, state })
  }
  const lineskip = readLineskip(log)
  return {
    ink,
    units,
    glyphs,
    boxes,
    places,
    tex: {
      ...(lineskip ? { lineskip } : {}),
      paragraphEnds: pages.map((pg) => (pg.paraEnds ?? []).map((x) => x.glyph)),
      states,
      ...(sentences.length ? { sentences } : {}),
      ...(colours.length ? { colours } : {}),
    },
    made: { compiler: made.compiler, tree: made.tree, front: 'marks' },
  }
}

/** how many of `gs` (a reading's, in stream order) from the first set `text` exactly, character for character (NFKC, white
 *  space out, a blank glyph passed over); 0 where they do not begin so (own.mjs settingOf) */
function settingOf(pages: readonly PageRead[], gs: readonly At[], text: string): number {
  const want = text.normalize('NFKC').replace(/\s/g, '')
  let n = 0
  for (let j = 0; j < gs.length && n < want.length; j++) {
    const [p, i] = gs[j] as At
    const t = ((pages[p] as PageRead).glyphs[i]?.u ?? '').normalize('NFKC').replace(/\s/g, '')
    if (!t) continue
    if (!want.startsWith(t, n)) return 0
    n += t.length
    if (n === want.length) return j + 1
  }
  return 0
}

/** a unit's source text as the spelling reads it (own.mjs sourceOf): its texts spelled, a text symbol with no point of its own
 *  after the unit's first text, and one whose glyphs went to the text, its character; `bare` the texts alone */
function sourceOf(
  pieces: SourceDoc['units'][number]['pieces'],
  marked: (k: number) => boolean,
  inText: (k: number) => boolean,
): { text: string; bare: string } {
  let text = ''
  let bare = ''
  let opened = false
  pieces.forEach((p, k) => {
    if (p.t === 'text') {
      const t = spellOf(p.s)
      text += t
      bare += t
      if (/\S/.test(p.s)) opened = true
    } else if (p.t === 'ph' && ((!marked(k) && opened) || inText(k))) {
      const sym = symbolText(p.src)
      if (sym !== null) text += spellOf(sym)
    }
  })
  return { text, bare }
}

/** a text rule's thickness at most, of its line's size: TeX's text rules (\underline, OT1's \_, ulem's and soul's) are rules
 *  of the default thickness, 0.4 pt (TeXbook ch. 21, an \hrule's height; cmex10's default_rule_thickness), a twentieth of an
 *  8 pt line and a sixtieth of a 24 pt one; a letter's stroke, an icon's part, a coloured box's height are a quarter of a size
 *  or more (own.mjs RULE_EM) */
const RULE_EM = 0.1
/**
 * The painted rules of `bs` that stand on a line of `gs` (own.mjs lineRulesOf, MR 2b): a painted path no thicker than RULE_EM
 * of its line's size and at least twice as long, its middle within half a size of the line's baseline, across within the line's
 * extent and half a size past it; and no part of a frame: no other thin box of the range meets it within its own thickness
 * (amsthm's \openbox, an \fbox: their upright sides). A line: a page's glyphs on one baseline
 */
function lineRules(
  pages: readonly PageRead[],
  gs: readonly At[],
  bs: readonly At[],
  spend: (n: number) => void = () => {},
): At[] {
  const pathOf = (p: number, b: number) => ((pages[p] as PageRead).paths?.[b] as number | undefined) ?? 0
  const painted = bs.filter(([p, b]) => pathOf(p, b) >= 0)
  if (!painted.length) return []
  const lines: { p: number; y: number; size: number; x0: number; x1: number }[] = []
  let last: (typeof lines)[number] | null = null
  for (const [p, g] of gs) {
    const G = (pages[p] as PageRead).glyphs[g] as PageGlyph
    if (!/\S/.test(G.u ?? '') || !(G.size > 0)) continue
    const on = (l: (typeof lines)[number]) => l.p === p && Math.abs(l.y - G.y) < 0.5 * Math.max(l.size, G.size)
    const again: boolean = !!last && on(last)
    if (!again) spend(lines.length)
    const l: (typeof lines)[number] | null = again ? last : (lines.find(on) ?? null)
    if (l) {
      l.x0 = Math.min(l.x0, G.x0)
      l.x1 = Math.max(l.x1, G.x1)
      l.size = Math.max(l.size, G.size)
      last = l
      continue
    }
    last = { p, y: G.y, size: G.size, x0: G.x0, x1: G.x1 }
    lines.push(last)
  }
  const box = ([p, b]: At) => {
    const B = (pages[p] as PageRead).boxes
    return [B[4 * b] as number, B[4 * b + 1] as number, B[4 * b + 2] as number, B[4 * b + 3] as number] as const
  }
  const ruled = new Map<At, number>()
  let most = 0
  for (const x of painted) {
    spend(lines.length)
    const [x0, y0, x1, y1] = box(x)
    const mid = (y0 + y1) / 2
    const h = y1 - y0
    const l = lines.find(
      (l) =>
        l.p === x[0] &&
        Math.abs(mid - l.y) < 0.5 * l.size &&
        x0 >= l.x0 - 0.5 * l.size &&
        x1 <= l.x1 + 0.5 * l.size &&
        h <= RULE_EM * l.size &&
        x1 - x0 >= 2 * h,
    )
    if (l) {
      ruled.set(x, l.size)
      most = Math.max(most, l.size)
    }
  }
  if (!ruled.size) return []
  const others = painted.filter((o) => {
    if (ruled.has(o)) return false
    const [a0, b0, a1, b1] = box(o)
    return Math.min(a1 - a0, b1 - b0) <= RULE_EM * most
  })
  const out: At[] = []
  for (const [x, size] of ruled) {
    spend(others.length)
    const [x0, y0, x1, y1] = box(x)
    const e = y1 - y0
    const framed = others.some((o) => {
      if (o[0] !== x[0]) return false
      const [a0, b0, a1, b1] = box(o)
      return (
        Math.min(a1 - a0, b1 - b0) <= RULE_EM * size && a0 <= x1 + e && x0 - e <= a1 && b0 <= y1 + e && y0 - e <= b1
      )
    })
    if (!framed) out.push(x)
  }
  return out
}
