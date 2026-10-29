// The reading view both readers run (docs/PDF-READER.md §11.7; the shared reader view's contract, rows V1–V14 of its PR
// VA): its opens, the right pane's places, the identity follower, the zoom, the pinch, the displays, the overlays, the
// probe and its dispose, on PDF.js stand-ins, a clock moved by hand and a small layout model (helpers/reader-fakes.ts).
// The real PDF.js, in a real browser, is pnpm e2e:reader's (its development entry, ?layer=1).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFollower } from '@/pdf-reader/engine/view/sync.mjs'
import { AHEAD_HOLD_MS, NEAR, TEXT_BACK_MS } from '@/pdf-reader/engine/view/places.mjs'
import { createReaderView, type DocumentTask, internalsOf, type ReaderHost, type ReaderView, type Shapes, type ViewEvent, type ViewPrefs } from '@/pdf-reader/engine/view/reader-view.mjs'
import { clientOf, drawPanes, FakeEventBus, FakeIO, FakeLinkService, FakePDFPageView, FakePDFViewer, FakeRO, fakeDoc, fakeKit, fakeTask, flush, installLayout, type ManualClock, manualClock, reads, resetFakes } from './helpers/reader-fakes'

vi.mock('@/pdf-reader/engine/view/highlight.mjs', async importOriginal => {
  const real = await importOriginal<typeof import('@/pdf-reader/engine/view/highlight.mjs')>()
  return { ...real, layoutOf: vi.fn(real.layoutOf) }
})
const { layoutOf } = await import('@/pdf-reader/engine/view/highlight.mjs')

let restoreLayout: () => void
beforeAll(() => { restoreLayout = installLayout() })
afterAll(() => restoreLayout())

/** every listener the code under test adds to a DOM target, with its signal: what dispose must end. happy-dom's targets
 *  take their addEventListener from its own EventTarget (the window's too), not from Node's global one */
const added: { target: EventTarget; type: string; signal?: AbortSignal; removed: boolean; fn: unknown }[] = []
const ownerOf = (o: object): Record<string, unknown> => { let p = o; while (p && !Object.hasOwn(p, 'addEventListener')) p = Object.getPrototypeOf(p); return p as Record<string, unknown> }
const targets = [...new Set([ownerOf(HTMLElement.prototype), ownerOf(window)])]
const real = targets.map(t => ({ t, add: t.addEventListener as EventTarget['addEventListener'], remove: t.removeEventListener as EventTarget['removeEventListener'] }))
beforeEach(() => {
  resetFakes()
  FakeIO.live.clear(); FakeRO.live.clear()
  vi.stubGlobal('IntersectionObserver', FakeIO)
  vi.stubGlobal('ResizeObserver', FakeRO)
  added.length = 0
  for (const { t, add, remove } of real) {
    t.addEventListener = function (this: EventTarget, type: string, fn: never, o?: boolean | AddEventListenerOptions) {
      if (!(this instanceof AbortSignal)) added.push({ target: this, type, signal: typeof o === 'object' ? o.signal : undefined, removed: false, fn })
      return add.call(this, type, fn, o)
    }
    t.removeEventListener = function (this: EventTarget, type: string, fn: never, o?: boolean | EventListenerOptions) {
      for (const a of added) if (a.target === this && a.type === type && a.fn === fn) a.removed = true
      return remove.call(this, type, fn, o)
    }
  }
  document.documentElement.removeAttribute('lang')
})
afterEach(() => {
  for (const { t, add, remove } of real) { t.addEventListener = add; t.removeEventListener = remove }
  for (const v of views.splice(0)) v.dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  reads.counting = false
})

const views: ReaderView[] = []
interface Setup { view: ReaderView; host: ReaderHost; events: ViewEvent[]; clock: ManualClock; panes: { left: HTMLElement; right: HTMLElement }; prefs: { set(p: Partial<ViewPrefs>): void }; words: { pageName: ReturnType<typeof vi.fn>; sideName: ReturnType<typeof vi.fn> } }
function setup(o: { scrollEnd?: 'native' | 'timer'; titleFallback?: () => Promise<string> } = {}): Setup {
  const panes = drawPanes()
  const events: ViewEvent[] = []
  const clock = manualClock()
  let look: ViewPrefs = { swapped: false, dimPages: false, theme: 'light', highlight: true }
  const listeners = new Set<(p: ViewPrefs) => void>()
  const words = { pageName: vi.fn((side: string, n: number) => `${side} ${n}`), sideName: vi.fn((side: string) => side) }
  const host: ReaderHost = {
    panes, pdfjs: fakeKit(), words, clock, scrollEnd: o.scrollEnd ?? 'native',
    prefs: { get: () => look, subscribe: l => { listeners.add(l); return () => listeners.delete(l) } },
    links: { openExternal: vi.fn() },
    emit: e => events.push(e),
    ...(o.titleFallback ? { titleFallback: o.titleFallback } : {}),
  }
  const view = createReaderView(host)
  views.push(view)
  return { view, host, events, clock, panes, words, prefs: { set: p => { look = { ...look, ...p }; for (const l of listeners) l(look) } } }
}
const leftViewer = () => FakePDFViewer.made[0] as FakePDFViewer
const last = <T extends ViewEvent['type']>(events: ViewEvent[], type: T) => events.filter(e => e.type === type).at(-1) as Extract<ViewEvent, { type: T }> | undefined
const places = (s: Setup) => [...s.panes.right.querySelectorAll<HTMLElement>('.pdfViewer > .page')]
/** an original opened: its task resolved with `doc`, the view's answer awaited */
async function opened(s: Setup, pages = 6, o: { title?: string; rotate?: number } = {}) {
  const task = fakeTask()
  const doc = fakeDoc(pages, o)
  const answer = s.view.showOriginal(() => task as unknown as DocumentTask)
  task.resolve(doc)
  expect(await answer).toBe('opened')
  await flush()
  return { task, doc }
}
/** the places a test calls near the view: told so by the near window */
const nearOn = async (s: Setup, pages: number[], on = true) => { FakeIO.tell(pages.map(n => places(s)[n - 1] as HTMLElement), on); await flush(10) }
/** a scroll by the reader: an input on the pane (it is the driver), then its scrollTop */
async function scrollBy(pane: HTMLElement, dy: number) {
  pane.dispatchEvent(new Event('wheel'))
  pane.scrollTop += dy
  await flush()
}
/** the page at a pane's reading line (a quarter down its 800 px), and how far down it */
function readingAt(pane: HTMLElement) {
  const y = pane.scrollTop + 800 * 0.25
  const pages = [...pane.querySelectorAll<HTMLElement>(':scope > .pdfViewer > .page')]
  const p = pages.findIndex(d => d.offsetTop + d.offsetHeight > y)
  const d = pages[p] as HTMLElement
  return { page: p + 1, f: (y - d.offsetTop) / d.offsetHeight }
}
const stub = (): Shapes & { calls: string[] } => {
  const calls: string[] = []
  const run = { page: 1 }
  return {
    calls,
    runs: id => { calls.push(`runs ${id}`); return id === 1 ? [run] : [] },
    block: () => { calls.push('block'); return { page: 1, x0: 100, y0: 600, x1: 300, y1: 700 } },
    sentence: () => { calls.push('sentence'); return [] },
    float: () => { calls.push('float'); return null },
    floatShapes: () => [],
    fits: () => { calls.push('fits'); return false },
    hit: (page, x, y) => { calls.push(`hit ${page}`); return x >= 100 && x <= 300 && y >= 600 && y <= 700 ? { id: 1, s: -1 } : null },
    click: () => { calls.push('click'); return { id: 1, line: 0, f: 0 } },
  }
}

