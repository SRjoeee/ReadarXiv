// The page stack (design §4.5 "both panes are one kind of thing"): a slot for every page of a document, all under one scale,
// each slot PDF.js's own page view of what that page shows now, drawn by the reader's one scheduler (in view, then near).
// Built for the right pane first; the left is put on it only if it matches today's left (stage 2, deliverable 7).
//
// - **Slots.** A slot is the page's box, sized by PDF.js's own rule (setLayerDimensions: `round(down, var(--total-scale-factor)
//   × the page's size, var(--scale-round-x))`) under the stack's `--scale-factor`, so that a slot of either pane and a page box of
//   PDF.js's viewer of the same page at the same scale are the same box, with nothing measured. Every slot is page 1's size until
//   its own page is read (a page's setup reads its page object, a range the store shares, never its content: W pdfjs.ts
//   eagerPages, whose job this is now): read in order once page 1 is drawn.
// - **What a slot shows** is asked of the owner (`contentOf(n)`): a document, the optional content it is drawn with, whether PDF.js's
//   own text and annotation layers are on it, and what is laid over it. A change is drawn as a new page view beside the shown one
//   and swapped in, in one task, once it has drawn: the slot's size and the pane's scroll never change, and nothing blank shows.
// - **Near and far.** A slot one pane's height above or below the view is near (an IntersectionObserver, which sees a slot where
//   it shows, the follower's transform and all: nothing is lent). A far slot's page view goes, unless the far drawings kept are
//   within the device's budget (no flash coming back: engine-view-host §16), oldest first.
// - **Scale.** One scale for every slot; a zoom's steps scale the page views by CSS at once and draw them again `drawingDelay`
//   after the last (PDF.js's own update). `scale` is told once the layout stands at the new scale, `drawn` each time a page is
//   drawn at it.
// - **Focus.** A slot's content going (far, or swapped) gives the focus back to the link of the same rank in what it shows now,
//   else to the slot (a stop of its own), so it never falls to <body> (places.mjs focusIn/keepFocus, kept).
// - **Detail.** At a high zoom PDF.js draws a page at a lower resolution and the part in view sharp (its detail view): the stack
//   tells each page view in view its visible area after a scroll and a scale (`updateVisibleArea`, public), and draws its detail
//   view through the scheduler.
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
/** PDF.js's page view states (pdf_viewer.mjs RenderingStates) */
const INITIAL = 0,
  FINISHED = 3

/** what a slot shows */
export interface PageContent {
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
}
/** a slot as `over` is given it: its page, the page view drawn, its viewport */
export interface SlotAt {
  n: number
  view: PDFPageView
  viewport: PageViewport
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
  shown: { n: number; key: string }
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
  /** the bytes of drawings far slots keep; default the device's (deviceMemory: 16 MiB a GiB, 32 to 128 MiB) */
  budget?: number
  warn?(what: string, e: unknown): void
}

interface Drawing {
  key: string
  content: PageContent
  holder: HTMLElement
  view: PDFPageView
  over: HTMLElement | null
  /** the scale its canvas was last drawn at */
  drawnAt: number
  job: Job
  detailJob: Job | null
}
interface Slot {
  n: number
  div: HTMLElement
  shown: Drawing | null
  next: Drawing | null
  near: boolean
  inView: boolean
  /** when it went far (its drawing kept by the budget meanwhile) */
  farSince: number
}

export interface Stack {
  /** the stack element (what the follower's transform moves) */
  readonly element: HTMLElement
  readonly pages: number
  readonly scale: number
  /** one slot a page of `doc`, sized as page 1 until each page's own size is read; resolves once page 1's size is known.
   *  null: no slot */
  layout(doc: PDFDocumentProxy | null, scale: number): Promise<void>
  /** the scale of every slot; `drawingDelay` ≥ 0: CSS at once, drawn again that long after (a zoom's step) */
  setScale(scale: number, drawingDelay?: number): void
  /** what slot n is to show (asked at each need); set by the owner */
  contentOf: (n: number) => PageContent | null
  /** slot n's content (every slot's without n) asked again: drawn where near and changed */
  refresh(n?: number): void
  page(n: number): HTMLElement | null
  viewport(n: number): PageViewport | null
  /** the content key slot n shows, or null */
  showing(n: number): string | null
  near(n: number): boolean
  inView(n: number): boolean
  focus(n: number): void
  /** the near window held (a pinch shown by transform) and told at its end as it stands then */
  holdNear(on: boolean): void
  on<K extends keyof StackEvents>(type: K, f: Listener<K>): () => void
  probe(): Record<string, number>
  dispose(): void
}

const deviceBudget = (): number => {
  const gb = (globalThis as { navigator?: { deviceMemory?: number } }).navigator?.deviceMemory
  return gb ? Math.min(128, Math.max(32, gb * 16)) * 2 ** 20 : 32 * 2 ** 20
}

