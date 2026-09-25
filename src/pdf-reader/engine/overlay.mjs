// The engine's overlays on PDF.js's pages — the highlight's bands, the figures' text — kept in place through a zoom
// (the reader's design, §10.1–§10.2)

/**
 * An overlay's box in its page's CSS pixels at the viewport scale it was drawn at, `s0`, scaled with the page about the
 * page's origin by PDF.js's --total-scale-factor. While a pinch lasts PDF.js scales the page by CSS alone, and the
 * overlay follows on the compositor, with no layout and no script. Measured: within 0.7 px mid-pinch, at no cost over
 * pixels; percent of the page box cost the whole page's layout on every frame (REPORT, nineteenth addendum)
 */
export function pinned({ left, top, width, height }, s0) {
  return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, transformOrigin: `${-left}px ${-top}px`, scale: `calc(var(--total-scale-factor) / ${s0})` }
}
