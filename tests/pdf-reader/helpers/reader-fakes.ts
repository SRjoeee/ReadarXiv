// Stand-ins for the reading view's tests (reader-view.test.ts): PDF.js's viewer components as the view calls them, a
// document and its loading task, a clock the test moves by hand, and a small layout model for happy-dom, which lays nothing
// out. The layout model is the reader's sheet reduced to what the view reads: a pane is 600 × 800 px when its display shows
// it, a page box is its style's size, 14 px between pages and at either end of the stack (reader.css), and a pane scrolls
// within its stack's height. A scroll event follows a change of scrollTop in a microtask, as a browser's comes after it.
import { vi } from 'vitest'

// ---------------------------------------------------------------- the clock
export interface ManualClock {
  now(): number
  frame(cb: () => void): number
  cancel(id: number): void
  later(cb: () => void, ms: number): number
  clear(id: number): void
  /** one animation frame: the callbacks asked for before it, then the microtasks they queued */
  tick(): Promise<void>
  /** `ms` of time: timers in order, a frame every 16 ms */
  advance(ms: number): Promise<void>
  pending(): { frames: number; timers: number }
}
export const flush = async (n = 6) => { for (let i = 0; i < n; i++) await Promise.resolve() }
export function manualClock(): ManualClock {
  let t = 1000, id = 0
  const frames = new Map<number, () => void>()
  const timers = new Map<number, { at: number; cb: () => void }>()
  const runFrames = async () => {
    const due = [...frames]
    frames.clear()
    for (const [, cb] of due) cb()
    await flush()
  }
  const clock: ManualClock = {
    now: () => t,
    frame: cb => { const i = ++id; frames.set(i, cb); return i },
    cancel: i => { frames.delete(i) },
    later: (cb, ms) => { const i = ++id; timers.set(i, { at: t + Math.max(0, ms ?? 0), cb }); return i },
    clear: i => { timers.delete(i) },
    tick: async () => { t += 16; await runFrames() },
    async advance(ms) {
      const end = t + ms
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
        const frameAt = t + 16
        if ((!next || next[1].at > end) && frameAt > end) break
        if (next && next[1].at <= Math.min(frameAt, end)) {
          t = Math.max(t, next[1].at)
          timers.delete(next[0])
          next[1].cb()
          await flush()
          continue
        }
        if (frameAt > end) break
        t = frameAt
        await runFrames()
      }
      t = end
      await flush()
    },
    pending: () => ({ frames: frames.size, timers: timers.size }),
  }
  return clock
}

