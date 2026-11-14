// The page stack's drawings against PDF.js's page views as pdfjs-dist 6.3.289 has them: a page view reset by a new scale while
// it draws gives its drawing up, and its draw() RESOLVES (pdf_viewer.mjs PDFPageView#draw returns `_drawCanvas`'s promise, which
// returns on a RenderingCancelledException; the cancel removes its canvases), and a zoom's step (`update` with a drawing delay)
// marks a view that is drawing finished, undrawn. The stack, its one scheduler, its observers and its clock driven by hand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Kit } from '../src/pdfjs/kit.ts'
import type { Clock } from '../src/stack/clock.ts'
import { createScheduler } from '../src/stack/scheduler.ts'
import { createStack, type PageContent, type Stack } from '../src/stack/stack.ts'

const INITIAL = 0,
  RUNNING = 1,
  FINISHED = 3

interface Viewport {
  scale: number
  width: number
  height: number
  rotation: number
  rawDims: { pageWidth: number; pageHeight: number }
  clone(o: { scale: number }): Viewport
}
const viewportAt = (scale: number): Viewport => ({
  scale,
  width: 612 * scale,
  height: 792 * scale,
  rotation: 0,
  rawDims: { pageWidth: 612, pageHeight: 792 },
  clone: (o) => viewportAt(o.scale),
})

/** a page view as PDF.js 6.3.289's PDFPageView behaves to the stack: draw, update, reset; `painted` the scale its canvas was
 *  drawn whole at (null: no canvas, as after a drawing given up) */
class PageView {
  static all: PageView[] = []
  div = document.createElement('div')
  renderingState = INITIAL
  scale: number
  viewport: Viewport
  pdfPage: unknown = null
  canvas: object | null = null
  painted: number | null = null
  detailView = null
  /** the drawing under way: finished by the test, or given up */
  task: { done(drawn: boolean): void } | null = null
  constructor(o: { container: HTMLElement; scale: number; defaultViewport: Viewport }) {
    this.div.className = 'page'
    o.container.append(this.div)
    this.scale = o.scale
    this.viewport = o.defaultViewport
    PageView.all.push(this)
  }
  setPdfPage(p: unknown) {
    this.pdfPage = p
  }
  draw(): Promise<void> {
    this.renderingState = RUNNING
    // (_createCanvas: the new canvas is the view's from now; the one before stays shown until the new one is whole)
    this.canvas = {}
    const at = this.scale
    this.div.setAttribute('data-loaded', 'true')
    return new Promise<void>((resolve) => {
      this.task = {
        done: (drawn) => {
          this.task = null
          if (drawn) {
            this.renderingState = FINISHED
            this.painted = at
          } else {
            // (the cancel's onCancel: the canvas before and the new one removed, `_resetCanvas`; `_drawCanvas` returns)
            this.canvas = null
            this.painted = null
          }
          resolve()
        },
      }
    })
  }
  /** PDFPageView#update: a step of a zoom (a drawing delay under 1000 ms) on a view with a canvas scales it by CSS, a view that is
   *  drawing given up and marked finished; any other update a reset, its canvas kept */
  update({ scale, drawingDelay = -1 }: { scale: number; drawingDelay?: number }) {
    this.scale = scale
    this.viewport = viewportAt(scale)
    if (this.canvas && drawingDelay >= 0 && drawingDelay < 1000) {
      if (this.renderingState !== FINISHED) {
        this.task?.done(false)
        this.renderingState = FINISHED
      }
      return
    }
    this.reset()
  }
  reset() {
    this.task?.done(false)
    this.renderingState = INITIAL
    this.div.removeAttribute('data-loaded')
  }
  updateVisibleArea() {}
}
class EventBus {
  on() {}
}
const kit = {
  lib: { setLayerDimensions: () => {}, AnnotationMode: { ENABLE: 1, DISABLE: 0 } },
  viewer: { PDFPageView: PageView, EventBus },
} as unknown as Kit

/** the browser's IntersectionObservers, told by hand */
class Observer {
  static all: Observer[] = []
  targets = new Set<Element>()
  cb: (e: { target: Element; isIntersecting: boolean }[]) => void
  constructor(cb: (e: { target: Element; isIntersecting: boolean }[]) => void) {
    this.cb = cb
    Observer.all.push(this)
  }
  observe(el: Element) {
    this.targets.add(el)
  }
  unobserve(el: Element) {
    this.targets.delete(el)
  }
  disconnect() {
    this.targets.clear()
  }
}

/** a clock run by hand: its timers by `tick`; its frames (the visible area's) never come */
function handClock() {
  let now = 0,
    id = 0
  const timers = new Map<number, { at: number; f: () => void }>()
  const clock: Clock & { tick(ms: number): void } = {
    now: () => now,
    later(f, ms) {
      timers.set(++id, { at: now + ms, f })
      return id
    },
    clear: (i) => void timers.delete(i),
    frame: () => ++id,
    cancel: () => {},
    tick(ms) {
      now += ms
      for (const [i, t] of [...timers].sort((a, b) => a[1].at - b[1].at))
        if (t.at <= now) {
          timers.delete(i)
          t.f()
        }
    },
  }
  return clock
}

