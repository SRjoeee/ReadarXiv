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

/**
 * Overlays that outlive PDF.js drawing a page again (the reader's design, §10.2): a page view's reset() removes every
 * node of its page it does not own, before a redraw after a zoom and when the page leaves PDF.js's buffer. An overlay
 * removed so is put back in the same task, before the frame is painted: with its transform (pinned) it is right at the
 * new scale, and nothing is recomputed. Those the reader removes itself go through drop()
 */
export function keepOverlays(selector) {
  const dropped = new WeakSet()
  const observer = new MutationObserver(records => {
    for (const { target, removedNodes } of records) for (const node of removedNodes) {
      if (node.nodeType === 1 && node.matches(selector) && !dropped.has(node) && !node.isConnected) target.append(node)
    }
  })
  return {
    observe: page => observer.observe(page, { childList: true }),
    drop: el => { dropped.add(el); el.remove() },
    disconnect: () => observer.disconnect(),
  }
}
