// Each line's measure as TeX set it, where its paragraph states one that is not its frame (PDF-READER §18.77): a list's
// \parshape (\@totalleftmargin, \linewidth), wrapfig's shape, a \hangindent, a \leftskip or \rightskip
// of some natural size, read into the line's m0..m1 (Line[7], Line[8]) over the frame's measure columnsAndMeasures gave it.
// Phase 8's second step (locate.ts), right after the frames' measures (geometry.ts frameMeasures): it reads the instrument's
// statements (Instrument.tex.measures, by the serial of each paragraph's end; Instrument.tex.paras, each unit's paragraph by
// TeX's own order), B's paragraph ends (`qe<n><code>`, DocMarks.paraEnds) and their owners, the members' lines and their
// glyphs' partners on B, and writes the stated lines' m0 and m1 alone.
import type { Line } from '@readarxiv/format'
import type { Instrument, ParaMeasure } from '../instrument.ts'
import { ON_BASE } from './geometry.ts'
import { r2 } from './lines.ts'
import type { Member, Work } from './work.ts'

/** how far a frame's width and an \hsize may stand apart (PDF units): the frame's two edges are each stated to a hundredth */
const EDGES = 0.02
/** how far the spread of a box's lines' ink and its \hsize may stand apart, in ems of the lines' size: the typesetter's
 *  ONE_EDGE (PDF-READER §18.94), what a line's ink start or end differs from the measure TeX states for it by (a side bearing,
 *  microtype's protrusion: of 190,155 lines over the 245 papers, the ink of 175,833 within 0.125 em, q0.9999 0.211 em) */
const INK_EDGE = 0.25
/**
 * Whether the instrument keeps a paragraph's statement (STATEMENTS_TEX's AXT-MEASURE) for this phase: a measure that is not the
 * full \hsize (a \parshape, a \hangindent, a \leftskip or \rightskip), or an \hsize no page's frame has, its text block's or a
 * column's (a box's paragraph: a minipage's, a \parbox's, mdframed's, which boxMeasures places). A paragraph of its column's
 * full width states nothing its frame does not. Kept for the shapes alone, a box's paragraph of no shape was dropped and its
 * lines kept the frame's measure: 2610.19159v1's mdframed paragraphs, the page's text block, over the box's rule
 */
export function measureKept(
  s: ParaMeasure,
  frames: readonly ({ block: readonly number[]; columns: readonly (readonly number[])[] } | null | undefined)[],
): boolean {
  if (s.shape?.length || s.hangindent !== 0 || s.leftskip !== 0 || s.rightskip !== 0) return true
  const widths = frames.flatMap((f) => (f ? [f.block[1]! - f.block[0]!, ...f.columns.map((c) => c[1]! - c[0]!)] : []))
  return widths.length > 0 && widths.every((w) => Math.abs(w - s.hsize) > EDGES)
}
/** a stated line whose paragraph's \hsize no column of its frame has (a box's: a minipage, a \parbox, mdframed): its line k of
 *  the paragraph n TeX states `s` */
type Boxed = { l: Line; s: ParaMeasure; k: number; n: number }
/** a paragraph end's serial in its point's name */
const END_SERIAL = /^qe(\d+)[cjlr]$/

/** the indent and length of TeX's line k (1-based) of a paragraph: its \parshape's (its last line's for every line past it),
 *  else its \hangindent's where \hangafter says the line is hung (lines after \hangafter, or the first |\hangafter| where it
 *  is negative; a negative indent hangs on the right), else none and \hsize */
export function lineShape(s: ParaMeasure, k: number): [indent: number, length: number] {
  if (s.shape?.length) return s.shape[Math.min(k, s.shape.length) - 1]!
  const hung = s.hangafter >= 0 ? k > s.hangafter : k <= -s.hangafter
  if (!hung || s.hangindent === 0) return [0, s.hsize]
  return s.hangindent > 0 ? [s.hangindent, s.hsize - s.hangindent] : [0, s.hsize + s.hangindent]
}