const page = { getViewport: ({ scale }: { scale: number }) => viewportAt(scale), cleanup: () => false }
const doc = { numPages: 2, getPage: async () => page }
/** the microtasks and the tasks a drawing's turn takes run out */
const settle = () => new Promise<void>((r) => setTimeout(r, 0))
const view = (key: string): PageContent => ({
  key,
  doc: doc as never,
  config: null,
  own: key === 'original',
  over: null,
})
/** a laid page's content: its page view with an overlay made once it has drawn */
const laid = (key: string): PageContent => ({
  key,
  doc: doc as never,
  config: null,
  own: false,
  over: () => Object.assign(document.createElement('div'), { className: 'axt-over' }),
})

describe('the stack: a page view reset by a new scale while it draws (staging, 2026-11-14)', () => {
  let stack: Stack, clock: ReturnType<typeof handClock>
  /** what each page shows: the original's page views, then its laid pages */
  let content: (n: number) => PageContent
  /** each content put in place, and its page view's own drawing then */
  let shown: { n: number; key: string; painted: number | null; state: number }[]
  const viewIn = (n: number) => {
    const div = stack.page(n)?.querySelector(':scope > .axt-slot-view > .page')
    return PageView.all.find((v) => v.div === div) ?? null
  }
  /** the drawings under way finished, each in its turn, until none is asked */
  const drawAll = async () => {
    for (let i = 0; i < 20; i++) {
      await settle()
      const busy = PageView.all.filter((v) => v.task)
      if (!busy.length) return
      for (const v of busy) v.task?.done(true)
    }
  }
  beforeEach(async () => {
    PageView.all = []
    Observer.all = []
    vi.stubGlobal('IntersectionObserver', Observer)
    const scroller = document.createElement('div')
    document.body.append(scroller)
    clock = handClock()
    stack = createStack({
      scroller,
      kit,
      scheduler: createScheduler(),
      clock,
      name: (n) => `page ${n}`,
      links: null,
      keepPixels: 0,
    })
    content = () => view('original')
    stack.contentOf = (n) => content(n)
    shown = []
    stack.on('shown', ({ n, key }) => {
      const v = viewIn(n)
      shown.push({ n, key, painted: v?.painted ?? null, state: v?.renderingState ?? -1 })
    })
    await stack.layout(doc as never, 1)
    // (page 1 in view, page 2 near: the observers' first word)
    const [near, inView] = Observer.all as [Observer, Observer]
    const slots = [stack.page(1), stack.page(2)] as HTMLElement[]
    near.cb(slots.map((target) => ({ target, isIntersecting: true })))
    inView.cb([
      { target: slots[0] as HTMLElement, isIntersecting: true },
      { target: slots[1] as HTMLElement, isIntersecting: false },
    ])
    await drawAll()
    expect(stack.showing(1)).toBe('original')
    expect(viewIn(1)?.painted).toBe(1)
  })
  afterEach(() => {
    stack.dispose()
    vi.unstubAllGlobals()
  })

  it('a new content asked, the scale changed while it draws (the original alone, then side by side): drawn at the new scale before it is put in place', async () => {
    content = (n) => laid(`laid:${n}`)
    stack.refresh()
    await settle()
    const drawing = PageView.all.filter((v) => v.renderingState === RUNNING)
    expect(drawing.length).toBeGreaterThan(0)
    // (the relayout's frame: a fit for the panes as they are now, drawn again at once)
    stack.setScale(0.75)
    await drawAll()
    expect(shown.filter((s) => s.key === 'laid:1')).toEqual([{ n: 1, key: 'laid:1', painted: 0.75, state: FINISHED }])
    expect(stack.showing(1)).toBe('laid:1')
    expect(stack.showing(2)).toBe('laid:2')
    expect(viewIn(1)?.painted).toBe(0.75)
    expect(viewIn(2)?.painted).toBe(0.75)
  })

  it('the page shown drawn again at a new scale, another scale while that drawing runs: drawn at the last', async () => {
    stack.setScale(1.5)
    await settle()
    expect(viewIn(1)?.renderingState).toBe(RUNNING)
    stack.setScale(0.75)
    await drawAll()
    expect(stack.showing(1)).toBe('original')
    expect(viewIn(1)?.renderingState).toBe(FINISHED)
    expect(viewIn(1)?.painted).toBe(0.75)
    expect(viewIn(2)?.painted).toBe(0.75)
  })

  it("a zoom's step while a new content draws (PDF.js marks the view finished, undrawn): drawn at the zoom's scale once the steps end, never put in place undrawn", async () => {
    content = (n) => laid(`laid:${n}`)
    stack.refresh()
    await settle()
    stack.setScale(1.1, 400)
    await settle()
    clock.tick(400)
    await drawAll()
    expect(shown.filter((s) => s.key === 'laid:1')).toEqual([{ n: 1, key: 'laid:1', painted: 1.1, state: FINISHED }])
    expect(viewIn(1)?.painted).toBe(1.1)
  })
})
