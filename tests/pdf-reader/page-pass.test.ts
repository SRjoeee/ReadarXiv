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
const source = (w: World) => ({ units: w.units, kept: new Set(), inFloat: [] }) as never
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

  it('under the oracle, a part is cut before the last page is read (an early close, not one flush at the end)', async () => {
    const w = worldOf()
    const capture: Record<string, unknown> = {}
    await passOf(w, { capture: capture as never })
    const got = await passOf(w, { oracle: capture as never })
    const closed = (got.r as { stats: { closed: [number, number, number][] } }).stats.closed
    expect(closed[0]![2]).toBeLessThan(w.pages.length)
  })

  it('a sink that throws ends the pass in both modes: nothing told twice, the throw the host\'s (the stage-1 review\'s B2)', async () => {
    const w = worldOf()
    const capture: Record<string, unknown> = {}
    await passOf(w, { capture: capture as never })
    for (const o of [{}, { oracle: capture }]) {
      const told: string[] = []
      let parts = 0
      const ran = await passOf(w, {
        ...o,
        onHead: () => { told.push('head') }, onLeft: (l: Written & { page: number }) => { told.push(`left ${l.page}`) },
        onPart: (p: Written & { from: number }) => { told.push(`part ${p.from}`); if (++parts === 1) throw new Error('the host cancels') },
      } as never).catch(e => e)
      expect(ran).toBeInstanceOf(Error)
      expect(String(ran)).toMatch(/cancels/)
      expect(told).toEqual(['head', 'left 1', 'part 1'])
    }
  })

  it('a throw of the maker\'s after a part is told: the parts told stand, the rest cut with no layout, nothing told twice', async () => {
    const w = worldOf()
    const capture: Record<string, unknown> = {}
    const want = await passOf(w, { capture: capture as never })
    // (arXiv's page 3, its ink asked for: the maker's own call throws)
    const doc = arxivOf(w.pages)
    const broken = { ...doc, getPage: async (n: number) => { const p = await doc.getPage(n); return n === 3 ? { ...p, get rotate(): number { throw new Error('a broken page') } } : p } }
    const got = await passOf(w, { oracle: capture as never, arxiv: { doc: broken } as never })
    expect(got.told).toEqual(['head', 'left 1', 'part 1', 'left 2', 'left 3', 'part 2'])
    expect(got.notes).toEqual([{ pages: [1, 1], layout: 'kept', lines: [10, 10] }, { pages: [2, 3], layout: 'none', lines: [20, 20] }])
    expect(shas(got.parts.slice(0, 1))).toEqual(shas(want.parts.slice(0, 1)))
    expect(got.r).toMatchObject({ count: 2, stats: { layout: { refused: 'failed', why: 'a broken page' } } })
  })

  it('the oracle\'s plan totals are the whole run\'s, counted before the told parts drop their plans', async () => {
    const w = worldOf()
    const capture: Record<string, unknown> = {}
    const want = await passOf(w, { capture: capture as never })
    const got = await passOf(w, { oracle: capture as never })
    const plans = (r: unknown) => (r as { stats: { plans: unknown } }).stats.plans
    expect(plans(want.r)).toMatchObject({ pages: 3 })
    expect(plans(got.r)).toEqual(plans(want.r))
  })

  it('a throw of the maker\'s with no message is a failure all the same: the rest cut with no layout', async () => {
    const w = worldOf()
    const capture: Record<string, unknown> = {}
    await passOf(w, { capture: capture as never })
    const doc = arxivOf(w.pages)
    const broken = { ...doc, getPage: async (n: number) => { const p = await doc.getPage(n); return n === 3 ? { ...p, get rotate(): number { throw new Error('') } } : p } }
    const got = await passOf(w, { oracle: capture as never, arxiv: { doc: broken } as never })
    expect(got.notes[1]).toMatchObject({ pages: [2, 3], layout: 'none' })
    expect(got.r).toMatchObject({ stats: { layout: { refused: 'failed' } } })
  })

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

/** the marked original to be read by the pass itself (layerOfPaper `marked`) */
const markedIn = (w: World) => ({ doc: markedOf(w.marked ?? w.pages, w.marks), log: '', options: { engine: 'pdflatex', switches: null, inkless: null, texts: null, names: null } })
/** five pages of ten lines, a paragraph a page; units 1 and 2 two figures' text boxes set past the two paragraphs after them
 *  (the stage-1 re-review's m2: the units' order is not their pages') */