/**
 * The stated paragraphs' lines' measures. A line takes a paragraph's measure only where TeX's own statements leave no other
 * paragraph for it (PDF-READER §18.77): (i) a line of its unit's last paragraph
 * takes the paragraph TeX pairs the unit with (Instrument.tex.paras: the last AXT-MEASURE before the unit's `AXT-ALIGN u p`, the
 * paragraph its end mark ended in), where no paragraph end of the unit's own stands before the line in B's stream, and only where
 * that paragraph comes after the end B shows before the line and no later than the first end B shows after it, and its own end,
 * where B shows it, stands after the line (B's order is not TeX's: a note's or a float's paragraph TeX ended earlier stands later
 * on B, 2501.14787v1 p75's line after a display took the heading's \hangindent on p74); (ii) any other line takes the paragraph
 * whose end B shows next after it, the unit's own (B's glyph before the end the unit's), only where that end's serial is the one
 * directly after the end B shows before the line, or the paragraph TeX ended before it (its serial one less) stands on B before
 * the line or there is none (no paragraph without a point, one TeX ended after a box, can stand between them; B's order is not
 * TeX's where a class sets paragraphs in a box before others: REVTeX's abstract, set before \maketitle's title and authors and
 * shown after them, lost its measure to the frame's in six papers of the corpus under the first condition alone); (iii) every
 * other line, and a unit TeX ended in an \hbox or stated nothing for, takes none (its frame's). B's "first end
 * after the line" alone took the next paragraph's measure for a paragraph that ends in a box (amsthm's QED box) and counted its
 * lines as the next one's: 2610.40645v1 p19's proof read as the next section heading's \hangindent. The pairing alone took a
 * paragraph that is not the line's in two ways, which (i)'s bounds turn away: a unit whose paragraph a display ended (TeX breaks
 * the lines before `$$` with no \par, so no AXT-MEASURE, and the empty paragraph after the display states none) is paired with
 * the paragraph before it, a heading's \hangindent read into its lines (2010.11929v2 p13, 2307.16209v1 p25); a unit whose
 * paragraph ended inside a group its mark stands outside of has its statement written where that group closes, and is paired with
 * the group's last paragraph (2111.09276v1's conclusion, ended by the bibliography's heading inside `{\small …}`: paired with the
 * last reference, 62 ends after its lines). The paragraph's lines are taken in B's order, a row two members share one line (a
 * run-in title and its paragraph), so that the k-th is TeX's line k. Its measure stands at the left edge of its frame's column
 * whose width is the paragraph's \hsize (a paragraph of the column's main list, a footnote, a float's text), or of the text block
 * where the block's is (a float across both columns); a paragraph of another \hsize (a minipage's, a \parbox's, mdframed's),
 * where TeX's statement does not say where its box stands, at the left edge of the box the page's lines set at that \hsize
 * fill, else no wider than its own lines (boxMeasures). From that edge, the line's indent, and \leftskip's
 * natural size, to its length, less \rightskip's. A display TeX set inside the paragraph counts as three lines to its shape
 * (TeX's \prevgraf after it): where the shape varies by line (several lines of a \parshape, a \hangindent), its lines after a
 * held row of the paragraph state none. A table cell, a figure text and a name keep the measure they have
 */