// ---------------------------------------------------------------- a document and its loading
export interface FakePage { pageNumber: number; view: number[]; rotate: number; getViewport(o: { scale: number }): FakeViewport; cleanup(): void }
export interface FakeDoc {
  numPages: number
  sizes: { w: number; h: number }[]
  getPage(n: number): Promise<FakePage>
  getData: ReturnType<typeof vi.fn>
  getMetadata(): Promise<unknown>
  getOutline(): Promise<unknown[] | null>
  getDestination(id: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
  annotationStorage: object
  title: string
}
export interface FakeViewport {
  width: number; height: number; scale: number; rotation: number
  rawDims: { pageWidth: number; pageHeight: number }
  convertToViewportPoint(x: number, y: number): number[]
  convertToPdfPoint(x: number, y: number): number[]
  clone(o: { scale: number }): FakeViewport
}
/** a viewport of a page `w` × `h` PDF units at a viewport scale (CSS px a unit) */
export function viewportOf(w: number, h: number, scale: number): FakeViewport {
  return {
    width: w * scale, height: h * scale, scale, rotation: 0, rawDims: { pageWidth: w * 4 / 3, pageHeight: h * 4 / 3 },
    convertToViewportPoint: (x, y) => [x * scale, (h - y) * scale],
    convertToPdfPoint: (x, y) => [x / scale, h - y / scale],
    clone: o => viewportOf(w, h, o.scale),
  }
}
/** `rotate`: each page's /Rotate (90 or 270 shows it a quarter-turn round): its box (`view`) unrotated, as PDF.js gives
 *  it, its viewports and page views at the displayed size */
export function fakeDoc(pages = 6, o: { title?: string; size?: { w: number; h: number }; rotate?: number } = {}): FakeDoc {
  const raw = o.size ?? { w: 612, h: 792 }, turned = o.rotate === 90 || o.rotate === 270
  const shown = turned ? { w: raw.h, h: raw.w } : raw
  const sizes = Array.from({ length: pages }, () => ({ ...shown }))
  const made = new Map<number, FakePage>()
  return {
    numPages: pages, sizes, title: o.title ?? '',
    getPage(n) {
      if (n < 1 || n > pages) return Promise.reject(new Error(`no page ${n}`))
      let p = made.get(n)
      if (!p) {
        const { w, h } = sizes[n - 1] as { w: number; h: number }
        p = { pageNumber: n, view: [0, 0, raw.w, raw.h], rotate: o.rotate ?? 0, getViewport: ({ scale }) => viewportOf(w, h, scale), cleanup: vi.fn() }
        made.set(n, p)
      }
      return Promise.resolve(p)
    },
    getData: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    getMetadata: async () => ({ info: { Title: o.title ?? '' } }),
    getOutline: async () => null,
    getDestination: async () => null,
    getPageIndex: async (ref: unknown) => Number(ref),
    annotationStorage: {},
  }
}
export interface FakeTask {
  promise: Promise<FakeDoc>
  onProgress: ((p: { loaded: number; total: number }) => void) | null
  destroy: ReturnType<typeof vi.fn>
  resolve(doc: FakeDoc): void
  reject(e: unknown): void
}
/** a loading task the test settles; `log` records its destroy */
export function fakeTask(log?: string[], name = 'task'): FakeTask {
  let resolve!: (d: FakeDoc) => void, reject!: (e: unknown) => void
  const promise = new Promise<FakeDoc>((a, b) => { resolve = a; reject = b })
  promise.catch(() => {})
  return { promise, onProgress: null, destroy: vi.fn(async () => { log?.push(`destroy ${name}`) }), resolve, reject }
}

// ---------------------------------------------------------------- PDF.js's viewer components
// biome-ignore lint/suspicious/noExplicitAny: PDF.js's events carry what each names
type Listener = (data: any) => void
export class FakeEventBus {
  static made: FakeEventBus[] = []
  listeners = new Map<string, Set<Listener>>()
  constructor() { FakeEventBus.made.push(this) }
  on(name: string, fn: Listener, o?: { once?: boolean; signal?: AbortSignal }) {
    const set = this.listeners.get(name) ?? this.listeners.set(name, new Set()).get(name) as Set<Listener>
    const wrapped: Listener = o?.once ? d => { set.delete(wrapped); fn(d) } : fn
    set.add(wrapped)
    o?.signal?.addEventListener('abort', () => set.delete(wrapped), { once: true })
  }
  off(name: string, fn: Listener) { this.listeners.get(name)?.delete(fn) }
  dispatch(name: string, data: object = {}) { for (const fn of [...(this.listeners.get(name) ?? [])]) fn({ source: this, ...data }) }
  count() { let n = 0; for (const s of this.listeners.values()) n += s.size; return n }
}
export class FakeLinkService {
  static made: FakeLinkService[] = []
  pdfDocument: unknown = null
  pdfViewer: { scrollPageIntoView(o: { pageNumber: number; destArray?: unknown[] }): void } | null = null
  externalLinkTarget: number
  eventBus: FakeEventBus
  constructor(o: { eventBus: FakeEventBus; externalLinkTarget?: number }) { this.eventBus = o.eventBus; this.externalLinkTarget = o.externalLinkTarget ?? 0; FakeLinkService.made.push(this) }
  setDocument(doc: unknown) { this.pdfDocument = doc }
  setViewer(v: FakeLinkService["pdfViewer"]) { this.pdfViewer = v }
  goToPage(n: number) { this.pdfViewer?.scrollPageIntoView({ pageNumber: n }) }
}
export const LinkTarget = { NONE: 0, SELF: 1, BLANK: 2, PARENT: 3, TOP: 4 }

/** a page view of the fake viewer: its div sized as PDF.js sizes one, floored to the pixel */
export interface FakeViewerPage { id: number; div: HTMLElement; viewport: FakeViewport; pdfPage: FakePage | null; renderingState: number; canvas: HTMLCanvasElement | null; reset(): void }
const PDF_TO_CSS = 96 / 72
export class FakePDFViewer {
  static made: FakePDFViewer[] = []
  container: HTMLElement
  viewer: HTMLElement
  eventBus: FakeEventBus
  linkService: FakeLinkService
  pdfDocument: FakeDoc | null = null
  _pages: FakeViewerPage[] = []
  _currentScale = 1
  _currentScaleValue = '1'
  currentPageNumber = 1
  l10n = { translate: () => {} }
  /** what the test sees of the fake's own writes: its updateScale calls, its setDocument calls */
  log: string[] = []
  updates = 0
  inside = false
  constructor(o: { container: HTMLElement; viewer?: HTMLElement; eventBus: FakeEventBus; linkService: FakeLinkService }) {
    this.container = o.container
    this.viewer = o.viewer ?? (o.container.firstElementChild as HTMLElement)
    this.eventBus = o.eventBus
    this.linkService = o.linkService
    FakePDFViewer.made.push(this)
  }
  get pagesCount() { return this._pages.length }
  get currentScale() { return this._currentScale }
  set currentScale(s: number) { this.#setScale(s, String(s)) }
  get currentScaleValue() { return this._currentScaleValue }
  set currentScaleValue(v: string | number) {
    if (!this.pdfDocument) return
    const s = Number.parseFloat(String(v))
    if (s > 0) { this.#setScale(s, String(v)); return }
    const pv = this._pages[0]
    if (!pv) return
    const w = (pv.pdfPage?.view[2] ?? 612) * PDF_TO_CSS
    const h = (pv.pdfPage?.view[3] ?? 792) * PDF_TO_CSS
    const byWidth = (this.container.clientWidth - 40) / w
    const scale = v === 'page-fit' ? Math.min(byWidth, (this.container.clientHeight - 5) / h) : v === 'page-actual' ? 1 : byWidth
    this.#setScale(scale > 0 ? scale : 1, String(v))
  }
  get pagesPromise() { return this.pdfDocument ? Promise.resolve() : null }
  getPageView(i: number) { return this._pages[i] }
  setDocument(doc: FakeDoc | null) {
    this.log.push(doc ? 'setDocument' : 'setDocument(null)')
    for (const p of this._pages) p.div.remove()
    this._pages = []
    // the stack emptied, the browser clamps the pane's scroll to its top
    this.container.scrollTop = 0
    this.pdfDocument = doc
    if (!doc) return
    this.viewer.style.setProperty('--scale-factor', String(this._currentScale * PDF_TO_CSS))
    void doc.getPage(1).then(first => {
      if (this.pdfDocument !== doc) return
      this._pages = Array.from({ length: doc.numPages }, (_, i) => this.#pageView(i + 1, doc.sizes[i] as { w: number; h: number }, i === 0 ? first : null))
      this.eventBus.dispatch('pagesinit')
      void Promise.all(this._pages.map(p => doc.getPage(p.id).then(pg => { p.pdfPage = pg }))).then(() => { if (this.pdfDocument === doc) this.eventBus.dispatch('pagesloaded', { pagesCount: doc.numPages }) })
    })
  }
  #pageView(id: number, { w, h }: { w: number; h: number }, pdfPage: FakePage | null): FakeViewerPage {
    const div = document.createElement('div')
    div.className = 'page'
    div.dataset.pageNumber = String(id)
    div.setAttribute('data-l10n-id', 'pdfjs-page-landmark')
    this.viewer.append(div)
    const pv: FakeViewerPage = {
      id, div, viewport: viewportOf(w, h, this._currentScale * PDF_TO_CSS), pdfPage, renderingState: 0, canvas: null,
      // PDF.js's reset: every node of the page it does not own removed (the highlight's layer with them)
      reset: () => { for (const n of [...div.children]) n.remove(); pv.renderingState = 0 },
    }
    this.#size(pv)
    return pv
  }
  #size(pv: FakeViewerPage) {
    pv.div.style.width = `${Math.floor(pv.viewport.width)}px`
    pv.div.style.height = `${Math.floor(pv.viewport.height)}px`
  }
  #setScale(scale: number, value: string, drawingDelay = -1) {
    this._currentScaleValue = value
    if (Math.abs(scale - this._currentScale) < 1e-9) return
    this.inside = true
    try {
      // PDF.js keeps the page and the point at the top of the view through a zoom
      const c = this.container, at = this.#location()
      this._currentScale = scale
      this.viewer.style.setProperty('--scale-factor', String(scale * PDF_TO_CSS))
      for (const pv of this._pages) { pv.viewport = pv.viewport.clone({ scale: scale * PDF_TO_CSS }); this.#size(pv) }
      if (at) c.scrollTop = pageTopIn(this._pages[at.page - 1]?.div as HTMLElement) + at.f * (this._pages[at.page - 1]?.viewport.height ?? 0)
      this.log.push(`scale ${scale.toFixed(3)} ${drawingDelay}`)
      this.eventBus.dispatch('scalechanging', { scale, presetValue: Number.isNaN(Number(value)) ? value : undefined })
    } finally { this.inside = false }
  }
  #location() {
    const y = this.container.scrollTop
    for (const pv of this._pages) {
      const top = pageTopIn(pv.div), h = pv.viewport.height
      if (top + h > y) return { page: pv.id, f: Math.max(0, (y - top) / h) }
    }
    return null
  }
  updateScale({ scaleFactor, drawingDelay = -1 }: { scaleFactor: number; origin?: number[]; drawingDelay?: number }) {
    if (!this.pdfDocument) return
    const next = Math.min(25, Math.max(0.1, Math.round(this._currentScale * scaleFactor * 100) / 100))
    this.log.push(`updateScale ${drawingDelay}`)
    this.#setScale(next, String(next), drawingDelay)
  }
  update() { this.updates++ }
  scrollPageIntoView({ pageNumber }: { pageNumber: number }) { const pv = this._pages[pageNumber - 1]; if (pv) this.container.scrollTop = pageTopIn(pv.div) }
  _getVisiblePages() { return { first: this._pages[0], views: [] } }
  /** PDF.js drew page `n` (the test's: a canvas in its div, then `pagerendered`) */
  render(n: number, error: unknown = null) {
    const pv = this._pages[n - 1]
    if (!pv) return
    pv.canvas ??= document.createElement('canvas')
    pv.canvas.width = 100
    pv.div.prepend(pv.canvas)
    pv.renderingState = 3
    this.eventBus.dispatch('pagerendered', { pageNumber: n, error })
  }
}
/** a page's top in its pane's scroll, as the layout model has it */
const pageTopIn = (div: HTMLElement) => (div ? div.offsetTop : 0)

/** PDF.js's own page, drawn alone into a container: what a place shows of the original */
export class FakePDFPageView {
  static made: FakePDFPageView[] = []
  id: number
  scale: number
  viewport: FakeViewport
  div: HTMLElement
  pdfPage: (FakePage & { cleanup(): void }) | null = null
  renderingState = 0
  canvas: HTMLCanvasElement | null = null
  draws = 0
  updates: { scale: number; drawingDelay: number }[] = []
  // biome-ignore lint/suspicious/noExplicitAny: the options PDF.js's page view takes, as the view passes them
  options: Record<string, any>
  log: string[]
  // biome-ignore lint/suspicious/noExplicitAny: the same
  constructor(o: Record<string, any>) {
    this.options = o
    this.id = o.id
    this.scale = o.scale
    this.viewport = o.defaultViewport
    this.div = document.createElement('div')
    this.div.className = 'page'
    this.div.setAttribute('data-page-number', String(o.id))
    this.div.setAttribute('role', 'region')
    this.div.setAttribute('data-l10n-id', 'pdfjs-page-landmark')
    o.container?.append(this.div)
    this.log = FakePDFPageView.log
    FakePDFPageView.made.push(this)
  }
  static log: string[] = []
  setPdfPage(p: FakePage) { this.pdfPage = p; this.viewport = p.getViewport({ scale: this.scale * PDF_TO_CSS }) }
  async draw() {
    if (this.renderingState !== 0) this.reset()
    this.renderingState = 1
    this.draws++
    await Promise.resolve()
    if (this.renderingState !== 1) throw Object.assign(new Error('Rendering cancelled'), { name: 'RenderingCancelledException' })
    this.canvas = document.createElement('canvas')
    this.canvas.width = 100
    this.canvas.height = 130
    const text = document.createElement('div'); text.className = 'textLayer'; text.textContent = `page ${this.id}`
    const links = document.createElement('div'); links.className = 'annotationLayer'
    const a = document.createElement('a'); a.href = 'https://example.invalid/out'
    a.target = this.options.layerProperties?.linkService?.externalLinkTarget === LinkTarget.BLANK ? '_blank' : ''
    links.append(a)
    this.div.append(this.canvas, text, links)
    this.renderingState = 3
    this.options.eventBus?.dispatch('pagerendered', { source: this, pageNumber: this.id, error: null })
  }
  update({ scale, drawingDelay = -1 }: { scale: number; drawingDelay?: number }) {
    this.scale = scale
    this.viewport = this.viewport.clone({ scale: scale * PDF_TO_CSS })
    this.updates.push({ scale, drawingDelay })
    if (drawingDelay >= 0) { this.renderingState = 3; return }
    this.reset()
  }
  reset() {
    this.log.push(`reset page view ${this.id}`)
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0 }
    this.canvas = null
    for (const n of [...this.div.children]) n.remove()
    this.renderingState = 0
  }
  destroy() { this.reset(); this.pdfPage?.cleanup() }
}

