import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { cutBundle } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import { indexOf, mergeParts, type PartChain, type ReadPart, type ReadUnitsChunk, readHead, readPart, readUnitsChunk, type Written } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { indexLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { DEFAULT_RULES, makeLayout, WHOLE_RULES } from '@/pdf-reader/engine/layout/make.mjs'
import { readMarked } from '@/pdf-reader/engine/layout/marks.mjs'
import { anchorUnits, boundsFromMarks, floatMatches } from '@/pdf-reader/engine/pipeline/anchors.mjs'
import { leftSideOf } from '@/pdf-reader/engine/pipeline/left-side.mjs'
import { layerOfPaper, layoutRecordOf } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { displayEdges, unitText } from '@/pdf-reader/engine/translate/mt.mjs'
import { lineCheckOf } from '@/pdf-reader/engine/layout/carry.mjs'
import { movedLinesOf } from '@/pdf-reader/engine/pipeline/moved-lines.mjs'
import { deltaOf } from './helpers/delta-pdfs'
import { arxivOf, basePagesOf, endOf, type Mark, markedOf, type Run, text, unit, words, type World } from './helpers/make-world'

// The page pass (pipeline/page-pass.mjs layerOfPaper) over the layout maker's fake world: a paper's layer made from its marks,
// our base page (the marked original's final pass: its pages, `ours`) and arXiv's PDF (the left's, and the line check's), told
// a part at a time, equal to cutBundle's of the same whole made as the web's producer makes it; each part judged by the line
// check's share of its pages and by its own reader

const PAPER = { id: '2608.04322', version: 1 }
/** arXiv's PDF (the head's `orig`) and our base page's bytes, digest and startxref */
const BASE = { bytes: 10_000, sha256: '0123456789abcdef'.repeat(4), xref: 9_000 }
const OURS = { bytes: 12_000, sha256: 'fedcba9876543210'.repeat(4), xref: 11_500 }
/** our base page of a world, checked against the draft by the host (`check`), the doc given or the base pages' */
const oursOf = (w: World, doc: unknown = null) => ({ doc: doc ?? markedOf(basePagesOf(w), w.marks), ...OURS, check: { marks: w.marks.length } })
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
    paper: PAPER, source: source(w), marks: await readOf(w), arxiv: { doc: arxivOf(w.pages) }, ours: oursOf(w), orig: BASE, tree: '2025', OPS, pdfjs: '6.3.289', image: '1',
    onHead: (h, c) => { told.push('head'); head = h; units = c },
    onLeft: l => { told.push(`left ${(l as Written & { page: number }).page}`) },
    onPart: (p, note) => { told.push(`part ${(p as Written & { from: number }).from}`); parts.push(p); notes.push(note) },
    ...o,
  })
  return { r, told, parts, notes, head: head as Written | null, units }
}

/** cutBundle's layer of the same whole, made as the web's producer makes it of one reading of each PDF: the left on arXiv's
 *  text, the layout over our base page, the line check of the two, the head's base ours */
