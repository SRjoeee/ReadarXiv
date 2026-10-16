import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { cutBundle } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import type { Written } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { makeLayout } from '@/pdf-reader/engine/layout/make.mjs'
import { readMarked } from '@/pdf-reader/engine/layout/marks.mjs'
import { anchorUnits, boundsFromMarks, floatMatches } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { leftSideOf } from '@/pdf-reader/engine/pipeline/left-side.mjs'
import { layerOfPaper } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { displayEdges, unitText } from '@/pdf-reader/engine/translate/mt.mjs'
import { arxivOf, endOf, markedOf, type Run, text, unit, words, type World } from './helpers/make-world'

// The page pass (pipeline/page-pass.mjs layerOfPaper) over the layout maker's fake world: a paper's layer made from its marks and
// arXiv's PDF, told a part at a time, equal to cutBundle's of the same whole made as the web's producer makes it; each part judged
// by the carry's share of its marked pages and by its own reader

const PAPER = { id: '2608.04322', version: 1 }
const BASE = { bytes: 10_000, sha256: '0123456789abcdef'.repeat(4), xref: 9_000 }
const FLOATING = new Set(['caption', 'footnote', 'cell', 'figure'])

/** three pages of ten lines, a paragraph a page (the doubling schedule's parts: page 1, pages 2 and 3) */
const linesOf = (page: number, from = 0): Run[] => Array.from({ length: 10 }, (_, j) => ({ s: words(100 * page + 10 * j + from, 10), x: 72, y: 700 - 12 * j }))
function worldOf(changed: (page: number, j: number) => boolean = () => false): World {
  const marked = [1, 2, 3].map(p => ({ runs: linesOf(p) }))
  // arXiv's lines: the marked original's, but those `changed` set in other words
  const pages = [1, 2, 3].map(p => ({ runs: linesOf(p).map((r, j) => (changed(p, j) ? { ...r, s: words(5000 + 100 * p + 10 * j, 10) } : r)) }))
  const marks: World['marks'] = []
  for (const p of [1, 2, 3]) { const ls = linesOf(p); marks.push([`${p - 1}s`, p, 72, 700], [`${p - 1}e`, p, endOf(ls[9] as Run), 592]) }
  return { pages, marked, marks, units: [1, 2, 3].map(p => unit('para', [text(words(100 * p, 100))])) }
}
const source = (w: World) => ({ units: w.units, kept: new Set() }) as never
const readOf = (w: World) => readMarked(markedOf(w.marked ?? w.pages, w.marks), '', { engine: 'pdflatex', switches: null, inkless: null, texts: null, names: null, units: w.units, OPS } as never)

/** the layer as the page pass tells it: the head and chunks, the left parts and parts in the order told, the notes */
async function passOf(w: World, o: Partial<Parameters<typeof layerOfPaper>[0]> = {}) {
  const told: string[] = [], parts: Written[] = [], notes: unknown[] = []
  let head: Written | null = null, units: Written[] = []
  const r = await layerOfPaper({
    paper: PAPER, source: source(w), marks: await readOf(w), arxiv: { doc: arxivOf(w.pages) }, OPS, pdfjs: '6.3.289', base: BASE, image: '1',
    onHead: (h, c) => { told.push('head'); head = h; units = c },
    onLeft: l => { told.push(`left ${(l as Written & { page: number }).page}`) },
    onPart: (p, note) => { told.push(`part ${(p as Written & { from: number }).from}`); parts.push(p); notes.push(note) },
    ...o,
  })
  return { r, told, parts, notes, head: head as Written | null, units }
}

/** cutBundle's layer of the same whole, made as the web's producer makes it of one reading of each PDF */
async function cutOf(w: World) {
  const read = await readOf(w)
  const text = await readArxivText(arxivOf(w.pages))
  const texts = w.units.map((u, i) => ({ id: i, ...unitText(u.pieces as never), ...displayEdges(u) }))
  const floating = (id: number) => FLOATING.has(w.units[id]?.kind ?? '')
  const floatMatch = floatMatches(text.tokens, texts, floating)
  const anchors = anchorUnits(text.tokens, texts, { bounds: boundsFromMarks(text.tokens, read.unitMarks!), floating, floatMatch })
  const side = leftSideOf({ doc: text.tokens, views: text.views as number[][], anchors, edges: text.edges })
  const made = await makeLayout({ units: w.units, marks: read.marks, arxiv: arxivOf(w.pages), OPS, paper: PAPER, left: '', pdfjs: '6.3.289', text, floatMatch })
  if (!('file' in made)) throw new Error('refused')
  return cutBundle({ paper: { ...PAPER, pages: w.pages.length }, base: BASE, units: bundleUnitsOf(source(w)), left: { pages: side.pages, units: side.units }, layout: made.file }, { leftPages: side.leftPages, base: BASE, image: '1' })
}
const shas = (ws: readonly Written[]) => ws.map(x => x.sha256)

