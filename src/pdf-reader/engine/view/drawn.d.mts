// drawn.mjs's types: a page's box as PDF.js lays it out
/** a page's box in CSS px as PDF.js lays it out for viewport `vp` (its size floored to the rounding across and down) */
export declare function pageBox(vp: { width: number; height: number; rotation?: number }, roundX?: number, roundY?: number): { width: number; height: number }
