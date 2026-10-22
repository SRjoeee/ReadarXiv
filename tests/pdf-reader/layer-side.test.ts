// The layer's side of the reading view (engine/view/layer-side.mjs; the shared reader view's contract §2.2-§2.7 and §3, rows
// L3-L16, C1-C6 and H1-H6 of its PR VC) against the fake door (helpers/fake-door.ts: the door's readiness protocol, nothing
// drawn), over the format test's small paper (helpers/format-paper.ts: four pages, three parts, the first two with a tail), on
// the reading view's PDF.js stand-ins and a clock moved by hand (helpers/reader-fakes.ts). The real door's rows are
// layer-side-door.test.ts's
import { describe, expect, it, vi } from 'vitest'
import { type Ref, writePart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { PDF_OPTIONS } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { createLayerSide, LEFT_RETRY_MS, noLayoutPage, PAGE_MS, SPREAD_MAX, spreadPages } from '@/pdf-reader/engine/view/layer-side.mjs'
import { type DocumentTask, internalsOf, type ViewEvent } from '@/pdf-reader/engine/view/reader-view.mjs'
import { made, N, partInputs, TAILS } from './helpers/format-paper'
import { ASSETS, clientOf, FakePDFPageView, FakePDFViewer, fakeDoc, fakeTask, flush } from './helpers/reader-fakes'
import { ALL, content, installSideFakes, jobRef, layerOf, M, macrotask, nearOn, places, rowOf, type Setup, settle, setup } from './helpers/side-setup'

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
  it('the place\'s size and the pane\'s scroll unchanged, no viewer document set, the copy from the left\'s canvas drawn at its k', async () => {
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
    // page 1's copy over the left's canvas at the scale PDF.js drew it at; page 2's, whose left page PDF.js has not drawn,
    // from elsewhere
    const copies = s.doors[0]?.copies ?? []
    expect(copies.find(c => c[0] === 1)?.slice(1)).toEqual([canvas, pv.viewport.scale])
    expect(copies.find(c => c[0] === 2)?.[1]).not.toBe(canvas)
    expect(content(s, 1)).toBe('layer')
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

describe('one frame a page: the copy at the scale its source was drawn at (docs/PDF-READER.md §11.8)', () => {
  /** the owner's fit, 87.25 %, at a pixel ratio of 2: the page 711.9999… CSS px wide, PDF.js's canvas floored to 1422 px */
  const FIT = 0.8725490196078431
  const pageView = (n: number) => leftViewer().getPageView(n - 1) as NonNullable<ReturnType<FakePDFViewer['getPageView']>>
  const copyOf = (s: Setup, n: number) => s.doors[0]?.copies.find(c => c[0] === n) as [number, HTMLCanvasElement, number] | undefined

  it('the copy from the left\'s canvas is drawn at the scale PDF.js drew it at, never its floored width over the page\'s', async () => {
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
    expect(one?.[1]).toBe(pageView(1).canvas)
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

  it('a canvas PDF.js drew at a restricted output scale near the place\'s k is a source, copied at the scale it drew', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const s = await setup()
    // at 353 % the place's k is held to COPY_PIXELS (5.883); PDF.js under a cap of its own drew at an output scale of 5/4 (a
    // fraction approximateFraction can give, its terms at most 8: 3600 px over 2880 across, 4655 over 3724 down), 5.883 device
    // pixels a unit. (With the viewer's detail canvas on, as by default, PDF.js draws a restricted base canvas at half or a
    // quarter of that, which no K_SLACK takes: this is the case with it off)
    s.view.zoomTo(3.53)
    await settle(s, 4)
    await nearOn(s, [1])
    leftViewer().render(1, null, { width: 3600, height: 4655, sx: 1.25, sy: 1.25 })
    s.side.tell(await ALL())
    await settle(s)
    const one = copyOf(s, 1)
    expect(one?.[1]).toBe(pageView(1).canvas)
    expect(one?.[2]).toBe(pageView(1).viewport.scale * 1.25)
    expect(one?.[2]).not.toBe(3600 / 612)
  })

  it('a canvas left as drawn through a zoom\'s steps is copied at the scale it was drawn at, not the page view\'s next', async () => {
    const s = await setup()
    // drawn at the fit, its page 711.99 CSS px floored to 711 (so neither 711 / 612 nor the page view's next scale is it)
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
    expect(one?.[1]).toBe(pv.canvas)
    expect(one?.[2]).toBe(drawnAt)
    expect(one?.[2]).not.toBe(711 / 612)
  })

  it('a drawing PDF.js lets finish after a zoom gave its page view the next viewport is kept at the scale it was begun at', async () => {
    const s = await setup()
    s.view.zoomTo(FIT)
    await settle(s, 4)
    await nearOn(s, [1])
    const pv = pageView(1), begun = pv.viewport.scale
    leftViewer().startRender(1, { width: 711, height: 921, sx: 1, sy: 1 })
    // a zoom to 87.5 % while it draws (as under PDF.js's restricted scaling, which lets the drawing run on): the page view's
    // next viewport is 714 × 924 CSS px, the old canvas's 711 × 921 within the 8 px of PDF.js's rounding both ways
    s.view.zoomTo(0.875)
    await flush()
    expect(pv.viewport.scale).not.toBe(begun)
    leftViewer().finishRender(1)
    s.side.tell(await ALL())
    await settle(s)
    const one = copyOf(s, 1)
    expect(one?.[1]).toBe(pv.canvas)
    expect(one?.[2]).toBe(begun)
    expect(one?.[2]).not.toBe(pv.viewport.scale)
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
  it('a laid page far from the view lets its element and its copy go; back in view it is asked again and drawn the same', async () => {
    const s = await setup()
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
  it('one composed task a tail, opened with the view\'s assets, PDF_OPTIONS and disableAutoFetch, the tails told so far', async () => {
    const s = await setup()
    s.side.tell(await ALL())
    await settle(s)
    // the open over the parts read then (a units fetch first, the parts later: here, all of them), or the parts one by one
    expect(s.composed.length).toBeGreaterThanOrEqual(1)
    expect(s.composed.length).toBeLessThanOrEqual(3)
    for (const c of s.composed) expect(c.options).toEqual({ ...ASSETS, ...PDF_OPTIONS, disableAutoFetch: true })
    const lens = s.composed.map(c => c.tail?.length ?? 0)
    expect(new Set(lens).size).toBe(lens.length)
    expect(lens.at(-1)).toBe(TAILS[0]!.tail.length + TAILS[1]!.tail.length)
    const whole = s.composed.at(-1)?.tail as Uint8Array
    expect([...whole.subarray(0, TAILS[0]!.tail.length)]).toEqual([...TAILS[0]!.tail])
    expect(s.door.layer?.stats().parts).toEqual({ through: 4, told: 3 })
  })

  it('each composed task is destroyed once no door reads it, or at dispose: none twice, none left; again() reuses the latest', async () => {
    const s = await setup()
    const m = await M()
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref) })
    await settle(s)
    s.side.tell({ parts: [jobRef(m, 0)] })
    await settle(s)
    s.side.tell({ parts: [jobRef(m, 1), jobRef(m, 2)], end: { through: N } })
    await settle(s)
    expect(s.composed.length).toBe(3)
    // the first two let go as the door moved past them
    expect(s.destroyed.sort()).toEqual(['destroy composed 0', 'destroy composed 1'])
    const opens = s.opens
    s.side.again()
    await settle(s)
    expect(s.opens).toBe(opens + 1)
    expect(s.composed.length).toBe(3)
    expect(s.destroyed.length).toBe(2)
    s.side.dispose()
    await flush(10)
    expect(s.destroyed.sort()).toEqual(['destroy composed 0', 'destroy composed 1', 'destroy composed 2'])
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
  /** a side over the same paper whose head says arXiv's PDF (the writer's, with the why our compile was refused, or none) */
  const arxivSetup = () => setup()
  /** the left page 1 drawn by PDF.js, so that a copy taken from its canvas is possible */
  const leftDrawn = () => {
    // (the last viewer made: a row may set up more than one view)
    const viewer = FakePDFViewer.made.at(-1) as FakePDFViewer
    const pv = viewer.getPageView(0) as NonNullable<ReturnType<FakePDFViewer['getPageView']>>
    viewer.render(1, null, { width: Math.floor(pv.viewport.width), height: Math.floor(pv.viewport.height), sx: 1, sy: 1 })
    return pv.canvas as HTMLCanvasElement
  }
  const spies = (s: Setup) => { const V = internalsOf(s.view); return { left: vi.spyOn(V.left, 'canvas'), place: vi.spyOn(V.places, 'canvas') } }
  const copyOf = (s: Setup, n: number) => s.doors[0]?.copies.filter(c => c[0] === n) ?? []

  it('the copy of a page is drawn from the composed document, and the left\'s canvas and the place\'s (the original\'s page view) are never asked, at the commit or after a zoom', async () => {
    const s = await oursSetup()
    const asked = spies(s)
    await nearOn(s, [1, 2])
    const canvas = leftDrawn()
    s.side.tell(await ALL(true))
    await settle(s)
    // (the engine\'s head of a layer over our compile, with the arXiv PDF its check ran over)
    expect((await s.side.index())?.head).toMatchObject({ base: { source: 'ours', check: { boxes: 'equal' } }, orig: { bytes: 12_000 } })
    expect(content(s, 1)).toBe('layer')
    expect(copyOf(s, 1)).toHaveLength(1)
    expect(copyOf(s, 1)[0]?.[1]).not.toBe(canvas)
    s.view.zoomTo(0.9)
    await settle(s, 60)
    expect(copyOf(s, 1).length).toBeGreaterThan(1)
    for (const c of copyOf(s, 1)) expect(c[1], 'the left\'s canvas is no source of ours').not.toBe(canvas)
    expect(asked.left).not.toHaveBeenCalled()
    expect(asked.place).not.toHaveBeenCalled()
  })

  it('a head over arXiv\'s PDF (the writer\'s `arxiv`, which a bundle of 7 reads as too) takes the copy as before: from the left\'s canvas where PDF.js drew the page', async () => {
    const s = await arxivSetup()
    const asked = spies(s)
    await nearOn(s, [1, 2])
    const canvas = leftDrawn()
    s.side.tell(await ALL())
    await settle(s)
    expect((await s.side.index())?.head.base).toMatchObject({ source: 'arxiv' })
    expect(copyOf(s, 1)[0]?.[1]).toBe(canvas)
    expect(asked.left).toHaveBeenCalled()
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
    const t = await setup()
    await nearOn(t, [4])
    t.side.tell(await ALL())
    await settle(t)
    expect(content(t, 4)).toBe('layer')
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

  it('a part that gains no layout mid-run (a fork told after its pages were laid): its pages come back as the original\'s, the pages of the others stay the layer\'s', async () => {
    const m = await M(true)
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const refused = await writePart({ ...input, prev: m.parts[0]!.sha256, layout: { refused: 'carry', why: 'the test' }, fileOnly: [], addon: null })
    const s = await oursSetup({ extra: [refused] })
    await nearOn(s, [1, 2, 3])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(m, i)) })
    s.side.take([rowOf(2)])
    await settle(s)
    for (const n of [1, 2, 3]) expect(content(s, n), `page ${n}`).toBe('layer')
    s.side.tell({ parts: [{ ...(refused.ref as Ref), prev: m.parts[0]!.sha256 }] })
    await settle(s)
    expect(s.side.probe().forks).toBe(1)
    expect(content(s, 1)).toBe('layer')
    for (const n of [2, 3]) {
      expect(content(s, n), `page ${n}`).toBe('original')
      expect(layerOf(s, n), `page ${n}`).toBeNull()
    }
  })

  it('noLayoutPage: a page is the original\'s only when some part holds it and every part that holds it has no layout', () => {
    const part = (a: number, b: number, layout: unknown) => ({ pages: [a, b], layout }) as never
    const rows = {}
    // (a unit running on from the page before can put one page in two parts\' ranges)
    expect(noLayoutPage([part(1, 2, rows), part(2, 3, null)], 2)).toBe(false)
    expect(noLayoutPage([part(1, 2, null), part(2, 3, null)], 2)).toBe(true)
    expect(noLayoutPage([part(1, 2, null), part(2, 3, rows)], 3)).toBe(false)
    expect(noLayoutPage([part(1, 2, null), part(3, 4, rows)], 2)).toBe(true)
    // no part holds the page yet (its part not told): not the original\'s by this rule, the door waits for it
    expect(noLayoutPage([part(1, 2, null)], 3)).toBe(false)
    expect(noLayoutPage([], 1)).toBe(false)
  })
})

describe('L15: a fork', () => {
  it('a different part at a page told opens the door again over the new chain', async () => {
    const m = await M()
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, addon: { ...input.addon!, manifest: { ...input.addon!.manifest, stats: { removed: 9 } } } })
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
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, addon: { ...input.addon!, manifest: { ...input.addon!.manifest, stats: { removed: 9 } } } })
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
    expect(content(b, 4)).toBe('layer')
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
    const s = await setup({ composedFailAt: [2] })
    await nearOn(s, [1])
    // the door opened over no part (the original alone), then part 1's tail: the third composed document fails
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref) })
    await settle(s)
    s.side.tell({ parts: [jobRef(m, 0)] })
    await settle(s)
    expect(content(s, 1)).toBe('layer')
    await want(s, 1)
    expect(s.side.probe().shapesLaid).toBe(1)
    // the next part's tail: its composed document does not open
    s.side.tell({ parts: [jobRef(m, 1)] })
    await settle(s)
    expect(s.side.probe()).toMatchObject({ state: 'refused', why: 'composed', shapesLaid: 0 })
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
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, addon: { ...input.addon!, manifest: { ...input.addon!.manifest, stats: { removed: 9 } } } })
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
    const s = await setup({ composedFailAt: [2] })
    await nearOn(s, [1])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref) })
    await settle(s)
    s.side.tell({ parts: [jobRef(m, 0)] })
    await settle(s)
    s.hold.add(m.lefts[1]!.sha256)
    await want(s, 1)
    const signal = s.signals.get(m.lefts[1]!.sha256)
    expect(signal?.aborted).toBe(false)
    s.side.tell({ parts: [jobRef(m, 1)] })
    await settle(s)
    expect(s.side.probe().state).toBe('refused')
    expect(signal?.aborted).toBe(true)
  })

  it('a fork lets a page\'s failed left part be asked again at once, from the new door (4289061968)', async () => {
    const m = await M()
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, addon: { ...input.addon!, manifest: { ...input.addon!.manifest, stats: { removed: 9 } } } })
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
    const s = await setup({ copyFails: (d, n, before) => d === 0 && n === 1 && before === 1 })
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
    const s = await setup({ copyFails: (d, n, before) => d === 0 && n === 1 && before === 1 })
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
