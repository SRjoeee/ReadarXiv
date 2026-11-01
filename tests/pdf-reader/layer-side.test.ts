// The layer's side of the reading view (engine/view/layer-side.mjs; the shared reader view's contract §2.2-§2.7 and §3, rows
// L3-L16, C1-C6 and H1-H6 of its PR VC) against the fake door (helpers/fake-door.ts: the door's readiness protocol, nothing
// drawn), over the format test's small paper (helpers/format-paper.ts: four pages, three parts, the first two with a tail), on
// the reading view's PDF.js stand-ins and a clock moved by hand (helpers/reader-fakes.ts). The real door's rows are
// layer-side-door.test.ts's
import { describe, expect, it, vi } from 'vitest'
import { type Ref, writePart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { PDF_OPTIONS } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { AHEAD_PAGES, createLayerSide, IOS_KEEP_PIXELS, KEEP_PIXELS, keepBudget, LEFT_RETRY_MS, noLayoutPage, onIos, PAGE_MS, SPREAD_MAX, spreadPages } from '@/pdf-reader/engine/view/layer-side.mjs'
import { type DocumentTask, internalsOf, type ViewEvent } from '@/pdf-reader/engine/view/reader-view.mjs'
import { made, N, ORIG, partInputs } from './helpers/format-paper'
import { ASSETS, clientOf, FakeIO, FakePDFPageView, FakePDFViewer, fakeDoc, fakeTask, flush } from './helpers/reader-fakes'
import { ALL, content, installSideFakes, jobRef, layerOf, M, macrotask, nearOn, places, renders, rowOf, type Setup, settle, setup, unitsOn } from './helpers/side-setup'

installSideFakes()

const leftViewer = () => FakePDFViewer.made[0] as FakePDFViewer

describe('L4: the best version, page by page (§2.3)', () => {
  it('a near place shows the original\'s page view until its page is laid, then the layer\'s copy and SVG in place', async () => {
    const s = await setup()
    await nearOn(s, [1, 2])
    expect(content(s, 1)).toBe('original')
    s.side.tell(await ALL())
    await settle(s)
    for (const n of [1, 2]) {
      expect(content(s, n), `page ${n}`).toBe('layer')
      const l = layerOf(s, n) as HTMLElement
      expect(l.querySelector(':scope > canvas.axt-layer-copy')).not.toBeNull()
      expect(l.querySelector(':scope > svg')?.getAttribute('viewBox')).toMatch(/^0 0 \d/)
      expect(places(s)[n - 1]?.querySelector('.page[role]')).toBeNull()
    }
    // a far page is laid only once asked: it shows nothing
    expect(content(s, 3)).toBe('none')
    expect(s.events.filter(e => e.type === 'layer').map(e => (e as { state: string }).state)).toContain('open')
  })

  it('a page the door makes ready while it is far gets no page view coming near: it is committed directly', async () => {
    const s = await setup({ door: { closure: () => [1, 2, 3] } })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    // pages 2 and 3 laid with page 1's closure, while far: retired at once, the place showing nothing (no laid page told)
    expect(s.door.layer?.pageState(3)).toBe('ready')
    expect(content(s, 3)).toBe('none')
    expect(layerOf(s, 3)?.childElementCount).toBe(0)
    const made = FakePDFPageView.made.length
    await nearOn(s, [3])
    await settle(s)
    expect(FakePDFPageView.made.length).toBe(made)
    expect(layerOf(s, 3)?.querySelector('svg')).not.toBeNull()
  })

  it('a page that fails shows the original; it is asked again on coming near', async () => {
    const s = await setup()
    s.door.fail(2)
    await nearOn(s, [2])
    s.side.tell(await ALL())
    await settle(s)
    expect(s.door.layer?.pageState(2)).toBe('failed')
    expect(content(s, 2)).toBe('original')
    expect(s.side.coverage().failed).toBe(1)
    const asked = s.side.probe().asked as number
    await nearOn(s, [2], false)
    await nearOn(s, [2])
    await settle(s, 4)
    expect(s.side.probe().asked as number).toBeGreaterThan(asked)
    expect(content(s, 2)).toBe('original')
  })
})

describe('L11: laid in place', () => {
  it('the place\'s size and the pane\'s scroll unchanged, no viewer document set, the copy drawn from the composed document at the place\'s k (the left\'s canvas, arXiv\'s rendering, is not its source)', async () => {
    const s = await setup()
    await nearOn(s, [1, 2])
    s.panes.right.scrollTop = 300
    await flush()
    const box = (n: number) => [places(s)[n - 1]?.style.width, places(s)[n - 1]?.style.height]
    const before = [box(1), box(2)], scrolled = s.panes.right.scrollTop, docs = leftViewer().log.filter(l => l.startsWith('setDocument')).length
    // the left's page 1 drawn at the place's k (its page box's CSS px a unit times the pixel ratio), as PDF.js sizes it
    const pv = leftViewer().getPageView(0) as NonNullable<ReturnType<FakePDFViewer['getPageView']>>
    leftViewer().render(1, null, { width: Math.floor(pv.viewport.width), height: Math.floor(pv.viewport.height), sx: 1, sy: 1 })
    const canvas = pv.canvas as HTMLCanvasElement
    s.side.tell(await ALL())
    await settle(s)
    expect([box(1), box(2)]).toEqual(before)
    expect(s.panes.right.scrollTop).toBe(scrolled)
    expect(leftViewer().log.filter(l => l.startsWith('setDocument')).length).toBe(docs)
    // the layer is over our base page: page 1\'s copy is the composed document\'s page at the place\'s k, not the canvas PDF.js drew of
    // the original, which is drawn at that k here all the same
    const copies = s.doors[0]?.copies ?? []
    expect(copies.find(c => c[0] === 1)?.[1]).not.toBe(canvas)
    expect(copies.find(c => c[0] === 1)?.[2]).toBe(pv.viewport.scale)
    expect(copies.find(c => c[0] === 2)?.[1]).not.toBe(canvas)
    expect(content(s, 1)).toBe('layer')
  })

  it('holds the door from a near page\'s answer until its copy and SVG are in place, a hold a page put in place (door.hold)', async () => {
    let release = () => {}
    const held = new Promise<void>(ok => { release = ok })
    const s = await setup({ copyHold: n => (n === 1 ? held : null) })
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    await settle(s)
    // (page 2 in place, its hold settled; page 1's copy under way, its hold not)
    const holds = s.doors[0]?.holds ?? []
    expect(content(s, 2)).toBe('layer')
    expect(content(s, 1)).not.toBe('layer')
    expect(holds.map(h => h.settled).sort()).toEqual([false, true])
    const one = holds.find(h => !h.settled) as (typeof holds)[number]
    // (settled once the page is in place, never at its copy alone)
    const at = one.promise.then(() => content(s, 1))
    release()
    await settle(s)
    expect(await at).toBe('layer')
    expect(holds.length).toBe(2)
  })

  it('dispose brings the original\'s page back to every laid place near the view, and leaves no copy', async () => {
    const s = await setup()
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    await settle(s)
    const copies = [1, 2].map(n => layerOf(s, n)?.querySelector('canvas') as HTMLCanvasElement)
    s.side.dispose()
    await flush(10)
    for (const n of [1, 2]) expect(content(s, n)).toBe('original')
    for (const c of copies) expect(c.width).toBe(0)
    expect(s.panes.right.querySelectorAll('.axt-layer').length).toBe(0)
  })
})

describe('one frame a page: the copy at the place\'s k, whatever PDF.js drew the left\'s page at (docs/PDF-READER.md §11.8)', () => {
  /** the owner's fit, 87.25 %, at a pixel ratio of 2: the page 711.9999… CSS px wide, PDF.js's canvas floored to 1422 px */
  const FIT = 0.8725490196078431
  const pageView = (n: number) => leftViewer().getPageView(n - 1) as NonNullable<ReturnType<FakePDFViewer['getPageView']>>
  const copyOf = (s: Setup, n: number) => s.doors[0]?.copies.find(c => c[0] === n) as [number, HTMLCanvasElement, number] | undefined

  it('the copy is at the place\'s k, never the floored width of the canvas PDF.js drew of the original over the page\'s', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const s = await setup()
    s.view.zoomTo(FIT)
    await settle(s, 4)
    await nearOn(s, [1, 2])
    expect(pageView(1).viewport.scale).toBe(1.1633986928104574)
    leftViewer().render(1, null, { width: 1422, height: 1842, sx: 2, sy: 2 })
    s.side.tell(await ALL())
    await settle(s)
    const one = copyOf(s, 1)
    // (over our base the left\'s canvas is no source: the page drawn from the document, on the place\'s box times the pixel ratio)
    expect(one?.[1]).not.toBe(pageView(1).canvas)
    expect(s.doors[0]?.sized.find(c => c[0] === 1)).toEqual([1, 1422, 1842])
    expect(one?.[2]).toBe(1.1633986928104574 * 2)
    expect(one?.[2]).not.toBe(1422 / 612)
    expect(content(s, 1)).toBe('layer')
  })

  it('a copy drawn from the document is on a canvas of the place\'s box times the pixel ratio, at the place\'s k', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const s = await setup()
    s.view.zoomTo(FIT)
    await settle(s, 4)
    await nearOn(s, [2])
    s.side.tell(await ALL())
    await settle(s)
    // page 2's left page not drawn: its source the page drawn from the composed document, 711 × 921 CSS px at 2
    const two = copyOf(s, 2)
    expect(two?.[1]).not.toBe(pageView(2).canvas)
    expect(s.doors[0]?.sized.find(c => c[0] === 2)).toEqual([2, 1422, 1842])
    expect(two?.[2]).toBe(1.1633986928104574 * 2)
  })

  it('a canvas PDF.js drew at an output scale that differs across and down is no source: the page drawn from the document', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const s = await setup()
    s.view.zoomTo(FIT)
    await settle(s, 4)
    await nearOn(s, [1])
    // (an output scale rounded apart across and down, as PDF.js's fraction of a pixel ratio such as 1.1 or 1.8 gives it at
    // almost every zoom: 1422 px over 711 across, 1841 over 920 down)
    leftViewer().render(1, null, { width: 1422, height: 1841, sx: 2, sy: 1841 / 920 })
    s.side.tell(await ALL())
    await settle(s)
    const one = copyOf(s, 1)
    expect(one?.[1]).not.toBe(pageView(1).canvas)
    expect(s.doors[0]?.sized.find(c => c[0] === 1)).toEqual([1, 1422, 1842])
    expect(one?.[2]).toBe(1.1633986928104574 * 2)
  })

  it('at a zoom where the place\'s k is held to COPY_PIXELS, the copy is the document\'s page at that k, whatever output scale PDF.js drew the left\'s page at', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const s = await setup()
    // at 353 % the place's k is held to COPY_PIXELS (5.883); PDF.js under a cap of its own drew the left\'s page at an output scale of
    // 5/4 (3600 px over 2880 across, 4655 over 3724 down): a canvas of the original, which is no source over our base
    s.view.zoomTo(3.53)
    await settle(s, 4)
    await nearOn(s, [1])
    leftViewer().render(1, null, { width: 3600, height: 4655, sx: 1.25, sy: 1.25 })
    s.side.tell(await ALL())
    await settle(s)
    const one = copyOf(s, 1)
    expect(one?.[1]).not.toBe(pageView(1).canvas)
    expect(one?.[2]).toBeCloseTo(Math.sqrt(2 ** 24 / (612 * 792)), 6)
    expect(one?.[2]).not.toBe(pageView(1).viewport.scale * 1.25)
  })

  it('a zoom\'s step leaves the left\'s canvas as it was drawn: the copy is the document\'s page at the place\'s k now, not the scale the canvas was drawn at', async () => {
    const s = await setup()
    s.view.zoomTo(FIT)
    await settle(s, 4)
    await nearOn(s, [1])
    const pv = pageView(1), drawnAt = pv.viewport.scale
    leftViewer().render(1, null, { width: 711, height: 921, sx: 1, sy: 1 })
    // a step of 1 %: PDF.js gives the page view its next viewport at once, and keeps the canvas until it draws again
    s.view.zoomBy(1.01)
    await flush()
    expect(pv.viewport.scale).not.toBe(drawnAt)
    s.side.tell(await ALL())
    await settle(s)
    const one = copyOf(s, 1)
    expect(one?.[1]).not.toBe(pv.canvas)
    expect(one?.[2]).toBe(pv.viewport.scale)
    expect(one?.[2]).not.toBe(drawnAt)
  })

  it('a drawing PDF.js lets finish after a zoom changes nothing: the copy is the document\'s page at the place\'s k', async () => {
    const s = await setup()
    s.view.zoomTo(FIT)
    await settle(s, 4)
    await nearOn(s, [1])
    const pv = pageView(1), begun = pv.viewport.scale
    leftViewer().startRender(1, { width: 711, height: 921, sx: 1, sy: 1 })
    // a zoom to 87.5 % while it draws (as under PDF.js's restricted scaling, which lets the drawing run on)
    s.view.zoomTo(0.875)
    await flush()
    expect(pv.viewport.scale).not.toBe(begun)
    leftViewer().finishRender(1)
    s.side.tell(await ALL())
    await settle(s)
    const one = copyOf(s, 1)
    expect(one?.[1]).not.toBe(pv.canvas)
    expect(one?.[2]).toBe(pv.viewport.scale)
    expect(one?.[2]).not.toBe(begun)
  })

  it('the page drawn from the document is drawn on the context of the left\'s page views: the CPU\'s, or the GPU\'s where the host opens its documents with enableHWA', async () => {
    for (const [assets, cpu] of [[undefined, true], [{ cMapUrl: 'cmaps/', enableHWA: true }, false]] as const) {
      const asked: unknown[] = []
      const get = HTMLCanvasElement.prototype.getContext
      const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, ...a: Parameters<typeof get>) {
        if ((a[1] as { alpha?: boolean } | undefined)?.alpha === false) asked.push(a[1])
        return get.apply(this, a)
      })
      const s = await setup(assets ? { assets } : {})
      await nearOn(s, [2])
      s.side.tell(await ALL())
      await settle(s)
      spy.mockRestore()
      // (page 2's left page never drawn: its copy's source the page drawn from the document)
      expect(copyOf(s, 2)).toBeDefined()
      expect(asked.length).toBeGreaterThan(0)
      expect(asked.every(o => (o as { willReadFrequently: boolean }).willReadFrequently === cpu), JSON.stringify(asked)).toBe(true)
      s.view.dispose()
    }
  })

  it('the SVG and the links are laid in the page\'s frame: its size in PDF units times --total-scale-factor', async () => {
    const s = await setup()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    const wrap = layerOf(s, 1) as HTMLElement
    expect(wrap.style.getPropertyValue('--axt-frame-w')).toBe('calc(var(--total-scale-factor) * 612px)')
    expect(wrap.style.getPropertyValue('--axt-frame-h')).toBe('calc(var(--total-scale-factor) * 792px)')
  })
})

