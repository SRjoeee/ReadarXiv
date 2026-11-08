// Laid.lit (design-a §1.2; docs/PDF-READER.md §17): what each pane lights of a member on a page, per sentence, from the same
// boxes on both panes' terms. No part states `cuts` yet (the shared cutter's sentence starts placed on A), so every member
// lights whole, one entry a pane (design-a's rule for an offset on no cut: its unit lit whole on both panes):
// - on the left, A: its lines' boxes on the page (each line's ink across, its fonts' boxes up and down), its label where it is
//   drawn anew and the babel name it is led by widening the line they stand on (today's unitRuns: a label or a lead with no row
//   of its own widens its unit's row);
// - on the right, as drawn: its laid lines' boxes (each line over its tokens' slots and bands, D.sentences' tokenBox) and the
//   lines it keeps where they stand (a held line: its ink stays);
// - `own`: its own ink the page keeps (D.groups' shown: a display, its rows, a block of its own; a piece or a label kept where it
//   stands), the same boxes on both panes.
// A member not laid, and every member of a page that waits, lights from A on both panes: the right mirrors the left. A figure
// text the original sets turned (Placed.dir, its run Placed.run) is lit turned with its text: its boxes in its run's frame
// (Laid.lit's `dir`), on A its run's box, as drawn its line along it, never the level box its turned box stands in on the page
// (a label set at 30° stands in a level box about twice its height, over its neighbours': 336 of the 1,887 turned figure texts
// over the 87 corpus bundles).
import type { Box, Ink, Placed } from '@readarxiv/format'
import { type GroupEl, groupsOff } from '../emit/groups.ts'
import { lineBoxes, onDisplay } from '../emit/sentences.ts'
import type { Layout } from '../fit/types.ts'
import type { Laid } from '../types.ts'

type Line = Placed['lines'][number]
type Lit = Laid['lit']
const KEPT = 1

/** a line's box on A: its ink across, its fonts' boxes up and down */
const boxOfLine = (l: Line): Box => [l[2], l[6], l[3], l[5]]
/** a line as ink: page, its box, its baseline */
export const inkOfLine = (l: Line): Ink => [l[0], l[2], l[6], l[3], l[5], l[4]]

/** `rows` with ink of the member's that has no row of its own: the row whose band holds its baseline widened over it, else a
 *  row of its own */
function widened(rows: Box[], ink: readonly Ink[], page: number): Box[] {
  const out = rows.map((b) => [...b] as Box)
  for (const k of ink) {
    if (k[0] !== page) continue
    const r = out.find((b) => b[1] <= k[5] && k[5] <= b[3])
    if (!r) out.push([k[1], k[2], k[3], k[4]])
    else {
      r[0] = Math.min(r[0], k[1])
      r[1] = Math.min(r[1], k[2])
      r[2] = Math.max(r[2], k[3])
      r[3] = Math.max(r[3], k[4])
    }
  }
  return out
}

/** the boxes on both panes alike (one entry each), none where it has none */
export const mirrored = (boxes: Box[]): Lit =>
  boxes.length ? { left: [boxes], right: [boxes], own: [] } : { left: [], right: [], own: [] }

type Dir = [ux: number, uy: number]
/** a page's point in the frame of a run along `dir` (Laid.lit's `dir`): its place along the run and across it, (−uy, ux) */
export const inFrame = ([ux, uy]: Dir, x: number, y: number): [s: number, t: number] => [
  x * ux + y * uy,
  y * ux - x * uy,
]