describe('V1: one original at a time', () => {
  it('a showOriginal made while another loads supersedes it: the older task destroyed, its call answering superseded', async () => {
    const s = setup()
    const a = fakeTask(), b = fakeTask()
    const first = s.view.showOriginal(() => a as unknown as DocumentTask)
    const second = s.view.showOriginal(() => b as unknown as DocumentTask)
    expect(await first).toBe('superseded')
    expect(a.destroy).toHaveBeenCalledTimes(1)
    b.resolve(fakeDoc(3))
    expect(await second).toBe('opened')
    expect(b.destroy).not.toHaveBeenCalled()
    expect(leftViewer().pagesCount).toBe(3)
  })

  it('a showOriginal made while the one before waits for its pages to be laid out supersedes it: no opened from it', async () => {
    const s = setup()
    const a = fakeTask(), b = fakeTask()
    const doc = fakeDoc(3)
    // the view reads page 1 at once; the viewer's own read of it, which lays the pages out, waits
    let lay: () => void = () => {}
    const page1 = doc.getPage.bind(doc)
    let asked = 0
    doc.getPage = n => (n === 1 && ++asked === 2 ? new Promise(r => { lay = () => r(page1(1)) }) : page1(n))
    const first = s.view.showOriginal(() => a as unknown as DocumentTask)
    a.resolve(doc)
    await flush(10)
    expect(leftViewer().pdfDocument).toBe(doc)
    const second = s.view.showOriginal(() => b as unknown as DocumentTask)
    expect(await first).toBe('superseded')
    expect(a.destroy).toHaveBeenCalledTimes(1)
    lay()
    b.resolve(fakeDoc(4))
    expect(await second).toBe('opened')
    expect(s.events.filter(e => e.type === 'opened')).toEqual([{ type: 'opened', pages: 4 }])
  })

  it('an opener that throws, or whose task rejects, answers failed and says why', async () => {
    const s = setup()
    expect(await s.view.showOriginal(() => { throw new Error('no address') })).toBe('failed')
    const t = fakeTask()
    const answer = s.view.showOriginal(() => t as unknown as DocumentTask)
    t.reject(new Error('404'))
    expect(await answer).toBe('failed')
    expect(t.destroy).toHaveBeenCalledTimes(1)
    expect(s.events.filter(e => e.type === 'failed').map(e => (e as { error: string }).error)).toEqual(['no address', '404'])
  })

  it('after three failed opens the panes hold no extra viewer and no live task', async () => {
    const s = setup()
    for (let i = 0; i < 3; i++) { const t = fakeTask(); const a = s.view.showOriginal(() => t as unknown as DocumentTask); t.reject(new Error('down')); await a }
    expect(FakePDFViewer.made).toHaveLength(1)
    expect(s.view.probe().tasks).toBe(0)
    expect(s.panes.left.querySelectorAll('.page')).toHaveLength(0)
    expect(places(s)).toHaveLength(0)
  })

  it('calls each opener once, with the kit\'s assets', async () => {
    const s = setup()
    const open = vi.fn((_o: Readonly<Record<string, unknown>>) => { const t = fakeTask(); t.resolve(fakeDoc(2)); return t as unknown as DocumentTask })
    expect(await s.view.showOriginal(open)).toBe('opened')
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0]?.[0]).toEqual(s.host.pdfjs.assets)
    expect(s.events.filter(e => e.type === 'opened')).toEqual([{ type: 'opened', pages: 2 }])
  })
})

describe('V2: a change during an open applies once open', () => {
  it('a display change, a zoom and a sync toggle made while the original loads are in force on the viewer and the places', async () => {
    const s = setup()
    const t = fakeTask()
    const answer = s.view.showOriginal(() => t as unknown as DocumentTask)
    s.view.setDisplay('original')
    s.view.zoomTo(1.5)
    s.view.setSync(false)
    t.resolve(fakeDoc(4))
    expect(await answer).toBe('opened')
    expect(document.documentElement.getAttribute('data-axt-pdf-mode')).toBe('original')
    expect(leftViewer().currentScale).toBe(1.5)
    expect(s.panes.right.querySelector<HTMLElement>('.pdfViewer')?.style.getPropertyValue('--scale-factor')).toBe(String(1.5 * 96 / 72))
    expect(last(s.events, 'sync')).toEqual({ type: 'sync', on: false, available: true })
    expect(last(s.events, 'scale')).toMatchObject({ scale: 1.5, zoom: 1.5 })
  })
})

describe('V2: the commands held', () => {
  it('a command held for an open that failed is let go: the next open does not replay it', async () => {
    const s = setup()
    const t = fakeTask()
    const answer = s.view.showOriginal(() => t as unknown as DocumentTask)
    s.view.zoomBy(2)
    t.reject(new Error('down'))
    expect(await answer).toBe('failed')
    await opened(s, 3)
    expect(leftViewer().currentScale).toBeCloseTo(560 / 816, 3)
  })

  it('a command held that throws does not hold the open: it answers opened, and the commands after it run', async () => {
    const s = setup()
    internalsOf(s.view).setUnits({ unitAt: () => null, firstRect: () => { throw new Error('a unit that cannot be read') }, pageOf: () => null })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = fakeTask()
    const answer = s.view.showOriginal(() => t as unknown as DocumentTask)
    s.view.goToUnit(3)
    s.view.zoomTo(1.5)
    t.resolve(fakeDoc(3))
    expect(await answer).toBe('opened')
    expect(leftViewer().currentScale).toBe(1.5)
    expect(warn).toHaveBeenCalled()
  })
})

describe('the places: the original\'s pages on the right', () => {
  it('number the original\'s pages, at its page boxes, and follow its zoom', async () => {
    const s = setup()
    await opened(s, 5)
    const left = [...s.panes.left.querySelectorAll<HTMLElement>('.page')]
    expect(places(s)).toHaveLength(5)
    expect(places(s).map(p => [p.style.width, p.style.height])).toEqual(left.map(p => [p.style.width, p.style.height]))
    s.view.zoomBy(1.25)
    expect(places(s).map(p => p.style.height)).toEqual([...s.panes.left.querySelectorAll<HTMLElement>('.page')].map(p => p.style.height))
    expect(places(s).every(p => p.dataset.pageNumber)).toBe(true)
  })

  it('say nothing of the right\'s page while its pane is out of the display, and its page in view once it is shown', async () => {
    const s = setup()
    s.view.setDisplay('original')
    await opened(s, 4)
    const right = () => s.events.filter(e => e.type === 'page' && e.side === 'right')
    expect(right()).toEqual([])
    s.view.setDisplay('bilingual')
    await s.clock.tick(); await s.clock.tick(); await s.clock.tick()
    expect(right().at(-1)).toEqual({ type: 'page', side: 'right', page: 1, pages: 4, laid: false })
  })

  it('say the right\'s page in view, one of N, laid or not', async () => {
    const s = setup()
    await opened(s, 4)
    await flush()
    expect(last(s.events, 'page')).toBeDefined()
    expect(s.events.filter(e => e.type === 'page' && e.side === 'right').at(-1)).toEqual({ type: 'page', side: 'right', page: 1, pages: 4, laid: false })
    s.panes.right.scrollTop = 2 * (792 + 14) + 20
    await flush()
    expect(s.events.filter(e => e.type === 'page' && e.side === 'right').at(-1)).toMatchObject({ page: 3, pages: 4 })
  })
})

