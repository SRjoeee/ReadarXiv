// reader-view.mjs's types: the one reading view both readers run (docs/PDF-READER.md §11.7). Browser; no extension module
// and no pdfjs-dist: PDF.js is the host's kit, so every PDF.js type here is structural
import type { LayerDocument, LinkRecord, TextLayerData } from '../layer-proto/reader.mjs'
import type { BuiltTextLayer } from './text-layer.mjs'
import type { OutlineEntry } from './outline'

export type Side = 'left' | 'right'
export type Display = 'original' | 'bilingual' | 'translation'
export type Zoom = number | 'page-width' | 'page-fit' | 'page-actual'

/** a PDF.js document as the view calls it (PDFDocumentProxy, structurally) */
export interface ViewDocument extends LayerDocument {
  getData(): Promise<Uint8Array>
  getMetadata(): Promise<unknown>
  getOutline(): Promise<unknown[] | null>
  getDestination(id: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
}
/** a document's loading: PDF.js's PDFDocumentLoadingTask (getDocument's answer), or any object of its shape (the web's
 *  ranged task, whose PDF.js task begins after its first range is read) */
export interface DocumentTask {
  readonly promise: Promise<ViewDocument>
  /** set by the caller (the view's 'loading' event); PDF.js declares it `Function` */
  // biome-ignore lint/complexity/noBannedTypes: PDF.js's own declaration of the property, which a task of its must meet
  onProgress: Function | ((p: { loaded: number; total: number }) => void) | null
  destroy(): Promise<void>
}
/** where the original's bytes come from, the host's alone: called once an open, with the view's getDocument options; the
 *  task it returns is the view's from then on (destroyed when superseded, dropped or disposed). A throw is a failed open */
export type DocumentOpener = (options: Readonly<Record<string, unknown>>) => DocumentTask
/** the layer's composed document: arXiv's PDF ‖ every tail told (null for none), opened by the layer side */
export type ComposedOpener = (tail: Uint8Array | null, options: Readonly<Record<string, unknown>>) => DocumentTask
/** the host's PDF.js build (the web: modern or legacy); `assets` the getDocument options its data files are found by
 *  (cMapUrl, cMapPacked, standardFontDataUrl, wasmUrl). The view calls `lib.AnnotationMode` alone of the library; the viewer's
 *  `TextLayerBuilder` builds a laid page's text layer (text-layer.mjs; none given: the laid pages have none) */
export interface PdfJsKit {
  lib: unknown
  viewer: { EventBus: unknown; PDFViewer: unknown; PDFPageView: unknown; PDFLinkService: unknown; LinkTarget: unknown; TextLayerBuilder?: unknown }
  assets: Readonly<Record<string, unknown>>
}
/** the look the view reads: the highlight on or off. The rest is the host's sheet (the panes swapped, dimmed pages, the
 *  theme, the highlight's colour), held here so that one object carries the reader's look */
export interface ViewPrefs { swapped: boolean; dimPages: boolean; theme: 'light' | 'dark'; highlight: boolean }
/** the names the view gives to assistive technology, in the interface's language, read again on <html lang>. `linkName`: a
 *  link of the layer with no glyph under it (an image, a symbol), by where it goes; absent, or '' for one, the view's
 *  placeholder (links.mjs LINK_NAME_PLACEHOLDER) */
export interface ViewWords {
  pageName(side: Side, page: number): string
  sideName(side: Side): string
  linkName?(to: { url: string } | { internal: true }): string
}
export interface ViewClock {
  now(): number
  frame(cb: () => void): number
  cancel(id: number): void
  later(cb: () => void, ms: number): number
  clear(id: number): void
}
export interface ReaderHost {
  /** each pane's scroller (absolutely positioned; its page stack, `.pdfViewer`, inside it or made by the view) */
  panes: Record<Side, HTMLElement>
  pdfjs: PdfJsKit
  words: ViewWords
  prefs: { get(): ViewPrefs; subscribe(listener: (p: ViewPrefs) => void): () => void }
  links: { openExternal(url: string): void }
  clock?: ViewClock
  /** 'timer' where no scrollend event comes; 'native' (the default) where it does */
  scrollEnd?: 'native' | 'timer'
  /** the paper's title where its PDF's metadata has none; absent: no request beyond the PDF's metadata */
  titleFallback?(): Promise<string>
  /** the view's events and its layer side's, on one channel */
  emit(event: ViewEvent): void
}
export interface ReaderView {
  /** the original in the left pane. A newer call supersedes one loading: the older task destroyed, its call 'superseded'.
   *  'opened' once its pages are laid out and the right's places take its page count, sizes and zoom */
  showOriginal(open: DocumentOpener): Promise<'opened' | 'superseded' | 'failed'>
  /** let go where `task` is the one shown: the places' page views over it destroyed, then the viewer emptied, then the
   *  task destroyed; the places kept at their sizes (the skeleton), 'dropped' emitted. False for any other task */
  dropOriginal(task: DocumentTask): boolean
  /** the original's bytes, read through its document (a ranged one reads the rest); null with none */
  originalData(): Promise<Uint8Array> | null
  /** the original's bytes all in, as its document loads them of itself (nothing asked for them, unlike originalData, which
   *  asks for every byte not yet in: one more read of what a stream is still bringing); null with none */
  originalLoaded(): Promise<void> | null
  /** the display applied; never written to the host's preferences */
  setDisplay(d: Display): void
  setSync(on: boolean): void
  /** a window too narrow for two panes; `display`, the host's rule, applied in the same layout */
  setNarrow(on: boolean, o?: { display?: Display }): void
  /** the right zoomed through the left's viewer; the places follow */
  zoomTo(z: Zoom): void
  zoomBy(factor: number): void
  pinch(side: Side, factor: number, origin: [number, number]): void
  goToPage(side: Side, page: number): void
  goToUnit(id: number): void
  /** a pane made the leading one, as a press in it makes it */
  lead(side: Side): void
  /** the harness's hooks: counts, the latest event and what is shown now, never a page's text (bounded) */
  probe(): Readonly<Record<string, number | string | boolean | null>>
  /** its layer side first, then everything the view made: listeners, observers, animations, documents, places */
  dispose(): void
}
export declare function createReaderView(host: ReaderHost): ReaderView
/** how long after a pinch's last step it is committed: shown by transform until then (docs/PDF-READER.md §6.8) */
export declare const PINCH_COMMIT_MS: number
export type ViewEvent =
  | { type: 'loading'; loaded: number; total: number }
  | { type: 'opened'; pages: number }
  | { type: 'failed'; error: string }
  | { type: 'dropped' }
  | { type: 'paper'; title: string }
  /** a pane's page in view; `laid`: on the right, whether its page shows the layer */
  | { type: 'page'; side: Side; page: number; pages: number; laid?: boolean }
  /** `zoom`: the fit applied, null after a step or a pinch */
  | { type: 'scale'; scale: number; zoom: Zoom | null }
  | { type: 'display'; display: Display }
  | { type: 'sync'; on: boolean; available: boolean }
  | { type: 'outline'; entries: OutlineEntry[] }
  | { type: 'heading'; id: number | null }
  /** `laid`: the pages the door laid; `original` (none where 0): the pages asked near the view that the open door shows as arXiv's
   *  by the rule (a page no part lays a line on: layer-side.mjs noLayoutPage), settled with nothing to lay */
  | { type: 'layer'; state: 'opening' | 'open' | 'refused'; why?: string; laid: number; total: number; original?: number }

// ---------------------------------------------------------------- what the view's layer side takes (not view.mjs's)
/** a rectangle on one of a side's pages, in its PDF units */
export interface PageBox { page: number; x0: number; y0: number; x1: number; y1: number }
/** what a pane paints for the highlight, in its own pages' coordinates (the shapes seam): a unit's runs (one page and one
 *  column of it each, the objects the paint keeps what it drew by; a table's cell no unit holds by its id), a run's block, a
 *  sentence's shape by the unit's starts, whether a unit's shapes hold its words by its starts (undefined where that is not
 *  to be told in a frame), what a point lights and what a click there levels by. No float is painted (§17.1) */
export interface Shapes<R extends { page: number } = { page: number }> {
  runs(id: number): readonly R[]
  block(run: R, padX: number): PageBox
  sentence(run: R, starts: Int32Array, s: number, padX: number): PageBox[]
  fits(id: number, starts: Int32Array, now: boolean): boolean | undefined
  hit(page: number, x: number, y: number, padX: number, startsOf: (id: number) => Int32Array | null | undefined): { id: number; s: number } | null
  click(page: number, x: number, y: number, padX: number, startsOf: (id: number) => Int32Array | null | undefined): { id: number; line: number; f: number } | null
}
/** a place as a page view is read (its element, and the original's viewport and page box for that page) */
export interface PlaceView { id: number; div: HTMLElement; viewport: { width: number; height: number; scale: number; rotation: number; convertToViewportPoint(x: number, y: number): number[]; convertToPdfPoint(x: number, y: number): number[] } | null; pdfPage: { view: number[] } | null }
/** what a place shows: the layer's content, the original's page view, the skeleton, or nothing (far) */
export type PlaceContent = 'layer' | 'original' | 'skeleton' | 'none'
/** the units located, as the layer side gives them: the unit at a point of a page (PDF units), a unit's first rectangle,
 *  and the page the contents give a heading not located */
export interface ViewUnits { unitAt(page: number, x: number, y: number): number | null; firstRect(id: number): PageBox | null; pageOf(id: number): number | null }
/** the view's handle for its layer side (layer-side.mjs): the right pane, its places, the left's pages, the paint's seam */
export interface Internals {
  readonly pane: HTMLElement
  places: {
    count(): number
    page(n: number): HTMLElement | null
    view(n: number): PlaceView | null
    near(n: number): boolean
    /** whether place n's page view is the one the places are drawing the original's page on now */
    drawing(n: number): boolean
    contentOf(n: number): PlaceContent
    /** place n's box in CSS px as PDF.js sizes the left's page n (its viewport floored to the place's rounding), else null */
    box(n: number): { width: number; height: number } | null
    /** the layer's content in place n, in place: its page view destroyed with its canvas first; size and scroll unchanged.
     *  `blank`: content that shows nothing (a page let go far from the view): the place is no page shown (contentOf 'none') */
    swap(n: number, content: HTMLElement, o?: { blank?: boolean }): boolean
    /** place n back to its pre-layer content */
    restore(n: number): void
    /** the places near the view but not in it drawn from now on: the layer side's word that its first page is there, or that
     *  there is none (places.mjs AHEAD_HOLD_MS bounds the wait where nothing says so) */
    letAheadGo(): void
    /** whether they still wait */
    aheadHeld(): boolean
  }
  left: {
    doc(): ViewDocument | null
    scale(): number
    /** the left's page n as PDF.js holds it (its operator list drawn: the floats' inputs), once laid out */
    pdfPage(n: number): unknown
    /** whether page n of the left is being drawn (its page view running or paused) */
    drawing?(n: number): boolean
  }
  /** the host's PDF.js library (OPS, AnnotationMode) and its getDocument options (assets) */
  readonly lib: unknown
  readonly assets: Readonly<Record<string, unknown>>
  /** the page at the reading line of the pane read and the line's height on it (PDF units, y up); null with none */
  reading(): { page: number; y: number | null } | null
  /** the right's page at the middle of its view (0 with no places, or the pane out of the display) */
  centre(): number
  words: ViewWords
  dpr(): number
  clock: ViewClock
  setShapes(side: Side, shapes: Shapes | null, starts?: ReadonlyMap<number, Int32Array> | null): void
  setUnits(units: ViewUnits | null): void
  /** the view's paint done for a page PDF.js drew (either pane), its error where the drawing failed */
  onPageDrawn(listener: (side: Side, page: number, error: unknown) => void): () => void
  /** the pointer over page `page` of a pane: a want of that page (the highlight's data flow) */
  onWant(listener: (side: Side, page: number) => void): () => void
  /** a place come near the view or gone far */
  onNear(listener: (page: number, near: boolean) => void): () => void
  /** the original shown or let go */
  onOriginal(listener: (state: 'opened' | 'dropped', doc: ViewDocument | null) => void): () => void
  /** the left's scale changed, and the places with it: a step's or a pinch's drawn again `drawingDelay` ms after the last
   *  (-1: at once), for the copies drawn at the pane's resolution */
  onScale(listener: (scale: number, drawingDelay: number) => void): () => void
  /** a pane scrolled (each scroll event), for the layer side's re-asks and the heading read */
  onScrolled(listener: (side: Side) => void): () => void
  /** the view's one layer side, disposed first by the view's own dispose; a second while one lives throws */
  attach(side: { dispose(): void }): () => void
  emit(event: ViewEvent): void
  /** the links of the layer's page `n` over its place (links.mjs linkLayer, over the place's viewport): followed inside the
   *  paper on the right pane, out of it through the host; null where none can be carried */
  links(n: number, records: readonly LinkRecord[] | null | undefined): HTMLDivElement | null
  /** the text layer of the layer's page `n` over its place (text-layer.mjs textLayer: PDF.js's own builder, the host's pdf_viewer
   *  TextLayerBuilder, over the place's viewport), its translated spans in `lang`; null where nothing can be placed or the host's
   *  PDF.js has no builder */
  text(n: number, data: TextLayerData, lang: string): Promise<BuiltTextLayer | null>
  /** a unit, or one of its sentences, lit as the pointer would light it (-1 for the whole); null for nothing */
  light(id: number | null, s?: number): void
}
/** the view's handle; module-private (view.mjs does not export it) */
export declare function internalsOf(view: ReaderView): Internals
