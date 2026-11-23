// A member's frame on arXiv's page (docs/PDF-READER.md §18.112): a closed path the page paints that a reader SEES and whose
// interior holds every one of the member's text lines on the page, read by its painted lines, as a figure text's container is
// (figure-text.ts containersOf). The room the part states about the member (Room.runs and Room.below under its lines, Room.stays
// beside them) is read from the page's ink by glyph baselines and painted boxes (geometry.ts inkIndex, facts.ts staysOf): a
// path that encloses the text has its box's top over it and spans across its lines, so it is never under nor beside them, and a
// translation borrowed lines and widened a line past the border of a frame painted as one path round it (2601.06943v2 p1's
// abstract, a tcolorbox's two fills; 2610.19159v1's boxes). Its painted lines are ink under the member's runs and beside its lines,
// as a frame of separate rules (\fbox, framed, mdframed's default) is already: the room ends at the frame.
//
// SEEN, by the page's own operators, no tolerance: a path that strokes (at an alpha over 0, pageInk's `stroke`), or one whose
// fill has a colour that is not the colour painted under it at one of its four edge middles at least (its path's own, where
// its box's middle lines cross it; each read just inside its edge): at each, the last opaque fill painted before it whose region holds that point (an image or a shading there,
// or a fill of no known colour, is a colour this reading does not know: seen), else the paper's white. A fill of the colour
// under it with no stroke (an mdframed box's white ground on the white page), a path painted at an alpha of 0 (pageInk's
// `unseen`), a clip (which paints nothing and is no box) are no frame. A pattern's fill is seen.
// Candidates: closed paths (every segment's end met by another's: closedPath) that are no page's background (0.9 x 0.75 of the
// page, as geometry.ts inkIndex reads one) and whose interior holds a glyph's middle, the glyph's ink inside the path's box; kept
// with their lines, the frames the room is read by once A's raw pages are let go (locate.ts reads them before its ink step takes
// the pages). A page whose path past pageInk's SHAPE_NUMBERS_PAGE kept no lines reads that path by its box, as before.
// Pure arithmetic over a page; an original module (no port statement).
import type { Line } from '@readarxiv/format'
import type { DocPage } from '../doc.ts'
import type { Shape } from '../ink.ts'
import { closedPath, interiorOf } from './figure-text.ts'
import type { InkBox } from './facts.ts'

/** a closed path of a page that holds text, read by its painted lines: its box's index among the page's boxes, its box, its
 *  segments (x0, y0, x1, y1 each), whether it strokes and its half line width there, and whether a reader sees it (`seen`; where
 *  not, `why`: 'as under', a fill of the colour painted under it, no stroke; 'alpha 0', painted at an alpha of 0) */
export interface PaintedFrame {
  b: number
  box: [number, number, number, number]
  segs: ArrayLike<number>
  stroke: boolean
  hw: number
  seen: boolean
  why?: 'as under' | 'alpha 0'
}

/** the paper's colour: what a page shows where nothing is painted */
const PAPER = 0xffffff

/** what a page paints, as pageInk read it (read.ts `raw`): its boxes' lines and fills, and the boxes nothing of which shows */
export interface PaintedPage {
  shapes?:
    | ReadonlyMap<number, Pick<Shape, 'segs' | 'stroke' | 'fill' | 'hw' | 'opaque' | 'colour' | 'pattern'>>
    | undefined
  unseen?: ReadonlySet<number> | undefined
}