describe('V3: the reading place kept', () => {
  it('across a display change, a zoom and a narrow window, the page and the point at the reading line stay', async () => {
    const s = setup()
    await opened(s, 6)
    const L = s.panes.left, R = s.panes.right, at = readingAt
    await scrollBy(L, 2 * 806 + 300)
    const before = at(L)
    s.view.setDisplay('translation')
    await s.clock.tick(); await s.clock.tick(); await s.clock.tick()
    expect(at(R).page).toBe(before.page)
    expect(Math.abs(at(R).f - before.f)).toBeLessThan(0.02)
    s.view.zoomTo(2)
    expect(at(R).page).toBe(before.page)
    expect(Math.abs(at(R).f - before.f)).toBeLessThan(0.02)
    s.view.setDisplay('bilingual')
    s.view.setNarrow(true)
    await s.clock.tick(); await s.clock.tick(); await s.clock.tick()
    expect(at(R).page).toBe(before.page)
    expect(Math.abs(at(R).f - before.f)).toBeLessThan(0.02)
  })
})

describe('V3 with the sync off: each pane is the reader\'s own', () => {
  it('a zoom keeps each pane at its own place, not the other\'s', async () => {
    const s = setup()
    await opened(s, 6)
    s.view.setSync(false)
    const L = s.panes.left, R = s.panes.right
    const top = (pane: HTMLElement, n: number) => (pane.querySelectorAll<HTMLElement>(':scope > .pdfViewer > .page')[n - 1] as HTMLElement).offsetTop
    await scrollBy(L, top(L, 2) - L.scrollTop)
    await scrollBy(R, top(R, 5) - R.scrollTop)
    expect([readingAt(L).page, readingAt(R).page]).toEqual([2, 5])
    const before = [readingAt(L), readingAt(R)]
    s.view.zoomTo(2)
    s.view.zoomBy(0.8)
    expect([readingAt(L).page, readingAt(R).page]).toEqual([2, 5])
    expect(Math.abs(readingAt(L).f - (before[0] as { f: number }).f)).toBeLessThan(0.02)
    expect(Math.abs(readingAt(R).f - (before[1] as { f: number }).f)).toBeLessThan(0.02)
  })
})

describe('V4 and V9: sync is one mode, the identity follower, available once the places exist', () => {
  it('is not available before an open, and is once the places exist', async () => {
    const s = setup()
    expect(last(s.events, 'sync')).toEqual({ type: 'sync', on: false, available: false })
    await opened(s, 4)
    expect(last(s.events, 'sync')).toEqual({ type: 'sync', on: true, available: true })
  })

  it('moves the other pane by the reader\'s steps, and levels it at rest: the same point of the same page', async () => {
    const s = setup()
    await opened(s, 6)
    const L = s.panes.left, R = s.panes.right
    // level from the start, though PDF.js lays the left's pages out a margin down
    expect(R.scrollTop).toBe(L.scrollTop)
    await scrollBy(L, 500)
    await s.clock.tick()
    expect(R.scrollTop).toBe(L.scrollTop)
    R.scrollTop = L.scrollTop - 30 // the follower scrolled by something else, as a link does: it goes on from there
    await flush()
    await scrollBy(L, 100)
    await s.clock.tick()
    expect(R.scrollTop).toBe(L.scrollTop - 30)
    L.dispatchEvent(new Event('scrollend'))
    await s.clock.advance(700)
    expect(R.scrollTop).toBe(L.scrollTop)
    expect(s.view.probe().levelError).toBe(0)
  })

  it('levels the pair whichever pane is scrolled before any layer', async () => {
    const s = setup()
    await opened(s, 6)
    for (const [from, dy] of [[s.panes.right, 900], [s.panes.left, -300]] as const) {
      await scrollBy(from, dy)
      await s.clock.tick()
      from.dispatchEvent(new Event('scrollend'))
      await s.clock.advance(700)
      expect(Math.abs(Number(s.view.probe().levelError))).toBeLessThan(1)
      expect(s.panes.left.scrollTop).toBe(s.panes.right.scrollTop)
    }
  })

  it('takes a boolean, and off, nothing follows', async () => {
    const s = setup()
    await opened(s, 6)
    s.view.setSync(false)
    expect(last(s.events, 'sync')).toEqual({ type: 'sync', on: false, available: true })
    const before = s.panes.right.scrollTop
    await scrollBy(s.panes.left, 400)
    s.panes.left.dispatchEvent(new Event('scrollend'))
    await s.clock.advance(700)
    expect(s.panes.right.scrollTop).toBe(before)
  })

  it('on the compositor, binds the follower\'s stack to the driver by a ScrollTimeline, and bakes it at rest', async () => {
    const timelines: unknown[] = []
    vi.stubGlobal('ScrollTimeline', class { constructor(o: unknown) { timelines.push(o) } })
    const anims: { keyframes: unknown; cancel: ReturnType<typeof vi.fn>; currentTime: number }[] = []
    const animate = vi.fn(function (this: HTMLElement, keyframes: unknown) { const a = { keyframes, cancel: vi.fn(), currentTime: 0, onfinish: null }; anims.push(a); return a })
    ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = animate
    try {
      const s = setup()
      await opened(s, 6)
      s.panes.left.dispatchEvent(new Event('wheel'))
      expect(timelines).toHaveLength(1)
      expect(animate.mock.contexts[0]).toBe(s.panes.right.querySelector('.pdfViewer'))
      expect(s.view.probe()).toMatchObject({ compositing: true, motion: 'scroll', driver: 'left' })
      s.panes.right.dispatchEvent(new Event('wheel'))
      expect(anims[0]?.cancel).toHaveBeenCalled()
      expect(s.view.probe().driver).toBe('right')
    } finally { delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate }
  })
})

describe('the follower\'s rest armed again after an input', () => {
  it('ends its listener on the view\'s signal with the input, not with the view', async () => {
    const { left, right } = drawPanes()
    const pane = (container: HTMLElement) => ({ container, stack: container.firstElementChild as HTMLElement, redraw() {}, lend() {} })
    const ac = new AbortController(), clock = manualClock()
    const on: { options: AddEventListenerOptions | undefined }[] = []
    const add = ac.signal.addEventListener.bind(ac.signal)
    ac.signal.addEventListener = ((type: string, fn: never, options?: AddEventListenerOptions) => { on.push({ options }); add(type, fn, options) }) as typeof ac.signal.addEventListener
    const L = pane(left), R = pane(right)
    const f = createFollower({ panes: { left: L, right: R }, active: () => true, target: () => 0, clock, timer: false, compositor: null, reduced: () => false, laidOut: async () => {}, window, signal: ac.signal })
    // a page tall enough to scroll, a scroll of the left's, its end: a rest is to come
    for (const s of [left, right]) { const p = document.createElement('div'); p.className = 'page'; p.style.height = '3000px'; s.firstElementChild?.append(p) }
    f.input(L, 'wheel')
    left.scrollTop = 300
    f.scrolled(L)
    f.ended(L)
    // a press within the rest's wait calls it off, to be armed again at its release
    f.input(L, 'pointerdown')
    expect(on).toHaveLength(1)
    window.dispatchEvent(new Event('pointerup'))
    expect(on[0]?.options?.signal?.aborted).toBe(true)
    f.stop()
  })
})