export function paragraphMeasures(w: Work): void {
  const { ins, m, framesA, unitB } = w.ix
  const stated = new Map((ins.tex.measures ?? []).map((x) => [x.para, x]))
  if (!stated.size) return
  const ends = endsOf(ins, m.offB)
  if (!ends.length) return
  const paired = new Map(ins.tex.paras ?? [])
  // (the index in B's ends of the first end after glyph b, and each unit's own ends (B's glyph before it the unit's), in order)
  const at = (b: number): number => {
    let lo = 0
    let hi = ends.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ends[mid]![0] <= b) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const endAt = new Map(ends.map(([at, n]) => [n, at]))
  const own = new Map<number, [number, number][]>()
  for (const e of ends) {
    const u = e[0] > 0 ? (unitB[e[0] - 1] as number) : -1
    if (u >= 0) (own.get(u) ?? own.set(u, []).get(u)!).push(e)
  }
  /** the paragraph TeX's statements give the line whose first text glyph is b on B, of unit u; undefined none */
  const paraOf = (u: number, b: number): number | undefined => {
    const mine = own.get(u) ?? []
    const after = mine.find((e) => e[0] > b)
    const P = paired.get(u)
    const c = after ? after[1] : P
    if (c === undefined) return undefined
    // ((i)'s paragraph ended before the line where B shows its end: none of the line's)
    if (!after && (endAt.get(c) ?? b + 1) <= b) return undefined
    const i = at(b)
    const prev = i > 0 ? ends[i - 1]![1] : 0
    if (c === prev + 1) return c
    // ((ii) where B's order is not TeX's: the unit's own end, where the paragraph TeX ended before it (its serial one less)
    // stands on B before the line, or there is none: REVTeX sets the abstract's paragraphs in a box before \maketitle's, and
    // B shows the title's ends between)
    if (after && (c === 1 || (endAt.get(c - 1) ?? b + 1) <= b)) return c
    // ((i): the paired paragraph, no end of the unit's own before the line, where it ends after the end B shows before the line
    // and no later than the first B shows after it)
    if (c !== P || P <= prev || mine.some((e) => e[0] <= b)) return undefined
    return i === ends.length || P <= ends[i]![1] ? P : undefined
  }
  const byPara = new Map<number, { l: Line; b: number }[]>()
  for (const mem of w.members) {
    if (!eligible(w, mem)) continue
    const text = new Set(mem.text)
    mem.lines.forEach((l, j) => {
      const a = (mem.lineGlyphs[j] ?? []).find((x) => text.has(x))
      const b = a === undefined ? -1 : (m.aToB[a] as number)
      if (b < 0) return
      const n = paraOf(mem.unit, b)
      if (n === undefined || !stated.has(n)) return
      ;(byPara.get(n) ?? byPara.set(n, []).get(n)!).push({ l, b })
    })
  }
  const boxed: Boxed[] = []
  for (const [n, ls] of byPara) {
    const s = stated.get(n)!
    const varies = (s.shape?.length ?? 0) > 1 || (!s.shape && s.hangindent !== 0)
    ls.sort((x, y) => x.b - y.b)
    let k = 0
    let row: Line | null = null
    let held = false
    for (const { l } of ls) {
      if (!row || row[0] !== l[0] || Math.abs(row[4] - l[4]) > ON_BASE) {
        k++
        row = l
      }
      if (l[9] & 1) {
        held = true
        continue
      }
      if (held && varies) continue
      const f = framesA.get(l[0])
      if (!f) continue
      const col =
        f.columns.find((c) => Math.abs(c[1] - c[0] - s.hsize) <= EDGES && l[3] > c[0] && l[2] < c[1]) ??
        (Math.abs(f.block[1] - f.block[0] - s.hsize) <= EDGES ? f.block : undefined)
      if (!col) {
        boxed.push({ l, s, k, n })
        continue
      }
      const [indent, length] = lineShape(s, k)
      l[7] = r2(col[0] + indent + s.leftskip)
      l[8] = r2(col[0] + indent + length - s.rightskip)
    }
  }
  boxMeasures(boxed)
}

/**
 * The measure of a paragraph TeX set at an \hsize no column of its frame has (a box's: a minipage's, a \parbox's, mdframed's),
 * where TeX's statement does not say where its box stands (the coordinator's ruling 2 of 2026-11-20, lane c4-boxes): placed by
 * the page's own lines TeX set at that \hsize there, as today's reader read a column from the page's lines. Each line's extent is
 * its ink widened by what TeX's statement puts between its ink and its measure (its line's indent and \leftskip on the left,
 * \rightskip and the shape's length short of \hsize on the right). The lines' starts of one page and one \hsize, gathered within
 * INK_EDGE, each give a left, the median of its own (a glyph microtype protrudes stands a fraction of an em left of the box's
 * edge: 2610.19159v1 p41's at 82.43, the box's lines at 83.62); a box stands at a left where a line that starts in it ends at that
 * left and the \hsize, within INK_EDGE: TeX filled it (a box of two-line paragraphs, each first line indented and each last
 * short, has its left from the last lines and its end from the first: 2610.19159v1 p36; two of one width side by side stay
 * two). A paragraph of that \hsize is the box's where at least half of its lines on the page stand in it (their extents inside
 * it, INK_EDGE aside; a line TeX set overfull runs past it and goes with its paragraph: 2610.19159v1 p45's to 575.98), and each
 * of its lines' measure is the box's, as a column's is.
 * Any other (no line fills its box: a single line, a ragged box, subcaptions centred in their minipages) has no wider measure
 * than its own lines on the page, their extent, never wider than its frame's, so that a single line is never widened past
 * itself: three subcaptions of 2608.16117v1 p18, one centred across the other two, were read as one box. Left at its frame's,
 * every line of 2610.19159v1's mdframed boxes stated the page's text block, 70.87..524.41, past the box's text edge (511.66)
 * and over its rule (523.88): a single line the typesetter widened to it ran its last glyph onto the rule
 */