export function createStack(o: StackOptions): Stack {
  const { scroller, kit, scheduler, clock } = o
  const element = document.createElement('div')
  element.className = 'pdfViewer axt-stack'
  scroller.append(element)
  const budget = o.budget ?? deviceBudget()
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
  const counts = { made: 0, released: 0, swaps: 0, kept: 0 }
  let redrawTimer = 0
  let contentOf: (n: number) => PageContent | null = () => null

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
      if (s.near) want(s)
      else goFar(s)
      tell('near', { n: s.n, on: s.near })
    }
  }
  const inView = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const s = slotOf(e.target)
        if (s) s.inView = e.isIntersecting
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
    const div = s.shown?.view.div
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
  /** a drawing of `content` for slot s: its page view in a holder of its own, out of the slot until it has drawn */
  function drawingOf(s: Slot, content: PageContent): Drawing | null {
    const vp = viewportAt(s.n)
    if (!vp) return null
    const holder = document.createElement('div')
    holder.className = 'axt-slot-view'
    const V = kit.viewer
    const view = new V.PDFPageView({
      container: holder,
      id: s.n,
      scale,
      defaultViewport: vp,
      eventBus: new V.EventBus(),
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
    counts.made++
    const d: Drawing = {
      key: content.key,
      content,
      holder,
      view,
      over: null,
      drawnAt: 0,
      job: null as unknown as Job,
      detailJob: null,
    }
    const mine = gen
    d.job = {
      rank: () => (s.next === d || s.shown === d ? rankOf(s) : null),
      order: () => s.n,
      run: async () => {
        if (mine !== gen || (s.next !== d && s.shown !== d)) return
        if (!view.pdfPage) view.setPdfPage(await content.doc.getPage(s.n))
        if (view.renderingState !== INITIAL) return
        const at = view.scale
        await view.draw()
        if (mine !== gen || disposed) return
        d.drawnAt = at
        // (a new content's overlay made before it is swapped in: the swap is one task)
        if (s.next === d && d.content.over && !d.over) {
          d.over = await d.content.over({ n: s.n, view, viewport: view.viewport })
          if (mine !== gen || disposed || s.next !== d) return
        }
        drawnNow(s, d)
      },
    }
    return d
  }
  /** a drawing's end: its canvas released, its holder out */
  function release(d: Drawing | null) {
    if (!d) return
    scheduler.forget(d.job)
    if (d.detailJob) scheduler.forget(d.detailJob)
    try {
      d.view.reset()
    } catch {
      /* its page gone with its document */
    }
    d.over?.remove()
    d.holder.remove()
    counts.released++
  }
  /** what slot s is to show, drawn (asked of the scheduler) where it is near and not shown or under way */
  function want(s: Slot) {
    if (disposed || !s.near) return
    const c = contentOf(s.n)
    if (!c) return
    if (s.next && s.next.key !== c.key) {
      release(s.next)
      s.next = null
    }
    if (s.shown?.key === c.key) {
      // (shown at another scale, or let go by the far budget's reset: drawn again in place)
      if (s.shown.view.renderingState === INITIAL) scheduler.want(s.shown.job)
      return
    }
    if (!s.next) s.next = drawingOf(s, c)
    if (s.next) scheduler.want(s.next.job)
  }
  /** a drawing finished: a new content swapped in, in one task, its overlay made; told */
  function drawnNow(s: Slot, d: Drawing) {
    if (s.next === d) {
      const focus = focusIn(s)
      const was = s.shown
      if (d.over) d.holder.append(d.over)
      s.next = null
      s.shown = d
      if (was) {
        was.holder.replaceWith(d.holder)
        release(was)
      } else s.div.append(d.holder)
      counts.swaps++
      name(s)
      keepFocus(s, focus)
      tell('shown', { n: s.n, key: d.key })
    }
    rounding(s)
    tell('drawn', { n: s.n, scale: d.drawnAt, key: d.key, detail: false })
    if (s.n === 1 && sized === 0 && doc) {
      sized = -1
      void readSizes(gen, doc)
    }
    areaSoon()
  }
  /** slot s gone far: its drawing kept within the budget, the oldest far ones let go past it */
  function goFar(s: Slot) {
    if (s.next) {
      release(s.next)
      s.next = null
    }
    if (!s.shown) return
    const focus = focusIn(s)
    s.farSince = clock.now()
    const kept = slots.filter((x) => !x.near && x.shown).sort((a, b) => a.farSince - b.farSince)
    let bytes = kept.reduce((a, x) => a + bytesOf(x.shown as Drawing), 0)
    for (const x of kept) {
      if (bytes <= budget) break
      bytes -= bytesOf(x.shown as Drawing)
      release(x.shown)
      x.shown = null
      name(x)
    }
    counts.kept = kept.filter((x) => x.shown).length
    keepFocus(s, focus)
  }
  const bytesOf = (d: Drawing) => {
    const c = d.view.canvas as unknown as HTMLCanvasElement | undefined
    return c ? c.width * c.height * 4 : 0
  }

  // ---------------------------------------------------------------- the visible area (PDF.js's detail view)
  let areaFrame = 0
  function areaSoon() {
    if (areaFrame || disposed || nearHeld) return
    areaFrame = clock.frame(() => {
      areaFrame = 0
      const view = scroller.getBoundingClientRect()
      for (const s of slots) {
        const d = s.shown
        if (!d || !s.inView) continue
        const r = s.div.getBoundingClientRect()
        const k = r.width / Math.max(1, s.div.offsetWidth || r.width)
        const minX = Math.max(0, view.left - r.left) / k,
          minY = Math.max(0, view.top - r.top) / k
        const maxX = (Math.min(view.right, r.right) - r.left) / k,
          maxY = (Math.min(view.bottom, r.bottom) - r.top) / k
        const whole = minX <= 0 && minY <= 0 && maxX >= r.width / k - 0.5 && maxY >= r.height / k - 0.5
        d.view.updateVisibleArea(whole ? null : ({ minX, minY, maxX, maxY } as never))
        const detail = d.view.detailView as unknown as { renderingState: number; draw(): Promise<unknown> } | null
        if (detail && detail.renderingState === INITIAL) {
          const job: Job = {
            rank: () => (s.shown === d && d.view.detailView === (detail as never) && s.inView ? 0 : null),
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
  /** a slot's name for assistive technology: a page of its pane where it shows one, else hidden */
  function name(s: Slot) {
    if (s.shown) {
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

  function clear() {
    for (const s of slots) {
      near.unobserve(s.div)
      inView.unobserve(s.div)
      release(s.next)
      release(s.shown)
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
        return { n: i + 1, div, shown: null, next: null, near: false, inView: false, farSince: 0 }
      })
      for (const sl of slots) size(sl)
      element.append(...slots.map((sl) => sl.div))
      for (const sl of slots) {
        near.observe(sl.div)
        inView.observe(sl.div)
      }
      // (a stack out of the display draws nothing, and its sizes are read at once)
      if (!scroller.clientWidth) {
        sized = -1
        void readSizes(mine, d)
      }
    },
    setScale(next, drawingDelay = -1) {
      if (disposed || !(next > 0)) return
      scale = next
      element.style.setProperty('--scale-factor', String(scale * PDF_TO_CSS))
      for (const s of slots) size(s)
      for (const s of slots) {
        for (const d of [s.shown, s.next]) {
          if (!d) continue
          d.view.update(drawingDelay >= 0 ? { scale, drawingDelay } : { scale })
        }
      }
      clock.clear(redrawTimer)
      const redraw = () => {
        redrawTimer = 0
        for (const s of slots) {
          const d = s.shown
          if (d) {
            if (d.view.renderingState === FINISHED && d.drawnAt !== d.view.scale) d.view.update({ scale: d.view.scale })
            if (d.view.renderingState === INITIAL) scheduler.want(d.job)
          }
          if (s.next?.view.renderingState === INITIAL) scheduler.want(s.next.job)
        }
        tell('scale', { scale })
        areaSoon()
      }
      if (drawingDelay >= 0) redrawTimer = clock.later(redraw, drawingDelay)
      else redraw()
    },
    refresh(n) {
      if (n === undefined) for (const s of slots) want(s)
      else if (slots[n - 1]) want(slots[n - 1] as Slot)
    },
    page: (n) => slots[n - 1]?.div ?? null,
    viewport: (n) => viewportAt(n),
    showing: (n) => slots[n - 1]?.shown?.key ?? null,
    near: (n) => !!slots[n - 1]?.near,
    inView: (n) => !!slots[n - 1]?.inView,
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
      if (on) {
        nearHeld ??= new Map()
        return
      }
      const held = nearHeld
      nearHeld = null
      if (held?.size) nearEntries([...held].map(([target, on]) => ({ target, on })))
      areaSoon()
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
        pixels = 0
      for (const s of slots) {
        if (s.shown) views++
        if (s.near) nearN++
        const c = s.shown?.view.canvas as unknown as HTMLCanvasElement | undefined
        if (c) pixels += c.width * c.height
      }
      return {
        slots: slots.length,
        views,
        near: nearN,
        pixels,
        made: counts.made,
        released: counts.released,
        swaps: counts.swaps,
        sized,
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      gen++
      pending = null
      document.removeEventListener('focusin', giveUp, true)
      scroller.removeEventListener('scroll', areaSoon)
      clock.clear(redrawTimer)
      clock.cancel(areaFrame)
      unround()
      near.disconnect()
      inView.disconnect()
      clear()
      element.remove()
      listeners.clear()
    },
  }
  return stack
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