describe('V5: dispose leaves nothing', () => {
  it('no listener, observer, animation, document, live task, place, place page view or attribute of its own', async () => {
    const s = setup()
    const { task } = await opened(s, 5)
    await nearOn(s, [1, 2])
    expect(FakePDFPageView.made.length).toBeGreaterThan(0)
    const side = { dispose: vi.fn() }
    internalsOf(s.view).attach(side)
    s.view.dispose()
    expect(side.dispose).toHaveBeenCalledTimes(1)
    expect(added.length).toBeGreaterThan(20)
    const live = added.filter(a => !a.removed && !(a.signal?.aborted))
    expect(live.map(a => `${(a.target as Element).id ?? a.target.constructor.name} ${a.type}`)).toEqual([])
    expect(FakeIO.live.size).toBe(0)
    expect([...FakeRO.live].filter(r => r.targets.size)).toHaveLength(0)
    expect(task.destroy).toHaveBeenCalledTimes(1)
    expect(leftViewer().pdfDocument).toBeNull()
    expect(places(s)).toHaveLength(0)
    expect(FakePDFPageView.made.every(v => !v.div.isConnected && v.canvas === null)).toBe(true)
    expect(s.view.probe().tasks).toBe(0)
    expect(document.documentElement.hasAttribute('data-axt-pdf-mode')).toBe(false)
    expect(s.clock.pending()).toEqual({ frames: 0, timers: 0 })
    // and none of PDF.js's events is still heard
    expect(FakeEventBus.made.map(b => b.count())).toEqual(FakeEventBus.made.map(() => 0))
    // after dispose, commands are no-ops
    s.view.zoomBy(2); s.view.setDisplay('original')
    expect(await s.view.showOriginal(() => fakeTask() as unknown as DocumentTask)).toBe('failed')
  })
})

describe('V5: an animation under way', () => {
  it('is cancelled by dispose: the follower bound on the compositor lets go', async () => {
    vi.stubGlobal('ScrollTimeline', class {})
    const anims: { cancel: ReturnType<typeof vi.fn> }[] = []
    ;(HTMLElement.prototype as unknown as { animate: unknown }).animate = function () { const a = { cancel: vi.fn(), currentTime: 0, onfinish: null }; anims.push(a); return a }
    try {
      const s = setup()
      await opened(s, 4)
      s.panes.left.dispatchEvent(new Event('wheel'))
      expect(anims).toHaveLength(1)
      s.view.dispose()
      expect(anims.every(a => a.cancel.mock.calls.length === 1)).toBe(true)
    } finally { delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate }
  })
})

describe('V6: overlays', () => {
  it('the highlight is laid at the page\'s scale and follows a pinch by transform; it is kept across a redraw', async () => {
    const s = setup()
    await opened(s, 3)
    const shapes = stub()
    internalsOf(s.view).setShapes('left', shapes)
    internalsOf(s.view).setShapes('right', stub())
    leftViewer().render(1)
    internalsOf(s.view).light(1)
    const band = s.panes.left.querySelector<HTMLElement>('.page .axt-hl-layer > .axt-hl')
    expect(band).not.toBeNull()
    expect(band?.style.getPropertyValue('scale')).toBe(`calc(var(--total-scale-factor) / ${leftViewer().getPageView(0)?.viewport.scale})`)
    expect(s.panes.right.querySelector('.page .axt-hl-layer > .axt-hl')).not.toBeNull()
    leftViewer().getPageView(0)?.reset()
    await flush()
    expect(s.panes.left.querySelector('.page .axt-hl-layer > .axt-hl')).toBe(band)
  })

  it('a pinch reads every rectangle before the left\'s viewer is scaled, over either pane', async () => {
    const s = setup()
    await opened(s, 4)
    for (const side of ['left', 'right'] as const) {
      const viewer = leftViewer()
      reads.log = []
      reads.counting = true
      const real = viewer.updateScale.bind(viewer)
      let at = -1
      viewer.updateScale = o => { at = reads.log.length; reads.counting = false; real(o); reads.counting = true; reads.log.push('-- after') }
      const before = s.panes.right.scrollTop
      s.view.pinch(side, 1.1, [side === 'left' ? 200 : 800, 300])
      reads.counting = false
      viewer.updateScale = real
      // the right's point under the pointer, or at its top quarter, kept: the pane scrolled with its growing pages
      expect(s.panes.right.scrollTop).toBeGreaterThan(before)
      expect(at).toBeGreaterThan(0)
      // after the scale, writes alone: no read between the scale and the end of the pinch's own task
      expect(reads.log.slice(at)).toEqual(['-- after'])
    }
    expect(last(s.events, 'scale')?.zoom).toBeNull()
  })

  it('an original let go lets go of what was lit on its pages: nothing painted holds them', async () => {
    const s = setup()
    await opened(s, 3)
    internalsOf(s.view).setShapes('left', stub())
    internalsOf(s.view).setShapes('right', stub())
    internalsOf(s.view).light(1)
    const band = s.panes.left.querySelector('.page .axt-hl-layer > .axt-hl') as HTMLElement
    expect(s.view.probe().lit).toBe(1)
    const b = fakeTask()
    const again = s.view.showOriginal(() => b as unknown as DocumentTask)
    b.resolve(fakeDoc(3))
    expect(await again).toBe('opened')
    expect(s.view.probe().lit).toBeNull()
    expect(band.isConnected || band.parentElement !== null).toBe(false)
  })

  it('the zoom menu\'s check follows the fit applied, and is none after a step', async () => {
    const s = setup()
    await opened(s, 3)
    s.view.zoomTo('page-fit')
    expect(last(s.events, 'scale')?.zoom).toBe('page-fit')
    s.view.zoomBy(1.1)
    expect(last(s.events, 'scale')?.zoom).toBeNull()
    s.view.zoomTo('page-width')
    expect(last(s.events, 'scale')?.zoom).toBe('page-width')
  })
})

describe('V7: the probe hooks hold bounded state', () => {
  it('counts and the latest, scalars only, however long the visit', async () => {
    const s = setup()
    await opened(s, 6)
    for (let i = 0; i < 300; i++) { s.panes.right.scrollTop = (i * 137) % 3000; s.panes.left.scrollTop = (i * 37) % 3000; await flush(2) }
    const p = s.view.probe()
    for (const v of Object.values(p)) expect(v === null || ['number', 'string', 'boolean'].includes(typeof v)).toBe(true)
    expect(JSON.stringify(p).length).toBeLessThan(1500)
    expect(p.events).toBeGreaterThan(10)
  })
})

