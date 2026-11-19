// A's link annotations as PDF.js gives them (getAnnotations), read: a link's target, its rectangle and the boxes its glyph
// points are read in, and the glyphs of a page it holds by glyph point (PDF.js's overlaidText rule). One reading for the two
// that take it: the links (links.ts, phase 15 of locate), each owned by the member that owns most of its glyphs, and the ink
// units' link groups (ink.ts inkLinksOf, PDF-READER §19.10), so that a link an ink unit groups holds the glyphs locate owns it by.
import { r2 } from './lines.ts'

/** an annotation as PDF.js gives it (getAnnotations), what the links read of it */
export interface Annotation {
  annotationType?: number
  rect?: number[]
  quadPoints?: ArrayLike<number> | null
  url?: string
  unsafeUrl?: string
  dest?: unknown
  borderStyle?: { width?: number; style?: number }
  borderColor?: ArrayLike<number> | null
}
/** a link annotation's target (its URL, else its destination as JSON: Link.to), its rectangle and the boxes its glyph points are
 *  read in (its quads, else its rectangle); null for an annotation that is no link or names no target */
export function annotationOf(an: Annotation): {
  to: { url: string } | { dest: string }
  rect: [number, number, number, number]
  boxes: [number, number, number, number][]
} | null {
  if (an.annotationType !== 2 || !Array.isArray(an.rect) || an.rect.length !== 4) return null
  const to =
    (an.url ?? an.unsafeUrl)
      ? { url: String(an.url ?? an.unsafeUrl) }
      : an.dest !== undefined
        ? { dest: JSON.stringify(an.dest) }
        : null
  if (!to) return null
  const [x0, y0, x1, y1] = an.rect.map(r2) as [number, number, number, number]
  const boxes = quadBoxesOf(an.quadPoints) ?? [[Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]]
  return { to, rect: [x0, y0, x1, y1], boxes }
}
/** the glyphs (their indices on the page) an annotation holds: each one's glyph point, its advance centre on its baseline,
 *  strictly inside one of its boxes (PDF.js's overlaidText rule), white space aside */
export function pointsOf(
  glyphs: readonly { u: string; x0: number; x1: number; y: number }[],
  { boxes }: { boxes: readonly [number, number, number, number][] },
): number[] {
  const inside = (x: number, y: number) => boxes.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3])
  const pts: number[] = []
  glyphs.forEach((g, j) => {
    if (/\S/.test(g.u) && inside((g.x0 + g.x1) / 2, g.y)) pts.push(j)
  })
  return pts
}
/** an annotation's quads (PDF.js's quadPoints, eight numbers a quad) as boxes, null where it has none or they are ill formed */
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
