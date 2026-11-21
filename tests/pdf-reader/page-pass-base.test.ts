import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { indexOf, type PartChain, type ReadPart, type ReadUnitsChunk, readHead, readPart, readUnitsChunk, type Written } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { readArxivText } from '@/pdf-reader/engine/layout/arxiv.mjs'
import { deltaOf } from './helpers/delta-pdfs'
import { readMarked } from '@/pdf-reader/engine/layout/marks.mjs'
import { layerOfPaper } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { arxivOf, endOf, markedOf, type Page, type Run, text, unit, words, type World } from './helpers/make-world'

// The page pass over our compile as the base page (BUNDLE 8; design note §3.3, §3.5): the layout made over our base page once it
// passes the page-and-line check, each failing reason a fallback of its own — the head's base arXiv's PDF with why, every part
// with no layout saying the same — and a host of BUNDLE 7's (arXiv's PDF alone, as `base`) as before.

const PAPER = { id: '2608.04322', version: 1 }
const ORIG = { bytes: 10_000, sha256: '0123456789abcdef'.repeat(4), xref: 9_000 }
const OURS = { bytes: 12_000, sha256: 'fedcba9876543210'.repeat(4), xref: 11_500 }
const linesOf = (page: number): Run[] => Array.from({ length: 10 }, (_, j) => ({ s: words(100 * page + 10 * j, 10), x: 72, y: 700 - 12 * j }))
/** three pages of ten lines; arXiv's lines those of ours but those `changed` set in other words */
function worldOf(changed: (page: number, j: number) => boolean = () => false, o: { oursView?: number[] } = {}): World {
  const marked: Page[] = [1, 2, 3].map(p => ({ runs: linesOf(p), ...(o.oursView ? { view: o.oursView } : {}) }))
  const pages: Page[] = [1, 2, 3].map(p => ({ runs: linesOf(p).map((r, j) => (changed(p, j) ? { ...r, s: words(5000 + 100 * p + 10 * j, 10) } : r)) }))
  const marks: World['marks'] = []
  for (const p of [1, 2, 3]) { const ls = linesOf(p); marks.push([`${p - 1}s`, p, 72, 700], [`${p - 1}e`, p, endOf(ls[9] as Run), 592]) }
  return { pages, marked, marks, units: [1, 2, 3].map(p => unit('para', [text(words(100 * p, 100))])) }
}
const source = (w: World) => ({ units: w.units, kept: new Set(), inFloat: [] }) as never
const readOf = (w: World) => readMarked(markedOf(w.marked ?? w.pages, w.marks), '', { engine: 'pdflatex', switches: null, inkless: null, texts: null, names: null, units: w.units, OPS } as never)
/** our base page: the marked original's pages (its final pass: the same places), checked against the draft by the host */
const oursOf = (w: World, more: Record<string, unknown> = {}) => ({ doc: markedOf(w.marked ?? w.pages, w.marks), ...OURS, check: { marks: w.marks.length }, ...more })

async function passOf(w: World, o: Record<string, unknown>) {
  const parts: Written[] = [], notes: unknown[] = []
  let head: Written | null = null, units: Written[] = []
  const r = await layerOfPaper({
    paper: PAPER, source: source(w), marks: await readOf(w), arxiv: { doc: arxivOf(w.pages) }, OPS, pdfjs: '6.3.289', image: '1', tree: '2025',
    onHead: (h: Written, c: Written[]) => { head = h; units = c }, onLeft: () => {}, onPart: (p: Written, note: unknown) => { parts.push(p); notes.push(note) },
    ...o,
  } as never)
  const rh = await readHead((head as unknown as Written).bytes, { ref: (head as unknown as Written).ref })
  const chunks: ReadUnitsChunk[] = []
  for (const u of units) chunks.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: chunks.at(-1) ?? null }))
  const index = indexOf(rh, chunks), read: ReadPart[] = []
  let chain: PartChain | null = null
  for (const p of parts) { const x = await readPart(p.bytes, { ref: p.ref, index, chain }); read.push(x); chain = x.chain }
  return { r, head: rh, parts: read, notes }
}