describe('V8: the right pane, read through its places', () => {
  it('zooming with the right alone scales the left\'s viewer, and the places follow; page-width fits the right pane', async () => {
    const s = setup()
    await opened(s, 3)
    s.view.setDisplay('translation')
    await s.clock.tick(); await s.clock.tick()
    // the right pane is 600 px: page-width is its width less PDF.js's 40 px over the page's (612 pt at 96/72)
    expect(leftViewer().currentScale).toBeCloseTo(560 / 816, 3)
    s.view.zoomBy(1.5)
    expect(leftViewer().currentScale).toBeCloseTo(Math.round((560 / 816) * 1.5 * 100) / 100, 3)
    expect(s.panes.right.querySelector<HTMLElement>('.pdfViewer')?.style.getPropertyValue('--scale-factor')).toBe(leftViewer().viewer.style.getPropertyValue('--scale-factor'))
    s.view.zoomTo('page-width')
    expect(leftViewer().currentScale).toBeCloseTo(560 / 816, 3)
  })

  it('fits the right alone by the page as it shows, a quarter-turned page by its turned size', async () => {
    const s = setup()
    await opened(s, 3, { rotate: 90 })
    s.view.setDisplay('translation')
    await s.clock.tick(); await s.clock.tick()
    // the page shows 792 units wide: page-width is the pane's 560 px over 792 at 96/72
    expect(leftViewer().currentScale).toBeCloseTo(560 / 1056, 3)
    s.view.zoomTo('page-fit')
    expect(leftViewer().currentScale).toBeCloseTo(Math.min(560 / 1056, 795 / 816), 3)
  })

  it('a click on the right levels the pair at the click\'s height, the same point of the same page', async () => {
    const s = setup()
    await opened(s, 6)
    s.view.setSync(false)
    s.panes.left.scrollTop = 300
    s.panes.right.scrollTop = 1000
    await flush()
    s.view.setSync(true)
    const page = places(s)[1] as HTMLElement
    page.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 800, clientY: 300 }))
    page.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 800, clientY: 300 }))
    await flush()
    expect(s.panes.left.scrollTop).toBe(1000)
    expect(s.view.probe().levelError).toBe(0)
  })

  it('goToPage on the right scrolls its places, and the left follows', async () => {
    const s = setup()
    await opened(s, 6)
    s.view.goToPage('right', 4)
    await flush()
    expect(s.panes.right.scrollTop).toBe((places(s)[3] as HTMLElement).offsetTop)
    await s.clock.tick()
    expect(s.panes.left.scrollTop).toBe(s.panes.right.scrollTop)
  })
})

describe('V10: the original dropped and read', () => {
  it('drops where the task is the one shown: the places\' page views first, the viewer emptied, then the task; the places kept, the skeleton shown', async () => {
    const s = setup()
    const log: string[] = []
    FakePDFPageView.log = log
    const task = fakeTask(log, 'task')
    const answer = s.view.showOriginal(() => task as unknown as DocumentTask)
    task.resolve(fakeDoc(4))
    await answer
    await nearOn(s, [1, 2])
    const viewer = leftViewer()
    const set = viewer.setDocument.bind(viewer)
    viewer.setDocument = d => { log.push(d ? 'viewer set' : 'viewer emptied'); set(d) }
    const sizes = places(s).map(p => p.style.height)
    expect(s.view.dropOriginal(task as unknown as DocumentTask)).toBe(true)
    const viewsGone = log.filter(l => l.startsWith('reset page view'))
    expect(viewsGone.length).toBeGreaterThanOrEqual(2)
    expect(log.indexOf('viewer emptied')).toBeGreaterThan(log.lastIndexOf(viewsGone.at(-1) as string))
    expect(log.indexOf('destroy task')).toBeGreaterThan(log.indexOf('viewer emptied'))
    expect(places(s).map(p => p.style.height)).toEqual(sizes)
    expect(places(s).slice(0, 2).every(p => p.querySelector('.axt-sk'))).toBe(true)
    expect(s.events.at(-1)?.type === 'dropped' || s.events.some(e => e.type === 'dropped')).toBe(true)
    expect(s.view.originalData()).toBeNull()
    expect(last(s.events, 'sync')?.available).toBe(false)
  })

  it('does nothing with a task not shown, and answers false', async () => {
    const s = setup()
    const { task } = await opened(s, 2)
    expect(s.view.dropOriginal(fakeTask() as unknown as DocumentTask)).toBe(false)
    expect(task.destroy).not.toHaveBeenCalled()
    expect(await s.view.originalData()).toEqual(new Uint8Array([37, 80, 68, 70]))
  })

  it('a superseding showOriginal lets the shown one go in the same order', async () => {
    const s = setup()
    const log: string[] = []
    FakePDFPageView.log = log
    const a = fakeTask(log, 'a'), b = fakeTask(log, 'b')
    const first = s.view.showOriginal(() => a as unknown as DocumentTask)
    a.resolve(fakeDoc(3))
    await first
    await nearOn(s, [1])
    const second = s.view.showOriginal(() => b as unknown as DocumentTask)
    b.resolve(fakeDoc(3))
    expect(await second).toBe('opened')
    expect(log.indexOf('destroy a')).toBeGreaterThan(log.indexOf('reset page view 1'))
    expect(b.destroy).not.toHaveBeenCalled()
    expect(places(s)).toHaveLength(3)
  })

  it('an original shown again opens where the reader was, on both panes', async () => {
    const s = setup()
    await opened(s, 6)
    await scrollBy(s.panes.left, 1700)
    await s.clock.tick()
    const at = s.panes.left.scrollTop
    const b = fakeTask()
    const again = s.view.showOriginal(() => b as unknown as DocumentTask)
    b.resolve(fakeDoc(6))
    expect(await again).toBe('opened')
    expect(Math.abs(s.panes.left.scrollTop - at)).toBeLessThan(2)
    expect(s.panes.right.scrollTop).toBe(s.panes.left.scrollTop)
  })

  it('originalData is null with no document', () => {
    expect(setup().view.originalData()).toBeNull()
  })
})

