import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { CHUNKS_MAX, indexOf, INK_UNITS_FORMAT, type PartChain, type ReadPart, type ReadUnitsChunk, readHead, readPart, readUnitsChunk, UNITS_FORMAT, type Written, writeUnitChunks } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { readMarked } from '@/pdf-reader/engine/layout/marks.mjs'
import { orphanRowsOfHead } from '@/pdf-reader/engine/layout/ledger.mjs'
import { inkAnchors, inkOfHost, inkWithinChunks, layoutWithInk } from '@/pdf-reader/engine/pipeline/ink-pass.mjs'
import { inkBundleUnitsOf } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { layerOfPaper } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { arxivOf, endOf, markedOf, type Page, type Run, text, unit, words, type World } from './helpers/make-world'

// The ink units in the page pass (docs/route/orphan-text.md §8): units the wrap made of text no source unit owns (`ours.ink`),
// carried after the source units' in a chunk of their own, on the left by the tokens on their lines, in the layout by the
// wrap's rows; the head's base carries the ledger. A host that gives none has the pass as it was.

const PAPER = { id: '2608.04322', version: 1 }
const ORIG = { bytes: 10_000, sha256: '0123456789abcdef'.repeat(4), xref: 9_000 }
const OURS = { bytes: 12_000, sha256: 'fedcba9876543210'.repeat(4), xref: 11_500 }
const HEAD_RUN: Run = { s: 'Journal of Things', x: 72, y: 760 }
const linesOf = (page: number): Run[] => Array.from({ length: 10 }, (_, j) => ({ s: words(100 * page + 10 * j, 10), x: 72, y: 700 - 12 * j }))
/** three pages of ten lines, a running head on each page past the first that no unit owns */
function worldOf(): World {
  const pages: Page[] = [1, 2, 3].map(p => ({ runs: [...(p > 1 ? [HEAD_RUN] : []), ...linesOf(p)] }))
  const marks: World['marks'] = []
  for (const p of [1, 2, 3]) { const ls = linesOf(p); marks.push([`${p - 1}s`, p, 72, 700], [`${p - 1}e`, p, endOf(ls[9] as Run), 592]) }
  return { pages, marked: pages, marks, units: [1, 2, 3].map(p => unit('para', [text(words(100 * p, 100))])) }
}
const source = (w: World, names: string[] = []) => ({ units: w.units, kept: new Set(), inFloat: [], names }) as never
const readOf = (w: World) => readMarked(markedOf(w.marked ?? w.pages, w.marks), '', { engine: 'pdflatex', switches: null, inkless: null, texts: null, names: null, units: w.units, OPS } as never)
const oursOf = (w: World, more: Record<string, unknown> = {}) => ({ doc: markedOf(w.marked ?? w.pages, w.marks), ...OURS, check: { marks: w.marks.length }, ...more })
/** the ink unit the wrap would make of the head on page p (layout/ink-units.mjs's rows: the run's box, its size, its face) */
const headUnit = (id: number, page: number) => ({
  id, kind: 'inkheads', cls: 'heads', echo: null, pieces: [{ t: 'text', s: HEAD_RUN.s }],
  rows: { unit: [id, 'inkheads', 9, 0, 1], lines: [page, 72, endOf(HEAD_RUN), 760, 767.5, 757.5, 10, 'ABCDEF+CMR10'], frames: [page, 0, 0, 1, -1, 50], erase: [0, 72, 757.5, endOf(HEAD_RUN), 767.5], ph: [] },
})
const INK = { base: 3, units: [headUnit(3, 2), headUnit(4, 3)] }
const LEDGER = { classes: ['body', 300, 290, 'heads', 30, 28], letters: 318, orphanLetters: 4, orphans: [2, 4, 'lost'] }

