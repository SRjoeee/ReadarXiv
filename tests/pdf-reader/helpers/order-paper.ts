import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'
import { type BundleParts, bundleUnitsOf, type ReadBundle, readBundle, writeBundle } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { layerRows, type Row, toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import type { PageWords } from '@/pdf-reader/engine/layer-proto/words.mjs'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { indexLayout, LAYOUT, LAYOUT_SCHEMA, type LayoutFile, parseLayout, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { withGroups } from './groups'

// Synthetic papers for the order of the asks (1b-D design §5: S-A to S-D, the fill paper, and S-E's shared lines): the same page of a PDF.js
// document's shape as the take and local tests' (its text layer, its views; nothing drawn), a layout file and v0's geometry
// built from one list of specs, so that a paper is opened by the run (`openRun`: openProto over every unit at once) or by
// the reader's door (`bundleOf`, `rowsOf`: a bundle written and read back by the engine, its rows made by the engine's own
// rows), and every page's answer taken as a snapshot (`runSnap`, `layerSnap`) to be compared with the page asked in order.
// Each paper has what its name says and the pages are 300 × 300 pt; a line is 10 pt type, 12 pt apart.
// The engine lays a page asked by its closure alone (1b-D1): these hold every page so laid to the page laid in order

/** a canvas context that draws nothing and reads a white page */
const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
  get(t, k) {
    if (k in t) return t[k]
    // (an em a CJK character, half one any other, at the context's font size)
    if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px } }
    if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) })
    if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
    if (k === 'canvas') return canvas
    return () => {}
  },
  set(t, k, v) { t[k] = v; return true },
})
/** the browser the engine draws in, as these tests need it: canvases that draw nothing, faces that load at once, no hyphenation patterns */
export function installStubs() {
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  g.fetch = async () => ({ ok: false, json: async () => null })
}

export const H = 300
export const VIEW: [number, number, number, number] = [0, 0, 300, H]
const CJK = (n: number, from = 0x4e00) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + 7 * i)).join('')
/** a line: its page, its baseline, its text and the span it is set over */
export interface Line { page: number; b: number; text: string; x0: number; x1: number }
export const line = (page: number, b: number, text: string, x0 = 20, x1 = 280): Line => ({ page, b, text, x0, x1 })
export interface Cell { table: number; row: number; col: number; span: number; head: boolean }
/** a unit: its lines, its translation (`chars` characters from `at`) and, for a table's cell, its table group (the run's `groups`) and its cell */
export interface Spec { id: number; kind: string; lines: Line[]; chars: number; at: number; group?: string; cell?: Cell }
/** a paragraph over `pages` ([page, top baseline, lines]), each line 12 pt below the one before */
export function para(id: number, pages: [number, number, number][], chars = 12, extra: Partial<Spec> = {}): Spec {
  const lines = pages.flatMap(([page, top, n]) => Array.from({ length: n }, (_, i) => { const text = `Alpha beta ${page}${i}`; return line(page, top - 12 * i, text, 20, 20 + 5 * text.length) }))
  return { id, kind: 'para', lines, chars, at: 0x4e00 + 64 * id, ...extra }
}
/** a table's cell, on one page, in its column (x0 = 20 + 80 × col) */
export function cell(id: number, page: number, b: number, c: Cell, group: string): Spec {
  const x0 = 20 + 80 * c.col
  return { id, kind: 'cell', lines: [line(page, b, `Cell${id}`, x0, x0 + 60)], chars: 2, at: 0x5000 + 16 * id, group, cell: c }
}
const at = (table: number, row: number, col = 0, head = false): Cell => ({ table, row, col, span: 1, head })