describe('V11: the places before a layer', () => {
  it('within NEAR each place shows the original\'s page through a PDFPageView over the left\'s document: text, links through the view\'s jump', async () => {
    const s = setup()
    const open = vi.fn(() => { const t = fakeTask(); t.resolve(fakeDoc(6)); return t as unknown as DocumentTask })
    await s.view.showOriginal(open)
    await flush()
    await nearOn(s, [1, 2, 3])
    expect(open).toHaveBeenCalledTimes(1)
    expect(FakePDFPageView.made.map(v => v.id)).toEqual([1, 2, 3])
    await flush(20)
    const p1 = places(s)[0] as HTMLElement
    expect(p1.querySelector('.textLayer')?.textContent).toBe('page 1')
    expect(p1.querySelector<HTMLAnchorElement>('.annotationLayer a')?.target).toBe('_blank')
    expect(p1.getAttribute('aria-label')).toBe('right 1')
    expect(p1.hasAttribute('aria-hidden')).toBe(false)
    expect(p1.querySelector('[data-l10n-id]')).toBeNull()
    // an internal link: the right's link service scrolls the pane clicked
    const links = (FakePDFPageView.made[0] as FakePDFPageView).options.layerProperties.linkService
    links.pdfViewer.scrollPageIntoView({ pageNumber: 5, destArray: [null, { name: 'XYZ' }, 0, 792] })
    await flush()
    expect(s.panes.right.scrollTop).toBe((places(s)[4] as HTMLElement).offsetTop)
  })

  it('a place near the view but not in it waits to draw the original\'s page until the layer lets the pages ahead go (letAheadGo) or AHEAD_HOLD_MS: one in view drawn at once, the page views made all the same (2610.31506v1: the right\'s page 3, near, read 5.5 MB of images while page 1\'s layer waited)', async () => {
    const s = setup()
    await opened(s, 6)
    // pages 1 and 2 in view, page 3 near alone (its near observer told, not its in-view one)
    await nearOn(s, [1, 2])
    const p3 = places(s)[2] as HTMLElement
    for (const io of [...FakeIO.live]) if ((io.options as { rootMargin?: string } | undefined)?.rootMargin === NEAR && io.targets.has(p3)) io.cb([{ target: p3, isIntersecting: true }])
    await flush(20)
    const drawsOf = (n: number) => FakePDFPageView.made.filter(v => v.id === n).reduce((a, v) => a + v.draws, 0)
    expect(FakePDFPageView.made.map(v => v.id)).toEqual([1, 2, 3])
    expect([drawsOf(1), drawsOf(2), drawsOf(3)]).toEqual([1, 1, 0])
    expect(internalsOf(s.view).places.aheadHeld()).toBe(true)
    // let go (the layer's first page drawn, or no layer): page 3 drawn
    internalsOf(s.view).places.letAheadGo()
    await flush(20)
    expect(drawsOf(3)).toBe(1)
    expect(internalsOf(s.view).places.aheadHeld()).toBe(false)
    // a place that comes into view while held is drawn at once
    const t = setup()
    await opened(t, 6)
    await nearOn(t, [1])
    const q2 = places(t)[1] as HTMLElement
    for (const io of [...FakeIO.live]) if ((io.options as { rootMargin?: string } | undefined)?.rootMargin === NEAR && io.targets.has(q2)) io.cb([{ target: q2, isIntersecting: true }])
    await flush(20)
    const drawsIn = (n: number) => FakePDFPageView.made.filter(v => v.id === n && (t.panes.right as HTMLElement).contains(v.div)).reduce((a, v) => a + v.draws, 0)
    expect(drawsIn(2)).toBe(0)
    await nearOn(t, [2])
    expect(drawsIn(2)).toBe(1)
  })

  it('the hold of the pages ahead ends by itself AHEAD_HOLD_MS after the places are made, where nothing lets it go (no layer for the visit)', async () => {
    const s = setup()
    await opened(s, 6)
    await nearOn(s, [1])
    const p2 = places(s)[1] as HTMLElement
    for (const io of [...FakeIO.live]) if ((io.options as { rootMargin?: string } | undefined)?.rootMargin === NEAR && io.targets.has(p2)) io.cb([{ target: p2, isIntersecting: true }])
    await flush(20)
    const drawsOf = (n: number) => FakePDFPageView.made.filter(v => v.id === n).reduce((a, v) => a + v.draws, 0)
    expect(drawsOf(2)).toBe(0)
    await s.clock.advance(AHEAD_HOLD_MS)
    await flush(20)
    expect(drawsOf(2)).toBe(1)
  })

  it('a link out of the paper, on either pane, goes out through the host alone', async () => {
    const s = setup()
    await opened(s, 6)
    await nearOn(s, [1])
    await flush(20)
    const a = (places(s)[0] as HTMLElement).querySelector('.annotationLayer a') as HTMLAnchorElement
    expect(a.href).toBe('https://example.invalid/out')
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(s.host.links.openExternal).toHaveBeenCalledWith('https://example.invalid/out')
    // the left's own links, bound by PDF.js's viewer through its link service, the same way
    const left = document.createElement('a')
    ;(FakeLinkService.made[0] as FakeLinkService).addLinkAttributes(left, 'https://example.invalid/left')
    s.panes.left.append(left)
    left.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(s.host.links.openExternal).toHaveBeenLastCalledWith('https://example.invalid/left')
  })

  it('the right\'s link service takes every named action PDF.js gives it: next and previous page, first and last, the optional content', async () => {
    const s = setup()
    await opened(s, 6)
    await nearOn(s, [1])
    await flush(20)
    const viewer = (FakePDFPageView.made[0] as FakePDFPageView).options.layerProperties.linkService.pdfViewer
    const top = (n: number) => (places(s)[n - 1] as HTMLElement).offsetTop
    expect(viewer.nextPage()).toBe(true)
    await flush()
    expect(s.panes.right.scrollTop).toBe(top(2))
    expect(viewer.previousPage()).toBe(true)
    await flush()
    expect(s.panes.right.scrollTop).toBe(top(1))
    expect(viewer.previousPage()).toBe(false)
    viewer.currentPageNumber = 6
    await flush()
    expect(s.panes.right.scrollTop).toBe(Math.min(top(6), s.panes.right.scrollHeight - 800))
    viewer.pagesRotation = 90
    expect(viewer.pagesRotation).toBe(0)
    expect(() => viewer.optionalContentConfigPromise).not.toThrow()
  })

  it('a destination\'s zoom is honoured on the right as PDF.js honours it on the left: XYZ\'s, Fit, FitH, FitV, FitR', async () => {
    const s = setup()
    await opened(s, 6)
    await nearOn(s, [1])
    await flush(20)
    const viewer = (FakePDFPageView.made[0] as FakePDFPageView).options.layerProperties.linkService.pdfViewer
    const top = (n: number) => (places(s)[n - 1] as HTMLElement).offsetTop
    const scale = () => leftViewer().currentScale
    const go = async (pageNumber: number, destArray: unknown[]) => { viewer.scrollPageIntoView({ pageNumber, destArray }); await flush() }
    // XYZ with a zoom: the scale, then the point at the top of the pane
    await go(3, [null, { name: 'XYZ' }, 0, 692, 1.5])
    expect(scale()).toBe(1.5)
    expect(last(s.events, 'scale')?.zoom).toBe(1.5)
    expect(s.panes.right.scrollTop).toBe(Math.round(top(3) + 100 * 1.5 * 96 / 72))
    // Fit: the page fitted whole, its top at the pane's
    await go(2, [null, { name: 'Fit' }])
    expect(scale()).toBeCloseTo(Math.min(560 / 816, 795 / 1056), 3)
    expect(last(s.events, 'scale')?.zoom).toBe('page-fit')
    expect(s.panes.right.scrollTop).toBe(top(2))
    // FitH: the width fitted, the height given
    await go(2, [null, { name: 'FitH' }, 396])
    expect(scale()).toBeCloseTo(560 / 816, 3)
    expect(s.panes.right.scrollTop).toBe(Math.round(top(2) + 396 * scale() * 96 / 72))
    // FitV: the page's height fitted to the right pane
    await go(2, [null, { name: 'FitV' }, 0])
    expect(scale()).toBeCloseTo(795 / 1056, 3)
    expect(last(s.events, 'scale')?.zoom).toBeNull()
    // FitR: the rectangle fitted to the right pane, its top at the pane's
    await go(4, [null, { name: 'FitR' }, 100, 400, 300, 500])
    expect(scale()).toBeCloseTo(Math.min(560 / 200, 795 / 100) * 72 / 96, 3)
    expect(s.panes.right.scrollTop).toBe(Math.round(top(4) + (792 - 500) * scale() * 96 / 72))
    // XYZ with no zoom keeps the scale
    const was = scale()
    await go(5, [null, { name: 'XYZ' }, null, null, 0])
    expect(scale()).toBe(was)
    expect(s.panes.right.scrollTop).toBe(top(5))
  })

  it('a far place\'s page view is destroyed with its canvas; no second document is opened', async () => {
    const s = setup()
    await opened(s, 6)
    await nearOn(s, [1, 2])
    await flush(20)
    const first = FakePDFPageView.made[0] as FakePDFPageView
    expect(first.canvas?.width).toBe(100)
    const canvas = first.canvas as HTMLCanvasElement
    await nearOn(s, [1], false)
    expect(canvas.width).toBe(0)
    expect(first.div.isConnected).toBe(false)
    expect((places(s)[0] as HTMLElement).querySelector('.axt-place-view')?.children).toHaveLength(0)
    expect(leftViewer().log.filter(l => l === 'setDocument')).toHaveLength(1)
  })

  it('a place far from the view lets its page go where only the right drew it; the left\'s drawn pages stay the left\'s', async () => {
    const s = setup()
    const { doc } = await opened(s, 6)
    s.view.setDisplay('translation')
    await s.clock.tick(); await s.clock.tick(); await s.clock.tick()
    await nearOn(s, [4])
    await flush(20)
    const four = await doc.getPage(4)
    expect(four.cleanup).not.toHaveBeenCalled()
    await nearOn(s, [4], false)
    expect(four.cleanup).toHaveBeenCalledTimes(1)
    leftViewer().render(2)
    await nearOn(s, [2])
    await flush(20)
    await nearOn(s, [2], false)
    expect((await doc.getPage(2)).cleanup).not.toHaveBeenCalled()
  })

  it('draws the near places one at a time', async () => {
    const s = setup()
    await opened(s, 6)
    await nearOn(s, [1, 2, 3])
    await flush(30)
    expect(FakePDFPageView.made.map(v => v.draws)).toEqual([1, 1, 1])
    expect(FakePDFPageView.made.every(v => v.canvas)).toBe(true)
  })
})

