import { describe, expect, it, vi } from 'vitest'
import { mergeParts } from '@/pdf-reader/engine/layer-proto/format.mjs'
import type { Layer, LayerDocument, PageWords } from '@/pdf-reader/engine/layer-proto/reader.mjs'
import { cutSpec, docsOf, type PaperSpec, rowsOfIndex } from './helpers/parts-paper'

// 1b-E at the door: the word table a laid page answers with (reader.mjs pageOf, run.mjs wordsOf; the 1b design §4). W3: each unit
// painted on a page has one span, each unit left the original's on it is in `original`; the table is the page's own whatever
// the order the pages are asked in, a new copy each ask, always present (no null branch)

const seen = vi.hoisted(() => {
  // a canvas context that draws nothing and reads a white page, made before layer2.mjs loads: an em a CJK character, half one any other
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
  return { runs: [] as unknown[] }
})
vi.mock('@/pdf-reader/engine/layer-proto/run.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/run.mjs')>()
  return { ...actual, openProto: async (o: Parameters<typeof actual.openProto>[0]) => { const run = await actual.openProto(o); seen.runs.push(run); return run } }
})
// (a unit whose translation is BOOM throws while it is laid: it is left the original's, why `error`)
vi.mock('@/pdf-reader/engine/layer-proto/layer2.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')>()
  return { ...actual, prepareUnit: (unit: { pieces?: { s?: string }[] }, ...rest: unknown[]) => { if (unit?.pieces?.some(q => q.s === 'BOOM')) throw new Error('a unit that throws while laid'); return (actual.prepareUnit as (...a: unknown[]) => unknown)(unit, ...rest) } }
})
type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>

const faceSources = async (id: string) => [{ url: `/f/${id}.otf`, ranges: [0, 0x10ffff] }]
const hyphUrl = (lang: string) => `/hyph/${lang}.json`
const para = (text: string, page: number, b: number, o: Partial<PaperSpec['units'][number]> = {}) => ({ kind: 'para', text, lines: [[page, 20, 280, b]] as [number, number, number, number][], file: true, stream: null, ...o })
const cell = (text: string, row: number, col: number, page: number, x0: number, b: number) => ({ kind: 'cell', text, lines: [[page, x0, x0 + 60, b]] as [number, number, number, number][], file: true, stream: null, cell: { table: 0, row, col, span: 1, head: false } })
/** three pages: a paragraph running on to page 2, a paragraph that throws, a table column across pages 1 and 2 (its group is withheld:
 *  on two pages), a paragraph whose row is lost and one whose row never comes */
const SPEC: PaperSpec = {
  pages: 3,
  units: [
    para('First paragraph', 1, 260, { stream: 0 }),
    { ...para('Running on to the next page', 1, 40, { stream: 5 }), lines: [[1, 20, 280, 40], [2, 20, 280, 270]] },
    para('Boom', 2, 200, { stream: 20 }),
    para('Third page', 3, 220, { stream: 60 }),
    para('A paragraph of page 2', 2, 120, { stream: 30 }),
    cell('Upper', 1, 0, 1, 20, 200),
    cell('Middle', 2, 0, 1, 20, 180),
    cell('Lower', 3, 0, 2, 20, 250),
    para('Its row is lost', 3, 150, { stream: 70 }),
    para('Its row never comes', 3, 100, { stream: 80 }),
  ],
}
const BOOM = 2, LOST = 8, ABSENT = 9
/** the units with a line on a page (the spec's, not the engine's) */
const onPage = (p: number) => SPEC.units.flatMap((u, id) => (u.lines.some(l => l[0] === p) ? [id] : []))

/** the page's table as plain data (typed arrays as arrays), to compare */
const plain = (w: PageWords) => JSON.parse(JSON.stringify({ n: w.tokens.n, l: [...w.tokens.l], r: [...w.tokens.r], y: [...w.tokens.y], h: [...w.tokens.h], top: [...w.tokens.top], bottom: [...w.tokens.bottom], word: [...w.word], spans: w.spans, original: w.original }))
const unitsOnPage = (svg: SVGSVGElement) => [...svg.querySelectorAll('g[data-u]')].map(g => Number(g.getAttribute('data-u')))
/** each unit's group on the page with the characters it draws there (every character a token: the translations are Chinese) */
const drawnOn = (svg: SVGSVGElement) => new Map([...svg.querySelectorAll('g[data-u]')].map(g => [Number(g.getAttribute('data-u')), (g.textContent ?? '').replace(/\s/g, '').length] as const))