/** the closed paths of a page that hold text (candidates, seen or not), in its stream order */
export function framesOnPage(raw: PaintedPage | null | undefined, page: DocPage): PaintedFrame[] {
  const shapes = raw?.shapes
  if (!shapes?.size) return []
  const B = page.boxes,
    K = page.kinds,
    U = raw?.unseen
  const W = page.view[2] - page.view[0],
    H = page.view[3] - page.view[1]
  // (the page's glyphs' middles by height, read by halving: a candidate holds text where one of them stands inside it)
  const mids = page.glyphs
    .filter((g) => !g.blank && !g.unseen && g.x1 > g.x0)
    .map((g) => [(g.ix0 + g.ix1) / 2, (g.top + g.bottom) / 2, g.ix0, g.bottom, g.ix1, g.top] as const)
    .sort((a, b) => a[1] - b[1])
  const firstAt = (y: number) => {
    let lo = 0,
      hi = mids.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((mids[mid] as (typeof mids)[number])[1] < y) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const boxOf = (b: number): [number, number, number, number] => [
    B[4 * b] as number,
    B[4 * b + 1] as number,
    B[4 * b + 2] as number,
    B[4 * b + 3] as number,
  ]
  const out: PaintedFrame[] = []
  for (let b = 0; b < K.length; b++) {
    if ((K[b] as number) < 0) continue
    const sh = shapes.get(b)
    if (!sh || !closedPath(sh.segs)) continue
    const box = boxOf(b)
    if (box[2] - box[0] >= 0.9 * W && box[3] - box[1] >= 0.75 * H) continue
    let holds = false
    for (let k = firstAt(box[1]); k < mids.length && !holds; k++) {
      const g = mids[k] as (typeof mids)[number]
      if (g[1] > box[3]) break
      if (g[2] >= box[0] && g[4] <= box[2] && g[3] >= box[1] && g[5] <= box[3] && interiorOf(sh.segs, g[0], g[1]))
        holds = true
    }
    if (!holds) continue
    const frame: PaintedFrame = { b, box, segs: sh.segs, stroke: sh.stroke, hw: sh.hw, seen: true }
    if (U?.has(b)) {
      frame.seen = false
      frame.why = 'alpha 0'
    } else if (!sh.stroke && sh.colour !== undefined && !sh.pattern && asUnder(b, box, sh.segs, sh.colour, shapes, U, K, B)) {
      frame.seen = false
      frame.why = 'as under'
    }
    out.push(frame)
  }
  return out
}

/** how far inside an edge of a fill the paint under it is read there: a thousandth of a point, past the arithmetic's rounding of
 *  two edges set flush, far under any width a reader sees. On the edge itself the even-odd test (interiorOf) counts a rectangle's
 *  right and top edges outside it, and a fill flush with those of a fill of its colour under it read the paper's white there */
const INSIDE = 1e-3

/** whether a fill of `colour` (box `b`, its box `box`, its path's segments `segs`) is of the colour painted under it at each of
 *  its four edge middles, each read just inside the edge (INSIDE; colourAt): seen where one of them stands on another colour or
 *  on one this reading does not know. Its edges are its path's own: from each of its box's edge middles in along the box's
 *  middle line to the path's outermost crossing there (a rectangle's, a rounded one's or a circle's the box's edge middle itself;
 *  a turned rectangle's or a diamond's inside its box, where the box's middle stood on the paper outside it) */
function asUnder(
  b: number,
  box: readonly [number, number, number, number],
  segs: ArrayLike<number>,
  colour: number,
  shapes: NonNullable<PaintedPage['shapes']>,
  U: ReadonlySet<number> | undefined,
  K: readonly number[],
  B: readonly number[],
): boolean {
  const cx = (box[0] + box[2]) / 2,
    cy = (box[1] + box[3]) / 2
  // (where the path crosses the line x = cx (`across` 0, the ys) or y = cy (1, the xs): each segment's point there, both ends
  // of one lying along it)
  const crossings = (across: 0 | 1, at: number): number[] => {
    const out: number[] = []
    for (let i = 0; i + 3 < segs.length; i += 4) {
      const a = segs[i + across] as number,
        c = segs[i + 2 + across] as number,
        a2 = segs[i + 1 - across] as number,
        c2 = segs[i + 3 - across] as number
      if ((a - at) * (c - at) > 0) continue
      if (a === c) out.push(a2, c2)
      else out.push(a2 + ((at - a) / (c - a)) * (c2 - a2))
    }
    return out
  }
  const ys = crossings(0, cx),
    xs = crossings(1, cy)
  const pts = [
    [cx, (ys.length ? Math.min(...ys) : box[1]) + INSIDE],
    [cx, (ys.length ? Math.max(...ys) : box[3]) - INSIDE],
    [(xs.length ? Math.min(...xs) : box[0]) + INSIDE, cy],
    [(xs.length ? Math.max(...xs) : box[2]) - INSIDE, cy],
  ] as const
  return pts.every(([x, y]) => colourAt(b, x, y, shapes, U, K, B) === colour)
}

/** the colour painted under box `b` at point (x, y): the last fill before it whose region holds the point, its colour where it
 *  covers what is under it, the paper's where none; null where what is painted there has no colour this reading knows (a box
 *  that is no path's, an image's or a shading's among them, whose box holds the point; a pattern, a fill that covers nothing
 *  whole or of no colour; a path whose lines were not kept). Each point by its own paint: artwork under part of a fill is
 *  under that part */
function colourAt(
  b: number,
  x: number,
  y: number,
  shapes: NonNullable<PaintedPage['shapes']>,
  U: ReadonlySet<number> | undefined,
  K: readonly number[],
  B: readonly number[],
): number | null {
  for (let j = b - 1; j >= 0; j--) {
    if (U?.has(j)) continue
    if (
      x < (B[4 * j] as number) ||
      x > (B[4 * j + 2] as number) ||
      y < (B[4 * j + 1] as number) ||
      y > (B[4 * j + 3] as number)
    )
      continue
    // (a box that is no path's (pageInk's `paths`: an image, a shading, an annotation's appearance, a turned glyph, merged cells):
    // paint of no colour this reading knows)
    if ((K[j] as number) < 0) return null
    const sh = shapes.get(j)
    if (!sh) return null
    // (a stroke paints its lines, no region; a fill whose region does not hold the point is not under it)
    if (!sh.fill || !interiorOf(sh.segs, x, y)) continue
    // (a fill that does not cover what is under it, or of no colour: what shows there is no colour of the page's operators)
    return sh.opaque && sh.colour !== undefined && !sh.pattern ? sh.colour : null
  }
  return PAPER
}

/** whether segment a-b meets rectangle r (Liang-Barsky), and the part of it inside, or null */
function clip(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: readonly [number, number, number, number],
): [number, number, number, number] | null {
  let t0 = 0,
    t1 = 1
  const dx = bx - ax,
    dy = by - ay
  const edges: [number, number][] = [
    [-dx, ax - r[0]],
    [dx, r[2] - ax],
    [-dy, ay - r[1]],
    [dy, r[3] - ay],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
    } else {
      const t = q / p
      if (p < 0) {
        if (t > t1) return null
        if (t > t0) t0 = t
      } else {
        if (t < t0) return null
        if (t < t1) t1 = t
      }
    }
  }
  return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy]
}

