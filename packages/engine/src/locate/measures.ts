// Each line's measure as TeX set it, where its paragraph states one that is not its frame (the compile move's C3: the display
// design's F13): a list's \parshape (\@totalleftmargin, \linewidth), wrapfig's shape, a \hangindent, a \leftskip or \rightskip
// of some natural size, read into the line's m0..m1 (Line[7], Line[8]) over the frame's measure columnsAndMeasures gave it.
// Phase 8 (frameMeasures), after the frames' measures: it reads the instrument's statements (Instrument.tex.measures, by the
// serial of each paragraph's end), B's paragraph ends (`qe<n><code>`, DocMarks.paraEnds), the members' lines and their glyphs'
// partners on B, and writes the stated lines' m0 and m1 alone.
import type { Line } from '@readarxiv/format'
import type { Instrument } from '../instrument.ts'
import type { ParaMeasure } from '../marks/channels.ts'
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
 * The stated paragraphs' lines' measures. A line is its paragraph's by its first text glyph's partner on B (the paragraph whose
 * end is the first after it in B's stream); the paragraph's lines are taken in B's order, a row two members share one line
 * (a run-in title and its paragraph), so that the k-th is TeX's line k. Its measure stands at the left edge of its frame's
 * column whose width is the paragraph's \hsize (a paragraph of the column's main list, a footnote, a float's text), or of the
 * text block where the block's is (a float across both columns); a paragraph of another \hsize (a minipage's, a \parbox's, a
 * p column's) states none, where TeX's statement does not say where its box stands. From that edge, the line's indent, and
 * \leftskip's natural size, to its length, less \rightskip's. A display TeX set inside the paragraph counts as three lines to
 * its shape (TeX's \prevgraf after it): where the shape varies by line (several lines of a \parshape, a \hangindent), its
 * lines after a held row of the paragraph state none. A table cell, a figure text and a name keep the measure they have
 */
export function paragraphMeasures(w: Work): void {
  const { ins, m, framesA } = w.ix
  const stated = new Map((ins.tex.measures ?? []).map((x) => [x.para, x]))
  if (!stated.size) return
  const ends = endsOf(ins, m.offB)
  if (!ends.length) return
  // (the paragraph of B's glyph b: the first end after it)
  const paraOf = (b: number): number | undefined => {
    let lo = 0
    let hi = ends.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ends[mid]![0] <= b) lo = mid + 1
      else hi = mid
    }
    return ends[lo]?.[1]
  }
  const byPara = new Map<number, { l: Line; b: number }[]>()
  for (const mem of w.members) {
    if (!eligible(w, mem)) continue
    const text = new Set(mem.text)
    mem.lines.forEach((l, j) => {
      const a = (mem.lineGlyphs[j] ?? []).find((x) => text.has(x))
      const b = a === undefined ? -1 : (m.aToB[a] as number)
      if (b < 0) return
      const n = paraOf(b)
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
