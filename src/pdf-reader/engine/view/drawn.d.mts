// drawn.mjs's types: the scale a page's canvas was drawn at, kept with the canvas
/** a page view as PDF.js holds one: its canvas, its viewport, its output scale and its rendering state (3: finished) */
export interface DrawnPageView {
  canvas?: HTMLCanvasElement | null
  viewport?: { scale: number; width: number; height: number } | null
  outputScale?: { sx: number; sy: number } | null
  renderingState?: number
}
/** PDF.js has told that page view `pv` drew its canvas whole: the scale it drew it at kept with that canvas */
export declare function drawn(pv: DrawnPageView | null | undefined): void
/** a page's box in CSS px as PDF.js lays it out for viewport `vp` (its size floored to the rounding across and down) */
export declare function pageBox(vp: { width: number; height: number; rotation?: number }, roundX?: number, roundY?: number): { width: number; height: number }
/** a canvas drawn at `k` device pixels a PDF unit across and down */
export declare function drew(canvas: HTMLCanvasElement, k: number): void
/** the device pixels a PDF unit `canvas` was drawn at (the same across and down, the canvas as it was drawn); null else */
export declare function scaleOf(canvas: HTMLCanvasElement | null | undefined): number | null
/** page view `pv`'s canvas drawn whole by PDF.js, with the device pixels a PDF unit it drew it at; null else, and where its
 *  scale across and down differ (a pixel ratio PDF.js approximates, such as 1.1 or 1.8; its restricted scaling) */
export declare function drawnCanvas(pv: DrawnPageView | null | undefined): { canvas: HTMLCanvasElement; k: number } | null