describe('L9: the window under the pageOf contract', () => {
  it('a laid page far from the view lets its element and its copy go where none is kept (keepPixels 0); back in view it is asked again and drawn the same', async () => {
    const s = await setup({ keepPixels: 0 })
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    await settle(s)
    const svg = layerOf(s, 2)?.querySelector('svg') as SVGSVGElement, copy = layerOf(s, 2)?.querySelector('canvas') as HTMLCanvasElement
    const html = svg.outerHTML
    await nearOn(s, [2], false)
    expect(copy.width).toBe(0)
    expect(svg.isConnected).toBe(false)
    expect(layerOf(s, 2)?.childElementCount).toBe(0)
    expect(content(s, 2)).toBe('none')
    expect(s.side.probe().laid).toBe(1)
    const made = FakePDFPageView.made.length
    await nearOn(s, [2])
    await settle(s)
    expect(FakePDFPageView.made.length).toBe(made)
    const again = layerOf(s, 2)?.querySelector('svg') as SVGSVGElement
    expect(again).not.toBe(svg)
    expect(again.outerHTML).toBe(html)
  })
})

describe('no flash coming back: the drawings kept off the view (KEEP_PIXELS, §11.8)', () => {
  /** the side open with every row, pages 1 and 2 near and laid */
  async function laid(o: Parameters<typeof setup>[0] = {}) {
    const s = await setup({ door: { rows: 'gate' }, ...o })
    const m = await M()
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s)
    return { s, m }
  }

  it('a laid page far from the view keeps its drawing detached; back in view it is put back in the same task, the same elements, nothing asked or drawn again', async () => {
    const { s } = await laid({ ahead: 0 })
    const wrap = layerOf(s, 2) as HTMLElement, copy = wrap.querySelector('canvas') as HTMLCanvasElement, svg = wrap.querySelector('svg')
    const asked = s.side.probe().asked as number, copies = s.side.probe().copies as number
    await nearOn(s, [2], false)
    // (detached: the place holds the empty element, and no page view is made of it)
    expect(content(s, 2)).toBe('none')
    expect(wrap.isConnected).toBe(false)
    expect(copy.width).toBeGreaterThan(0)
    expect(s.side.probe()).toMatchObject({ drawings: 1, drawnPixels: copy.width * copy.height })
    const made = FakePDFPageView.made.length
    // near again: put back at once, before any task of the door's or the view's
    FakeIO.tell([places(s)[1] as HTMLElement], true)
    expect(content(s, 2)).toBe('layer')
    expect(layerOf(s, 2)).toBe(wrap)
    expect(wrap.querySelector('canvas')).toBe(copy)
    expect(wrap.querySelector('svg')).toBe(svg)
    await settle(s)
    expect(FakePDFPageView.made.length).toBe(made)
    expect(s.side.probe()).toMatchObject({ asked, copies, drawings: 0, drawnPixels: 0, restored: 1 })
  })

  it('past the budget the drawing farthest from the view is let go (its copy released), whichever was kept last: that page is asked and drawn again as it comes near', async () => {
    const { s } = await laid({ ahead: 0 })
    const one = layerOf(s, 1)?.querySelector('canvas') as HTMLCanvasElement, two = layerOf(s, 2)?.querySelector('canvas') as HTMLCanvasElement
    const px = one.width * one.height
    expect(two.width * two.height).toBe(px)
    // a budget for one page and a half, the view at page 1: page 2 kept first, then page 1, which lets page 2's go (farther)
    const t = await laid({ ahead: 0, keepPixels: Math.floor(1.5 * px) })
    expect(internalsOf(t.s.view).centre()).toBe(1)
    const second = layerOf(t.s, 2)?.querySelector('canvas') as HTMLCanvasElement
    await nearOn(t.s, [2], false)
    await nearOn(t.s, [1], false)
    expect(t.s.side.probe()).toMatchObject({ drawings: 1, drawnPixels: px, dropped: 1 })
    expect(second.width).toBe(0)
    const asked = t.s.side.probe().asked as number
    await nearOn(t.s, [1])
    expect(content(t.s, 1)).toBe('layer')
    await nearOn(t.s, [2])
    await settle(t.s)
    expect(t.s.side.probe().asked as number).toBe(asked + 1)
    expect(content(t.s, 2)).toBe('layer')
  })

  it('the budget is the device\'s (keepBudget): a 64th of its memory (4 GB where the browser does not say), two of its screens at least, KEEP_PIXELS at most', () => {
    const MB = 2 ** 20
    expect(keepBudget({ deviceMemory: 4, screenPixels: 1080 * 2400 })).toBe((64 * MB) / 4)
    expect(keepBudget({ deviceMemory: 8, screenPixels: 3024 * 1964 })).toBe(KEEP_PIXELS)
    expect(keepBudget({ deviceMemory: 2, screenPixels: 720 * 1600 })).toBe((32 * MB) / 4)
    // (none told: a phone's 4 GB; a large screen on a small memory: two screens)
    expect(keepBudget({ screenPixels: 1080 * 2400 })).toBe((64 * MB) / 4)
    expect(keepBudget({ deviceMemory: 0.5, screenPixels: 2560 * 1600 * 4 })).toBe(Math.min(KEEP_PIXELS, 2 * 2560 * 1600 * 4))
    expect(keepBudget()).toBe((64 * MB) / 4)
    // (iOS and iPadOS: IOS_KEEP_PIXELS at most, whatever the screen; an iPad says it is a Mac with a touch screen)
    expect(keepBudget({ ios: true, screenPixels: 1179 * 2556 })).toBe(IOS_KEEP_PIXELS)
    expect(keepBudget({ ios: true, screenPixels: 100 * 100 })).toBe(IOS_KEEP_PIXELS)
    expect(onIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 })).toBe(true)
    expect(onIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', maxTouchPoints: 5 })).toBe(true)
    expect(onIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', maxTouchPoints: 0 })).toBe(false)
    expect(onIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', maxTouchPoints: 5 })).toBe(false)
    expect(onIos(null)).toBe(false)
  })

  it('a drawing kept while the pane was zoomed comes back drawn as it was, then again at the place\'s new k', async () => {
    const { s } = await laid({ ahead: 0 })
    const kept = layerOf(s, 2)?.querySelector('canvas') as HTMLCanvasElement
    await nearOn(s, [2], false)
    s.view.zoomTo(2)
    await settle(s, 4)
    await s.clock.advance(700)
    await settle(s)
    const copies = s.side.probe().copies as number
    await nearOn(s, [2])
    // (the drawing as it was, in place at once; its copy drawn at the new k after)
    expect(content(s, 2)).toBe('layer')
    await settle(s)
    expect(s.side.probe().copies as number).toBe(copies + 1)
    expect(kept.width).toBe(0)
    expect(layerOf(s, 2)?.querySelector('canvas')).not.toBe(kept)
  })

  it('again(), another target and dropOthers() let the kept drawings go: none of a door before is put back', async () => {
    const { s, m } = await laid({ ahead: 0 })
    const copy = layerOf(s, 2)?.querySelector('canvas') as HTMLCanvasElement
    await nearOn(s, [2], false)
    expect(s.side.probe().drawings).toBe(1)
    s.side.again()
    await settle(s)
    expect(s.side.probe().drawings).toBe(0)
    expect(copy.width).toBe(0)
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s)
    await nearOn(s, [2])
    await settle(s)
    expect(content(s, 2)).toBe('layer')
    expect(layerOf(s, 2)?.querySelector('canvas')).not.toBe(copy)
    const again = layerOf(s, 2)?.querySelector('canvas') as HTMLCanvasElement
    await nearOn(s, [2], false)
    expect(s.side.probe().drawings).toBe(1)
    s.side.retarget('ja')
    await settle(s)
    expect(s.side.probe().drawings).toBe(0)
    expect(again.width).toBe(0)
  })

  it('dispose and a refusal let every kept drawing go', async () => {
    const { s } = await laid({ ahead: 0 })
    const copy = layerOf(s, 2)?.querySelector('canvas') as HTMLCanvasElement
    await nearOn(s, [2], false)
    s.side.dispose()
    await flush(10)
    expect(copy.width).toBe(0)
  })
})

describe('the pages ahead: laid the way the reader moves, while it scrolls as at rest, kept off the view (AHEAD_PAGES, §11.8)', () => {
  /** the view's pages laid, the rows taken and ended (`end`), the pages ahead not asked yet */
  async function rows(s: Setup, near: number[], end = true) {
    const m = await M()
    await nearOn(s, near)
    s.side.tell(await ALL())
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    if (end) s.side.end()
    await settle(s)
  }
  const scroll = (s: Setup) => { s.panes.right.scrollTop += 10; s.panes.right.dispatchEvent(new Event('scroll')) }

  it('once the rows have ended, the pages past the near ones are laid in idle time and drawn off the view; coming near they are put back at once', async () => {
    const s = await setup({ door: { rows: 'gate' } })
    await rows(s, [1], false)
    expect(content(s, 1)).toBe('layer')
    // (no lay ahead before the rows end: a host that translates as it shows is asked for nothing)
    await settle(s, 60)
    expect(s.side.probe().ahead).toBe(0)
    s.side.end()
    await settle(s, 60)
    expect(s.side.probe()).toMatchObject({ ahead: AHEAD_PAGES, aheadKept: AHEAD_PAGES, drawings: AHEAD_PAGES })
    expect(content(s, 2)).toBe('none')
    const asked = s.side.probe().asked as number
    FakeIO.tell([places(s)[1] as HTMLElement], true)
    expect(content(s, 2)).toBe('layer')
    await settle(s)
    expect(s.side.probe().asked).toBe(asked)
  })

  it('a scroll gives nothing up: the pages ahead are laid while the reader scrolls, and the window moves on with the near places', async () => {
    // (one page ahead: the format paper's page 4 is the original's, no part laying it, so the window is page 2, then page 3)
    const s = await setup({ door: { rows: 'gate' }, ahead: 1 })
    await rows(s, [1], false)
    s.side.end()
    // (scrolled all the while: the page ahead laid all the same)
    for (let i = 0; i < 20; i++) { scroll(s); await settle(s, 3) }
    expect(s.side.probe()).toMatchObject({ ahead: 1, aheadKept: 1 })
    // the reader moves down a page: page 2 put back as it was, page 1 gone far; the window is page 3 now
    await nearOn(s, [2])
    await nearOn(s, [1], false)
    for (let i = 0; i < 20; i++) { scroll(s); await settle(s, 3) }
    expect(content(s, 2)).toBe('layer')
    expect(s.side.probe()).toMatchObject({ ahead: 2, aheadKept: 2 })
    // page 3 comes near laid: no page of the view asked of the door
    const asked = s.side.probe().asked as number
    await nearOn(s, [3])
    expect(content(s, 3)).toBe('layer')
    await settle(s)
    expect(s.side.probe().asked).toBe(asked)
  })

  it('the reader moving up: the pages above the near ones are laid', async () => {
    const s = await setup({ door: { rows: 'gate' } })
    await rows(s, [3, 4])
    // (down the paper by default: nothing past page 4)
    await settle(s, 30)
    expect(s.side.probe().ahead).toBe(0)
    // page 2 comes near and page 4 goes far: the reader moves up; page 2 laid as a page of the view, then page 1 ahead
    await nearOn(s, [2])
    await nearOn(s, [4], false)
    await settle(s, 60)
    expect(content(s, 2)).toBe('layer')
    expect(s.side.probe()).toMatchObject({ ahead: 1, aheadKept: 1 })
    expect(content(s, 1)).toBe('none')
    await nearOn(s, [1])
    expect(content(s, 1)).toBe('layer')
  })

  it('a page of the view asked gives the pages ahead up, their copy under way let go; they are laid again once the view\'s pages are in place', async () => {
    let release = () => {}
    const held = new Promise<void>(ok => { release = ok })
    const s = await setup({ door: { rows: 'gate' }, ahead: 1, copyHold: n => (n === 2 ? held : null) })
    await rows(s, [1])
    // page 2's copy ahead under way (held)
    await settle(s, 30)
    expect(s.side.probe()).toMatchObject({ ahead: 1, aheadKept: 0 })
    expect(s.doors[0]?.copies.filter(c => c[0] === 2).length).toBe(1)
    // page 2 comes near before its copy is drawn: asked of the door as a page of the view, the copy ahead given up
    const asked = s.side.probe().asked as number
    await nearOn(s, [2])
    expect(s.side.probe().asked).toBe(asked + 1)
    release()
    await settle(s, 60)
    expect(content(s, 2)).toBe('layer')
    // (its copy ahead let go, never kept: the page's own commit drew the one in place)
    expect(s.doors[0]?.copies.filter(c => c[0] === 2).length).toBe(2)
    // and the pages ahead laid again once it is in place: page 3
    expect(s.side.probe()).toMatchObject({ ahead: 2, aheadKept: 1 })
    expect(content(s, 3)).toBe('none')
  })

  it('a page of the view PDF.js is drawing holds the pages ahead: they are laid once it is drawn', async () => {
    const s = await setup({ door: { rows: 'gate' } })
    await rows(s, [1], false)
    expect(content(s, 1)).toBe('layer')
    // (the left draws page 1, near the view, again)
    leftViewer().startRender(1)
    s.side.end()
    await settle(s, 60)
    expect(s.side.probe().ahead).toBe(0)
    leftViewer().finishRender(1)
    await settle(s, 60)
    expect(s.side.probe()).toMatchObject({ ahead: AHEAD_PAGES, aheadKept: AHEAD_PAGES })
  })

  it('a page ahead whose copy fails is not laid ahead again by the door; coming near it is asked as a page of the view', async () => {
    const s = await setup({ door: { rows: 'gate' }, ahead: 1, copyFails: [2] })
    await rows(s, [1])
    await settle(s, 30)
    expect(s.side.probe()).toMatchObject({ ahead: 1, aheadKept: 0, drawings: 0 })
    // (the pages ahead asked for again, the window the same: page 2 not laid ahead again)
    s.side.end()
    await settle(s, 30)
    expect(s.side.probe().ahead).toBe(1)
    await nearOn(s, [2])
    await settle(s)
    expect(content(s, 2)).toBe('layer')
  })

  it('a page ahead whose drawing the keep budget cannot hold is laid once, not again and again while the window stays', async () => {
    // (a budget of one pixel: every copy is let go as it is kept)
    const s = await setup({ door: { rows: 'gate' }, keepPixels: 1 })
    await rows(s, [1])
    await settle(s, 60)
    const copies = () => (s.doors[0]?.copies ?? []).filter(c => c[0] !== 1).length
    expect(s.side.probe()).toMatchObject({ ahead: AHEAD_PAGES, aheadKept: 0, drawings: 0 })
    expect(copies()).toBe(AHEAD_PAGES)
    await settle(s, 120)
    expect(s.side.probe().ahead).toBe(AHEAD_PAGES)
    expect(copies()).toBe(AHEAD_PAGES)
    // (coming near it is asked and drawn as a page of the view)
    await nearOn(s, [2])
    await settle(s)
    expect(content(s, 2)).toBe('layer')
  })

  it('a page ahead come near as the door answers it is left to the view\'s own ask, put in place under the door\'s hold', async () => {
    const s = await setup({ door: { rows: 'gate' }, ahead: 1 })
    await rows(s, [1], false)
    s.side.end()
    // (the window asked of the door, page 2 not laid yet: the door lays by hand, settle's lay off)
    await settle(s, 10, false)
    expect(s.side.probe().ahead).toBe(1)
    const holds = () => s.doors[0]?.holds.length ?? 0, held = holds()
    // page 2 comes near and, in the same turn, the door lays it
    FakeIO.tell([places(s)[1] as HTMLElement], true)
    await s.door.advance()
    await settle(s)
    expect(content(s, 2)).toBe('layer')
    // (committed once, by the view's ask, the door held for it)
    expect(holds()).toBe(held + 1)
    expect(s.side.probe().commits).toBe(2)
  })

  it('ahead: 0 lays none', async () => {
    const s = await setup({ door: { rows: 'gate' }, ahead: 0 })
    await rows(s, [1])
    await settle(s, 60)
    expect(s.side.probe()).toMatchObject({ ahead: 0, drawings: 0 })
  })
})

