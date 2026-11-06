// The two panes (design §4.5; docs/PDF-READER.md §11.7): arXiv's PDF in the left, the right a page stack of the same pages at
// the same sizes and scale, each page the best version of it there is (composing's: compose/). Both panes hold the same pages at
// the same places, so the sync is the identity follower, the highlight needs no map, and a click levels the same point of the
// same page. Carried from today's reading view (src/pdf-reader/engine/view/reader-view.mjs at baf2083e0: its geometry, follower,
// inputs, zoom, fits, pinch, displays and jumps, each with the fix it found), with its places replaced by the stack, its marks
// on the reader's root instead of <html>, its timers on the reader's clock, and its moments told as events.
//
// One scale: the left's viewer holds it while the left is PDF.js's viewer (its fits are its own), and the right's stack is set
// to it as it changes (`scalechanging`, a zoom's step delay with it), as the places followed it.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { Kit } from '../pdfjs/kit.ts'
import type { OwnedClock } from '../stack/clock.ts'
import type { Scheduler } from '../stack/scheduler.ts'
import { createStack, PDF_TO_CSS, roundingTable, type Stack } from '../stack/stack.ts'
import { createFollower, type Follower, type FollowPane } from '../stack/sync.types.ts'
import { type AheadHold, aheadHeld, eagerPages, quietRoot } from './left.ts'

export type Side = 'left' | 'right'
export type Display = 'original' | 'bilingual' | 'translation'
export type Zoom = 'page-width' | 'page-fit' | 'page-actual' | number
export const DISPLAYS: readonly Display[] = ['original', 'bilingual', 'translation']
/** CSS px: the widest a page is fitted in a single display (the reader's design, §3) */
const READING_WIDTH = 1060
/** a zoom's or a pinch's step: scaled by CSS at once, drawn this long after the last step (one redraw a burst) */
export const STEP_DELAY = 400
/** a pinch is shown by transform while the fingers move, and committed this long after its last step */
export const PINCH_COMMIT_MS = 200
/** the reading line, as a share of the view's height, until a click moves it */
const READING_LINE = 0.25
/** within this a pane's layout is waited for after a zoom */
const LAID_MS = 100
/** room left above a heading gone to (CSS px) */
const HEADING_ROOM = 28

export interface PaneEvents {
  page: { side: Side; page: number; pages: number }
  scale: { scale: number; zoom: Zoom | null }
  sync: { on: boolean; available: boolean }
  display: { display: Display }
  /** a page of a pane drawn (the left's by PDF.js's viewer, the right's by the stack) */
  drawn: { side: Side; page: number; scale: number; key: string | null }
  /** the original's pages laid out on both panes */
  opened: { pages: number }
  scrolled: { side: Side }
}
type Listener<K extends keyof PaneEvents> = (e: PaneEvents[K]) => void

export interface PanesOptions {
  /** the reader's root: what the view marks (`data-axt-pdf-mode`, `-narrow`, `-swapped`) is written here, never on <html> */
  root: HTMLElement
  left: HTMLElement
  right: HTMLElement
  kit: Kit
  scheduler: Scheduler
  clock: OwnedClock
  pageName(side: Side, n: number): string
  openExternal(url: string): void
  /** no scrollend comes (a test's), else the browser's own */
  scrollEnd?: 'timer' | 'native'
  warn?(what: string, e: unknown): void
}

interface PaneSide extends FollowPane {
  name: Side
  scrollX: number
  scrollY: number
}
interface PinchPane {
  t: PaneSide
  pages: { div: HTMLElement; left: number; top: number; w: number; h: number; centred: boolean }[]
  gaps: number[]
  stack: { x: number; y: number; w: number }
  mode: 'scroller' | 'stack' | null
  hold: HTMLElement | null
  moved: Set<number>
  plan: { lay: Layout; sx: number; sy: number } | null
  kept: Kept | null
  q: { x: number; y: number } | null
  box: { left: number; top: number; w: number; h: number }
  scroll: { x: number; y: number; w: number; h: number }
  foot: number
}
interface Layout {
  boxes: { left: number; top: number; w: number; h: number }[]
  height: number
  width: number
}
interface Kept {
  n: number
  v: { share: number } | { edge: number; px: number }
  across: number
}

export interface Panes {
  readonly right: Stack
  readonly leftViewer: PDFViewer
  /** the original shown on both panes: resolves 'opened' once its pages are laid out, or 'superseded' */
  open(doc: PDFDocumentProxy): Promise<'opened' | 'superseded'>
  /** the original let go: both panes empty */
  drop(): void
  readonly doc: PDFDocumentProxy | null
  readonly display: Display
  readonly scale: number
  readonly zoom: Zoom | null
  setDisplay(d: Display): void
  setNarrow(on: boolean, o?: { display?: Display }): void
  setSync(on: boolean): void
  setSwapped(on: boolean): void
  zoomTo(z: Zoom): void
  zoomBy(factor: number): void
  pinch(side: Side, factor: number, origin: [number, number]): void
  goToPage(side: Side, n: number): void
  /** the first rectangle [page, x0, y0, x1, y1] of a heading on the pane read, gone to with a line of room above it */
  goToRect(r: [number, number, number, number, number]): void
  lead(side: Side): void
  /** a destination inside the paper (a name, or an explicit one) followed on the right; the focus there where by keyboard */
  follow(dest: string | unknown[], how?: { keyboard?: boolean }): Promise<void>
  /** where the reader is reading: the page at the reading line of the pane read and how far down it */
  reading(): { page: number; at: number } | null
  /** the reader put back at a place read before (a language switch keeps it) */
  putAt(place: { page: number; at: number }): void
  pageOf(side: Side): number
  /** a page's box on a pane in CSS px inside its page, for a rectangle of PDF units */
  boxOf(
    side: Side,
    page: number,
    r: [number, number, number, number],
  ): { left: number; top: number; width: number; height: number } | null
  pageElement(side: Side, n: number): HTMLElement | null
  /** a pane's scroller */
  containerOf(side: Side): HTMLElement
  readonly follower: Follower<PaneSide>
  on<K extends keyof PaneEvents>(type: K, f: Listener<K>): () => void
  probe(): Record<string, unknown>
  dispose(): void
}