/** a text line's box: its ink across, its fonts' boxes up and down (Line[2], Line[6], Line[3], Line[5]) */
const lineBox = (l: Line): [number, number, number, number] => [l[2], l[6], l[3], l[5]]

/**
 * The member's frame on a page: of the page's seen candidates, the innermost (the least box) whose box holds its text lines there
 * (`lines`, its kept rows aside), whose interior holds each one's middle and whose painted lines touch none of them (a line a
 * path crosses is not inside it); null where none. A frame holding two members is each one's; one inside another, the inner
 */
export function frameOf(frames: readonly PaintedFrame[] | undefined, lines: readonly Line[]): PaintedFrame | null {
  if (!frames?.length || !lines.length) return null
  const boxes = lines.map(lineBox)
  const x0 = Math.min(...boxes.map((r) => r[0])),
    y0 = Math.min(...boxes.map((r) => r[1])),
    x1 = Math.max(...boxes.map((r) => r[2])),
    y1 = Math.max(...boxes.map((r) => r[3]))
  let best: PaintedFrame | null = null,
    area = Number.POSITIVE_INFINITY
  for (const f of frames) {
    if (!f.seen || f.box[0] > x0 || f.box[1] > y0 || f.box[2] < x1 || f.box[3] < y1) continue
    const a = (f.box[2] - f.box[0]) * (f.box[3] - f.box[1])
    if (a >= area) continue
    if (!boxes.every((r) => interiorOf(f.segs, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2))) continue
    const e = f.stroke ? f.hw : 0
    let touches = false
    for (const r of boxes) {
      const R: [number, number, number, number] = [r[0] - e, r[1] - e, r[2] + e, r[3] + e]
      for (let i = 0; i + 3 < f.segs.length && !touches; i += 4)
        if (clip(f.segs[i] as number, f.segs[i + 1] as number, f.segs[i + 2] as number, f.segs[i + 3] as number, R))
          touches = true
      if (touches) break
    }
    if (touches) continue
    best = f
    area = a
  }
  return best
}