describe('the faces in one wave (warm.mjs, §11.8)', () => {
  it('the faces of the near pages\' units are asked of the host once their rows and parts are in, before the door is open', async () => {
    const asked: string[] = []
    let bound: (v: boolean) => void = () => {}
    const s = await setup({ door: { rows: 'gate' }, faceSources: async id => { asked.push(id); return null }, bind: () => new Promise<boolean>(r => { bound = r }) })
    const m = await M()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s, 10)
    s.side.take(m.index.units.map((_, id) => rowOf(id, `\u4e2d\u6587 ${id}`)))
    await settle(s, 10)
    expect(s.opens).toBe(0)
    // the target's CJK body face, its Regular beside every family, and its Bold: page 1's likely faces, v0's
    expect(asked).toContain('shs-sc-regular')
    expect(asked).toContain('shs-sc-bold')
    expect(asked.some(id => /^shs-sc-(light|semibold)$/.test(id))).toBe(false)
    bound(true)
    await settle(s)
    expect(s.opens).toBe(1)
  })
})

describe('the places ahead of the view let go by the layer (places.mjs letAheadGo)', () => {
  it('held until the side puts its first page in place, or shows a near page as arXiv\'s, or is refused', async () => {
    const held = (s: Setup) => internalsOf(s.view).places.aheadHeld()
    const a = await setup()
    await nearOn(a, [1, 2])
    expect(held(a)).toBe(true)
    a.side.tell(await ALL())
    await settle(a)
    expect(content(a, 1)).toBe('layer')
    expect(held(a)).toBe(false)
    // a page of a part with no layout, the only one near: shown as arXiv's, nothing to wait for
    const m = await M(true)
    const b = await setup({ ours: true })
    await nearOn(b, [4])
    b.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(m, i)), end: { through: N } })
    await settle(b)
    expect(content(b, 4)).toBe('original')
    expect(held(b)).toBe(false)
    // the layer refused: none to wait for
    const c = await setup({ bind: async () => false })
    await nearOn(c, [1])
    c.side.tell(await ALL())
    await settle(c)
    expect(c.events.some(e => e.type === 'layer' && (e as { state: string }).state === 'refused')).toBe(true)
    expect(held(c)).toBe(false)
  })
})

describe('the first page\'s faces before any part (warm.mjs firstPageUnits, §11.8)', () => {
  it('a first open\'s rows read before the head: the CJK face asked at once; rows taken after the head and before part 1 too; none once a part is read or a catalog tells the parts\' end', async () => {
    const m = await M()
    const cjk = (id: number) => rowOf(id, `\u4e2d\u6587\u6bb5\u843d ${id}`)
    // (the units told at the compile, the rows read as the job tells them: no head, no part)
    const asked: string[] = []
    const a = await setup({ faceSources: async id => { asked.push(id); return null } })
    a.side.tell({ units: m.chunks.map(c => c.ref) })
    a.side.warmEarly(m.index.units.map((_, id) => cjk(id)))
    await settle(a, 10)
    // (the CJK face's set asked: which of its slices load, its CJK characters' alone, is warm.test.ts's)
    expect(asked).toContain('shs-sc-regular')
    expect(a.opens).toBe(0)
    // rows read early before the units are told (another source first): the wave asked once the units are
    const later: string[] = []
    const u = await setup({ faceSources: async id => { later.push(id); return null } })
    u.side.warmEarly(m.index.units.map((_, id) => cjk(id)))
    await settle(u, 10)
    expect(later).toEqual([])
    u.side.tell({ units: m.chunks.map(c => c.ref) })
    await settle(u, 10)
    expect(later).toContain('shs-sc-regular')
    // the head told, no part yet: rows taken are the early wave's too
    const after: string[] = []
    const b = await setup({ faceSources: async id => { after.push(id); return null } })
    b.side.tell({ units: m.chunks.map(c => c.ref), head: m.head.ref })
    await settle(b, 10)
    b.side.take(m.index.units.map((_, id) => cjk(id)))
    await settle(b, 10)
    expect(after).toContain('shs-sc-regular')
    // a catalog's parts and end told: its pages have their own wave, and rows read early ask nothing (none taken: no wave at all)
    const none: string[] = []
    const c = await setup({ faceSources: async id => { none.push(id); return null } })
    c.side.tell(await ALL())
    await settle(c, 10)
    c.side.warmEarly(m.index.units.map((_, id) => cjk(id)))
    await settle(c, 10)
    expect(none).toEqual([])
  })
})

describe('a copy that fails, and the original dropped', () => {
  it('a page whose copy fails shows the original and is asked again on the next scroll', async () => {
    const s = await setup({ copyFails: [1] })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    expect(content(s, 1)).toBe('original')
    s.panes.right.scrollTop = 30
    await flush(10)
    await settle(s)
    expect(content(s, 1)).toBe('layer')
  })

  it('the original dropped after the door opened: later parts are added all the same, and again() opens it again', async () => {
    const s = await setup()
    const m = await M()
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [jobRef(m, 0)] })
    await settle(s)
    expect(s.opens).toBe(1)
    expect(s.view.dropOriginal(s.original as never)).toBe(true)
    s.side.tell({ parts: [jobRef(m, 1), jobRef(m, 2)] })
    await settle(s)
    expect(s.door.layer?.stats().parts).toEqual({ through: 4, told: 3 })
    s.side.again()
    await settle(s)
    expect(s.opens).toBe(2)
  })
})

describe('L6: the pane\'s resolution', () => {
  it('after a zoom, each laid page\'s copy is drawn again at the new k, no page laid again', async () => {
    const s = await setup()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    const copies = s.side.probe().copies as number, asked = s.side.probe().asked as number
    const before = layerOf(s, 1)?.querySelector('canvas') as HTMLCanvasElement
    s.view.zoomTo(2)
    await settle(s, 4)
    await s.clock.advance(700)
    await settle(s)
    expect(s.side.probe().copies as number).toBe(copies + 1)
    expect(s.side.probe().asked).toBe(asked)
    expect(before.width).toBe(0)
    expect(layerOf(s, 1)?.querySelector('canvas')).not.toBe(before)
  })
})

describe('L10 and L13: the composed documents', () => {
  it('one composed task, opened once with the view\'s assets, PDF_OPTIONS and disableAutoFetch, and no tail (the base whole)', async () => {
    const s = await setup()
    s.side.tell(await ALL())
    await settle(s)
    expect(s.composed.length).toBe(1)
    expect(s.composed[0]?.options).toEqual({ ...ASSETS, ...PDF_OPTIONS, disableAutoFetch: true })
    expect(s.composed[0]?.tail).toBeNull()
    expect(s.door.layer?.stats().parts).toEqual({ through: 4, told: 3 })
  })

  it('the composed task is the same over parts told one by one and over again(); destroyed at dispose, once', async () => {
    const s = await setup()
    const m = await M()
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref) })
    await settle(s)
    s.side.tell({ parts: [jobRef(m, 0)] })
    await settle(s)
    s.side.tell({ parts: [jobRef(m, 1), jobRef(m, 2)], end: { through: N } })
    await settle(s)
    expect(s.composed.length).toBe(1)
    expect(s.destroyed).toEqual([])
    const opens = s.opens
    s.side.again()
    await settle(s)
    expect(s.opens).toBe(opens + 1)
    expect(s.composed.length).toBe(1)
    s.side.dispose()
    await flush(10)
    expect(s.destroyed).toEqual(['destroy composed 0'])
  })

  it('a composed task that does not open: refused, the right on its places, no layer page drawn after', async () => {
    const s = await setup({ composedFails: true })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    expect(s.events.filter(e => e.type === 'layer').at(-1)).toMatchObject({ state: 'refused', why: 'composed' })
    expect(content(s, 1)).toBe('original')
    expect(s.door.layer).toBeNull()
  })
})

describe('L12: the 30 s rule', () => {
  it('a page waiting past 30 s gives no warning; a page asked and laying gives one, is asked again on the next scroll, and its late ready is taken', async () => {
    const s = await setup()
    const m = await M()
    await nearOn(s, [1, 4])
    // page 4 waits for its part: no clock
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [jobRef(m, 0)] })
    for (let i = 0; i < 20; i++) { await macrotask(); await s.clock.advance(1) }
    expect(s.door.layer?.pageState(1)).toBe('laying')
    expect(s.door.layer?.pageState(4)).toBe('waiting')
    await s.clock.advance(PAGE_MS + 10)
    expect(s.warned().filter(w => w.includes('wait'))).toEqual(['[reader] the layer\'s wait:'])
    expect(s.side.coverage().stalled).toBe(1)
    expect(content(s, 1)).toBe('original')
    const asked = s.side.probe().asked as number
    s.panes.right.scrollTop = 40
    await flush(10)
    expect(s.side.probe().asked as number).toBe(asked + 1)
    // the late ready taken
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    // (and one warning a side, however many stall)
    expect(s.warned().filter(w => w.includes('wait')).length).toBe(1)
  })
})

describe('L14: the feed\'s refusals', () => {
  it('a chunk, a head or the base refused: refused with its why, the right on the original', async () => {
    const m = await M()
    for (const [why, o] of [['units', { units: m.chunks[0]!.sha256 }], ['head', { head: m.head.sha256 }], ['base', {}]] as const) {
      const s = await setup(why === 'base' ? { bind: async () => false } : {})
      for (const sha of Object.values(o)) s.objects.set(sha, new Uint8Array([1]))
      await nearOn(s, [1])
      s.side.tell(await ALL())
      await settle(s)
      expect(s.events.filter(e => e.type === 'layer').at(-1), why).toMatchObject({ state: 'refused', why })
      expect(content(s, 1), why).toBe('original')
      expect(await s.side.index(), why).toBeNull()
      expect(s.door.layer, why).toBeNull()
      s.view.dispose()
    }
  })

  it('a door that refuses to open: refused with the side\'s code, not the refusal\'s message', async () => {
    const s = await setup({ openFails: true })
    s.side.tell(await ALL())
    await settle(s)
    expect(s.events.filter(e => e.type === 'layer').at(-1)).toMatchObject({ state: 'refused', why: 'open' })
    expect(s.side.probe().why).toBe('open')
  })

  it('a refused part stops the chain at the last good one; told again it is fetched again and added', async () => {
    const s = await setup()
    const m = await M()
    s.refuse.add(m.parts[1]!.sha256)
    s.side.tell(await ALL())
    await settle(s)
    expect(s.door.layer?.stats().parts).toEqual({ through: 1, told: 1 })
    s.refuse.clear()
    s.side.tell({ parts: [jobRef(m, 1)] })
    await settle(s)
    expect(s.fetched.filter(x => x === m.parts[1]!.sha256).length).toBe(2)
    expect(s.door.layer?.stats().parts).toEqual({ through: 4, told: 3 })
  })
})