/** the kit as the host hands it: the fakes, and the getDocument options the view must pass on */
export const ASSETS = Object.freeze({ cMapUrl: 'cmaps/', cMapPacked: true, standardFontDataUrl: 'fonts/', wasmUrl: 'wasm/' })
export function fakeKit() {
  return {
    lib: { AnnotationMode: { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2 } },
    viewer: { EventBus: FakeEventBus, PDFViewer: FakePDFViewer, PDFPageView: FakePDFPageView, PDFLinkService: FakeLinkService, LinkTarget },
    assets: ASSETS,
  }
}
export function resetFakes() {
  FakeEventBus.made = []
  FakeLinkService.made = []
  FakePDFViewer.made = []
  FakePDFPageView.made = []
  FakePDFPageView.log = []
}

// ---------------------------------------------------------------- the observers
/** IntersectionObserver as a test drives it: `near(el, on)` tells the observers watching `el` */
export class FakeIO {
  static live = new Set<FakeIO>()
  targets = new Set<Element>()
  cb: (entries: { target: Element; isIntersecting: boolean }[]) => void
  options: unknown
  constructor(cb: FakeIO['cb'], options?: unknown) { this.cb = cb; this.options = options; FakeIO.live.add(this) }
  observe(el: Element) { this.targets.add(el) }
  unobserve(el: Element) { this.targets.delete(el) }
  disconnect() { this.targets.clear(); FakeIO.live.delete(this) }
  takeRecords() { return [] }
  static tell(els: Element[], on: boolean) {
    for (const io of [...FakeIO.live]) {
      const entries = els.filter(e => io.targets.has(e)).map(target => ({ target, isIntersecting: on }))
      if (entries.length) io.cb(entries)
    }
  }
}
/** ResizeObserver: told at once when an element is observed (the layout is clean in a test), and again by `fire` */
export class FakeRO {
  static live = new Set<FakeRO>()
  targets = new Set<Element>()
  cb: (entries: { target: Element }[]) => void
  constructor(cb: FakeRO['cb']) { this.cb = cb; FakeRO.live.add(this) }
  observe(el: Element) { this.targets.add(el); queueMicrotask(() => { if (this.targets.has(el)) this.cb([{ target: el }]) }) }
  unobserve(el: Element) { this.targets.delete(el) }
  disconnect() { this.targets.clear(); FakeRO.live.delete(this) }
  static fire() { for (const ro of [...FakeRO.live]) if (ro.targets.size) ro.cb([...ro.targets].map(target => ({ target }))) }
}

