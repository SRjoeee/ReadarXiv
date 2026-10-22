import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { indexOf, type PartChain, type ReadPart, type ReadUnitsChunk, readHead, readPart, readUnitsChunk, type Written } from '@/pdf-reader/engine/layer-proto/format.mjs'
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

  it('each failing reason its own code: a mark printed as text, a final pass not checked, other boxes, other page counts, too few lines on arXiv\'s', async () => {
    const w = worldOf()
    const shown = { ...w, marked: (w.marked as Page[]).map((p, i) => (i === 1 ? { runs: [...p.runs, { s: '\\axt@pma{p1.0a}', x: 72, y: 100 }] } : p)) }
    const cases: [string, World, Record<string, unknown>, RegExp][] = [
      ['marks', shown, { ours: oursOf(shown) }, /mark of ours stands as text on page 2/],
      ['final', w, { ours: oursOf(w, { check: null }) }, /not checked against the draft/],
      ['boxes', worldOf(() => false, { oursView: [0, 0, 595.28, 841.89] }), {}, /page 1's box/],
      ['carry', worldOf((p, j) => j < 3 || p === 2), {}, /^14 of the 30 lines .* in place on arXiv's PDF, under 90 %$/],
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

  it('a base of ours whose lines are all found but not in place (another TeX Live re-breaking the paper) falls back, `carry`', async () => {
    // (every line of arXiv's pages 2 and 3 a line lower than ours: found, moved whole, 12 pt off; page 1 in place, 10 of 30)
    const w = worldOf()
    const lower = { ...w, pages: (w.pages as Page[]).map((p, i) => (i === 0 ? p : { runs: p.runs.map(r => ({ ...r, y: r.y - 12 })) })) }
    const got = await passOf(lower, { orig: ORIG, ours: oursOf(lower) })
    expect(got.head.base).toMatchObject({ source: 'arxiv', why: 'carry' })
    expect(got.parts[0]?.noLayout?.why).toBe('10 of the 30 lines of its pages in place on arXiv\'s PDF, under 90 %')
    expect(got.r).toMatchObject({ stats: { layout: { refused: 'carry', why: '10 of our 30 lines in place on arXiv\'s PDF (within 0.5 pt on their page), under 90 %' } } })
    // (half a point off is still in place)
    const near = { ...w, pages: (w.pages as Page[]).map(p => ({ runs: p.runs.map(r => ({ ...r, y: r.y - 0.4 })) })) }
    expect((await passOf(near, { orig: ORIG, ours: oursOf(near) })).head.base).toMatchObject({ source: 'ours', check: { carried: 1 } })
  })

  it('the guard\'s refusal is the paper\'s fallback, its why its own', async () => {
    const got = await passOf(worldOf(), { orig: ORIG, ours: oursOf(worldOf()), marks: { refused: 'texlive', why: 'the paper declares TeX Live 2023' } })
    expect(got.head.base).toEqual({ source: 'arxiv', ...ORIG, why: 'texlive' })
    expect(got.parts[0]?.noLayout).toEqual({ refused: 'texlive', why: 'the paper declares TeX Live 2023' })
  })

  it('a part whose lines are under 90 % on arXiv\'s is refused alone, its share our base page\'s lines\'', async () => {
    // (page 1: 2 of its 10 lines set otherwise on arXiv's page, 28 of 30 for the paper)
    const w = worldOf((p, j) => p === 1 && j < 2)
    const got = await passOf(w, { orig: ORIG, ours: oursOf(w) })
    expect(got.head.base).toMatchObject({ source: 'ours', check: { carried: 0.9333 } })
    expect(got.parts.map(p => p.noLayout?.refused ?? 'kept')).toEqual(['carry', 'kept'])
    expect(got.notes.map(n => (n as { lines: unknown }).lines)).toEqual([[8, 10], [20, 20]])
  })

  it('a host of BUNDLE 7\'s (arXiv\'s PDF alone, as `base`): no base of ours, the paper\'s fallback (`final`); no layout over arXiv\'s PDF', async () => {
    const got = await passOf(worldOf(), { base: ORIG })
    expect(got.head.base).toEqual({ source: 'arxiv', ...ORIG, why: 'final' })
    expect(got.parts.map(p => p.noLayout?.refused)).toEqual(['final', 'final'])
  })
})