export interface Paper { name: string; specs: Spec[]; pages: number; /** a page whose reading throws */ fail?: number; /** what the pages' annotations do: `throw` (a read that rejects), `absent` (a page object with no such call); the default reads */ annots?: 'throw' | 'absent' }
/** S-A, the chain: a unit across every break, and one over 2 to 3 to 4 */
const chain: Paper = {
  name: 'S-A chain', pages: 5,
  specs: [
    para(0, [[1, 270, 3]]),
    para(1, [[1, 60, 2], [2, 270, 2]], 16),
    para(2, [[2, 150, 2]]),
    para(3, [[2, 60, 2], [3, 270, 2]], 16),
    para(4, [[2, 30, 1], [3, 150, 2], [4, 270, 2]], 20),
    para(5, [[3, 60, 2]]),
    para(6, [[4, 60, 2], [5, 270, 2]], 16),
    para(7, [[5, 150, 3]]),
  ],
}
/** S-B, tables: a column whose cells are on pages 2, 3 and 4 (a group on three pages), a column on page 3 alone, a paragraph under it */
const tables: Paper = {
  name: 'S-B tables', pages: 4,
  specs: [
    para(0, [[1, 270, 3]]),
    cell(1, 2, 270, at(0, 0, 0, true), 'T:a'), cell(2, 2, 250, at(0, 1), 'T:a'),
    cell(3, 3, 270, at(0, 2), 'T:a'), cell(4, 3, 250, at(0, 3), 'T:a'),
    cell(5, 4, 270, at(0, 4), 'T:a'),
    cell(6, 3, 200, at(1, 0, 0, true), 'T:b'), cell(7, 3, 180, at(1, 1), 'T:b'), cell(8, 3, 160, at(1, 2), 'T:b'),
    para(9, [[3, 100, 3]]),
    para(10, [[4, 150, 2]]),
  ],
}
/** S-C, a float and the batch race: a figure at an early slot (id 3) set on page 3, and a unit of page 1 running on to page 2 in the same batch of 8 as page 2's */
const float: Paper = {
  name: 'S-C float', pages: 3,
  specs: [
    para(0, [[1, 270, 2]]), para(1, [[1, 230, 2]]), para(2, [[1, 190, 2]]),
    { id: 3, kind: 'figure', lines: [line(3, 270, 'Figure 1 gamma', 20, 200)], chars: 6, at: 0x4f00 },
    para(4, [[1, 150, 2]]),
    para(5, [[1, 60, 2], [2, 270, 2]], 16),
    para(6, [[2, 230, 2]]), para(7, [[2, 190, 2]]), para(8, [[2, 150, 2]]), para(9, [[2, 110, 2]]),
    para(10, [[3, 230, 2]]), para(11, [[3, 190, 2]]), para(12, [[3, 150, 2]]),
  ],
}
/** S-D, a footnote carried across a break (2 to 3), a unit running on to page 4, and a variant whose page 4 cannot be read */
const footnote: Paper = {
  name: 'S-D footnote', pages: 4,
  specs: [
    para(0, [[1, 270, 3]]),
    para(1, [[2, 270, 3]]),
    { id: 2, kind: 'footnote', lines: [line(2, 40, 'Eta theta iota', 20, 140), line(3, 270, 'kappa lambda mu', 20, 140)], chars: 14, at: 0x4f80 },
    para(3, [[3, 200, 3]]),
    para(4, [[3, 60, 2], [4, 270, 2]], 16),
    para(5, [[4, 150, 2]]),
  ],
}
/** the fill paper: a title page, then fuller pages (the local test's S3), a paragraph from page 2 to page 4 */
const fill: Paper = {
  name: 'S3 fill', pages: 4,
  specs: [
    para(0, [[1, 250, 4]], 20),
    para(1, [[2, 250, 6]], 28), para(2, [[2, 100, 3], [4, 270, 2]], 30),
    para(3, [[3, 250, 6]], 16), para(4, [[3, 120, 8]], 20),
    para(5, [[4, 200, 4]], 16),
  ],
}
/** S-E, shared lines (need.mjs rowLeadOf): a paragraph from page 1 to page 2 whose last row its part after a float continues
 *  (unit 1 ranks before unit 0 on page 2: unit 0 waited on page 1), and a run-in head at page 2's foot whose text runs on to
 *  page 3, which page 4's closure lays through a paragraph from page 3 on to page 4 (the head on no page of that closure's passes) */
