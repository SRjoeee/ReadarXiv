// The geometry of reading a figure's lines (DESIGN §15.3): where a detected line is cut from the image, and which way
// round a tall one is read. Pure arithmetic — the canvas and the models are the recogniser's (recognise.ts).
import type { Quad } from '@/shared/ocr'

export type Point = [number, number]
/** A line's four corners in the image's pixels, in reading order: ↖ ↗ ↘ ↙ */
export type PixelQuad = [Point, Point, Point, Point]

/**
 * Detection's longest side. Accuracy is flat from 736 to 1 600 px once lines are cut from the original (92.4–92.8 %
 * agreement with Apple Vision over 39 figures) and the time is not: 360 ms at 736, 497 ms at 1 600
 */
export const DETECT_SIDE_PX = 960
/** The recognition model's input height: a line is cut at this height, whatever the figure's resolution */
export const LINE_HEIGHT_PX = 48
/** Taller than this many times its width, a line is one set on its side — an axis label */
const TALL = 1.5

/** How much the image is reduced for detection; never enlarged */
export function detectScale(width: number, height: number): number {
  return Math.min(1, DETECT_SIDE_PX / Math.max(width, height))
}

const distance = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1])

export function isTall(quad: PixelQuad): boolean {
  return distance(quad[0], quad[3]) > TALL * distance(quad[0], quad[1])
}

/**
 * The same region with its corners renamed for a reading a quarter turn away: `up` reads from the bottom to the top —
 * a chart's y-axis label — and `down` from the top to the bottom, as a label on a right-hand axis does
 */
export function turned(quad: PixelQuad, reading: 'up' | 'down'): PixelQuad {
  const [a, b, c, d] = quad
  return reading === 'up' ? [d, a, b, c] : [b, c, d, a]
}

export interface Cut {
  width: number
  height: number
  /** `setTransform(a, b, c, d, e, f)`: the image drawn through it lands the line upright at the origin */
  matrix: [number, number, number, number, number, number]
}

/**
 * How to cut the line under `quad` out of the image, upright and LINE_HEIGHT_PX tall: a rotation about the line's
 * first corner that lays its top edge along x, scaled so that its height is the recogniser's. The cut is taken from
 * the **original**, not from the reduced image detection saw — recognising from the reduced one lost a tenth of the
 * words at a 736 px detection side (83.4 % against 92.6 %)
 */
export function cutOf(quad: PixelQuad): Cut {
  const [p0, p1, , p3] = quad
  const k = LINE_HEIGHT_PX / Math.max(distance(p0, p3), 1e-6)
  const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0])
  const a = k * Math.cos(angle)
  const c = k * Math.sin(angle)
  return {
    width: Math.max(1, Math.round(k * distance(p0, p1))),
    height: LINE_HEIGHT_PX,
    matrix: [a, -c, c, a, -(a * p0[0] + c * p0[1]), c * p0[0] - a * p0[1]],
  }
}

/** The corners as fractions of the image, origin top-left — what the overlay places a label by (§15.3) */
export function normalise(quad: PixelQuad, width: number, height: number): Quad {
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  return quad.map(([x, y]) => [round(x / width), round(y / height)]) as Quad
}
