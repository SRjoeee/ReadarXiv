// lab/typeset/parity/paint.mjs: the highlight's paint as v2's reader paints it (packages/reader compose/highlight.ts rowsOf,
// shapePath), for the measure of what it fills (verdict.mjs). A shape's boxes are not what is shown: an outline joins two rows
// next to each other where they meet across, and paints the room between them, which no box holds (the owner's report of
// 2026-11-09 on 2602.23285v2 p15: one shape over display (11) across the column, where today lights a bar a row). The rule
// that cuts an outline is the reader's own (apartRows), read from it, so that the measure judges what the reader paints.
import { apartRows, columnOf } from '../../../packages/reader/src/compose/highlight.ts'

/** the corners' radius of an outline, PDF units at the parity's drawing scale (highlight.ts RADIUS, 3 CSS px; render.mjs SCALE:
 *  96/72 CSS px a point) */
export const PAINT_RADIUS = (3 * 72) / 96

/**
 * What v2's reader paints of one shape on a pane, as rectangles [x0, y0, x1, y1] (PDF units, y up): its boxes padded `pad`
 * beside and `lead` above and below, from the top, two that overlap made to meet; and for two next to each other that meet
 * across by more than two radii and that no other block stands between in the member's `column` (apartRows over `others`,
 * every box lit on the pane), the room between them, from the upper one's left to the lower one's right (the outline steps
 * at the upper's foot on the right and at the lower's head on the left), marked [x0, y0, x1, y1, 1] where the two rows stand
 * room for a line apart (at least the shorter one's height, the reader's own condition for a block between them: apartRows),
 * else [x0, y0, x1, y1, 0] (the leading between two lines next to each other)
 */
export function paintedShape(boxes, others, pad, lead, column) {
  const sorted = [...boxes].sort((p, q) => q[3] - p[3])
  const apart = column ? apartRows(sorted, others, column) : sorted.map(() => false)
  const rows = sorted.map((b) => [b[0] - pad, b[1] - lead, b[2] + pad, b[3] + lead])
  for (let i = 1; i < rows.length; i++)
    if (rows[i][3] > rows[i - 1][1]) {
      const mid = (rows[i][3] + rows[i - 1][1]) / 2
      rows[i - 1][1] = mid
      rows[i][3] = mid
    }
  const out = rows.map((r) => [...r])
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i - 1],
      q = rows[i]
    if (apart[i] || Math.min(p[2], q[2]) - Math.max(p[0], q[0]) <= 2 * PAINT_RADIUS) continue
    const [a, b] = [sorted[i - 1], sorted[i]]
    const line = a[1] - b[3] >= Math.min(a[3] - a[1], b[3] - b[1]) ? 1 : 0
    if (p[1] > q[3]) out.push([p[0], q[3], q[2], p[1], line])
  }
  return out
}

/**
 * Each shape v2's reader paints of a member's highlight on a pane (Laid.lit): one an entry, as the pointer over that sentence
 * lights it (a member lit whole: its one entry), its displays never with it (`own`: blocks of their own, lit alone); each as
 * paintedShape paints it, in the column the member spans there (columnOf, the reader's). `others`: every box lit on the pane
 * of the page
 */
export const paintedEntries = (lit, side, others, pad, lead) => {
  const column = columnOf(lit?.[side] ?? [], lit?.own ?? [])
  return (lit?.[side] ?? []).map((boxes) => paintedShape(boxes, others, pad, lead, column))
}
/** the column a member spans on a pane (the reader's columnOf over Laid.lit) */
export const litColumn = (lit, side) => columnOf(lit?.[side] ?? [], lit?.own ?? [])