export function createPanes(o: PanesOptions): Panes {
  const { kit, clock, root } = o
  const V = kit.viewer
  const ac = new AbortController(),
    signal = ac.signal
  let disposed = false
  const warn = (what: string, e: unknown) => o.warn?.(what, e)
  const listeners = new Map<keyof PaneEvents, Set<(e: unknown) => void>>()
  const tell = <K extends keyof PaneEvents>(type: K, e: PaneEvents[K]) => {
    if (disposed) return
    for (const f of [...(listeners.get(type) ?? [])]) {
      try {
        f(e)
      } catch (err) {
        warn(`a ${type} listener`, err)
      }
    }
  }
  const observers = new Set<{ disconnect(): void }>()
  const observe = <T extends { disconnect(): void }>(x: T) => {
    observers.add(x)
    return x
  }

  let mode: Display = 'bilingual',
    narrow = false,
    syncOn = true,
    readingLine = READING_LINE
  let doc: PDFDocumentProxy | null = null,
    laid = false,
    opening: { doc: PDFDocumentProxy; done(v: boolean): void } | null = null
  let kept: { doc: number; page: number; at: number } | null = null
  let held: (() => void)[] = []
  let due = false,
    duePlace: ReturnType<typeof placesNow> = null,
    relaying = false
  let zoomChosen: Zoom | null = 'page-width'
  let stepDelay = -1
  const counts = { layouts: 0, opens: 0 }

  // ---------------------------------------------------------------- the panes
  quietRoot(document.documentElement.style)
  const leftStack = document.createElement('div')
  leftStack.className = 'pdfViewer'
  o.left.append(leftStack)
  const L: PaneSide = {
    name: 'left',
    container: o.left,
    stack: leftStack,
    scrollX: 0,
    scrollY: 0,
    redraw: () => {},
    lend: () => {},
  }
  const R: PaneSide = {
    name: 'right',
    container: o.right,
    stack: null as unknown as HTMLElement,
    scrollX: 0,
    scrollY: 0,
    redraw: () => {},
    lend: () => {},
  }
  const sides = [L, R]
  const other = (s: PaneSide) => (s === L ? R : L)
  const bus: EventBus = new V.EventBus()
  const linkService: PDFLinkService = new V.PDFLinkService({ eventBus: bus, externalLinkTarget: V.LinkTarget.BLANK })
  // the right's own pages (arXiv's, not laid) carry PDF.js's links: a link service whose viewer is the right's pages, as today's
  // places had it (a destination, a page, the named actions, the optional content the document's)
  const rightLinks: PDFLinkService = new V.PDFLinkService({
    eventBus: new V.EventBus(),
    externalLinkTarget: V.LinkTarget.BLANK,
  })
  // a link out of the paper, on either pane's own annotations, goes out through the host alone
  for (const one of [linkService, rightLinks]) {
    const ls = one as unknown as {
      addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow?: boolean): void
    }
    const bind = ls.addLinkAttributes.bind(ls)
    ls.addLinkAttributes = (link, url, newWindow) => {
      bind(link, url, newWindow)
      link.addEventListener(
        'click',
        (e) => {
          e.preventDefault()
          o.openExternal(url)
        },
        { signal },
      )
    }
  }
  const hold: AheadHold = { on: false, viewers: new Set() }
  const Viewer = eagerPages(aheadHeld(V.PDFViewer as never, hold)) as unknown as typeof V.PDFViewer
  const viewer = new Viewer({
    container: o.left as HTMLDivElement,
    viewer: leftStack as HTMLDivElement,
    eventBus: bus,
    linkService,
    textLayerMode: 1,
    removePageBorders: false,
    abortSignal: signal,
  } as ConstructorParameters<typeof V.PDFViewer>[0])
  linkService.setViewer(viewer)
  // (the page boxes' rounding, one table for both panes: whichever draws page n at a scale first tells it)
  const rounding = roundingTable()
  const right = createStack({
    rounding,
    scroller: o.right,
    kit,
    scheduler: o.scheduler,
    clock,
    name: (n) => o.pageName('right', n),
    links: rightLinks,
    warn,
  })
  R.stack = right.element
  rightLinks.setViewer({
    scrollPageIntoView: (x: { pageNumber: number; destArray?: unknown[] | null }) => jump(R, x),
    get currentPageNumber() {
      return rightPage
    },
    set currentPageNumber(n: number) {
      goToPage('right', Math.min(right.pages, Math.max(1, n)))
    },
    get pagesCount() {
      return right.pages
    },
    nextPage() {
      if (rightPage >= right.pages) return false
      goToPage('right', rightPage + 1)
      return true
    },
    previousPage() {
      if (rightPage <= 1) return false
      goToPage('right', rightPage - 1)
      return true
    },
    get pagesRotation() {
      return 0
    },
    set pagesRotation(_: number) {},
    get optionalContentConfigPromise(): unknown {
      return viewer.optionalContentConfigPromise
    },
    set optionalContentConfigPromise(p: unknown) {
      viewer.optionalContentConfigPromise = p as never
    },
    isInPresentationMode: false,
    pageLabelToPageNumber: () => null,
  } as never)

  // ---------------------------------------------------------------- geometry
  const pageCount = (s: PaneSide) => (s === L ? (laid ? viewer.pagesCount : 0) : right.pages)
  const pageDiv = (s: PaneSide, n: number): HTMLElement | null =>
    (s === L ? (viewer.getPageView(n - 1) as { div?: HTMLElement } | undefined)?.div : right.page(n)) ?? null
  const viewportOf = (s: PaneSide, n: number) =>
    s === L
      ? ((viewer.getPageView(n - 1) as { viewport?: import('pdfjs-dist').PageViewport } | undefined)?.viewport ?? null)
      : right.viewport(n)
  function pageTop(s: PaneSide, n: number): number | null {
    const div = pageDiv(s, n)
    if (!div) return null
    return div.offsetTop + div.clientTop + (div.offsetParent === s.stack ? s.stack.offsetTop + s.stack.clientTop : 0)
  }
  const pageHeight = (s: PaneSide, n: number) => pageDiv(s, n)?.offsetHeight ?? 0
  function pageAt(s: PaneSide, y: number): number {
    const n = pageCount(s)
    if (!n) return 0
    let lo = 1,
      hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((pageTop(s, mid) ?? 0) + pageHeight(s, mid) > y) hi = mid
      else lo = mid + 1
    }
    return lo
  }
  const shown = (s: PaneSide) => s.container.clientWidth > 0
  const bothShown = () => mode === 'bilingual' && !narrow
  const available = () => !!doc && laid && right.pages > 0
  const active = () => syncOn && available() && bothShown()
  function levelTo(from: PaneSide): number | null {
    const to = other(from),
      D = from.container.scrollTop,
      n = pageAt(from, D)
    if (!n) return null
    const a = pageTop(from, n),
      b = pageTop(to, n),
      ha = pageHeight(from, n),
      hb = pageHeight(to, n)
    if (a == null || b == null || !ha) return null
    return (
      b + (D - a) * (hb / ha) + to.container.getBoundingClientRect().top - from.container.getBoundingClientRect().top
    )
  }
  const laidOut = (el: Element) =>
    new Promise<void>((resolve) => {
      const done = () => {
        seen.disconnect()
        observers.delete(seen)
        clock.clear(late)
        resolve()
      }
      const seen = observe(new ResizeObserver(done))
      const late = clock.later(done, LAID_MS)
      seen.observe(el)
    })

  // ---------------------------------------------------------------- the follower
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false }
  /** PDF.js told the left shows `shift()` px below its scrollTop (its private `_getVisiblePages`, lent: listed) */
  L.lend = (shift) => {
    const v = viewer as unknown as { _getVisiblePages?: () => unknown; container: unknown }
    if (!shift) {
      delete v._getVisiblePages
      return
    }
    v._getVisiblePages = function (this: { container: HTMLElement }) {
      const real = this.container
      this.container = {
        scrollTop: real.scrollTop + shift(),
        scrollLeft: real.scrollLeft,
        clientHeight: real.clientHeight,
        clientWidth: real.clientWidth,
      } as HTMLElement
      try {
        return (Object.getPrototypeOf(this) as { _getVisiblePages(): unknown })._getVisiblePages.call(this)
      } finally {
        this.container = real
      }
    }
  }
  L.redraw = () => viewer.update()
  R.redraw = () => tellRightPage()
  const follower = createFollower<PaneSide>({
    panes: { left: L, right: R },
    active,
    target: levelTo,
    clock,
    laidOut,
    timer: o.scrollEnd === 'timer' || !('onscrollend' in globalThis),
    compositor:
      typeof (globalThis as { ScrollTimeline?: unknown }).ScrollTimeline === 'function'
        ? (globalThis as unknown as { ScrollTimeline: never }).ScrollTimeline
        : null,
    reduced: () => reduced.matches,
    window: globalThis,
    signal,
  })

  // ---------------------------------------------------------------- the panes' inputs
  for (const s of sides) {
    const c = s.container,
      opts = { passive: true, signal }
    c.addEventListener(
      'scroll',
      () => {
        if (preview) {
          rescrolled()
          settle()
        }
        s.scrollX = c.scrollLeft
        s.scrollY = c.scrollTop
        follower.scrolled(s)
        if (s === R) tellRightPage()
        tell('scrolled', { side: s.name })
      },
      opts,
    )
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'])
      c.addEventListener(
        type,
        (e) => {
          if (type !== 'wheel' || !((e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey)) {
            settle()
            follower.input(s, type)
          }
        },
        opts,
      )
    c.addEventListener('pointermove', () => follower.hover(s), opts)
    c.addEventListener('scrollend', () => follower.ended(s), opts)
    // a click, told apart from a drag that selects text, by the press and its release
    let press: { x: number; y: number; t: number } | null = null
    c.addEventListener(
      'pointerdown',
      (e) => {
        press = e.button === 0 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null
      },
      opts,
    )
    c.addEventListener(
      'pointerup',
      (e) => {
        const p = press
        press = null
        if (
          !p ||
          Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4 ||
          e.timeStamp - p.t > 600 ||
          !(globalThis.getSelection?.()?.isCollapsed ?? true)
        )
          return
        if ((e.target as Element | null)?.closest?.('a[href]')) return
        alignClick(s, e)
      },
      { signal },
    )
  }
  for (const type of ['touchstart', 'touchend', 'touchcancel'])
    globalThis.addEventListener(
      type,
      (e) => follower.touches((e as TouchEvent).touches?.length ?? (type === 'touchstart' ? 1 : 0)),
      { passive: true, capture: true, signal },
    )
  const refit = observe(
    new ResizeObserver((entries) => {
      if (!laid || relaying || preview || typeof zoomChosen !== 'string') return
      for (const { target } of entries) {
        const s = target === L.container ? L : target === R.container ? R : null
        if (!s || !shown(s) || (s === R && shown(L))) continue
        scaled(() => fitShown(zoomChosen as Exclude<Zoom, number>))
      }
    }),
  )
  for (const s of sides) refit.observe(s.container)

  // ---------------------------------------------------------------- PDF.js's events, the stack's
  const on = (name: string, fn: (e: never) => void) => bus.on(name, fn as (e: unknown) => void, { signal } as never)
  on('pagesinit', () => {
    if (!doc || !opening) return
    if (typeof zoomChosen === 'number') setScale(zoomChosen)
    else if (zoomChosen === null && scaleTold) setScale(scaleTold.scale)
    else setScale(shown(L) ? (zoomChosen === 'page-width' ? fitWidth() : (zoomChosen ?? 'page-width')) : 1)
    const mine = opening
    void right.layout(mine.doc, viewer.currentScale).then(() => {
      if (opening !== mine) return
      laid = true
      if (!shown(L) && shown(R) && typeof zoomChosen === 'string') fitRight(zoomChosen)
      nameLeft()
      if (kept) {
        for (const s of sides) if (shown(s)) putAtPlace(s, kept)
      } else {
        const level = shown(L) && shown(R) ? levelTo(L) : null
        if (level != null) follower.put(R.container, level)
      }
      kept = null
      follower.invalidate()
      reportSync()
      tellLeftPage()
      tellRightPage()
      opening = null
      const run = held
      held = []
      for (const f of run) {
        try {
          f()
        } catch (e) {
          warn('a command given while the original opened', e)
        }
      }
      mine.done(true)
    })
  })
  on('scalechanging', ({ scale }: { scale: number }) => {
    follower.invalidate()
    if (right.pages) right.setScale(scale, stepDelay)
    tellScale(scale)
  })
  on(
    'pagerendered',
    ({ pageNumber, error, isDetailView }: { pageNumber: number; error?: unknown; isDetailView?: boolean }) => {
      if (!laid || isDetailView || error) return
      const div = pageDiv(L, pageNumber)
      if (div)
        rounding.set(
          pageNumber,
          viewer.currentScale,
          div.style.getPropertyValue('--scale-round-x'),
          div.style.getPropertyValue('--scale-round-y'),
        )
      tell('drawn', { side: 'left', page: pageNumber, scale: viewer.currentScale, key: null })
    },
  )
  on('pagechanging', () => tellLeftPage())
  right.on('drawn', (e) => {
    if (!e.detail) tell('drawn', { side: 'right', page: e.n, scale: e.scale, key: e.key })
  })
  right.on('shown', () => tellRightPage())
  // a page the right drew first at a scale: the left's page box takes its rounding until PDF.js draws it there (the same value)
  const unround = rounding.on((n) => {
    const pv = viewer.getPageView(n - 1) as { div?: HTMLElement; renderingState?: number; scale?: number } | undefined
    const r = rounding.get(n, viewer.currentScale)
    if (!pv?.div || !r || pv.renderingState === 3) return
    for (const [v, x] of [
      ['--scale-round-x', r[0]],
      ['--scale-round-y', r[1]],
    ] as const) {
      if (pv.div.style.getPropertyValue(v) === x) continue
      if (x) pv.div.style.setProperty(v, x)
      else pv.div.style.removeProperty(v)
    }
  })
  function nameLeft() {
    for (let i = 0; i < viewer.pagesCount; i++) {
      const pv = viewer.getPageView(i) as { div: HTMLElement; id: number } | undefined
      if (!pv) continue
      pv.div.removeAttribute('data-l10n-id')
      pv.div.removeAttribute('data-l10n-args')
      pv.div.setAttribute('aria-label', o.pageName('left', pv.id))
    }
  }

  // ---------------------------------------------------------------- what is told
  let leftTold = '',
    rightTold = '',
    rightPage = 1,
    syncTold: { on: boolean; available: boolean } | null = null,
    scaleTold: { scale: number; zoom: Zoom | null } | null = null
  function tellLeftPage() {
    if (!laid) return
    const key = `${viewer.currentPageNumber}/${viewer.pagesCount}`
    if (key === leftTold) return
    leftTold = key
    tell('page', { side: 'left', page: viewer.currentPageNumber, pages: viewer.pagesCount })
  }
  function tellRightPage() {
    if (!right.pages || !shown(R)) return
    const n = pageAt(R, follower.shownAt(R) + 1) || 1,
      pages = right.pages,
      key = `${n}/${pages}`
    rightPage = n
    if (key === rightTold) return
    rightTold = key
    tell('page', { side: 'right', page: n, pages })
  }
  function tellScale(scale: number) {
    if (scaleTold && scaleTold.scale === scale && scaleTold.zoom === zoomChosen) return
    scaleTold = { scale, zoom: zoomChosen }
    tell('scale', { scale, zoom: zoomChosen })
  }
  function reportSync() {
    const a = available(),
      now = syncOn && a
    if (syncTold && syncTold.on === now && syncTold.available === a) return
    syncTold = { on: now, available: a }
    tell('sync', { on: now, available: a })
    follower.reset()
  }
  function showMode() {
    root.setAttribute('data-axt-pdf-mode', mode)
    tell('display', { display: mode })
  }

  // ---------------------------------------------------------------- the original
  function open(next: PDFDocumentProxy): Promise<'opened' | 'superseded'> {
    if (disposed) return Promise.resolve('superseded')
    settle()
    if (opening) opening.done(false)
    if (doc && laid) letGo()
    counts.opens++
    return new Promise((resolve) => {
      opening = { doc: next, done: (ok) => resolve(ok ? 'opened' : 'superseded') }
      doc = next
      viewer.setDocument(next)
      linkService.setDocument(next)
      rightLinks.setDocument(next)
    }).then((r) => {
      if (r === 'opened') tell('opened', { pages: next.numPages })
      return r as 'opened' | 'superseded'
    })
  }
  function letGo() {
    settle()
    if (laid) kept = readingPlace(readSide())
    doc = null
    laid = false
    void right.layout(null, viewer.currentScale)
    viewer.setDocument(null as never)
    linkService.setDocument(null as never)
    rightLinks.setDocument(null as never)
    leftTold = ''
    follower.invalidate()
    reportSync()
  }

  // ---------------------------------------------------------------- zoom and fit
  const setScale = (v: number | string) => {
    viewer.currentScaleValue = typeof v === 'number' ? String(v) : v
  }
  function pageSize() {
    const vp = viewportOf(L, 1) ?? right.viewport(1)
    return vp?.scale ? { w: (vp.width / vp.scale) * PDF_TO_CSS, h: (vp.height / vp.scale) * PDF_TO_CSS } : null
  }
  function fitWidth(): number | 'page-width' {
    const size = pageSize()
    if (!size || bothShown()) return 'page-width'
    return L.container.clientWidth - 40 > READING_WIDTH ? READING_WIDTH / size.w : 'page-width'
  }
  function fitRight(fit: Exclude<Zoom, number>) {
    const size = pageSize(),
      c = R.container
    if (!size || !c.clientWidth) return
    const byWidth = (c.clientWidth - 40) / size.w
    const scale =
      fit === 'page-width'
        ? c.clientWidth - 40 > READING_WIDTH
          ? READING_WIDTH / size.w
          : byWidth
        : fit === 'page-fit'
          ? Math.min(byWidth, (c.clientHeight - 5) / size.h)
          : 1
    if (!(scale > 0)) return
    setScale(scale)
  }
  function fitShown(fit: Exclude<Zoom, number>) {
    if (shown(L)) setScale(fit === 'page-width' ? fitWidth() : fit)
    else if (shown(R)) fitRight(fit)
  }
  const readSide = () => {
    const d = follower.driver()
    return d && shown(d) ? d : shown(L) ? L : R
  }
  function readingPlace(s: PaneSide) {
    const c = s.container,
      place = { doc: c.scrollTop / Math.max(1, c.scrollHeight - c.clientHeight), page: 0, at: 0 }
    if (!shown(s) || !pageCount(s)) return place
    const y = c.scrollTop + c.clientHeight * readingLine,
      n = pageAt(s, y),
      top = pageTop(s, n),
      h = pageHeight(s, n)
    return top == null || !h ? place : { ...place, page: n, at: (y - top) / h }
  }
  function putAtPlace(s: PaneSide, place: { doc: number; page: number; at: number }) {
    const c = s.container
    if (place.page) {
      const top = pageTop(s, place.page),
        h = pageHeight(s, place.page)
      if (top != null && h) return follower.put(c, top + place.at * h - c.clientHeight * readingLine)
    }
    follower.put(c, place.doc * (c.scrollHeight - c.clientHeight))
  }
  function placesNow() {
    if (!laid) return null
    const read = readingPlace(readSide()),
      together = active(),
      own = new Map<PaneSide, ReturnType<typeof readingPlace>>()
    if (!together) for (const s of sides) if (shown(s)) own.set(s, readingPlace(s))
    return { read, own }
  }
  function putAll(at: ReturnType<typeof placesNow>) {
    if (!at || !laid) return
    follower.invalidate()
    for (const s of sides) if (shown(s)) putAtPlace(s, at.own.get(s) ?? at.read)
  }
  function scaled(change: () => void) {
    const at = placesNow()
    change()
    putAll(at)
  }
  function zoomTo(z: Zoom) {
    if (disposed) return
    settle()
    if (!laid) {
      held.push(() => zoomTo(z))
      return
    }
    zoomChosen = z
    scaled(() => (typeof z === 'string' ? fitShown(z) : setScale(z)))
    tellScale(viewer.currentScale)
    follower.zoomed()
  }
  function zoomBy(factor: number) {
    if (disposed) return
    settle()
    if (!laid) {
      held.push(() => zoomBy(factor))
      return
    }
    zoomChosen = null
    const cur = viewer.currentScale,
      next = Math.min(4, Math.max(0.25, cur * factor))
    scaled(() => {
      if (next === cur) return
      stepDelay = STEP_DELAY
      try {
        viewer.updateScale({ scaleFactor: next / cur, drawingDelay: STEP_DELAY })
      } finally {
        stepDelay = -1
      }
    })
    tellScale(viewer.currentScale)
    follower.zoomed()
  }

  // ---------------------------------------------------------------- the pinch (reader-view.mjs, kept: docs/PDF-READER.md §6.8)
  let pinchRest = 1,
    pinchScale = 0,
    pinchWay = 0
  let preview: { want: number; next: number; k: number; timer: number; panes: PinchPane[] } | null = null
  const pagesOf = (t: PaneSide): HTMLElement[] => {
    const out: HTMLElement[] = []
    for (let n = 1; n <= pageCount(t); n++) {
      const d = pageDiv(t, n)
      if (d) out.push(d)
    }
    return out
  }
  function pinch(which: Side, factor: number, origin: [number, number]) {
    if (disposed || !laid || !(factor > 0)) return
    const s = which === 'left' ? L : R
    if (preview ? !preview.panes.some((p) => p.t === s) : !shown(s)) return
    const cur = viewer.currentScale
    if (!preview) {
      follower.zooming(s)
      right.holdNear(true)
      preview = { want: 1, next: cur, k: 1, timer: 0, panes: [] }
      for (const t of sides) if (shown(t)) preview.panes.push(readPane(t))
    }
    const pv = preview
    pv.want = Math.min(25 / cur, Math.max(0.1 / cur, pv.want * factor))
    const way = Math.sign(pv.want - 1),
      rest = cur === pinchScale && way === pinchWay ? pinchRest : 1
    pv.next = Math.min(25, Math.max(0.1, Math.round(cur * pv.want * rest * 100) / 100))
    pv.k = pv.next / cur
    const b = pv.panes.find((p) => p.t === s)?.box
    for (const p of pv.panes) {
      const q = {
        x: Math.min(p.box.w, Math.max(0, origin[0] - (b ?? p.box).left)),
        y: Math.min(p.box.h, Math.max(0, origin[1] - (b ?? p.box).top)),
      }
      if (!p.kept || !p.q || q.x !== p.q.x || q.y !== p.q.y) {
        p.kept = keptAt(p, q)
        p.q = q
      }
      p.plan = planOf(p, pv.k)
      showPreview(p, pv.k)
    }
    zoomChosen = null
    tellScale(pv.next)
    clock.clear(pv.timer)
    pv.timer = clock.later(commitPinch, PINCH_COMMIT_MS)
  }
  function readPane(t: PaneSide): PinchPane {
    const c = t.container,
      cb = c.getBoundingClientRect(),
      sb = t.stack.getBoundingClientRect()
    const ox = cb.left + c.clientLeft - c.scrollLeft,
      oy = cb.top + c.clientTop - c.scrollTop
    const pages = pagesOf(t).map((div) => {
      const r = div.getBoundingClientRect()
      return { div, left: r.left - ox, top: r.top - oy, w: r.width, h: r.height, centred: false }
    })
    const gaps = [0]
    for (let i = 1; i < pages.length; i++)
      gaps.push(
        (gaps[i - 1] as number) +
          ((pages[i] as { top: number }).top -
            (pages[i - 1] as { top: number; h: number }).top -
            (pages[i - 1] as { h: number }).h),
      )
    const last = pages.at(-1),
      stack = { x: sb.left - ox, y: sb.top - oy, w: sb.width }
    for (const g of pages) g.centred = Math.abs(g.left - stack.x - Math.max(0, (stack.w - g.w) / 2)) < 1.5
    return {
      t,
      pages,
      gaps,
      stack,
      mode: null,
      hold: null,
      moved: new Set(),
      plan: null,
      kept: null,
      q: null,
      box: { left: cb.left + c.clientLeft, top: cb.top + c.clientTop, w: c.clientWidth, h: c.clientHeight },
      scroll: { x: c.scrollLeft, y: c.scrollTop, w: c.scrollWidth, h: c.scrollHeight },
      foot: last ? footOf(c, t.stack, sb.bottom - oy) - last.top - last.h : 0,
    }
  }
  function footOf(c: HTMLElement, stack: HTMLElement, stackEnd: number) {
    if (c.scrollHeight > c.clientHeight + 0.5) return c.scrollHeight
    const px = (v: string) => Number.parseFloat(v) || 0
    return stackEnd + px(getComputedStyle(stack).marginBottom) + px(getComputedStyle(c).paddingBottom)
  }
  function layoutAt(p: PinchPane, k: number): Layout {
    const first = p.pages[0]?.top ?? 0
    const boxes = p.pages.map((g, i) => {
      const w = g.w * k,
        h = g.h * k
      return {
        left: g.centred ? p.stack.x + Math.max(0, (p.stack.w - w) / 2) : g.left,
        top: first + k * (g.top - first - (p.gaps[i] as number)) + (p.gaps[i] as number),
        w,
        h,
      }
    })
    const last = boxes.at(-1)
    const height = last ? last.top + last.h + p.foot : p.scroll.h,
      width = Math.max(p.box.w, ...boxes.map((r) => r.left + r.w))
    return { boxes, height, width }
  }
  function keptAt(p: PinchPane, q: { x: number; y: number }): Kept | null {
    const lay = p.plan?.lay ?? layoutAt(p, 1),
      sx = p.plan?.sx ?? p.scroll.x,
      sy = p.plan?.sy ?? p.scroll.y
    const Y = sy + q.y,
      X = sx + q.x,
      boxes = lay.boxes
    if (!boxes.length) return null
    let n = boxes.findIndex((r) => r.top + r.h > Y)
    if (n < 0) n = boxes.length - 1
    const r = boxes[n] as Layout['boxes'][number]
    if (!r.w || !r.h) return null
    const v =
      Y < r.top
        ? { edge: 0, px: Y - r.top }
        : Y > r.top + r.h
          ? { edge: 1, px: Y - r.top - r.h }
          : { share: (Y - r.top) / r.h }
    return { n, v, across: (X - r.left) / r.w }
  }
  function planOf(p: PinchPane, k: number) {
    const lay = layoutAt(p, k),
      a = p.kept
    if (!a || !p.q) return { lay, sx: p.scroll.x, sy: p.scroll.y }
    const r = lay.boxes[a.n] as Layout['boxes'][number],
      Y = 'share' in a.v ? r.top + a.v.share * r.h : r.top + a.v.edge * r.h + a.v.px,
      X = r.left + a.across * r.w
    const sy = Math.min(Math.max(0, lay.height - p.box.h), Math.max(0, Y - p.q.y)),
      sx = Math.min(Math.max(0, lay.width - p.box.w), Math.max(0, X - p.q.x))
    return { lay, sx, sy }
  }
  function showPreview(p: PinchPane, k: number) {
    const c = p.t.container,
      st = p.t.stack,
      plan = p.plan,
      n = p.kept?.n ?? 0
    if (!plan) return
    const m = k >= 1 ? 'scroller' : 'stack'
    if (!p.hold) {
      p.hold = document.createElement('div')
      p.hold.className = 'axt-pinch-hold'
      p.hold.setAttribute('aria-hidden', 'true')
      Object.assign(p.hold.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: `${p.scroll.w}px`,
        height: `${p.scroll.h}px`,
        visibility: 'hidden',
        pointerEvents: 'none',
      })
      c.append(p.hold)
    }
    if (m !== p.mode) {
      for (const el of [c, st]) {
        el.style.removeProperty('transform')
        el.style.removeProperty('transform-origin')
        el.style.removeProperty('will-change')
      }
      const el = m === 'scroller' ? c : st
      el.style.setProperty('transform-origin', '0 0')
      el.style.setProperty('will-change', 'transform')
      p.mode = m
    }
    const was = (g: { left: number; top: number }) => ({ x: g.left - p.scroll.x, y: g.top - p.scroll.y }),
      now = (r: { left: number; top: number }) => ({ x: r.left - plan.sx, y: r.top - plan.sy })
    const g0 = p.pages[n],
      r0 = plan.lay.boxes[n]
    if (!g0 || !r0) return
    const a = was(g0),
      z = now(r0),
      bx = z.x - k * a.x,
      by = z.y - k * a.y
    if (m === 'scroller') c.style.setProperty('transform', `translate(${bx}px, ${by}px) scale(${k})`)
    else {
      const tx = (k - 1) * (p.stack.x - p.scroll.x) + bx,
        ty = (k - 1) * (p.stack.y - p.scroll.y) + by
      st.style.setProperty('transform', `translate(${tx}px, ${ty}px) scale(${k})`)
    }
    const near = new Set<number>()
    for (let i = 0; i < p.pages.length; i++) {
      const r = plan.lay.boxes[i] as Layout['boxes'][number],
        v = now(r)
      if (v.y + r.h < -p.box.h || v.y > 2 * p.box.h) continue
      const w = was(p.pages[i] as { left: number; top: number }),
        dx = (v.x - (k * w.x + bx)) / k,
        dy = (v.y - (k * w.y + by)) / k
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue
      ;(p.pages[i] as { div: HTMLElement }).div.style.setProperty('translate', `${dx}px ${dy}px`)
      near.add(i)
    }
    for (const i of p.moved)
      if (!near.has(i)) (p.pages[i] as { div: HTMLElement }).div.style.removeProperty('translate')
    p.moved = near
  }
  function clearPreview(p: PinchPane) {
    for (const el of [p.t.container, p.t.stack]) {
      el.style.removeProperty('transform')
      el.style.removeProperty('transform-origin')
      el.style.removeProperty('will-change')
    }
    for (const i of p.moved) (p.pages[i] as { div: HTMLElement }).div.style.removeProperty('translate')
    p.moved.clear()
    p.hold?.remove()
    p.hold = null
  }
  function commitPinch() {
    const p0 = preview
    if (!p0) return
    preview = null
    try {
      commitAt(p0)
    } finally {
      right.holdNear(false)
    }
  }
  function commitAt(p0: NonNullable<typeof preview>) {
    clock.clear(p0.timer)
    for (const p of p0.panes) clearPreview(p)
    if (disposed || !laid) {
      follower.zoomed()
      return
    }
    const cur = viewer.currentScale,
      way = Math.sign(p0.want - 1)
    if (cur !== pinchScale || way !== pinchWay) pinchRest = 1
    pinchWay = way
    const want = p0.want * pinchRest,
      next = Math.min(25, Math.max(0.1, Math.round(cur * want * 100) / 100))
    pinchRest = (want * cur) / next
    pinchScale = cur
    if (next === cur) {
      tellScale(cur)
      follower.zoomed()
      return
    }
    const anchors = p0.panes
      .filter((p) => p.kept && p.q && shown(p.t))
      .map((p) => ({
        t: p.t,
        n: (p.kept as Kept).n + 1,
        v: (p.kept as Kept).v,
        across: (p.kept as Kept).across,
        x: (p.q as { x: number }).x,
        y: (p.q as { y: number }).y,
      }))
    stepDelay = 0
    try {
      viewer.updateScale({ scaleFactor: next / cur, drawingDelay: 0 })
    } finally {
      stepDelay = -1
    }
    pinchScale = viewer.currentScale
    for (const a of anchors) keepAnchor(a)
    tellScale(viewer.currentScale)
    follower.zoomed()
  }
  function rescrolled() {
    if (!preview) return
    for (const p of preview.panes) {
      const c = p.t.container,
        x = c.scrollLeft,
        y = c.scrollTop
      if (!p.q || (Math.abs(x - p.scroll.x) < 0.5 && Math.abs(y - p.scroll.y) < 0.5)) continue
      p.scroll = { ...p.scroll, x, y }
      p.plan = null
      p.kept = keptAt(p, p.q)
    }
  }
  const settle = () => {
    if (preview) commitPinch()
  }
  function boxIn(t: PaneSide, n: number) {
    const div = pageDiv(t, n)
    if (!div) return null
    const c = t.container,
      r = div.getBoundingClientRect(),
      p = c.getBoundingClientRect()
    return {
      top: r.top - p.top - c.clientTop + c.scrollTop,
      left: r.left - p.left - c.clientLeft + c.scrollLeft,
      width: r.width,
      height: r.height,
    }
  }
  function keepAnchor(a: { t: PaneSide; n: number; v: Kept['v']; across: number; x: number; y: number }) {
    const box = boxIn(a.t, a.n)
    if (!box?.height) return
    const Y = 'share' in a.v ? box.top + a.v.share * box.height : box.top + a.v.edge * box.height + a.v.px
    a.t.container.scrollLeft = box.left + a.across * box.width - a.x
    follower.put(a.t.container, Y - a.y)
  }

  // ---------------------------------------------------------------- displays
  function relayout(place: ReturnType<typeof placesNow>) {
    settle()
    if (due) return
    due = true
    duePlace = place
    relaying = true
    follower.bake()
    clock.frame(() => {
      const at = duePlace
      due = false
      duePlace = null
      if (!laid) {
        relaying = false
        return
      }
      counts.layouts++
      zoomChosen = 'page-width'
      fitShown('page-width')
      clock.frame(() => {
        relaying = false
        putAll(at)
        tellRightPage()
      })
    })
  }
  const placeNow = () => (due ? null : placesNow())

  // ---------------------------------------------------------------- going places
  function jump(s: PaneSide, { pageNumber: n, destArray }: { pageNumber: number; destArray?: unknown[] | null }) {
    if (disposed || !laid) return
    settle()
    follower.take(s)
    if (s === L) {
      viewer.scrollPageIntoView({ pageNumber: n, destArray: destArray as never })
      return
    }
    const vp0 = right.viewport(n),
      c = R.container
    if (!vp0) return
    const kind = Array.isArray(destArray) ? (destArray[1] as { name?: string } | undefined)?.name : null
    const d = (destArray ?? []) as number[]
    const h = (vp0.height / vp0.scale) * PDF_TO_CSS
    let zoom: Zoom | null = null,
      x: number | null = null,
      y: number | null = null
    if (kind === 'XYZ') {
      x = d[2] ?? null
      y = d[3] ?? null
      if ((d[4] ?? 0) > 0) zoom = d[4] as number
    } else if (kind === 'Fit' || kind === 'FitB') zoom = 'page-fit'
    else if (kind === 'FitH' || kind === 'FitBH') {
      zoom = 'page-width'
      if (typeof d[2] === 'number' && d[2] >= 0) y = d[2]
    } else if (kind === 'FitV' || kind === 'FitBV') {
      x = d[2] ?? null
      zoom = (c.clientHeight - 5) / h
    } else if (kind === 'FitR') {
      x = d[2] ?? null
      y = d[5] ?? null
      zoom =
        Math.min(
          Math.abs((c.clientWidth - 40) / ((d[4] as number) - (d[2] as number))),
          Math.abs((c.clientHeight - 5) / ((d[5] as number) - (d[3] as number))),
        ) / PDF_TO_CSS
    }
    if (
      zoom !== null &&
      (typeof zoom === 'string' || (zoom > 0 && Number.isFinite(zoom) && zoom !== viewer.currentScale))
    ) {
      zoomChosen = typeof zoom === 'string' || kind === 'XYZ' ? zoom : null
      if (typeof zoom === 'string') fitShown(zoom)
      else setScale(zoom)
      tellScale(viewer.currentScale)
      follower.zoomed()
    }
    const top = pageTop(R, n),
      vp = right.viewport(n)
    if (top == null || !vp) return
    if (typeof x === 'number') {
      const div = pageDiv(R, n)
      c.scrollLeft =
        (div?.offsetLeft ?? 0) + (div?.clientLeft ?? 0) + Math.max(0, vp.convertToViewportPoint(x, 0)[0] as number)
    }
    c.scrollTop = top + (typeof y === 'number' ? Math.max(0, vp.convertToViewportPoint(0, y)[1] as number) : 0)
  }
  function alignClick(from: PaneSide, e: PointerEvent) {
    settle()
    if (!bothShown() || !available()) return
    const div = (e.target as Element | null)?.closest?.('.page') as HTMLElement | null,
      n = Number(div?.dataset.pageNumber)
    if (!n) return
    follower.bake()
    const to = other(from),
      c = from.container,
      y = e.clientY - c.getBoundingClientRect().top,
      Y = y + c.scrollTop
    const a = pageTop(from, n),
      b = pageTop(to, n),
      ha = pageHeight(from, n),
      hb = pageHeight(to, n)
    if (a == null || b == null || !ha) return
    readingLine = Math.min(0.95, Math.max(0.05, follower.level(from, y, b + (Y - a) * (hb / ha))))
  }
  function goToPage(which: Side, n: number) {
    if (disposed) return
    settle()
    if (!laid) {
      held.push(() => goToPage(which, n))
      return
    }
    const s = which === 'left' ? L : R
    follower.take(s)
    if (s === L) viewer.currentPageNumber = n
    else {
      const top = pageTop(R, n)
      if (top != null) R.container.scrollTop = top
    }
  }

  const panes: Panes = {
    right,
    leftViewer: viewer,
    follower,
    open,
    drop() {
      if (doc) letGo()
    },
    get doc() {
      return laid ? doc : null
    },
    get display() {
      return mode
    },
    get scale() {
      return viewer.currentScale
    },
    get zoom() {
      return zoomChosen
    },
    setDisplay(d) {
      if (disposed || !DISPLAYS.includes(d) || d === mode) return
      settle()
      const place = placeNow()
      mode = d
      showMode()
      relayout(place)
    },
    setNarrow(onNow, x = {}) {
      if (disposed) return
      const next = x.display && DISPLAYS.includes(x.display) ? x.display : mode
      if (narrow === onNow && next === mode) return
      settle()
      const place = placeNow()
      narrow = onNow
      root.toggleAttribute('data-axt-narrow', onNow)
      if (next !== mode) {
        mode = next
        showMode()
      }
      relayout(place)
    },
    setSync(onNow) {
      if (disposed) return
      syncOn = !!onNow
      reportSync()
    },
    setSwapped(onNow) {
      root.toggleAttribute('data-axt-swapped', onNow)
    },
    zoomTo,
    zoomBy,
    pinch,
    goToPage,
    goToRect(r) {
      if (disposed) return
      settle()
      if (!laid) {
        held.push(() => panes.goToRect(r))
        return
      }
      const s = readSide(),
        [page, x0, y0, x1, y1] = r
      const top = pageTop(s, page),
        vp = viewportOf(s, page)
      if (top == null || !vp) return
      const y =
        top +
        Math.min(vp.convertToViewportPoint(x0, y1)[1] as number, vp.convertToViewportPoint(x1, y0)[1] as number) -
        HEADING_ROOM
      follower.take(s)
      s.container.scrollTop = y
      if (!active() && shown(other(s))) follower.put(other(s).container, y)
    },
    lead(which) {
      if (!disposed) {
        settle()
        follower.take(which === 'left' ? L : R)
      }
    },
    async follow(dest, how = {}) {
      const d = doc
      if (disposed || !d || !laid) return
      try {
        const explicit = typeof dest === 'string' ? await d.getDestination(dest) : dest
        if (!Array.isArray(explicit) || !explicit.length) return
        const ref = explicit[0]
        const n =
          ref && typeof ref === 'object'
            ? (await d.getPageIndex(ref as never)) + 1
            : Number.isInteger(ref)
              ? (ref as number) + 1
              : null
        if (disposed || doc !== d || !laid || n === null || n < 1 || n > right.pages) return
        jump(R, { pageNumber: n, destArray: explicit })
        if (how.keyboard) right.focus(n)
      } catch (e) {
        warn("a link's destination", e)
      }
    },
    reading() {
      if (!laid) return null
      const p = readingPlace(readSide())
      return p.page ? { page: p.page, at: p.at } : null
    },
    putAt(place) {
      if (!laid) return
      for (const s of sides) if (shown(s)) putAtPlace(s, { doc: 0, ...place })
    },
    pageOf: (side) => (side === 'left' ? viewer.currentPageNumber : rightPage),
    boxOf(side, page, r) {
      const vp = viewportOf(side === 'left' ? L : R, page)
      if (!vp) return null
      const [ax, ay] = vp.convertToViewportPoint(r[0], r[3]) as [number, number],
        [bx, by] = vp.convertToViewportPoint(r[2], r[1]) as [number, number]
      return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }
    },
    pageElement: (side, n) => pageDiv(side === 'left' ? L : R, n),
    containerOf: (side) => (side === 'left' ? L : R).container,
    on(type, f) {
      const set = listeners.get(type) ?? new Set()
      listeners.set(type, set)
      set.add(f as (e: unknown) => void)
      return () => set.delete(f as (e: unknown) => void)
    },
    probe() {
      const d = follower.driver()
      return {
        original: doc ? (laid ? 'open' : 'laying') : 'none',
        pages: laid ? viewer.pagesCount : 0,
        display: mode,
        narrow,
        sync: syncOn,
        available: available(),
        driver: d === L ? 'left' : d === R ? 'right' : null,
        compositing: follower.compositing(),
        levelError: available() && bothShown() ? follower.levelError(d ?? L) : null,
        scale: viewer.currentScale,
        zoom: zoomChosen,
        pinching: preview ? preview.k : null,
        readingLine,
        layouts: counts.layouts,
        opens: counts.opens,
        ...Object.fromEntries(Object.entries(right.probe()).map(([k, v]) => [`right.${k}`, v])),
      }
    },
    dispose() {
      if (disposed) return
      if (preview) {
        clock.clear(preview.timer)
        for (const p of preview.panes) clearPreview(p)
        preview = null
      }
      disposed = true
      opening?.done(false)
      follower.stop()
      if (doc) {
        doc = null
        laid = false
        viewer.setDocument(null as never)
        linkService.setDocument(null as never)
      }
      unround()
      right.dispose()
      ac.abort()
      for (const x of observers) x.disconnect()
      observers.clear()
      listeners.clear()
      root.removeAttribute('data-axt-pdf-mode')
      root.removeAttribute('data-axt-narrow')
      root.removeAttribute('data-axt-swapped')
      leftStack.remove()
    },
  }
  showMode()
  reportSync()
  return panes
}
