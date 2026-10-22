import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkDraw, type Draw } from '@/pdf-reader/engine/layer-proto/draw.mjs'
import type { Written } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { encodeLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { makerOf, OPS_MS } from '@/pdf-reader/engine/layout/make.mjs'
import { readMarked } from '@/pdf-reader/engine/layout/marks.mjs'
import { layerOfPaper } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { settleWithClock } from './helpers/clock'
import { arxivOf, endOf, markedOf, marksOf, type Run, text, unit, words, type World } from './helpers/make-world'

// The page pass tells each page's draw geometry in its left part (E-C): read with the page's operator list by the maker, taken once as
// the left part is written; a page it cannot read, a font a host would read differently or the held budget make that page's none, the
// rest intact

// (a page's ink made capped on demand: the maker's draw tells no fills of an ink that is not whole)
const inkCap = vi.hoisted(() => ({ on: false }))
vi.mock('@/pdf-reader/engine/layout/ink.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layout/ink.mjs')>()
  return { ...actual, pageInk: (...a: Parameters<typeof actual.pageInk>) => { const r = actual.pageInk(...a); return inkCap.on ? { ...r, capped: true } : r } }
})

const PAPER = { id: '2608.04322', version: 1 }
const BASE = { bytes: 10_000, sha256: '0123456789abcdef'.repeat(4), xref: 9_000 }
const OURS = { bytes: 12_000, sha256: 'fedcba9876543210'.repeat(4), xref: 11_500 }
const linesOf = (page: number): Run[] => Array.from({ length: 10 }, (_, j) => ({ s: words(100 * page + 10 * j, 10), x: 72, y: 700 - 12 * j }))
function worldOf(): World {
  const pages = [1, 2, 3].map(p => ({ runs: linesOf(p) }))
  const marks: World['marks'] = []
  for (const p of [1, 2, 3]) { const ls = linesOf(p); marks.push([`${p - 1}s`, p, 72, 700], [`${p - 1}e`, p, endOf(ls[9] as Run), 592]) }
  return { pages, marked: pages, marks, units: [1, 2, 3].map(p => unit('para', [text(words(100 * p, 100))])) }
}
const source = (w: World) => ({ units: w.units, kept: new Set(), inFloat: [] }) as never
const readOf = (w: World) => readMarked(markedOf(w.marked ?? w.pages, w.marks), '', { engine: 'pdflatex', switches: null, inkless: null, texts: null, names: null, units: w.units, OPS } as never)

type Mode = 'ok' | 'text' | 'annots' | 'never' | 'font'
/** the base page's fake document with what draw needs of a page proxy: annotations (one Link), fonts with a map, and a page's mode */
function drawable(doc: ReturnType<typeof arxivOf>, modes: Record<number, Mode> = {}) {
  return {
    ...doc,
    getPage: async (n: number) => {
      const page = (await doc.getPage(n)) as Record<string, any>
      const mode = modes[n] ?? 'ok'
      return {
        ...page,
        commonObjs: { has: page.commonObjs.has, get: (id: string) => { const f = page.commonObjs.get(id); return f && typeof f === 'object' && 'name' in f ? { ...f, toUnicode: { _map: ['a', 'b'] }, missingFile: mode === 'font' } : f } },
        getTextContent: mode === 'text' ? async () => { throw new Error('no text') } : mode === 'never' ? () => new Promise(() => {}) : page.getTextContent,
        getAnnotations: mode === 'annots' ? async () => { throw new Error('no annotations') } : async () => [{ subtype: 'Link', rect: [1, 2, 3, 4], dest: `sec.${n}`, url: null }],
      }
    },
  }
}

async function passOf(w: World, modes: Record<number, Mode> = {}, o: Partial<Parameters<typeof layerOfPaper>[0]> = {}) {
  const lefts = new Map<number, Draw | null>(), told: string[] = []
  const heads: Written[] = []
  const r = await layerOfPaper({
    // (the draw is the base page's, our compile's: its document the drawable one, arXiv's the left's and the line check's)
    paper: PAPER, source: source(w), marks: await readOf(w), arxiv: { doc: arxivOf(w.pages), text: await readArxivText(arxivOf(w.pages)) },
    ours: { doc: drawable(arxivOf(w.pages), modes), ...OURS, text: await readArxivText(arxivOf(w.pages)), check: { marks: w.marks.length } }, orig: BASE, tree: '2025', OPS, pdfjs: '6.3.289', image: '1',
    onHead: h => { told.push('head'); heads.push(h) },
    onLeft: l => { lefts.set((l as Written & { page: number }).page, (JSON.parse(new TextDecoder().decode(l.bytes)) as { draw: Draw | null }).draw) },
    onPart: p => { told.push(`part ${(p as Written & { from: number }).from}`) },
    ...o,
  })
  return { r, lefts, told, heads }
}

