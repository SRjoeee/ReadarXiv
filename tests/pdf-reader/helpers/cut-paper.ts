import type { UnitWire } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import type { LeftPageInput, WholePaper } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import type { BundleUnit } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { LAYOUT, LAYOUT_SCHEMA, type LayoutFile, NAME_FLAG, NAME_KEYS, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { PDFJS } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { tokenWire } from './format-paper'

// Papers made whole for the cutter's tests: a spec of units (where each is located by the original's side, where the layout
// file frames it) becomes the units, the left, the layout file and each page's left part input, all consistent with the readers'
// bounds. The real papers (AXT_LAB) are loaded by the test itself

export interface UnitSpec {
  /** the left stream (a token's global index); null: the unit is in the layout file alone (v0 does not place it) */
  stream: number | null
  /** pages with left rects (a unit the original's side locates), `perPage` rects on each */
  rects?: number[]
  /** pages the layout file frames the unit on, `perPage` lines on each */
  lines?: number[]
  perPage?: number
  kind?: (typeof UNIT_KINDS)[number]
  /** a heading's source in the layout file (the unit is a heading) */
  heading?: string
  /** a table cell's place: the unit is a cell of this table (its column's consistency group) */
  cell?: { table: number; row: number; col: number; span?: number; head?: boolean }
}
export interface PaperSpec {
  pages: number
  units: UnitSpec[]
  /** babel names: the page of each (a plain name; a run-in name takes `{ page, unit }`) */
  names?: ({ page: number } | { page: number; unit: number })[]
}

export const PAPER_ID = { id: '2608.04322', version: 1 }
export const BASE_OF = { bytes: 10_000, sha256: '0123456789abcdef'.repeat(4), xref: 9_000 }
export const TOKENS_PER_PAGE = 20

export type Whole = WholePaper & { layout: LayoutFile | null; units: BundleUnit[]; left: { kinds: string[]; pages: [number, number, number, number][]; units: UnitWire[] } }

const rowY = (k: number) => 750 - (k % 700)

/** the paper the spec describes, whole */
export function wholeOf(spec: PaperSpec, o: { layout?: boolean } = {}): Whole {
  const N = spec.pages
  const units: BundleUnit[] = spec.units.map((u, id) => [u.cell ? 'cell' : u.heading === undefined ? u.kind ?? 'para' : 'heading', 0, null, u.cell ? { span: 1, head: false, ...u.cell } : null, null, [[0, `unit ${id}`]]] as BundleUnit)
  const views: [number, number, number, number][] = Array.from({ length: N }, () => [0, 0, 612, 792])
  const left: UnitWire[] = []
  const fonts = spec.units.some(u => u.lines?.length) || (spec.names ?? []).length ? ['CMR10'] : []
  const L: LayoutFile = {
    schema: LAYOUT_SCHEMA, layout: LAYOUT, pdfjs: PDFJS, paper: { ...PAPER_ID, pages: N }, left: '', views: views.flat(), fonts,
    units: [], lines: [], frames: [], erase: [], ph: [], labels: [], headings: [], pageText: [], held: [], names: [], lineskip: [1, 0],
  }
  spec.units.forEach((u, id) => {
    const per = u.perPage ?? 1
    if (u.stream !== null) {
      const rects: UnitWire[2] = []
      let k = 0
      for (const p of u.rects ?? []) for (let i = 0; i < per; i++, k++) rects.push([p, 72, rowY(k) - 2, 540, rowY(k) + 8])
      left.push([id, u.stream, rects])
    }
    if (u.lines?.length) {
      const rows: number[] = [], frames: number[] = []
      let k = 0, share = -1
      for (const p of u.lines) {
        frames.push(p, 0, k, per, share, 12)
        share = Math.max(share, 0) + 1
        for (let i = 0; i < per; i++, k++) rows.push(p, 72, 540, rowY(k), rowY(k) + 8, rowY(k) - 2, 10, 0)
      }
      L.lines.push([id, rows])
      L.frames.push([id, frames])
    }
    if (u.lines?.length || u.stream === null) L.units.push([id, UNIT_KINDS.indexOf(u.cell ? 'cell' : u.heading === undefined ? u.kind ?? 'para' : 'heading'), 9, 0, 1])
    if (u.heading !== undefined && (u.lines?.length || u.stream === null)) L.headings.push([id, u.heading])
  })
  for (const [i, n] of (spec.names ?? []).entries()) {
    const runIn = 'unit' in n
    L.names.push([i, NAME_KEYS.indexOf('abstract'), n.page, 280, 680, 332.5, 687, 677.5, 9, 0, runIn ? NAME_FLAG.RUN_IN : NAME_FLAG.CENTRED, runIn ? n.unit : -1, runIn ? 2 : 0, 72, 540])
  }
  return {
    paper: { ...PAPER_ID, pages: N }, base: { ...BASE_OF }, versions: { image: '1' }, units,
    left: { kinds: units.map(u => u[0]), pages: views, units: left.sort((a, b) => a[0] - b[0]) }, layout: o.layout === false ? null : L,
  }
}

/** each page's left part input: 20 tokens a page, a span for each unit with a rect on the page, the first range at the unit's
 *  stream where it lies on the page */
export function leftPagesOf(whole: Whole): (page: number) => LeftPageInput {
  return page => {
    const first = TOKENS_PER_PAGE * (page - 1)
    const spans: [number, number[]][] = []
    for (const [id, stream, rects] of whole.left.units) {
      if (!rects.some(r => r[0] === page)) continue
      const at = stream - first
      spans.push([id, [at >= 0 && at < TOKENS_PER_PAGE ? at : 0, 1]])
    }
    return { first, tokens: tokenWire(TOKENS_PER_PAGE, page), spans, pairs: [] }
  }
}