describe('layerOfPaper: the page pass', () => {
  for (const verdicts of [false, true]) {
    it(`tells cutBundle's layer of the same whole, byte for byte, the head first and each part after its left parts (verdicts ${verdicts ? 'on' : 'off'})`, async () => {
      const w = worldOf()
      const want = await cutOf(w)
      const got = await passOf(w, { verdicts })
      expect(got.r).toMatchObject({ through: 3, count: 2 })
      expect(shas(got.units)).toEqual(shas(want.units))
      expect(got.head?.sha256).toBe(want.head.sha256)
      expect(shas(got.parts)).toEqual(shas(want.parts))
      expect(got.told).toEqual(['head', 'left 1', 'part 1', 'left 2', 'left 3', 'part 2'])
      expect(got.notes).toEqual([{ pages: [1, 1], layout: 'kept', lines: [10, 10] }, { pages: [2, 3], layout: 'kept', lines: [20, 20] }])
    })
  }

  for (const verdicts of [false, true]) {
    it(`under the oracle (a whole run's frame and edges), made a page at a time: the same layer, each part cut once what it reads is final (verdicts ${verdicts ? 'on' : 'off'})`, async () => {
      const w = worldOf()
      const capture: { frame?: unknown; columnEdges?: unknown } = {}
      const want = await passOf(w, { verdicts, capture: capture as never })
      expect(capture.frame).toBeTypeOf('function')
      expect(capture.columnEdges).toBeInstanceOf(Map)
      const got = await passOf(w, { verdicts, oracle: capture as never })
      expect(shas(got.units)).toEqual(shas(want.units))
      expect(got.head?.sha256).toBe(want.head?.sha256)
      expect(shas(got.parts)).toEqual(shas(want.parts))
      expect(got.told).toEqual(want.told)
      expect(got.notes).toEqual(want.notes)
      // (each part's pages, and the arXiv page read when it was cut)
      const closed = (got.r as { stats: { closed: [number, number, number][] } }).stats.closed
      expect(closed.map(c => c.slice(0, 2))).toEqual([[1, 1], [2, 3]])
      for (const [, to, at] of closed) expect(at).toBeGreaterThanOrEqual(to)
    })
  }

  it('a part whose marked pages carry less than CARRY_MIN of their lines has no layout; the others keep theirs, read in order', async () => {
    // three of page 1's ten lines set otherwise on arXiv's: 70 % of part 1's lines, 90 % of the paper's (the maker makes the file)
    const w = worldOf((p, j) => p === 1 && j >= 7)
    const got = await passOf(w)
    expect(got.notes).toEqual([{ pages: [1, 1], layout: { refused: 'carry', lines: [7, 10] }, lines: [7, 10] }, { pages: [2, 3], layout: 'kept', lines: [20, 20] }])
    const wire = got.parts.map(p => JSON.parse(new TextDecoder().decode(p.bytes)) as { layout: unknown; addon: unknown })
    expect(wire.map(p => p.layout === null)).toEqual([true, false])
    // off, the same paper's parts both have their layout
    const off = await passOf(w, { verdicts: false })
    expect(off.parts.map(p => (JSON.parse(new TextDecoder().decode(p.bytes)) as { layout: unknown }).layout === null)).toEqual([false, false])
    expect(shas(off.parts.slice(1))).not.toEqual(shas(got.parts.slice(1)))
  })

  it('with the marks refused, the layer has no layout and its left is placed by the units\' text alone', async () => {
    const w = worldOf()
    const got = await passOf(w, { marks: { refused: 'probe' } as never })
    expect(got.notes).toEqual([{ pages: [1, 1], layout: 'none', lines: [0, 0] }, { pages: [2, 3], layout: 'none', lines: [0, 0] }])
    expect(got.r).toMatchObject({ count: 2, stats: { layout: { refused: 'probe' }, plans: null, addon: null } })
  })

  it('a throw of the maker\'s is the layout\'s: the layer is made with none, the why recorded', async () => {
    const w = worldOf()
    const got = await passOf(w, { marks: { marks: {}, unitMarks: null } as never })
    expect(got.r).toMatchObject({ count: 2, stats: { layout: { refused: 'failed' } } })
    expect(got.notes.every(n => (n as { layout: unknown }).layout === 'none')).toBe(true)
  })

  it('refuses a paper whose left locates no unit, telling nothing', async () => {
    const w = { ...worldOf(), units: [unit('para', [text('nothing on any page of this paper says these words at all')])] }
    const got = await passOf(w, { marks: { refused: 'probe' } as never })
    expect(got.r).toMatchObject({ refused: 'anchors' })
    expect(got.told).toEqual([])
  })
})
