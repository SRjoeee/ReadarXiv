// The facts of the page around a unit that lane L1 states and today's run reads off the page's characters, read here as today
// reads them, from what the tap captured: a widened line's room (U.decor's `Side`) and the unit's edges (U.params' `edges`).
// A widened line's room read from the page as today's run reads it: its column (columnOf RUN:1557-1573:
// the page's paragraph lines over the block's middle, else the nearest page before it with three, else the page's text
// area) and the glyphs on its baseline (widen RUN:1580-1582). Lane L1 states it (Room.side, F.room); until the part does,
// the replay derives it here from what the tap captured at U.decor (its `cols`, `areas`, the pages' `chars`). Today's
// columnOf, widen's line and edgesOf are closures of openProto that no module exports: these are they, transcribed, with
// nothing changed but the label's part of edgesOf, which is U.params' (and the work counter).
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

/** a page's characters by baseline (RUN:226 rowsOf) */
type Rows = { cs: (PageChar & { size: number })[]; yb: Float64Array; size: number }
function rowsOf(chars: readonly (PageChar & { size: number })[]): Rows {
  const cs = chars.filter((c) => /\S/.test(c.ch)).sort((a, b) => a.yb - b.yb)
  let size = 0
  for (const c of cs) if (c.size > size) size = c.size
  return { cs, yb: Float64Array.from(cs, (c) => c.yb), size }
}
const firstAtOrOver = (a: Float64Array, y: number) => {
  let lo = 0,
    hi = a.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (a[m]! < y) lo = m + 1
    else hi = m
  }
  return lo
}
type EdgeBlock = {
  page: number
  rects: readonly (readonly number[])[]
  B: readonly number[]
  sizes: readonly number[]
  pitch0: number | null
}
/** a unit's edges as the page shows them (RUN:1638-1672 edgesOf, transcribed; its label's part is U.params'): whether its
 *  first and last lines stand alone on their baselines in their frame's span, and the room from its last baseline down to
 *  the next line of its column; null for a cell or a unit of no block */
export function edgesOf(
  kind: string,
  blocks: readonly EdgeBlock[],
  chars: Record<string, (PageChar & { size: number })[] | null>,
): { first: boolean; last: boolean; below: number } | null {
  if (kind === 'cell' || !blocks.length) return null
  const spanOf = (b: EdgeBlock) => [Math.min(...b.rects.map((q) => q[1]!)), Math.max(...b.rects.map((q) => q[3]!))]
  const byPage = new Map<number, Rows>()
  const rows = (b: EdgeBlock) => {
    const r = byPage.get(b.page) ?? rowsOf(chars[b.page] ?? [])
    byPage.set(b.page, r)
    return r
  }
  const alone = (b: EdgeBlock, r: readonly number[], yb: number, size: number) => {
    const [cx0, cx1] = spanOf(b),
      R = rows(b),
      t = 0.4 * size
    for (let i = firstAtOrOver(R.yb, yb - t - 1e-6); i < R.cs.length && R.yb[i]! <= yb + t + 1e-6; i++) {
      const c = R.cs[i]!
      if (Math.abs(c.yb - yb) < 0.4 * size && c.x1 > cx0! && c.x0 < cx1! && (c.x1 < r[1]! - 0.5 || c.x0 > r[3]! + 0.5))
        return false
    }
    return true
  }
  const below = (b: EdgeBlock) => {
    const [cx0, cx1] = spanOf(b),
      yb = b.B.at(-1)!,
      p0 = b.pitch0 ?? 1.2 * (b.sizes.at(-1) ?? 10),
      R = rows(b),
      T = yb - 0.75 * p0
    const under = (c: PageChar) => c.yb < T && c.x1 > cx0! && c.x0 < cx1!
    let i = firstAtOrOver(R.yb, T) - 1
    for (; i >= 0; i--) if (under(R.cs[i]!)) break
    if (i < 0) return Infinity
    const top = R.cs[i]!.yb,
      line: number[] = []
    for (let j = i; j >= 0 && R.yb[j]! > top - 0.5 * R.size - 1e-6; j--) {
      const c = R.cs[j]!
      if (under(c) && c.yb > top - 0.5 * c.size) line.push(c.yb)
    }
    line.sort((x, y) => x - y)
    return yb - line[(line.length - 1) >> 1]!
  }
  const b0 = blocks[0]!,
    bl = blocks.at(-1)!
  return {
    first: alone(b0, b0.rects[0]!, b0.B[0]!, b0.sizes[0]!),
    last: alone(bl, bl.rects.at(-1)!, bl.B.at(-1)!, bl.sizes.at(-1)!),
    below: below(bl),
  }
}
