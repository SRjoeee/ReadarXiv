// The reading view both readers run (docs/PDF-READER.md §11.7): arXiv's PDF in the left pane, in PDF.js's own viewer, and
// in the right pane the places — the original's pages again, at its sizes and its zoom (places.mjs) — which show, page by
// page, the best version there is: the layer's drawing once its page is laid (the layer side's, through the view's
// internal handle), else the original's page, else the skeleton. Both panes hold the same pages at the same places, so the
// sync is the identity follower (sync.mjs), the highlight needs no map between two layouts, and a click levels the same
// point of the same page. The right pane opens no document of its own; zooming it zooms the left's viewer, which the
// places follow.
//
// The host gives the panes, PDF.js (its own build: the view imports none), the words, the look and a clock; the original
// comes as an opener the view calls with the getDocument options it owns, and the task it returns is the view's. Display,
// sync, narrow, zoom and pinch are commands; the view writes no preference. What it shows is told as events on one channel.
//
// Lifted from the web reader's session (its viewer half, and the fixes it found: the scroll's end by a timer, a finger held,
// the rest armed again after an input, a glide baked, the pair levelled after a zoom, the zoom's one redraw a burst, the
// right's fit and pinch through the left's viewer); its documents on the right, its swaps and its anchoring are not.
import { pointerPath, measurePane, pointOn } from './pointer.mjs'
import { keepOverlays } from './overlay.mjs'
import { createFollower } from './sync.mjs'
import { createPlaces } from './places.mjs'
import { createLighting } from './lighting.mjs'
import { linkLayer } from './links.mjs'
import { textLayer } from './text-layer.mjs'

const DISPLAYS = ['original', 'bilingual', 'translation']
/** arXiv's margin stamp, which its dvips and Ghostscript PDFs carry as their Info Title: `arXiv:1007.0072v1  [quant-ph]  1 Jul 2010` */
const ARXIV_STAMP = /^arXiv:\S+\s+\[[^\]]+\]\s+\d{1,2}\s+\w{3}\s+\d{4}$/
/** CSS px a PDF unit at scale 1 (PDF.js's PixelsPerInch.PDF_TO_CSS_UNITS) */
const PDF_TO_CSS = 96 / 72
/** CSS px: the widest a page is fitted in a single display (the reader's design, §3) */
const READING_WIDTH = 1060
/** a zoom's or a pinch's step: scaled by CSS at once, drawn this long after the last step (one redraw a burst) */
const STEP_DELAY = 400
/** how long a pointer that lights nothing keeps what is lit (the HTML page's MISS_GRACE_MS) */
const MISS_HOLD = 120
/** the reading line, where on the view the reader is taken to be reading, as a share of its height, until a click moves it */
const READING_LINE = 0.25
/** within this a pane's layout is waited for after a zoom (a pane out of the display is never told) */
const LAID_MS = 100
/** room left above a heading gone to (CSS px) */
const HEADING_ROOM = 28
const GONE = Symbol('superseded')

/** each view's internal handle, for its layer side alone: view.mjs does not export it */
const handles = new WeakMap()
export function internalsOf(view) {
  const h = handles.get(view)
  if (!h) throw new TypeError('not a reading view')
  return h
}