afterEach(() => { vi.useRealTimers() })

describe('layerOfPaper: the draw geometry of the pages', () => {
  it('each left part carries its page\'s draw: the items in text order, the fonts, the Link annotations; valid to the reader', async () => {
    const { r, lefts } = await passOf(worldOf())
    expect(r).toMatchObject({ through: 3, stats: { draw: { pages: 3, none: 0, why: {} } } })
    for (const p of [1, 2, 3]) {
      const d = lefts.get(p) as Draw
      expect(() => checkDraw(d)).not.toThrow()
      expect(d.items).toHaveLength(10)
      expect(d.items[0]?.[0]).toBe(words(100 * p, 10))
      expect(d.fonts).toEqual([['ABCDEF+CMR10', 'serif', 0, ['a', 'b']]])
      expect(d.links).toEqual([[[1, 2, 3, 4], null, null, `sec.${p}`, null, null, null, null]])
    }
  })

  it('a page whose text or annotations cannot be read has none, that page alone; the rest, the told order and the parts are intact', async () => {
    const all = await passOf(worldOf())
    const got = await passOf(worldOf(), { 2: 'annots', 3: 'text' })
    expect([...got.lefts.keys()]).toEqual([1, 2, 3])
    expect(got.lefts.get(1)).toEqual(all.lefts.get(1))
    expect(got.lefts.get(2)).toBeNull()
    expect(got.lefts.get(3)).toBeNull()
    expect(got.told).toEqual(all.told)
    expect(got.r).toMatchObject({ through: 3, stats: { draw: { pages: 1, none: 2, why: { read: 2 } }, layout: { stats: expect.anything() } } })
  })

  it('a page whose font a host would read differently (not embedded) has none', async () => {
    const got = await passOf(worldOf(), { 1: 'font' })
    expect(got.lefts.get(1)).toBeNull()
    expect(got.lefts.get(2)).not.toBeNull()
    expect(got.r).toMatchObject({ stats: { draw: { pages: 2, none: 1, why: { font: 1 } } } })
  })

  it('a read that never comes is given up at OPS_MS, that page alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    // (the clock moved on only while the pass waits on page 2's read alone: its parts' digests are real work)
    const got = await settleWithClock(passOf(worldOf(), { 2: 'never' }), OPS_MS)
    expect(got.lefts.get(2)).toBeNull()
    expect(got.lefts.get(1)).not.toBeNull()
    expect(got.lefts.get(3)).not.toBeNull()
    expect(got.r).toMatchObject({ stats: { draw: { pages: 2, none: 1, why: { time: 1 } } } })
  })

  it('the head says draw 1 where the draws are read, and says nothing where they are not', async () => {
    const on = await passOf(worldOf())
    const off = await passOf(worldOf(), {}, { draw: false })
    const headOf = (w: Written) => JSON.parse(new TextDecoder().decode(w.bytes)) as Record<string, unknown>
    expect(headOf(on.heads[0] as Written).draw).toBe(1)
    expect(headOf(off.heads[0] as Written)).not.toHaveProperty('draw')
    // (the whole path, the stream's and the oracle's alike)
    const capture: { frame?: unknown; columnEdges?: unknown } = {}
    await passOf(worldOf(), {}, { capture: capture as never })
    const streamed = await passOf(worldOf(), {}, { oracle: capture as never })
    expect(headOf(streamed.heads[0] as Written).draw).toBe(1)
  })

  it('a page with no tokens ships the draw it read (C1.5: a page read and empty has one), as the stream and the whole path tell it', async () => {
    // (page 2: no word, a row of symbols, and its link)
    const w = worldOf()
    w.pages[1] = { runs: [{ s: '* * *', x: 72, y: 700 }] }
    w.marked = w.pages
    w.marks = w.marks.filter(m => m[1] !== 2)
    w.units = [w.units[0]!, w.units[2]!]
    w.marks = w.marks.map(m => (m[0] === '2s' ? ['1s', ...m.slice(1)] : m[0] === '2e' ? ['1e', ...m.slice(1)] : m) as typeof m)
    for (const o of [{}, { whole: true }]) {
      const got = await passOf(w, {}, o)
      expect(got.r).toMatchObject({ stats: { draw: { pages: 3, none: 0, shed: 0 } } })
      expect([...got.lefts.keys()]).toEqual([1, 2, 3])
      expect(got.lefts.get(2)).not.toBeNull()
      expect(got.lefts.get(2)?.items.map(it => it[0])).toEqual(['* * *'])
    }
  })

  it('a draw the writer sheds with its part\'s tokens (past TOKENS_PAGE) is counted in stats.draw.shed, and its part ships none', async () => {
    // (page 3: 1,500 lines of eleven words, 16,500 tokens; its draw within every cap of its own)
    const w = worldOf()
    w.pages[2] = { runs: Array.from({ length: 1500 }, (_, j): Run => ({ s: words(10_000 + 11 * j, 11), x: 72, y: 780 - (j % 1400) * 0.5 })) }
    w.marked = w.pages
    w.marks = w.marks.filter(m => m[1] !== 3)
    w.units = w.units.slice(0, 2)
    const got = await passOf(w)
    expect(got.r).toMatchObject({ stats: { draw: { pages: 3, none: 0, shed: 1 } } })
    expect(got.lefts.get(3)).toBeNull()
    expect(got.lefts.get(1)).not.toBeNull()
  })

  it('`draw: false` reads no page\'s draw: every page tells none', async () => {
    const off = await passOf(worldOf(), {}, { draw: false })
    expect([...off.lefts.values()]).toEqual([null, null, null])
    expect(off.r).toMatchObject({ stats: { draw: { pages: 0, none: 0 } } })
  })

  it('under the oracle (a page stream), the same draws are told', async () => {
    const w = worldOf()
    const capture: { frame?: unknown; columnEdges?: unknown } = {}
    const whole = await passOf(w, {}, { capture: capture as never })
    const streamed = await passOf(w, {}, { oracle: capture as never })
    expect([...streamed.lefts]).toEqual([...whole.lefts])
  })
})

