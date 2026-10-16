import { type Cut, cutBundle, type WholePaper } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import { indexOf, type LayerIndex, type PartChain, type ReadPart, readHead, readPart, readUnitsChunk, type ReadUnitsChunk } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { layerRows, type Row, sourceUnitsOf, toTranslate, unitOf } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import type { BundleUnit } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { REMOVAL, type RemovalManifest } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { LAYOUT, LAYOUT_SCHEMA, type LayoutFile, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { groupOf } from '@/pdf-reader/engine/translate/groups.mjs'
import { tokenWire } from './format-paper'

// Papers made whole for the door's equality harness (H1, H2: the door design §5): a spec of units (their source text, their
// lines, where each is located: the layout file, the original's side or both, a table cell), made into the paper's units, its
// layout file, its left and a whole add-on of clean planned pages, then cut by the cutter at any split and read back as the
// service reads it; the composed documents a PDF.js document's shape (each unit's lines in the text layer, 10 pt Times; a
// removed page has none), and the rows of a translation into Chinese made by the engine's own rows (rows.mjs layerRows)

export interface UnitSpec {
  kind: string
  text: string
  /** page, x0, x1, baseline (10 pt), each a line */
  lines: [number, number, number, number][]
  /** the layout file locates it */
  file: boolean
  /** the original's side locates it, at this stream (a token's global index); null: not */
  stream: number | null
  cell?: { table: number; row: number; col: number; span: number; head: boolean }
  /** a placeholder the layout file does not find (a citation): its cell or unit is left with it */
  cite?: boolean
}
export interface PaperSpec { pages: number; units: UnitSpec[] }

export const H = 300
export const VIEW: [number, number, number, number] = [0, 0, 300, H]
export const CJK = (n: number, from = 0x4e00) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + 7 * i)).join('')
const rectOf = ([p, x0, x1, b]: [number, number, number, number]): [number, number, number, number, number] => [p, x0, b - 2.15, x1, b + 6.83]

/** the paper the spec describes, whole (the cutter's input); `addon: false`, no add-on at all (a producer with no remover);
 *  `layout: false`, no layout file (the maker refused: every part `layout: null`) */
export function wholeOfSpec(spec: PaperSpec, o: { addon?: boolean; layout?: boolean } = {}): WholePaper & { layout: LayoutFile | null } {
  const N = spec.pages
  const units: BundleUnit[] = spec.units.map(u => [u.kind, 0, null, u.cell ?? null, null, u.cite ? [[0, u.text], [1, '\\cite{a}']] : [[0, u.text]]] as BundleUnit)
  const file = spec.units.map((u, id) => ({ ...u, id })).filter(u => u.file)
  const layout: LayoutFile = {
    schema: LAYOUT_SCHEMA, lineskip: [1, 0], layout: LAYOUT, pdfjs: PDFJS, paper: { id: '2610.00001', version: 1, pages: N }, left: '', views: Array.from({ length: N }, () => VIEW).flat(), fonts: ['F1'],
    units: file.map(u => [u.id, UNIT_KINDS.indexOf(u.kind as never), 9, 0, u.cite ? 2 : 1]),
    lines: file.map(u => [u.id, u.lines.flatMap(([p, x0, x1, b]) => [p, x0, x1, b, b + 7, b - 2, 10, 0])]),
    frames: file.map(u => [u.id, u.lines.flatMap(([p], j) => [p, 0, j, 1, j ? 0 : -1, 0])]),
    erase: file.map(u => [u.id, u.lines.flatMap(([, x0, x1, b], j) => [j, x0, b - 2, x1, b + 7])]),
    ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
  } as never
  const left = spec.units.flatMap((u, id) => (u.stream === null ? [] : [[id, u.stream, u.lines.map(rectOf)] as [number, number, [number, number, number, number, number][]]]))
  // (every page planned and clean: the text removal draws each unit the file locates whole by the file's own rectangles)
  const manifest: RemovalManifest = { schema: 1, removal: REMOVAL, pages: N, sets: {}, page: Object.fromEntries(Array.from({ length: N }, (_, i) => [i + 1, { ok: true }])), appended: 0, stats: {} } as never
  return {
    paper: { id: '2610.00001', version: 1, pages: N }, base: { bytes: 12_345, sha256: '0123456789abcdef'.repeat(4), xref: 12_000 }, versions: { image: '1' },
    units, left: { pages: Array.from({ length: N }, () => VIEW), units: left }, layout: o.layout === false ? null : layout, addon: o.addon === false || o.layout === false ? null : { manifest },
  }
}