function deferredWorld(): World {
  const at = [1, 4, 5, 2, 3]
  const pages = [1, 2, 3, 4, 5].map(p => ({ runs: linesOf(p) }))
  const marks: World['marks'] = []
  at.forEach((p, i) => { const ls = linesOf(p); marks.push([`${i}s`, p, 72, 700], [`${i}e`, p, endOf(ls[9] as Run), 592]) })
  return { pages, marks, units: at.map(p => unit('para', [text(words(100 * p, 100))])) }
}

describe('layerOfPaper: the marked original read by the pass (stage 2)', () => {
  for (const verdicts of [false, true]) {
    it(`read whole first it is the marks given; under the oracle, a page at a time beside arXiv's: the same layer, parts cut early (verdicts ${verdicts ? 'on' : 'off'})`, async () => {
      const w = worldOf()
      const want = await passOf(w, { verdicts })
      const capture: Record<string, unknown> = {}
      const whole = await passOf(w, { verdicts, marks: null, marked: markedIn(w) as never, capture: capture as never })
      expect(whole.told).toEqual(want.told)
      expect(shas(whole.parts)).toEqual(shas(want.parts))
      expect(whole.notes).toEqual(want.notes)
      expect(capture.leftFrame).toBeTypeOf('function')
      expect(Array.isArray(capture.columns)).toBe(true)
      const got = await passOf(w, { verdicts, marks: null, marked: markedIn(w) as never, oracle: capture as never })
      expect(shas(got.units)).toEqual(shas(want.units))
      expect(got.head?.sha256).toBe(want.head?.sha256)
      expect(shas(got.parts)).toEqual(shas(want.parts))
      expect(got.told).toEqual(want.told)
      expect(got.notes).toEqual(want.notes)
      const closed = (got.r as { stats: { closed: [number, number, number][] } }).stats.closed
      expect(closed.map(c => c.slice(0, 2))).toEqual([[1, 1], [2, 3]])
      expect(closed[0]![2]).toBeLessThan(w.pages.length)
    })
  }

  it('two figures\' text boxes set past the paragraphs after them (the re-review\'s m2): each oracle tells the whole run\'s layer', async () => {
    const w = deferredWorld()
    const capture: Record<string, unknown> = {}
    const want = await passOf(w, { capture: capture as never })
    const early = await passOf(w, { oracle: capture as never })
    const marked = await passOf(w, { marks: null, marked: markedIn(w) as never, oracle: capture as never })
    for (const got of [early, marked]) {
      expect(got.told).toEqual(want.told)
      expect(shas(got.parts)).toEqual(shas(want.parts))
      expect(got.notes).toEqual(want.notes)
    }
    expect(want.notes.every(n => (n as { layout: unknown }).layout === 'kept')).toBe(true)
  })

  it('no line of the marked original carried: the carry refused at its end, every part cut with no layout, as read whole', async () => {
    const w = { ...worldOf(), marked: [1, 2, 3].map(() => ({ runs: [] })) }
    const capture: Record<string, unknown> = {}
    const want = await passOf(w, { marks: null, marked: markedIn(w) as never, capture: capture as never })
    expect(want.r).toMatchObject({ stats: { layout: { refused: 'carry' } } })
    // (the left's rules this run's; the maker's, which a run refused never makes, a run with a layout's: what they give is let go)
    const rules: Record<string, unknown> = {}
    await passOf(worldOf(), { capture: rules as never })
    const got = await passOf(w, { marks: null, marked: markedIn(w) as never, oracle: { ...capture, frame: rules.frame, columnEdges: rules.columnEdges } as never })
    expect(got.told).toEqual(want.told)
    expect(shas(got.parts)).toEqual(shas(want.parts))
    expect(got.notes).toEqual(want.notes)
    expect(got.r).toMatchObject({ stats: { layout: { refused: 'carry' } } })
  })

  it('a marked page that cannot be read: the layout fails from there, the left goes on with the unit marks read', async () => {
    const w = worldOf()
    const capture: Record<string, unknown> = {}
    await passOf(w, { marks: null, marked: markedIn(w) as never, capture: capture as never })
    const doc = markedIn(w).doc
    const broken = { ...doc, getPage: async (n: number) => { const p = await doc.getPage(n); return n === 3 ? { ...p, getTextContent: async () => { throw new Error('a broken marked page') } } : p } }
    const got = await passOf(w, { marks: null, marked: { ...markedIn(w), doc: broken } as never, oracle: capture as never })
    expect(got.told).toEqual(['head', 'left 1', 'part 1', 'left 2', 'left 3', 'part 2'])
    expect(got.r).toMatchObject({ count: 2, stats: { layout: { refused: 'failed', why: 'a broken marked page' } } })
    expect((got.notes[1] as { layout: unknown }).layout).toBe('none')
  })

  it('refuses a paper whose left locates no unit, telling nothing, under the oracle too', async () => {
    // (no unit mark either: the unit is looked for by its text alone)
    const w = { ...worldOf(), marks: [], units: [unit('para', [text('nothing on any page of this paper says these words at all')])] }
    const capture: Record<string, unknown> = {}
    await passOf(worldOf(), { capture: capture as never })
    expect((await passOf(w, { marks: null, marked: markedIn(w) as never })).r).toMatchObject({ refused: 'anchors' })
    const got = await passOf(w, { marks: null, marked: markedIn(w) as never, oracle: capture as never })
    expect(got.r).toMatchObject({ refused: 'anchors' })
    expect(got.told).toEqual([])
  })
})