export function createReaderView(host) {
  const kit = host.pdfjs, V = kit.viewer, html = document.documentElement
  const ac = new AbortController(), signal = ac.signal
  let disposed = false
  // ---------------------------------------------------------------- the clock: every frame and timer, ended by dispose
  const base = host.clock ?? {
    now: () => performance.now(), frame: cb => requestAnimationFrame(cb), cancel: id => cancelAnimationFrame(id),
    later: (cb, ms) => setTimeout(cb, ms), clear: id => clearTimeout(id),
  }
  const frames = new Set(), timers = new Set()
  const clock = {
    now: () => base.now(),
    frame(cb) { if (disposed) return 0; const id = base.frame(() => { frames.delete(id); if (!disposed) cb() }); frames.add(id); return id },
    cancel(id) { if (id && frames.delete(id)) base.cancel(id) },
    later(cb, ms) { if (disposed) return 0; const id = base.later(() => { timers.delete(id); if (!disposed) cb() }, ms); timers.add(id); return id },
    clear(id) { if (id && timers.delete(id)) base.clear(id) },
  }
  const warned = new Set()
  const warn = (what, e) => { if (warned.has(what)) return; warned.add(what); console.warn(`[reader] ${what}:`, e?.message ?? e) }
  const observers = new Set()
  const observe = o => { observers.add(o); return o }

  // ---------------------------------------------------------------- what the view holds
  let mode = 'bilingual', narrow = false, syncOn = true, readingLine = READING_LINE
  /** the original shown: its task, its document; `laid` once its pages are laid out and the places made; `kept` the reading
   *  place of the one let go, where the next opens */
  let current = null, laid = false, kept = null
  /** the open under way, superseded by a newer one */
  let opening = null
  /** the commands given while no original is laid out, applied once one is */
  let held = []
  /** a display's layout to come (`due`, with the place it puts the panes at) or under way (`relaying`, to its second frame) */
  let due = false, duePlace = null, relaying = false
  /** the zoom chosen: a fit or a scale from the menu, null after a step or a pinch (the menu's check) */
  let zoomChosen = 'page-width'
  /** the drawingDelay of the scale change under way (a step's or a pinch's), read by the scale's event */
  let stepDelay = -1
  let side = null, units = null
  const counts = { events: 0, tasks: 0, opens: 0, failures: 0, layouts: 0 }
  let lastEvent = null, lastAlign = null
  const released = new WeakSet()
  const listeners = { drawn: new Set(), want: new Set(), near: new Set(), original: new Set(), scale: new Set(), scrolled: new Set() }
  const tell = (set, ...args) => { for (const l of [...set]) l(...args) }
  function emit(event) {
    if (disposed) return
    counts.events++
    lastEvent = event.type
    host.emit(event)
  }

  // ---------------------------------------------------------------- the panes
  const madeStacks = []
  const stackOf = pane => {
    let stack = pane.querySelector(':scope > .pdfViewer')
    if (!stack) { stack = document.createElement('div'); stack.className = 'pdfViewer'; pane.append(stack); madeStacks.push(stack) }
    return stack
  }
  const L = { name: 'left', container: host.panes.left, stack: stackOf(host.panes.left), scrollX: 0, scrollY: 0, at: null }
  const R = { name: 'right', container: host.panes.right, stack: stackOf(host.panes.right), scrollX: 0, scrollY: 0, at: null }
  const sides = [L, R]
  const other = s => (s === L ? R : L)
  L.bus = new V.EventBus()
  // a link out of the paper opens in a new tab: in the reader's frame it would replace the reader
  L.links = new V.PDFLinkService({ eventBus: L.bus, externalLinkTarget: V.LinkTarget.BLANK })
  L.viewer = new V.PDFViewer({ container: L.container, viewer: L.stack, eventBus: L.bus, linkService: L.links, textLayerMode: 1, removePageBorders: false, abortSignal: signal })
  L.links.setViewer(L.viewer)
  L.keeper = keepOverlays('.axt-hl-layer')
  R.bus = new V.EventBus()
  R.links = new V.PDFLinkService({ eventBus: R.bus, externalLinkTarget: V.LinkTarget.BLANK })
  // the places' links jump through the view: the pane clicked is the pane scrolled
  // the places' links jump through the view: the pane clicked is the pane scrolled. Everything PDF.js's link service asks of
  // its viewer (pdf_viewer.mjs PDFLinkService: a destination, a page, the named actions NextPage, PrevPage, FirstPage and
  // LastPage, a SetOCGState action), the right's pages answer; the optional content is the left viewer's, the document's
  R.links.setViewer({
    scrollPageIntoView: o => jump(R, o),
    get currentPageNumber() { return rightPage },
    set currentPageNumber(n) { goToPage('right', Math.min(places.count(), Math.max(1, n))) },
    get pagesCount() { return places.count() },
    nextPage() { if (rightPage >= places.count()) return false; goToPage('right', rightPage + 1); return true },
    previousPage() { if (rightPage <= 1) return false; goToPage('right', rightPage - 1); return true },
    get pagesRotation() { return 0 },
    set pagesRotation(_) {},
    get optionalContentConfigPromise() { return L.viewer.optionalContentConfigPromise },
    set optionalContentConfigPromise(p) { L.viewer.optionalContentConfigPromise = p },
    isInPresentationMode: false, pageLabelToPageNumber: () => null,
  })
  /** a link out of the paper, on either pane (a URL annotation, bound by PDF.js through its link service), goes out
   *  through the host alone: its address kept for its title and a copy, its click the host's */
  for (const links of [L.links, R.links]) {
    const bind = links.addLinkAttributes.bind(links)
    links.addLinkAttributes = (link, url, newWindow) => {
      bind(link, url, newWindow)
      link.addEventListener('click', e => { e.preventDefault(); host.links.openExternal(url) }, { signal })
    }
  }

  const places = createPlaces({
    stack: R.stack, root: R.container, kit, clock, signal, eventBus: R.bus,
    original: n => L.viewer.getPageView(n - 1) ?? null,
    scale: () => L.viewer.currentScale,
    layers: () => ({ annotationEditorUIManager: null, annotationStorage: current?.doc?.annotationStorage ?? null, downloadManager: null, enableScripting: false, fieldObjectsPromise: null, findController: null, hasJSActionsPromise: null, linkService: R.links }),
    l10n: () => L.viewer.l10n,
    name: n => host.words.pageName('right', n),
    near: (n, on) => tell(listeners.near, n, on),
    warn,
  })

  // ---------------------------------------------------------------- geometry
  const pagesOf = s => (s === L ? L.viewer._pages ?? [] : places.views().all())
  const pageView = (s, n) => (s === L ? L.viewer.getPageView(n - 1) ?? null : places.views().get(n))
  const pageCount = s => (s === L ? (laid ? L.viewer.pagesCount : 0) : places.count())
  const pageDiv = (s, n) => (s === L ? L.viewer.getPageView(n - 1)?.div : places.page(n)) ?? null
  /** a page's top in its pane's scroll, whatever the stack's transform: offsetTop counts from the scroller until the
   *  follower's stack carries the compositor's transform, when the stack is the offsetParent and its own place is added */
  function pageTop(s, n) {
    const div = pageDiv(s, n)
    if (!div) return null
    return div.offsetTop + div.clientTop + (div.offsetParent === s.stack ? s.stack.offsetTop + s.stack.clientTop : 0)
  }
  const pageHeight = (s, n) => pageDiv(s, n)?.offsetHeight ?? 0
  /** the page whose box reaches below `y` (scroll coordinates): the one holding it, or the first below it; the last after */
  function pageAt(s, y) {
    const n = pageCount(s)
    if (!n) return 0
    let lo = 1, hi = n
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pageTop(s, mid) + pageHeight(s, mid) > y) hi = mid; else lo = mid + 1 }
    return lo
  }
  /** a rectangle of PDF units → CSS px inside its page's box */
  function box(s, r) {
    const vp = pageView(s, r.page).viewport
    const [ax, ay] = vp.convertToViewportPoint(r.x0, r.y1), [bx, by] = vp.convertToViewportPoint(r.x1, r.y0)
    return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }
  }
  const shown = s => s.container.clientWidth > 0
  const bothShown = () => mode === 'bilingual' && !narrow
  const available = () => !!current && laid && places.count() > 0
  const active = () => syncOn && available() && bothShown()
  /** where the other pane stands level with `from`: the point at the top of `from`'s view, on its page, and the same point
   *  of the same page on the other, at the same height on the screen (the identity map) */
  function levelTo(from) {
    const to = other(from), D = from.container.scrollTop, n = pageAt(from, D)
    if (!n) return null
    const a = pageTop(from, n), b = pageTop(to, n), ha = pageHeight(from, n), hb = pageHeight(to, n)
    if (a == null || b == null || !ha) return null
    return b + (D - a) * (hb / ha) + to.container.getBoundingClientRect().top - from.container.getBoundingClientRect().top
  }
  /** the next moment `el` is laid out: a ResizeObserver's first callback runs after the layout; an element of no size is
   *  never told, and is gone on without within LAID_MS */
  const laidOut = el => new Promise(resolve => {
    const done = () => { seen.disconnect(); observers.delete(seen); clock.clear(late); resolve() }
    const seen = observe(new ResizeObserver(done))
    const late = clock.later(done, LAID_MS)
    seen.observe(el)
  })

  // ---------------------------------------------------------------- the follower
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false }
  /** PDF.js told the left shows `shift()` px below its scrollTop (it finds the pages to draw from a scroller's sizes, and
   *  is lent one that adds the shift); null gives it back its own */
  L.lend = shift => {
    const v = L.viewer
    if (!shift) { delete v._getVisiblePages; return }
    v._getVisiblePages = function () {
      const real = this.container
      this.container = { scrollTop: real.scrollTop + shift(), scrollLeft: real.scrollLeft, clientHeight: real.clientHeight, clientWidth: real.clientWidth }
      try { return Object.getPrototypeOf(this)._getVisiblePages.call(this) } finally { this.container = real }
    }
  }
  L.redraw = () => L.viewer.update()
  // the places are near-tested on their place on the screen, transform and all: nothing to lend; the pill read as it shows
  R.lend = () => {}
  R.redraw = () => tellRightPage()
  const follower = createFollower({
    panes: { left: L, right: R }, active, target: levelTo, clock, laidOut,
    timer: host.scrollEnd === 'timer' || !('onscrollend' in globalThis),
    compositor: typeof globalThis.ScrollTimeline === 'function' ? globalThis.ScrollTimeline : null,
    reduced: () => reduced.matches, window: globalThis, signal,
  })

  // ---------------------------------------------------------------- the highlight and the pointer
  let highlightOn = !!host.prefs.get()?.highlight
  const lighting = createLighting({
    sides, box, on: () => highlightOn, later: cb => clock.later(cb, 0), clear: id => clock.clear(id),
    scaleOf: (s, n) => pageView(s, n)?.viewport?.scale ?? 1,
    layerOf(s, n) {
      const div = s === L ? L.viewer.getPageView(n - 1)?.div : places.page(n)
      if (!div) return null
      let layer = div.querySelector(':scope > .axt-hl-layer')
      if (!layer) { layer = document.createElement('div'); layer.className = 'axt-hl-layer'; div.append(layer) }
      return layer
    },
    pointAt: (s, x, y) => pointOn(s.at, pagesOf(s), s.scrollX, s.scrollY + follower.shift(s), x, y),
    want: (s, page) => tell(listeners.want, s.name, page),
    again: () => pointer.again(),
  })
  const pointer = pointerPath({
    find: ({ where, x, y }) => lighting.find(where, x, y),
    light: t => lighting.light(t), lit: () => lighting.lit() != null, hold: MISS_HOLD,
    frame: cb => clock.frame(cb), later: (cb, ms) => clock.later(cb, ms), cancel: id => clock.clear(id),
  })
  const unsubscribe = host.prefs.subscribe(p => {
    const on = !!p?.highlight
    if (on === highlightOn) return
    highlightOn = on
    // off lights nothing; on again, what a resting pointer is over is looked at again
    if (!on) lighting.light(null); else pointer.again()
  })
  /** where a pane and its pages are on the screen, for the pointer: read where the layout is known clean */
  function measure(s) {
    s.at = measurePane(s.container, s.stack, pagesOf(s))
    s.scrollX = s.container.scrollLeft; s.scrollY = s.container.scrollTop
    pointer.again(s)
  }
  const measuredSide = new WeakMap()
  const measured = observe(new ResizeObserver(entries => { for (const s of new Set(entries.map(e => measuredSide.get(e.target)))) if (s) measure(s) }))
  for (const s of sides) for (const el of [s.container, s.stack]) { measuredSide.set(el, s); measured.observe(el) }
  /** what moves a pane is on <html>: the panes swapped, the contents panel, the display, a narrow window; both panes are
   *  measured in the next frame, and again as a slide of a pane's box ends */
  const remeasure = observe(new MutationObserver(() => clock.frame(() => {
    for (const s of sides) measure(s)
    for (const a of document.getAnimations?.() ?? []) {
      const el = a.effect?.target
      if (el && !a.effect.pseudoElement && sides.some(s => el.contains(s.container))) a.finished.then(() => { if (!disposed) for (const s of sides) measure(s) }, () => {})
    }
  })))
  remeasure.observe(html, { attributeFilter: ['data-axt-swapped', 'data-axt-contents', 'data-axt-pdf-mode', 'data-axt-narrow'] })
  /** the pages named by their pane and number in the interface's language, PDF.js's own name and its translation id taken
   *  off them: as the left's pages are laid out, and again on both panes as <html lang> changes. Attributes written,
   *  nothing of the layout read */
  function nameLeft() {
    for (const pv of L.viewer._pages ?? []) {
      pv.div.removeAttribute('data-l10n-id')
      pv.div.removeAttribute('data-l10n-args')
      pv.div.setAttribute('aria-label', host.words.pageName('left', pv.id))
    }
  }
  observe(new MutationObserver(() => { nameLeft(); places.rename() })).observe(html, { attributes: true, attributeFilter: ['lang'] })

  // ---------------------------------------------------------------- the panes' inputs
  for (const s of sides) {
    const c = s.container, o = { passive: true, signal }
    // the scroll as the pointer's frame reads it, first; what is under a pointer at rest looked at again
    c.addEventListener('scroll', () => {
      s.scrollX = c.scrollLeft; s.scrollY = c.scrollTop
      follower.scrolled(s)
      pointer.again()
      if (s === R) tellRightPage()
      tell(listeners.scrolled, s.name)
    }, o)
    // (a wheel with Ctrl or ⌘ is a zoom, never a scroll: the pinch's step makes its pane the driver, and binds nothing)
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) c.addEventListener(type, e => { if (type !== 'wheel' || !(e.ctrlKey || e.metaKey)) follower.input(s, type) }, o)
    c.addEventListener('pointermove', () => follower.hover(s), o)
    c.addEventListener('scrollend', () => follower.ended(s), o)
    c.addEventListener('mousemove', e => pointer.moved(s, e.clientX, e.clientY), { signal })
    c.addEventListener('mouseleave', () => pointer.left(s), { signal })
    // a click, told apart from a drag that selects text, by the press and its release: PDF.js moves its selection helper
    // under the pointer on the press, and a press whose target moves gets no click event
    let press = null
    c.addEventListener('pointerdown', e => { press = e.button === 0 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null }, o)
    c.addEventListener('pointerup', e => {
      const p = press
      press = null
      if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4 || e.timeStamp - p.t > 600 || !(globalThis.getSelection?.()?.isCollapsed ?? true)) return
      // a link's click is the link's (its jump, its tab), never a levelling as well: on either pane, PDF.js's or the layer's
      if (e.target?.closest?.('a[href]')) return
      alignClick(s, e)
    }, { signal })
  }
  // the fingers on the surface: a finger held is no rest
  for (const type of ['touchstart', 'touchend', 'touchcancel']) globalThis.addEventListener(type, e => follower.touches(e.touches?.length ?? (type === 'touchstart' ? 1 : 0)), { passive: true, capture: true, signal })
  /** a pane at a fit keeps it as its width changes (the contents opening, the window, a narrow window): the right shown
   *  alone through the left's viewer, at the right's size */
  const refit = observe(new ResizeObserver(entries => {
    // (a display's own layout fits the panes itself, and puts them at its place: relayout)
    if (!laid || relaying || typeof zoomChosen !== 'string') return
    for (const { target } of entries) {
      const s = target === L.container ? L : target === R.container ? R : null
      if (!s || !shown(s) || (s === R && shown(L))) continue
      scaled(() => fitShown(zoomChosen))
    }
  }))
  for (const s of sides) refit.observe(s.container)

  // ---------------------------------------------------------------- PDF.js's events
  const on = (bus, name, fn) => bus.on(name, fn, { signal })
  on(L.bus, 'pagesinit', () => {
    if (!current) return
    // the zoom chosen (a scale, or the one a step left), else the fit the display asks, a pane out of the display at 1
    // until the right's fit is taken from its own pane
    if (typeof zoomChosen === 'number') setScale(zoomChosen)
    else if (zoomChosen === null && scaleTold) setScale(scaleTold.scale)
    else setScale(shown(L) ? (zoomChosen === 'page-width' ? fitWidth() : zoomChosen) : 1)
    places.lay(L.viewer.pagesCount)
    places.scale(scaleFactor(), L.viewer.currentScale)
    places.setDocument(current.doc)
    laid = true
    if (!shown(L) && shown(R) && typeof zoomChosen === 'string') fitRight(zoomChosen)
    nameLeft()
    for (const pv of L.viewer._pages ?? []) L.keeper.observe(pv.div)
    // an original shown again (superseding the one shown, or after it was dropped) opens where the reader was; a first one
    // levels the places with it from the start: PDF.js lays its pages out a margin down, with no input
    if (kept) { for (const s of sides) if (shown(s)) putAt(s, kept) }
    else { const level = shown(L) && shown(R) ? levelTo(L) : null; if (level != null) follower.put(R.container, level) }
    kept = null
    for (const s of sides) measure(s)
    follower.invalidate()
    reportSync()
    tellLeftPage()
    tellRightPage()
    const run = held
    held = []
    // a command that throws is said, and neither holds the open nor the commands after it
    for (const f of run) { try { f() } catch (e) { warn('a command given while the original opened', e) } }
    current.inited(true)
  })
  // each page at its own size once every page is known
  on(L.bus, 'pagesloaded', () => { if (laid) places.size() })
  on(L.bus, 'scalechanging', ({ scale }) => {
    follower.invalidate()
    if (laid) places.scale(scaleFactor(), scale, stepDelay)
    tellScale(scale)
    if (laid) tell(listeners.scale, scale, stepDelay)
  })
  on(L.bus, 'pagerendered', ({ pageNumber, error }) => {
    if (!laid) return
    // the page's rounding is set as it is drawn: the place takes it
    places.size(pageNumber)
    lighting.paint(L)
    tell(listeners.drawn, 'left', pageNumber, error ?? null)
  })
  on(L.bus, 'pagechanging', () => tellLeftPage())
  on(R.bus, 'pagerendered', ({ pageNumber, error }) => {
    lighting.paint(R)
    tell(listeners.drawn, 'right', pageNumber, error ?? null)
  })
  const scaleFactor = () => L.stack.style.getPropertyValue('--scale-factor')

  // ---------------------------------------------------------------- what is told
  let leftTold = '', rightTold = '', rightPage = 1, syncTold = null, scaleTold = null
  function tellLeftPage() {
    if (!laid) return
    const key = `${L.viewer.currentPageNumber}/${L.viewer.pagesCount}`
    if (key === leftTold) return
    leftTold = key
    emit({ type: 'page', side: 'left', page: L.viewer.currentPageNumber, pages: L.viewer.pagesCount })
  }
  /** the right's page in view (the first whose box reaches below the top of the view, as PDF.js tells its own), and
   *  whether it shows the layer */
  function tellRightPage() {
    // a pane out of the display has no boxes to read a page of: its page is told once it is shown (relayout)
    if (!places.count() || !shown(R)) return
    const n = pageAt(R, follower.shownAt(R) + 1) || 1, pages = places.count(), isLaid = places.contentOf(n) === 'layer', key = `${n}/${pages}/${isLaid}`
    rightPage = n
    if (key === rightTold) return
    rightTold = key
    emit({ type: 'page', side: 'right', page: n, pages, laid: isLaid })
  }
  function tellScale(scale) {
    if (scaleTold && scaleTold.scale === scale && scaleTold.zoom === zoomChosen) return
    scaleTold = { scale, zoom: zoomChosen }
    emit({ type: 'scale', scale, zoom: zoomChosen })
  }
  function reportSync() {
    const a = available(), now = syncOn && a
    if (syncTold && syncTold.on === now && syncTold.available === a) return
    syncTold = { on: now, available: a }
    emit({ type: 'sync', on: now, available: a })
    follower.reset()
  }
  function showMode() {
    html.setAttribute('data-axt-pdf-mode', mode)
    emit({ type: 'display', display: mode })
  }
  async function reportPaper(doc) {
    const meta = await doc.getMetadata().catch(() => null)
    let title = String(meta?.info?.Title ?? '').trim()
    // (arXiv's margin stamp as the Info Title of a paper it typeset with dvips and Ghostscript: no title of the paper's)
    if (ARXIV_STAMP.test(title)) title = ''
    if (!title && host.titleFallback) title = String((await host.titleFallback().catch(() => '')) ?? '').trim()
    if (current?.doc === doc) emit({ type: 'paper', title })
  }

  // ---------------------------------------------------------------- the original
  const failed = e => { counts.failures++; emit({ type: 'failed', error: String(e?.message ?? e) }); return 'failed' }
  function release(task) {
    if (!task || released.has(task)) return
    released.add(task)
    counts.tasks--
    void Promise.resolve(task.destroy?.()).catch(() => {})
  }
  async function showOriginal(open) {
    if (disposed) return 'failed'
    // a newer call supersedes the one loading, and one whose document is set but whose pages are not laid out yet: its task
    // destroyed, its call 'superseded', no 'opened' told of it (its pages are not on screen yet)
    opening?.supersede()
    if (current && !laid) letGo()
    let task
    try { task = open(Object.freeze({ ...kit.assets })) } catch (e) { if (!current) held = []; return failed(e) }
    if (!task?.promise) { if (!current) held = []; return failed(new Error('the opener gave no loading task')) }
    counts.tasks++
    counts.opens++
    let gone
    const lost = new Promise(resolve => { gone = resolve })
    const mine = { task, supersede() { if (opening === mine) opening = null; release(task); gone(GONE) } }
    opening = mine
    // the paper's PDF coming in, for the host's progress line
    task.onProgress = ({ loaded, total }) => { if (opening === mine) emit({ type: 'loading', loaded, total }) }
    const wait = p => Promise.race([Promise.resolve(p).then(v => ({ v }), e => ({ e })), lost])
    // the document, and its first page, which the viewer lays its pages out by: a document whose first page cannot be
    // read is a failed open
    const got = await wait(task.promise)
    if (got === GONE) return 'superseded'
    const first = got.e ? got : await wait(got.v.getPage(1))
    if (first === GONE) return 'superseded'
    opening = null
    // a failed open with no original shown lets go of the commands held for it: a retry starts afresh
    if (first.e) { release(task); if (!current) held = []; return failed(first.e) }
    const doc = got.v
    // the original shown before let go: its places' page views first, the viewer emptied, then its task
    if (current) letGo()
    let inited
    const ready = new Promise(resolve => { inited = resolve })
    current = { task, doc, inited }
    L.viewer.setDocument(doc)
    L.links.setDocument(doc)
    R.links.setDocument(doc)
    // its pages laid out (pagesinit): the places made, the commands held applied; or let go before
    if (!(await ready)) return 'superseded'
    emit({ type: 'opened', pages: doc.numPages })
    tell(listeners.original, 'opened', doc)
    void reportPaper(doc)
    return 'opened'
  }
  /** the original shown let go: the places' page views over it first, then the viewer emptied, then its task; the places
   *  keep their sizes and show the skeleton */
  function letGo() {
    const was = current
    // what is lit on its pages goes with them: the painted elements would hold the pages let go
    lighting.light(null)
    // where the reader was, for the original shown next
    if (laid) kept = readingPlace(readSide())
    current = null
    laid = false
    places.setDocument(null)
    L.viewer.setDocument(null)
    L.links.setDocument(null)
    R.links.setDocument(null)
    release(was.task)
    was.inited(false)
    leftTold = ''
    follower.invalidate()
    reportSync()
    tell(listeners.original, 'dropped', null)
  }
  function dropOriginal(task) {
    if (disposed || !current || current.task !== task) return false
    letGo()
    emit({ type: 'dropped' })
    return true
  }

  // ---------------------------------------------------------------- zoom and fit
  const setScale = v => { L.viewer.currentScaleValue = typeof v === 'number' ? String(v) : v }
  /** the first page's width and height in CSS px at scale 1, as it shows: its viewport's, which carries its rotation and
   *  its user unit (its box, pdfPage.view, carries neither), as PDF.js's own fits take them */
  function pageSize() {
    const vp = L.viewer.getPageView(0)?.viewport
    return vp?.scale ? { w: (vp.width / vp.scale) * PDF_TO_CSS, h: (vp.height / vp.scale) * PDF_TO_CSS } : null
  }
  /** the left's fit to its pane's width, never beyond a reading width while it is shown alone */
  function fitWidth() {
    const size = pageSize()
    if (!size || bothShown()) return 'page-width'
    return L.container.clientWidth - 40 > READING_WIDTH ? READING_WIDTH / size.w : 'page-width'
  }
  /** the right shown alone: the left's viewer, whose zoom the places follow, fitted to the right pane rather than to its
   *  own, which is hidden (PDF.js's own fits, over the right pane's size: its width less its padding, the height too for
   *  page-fit; the width kept to a reading width as a single display's is). Read, then written */
  function fitRight(fit) {
    const size = pageSize(), c = R.container
    if (!size || !c.clientWidth) return
    const byWidth = (c.clientWidth - 40) / size.w
    const scale = fit === 'page-width' ? (c.clientWidth - 40 > READING_WIDTH ? READING_WIDTH / size.w : byWidth)
      : fit === 'page-fit' ? Math.min(byWidth, (c.clientHeight - 5) / size.h) : fit === 'page-actual' ? 1 : null
    if (scale === null || !(scale > 0)) return
    setScale(scale)
  }
  /** a fit of the pane shown: the left's own, or the right's through the left's viewer */
  function fitShown(fit) {
    if (shown(L)) setScale(fit === 'page-width' ? fitWidth() : fit)
    else if (shown(R)) fitRight(fit)
  }
  /** the pane the reader reads: the driver where it is shown, else the left where it is, else the right */
  const readSide = () => { const d = follower.driver(); return d && shown(d) ? d : shown(L) ? L : R }
  /** where the reader is on a pane, in terms that outlast its layout: the page at the reading line and how far down it,
   *  and the place in the whole document where no page is there. Read while the pane is shown */
  function readingPlace(s) {
    const c = s.container, place = { doc: c.scrollTop / Math.max(1, c.scrollHeight - c.clientHeight), page: 0, at: 0 }
    if (!shown(s) || !pageCount(s)) return place
    const y = c.scrollTop + c.clientHeight * readingLine, n = pageAt(s, y), top = pageTop(s, n), h = pageHeight(s, n)
    return top == null || !h ? place : { ...place, page: n, at: (y - top) / h }
  }
  function putAt(s, place) {
    const c = s.container
    if (place.page) {
      const top = pageTop(s, place.page), h = pageHeight(s, place.page)
      if (top != null && h) return follower.put(c, top + place.at * h - c.clientHeight * readingLine)
    }
    follower.put(c, place.doc * (c.scrollHeight - c.clientHeight))
  }
  /** where each shown pane is to be put after a change of its layout: scrolling together, at the place read on the pane
   *  read (the pair is level); apart, each at its own (the pane the reader is not reading does not move); a pane coming
   *  into view, at the place read. Read before the change */
  function placesNow() {
    if (!laid) return null
    const read = readingPlace(readSide()), together = active(), own = new Map()
    if (!together) for (const s of sides) if (shown(s)) own.set(s, readingPlace(s))
    return { read, own }
  }
  function putAll(at) {
    if (!at || !laid) return
    follower.invalidate()
    for (const s of sides) if (shown(s)) putAt(s, at.own.get(s) ?? at.read)
  }
  /** a change of scale with the reading places kept (placesNow): read before, the panes put back after */
  function scaled(change) {
    const at = placesNow()
    change()
    putAll(at)
  }
  function zoomTo(z) {
    if (disposed) return
    if (!laid) { held.push(() => zoomTo(z)); return }
    zoomChosen = z
    scaled(() => (typeof z === 'string' ? fitShown(z) : setScale(z)))
    tellScale(L.viewer.currentScale)
    follower.zoomed()
  }
  function zoomBy(factor) {
    if (disposed) return
    if (!laid) { held.push(() => zoomBy(factor)); return }
    zoomChosen = null
    const cur = L.viewer.currentScale, next = Math.min(4, Math.max(0.25, cur * factor))
    scaled(() => {
      if (next === cur) return
      stepDelay = STEP_DELAY
      try { L.viewer.updateScale({ scaleFactor: next / cur, drawingDelay: STEP_DELAY }) } finally { stepDelay = -1 }
    })
    tellScale(L.viewer.currentScale)
    follower.zoomed()
  }
  /** the part of a pinch's factor PDF.js has not applied yet, and the scale its last step left: PDF.js rounds each scale to
   *  a hundredth, and a step under half of one was lost (at 26 %, any step under 1.9 %: a slow pinch there zoomed not at
   *  all, a quick one by lumps). Carried to the next step while the scale is the one the last step left and the gesture
   *  keeps its direction, as PDF.js's own viewer carries it (its app's _accumulateFactor) */
  let pinchRest = 1, pinchScale = 0, pinchWay = 0
  /**
   * A pinch over a pane: the left's viewer scaled, the places with it, and each pane shown scrolled in the same task so that
   * the point under the gesture stays under it — on the other pane, the point at the same place in its view, which the
   * identity map makes the same point of the same page while the pair is level: the pair stays level through the gesture,
   * and its rest finds nothing to level. Each point is kept wherever it lies, on a page, between two or beside one (a
   * point the pages did not hold had kept nothing: the pane stood still while its pages grew or shrank about its top, and
   * the pair drifted pages apart). Each pane's point is read on the page box it is level with, then the scale written, then
   * that box read again and the scroll written; the follower is told first, so that nothing it moves or binds is under way
   */
  function pinch(which, factor, origin) {
    if (disposed || !laid) return
    const s = which === 'left' ? L : R
    if (!shown(s) || !(factor > 0)) return
    const cur = L.viewer.currentScale
    const way = Math.sign(factor - 1)
    if (cur !== pinchScale || way !== pinchWay) pinchRest = 1
    pinchWay = way
    // the scale PDF.js sets (its rounding, its range: pdf_viewer.mjs updateScale)
    const want = factor * pinchRest, next = Math.min(25, Math.max(0.1, Math.round(cur * want * 100) / 100))
    pinchRest = (want * cur) / next
    pinchScale = cur
    // (a step PDF.js would round to no change waits in the rest; the zoom is a pinch's all the same, as the menu shows it)
    if (next === cur) { zoomChosen = null; tellScale(cur); return }
    follower.zooming(s)
    const b = s.container.getBoundingClientRect(), x = origin[0] - b.left - s.container.clientLeft, y = origin[1] - b.top - s.container.clientTop
    const kept = []
    for (const t of sides) {
      const a = shown(t) && anchorOf(t, Math.min(t.container.clientWidth, Math.max(0, x)), Math.min(t.container.clientHeight, Math.max(0, y)))
      if (a) kept.push(a)
    }
    zoomChosen = null
    stepDelay = STEP_DELAY
    try { L.viewer.updateScale({ scaleFactor: next / cur, drawingDelay: STEP_DELAY }) } finally { stepDelay = -1 }
    pinchScale = L.viewer.currentScale
    for (const a of kept) keepAnchor(a)
    tellScale(L.viewer.currentScale)
    follower.zoomed()
  }
  /** a page box of a pane in its scroll's coordinates, to the fraction of a pixel (offsetTop rounds to one); read where no
   *  transform moves the stack */
  function boxIn(t, n) {
    const div = pageDiv(t, n)
    if (!div) return null
    const c = t.container, r = div.getBoundingClientRect(), p = c.getBoundingClientRect()
    return { top: r.top - p.top - c.clientTop + c.scrollTop, left: r.left - p.left - c.clientLeft + c.scrollLeft, width: r.width, height: r.height }
  }
  /** what a zoom keeps of a pane: the point at (x, y) of its view (px from its top left), on the page box it is level with
   *  (the one holding it, or the first below it; the last past the end) — as a share of the box's height inside it, as px
   *  from the box's edge above or below it (the gap between two pages, the margin past the last: neither scales), and as
   *  a share of its width across. Null with no page laid out */
  function anchorOf(t, x, y) {
    const c = t.container, Y = c.scrollTop + y, n = pageAt(t, Y), box = n ? boxIn(t, n) : null
    if (!box?.height || !box.width) return null
    const v = Y < box.top ? { edge: 0, px: Y - box.top } : Y > box.top + box.height ? { edge: 1, px: Y - box.top - box.height } : { share: (Y - box.top) / box.height }
    return { t, n, x, y, v, across: (c.scrollLeft + x - box.left) / box.width }
  }
  /** a pane put so that the point an anchor read stands at the same place of its view: its page box read at the new scale */
  function keepAnchor(a) {
    const box = boxIn(a.t, a.n)
    if (!box?.height) return
    const Y = a.v.share === undefined ? box.top + a.v.edge * box.height + a.v.px : box.top + a.v.share * box.height
    a.t.container.scrollLeft = box.left + a.across * box.width - a.x
    follower.put(a.t.container, Y - a.y)
  }

  // ---------------------------------------------------------------- displays
  /** the display changed, or a narrow window: the panes shown fitted to their width in the next frame, then put at the
   *  places read before the change (placesNow: the place read on the pane read, or each pane's own where they scroll
   *  apart). A change made before that frame joins it, the first change's places kept: they were read where the layout
   *  was the reader's */
  function relayout(place) {
    if (due) return
    due = true
    duePlace = place
    relaying = true
    follower.bake()
    clock.frame(() => {
      const at = duePlace
      due = false
      duePlace = null
      if (!laid) { relaying = false; return }
      counts.layouts++
      zoomChosen = 'page-width'
      fitShown('page-width')
      clock.frame(() => {
        relaying = false
        putAll(at)
        // a pane brought into the display with its scroll as it was sends no scroll: its page told here
        tellRightPage()
      })
    })
  }
  const placeNow = () => (due ? null : placesNow())
  function setDisplay(d) {
    if (disposed || !DISPLAYS.includes(d) || d === mode) return
    const place = placeNow()
    mode = d
    showMode()
    relayout(place)
  }
  function setNarrow(onNow, o = {}) {
    if (disposed) return
    const next = o.display && DISPLAYS.includes(o.display) ? o.display : mode
    if (narrow === onNow && next === mode) return
    const place = placeNow()
    narrow = onNow
    html.toggleAttribute('data-axt-narrow', onNow)
    if (next !== mode) { mode = next; showMode() }
    relayout(place)
  }
  function setSync(onNow) {
    if (disposed) return
    syncOn = !!onNow
    reportSync()
  }

  // ---------------------------------------------------------------- going places
  /** a link's or a command's jump in a pane: the left by PDF.js's own; the right's places as PDF.js takes a destination on
   *  its own pages (pdf_viewer.mjs scrollPageIntoView): its zoom first — XYZ's own, Fit and FitB the page's fit, FitH and
   *  FitBH the page's width, FitV and FitBV the page's height, FitR the rectangle, both fitted to the right pane — through
   *  the left's viewer, which the places follow, then the point it names at the pane's top left. The pane jumped is the
   *  driver, so that the other follows, and is levelled once a zoom settles */
  function jump(s, { pageNumber: n, destArray }) {
    if (disposed || !laid) return
    follower.take(s)
    if (s === L) { L.viewer.scrollPageIntoView({ pageNumber: n, destArray }); return }
    const vp0 = pageView(R, n)?.viewport, c = R.container
    if (!vp0) return
    const kind = Array.isArray(destArray) ? destArray[1]?.name : null
    // the page's height as it shows, in CSS px at scale 1 (its rotation and user unit in it)
    const h = (vp0.height / vp0.scale) * PDF_TO_CSS
    let zoom = null, x = null, y = null
    if (kind === 'XYZ') { x = destArray[2]; y = destArray[3]; if (destArray[4] > 0) zoom = destArray[4] }
    else if (kind === 'Fit' || kind === 'FitB') zoom = 'page-fit'
    else if (kind === 'FitH' || kind === 'FitBH') { zoom = 'page-width'; if (typeof destArray[2] === 'number' && destArray[2] >= 0) y = destArray[2] }
    else if (kind === 'FitV' || kind === 'FitBV') { x = destArray[2]; zoom = (c.clientHeight - 5) / h }
    else if (kind === 'FitR') {
      x = destArray[2]; y = destArray[5]
      zoom = Math.min(Math.abs((c.clientWidth - 40) / (destArray[4] - destArray[2])), Math.abs((c.clientHeight - 5) / (destArray[5] - destArray[3]))) / PDF_TO_CSS
    }
    if (zoom !== null && (typeof zoom === 'string' || (zoom > 0 && Number.isFinite(zoom) && zoom !== L.viewer.currentScale))) {
      // a fit is the menu's; XYZ's scale too; a height's or a rectangle's is none of its choices
      zoomChosen = typeof zoom === 'string' || kind === 'XYZ' ? zoom : null
      if (typeof zoom === 'string') fitShown(zoom); else setScale(zoom)
      tellScale(L.viewer.currentScale)
      follower.zoomed()
    }
    const top = pageTop(R, n), vp = pageView(R, n)?.viewport
    if (top == null || !vp) return
    if (typeof x === 'number') {
      const div = pageDiv(R, n)
      c.scrollLeft = (div?.offsetLeft ?? 0) + (div?.clientLeft ?? 0) + Math.max(0, vp.convertToViewportPoint(x, 0)[0])
    }
    c.scrollTop = top + (typeof y === 'number' ? Math.max(0, vp.convertToViewportPoint(0, y)[1]) : 0)
  }
  /** a link of the layer's inside the paper, followed: its destination resolved on the left's document (a name by
   *  getDestination, its page by getPageIndex, or a page's index), then jumped to on the right, the pane it was on (the other
   *  follows where the sync is on, and stays where it is off). Followed by the keyboard (Enter, or an assistive technology's
   *  activation), the focus goes to the place jumped to, so that reading, and Tab, go on from there */
  async function follow(dest, how = {}) {
    const doc = current?.doc
    if (disposed || !doc || !laid) return
    try {
      const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
      if (!Array.isArray(explicit) || !explicit.length) return
      const ref = explicit[0]
      const n = ref && typeof ref === 'object' ? (await doc.getPageIndex(ref)) + 1 : Number.isInteger(ref) ? ref + 1 : null
      if (disposed || current?.doc !== doc || !laid || !Number.isInteger(n) || n < 1 || n > places.count()) return
      jump(R, { pageNumber: n, destArray: explicit })
      // (a far place shows its page only once the jump has brought it near: the focus waits for it)
      if (how.keyboard) places.focus(n)
    } catch (e) { warn('a link\'s destination', e) }
  }
  function goToPage(which, n) {
    if (disposed) return
    if (!laid) { held.push(() => goToPage(which, n)); return }
    const s = which === 'left' ? L : R
    // a page asked is the reader's input on the pane it scrolls: that pane leads, and the other follows the jump
    follower.take(s)
    if (s === L) L.viewer.currentPageNumber = n
    else { const top = pageTop(R, n); if (top != null) R.container.scrollTop = top }
  }
  /** a heading from the contents: the unit's first rectangle on the pane read, a line of room above it, as a scroll of its
   *  own that the other follows (both panes put there where the sync is off); a heading not located, the page the contents
   *  give it; with neither, nothing */
  function goToUnit(id) {
    if (disposed) return
    if (!laid) { held.push(() => goToUnit(id)); return }
    const s = readSide(), r = units?.firstRect(id)
    if (!r) { const p = units?.pageOf(id); if (p) goToPage(s.name, p); return }
    const top = pageTop(s, r.page), vp = pageView(s, r.page)?.viewport
    if (top == null || !vp) return
    const y = top + Math.min(vp.convertToViewportPoint(r.x0, r.y1)[1], vp.convertToViewportPoint(r.x1, r.y0)[1]) - HEADING_ROOM
    follower.take(s)
    s.container.scrollTop = y
    if (!active() && shown(other(s))) follower.put(other(s).container, y)
  }
  function lead(which) { if (!disposed) follower.take(which === 'left' ? L : R) }
  /** a click levels what was clicked at the height it stands on the screen: the same point of the same page on the other
   *  pane, the reading line moved to the click's height. Not with one pane shown, nor with no original */
  function alignClick(from, e) {
    if (!bothShown() || !available()) return
    const div = e.target?.closest?.('.page'), n = Number(div?.dataset.pageNumber)
    if (!n) return
    follower.bake()
    const to = other(from), c = from.container, y = e.clientY - c.getBoundingClientRect().top, Y = y + c.scrollTop
    const a = pageTop(from, n), b = pageTop(to, n), ha = pageHeight(from, n), hb = pageHeight(to, n)
    if (a == null || b == null || !ha) return
    readingLine = Math.min(0.95, Math.max(0.05, follower.level(from, y, b + (Y - a) * (hb / ha))))
    lastAlign = 'same point'
  }

  // ---------------------------------------------------------------- the handle and the view
  const view = {
    showOriginal,
    dropOriginal,
    originalData: () => (current?.doc ? current.doc.getData() : null),
    originalLoaded: () => (current?.doc ? current.doc.getDownloadInfo().then(() => {}) : null),
    setDisplay,
    setSync,
    setNarrow,
    zoomTo,
    zoomBy,
    pinch,
    goToPage,
    goToUnit,
    lead,
    probe() {
      const d = follower.driver(), lit = lighting.lit()
      return {
        original: current ? (laid ? 'open' : 'laying') : opening ? 'loading' : 'none',
        pages: laid ? L.viewer.pagesCount : 0,
        ...places.probe(),
        display: mode, narrow, sync: syncOn, available: available(),
        driver: d === L ? 'left' : d === R ? 'right' : null, compositing: follower.compositing(), motion: follower.motion(),
        levelError: available() && bothShown() ? follower.levelError(d ?? L) : null,
        scale: L.viewer.currentScale, zoom: zoomChosen,
        lit: lit?.id ?? null, litSentence: lit?.s ?? null, readingLine, lastAlign,
        layouts: counts.layouts, tasks: counts.tasks, opens: counts.opens, failures: counts.failures, events: counts.events, lastEvent,
      }
    },
    dispose() {
      if (disposed) return
      // its layer side first: it returns the places to their pre-layer content and lets its documents go
      const s = side
      side = null
      try { s?.dispose() } catch (e) { warn('the layer side\'s dispose', e) }
      disposed = true
      opening?.supersede()
      follower.stop()
      lighting.dispose()
      if (current) {
        const was = current
        current = null
        laid = false
        places.setDocument(null)
        L.viewer.setDocument(null)
        L.links.setDocument(null)
        R.links.setDocument(null)
        release(was.task)
        was.inited(false)
      }
      places.dispose()
      ac.abort()
      for (const o of observers) o.disconnect()
      observers.clear()
      L.keeper.disconnect()
      unsubscribe()
      for (const id of frames) base.cancel(id)
      for (const id of timers) base.clear(id)
      frames.clear(); timers.clear()
      for (const set of Object.values(listeners)) set.clear()
      html.removeAttribute('data-axt-pdf-mode')
      html.removeAttribute('data-axt-narrow')
      for (const stack of madeStacks) stack.remove()
    },
  }
  handles.set(view, {
    pane: R.container,
    places: {
      count: () => places.count(), page: n => places.page(n), view: n => places.views().get(n), near: n => places.near(n),
      contentOf: n => places.contentOf(n),
      box: n => places.box(n),
      swap(n, content, o) { const ok = places.swap(n, content, o); if (ok) tellRightPage(); return ok },
      restore(n) { places.restore(n); tellRightPage() },
      letAheadGo: () => places.letAheadGo(),
      aheadHeld: () => places.aheadHeld(),
    },
    left: {
      doc: () => current?.doc ?? null, scale: () => L.viewer.currentScale,
      pdfPage: n => (laid ? L.viewer.getPageView(n - 1)?.pdfPage ?? null : null),
      // (whether page n of the left is being drawn: PDF.js's page view running or paused, RenderingStates 1 and 2)
      drawing: n => (laid ? [1, 2].includes(L.viewer.getPageView(n - 1)?.renderingState) : false),
    },
    lib: kit.lib,
    assets: kit.assets,
    /** where the reader is reading: the page at the reading line of the pane read, and the line's height there (PDF units,
     *  y up); null with no original laid out */
    reading() {
      if (!laid) return null
      const s = readSide(), place = readingPlace(s)
      if (!place.page) return null
      const vp = pageView(s, place.page)?.viewport
      return { page: place.page, y: vp ? vp.convertToPdfPoint(0, place.at * vp.height)[1] : null }
    },
    /** the right's page at the middle of its view, the one the reader is looking at there (0 with no places, or the pane
     *  out of the display): read where the layout is clean, as the pane's own page is */
    centre() {
      if (!places.count() || !shown(R)) return 0
      return pageAt(R, follower.shownAt(R) + R.container.clientHeight / 2)
    },
    words: host.words,
    dpr: () => globalThis.devicePixelRatio || 1,
    clock,
    setShapes: (s, shapes, starts = null) => lighting.setShapes(s === 'left' ? L : R, shapes, starts),
    setUnits(u) { units = u },
    onPageDrawn: l => { listeners.drawn.add(l); return () => listeners.drawn.delete(l) },
    onWant: l => { listeners.want.add(l); return () => listeners.want.delete(l) },
    onNear: l => { listeners.near.add(l); return () => listeners.near.delete(l) },
    onOriginal: l => { listeners.original.add(l); return () => listeners.original.delete(l) },
    onScale: l => { listeners.scale.add(l); return () => listeners.scale.delete(l) },
    onScrolled: l => { listeners.scrolled.add(l); return () => listeners.scrolled.delete(l) },
    attach(s) {
      if (disposed) throw new Error('the reading view is disposed')
      if (side) throw new Error('the reading view has a layer side already')
      side = s
      return () => { if (side === s) side = null }
    },
    emit,
    links: (n, records) => linkLayer(records, { viewport: places.views().get(n)?.viewport ?? null, follow, open: url => host.links.openExternal(url), words: host.words }),
    text: (n, data, lang) => textLayer(data, { viewport: places.views().get(n)?.viewport ?? null, Builder: V?.TextLayerBuilder ?? null, lang }),
    light: (id, s = -1) => lighting.light(id == null ? null : { id, s }),
  })
  showMode()
  reportSync()
  return view
}
