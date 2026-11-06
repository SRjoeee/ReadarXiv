// A widened line's room (U.decor's `Side`) read from the page as today's run reads it: its column (columnOf RUN:1557-1573:
// the page's paragraph lines over the block's middle, else the nearest page before it with three, else the page's text
// area) and the glyphs on its baseline (widen RUN:1580-1582). Lane L1 states it (Room.side, F.room); until the part does,
// the replay derives it here from what the tap captured at U.decor (its `cols`, `areas`, the pages' `chars`). Today's
// columnOf is a closure of openProto that no module exports: this is it, transcribed, with nothing changed.
import type { DecorBlock, Side } from '../../src/unit/decor.ts'

export type PageChar = { ch: string; x0: number; x1: number; yb: number }
export type PageFacts = {
  cols: Record<string, [number, number][]>
  areas: Record<string, [number, number]>
  chars: Record<string, PageChar[] | null>
}

/** the column a block's line may run on to (RUN:1557 columnOf) */
export function columnOf(b: DecorBlock, f: PageFacts, size: number): [number, number] {
  const mid = (b.x0 + b.x1) / 2
  const over = (q: number) => (f.cols[q] ?? []).filter(([a, z]) => a <= mid && z >= mid)
  let own = over(b.page)
  for (let q = b.page - 1; own.length < 3 && q >= 1; q--) {
    const o = over(q)
    if (o.length >= 3) own = o
  }
  if (own.length < 3) return f.areas[b.page]!
  const ends = own.map((c) => c[1]).sort((x, y) => y - x)
  let right = ends[0]!
  for (let i = 0; i + 1 < ends.length; i++)
    if (ends[i]! - ends[i + 1]! <= 0.2) {
      if (ends[0]! - ends[i]! < size) right = ends[i]!
      break
    }
  return [Math.min(...own.map((c) => c[0])), right]
}

/** a single-line block's room: its column and the glyphs on its baseline beyond its rectangle (RUN:1576-1582) */
export function sideOf(b: DecorBlock, f: PageFacts): Side | undefined {
  if (b.rects.length !== 1) return undefined
  const r = b.rects[0]!,
    yb = b.B[0]!,
    size = b.sizes[0]!
  const column = columnOf(b, f, size)
  const line = (f.chars[b.page] ?? []).filter((c) => Math.abs(c.yb - yb) < 0.4 * size && /\S/.test(c.ch))
  return {
    column,
    right: line.filter((c) => c.x0 > r[3] + 6).map((c) => c.x0 - 0.5 * size),
    left: line.filter((c) => c.x1 < r[1] - 1).map((c) => c.x1 + 0.5 * size),
  }
}