const shared: Paper = {
  name: 'S-E shared line', pages: 4,
  specs: [
    { id: 0, kind: 'para', lines: [line(1, 270, 'Alpha beta gamma'), line(1, 258, 'delta epsilon zeta'), line(1, 246, 'eta theta iota'), line(2, 270, 'kappa lambda mu'), line(2, 258, 'nu xi. The', 20, 150)], chars: 110, at: 0x4e00 },
    { id: 1, kind: 'para', lines: [line(2, 258, 'omicron pi', 160, 280), line(2, 246, 'rho sigma tau'), line(2, 234, 'upsilon phi chi')], chars: 30, at: 0x5200 },
    { id: 2, kind: 'heading', lines: [line(2, 60, 'Encoder', 20, 80)], chars: 3, at: 0x5600 },
    { id: 3, kind: 'para', lines: [line(2, 60, 'The encoder is', 90, 280), line(2, 48, 'composed of a stack'), line(3, 270, 'of identical layers'), line(3, 258, 'each with two')], chars: 40, at: 0x5800 },
    para(4, [[3, 150, 2], [4, 270, 2]], 40),
    para(5, [[4, 150, 2]], 20),
  ],
}
export const PAPERS: Paper[] = [chain, tables, float, footnote, { ...footnote, name: 'S-D footnote, page 4 unreadable', fail: 4 }, fill, shared]

/** a character's advance centre at its place in an item of equal advance (PDF.js's rule, links.mjs pointsOf): the item's first character is at index 0 */
const centreOf = (l: Line, k: number) => l.x0 + ((k + 0.5) / l.text.length) * (l.x1 - l.x0)
/** the Link annotations of a page, PDF.js's shape: one over the first characters of each unit's first line there (its overlaid text those characters), and one in the margin with no glyph under it (a url) */
export function annotationsOf(specs: readonly Spec[], n: number) {
  const out: Record<string, unknown>[] = []
  for (const s of specs) {
    const l = s.lines.find(x => x.page === n)
    if (!l) continue
    const rect = [l.x0 + 1, l.b - 2, l.x0 + 14, l.b + 8]
    const ov = [...l.text].filter((_, k) => centreOf(l, k) > rect[0]! && centreOf(l, k) < rect[2]!).join('')
    out.push({ subtype: 'Link', rect, dest: `cite.${s.id}`, overlaidText: ov, borderStyle: { width: 1, style: 1 }, color: new Uint8ClampedArray([0, 255, 0]) })
  }
  out.push({ subtype: 'Link', rect: [270, 2, 290, 12], url: `https://example.org/p${n}`, overlaidText: '', borderStyle: { width: 0, style: 1 }, color: null })
  // (an annotation of another kind is no link, and a link PDF.js reads an action out of is not one a reader carries)
  out.push({ subtype: 'Widget', rect: [10, 2, 20, 12] }, { subtype: 'Link', rect: [100, 2, 120, 12], action: 'NextPage', overlaidText: '' })
  return out
}