describe('L17: a layer over our own compile (the layer route, design §3.2): its copy from the composed document, a page without a layout the original\'s', () => {
  /** a side over the format test's paper written with the engine's head of a layer over our own compile (made({ ours: true })) */
  const oursSetup = (o: Parameters<typeof setup>[0] = {}) => setup({ ...o, ours: true })
  /** a side over the same paper whose head says arXiv's PDF (the writer's, with the why our compile was refused, or none): it draws
   *  nothing in our hosts (they refuse it at bind), and the view takes its copy as it did before layers were over our base */
  const arxivSetup = () => setup({ ours: false })
  /** the left page 1 drawn by PDF.js, so that a copy taken from its canvas is possible */
  const leftDrawn = () => {
    // (the last viewer made: a row may set up more than one view)
    const viewer = FakePDFViewer.made.at(-1) as FakePDFViewer
    const pv = viewer.getPageView(0) as NonNullable<ReturnType<FakePDFViewer['getPageView']>>
    viewer.render(1, null, { width: Math.floor(pv.viewport.width), height: Math.floor(pv.viewport.height), sx: 1, sy: 1 })
    return pv.canvas as HTMLCanvasElement
  }
  const copyOf = (s: Setup, n: number) => s.doors[0]?.copies.filter(c => c[0] === n) ?? []

  it('the copy of a page is drawn from the composed document, and the left\'s canvas and the place\'s (the original\'s page view) are never asked, at the commit or after a zoom', async () => {
    const s = await oursSetup()
    await nearOn(s, [1, 2])
    const canvas = leftDrawn()
    s.side.tell(await ALL(true))
    await settle(s)
    // (the engine\'s head of a layer over our compile, with the arXiv PDF its check ran over)
    expect((await s.side.index())?.head).toMatchObject({ base: { source: 'ours', check: { boxes: 'equal' } }, orig: { bytes: ORIG.bytes } })
    expect(content(s, 1)).toBe('layer')
    expect(copyOf(s, 1)).toHaveLength(1)
    expect(copyOf(s, 1)[0]?.[1]).not.toBe(canvas)
    s.view.zoomTo(0.9)
    await settle(s, 60)
    expect(copyOf(s, 1).length).toBeGreaterThan(1)
    for (const c of copyOf(s, 1)) expect(c[1], 'the left\'s canvas is no source of ours').not.toBe(canvas)
  })

  it('a head over arXiv\'s PDF (the writer\'s `arxiv`, which a bundle of 7 reads as too) is drawn the same way: its copy the door\'s, the left\'s canvas never asked', async () => {
    const s = await arxivSetup()
    await nearOn(s, [1, 2])
    const canvas = leftDrawn()
    s.side.tell(await ALL(false))
    await settle(s)
    expect((await s.side.index())?.head.base).toMatchObject({ source: 'arxiv' })
    expect(copyOf(s, 1)[0]?.[1]).not.toBe(canvas)
  })

  it('a page of a part with no layout is the original\'s: never asked of the door, never swapped, its place keeps the original\'s page view; a page of a part with a layout is laid', async () => {
    const s = await oursSetup()
    await nearOn(s, [1, 2, 3, 4])
    s.side.tell(await ALL(true))
    await settle(s)
    for (const n of [1, 2, 3]) expect(content(s, n), `page ${n}`).toBe('layer')
    // (the paper\'s page 4 is its third part\'s, which records no layout)
    expect(content(s, 4)).toBe('original')
    expect(layerOf(s, 4)).toBeNull()
    expect(copyOf(s, 4)).toEqual([])
    // and over arXiv\'s PDF it is laid as it was
    const t = await arxivSetup()
    await nearOn(t, [4])
    t.side.tell(await ALL(false))
    await settle(t)
    expect(content(t, 4)).toBe('layer')
  })

  it('a page shown as arXiv\'s by the rule is told settled, never laid: the `layer` events\' `original` and coverage\'s, once a page however often it comes near, apart from `laid`; none over arXiv\'s PDF', async () => {
    // (2610.30854v1 on staging 9236d8f8: pages 1 to 9 the original\'s by the rule, the side told `laid: 0` alone, and the host
    // waited for a first page none of them would ever be)
    const s = await oursSetup()
    await nearOn(s, [1, 2, 3, 4])
    s.side.tell(await ALL(true))
    await settle(s)
    expect(content(s, 4)).toBe('original')
    const layers = () => s.events.filter((e): e is Extract<ViewEvent, { type: 'layer' }> => e.type === 'layer')
    const laid = s.side.coverage().laid
    expect(layers().at(-1)).toEqual({ type: 'layer', state: 'open', laid, total: N, original: 1 })
    expect(s.side.coverage()).toMatchObject({ original: 1 })
    // (page 4 counts in `original` alone: the pages the door laid are the others)
    expect(laid).toBe(s.side.probe().ready)
    // near again, asked again: the same page, counted once
    await nearOn(s, [4], false)
    await nearOn(s, [4])
    await settle(s)
    expect(s.side.coverage().original).toBe(1)
    expect(layers().filter(e => e.original !== undefined).map(e => e.original)).toEqual([1])
    // over arXiv\'s PDF a page is laid as it was: none is the original\'s by the rule
    const t = await arxivSetup()
    await nearOn(t, [4])
    t.side.tell(await ALL(false))
    await settle(t)
    expect(t.side.coverage().original).toBe(0)
    expect(t.events.some(e => e.type === 'layer' && 'original' in e)).toBe(false)
  })

  it('whichever comes first, the part\'s record or the page\'s ask: a page asked before its part is told waits for it, and is the original\'s when it comes', async () => {
    const m = await M(true)
    // the page asked first: its part (the last) not told yet
    const a = await oursSetup()
    await nearOn(a, [4])
    a.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1].map(i => jobRef(m, i)) })
    await settle(a)
    expect(content(a, 4)).toBe('original')
    a.side.tell({ parts: [jobRef(m, 2)], end: { through: N } })
    await settle(a)
    expect(content(a, 4)).toBe('original')
    expect(layerOf(a, 4)).toBeNull()
    expect(copyOf(a, 4)).toEqual([])
    // the record first, the page near afterwards
    const b = await oursSetup()
    b.side.tell(await ALL(true))
    await settle(b)
    await nearOn(b, [4])
    await settle(b)
    expect(content(b, 4)).toBe('original')
    expect(layerOf(b, 4)).toBeNull()
    expect(copyOf(b, 4)).toEqual([])
  })

  it('a part that gains no layout mid-run (a fork told after its pages were laid): the page only it holds comes back as the original\'s, the pages of the others (and the one a unit of the first runs on onto) stay the layer\'s', async () => {
    const m = await M(true)
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const refused = await writePart({ ...input, prev: m.parts[0]!.sha256, layout: { refused: 'carry', why: 'the test' }, fileOnly: [], rules: null })
    const s = await oursSetup({ extra: [refused] })
    await nearOn(s, [1, 2, 3])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(m, i)) })
    s.side.take([rowOf(2)])
    await settle(s)
    for (const n of [1, 2, 3]) expect(content(s, n), `page ${n}`).toBe('layer')
    expect(s.side.coverage().original).toBe(0)
    s.side.tell({ parts: [{ ...(refused.ref as Ref), prev: m.parts[0]!.sha256 }] })
    await settle(s)
    expect(s.side.probe().forks).toBe(1)
    // (the fork's door counts the page it shows as arXiv's by the rule)
    expect(s.side.coverage().original).toBe(1)
    // (page 2 stays laid: the first part\'s unit runs on onto it, its layout drawn there; page 3 is only the refused part\'s)
    for (const n of [1, 2]) expect(content(s, n), `page ${n}`).toBe('layer')
    expect(content(s, 3)).toBe('original')
    expect(layerOf(s, 3)).toBeNull()
  })

  it('a unit that runs on from a page of a part with a layout onto a page of a part with none (the part\'s reach): that page is laid, with the continuation drawn, in either order the two records come; the page held by the layoutless part alone stays the original\'s', async () => {
    const m = await M()
    // part A (the fixture\'s first) has pages [1, 1] and a layout whose lines run on to page 2; part B owns pages 2 and 3 with NO layout
    expect(m.readParts[0]?.pages).toEqual([1, 1])
    expect(m.readParts[0]?.reach).toBe(2)
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const b = await writePart({ ...input, prev: m.parts[0]!.sha256, layout: { refused: 'carry', why: 'the test' }, fileOnly: [], rules: null })
    const refB = { ...(b.ref as Ref), prev: m.parts[0]!.sha256 }
    const head = { head: m.head.ref, units: m.chunks.map(c => c.ref) }
    const check = async (s: Setup, what: string) => {
      await settle(s)
      // page 2: part A\'s reach holds it with a layout, part B owns it with none: laid (A\'s continuation is drawn there)
      expect(content(s, 2), `${what}: page 2`).toBe('layer')
      expect(layerOf(s, 2), `${what}: page 2`).not.toBeNull()
      // page 3: only part B holds it (its pages 2 to 3), with no layout: the original\'s
      expect(content(s, 3), `${what}: page 3`).toBe('original')
      expect(layerOf(s, 3), `${what}: page 3`).toBeNull()
      expect(s.door.layer?.pageState(1), what).toBe('ready')
      expect(s.side.coverage(), what).toMatchObject({ laid: 2 })
    }
    // the reaching part\'s record first, then the layoutless part\'s
    const first = await oursSetup({ extra: [b] })
    await nearOn(first, [1, 2, 3])
    first.side.tell({ ...head, parts: [jobRef(m, 0)] })
    await settle(first)
    first.side.tell({ parts: [refB] })
    await check(first, 'A then B')
    // the layoutless part\'s record first (it waits for its predecessor), then the reaching part\'s
    const second = await oursSetup({ extra: [b] })
    await nearOn(second, [1, 2, 3])
    second.side.tell({ ...head, parts: [refB] })
    await settle(second)
    second.side.tell({ parts: [jobRef(m, 0)] })
    await check(second, 'B then A')
    // both in one tell, the pages asked after
    const third = await oursSetup({ extra: [b] })
    third.side.tell({ ...head, parts: [jobRef(m, 0), refB] })
    await settle(third)
    await nearOn(third, [1, 2, 3])
    await check(third, 'both, the pages near afterwards')
  })

  it('noLayoutPage: a page is the original\'s only when a part owns it by its pages and no part that holds it, by its pages or its reach, has a layout', () => {
    const part = (a: number, b: number, layout: unknown, reach = b) => ({ pages: [a, b], reach, layout }) as never
    /** a layout whose lines run on the pages given (a row of eight numbers a group, the page first) */
    const rows = (...pages: number[]) => ({ lines: [[0, pages.flatMap(p => [p, 0, 0, 0, 0, 0, 0, 0])]] })
    // (a unit running on from page 1 onto page 2: part A\'s reach 2, its layout lines there; part B owns page 2 with none)
    expect(noLayoutPage([part(1, 1, rows(1, 2), 2), part(2, 3, null)], 2)).toBe(false)
    expect(noLayoutPage([part(1, 1, rows(1, 2), 2), part(2, 3, null)], 3)).toBe(true)
    expect(noLayoutPage([part(1, 1, null, 2), part(2, 3, null)], 2)).toBe(true)
    // (a part whose views reach a page its layout draws nothing on does not hold it: the fixture\'s second part reaches page 4)
    expect(noLayoutPage([part(1, 1, rows(1), 2), part(2, 3, null)], 2)).toBe(true)
    expect(noLayoutPage([part(2, 3, rows(2, 3), 4), part(4, 4, null)], 4)).toBe(true)
    // (a part reaching a page no part owns yet is not an owner: the page waits for its part)
    expect(noLayoutPage([part(1, 1, null, 2)], 2)).toBe(false)
    expect(noLayoutPage([part(1, 1, rows(1, 2), 2)], 2)).toBe(false)
    // (a unit running on from the page before can put one page in two parts\' ranges)
    expect(noLayoutPage([part(1, 2, rows(1, 2)), part(2, 3, null)], 2)).toBe(false)
    expect(noLayoutPage([part(1, 2, null), part(2, 3, null)], 2)).toBe(true)
    expect(noLayoutPage([part(1, 2, null), part(2, 3, rows(3))], 3)).toBe(false)
    expect(noLayoutPage([part(1, 2, null), part(3, 4, rows(3, 4))], 2)).toBe(true)
    // (a part with a layout that lays nothing on a page it owns: that page is the original's, as a layoutless part's; the pages
    // with its rows are laid)
    expect(noLayoutPage([part(1, 3, rows(1, 2))], 3)).toBe(true)
    expect(noLayoutPage([part(1, 3, rows(1, 2))], 2)).toBe(false)
    expect(noLayoutPage([part(1, 3, rows(1, 2)), part(4, 4, rows(4))], 3)).toBe(true)
    // no part holds the page yet (its part not told): not the original\'s by this rule, the door waits for it
    expect(noLayoutPage([part(1, 2, null)], 3)).toBe(false)
    expect(noLayoutPage([], 1)).toBe(false)
  })
})

