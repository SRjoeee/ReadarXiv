// The right pane's places (docs/PDF-READER.md §11.7): a page box for each of the original's pages, at its size and its zoom,
// so that both panes hold the same pages at the same places (the identity map) whatever each place shows. A place shows the
// best version of its page there is: the layer's content once the layer side has laid it (swap), else the original's page,
// drawn from the left's document by PDF.js's own page view (canvas, text layer, links), else, with no original, the skeleton
// of a page of text. Only the places near the view (one pane's height above and below) hold any of it: a place leaving
// NEAR lets its page view go, canvas and all, and its skeleton; a far place is an empty box of its page's size.
//
// A place is sized as PDF.js sizes the left's page of that number, by the same rule: its width and height are the left
// page box's own style (PDF.js's `round(down, var(--total-scale-factor) * …px, var(--scale-round-x))`), and the stack
// carries the left viewer's --scale-factor. So a zoom of the left resizes the places in the same layout, with nothing
// measured, and a pinch's steps (CSS alone, until PDF.js draws again) move both stacks alike. Nothing here reads the
// layout after writing it: whether a place is near is an IntersectionObserver's answer.
//
// The places borrow the left's document: a page view is made over `doc.getPage(n)` and let go by a reset that releases its
// canvas. What PDF.js keeps of the page since it was drawn (its operator list, its decoded images) is let go with it only
// where the left has not drawn that page: there it is the left's, which its own redraws and the floats read, and its
// viewer lets it go as the page leaves its buffer. A page only the right drew (the right shown alone: the left, hidden,
// draws nothing and lets nothing go) would otherwise be kept for the document's life. PDF.js cleans nothing up while a
// drawing of the page is under way. A page view lives in a holder of its own inside the place, so that the --scale-factor
// PDF.js writes on a standalone page view's container stays off the place.
//
// The pages ahead wait. A place near the view but not in it draws the original's page only once the layer lets the pages ahead
// go (letAheadGo: its first page put in place, a near page shown as arXiv's by the rule, the layer refused or let go), or
// AHEAD_HOLD_MS after the places are made. Its page view is made all the same, and a place that comes into view is drawn at once.
// Without the hold, a page ahead read the original's bytes on the line that page 1's layer was waiting on: on 2610.31506v1 in
// two panes (staging, 2026-10-30), the right's page 3 is near, holds eleven images and reads 5.5 MB to draw. The original was
// read 56 times, 3.6 MB, from the layer's open to page 1 drawn, beside page 1's 3.7 MB of font slices. Only when, never what:
// the page is drawn as before once let go.

import { pageBox } from './drawn.mjs'

/** how far past the view a place is near: one pane's height above and below */
export const NEAR = '100% 0px 100% 0px'
/** the most a place near the view but not in it waits to draw the original's page (ms), from the places' making: the web's
 *  hold of PDF.js's own pages ahead is the same (its run.mjs AHEAD_HOLD_MS). A first open's layer comes long after it, while the
 *  box runs: its pages ahead are drawn then */
export const AHEAD_HOLD_MS = 15_000
/** PDF.js's page view states (pdf_viewer.mjs RenderingStates) */
const INITIAL = 0, FINISHED = 3
/** the style a place copies of the left's page box: what PDF.js sizes a page box by */
const BOX = ['width', 'height']
const VARS = ['--user-unit', '--scale-round-x', '--scale-round-y']

const part = (cls, style = {}) => {
  const e = document.createElement('i')
  if (cls) e.className = cls
  for (const [k, v] of Object.entries(style)) e.style.setProperty(k, v)
  return e
}
/** a paragraph of `n` lines, its last one short by `rest` of the measure */
const lines = (n, rest) => part('axt-sk-lines', { '--axt-sk-n': String(n), '--axt-sk-rest': `${rest}%` })
const head = (width, more = {}) => part('axt-sk-head', { 'inline-size': `${width}%`, ...more })
/** a page's grey text: the first page a title, twelve authors, the abstract's label and its lines, a heading; the others
 *  a heading, paragraphs, every third page a figure. The same for page `n` whenever it is drawn */