export interface Built {
  paper: Paper
  doc: { numPages: number; asked: number[]; getPage(n: number): Promise<unknown> }
  index: ReturnType<typeof indexLayout>
  geometry: unknown
  /** the run's units by id (a row), and each cell's table group */
  rows: Map<number, { kind: string; src: string; state: string; group?: string; pieces: { t: 'text'; tr: true; s: string }[] }>
  groups: Map<number, string>
  layout: LayoutFile
}
const srcOf = (s: Spec) => s.lines.map(l => l.text).join(' ')
const trOf = (s: Spec) => CJK(s.chars, s.at)
/** a paper built: its PDF.js document, its layout file and v0's geometry, the run's rows */
export function build(paper: Paper): Built {
  const { specs, pages } = paper
  const all = Array.from({ length: pages }, (_, i) => i + 1)
  const items = all.map(p => specs.flatMap(s => s.lines.filter(l => l.page === p).map(l => ({ str: l.text, transform: [10, 0, 0, 10, l.x0, l.b], width: l.x1 - l.x0, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))))
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const pageOf = (n: number) => ({ view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items: items[n - 1], styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {}, ...(paper.annots === 'absent' ? {} : { getAnnotations: async () => { if (paper.annots === 'throw') throw new Error('the annotations cannot be read'); return annotationsOf(specs, n) } }) })
  const asked: number[] = []
  const doc = withGroups({ numPages: pages, asked, getPage: async (n: number) => { asked.push(n); if (n === paper.fail) throw new Error(`page ${n} cannot be read`); return pageOf(n) } })
  const layout = {
    schema: LAYOUT_SCHEMA, lineskip: null, layout: LAYOUT, pdfjs: PDFJS, paper: { id: '2610.00001', version: 1, pages }, left: '', views: all.flatMap(() => VIEW), fonts: ['F1'],
    units: specs.map(s => [s.id, UNIT_KINDS.indexOf(s.kind as never), 9, 0, 1]),
    lines: specs.map(s => [s.id, s.lines.flatMap(l => [l.page, l.x0, l.x1, l.b, l.b + 7, l.b - 2, 10, 0])]),
    frames: specs.map(s => [s.id, s.lines.flatMap((l, j) => [l.page, 0, j, 1, j ? 0 : -1, 0])]),
    erase: specs.map(s => [s.id, s.lines.flatMap((l, j) => [j, l.x0, l.b - 2, l.x1, l.b + 7])]),
    ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
  } as unknown as LayoutFile
  const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
  const geometry = {
    schema: 1, kinds: specs.map(s => s.kind),
    // (every unit is the layout file's alone: the left holds no shape, so that the hybrid places each by the file, as the local tests' papers are)
    left: { pages: all.map(() => VIEW), units: [] },
  }
  const rows = new Map(specs.map(s => [s.id, { kind: s.kind, src: srcOf(s), state: 'whole', ...(s.group ? { group: s.group } : {}), pieces: [{ t: 'text' as const, tr: true as const, s: trOf(s) }] }]))
  const groups = new Map(specs.filter(s => s.group).map(s => [s.id, s.group!]))
  return { paper, doc, index, geometry, rows, groups, layout }
}

export type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
/** v0 over the paper, every unit at once (the hybrid over the layout file, each cell's group given, or with `groups` false
 *  none: the groups read from the rows, as the gate's and the lab's whole opens do); `expect`: the rows to be taken after the
 *  open (take) rather than given; `free`: the run lets go of what it has laid, as the reader's does; `rules`: a layout rule set
 *  (rules/layout.mjs) in place of the built-in one */
export async function openRun(P: Built, { free = true, groups = true, expect = false, records = true, rules = null as unknown } = {}) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const units: unknown[] = []
  const pieces = new Map<number, unknown[]>()
  for (const [id, r] of P.rows) { if (!expect) units[id] = r; pieces.set(id, trPiecesOf(r.pieces, (p: unknown) => (p as { k: number }).k) ?? []) }
  return openProto({
    doc: P.doc, target: 'zh', pages: P.paper.pages, scale: 1, dpr: 1, copy: false, geometry: P.geometry, units, free, records, groups: groups ? P.groups : null, ...(expect ? { expect: [...P.rows.keys()] } : {}), ...(rules ? { rules } : {}),
    tex: { index: P.index, pieces, symbols: 'text', extents: 'v0' },
  } as never) as Promise<Run>
}
/** a page asked for, as the door asks: its closure laid (Need(p), run.mjs layFor), and nothing else; the page is then final */
export async function askPage(run: Run, p: number) {
  await run.layFor(p)
}
/** the ids of the paper's units drawn on any of `pages` (every unit is the layout file's alone: its lines are its only source) */
export const unitsOn = (P: Built, pages: readonly number[]) => P.paper.specs.filter(s => s.lines.some(l => pages.includes(l.page))).map(s => s.id)
/** what a run answers of a page (a failed page has no answer but its failure): the markup and operations it drew, its fill numbers, its SVG, its word table
 *  and the records of the units on it, by unit id */