describe('V12: the web\'s fixes as plain behaviour', () => {
  it('with scrollEnd timer, the pair levels after the rest with no scrollend event', async () => {
    const s = setup({ scrollEnd: 'timer' })
    await opened(s, 6)
    s.view.setSync(false); s.panes.right.scrollTop = 0; await flush(); s.view.setSync(true)
    s.panes.left.dispatchEvent(new Event('wheel'))
    s.panes.left.scrollTop = 800
    await flush()
    s.panes.right.scrollTop = 750 // something else moved the follower
    await flush()
    s.panes.left.scrollTop = 810
    await flush()
    await s.clock.advance(1000)
    expect(s.panes.right.scrollTop).toBe(810)
  })

  it('a finger held means no rest; its lift starts the wait again', async () => {
    const s = setup()
    await opened(s, 6)
    window.dispatchEvent(Object.assign(new Event('touchstart'), { touches: [{}] }))
    s.panes.left.dispatchEvent(new Event('touchstart'))
    s.panes.left.scrollTop = 600
    await flush()
    s.panes.right.scrollTop = 500
    await flush()
    s.panes.left.dispatchEvent(new Event('scrollend'))
    await s.clock.advance(1500)
    expect(s.panes.right.scrollTop).toBe(500)
    window.dispatchEvent(Object.assign(new Event('touchend'), { touches: [] }))
    await s.clock.advance(1500)
    expect(s.panes.right.scrollTop).toBe(600)
  })

  it('a click is not undone by the fallback end', async () => {
    const s = setup({ scrollEnd: 'timer' })
    await opened(s, 6)
    await scrollBy(s.panes.left, 900)
    await s.clock.tick()
    const page = s.panes.left.querySelectorAll('.page')[1] as HTMLElement
    page.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 500 }))
    page.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 100, clientY: 500 }))
    await flush()
    const after = s.panes.right.scrollTop
    s.panes.right.scrollTop = after + 37 // the reader's own scroll of the other pane: the timer's end must not pull it back
    await flush()
    await s.clock.advance(1500)
    expect(s.panes.right.scrollTop).toBe(after + 37)
  })

  it('three quick zoom steps give one redraw of the places', async () => {
    const s = setup()
    await opened(s, 4)
    await nearOn(s, [1])
    await flush(20)
    const v = FakePDFPageView.made[0] as FakePDFPageView
    expect(v.draws).toBe(1)
    s.view.zoomBy(1.1); await s.clock.advance(50); s.view.zoomBy(1.1); await s.clock.advance(50); s.view.zoomBy(1.1)
    expect(leftViewer().log.filter(l => l === 'updateScale 400')).toHaveLength(3)
    expect(v.draws).toBe(1)
    await s.clock.advance(700)
    await flush(20)
    expect(v.draws).toBe(2)
  })

  it('while a zoom\'s or a pinch\'s steps last the places\' stack is marked scaling, its text layers out of style and layout; marked no more once they are drawn again, nor for a zoom of one step', async () => {
    const s = setup()
    await opened(s, 4)
    await nearOn(s, [1])
    await flush(20)
    const stack = s.panes.right.querySelector(':scope > .pdfViewer') as HTMLElement
    expect(stack.hasAttribute('data-axt-scaling')).toBe(false)
    s.view.zoomBy(1.1); await s.clock.advance(50); s.view.zoomBy(1.1)
    expect(stack.hasAttribute('data-axt-scaling')).toBe(true)
    // (drawn again after the steps' delay, the text layers still out a while: a step soon after finds them so)
    await s.clock.advance(450)
    await flush(20)
    expect(stack.hasAttribute('data-axt-scaling')).toBe(true)
    s.view.zoomBy(1.1)
    await s.clock.advance(450)
    expect(stack.hasAttribute('data-axt-scaling')).toBe(true)
    await s.clock.advance(TEXT_BACK_MS + 100)
    await flush(20)
    expect(stack.hasAttribute('data-axt-scaling')).toBe(false)
    s.view.pinch('right', 1.1, [800, 300])
    expect(stack.hasAttribute('data-axt-scaling')).toBe(true)
    await s.clock.advance(400 + TEXT_BACK_MS + 100)
    expect(stack.hasAttribute('data-axt-scaling')).toBe(false)
    // (a zoom the menu sets is drawn at once: no step to wait for)
    s.view.zoomTo(2)
    expect(stack.hasAttribute('data-axt-scaling')).toBe(false)
    // (a menu zoom while the mark waits to go, then steps again: no reveal left over from before takes it off mid-steps)
    await s.clock.advance(TEXT_BACK_MS + 1000)
    s.view.zoomBy(1.1)
    await s.clock.advance(500)
    s.view.zoomTo(1.5)
    await s.clock.advance(100)
    s.view.zoomBy(1.1)
    await s.clock.advance(350)
    expect(stack.hasAttribute('data-axt-scaling')).toBe(true)
    await s.clock.advance(400 + TEXT_BACK_MS)
    expect(stack.hasAttribute('data-axt-scaling')).toBe(false)
    // (and the view's end takes the mark with it)
    s.view.zoomBy(1.1)
    s.view.dispose()
    expect(stack.hasAttribute('data-axt-scaling')).toBe(false)
  })

  it('a stub Shapes gets every paint, hit and click, and layoutOf none', async () => {
    const s = setup()
    await opened(s, 3)
    const left = stub(), right = stub()
    internalsOf(s.view).setShapes('left', left)
    internalsOf(s.view).setShapes('right', right)
    FakeRO.fire()
    await flush()
    const page = s.panes.left.querySelector('.page') as HTMLElement
    page.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ...clientOf(s.panes.left, 1, 150, 650) }))
    await s.clock.tick()
    expect(left.calls).toContain('hit 1')
    expect(left.calls).toContain('runs 1')
    expect(right.calls).toContain('runs 1')
    page.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 300 }))
    page.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 200, clientY: 300 }))
    await flush()
    expect(layoutOf).not.toHaveBeenCalled()
  })

  it('a pane\'s shapes coming repaint both panes: a sentence lit is drawn on the other once both have its starts', async () => {
    const s = setup()
    await opened(s, 3)
    const sentence = (): Shapes => ({ ...stub(), fits: () => true, sentence: () => [{ page: 1, x0: 100, y0: 650, x1: 200, y1: 700 }] })
    const starts = new Map([[1, new Int32Array([0, 5])]])
    leftViewer().render(1)
    internalsOf(s.view).setShapes('left', sentence(), starts)
    internalsOf(s.view).light(1, 1)
    // the right has no starts yet: the unit's sentence is not known on both panes, and nothing is drawn for it
    expect(s.panes.left.querySelectorAll('.axt-hl')).toHaveLength(0)
    internalsOf(s.view).setShapes('right', sentence(), starts)
    expect(s.panes.left.querySelectorAll('.axt-hl')).toHaveLength(1)
    expect(s.panes.right.querySelectorAll('.axt-hl')).toHaveLength(1)
  })

  it('a pointer over a page of either pane is a want of that page, and nothing is asked before it', async () => {
    const s = setup()
    await opened(s, 3)
    const wants: string[] = []
    internalsOf(s.view).onWant((side, page) => wants.push(`${side} ${page}`))
    FakeRO.fire(); await flush()
    expect(wants).toEqual([])
    const place = places(s)[0] as HTMLElement
    place.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ...clientOf(s.panes.right, 1, 100, 700) }))
    await s.clock.tick()
    expect(wants).toEqual(['right 1'])
  })

  it('a change of <html lang> renames both panes and reads no layout', async () => {
    const s = setup()
    await opened(s, 2)
    await nearOn(s, [1])
    await flush(20)
    s.words.pageName.mockImplementation((side: string, n: number) => `${side} page ${n}, again`)
    reads.counting = true; reads.n = 0
    document.documentElement.setAttribute('lang', 'fr')
    await flush(10)
    reads.counting = false
    expect(reads.n).toBe(0)
    expect(s.panes.left.querySelector('.page')?.getAttribute('aria-label')).toBe('left page 1, again')
    expect((places(s)[0] as HTMLElement).getAttribute('aria-label')).toBe('right page 1, again')
  })

  it('setNarrow(true, { display: original }) from bilingual lays out once', async () => {
    const s = setup()
    await opened(s, 3)
    await s.clock.tick(); await s.clock.tick()
    const before = Number(s.view.probe().layouts)
    s.view.setNarrow(true, { display: 'original' })
    await s.clock.tick(); await s.clock.tick(); await s.clock.tick()
    expect(Number(s.view.probe().layouts) - before).toBe(1)
    expect(last(s.events, 'display')?.display).toBe('original')
  })

  it('highlight off clears what is lit, and on again lights under a resting pointer', async () => {
    const s = setup()
    await opened(s, 3)
    internalsOf(s.view).setShapes('left', stub())
    internalsOf(s.view).setShapes('right', stub())
    leftViewer().render(1)
    FakeRO.fire(); await flush()
    const page = s.panes.left.querySelector('.page') as HTMLElement
    page.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, ...clientOf(s.panes.left, 1, 150, 650) }))
    await s.clock.tick()
    expect(s.view.probe().lit).toBe(1)
    s.prefs.set({ highlight: false })
    expect(s.view.probe().lit).toBeNull()
    expect(document.querySelectorAll('.axt-hl')).toHaveLength(0)
    s.prefs.set({ highlight: true })
    await s.clock.tick()
    expect(s.view.probe().lit).toBe(1)
  })

  it('with no titleFallback no request is made; the PDF\'s title is told', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const s = setup()
    await opened(s, 2)
    await flush(10)
    expect(fetch).not.toHaveBeenCalled()
    expect(last(s.events, 'paper')).toEqual({ type: 'paper', title: '' })
    const t = setup({ titleFallback: async () => 'From the host' })
    await opened(t, 2)
    await flush(10)
    expect(last(t.events, 'paper')).toEqual({ type: 'paper', title: 'From the host' })
    const u = setup({ titleFallback: async () => 'never asked' })
    await opened(u, 2, { title: 'Its own' })
    await flush(10)
    expect(last(u.events, 'paper')).toEqual({ type: 'paper', title: 'Its own' })
  })

  it("a PDF whose title is arXiv's margin stamp tells the host's title instead", async () => {
    const t = setup({ titleFallback: async () => 'From the host' })
    await opened(t, 2, { title: 'arXiv:1007.0072v1  [quant-ph]  1 Jul 2010' })
    await flush(10)
    expect(last(t.events, 'paper')).toEqual({ type: 'paper', title: 'From the host' })
    // a title that only starts so is the paper's
    const u = setup({ titleFallback: async () => 'never asked' })
    await opened(u, 2, { title: 'arXiv:1007.0072 revisited' })
    await flush(10)
    expect(last(u.events, 'paper')).toEqual({ type: 'paper', title: 'arXiv:1007.0072 revisited' })
  })

  it('the layer side hears of the scale as the places follow it, a step\'s with its drawing delay', async () => {
    const s = setup()
    await opened(s, 3)
    const heard: string[] = []
    internalsOf(s.view).onScale((scale, delay) => heard.push(`${scale.toFixed(2)} ${delay}`))
    const from = leftViewer().currentScale
    s.view.zoomBy(1.5)
    s.view.zoomTo(1)
    expect(heard).toEqual([`${(Math.round(from * 1.5 * 100) / 100).toFixed(2)} 400`, '1.00 -1'])
  })

  it('onPageDrawn is told once for each page drawn, on either pane', async () => {
    const s = setup()
    await opened(s, 3)
    const drawn: string[] = []
    internalsOf(s.view).onPageDrawn((side, page, error) => drawn.push(`${side} ${page} ${error ?? ''}`))
    leftViewer().render(2)
    await nearOn(s, [1])
    await flush(20)
    expect(drawn).toEqual(['left 2 ', 'right 1 '])
  })
})

