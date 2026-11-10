// A figure's paragraphs (F3, the owner's ruling of 2026-11-10, PDF-READER §18.28): its printed lines of prose (figure-lines.ts)
// read as the paragraphs they print, each one figure text laid as a body paragraph is. Facts of the lines alone, every measure
// the figure reading's in the text's size (ALIGN_TOL) or a share of it named here. A paragraph is lines of one figure, one under
// the other with no blank line between, in one face family, size, weight and fill, set by TeX's interline rule (its one pitch, or
// a push \lineskip clear: oneLead), on one left edge (its first line may stand in, an indent, or out, a hanging indent), whose
// text goes on from line to line by a fact of the text: TeX's hyphen at a line's end, or a justified block (its full lines'
// spaces stretched: unlike between them, or unlike its short last line's natural ones), the line reaching its right edge. A
// line that opens with an item's enumerator (a list's, figure-lines.ts listed) begins an item of its own. Ragged lines are
// joined by no guess from their shape: stacked legend entries read so (lanes/fig-text/img/ragged); the lines a closed shape
// holds alone are F3's next step (the coordinator's decisions of 2026-11-10 and 2026-11-11).

import { oneFamily } from './facts.ts'

/** how near two edges or two pitches are one, of the text's size (figure-text.mjs ALIGN_TOL) */
export const PARA_ALIGN_TOL = 0.08
/** how near two sizes are one (a glyph joins a run within a hundredth of its size: figure-text.mjs) */
const SIZE_TOL = 0.01
/** how near two baselines are one line's, of the size (figure-text.mjs RUN_DY) */
const SAME_BASE = 0.05

/** a printed line of prose as the paragraph reading reads it */
export interface ParaLine {
  /** its figure (figure-lines.ts's key) */
  fig: string
  /** its baseline, its extent, PDF units */
  y: number
  x0: number
  x1: number
  /** the size most of its text letters stand at, and its band's height (its glyphs', DRAW_BAND's at least) */
  size: number
  band: number
  /** its ink's top and bottom, every glyph of it (its formulas' and their scripts' too), PDF units */
  top: number
  bottom: number
  /** the font most of its text letters are set in (its family read by facts.ts oneFamily), whether every one is bold, and their
   *  fill */
  face: string | null
  bold: boolean
  fill: number | null
  /** its word spaces, where two or more follow no punctuation: whether they are one within the tolerance, and their mean */
  uniform: boolean
  wordSpace: number | null
  /** it opens with an item's enumerator, more text after it */
  marker: boolean
  /** the ink that ends right before its start (a legend's sample, a frame's side): boxes by index */
  leaders: ReadonlySet<number>
}

export interface Para {
  /** its lines (indices into the lines given), top to bottom */
  lines: number[]
  /** each join's evidence, line k to k + 1: TeX's hyphen dropped, a word's hyphen kept, a justified line */
  ev: ('hyphen-drop' | 'hyphen-join' | 'justified')[]
  justified: boolean
}

/** two lines in one face family, weight, size and fill (a paragraph's; a node's label) */
export const sameFace = (a: ParaLine, b: ParaLine) =>
  !!a.face &&
  !!b.face &&
  oneFamily(a.face, b.face) &&
  a.bold === b.bold &&
  Math.abs(a.size - b.size) <= SIZE_TOL * Math.max(a.size, b.size) &&
  a.fill === b.fill

/** a block's gaps, each its baselines' distance and its lines' ink clearance */
type Gap = { pitch: number; clear: number }
/**
 * Whether a block's gaps are TeX's interline rule: each its \baselineskip (the block's one pitch, the smallest, within the
 * tolerance) or larger where TeX pushed two lines apart: set at the pitch they would come closer than \lineskiplimit (their
 * ink clearance less the gap's excess over the pitch under the tolerance: they would touch), it set them \lineskip apart,
 * one clearance on every such gap. A paragraph's \parskip is no push: its lines at the pitch keep their clearance. Read off
 * the lines' own ink; the pitch's tolerance alone
 */
function oneLead(gaps: readonly Gap[], tol: number): boolean {
  const p0 = Math.min(...gaps.map((g) => g.pitch))
  const pushed = gaps.filter((g) => g.pitch > p0 + tol)
  if (!pushed.length) return true
  if (pushed.some((g) => g.clear - (g.pitch - p0) >= tol)) return false
  const c = pushed.map((g) => g.clear)
  return Math.max(...c) - Math.min(...c) <= tol
}

/** whether two lines are each led by ink of its own, no ink leading both: a legend's entries, each after its sample (a frame's
 *  side leading both is no such ink) */
export const ledApart = (a: ParaLine, b: ParaLine) =>
  a.leaders.size > 0 && b.leaders.size > 0 && ![...a.leaders].some((x) => b.leaders.has(x))

/** two lines one under the other in one block: one face, no blank line between (the gap under the upper's band less than a
 *  band), the block's lead kept (oneLead) and its left edge; lines each led by ink of its own are entries, never one text */