describe('layerOfPaper over our base page (BUNDLE 8)', () => {
  it('a base of ours that passes: the head names it with its check and arXiv\'s PDF beside it, every part laid', async () => {
    const got = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf()) })
    expect(got.head.base).toEqual({ source: 'ours', ...OURS, pages: 3, tree: '2025', check: { pages: [3, 3], boxes: 'equal', carried: 1 } })
    expect(got.head.orig).toEqual({ bytes: ORIG.bytes, sha256: ORIG.sha256 })
    expect(got.parts.map(p => p.layout !== null)).toEqual([true, true])
    expect(got.notes.map(n => (n as { layout: unknown }).layout)).toEqual(['kept', 'kept'])
  })

  it('no base of ours: arXiv\'s PDF the base, why `final`, every part with no layout saying so (the host\'s why where it gives one)', async () => {
    for (const ours of [null, { refused: 'final', why: 'the final pass did not run through: ! Emergency stop.' }]) {
      const got = await passOf(worldOf(), { orig: ORIG, ours })
      expect(got.head.base).toEqual({ source: 'arxiv', ...ORIG, why: 'final' })
      expect(got.head.orig).toBeNull()
      expect(got.parts.map(p => p.noLayout?.refused)).toEqual(['final', 'final'])
      if (ours) expect(got.parts[0]?.noLayout?.why).toBe(ours.why)
      expect(got.r).toMatchObject({ stats: { layout: { refused: 'final' } } })
    }
  })

  it('each failing reason its own code: a mark printed as text, a final pass not checked, other boxes, other page counts', async () => {
    const w = worldOf()
    const shown = { ...w, marked: (w.marked as Page[]).map((p, i) => (i === 1 ? { runs: [...p.runs, { s: '\\axt@pma{p1.0a}', x: 72, y: 100 }] } : p)) }
    const cases: [string, World, Record<string, unknown>, RegExp][] = [
      ['marks', shown, { ours: oursOf(shown) }, /mark of ours stands as text on page 2/],
      ['final', w, { ours: oursOf(w, { check: null }) }, /not checked against the draft/],
      ['boxes', worldOf(() => false, { oursView: [0, 0, 595.28, 841.89] }), {}, /page 1's box/],
    ]
    for (const [code, world, o, why] of cases) {
      const got = await passOf(world, { orig: ORIG, ours: oursOf(world), ...o })
      expect(got.head.base, code).toMatchObject({ source: 'arxiv', why: code })
      expect(got.parts.every(p => p.noLayout?.refused === code), code).toBe(true)
      expect(got.parts[0]?.noLayout?.why, code).toMatch(why)
    }
    // (our pages more than arXiv's: `boxes`)
    const more = worldOf()
    const longer = { ...more, marked: [...(more.marked as Page[]), { runs: linesOf(4) }] }
    const got = await passOf(more, { orig: ORIG, ours: oursOf(longer) })
    expect(got.head.base).toMatchObject({ source: 'arxiv', why: 'boxes' })
    // (and the TeX Live year, which a base of ours names: none known is no base)
    const noTree = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf()), tree: null })
    expect(noTree.head.base).toMatchObject({ source: 'arxiv', why: 'final' })
  })

  it('a base of ours whose pages 2 and 3 are not arXiv\'s (their lines on the other page): page 1\'s unit laid, the others left the original\'s; no page arXiv\'s, it falls back, `carry`', async () => {
    // (arXiv's pages 2 and 3 hold our pages 3 and 2: every line found, on another page; page 1 in place, 10 of 30)
    const w = worldOf()
    const at = (order: number[]) => order.map(i => (w.pages as Page[])[i] as Page)
    const lower = { ...w, pages: at([0, 2, 1]) }
    const units = (got: Awaited<ReturnType<typeof passOf>>) => got.parts.map(p => p.layout?.units.map(u => u[0]) ?? null)
    for (const whole of [false, true]) {
      const got = await passOf(lower, { orig: ORIG, ours: oursOf(lower), whole })
      expect(got.head.base, String(whole)).toMatchObject({ source: 'ours', check: { carried: 0.3333 } })
      expect(units(got)).toEqual([[0], []])
      // (each part says why each unit it tells is the original's, in the stream as made whole)
      expect(got.parts.map(p => (p.layout as { unlaid?: unknown } | null)?.unlaid ?? null), String(whole)).toEqual([null, [[1, 'undrawn'], [2, 'undrawn']]])
      expect(got.notes.map(n => (n as { lines: unknown }).lines)).toEqual([[10, 10], [0, 20]])
      expect(got.r).toMatchObject({ stats: { layout: { stats: { units: { located: 1, undrawn: 2 } } } } })
    }
    // (no page arXiv's: no unit laid, arXiv's PDF the base, every part with no layout, in the stream as made whole)
    const all = { ...w, pages: at([1, 2, 0]) }
    const why = '0 of the 3 units on a page that is arXiv\'s page'
    for (const whole of [false, true]) {
      const got = await passOf(all, { orig: ORIG, ours: oursOf(all), whole })
      expect(got.head.base, String(whole)).toEqual({ source: 'arxiv', ...ORIG, why: 'carry' })
      expect(got.head.orig).toBeNull()
      expect(got.parts.map(p => p.noLayout)).toEqual([{ refused: 'carry', why }, { refused: 'carry', why }])
      expect(got.r).toMatchObject({ stats: { layout: { refused: 'carry', stats: { units: { located: 0, undrawn: 3 } } } } })
    }
    // (every line a line lower, the same words on each page: every page drawable, every unit laid, no line in place)
    const lowered = { ...w, pages: (w.pages as Page[]).map(p => ({ runs: p.runs.map(r => ({ ...r, y: r.y - 12 })) })) }
    const drawn = await passOf(lowered, { orig: ORIG, ours: oursOf(lowered) })
    expect(drawn.head.base).toMatchObject({ source: 'ours', check: { carried: 0 } })
    expect(units(drawn)).toEqual([[0], [1, 2]])
    // (half a point off is still in place)
    const near = { ...w, pages: (w.pages as Page[]).map(p => ({ runs: p.runs.map(r => ({ ...r, y: r.y - 0.4 })) })) }
    expect((await passOf(near, { orig: ORIG, ours: oursOf(near) })).head.base).toMatchObject({ source: 'ours', check: { carried: 1 } })
  })

  it('a mark printed as text is refused whether or not the host\'s text of our page reads it, and not where arXiv\'s page holds the same', async () => {
    const w = worldOf()
    const printed = (p: Page[]) => p.map((x, i) => (i === 1 ? { runs: [...x.runs, { s: '\\axt@pma{p1.0a}', x: 72, y: 100 }] } : x))
    const shown = { ...w, marked: printed(w.marked as Page[]) }
    const doc = markedOf(shown.marked, shown.marks)
    const { markText, ...noMarkText } = await readArxivText(doc as never)
    expect(markText?.pages).toEqual([2])
    for (const text of [undefined, noMarkText]) {
      const got = await passOf(shown, { orig: ORIG, ours: oursOf(shown, text ? { text } : {}) })
      expect(got.head.base, String(!!text)).toMatchObject({ source: 'arxiv', why: 'marks' })
    }
    // (arXiv's own page 2 prints the same: the paper's text, no mark of ours)
    const both = { ...shown, pages: printed(w.pages) }
    expect((await passOf(both, { orig: ORIG, ours: oursOf(both) })).head.base).toMatchObject({ source: 'ours' })
    // (an address with axt@ in it is no mark)
    const mail = { ...w, marked: (w.marked as Page[]).map((x, i) => (i === 1 ? { runs: [...x.runs, { s: 'j.saxt@uni-example.de', x: 72, y: 100 }] } : x)) }
    expect((await passOf(mail, { orig: ORIG, ours: oursOf(mail) })).head.base).toMatchObject({ source: 'ours' })
  })

  it('the guard\'s refusal is the paper\'s fallback, its why its own', async () => {
    const got = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf()), marks: { refused: 'texlive', why: 'the paper declares TeX Live 2023' } })
    expect(got.head.base).toEqual({ source: 'arxiv', ...ORIG, why: 'texlive' })
    expect(got.parts[0]?.noLayout).toEqual({ refused: 'texlive', why: 'the paper declares TeX Live 2023' })
  })

  it('a unit with a line not in place on arXiv\'s is left the original\'s alone: every part keeps its layout, its note its lines in place', async () => {
    // (page 1: 2 of its 10 lines set otherwise on arXiv's page, 28 of 30 for the paper, the head's share information alone)
    const w = worldOf((p, j) => p === 1 && j < 2)
    const got = await passOf(w, { orig: ORIG, ours: oursOf(w) })
    expect(got.head.base).toMatchObject({ source: 'ours', check: { carried: 0.9333 } })
    expect(got.parts.map(p => p.noLayout?.refused ?? 'kept')).toEqual(['kept', 'kept'])
    expect(got.parts.map(p => p.layout?.units.map(u => u[0]))).toEqual([[], [1, 2]])
    expect(got.notes.map(n => (n as { lines: unknown }).lines)).toEqual([[8, 10], [20, 20]])
  })

  it('a host of BUNDLE 7\'s (arXiv\'s PDF alone, as `base`): no base of ours, the paper\'s fallback (`final`); no layout over arXiv\'s PDF', async () => {
    const got = await passOf(worldOf(), { base: ORIG })
    expect(got.head.base).toEqual({ source: 'arxiv', ...ORIG, why: 'final' })
    expect(got.parts.map(p => p.noLayout?.refused)).toEqual(['final', 'final'])
  })
})