/** a layer over the spec's paper (its units' rows, the second unit's translation BOOM) with the pages asked in `order`; the caller
 *  disposes it (one layer is open a page) */
async function open(order: readonly number[], how: 'whole' | 'parts') {
  const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
  const c = await cutSpec(SPEC, [1, 2])
  const docFor = docsOf(SPEC) as unknown as (r: number) => LayerDocument
  const rows = rowsOfIndex(c.index).filter(r => r[0] !== ABSENT).map(r => (r[0] === BOOM ? ([r[0], ['BOOM'], ...r.slice(2)] as typeof r) : r[0] === LOST ? ([r[0], [], 'lost', 'test', null] as unknown as typeof r) : r))
  const layer: Layer = how === 'whole'
    ? await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(0), target: 'zh', faceSources, hyphUrl })
    : await openLayer({ index: c.index, doc: docFor(0), parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
  layer.take(rows)
  layer.end()
  if (how === 'parts') layer.endParts()
  const got = new Map<number, Awaited<ReturnType<Layer['pageOf']>>>()
  for (const p of order) got.set(p, await layer.pageOf(p, { lang: 'zh' }))
  return { layer, got, run: seen.runs.at(-1) as Run }
}
/** the tables of the pages asked in `order`, as plain data by page */
async function tablesIn(order: readonly number[], how: 'whole' | 'parts') {
  const o = await open(order, how)
  const out = new Map([...o.got].map(([p, page]) => [p, plain(page.words)]))
  o.layer.dispose()
  return out
}

describe('W3: the page\'s spans and the units left the original\'s', () => {
  it('has one span for each unit painted on the page, in paint order, and lists the unit that threw as the original\'s', async () => {
    const { layer, got, run } = await open([1, 2, 3], 'whole')
    for (const [p, page] of got) {
      const w = page.words
      // each unit painted on the page (its group in the markup) has one span, in the order they were painted; then each unit shown as
      // the original's there, by its own boxes on our page (words.mjs addBoxWords: it lights where it stands, located on the left or not)
      expect(w.spans.map(s => s[0]), `page ${p}`).toEqual([...unitsOnPage(page.svg), ...w.original])
      // (and its tokens are the characters it draws there)
      for (const [id, n] of drawnOn(page.svg)) expect(w.spans.find(s => s[0] === id)![1].reduce((a, v, k) => (k % 2 ? a + v : a), 0), `page ${p} unit ${id}`).toBe(n)
      // its span is a run of the table: [first, count] pairs rising, inside it, and the runs of two spans do not meet
      let next = 0
      for (const [, ranges] of w.spans) {
        expect(ranges.length % 2).toBe(0)
        for (let k = 0; k < ranges.length; k += 2) { expect(ranges[k]).toBeGreaterThanOrEqual(next); expect(ranges[k + 1]).toBeGreaterThan(0); next = ranges[k]! + ranges[k + 1]! }
      }
      expect(next).toBe(w.tokens.n)
      // every field is as long as the table, a token's box has a width and a word its unit has
      for (const f of ['l', 'r', 'y', 'h', 'top', 'bottom'] as const) expect(w.tokens[f].length).toBe(w.tokens.n)
      expect(w.word.length).toBe(w.tokens.n)
      for (let i = 0; i < w.tokens.n; i++) { expect(w.tokens.r[i]!).toBeGreaterThan(w.tokens.l[i]!); expect(w.tokens.top[i]!).toBeGreaterThan(w.tokens.bottom[i]!) }
      // the units left the original's on the page: every unit with a line on it that is not painted, rising (by the spec's lines, not the
      // run's records), each a token a line of it on the page
      const painted = new Set(unitsOnPage(page.svg))
      expect(w.original, `page ${p}`).toEqual(onPage(p).filter(id => !painted.has(id)))
      for (const id of w.original) expect(w.spans.find(s => s[0] === id)?.[1][1], `page ${p} unit ${id}`).toBe(SPEC.units[id]!.lines.filter(l => l[0] === p).length)
    }
    // the unit that threw, the table group withheld (cells on pages 1 and 2), the lost row and the row that never came
    expect(got.get(1)!.words.original).toEqual([5, 6])
    expect(got.get(2)!.words.original).toEqual([BOOM, 7])
    expect(got.get(3)!.words.original).toEqual([LOST, ABSENT])
    expect(unitsOnPage(got.get(2)!.svg)).not.toContain(BOOM)
    void run
    // a unit running on to the next page has a span on each, tokens of its own on each
    expect(got.get(1)!.words.spans.map(s => s[0])).toContain(1)
    expect(got.get(2)!.words.spans.map(s => s[0])).toContain(1)
    // the words of a Chinese unit of four characters: 0 to 3
    const first = got.get(1)!.words
    const [, [from, count]] = first.spans.find(s => s[0] === 0)!
    expect([...first.word.slice(from, from! + count!)]).toEqual([0, 1, 2, 3])
    layer.dispose()
  })

  it('answers a new copy on every ask, equal and sharing no array', async () => {
    const a = await open([1, 2, 3], 'whole')
    const again = await a.layer.pageOf(2, { lang: 'zh' })
    const first = a.got.get(2)!.words
    expect(plain(again.words)).toEqual(plain(first))
    for (const k of ['l', 'r', 'y', 'h', 'top', 'bottom'] as const) expect(again.words.tokens[k]).not.toBe(first.tokens[k])
    expect(again.words.word).not.toBe(first.word)
    expect(again.words.spans).not.toBe(first.spans)
    expect(again.words.spans[0]![1]).not.toBe(first.spans[0]![1])
    expect(again.words.original).not.toBe(first.original)
    // (a host that frees what it was given leaves the page's record)
    first.tokens.l.fill(0)
    first.word.fill(-9)
    expect(plain((await a.layer.pageOf(2, { lang: 'zh' })).words)).toEqual(plain(again.words))
    a.layer.dispose()
  })

  it('is the same table in any order the pages are asked in, and told in parts or opened whole', async () => {
    const want = await tablesIn([1, 2, 3], 'whole')
    expect(await tablesIn([3, 1, 2], 'whole')).toEqual(want)
    expect(await tablesIn([2, 3, 1], 'whole')).toEqual(want)
    expect(await tablesIn([1, 2, 3], 'parts')).toEqual(want)
    expect(await tablesIn([3, 2, 1], 'parts')).toEqual(want)
    expect([...want.values()].every(w => w.n > 0)).toBe(true)
  })

  it('is asked of a final page only: a page not drawn yet has no table to freeze', async () => {
    const o = await open([1], 'whole')
    expect(() => o.run.wordsOf(3)).toThrow(RangeError)
    expect(o.run.wordsOf(1).tokens.n).toBeGreaterThan(0)
    o.layer.dispose()
  })

  it('is always present: a page with no painted unit has an empty table', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const spec: PaperSpec = { pages: 2, units: [para('Only page one', 1, 260, { stream: 0 })] }
    const c = await cutSpec(spec)
    const docFor = docsOf(spec) as unknown as (r: number) => LayerDocument
    const layer = await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(0), target: 'zh', faceSources, hyphUrl })
    layer.take(rowsOfIndex(c.index))
    layer.end()
    const two = await layer.pageOf(2, { lang: 'zh' })
    expect(two.words.tokens.n).toBe(0)
    expect(two.words.spans).toEqual([])
    expect(two.words.original).toEqual([])
    expect(two.words.word).toBeInstanceOf(Int32Array)
    expect(two.words.tokens.l).toBeInstanceOf(Float32Array)
    expect(two.words.tokens.l.length).toBe(0)
    layer.dispose()
  })
})
