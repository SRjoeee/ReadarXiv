// Each line's measure as TeX set it, where its paragraph states one that is not its frame (the compile move's C3: the display
// design's F13): a list's \parshape (\@totalleftmargin, \linewidth), wrapfig's shape, a \hangindent, a \leftskip or \rightskip
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
 * other line, and a unit TeX ended in an \hbox or stated nothing for, takes none (its frame's, as before F13). B's "first end
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
 * where the block's is (a float across both columns); a paragraph of another \hsize (a minipage's, a \parbox's, a p column's)
 * states none, where TeX's statement does not say where its box stands. From that edge, the line's indent, and \leftskip's
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
      if (!col) continue
      const [indent, length] = lineShape(s, k)
      l[7] = r2(col[0] + indent + s.leftskip)
      l[8] = r2(col[0] + indent + length - s.rightskip)
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
