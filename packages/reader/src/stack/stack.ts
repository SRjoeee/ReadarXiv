// The page stack (design §4.5 "both panes are one kind of thing"): a slot for every page of a document, all under one scale,
// each slot PDF.js's own page view of what that page shows now, drawn by the reader's one scheduler (in view, then near).
// Built for the right pane first; the left is put on it only if it matches today's left (stage 2, deliverable 7).
//
// - **Slots.** A slot is the page's box, sized by PDF.js's own rule (setLayerDimensions: `round(down, var(--total-scale-factor)
//   × the page's size, var(--scale-round-x))`) under the stack's `--scale-factor`, so that a slot of either pane and a page box of
//   PDF.js's viewer of the same page at the same scale are the same box, with nothing measured. Every slot is page 1's size until
//   its own page is read (a page's setup reads its page object, a range the store shares, never its content: W pdfjs.ts
//   eagerPages, whose job this is now): read in order once page 1 is drawn.
// - **What a slot shows** is asked of the owner (`contentOf(n)`): a page view (a document, the optional content it is drawn
//   with, whether PDF.js's own text and annotation layers are on it, and what is laid over it), the left's own drawing of the
//   page (`left`: a copy of the left pane's canvas while the page waits for its layer, docs/PDF-READER.md §11.7, no second
//   render), or the skeleton of a page of text (no original to draw). A page view is drawn beside the shown one and swapped in,
//   in one task, once it has drawn: the slot's size and the pane's scroll never change, and nothing blank shows.
// - **Near and far.** A slot one pane's height above or below the view is near (an IntersectionObserver, which sees a slot where
//   it shows, the follower's transform and all: nothing is lent). A far slot lets its drawing go, canvas and all, but a laid
//   page's (one with an overlay), which is kept off the view within the device's budget, the farthest from the view let go
//   first, and put back as it comes near (no flash coming back, §11.8); and a page that holds the focus, kept in place until
//   the focus leaves it (read a task later: a native Tab clears the focus before it arrives at the next link). A kept drawing
//   stays in its slot out of the layout tree (`data-axt-kept` on the slot, `display: none` on its holder: styles.ts says why):
//   every face added to the document re-lays every text node laid out, and a reader keeping a whole paper's drawings in layout
//   paid that over 41-49k objects a time (verification/reader-perf.md §1); its slot keeps its box, so the pane's height, the
//   sync's places and the near observer never see it go.
// - **Scale.** One scale for every slot; a zoom's steps scale the page views by CSS at once and draw them again `drawingDelay`
//   after the last (PDF.js's own update), the stack marked `data-axt-scaling` from the first step to TEXT_BACK_MS after the
//   redraw (the laid pages' text layers out of layout meanwhile, styles.ts); a laid page's own drawings (its crops) drawn again
//   RECOPY_MS after the last change (`again`). `scale` is told once the layout stands at the new scale, `drawn` each time a page
//   is drawn at it.
// - **Focus.** A slot's content going (swapped) gives the focus back to the link of the same rank in what it shows now, else to
//   the slot (a stop of its own), so it never falls to <body> (places.mjs focusIn/keepFocus, kept).
// - **Detail.** At a high zoom PDF.js draws a page at a lower resolution and the part in view sharp (its detail view): the stack
//   tells each page view in view its visible area after a scroll and a scale (`updateVisibleArea`, public), and draws its detail
//   view through the scheduler.
// - **Parsed pages.** PDF.js keeps a page's operator list and decoded images until its `cleanup()`; a page view's reset keeps
//   them. A page of a laid page's document is kept parsed for the last WARM_PAGES pages let go (visibility.mjs WARM_PAGES), the
//   oldest cleaned up past it; a page of the original's document is cleaned up only where the left does not hold it (`shared`:
//   never a page the other pane still shows, engine-view-host §16).
import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { PDFPageView } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { Kit } from '../pdfjs/kit.ts'
import type { Clock } from './clock.ts'
import type { Job, Scheduler } from './scheduler.ts'

/** a document's optional content configuration, as PDF.js reads it */
export type OptionalContentConfig = Awaited<ReturnType<PDFDocumentProxy['getOptionalContentConfig']>>
/** CSS px a PDF unit at scale 1 (PDF.js's PixelsPerInch.PDF_TO_CSS_UNITS) */
export const PDF_TO_CSS = 96 / 72
/** how far past the view a slot is near: one pane's height above and below */
export const NEAR = '100% 0px 100% 0px'
/** how long after a keyboard's jump the slot jumped to may still take the focus when it comes to show its page */
export const FOCUS_WAIT_MS = 2000
/** how long after a zoom's or a pinch's steps are drawn again the laid pages' text layers stay out of style and layout (ms),
 *  places.mjs TEXT_BACK_MS: steps a little further apart than their drawing delay find them still out */
export const TEXT_BACK_MS = 500
/** how long after a zoom's last step a laid page's own drawings (its crops) are drawn again: PDF.js draws its page 400 ms after
 *  it (layer-side.mjs RECOPY_MS) */
export const RECOPY_MS = 600
/** the longest a laid page's drawing waits for the left's page being drawn before it is put in place (layer-side.mjs
 *  LEFT_WAIT_MS): the two panes paint within one frame of each other, the left first, unless the left is slower than this */
export const LEFT_WAIT_MS = 1500
/** the pages of a laid page's document kept parsed (operator lists, decoded images) after their drawings go (visibility.mjs) */
export const WARM_PAGES = 4
/** the mark of a slot whose drawing is kept off the view: the reader's sheet holds the drawing out of the layout tree */
export const KEPT = 'data-axt-kept'
/** the most device pixels of laid pages' drawings kept off the view on any device, on iOS and iPadOS, and the share of a device's
 *  memory they may take (layer-side.mjs KEEP_PIXELS, IOS_KEEP_PIXELS, KEEP_SHARE, KEEP_MEMORY_GB: docs/PDF-READER.md §11.8) */
export const KEEP_PIXELS = 2 ** 25
export const IOS_KEEP_PIXELS = 2 ** 23
export const KEEP_SHARE = 1 / 64
export const KEEP_MEMORY_GB = 4
/** PDF.js's page view states (pdf_viewer.mjs RenderingStates) */
const INITIAL = 0,
  FINISHED = 3

/**
 * The device pixels of laid pages' drawings kept off the view on this device: KEEP_SHARE of its memory (`deviceMemory`, GB,
 * where the browser tells it, else KEEP_MEMORY_GB) at 4 bytes a pixel, never fewer than two of its screens' pixels, never more
 * than KEEP_PIXELS, nor than IOS_KEEP_PIXELS on iOS or iPadOS (layer-side.mjs keepBudget, carried)
 */
export function keepBudget(o: { deviceMemory?: number; screenPixels?: number; ios?: boolean } = {}): number {
  const gb =
    typeof o.deviceMemory === 'number' && Number.isFinite(o.deviceMemory) && o.deviceMemory > 0
      ? o.deviceMemory
      : KEEP_MEMORY_GB
  const byMemory = Math.floor((gb * 2 ** 30 * KEEP_SHARE) / 4)
  const floor =
    typeof o.screenPixels === 'number' && Number.isFinite(o.screenPixels) && o.screenPixels > 0 ? 2 * o.screenPixels : 0
  return Math.min(o.ios ? IOS_KEEP_PIXELS : KEEP_PIXELS, Math.max(byMemory, floor))
}
/** the kept drawings let go past `budget` (device pixels), in order: the farthest from page `at` (the page in the middle of the
 *  view) first, the one kept longest first between two as far (layer-side.mjs keepDrawing) */
