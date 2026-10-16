import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, parseLayout, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'
import { installStubs, shuffled } from './helpers/order-paper'

// The links moved with the text the layer redraws, over a run (PR 3a-2; the 3a design §3.2 to §3.5, §4, §5 LK10 and LK14): a
// paper of three pages of 10 pt lines laid by the hybrid over a layout file of its own, each character 5 pt wide. A citation of
// page 1 drawn on page 1; one whose original is on page 1 and whose drawing the translation carries to page 2 (a unit over the
// break); a paragraph with a link over its text that the translation drops (nothing to move it to: dropped); a unit left the
// original's (its link stays); a url in each page's margin (stays). Each page's links are those whatever order the pages are
// asked in and whether the run lets go of what it laid (X1, L3), and no page's drawing is any other for its links (LK14)

beforeAll(() => { installStubs() })

const H = 300, VIEW = [0, 0, 300, H]
type Item = [number, string]
interface Line { page: number; b: number; items: Item[] }
const line = (page: number, b: number, ...items: Item[]): Line => ({ page, b, items })
const spanOf = (l: Line) => [l.items[0]![0], Math.max(...l.items.map(([x, s]) => x + 5 * s.length))] as const
type Piece = { t: 'text'; tr: true; s: string } | { t: 'ph'; src: string; k: number }
/** a unit: its source, its lines, its translation (none: left the original's), its source's pieces and placeholders in the file
 *  (k, kind, page, x0, baseline, x1, top, bottom), and the links over its original (rect, target, overlaid text) */
interface Spec { id: number; kind: string; src: string; lines: Line[]; tr: Piece[] | null; pieces?: number; ph?: number[][]; links?: { page: number; rect: number[]; dest?: string; url?: string; ov: string }[] }
const CJK = (n: number, from = 0x4e00) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + 7 * i)).join('')
const text = (s: string): Piece => ({ t: 'text', tr: true, s })
const CITE = 2

const specs: Spec[] = [
  { id: 0, kind: 'para', src: 'Kappa \\cite{a} lambda', lines: [line(1, 200, [20, 'Kappa'], [50, '[1]'], [70, 'lambda'])], pieces: 3, ph: [[1, CITE, 1, 50, 200, 65, 207, 198]], tr: [text(CJK(2)), { t: 'ph', src: '\\cite{a}', k: 1 }, text(CJK(2, 0x4e40))], links: [{ page: 1, rect: [55, 198, 60, 208], dest: 'cite.a', ov: '1' }] },
  { id: 1, kind: 'para', src: 'Alpha \\cite{b} beta gamma', lines: [line(1, 40, [20, 'Alpha'], [60, '[2]']), line(2, 270, [20, 'beta gamma'])], pieces: 3, ph: [[1, CITE, 1, 60, 40, 75, 47, 38]], tr: [text(CJK(6, 0x4e10)), { t: 'ph', src: '\\cite{b}', k: 1 }, text(CJK(2, 0x4e60))], links: [{ page: 1, rect: [65, 38, 70, 48], dest: 'cite.b', ov: '2' }] },
  { id: 2, kind: 'para', src: 'Mu nu', lines: [line(2, 150, [20, 'Mu nu'])], tr: [text(CJK(3, 0x4e80))], links: [{ page: 2, rect: [20, 148, 30, 158], dest: 'section.2', ov: 'Mu' }] },
  { id: 3, kind: 'para', src: 'Rho sigma', lines: [line(3, 200, [20, 'Rho sigma'])], tr: null, links: [{ page: 3, rect: [20, 198, 35, 208], dest: 'section.3', ov: 'Rho' }] },
  { id: 4, kind: 'para', src: 'Tau upsilon', lines: [line(3, 150, [20, 'Tau upsilon'])], tr: [text(CJK(4, 0x4ea0))] },
]
const PAGES = 3