async function passOf(w: World, o: Record<string, unknown>, names: string[] = []) {
  const parts: Written[] = []
  let head: Written | null = null, units: Written[] = []
  const r = await layerOfPaper({
    paper: PAPER, source: source(w, names), marks: await readOf(w), arxiv: { doc: arxivOf(w.pages) }, OPS, pdfjs: '6.3.289', image: '1', tree: '2025', orig: ORIG,
    onHead: (h: Written, c: Written[]) => { head = h; units = c }, onLeft: () => {}, onPart: (p: Written) => { parts.push(p) },
    ...o,
  } as never)
  const rh = await readHead((head as unknown as Written).bytes, { ref: (head as unknown as Written).ref })
  const chunks: ReadUnitsChunk[] = []
  for (const u of units) chunks.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: chunks.at(-1) ?? null }))
  const index = indexOf(rh, chunks), read: ReadPart[] = []
  let chain: PartChain | null = null
  for (const p of parts) { const x = await readPart(p.bytes, { ref: p.ref, index, chain }); read.push(x); chain = x.chain }
  return { head: rh, units, chunks, parts: read, r: r as unknown as { stats: { closed: [number, number, number][] } } }
}
const formatOf = (c: Written) => JSON.parse(new TextDecoder().decode(c.bytes)).format

