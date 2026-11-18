// The marked compile's log channels and what they state with B's points: each unit's alignment (AXT-ALIGN), the paper's
// \lineskip (the probe's row), each page's text frame (AXT-BODY at each body's opening point). Read by the front half's adapter
// (src/pdf-reader/engine/pipeline/instrument.mjs, through the package's entry). Of the instrument's types alone.
import { GLUE_NAMES, type GlueName, type ParaMeasure, type TexFrame } from '../instrument.ts'

/** the code of a paragraph's skips (marks.mjs alignCode): both sides stretching and \parfillskip none past them, centred;
 *  \rightskip alone flush left; \leftskip alone flush right; neither justified */
const alignCode = (lo: number, ls: number, ro: number, rs: number, po: number, ps: number): 'j' | 'l' | 'c' | 'r' => {
  const L = lo > 0 || ls > 0
  const R = ro > 0 || rs > 0
  const F = po > 0 || ps > 0
  if (L && R) return !F || po < Math.min(lo, ro) ? 'c' : 'j'
  return L ? 'r' : R ? 'l' : 'j'
}
/** LaTeX's column classes by their \@chnum (latex.ltx's \@testpach numbers c, l, r 0 to 2, array.sty's c, l, r, m, p, b 0 to
 *  5), as the alignment they set a cell's line by, read by that number; m, p and b's lines are a paragraph's (where m and b
 *  stand them in the row: readCellStands) */
const CELL_CLASS: readonly ('c' | 'l' | 'r' | undefined)[] = ['c', 'l', 'r']
/**
 * Each unit's alignment as its end mark states it (AXT-ALIGN, its 79-column wrap joined, in the order TeX set the paragraphs):
 * none for one TeX set last in an \hbox (marks.mjs readAlign: a caption set as a paragraph and then in a box). A unit TeX set
 * as paragraphs of two alignments has its first's: the unit is its first occurrence (own.mjs MR 3, the marks' and the
 * instrument's ownership; pdfTeX keeps a destination set twice at its first), the text a template sets again after it its
 * copy, never its own (2608.25210v2's title and authors, centred by \maketitle and set again ragged right in VLDB's "PVLDB
 * Reference Format"; 2610.22065v1's title in ACM's reference format, justified; an author's name in an e-mail footnote): an
 * alignment TeX stated is never dropped for a copy's, the full line its title fills read off A as justified.
 * A table cell's (its end mark `t<i>e`) is its own paragraph's where TeX set it one (a p, m or b column, X, a \parbox, tblr's
 * cells), else the class LaTeX built the cell's column template from (AXT-CELL <i> <class>, written at the template's end:
 * LaTeX's \@chnum, its reading of the column's letter after \newcolumntype and *{n}{…}, \multicolumn's own spec where the cell
 * is one): c centred, l flush left, r flush right (TeX's \hfil on the side or sides the slack goes); m, p and b none, their
 * lines a paragraph's. The cell's first (tabularx sets its table once for each trial width, the same). A cell no template of
 * LaTeX's set (a plain \halign) states nothing. A unit that is no cell's but its cell's one unit, set in its line (an author
 * block's name or place in the tabular \maketitle sets it in: its AXT-ALIGN `h`, an \hbox's, which tells nothing), states its
 * cell's class the same way (marks.mjs LAYOUT_TEX)
 */
export function readAlign(log: string): Map<number, 'j' | 'l' | 'c' | 'r'> {
  const text = log.replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  const out = paragraphAligns(text)
  // (a cell's class, where its own paragraph tells nothing)
  const classed = new Set<number>()
  for (const m of text.matchAll(/^AXT-CELL (\d{1,9}) ([0-5]) *$/gm)) {
    const id = Number(m[1])
    if (classed.has(id)) continue
    classed.add(id)
    const code = CELL_CLASS[Number(m[2])]
    if (code && !out.has(id)) out.set(id, code)
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]))
}
/** each unit's paragraph's alignment as its end mark states it (readAlign's first reading, the log's wrap joined): the first
 *  paragraph's, none where TeX set it last in an \hbox */