export function pastBudget(kept: readonly { n: number; px: number }[], at: number, budget: number): number[] {
  let total = kept.reduce((a, x) => a + x.px, 0)
  const left = [...kept]
  const out: number[] = []
  while (total > budget && left.length) {
    let far = 0
    for (let i = 1; i < left.length; i++)
      if (Math.abs((left[i] as { n: number }).n - at) > Math.abs((left[far] as { n: number }).n - at)) far = i
    const [x] = left.splice(far, 1) as [{ n: number; px: number }]
    total -= x.px
    out.push(x.n)
  }
  return out
}
/** whether the browser runs on iOS or iPadOS (an iPad says it is a Mac, with a touch screen): its WebKit, whatever its name */
export const onIos = (
  nav: { userAgent?: string; maxTouchPoints?: number } | undefined = globalThis.navigator,
): boolean =>
  !!nav &&
  (/\biP(?:hone|ad|od)\b/.test(nav.userAgent ?? '') ||
    (/\bMacintosh\b/.test(nav.userAgent ?? '') && (nav.maxTouchPoints ?? 0) > 1))
const deviceKeep = (): number => {
  const g = globalThis as { navigator?: { deviceMemory?: number }; screen?: { width?: number; height?: number } }
  const dpr = globalThis.devicePixelRatio || 1
  return keepBudget({
    ...(g.navigator?.deviceMemory !== undefined ? { deviceMemory: g.navigator.deviceMemory } : {}),
    screenPixels: (g.screen?.width ?? 0) * (g.screen?.height ?? 0) * dpr * dpr,
    ios: onIos(),
  })
}

/** a page view of a document: what a slot shows of a page that is drawn */
export interface ViewContent {
  kind?: 'view'
  /** equal keys are the same drawing: a content of the key shown is not drawn again */
  key: string
  doc: PDFDocumentProxy
  /** the optional content it is drawn with; null: the document's own (read once by the owner, never per render) */
  config: Promise<OptionalContentConfig> | null
  /** PDF.js's own text layer and links over it (a page that is arXiv's); a laid page brings its own in `over` */
  own: boolean
  /** what is laid over the page view once it has drawn (the composed page's overlay, text layer, links): made then, in the
   *  drawing's own turn of the scheduler, before the swap */
  over: ((at: SlotAt) => Promise<HTMLElement | null> | HTMLElement | null) | null
  /** what is laid over drawn again at a new scale, RECOPY_MS after a zoom (the crops), in the slot's turn of the scheduler */
  again?: ((over: HTMLElement, at: SlotAt) => Promise<void>) | null
  /** what is laid over let go while the drawing is kept off the view, a small copy kept of it (the crops' page-sized bitmap: a
   *  far page holds one bitmap, its page view's): the device pixels the copy holds */
  away?: ((over: HTMLElement) => number) | null
  /** what `away` let go put back from its copy, in the caller's task, as it was: false where no copy fits (the scale moved while
   *  it was far), to be drawn anew (`again`) before the drawing is shown */
  back?: ((over: HTMLElement, at: SlotAt) => boolean) | null
  /** what is laid over let go with its drawing (its text layer out of PDF.js's registry) */
  free?: ((over: HTMLElement) => void) | null
}
/** the left pane's own drawing of the page, copied (no second render), while it waits for its layer; `fallback` drawn where the
 *  left's drawing of it fails */
export interface LeftContent {
  kind: 'left'
  key: string
  fallback: ViewContent
}
/** a page of text in grey, while there is no original to draw (round 4's skeleton) */
export interface SkeletonContent {
  kind: 'skeleton'
  key: string
}
export type PageContent = ViewContent | LeftContent | SkeletonContent
/** a slot as `over` is given it: its page, the page view drawn, its viewport, aborted once that drawing goes */
export interface SlotAt {
  n: number
  view: PDFPageView
  viewport: PageViewport
  signal: AbortSignal
}

export interface StackEvents {
  /** page n drawn at `scale` with the content `key` (its first drawing at a scale, or again) */
  drawn: { n: number; scale: number; key: string; detail: boolean }
  /** the layout stands at a new scale */
  scale: { scale: number }
  near: { n: number; on: boolean }
  /** every page's own size is known */
  sized: { pages: number }
  /** a content swapped in */
  shown: { n: number; key: string; swapMs: number; drawMs: number }
  /** a page view's drawing, or what is laid over it, failed: let go, the slot keeps what it shows */
  failed: { n: number; key: string }
}
type Listener<K extends keyof StackEvents> = (e: StackEvents[K]) => void

/**
 * The page boxes' rounding the reader's panes share. PDF.js floors a page box to a multiple of its canvas's pixel fraction as
 * it draws it (`--scale-round-x`, `-y`: from the output scale, which a large page at a high zoom restricts), so that a page drawn
 * on one pane and not yet on the other would be a few pixels apart (2307.16209v1 p2 at 2.37: 1894 against 1899 px). The rounding
 * is a function of the page's viewport and the screen alone, so the first drawing of page n at a scale tells it for every pane
 */
