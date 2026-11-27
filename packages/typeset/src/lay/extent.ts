// Laid.extent: what a laid member draws on its page, as one box (the link previews: on the right pane a preview's crop is the
// translation's own extent, never only the original's box; docs/PDF-READER.md §20, the design's L12). The union, PDF units, of
// each item as the reader's painter draws it (packages/reader compose/paint.ts):
// - a run: from its x to its last advance (its characters' own places `dx` where it has them, the last one's advance after it),
//   its tracking after each character, or to its ink's right where that is further; over and under its baseline by its ink at
//   its size (Metrics.ink), raised by its `rise`; an oblique run (`skew`) slanted about its baseline by the painter's 12°;
// - a crop: its source's box moved and scaled onto its line, its base on the line's baseline (paint.ts placeOf);
// - a line set along a direction (`dir`: a turned figure text, a frame's line): each of those from the line's origin along it,
//   its ink across it, the page's box of the turned corners.
// None for a member not laid, or laid with no item on the page.
import type { Box } from '@readarxiv/format'
import type { Item, Laid, Metrics } from '../types.ts'

/** the painter's slant of an oblique run (reader compose/paint.ts OBLIQUE_DEG) */
const OBLIQUE = Math.tan((12 * Math.PI) / 180)

type Run = Extract<Item, { face: string }>
type Crop = Extract<Item, { src: unknown }>

/** a run's box along its line and across it, from its line's origin: [a0, b0, a1, b1] (a along, b over the baseline) */
function runFrame(it: Run, lx: number, metrics: Metrics): [number, number, number, number] {
  const chars = [...it.s]
  const track = it.track ?? 0
  const w = it.dx?.length
    ? it.dx[it.dx.length - 1]! + metrics.advance(it.face, it.size, chars.at(-1) ?? '') + track
    : metrics.advance(it.face, it.size, it.s) + track * chars.length
  const [up, down, right] = metrics.ink(it.face, it.size, it.s)
  const rise = it.rise ?? 0
  const a0 = it.x - lx
  let lo = a0,
    hi = a0 + Math.max(w, right)
  if (it.skew) {
    lo -= down * OBLIQUE
    hi += up * OBLIQUE
  }
  return [lo, rise - down, hi, rise + up]
}

/** a box of the frame of direction (ux, uy) on the page: its four corners turned (paint.ts onPage) */
function onPage([ux, uy]: readonly [number, number], b: readonly number[]): Box {
  const c = [
    [b[0]!, b[1]!],
    [b[2]!, b[1]!],
    [b[0]!, b[3]!],
    [b[2]!, b[3]!],
  ].map(([x, y]) => [ux * x! - uy * y!, uy * x! + ux * y!] as const)
  return [
    Math.min(...c.map((q) => q[0])),
    Math.min(...c.map((q) => q[1])),
    Math.max(...c.map((q) => q[0])),
    Math.max(...c.map((q) => q[1])),
  ]
}

/** a crop's placed box on the page (paint.ts placeOf's map of its source) */
function cropBox(it: Crop, y: number, lx: number): Box {
  const [, x0, y0, x1, y1, base] = it.src
  const k = it.k
  if (!it.dir) return [it.x, y + (y0 - base) * k, it.x + (x1 - x0) * k, y + (y1 - base) * k]
  const [ux, uy] = it.dir
  const fx = ux * lx + uy * y + (it.x - lx),
    fy = -uy * lx + ux * y
  const ox = fx - x0 * k,
    oy = fy - base * k
  const cx = ux * ox - uy * oy,
    cy = uy * ox + ux * oy
  const s = onPage(it.dir, [x0, y0, x1, y1])
  return [k * s[0] + cx, k * s[1] + cy, k * s[2] + cx, k * s[3] + cy]
}

/** each item's drawn box on the page (a run of white space draws nothing and is none) */
function itemBox(it: Item, y: number, lx: number, metrics: Metrics): Box | null {
  if ('src' in it) return cropBox(it, y, lx)
  if (!it.s.trim()) return null
  const [a0, b0, a1, b1] = runFrame(it, lx, metrics)
  if (!it.dir) return [lx + a0, y + b0, lx + a1, y + b1]
  const [ux, uy] = it.dir
  // (from the line's origin (lx, y): along it by a, across it (its left, (-uy, ux)) by b)
  const pts = [
    [a0, b0],
    [a1, b0],
    [a0, b1],
    [a1, b1],
  ].map(([a, b]) => [lx + a! * ux - b! * uy, y + a! * uy + b! * ux] as const)
  return [
    Math.min(...pts.map((p) => p[0])),
    Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])),
    Math.max(...pts.map((p) => p[1])),
  ]
}

/** a laid member's extent on its page, or none (not laid, nothing drawn) */
export function extentOf(m: Laid, metrics: Metrics): Box | undefined {
  if (m.state !== 'laid') return undefined
  let e: Box | null = null
  for (const [y, lx, , items] of m.lines)
    for (const it of items) {
      const b = itemBox(it, y, lx, metrics)
      if (!b) continue
      e = e ? [Math.min(e[0], b[0]), Math.min(e[1], b[1]), Math.max(e[2], b[2]), Math.max(e[3], b[3])] : b
    }
  return e ?? undefined
}

/** each laid member with its extent stated (a member it states none of as it was) */
export function withExtents(members: readonly Laid[], metrics: Metrics): Laid[] {
  return members.map((m) => {
    const extent = extentOf(m, metrics)
    return extent ? { ...m, extent } : m
  })
}