function paragraphAligns(text: string): Map<number, 'j' | 'l' | 'c' | 'r'> {
  const last = new Map<number, 'j' | 'l' | 'c' | 'r' | null>()
  const told = new Map<number, 'j' | 'l' | 'c' | 'r'>()
  for (const m of text.matchAll(
    /^AXT-ALIGN [ht]?(\d{1,9}) ([phv]) ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt$/gm,
  )) {
    const v = [m[3], m[4], m[5], m[6], m[7], m[8]].map(Number) as [number, number, number, number, number, number]
    if (!v.every(Number.isFinite)) continue
    const id = Number(m[1])
    const code = m[2] === 'h' ? null : alignCode(...v)
    last.set(id, code)
    if (code !== null && !told.has(id)) told.set(id, code)
  }
  const out = new Map<number, 'j' | 'l' | 'c' | 'r'>()
  for (const [id, c] of [...last].sort((a, b) => a[0] - b[0])) {
    const t = told.get(id)
    if (c !== null && t !== undefined) out.set(id, t)
  }
  return out
}
/**
 * Each table cell whose text TeX set in its column template's own box, by the class LaTeX built that template from
 * (AXT-CELL <i> <class>, the cell's first: c, l, r): TeX's \hfil on the side or sides the slack goes, so that the entries of one
 * column stand on its left edge (l), its right edge (r) or its middle (c), the column as wide as its widest entry (the column's
 * box, Room.column: locate/columns.ts). None for a cell whose text is a paragraph of its own (a p, m or b column, X, a \parbox in
 * the cell: its AXT-ALIGN a paragraph's, which readAlign reads first), whose box is that paragraph's \hsize and no glyph's; none
 * for a cell no template of LaTeX's set (a plain \halign states no class)
 */
export function readCellBoxes(log: string): Map<number, 'c' | 'l' | 'r'> {
  const text = log.replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  const paragraph = paragraphAligns(text)
  const seen = new Set<number>()
  const out = new Map<number, 'c' | 'l' | 'r'>()
  for (const m of text.matchAll(/^AXT-CELL (\d{1,9}) ([0-5]) *$/gm)) {
    const id = Number(m[1])
    if (seen.has(id)) continue
    seen.add(id)
    const code = CELL_CLASS[Number(m[2])]
    if (code && !paragraph.has(id)) out.set(id, code)
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]))
}
/**
 * Each table cell whose column template LaTeX built from an m or a b (AXT-CELL <i> <class>, the cell's first: array.sty's \@chnum
 * 3 or 5), as where TeX stands the cell's lines in its row: an m cell's box lowered by half its height past the strut's
 * (array.sty's \ar@align@mcell), the middle of its first and last baselines on the row's baseline; a b cell's a \vbox, its last
 * line on it. None for c, l and r (a line of the template's own box), for p (a \vtop, its first line on the row's, where a cell's
 * lines start), and for a cell no template of LaTeX's set (a plain \halign states no class): Placed.stand, docs/PDF-READER.md
 * §18.92
 */
export function readCellStands(log: string): Map<number, 'm' | 'b'> {
  const seen = new Set<number>()
  const out = new Map<number, 'm' | 'b'>()
  for (const m of log.matchAll(/^AXT-CELL (\d{1,9}) ([0-5]) *$/gm)) {
    const id = Number(m[1])
    if (seen.has(id)) continue
    seen.add(id)
    const code = CELL_STAND[Number(m[2])]
    if (code) out.set(id, code)
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]))
}
/** where TeX stands a cell's lines in its row by its column's \@chnum (array.sty's c, l, r, m, p, b 0 to 5): m and b alone */
const CELL_STAND: readonly ('m' | 'b' | undefined)[] = [undefined, undefined, undefined, 'm', undefined, 'b']
/**
 * The alignment the skips in force state of each unit TeX set only in boxes (its every AXT-ALIGN record an \hbox's, `h`: ICML's
 * \icmlauthor sets each name in \mbox{\bf #1}), where they stretch on a side: c, l or r (alignCode, as a paragraph's). The box is
 * no paragraph, and readAlign takes it for nothing: what the skips say of the line it stands in, boxedAlignOf holds against the
 * paragraph's end. None where the skips stretch on neither side (an \hbox in a justified paragraph, a box in vertical mode with
 * no skips: nothing stated), nor where two of its records state two, nor for a unit set in a table's cell (AXT-CELL: the cell's
 * line, which readAlign reads by its column's class)
 */
