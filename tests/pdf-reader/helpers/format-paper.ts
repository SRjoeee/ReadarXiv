import { createHash } from 'node:crypto'
import {
  indexOf, type Kind, type LayerIndex, type PartChain, type ReadHead, type ReadLeftPart, type ReadPart, type ReadUnitsChunk, readHead, readLeftPart, readPart,
  readUnitsChunk, type Ref, type TokenWire, type Written, writeHead, writeLeftPart, writePart, writeUnitChunks,
} from '@/pdf-reader/engine/layer-proto/format.mjs'
import type { UnitWire } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import type { BundleUnit } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { type LayoutPart, NAME_FLAG, NAME_KEYS, PH_KINDS, UNIT_FLAG, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'

// A small paper written the way the prepare pipeline will write it, for the tests of BUNDLE 4's format: four pages, eight
// units, the head, a units chunk, and three parts (pages 1, 2–3, 4) with a left part for each page. Every number is made
// to satisfy the readers' bounds and the chain's rules (the K slots rise, the views overlap as told); a test breaks one and
// reads again

export const PAPER = { id: '2608.04322', version: 1 }
export const N = 4
export const BASE = { bytes: 10_000, sha256: '0123456789abcdef'.repeat(4), xref: 9_000 }
export const IMAGE = '1'
/** the PDF the layer is drawn over where it is ours (BUNDLE 8): our compile's final pass, of arXiv's size and page count; and
 *  arXiv's, beside it */
export const OURS = { source: 'ours' as const, ...BASE, pages: N, tree: '2025', check: { pages: [N, N] as [number, number], boxes: 'equal' as const, carried: 1 } }
export const ORIG = { bytes: 30_000, sha256: 'fedcba9876543210'.repeat(4) }
/** arXiv's PDF with its startxref, where our base is a delta over it (the section the delta's /Prev names): its bytes and the delta's
 *  4,000 end where BASE's do */
export const ORIG_X = { bytes: BASE.bytes - 4_000, sha256: ORIG.sha256, xref: 5_000 }
/** the base of ours held as a delta over arXiv's PDF (`kind` 'delta'): the delta's bytes and digest, its startxref in the composed
 *  document (BASE's, after ORIG_X's bytes), the pages it replaces (`replaced`, ranges) and its counts */
export const deltaBase = (replaced: [number, number][]) => ({
  source: 'ours' as const, kind: 'delta' as const, bytes: 4_000, sha256: 'abcdef0123456789'.repeat(4), xref: BASE.xref, pages: N, tree: '2025',
  check: { pages: [N, N] as [number, number], boxes: 'equal' as const, carried: 1 }, replaced,
  stats: { replaced: replaced.reduce((n, [a, b]) => n + b - a + 1, 0), reused: { fonts: 3, images: 1, forms: 0, other: 2 }, included: { bytes: 3_200, objects: 8 } },
})

const H = UNIT_KINDS.indexOf('heading'), P = UNIT_KINDS.indexOf('para'), C = UNIT_KINDS.indexOf('cell'), MATH = PH_KINDS.indexOf('math')

/** the paper's units (the layer-bundle test's): a title, a footnote nested in a paragraph, three cells, a heading, an author */
export const UNITS: BundleUnit[] = [
  ['heading', 1, null, null, null, [[0, 'A Title']]],
  ['footnote', 0, null, null, null, [[0, 'A note.']]],
  ['para', 0, null, null, { trail: 'xy' }, [[0, 'Text with '], [2, 1, '\\textbf{'], [0, 'bold'], [3, 1, '}'], [1, '$x$'], [0, ' cafÃ©', " caf\\'e"], [4, '\\footnote{', 1, '}']]],
  ['cell', 8, null, { table: 0, row: 0, col: 0, span: 1, head: true }, null, [[0, 'Model']]],
  ['cell', 0, null, { table: 0, row: 1, col: 0, span: 2, head: false }, null, [[2, 58, '\\multirow{2}{*}{'], [2, 59, '\\shortstack{'], [0, 'ASR']]],
  ['cell', 0, null, { table: 0, row: 2, col: 0, span: 1, head: false }, null, [[0, 'down'], [3, 59, '}'], [3, 58, '}']]],
  ['heading', 6, 1, null, { lead: 'a', inner: 'b c' }, [[0, 'Intro']]],
  ['author', 0, null, null, null, [[0, 'Ada']]],
]

/** the views of pages 1 to 4: page 2 is wider than the others, so that a view read by the wrong page shows */
export const VIEWS = [[0, 0, 612, 792], [0, 0, 700, 800], [0, 0, 612, 792], [0, 0, 612, 792]]
const views = (from: number, to: number) => VIEWS.slice(from - 1, to).flat()

/** the stream of each left unit (a token's global index; every page holds 20 tokens, so page p begins at 20 (p − 1)) */
export const STREAM = new Map([[0, 0], [2, 12], [3, 25], [4, 41], [6, 62], [7, 70]])
export const TOKENS_ON_PAGE = 20

/** one page's tokens as the wire: n integers a field, delta-coded, in thousandths */
export function tokenWire(n: number, seed = 0): TokenWire {
  const f = (a: number, b: number) => Array.from({ length: n }, (_, i) => (i === 0 ? a + seed : b))
  return { perPage: [n], l: f(72_000, 100), r: f(100_000, 100), y: f(700_000, -10), h: f(10_000, 0), top: f(708_000, -10), bottom: f(698_000, -10) }
}

/** what each page's left part says: spans [id, ranges], pairs [id, runs] */
export const LEFT_OF: Record<number, { spans: [number, number[]][]; pairs: [number, number[]][] }> = {
  1: { spans: [[0, [0, 2]], [2, [12, 3]]], pairs: [[0, [0, 0, 2]]] },
  2: { spans: [[2, [0, 2]], [3, [5, 2]]], pairs: [[3, [0, 5, 2]]] },
  3: { spans: [[4, [1, 1]]], pairs: [] },
  4: { spans: [[6, [2, 2]], [7, [10, 1]]], pairs: [[6, [0, 2, 2]]] },
}

export type PartInput = Parameters<typeof writePart>[0]

/** the rules near the second part's table cells: one under the cell on page 2 */
export const RULES_2 = [72, 500, 540, 500.4]

const layout1: LayoutPart = {
  fonts: ['CMR10'],
  units: [[0, H, 9, UNIT_FLAG.TITLE, 1], [2, P, 9, 0, 7]],
  lines: [[0, [1, 150, 460, 700, 712, 696, 17.28, 0]], [2, [1, 72, 540, 650, 657.5, 647.25, 10, 0, 2, 72, 300, 700, 710, 698, 10, 0]]],
  frames: [[0, [1, 0, 0, 1, -1, 30]], [2, [1, 0, 0, 1, -1, 12.5, 2, 0, 1, 1, 500, 12]]],
  erase: [], ph: [[2, 4, MATH, 0, 1, 100, 650, 110, 657, 647]], labels: [], headings: [[0, 'A Title']], pageText: [], held: [], names: [],
}
const layout2: LayoutPart = {
  fonts: ['CMBX12', 'CMR10'],
  units: [[3, C, 9, 0, 1], [5, C, 9, 0, 3]],
  lines: [[3, [2, 72, 200, 500, 508, 498, 9, 1]], [5, [3, 72, 200, 400, 408, 398, 9, 1]]],
  frames: [[3, [2, 0, 0, 1, -1, 10]], [5, [3, 0, 0, 1, -1, 10]]],
  erase: [], ph: [], labels: [], headings: [], pageText: [], held: [],
  names: [[0, NAME_KEYS.indexOf('abstract'), 3, 280, 680, 332.5, 687, 677.5, 9, 0, NAME_FLAG.CENTRED, -1, 0, 72, 540]],
}

/** the three parts' inputs, for a head and the left parts written (`lefts[p]` the left part of page p) */
export function partInputs(head: string, lefts: Record<number, Written & { page: number }>, prev: (string | null)[] = [null, null, null]): PartInput[] {
  const lp = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => lefts[a + i] as Written & { page: number })
  return [
    {
      paper: PAPER, head, prev: prev[0] ?? null, pages: [1, 1], views: views(1, 2),
      left: [[0, 0, [[1, 150, 696, 460, 712]]], [2, 12, [[1, 72, 647, 540, 657.5], [2, 72, 700, 300, 710]]]], fileOnly: [], layout: layout1,
      rules: null,
      leftParts: lp(1, 1),
    },
    {
      paper: PAPER, head, prev: prev[1] ?? null, pages: [2, 3], views: views(2, 4),
      left: [[3, 25, [[2, 72, 498, 200, 508]]], [4, 41, [[3, 72, 300, 200, 310]]]], fileOnly: [[5, 41]], layout: layout2,
      rules: { 2: RULES_2 },
      leftParts: lp(2, 3),
    },
    {
      paper: PAPER, head, prev: prev[2] ?? null, pages: [4, 4], views: views(4, 4),
      left: [[6, 62, [[4, 72, 700, 300, 712]]], [7, 70, [[4, 72, 600, 200, 610]]]] as UnitWire[], fileOnly: [], layout: null, rules: null, leftParts: lp(4, 4),
    },
  ]
}