describe('V13 and V14: one path, the best version page by page', () => {
  it('a content swap leaves the place\'s size and the pane\'s scroll as they were, sets no document, and is undone', async () => {
    const s = setup()
    await opened(s, 6)
    await nearOn(s, [2, 3])
    await flush(20)
    s.panes.right.scrollTop = 700
    await flush()
    const me = internalsOf(s.view)
    const place = places(s)[1] as HTMLElement
    const size = [place.style.width, place.style.height]
    const content = document.createElement('div')
    expect(me.places.swap(2, content)).toBe(true)
    expect([place.style.width, place.style.height]).toEqual(size)
    expect(s.panes.right.scrollTop).toBe(700)
    expect(leftViewer().log.filter(l => l === 'setDocument')).toHaveLength(1)
    expect(content.isConnected).toBe(true)
    expect(me.places.contentOf(2)).toBe('layer')
    me.places.restore(2)
    await flush(20)
    expect(content.isConnected).toBe(false)
    expect(me.places.contentOf(2)).toBe('original')
    expect(s.panes.right.scrollTop).toBe(700)
  })

  it('the layer, then the original, then the skeleton; a laid page coming near makes no page view', async () => {
    const s = setup()
    const { task } = await opened(s, 6)
    const me = internalsOf(s.view)
    await nearOn(s, [1])
    await flush(20)
    expect(me.places.contentOf(1)).toBe('original')
    const made = FakePDFPageView.made.length
    // a laid page far from the view, then near: its content stays, no page view is made for it
    expect(me.places.contentOf(4)).toBe('none')
    me.places.swap(4, document.createElement('div'))
    await nearOn(s, [4])
    expect(FakePDFPageView.made.length).toBe(made)
    expect(me.places.contentOf(4)).toBe('layer')
    s.view.dropOriginal(task as unknown as DocumentTask)
    expect(me.places.contentOf(1)).toBe('skeleton')
    expect(me.places.contentOf(4)).toBe('layer')
  })
})