export function readBoxAlign(log: string): Map<number, 'l' | 'c' | 'r'> {
  const seen = new Map<number, 'j' | 'l' | 'c' | 'r' | false>()
  const text = log.replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  for (const m of text.matchAll(
    /^AXT-ALIGN [ht]?(\d{1,9}) ([phv]) ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt ([0-4]) (-?[\d.]+)pt$/gm,
  )) {
    const v = [m[3], m[4], m[5], m[6], m[7], m[8]].map(Number) as [number, number, number, number, number, number]
    if (!v.every(Number.isFinite)) continue
    const id = Number(m[1])
    const code = m[2] === 'h' ? alignCode(...v) : false
    seen.set(id, seen.has(id) && seen.get(id) !== code ? false : code)
  }
  for (const m of text.matchAll(/^AXT-CELL (\d{1,9}) [0-5] *$/gm)) seen.set(Number(m[1]), false)
  const out = new Map<number, 'l' | 'c' | 'r'>()
  for (const [id, c] of [...seen].sort((a, b) => a[0] - b[0])) if (c && c !== 'j') out.set(id, c)
  return out
}
/** a page of B as the adapter holds it: its points in stream order, its paragraphs' starts (`q<n>`) and ends (`qe<n><code>`,
 *  each with the count of the page's points before it) */
type ParaPage = {
  points: readonly { name: string; glyph: number }[]
  paras?: readonly { name: string; glyph: number }[]
  paraEnds?: readonly { name: string; glyph: number; point: number }[]
}
/** a body's or a float's bracket (LAYOUT_TEX's `bs<n>`, `be<n>`, `fs<n>`, `fe<n>`), a cell's start or end mark */
const NO_LINE = /^(?:[bf][se]\d+|t\d+[se])$/
/**
 * The alignments readBoxAlign reads that the paragraph the box stands in states too: the first paragraph end on the unit's end
 * mark's page after it (`qe<n><code>`, its code TeX's alignment of the paragraph), with nothing between but units' marks and
 * glyphs (no paragraph begun, no body's or float's bracket, no cell's mark: else the box stands in no line of that paragraph,
 * a box in vertical mode, a table's cell), stating the same code. By unit index, the unit's end mark `<i>e` (a heading's
 * `h<i>e`). The two are TeX's own statements of the line: the skips in force where the box was set and the paragraph's alignment
 * where TeX ended it
 */
export function boxedAlignOf(
  boxed: ReadonlyMap<number, 'l' | 'c' | 'r'>,
  pages: readonly ParaPage[],
): Map<number, 'l' | 'c' | 'r'> {
  const out = new Map<number, 'l' | 'c' | 'r'>()
  if (!boxed.size) return out
  const at = new Map<string, [number, number]>()
  pages.forEach((pg, p) => {
    pg.points.forEach((x, k) => {
      if (/^h?\d+e$/.test(x.name) && !at.has(x.name)) at.set(x.name, [p, k])
    })
  })
  for (const [id, code] of boxed) {
    const where = at.get(`${id}e`) ?? at.get(`h${id}e`)
    if (!where) continue
    const [p, k] = where
    const pg = pages[p]!
    const from = pg.points[k]!.glyph
    const end = [...(pg.paraEnds ?? [])].filter((e) => e.point > k).sort((a, b) => a.point - b.point)[0]
    if (!end) continue
    if (pg.points.slice(k + 1, end.point).some((x) => NO_LINE.test(x.name))) continue
    if ((pg.paras ?? []).some((q) => q.glyph > from && q.glyph < end.glyph)) continue
    if (/^qe\d+([cjlr])$/.exec(end.name)?.[1] === code) out.set(id, code)
  }
  return out
}
const BP_PER_PT = 72 / 72.27