describe('L18: a layer whose base is a delta over arXiv\'s PDF (the delta route): the composed document is the original\'s bytes but for the replaced pages', () => {
  // the small paper replaces its pages 2 and 3 (ranges [[2, 3]]): pages 1 and 4 are the original\'s in the composed document
  const REPLACED: [number, number][] = [[2, 3]]
  const deltaSetup = (o: Parameters<typeof setup>[0] = {}) => setup({ ...o, ours: true, delta: REPLACED })
  const leftDrawn = (n: number) => {
    const viewer = FakePDFViewer.made.at(-1) as FakePDFViewer
    const pv = viewer.getPageView(n - 1) as NonNullable<ReturnType<FakePDFViewer['getPageView']>>
    viewer.render(n, null, { width: Math.floor(pv.viewport.width), height: Math.floor(pv.viewport.height), sx: 1, sy: 1 })
    return pv.canvas as HTMLCanvasElement
  }
  const copyOf = (s: Setup, n: number) => s.doors[0]?.copies.filter(c => c[0] === n) ?? []

  it('every page\'s copy is the door\'s, from the composed document (render A): a page the delta does not replace with its annotations as the render has them, a replaced one with them off; the left\'s canvas never asked', async () => {
    const s = await deltaSetup()
    await nearOn(s, [1, 2, 3, 4])
    const canvas1 = leftDrawn(1)
    renders.length = 0
    s.side.tell(await ALL(true, REPLACED))
    await settle(s)
    expect((await s.side.index())?.head.base).toMatchObject({ source: 'ours', kind: 'delta', replaced: REPLACED })
    expect(copyOf(s, 1)[0]?.[1]).not.toBe(canvas1)
    expect(renders.filter(r => r.page === 1).map(r => r.annotationMode)).toEqual([undefined])
    expect(renders.filter(r => r.page === 2).map(r => r.annotationMode)).toEqual([0])
    // (pages 1 to 3 are drawn; page 4 is the third part\'s, which records no layout: the original\'s page)
    for (const n of [1, 2, 3]) expect(content(s, n), `page ${n}`).toBe('layer')
    expect(content(s, 4)).toBe('original')
  })

  it('a zoom draws every copy again from the composed document, at the new k', async () => {
    const s = await deltaSetup()
    await nearOn(s, [1, 2])
    s.side.tell(await ALL(true, REPLACED))
    await settle(s)
    const before = [copyOf(s, 1).length, copyOf(s, 2).length], k0 = copyOf(s, 1)[0]?.[2]
    s.view.zoomTo(0.9)
    await settle(s, 60)
    expect(copyOf(s, 1).length).toBeGreaterThan(before[0] as number)
    expect(copyOf(s, 2).length).toBeGreaterThan(before[1] as number)
    expect(copyOf(s, 1).at(-1)?.[2]).not.toBe(k0)
  })

  it('a replaced page is drawn from the composed document with the original\'s annotations off: its links are the layer\'s own (the door\'s), once; no element of the composed document\'s annotation layer is on any laid page', async () => {
    const link = (n: number) => ({ boxes: [100, 100, 200, 112], url: `https://example.org/${n}`, name: `l${n}`, moved: false, order: 0 })
    const s = await deltaSetup({ links: n => [link(n)] })
    await nearOn(s, [1, 2, 3, 4])
    renders.length = 0
    s.side.tell(await ALL(true, REPLACED))
    await settle(s)
    // the composed page of a replaced page is rendered with annotations off (the original\'s /Annots are kept in the delta, ~91 % of
    // their rectangles ours): nothing of them is drawn into the copy
    for (const r of renders.filter(x => x.page === 2 || x.page === 3)) expect(r.annotationMode, `page ${r.page}`).toBe(0)
    for (const n of [1, 2, 3]) {
      const wrap = layerOf(s, n) as HTMLElement
      // the layer\'s own links, one for each link record, in one wrapper; nothing else that links
      const anchors = [...wrap.querySelectorAll('a')]
      expect(anchors.map(a => a.getAttribute('href')), `page ${n}`).toEqual([`https://example.org/${n}`])
      expect(anchors.every(a => a.closest('.axt-links') !== null), `page ${n}`).toBe(true)
      expect(wrap.querySelector('.annotationLayer, [data-annotation-id], section.linkAnnotation, .linkAnnotation'), `page ${n}`).toBeNull()
      expect(places(s)[n - 1]?.querySelectorAll('.annotationLayer, section.linkAnnotation').length, `page ${n}`).toBe(0)
    }
  })

  it('a base held whole (kind full, or no kind) is as it was: every page\'s copy from the document, the annotations as the render has them', async () => {
    const s = await setup({ ours: true })
    await nearOn(s, [1, 2])
    const canvas = leftDrawn(1)
    renders.length = 0
    s.side.tell(await ALL())
    await settle(s)
    expect(copyOf(s, 1)[0]?.[1]).not.toBe(canvas)
    expect(renders.some(r => r.page === 1)).toBe(true)
    expect(renders.every(r => r.annotationMode === undefined)).toBe(true)
  })
})

describe('L15: a fork', () => {
  it('a different part at a page told opens the door again over the new chain', async () => {
    const m = await M()
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    const s = await setup({ extra: [other] })
    await nearOn(s, [1])
    // a job's parts (no end told yet)
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(m, i)) })
    s.side.take([rowOf(2)])
    await settle(s)
    expect(s.opens).toBe(1)
    const old = layerOf(s, 1)?.querySelector('svg') as SVGSVGElement
    expect(old).not.toBeNull()
    s.side.tell({ parts: [{ ...(other.ref as Ref), prev: m.parts[0]!.sha256 }] })
    // (the new door lays nothing yet)
    await settle(s, 30, false)
    expect(s.opens).toBe(2)
    // the rows so far given to the door opened again: the units are the head's, the same
    expect(s.doors[1]?.taken.map(r => r[0])).toEqual([2])
    expect(s.door.layer?.stats().parts).toEqual({ through: 3, told: 2 })
    expect(s.side.probe().forks).toBe(1)
    // the laid page keeps its drawing until the new door's is ready (DR7), then the new one's
    expect(s.door.layer?.pageState(1)).toBe('laying')
    expect(old.isConnected).toBe(true)
    expect(content(s, 1)).toBe('layer')
    await settle(s)
    const now = layerOf(s, 1)?.querySelector('svg')
    expect(now).not.toBeNull()
    expect(now).not.toBe(old)
    expect(old.isConnected).toBe(false)
  })

  it('a drawing kept over a fork or again() that leaves the view comes back as the original while the new door\'s page waits (the review\'s probe 2)', async () => {
    const s = await setup({ door: { rows: 'gate' } })
    const m = await M()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    s.side.again()
    await settle(s)
    expect(s.opens).toBe(2)
    expect(s.door.layer?.pageState(1)).toBe('waiting')
    await nearOn(s, [1], false)
    await nearOn(s, [1])
    await settle(s)
    expect(content(s, 1)).toBe('original')
    // the rows taken again: the new door's page committed there
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s)
    expect(content(s, 1)).toBe('layer')
  })

  it('a fork told after the catalog by a job\'s part is passed over; a catalog naming it opens the door again', async () => {
    const m = await M()
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    const s = await setup({ extra: [other] })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    s.side.tell({ parts: [{ ...(other.ref as Ref), prev: m.parts[0]!.sha256 }] })
    await settle(s)
    expect(s.opens).toBe(1)
    s.side.tell({ parts: [m.parts[0]!.ref as Ref, other.ref as Ref], end: { through: 3 } })
    await settle(s)
    expect(s.opens).toBe(2)
    expect(s.door.layer?.stats().parts).toEqual({ through: 3, told: 2 })
    expect(s.side.probe().ended).toBe(true)
  })
})

describe("the reader's toggles (setClasses, docs/route/orphan-text.md §8)", () => {
  it('opens the door again with them over the same documents, parts and rows, each laid page kept until the new door commits', async () => {
    const s = await setup({ door: { rows: 'gate' } })
    const m = await M()
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s)
    const kept = layerOf(s, 1)?.querySelector('svg'), fetched = s.fetched.length, rows = s.doors[0]?.taken.length
    s.side.setClasses({ tables: false })
    // (the drawing laid before stays in place while the new door opens: no blank, no flash)
    expect(layerOf(s, 1)?.querySelector('svg')).toBe(kept)
    await settle(s)
    expect(s.opens).toBe(2)
    expect(s.composed.length).toBe(1)
    expect(s.fetched.length).toBe(fetched)
    expect(s.doors[1]?.classes).toEqual({ tables: false })
    // (the rows so far given the new door again, and their end: nothing translated again)
    expect(s.doors[1]?.taken.length).toBe(rows)
    expect(s.doors[1]?.ended).toBe(1)
    expect([content(s, 1), content(s, 2)]).toEqual(['layer', 'layer'])
    // (the same toggles again: nothing)
    s.side.setClasses({ tables: false })
    await settle(s)
    expect(s.opens).toBe(2)
  })
  it('toggles turned while the door opens: the door in place takes them, opened again once the open under way is in', async () => {
    let release = () => {}
    const s = await setup({ door: { rows: 'gate' }, openHold: new Promise<void>(r => { release = r }) })
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    // (the open under way, held at the door, took the toggles as they were: the defaults)
    for (let i = 0; i < 50 && s.opens === 0; i++) await new Promise(r => setTimeout(r, 0))
    expect(s.opens).toBe(1)
    s.side.setClasses({ figures: true })
    release()
    await settle(s)
    expect(s.doors.at(-1)?.classes).toEqual({ figures: true })
    expect(s.layer()).toBe(s.doors.at(-1)?.layer)
  })
})

describe('another target over the same layer (retarget)', () => {
  const svgLang = (s: Setup, n: number) => layerOf(s, n)?.querySelector('svg')?.getAttribute('lang') ?? null
  /** the side open on its first target (zh), pages 1 and 2 near and laid with its rows (`ahead`: the pages laid ahead, the side's
   *  own by default) */
  async function laid(ahead?: number) {
    const s = await setup({ door: { rows: 'gate' }, ...(ahead === undefined ? {} : { ahead }) })
    const m = await M()
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s)
    return { s, m }
  }

  it('opens the door again over the same composed document, with nothing read again; each laid page keeps its drawing until the new target\'s commits', async () => {
    const { s, m } = await laid()
    expect([svgLang(s, 1), svgLang(s, 2)]).toEqual(['zh', 'zh'])
    const kept = layerOf(s, 1)?.querySelector('svg'), fetched = s.fetched.length
    s.side.retarget('ja')
    await settle(s)
    expect(s.opens).toBe(2)
    expect(s.composed.length).toBe(1)
    expect(s.destroyed).toEqual([])
    expect(s.side.probe()).toMatchObject({ target: 'ja', composed: 1, docs: 1, rows: 0 })
    // (the feed's objects are read once: the new door is given the parts read)
    expect(s.fetched.length).toBe(fetched)
    // the new target's pages wait for its rows: the target before stays drawn, the new door given none of its rows
    expect(content(s, 1)).toBe('layer')
    expect(layerOf(s, 1)?.querySelector('svg')).toBe(kept)
    expect(s.doors[1]?.taken).toEqual([])
    s.side.take(m.index.units.map((_, id) => rowOf(id, `ja ${id}`)))
    s.side.end()
    await settle(s)
    expect([content(s, 1), content(s, 2)]).toEqual(['layer', 'layer'])
    expect([svgLang(s, 1), svgLang(s, 2)]).toEqual(['ja', 'ja'])
    expect(kept?.isConnected).toBe(false)
  })

  it('lets the door before go at once: a copy of it under way is aborted and never put in place', async () => {
    // (none laid ahead: page 3 is asked as it comes near, its copy drawn then)
    const { s, m } = await laid(0)
    // (page 3's copy by the first door held at its render)
    const doc = (await s.composed[0]!.task.promise) as unknown as { getPage(n: number): Promise<object> }
    const get = doc.getPage.bind(doc)
    let release = () => {}
    const held = new Promise<void>(r => { release = r })
    doc.getPage = async (n: number) => Object.assign(await get(n), { render: () => ({ promise: held }) })
    await nearOn(s, [3])
    await settle(s, 6)
    const ask = s.doors[0]?.copies.find(c => c[0] === 3)?.[1] as { signal?: AbortSignal } | undefined
    expect(ask?.signal?.aborted).toBe(false)
    s.side.retarget('ja')
    expect(ask?.signal?.aborted).toBe(true)
    expect(s.doors[0]?.layer.pageState.bind(s.doors[0]?.layer)).toThrow()
    release()
    doc.getPage = get
    await settle(s)
    expect(content(s, 3)).not.toBe('layer')
    s.side.take(m.index.units.map((_, id) => rowOf(id, `ja ${id}`)))
    s.side.end()
    await settle(s)
    expect(svgLang(s, 3)).toBe('ja')
  })

  it('dropOthers: the pages still showing the target before go back to the original\'s page; the new target\'s stay', async () => {
    const { s, m } = await laid()
    s.side.retarget('ja')
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    s.side.dropOthers()
    await flush(4)
    expect([content(s, 1), content(s, 2)]).toEqual(['original', 'original'])
    s.side.take(m.index.units.map((_, id) => rowOf(id, `ja ${id}`)))
    s.side.end()
    await settle(s)
    s.side.dropOthers()
    await flush(4)
    expect([svgLang(s, 1), svgLang(s, 2)]).toEqual(['ja', 'ja'])
  })

  it('the kept pages of the target before are lit and hit by nothing until the new target\'s page commits (their shapes muted), or the original shows', async () => {
    const { s, m } = await laid()
    s.side.retarget('ja')
    await settle(s)
    expect(s.side.probe().muted).toBe('1 2')
    s.side.take(m.index.units.map((_, id) => rowOf(id, `ja ${id}`)))
    s.side.end()
    await settle(s)
    expect(s.side.probe().muted).toBe('')
    s.side.retarget('ko')
    await settle(s)
    expect(s.side.probe().muted).toBe('1 2')
    s.side.dropOthers()
    await flush(4)
    expect([s.side.probe().muted, content(s, 1)]).toEqual(['', 'original'])
  })

  it('A -> B -> C in quick succession, and a retarget while the door opens: the last target alone laid, the side not refused', async () => {
    const { s, m } = await laid()
    s.side.retarget('ja')
    s.side.retarget('ko')
    await settle(s)
    s.side.take(m.index.units.map((_, id) => rowOf(id, `ko ${id}`)))
    s.side.end()
    await settle(s)
    expect([svgLang(s, 1), svgLang(s, 2), s.side.probe().state, s.side.probe().composed]).toEqual(['ko', 'ko', 'open', 1])
    // (an open overtaken while it waits on the composed document, which then fails: nothing refused)
    const r = await setup({ door: { rows: 'gate' }, composedFailAt: [0] })
    await nearOn(r, [1])
    r.side.tell(await ALL())
    r.side.retarget('ja')
    await settle(r)
    expect(r.side.probe().target).toBe('ja')
  })

  it('zh -> ja -> zh, then the rows will not come: the first zh door\'s pages go to the original as the ja ones would (a drawing of a door before)', async () => {
    const { s } = await laid()
    s.side.retarget('ja')
    s.side.retarget('zh')
    await settle(s)
    expect([content(s, 1), s.side.probe().muted]).toEqual(['layer', '1 2'])
    s.side.dropOthers()
    await flush(4)
    expect([content(s, 1), content(s, 2), s.side.probe().muted]).toEqual(['original', 'original', ''])
  })

  it('a page holding the focus is kept by dropOthers until the focus leaves, then let go as the others: the original, its shapes unmuted', async () => {
    const { s } = await laid()
    s.side.retarget('ja')
    await settle(s)
    const b = document.createElement('button')
    layerOf(s, 1)?.append(b)
    b.focus()
    s.side.dropOthers()
    await flush(4)
    expect([content(s, 1), content(s, 2)]).toEqual(['layer', 'original'])
    const out = document.createElement('button')
    document.body.append(out)
    out.focus()
    await settle(s, 4)
    expect([content(s, 1), s.side.probe().muted]).toEqual(['original', ''])
    out.remove()
  })

  it('the same target, or a side that refused its layer: nothing', async () => {
    const { s } = await laid()
    s.side.retarget('zh')
    await settle(s)
    expect(s.opens).toBe(1)
    const r = await setup({ bind: async () => false })
    r.side.tell(await ALL())
    await settle(r)
    expect(r.side.probe().state).toBe('refused')
    r.side.retarget('ja')
    await settle(r)
    expect([r.opens, r.side.probe().target]).toEqual([0, 'zh'])
  })
})