export interface Rounding {
  get(n: number, scale: number): readonly [string, string] | null
  set(n: number, scale: number, x: string, y: string): void
  on(f: (n: number) => void): () => void
}
export function roundingTable(): Rounding {
  const at = new Map<number, { scale: number; x: string; y: string }>()
  const listeners = new Set<(n: number) => void>()
  return {
    get(n, scale) {
      const r = at.get(n)
      return r && r.scale === scale ? [r.x, r.y] : null
    },
    set(n, scale, x, y) {
      const r = at.get(n)
      if (r && r.scale === scale && r.x === x && r.y === y) return
      at.set(n, { scale, x, y })
      for (const f of [...listeners]) f(n)
    },
    on(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
  }
}

/** the left pane's pages, as a slot that shows the left's drawing reads them */
export interface LeftPages {
  /** the left's canvas of page n where it is drawn at its page view's scale now, else null */
  canvas(n: number): HTMLCanvasElement | null
  /** the left's page box of page n (its loading mark is mirrored from its classes), or null */
  box(n: number): HTMLElement | null
  /** resolves once the left's page n is drawn where it is being drawn now (in the task it is told drawn in), else null */
  drawing(n: number): Promise<void> | null
  /** whether the left holds page n (its page view drawn or being drawn): its parse is the left's then */
  holds(n: number): boolean
}

export interface StackOptions {
  scroller: HTMLElement
  kit: Kit
  scheduler: Scheduler
  clock: Clock
  /** the page's accessible name in the interface's language */
  name(n: number): string
  /** PDF.js's link service for a page view's own annotation layer (its links), or null for none */
  links: unknown | null
  /** the boxes' rounding shared with the reader's other pane (default its own) */
  rounding?: Rounding
  /** the device pixels of laid pages' drawings kept off the view (a host's own; 0 keeps none); default the device's
   *  (keepBudget) */
  keepPixels?: number
  /** the left pane's pages (a slot showing the left's drawing, a laid page waiting for the left's, parses shared) */
  left?: LeftPages
  /** the paper's language, on the text layer of a page view of the original's words (docs/PDF-READER.md §13) */
  sourceLang?: string
  warn?(what: string, e: unknown): void
}

interface Drawing {
  key: string
  content: PageContent
  holder: HTMLElement
  /** its page view (a page view's content), else null */
  view: PDFPageView | null
  over: HTMLElement | null
  /** the copy of the left's canvas it shows (a left content's), else null */
  copy: HTMLCanvasElement | null
  /** the scale its canvas was last drawn at */
  drawnAt: number
  job: Job | null
  detailJob: Job | null
  againJob: Job | null
  /** its page view's drawing, ms */
  drawMs: number
  /** aborted once it goes (its overlay's renders with it) */
  ac: AbortController
  /** a left content's: waiting for the left's drawing (its loading mark mirrored meanwhile) */
  mirror: MutationObserver | null
  /** a drawing of a page ahead (drawn while its slot is far, kept off the view): told whether it is kept */
  ahead: ((kept: boolean) => void) | null
}
interface Slot {
  n: number
  div: HTMLElement
  shown: Drawing | null
  next: Drawing | null
  near: boolean
  inView: boolean
  /** a laid drawing kept off the view (its device pixels), else 0; when it was kept (an order) */
  kept: number
  keptAt: number
}

export interface Stack {
  /** the stack element (what the follower's transform moves) */
  readonly element: HTMLElement
  readonly pages: number
  readonly scale: number
  /** one slot a page of `doc`, sized as page 1 until each page's own size is read; resolves once page 1's size is known.
   *  null: no slot */
  layout(doc: PDFDocumentProxy | null, scale: number): Promise<void>
  /** the document let go, the slots kept at their sizes: every drawing let go, near slots asked again (the skeleton) */
  blank(): void
  /** the scale of every slot; `drawingDelay` ≥ 0: CSS at once, drawn again that long after (a zoom's step) */
  setScale(scale: number, drawingDelay?: number): void
  /** what slot n is to show (asked at each need); set by the owner */
  contentOf: (n: number) => PageContent | null
  /** slot n's content (every slot's without n) asked again: drawn where near and changed */
  refresh(n?: number): void
  /** the left's page n drawn (`ok` false where its drawing failed): a slot showing its drawing takes it again */
  leftDrawn(n: number, ok: boolean): void
  /** the laid drawings kept off the view that `drop` names let go (all by default): another attempt's, another target's */
  dropKept(drop?: (key: string, n: number) => boolean): void
  /** slot n's content drawn now though the slot is far (a page ahead), after the view's own drawings, and kept off the view
   *  within the budget: resolves whether it is kept (false: let go, failed, or given up by `signal`) */
  ahead(n: number, signal: AbortSignal): Promise<boolean>
  page(n: number): HTMLElement | null
  viewport(n: number): PageViewport | null
  /** the content key slot n shows, or null */
  showing(n: number): string | null
  near(n: number): boolean
  inView(n: number): boolean
  /** the page in the middle of the view (its slots in view), or 0 */
  centre(): number
  /** whether the scheduler is drawing a page view of slot n now (the original's or a laid page's) */
  drawing(n: number): boolean
  focus(n: number): void
  /** the near window held (a pinch shown by transform) and told at its end as it stands then */
  holdNear(on: boolean): void
  /** the pages ahead held (on) or let go: a slot near the view but not in it waits to draw its original's page view meanwhile
   *  (its page view made all the same; one that comes into view is drawn at once: only when a page is drawn changes, never
   *  what; places.mjs letAheadGo) */
  hold(on: boolean): void
  readonly held: boolean
  on<K extends keyof StackEvents>(type: K, f: Listener<K>): () => void
  probe(): Record<string, number>
  dispose(): void
}

export function createStack(o: StackOptions): Stack {
  const { scroller, kit, scheduler, clock } = o
  // (a scroller the host's chrome renders holds its own `.pdfViewer`: taken, and left in place, emptied, at the end)
  const given = scroller.querySelector<HTMLElement>(':scope > .pdfViewer')
  const element = given ?? document.createElement('div')
  element.classList.add('pdfViewer', 'axt-stack')
  if (!given) scroller.append(element)
  const keepPixels = typeof o.keepPixels === 'number' ? Math.max(0, o.keepPixels) : deviceKeep()
  const round = o.rounding ?? roundingTable()
  let slots: Slot[] = []
  let doc: PDFDocumentProxy | null = null
  let gen = 0
  let scale = 1
  let disposed = false
  /** each page's viewport at scale 1, as read (page 1's for every page until its own) */
  let base: PageViewport[] = []
  let sized = 0
  const listeners = new Map<keyof StackEvents, Set<(e: unknown) => void>>()
  const tell = <K extends keyof StackEvents>(type: K, e: StackEvents[K]) => {
    for (const f of [...(listeners.get(type) ?? [])]) {
      try {
        f(e)
      } catch (err) {
        o.warn?.(`a ${type} listener`, err)
      }
    }
  }
  const counts = { made: 0, released: 0, swaps: 0, keptDropped: 0, restored: 0, copies: 0, agains: 0, cleaned: 0 }
  let redrawTimer = 0,
    textTimer = 0,
    againTimer = 0
  let contentOf: (n: number) => PageContent | null = () => null
  /** whether the pages ahead wait (hold), and the slots whose page view waits for it */
  let aheadHeld = false
  const waiting = new Set<Slot>()
  /** drawing d of slot s asked of the scheduler, unless it is an original's page view of a slot out of view while the pages
   *  ahead wait */
  function ask(s: Slot, d: Drawing) {
    if (!d.job) return
    if (aheadHeld && !s.inView && isView(d.content) && d.content.own) {
      waiting.add(s)
      return
    }
    scheduler.want(d.job)
  }
  const isView = (c: PageContent): c is ViewContent => c.kind === undefined || c.kind === 'view'

  // ---------------------------------------------------------------- near and in view
  let nearHeld: Map<Element, boolean> | null = null
  const near = new IntersectionObserver(
    (entries) => {
      if (nearHeld) {
        for (const e of entries) nearHeld.set(e.target, e.isIntersecting)
        return
      }
      nearEntries(entries.map((e) => ({ target: e.target, on: e.isIntersecting })))
    },
    { root: scroller, rootMargin: NEAR },
  )
  const slotOf = (el: Element): Slot | null => {
    const s = slots[Number((el as HTMLElement).dataset.pageNumber) - 1]
    return s && s.div === el ? s : null
  }
  function nearEntries(entries: { target: Element; on: boolean }[]) {
    for (const e of entries.sort(
      (a, b) =>
        Number((a.target as HTMLElement).dataset.pageNumber) - Number((b.target as HTMLElement).dataset.pageNumber),
    )) {
      const s = slotOf(e.target)
      if (!s || s.near === e.on) continue
      s.near = e.on
      if (s.near) {
        if (s.kept) unkeep(s, false)
        keptForFocus.delete(s)
        want(s)
      } else goFar(s)
      tell('near', { n: s.n, on: s.near })
    }
  }
  const inView = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = slotOf(e.target)
        if (!s) continue
        s.inView = e.isIntersecting
        if (s.inView && waiting.delete(s))
          for (const d of [s.next, s.shown]) if (d?.view?.renderingState === INITIAL) ask(s, d)
      }
      areaSoon()
    },
    { root: scroller, rootMargin: '0px' },
  )

  // ---------------------------------------------------------------- sizes
  const viewportAt = (n: number): PageViewport | null => {
    const v = base[n - 1]
    return v ? v.clone({ scale: scale * PDF_TO_CSS }) : null
  }
  function size(s: Slot) {
    const vp = viewportAt(s.n)
    if (!vp) return
    kit.lib.setLayerDimensions(s.div as HTMLDivElement, vp, true, false)
    const unit = (vp as unknown as { userUnit?: number }).userUnit ?? 1
    if (unit !== 1) s.div.style.setProperty('--user-unit', String(unit))
    else s.div.style.removeProperty('--user-unit')
    const r = round.get(s.n, scale)
    for (const [v, x] of [
      ['--scale-round-x', r?.[0] ?? ''],
      ['--scale-round-y', r?.[1] ?? ''],
    ] as const) {
      if (s.div.style.getPropertyValue(v) === x) continue
      if (x) s.div.style.setProperty(v, x)
      else s.div.style.removeProperty(v)
    }
  }
  /** a slot's rounding as its page view drew it (PDF.js sets --scale-round-x on its page box as it sizes its canvas), told to
   *  every pane */
  function rounding(s: Slot) {
    const div = s.shown?.view?.div
    if (!div || !s.shown) return
    round.set(
      s.n,
      s.shown.drawnAt,
      div.style.getPropertyValue('--scale-round-x'),
      div.style.getPropertyValue('--scale-round-y'),
    )
  }
  const unround = round.on((n) => {
    const s = slots[n - 1]
    if (s) size(s)
  })
  /** every page's own viewport read, in order (a page object each, never its content), the slots sized as each comes */
  async function readSizes(mine: number, d: PDFDocumentProxy) {
    for (let n = 2; n <= d.numPages; n++) {
      let page: PDFPageProxy
      try {
        page = await d.getPage(n)
      } catch {
        continue
      }
      if (mine !== gen) return
      base[n - 1] = page.getViewport({ scale: 1 })
      const s = slots[n - 1]
      if (s) size(s)
    }
    sized = d.numPages
    tell('sized', { pages: d.numPages })
  }

  // ---------------------------------------------------------------- drawings
  const rankOf = (s: Slot) => (!s.near ? null : s.inView ? 0 : 1)
  const holderOf = () => {
    const holder = document.createElement('div')
    holder.className = 'axt-slot-view'
    return holder
  }
  const drawingBase = (key: string, content: PageContent, holder: HTMLElement): Drawing => ({
    key,
    content,
    holder,
    view: null,
    over: null,
    copy: null,
    drawnAt: 0,
    job: null,
    detailJob: null,
    againJob: null,
    drawMs: 0,
    ac: new AbortController(),
    mirror: null,
    ahead: null,
  })
  /** a drawing of `content` for slot s: a page view in a holder of its own, out of the slot until it has drawn; the left's
   *  drawing (shown at once: its copy, or the left's loading mark until it comes); the skeleton */
  function drawingOf(s: Slot, content: PageContent): Drawing | null {
    if (content.kind === 'skeleton') {
      const holder = holderOf()
      holder.append(skeleton(s.n))
      return drawingBase(content.key, content, holder)
    }
    if (content.kind === 'left') return leftDrawing(s, content)
    return viewDrawing(s, content)
  }
  function viewDrawing(s: Slot, content: ViewContent): Drawing | null {
    const vp = viewportAt(s.n)
    if (!vp) return null
    const holder = holderOf()
    const V = kit.viewer
    const bus = new V.EventBus()
    const view = new V.PDFPageView({
      container: holder,
      id: s.n,
      scale,
      defaultViewport: vp,
      eventBus: bus,
      textLayerMode: content.own ? 1 : 0,
      annotationMode: content.own && o.links ? kit.lib.AnnotationMode.ENABLE : kit.lib.AnnotationMode.DISABLE,
      optionalContentConfigPromise: content.config ?? undefined,
      layerProperties: o.links ? ({ linkService: o.links } as never) : undefined,
      l10n: noL10n as never,
    } as ConstructorParameters<typeof V.PDFPageView>[0])
    // (the slot is the page's region, named; PDF.js's own name and landmark on its page go)
    view.div.removeAttribute('role')
    view.div.removeAttribute('data-l10n-id')
    view.div.removeAttribute('data-l10n-args')
    // (its text layer holds the original's words: marked as the paper's language, the layer alone, so that the page's name
    // and its links' names keep the interface's, reader-view.mjs sourceText)
    if (content.own && o.sourceLang) {
      const lang = o.sourceLang
      bus.on('textlayerrendered', (e: { source?: { textLayer?: { div?: HTMLElement } } }) =>
        e.source?.textLayer?.div?.setAttribute('lang', lang),
      )
    }
    counts.made++
    const d = drawingBase(content.key, content, holder)
    d.view = view
    const mine = gen
    d.job = {
      rank: () => (s.next === d || s.shown === d ? (d.ahead && !s.near ? 2 : rankOf(s)) : null),
      order: () => s.n,
      run: async () => {
        if (mine !== gen || (s.next !== d && s.shown !== d)) return
        if (!view.pdfPage) view.setPdfPage(await content.doc.getPage(s.n))
        if (view.renderingState !== INITIAL) return
        const at = view.scale
        const td = performance.now()
        try {
          await view.draw()
        } catch (e) {
          // (a drawing that fails, not one cancelled: let go and told, the slot keeping what it shows)
          if (mine !== gen || disposed || /cancel/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`)) return
          o.warn?.(`page ${s.n} drawn`, e)
          if (s.next === d) {
            release(d, s)
            s.next = null
            d.ahead?.(false)
          }
          tell('failed', { n: s.n, key: d.key })
          return
        }
        d.drawMs = performance.now() - td
        if (mine !== gen || disposed) return
        d.drawnAt = at
        // (a new content's overlay made before it is swapped in: the swap is one task)
        if (s.next === d && content.over && !d.over) {
          try {
            d.over = await content.over({ n: s.n, view, viewport: view.viewport, signal: d.ac.signal })
          } catch (e) {
            // (an overlay that cannot be made: the drawing let go, the slot keeps what it shows; told)
            if (d.ac.signal.aborted) return
            o.warn?.(`page ${s.n}'s overlay`, e)
            if (s.next === d) {
              release(d, s)
              s.next = null
              d.ahead?.(false)
            }
            tell('failed', { n: s.n, key: d.key })
            return
          }
          if (mine !== gen || disposed || s.next !== d) return
          // (the left first, or in the same frame: a laid page ready while the left's page is being drawn waits for it, at
          // most LEFT_WAIT_MS, and is put in place in the task the left's page is told drawn in)
          const left = o.left?.drawing(s.n)
          if (left) {
            await new Promise<void>((done) => {
              const t = clock.later(done, LEFT_WAIT_MS)
              void left.then(() => {
                clock.clear(t)
                done()
              })
            })
            if (mine !== gen || disposed || s.next !== d) return
          }
        }
        drawnNow(s, d)
      },
    }
    return d
  }
  /** the left's drawing of page n in a canvas of the slot's (one drawImage at its size: the same pixels, the slot's box the left
   *  page box's), the one before let go; the left's loading mark until it is drawn (places.mjs copyLeft, mirrorLoading) */
  function leftDrawing(s: Slot, content: LeftContent): Drawing {
    const d = drawingBase(content.key, content, holderOf())
    copyLeft(s, d)
    return d
  }
  function copyLeft(s: Slot, d: Drawing): boolean {
    const src = o.left?.canvas(s.n)
    if (!src) {
      mirrorLoading(s, d)
      return false
    }
    const c = document.createElement('canvas')
    c.className = 'axt-slot-copy'
    c.setAttribute('role', 'presentation')
    c.width = src.width
    c.height = src.height
    try {
      c.getContext('2d', { alpha: false })?.drawImage(src, 0, 0)
    } catch (e) {
      o.warn?.("the original's page copied", e)
      c.width = 0
      c.height = 0
      return false
    }
    stopMirror(s, d)
    const was = d.copy
    d.copy = c
    if (was?.parentNode === d.holder) was.replaceWith(c)
    else d.holder.replaceChildren(c)
    if (was) {
      was.width = 0
      was.height = 0
    }
    counts.copies++
    return true
  }
  const LOADING = ['loadingIcon', 'loading']
  /**
   * The slot's loading mark, from what it shows: the left's page box's, mirrored, while it shows the left's drawing still to
   * come (its mirror live); none for anything else. PDF.js's sheet draws its loading image over a `.page.loading` under a
   * `.pdfViewer` (z-index 5), so a mark left on a slot that shows a drawing covers it and takes its pointer (its links): the
   * left's page is told drawn (`pagerendered`) in the task its classes are cleared, and a mirror disconnected there never hears
   * that change (L11's gap 5)
   */
  function markOf(s: Slot) {
    const box = s.shown?.mirror ? o.left?.box(s.n) : null
    for (const c of LOADING) s.div.classList.toggle(c, !!box?.classList.contains(c))
  }
  function mirrorLoading(s: Slot, d: Drawing) {
    const box = o.left?.box(s.n)
    if (!box || d.mirror) return
    const sync = () => {
      if (s.shown === d) markOf(s)
    }
    d.mirror = new MutationObserver(sync)
    d.mirror.observe(box, { attributes: true, attributeFilter: ['class'] })
    queueMicrotask(sync)
  }
  /** the mirror let go where the left's drawing has come (or cannot): the mark goes with it where this drawing is shown */
  function stopMirror(s: Slot, d: Drawing) {
    d.mirror?.disconnect()
    d.mirror = null
    if (s.shown === d || s.shown === null) markOf(s)
  }
  /** a drawing's end: its canvas released, its holder out, its overlay's work aborted */
  function release(d: Drawing | null, s?: Slot) {
    if (!d) return
    d.ac.abort()
    if (d.ahead) {
      const told = d.ahead
      d.ahead = null
      told(false)
    }
    if (d.job) scheduler.forget(d.job)
    if (d.detailJob) scheduler.forget(d.detailJob)
    if (d.againJob) scheduler.forget(d.againJob)
    if (d.mirror) {
      d.mirror.disconnect()
      d.mirror = null
      if (s) for (const c of LOADING) s.div.classList.remove(c)
    } else if (s && s.shown === d) for (const c of LOADING) s.div.classList.remove(c)
    if (d.copy) {
      d.copy.width = 0
      d.copy.height = 0
      d.copy = null
    }
    if (d.view) {
      try {
        d.view.reset()
      } catch {
        /* its page gone with its document */
      }
      if (s) parsed(s.n, d)
    }
    if (d.over && isView(d.content)) {
      try {
        d.content.free?.(d.over)
      } catch {
        /* its own */
      }
    }
    for (const c of d.over?.querySelectorAll('canvas') ?? []) {
      c.width = 0
      c.height = 0
    }
    d.over?.remove()
    d.holder.remove()
    counts.released++
  }
  /** what is kept parsed of page n once drawing d of it has gone: a laid page's document's last WARM_PAGES pages, the oldest
   *  cleaned up past it; an original's page cleaned up where the left does not hold it */
  const warm = new Map<PDFDocumentProxy, number[]>()
  function parsed(n: number, d: Drawing) {
    const c = d.content
    if (!isView(c) || !d.view) return
    const page = d.view.pdfPage
    if (!page) return
    const inUse = (doc0: PDFDocumentProxy, m: number) => {
      const s = slots[m - 1]
      return !!s && [s.shown, s.next].some((x) => x && x !== d && x.view && isView(x.content) && x.content.doc === doc0)
    }
    try {
      if (c.own) {
        if (!o.left?.holds(n) && !inUse(c.doc, n) && page.cleanup()) counts.cleaned++
        return
      }
      const list = (warm.get(c.doc) ?? []).filter((m) => m !== n)
      list.push(n)
      while (list.length > WARM_PAGES) {
        const m = list.shift() as number
        if (inUse(c.doc, m)) continue
        c.doc.getPage(m).then(
          (p) => {
            if (!inUse(c.doc, m) && p.cleanup()) counts.cleaned++
          },
          () => {},
        )
      }
      warm.set(c.doc, list)
    } catch {
      /* its document gone */
    }
  }
  /** what slot s is to show, drawn (asked of the scheduler) where it is near and not shown or under way */
  function want(s: Slot) {
    if (disposed || !s.near) return
    const c = contentOf(s.n)
    if (!c) return
    if (s.next && s.next.key !== c.key) {
      release(s.next, s)
      s.next = null
    }
    if (s.shown?.key === c.key) {
      // (shown at another scale, or let go by a reset: drawn again in place)
      if (s.shown.view?.renderingState === INITIAL) ask(s, s.shown)
      return
    }
    if (!s.next) s.next = drawingOf(s, c)
    const d = s.next
    if (!d) return
    // (the left's drawing and the skeleton are put in place at once: the left's loading mark shows meanwhile)
    if (!d.view) drawnNow(s, d)
    else ask(s, d)
  }
  /** a drawing finished: a new content swapped in, in one task, its overlay made; told */
  function drawnNow(s: Slot, d: Drawing) {
    const ahead = d.ahead
    d.ahead = null
    if (s.next === d) {
      const t0 = performance.now()
      const focus = focusIn(s)
      const was = s.shown
      if (d.over) d.holder.append(d.over)
      s.next = null
      s.shown = d
      if (was) {
        was.holder.replaceWith(d.holder)
        release(was, s)
      } else s.div.append(d.holder)
      // (the left's mark mirrored where this is the left's drawing still to come, and gone for any other: a laid page put in
      // place in the task the left's page is told drawn in leaves none behind)
      markOf(s)
      counts.swaps++
      name(s)
      keepFocus(s, focus)
      tell('shown', { n: s.n, key: d.key, swapMs: performance.now() - t0, drawMs: d.drawMs })
    }
    if (!d.view) {
      if (d.copy) tell('drawn', { n: s.n, scale, key: d.key, detail: false })
      return
    }
    rounding(s)
    tell('drawn', { n: s.n, scale: d.drawnAt, key: d.key, detail: false })
    // (a page ahead drawn while its slot is far: kept off the view within the budget, put back as it comes near)
    if (ahead) {
      if (!s.near && s.shown === d) {
        const px = d.over ? pixelsOf(d) : 0
        if (px && px <= keepPixels) {
          keep(s, px + awayOf(d))
          trim(s.n)
        } else {
          release(d, s)
          s.shown = null
          name(s)
        }
      }
      ahead(s.shown === d)
    }
    if (s.n === 1 && sized === 0 && doc) {
      sized = -1
      void readSizes(gen, doc)
    }
    areaSoon()
  }

  // ---------------------------------------------------------------- far: let go, kept, held for the focus
  let keepTick = 0
  /** the slots kept for the focus inside them while far (a link, or the slot a jump gave it to) */
  const keptForFocus = new Set<Slot>()
  const holdsFocus = (s: Slot) => {
    const at = document.activeElement
    return !!at && at !== document.body && s.div.contains(at)
  }
  /** slot s gone far: a laid drawing kept off the view within the budget, any other let go; held where it holds the focus */
  function goFar(s: Slot) {
    if (s.next) {
      release(s.next, s)
      s.next = null
    }
    if (!s.shown) return
    if (holdsFocus(s)) {
      keptForFocus.add(s)
      return
    }
    keptForFocus.delete(s)
    const d = s.shown
    const px = d.over && d.view ? pixelsOf(d) : 0
    if (!px || px > keepPixels) {
      release(d, s)
      s.shown = null
      name(s)
      return
    }
    keep(s, px + awayOf(d))
    trim(s.n)
  }
  /** slot s's drawing kept off the view (`px` its device pixels: its page view's and the copy its overlay keeps), marked so that
   *  the sheet holds it out of the layout tree; 0: kept no more, back in it once it is whole (`putBack`) */
  function keep(s: Slot, px: number) {
    s.kept = px
    if (px) {
      s.keptAt = ++keepTick
      s.div.setAttribute(KEPT, '')
    } else if (putBack(s)) s.div.removeAttribute(KEPT)
  }
  /** drawing d's overlay let go to its copy as d is kept off the view (its crops' page-sized bitmap: design-performance-2026-11-13
   *  Q7, a far page holds one bitmap): the device pixels the copy holds */
  function awayOf(d: Drawing): number {
    const c = d.content
    return d.over && isView(c) && c.away ? c.away(d.over) : 0
  }
  /** the drawings whose overlay is being drawn anew before they go back into the layout tree (no copy fitted) */
  const redrawing = new WeakSet<Drawing>()
  /**
   * Slot s's kept drawing made whole to go back into the layout tree in this task: what its overlay let go put back from its
   * copy, so that the page comes back as it left (the compositor only ever sees the page-sized crops canvas). Where no copy fits
   * (the scale moved while it was far) its overlay is drawn anew first and the drawing goes back once it is (false meanwhile):
   * a page is never shown without its crops. True where nothing waits
   */
  function putBack(s: Slot): boolean {
    const d = s.shown
    const c = d?.content
    if (!d?.view || !d.over || !c || !isView(c) || !c.back) return true
    const at: SlotAt = { n: s.n, view: d.view, viewport: d.view.viewport, signal: d.ac.signal }
    if (c.back(d.over, at)) return true
    if (redrawing.has(d)) return false
    if (!c.again) return true
    redrawing.add(d)
    counts.agains++
    void c
      .again(d.over, at)
      .catch(() => {})
      .finally(() => {
        redrawing.delete(d)
        if (s.shown !== d || disposed) return
        if (!s.kept) s.div.removeAttribute(KEPT)
        else if (s.div.hasAttribute(KEPT)) {
          // (kept still, or again: the crops drawn anew let go to a copy as well, and back from it as the jump's frame
          // callback or the near observer finds the page)
          awayOf(d)
          areaSoon()
        }
      })
    return false
  }
  /** the laid drawings kept past the budget let go, the farthest from the page in the middle of the view first (else from the
   *  page just kept), the one kept longest first between two as far */
  function trim(just: number) {
    const kept = slots
      .filter((x) => x.kept)
      .sort((a, b) => a.keptAt - b.keptAt)
      .map((x) => ({ n: x.n, px: x.kept }))
    for (const n of pastBudget(kept, stack.centre() || just, keepPixels)) unkeep(slots[n - 1] as Slot, true)
  }
  /** slot s's kept drawing taken out of the keep: let go (`drop`), or shown again (it came near) */
  function unkeep(s: Slot, drop: boolean) {
    if (!drop) {
      keep(s, 0)
      counts.restored++
      return
    }
    s.kept = 0
    s.div.removeAttribute(KEPT)
    release(s.shown, s)
    s.shown = null
    counts.keptDropped++
    name(s)
  }
  const pixelsOf = (d: Drawing) => {
    const c = d.view?.canvas as unknown as HTMLCanvasElement | undefined
    return c ? c.width * c.height : 0
  }
  // The focus's move read a task later, never in a microtask: on a native Tab Chromium clears the focus, tells focusout and
  // runs its microtasks before the focus arrives at the next element (layer-side.mjs focusMoved)
  let focusCheck = 0
  const focusMoved = () => {
    if (focusCheck || disposed || !keptForFocus.size) return
    focusCheck = clock.later(() => {
      focusCheck = 0
      for (const s of [...keptForFocus]) {
        if (holdsFocus(s)) continue
        keptForFocus.delete(s)
        if (!s.near) goFar(s)
      }
    }, 0)
  }
  document.addEventListener('focusin', focusMoved, true)
  document.addEventListener('focusout', focusMoved, true)

  // ---------------------------------------------------------------- the visible area (PDF.js's detail view)
  let areaFrame = 0
  function areaSoon() {
    if (areaFrame || disposed || nearHeld) return
    areaFrame = clock.frame(() => {
      areaFrame = 0
      const view = scroller.getBoundingClientRect()
      // (a kept drawing a jump brought into view back in the layout tree in the jump's own frame, before it is laid out and
      // painted: the near observer tells it only in a task after that frame, which would show the bare page box for a frame)
      for (const s of slots) {
        if (!s.kept || !s.div.hasAttribute(KEPT)) continue
        const r = s.div.getBoundingClientRect()
        if (r.bottom > view.top && r.top < view.bottom && putBack(s)) s.div.removeAttribute(KEPT)
      }
      for (const s of slots) {
        const d = s.shown
        const pv = d?.view
        if (!d || !pv || !s.inView) continue
        const r = s.div.getBoundingClientRect()
        const k = r.width / Math.max(1, s.div.offsetWidth || r.width)
        const minX = Math.max(0, view.left - r.left) / k,
          minY = Math.max(0, view.top - r.top) / k
        const maxX = (Math.min(view.right, r.right) - r.left) / k,
          maxY = (Math.min(view.bottom, r.bottom) - r.top) / k
        const whole = minX <= 0 && minY <= 0 && maxX >= r.width / k - 0.5 && maxY >= r.height / k - 0.5
        pv.updateVisibleArea(whole ? null : ({ minX, minY, maxX, maxY } as never))
        const detail = pv.detailView as unknown as { renderingState: number; draw(): Promise<unknown> } | null
        if (detail && detail.renderingState === INITIAL) {
          const job: Job = {
            rank: () => (s.shown === d && pv.detailView === (detail as never) && s.inView ? 0 : null),
            order: () => s.n + 0.5,
            run: async () => {
              await detail.draw()
              if (s.shown === d) tell('drawn', { n: s.n, scale, key: d.key, detail: true })
            },
          }
          if (d.detailJob) scheduler.forget(d.detailJob)
          d.detailJob = job
          scheduler.want(job)
        }
      }
    })
  }
  scroller.addEventListener('scroll', areaSoon, { passive: true })

  // ---------------------------------------------------------------- a laid page's own drawings again after a zoom
  function againSoon() {
    clock.clear(againTimer)
    againTimer = clock.later(() => {
      againTimer = 0
      for (const s of slots) {
        const d = s.shown
        const c = d?.content
        if (!d?.view || !d.over || !c || !isView(c) || !c.again || !s.near) continue
        if (d.againJob) scheduler.forget(d.againJob)
        const view = d.view,
          over = d.over,
          again = c.again
        const job: Job = {
          rank: () => (s.shown === d && d.againJob === job ? rankOf(s) : null),
          order: () => s.n + 0.25,
          run: async () => {
            counts.agains++
            await again(over, { n: s.n, view, viewport: view.viewport, signal: d.ac.signal })
          },
        }
        d.againJob = job
        scheduler.want(job)
      }
    }, RECOPY_MS)
  }

  // ---------------------------------------------------------------- focus and names
  let pending: { n: number; until: number } | null = null
  const giveUp = (e: FocusEvent) => {
    if (pending && e.target !== slots[pending.n - 1]?.div) pending = null
  }
  document.addEventListener('focusin', giveUp, true)
  function focusIn(s: Slot): string | null {
    const at = document.activeElement
    if (!at || at === document.body || !s.div.contains(at)) return null
    return at.getAttribute('data-axt-link') ?? ''
  }
  function keepFocus(s: Slot, focus: string | null) {
    if (focus === null || disposed) return
    const to = focus !== '' ? s.div.querySelector<HTMLElement>(`a[data-axt-link="${focus}"]`) : null
    if (to) {
      to.focus({ preventScroll: true })
      return
    }
    if (s.div.getAttribute('aria-hidden') === 'true') return
    focusSlot(s)
  }
  function focusSlot(s: Slot) {
    pending = null
    s.div.tabIndex = -1
    s.div.focus({ preventScroll: true })
  }
  /** a slot's name for assistive technology: a page of its pane where it shows one (not the skeleton), else hidden */
  function name(s: Slot) {
    if (s.shown && s.shown.content.kind !== 'skeleton') {
      s.div.removeAttribute('aria-hidden')
      s.div.setAttribute('role', 'region')
      s.div.setAttribute('aria-label', o.name(s.n))
      if (pending?.n === s.n) {
        if (clock.now() <= pending.until) focusSlot(s)
        else pending = null
      }
    } else {
      s.div.setAttribute('aria-hidden', 'true')
      s.div.removeAttribute('role')
      s.div.removeAttribute('aria-label')
      s.div.removeAttribute('tabindex')
    }
  }

  function letAllGo() {
    for (const s of slots) {
      release(s.next, s)
      release(s.shown, s)
      s.next = null
      s.shown = null
      keep(s, 0)
    }
    keptForFocus.clear()
    waiting.clear()
    warm.clear()
  }
  function clear() {
    letAllGo()
    for (const s of slots) {
      near.unobserve(s.div)
      inView.unobserve(s.div)
      s.div.remove()
    }
    slots = []
  }

  const stack: Stack = {
    element,
    get pages() {
      return slots.length
    },
    get scale() {
      return scale
    },
    get contentOf() {
      return contentOf
    },
    set contentOf(f) {
      contentOf = f
    },
    async layout(d, s) {
      if (disposed) return
      gen++
      const mine = gen
      clear()
      doc = d
      scale = s
      sized = 0
      if (!d) return
      const first = await d.getPage(1)
      if (mine !== gen) return
      const vp1 = first.getViewport({ scale: 1 })
      base = Array.from({ length: d.numPages }, () => vp1)
      element.style.setProperty('--scale-factor', String(scale * PDF_TO_CSS))
      slots = Array.from({ length: d.numPages }, (_, i) => {
        const div = document.createElement('div')
        div.className = 'page axt-slot'
        div.dataset.pageNumber = String(i + 1)
        div.setAttribute('aria-hidden', 'true')
        return { n: i + 1, div, shown: null, next: null, near: false, inView: false, kept: 0, keptAt: 0 }
      })
      for (const sl of slots) size(sl)
      element.append(...slots.map((sl) => sl.div))
      for (const sl of slots) {
        near.observe(sl.div)
        inView.observe(sl.div)
      }
      // the slots in the first view drawn now, not a frame later at the observers' first word (their geometry read once, here):
      // page 1 waited for the IntersectionObserver's first callback, 17 to 33 ms of first paint against PDF.js's viewer
      if (scroller.clientHeight) {
        const top = scroller.scrollTop,
          bottom = top + scroller.clientHeight
        for (const sl of slots) {
          const y = sl.div.offsetTop
          if (y >= bottom) break
          if (y + sl.div.offsetHeight <= top) continue
          sl.near = true
          sl.inView = true
          want(sl)
        }
      }
      // (a stack out of the display draws nothing, and its sizes are read at once)
      if (!scroller.clientWidth) {
        sized = -1
        void readSizes(mine, d)
      }
    },
    blank() {
      if (disposed) return
      gen++
      doc = null
      letAllGo()
      for (const s of slots) {
        name(s)
        want(s)
      }
    },
    setScale(next, drawingDelay = -1) {
      if (disposed || !(next > 0)) return
      scale = next
      // (a zoom's or a pinch's steps: the laid pages' text layers out of layout from the first step until TEXT_BACK_MS after
      // the redraw, so that a run of steps sizes their spans once, after its last)
      if (drawingDelay >= 0) {
        clock.clear(textTimer)
        textTimer = 0
        element.setAttribute('data-axt-scaling', '')
      }
      element.style.setProperty('--scale-factor', String(scale * PDF_TO_CSS))
      for (const s of slots) size(s)
      for (const s of slots) {
        for (const d of [s.shown, s.next]) {
          if (!d?.view) continue
          d.view.update(drawingDelay >= 0 ? { scale, drawingDelay } : { scale })
        }
      }
      clock.clear(redrawTimer)
      const redraw = () => {
        redrawTimer = 0
        if (element.hasAttribute('data-axt-scaling')) {
          clock.clear(textTimer)
          textTimer = clock.later(() => {
            textTimer = 0
            element.removeAttribute('data-axt-scaling')
          }, TEXT_BACK_MS)
        }
        for (const s of slots) {
          const d = s.shown
          if (d?.view) {
            if (d.view.renderingState === FINISHED && d.drawnAt !== d.view.scale) d.view.update({ scale: d.view.scale })
            if (d.view.renderingState === INITIAL) ask(s, d)
          }
          if (s.next?.view?.renderingState === INITIAL) ask(s, s.next)
        }
        tell('scale', { scale })
        areaSoon()
      }
      if (drawingDelay >= 0) redrawTimer = clock.later(redraw, drawingDelay)
      else redraw()
      againSoon()
    },
    refresh(n) {
      if (n === undefined) for (const s of slots) want(s)
      else if (slots[n - 1]) want(slots[n - 1] as Slot)
    },
    leftDrawn(n, ok) {
      const s = slots[n - 1]
      const d = s?.shown
      if (!s || !d || d.content.kind !== 'left' || !s.near) return
      if (!ok) {
        // (the left's drawing failed: the page drawn by its own page view, the copy kept over it until that is drawn)
        const fb = d.content.fallback
        if (!s.next) {
          s.next = viewDrawing(s, fb)
          if (s.next?.job) scheduler.want(s.next.job)
        }
        return
      }
      // (the copy taken in the next frame: the left's page is painted in the frame it was drawn for, nothing of the right's in its
      // task; the left's loading mark kept as it stands until then)
      d.mirror?.disconnect()
      d.mirror = null
      clock.frame(() => {
        if (s.shown !== d || disposed) return
        if (copyLeft(s, d)) tell('drawn', { n: s.n, scale, key: d.key, detail: false })
        else for (const c of LOADING) s.div.classList.remove(c)
      })
    },
    ahead(n, signal) {
      const s = slots[n - 1]
      if (disposed || !s || s.near || signal.aborted) return Promise.resolve(false)
      const c = contentOf(n)
      if (!c || !isView(c) || !c.over) return Promise.resolve(false)
      if (s.shown?.key === c.key) return Promise.resolve(true)
      if (s.next && s.next.key !== c.key) {
        release(s.next, s)
        s.next = null
      }
      const d = s.next ?? viewDrawing(s, c)
      if (!d?.job) return Promise.resolve(false)
      s.next = d
      return new Promise<boolean>((done) => {
        d.ahead = done
        signal.addEventListener(
          'abort',
          () => {
            if (s.next !== d || s.near) return
            release(d, s)
            s.next = null
          },
          { once: true },
        )
        scheduler.want(d.job as Job)
      })
    },
    dropKept(drop = () => true) {
      for (const s of slots) if (s.kept && s.shown && drop(s.shown.key, s.n)) unkeep(s, true)
    },
    page: (n) => slots[n - 1]?.div ?? null,
    viewport: (n) => viewportAt(n),
    showing: (n) => {
      const s = slots[n - 1]
      return s?.shown && !s.kept ? s.shown.key : null
    },
    near: (n) => !!slots[n - 1]?.near,
    inView: (n) => !!slots[n - 1]?.inView,
    centre() {
      const seen = slots.filter((s) => s.inView)
      return seen.length ? (seen[Math.floor((seen.length - 1) / 2)] as Slot).n : 0
    },
    drawing(n) {
      const s = slots[n - 1]
      const j = scheduler.running
      return !!s && !!j && [s.shown, s.next].some((d) => d?.job === j)
    },
    focus(n) {
      const s = slots[n - 1]
      if (disposed || !s) return
      if (s.div.getAttribute('aria-hidden') !== 'true') {
        focusSlot(s)
        return
      }
      pending = { n, until: clock.now() + FOCUS_WAIT_MS }
    },
    holdNear(on) {
      // (a pinch's preview is a transform the near observer is held through: the kept drawings in the layout tree while it is
      // held, so that a page it brings into view is drawn there, and out of it again at its end where they are still far)
      if (on) {
        nearHeld ??= new Map()
        for (const s of slots) if (s.kept) s.div.removeAttribute(KEPT)
        return
      }
      const held = nearHeld
      nearHeld = null
      if (held?.size) nearEntries([...held].map(([target, on]) => ({ target, on })))
      for (const s of slots) if (s.kept) s.div.setAttribute(KEPT, '')
      areaSoon()
    },
    hold(on) {
      if (disposed || aheadHeld === on) return
      aheadHeld = on
      if (on) return
      const run = [...waiting]
      waiting.clear()
      for (const s of run) for (const d of [s.next, s.shown]) if (d?.view?.renderingState === INITIAL) ask(s, d)
    },
    get held() {
      return aheadHeld
    },
    on(type, f) {
      const set = listeners.get(type) ?? new Set()
      listeners.set(type, set)
      set.add(f as (e: unknown) => void)
      return () => set.delete(f as (e: unknown) => void)
    },
    probe() {
      let views = 0,
        nearN = 0,
        pixels = 0,
        kept = 0,
        keptPixels = 0,
        lefts = 0,
        skeletons = 0
      for (const s of slots) {
        if (s.shown?.view) views++
        if (s.shown?.content.kind === 'left') lefts++
        if (s.shown?.content.kind === 'skeleton') skeletons++
        if (s.near) nearN++
        if (s.kept) {
          kept++
          keptPixels += s.kept
        }
        const c = s.shown?.view?.canvas as unknown as HTMLCanvasElement | undefined
        if (c) pixels += c.width * c.height
      }
      return {
        slots: slots.length,
        views,
        near: nearN,
        pixels,
        kept,
        keptPixels,
        keepPixels,
        lefts,
        skeletons,
        focusHeld: keptForFocus.size,
        made: counts.made,
        released: counts.released,
        swaps: counts.swaps,
        keptDropped: counts.keptDropped,
        restored: counts.restored,
        copies: counts.copies,
        agains: counts.agains,
        cleaned: counts.cleaned,
        sized,
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      gen++
      pending = null
      document.removeEventListener('focusin', giveUp, true)
      document.removeEventListener('focusin', focusMoved, true)
      document.removeEventListener('focusout', focusMoved, true)
      scroller.removeEventListener('scroll', areaSoon)
      clock.clear(redrawTimer)
      clock.clear(textTimer)
      clock.clear(againTimer)
      clock.clear(focusCheck)
      clock.cancel(areaFrame)
      unround()
      near.disconnect()
      inView.disconnect()
      clear()
      if (given) {
        element.replaceChildren()
        element.classList.remove('axt-stack')
        element.removeAttribute('data-axt-scaling')
        element.style.removeProperty('--scale-factor')
      } else element.remove()
      listeners.clear()
    },
  }
  return stack
}