function skeleton(n) {
  const sk = document.createElement('div')
  sk.className = 'axt-sk'
  if (n === 1) {
    const authors = document.createElement('div')
    authors.className = 'axt-sk-authors'
    for (let i = 0; i < 12; i++) authors.append(part(''))
    const abstract = document.createElement('div')
    abstract.className = 'axt-sk-abstract'
    abstract.append(lines(13, 54))
    sk.append(part('axt-sk-title'), authors, part('axt-sk-label'), abstract, head(22, { 'margin-block-start': '4.6cqw' }), lines(7, 20))
    return sk
  }
  sk.append(head(24 + ((n * 7) % 18)), lines(9 + (n % 4), 30 + ((n * 13) % 40)), part('axt-sk-gap'))
  if (n % 3 === 0) sk.append(part('axt-sk-figure'))
  sk.append(lines(11 + (n % 3), 22 + ((n * 11) % 45)), part('axt-sk-gap'), head(30 + ((n * 5) % 20)), lines(14, 40), part('axt-sk-gap'), lines(12, 18))
  return sk
}

/**
 * The places in `o.stack` (the right pane's page stack), near-tested against `o.root` (its scroller). `o.kit` the host's
 * PDF.js; `o.original(n)` the left's page view n; `o.scale()` the left's scale; `o.layers()` the page views' layer
 * properties (the right's link service, the document's annotation storage); `o.l10n` PDF.js's translator (the left
 * viewer's: no second one); `o.eventBus` the right's (its page views tell `pagerendered` there); `o.name(n)` a place's name
 * when it shows a page; `o.near(n, on)` a place come near or gone far; `o.clock`, `o.signal`, `o.warn`
 */
/** how long after a keyboard's jump the place jumped to may still take the focus when it comes to show its page: the jump's
 *  scroll brings it near within a frame or two; a place that comes near later is the reader's own scroll */
export const FOCUS_WAIT_MS = 2000
/** how long after a zoom's or a pinch's steps are drawn again the laid pages' text layers stay out of style and layout (ms):
 *  steps a little further apart than their drawing delay (Ctrl+= pressed every 350 to 500 ms, WebKit's presses the slower) find
 *  them still out, so that a run of steps sizes them once, after its last, not once a step */