// ---------------------------------------------------------------- the layout model
const PANE = { w: 600, h: 800 }, GAP = 14
const shownPane = (el: Element) => {
  const html = document.documentElement, mode = html.getAttribute('data-axt-pdf-mode') ?? 'bilingual', narrow = html.hasAttribute('data-axt-narrow')
  return el.id === 'left' ? mode !== 'translation' && !(mode === 'bilingual' && narrow) : mode !== 'original'
}
const isPane = (el: Element) => el.classList?.contains('viewerContainer')
const isStack = (el: Element) => el.classList?.contains('pdfViewer')
const isPage = (el: Element) => el.classList?.contains('page') && !!el.parentElement && isStack(el.parentElement)
const px = (v: string) => Number.parseFloat(v) || 0
const stackHeight = (stack: Element) => {
  let h = GAP, n = 0
  for (const c of stack.children) if (isPage(c)) { h += px((c as HTMLElement).style.height) + GAP; n++ }
  return n ? h : 0
}
/** reads of the layout, counted while `counting` (the tests that hold a step reads none) */
export const reads = { counting: false, n: 0, log: [] as string[] }
const read = (what: string) => { if (reads.counting) { reads.n++; reads.log.push(what) } }
const scrolls = new WeakMap<Element, number>()
export function installLayout() {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const define = (name: string, d: PropertyDescriptor) => {
    saved.set(name, Object.getOwnPropertyDescriptor(proto, name) ?? Object.getOwnPropertyDescriptor(Element.prototype, name))
    Object.defineProperty(proto, name, { configurable: true, ...d })
  }
  const top = (el: HTMLElement) => {
    let y = GAP
    for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (isPage(s)) y += px((s as HTMLElement).style.height) + GAP
    return y
  }
  // a pane's box is its scroller's: at (0, 40) on the left, (608, 40) on the right, its pages' offsetParent
  define('offsetTop', { get(this: HTMLElement) { read('offsetTop'); return isPage(this) ? top(this) : isPane(this) ? 40 : 0 } })
  define('offsetLeft', { get(this: HTMLElement) { return isPane(this) ? (this.id === 'left' ? 0 : 608) : 0 } })
  define('offsetHeight', { get(this: HTMLElement) { read('offsetHeight'); return isPage(this) ? px(this.style.height) : isStack(this) ? stackHeight(this) : 0 } })
  define('offsetWidth', { get(this: HTMLElement) { return isPage(this) ? px(this.style.width) : 0 } })
  define('offsetParent', { get(this: HTMLElement) { return isPage(this) ? (this.parentElement as HTMLElement).parentElement : isStack(this) ? this.parentElement : null } })
  define('clientTop', { get() { return 0 } })
  define('clientLeft', { get() { return 0 } })
  define('clientHeight', { get(this: HTMLElement) { read('clientHeight'); return isPane(this) ? (shownPane(this) ? PANE.h : 0) : isPage(this) ? px(this.style.height) : 0 } })
  define('clientWidth', { get(this: HTMLElement) { read('clientWidth'); return isPane(this) ? (shownPane(this) ? PANE.w : 0) : isPage(this) ? px(this.style.width) : 0 } })
  define('scrollHeight', { get(this: HTMLElement) { read('scrollHeight'); if (!isPane(this)) return 0; const s = this.querySelector('.pdfViewer'); return Math.max(this.clientHeight, s ? stackHeight(s) : 0) } })
  define('scrollTop', {
    get(this: HTMLElement) { return scrolls.get(this) ?? 0 },
    set(this: HTMLElement, v: number) {
      // the browser's own clamp, not a read of the code under test
      const was = reads.counting
      reads.counting = false
      const most = isPane(this) ? Math.max(0, this.scrollHeight - this.clientHeight) : 0
      reads.counting = was
      const next = Math.round(Math.min(most, Math.max(0, v)))
      if (next === (scrolls.get(this) ?? 0)) return
      scrolls.set(this, next)
      queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
    },
  })
  define('scrollLeft', { get() { return 0 }, set() {} })
  define('getBoundingClientRect', {
    value(this: HTMLElement) {
      read('getBoundingClientRect')
      const rect = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, x, y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} })
      if (isPane(this)) return rect(this.id === 'left' ? 0 : 608, 40, this.clientWidth, this.clientHeight)
      if (isStack(this)) { const pane = this.parentElement as HTMLElement; const b = pane.getBoundingClientRect(); return rect(b.left, b.top - pane.scrollTop, PANE.w, stackHeight(this)) }
      if (isPage(this)) { const pane = (this.parentElement as HTMLElement).parentElement as HTMLElement; const b = pane.getBoundingClientRect(); return rect(b.left, b.top + top(this) - pane.scrollTop, px(this.style.width), px(this.style.height)) }
      return rect(0, 0, 0, 0)
    },
  })
  return () => {
    for (const [name, d] of saved) { if (d) Object.defineProperty(proto, name, d); else delete proto[name] }
  }
}
/** where a point of PDF units on page `n` of a pane shows on the screen (the layout model's), by that page's viewport */
export function clientOf(pane: HTMLElement, n: number, x: number, y: number) {
  const page = pane.querySelectorAll<HTMLElement>(':scope > .pdfViewer > .page')[n - 1] as HTMLElement
  const vp = (FakePDFViewer.made[0] as FakePDFViewer).getPageView(n - 1)?.viewport as FakeViewport
  const [vx, vy] = vp.convertToViewportPoint(x, y)
  const b = page.getBoundingClientRect()
  return { clientX: b.left + (vx as number), clientY: b.top + (vy as number) }
}
/** the reader's page as App.tsx draws it: two panes, each a scroller and its page stack */
export function drawPanes() {
  document.body.innerHTML = '<main class="doc"><section class="pane" data-side="left"><div class="viewerContainer" id="left"><div class="pdfViewer"></div></div></section><section class="pane" data-side="right"><div class="viewerContainer" id="right"><div class="pdfViewer"></div></div></section></main>'
  return { left: document.getElementById('left') as HTMLElement, right: document.getElementById('right') as HTMLElement }
}