describe('the ink units in the page pass', () => {
  it('carries them after the source units\', in a chunk of their own, in the parts of their pages, and the ledger in the head', async () => {
    for (const whole of [false, true]) {
      const w = worldOf()
      const got = await passOf(w, { ours: oursOf(w, { ink: INK, wrap: null }), whole })
      // (the source units' chunk as the prepare child writes it, then the ink units', of their own format)
      expect(got.chunks.map(c => [c.from, c.to])).toEqual([[0, 2], [3, 4]])
      expect(got.units.map(formatOf)).toEqual([UNITS_FORMAT, INK_UNITS_FORMAT])
      expect(got.chunks[1]?.units).toEqual([['inkheads', 0, null, null, null, [[0, HEAD_RUN.s]], null], ['inkheads', 0, null, null, null, [[0, HEAD_RUN.s]], null]])
      // (each in the layout of the part that holds its page, its rows the wrap's, its face the file's)
      const laid = got.parts.flatMap(p => (p.layout && 'units' in p.layout ? p.layout.units.map(u => u[0]) : []))
      expect(laid).toEqual(expect.arrayContaining([0, 1, 2, 3, 4]))
      const part = got.parts.find(p => p.layout && 'units' in p.layout && p.layout.units.some(u => u[0] === 3))
      const line = part && part.layout && 'lines' in part.layout ? part.layout.lines.find(e => e[0] === 3)?.[1] : null
      expect(line?.slice(0, 7)).toEqual([2, 72, endOf(HEAD_RUN), 760, 767.5, 757.5, 10])
    }
  })

  it('after the paper\'s structural names, which the source units\' chunk holds as the prepare child writes it, never laid (PDF-READER §19.14)', async () => {
    const names = ['Section', 'and']
    const marked = (w: World) => ({ doc: markedOf(w.marked ?? w.pages, w.marks), log: '', options: { engine: 'pdflatex', switches: null, inkless: null, texts: null, names: null, OPS } })
    // (the wrap's ink units from the bundle's units before them, 3 source units and 2 names: wrapFinal's `inkFrom`)
    const ink = { base: 5, units: [headUnit(5, 2), headUnit(6, 3)] }
    // the pass whole, then streamed: the marks read whole (the left whole), and the marked original a page at a time (the left
    // streamed), each by the whole run's predicates
    const capture = {}, w0 = worldOf()
    const runs = [
      await passOf(w0, { ours: oursOf(w0, { ink, wrap: null }), capture }, names),
      await passOf(worldOf(), { ours: oursOf(worldOf(), { ink, wrap: null }), oracle: capture }, names),
      await passOf(worldOf(), { ours: oursOf(worldOf(), { ink, wrap: null }), marks: null, marked: marked(worldOf()), oracle: capture }, names),
    ]
    for (const got of runs) {
      expect(got.chunks.map(c => [c.from, c.to])).toEqual([[0, 4], [5, 6]])
      // (a stream's first part cut before the last page is read: no name awaited by the cut)
      if (got !== runs[0]) expect(got.r.stats.closed[0]?.[2]).toBeLessThan(3)
      expect(got.units.map(formatOf)).toEqual([UNITS_FORMAT, INK_UNITS_FORMAT])
      expect(got.chunks[0]?.units.slice(3)).toEqual([['name', 0, null, null, null, [[0, 'Section']]], ['name', 0, null, null, null, [[0, 'and']]]])
      const laid = got.parts.flatMap(p => (p.layout && 'units' in p.layout ? p.layout.units.map(u => u[0]) : []))
      expect(laid).toEqual(expect.arrayContaining([0, 1, 2, 5, 6]))
      expect(laid).not.toContain(3)
      expect(laid).not.toContain(4)
      expect(got.parts.map(p => p.pages)).toEqual(runs[0]?.parts.map(p => p.pages))
      expect(got.parts.at(-1)?.pages[1]).toBe(3)
    }
    // (a wrap that numbered its ink units from the source units alone, a host of before: none, the pass as it was)
    const w = worldOf()
    const got = await passOf(w, { ours: oursOf(w, { ink: INK, wrap: null }) }, names)
    expect(got.chunks.map(c => [c.from, c.to])).toEqual([[0, 4]])
  })

  it('writes the wrap\'s ledger into the head\'s base, and invariant (o) reads it', async () => {
    const w = worldOf()
    const stats = { wrapped: 3, refusedPages: 0, unhidden: { marks: 0, across: 0, spell: 0, page: 0, bounds: 0 }, split: 0, groups: 5, labelKept: 0 }
    const got = await passOf(w, { ours: oursOf(w, { ink: INK, wrap: { stats, unhidden: [], labelKept: [], pages: [[1, 3]], ledger: LEDGER } }) })
    expect(got.head.base).toMatchObject({ source: 'ours', ledger: LEDGER })
    expect(orphanRowsOfHead(got.head, { paper: '2608.04322v1' })).toEqual([{ inv: 'o', sev: 'violation', paper: '2608.04322v1', page: 2, unit: null, what: 'orphan text', text: 'lost', detail: { letters: 4 } }])
  })

  it('makes none where the host gives none, or gives them for other units than the paper\'s', async () => {
    const w = worldOf()
    for (const ink of [null, { base: 2, units: INK.units }, { base: 3, units: [headUnit(4, 2)] }]) {
      const got = await passOf(w, { ours: oursOf(w, { ink }) })
      expect(got.chunks.map(c => [c.from, c.to])).toEqual([[0, 2]])
    }
  })

  it('keeps every unit its id, which names its groups in our page, and lays none on a page not drawable or the wrap left off', () => {
    const got = inkOfHost(INK, { units: [0, 1, 2] }, [2])
    expect(got?.units.map(u => [u.id, u.rows.lines[0], u.rows.unit[0]])).toEqual([[3, 2, 3], [4, 3, 4]])
    expect([...(got?.off ?? [])]).toEqual([3])
    expect([...(inkOfHost({ ...INK, off: [4, 9, 'x'] }, { units: [0, 1, 2] }) ?? { off: [] }).off]).toEqual([4])
    // (all off: none, the pass as it was)
    expect(inkOfHost(INK, { units: [0, 1, 2] }, [2, 3])).toBe(null)
    // (one off is in no layout's rows)
    const layout = { fonts: [], units: [], lines: [], frames: [], erase: [], ph: [] }
    expect(layoutWithInk(layout, got, [3, 4]).units.map(u => u[0])).toEqual([4])
  })

  it("drops a unit's label row that meets an ink unit's text, which the reader would show again under its translation", () => {
    // (SIAM's "AMS subject classifications." before the codes' unit: no label's form, left in no group by the wrap, an ink
    // unit's; the codes' label row over it, 2610.20266v1 p1, and a row of another page, or apart on this one, kept)
    const head = { ...headUnit(3, 2), kind: 'inkorphan', cls: 'orphan' }
    const got = inkOfHost({ base: 3, units: [head] }, { units: [0, 1, 2] })
    const over = [1, 1, 2, 72, 760, 80, 767.5, 757.5], other = [2, 1, 3, 72, 760, 80, 767.5, 757.5], apart = [0, 1, 2, 72, 700, 80, 707.5, 697.5]
    const layout = { fonts: [], units: [], lines: [], frames: [], erase: [], ph: [], labels: [apart, over, other] }
    expect(layoutWithInk(layout, got, [3]).labels).toEqual([apart, other])
    // (in a part with none of the ink units laid as well: its rows are another part's, its label row still goes)
    expect(layoutWithInk(layout, got, []).labels).toEqual([apart, other])
    // (none meets: the layout as it was)
    const none = { ...layout, labels: [apart, other] }
    expect(layoutWithInk(none, got, [])).toBe(none)
    // (an ink unit laid nowhere, its page not drawable: the original's, its ink shown in its group; the row stays — Devin on #481)
    const off = inkOfHost({ base: 3, units: [head] }, { units: [0, 1, 2] }, [2])
    expect(off).toBe(null)
    const offTwo = inkOfHost({ base: 3, units: [head, { ...headUnit(4, 3), kind: 'inkorphan', cls: 'orphan' }] }, { units: [0, 1, 2] }, [2])
    expect([...(offTwo?.off ?? [])]).toEqual([3])
    // (the row over the laid one, on page 3, goes)
    expect(layoutWithInk(layout, offTwo, [3, 4]).labels).toEqual([apart, over])
  })

  it('keeps an echo of an ink unit as the wrap made it, whether or not that unit is laid', () => {
    const echoOf = (id: number, page: number, echo: number | null) => ({ ...headUnit(id, page), echo })
    const ink = { base: 3, units: [echoOf(3, 2, null), echoOf(4, 3, 3), echoOf(5, 4, 0)] }
    const got = inkOfHost(ink, { units: [0, 1, 2] }, [2])
    expect(got?.units.map(u => [u.id, u.echo])).toEqual([[3, null], [4, 3], [5, 0]])
    expect([...(got?.off ?? [])]).toEqual([3])
  })

  it('makes none where their chunks would pass a head\'s bounds beside the source units\'', async () => {
    const units = [['para', 0, null, null, null, [[0, 'Body']]]] as never
    const one = { base: 1, units: [headUnit(1, 2)] } as never
    expect(await inkWithinChunks(PAPER, units, one)).toBe(one)
    expect(await inkWithinChunks(PAPER, units, null)).toBe(null)
    // (the bound itself: chunks written before count against it)
    await expect(writeUnitChunks({ paper: PAPER, units: inkBundleUnitsOf([headUnit(1, 2)] as never), start: 1, before: { chunks: CHUNKS_MAX, bytes: 0, values: 0 } })).rejects.toThrow(/units-too-large/)
  })

  it('carries the figure units after the other ink units, in the ink units\' chunk, each row in the part of its page', async () => {
    // (a figure unit the wrap drew on page 2: layout/wrap.mjs wrapFinal `figures`, the host's ours.wrap.figures)
    const fig = { page: 2, group: 'f0', text: 'Validation loss', font: 'ABCDEF+ArialMT', size: 8, fill: 0, angle: 0, x: 100, y: 400, ux: 1, uy: 0, length: 60, ascent: 0.88, descent: -0.2, anchor: 'centre', form: true }
    const stats = { wrapped: 3, refusedPages: 0, unhidden: { marks: 0, across: 0, spell: 0, page: 0, bounds: 0 }, split: 0, groups: 5, labelKept: 0 }
    const wrap = { stats, unhidden: [], labelKept: [], pages: [[1, 3]], figures: { units: [fig] } }
    for (const whole of [false, true]) {
      for (const ink of [INK, null]) {
        const w = worldOf()
        const got = await passOf(w, { ours: oursOf(w, { ink, wrap }), whole })
        // (the source units' chunk as before, then one of INK_UNITS_FORMAT: the ink units by their ids, the figure unit after them)
        const id = ink ? 5 : 3
        expect(got.chunks.map(c => [c.from, c.to])).toEqual([[0, 2], [3, id]])
        expect(got.units.map(formatOf)).toEqual([UNITS_FORMAT, INK_UNITS_FORMAT])
        expect(got.chunks[1]?.units.at(-1)).toEqual(['inkfigures', 0, null, null, null, [[0, 'Validation loss']], null])
        // (its row in the part of page 2 alone, by its id; no other part holds the key)
        const holding = got.parts.filter(p => p.figures.length)
        expect(holding.map(p => p.figures.map(f => [f.id, f.page, f.group]))).toEqual([[[id, 2, 'f0']]])
        // (no token of arXiv's in its band: no anchor on the left, the figure's float lighting it)
        expect(got.parts.flatMap(p => p.left).some(e => e[0] === id)).toBe(false)
      }
    }
  })

  it('anchors a figure unit on the left by arXiv\'s tokens in its run\'s band, whole and streamed, so that its translation lights its original', async () => {
    const fig = { page: 2, group: 'f0', text: 'Validation loss', font: 'ABCDEF+ArialMT', size: 8, fill: 0, angle: 0, x: 100, y: 400, ux: 1, uy: 0, length: 60, ascent: 0.88, descent: -0.2, anchor: 'centre', form: true }
    const stats = { wrapped: 3, refusedPages: 0, unhidden: { marks: 0, across: 0, spell: 0, page: 0, bounds: 0 }, split: 0, groups: 5, labelKept: 0 }
    const wrap = { stats, unhidden: [], labelKept: [], pages: [[1, 3]], figures: { units: [fig] } }
    // (arXiv's page 2 sets the label where the wrap drew it: its tokens in the band)
    const withLabel = (): World => { const w = worldOf(); w.pages[1] = { runs: [...w.pages[1]!.runs, { s: 'Validation loss', x: 100, y: 400 }] }; return w }
    for (const whole of [false, true]) {
      for (const ink of [INK, null]) {
        const w = withLabel()
        const got = await passOf(w, { ours: oursOf(w, { ink, wrap }), whole })
        const id = ink ? 5 : 3
        const entry = got.parts.flatMap(p => p.left).find(e => e[0] === id)
        expect(entry?.[2].map(r => r[0])).toEqual([2])
        const [, x0, y0, x1, y1] = entry![2][0]!
        expect([x0 <= 100, x1 >= 140, y0 <= 400, y1 >= 400]).toEqual([true, true, true, true])
        // (the source units' anchors as before: each its own page's)
        for (const u of [0, 1, 2]) expect([...new Set(got.parts.flatMap(p => p.left).find(e => e[0] === u)?.[2].map(r => r[0]))]).toEqual([u + 1])
      }
    }
  })

  it('anchors each on the left by arXiv\'s tokens on its lines', () => {
    const doc = [
      { page: 2, x: 72, w: 30, y: 760, top: 767.5, bottom: 757.5, h: 10, t: 'Journal' },
      { page: 2, x: 72, w: 30, y: 700, top: 707.5, bottom: 697.5, h: 10, t: 'body' },
      { page: 3, x: 72, w: 30, y: 760, top: 767.5, bottom: 757.5, h: 10, t: 'Journal' },
    ]
    const a = inkAnchors(doc as never, INK as never)
    expect([...a.keys()]).toEqual([3, 4])
    expect(a.get(3)?.tokens).toEqual([0])
    expect(a.get(4)?.tokens).toEqual([2])
  })
})