describe('the parts after their end (the review\'s probe 4)', () => {
  it('an end told short, then a part past it with a later end: the door opened again over every part, the side open, its pages laid', async () => {
    const s = await setup()
    const m = await M()
    await nearOn(s, [1, 2])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [jobRef(m, 0)], end: { through: m.readParts[0]!.pages[1] } })
    await settle(s)
    expect(s.side.probe().ended).toBe(true)
    expect(content(s, 1)).toBe('layer')
    s.side.tell({ parts: [jobRef(m, 1)], end: { through: N } })
    await settle(s)
    expect(s.side.probe()).toMatchObject({ state: 'open', why: null })
    expect(s.door.layer?.stats().parts).toEqual({ through: 3, told: 2 })
    expect(content(s, 1)).toBe('layer')
    expect(content(s, 2)).toBe('layer')
  })
})

describe('L16 and L3: the rows, and what comes in parts', () => {
  it('rows taken before the door opens are held and given to it once open; again() carries none', async () => {
    const s = await setup()
    s.side.take([rowOf(2), rowOf(3)])
    s.side.take([rowOf(2, 'again')])
    s.side.end()
    s.side.tell(await ALL())
    await settle(s)
    expect(s.doors[0]?.taken.map(r => [r[0], r[1]])).toEqual([[2, ['again']], [3, ['t3']]])
    expect(s.doors[0]?.ended).toBe(1)
    s.side.again()
    await settle(s)
    expect(s.doors.length).toBe(2)
    expect(s.doors[1]?.taken).toEqual([])
    expect(s.doors[1]?.ended).toBe(0)
    // the host takes its rows again
    s.side.take([rowOf(2)])
    expect(s.doors[1]?.taken.map(r => r[0])).toEqual([2])
  })

  it('L3: parts and rows from two sources out of order give the pages one take gives; a ref told twice is fetched once', async () => {
    const m = await M()
    const all = m.index.units.map((_, id) => rowOf(id))
    const a = await setup({ door: { rows: 'gate' } })
    await nearOn(a, [1, 2, 3, 4])
    a.side.tell(await ALL())
    a.side.take(all)
    await settle(a)
    const b = await setup({ door: { rows: 'gate' } })
    await nearOn(b, [1, 2, 3, 4])
    b.side.tell({ parts: [jobRef(m, 2)] })
    b.side.take(all.slice(4))
    b.side.tell({ head: m.head.ref })
    b.side.tell({ parts: [m.parts[1]!.ref as Ref, jobRef(m, 2)], units: m.chunks.map(c => c.ref) })
    await settle(b, 5)
    b.side.tell({ parts: [m.parts[0]!.ref as Ref, jobRef(m, 0)], end: { through: N } })
    b.side.take(all.slice(0, 4))
    await settle(b)
    for (let n = 1; n <= N; n++) expect(content(b, n), `page ${n}`).toBe(content(a, n))
    // (page 4 is its third part\'s, which records no layout: the original\'s page, whichever way the parts came)
    expect(content(b, 4)).toBe('original')
    expect(content(b, 3)).toBe('layer')
    for (const sha of new Set(b.fetched)) expect(b.fetched.filter(x => x === sha).length, sha).toBe(1)
  })
})

describe('C1, C2, C5, C6: the contents on the view\'s channel', () => {
  it('no index, no entries; entries at the index, pages as parts come', async () => {
    const s = await setup()
    const m = await M()
    s.side.tell({ parts: [jobRef(m, 0)] })
    await settle(s, 5)
    expect(s.events.filter(e => e.type === 'outline')).toEqual([])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref) })
    await settle(s, 10)
    const first = s.events.filter(e => e.type === 'outline')[0] as Extract<ViewEvent, { type: 'outline' }>
    expect(first.entries.map(e => [e.id, e.page])).toEqual([[6, null]])
    s.side.tell({ parts: [jobRef(m, 1), jobRef(m, 2)] })
    await settle(s)
    const last = s.events.filter(e => e.type === 'outline').at(-1) as Extract<ViewEvent, { type: 'outline' }>
    expect(last.entries.map(e => [e.id, e.page])).toEqual([[6, 4]])
    s.side.take([rowOf(6, 'Einleitung')])
    await settle(s, 3)
    expect((s.events.filter(e => e.type === 'outline').at(-1) as Extract<ViewEvent, { type: 'outline' }>).entries[0]?.title).toBe('Einleitung')
  })

  it('the heading read follows the scroll of both panes', async () => {
    const s = await setup()
    s.side.tell(await ALL())
    await settle(s)
    const headings = () => s.events.filter(e => e.type === 'heading').map(e => (e as { id: number | null }).id)
    s.panes.left.scrollTop = 100000
    await flush(10)
    await s.clock.advance(40)
    expect(headings().at(-1)).toBe(6)
    s.panes.left.scrollTop = 0
    await flush(10)
    await s.clock.advance(40)
    expect(headings().at(-1)).toBeNull()
    s.view.setSync(false)
    s.panes.right.dispatchEvent(new Event('pointerdown'))
    s.panes.right.scrollTop = 100000
    await flush(10)
    await s.clock.advance(40)
    expect(headings().at(-1)).toBe(6)
  })
})

describe('H1, H2, H4, H5, H6: the highlight\'s data on both panes', () => {
  /** where unit `id` paints on page `p`: the middle of its first run's block there, as the left's shapes made of the same
   *  parts and left part lay it out (PDF units) */
  async function middleOf(id: number, p: number) {
    const m = await M()
    const { createShapes } = await import('@/pdf-reader/engine/view/shapes.mjs')
    const h = createShapes({ kindOf: i => m.index.kinds[i] ?? undefined })
    h.addParts(m.readParts)
    h.addPage(m.readLefts[p - 1]!)
    const run = h.shapes.runs(id).find(r => r.page === p)!, b = h.shapes.block(run, 0)
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
  }
  const lit = (pane: HTMLElement, p: number) => pane.querySelectorAll(`:scope > .pdfViewer > .page[data-page-number="${p}"] .axt-hl`).length
  async function moveTo(s: Setup, pane: HTMLElement, p: number, at: { x: number; y: number }) {
    const c = clientOf(pane, p, at.x, at.y)
    pane.dispatchEvent(new MouseEvent('mousemove', { clientX: c.clientX, clientY: c.clientY, bubbles: true }))
    await s.clock.advance(20)
    await settle(s, 6)
  }

  it('H1: the pointer over the left lights the unit on both panes, once the page\'s left part is in', async () => {
    const s = await setup()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    leftViewer().render(1)
    await moveTo(s, s.panes.left, 1, await middleOf(0, 1))
    expect(s.view.probe().lit).toBe(0)
    expect(lit(s.panes.left, 1)).toBeGreaterThan(0)
    expect(lit(s.panes.right, 1)).toBeGreaterThan(0)
  })

  it('H2: the pointer over the right lights the unit on both panes, and H4: off clears it, on again lights under the resting pointer', async () => {
    const s = await setup()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    await moveTo(s, s.panes.right, 1, await middleOf(0, 1))
    expect(s.view.probe().lit).toBe(0)
    expect(lit(s.panes.right, 1)).toBeGreaterThan(0)
    expect(lit(s.panes.left, 1)).toBeGreaterThan(0)
    s.highlight(false)
    await s.clock.advance(20)
    expect(s.view.probe().lit).toBeNull()
    expect(lit(s.panes.left, 1) + lit(s.panes.right, 1)).toBe(0)
    s.highlight(true)
    await s.clock.advance(40)
    expect(s.view.probe().lit).toBe(0)
  })
  it('H2 (trap 2): nothing is fetched of the left before a want; the first move over the right fetches the page\'s left part once, then the page its paragraph runs on to', async () => {
    const s = await setup()
    const m = await M()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    const lefts = Object.values(m.lefts).map(l => l.sha256)
    expect(s.fetched.filter(x => lefts.includes(x))).toEqual([])
    const at = clientOf(s.panes.right, 1, 100, 700)
    for (let i = 0; i < 3; i++) { s.panes.right.dispatchEvent(new MouseEvent('mousemove', { clientX: at.clientX, clientY: at.clientY + i, bubbles: true })); await s.clock.advance(20) }
    await settle(s)
    // (unit 2, a paragraph, runs on to page 2: its sentences wait for both pages; nothing of pages 3 and 4)
    expect(s.fetched.filter(x => lefts.includes(x))).toEqual([m.lefts[1]!.sha256, m.lefts[2]!.sha256])
    expect(s.side.probe().leftParts).toBe(2)
  })

  it('H8: a unit over many pages brings at most SPREAD_MAX of them with a wanted page, the nearest first, each once', () => {
    const long = Array.from({ length: 20 }, (_, i) => i + 1)
    const pagesOf = (id: number) => (id === 1 ? long : id === 2 ? [10, 11] : undefined)
    expect(SPREAD_MAX).toBe(8)
    expect(spreadPages(10, [1, 2, 3], pagesOf, () => false)).toEqual([9, 11, 8, 12, 7, 13, 6, 14])
    // (the page itself is none of them; of the nearest, those in already none: never more pages as the near ones come)
    expect(spreadPages(10, [2, 1], pagesOf, q => q < 10, 3)).toEqual([11])
    expect(spreadPages(10, [1], pagesOf, q => Math.abs(q - 10) <= 4)).toEqual([])
    expect(spreadPages(10, [3], pagesOf, () => false)).toEqual([])
  })

  it('H7: a paragraph over a page break lights by sentence on its first page\'s first hover: the other page\'s left part comes after the page\'s own', async () => {
    // unit 2 paired on both of its pages (its four words: three on page 1, one on page 2), its second sentence beginning on
    // page 2; no page laid, so that the right is the left's mirrored
    const v = await made({ pairs: { 1: [[0, [0, 0, 2]], [2, [0, 12, 3]]], 2: [[2, [3, 0, 1]], [3, [0, 5, 2]]] } })
    const s = await setup({ paper: { objects: [...v.chunks, v.head, ...v.parts, ...Object.values(v.lefts)], pages: N } })
    s.side.tell({ head: v.head.ref, units: v.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(v, i)), end: { through: N } })
    await settle(s)
    const { unitOf } = await import('@/pdf-reader/engine/layer-proto/rows.mjs')
    const { tokens } = await import('@/pdf-reader/engine/pipeline/anchors.mjs')
    const text = 'Aaa bbb ccc. Ddd eee.', src = unitOf(v.index, rowOf(2, text))!.src
    const words = tokens(src)
    expect(words.length).toBe(4)
    s.side.take([rowOf(2, text, { src: [words[3]!.at], tr: [text.indexOf('Ddd')] })])
    leftViewer().render(1)
    // (the paper's tokens stand on one line, each 28 wide and 0.1 right of the one before: the title's block and unit 2's
    // over each other, but for the 1.3 past the title's end. The point: past the title's padded block, in unit 2's, where a
    // unit lit by sentence reaches, and a unit lit whole does not)
    const { createShapes } = await import('@/pdf-reader/engine/view/shapes.mjs')
    const h = createShapes({ kindOf: i => v.index.kinds[i] ?? undefined })
    h.addParts(v.readParts)
    h.addPage(v.readLefts[0]!)
    const b = h.shapes.block(h.shapes.runs(2).find(r => r.page === 1)!, 0), title = h.shapes.block(h.shapes.runs(0)[0]!, 0)
    const pad = 3 / (clientOf(s.panes.left, 1, 1, 0).clientX - clientOf(s.panes.left, 1, 0, 0).clientX)
    const x = title.x1 + pad + 0.4
    expect(x).toBeLessThan(b.x1 + pad - 0.4)
    await moveTo(s, s.panes.left, 1, { x, y: (b.y0 + b.y1) / 2 })
    const lefts = Object.values(v.lefts).map(l => l.sha256)
    expect(s.fetched.filter(x => lefts.includes(x))).toEqual([v.lefts[1]!.sha256, v.lefts[2]!.sha256])
    expect(s.view.probe().lit).toBe(2)
    expect(s.view.probe().litSentence).toBe(0)
  })

  it('H9: the other page\'s left part that fails is asked again on a later hover once its wait has passed, and the paragraph then lights by sentence', async () => {
    // unit 2 paired on both of its pages (its four words: three on page 1, one on page 2), its second sentence beginning on
    // page 2; no page laid, so that the right is the left's mirrored
    const v = await made({ pairs: { 1: [[0, [0, 0, 2]], [2, [0, 12, 3]]], 2: [[2, [3, 0, 1]], [3, [0, 5, 2]]] } })
    const s = await setup({ paper: { objects: [...v.chunks, v.head, ...v.parts, ...Object.values(v.lefts)], pages: N } })
    s.refuse.add(v.lefts[2]!.sha256)
    s.side.tell({ head: v.head.ref, units: v.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(v, i)), end: { through: N } })
    await settle(s)
    const { unitOf } = await import('@/pdf-reader/engine/layer-proto/rows.mjs')
    const { tokens } = await import('@/pdf-reader/engine/pipeline/anchors.mjs')
    const text = 'Aaa bbb ccc. Ddd eee.', src = unitOf(v.index, rowOf(2, text))!.src
    const words = tokens(src)
    expect(words.length).toBe(4)
    s.side.take([rowOf(2, text, { src: [words[3]!.at], tr: [text.indexOf('Ddd')] })])
    leftViewer().render(1)
    // (the paper's tokens stand on one line, each 28 wide and 0.1 right of the one before: the title's block and unit 2's
    // over each other, but for the 1.3 past the title's end. The point: past the title's padded block, in unit 2's, where a
    // unit lit by sentence reaches, and a unit lit whole does not)
    const { createShapes } = await import('@/pdf-reader/engine/view/shapes.mjs')
    const h = createShapes({ kindOf: i => v.index.kinds[i] ?? undefined })
    h.addParts(v.readParts)
    h.addPage(v.readLefts[0]!)
    const b = h.shapes.block(h.shapes.runs(2).find(r => r.page === 1)!, 0), title = h.shapes.block(h.shapes.runs(0)[0]!, 0)
    const pad = 3 / (clientOf(s.panes.left, 1, 1, 0).clientX - clientOf(s.panes.left, 1, 0, 0).clientX)
    const x = title.x1 + pad + 0.4
    expect(x).toBeLessThan(b.x1 + pad - 0.4)
    await moveTo(s, s.panes.left, 1, { x, y: (b.y0 + b.y1) / 2 })
    // (page 2's fails: the paragraph lights whole meanwhile; asked again only once the wait has passed)
    expect([s.view.probe().lit, s.view.probe().litSentence]).toEqual([2, -1])
    s.refuse.delete(v.lefts[2]!.sha256)
    await moveTo(s, s.panes.left, 1, { x, y: (b.y0 + b.y1) / 2 + 0.5 })
    const lefts = Object.values(v.lefts).map(l => l.sha256)
    expect(s.fetched.filter(x => lefts.includes(x))).toEqual([v.lefts[1]!.sha256, v.lefts[2]!.sha256])
    await s.clock.advance(LEFT_RETRY_MS + 10)
    await moveTo(s, s.panes.left, 1, { x, y: (b.y0 + b.y1) / 2 })
    expect(s.fetched.filter(x => lefts.includes(x))).toEqual([v.lefts[1]!.sha256, v.lefts[2]!.sha256, v.lefts[2]!.sha256])
    expect(s.view.probe().lit).toBe(2)
    expect(s.view.probe().litSentence).toBe(0)
  })

  it('H6: leftPageOf once a page, from either pane; H5: a refused left part gives no shapes and one warning, sync on', async () => {
    const s = await setup()
    const m = await M()
    s.refuse.add(m.lefts[2]!.sha256)
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    await settle(s)
    const move = async (pane: HTMLElement, n: number) => { const at = clientOf(pane, n, 100, 700); pane.dispatchEvent(new MouseEvent('mousemove', { clientX: at.clientX, clientY: at.clientY, bubbles: true })); await s.clock.advance(20); await settle(s, 4) }
    await move(s.panes.left, 1)
    await move(s.panes.right, 1)
    await move(s.panes.left, 2)
    await move(s.panes.right, 2)
    const lefts = Object.values(m.lefts).map(l => l.sha256)
    expect(s.fetched.filter(x => lefts.includes(x)).sort()).toEqual([m.lefts[1]!.sha256, m.lefts[2]!.sha256].sort())
    expect(s.warned().filter(w => w.includes('left part of page 2')).length).toBe(1)
    expect(s.view.probe().available).toBe(true)
  })
})