const deltaOver = (pages: number[], o: { prev?: number; extra?: number } = {}) => deltaOf(ORIG, pages, o)

describe('layerOfPaper over our base page held as a delta over arXiv\'s PDF', () => {
  it('a delta that checks is the head\'s base (kind `delta`, its section\'s bytes and startxref, the replaced pages), `orig` arXiv\'s', async () => {
    const d = await deltaOver([1, 2, 3])
    for (const whole of [false, true]) {
      const got = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf(), { delta: d }), whole })
      expect(got.head.base, String(whole)).toEqual({ source: 'ours', kind: 'delta', bytes: d.bytes.length, sha256: d.sha256, xref: d.xref, pages: 3, tree: '2025', check: { pages: [3, 3], boxes: 'equal', carried: 1 }, replaced: [[1, 3]], stats: d.stats })
      expect(got.head.orig).toEqual({ bytes: ORIG.bytes, sha256: ORIG.sha256, xref: ORIG.xref })
      expect(got.parts.map(p => p.layout !== null)).toEqual([true, true])
      expect(got.r).toMatchObject({ stats: { delta: { kind: 'delta', bytes: d.bytes.length, replaced: 3 } } })
    }
  })

  it('a delta that does not check leaves our whole PDF the base, never the paper refused: `stats.delta` says why', async () => {
    const good = await deltaOver([1, 3])
    const cases: [string, unknown, string][] = [
      ['digest', { ...good, sha256: 'f'.repeat(64) }, 'delta-shape'],
      ['replaced past our pages', { ...good, replaced: [[1, 4]] }, 'delta-shape'],
      ['replaced not merged', { ...good, replaced: [[1, 1], [2, 2]], stats: { ...good.stats, replaced: 2 } }, 'delta-shape'],
      ['counts', { ...good, stats: { ...good.stats, replaced: 1 } }, 'delta-shape'],
      ['another /Prev', await deltaOver([1, 3], { prev: ORIG.xref - 1 }), 'delta-shape'],
      ['past its share of our base page', await deltaOver([1, 3], { extra: 5000 }), 'delta-bound'],
      ['the host\'s refusal', { refused: 'delta-proof', why: 'page 2\'s graph is not ours' }, 'delta-proof'],
      ['not bytes', { ...good, bytes: [1, 2] }, 'delta-shape'],
      // (the replaced list bound to the delta's own page objects: one it writes and does not name, one it names and does not write)
      ['a page written and not named', { ...(await deltaOver([1, 2, 3])), replaced: [[1, 1], [3, 3]], stats: { ...good.stats, replaced: 2 } }, 'delta-shape'],
      ['a page named and not written', { ...(await deltaOver([1])), replaced: [[1, 1], [3, 3]], stats: { ...good.stats, replaced: 2 } }, 'delta-shape'],
    ]
    for (const [name, delta, why] of cases) {
      const got = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf(), { delta }) })
      expect(got.head.base, name).toEqual({ source: 'ours', ...OURS, pages: 3, tree: '2025', check: { pages: [3, 3], boxes: 'equal', carried: 1 } })
      expect(got.r, name).toMatchObject({ stats: { delta: { kind: 'full', why } } })
    }
    // (no delta given: nothing said)
    expect((await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf()) })).r).not.toHaveProperty('stats.delta')
  })
})

