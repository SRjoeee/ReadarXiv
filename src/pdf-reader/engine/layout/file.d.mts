// file.mjs's types (JavaScript until the engine's port), for the reader and its tests
export { LayoutRefusal } from './json.mjs'
/** the maker's version: raised with any change to the layout maker or the schema; it enters no output identity */
export declare const LAYOUT: '1'
/** bytes */
export declare const LAYOUT_CAP: number
export declare const LAYOUT_VALUES: number
/** the deepest the file nests: 4 */
export declare const LAYOUT_DEPTH: number
export declare const UNIT_KINDS: readonly ['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author']
export declare const PH_KINDS: readonly ['math', 'display', 'cite', 'ref', 'eqref', 'footnote', 'macro', 'url', 'code', 'other']
export declare const LABEL_KINDS: readonly ['number', 'item', 'caption', 'footnote']
export declare const UNIT_FLAG: { readonly TITLE: 1; readonly FRONT: 2; readonly CENTRED: 4 }
export declare const PH_FLAG: { readonly SOURCE_BRACKETS: 1; readonly NUMBERED: 2; readonly RAISED: 4; readonly LOWERED: 8; readonly EMPTY: 16; readonly LOST: 32 }
/** prep/<mid>/layout-<sha256>.json (spec §4.2). arXiv's PDF units, each page unrotated, y up, pages 1-based */
export interface LayoutFile {
  schema: 1
  layout: string
  pdfjs: string
  paper: { id: string; version: number; pages: number }
  left: string
  views: number[]                          // per page: x0, y0, x1, y1 (stride 4)
  fonts: string[]                          // PostScript names, lines name them by index
  units: [id: number, kind: number, depth: number, flags: number, pieces: number][]
  lines: [id: number, rows: number[]][]    // per line: page, x0, x1, baseline, top, bottom, size, font (stride 8)
  frames: [id: number, rows: number[]][]   // per frame: page, column, first line, lines, share, below (stride 6)
  erase: [id: number, rows: number[]][]    // per rectangle: line, x0, y0, x1, y1 (stride 5)
  ph: number[][]                           // unit, k, kind, flags, then per segment: page, x0, baseline, x1, top, bottom
  labels: number[][]                       // unit, kind, page, x0, baseline, x1, top, bottom
  headings: [id: number, src: string][]
}
/** bytes, then UTF-8, then values and nesting counted, then JSON.parse, then every bound; throws LayoutRefusal */
export declare function parseLayout(bytes: Uint8Array): LayoutFile
/** the file as written: keys in the schema's order, numbers to a hundredth, no white space */
export declare function encodeLayout(file: LayoutFile): string
/** one located unit as the layer reads it */
export interface LayoutUnit {
  id: number; kind: (typeof UNIT_KINDS)[number]; depth: number; title: boolean; front: boolean; centred: boolean; pieces: number
  lines: Float64Array                      // stride 8, as the file
  frames: Float64Array                     // stride 6
  erase: Float64Array[]                    // per line: x0, y0, x1, y1 (stride 4)
  ph: ReadonlyMap<number, { kind: (typeof PH_KINDS)[number]; flags: number; segs: Float64Array }>   // by k; segs stride 6
  labels: Float64Array                     // per label: kind, page, x0, baseline, x1, top, bottom (stride 7)
  heading: string | null
}
export interface LayoutIndex {
  readonly file: LayoutFile
  unit(id: number): LayoutUnit | null
  /** the located units with a frame on the page, ids rising */
  onPage(page: number): readonly number[]
  /** throws a RangeError for a page not of the file */
  view(page: number): readonly [number, number, number, number]
  /** throws a RangeError for an index not of `fonts` */
  font(index: number): string
}
/** a parsed file's index, in one pass */
export declare function indexLayout(file: LayoutFile): LayoutIndex
