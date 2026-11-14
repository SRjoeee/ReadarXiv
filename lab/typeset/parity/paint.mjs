// lab/typeset/parity/paint.mjs: the highlight's paint as v2's reader paints it (packages/reader compose/highlight.ts rowsOf,
// shapePath), for the measure of what it fills (verdict.mjs). A shape's boxes are not what is shown: an outline joins two rows
// next to each other where they meet across, and paints the room between them, which no box holds (the owner's report of
// 2026-11-09 on 2602.23285v2 p15: one shape over display (11) across the column, where today lights a bar a row). The rows
// are the reader's own (paintRows: the union of the shape's boxes, never part of one, its rule that cuts an outline, apartRows,
// with them), read from it, so that the measure judges what the reader paints; tests/lab/parity-paint.test.ts holds the
// model's region equal to the painter's drawn outlines on shapes of every kind of row (the owner's report of 2026-11-13 on
// 2111.09276v1 p5: the model had copied the painter's meet step, which cut two boxes of one band, and judged that paint).
import { columnOf, paintRows } from '../../../packages/reader/src/compose/highlight.ts'

/** the corners' radius of an outline, PDF units at the parity's drawing scale (highlight.ts RADIUS, 3 CSS px; render.mjs SCALE:
 *  96/72 CSS px a point) */
export const PAINT_RADIUS = (3 * 72) / 96

/**
 * What v2's reader paints of one shape on a pane, as rectangles [x0, y0, x1, y1] (PDF units, y up): its rows (the reader's
 * paintRows: the union of its boxes, padded by `lead` above and below and met where two one over the other share their pads)
 * padded `pad` beside; and for two next to each other that meet across by more than two radii and that no other block stands
 * between in the member's `column` (apartRows over `others`, every box lit on the pane: paintRows' `apart`), the room between
 * them, from the upper one's left to the lower one's right (the outline steps at the upper's foot on the right and at the
 * lower's head on the left), marked [x0, y0, x1, y1, 1] where the two rows stand room for a line apart (at least the shorter
 * one's height, the reader's own condition for a block between them: apartRows), else [x0, y0, x1, y1, 0] (the leading between
 * two lines next to each other)
 */
export function paintedShape(boxes, others, pad, lead, column) {
  const rows = paintRows(boxes, lead, column ? { others, column } : undefined)
  const rects = rows.map(({ box }) => [box[0] - pad, box[1], box[2] + pad, box[3]])
  const out = rects.map((r) => [...r])
  for (let i = 1; i < rows.length; i++) {
    const p = rects[i - 1],
      q = rects[i]
    if (rows[i].apart || Math.min(p[2], q[2]) - Math.max(p[0], q[0]) <= 2 * PAINT_RADIUS) continue
    const [a, b] = [rows[i - 1].own, rows[i].own]
    const line = a[1] - b[3] >= Math.min(a[3] - a[1], b[3] - b[1]) ? 1 : 0
    if (p[1] > q[3]) out.push([p[0], q[3], q[2], p[1], line])
  }
  return out
}

/**
 * Each shape v2's reader paints of a member's highlight on a pane (Laid.lit): one an entry, as the pointer over that sentence
 * lights it (a member lit whole: its one entry), its displays never with it (`own`: blocks of their own, lit alone); each as
 * paintedShape paints it, in the column the member spans there (columnOf, the reader's). `others`: every box lit on the pane
 * of the page; a figure text's (Laid.lit `band`) on its band alone, as the reader paints it
 */
export const paintedEntries = (lit, side, others, pad, lead) => {
  const column = columnOf(lit?.[side] ?? [], lit?.own ?? [])
  // (a figure text on its own lines' band alone, Laid.lit's `band`: neither pad)
  return (lit?.[side] ?? []).map((boxes) => paintedShape(boxes, others, lit?.band ? 0 : pad, lit?.band ? 0 : lead, column))
}
/** the column a member spans on a pane (the reader's columnOf over Laid.lit) */
export const litColumn = (lit, side) => columnOf(lit?.[side] ?? [], lit?.own ?? [])