async function cutOf(w: World) {
  const read = await readOf(w)
  const text = await readArxivText(arxivOf(w.pages)), doc = oursOf(w).doc, baseText = await readArxivText(doc as never)
  const texts = w.units.map((u, i) => ({ id: i, ...unitText(u.pieces as never), ...displayEdges(u) }))
  const floating = (id: number) => FLOATING.has(w.units[id]?.kind ?? '')
  const anchors = anchorUnits(text.tokens, texts, { bounds: boundsFromMarks(text.tokens, read.unitMarks!), floating, floatMatch: floatMatches(text.tokens, texts, floating) })
  const side = leftSideOf({ doc: text.tokens, views: text.views as number[][], anchors, edges: text.edges })
  const lineCheck = lineCheckOf(baseText.tokens, text.tokens), L = lineCheck.lines
  const made = await makeLayout({ units: w.units, marks: read.marks, arxiv: doc, OPS, paper: PAPER, left: '', pdfjs: '6.3.289', text: baseText, lineCheck, floatMatch: floatMatches(baseText.tokens, texts, floating) })
  if (!('file' in made)) throw new Error('refused')
  const N = w.pages.length, base = { source: 'ours' as const, ...OURS, pages: N, tree: '2025', check: { pages: [N, N] as [number, number], boxes: 'equal' as const, carried: L.placed / L.total } }
  // (each left part with its page's line map, as the page pass writes it: pipeline/moved-lines.mjs, an empty list on a page in place)
  const moved = movedLinesOf(lineCheck, baseText.tokens)
  const leftPages = async (p: number) => { const l = await side.leftPages(p), e = moved.get(p); return l && e ? { ...l, lines: e } : l }
  return cutBundle({ paper: { ...PAPER, pages: N }, base, units: bundleUnitsOf(source(w)), left: { pages: side.pages, units: side.units }, layout: made.file }, { leftPages, base, orig: BASE, image: '1', draw: true })
}
const shas = (ws: readonly Written[]) => ws.map(x => x.sha256)

describe('layoutRecordOf: a part with no layout says why in words that are true', () => {
  it('a re-cut after the maker died says it died, never that the maker refused the paper (2610.21924\'s "the layout maker refused it (memory)")', () => {
    expect(layoutRecordOf({ refused: 'memory' })).toEqual({ refused: 'marks', why: 'the layout maker ran out of memory, and the parts were cut again without it' })
    expect(layoutRecordOf({ refused: 'clock' })?.why).toBe('the layout maker passed its clock, and the parts were cut again without it')
    expect(layoutRecordOf({ refused: 'crashed' })?.why).toBe('the layout maker exited, and the parts were cut again without it')
    // (a refusal of the maker's own keeps its words)
    expect(layoutRecordOf({ refused: 'pages' })?.why).toBe('the layout maker refused it (pages)')
  })
})