/** a TeX scaled point in PDF units (65,536 sp a TeX point) */
const BP_PER_SP = BP_PER_PT / 65536
/** a body TeX shipped as it states it (AXT-BODY): which column it is (1 the left, 2 the right; 0 a one-column page's body or a
 *  text block shipped whole), the column's and the text block's widths and its box's left edge on its page, in PDF units; and,
 *  where TeX states it, the depth of the text block's bottom under the page's top edge (\textheight's foot as \@outputpage
 *  ships it) */
type TexBody = { side: 0 | 1 | 2; column: number; text: number; x: number; foot?: number }
/**
 * Each bracketed body's statement (marks.mjs LAYOUT_TEX's `AXT-BODY <n> <side> <\columnwidth> <\textwidth> <x> <depth>`,
 * written at the shipout beside the body's opening point `bs<n>`), by its serial: the first (a box shipped twice states it
 * twice, the same). A line not of the form is passed over: a compile made before the statement, or an engine with no saved
 * position (its x empty), states none; one made before the depth states no foot
 */
export function readBodies(log: string): Map<number, TexBody> {
  const out = new Map<number, TexBody>()
  for (const m of log.matchAll(
    /^AXT-BODY (\d{1,9}) ([012]) (\d+(?:\.\d+)?)pt (\d+(?:\.\d+)?)pt (-?\d{1,12})(?: (\d+(?:\.\d+)?)pt)? *$/gm,
  )) {
    const n = Number(m[1])
    if (out.has(n)) continue
    const [column, text, x] = [Number(m[3]) * BP_PER_PT, Number(m[4]) * BP_PER_PT, Number(m[5]) * BP_PER_SP]
    if (!(column > 0 && text > 0 && column <= text + 0.5 && Number.isFinite(x))) continue
    const foot = m[6] !== undefined ? Number(m[6]) * BP_PER_PT : undefined
    out.set(n, {
      side: Number(m[2]) as 0 | 1 | 2,
      column,
      text,
      x,
      ...(foot !== undefined && foot > 0 ? { foot } : {}),
    })
  }
  return out
}
/** a glue as TeX prints it (`\the` of a skip, what \showthe shows): its natural size, then its stretch and its shrink where not
 *  zero, each a number of points or of an infinite order (fil, fill, filll); groups: natural, stretch, its order, shrink, its order.
 *  A dimension is a glue of neither */
const GLUE = String.raw`(-?\d+(?:\.\d+)?)pt(?: plus (-?\d+(?:\.\d+)?)(pt|fil{1,3}))?(?: minus (-?\d+(?:\.\d+)?)(pt|fil{1,3}))?`
/** a glue TeX printed, natural and shrink in PDF units ([natural, shrink]): null where its shrink is of an infinite order, which
 *  no number states (TeX may shrink it to nothing and past), or where it is no glue of TeX's form */
export function glueOf(printed: string): [number, number] | null {
  const m = new RegExp(`^${GLUE}$`).exec(printed.trim())
  if (!m) return null
  if (m[5] !== undefined && m[5] !== 'pt') return null
  const natural = Number(m[1]) * BP_PER_PT
  const shrink = m[4] !== undefined ? Number(m[4]) * BP_PER_PT : 0
  return Number.isFinite(natural) && Number.isFinite(shrink) ? [natural, shrink] : null
}
/** the log's lines that begin with `tag`, each joined to the lines TeX wrapped it onto (a printed line of the log's 79 columns
 *  goes on on the next; a statement ends in a line break of its own, so a line of 79 is followed by its rest or by an empty
 *  one) */
