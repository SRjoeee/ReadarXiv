// Where a kept panel may be and how large it may grow (link previews' kept panel; the owner's approved prototype, eighth pass,
// 2026-11-28: "one right limit on size; its place, its natural behaviour"). Pure: rectangles and scales in, a place or a scale out.
// - ONE rule for its place, whoever moves it (a drag, the arrows, a zoom): whole inside the reader's window, KEEP_EDGE from its
//   sides and foot, under the toolbar (KEEP_TOP). Nothing else moves it.
// - Its size (a scale of the page it is cut from, 1 = 100 %): from the one it opened at (the least) to the smaller of KEPT_MOST
//   and the scale at which it fits that rule's room (the most): its image always whole, nothing scrolling inside it.
// - A gesture meets a slight resistance over the last SOFT (in log scale) before a bound, a quarter of its speed at the bound,
//   and stops there; no bounce. Under reduced motion it simply stops.

/** the arrows' step; under the toolbar (its 44 px and 8); the window's margin, px [approved, P5 app.js:803-814; P8 app.js:1147] */
export const KEEP_STEP = 16
export const KEEP_TOP = 52
export const KEEP_EDGE = 8
/** a kept panel's padding round its image, px (a crop's own, place.ts CROP_PAD) [approved, P8 style.css:226] */
export const PANEL_PAD = 10
/** a kept panel's most: 300 % of the page's own size [approved, P8 app.js:20 ZMAX] */
export const KEPT_MOST = 3
/** a key's step, the panes' own tenth (panes.ts zoomBy's 1.1) [approved, P8 app.js:20 STEP] */
export const KEPT_STEP = 1.1
/** a wheel's gesture has ended after this long with no event; the chip stays this long after a gesture's end; the chip wakes
 *  when the pointer comes this near it; the last stretch before a bound, in log scale; a size within this share of the one it
 *  opened at is the opening size [approved, P8 app.js:27, 1144, 1180] */
export const SETTLE_MS = 150
export const CHIP_AFTER_MS = 1200
export const WAKE_PX = 28
export const SOFT = Math.log(1.15)
export const INERT = 1.004
/** a key's step and the chip's return, ms: the layer's quick tempo and its once-only one [approved, P8 style.css:62] */
export const STEP_MS = 120
export const RESET_MS = 240

export interface Size {
  width: number
  height: number
}

/** THE rule for where a kept panel of `width` x `height` asked to stand at `left`, `top` (the window's px) may stand */
export function placeKept(
  b: { left: number; top: number; width: number; height: number },
  area: Size,
): { left: number; top: number } {
  return {
    left: Math.max(KEEP_EDGE, Math.min(area.width - b.width - KEEP_EDGE, b.left)),
    top: Math.max(KEEP_TOP, Math.min(area.height - b.height - KEEP_EDGE, b.top)),
  }
}

/** a kept panel's most: the smaller of KEPT_MOST and the scale at which its image (`extent` CSS px at scale 1, `segs` segments,
 *  each rounded up to a whole pixel) and its padding fit the rule's room; never less than `s0`, the scale it opened at */
export function mostScale(o: { s0: number; extent: Size; segs: number; area: Size }): number {
  const w = o.area.width - 2 * KEEP_EDGE - 2 * PANEL_PAD - o.segs,
    h = o.area.height - KEEP_TOP - KEEP_EDGE - 2 * PANEL_PAD - o.segs
  const fit = Math.min(w / o.extent.width, h / o.extent.height)
  return Math.max(o.s0, Math.min(KEPT_MOST, fit))
}

/** the scale a gesture's factor `f` takes a panel at `s` to, between `lo` and `hi`: slowed over the last SOFT before a bound */
export function softScale(o: { s: number; f: number; lo: number; hi: number; reduced: boolean }): number {
  const lo = Math.log(o.lo),
    hi = Math.log(o.hi),
    u = Math.log(o.s)
  let d = Math.log(o.f)
  if (!o.reduced) d *= Math.min(1, Math.max(0.25, (d > 0 ? hi - u : u - lo) / SOFT))
  // (a bound itself, not its logarithm's round trip)
  return u + d >= hi ? o.hi : u + d <= lo ? o.lo : Math.exp(u + d)
}

/** where a panel at `left`, `top` stands once its image goes `from` -> `to` about the pointer: the pointer's place in the image
 *  stays under the pointer (before the one rule) */
export function zoomAbout(o: { left: number; top: number; pointer: { x: number; y: number }; from: Size; to: Size }): {
  left: number
  top: number
} {
  const rx = o.pointer.x - (o.left + PANEL_PAD),
    ry = o.pointer.y - (o.top + PANEL_PAD)
  return {
    left: o.pointer.x - PANEL_PAD - rx * (o.to.width / o.from.width),
    top: o.pointer.y - PANEL_PAD - ry * (o.to.height / o.from.height),
  }
}

/** the layer's curve, cubic-bezier(0.2, 0, 0, 1) (styles.ts --axt-pv-ease), for the motions a script drives: y at x */
export function ease(x: number): number {
  const bx = (t: number) => 3 * 0.2 * t * (1 - t) ** 2 + t ** 3,
    by = (t: number) => 3 * t * t * (1 - t) + t ** 3
  let lo = 0,
    hi = 1
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2
    if (bx(m) < x) lo = m
    else hi = m
  }
  return by((lo + hi) / 2)
}