describe('a delta the host gives over more pages of ours than arXiv\'s (CodeRabbit on #439)', () => {
  it('falls to the whole base (`delta-pages`), then `boxes` for the page counts: no head drops a page of ours', async () => {
    const w = worldOf()
    const longer = { ...w, marked: [...(w.marked as Page[]), { runs: linesOf(4) }] }
    const got = await passOf(w, { orig: ORIG, ours: oursOf(longer, { delta: await deltaOver([1]) }) })
    expect(got.head.base).toMatchObject({ source: 'arxiv', why: 'boxes' })
    expect(got.parts.every(p => p.noLayout?.refused === 'boxes')).toBe(true)
  })
})

describe('layerOfPaper over our base page wrapped by optional content (ours.wrap)', () => {
  const WRAP = { stats: { wrapped: 3, refusedPages: 0, unhidden: { marks: 0, across: 0, spell: 1, page: 0, bounds: 0 }, split: 0, groups: 3, labelKept: 0 }, unhidden: [[1, 'spell']] as [number, string][], labelKept: [] as number[], pages: [[1, 3]] as [number, number][] }
  it('writes the wrap\'s counts and lists into the head\'s base, whole or a delta', async () => {
    const full = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf(), { wrap: WRAP }) })
    expect(full.head.base).toMatchObject({ source: 'ours', stats: WRAP.stats, unhidden: WRAP.unhidden, labelKept: [] })
    const d = await deltaOver([1, 2, 3])
    const delta = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf(), { delta: d, wrap: WRAP }) })
    expect(delta.head.base).toMatchObject({ kind: 'delta', stats: { ...d.stats, ...WRAP.stats }, unhidden: WRAP.unhidden, labelKept: [] })
  })
  it('refuses a delta that leaves a page the wrap wrapped arXiv\'s: our whole PDF the base (S9 of the review)', async () => {
    const d = await deltaOver([1, 3])
    const got = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf(), { delta: d, wrap: { ...WRAP, pages: [[1, 3]] } }) })
    expect(got.head.base).not.toHaveProperty('kind')
    expect(got.r).toMatchObject({ stats: { delta: { kind: 'full', why: 'delta-shape' } } })
    const fine = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf(), { delta: d, wrap: { ...WRAP, stats: { ...WRAP.stats, wrapped: 2 }, pages: [[1, 1], [3, 3]] } }) })
    expect(fine.head.base).toMatchObject({ kind: 'delta' })
  })
  it('refuses a host\'s wrap whose counts are not its lists\' (a defect, thrown); a refused wrap is the paper\'s fallback, `wrap`', async () => {
    await expect(passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf(), { wrap: { ...WRAP, unhidden: [[1, 'spell'], [2, 'spell']] } }) })).rejects.toThrow(/ours.wrap/)
    // (the wrapped pages required, within our pages, as many as the stats say: review 2's S3)
    for (const pages of [undefined, [[1, 4]], [[1, 2]]]) await expect(passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf(), { wrap: { ...WRAP, pages } }) }), String(pages)).rejects.toThrow(/ours.wrap: pages/)
    const got = await passOf(worldOf(), { orig: ORIG, ours: { refused: 'wrap', why: 'wrap-proof: page 2: a group left open' } })
    expect(got.head.base).toEqual({ source: 'arxiv', ...ORIG, why: 'wrap' })
    expect(got.parts.map(p => p.noLayout?.refused)).toEqual(['wrap', 'wrap'])
  })
})