function taggedLines(log: string, tag: string): string[] {
  const lines = log.split('\n')
  const out: string[] = []
  for (let k = 0; k < lines.length; k++) {
    if (!lines[k]!.startsWith(tag)) continue
    let s = lines[k]!
    for (let w = lines[k]!; w.length === 79 && k + 1 < lines.length; ) {
      w = lines[++k]!
      s += w
    }
    out.push(s)
  }
  return out
}
/**
 * Each unit's \baselineskip and \parskip, natural, where its paragraph ends (LINES_TEX's `AXT-LINES <unit> <\prevgraf>
 * <\baselineskip> <size> <\parskip>`, the last TeX pass's), in PDF units, by unit index: TeX's normal paragraph separation
 * there, their sum, which the next ink under a borrowed line keeps (the owner's ruling of 2026-11-08); and \parskip's shrink, a
 * third, where it is of points (TeX's least separation there is the natural less it: the display design's 2d, rule 2), none
 * where it is of an infinite order. A unit TeX set no paragraph for (a caption measured in a box alone, a heading, the front
 * matter's) states none; nor does a compile made before \parskip was stated
 */
export function readSkips(log: string): Map<number, [number, number, number?]> {
  const out = new Map<number, [number, number, number?]>()
  const re = new RegExp(`^AXT-LINES (\\d{1,9}) \\d+ ${GLUE} \\d+(?:\\.\\d+)? ${GLUE} *$`, 'gm')
  // (a statement longer than the log's 79 columns wrapped: joined)
  for (const m of log.replace(/^(AXT-LINES .{69})\n/gm, '$1').matchAll(re)) {
    const [bs, ps] = [Number(m[2]) * BP_PER_PT, Number(m[7]) * BP_PER_PT]
    if (!(Number.isFinite(bs) && Number.isFinite(ps) && bs > 0)) continue
    // (\parskip's shrink: of points, else none stated; zero where TeX printed none)
    const shrink = m[11] === undefined ? 0 : m[11] === 'pt' ? Number(m[10]) * BP_PER_PT : Number.NaN
    out.set(Number(m[1]), Number.isFinite(shrink) ? [bs, ps, shrink] : [bs, ps])
  }
  return out
}
/** a heading's skips as TeX evaluated them where it set its title (readHeads): its before-skip and its after-skip as its class
 *  gives them to \@startsection, signed, natural and shrink; \baselineskip, natural, and \parskip, natural and shrink, there; in
 *  PDF units */
export type HeadSkips = {
  before: [number, number]
  after: [number, number]
  baselineskip: number
  parskip: [number, number]
}
/**
 * Each heading's skips (STATEMENTS_TEX's GAPS_TEX: `AXT-SECT h<i>s b <before>`, `a <after>`, `l <\baselineskip>`, `p
 * <\parskip>`, written by the heading's first mark TeX set, its start), by unit index: the first of a unit (a title set twice, in a
 * box measured first, is the same), where all four are stated, each a glue of points (glueOf); none for a heading TeX set through
 * no \@startsection, nor in a compile made before the statement. The sign is the class's (marks.ts GAPS_TEX): the part reads it
 */
export function readHeads(log: string): Map<number, HeadSkips> {
  const got = new Map<number, Partial<Record<'b' | 'a' | 'l' | 'p', [number, number] | null>>>()
  for (const line of taggedLines(log, 'AXT-SECT ')) {
    const m = /^AXT-SECT h(\d{1,9})[se] ([abpl]) (.*)$/.exec(line)
    if (!m) continue
    const unit = Number(m[1])
    const k = m[2] as 'b' | 'a' | 'l' | 'p'
    const one = got.get(unit) ?? got.set(unit, {}).get(unit)!
    if (!(k in one)) one[k] = glueOf(m[3]!)
  }
  const out = new Map<number, HeadSkips>()
  for (const [unit, g] of [...got].sort((a, b) => a[0] - b[0])) {
    if (!g.b || !g.a || !g.l || !g.p) continue
    out.set(unit, { before: g.b, after: g.a, baselineskip: g.l[0], parskip: g.p })
  }
  return out
}
const DIMEN = /^(-?\d+(?:\.\d+)?)pt$/
/**
 * Each paragraph's measure where TeX ends it (STATEMENTS_TEX's MEASURE_TEX: `AXT-MEASURE <n> <\hsize> <\hangindent>
 * <\hangafter> <\leftskip> <\rightskip> <\parshape> [<indent> <length>]…`, written at LaTeX's para/end, its 79-column wraps
 * joined), by the serial of its end (`qe<n><code>`): the first of a serial, where every dimension is of TeX's form and the shape
 * holds as many lines as its count; none in a compile made before the statement
 */
