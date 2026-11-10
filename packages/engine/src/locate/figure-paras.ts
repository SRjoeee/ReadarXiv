// A figure's paragraphs (F3, the owner's ruling of 2026-11-10, PDF-READER §18.28): its printed lines of prose (figure-lines.ts)
// read as the paragraphs they print, each one figure text laid as a body paragraph is. Facts of the lines alone, every measure
// the figure reading's in the text's size (ALIGN_TOL) or a share of it named here. A paragraph is lines of one figure, one under
// the other with no blank line between, in one face family, size, weight and fill, at one pitch, on one left edge (its first
// line may stand in, an indent, or out, a hanging indent), whose text goes on from line to line by a fact of the text: TeX's
// hyphen at a line's end, or a justified block, the line reaching its right edge. A line that opens with an item's enumerator (a
// list's, figure-lines.ts listed) begins an item of its own. Ragged lines are joined by no guess from their shape: stacked legend
// entries read so (lanes/fig-text/img/ragged); the lines a closed shape holds alone are F3's next step (the coordinator's
// decisions of 2026-11-10 and 2026-11-11).

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
  /** its text letters' face family (the PostScript name before its style), whether every one is bold, and their fill */
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

const sameFace = (a: ParaLine, b: ParaLine) =>
  !!a.face &&
  a.face === b.face &&
  a.bold === b.bold &&
  Math.abs(a.size - b.size) <= SIZE_TOL * Math.max(a.size, b.size) &&
  a.fill === b.fill

/** two lines one under the other in one block: one face, no blank line between (the gap under the upper's band less than a
 *  band), the block's pitch and left edge kept; lines each led by ink of its own are entries, never one text */
function geomJoin(
  a: ParaLine,
  b: ParaLine,
  st: { pitch: number | null; edge: number | null },
  blockLen: number,
): { pitch: number; edge: number } | null {
  if (!sameFace(a, b)) return null
  if (a.leaders.size && b.leaders.size && ![...a.leaders].some((x) => b.leaders.has(x))) return null
  const tol = PARA_ALIGN_TOL * a.size
  const pitch = a.y - b.y
  if (!(pitch > 0 && pitch - a.band < a.band)) return null
  if (st.pitch !== null && Math.abs(pitch - st.pitch) > tol) return null
  let edge = st.edge
  if (edge === null) edge = b.x0
  else if (Math.abs(b.x0 - edge) > tol) return null
  if (blockLen > 1 && Math.abs(a.x0 - edge) > tol) return null
  return { pitch: st.pitch ?? pitch, edge }
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
      let st: { pitch: number | null; edge: number | null } = { pitch: null, edge: null }
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
      const full = block.map((i) => lines[i]!).filter((l) => l.x1 >= R - tol && l.uniform)
      const spaces = full.map((l) => l.wordSpace ?? 0)
      const justified = full.length >= 2 && Math.max(...spaces) - Math.min(...spaces) > tol
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