function annotationsOf(n: number) {
  const out: Record<string, unknown>[] = []
  for (const s of specs) for (const l of s.links ?? []) if (l.page === n) out.push({ subtype: 'Link', rect: l.rect, ...(l.url ? { url: l.url } : { dest: l.dest }), overlaidText: l.ov, borderStyle: { width: 1, style: 1 }, color: new Uint8ClampedArray([255, 0, 0]) })
  out.push({ subtype: 'Link', rect: [270, 2, 290, 12], url: `https://example.org/p${n}`, overlaidText: '', borderStyle: { width: 0, style: 1 }, color: null })
  return out
}
function paper({ annots = true } = {}) {
  const all = Array.from({ length: PAGES }, (_, i) => i + 1)
  const items = all.map(p => specs.flatMap(s => s.lines.filter(l => l.page === p).flatMap(l => l.items.map(([x, str]) => ({ str, transform: [10, 0, 0, 10, x, l.b], width: 5 * str.length, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false })))))
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const pageOf = (n: number) => ({ view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items: items[n - 1], styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {}, ...(annots ? { getAnnotations: async () => annotationsOf(n) } : {}) })
  const doc = { numPages: PAGES, getPage: async (n: number) => pageOf(n) }
  const layout = {
    schema: 4, lineskip: null, layout: '6', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: PAGES }, left: '', views: all.flatMap(() => VIEW), fonts: ['F1'],
    units: specs.map(s => [s.id, UNIT_KINDS.indexOf(s.kind as never), 9, 0, s.pieces ?? 1]),
    lines: specs.map(s => [s.id, s.lines.flatMap(l => { const [x0, x1] = spanOf(l); return [l.page, x0, x1, l.b, l.b + 7, l.b - 2, 10, 0] })]),
    frames: specs.map(s => [s.id, s.lines.flatMap((l, j) => [l.page, 0, j, 1, j ? 0 : -1, 0])]),
    erase: specs.map(s => [s.id, s.lines.flatMap((l, j) => { const [x0, x1] = spanOf(l); return [j, x0, l.b - 2, x1, l.b + 7] })]),
    ph: specs.flatMap(s => (s.ph ?? []).map(([k, kind, ...seg]) => [s.id, k, kind, 0, ...seg])), labels: [], headings: [], pageText: [], held: [], names: [],
  }
  const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
  const geometry = { schema: 1, kinds: specs.map(s => s.kind), left: { pages: all.map(() => VIEW), units: [] } }
  const rows = new Map(specs.map(s => [s.id, s.tr ? { kind: s.kind, src: s.src, state: 'whole', pieces: s.tr } : { kind: s.kind, src: s.src, state: 'none', pieces: [] }]))
  return { doc, index, geometry, rows }
}
type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
async function open(P: ReturnType<typeof paper>, { free = true } = {}) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const units: unknown[] = []
  const pieces = new Map<number, unknown[]>()
  for (const [id, r] of P.rows) { units[id] = r; pieces.set(id, trPiecesOf(r.pieces, (p: unknown) => (p as { k: number }).k) ?? []) }
  return openProto({
    doc: P.doc, target: 'zh', pages: PAGES, scale: 1, dpr: 1, copy: false, geometry: P.geometry, units, free, records: true,
    tex: { index: P.index, pieces, use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' },
  } as never) as Promise<Run>
}
/** what a page answers: its links and their attribution, and what it drew */
const snap = (run: Run, p: number) => ({ links: JSON.stringify(run.linksOf(p)), sources: JSON.stringify(run.linkSources!(p)), markup: run.rows[p - 1]!.markup.join(''), ops: JSON.stringify(run.rows[p - 1]!.ops), svg: run.svgOf(p).innerHTML })
const pages = [1, 2, 3]

describe('links moved over a run', () => {
  it('LK10: a unit over a page break, its citation on page 1 drawn on page 2: the record on page 2 alone; and each link of the paper as it should be', async () => {
    const run = await open(paper())
    for (const p of pages) await run.layFor(p)
    const [p1, p2, p3] = pages.map(p => run.linksOf(p))
    // (page 1: unit 0's citation moved over its drawn "1", the margin's url in place)
    expect(p1!.map(r => [r.name, r.dest ?? r.url, r.moved, r.order])).toEqual([['1', 'cite.a', true, 0], ['', 'https://example.org/p1', false, 1]])
    // (page 2: unit 1's citation, read on page 1, drawn here; unit 2's link over text the translation dropped is gone; the margin's)
    expect(p2!.map(r => [r.name, r.dest ?? r.url, r.moved])).toEqual([['2', 'cite.b', true], ['', 'https://example.org/p2', false]])
    expect(run.linkSources!(2)[0]).toEqual({ annots: [[1, 1]], tier: 'geometry' })
    // (page 3: the unit left the original's keeps its link where it stands)
    expect(p3!.map(r => [r.name, r.dest ?? r.url, r.moved, r.boxes])).toEqual([['Rho', 'section.3', false, [20, 198, 35, 208]], ['', 'https://example.org/p3', false, [270, 2, 290, 12]]])
    // (the moved records lie on their units' drawn lines: page 2's on unit 1's line there, at 270)
    const b = p2![0]!.boxes
    expect(b.length).toBe(4)
    expect(b[1]! < 270 && b[3]! > 270).toBe(true)
    expect(p1![0]!.boxes[1]! < 200 && p1![0]!.boxes[3]! > 200).toBe(true)
    const s = run.linkStats
    expect({ total: s.total, moved: s.moved, inPlace: s.inPlace, dropped: s.dropped }).toEqual({ total: 7, moved: 2, inPlace: 4, dropped: { unmatched: 1, ambiguous: 0, unplaced: 0 } })
  })

  for (const free of [true, false]) {
    it(`X1: every page's links the same whatever order the pages are asked in (the run ${free ? 'letting go' : 'keeping'} what it laid)`, async () => {
      const ref = await open(paper(), { free })
      for (const p of pages) await ref.layFor(p)
      const want = pages.map(p => snap(ref, p))
      for (const order of [[3, 2, 1], [2, 1, 3], [2, 3, 1], shuffled(pages, 11)]) {
        const run = await open(paper(), { free })
        for (const p of order) await run.layFor(p)
        expect(pages.map(p => snap(run, p)), `asked ${order}`).toEqual(want)
      }
    })
  }

  // (LK14 holds that the links never move the drawing; it is no guard of svgOfUnit's own walk (layer2.mjs lineRuns), whose
  // refactor is held by the engine golden and the gate's door and model equality against the drawing before it)
  it('LK14: a page draws the same whether its annotations are read or not: the links are data, the drawing never reads them', async () => {
    const withLinks = await open(paper()), without = await open(paper({ annots: false }))
    for (const p of pages) { await withLinks.layFor(p); await without.layFor(p) }
    for (const p of pages) {
      const a = snap(withLinks, p), b = snap(without, p)
      expect([a.markup, a.ops, a.svg], `page ${p}`).toEqual([b.markup, b.ops, b.svg])
      expect(JSON.stringify(withLinks.wordsOf(p)), `page ${p} words`).toBe(JSON.stringify(without.wordsOf(p)))
      expect(without.linksOf(p)).toEqual([])
    }
    expect(without.linkStats.unread).toBe(PAGES)
  })
})