/** a box in a run's frame as the page's box it stands in (its corners' extent on the page) */
export function pageBoxOf([s0, t0, s1, t1]: Box, [ux, uy]: Dir): Box {
  const xs: number[] = [],
    ys: number[] = []
  for (const s of [s0, s1])
    for (const t of [t0, t1]) {
      xs.push(s * ux - t * uy)
      ys.push(s * uy + t * ux)
    }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * A turned figure text's box on A in its run's frame (Placed.dir, Placed.run): the box its line tells (its line: the extent on
 * the page of its run's box, turned), read back about its run's origin. Across the run, the band each edge of its line that
 * turns with it tells, weighed by how much it turns, the run taken from its origin over its length; along it, the same of the
 * edges that turn with it, over that band; the band read again over that run (a quarter turned, each extent its line's own; at
 * an angle between, the run's length where its line tells none apart). Null where the part states no run (a part made before:
 * its line, level, is all it tells) or the page is not its
 */
export function runBoxOfA(m: Placed, page: number): Box | null {
  const l = m.lines[0]
  if (!m.dir || !m.run || !l || l[0] !== page) return null
  const [ux, uy] = m.dir
  const [ox, oy, length] = m.run
  // (its run's box, s along it from its origin and t across, stands on the page over x: ox + s·ux − t·uy, y: oy + s·uy + t·ux;
  // an extent of x or y over the box is its s's extent times one component and its t's times the other)
  const [x0, x1, y0, y1] = [l[2] - ox, l[3] - ox, l[6] - oy, l[5] - oy]
  const lo = (a: number, b: number) => Math.min(a, b),
    hi = (a: number, b: number) => Math.max(a, b)
  /** one extent read back from the box's x and y extents, the other's given: [from, to] */
  const read = (other: [number, number], xk: number, xo: number, yk: number, yo: number): [number, number] | null => {
    let w = 0,
      a = 0,
      b = 0
    for (const [k, o, e0, e1] of [
      [xk, xo, x0, x1],
      [yk, yo, y0, y1],
    ] as const) {
      if (Math.abs(k) < 1e-6) continue
      const p = (e0 - lo(other[0] * o, other[1] * o)) / k,
        q = (e1 - hi(other[0] * o, other[1] * o)) / k
      a += lo(p, q) * Math.abs(k)
      b += hi(p, q) * Math.abs(k)
      w += Math.abs(k)
    }
    return w ? [a / w, b / w] : null
  }
  const band0 = read([0, length], -uy, ux, ux, uy)
  const run = band0 && read(band0, ux, -uy, uy, ux)
  const band = run && read(run, -uy, ux, ux, uy)
  if (!band || !run || !(band[1] > band[0]) || !(run[1] > run[0])) return null
  const [os, ot] = inFrame(m.dir, ox, oy)
  return [os + run[0], ot + band[0], os + run[1], ot + band[1]]
}

/** a member lit from A on both panes (not laid, or waiting): its lines on the page, its label with the line it stands on; a
 *  turned figure text its run's box, turned with it */
export function litOfA(m: Placed, page: number): Lit {
  const run = runBoxOfA(m, page)
  if (run) return { ...mirrored([run]), dir: m.dir! }
  const lines = m.lines.filter((l) => l[0] === page).map(boxOfLine)
  return mirrored(widened(lines, m.label ? [m.label.ink] : [], page))
}

/**
 * A laid member's boxes on page `page`. `L` its layout; `off` its groups turned off on the page as the entry decides them (its
 * elements: 2, the ink it keeps shown follows it; a label drawn anew: 4); `kept` its elements kept where they stand by its
 * reading (U.elements' kept, in place); `lead` the name it is led by, drawn anew with it
 */
export function litLaid(
  m: Placed,
  page: number,
  L: Layout | undefined,
  o: { off: number; kept: ReadonlySet<string>; lead: Placed | null },
): Lit {
  const els: GroupEl[] = (m.els ?? []).map(([id, e]) => ({
    k: Number(id),
    display: e.kind === 'display',
    ink: e.ink,
    kept: !!e.keep || o.kept.has(id),
  }))
  const relabelled = !!(o.off & 4)
  const { shown } = groupsOff({
    page,
    ord: m.ord,
    els,
    label: m.label ? { ink: [m.label.ink], drawn: relabelled } : null,
    fixed: m.fixed ?? 0,
    // (the elements' group as the entry decides it: one the translation omits is drawn nowhere else, its ink stays and lights,
    // #626's review)
    elementsOff: !!(o.off & 2),
  })
  const displays = shown.filter((s) => s.kind === 'display')
  // (a KEPT line is a display's row, its display's block, or a held line: its ink stays, on both panes in its unit's shape)
  const mine = m.lines.filter((l) => l[0] === page && !(l[9] & KEPT && onDisplay(displays, l[2], l[6], l[3], l[5])))
  const held = mine.filter((l) => l[9] & KEPT).map(boxOfLine)
  const extra = [
    ...(relabelled && m.label ? [m.label.ink] : []),
    ...(o.lead?.lines[0] ? [inkOfLine(o.lead.lines[0])] : []),
  ]
  const left = widened(mine.map(boxOfLine), extra, page)
  const right = [...(L ? lineBoxes(L, page) : []), ...held]
  const own = new Map<string, Box[]>()
  for (const s of shown) {
    const key = s.kind === 'display' || s.kind === 'piece' ? String(s.k) : s.kind
    own.set(key, [...(own.get(key) ?? []), s.box])
  }
  return left.length || right.length
    ? { left: [left], right: [right], own: [...own] }
    : { left: [], right: [], own: [...own] }
}