/** each page's left part: 20 tokens a page, a span for each left unit on the page */
export const leftPagesOfSpec = (spec: PaperSpec) => (page: number) => {
  const first = 20 * (page - 1)
  const spans: [number, number[]][] = []
  spec.units.forEach((u, id) => {
    if (u.stream === null || !u.lines.some(l => l[0] === page)) return
    const at = u.stream - first
    spans.push([id, [at >= 0 && at < 20 ? at : 0, 1]])
  })
  return { first, tokens: tokenWire(20, page), spans, pairs: [] }
}

/** a target that ends a part at each of `ends` (and at N) */
export const splitAt = (ends: readonly number[]) => (a: number, N: number) => Math.min(N, ...ends.filter(e => e >= a))
/** every set of a paper's part ends, as targets (2^(N-1) of them) */
export function everySplit(N: number): number[][] {
  const out: number[][] = []
  for (let m = 0; m < 2 ** (N - 1); m++) out.push(Array.from({ length: N - 1 }, (_, i) => i + 1).filter(e => m & (1 << (e - 1))))
  return out
}

/** a cut read back as the service reads it: the index and the parts in order */
export async function readCut(c: Cut): Promise<{ index: LayerIndex; parts: ReadPart[] }> {
  const rh = await readHead(c.head.bytes, { ref: c.head.ref })
  const read: ReadUnitsChunk[] = []
  for (const u of c.units) read.push(await readUnitsChunk(u.bytes, { ref: u.ref, before: read.at(-1) ?? null }))
  const index = indexOf(rh, read)
  const parts: ReadPart[] = []
  let chain: PartChain | null = null
  for (const p of c.parts) {
    const r = await readPart(p.bytes, { ref: p.ref, index, chain })
    parts.push(r)
    chain = r.chain
  }
  return { index, parts }
}

/** the spec's paper cut at `ends` (the cutter's target hook) and read back; `addon: false`, a paper with no add-on; `extend: false`, the doubling schedule alone (the default extends it over the need bound) */
export async function cutSpec(spec: PaperSpec, ends?: readonly number[], o: { addon?: boolean; layout?: boolean; extend?: boolean } = {}) {
  const whole = wholeOfSpec(spec, o)
  const cut = await cutBundle(whole, { leftPages: leftPagesOfSpec(spec), ...(ends ? { target: splitAt(ends) } : {}), ...(o.extend === undefined ? {} : { extend: o.extend }) } as never)
  return { whole, cut, ...(await readCut(cut)) }
}

/** the composed documents: arXiv's pages 1..N with each unit's lines in the text layer, and `r` removed pages after them, one
 *  object for each r; a page in `fail` cannot be read, one `hold` returns a promise for waits until it settles */
export function docsOf(spec: { pages: number; units: readonly { text: string; lines: readonly (readonly number[])[] }[] }, o: { fail?: () => readonly number[]; hold?: (page: number) => Promise<void> | null } = {}) {
  const N = spec.pages
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const items = (p: number) => (p > N ? [] : spec.units.flatMap(u => u.lines.filter(l => l[0] === p).map(([, x0, x1, b]) => ({ str: u.text, transform: [10, 0, 0, 10, x0, b], width: (x1 as number) - (x0 as number), height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))))
  const pageOf = (n: number) => ({ view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items: items(n), styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {} })
  const docs = new Map<number, { numPages: number; reads: number[]; getPage(n: number): Promise<unknown> }>()
  return (r: number) => {
    let d = docs.get(r)
    if (!d) {
      const reads: number[] = []
      d = { numPages: N + r, reads, getPage: async (n: number) => { reads.push(n); await o.hold?.(n); if (o.fail?.().includes(n)) throw new Error(`page ${n} cannot be read`); return pageOf(n) } }
      docs.set(r, d)
    }
    return d
  }
}

/** the rows of the paper's translation into Chinese, by the engine's own rows: each unit's text translated whole, a cited
 *  unit's citation kept as its source piece */
export function rowsOfIndex(index: LayerIndex): Row[] {
  const src = sourceUnitsOf(index)
  const results = new Map(toTranslate(index, 'zh').map(id => [id, { state: 'whole', by: 'test', pieces: [{ t: 'text', tr: true, s: CJK(4, 0x4e00 + 16 * id) }, ...(src[id]!.pieces.slice(1).filter(p => (p as { t: string }).t === 'ph'))] }]))
  return layerRows(index, results, 'zh').rows
}
/** v0's units of those rows, by id (openProto's take) */
export const unitsOfRows = (index: LayerIndex, rows: readonly Row[]) => new Map(rows.map(r => [r[0], unitOf(index, r)!]))
/** each unit's table group, as the door gives the run */
export function groupsOfIndex(index: LayerIndex) {
  const groups = new Map<number, string>()
  sourceUnitsOf(index).forEach((u, id) => { const g = u ? groupOf(u) : null; if (g) groups.set(id, g) })
  return groups
}