describe('the order (§2.2): the original before the base and the door', () => {
  it('a side told everything before the original is shown binds nothing and opens nothing; the original shown, it opens', async () => {
    const bind = vi.fn(async () => true)
    const s = await setup({ noOriginal: true, bind })
    s.side.tell(await ALL())
    await settle(s)
    expect(bind).not.toHaveBeenCalled()
    expect(s.composed.length).toBe(0)
    expect(s.opens).toBe(0)
    // the index read all the same: the contents told
    expect(s.events.some(e => e.type === 'outline')).toBe(true)
    const task = fakeTask()
    const answer = s.view.showOriginal(() => task as unknown as DocumentTask)
    task.resolve(fakeDoc(N))
    expect(await answer).toBe('opened')
    await nearOn(s, [1])
    await settle(s)
    expect(bind).toHaveBeenCalledTimes(1)
    expect(s.opens).toBe(1)
    expect(content(s, 1)).toBe('layer')
  })
})

describe('the PR\'s review', () => {
  /** a want of page n from the right pane: the pointer over its middle */
  async function want(s: Setup, n: number) {
    const c = clientOf(s.panes.right, n, 300, 400)
    s.panes.right.dispatchEvent(new MouseEvent('mousemove', { clientX: c.clientX, clientY: c.clientY, bubbles: true }))
    await s.clock.advance(20)
    await settle(s, 6)
  }

  it('a refusal after the composed document is open lets it go at once, and nothing more is fetched (4288064933)', async () => {
    const s = await setup({ openFails: true })
    s.side.tell(await ALL())
    await settle(s)
    expect(s.side.probe().state).toBe('refused')
    expect(s.destroyed).toEqual(['destroy composed 0'])
    const n = s.fetched.length
    s.side.tell({ parts: [jobRef(await M(), 0)] })
    await settle(s)
    expect(s.fetched.length).toBe(n)
  })

  it('a refusal after pages were laid puts the right\'s shapes back to the original\'s with its places (4288144909)', async () => {
    const m = await M()
    const s = await setup({ openFailAt: [1] })
    await nearOn(s, [1])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref) })
    await settle(s)
    s.side.tell({ parts: [jobRef(m, 0)] })
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    await want(s, 1)
    expect(s.side.probe().shapesLaid).toBe(1)
    // a later attempt: the door does not open again
    s.side.again()
    await settle(s)
    expect(s.side.probe()).toMatchObject({ state: 'refused', why: 'open', shapesLaid: 0 })
    expect(content(s, 1)).toBe('original')
  })

  it('a replacement page whose copy fails: the earlier door\'s drawing goes, the original shows, and it is asked again (4288144925)', async () => {
    const s = await setup({ copyFails: (d, n, before) => d === 1 && n === 1 && before === 0 })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    const old = layerOf(s, 1)?.querySelector('svg')
    expect(old).not.toBeNull()
    s.side.again()
    await settle(s)
    expect(s.opens).toBe(2)
    expect(content(s, 1)).toBe('original')
    expect(old?.isConnected).toBe(false)
    s.panes.right.scrollTop = 30
    await flush(10)
    await settle(s)
    expect(content(s, 1)).toBe('layer')
  })

  it('a left part whose fetch fails is fetched again on a later want, once its wait has passed (4288144898)', async () => {
    const m = await M()
    const s = await setup()
    s.refuse.add(m.lefts[1]!.sha256)
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    await want(s, 1)
    const count = () => s.fetched.filter(x => x === m.lefts[1]!.sha256).length
    expect(count()).toBe(1)
    s.refuse.clear()
    // (the pointer over the page again at once: not asked again, a failure may be the part's own)
    await want(s, 1)
    expect(count()).toBe(1)
    await s.clock.advance(LEFT_RETRY_MS + 100)
    await want(s, 2)
    await want(s, 1)
    expect(count()).toBe(2)
    // (pages 2 and 1 landed: page 1's on its second ask)
    expect(s.side.probe().leftParts).toBe(2)
  })

  it('again() lets the earlier attempt\'s titles go from the contents; a fork keeps the outline\'s pages (4288065086, 4288065279, 4288144903)', async () => {
    const m = await M()
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    const s = await setup({ extra: [other] })
    // the original's own outline: 'Intro' on page 3
    const doc = internalsOf(s.view).left.doc() as unknown as Record<string, unknown>
    doc.getOutline = async () => [{ title: 'Intro', dest: [2, { name: 'XYZ' }], items: [] }]
    const outline = () => (s.events.filter(e => e.type === 'outline').at(-1) as Extract<ViewEvent, { type: 'outline' }>).entries[0]
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1].map(i => jobRef(m, i)) })
    s.side.take([rowOf(6, 'Einleitung')])
    await settle(s)
    expect(outline()).toMatchObject({ id: 6, page: 3, title: 'Einleitung' })
    // a fork: page 4's part, which locates the heading, no longer follows; the outline's page is kept
    s.side.tell({ parts: [{ ...(other.ref as Ref), prev: m.parts[0]!.sha256 }] })
    await settle(s)
    expect(s.side.probe().forks).toBe(1)
    expect(outline()).toMatchObject({ id: 6, page: 3, title: 'Einleitung' })
    s.side.again()
    await settle(s)
    expect(outline()).toMatchObject({ id: 6, page: 3, title: 'Intro' })
  })

  it('a catalog naming a shorter chain opens the door again over it and ends its parts (4288064787)', async () => {
    const m = await M()
    const s = await setup()
    s.side.tell(await ALL())
    await settle(s)
    expect(s.door.layer?.stats().parts).toEqual({ through: 4, told: 3 })
    s.side.tell({ parts: [m.parts[0]!.ref as Ref], end: { through: 1 } })
    await settle(s)
    expect(s.opens).toBe(2)
    expect(s.door.layer?.stats().parts).toEqual({ through: 1, told: 1 })
    expect(s.side.probe().ended).toBe(true)
    expect(s.door.layer?.pageState(2)).toBe('failed')
  })
})

describe('the PR\'s review, second round', () => {
  /** a want of page n from the right pane: the pointer over its middle */
  async function want(s: Setup, n: number) {
    const c = clientOf(s.panes.right, n, 300, 400)
    s.panes.right.dispatchEvent(new MouseEvent('mousemove', { clientX: c.clientX, clientY: c.clientY, bubbles: true }))
    await s.clock.advance(20)
    await settle(s, 6)
  }

  it('a refusal while a left part is fetched aborts that fetch (4289061885)', async () => {
    const m = await M()
    const s = await setup({ openFailAt: [1] })
    await nearOn(s, [1])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref) })
    await settle(s)
    s.side.tell({ parts: [jobRef(m, 0)] })
    await settle(s)
    s.hold.add(m.lefts[1]!.sha256)
    await want(s, 1)
    const signal = s.signals.get(m.lefts[1]!.sha256)
    expect(signal?.aborted).toBe(false)
    s.side.again()
    await settle(s)
    expect(s.side.probe().state).toBe('refused')
    expect(signal?.aborted).toBe(true)
  })

  it('a fork lets a page\'s failed left part be asked again at once, from the new door (4289061968)', async () => {
    const m = await M()
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    const s = await setup({ extra: [other] })
    await nearOn(s, [2])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1].map(i => jobRef(m, i)) })
    await settle(s)
    s.refuse.add(m.lefts[2]!.sha256)
    await want(s, 2)
    const count = () => s.fetched.filter(x => x === m.lefts[2]!.sha256).length
    expect(count()).toBe(1)
    s.refuse.clear()
    s.side.tell({ parts: [{ ...(other.ref as Ref), prev: m.parts[0]!.sha256 }] })
    await settle(s)
    expect(s.side.probe().forks).toBe(1)
    await want(s, 1)
    await want(s, 2)
    expect(count()).toBe(2)
  })

  it('a page this door laid, let go far away and near again, whose copy then fails: the right\'s shapes the original\'s there too (4289064231)', async () => {
    // (no drawing kept off the view: the page is laid and drawn again as it comes near)
    const s = await setup({ copyFails: (d, n, before) => d === 0 && n === 1 && before === 1, keepPixels: 0 })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    await want(s, 1)
    expect(s.side.probe().shapesLaid).toBe(1)
    await nearOn(s, [1], false)
    await nearOn(s, [1])
    await settle(s)
    expect(content(s, 1)).toBe('original')
    expect(s.side.probe().shapesLaid).toBe(0)
    // asked again on the next scroll: laid, its shapes the layer's again
    s.panes.right.scrollTop = 30
    await flush(10)
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    expect(s.side.probe().shapesLaid).toBe(1)
  })
})