describe('layerOfPaper: the page stream\'s rules (`rules`: rules 1, 3, 4 and 5)', () => {
  it('today\'s by default; under the four rules each oracle tells the whole run\'s layer', async () => {
    const w = deferredWorld()
    const today = await passOf(w)
    const named = await passOf(w, { rules: { frame: 'units', edges: 'all', columns: 'units', floatSearch: 'whole' } })
    expect(shas(named.parts)).toEqual(shas(today.parts))
    const rules = { frame: 'tokens', edges: 'earlier', columns: 'tokens', floatSearch: 'forward' } as const
    const capture: Record<string, unknown> = {}
    const want = await passOf(w, { rules, marks: null, marked: markedIn(w) as never, capture: capture as never })
    for (const o of [{ oracle: capture }, { oracle: capture, marks: null, marked: markedIn(w) }]) {
      const got = await passOf(w, { rules, ...o } as never)
      expect(got.told).toEqual(want.told)
      expect(shas(got.parts)).toEqual(shas(want.parts))
      expect(got.notes).toEqual(want.notes)
    }
  })

  it('a rule that is none is refused; rule 5 needs the units written inside a float', async () => {
    await expect(passOf(worldOf(), { rules: { columns: 'lines' } as never })).rejects.toThrow(TypeError)
    await expect(passOf(worldOf(), { rules: { floatSearch: 'forward' }, source: { units: worldOf().units, kept: new Set() } as never })).rejects.toThrow(/inFloat/)
  })
})

describe('layerOfPaper: the production stream (rules 1, 3 and 4 give every predicate; no whole run before it)', () => {
  const rules = { frame: 'tokens', edges: 'earlier', columns: 'tokens' } as const
  for (const verdicts of [false, true]) {
    it(`the marks given or the marked original read here: the whole path's layer under the same rules, its first part cut before the last page (verdicts ${verdicts ? 'on' : 'off'})`, async () => {
      for (const w of [worldOf(), deferredWorld()]) {
        for (const input of [{}, { marks: null, marked: markedIn(w) }]) {
          const want = await passOf(w, { verdicts, rules, whole: true, ...input } as never)
          const got = await passOf(w, { verdicts, rules, ...input } as never)
          expect(got.told).toEqual(want.told)
          expect(shas(got.units)).toEqual(shas(want.units))
          expect(got.head?.sha256).toBe(want.head?.sha256)
          expect(shas(got.parts)).toEqual(shas(want.parts))
          expect(got.notes).toEqual(want.notes)
          const closed = (got.r as { stats: { closed?: [number, number, number][] } }).stats.closed
          expect(closed?.[0]?.[2]).toBeLessThan(w.pages.length)
        }
      }
    })
  }

  it('without the three rules, or with `whole`, the whole made first (no part cut early)', async () => {
    const w = worldOf()
    for (const o of [{}, { rules: { frame: 'tokens', edges: 'earlier' } }, { rules, whole: true }]) {
      const got = await passOf(w, o as never)
      expect((got.r as { stats: { closed?: unknown } }).stats.closed).toBeUndefined()
    }
  })
})
