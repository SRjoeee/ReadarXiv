// The layer side over the REAL door (layer-proto/reader.mjs openLayer; the shared reader view's contract §2.4 and the VC brief's
// facts (a)-(g)), over the format test's small paper and the composed documents of the door's own tests (parts-paper.ts docsOf:
// each unit's lines in a text layer; nothing drawn), its rows the engine's own (rowsOfIndex): a page lays once the parts covering
// its closure are in; a terminal failure fails every page not ready, once; a page whose own drawing fails is stepped over, its
// units the original's; a ready page answers a fresh LaidPage each call; every composed document is told retired and destroyed
// once; one open layer a page, so that again() and a fork dispose before they open. Rows L1 (text as text) and L2 (served faces
// only) on the side's pane
import { describe, expect, it, vi } from 'vitest'
import type { LayerDocument } from '@/pdf-reader/engine/layer-proto/reader.mjs'
import type { Row } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { type Made, N } from './helpers/format-paper'
import { cutSpec, docsOf, type PaperSpec, rowsOfIndex } from './helpers/parts-paper'
import { ALL, content, installSideFakes, jobRef, layerOf, M, macrotask, nearOn, type Options, type Setup, settle, setup } from './helpers/side-setup'

// a canvas context that draws nothing and reads a white page, made before layer2.mjs loads (it measures with a canvas of its own
// made then): an em a CJK character, half one any other (layer-door.test.ts's)
vi.hoisted(() => {
  const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[　-鿿]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px } }
      if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) })
      if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
      if (k === 'canvas') return canvas
      return () => {}
    },
    set(t, k, v) { t[k] = v; return true },
  })
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  g.fetch = async () => ({ ok: false, json: async () => null })
})

installSideFakes()
const served = async (id: string) => [{ url: `/f/${id}.otf`, ranges: [0, 0x10ffff] }]
/** the format test's paper's text layer, from its left's rectangles (layer-door.test.ts's) */
const textOf = (m: Made) => ({ pages: 4, units: m.index.units.map((_, id) => ({ text: `unit ${id}`, lines: m.readParts.flatMap(p => p.left.filter(w => w[0] === id).flatMap(w => w[2].map(r => [r[0], r[1], r[3], r[2] + 2.15]))) })) })
/** the side over the real door; `fail`: the composed pages that cannot be read */
async function real(o: Options & { fail?: number[] } = {}) {
  const m = await M()
  const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
  const docFor = docsOf(textOf(m), { fail: () => o.fail ?? [] }) as unknown as (r: number) => LayerDocument
  return setup({ faceSources: served, ...o, real: { openLayer, docFor } })
}
/** the real door's drive runs on its own tasks: until the side's probe and the door's states stand still */
async function still(s: Setup, max = 400) {
  let last = '', same = 0
  for (let i = 0; i < max && same < 20; i++) {
    await settle(s, 1)
    let states = ''
    try { const l = s.layer(); for (let p = 1; p <= N; p++) states += l ? l.pageState(p)[0] : '-' } catch { states = 'x' }
    const now = `${states}|${JSON.stringify(s.side.probe())}|${JSON.stringify(s.layer()?.stats().pages)}`
    same = now === last ? same + 1 : 0
    last = now
  }
}

describe('the real door: (a) a page lays once the parts covering its closure are in', () => {
  it('page 1 waits for part 2 (a unit runs onto page 2), showing the original; then it is laid in place', async () => {
    const m = await M()
    const s = await real()
    await nearOn(s, [1])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [jobRef(m, 0)] })
    s.side.take(rowsOfIndex(m.index))
    await still(s)
    expect(s.layer()?.pageState(1)).toBe('waiting')
    expect(content(s, 1)).toBe('original')
    s.side.tell({ parts: [jobRef(m, 1)] })
    await still(s)
    expect(s.layer()?.pageState(1)).toBe('ready')
    expect(content(s, 1)).toBe('layer')
    expect(layerOf(s, 1)?.querySelector('svg')?.getAttribute('lang')).toBe('zh')
  })
})

describe('the real door: (b) a terminal failure', () => {
  it('page 1 that cannot be drawn fails every page not ready, once; the places show the original; asking again rejects at once', async () => {
    const m = await M()
    const s = await real({ fail: [1] })
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    s.side.take(rowsOfIndex(m.index))
    s.side.end()
    await still(s)
    for (let p = 1; p <= N; p++) expect(s.layer()?.pageState(p), `page ${p}`).toBe('failed')
    expect(s.side.coverage().failed).toBe(N)
    expect(content(s, 1)).toBe('original')
    expect(content(s, 2)).toBe('original')
    await nearOn(s, [2], false)
    await nearOn(s, [2])
    await still(s)
    expect(s.side.coverage().failed).toBe(N)
    expect(content(s, 2)).toBe('original')
    expect(s.side.probe().state).toBe('open')
  })
})

describe('the real door: (c) a page stepped over', () => {
  it('a later page whose composed page cannot be read fails alone and shows the original; the pages around it are laid', async () => {
    const m = await M()
    const s = await real({ fail: [3] })
    await nearOn(s, [2, 3, 4])
    s.side.tell(await ALL())
    s.side.take(rowsOfIndex(m.index))
    s.side.end()
    await still(s)
    expect([1, 2, 3, 4].map(p => s.layer()?.pageState(p))).toEqual(['ready', 'ready', 'failed', 'ready'])
    for (const p of [2, 4]) expect(content(s, p), `page ${p}`).toBe('layer')
    expect(content(s, 3)).toBe('original')
    expect(s.side.coverage()).toMatchObject({ laid: 3, failed: 1, total: N })
  })
})