export const TEXT_BACK_MS = 500
export function createPlaces(o) {
  const { stack, root, kit, clock } = o
  /** each place: its element, its holder, what it shows, whether it is near; and each as a page view is read */
  let list = [], slots = []
  let doc = null, disposed = false, redrawTimer = 0, textTimer = 0
  /** the page views to draw, one at a time (PDF.js's own viewer draws one page at a time) */
  const queue = []
  let drawing = null
  /** whether the places near the view but not in it wait (letAheadGo, or AHEAD_HOLD_MS): held again for each document set
   *  (another paper's layer has its own first page) */
  let held = true
  let aheadTimer = clock.later(() => letAheadGo(), AHEAD_HOLD_MS)
  function holdAhead() {
    clock.clear(aheadTimer)
    held = true
    aheadTimer = clock.later(() => letAheadGo(), AHEAD_HOLD_MS)
  }
  function letAheadGo() {
    if (!held) return
    held = false
    clock.clear(aheadTimer)
    pump()
  }
  const counts = { made: 0, released: 0 }
  /** the place a keyboard's jump gives the focus to once it shows a page (`n`), within FOCUS_WAIT_MS of the jump: a far
   *  place shows nothing until it comes near, and the focus left on the link would fall to the document once that link's
   *  page goes. Given up where the focus moves meanwhile */
  let pending = null
  const giveUp = e => { if (pending && e.target !== list[pending.n - 1]?.div) pending = null }
  document.addEventListener('focusin', giveUp, true)

  /** while a pinch is shown by transform (holdNear): what the near window says of each place, kept to be told at its end */
  let nearHeld = null
  const near = new IntersectionObserver(entries => {
    if (nearHeld) { for (const e of entries) nearHeld.set(e.target, e.isIntersecting); return }
    nearEntries(entries)
  }, { root, rootMargin: NEAR })
  function nearEntries(entries) {
    for (const e of [...entries].sort((a, b) => Number(a.target.dataset.pageNumber) - Number(b.target.dataset.pageNumber))) {
      const p = list[Number(e.target.dataset.pageNumber) - 1]
      if (!p || p.div !== e.target || p.near === e.isIntersecting) continue
      p.near = e.isIntersecting
      if (p.near) show(p); else letGo(p)
      o.near(p.n, p.near)
    }
  }
  /** which places are in the view itself (no margin): while the pages ahead wait, those alone are drawn */
  const inView = new IntersectionObserver(entries => {
    let came = false
    for (const e of entries) {
      const p = list[Number(e.target.dataset.pageNumber) - 1]
      if (!p || p.div !== e.target) continue
      if (e.isIntersecting && !p.inView) came = true
      p.inView = e.isIntersecting
    }
    if (came && held) pump()
  }, { root, rootMargin: '0px' })

  /** a place's page box as the left's page n is sized now */
  function sizeOf(p) {
    const lv = o.original(p.n)
    if (!lv?.div) return
    const from = lv.div.style, to = p.div.style
    for (const k of BOX) if (to[k] !== from[k]) to[k] = from[k]
    for (const v of VARS) {
      const x = from.getPropertyValue(v)
      if (to.getPropertyValue(v) !== x) { if (x) to.setProperty(v, x); else to.removeProperty(v) }
    }
  }
  /** what a place shows before its page is laid: the original's page view (an original open), else the skeleton */
  function show(p) {
    if (p.side || disposed) return
    if (doc) {
      dropSkeleton(p)
      if (!p.view) makeView(p)
    } else {
      releaseView(p)
      if (!p.skeleton) { p.skeleton = skeleton(p.n); p.holder.replaceChildren(p.skeleton) }
    }
    name(p)
  }
  function dropSkeleton(p) { if (p.skeleton) { p.skeleton.remove(); p.skeleton = null } }
  /** a place's page view over the left's document, drawn when its page comes */
  function makeView(p) {
    const { PDFPageView } = kit.viewer, lv = o.original(p.n), mine = doc
    if (!lv?.viewport) return
    const view = new PDFPageView({
      container: p.holder, id: p.n, scale: o.scale(), defaultViewport: lv.viewport, eventBus: o.eventBus,
      textLayerMode: 1, annotationMode: kit.lib?.AnnotationMode?.ENABLE ?? 1, layerProperties: o.layers(), l10n: o.l10n(), abortSignal: o.signal,
    })
    // the place is the page's region, named; PDF.js's own name and landmark on its page go
    view.div.removeAttribute('role')
    view.div.removeAttribute('data-l10n-id')
    view.div.removeAttribute('data-l10n-args')
    p.view = view
    counts.made++
    mine.getPage(p.n).then(page => {
      if (p.view !== view || doc !== mine || disposed) return
      view.setPdfPage(page)
      enqueue(p)
    }, e => o.warn('the original\'s page', e))
  }
  /** a place's page view let go: its drawing cancelled, its canvas released, its element out of the place */
  function releaseView(p) {
    const v = p.view
    if (!v) return
    p.view = null
    const i = queue.indexOf(p)
    if (i >= 0) queue.splice(i, 1)
    v.reset()
    v.div.remove()
    if (o.original(p.n)?.renderingState === INITIAL) v.pdfPage?.cleanup?.()
    counts.released++
  }
  function letGo(p) {
    const focus = focusIn(p)
    releaseView(p)
    dropSkeleton(p)
    name(p)
    keepFocus(p, focus)
  }
  /** where in place p the focus is, before its content goes: the layer's link by its rank, '' for anything else; null where
   *  the focus is not inside it */
  function focusIn(p) {
    const at = document.activeElement
    if (!at || at === document.body || !p.div.contains(at)) return null
    return at.getAttribute?.('data-axt-link') ?? ''
  }
  /** the focus given back after place p's content changed under it: to the link of the same rank in what it shows now, else to
   *  the place where it shows a page (so that Tab goes on from there), else nowhere (the focus has left with the element) */
  function keepFocus(p, focus) {
    if (focus === null || disposed) return
    const to = focus !== '' ? p.holder.querySelector(`a[data-axt-link="${focus}"]`) : null
    if (to) { to.focus({ preventScroll: true }); return }
    if (p.div.getAttribute('aria-hidden') === 'true') return
    focusPlace(p)
  }
  function enqueue(p) {
    if (!queue.includes(p)) queue.push(p)
    pump()
  }
  function pump() {
    if (drawing || disposed) return
    // (while the pages ahead wait, the first place queued that is in the view; the others keep their turn)
    const at = held ? queue.findIndex(q => q.inView) : 0
    if (at < 0 || !queue.length) return
    const p = queue.splice(at, 1)[0]
    if (!p) return
    const v = p.view
    if (!v?.pdfPage || v.renderingState !== INITIAL) return pump()
    drawing = v
    p.drawnAt = v.scale
    v.draw().catch(e => { if (!/cancel/i.test(`${e?.name} ${e?.message}`)) o.warn('the original\'s page drawn', e) }).finally(() => {
      if (drawing === v) drawing = null
      pump()
    })
  }
  /** the focus given to place p, a stop of its own (no tab stop: Tab goes on from there to its links) */
  function focusPlace(p) {
    pending = null
    p.div.tabIndex = -1
    p.div.focus({ preventScroll: true })
  }
  /** a place's name for assistive technology: a page of the right where it shows one, else hidden (a skeleton, nothing) */
  function name(p) {
    if ((p.side && !p.blank) || p.view) {
      p.div.removeAttribute('aria-hidden')
      p.div.setAttribute('role', 'region')
      p.div.setAttribute('aria-label', o.name(p.n))
      if (pending?.n === p.n) { if (clock.now() <= pending.until) focusPlace(p); else pending = null }
    } else {
      p.div.setAttribute('aria-hidden', 'true')
      p.div.removeAttribute('role')
      p.div.removeAttribute('aria-label')
      // (a place the focus was given to, by a link's jump or a content gone under it, is no stop once it shows nothing)
      p.div.removeAttribute('tabindex')
    }
  }
  function remove() {
    for (const p of list) { near.unobserve(p.div); inView.unobserve(p.div); releaseView(p); p.div.remove() }
    list = []
    slots = []
    queue.length = 0
  }
  const views = { get: n => slots[n - 1] ?? null, all: () => slots, count: () => slots.length }

  return {
    /** `count` places, one for each of the original's pages; those already there kept where the count is the same */
    lay(count) {
      if (disposed) return
      if (list.length === count) return
      remove()
      list = Array.from({ length: count }, (_, i) => {
        const div = document.createElement('div')
        div.className = 'page axt-place'
        div.dataset.pageNumber = String(i + 1)
        div.setAttribute('aria-hidden', 'true')
        const holder = document.createElement('div')
        holder.className = 'axt-place-view'
        div.append(holder)
        // drawnAt: the scale its page view was last drawn at
        return { n: i + 1, div, holder, view: null, skeleton: null, side: null, blank: false, near: false, inView: false, drawnAt: 0 }
      })
      // a place as a page view is read: its element, and the left's viewport and page box for its page, as they are now
      slots = list.map(p => ({ id: p.n, div: p.div, get viewport() { return o.original(p.n)?.viewport ?? null }, get pdfPage() { return o.original(p.n)?.pdfPage ?? null } }))
      stack.append(...list.map(p => p.div))
      for (const p of list) { sizeOf(p); near.observe(p.div); inView.observe(p.div) }
    },
    /** every place sized again as the left's page boxes are (the pages laid out, a page's own size, its rounding) */
    size(n) {
      if (n === undefined) for (const p of list) sizeOf(p)
      else if (list[n - 1]) sizeOf(list[n - 1])
    },
    /** the left's scale changed: the stack's --scale-factor, and each page view's scale, by CSS until `drawingDelay` has
     *  passed (a zoom's or a pinch's steps), then drawn again once. While the steps last, and TEXT_BACK_MS after they are
     *  drawn again, the stack is marked scaling (`data-axt-scaling`): the laid pages' text layers are out of style and layout
     *  (engine.css), so that no step makes their spans' sizes again (each a calc of --total-scale-factor), and they are sized
     *  once, after the last step */
    scale(scaleFactor, scale, drawingDelay = -1) {
      if (disposed) return
      if (drawingDelay >= 0) { clock.clear(textTimer); textTimer = 0; stack.setAttribute('data-axt-scaling', '') }
      if (scaleFactor) stack.style.setProperty('--scale-factor', scaleFactor)
      for (const p of list) sizeOf(p)
      const views = list.filter(p => p.view)
      for (const p of views) p.view.update(drawingDelay >= 0 ? { scale, drawingDelay } : { scale })
      clock.clear(redrawTimer)
      const redraw = () => {
        redrawTimer = 0
        // (one reveal at a time: a menu zoom while one waits replaces it, so that the next step's clear reaches the one that waits)
        if (stack.hasAttribute('data-axt-scaling')) {
          clock.clear(textTimer)
          textTimer = clock.later(() => { textTimer = 0; stack.removeAttribute('data-axt-scaling') }, TEXT_BACK_MS)
        }
        for (const p of list) {
          if (!p.view) continue
          // drawn at another scale (a zoom's steps stretch its canvas by CSS): drawn again at its own
          if (p.view.renderingState === FINISHED && p.view.scale !== p.drawnAt) p.view.update({ scale: p.view.scale })
          if (p.view.renderingState === INITIAL && p.view.pdfPage) enqueue(p)
        }
      }
      if (drawingDelay >= 0) redrawTimer = clock.later(redraw, drawingDelay)
      else redraw()
    },
    /** the document the places' page views read: the left's, or null (its page views let go, the skeleton near) */
    setDocument(next) {
      if (disposed) return
      for (const p of list) releaseView(p)
      // (another document: its pages ahead wait for its layer's first page, or the bound, again)
      if (next && next !== doc) holdAhead()
      doc = next
      for (const p of list) if (p.near && !p.side) show(p)
    },
    /** the layer's content in place `n`, in place: its page view destroyed with its canvas first, its skeleton gone, the
     *  content in its holder. The place keeps its size, the pane its scroll. `blank`: content that shows nothing (a page the
     *  layer side let go far from the view, which holds the place so that no page view is made of it): the place is no page
     *  shown, to assistive technology and to contentOf */
    swap(n, content, { blank = false } = {}) {
      const p = list[n - 1]
      if (!p || disposed) return false
      const focus = focusIn(p)
      releaseView(p)
      dropSkeleton(p)
      p.side = content
      p.blank = blank
      p.holder.replaceChildren(content)
      p.div.setAttribute('data-axt-layer', '')
      name(p)
      keepFocus(p, focus)
      return true
    },
    /** place `n` back to its pre-layer content */
    restore(n) {
      const p = list[n - 1]
      if (!p?.side) return
      const focus = focusIn(p)
      p.side.remove()
      p.side = null
      p.blank = false
      p.div.removeAttribute('data-axt-layer')
      if (p.near) show(p); else name(p)
      keepFocus(p, focus)
    },
    /** place n's box in CSS px, as PDF.js sizes the left's page n (its viewport floored to the rounding the place carries,
     *  --scale-round-x and -y); null with no viewport. Nothing of the layout is read */
    box(n) {
      const p = list[n - 1], vp = o.original(n)?.viewport
      if (!p || !vp?.width || !vp.height) return null
      const round = name => Number.parseFloat(p.div.style.getPropertyValue(name)) || 1
      return pageBox(vp, round('--scale-round-x'), round('--scale-round-y'))
    },
    contentOf(n) {
      const p = list[n - 1]
      return !p ? 'none' : p.side ? (p.blank ? 'none' : 'layer') : p.view ? 'original' : p.skeleton ? 'skeleton' : 'none'
    },
    near: n => !!list[n - 1]?.near,
    /** whether place n's page view is the one the places are drawing the original's page on now (one at a time: pump) */
    drawing: n => !!drawing && list[n - 1]?.view === drawing,
    page: n => list[n - 1]?.div ?? null,
    /** the focus given to place n (a keyboard's jump to it): at once where it shows a page, else once it does, within
     *  FOCUS_WAIT_MS */
    focus(n) {
      const p = list[n - 1]
      if (disposed || !p) return
      if (p.div.getAttribute('aria-hidden') !== 'true') { focusPlace(p); return }
      pending = { n, until: clock.now() + FOCUS_WAIT_MS }
    },
    count: () => list.length,
    /** the places near the view but not in it drawn from now on (the layer's first page there, or none to wait for) */
    letAheadGo,
    /** a pinch shown by transform (on) and its end (off): the near window's word on each place held meanwhile — the places it
     *  shows by transform are near-tested where they show, and would be made, laid and drawn at a scale the commit replaces —
     *  and told at the end, as it stands then */
    holdNear(on) {
      if (on) { nearHeld ??= new Map(); return }
      const held = nearHeld
      nearHeld = null
      if (held?.size) nearEntries([...held].map(([target, isIntersecting]) => ({ target, isIntersecting })))
    },
    /** whether they still wait */
    aheadHeld: () => held,
    /** the places as page views are read: place n's element with the left's viewport and page box for page n */
    views: () => views,
    /** the names of the places that show a page, again (the interface's language changed) */
    rename() { for (const p of list) if ((p.side && !p.blank) || p.view) name(p) },
    probe() {
      let views = 0, skeletons = 0, laid = 0, near = 0
      for (const p of list) { if (p.view) views++; if (p.skeleton) skeletons++; if (p.side && !p.blank) laid++; if (p.near) near++ }
      return { places: list.length, pageViews: views, skeletons, laidPlaces: laid, nearPlaces: near, pageViewsMade: counts.made, aheadHeld: held }
    },
    dispose() {
      if (disposed) return
      disposed = true
      pending = null
      document.removeEventListener('focusin', giveUp, true)
      clock.clear(redrawTimer)
      clock.clear(textTimer)
      clock.clear(aheadTimer)
      near.disconnect()
      inView.disconnect()
      remove()
      stack.style.removeProperty('--scale-factor')
      stack.removeAttribute('data-axt-scaling')
      doc = null
    },
  }
}
