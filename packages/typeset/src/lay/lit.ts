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
// A member not laid, and every member of a page that waits, lights from A on both panes: the right mirrors the left.
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

/** a member lit from A on both panes (not laid, or waiting): its lines on the page, its label with the line it stands on */
export function litOfA(m: Placed, page: number): Lit {
  const lines = m.lines.filter((l) => l[0] === page).map(boxOfLine)
  return mirrored(widened(lines, m.label ? [m.label.ink] : [], page))
}

/**
 * A laid member's boxes on page `page`. `L` its layout; `off` its groups turned off on the page (a label drawn anew: 4); `kept`
 * its elements kept where they stand by its reading (U.elements' kept, in place); `lead` the name it is led by, drawn anew with
 * it
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