function geomJoin(
  a: ParaLine,
  b: ParaLine,
  st: { gaps: Gap[]; edge: number | null },
  blockLen: number,
): { gaps: Gap[]; edge: number } | null {
  if (!sameFace(a, b)) return null
  if (ledApart(a, b)) return null
  const tol = PARA_ALIGN_TOL * a.size
  const pitch = a.y - b.y
  if (!(pitch > 0 && pitch - a.band < a.band)) return null
  const gaps = [...st.gaps, { pitch, clear: a.bottom - b.top }]
  if (!oneLead(gaps, tol)) return null
  let edge = st.edge
  if (edge === null) edge = b.x0
  else if (Math.abs(b.x0 - edge) > tol) return null
  if (blockLen > 1 && Math.abs(a.x0 - edge) > tol) return null
  return { gaps, edge }
}

/**
 * The paragraphs of a page's lines of prose. `end(a, b)`: what line a's end before line b is where a ends in a hyphen and b
 * begins with a letter (facts.ts lineEnd: `drop` TeX's own break, `join` a word's hyphen), else `space`.
 */
export function parasOf(lines: readonly ParaLine[], end: (a: number, b: number) => 'space' | 'join' | 'drop'): Para[] {
  const out: Para[] = []
  const byFig = new Map<string, number[]>()
  lines.forEach((l, i) => {
    const at = byFig.get(l.fig)
    if (at) at.push(i)
    else byFig.set(l.fig, [i])
  })
  for (const idx of byFig.values()) {
    idx.sort((p, q) => lines[q]!.y - lines[p]!.y || lines[p]!.x0 - lines[q]!.x0)
    // (each line's next: the nearest line under it whose extent meets its own, no other's next; none where a second line of
    // that one's baseline stands under it too, or a second line of its own baseline over that one: a line over two columns, a
    // line under two, is neither's)
    const next = new Map<number, number>()
    const taken = new Set<number>()
    const meets = (a: ParaLine, b: ParaLine) => Math.max(a.x0, b.x0) < Math.min(a.x1, b.x1)
    const beside = (a: ParaLine, b: ParaLine) => Math.abs(a.y - b.y) <= SAME_BASE * Math.max(a.size, b.size)
    for (let i = 0; i < idx.length; i++) {
      const a = lines[idx[i]!]!
      for (let k = i + 1; k < idx.length; k++) {
        const b = lines[idx[k]!]!
        if (!(b.y < a.y - 0.5 * a.size)) continue
        if (!meets(a, b)) continue
        const two = idx.some((j) => {
          const c = lines[j]!
          return (c !== b && beside(c, b) && meets(a, c)) || (c !== a && beside(c, a) && meets(c, b))
        })
        if (!two && !taken.has(idx[k]!)) {
          next.set(idx[i]!, idx[k]!)
          taken.add(idx[k]!)
        }
        break
      }
    }
    const seen = new Set<number>()
    for (const first of idx) {
      if (seen.has(first)) continue
      // (its block by geometry, read whole: what tells a justified block; then its paragraph to the first line the text does
      // not go on to, which starts its own)
      const block = [first]
      let st: { gaps: Gap[]; edge: number | null } = { gaps: [], edge: null }
      for (let a = first; next.has(a); ) {
        const b = next.get(a)!
        const j = geomJoin(lines[a]!, lines[b]!, st, block.length)
        if (!j) break
        st = j
        block.push(b)
        a = b
      }
      const size = lines[first]!.size
      const tol = PARA_ALIGN_TOL * size
      const R = Math.max(...block.map((i) => lines[i]!.x1))
      // (justified: two full lines or more, each its spaces stretched alike, the stretch shown: their spaces differ between them,
      // or from a short line's of the block, which TeX sets at its natural spacing (\parfillskip))
      const full = block.map((i) => lines[i]!).filter((l) => l.x1 >= R - tol && l.uniform)
      const spaces = full.map((l) => l.wordSpace ?? 0)
      const natural = block
        .map((i) => lines[i]!)
        .filter((l) => l.x1 < R - tol && l.wordSpace !== null)
        .map((l) => l.wordSpace!)
      const justified =
        full.length >= 2 &&
        (Math.max(...spaces) - Math.min(...spaces) > tol ||
          natural.some((n) => spaces.some((w) => Math.abs(w - n) > tol)))
      const cur = [first]
      const ev: Para['ev'] = []
      seen.add(first)
      for (let i = 1; i < block.length; i++) {
        const e = goesOn(lines[block[i - 1]!]!, lines[block[i]!]!, R, justified, tol, () =>
          end(block[i - 1]!, block[i]!),
        )
        if (!e) break
        cur.push(block[i]!)
        seen.add(block[i]!)
        ev.push(e)
      }
      if (cur.length > 1) out.push({ lines: cur, ev, justified })
    }
  }
  return out
}

/** whether the text goes on from line A to the line B under it, and by what */
function goesOn(
  A: ParaLine,
  B: ParaLine,
  R: number,
  justified: boolean,
  tol: number,
  end: () => 'space' | 'join' | 'drop',
): Para['ev'][number] | null {
  if (B.marker) return null
  const e = end()
  if (e !== 'space') return e === 'drop' ? 'hyphen-drop' : 'hyphen-join'
  return justified && A.x1 >= R - tol ? 'justified' : null
}
