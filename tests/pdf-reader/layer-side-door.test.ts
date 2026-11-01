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
import { ALL, content, installSideFakes, jobRef, layerOf, M, macrotask, nearOn, type Options, places, type Setup, settle, setup } from './helpers/side-setup'

// a canvas context that draws nothing and reads a white page, made before layer2.mjs loads (it measures with a canvas of its own
// made then): an em a CJK character, half one any other (layer-door.test.ts's)
vi.hoisted(() => {
  const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px } }
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
/** the format test's paper's text layer, from its left's rectangles (layer-door.test.ts's); each unit's text 400 pt wide at most,
 *  so that its first character stands inside the segment of the paragraph's formula (the layer reads a placeholder's rendering
 *  from the page's characters inside its segment in the layout file) */
const textOf = (m: Made) => ({ pages: 4, units: m.index.units.map((_, id) => ({ text: `unit ${id}`, lines: m.readParts.flatMap(p => p.left.filter(w => w[0] === id).flatMap(w => w[2].map(r => [r[0], r[1], Math.min(r[3], r[1] + 400), r[2] + 2.15]))) })) })
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

describe('the real door: L3, what comes in parts gives the pages one take gives', () => {
  it('parts told out of order from a job and the catalog, rows in pieces: every page drawn as when all is told at once', async () => {
    const m = await M()
    const rows = rowsOfIndex(m.index)
    /** each page's drawing on the right, as its place holds it */
    const drawn = (s: Setup) => [1, 2, 3, 4].map(n => layerOf(s, n)?.querySelector('svg')?.outerHTML ?? null)
    const a = await real()
    await nearOn(a, [1, 2, 3, 4])
    a.side.tell(await ALL())
    a.side.take(rows)
    a.side.end()
    await still(a)
    const whole = drawn(a)
    // (pages 1 to 3 are drawn; page 4 is its third part\'s, which records no layout: the original\'s page, nothing of the layer in its place)
    expect(whole.slice(0, 3).every(x => x !== null)).toBe(true)
    expect(whole[3]).toBeNull()
    a.view.dispose()
    const b = await real()
    await nearOn(b, [1, 2, 3, 4])
    b.side.tell({ parts: [jobRef(m, 2)] })
    b.side.take(rows.slice(4))
    b.side.tell({ head: m.head.ref })
    await still(b)
    b.side.tell({ units: m.chunks.map(c => c.ref), parts: [m.parts[1]!.ref as never, jobRef(m, 2)] })
    b.side.take(rows.slice(0, 2))
    await still(b)
    b.side.tell({ parts: [jobRef(m, 0)], end: { through: N } })
    b.side.take(rows.slice(2, 4))
    b.side.end()
    await still(b)
    expect(drawn(b)).toEqual(whole)
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
    await nearOn(s, [1, 2, 3, 4])
    s.side.tell(await ALL())
    s.side.take(rowsOfIndex(m.index))
    s.side.end()
    await still(s)
    // (page 4 is its third part\'s, which records no layout: never asked of the door, the original\'s page)
    expect([1, 2, 3].map(p => s.layer()?.pageState(p))).toEqual(['ready', 'ready', 'failed'])
    for (const p of [1, 2]) expect(content(s, p), `page ${p}`).toBe('layer')
    expect(content(s, 3)).toBe('original')
    expect(content(s, 4)).toBe('original')
    expect(layerOf(s, 4)).toBeNull()
    expect(s.side.coverage()).toMatchObject({ laid: 2, failed: 1, total: N })
  })
})

