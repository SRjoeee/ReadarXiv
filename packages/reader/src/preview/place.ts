// Where a preview stands (link previews' §3.8; the approved prototype's `place`): under the link's line, above it where there
// is no room below; inside its pane by EDGE_PX; never over the reader's foot (FOOT_PX: the page pills, the way back); its text
// starting where the bracket starts (a card's padding, a crop's CROP_PAD). Pure: the screen's rectangles in, a place out.

/** a preview's timing [approved, P5 app.js:13-14, 665]: the dwell before one shows; within AGAIN_MS of another it shows at once,
 *  with no motion; it leaves LINGER_MS after the pointer left both its link and it */
export const DWELL_MS = 280
export const AGAIN_MS = 400
export const LINGER_MS = 200
/** its geometry [approved, P5 app.js:615, style.css:148]: the bridge from the link into it, its gap from the link, its margin
 *  inside the pane, the reader's foot it stops above */
export const BRIDGE_PX = 10
export const GAP_PX = 6
export const EDGE_PX = 12
export const FOOT_PX = 54
/** the citation card's width and a crop's padding [approved, D §3.2, §3.3] */
export const CARD_W = 416
export const CROP_PAD = 10

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}
export type At = 'below' | 'above'

/** the room under and over a link for a preview: below down to the reader's foot, above up to the pane's head by its margin */
export function roomsOf(anchor: Rect, pane: Rect): { below: number; above: number } {
  return { below: pane.bottom - FOOT_PX - anchor.bottom - GAP_PX, above: anchor.top - pane.top - GAP_PX - EDGE_PX }
}

/**
 * Where a preview of `size` stands for a link whose bracket is `anchor` (its line's foot counted under a superscript) in `pane`:
 * below where it fits there, else above where it fits there, else the side of more room; `keep` the side it stood on (a swap
 * along a bracket, a ride with a scroll) unless that side has no room for it and the other has more. `room`: the height on its
 * side, which a card's scroller gives way to. `inset`: how far its text stands in from its edge (a card's padding-left, a crop's
 * pad), so that its text starts at the bracket's left
 */
export function placeOf(o: {
  anchor: Rect
  pane: Rect
  size: { width: number; height: number }
  inset: number
  keep?: At
}): { left: number; top: number; at: At; room: number } {
  const { anchor, pane, size } = o
  const { below, above } = roomsOf(anchor, pane)
  const h = size.height
  let at: At = o.keep ?? (h <= below ? 'below' : h <= above ? 'above' : below >= above ? 'below' : 'above')
  if (o.keep === 'below' && h > below && above > below) at = 'above'
  if (o.keep === 'above' && h > above && below > above) at = 'below'
  const room = Math.max(0, at === 'below' ? below : above)
  const top = at === 'below' ? anchor.bottom + GAP_PX : anchor.top - GAP_PX - Math.min(h, room)
  const left = Math.max(pane.left + EDGE_PX, Math.min(anchor.left - o.inset, pane.right - EDGE_PX - size.width))
  return { left, top, at, room }
}