export function readMeasures(log: string): Map<number, ParaMeasure> {
  const out = new Map<number, ParaMeasure>()
  for (const line of taggedLines(log, 'AXT-MEASURE ')) {
    const w = line.trim().split(/ +/)
    // (a record cut short before its count reads no count: Number(undefined) is no integer)
    const n = Number(w[1])
    const count = Number(w[7])
    if (!Number.isInteger(n) || out.has(n) || !Number.isInteger(count) || count < 0 || w.length !== 8 + 2 * count)
      continue
    const dims = [w[2], w[3], w[5], w[6], ...w.slice(8)].map((x) => DIMEN.exec(x ?? '')?.[1])
    const hangafter = Number(w[4])
    if (dims.some((x) => x === undefined) || !Number.isInteger(hangafter)) continue
    const [hsize, hangindent, leftskip, rightskip, ...rest] = dims.map((x) => Number(x) * BP_PER_PT) as number[]
    const shape = Array.from({ length: count }, (_, k): [number, number] => [rest[2 * k]!, rest[2 * k + 1]!])
    out.set(n, {
      hsize: hsize!,
      hangindent: hangindent!,
      hangafter,
      leftskip: leftskip!,
      rightskip: rightskip!,
      ...(shape.length ? { shape } : {}),
    })
  }
  return out
}
/**
 * The paper's float, caption and footnote separations as TeX held them (STATEMENTS_TEX's GAPS_TEX: `AXT-GLUE <at> <name>
 * <glue>`), in the order TeX wrote them: once the document begins (`at` 0), then at each float where one changed (`at` the
 * float's serial, its bracket's `fs<n>`: a caption's skips as its box holds them, the separations once it is closed): natural and
 * shrink in PDF units (glueOf; a glue whose shrink is of an infinite order states none). The values in force at a float are the
 * last of each name written at or before its serial
 */
export function readGlues(log: string): { at: number; name: GlueName; natural: number; shrink: number }[] {
  const names: ReadonlySet<string> = new Set(GLUE_NAMES)
  const out: { at: number; name: GlueName; natural: number; shrink: number }[] = []
  for (const line of taggedLines(log, 'AXT-GLUE ')) {
    const m = /^AXT-GLUE (\d{1,9}) ([a-z]{1,32}) (.*)$/.exec(line)
    if (!m || !names.has(m[2]!)) continue
    const g = glueOf(m[3]!)
    if (g) out.push({ at: Number(m[1]), name: m[2] as GlueName, natural: g[0], shrink: g[1] })
  }
  return out
}
/**
 * Each unit's paragraph as TeX's own order states it: STATEMENTS_TEX's `AXT-MEASURE <n>` is written in LaTeX's para/end hook, the
 * unit's `AXT-ALIGN <u> p` (LAYOUT_TEX's \axt@agpar) in a para/after next-code its end mark queued, and LaTeX runs a paragraph's
 * para/end before its para/after (a hook's normal code before its next code): the serial of the last AXT-MEASURE before a unit's
 * `p` line is the paragraph its end mark ended in, the serial its end's `qe<n>` point takes where TeX sets one (none after a box).
 * A unit whose end mark TeX set only in an \hbox (`h`: a one-line caption measured in \sbox and shipped in an \hbox to \hsize),
 * in vertical mode (`v`), or for which it stated nothing is paired with none. By unit index (a heading's `h<i>` its unit's; a
 * cell's `t<i>` none); a unit's first `p` statement (its first occurrence's). The 79-column wrap of AXT-ALIGN joined
 */
