import { indexLayout, LAYOUT_SCHEMA, parseLayout, UNIT_KINDS } from '@/pdf-reader/engine/layout/file.mjs'

// The layout file of a made-up paper whose units are given by their lines on the original (the left's geometry: each unit's
// [page, x0, y0, x1, y1] rectangles). The layer draws a unit only from the layout file, so a test that gives the run a paper
// of paragraphs gives it the file those paragraphs are in: each rectangle one line of it (its baseline 2.15 over the
// rectangle's foot, 10 pt, one frame a line, erased across), and no placeholder. A unit's translation is its text pieces
// alone: the units file's pieces are one text each (`[[0]]`)

type Rect = readonly [number, number, number, number, number]
/** a unit: its id, its kind and its rectangles on the original */
export interface GeometryUnit { id: number; kind: string; rects: readonly Rect[] }

/** the `tex` option of openProto for these units over `pages` pages: the file's index and the units' pieces */
export function fileOfGeometry(units: readonly GeometryUnit[], pages = 1, o: { symbols?: 'text' | 'strict'; extents?: 'v0' | 'tex'; pieces?: ReadonlyMap<number, unknown[]> } = {}) {
  const baseline = (r: Rect) => Math.round((r[2] + 2.15) * 100) / 100
  const file = {
    schema: LAYOUT_SCHEMA, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages }, left: '',
    views: Array.from({ length: pages }, () => [0, 0, 300, 300]).flat(), fonts: ['F1'],
    units: units.map(u => [u.id, UNIT_KINDS.indexOf(u.kind as never), 9, 0, 1]),
    lines: units.map(u => [u.id, u.rects.flatMap(r => [r[0], r[1], r[3], baseline(r), baseline(r) + 7, baseline(r) - 2, 10, 0])]),
    frames: units.map(u => [u.id, u.rects.flatMap((r, j) => [r[0], 0, j, 1, j ? 0 : -1, 0])]),
    erase: units.map(u => [u.id, u.rects.flatMap((r, j) => [j, r[1], baseline(r) - 2, r[3], baseline(r) + 7])]),
    ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
  }
  const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(file))))
  return { index, pieces: o.pieces ?? new Map(units.map(u => [u.id, [[0]]])), symbols: o.symbols ?? 'text', extents: o.extents ?? 'v0' }
}

/** a geometry's units as the layer reads the file of them: `kinds` by id, `left.units` [id, stream, rects] */
export function unitsOfGeometry(geometry: { kinds: readonly string[]; left: { units: readonly unknown[] } }): GeometryUnit[] {
  return (geometry.left.units as [number, number, Rect[]][]).map(([id, , rects]) => ({ id, kind: geometry.kinds[id] ?? 'para', rects }))
}