describe('the real door: (d) a fresh LaidPage each call, and L1 text as text', () => {
  it('a page let go and asked again is drawn anew, its markup equal; a translation of markup is text, a control character no element', async () => {
    const m = await M()
    // (no drawing kept off the view: a page let go is asked of the door again as it comes near)
    const s = await real({ keepPixels: 0 })
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
    // (unit 0 painted; unit 2 shown as the original, by its own boxes: words.mjs addBoxWords)
    expect(words?.spans.map(x => x[0])).toEqual([0, 2])
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
  it('no face served: every unit stays the original\'s, so the page draws nothing of its own and shows arXiv\'s page (no SVG of the layer); no face rule in the pane', async () => {
    const m = await M()
    const s = await real({ faceSources: async () => null })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take(rowsOfIndex(m.index))
    s.side.end()
    await still(s)
    expect(s.layer()?.pageState(1)).toBe('ready')
    expect(content(s, 1)).toBe('original')
    expect(layerOf(s, 1)).toBeNull()
    const sheets = [...document.querySelectorAll('style')].map(x => x.textContent ?? '').join('\n')
    expect(sheets).not.toMatch(/@font-face|local\(/)
  })
})

describe('the real door: (g) parts with no add-on', () => {
  /** three pages, a paragraph running on to page 2 and a paragraph a page: the door test's paper's shape */
  const para = (text: string, page: number, b: number, stream: number) => ({ kind: 'para', text, lines: [[page, 20, 280, b]] as [number, number, number, number][], file: true, stream })
  const SPEC: PaperSpec = { pages: 3, units: [para('First paragraph', 1, 260, 0), { ...para('Running on', 1, 40, 5), lines: [[1, 20, 280, 40], [2, 20, 280, 270]] }, para('Second page', 2, 120, 30), para('Third page', 3, 220, 60)] }

  it('a cutter with no add-on: one composed document, the original alone; each part added with no document, every page laid', async () => {
    const { cut, index } = await cutSpec(SPEC, [1, 2])
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

describe('the real door: target-first laying (1b-D1, #380)', () => {
  /** eight pages, a paragraph each, no unit over a break: a page's closure is page 1 drawn and the page itself */
  const para = (text: string, page: number, b: number, stream: number) => ({ kind: 'para', text, lines: [[page, 20, 280, b]] as [number, number, number, number][], file: true, stream })
  const SPEC: PaperSpec = { pages: 8, units: Array.from({ length: 8 }, (_, i) => para(`Paragraph of page ${i + 1}`, i + 1, 200, 20 * i)) }
  async function eight() {
    const { cut, index } = await cutSpec(SPEC, undefined)
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const s = await setup({ faceSources: served, paper: { objects: [...cut.units, cut.head, ...cut.parts, ...cut.left], pages: 8 }, real: { openLayer, docFor: docsOf(SPEC) as unknown as (r: number) => LayerDocument } })
    const refs = { head: cut.head.ref, units: cut.units.map(u => u.ref), parts: cut.parts.map((p, i) => ({ ...p.ref, prev: i ? cut.parts[i - 1]!.sha256 : null })), end: cut.end }
    return { s, index, refs }
  }

  it('a jump to a far page lays its closure, not the pages before it; the side names what it waits for (rowsFor)', async () => {
    const { s, index, refs } = await eight()
    await nearOn(s, [6])
    s.side.tell(refs)
    await still(s)
    // no row yet: page 6's closure waits for its units' rows, which the side names
    const waits = s.side.rowsFor(6)
    expect(waits.length).toBeGreaterThan(0)
    expect(waits).toEqual(s.layer()?.rowsFor(6))
    expect(content(s, 6)).toBe('original')
    s.side.take(rowsOfIndex(index))
    s.side.end()
    await still(s)
    expect(content(s, 6)).toBe('layer')
    expect(s.side.rowsFor(6)).toEqual([])
    // (pages 2 to 5 were not laid on the way: target-first, not 1..6)
    for (const p of [2, 3, 4, 5]) expect(s.layer()?.pageState(p), `page ${p}`).toBe('waiting')
    expect(s.side.rowsFor(99)).toEqual([])
  })

  it('a jump: the page in the middle of the view is laid first, then the one after it, then the one before (its near pages asked farthest first, it last)', async () => {
    const { s, index, refs } = await eight()
    s.side.tell(refs)
    s.side.take(rowsOfIndex(index))
    s.side.end()
    await still(s)
    // the right pane put with page 6 in the middle of its view, as a jump there leaves it
    const page = (n: number) => s.panes.right.querySelectorAll<HTMLElement>(':scope > .pdfViewer > .page')[n - 1] as HTMLElement
    s.panes.right.scrollTop = page(6).offsetTop + page(6).offsetHeight / 2 - s.panes.right.clientHeight / 2
    await macrotask()
    const laid: number[] = []
    s.layer()?.onPage((p, st) => { if (st === 'ready') laid.push(p) })
    await nearOn(s, [5, 6, 7])
    await still(s)
    expect(laid.slice(0, 3)).toEqual([6, 7, 5])
    for (const n of [5, 6, 7]) expect(content(s, n), `page ${n}`).toBe('layer')
  })

  it('a fast scroll: asks made and let go leave no ask and no place in between, the page reached laid; an ask let go is dropped', async () => {
    const { s, index, refs } = await eight()
    s.side.tell(refs)
    s.side.take(rowsOfIndex(index))
    s.side.end()
    await still(s)
    // pages passed over in one burst, each near then far before the drive reaches it, the scroll ending at page 8
    for (const p of [2, 3, 4, 5, 6, 7]) { await nearOn(s, [p]); await nearOn(s, [p], false) }
    await nearOn(s, [8])
    await still(s)
    expect(content(s, 8)).toBe('layer')
    expect(s.side.probe().asking).toBe(0)
    const states = [2, 3, 4, 5, 6, 7].map(p => s.layer()?.pageState(p))
    // every page passed over is either laid (taken before its ask went, so retired: nothing shown far away) or left waiting
    for (const [i, st] of states.entries()) {
      expect(['ready', 'waiting'], `page ${i + 2}`).toContain(st)
      expect(content(s, i + 2), `page ${i + 2}`).toBe('none')
    }
    expect(states.filter(x => x === 'waiting').length).toBeGreaterThan(0)
    // and one of them asked again: laid now
    const left = [2, 3, 4, 5, 6, 7].find((_, i) => states[i] === 'waiting') as number
    await nearOn(s, [left])
    await still(s)
    expect(content(s, left)).toBe('layer')
  })
})

describe('the real door: a fork, and L8', () => {
  it('a fork on the real door: the door disposed before the new one opens over the new chain, its rows carried, its page laid; nothing left after dispose', async () => {
    const m = await M()
    const { partInputs } = await import('./helpers/format-paper')
    const { writePart } = await import('@/pdf-reader/engine/layer-proto/format.mjs')
    const input = partInputs(m.head.sha256, m.lefts)[1]!
    const other = await writePart({ ...input, prev: m.parts[0]!.sha256, rules: { 2: [72, 501, 540, 501.4] } })
    const sheets = () => document.querySelectorAll('style, link[rel="stylesheet"]').length + (document.adoptedStyleSheets?.length ?? 0)
    const before = sheets()
    const s = await real({ extra: [other] })
    await nearOn(s, [1, 2])
    s.side.tell({ head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(m, i)) })
    s.side.take(rowsOfIndex(m.index))
    await still(s)
    expect(content(s, 1)).toBe('layer')
    s.side.tell({ parts: [{ ...(other.ref as never as object), prev: m.parts[0]!.sha256 } as never] })
    await still(s)
    expect(s.opens).toBe(2)
    expect(s.side.probe()).toMatchObject({ state: 'open', forks: 1 })
    expect(s.warned().filter(w => w.includes('open'))).toEqual([])
    // the first door let go, the second over the new chain (page 4's part followed the part let go: not added)
    expect(() => s.doors[0]?.layer.pageState(1)).toThrow()
    expect(s.doors[1]?.layer.stats().parts).toEqual({ through: 3, told: 2 })
    expect(s.doors[1]?.taken.length).toBe(rowsOfIndex(m.index).length)
    expect(s.doors[1]?.layer.pageState(1)).toBe('ready')
    expect(content(s, 1)).toBe('layer')
    s.side.dispose()
    await macrotask()
    await macrotask()
    // L8: every composed document destroyed, no copy and no sheet left
    expect(s.destroyed.length).toBe(s.composed.length)
    expect(s.panes.right.querySelectorAll('.axt-layer, canvas.axt-layer-copy').length).toBe(0)
    expect(sheets()).toBe(before)
  })
})

describe('the real door: (e) documents, (f) one open layer a page', () => {
  it('one composed document a head, opened once whatever the parts and destroyed once, at dispose; again() disposes before it opens', async () => {
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
    expect(s.composed.length).toBe(1)
    expect(s.destroyed).toEqual([])
    expect(content(s, 1)).toBe('layer')
    // again: the door disposed, then opened over the same document (no throw of a second open); the rows taken again
    s.side.again()
    await still(s)
    expect(s.opens).toBe(2)
    expect(s.side.probe().state).toBe('open')
    s.side.take(rowsOfIndex(m.index))
    s.side.end()
    await still(s)
    expect(s.composed.length).toBe(1)
    expect(content(s, 1)).toBe('layer')
    expect(s.doors[1]?.layer.pageState(1)).toBe('ready')
    s.side.dispose()
    await macrotask()
    await macrotask()
    expect(s.destroyed).toEqual(['destroy composed 0'])
  })
})

describe('the real door: the laid page\'s links (3b)', () => {
  it('the engine\'s records over the place: one link each in the records\' reading order, named by them as text, a glyphless one by the placeholder; followed on the left\'s document', async () => {
    const { LINK_NAME_PLACEHOLDER, linkRecords } = await import('@/pdf-reader/engine/view/links.mjs')
    const m = await M()
    const s = await real()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take(rowsOfIndex(m.index))
    s.side.end()
    await still(s)
    expect(content(s, 1)).toBe('layer')
    const laid = await (s.layer() as NonNullable<ReturnType<Setup['layer']>>).pageOf(1, { lang: 'zh' })
    const records = linkRecords(laid.links)
    // the paper's page 1 carries a citation link a unit, moved over the drawing, and the margin's link in place with no glyph
    expect(records.some(r => r.dest !== undefined)).toBe(true)
    expect(records.some(r => r.url !== undefined && r.name === '')).toBe(true)
    const a = [...(layerOf(s, 1)?.querySelectorAll<HTMLAnchorElement>('.axt-links > a.axt-link') ?? [])]
    expect(a.length).toBe(records.length)
    expect(a.map(x => x.getAttribute('aria-label'))).toEqual(records.map(r => r.name || (r.url !== undefined ? LINK_NAME_PLACEHOLDER.external : LINK_NAME_PLACEHOLDER.internal)))
    expect(a.map(x => x.getAttribute('href'))).toEqual(records.map(r => r.url ?? `#${encodeURIComponent(r.dest as string)}`))
    expect(a.every(x => x.querySelectorAll(':scope > span.axt-link-box').length >= 1 && x.textContent === '')).toBe(true)
    // a citation followed: its name looked up on the left's document, never the layer's
    const left = (await s.original?.promise) as unknown as { getDestination: (n: string) => Promise<unknown[] | null> }
    const asked: string[] = []
    left.getDestination = async n => { asked.push(n); return null }
    a.find(x => x.getAttribute('href')?.startsWith('#'))?.click()
    await macrotask()
    expect(asked).toEqual([records.find(r => r.dest !== undefined)?.dest])
  })
})

describe('the real door: a page the layer draws nothing of its own on is arXiv\'s page, never our base page in its place', () => {
  const noneRows = (m: Made) => rowsOfIndex(m.index).map(r => [r[0], [], 'none', null, null] as unknown as Row)
  for (const [what, feed] of [
    ['every row `none`, then the end (a reply of no shape for every unit)', (s: Setup, m: Made) => { s.side.take(noneRows(m)); s.side.end() }],
    ['every row `none`, no end (a stop after them)', (s: Setup, m: Made) => { s.side.take(noneRows(m)) }],
    ['no row at all, then the end (nothing to translate)', (s: Setup) => { s.side.end() }],
  ] as const) {
    it(what, async () => {
      const m = await M()
      const s = await real()
      await nearOn(s, [1])
      s.side.tell(await ALL())
      feed(s, m)
      await still(s)
      expect(s.layer()?.pageState(1)).toBe('ready')
      expect(content(s, 1)).toBe('original')
    })
  }
  it('a page that ended as the original with nothing drawn carries no translating card, whatever rows come after for another page', async () => {
    const m = await M()
    const s = await real()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take(noneRows(m))
    await still(s)
    expect(content(s, 1)).toBe('original')
    const cards = () => places(s)[0]?.querySelectorAll('.axt-translating .axt-translating-mark').length ?? 0
    expect(cards()).toBe(0)
    // (another batch of rows: the page that ended stays bare)
    s.side.take(noneRows(m).slice(0, 2))
    await still(s)
    expect(cards()).toBe(0)
  })
  it('the same pages with their rows translated: the layer (the control)', async () => {
    const m = await M()
    const s = await real()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take(rowsOfIndex(m.index))
    await still(s)
    expect(content(s, 1)).toBe('layer')
  })
})