describe('the PR\'s review, third round (#379)', () => {
  async function want(s: Setup, n: number) {
    const c = clientOf(s.panes.right, n, 300, 400)
    s.panes.right.dispatchEvent(new MouseEvent('mousemove', { clientX: c.clientX, clientY: c.clientY, bubbles: true }))
    await s.clock.advance(20)
    await settle(s, 6)
  }

  it('a page shown as the original again before its left part came: the left part landing later makes no translated shapes there (4289273765, 4289274948)', async () => {
    // (no drawing kept off the view: the page is laid and drawn again as it comes near)
    const s = await setup({ copyFails: (d, n, before) => d === 0 && n === 1 && before === 1, keepPixels: 0 })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    // committed with no want yet: its words in, its left part not
    expect(content(s, 1)).toBe('layer')
    expect(s.side.probe().shapesLaid).toBe(0)
    await nearOn(s, [1], false)
    await nearOn(s, [1])
    await settle(s)
    expect(content(s, 1)).toBe('original')
    await want(s, 1)
    // (and page 2's: unit 2 runs on to it)
    expect(s.side.probe().leftParts).toBe(2)
    expect(s.side.probe().shapesLaid).toBe(0)
    // laid again on the next scroll: the layer's shapes there with it
    s.panes.right.scrollTop = 30
    await flush(10)
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    expect(s.side.probe().shapesLaid).toBe(1)
  })

  it('a page that stalled (shown as the original) and is laid late takes the layer\'s shapes with its drawing', async () => {
    const m = await M()
    const s = await setup()
    await nearOn(s, [1])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [jobRef(m, 0)] })
    for (let i = 0; i < 20; i++) { await macrotask(); await s.clock.advance(1) }
    expect(s.door.layer?.pageState(1)).toBe('laying')
    await s.clock.advance(PAGE_MS + 10)
    expect(s.side.coverage().stalled).toBe(1)
    await want(s, 1)
    expect(content(s, 1)).toBe('layer')
    expect(s.side.probe().shapesLaid).toBe(1)
  })
})

describe('the side: one a view, and its dispose', () => {
  it('a second side while one lives throws; after its dispose another may be made', async () => {
    const s = await setup()
    const o = { paper: { id: 'x', version: 1 }, target: 'zh', faceSources: async () => null, hyphUrl: () => '', fetchObject: async () => new Uint8Array(), bind: async () => true, composed: () => fakeTask() as unknown as DocumentTask }
    expect(() => createLayerSide(s.view, o as never)).toThrow()
    s.side.dispose()
    const again = createLayerSide(s.view, o as never)
    again.dispose()
  })

  it('emits no layer event after dispose, and the view\'s dispose disposes it first', async () => {
    const s = await setup()
    s.side.tell(await ALL())
    s.view.dispose()
    const n = s.events.length
    await settle(s)
    expect(s.events.length).toBe(n)
    expect(s.door.layer).toBeNull()
  })
})

describe('translating: the indicator over a near page\'s paragraphs not laid yet (§11.8)', () => {
  const marksOf = (s: Setup, n: number) => places(s)[n - 1]?.querySelectorAll('.axt-translating .axt-translating-mark').length ?? 0
  it('a mark over each paragraph the parts locate on a near page while it is not laid, none once it is', async () => {
    const s = await setup({ door: { rows: 'gate' } })
    const m = await M()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s, 10, false)
    const on1 = unitsOn(m, 1).filter(id => m.index.kinds[id] !== 'author')
    expect(on1.length).toBeGreaterThan(0)
    expect(marksOf(s, 1)).toBe(on1.length)
    // (no pointer, and nothing for assistive technology)
    expect(places(s)[0]?.querySelector('.axt-translating')?.getAttribute('aria-hidden')).toBe('true')
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    expect(marksOf(s, 1)).toBe(0)
  })

  it('marks a class the reader\'s toggles (`classes`) show: a table\'s cells hidden under "tables" off, the author block under "names" on', async () => {
    const m = await M()
    // (a page holding cells, and the defaults' marks there: every paragraph but an author block's, whose names are off)
    const n = [1, 2, 3, 4].find(p => unitsOn(m, p).some(id => m.index.kinds[id] === 'cell'))!
    expect(n).toBeDefined()
    const on = unitsOn(m, n), cells = on.filter(id => m.index.kinds[id] === 'cell'), authors = on.filter(id => m.index.kinds[id] === 'author')
    const marks = (s: Setup) => places(s)[n - 1]?.querySelectorAll('.axt-translating .axt-translating-mark').length
    const plain = await setup({ door: { rows: 'gate' } })
    await nearOn(plain, [n])
    plain.side.tell(await ALL())
    await settle(plain, 10, false)
    expect(plain.doors[0]?.classes).toBeNull()
    expect(marks(plain)).toBe(on.length - authors.length)
    // (tables off, names on, given at the side's creation: the door told so, no cell marked, the author block marked as any)
    const off = await setup({ door: { rows: 'gate' }, classes: { tables: false, names: true } })
    await nearOn(off, [n])
    off.side.tell(await ALL())
    await settle(off, 10, false)
    expect(off.doors[0]?.classes).toEqual({ tables: false, names: true })
    expect(marks(off)).toBe(on.length - cells.length)
    // (and set later, setClasses: the door opened again with them, and the marks read them)
    plain.side.setClasses({ tables: false, names: true })
    await settle(plain, 10, false)
    expect(plain.doors.at(-1)?.classes).toEqual({ tables: false, names: true })
    expect(marks(plain)).toBe(on.length - cells.length)
  })

  it('none on a far page, and none for a paragraph whose rows ended without a row of it', async () => {
    const s = await setup({ door: { rows: 'gate' } })
    const m = await M()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s, 10, false)
    expect(marksOf(s, 3)).toBe(0)
    const before = marksOf(s, 1)
    // (every row but one unit's of page 1, then the rows' end: that one stays the original's, its mark goes with the rest)
    const [kept] = unitsOn(m, 1)
    s.side.take(m.index.units.map((_, id) => rowOf(id)).filter(r => r[0] !== kept))
    s.side.end()
    await settle(s, 3, false)
    expect(marksOf(s, 1)).toBeLessThan(before)
  })

  it('each mark its box in the page\'s shares as the overlay\'s container units; a still mark where the browser cannot size a container', async () => {
    try {
      for (const can of [false, true]) {
        vi.stubGlobal('CSS', { supports: (p: string, v: string) => can || !(p === 'width' && /cq/.test(v)) })
        const s = await setup({ door: { rows: 'gate' } })
        await nearOn(s, [1])
        s.side.tell(await ALL())
        await settle(s, 10, false)
        const el = places(s)[0]?.querySelector('.axt-translating') as HTMLElement | null
        const mark = el?.querySelector('.axt-translating-mark') as HTMLElement | null
        expect(mark?.getAttribute('style')).toMatch(/^--axt-tr-x: ?[\d.]+cqw; ?--axt-tr-y: ?[\d.]+cqh; ?--axt-tr-w: ?[\d.]+cqw; ?--axt-tr-h: ?[\d.]+cqh; ?--axt-tr-px: ?[\d.]+cqw; ?--axt-tr-py: ?[\d.]+cqh;?$/)
        // (the scale of a CSS pixel at 100 % on the page's overlay: 100 / (4w/3) cqw, w its width in points)
        expect(el?.style.getPropertyValue('--axt-tr-u')).toMatch(/^[\d.]+cqw$/)
        // (no two cards meet: each box grown by its own padding is clear of every other)
        const boxes = [...(el?.querySelectorAll('.axt-translating-mark') ?? [])].map(e => {
          const v = (k: string) => Number.parseFloat((e as HTMLElement).style.getPropertyValue(k))
          return { l: v('--axt-tr-x') - v('--axt-tr-px'), r: v('--axt-tr-x') + v('--axt-tr-w') + v('--axt-tr-px'), t: v('--axt-tr-y') - v('--axt-tr-py'), b: v('--axt-tr-y') + v('--axt-tr-h') + v('--axt-tr-py') }
        })
        for (const [i, a] of boxes.entries()) for (const c of boxes.slice(i + 1)) expect(a.l < c.r - 1e-3 && c.l < a.r - 1e-3 && a.t < c.b - 1e-3 && c.t < a.b - 1e-3).toBe(false)
        expect(boxes.some(b => b.r - b.l > 0)).toBe(true)
        expect(el?.classList.contains('axt-translating-still')).toBe(!can)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('one light for the page: each mark\'s pass starts when its page\'s indicator did, a mark a later part brings too', async () => {
    const m = await M()
    const timeline = { currentTime: 1000 }
    const own = Object.getOwnPropertyDescriptor(document, 'timeline')
    Object.defineProperty(document, 'timeline', { configurable: true, get: () => timeline })
    // (the browser's animations as the overlay reads them: each mark's fade and its pass, which starts as the mark is styled)
    type Anim = { animationName: string; startTime: number | null }
    const kept = new WeakMap<Element, Anim[]>()
    // (an element's own animations alone unless the subtree is asked for, as a browser gives them: the overlay has none of its own)
    const spy = vi.spyOn(HTMLElement.prototype, 'getAnimations').mockImplementation(function (this: HTMLElement, options?: { subtree?: boolean }) {
      if (options?.subtree !== true) return []
      return [...this.querySelectorAll('.axt-translating-mark')].flatMap(e => {
        let a = kept.get(e)
        if (!a) { a = [{ animationName: 'axt-tr-in', startTime: null }, { animationName: 'axt-tr-pass', startTime: timeline.currentTime + 16 }]; kept.set(e, a) }
        return a
      }) as unknown as Animation[]
    })
    vi.stubGlobal('CSS', { supports: () => true })
    try {
      const s = await setup({ door: { rows: 'gate' } })
      await nearOn(s, [2])
      // (the first part alone, which reaches page 2: its marks, their passes set to the indicator's start)
      s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [jobRef(m, 0)] })
      await settle(s, 10, false)
      const passes = () => [...(places(s)[1]?.querySelectorAll('.axt-translating-mark') ?? [])].map(e => kept.get(e))
      const first = passes()
      expect(first.length).toBeGreaterThan(0)
      expect(first.map(a => a?.[1]?.startTime)).toEqual(first.map(() => 1000))
      // (the rest later: the new marks' passes started at their own styling, set back to the page's, the fades untouched)
      timeline.currentTime = 5000
      s.side.tell(await ALL())
      await settle(s, 10, false)
      const all = passes()
      expect(all.length).toBeGreaterThan(first.length)
      expect(all.map(a => a?.[1]?.startTime)).toEqual(all.map(() => 1000))
      expect(all.map(a => a?.[0]?.startTime)).toEqual(all.map(() => null))
    } finally {
      spy.mockRestore()
      if (own) Object.defineProperty(document, 'timeline', own)
      else delete (document as unknown as { timeline?: unknown }).timeline
      vi.unstubAllGlobals()
    }
  })

  it('a card stays the same element while rows come in batches (its delay and fade run once); a page that stays the original\'s has none; the host\'s word that the rows will not come takes every card, until another attempt', async () => {
    const s = await setup({ door: { rows: 'gate' } })
    const m = await M()
    await nearOn(s, [1, 4])
    s.side.tell(await ALL())
    await settle(s, 10, false)
    const first = [...(places(s)[0]?.querySelectorAll('.axt-translating-mark') ?? [])]
    expect(first.length).toBeGreaterThan(0)
    // (rows of another page: page 1's cards are the same elements)
    const other = m.index.units.map((_, id) => id).filter(id => !unitsOn(m, 1).includes(id)).slice(0, 3)
    s.side.take(other.map(id => rowOf(id)))
    await settle(s, 3, false)
    const again = [...(places(s)[0]?.querySelectorAll('.axt-translating-mark') ?? [])]
    expect(again.length).toBe(first.length)
    expect(again.every((e, i) => e === first[i])).toBe(true)
    // (page 4's parts hold no layout: it stays the original's, with no card)
    expect(marksOf(s, 4)).toBe(0)
    s.side.dropOthers()
    await settle(s, 3, false)
    expect(marksOf(s, 1)).toBe(0)
    s.side.take(other.map(id => rowOf(id)))
    await settle(s, 3, false)
    expect(marksOf(s, 1)).toBe(0)
    s.side.again()
    await settle(s, 3, false)
    expect(marksOf(s, 1)).toBeGreaterThan(0)
  })

  it('a paragraph that crosses into a page no part owns yet is marked there through its part\'s reach; none on a page the original shows turned', async () => {
    const m = await M()
    expect([m.readParts[0]?.pages, m.readParts[0]?.reach]).toEqual([[1, 1], 2])
    const s = await setup({ door: { rows: 'gate' } })
    await nearOn(s, [1, 2])
    // (only the first part, pages [1, 1] reaching page 2)
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [jobRef(m, 0)] })
    await settle(s, 10, false)
    expect(marksOf(s, 2)).toBeGreaterThan(0)
    // (the view turned a half: the rectangles in the page's frame would land opposite their paragraphs)
    const inner = internalsOf(s.view) as unknown as { places: { view: (n: number) => unknown } }
    const was = inner.places.view
    inner.places.view = (n: number) => (n === 2 ? { viewport: { rotation: 180 } } : was.call(inner.places, n))
    try {
      s.side.take([rowOf(unitsOn(m, 1)[0] as number)])
      await settle(s, 3, false)
      expect(marksOf(s, 2)).toBe(0)
      expect(marksOf(s, 1)).toBeGreaterThan(0)
    } finally {
      inner.places.view = was
    }
  })

  it('a page that fails shows the original with no mark', async () => {
    const s = await setup({ copyFails: [1] })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    expect(content(s, 1)).toBe('original')
    expect(marksOf(s, 1)).toBe(0)
  })
})