/** the highest of a frame's painted lines wholly under `foot` across x0..x1 (a stroke's half width over it): its border's top
 *  there, each line read by its part across x0..x1 (a diamond's lower edge rises past the foot beyond the run and stands under it
 *  across it). A line that rises past `foot` across the run stands beside it, not under it (a frame's side, as a rule TeX set
 *  beside a paragraph is no ink under it: geometry.ts inkIndex reads a box by its top); -Infinity for none */
export function frameUnder(f: PaintedFrame | null, foot: number, x0: number, x1: number): number {
  if (!f) return Number.NEGATIVE_INFINITY
  const e = f.stroke ? f.hw : 0
  if (f.box[2] < x0 - e || f.box[0] > x1 + e || f.box[1] > foot) return Number.NEGATIVE_INFINITY
  let best = Number.NEGATIVE_INFINITY
  for (let i = 0; i + 3 < f.segs.length; i += 4) {
    const c = clip(f.segs[i] as number, f.segs[i + 1] as number, f.segs[i + 2] as number, f.segs[i + 3] as number, [
      x0 - e,
      Number.NEGATIVE_INFINITY,
      x1 + e,
      Number.POSITIVE_INFINITY,
    ])
    if (!c) continue
    const top = Math.max(c[1], c[3]) + e
    if (top < foot) best = Math.max(best, top)
  }
  return best
}

/** a frame's painted lines where they stand beside its text lines: each segment's part within a line's height (its fonts' box,
 *  Line[6] to Line[5], a stroke's half width over and under), as a box widened by that half width. What stands beside a line is
 *  where the path is at the line's own height, for a path of any slope: a sloped edge's whole box reaches across the line (a
 *  diamond's, a rounded corner's arc) and stood beside none. facts.ts staysOf reads them as it reads a
 *  rule TeX set apart */
export function framePieces(f: PaintedFrame | null, lines: readonly Line[]): InkBox[] {
  if (!f) return []
  const e = f.stroke ? f.hw : 0
  const out: InkBox[] = []
  for (const l of lines) {
    if (l[9] & 1) continue
    const band: [number, number, number, number] = [
      Number.NEGATIVE_INFINITY,
      l[6] - e,
      Number.POSITIVE_INFINITY,
      l[5] + e,
    ]
    for (let i = 0; i + 3 < f.segs.length; i += 4) {
      const c = clip(
        f.segs[i] as number,
        f.segs[i + 1] as number,
        f.segs[i + 2] as number,
        f.segs[i + 3] as number,
        band,
      )
      if (!c) continue
      out.push({
        x0: Math.min(c[0], c[2]) - e,
        x1: Math.max(c[0], c[2]) + e,
        y0: Math.min(c[1], c[3]) - e,
        y1: Math.max(c[1], c[3]) + e,
      })
    }
  }
  return out
}