export function readParas(log: string): Map<number, number> {
  const text = log.replace(/^(AXT-ALIGN .{69})\n/gm, '$1')
  const out = new Map<number, number>()
  let last: number | undefined
  for (const m of text.matchAll(/^AXT-MEASURE (\d{1,9}) |^AXT-ALIGN h?(\d{1,9}) p /gm)) {
    if (m[1] !== undefined) last = Number(m[1])
    else if (last !== undefined && !out.has(Number(m[2]))) out.set(Number(m[2]), last)
  }
  return out
}
/** the body brackets that hold a whole page (STATEMENTS_TEX's WHOLE_TEX, `AXT-WHOLE <n>`): the serials of the `bs<n>`..`be<n>` that
 *  POINTS' \@outputpage hook made where no \@makecol ran for the page (a class whose output routine is its own, a page of
 *  floats), floats inside them; every other body bracket is a column's main list as the page builder broke it */
export function readWhole(log: string): number[] {
  const out = new Set<number>()
  for (const m of log.matchAll(/^AXT-WHOLE (\d{1,9})$/gm)) out.add(Number(m[1]))
  return [...out].sort((x, y) => x - y)
}
/** a body's opening point (POINTS_TEX's `bs<n>`) and a page's column mark (MARK_DEF's `c<columns>-<page>`, a point beside its
 *  destination) */
const BODY_POINT = /^bs(\d+)$/
const COLUMNS_POINT = /^c([12])-\d+$/
/**
 * Each page's text frame as TeX shipped it (Instrument.tex.frames), from the bodies whose opening points stand on it and their
 * statements (readBodies): the text block from where TeX shipped a body (a left column's or a whole body's box at its left
 * edge, a right column's at \textwidth less \columnwidth past it) to \textwidth after; its columns, on a page TeX set in two
 * (a body that is a column of two, or the page's column mark where its class ships its text block whole: revtex's ltxgrid),
 * each \columnwidth at both edges of the block (LaTeX's \@outputdblcol), else the block. Null for a page no stated body stands
 * on, and for one of two columns whose width TeX gave as the block's (multicol's columns, set inside one body: unstated)
 */
export function framesOf(
  pages: readonly { points: readonly { name: string }[]; view?: readonly number[] }[],
  log: string,
): (TexFrame | null)[] {
  const bodies = readBodies(log)
  const r2 = (v: number) => Math.round(v * 100) / 100
  return pages.map((pg) => {
    let body: TexBody | undefined
    let two = false
    for (const pt of pg.points) {
      const c = COLUMNS_POINT.exec(pt.name)
      if (c) two = c[1] === '2'
      const b = BODY_POINT.exec(pt.name)
      const s = b ? bodies.get(Number(b[1])) : undefined
      if (s && (!body || (body.side === 2 && s.side !== 2))) body = s
    }
    if (!body) return null
    const x0 = body.side === 2 ? body.x - (body.text - body.column) : body.x
    const block: [number, number] = [r2(x0), r2(x0 + body.text)]
    // (the text block's bottom on its page: the page's top edge less its stated depth, every column's)
    const top = pg.view?.[3]
    const foot = top !== undefined && body.foot !== undefined ? { foot: r2(top - body.foot) } : {}
    if (body.side === 0 && !two) return { block, columns: [block], ...foot }
    if (body.text - body.column < 1) return null
    return {
      block,
      columns: [
        [r2(x0), r2(x0 + body.column)],
        [r2(x0 + body.text - body.column), r2(x0 + body.text)],
      ],
      ...foot,
    }
  })
}

/** a reference's item type and the full name the paper gives it, with the BCP 47 tag of the language TeX declared where it
 *  read the name (readRefNames) */
export type RefName = { type: string; name?: string; lang?: string }
/** a BCP 47 tag as babel writes one: subtags of letters and digits joined by hyphens */
const BCP47 = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/
/** a name as a reference's full name: plain words (a letter first, then letters, marks, an apostrophe or a hyphen, words apart
 *  by one space), at most 40 characters, no full stop: a name that holds one is an abbreviation ("Fig.", cleveref's default),
 *  and one that holds a command or a brace is no plain name (`\scshape Table`) */