function boxMeasures(boxed: readonly Boxed[]): void {
  const extentOf = ({ l, s, k }: Boxed): [number, number] => {
    const [indent, length] = lineShape(s, k)
    return [l[2] - indent - s.leftskip, l[3] + s.rightskip + (s.hsize - indent - length)]
  }
  const placed = new Set<Boxed>()
  // (by page and \hsize, each line with its extent)
  const groups = new Map<string, { x: Boxed; e: [number, number] }[]>()
  for (const x of boxed) {
    const key = `${x.l[0]}|${Math.round(x.s.hsize / EDGES)}`
    ;(groups.get(key) ?? groups.set(key, []).get(key)!).push({ x, e: extentOf(x) })
  }
  for (const g of groups.values()) {
    const hsize = g[0]!.x.s.hsize,
      tol = INK_EDGE * (Math.max(...g.map((z) => z.x.l[10] ?? 0)) || 10)
    // (the boxes: the lines' starts gathered within INK_EDGE, each the median of its own; a box where a line of the \hsize that
    // starts in it ends at its left and the \hsize, TeX's filled line)
    const starts = g.map((z) => z.e[0]).sort((a, b) => a - b)
    const lefts: number[] = []
    for (let a = 0; a < starts.length; ) {
      let b = a
      while (b + 1 < starts.length && starts[b + 1]! - starts[a]! <= tol) b++
      const L = starts[(a + b) >> 1]!
      if (g.some((z) => z.e[0] >= L - tol && Math.abs(z.e[1] - L - hsize) <= tol)) lefts.push(L)
      a = b + 1
    }
    if (!lefts.length) continue
    // (each paragraph the box at least half of its lines stand in, the one most of them stand in)
    const byPara = new Map<number, { x: Boxed; e: [number, number] }[]>()
    for (const z of g) (byPara.get(z.x.n) ?? byPara.set(z.x.n, []).get(z.x.n)!).push(z)
    for (const zs of byPara.values()) {
      const fits = (L: number) => zs.filter((z) => z.e[0] >= L - tol && z.e[1] <= L + hsize + tol).length
      const left = lefts.reduce<number | undefined>((best, L) => {
        if (fits(L) * 2 < zs.length) return best
        return best === undefined || fits(L) > fits(best) ? L : best
      }, undefined)
      if (left === undefined) continue
      for (const { x } of zs) {
        const [indent, length] = lineShape(x.s, x.k)
        x.l[7] = r2(left + indent + x.s.leftskip)
        x.l[8] = r2(left + indent + length - x.s.rightskip)
        placed.add(x)
      }
    }
  }
  // (no wider than its own lines: by paragraph and page, their ink's extent, inside its frame's measure)
  const own = new Map<string, Boxed[]>()
  for (const x of boxed) {
    if (placed.has(x)) continue
    const key = `${x.n}|${x.l[0]}`
    ;(own.get(key) ?? own.set(key, []).get(key)!).push(x)
  }
  for (const xs of own.values()) {
    const x0 = Math.min(...xs.map((x) => x.l[2])),
      x1 = Math.max(...xs.map((x) => x.l[3]))
    for (const { l } of xs) {
      l[7] = r2(Math.max(x0, l[7]))
      l[8] = r2(Math.min(x1, l[8]))
    }
  }
}

/** B's paragraph ends, globally, in stream order: [the glyph position TeX ended it before, its serial] */
function endsOf(ins: Instrument, offB: Int32Array): [number, number][] {
  const out: [number, number][] = []
  ins.ink.pages.forEach((pg, p) => {
    for (const e of pg.marks?.paraEnds ?? []) {
      const n = END_SERIAL.exec(e.name)
      if (n) out.push([(offB[p] as number) + e.glyph, Number(n[1])])
    }
  })
  return out.sort((x, y) => x[0] - y[0])
}

/** whether a member's lines take their paragraph's measure: a unit's own text of the page's flow, no table cell, figure text,
 *  ink figure or name */
const eligible = (w: Work, mem: Member): boolean =>
  mem.unit >= 0 &&
  mem.unit < w.ix.ins.units.length &&
  mem.name === undefined &&
  !mem.figure &&
  mem.kind !== 'inkfigures' &&
  !w.units[mem.unit]?.cell
