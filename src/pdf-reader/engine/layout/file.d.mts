// file.mjs's types (JavaScript until the engine's port), for the reader and its tests
export { LayoutRefusal } from './json.mjs'
/** the maker's version: raised with any change to what the maker writes under the schema; it enters a bundle's key, and a file
 *  names it as `layout`, which a reader reads for its shape alone: a file is refused by its `schema` (§9.3 of the plan) */
export declare const LAYOUT: '4'
/** the file's schema: 2 holds `names` */
export declare const LAYOUT_SCHEMA: 2
/** a new-style arXiv identifier, or an old one (archive, subject class, a slash and 7 digits); never a version suffix */
export declare const isPaperId: (id: unknown) => id is string
/** a paper's version at most */
export declare const VERSION_MAX: number
/** bytes */
export declare const LAYOUT_CAP: number
export declare const LAYOUT_VALUES: number
/** the deepest the file nests: 4 */
export declare const LAYOUT_DEPTH: number
export declare const UNIT_KINDS: readonly ['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author']
export declare const PH_KINDS: readonly ['math', 'display', 'cite', 'ref', 'eqref', 'footnote', 'macro', 'url', 'code', 'other']
export declare const LABEL_KINDS: readonly ['number', 'item', 'caption', 'footnote']
export declare const UNIT_FLAG: { readonly TITLE: 1; readonly FRONT: 2; readonly CENTRED: 4 }
export { NAME_KEYS, type NameKey } from './names.mjs'
import type { NameKey } from './names.mjs'
/** a name's flags: centred in its column; its glyphs capitals where its macro's own text is not */
export declare const NAME_FLAG: { readonly CENTRED: 1; readonly CAPITALS: 2 }
/** a file's names at most */
export declare const NAMES_MAX: number
export declare const PH_FLAG: { readonly SOURCE_BRACKETS: 1; readonly NUMBERED: 2; readonly RAISED: 4; readonly LOWERED: 8; readonly EMPTY: 16; readonly LOST: 32; readonly TEXT: 64 }
/** the placeholders the layer may draw as text in the page's face, whose own text the file may hold */
export declare const PAGE_TEXT_KINDS: readonly ['cite', 'ref', 'eqref']
/** a page text's code units at most, and a file's in all */
export declare const TEXT_MAX: number
export declare const PAGE_TEXT_ALL: number
/** a page text: 1 to TEXT_MAX code units; of white space a space alone; no control, bidi or separator character, no lone
 *  surrogate */
export declare function isPageText(s: unknown): s is string
/** prep/<mid>/layout-<sha256>.json (spec §4.2). arXiv's PDF units, each page unrotated, y up, pages 1-based */
export interface LayoutFile {
  schema: 2
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
  /** each found page-text placeholder's own text (its glyphs' characters in stream order), by unit and k, rising */
  pageText: [id: number, k: number, text: string][]
  /** per unit, the lines its source does not write, by index rising: held (no slot, never erased) */
  held: [id: number, lines: number[]][]
  /** each occurrence of a babel name TeX set (marks.mjs's name marks), by occurrence rising: occurrence, key (NAME_KEYS),
   *  page, x0, baseline, x1, top, bottom, size, font, flags (NAME_FLAG) */
  names: number[][]
}
/** bytes, then UTF-8, then values and nesting counted, then JSON.parse, then every bound; a file of another `schema` is
 *  refused, one of another maker's `layout` is read; throws LayoutRefusal */
export declare function parseLayout(bytes: Uint8Array): LayoutFile
/** a file already parsed, within the bounds of what holds it (a layer bundle): every bound parseLayout checks past
 *  JSON.parse; returns the value itself, its -0s written 0; throws LayoutRefusal */
export declare function checkLayout(value: unknown): LayoutFile
/** the file as written: keys in the schema's order, numbers to a hundredth, no white space */
export declare function encodeLayout(file: LayoutFile): string
/** one located unit as the layer reads it */
export interface LayoutUnit {
  id: number; kind: (typeof UNIT_KINDS)[number]; depth: number; title: boolean; front: boolean; centred: boolean; pieces: number
  lines: Float64Array                      // stride 8, as the file
  frames: Float64Array                     // stride 6
  erase: Float64Array[]                    // per line: x0, y0, x1, y1 (stride 4)
  ph: ReadonlyMap<number, { kind: (typeof PH_KINDS)[number]; flags: number; segs: Float64Array; text: string | null }>   // by k; segs stride 6; text: the page text
  labels: Float64Array                     // per label: kind, page, x0, baseline, x1, top, bottom (stride 7)
  heading: string | null
  /** the lines its source does not write: no slot, never erased (rising, never its first) */
  held: readonly number[]
}
/** a name's occurrence as the layer reads it */
export interface LayoutName {
  occurrence: number; key: NameKey; page: number; x0: number; baseline: number; x1: number; top: number; bottom: number; size: number; font: number
  centred: boolean; capitals: boolean
}
export interface LayoutIndex {
  readonly file: LayoutFile
  unit(id: number): LayoutUnit | null
  /** the located units with a frame on the page, ids rising */
  onPage(page: number): readonly number[]
  /** the names on the page, in the file's order */
  names(page: number): readonly LayoutName[]
  /** throws a RangeError for a page not of the file */
  view(page: number): readonly [number, number, number, number]
  /** throws a RangeError for an index not of `fonts` */
  font(index: number): string
}
/** a parsed file's index, in one pass */
export declare function indexLayout(file: LayoutFile): LayoutIndex