// ---------------------------------------------------------------- the skeleton (places.mjs skeleton, kept)
const part = (cls: string, style: Record<string, string> = {}) => {
  const e = document.createElement('i')
  if (cls) e.className = cls
  for (const [k, v] of Object.entries(style)) e.style.setProperty(k, v)
  return e
}
/** a paragraph of `n` lines, its last one short by `rest` of the measure */
const lines = (n: number, rest: number) =>
  part('axt-sk-lines', { '--axt-sk-n': String(n), '--axt-sk-rest': `${rest}%` })
const head = (width: number, more: Record<string, string> = {}) =>
  part('axt-sk-head', { 'inline-size': `${width}%`, ...more })
/** a page's grey text: the first page a title, twelve authors, the abstract's label and its lines, a heading; the others a
 *  heading, paragraphs, every third page a figure. The same for page `n` whenever it is drawn */
export function skeleton(n: number): HTMLElement {
  const sk = document.createElement('div')
  sk.className = 'axt-sk'
  sk.setAttribute('aria-hidden', 'true')
  if (n === 1) {
    const authors = document.createElement('div')
    authors.className = 'axt-sk-authors'
    for (let i = 0; i < 12; i++) authors.append(part(''))
    const abstract = document.createElement('div')
    abstract.className = 'axt-sk-abstract'
    abstract.append(lines(13, 54))
    sk.append(
      part('axt-sk-title'),
      authors,
      part('axt-sk-label'),
      abstract,
      head(22, { 'margin-block-start': '4.6cqw' }),
      lines(7, 20),
    )
    return sk
  }
  sk.append(head(24 + ((n * 7) % 18)), lines(9 + (n % 4), 30 + ((n * 13) % 40)), part('axt-sk-gap'))
  if (n % 3 === 0) sk.append(part('axt-sk-figure'))
  sk.append(
    lines(11 + (n % 3), 22 + ((n * 11) % 45)),
    part('axt-sk-gap'),
    head(30 + ((n * 5) % 20)),
    lines(14, 40),
    part('axt-sk-gap'),
    lines(12, 18),
  )
  return sk
}

/** PDF.js's translator for a page view's own strings, which the slot does not show (its region is named by the stack) */
const noL10n = {
  getLanguage: () => null,
  getDirection: () => 'ltr',
  get: async (id: string) => id,
  translate: async () => {},
  translateOnce: async () => {},
  pause: () => {},
  resume: () => {},
  destroy: async () => {},
}