describe('makerOf: the draw option', () => {
  const input = async (w: World, o: Record<string, unknown> = {}) => ({ units: w.units, marks: await marksOf(w, ''), OPS, paper: PAPER, left: '', pdfjs: '6.3.289', ...o })

  it('hands a page\'s draw once (the held text is let go with it) and keeps the layout file the same bytes with it on or off', async () => {
    const w = worldOf()
    const off = await makerOf({ ...(await input(w)), arxiv: arxivOf(w.pages) })
    const on = await makerOf({ ...(await input(w, { draw: true })), arxiv: drawable(arxivOf(w.pages)) as never })
    if ('refused' in off || 'refused' in on) throw new Error('refused')
    for (let p = 1; p <= on.pages; p++) { await off.readPage(p); await on.readPage(p) }
    const a = await off.whole(), b = await on.whole()
    if (!('file' in a) || !('file' in b)) throw new Error('refused')
    expect(encodeLayout(b.file)).toBe(encodeLayout(a.file))
    expect(on.drawOf(1)).not.toBeNull()
    expect(on.drawOf(1)).toBeNull()
    expect(off.drawOf(1)).toBeNull()
    expect(on.drawStats.pages).toBe(3)
  })

  it('tells each item\'s characters\' fills from the page\'s ink: a run painted blue, one of no colour (a pattern), the rest black', async () => {
    const w = worldOf()
    const runs = w.pages[0]!.runs
    runs[0] = { ...runs[0]!, fill: '#0000ff' }
    runs[1] = { ...runs[1]!, fill: 'pattern' }
    const m = await makerOf({ ...(await input(w, { draw: true })), arxiv: drawable(arxivOf(w.pages)) as never })
    if ('refused' in m) throw new Error('refused')
    await m.readPage(1)
    const d = m.drawOf(1) as Draw
    expect(d.items.slice(0, 3).map(i => i[9])).toEqual([0x0000ff, -1, 0])
    expect(d.items.slice(3).every(i => i[9] === 0)).toBe(true)
    // (an ink past its cap, its walk's backstop or turned is not the page's whole: its glyphs tell no item's fills)
    inkCap.on = true
    try {
      const capped = await makerOf({ ...(await input(w, { draw: true })), arxiv: drawable(arxivOf(w.pages)) as never })
      if ('refused' in capped) throw new Error('refused')
      await capped.readPage(1)
      expect((capped.drawOf(1) as Draw).items.every(i => i[9] === -1)).toBe(true)
    } finally { inkCap.on = false }
  })

  it('takes each page\'s text as step T read it: no page\'s text asked twice, the draws the same JSON as those read again', async () => {
    const w = worldOf()
    /** the drawable document, each getTextContent counted */
    const counted = () => {
      const calls: number[] = [], doc = drawable(arxivOf(w.pages))
      return { calls, doc: { ...doc, getPage: async (n: number) => { const p = (await doc.getPage(n)) as Record<string, any>; return { ...p, getTextContent: async () => { calls.push(n); return p.getTextContent() } } } } }
    }
    const json = async (doc: unknown, text: unknown) => {
      const m = await makerOf({ ...(await input(w, { draw: true, ...(text ? { text } : {}) })), arxiv: doc as never })
      if ('refused' in m) throw new Error('refused')
      for (let p = 1; p <= m.pages; p++) await m.readPage(p)
      return [1, 2, 3].map(p => m.drawJsonOf(p))
    }
    // step T's rows kept (the maker's own read with the draw asked, or a host's), against a text read without them
    const own = counted(), mine = await json(own.doc, null)
    const host = counted(), given = await json(host.doc, await readArxivText(host.doc as never, { draw: true }))
    const bare = counted(), again = await json(bare.doc, await readArxivText(bare.doc as never))
    expect(own.calls).toEqual([1, 2, 3])
    expect(host.calls).toEqual([1, 2, 3])
    expect(bare.calls).toEqual([1, 2, 3, 1, 2, 3])
    expect(mine.every(t => typeof t === 'string')).toBe(true)
    expect(given).toEqual(mine)
    expect(again).toEqual(mine)
    // (and the rows are let go as each page's draw is read)
    const text = await readArxivText(counted().doc as never, { draw: true })
    const m = await makerOf({ ...(await input(w, { draw: true, text })), arxiv: counted().doc as never })
    if ('refused' in m) throw new Error('refused')
    await m.readPage(1)
    expect(text.draw?.map(x => x !== null)).toEqual([false, true, true])
  })

  it('counts a held draw in its encoded bytes, for the budget and the stats: a page of CJK text', async () => {
    const w = worldOf()
    w.pages[0] = { runs: Array.from({ length: 10 }, (_, j): Run => ({ s: '\u6f22\u5b57\u306e\u6587\u3002'.repeat(8), x: 72, y: 700 - 12 * j })) }
    w.marked = w.pages
    const m = await makerOf({ ...(await input(w, { draw: true })), arxiv: drawable(arxivOf(w.pages)) as never })
    if ('refused' in m) throw new Error('refused')
    await m.readPage(1)
    const bytes = m.drawStats.bytes, text = m.drawJsonOf(1) as string
    expect(bytes).toBe(new TextEncoder().encode(text).length)
    expect(bytes).toBeGreaterThan(text.length + 500)
    // (a budget past the text's code units and short of its bytes holds none)
    const tight = await makerOf({ ...(await input(w, { draw: true, drawHeldMax: text.length + 100 })), arxiv: drawable(arxivOf(w.pages)) as never })
    if ('refused' in tight) throw new Error('refused')
    await tight.readPage(1)
    expect(tight.drawOf(1)).toBeNull()
    expect(tight.drawStats).toMatchObject({ pages: 0, none: 1, why: { held: 1 }, bytes: 0 })
  })

  it('past the held budget a page has none, and a page taken frees room for the next', async () => {
    const w = worldOf()
    const probe = await makerOf({ ...(await input(w, { draw: true })), arxiv: drawable(arxivOf(w.pages)) as never })
    if ('refused' in probe) throw new Error('refused')
    await probe.readPage(1)
    const one = probe.drawStats.bytes
    const m = await makerOf({ ...(await input(w, { draw: true, drawHeldMax: Math.floor(one * 1.5) })), arxiv: drawable(arxivOf(w.pages)) as never })
    if ('refused' in m) throw new Error('refused')
    await m.readPage(1)
    await m.readPage(2)
    expect(m.drawOf(2)).toBeNull()
    expect(m.drawOf(1)).not.toBeNull()
    await m.readPage(3)
    expect(m.drawOf(3)).not.toBeNull()
    expect(m.drawStats).toMatchObject({ pages: 2, none: 1, why: { held: 1 } })
  })
})