describe("layerOfPaper: a colour piece's fill reaches the reader (#407)", () => {
  it("each part carries the colour rows of its own units, and the reader's colourOf reads them back", async () => {
    // (page 2's paragraph in \\textcolor{blue}, its fill as the marked original's log gives it)
    const w = worldOf()
    const blue = w.units[1]!
    w.units[1] = { ...blue, pieces: [{ t: 'open', id: 1, src: '\\textcolor{blue}{' }, ...blue.pieces, { t: 'close', id: 1, src: '}' }] } as never
    const log = 'AXT-COLOUR c1.0 0 0 1 rg 0 0 1 RG\n'
    const marks = await readMarked(markedOf(w.marked ?? w.pages, w.marks), log, { engine: 'pdflatex', switches: null, inkless: null, texts: null, names: null, units: w.units, OPS } as never)
    const got = await passOf(w, { marks } as never)
    expect(got.r).toMatchObject({ through: 3, count: 2 })
    // read back as the service reads a cut: the head, the units' chunks, each part in order
    const rh = await readHead(got.head!.bytes, { ref: got.head!.ref })
    const chunks: ReadUnitsChunk[] = []
    for (const u of got.units) chunks.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: chunks.at(-1) ?? null }))
    const index = indexOf(rh, chunks), parts: ReadPart[] = []
    let chain: PartChain | null = null
    for (const p of got.parts) { const r = await readPart(p.bytes, { ref: p.ref, index, chain }); parts.push(r); chain = r.chain }
    expect(parts.map(p => p.layout?.colours ?? null)).toEqual([null, [[1, 0, 0x0000ff]]])
    // (the reader's: the layer's tex.mjs, which opens a canvas at import, as a browser's modules may)
    const g = globalThis as { OffscreenCanvas?: unknown }, had = g.OffscreenCanvas
    g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return null } }
    try {
      const { colourOf } = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
      const lu = indexLayout(mergeParts(index, parts).layout!).unit(1)
      expect(colourOf(lu as never, [0, -1, 2])(0)).toBe(0x0000ff)
    } finally { g.OffscreenCanvas = had }
  })
})

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
    // (the base page's page 3, its ink asked for: the maker's own call throws)
    const doc = oursOf(w).doc as ReturnType<typeof markedOf>
    // (its box read once by the base page's checks, before the maker reads its ink)
    let read = 0
    const broken = { ...doc, getPage: async (n: number) => { const p = await doc.getPage(n); return n === 3 ? { ...p, get rotate(): number { if (read++ === 0) return 0; throw new Error('a broken page') } } : p } }
    const got = await passOf(w, { oracle: capture as never, ours: oursOf(w, broken) as never })
    expect(got.told).toEqual(['head', 'left 1', 'part 1', 'left 2', 'left 3', 'part 2'])
    expect(got.notes).toEqual([{ pages: [1, 1], layout: 'kept', lines: [10, 10] }, { pages: [2, 3], layout: 'none', lines: [20, 20] }])
    expect(shas(got.parts.slice(0, 1))).toEqual(shas(want.parts.slice(0, 1)))
    expect(got.r).toMatchObject({ count: 2, stats: { layout: { refused: 'failed', why: 'a broken page' } } })
  })

  it('the oracle\'s cell-rule totals are the whole run\'s, counted before the told parts drop their rules', async () => {
    const w = worldOf()
    const capture: Record<string, unknown> = {}
    const want = await passOf(w, { capture: capture as never })
    const got = await passOf(w, { oracle: capture as never })
    const rules = (r: unknown) => (r as { stats: { rules: unknown } }).stats.rules
    expect(rules(want.r)).toMatchObject({ pages: expect.any(Number) })
    expect(rules(got.r)).toEqual(rules(want.r))
  })

  it('a throw of the maker\'s with no message is a failure all the same: the rest cut with no layout', async () => {
    const w = worldOf()
    const capture: Record<string, unknown> = {}
    await passOf(w, { capture: capture as never })
    const doc = oursOf(w).doc as ReturnType<typeof markedOf>
    // (its box read once by the base page's checks, before the maker reads its ink)
    let read = 0
    const broken = { ...doc, getPage: async (n: number) => { const p = await doc.getPage(n); return n === 3 ? { ...p, get rotate(): number { if (read++ === 0) return 0; throw new Error('') } } : p } }
    const got = await passOf(w, { oracle: capture as never, ours: oursOf(w, broken) as never })
    expect(got.notes[1]).toMatchObject({ pages: [2, 3], layout: 'none' })
    expect(got.r).toMatchObject({ stats: { layout: { refused: 'failed' } } })
  })

  it('a unit with a line not in place on arXiv\'s gets no row; every part keeps its layout, the same with the verdicts on or off', async () => {
    // three of page 1's ten lines set otherwise on arXiv's: page 1's paragraph left the original's, the others laid
    const w = worldOf((p, j) => p === 1 && j >= 7)
    const got = await passOf(w)
    expect(got.notes).toEqual([{ pages: [1, 1], layout: 'kept', lines: [7, 10] }, { pages: [2, 3], layout: 'kept', lines: [20, 20] }])
    const wire = got.parts.map(p => JSON.parse(new TextDecoder().decode(p.bytes)) as { layout: { units: number[][] } | null })
    expect(wire.map(x => x.layout?.units.map(u => u[0]))).toEqual([[], [1, 2]])
    const off = await passOf(w, { verdicts: false })
    expect(shas(off.parts)).toEqual(shas(got.parts))
  })

  it('a paper no page of which is arXiv\'s page falls back to arXiv\'s PDF: nothing told before the head, every part with no layout, in the stream as made whole', async () => {
    // (arXiv's pages hold our pages 2, 3 and 1: every line found, on another page)
    const w0 = worldOf(), w = { ...w0, marked: w0.pages, pages: [1, 2, 0].map(i => w0.pages[i] as (typeof w0.pages)[number]) }
    const capture: Record<string, unknown> = {}
    const whole = await passOf(w, { whole: true })
    const why = '0 of the 3 units on a page that is arXiv\'s page'
    for (const got of [whole, await passOf(w), await passOf(w, { capture: capture as never }), await passOf(w, { oracle: capture as never })]) {
      expect(got.told, JSON.stringify(got.r)).toEqual(['head', 'left 1', 'part 1', 'left 2', 'left 3', 'part 2'])
      const head = await readHead(got.head!.bytes, { ref: got.head!.ref })
      expect(head.base).toEqual({ source: 'arxiv', ...BASE, why: 'carry' })
      expect(got.parts.map(p => (JSON.parse(new TextDecoder().decode(p.bytes)) as { layout: unknown }).layout)).toEqual([{ refused: 'carry', why }, { refused: 'carry', why }])
      expect(got.notes.map(n => (n as { layout: unknown }).layout)).toEqual(['none', 'none'])
      expect(got.r).toMatchObject({ stats: { layout: { refused: 'carry' } } })
      expect(shas(got.parts)).toEqual(shas(whole.parts))
      expect(got.head?.sha256).toBe(whole.head?.sha256)
    }
  })

  it('with the marks refused, the layer has no layout and its left is placed by the units\' text alone', async () => {
    const w = worldOf()
    const got = await passOf(w, { marks: { refused: 'probe' } as never })
    expect(got.notes).toEqual([{ pages: [1, 1], layout: 'none', lines: [0, 0] }, { pages: [2, 3], layout: 'none', lines: [0, 0] }])
    expect(got.r).toMatchObject({ count: 2, stats: { layout: { refused: 'probe' }, rules: null } })
  })

  it('with TeX\'s refusal, the record keeps the unmarked original\'s verdict; each part\'s says why alone', async () => {
    const w = worldOf()
    const own = { ran: false, short: false, limit: null, tree: '2025' }
    const why = 'the paper (revtex4-2) declares TeX Live 2023; on TeX Live 2025 its own source does not run through'
    const got = await passOf(w, { marks: { refused: 'texlive', why, own } as never })
    expect(got.r).toMatchObject({ count: 2, stats: { layout: { refused: 'texlive', why, own } } })
    for (const p of got.parts) expect((JSON.parse(new TextDecoder().decode(p.bytes)) as { layout: unknown }).layout).toEqual({ refused: 'texlive', why })
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

/** six pages: page 1 one column, a caption alone (a cover page under rule 3); pages 2-5 two columns; page 6 one column, the
 *  paragraph whose column the caption is centred on (the review of P2's B1: the cover page waits for page 6, not for page 2).
 *  `alone`: no page 6, every page after the cover two columns (no later page of its columns, so nothing to wait for) */
function coverWorld(alone = false): World {
  const ws = (rs: Run[]) => rs.map(r => r.s).join(' ')
  const cap = [{ s: 'Figure caption text', x: 172 - 47.5, y: 600 }, { s: 'its end', x: 172 - 17.5, y: 588 }]
  const para = [0, 1, 2, 3].map((j): Run => ({ s: `${'abcd efgh '.repeat(3)}line${j} wxyz`, x: 72, y: 700 - 12 * j }))
  para.push({ s: 'last line of it', x: 72, y: 652 })
  const COLS2 = (page: number): Mark => [`c2-${page}`, page, 0, 0]
  const twoOn = (o: number) => [...Array.from({ length: 4 }, (_, j): Run => ({ s: words(o + 10 * j, 10), x: 60, y: 700 - 12 * j })), ...Array.from({ length: 6 }, (_, j): Run => ({ s: words(o + 40 + 10 * j, 10), x: 320, y: 700 - 12 * j }))]
  const lastTwo = twoOn(0).at(-1) as Run
  const w: World = {
    pages: [{ runs: cap }, { runs: twoOn(0) }, { runs: twoOn(100) }, { runs: twoOn(200) }, { runs: twoOn(300) }, { runs: para }],
    marks: [
      ['0s', 1, cap[0]?.x ?? 0, 600], ['0e', 1, endOf(cap[1] as Run), 588],
      ...[2, 3, 4, 5].flatMap((pg, k): Mark[] => [COLS2(pg), [`${k + 1}s`, pg, 60, 700], [`${k + 1}e`, pg, endOf(lastTwo), lastTwo.y]]),
      ['5s', 6, 72, 700], ['5e', 6, endOf(para[4] as Run), 652],
    ],
    units: [unit('caption', [text(ws(cap))]), ...[0, 100, 200, 300].map(o => unit('para', [text(words(o, 100))])), unit('para', [text(ws(para))])],
  }
  if (alone) return { pages: w.pages.slice(0, 5), marks: w.marks.filter(m => m[1] !== 6), units: w.units.slice(0, 5) }
  return w
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

describe('layerOfPaper: a marked original of fewer pages than arXiv\'s PDF', () => {
  /** worldOf's three pages on arXiv's, the marked original their first two alone, every line of it carried: a compile that
   *  stopped short of the paper's end (2610.20713 on TL2025, 7 pages of 15, 95 % of its lines carried) */
  const shortWorld = (): World => { const w = worldOf(); return { ...w, marked: w.pages.slice(0, 2), marks: w.marks.filter(m => m[1] <= 2) } }
  const layouts = (notes: unknown[]) => notes.map(n => (n as { layout: unknown }).layout)

  it('is no layout, the compile\'s refusal: the layer of a paper whose compile was refused, the marks given or read here', async () => {
    const w = shortWorld()
    const none = await passOf(w, { marks: { refused: 'compile', why: 'the marked original has 2 pages, arXiv\'s PDF 3' } as never })
    expect(layouts(none.notes)).toEqual(['none', 'none'])
    for (const input of [{}, { whole: true }, { marks: null, marked: markedIn(w) }, { marks: null, marked: markedIn(w), whole: true }]) {
      const got = await passOf(w, input as never)
      const at = JSON.stringify(input)
      expect(got.r, at).toMatchObject({ count: 2, stats: { layout: { refused: 'compile', why: 'the marked original has 2 pages, arXiv\'s PDF 3' }, rules: null } })
      expect(got.notes, at).toEqual(none.notes)
      // (the left by the units' text alone, as with the compile refused: no unit mark of the short original bounds it)
      expect(got.told, at).toEqual(none.told)
      expect(shas(got.parts), at).toEqual(shas(none.parts))
    }
  })

  it('of a paper of several toplevel sources (00README\'s) is compared with arXiv\'s first pages; its base page, the first file\'s alone, is not arXiv\'s pages: `boxes`', async () => {
    // (2610.20030: arXiv's PDF the manuscript's 8 pages and the supplement's 4, the marked original the manuscript's alone; the
    // reader's identity map needs our base page to have arXiv's pages, so the paper falls back)
    const w = shortWorld()
    for (const input of [{}, { marks: null, marked: markedIn(w) }]) {
      const got = await passOf(w, { ...input, source: { ...(source(w) as object), meta: { toplevels: 2 } } } as never)
      const at = JSON.stringify(input)
      expect(layouts(got.notes), at).toEqual(['none', 'none'])
      expect(got.r, at).toMatchObject({ stats: { toplevels: { files: 2, pages: [2, 3] }, layout: { refused: 'boxes', why: 'our base page has 2 pages, arXiv\'s PDF 3' } } })
    }
    // (one toplevel source, or none named: refused as before)
    for (const meta of [{ toplevels: 1 }, { toplevels: 0 }, {}]) expect((await passOf(w, { source: { ...(source(w) as object), meta } } as never)).r).toMatchObject({ stats: { layout: { refused: 'compile' } } })
  })

  it('of a paper of several toplevel sources, held as a delta over arXiv\'s PDF: our 2 pages laid, arXiv\'s third its own (check [2, 3]); one toplevel source still `compile`', async () => {
    const w = shortWorld()
    const delta = await deltaOf(BASE, [1, 2])
    for (const input of [{}, { marks: null, marked: markedIn(w) }]) {
      const got = await passOf(w, { ...input, ours: { ...oursOf(w), delta }, source: { ...(source(w) as object), meta: { toplevels: 2 } } } as never)
      const at = JSON.stringify(input)
      expect(got.r, at).toMatchObject({ stats: { toplevels: { files: 2, pages: [2, 3] }, delta: { kind: 'delta', replaced: 2 } } })
      const head = await readHead(got.head!.bytes, { ref: got.head!.ref })
      expect(head.base, at).toMatchObject({ source: 'ours', kind: 'delta', pages: 3, check: { pages: [2, 3], boxes: 'equal' }, replaced: [[1, 2]] })
      expect(layouts(got.notes), at).toContain('kept')
    }
    // (a replaced page past ours: the delta does not check, and our two pages are not arXiv's three: `boxes`)
    const past = await passOf(w, { ours: { ...oursOf(w), delta: await deltaOf(BASE, [1, 3]) }, source: { ...(source(w) as object), meta: { toplevels: 2 } } } as never)
    expect(past.r).toMatchObject({ stats: { layout: { refused: 'boxes' } } })
    // (one toplevel source: the compile's refusal, delta or none)
    expect((await passOf(w, { ours: { ...oursOf(w), delta }, source: { ...(source(w) as object), meta: { toplevels: 1 } } } as never)).r).toMatchObject({ stats: { layout: { refused: 'compile' } } })
  })

  it('as many pages is the line check\'s to judge; more, a base page of other pages than arXiv\'s (`boxes`)', async () => {
    const w = worldOf()
    const longer = { ...w, marked: [...w.pages, { runs: [] }] }
    for (const input of [{}, { marks: null, marked: markedIn(w) }]) expect(layouts((await passOf(w, input as never)).notes)).toEqual(['kept', 'kept'])
    for (const input of [{}, { marks: null, marked: markedIn(longer) }]) expect((await passOf(longer, input as never)).r).toMatchObject({ stats: { layout: { refused: 'boxes' } } })
  })
})

describe('layerOfPaper: each part with no layout says why, on the wire (BUNDLE 6, R1 item 4)', () => {
  /** each part as a reader reads it: its layout (null) and its record */
  async function readBack(got: Awaited<ReturnType<typeof passOf>>) {
    const rh = await readHead(got.head!.bytes, { ref: got.head!.ref })
    const chunks: ReadUnitsChunk[] = []
    for (const u of got.units) chunks.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: chunks.at(-1) ?? null }))
    const index = indexOf(rh, chunks), parts: ReadPart[] = []
    let chain: PartChain | null = null
    for (const p of got.parts) { const r = await readPart(p.bytes, { ref: p.ref, index, chain }); parts.push(r); chain = r.chain }
    return parts.map(p => ({ layout: p.layout, noLayout: p.noLayout }))
  }
  it('the paper\'s refusal on every part: TeX\'s as the marked original says it, every fault of the engine\'s own as `marks`', async () => {
    const w = worldOf()
    const tl = 'the paper (revtex4-2) declares TeX Live 2023; on TeX Live 2025 its own source does not run through: ! Extra \\or. (l.944 \\end{tabularx})'
    const cases: [Record<string, unknown>, { refused: string; why: string }][] = [
      [{ refused: 'probe' }, { refused: 'marks', why: 'the mark probe gave no log' }],
      [{ refused: 'marks' }, { refused: 'marks', why: 'the marked original could not be read' }],
      [{ refused: 'marks', why: 'the marked original does not run through, nor with the name marks off' }, { refused: 'marks', why: 'the marked original does not run through, nor with the name marks off' }],
      [{ refused: 'texlive', why: tl }, { refused: 'texlive', why: tl }],
      [{ refused: 'engine', why: 'the paper is compiled by latex, which the host does not run' }, { refused: 'engine', why: 'the paper is compiled by latex, which the host does not run' }],
      [{ refused: 'compile' }, { refused: 'compile', why: 'the marked compile was refused' }],
      [{ refused: 'compile', why: 'y'.repeat(400) }, { refused: 'compile', why: 'y'.repeat(300) }],
    ]
    for (const [marks, record] of cases) {
      const got = await passOf(w, { marks } as never)
      expect(await readBack(got), JSON.stringify(marks)).toEqual([{ layout: null, noLayout: record }, { layout: null, noLayout: record }])
    }
  })

  it('the maker\'s throw, the page count\'s refusal, and a part the carry refused beside one that keeps its layout', async () => {
    const thrown = await readBack(await passOf(worldOf(), { marks: { marks: {}, unitMarks: null } as never }))
    expect(thrown.map(p => p.noLayout?.refused)).toEqual(['marks', 'marks'])
    expect(thrown[0]?.noLayout?.why).toMatch(/^the layout maker failed: /)
    const w = worldOf()
    const short = { ...w, marked: w.pages.slice(0, 2), marks: w.marks.filter(m => m[1] <= 2) }
    expect(await readBack(await passOf(short))).toEqual(Array(2).fill({ layout: null, noLayout: { refused: 'compile', why: 'the marked original has 2 pages, arXiv\'s PDF 3' } }))
    // (a unit not in place: its part keeps its layout, the unit left out of it)
    const carried = await readBack(await passOf(worldOf((p, j) => p === 1 && j >= 7)))
    expect(carried.map(p => p.noLayout)).toEqual([null, null])
    // (no unit laid, the marked original read here: every part, the paper's refusal)
    const none = { ...worldOf(), marked: [1, 2, 3].map(() => ({ runs: [] })) }
    const all = await readBack(await passOf(none, { marks: null, marked: markedIn(none) } as never))
    expect(all.map(p => p.noLayout)).toEqual(Array(2).fill({ refused: 'carry', why: '0 of the 3 units on a page that is arXiv\'s page' }))
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
      for (const [w, cover] of [[worldOf(), false], [deferredWorld(), false], [coverWorld(), true], [coverWorld(true), false]] as const) {
        for (const input of [{}, { marks: null, marked: markedIn(w) }]) {
          const want = await passOf(w, { verdicts, rules, whole: true, ...input } as never)
          const got = await passOf(w, { verdicts, rules, ...input } as never)
          // (and with no rule given, the default: production's own call)
          const byDefault = await passOf(w, { verdicts, ...input } as never)
          expect(byDefault.told).toEqual(want.told)
          expect(shas(byDefault.parts)).toEqual(shas(want.parts))
          expect(got.told).toEqual(want.told)
          expect(shas(got.units)).toEqual(shas(want.units))
          expect(got.head?.sha256).toBe(want.head?.sha256)
          expect(shas(got.parts)).toEqual(shas(want.parts))
          expect(got.notes).toEqual(want.notes)
          const closed = (got.r as { stats: { closed?: [number, number, number][] } }).stats.closed
          // (a cover page waits for the first later page of its own columns: here the last, so the parts with it)
          if (cover) expect(closed?.[0]?.[2]).toBe(w.pages.length)
          else expect(closed?.[0]?.[2]).toBeLessThan(w.pages.length)
        }
      }
    })
  }

  it('by default the page stream (rules 1, 3 and 4, DEFAULT_RULES); a rule of the whole run\'s, or `whole`, the whole made first (no part cut early)', async () => {
    const w = worldOf()
    expect(DEFAULT_RULES).toEqual({ ...rules, floatSearch: 'whole' })
    const streamed = await passOf(w, {} as never)
    expect((streamed.r as { stats: { closed?: unknown } }).stats.closed).toBeDefined()
    for (const o of [{ rules: WHOLE_RULES }, { rules: { columns: 'units' } }, { rules: { edges: 'all' } }, { rules: { frame: 'units' } }, { whole: true }, { rules, whole: true }]) {
      const got = await passOf(w, o as never)
      expect((got.r as { stats: { closed?: unknown } }).stats.closed).toBeUndefined()
    }
  })
})