export interface Made {
  chunks: (Written & { from: number; to: number })[]
  head: Written
  readHead: ReadHead
  readChunks: ReadUnitsChunk[]
  index: LayerIndex
  lefts: Record<number, Written & { page: number }>
  parts: (Written & { from: number; to: number })[]
  readParts: ReadPart[]
  readLefts: ReadLeftPart[]
}

/** the paper written, then read back by the readers in the order the service reads it */
/** `draws`: the draw geometry each page's left part carries (by page), none by default; `draw`: the head says the parts may carry them;
 *  `pairs`: the pairs a page's left part carries, in place of LEFT_OF's (by page); `ours`: the base of the head is ours, over which
 *  the layer draws (else arXiv's: it draws nothing); `delta`: ours held as a delta over arXiv's PDF, replacing those pages */
export async function made(o: { draws?: Record<number, unknown>; draw?: boolean; pairs?: Record<number, [number, number[]][]>; ours?: boolean; delta?: [number, number][] } = {}): Promise<Made> {
  const chunks = await writeUnitChunks({ paper: PAPER, units: UNITS })
  const head = await writeHead({ paper: { ...PAPER, pages: N }, base: o.delta ? deltaBase(o.delta) : o.ours ? OURS : BASE, ...(o.delta ? { orig: ORIG_X } : o.ours ? { orig: ORIG } : {}), image: IMAGE, units: chunks, lineskip: [1, 0], ...(o.draw ? { draw: true } : {}) })
  const rh = await readHead(head.bytes, { ref: head.ref })
  const readChunks: ReadUnitsChunk[] = []
  for (const c of chunks) readChunks.push(await readUnitsChunk(c.bytes, { ref: c.ref, before: readChunks.at(-1) ?? null }))
  const index = indexOf(rh, readChunks)
  const lefts: Record<number, Written & { page: number }> = {}
  for (let p = 1; p <= N; p++) lefts[p] = await writeLeftPart({ paper: PAPER, page: p, first: TOKENS_ON_PAGE * (p - 1), tokens: tokenWire(TOKENS_ON_PAGE, p), ...(LEFT_OF[p] as (typeof LEFT_OF)[number]), ...(o.pairs?.[p] ? { pairs: o.pairs[p] } : {}), ...(o.draws?.[p] ? { draw: o.draws[p] as never } : {}) })
  const parts: (Written & { from: number; to: number })[] = []
  const readParts: ReadPart[] = []
  let chain: PartChain | null = null
  for (const input of partInputs(head.sha256, lefts)) {
    const w = await writePart({ ...input, prev: parts.at(-1)?.sha256 ?? null })
    const r = await readPart(w.bytes, { ref: w.ref, index, chain })
    parts.push(w)
    readParts.push(r)
    chain = r.chain
  }
  const readLefts: ReadLeftPart[] = []
  for (let p = 1; p <= N; p++) readLefts.push(await readLeftPart((lefts[p] as Written).bytes, { ref: (lefts[p] as Written).ref as Ref & { page: number }, streamOf: id => STREAM.get(id) }))
  return { chunks, head, readHead: rh, readChunks, index, lefts, parts, readParts, readLefts }
}

// ---------------------------------------------------------------- bytes made by hand
export const sha256Of = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
export const utf8 = (s: string) => new TextEncoder().encode(s)
export const textOf = (b: Uint8Array) => new TextDecoder().decode(b)
/** an object as bytes with its ref, as the writers would give it were it valid */
export function forged(kind: Kind, value: unknown, pos: { from?: number; to?: number; page?: number } = {}): { bytes: Uint8Array; ref: Ref } {
  const bytes = utf8(JSON.stringify(value))
  return { bytes, ref: { kind, ...pos, sha256: sha256Of(bytes), bytes: bytes.length } }
}
/** the written object's JSON, to break */
// biome-ignore lint/suspicious/noExplicitAny: a test breaks the object's types on purpose
export const parsed = (w: { bytes: Uint8Array }): any => JSON.parse(textOf(w.bytes))