const FULL_NAME = /^\p{L}[\p{L}\p{M}'’-]*(?: [\p{L}\p{M}'’-]+)*$/u
/** a macro's meaning as TeX writes it (`\meaning`): its body after `macro:->`, a definition of no parameter alone */
const MEANING = /^(?:\\(?:long|protected|outer) )*macro:->(.*)$/
/** a babel name macro as the layout compile's own wrapper leaves it (marks.mjs NAMES_TEX: `\relax\axtnma{<key>}<its text>
 *  \axtnmb{<key>}`, \meaning's spacing): the text it wraps */
const NAME_WRAP = /^\\relax \\axtnma \{[a-z]{1,16}\}(.*)\\axtnmb \{[a-z]{1,16}\}$/
const UTF8 = new TextDecoder('utf-8')
/** a name TeX wrote, as text: its ^^ notation (a byte TeX would not print) read, and its bytes (the log is read byte for byte,
 *  one character a byte) read as UTF-8 where they are bytes */
function textOf(written: string): string {
  const s = written.replace(/\^\^([0-9a-f]{2})/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
  const codes = Array.from(s, (c) => c.charCodeAt(0))
  if (!codes.some((c) => c > 0x7f) || codes.some((c) => c > 0xff)) return s
  return UTF8.decode(Uint8Array.from(codes))
}
/**
 * Each reference's item type and the full name the paper gives it, by the reference's place in the list the marked compile was
 * given (marks.mjs refsTex: `AXT-REF <i> <type>`, then `AXT-REFNAME <i> <slot> <\meaning>` for each of cleveref's capitalised
 * and own names, hyperref's \<type>autorefname and LaTeX's \<type>name that is defined, in that order, written once the last
 * page is out). The type is the label's anchor's (hyperref's, and LaTeX's own since 2023: `figure.caption.12`'s `figure`, as
 * hyperref's own \autoref reads it), else cleveref's where it wrote one; the name the first of those that is a full name
 * (FULL_NAME), a babel name macro read through the layout compile's own wrapper (NAME_WRAP); and on each name the language
 * the paper's names are set up for (`AXT-REFLANG`, babel's BCP 47 tag of its main language; `und` where babel declares one
 * but knows no tag of it), none where none is declared. A label TeX knew no type for
 * states nothing; a type none of whose names is a full one (RevTeX's `section*` anchors), no name
 */
export function readRefNames(log: string): Map<number, RefName> {
  const out = new Map<number, RefName>()
  // (a statement longer than the log's 79 columns wrapped: joined)
  const text = log.replace(/^(AXT-REFNAME .{67})\n/gm, '$1')
  for (const m of text.matchAll(/^AXT-REF (\d{1,6}) (\S{1,64}) *$/gm)) {
    const i = Number(m[1])
    if (!out.has(i)) out.set(i, { type: m[2] as string })
  }
  for (const m of text.matchAll(/^AXT-REFNAME (\d{1,6}) [Ccan] (.*)$/gm)) {
    const ref = out.get(Number(m[1]))
    if (!ref || ref.name !== undefined) continue
    const meaning = MEANING.exec((m[2] as string).trimEnd())?.[1]
    const body = meaning === undefined ? undefined : (NAME_WRAP.exec(meaning)?.[1] ?? meaning)
    const name = body === undefined ? '' : textOf(body).trim()
    if (name.length <= 40 && FULL_NAME.test(name)) ref.name = name
  }
  // (the language the paper's names are set up for, once: babel's tag of its main language, AXT-REFLANG; on every name)
  // (a main language babel declares but knows no tag of: BCP 47's `und`, undetermined)
  const said = /^AXT-REFLANG ?(.*)$/m.exec(text)
  if (said) {
    const tag = MEANING.exec((said[1] ?? '').trimEnd())?.[1]?.trim()
    const lang = tag && BCP47.test(tag) ? tag : 'und'
    for (const r of out.values()) if (r.name !== undefined) r.lang = lang
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]))
}
