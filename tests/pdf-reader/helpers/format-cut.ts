import type { UnitWire } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { partTarget } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { REMOVAL, type RemovalManifest } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { type LayoutFile, type LayoutPart, NAME_FLAG } from '@/pdf-reader/engine/layout/file.mjs'

// A whole layout file and a whole left cut into parts at the doubling schedule, for the format's tests (the contract's test 1:
// "a prefix cut by the last left unit first framed on a page <= b: enough for the chain's checks; the exact cutter is E4b's").
// K is one entry for each unit v0 may place (a left unit at its stream, a layout-only unit after the largest stream of a left
// unit with a smaller id, plus a half), ordered by (slot, id); part i holds the entries after the last page-(b(i-1)) unit and up
// to the last page-b(i) unit; every unit is carried whole, so a part's views reach as far as its units do

export interface CutPart {
  pages: [number, number]
  views: number[]
  left: UnitWire[]
  fileOnly: [number, number][]
  layout: LayoutPart
  manifest: RemovalManifest
}

/** the parts of `layout` and `left` (the left's units, [id, stream, rects]) at the doubling schedule */
export function cutAt(layout: LayoutFile, left: readonly UnitWire[]): CutPart[] {
  const N = layout.paper.pages
  const linesOf = new Map(layout.lines.map(([id, rows]) => [id, rows]))
  const leftOf = new Map(left.map(w => [w[0], w]))
  // K
  const entries: { id: number; slot: number; after: number | null; first: number; last: number }[] = []
  let maxStream = -1
  const ids = [...new Set([...left.map(w => w[0]), ...layout.units.map(u => u[0])])].sort((a, b) => a - b)
  for (const id of ids) {
    const w = leftOf.get(id)
    const pages: number[] = []
    if (w) for (const r of w[2]) pages.push(r[0])
    const rows = linesOf.get(id)
    if (rows) for (let j = 0; j < rows.length; j += 8) pages.push(rows[j] as number)
    const first = pages.length ? Math.min(...pages) : N + 1
    const last = pages.length ? Math.max(...pages) : 0
    if (w) { entries.push({ id, slot: w[1], after: null, first, last }); maxStream = Math.max(maxStream, w[1]) } else entries.push({ id, slot: maxStream + 0.5, after: maxStream, first, last })
  }
  entries.sort((a, b) => a.slot - b.slot || a.id - b.id)
  const frontier = (b: number) => { let f = -1; entries.forEach((e, i) => { if (e.first <= b) f = i }); return f }
  const parts: CutPart[] = []
  let done = -1
  for (let a = 1; a <= N;) {
    const b = partTarget(a, N)
    const upTo = b === N ? entries.length - 1 : frontier(b)
    const mine = entries.slice(done + 1, Math.max(done, upTo) + 1)
    done = Math.max(done, upTo)
    const have = new Set(mine.map(e => e.id))
    const reach = Math.max(b, ...mine.map(e => (e.last > 0 ? e.last : 0)))
    const inPart = <T>(rows: T[], idOf: (r: T) => number) => rows.filter(r => have.has(idOf(r)))
    const lines = inPart(layout.lines, r => r[0])
    // the part's fonts by first use: its lines by unit id, then its names
    const names = layout.names.filter(r => (r[10]! & NAME_FLAG.RUN_IN ? have.has(r[11] as number) : (r[2] as number) >= a && (r[2] as number) <= b))
    const table: string[] = []
    const fontAt = (i: number) => { const name = layout.fonts[i] as string; let at = table.indexOf(name); if (at < 0) { at = table.length; table.push(name) } return at }
    const remapped = lines.map(([id, rows]) => [id, rows.map((v, j) => (j % 8 === 7 ? fontAt(v) : v))] as [number, number[]])
    const namedRows = names.map(r => r.map((v, j) => (j === 9 ? fontAt(v) : v)))
    const part: LayoutPart = {
      fonts: table,
      units: inPart(layout.units, r => r[0]), lines: remapped, frames: inPart(layout.frames, r => r[0]), erase: inPart(layout.erase, r => r[0]),
      ph: inPart(layout.ph, r => r[0]), labels: inPart(layout.labels, r => r[0]), headings: inPart(layout.headings, r => r[0]),
      pageText: inPart(layout.pageText, r => r[0]), held: inPart(layout.held, r => r[0]), names: namedRows,
    }
    const layoutIds = new Set(part.units.map(u => u[0]))
    const fileOnly = mine.filter(e => e.after !== null && layoutIds.has(e.id)).map(e => [e.id, e.after as number] as [number, number])
    const manifest: RemovalManifest = {
      schema: 1, removal: REMOVAL, pages: N, sets: {}, appended: 0, stats: {},
      page: Object.fromEntries(Array.from({ length: b - a + 1 }, (_, i) => [a + i, { ok: true }])),
    }
    parts.push({
      pages: [a, b], views: layout.views.slice(4 * (a - 1), 4 * reach), left: mine.filter(e => e.after === null).map(e => leftOf.get(e.id) as UnitWire).sort((x, y) => x[0] - y[0]), fileOnly: fileOnly.sort((x, y) => x[0] - y[0]), layout: part, manifest,
    })
    a = b + 1
  }
  return parts
}