export function runSnap(run: Run, p: number) {
  if (run.failed(p)) return { failed: true }
  const r = run.rows[p - 1]!
  const w = run.wordsOf(p)
  const t = w.tokens
  return {
    markup: r.markup, ops: JSON.stringify(r.ops), fill: r.fill, svg: run.svgOf(p).innerHTML,
    words: JSON.stringify([t.n, w.spans, w.original, Array.from(t.l), Array.from(t.r), Array.from(t.y), Array.from(t.h), Array.from(t.top), Array.from(t.bottom), Array.from(w.word)]),
    links: JSON.stringify(run.linksOf(p)),
    // (a table cell's record leaves with its group when the group is withheld, as soon as all its cells are laid: not a fact of the page)
    records: run.stats.filter(x => x.pages.includes(p) && x.kind !== 'cell').map(({ ms: _, ...x }) => x).sort((a, b) => a.id - b.id),
  }
}

/** the paper as a bundle the reader's door reads (the units text only, a cell with its cell, a left with no shape, no add-on) */
export function bundleOf(P: Built): ReadBundle {
  const { specs, pages } = P.paper
  const units = { units: specs.map(s => ({ kind: s.kind, pieces: [{ t: 'text', s: srcOf(s) }], ...(s.cell ? { cell: s.cell } : {}) }) as SourceUnit), kept: new Set<SourceUnit>() }
  const parts: BundleParts = {
    paper: { id: '2610.00001', version: 1, pages },
    base: { bytes: 12_345, sha256: '0123456789abcdef'.repeat(4), url: '/api/v1/original/2610.00001v1' },
    image: '1', units: bundleUnitsOf(units),
    left: { kinds: specs.map(s => s.kind), pages: Array.from({ length: pages }, () => VIEW), units: [] },
    layout: P.layout, rules: null,
  }
  return readBundle(writeBundle(parts))
}
/** the rows of the paper's translation into Chinese, by the engine's own rows: each unit's text translated whole */
export function rowsOf(bundle: ReadBundle, P: Built): Row[] {
  const tr = new Map(P.paper.specs.map(s => [s.id, trOf(s)]))
  const results = new Map(toTranslate(bundle, 'zh').map(id => [id, { state: 'whole', by: 'test', pieces: [{ t: 'text', tr: true, s: tr.get(id)! }] }]))
  return layerRows(bundle, results, 'zh').rows
}
/** what the reader's door answers of a page: its SVG (lang aside), its word table and links, and what its run drew (operations, fill, markup) */
export function layerSnap(run: Run, svg: SVGSVGElement, words: PageWords, p: number, links: unknown[]) {
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.removeAttribute('lang')
  const t = words.tokens
  const r = run.rows[p - 1]!
  return {
    svg: copy.outerHTML, ops: JSON.stringify(r.ops), fill: r.fill, markup: r.markup,
    words: JSON.stringify([t.n, words.spans, words.original, Array.from(t.l), Array.from(t.r), Array.from(t.y), Array.from(t.h), Array.from(t.top), Array.from(t.bottom), Array.from(words.word)]),
    links: JSON.stringify(links),
  }
}

/** a fixed shuffle (a linear congruential generator's), so that a failure is the same each run */
export function shuffled<T>(list: T[], seed = 7) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) % 2 ** 31; const j = seed % (i + 1); [out[i], out[j]] = [out[j]!, out[i]!] }
  return out
}
