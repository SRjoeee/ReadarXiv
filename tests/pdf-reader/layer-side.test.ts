// The layer's side of the reading view (engine/view/layer-side.mjs; the shared reader view's contract §2.2-§2.7 and §3, rows
// L3-L16, C1-C6 and H1-H6 of its PR VC) against the fake door (helpers/fake-door.ts: the door's readiness protocol, nothing
// drawn), over the format test's small paper (helpers/format-paper.ts: four pages, three parts, the first two with a tail), on
// the reading view's PDF.js stand-ins and a clock moved by hand (helpers/reader-fakes.ts). The real door's rows are
// layer-side-door.test.ts's
import { describe, expect, it, vi } from 'vitest'
import { type Ref, writePart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { PDF_OPTIONS } from '@/pdf-reader/engine/layer-proto/run.mjs'
import { createLayerSide, PAGE_MS } from '@/pdf-reader/engine/view/layer-side.mjs'
import type { DocumentTask, ViewEvent } from '@/pdf-reader/engine/view/reader-view.mjs'
import { N, partInputs, TAILS } from './helpers/format-paper'
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
    // the left's page 1 drawn at the place's k (its page box's CSS px a unit times the pixel ratio)
    leftViewer().render(1)
    const pv = leftViewer().getPageView(0) as NonNullable<ReturnType<FakePDFViewer['getPageView']>>
    const canvas = pv.canvas as HTMLCanvasElement
    canvas.width = Math.round(612 * pv.viewport.scale)
    canvas.height = Math.round(792 * pv.viewport.scale)
    s.side.tell(await ALL())
    await settle(s)
    expect([box(1), box(2)]).toEqual(before)
    expect(s.panes.right.scrollTop).toBe(scrolled)
    expect(leftViewer().log.filter(l => l.startsWith('setDocument')).length).toBe(docs)
    // page 1's copy over the left's canvas at its own k; page 2's, whose left page PDF.js has not drawn, from elsewhere
    const copies = s.doors[0]?.copies ?? []
    expect(copies.find(c => c[0] === 1)?.slice(1)).toEqual([canvas, canvas.width / 612])
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
  it('H2 (trap 2): nothing is fetched of the left before a want; the first move over the right fetches the page\'s left part once', async () => {
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
    expect(s.fetched.filter(x => lefts.includes(x))).toEqual([m.lefts[1]!.sha256])
    expect(s.side.probe().leftParts).toBe(1)
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