describe('the real door: (d) a fresh LaidPage each call, and L1 text as text', () => {
  it('a page let go and asked again is drawn anew, its markup equal; a translation of markup is text, a control character no element', async () => {
    const m = await M()
    const s = await real()
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    const rows = rowsOfIndex(m.index).map(r => (r[0] === 0 ? ([0, ['<img src=x onerror=alert(1)>'], r[2], r[3], r[4]] as Row) : r[0] === 2 ? ([2, ['a \u202e b'], r[2], r[3], r[4]] as Row) : r))
    s.side.take(rows)
    s.side.end()
    await still(s)
    expect(content(s, 1)).toBe('layer')
    const svg = layerOf(s, 1)?.querySelector('svg') as SVGSVGElement
    const tags = new Set([...svg.querySelectorAll('*')].map(e => e.localName))
    expect([...tags].filter(t => !['g', 'text', 'tspan', 'path', 'rect', 'defs', 'clipPath', 'use', 'image', 'line'].includes(t))).toEqual([])
    expect(svg.querySelector('img, script, foreignObject, a')).toBeNull()
    expect(document.querySelector('img[src="x"]')).toBeNull()
    // the markup drawn as its text; the row with a bidirectional control is no unit's (rows.mjs inBound): its unit the original's
    expect(svg.textContent).toContain('<img src=x onerror=alert(1)>')
    const words = (await s.layer()?.pageOf(1, { lang: 'zh' }))?.words
    expect(words?.spans.map(x => x[0])).toEqual([0])
    expect(words?.original).toEqual([2])
    const html = svg.outerHTML
    await nearOn(s, [1], false)
    expect(svg.isConnected).toBe(false)
    await nearOn(s, [1])
    await still(s)
    const again = layerOf(s, 1)?.querySelector('svg') as SVGSVGElement
    expect(again).not.toBe(svg)
    expect(again.outerHTML).toBe(html)
  })
})

describe('the real door: L2 served faces only', () => {
  it('no face served: every unit stays the original\'s, its tokens the left\'s copies on the right; no face rule in the pane', async () => {
    const m = await M()
    const s = await real({ faceSources: async () => null })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take(rowsOfIndex(m.index))
    s.side.end()
    await still(s)
    expect(content(s, 1)).toBe('layer')
    const svg = layerOf(s, 1)?.querySelector('svg') as SVGSVGElement
    expect(svg.querySelectorAll('tspan').length).toBe(0)
    const sheets = [...document.querySelectorAll('style')].map(x => x.textContent ?? '').join('\n')
    expect(sheets).not.toMatch(/@font-face|local\(/)
  })
})

describe('the real door: (g) parts with no add-on', () => {
  /** three pages, a paragraph running on to page 2 and a paragraph a page: the door test's paper's shape */
  const para = (text: string, page: number, b: number, stream: number) => ({ kind: 'para', text, lines: [[page, 20, 280, b]] as [number, number, number, number][], file: true, stream })
  const SPEC: PaperSpec = { pages: 3, units: [para('First paragraph', 1, 260, 0), { ...para('Running on', 1, 40, 5), lines: [[1, 20, 280, 40], [2, 20, 280, 270]] }, para('Second page', 2, 120, 30), para('Third page', 3, 220, 60)] }

  it('a cutter with no add-on: one composed document, the original alone; each part added with no document, every page laid', async () => {
    const { cut, index } = await cutSpec(SPEC, [1, 2], { addon: false })
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const s = await setup({ faceSources: served, paper: { objects: [...cut.units, cut.head, ...cut.parts, ...cut.left], pages: 3 }, real: { openLayer, docFor: docsOf(SPEC) as unknown as (r: number) => LayerDocument } })
    await nearOn(s, [1, 2, 3])
    s.side.tell({ head: cut.head.ref, units: cut.units.map(u => u.ref), parts: cut.parts.map((p, i) => ({ ...p.ref, prev: i ? cut.parts[i - 1]!.sha256 : null })), end: cut.end })
    s.side.take(rowsOfIndex(index))
    s.side.end()
    await still(s)
    expect(cut.parts.length).toBe(3)
    expect(s.composed.map(c => c.tail)).toEqual([null])
    for (const p of [1, 2, 3]) expect(content(s, p), `page ${p}`).toBe('layer')
    expect(s.side.probe()).toMatchObject({ parts: 3, ended: true })
  })
})

describe('the real door: (e) documents, (f) one open layer a page', () => {
  it('each composed document told retired is destroyed once, the last at dispose; again() and a fork dispose before they open', async () => {
    const m = await M()
    const s = await real()
    await nearOn(s, [1])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref) })
    await still(s)
    s.side.tell({ parts: [jobRef(m, 0)] })
    await still(s)
    s.side.tell({ parts: [jobRef(m, 1), jobRef(m, 2)], end: { through: N } })
    s.side.take(rowsOfIndex(m.index))
    await still(s)
    expect(s.composed.length).toBe(3)
    expect(s.destroyed.sort()).toEqual(['destroy composed 0', 'destroy composed 1'])
    expect(content(s, 1)).toBe('layer')
    // again: the door disposed, then opened over the latest document (no throw of a second open); the rows taken again
    s.side.again()
    await still(s)
    expect(s.opens).toBe(2)
    expect(s.side.probe().state).toBe('open')
    s.side.take(rowsOfIndex(m.index))
    s.side.end()
    await still(s)
    expect(s.composed.length).toBe(3)
    expect(content(s, 1)).toBe('layer')
    expect(s.doors[1]?.layer.pageState(1)).toBe('ready')
    s.side.dispose()
    await macrotask()
    await macrotask()
    expect(s.destroyed.sort()).toEqual(['destroy composed 0', 'destroy composed 1', 'destroy composed 2'])
  })
})
