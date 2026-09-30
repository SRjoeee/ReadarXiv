// The highlight's pointer path (session.mjs): where a pane and its pages are, kept when the layout changes, so that
// finding what is under the pointer is arithmetic; the pointer's moves taken once a frame; a miss held a moment. No
// document of its own: the session hands it its elements and its clock, the tests theirs.

/**
 * Where a pane and its pages are, read where the layout is known clean (the session's ResizeObserver): `container` the
 * pane's scroller, `stack` its page stack, `pages` its page views ({ div }). The pane's content box's top left on the
 * screen, and each page's content box's top left in the pane's scroll coordinates. A page's place in its stack is read
 * against the stack's own box, which cancels a follower's transform (glass) and keeps the fractions offsetTop rounds
 * away: while the stack is transformed it is its pages' offsetParent, and their offsets were a page's margin short
 */
export function measurePane(container, stack, pages) {
  const b = placeOf(container), vb = stack.getBoundingClientRect()
  const tops = new Float64Array(pages.length), lefts = new Float64Array(pages.length)
  pages.forEach((pv, i) => {
    const r = pv.div.getBoundingClientRect()
    tops[i] = r.top - vb.top + stack.offsetTop + pv.div.clientTop
    lefts[i] = r.left - vb.left + stack.offsetLeft + pv.div.clientLeft
  })
  return { left: b.left + container.clientLeft, top: b.top + container.clientTop, tops, lefts }
}

/**
 * An element's border box's top left on the screen as the layout places it, transforms left out. A transform draws a
 * pane elsewhere than its layout for a while — the contents panel moves the document area at once and draws it sliding
 * there by a translation (App.tsx) — and the pane is measured then, its size changed: its box on the screen was the
 * slide's start, 236 px off until something next resized it (the review of B1). The offsets' chain, which transforms do
 * not affect, gives the layout's place to a whole pixel; the box on the screen gives it exactly and is taken when the
 * two agree (no transform in the way). The reader's page does not scroll (its document area is fixed), and the chain
 * takes out the scroll of the boxes in it
 */
function placeOf(el) {
  let x = el.offsetLeft, y = el.offsetTop
  for (let p = el.offsetParent; p; p = p.offsetParent) { x += p.offsetLeft + p.clientLeft - p.scrollLeft; y += p.offsetTop + p.clientTop - p.scrollTop }
  const b = el.getBoundingClientRect()
  return Math.abs(b.left - x) < 1 && Math.abs(b.top - y) < 1 ? b : { left: x, top: y }
}

/**
 * A point of the screen → the page under it and the point in PDF units, from what measurePane kept (`at`), the pane's
 * scroll and each page's viewport (`pages`, PDF.js's page views); null off the pages. Arithmetic alone
 */
export function pointOn(at, pages, scrollX, scrollY, clientX, clientY) {
  if (!at?.tops.length) return null
  const x = clientX - at.left + scrollX, y = clientY - at.top + scrollY
  let lo = 0, hi = at.tops.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (at.tops[mid] <= y) lo = mid; else hi = mid - 1 }
  const vp = pages[lo]?.viewport, px = x - at.lefts[lo], py = y - at.tops[lo]
  if (!vp || px < 0 || py < 0 || px > vp.width || py > vp.height) return null
  const [X, Y] = vp.convertToPdfPoint(px, py)
  return { page: lo + 1, x: X, y: Y, scale: vp.scale }
}

/**
 * The pointer's path: its moves remembered, and in the next animation frame — one per frame, however many moves came —
 * `find(pointer)` asked what is under it (a unit's id, or null) and `light` told; nothing there reads the layout. A
 * pointer over nothing lets go after `hold` ms (the HTML page's MISS_GRACE_MS: crossing the space between two
 * paragraphs does not blink); one over something again before then keeps it lit. `lit()` whether anything is lit;
 * `frame`, `later`, `cancel` the page's requestAnimationFrame, setTimeout and clearTimeout
 */
export function pointerPath({ find, light, lit, hold, frame, later, cancel }) {
  let pointer = null, pending = 0, timer = 0, hit = null
  function step() {
    pending = 0
    if (!pointer) return
    hit = find(pointer)
    if (hit != null) { if (timer) { cancel(timer); timer = 0 } light(hit) } else missed()
  }
  function missed() {
    if (!lit() || timer) return
    timer = later(() => { timer = 0; light(null) }, hold)
  }
  return {
    /** the pointer moved over a pane (`where`), to (x, y) on the screen */
    moved(where, x, y) { pointer = { where, x, y }; if (!pending) pending = frame(step) },
    /** the pointer left a pane */
    left(where) { if (pointer?.where === where) pointer = null; missed() },
    /** what the pointer's last frame found under it, for the probes: a miss is held, so what is lit does not tell */
    get hit() { return hit },
  }
}
