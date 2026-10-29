// file.mjs's types (JavaScript until the engine's port), for the reader and its tests
export { LayoutRefusal } from './json.mjs'
/** the maker's version: raised with any change to what the maker writes under the schema; it enters a bundle's key, and a file
 *  names it as `layout`, which a reader reads for its shape alone: a file is refused by its `schema` (§9.3 of the plan) */
export declare const LAYOUT: '30'
/** the file's schema: 2 holds `names`; 3 `lineskip`; 4 PH_FLAG.JOINED and PH_FLAG.OUTSIDE; 5 a found placeholder's fill, its
 *  row's last number where its glyphs are not black (4 + 6 × n + 1) */
export declare const LAYOUT_SCHEMA: 5
/** a placeholder's fill where no one colour holds more than half its glyphs (the row's last number, schema 5) */
export declare const MIXED_FILL: -1
/** a new-style arXiv identifier, or an old one (archive, subject class, a slash and 7 digits); never a version suffix */
export declare const isPaperId: (id: unknown) => id is string
/** a paper's version at most */
export declare const VERSION_MAX: number
/** bytes */
export declare const LAYOUT_CAP: number
export declare const LAYOUT_VALUES: number
/** the deepest the file nests: 4 */
export declare const LAYOUT_DEPTH: number
export declare const UNIT_KINDS: readonly ['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author', 'inkheads', 'inkcontents', 'inknotes', 'inkorphan', 'inknames', 'reference', 'refnames', 'affiliation', 'inkreferences']
export declare const PH_KINDS: readonly ['math', 'display', 'cite', 'ref', 'eqref', 'footnote', 'macro', 'url', 'code', 'other', 'number']
export declare const LABEL_KINDS: readonly ['number', 'item', 'caption', 'footnote']
export declare const UNIT_FLAG: { readonly TITLE: 1; readonly FRONT: 2; readonly CENTRED: 4; readonly FLUSH_LEFT: 8; readonly FLUSH_RIGHT: 16 }
export { NAME_KEYS, type NameKey } from './names.mjs'
import type { NameKey } from './names.mjs'
/** a name's flags: centred in its column; its glyphs capitals where its macro's own text is not */
export declare const NAME_FLAG: { readonly CENTRED: 1; readonly CAPITALS: 2; readonly RUN_IN: 4 }
/** a file's names at most */
export declare const NAMES_MAX: number
export declare const PH_FLAG: { readonly SOURCE_BRACKETS: 1; readonly NUMBERED: 2; readonly RAISED: 4; readonly LOWERED: 8; readonly EMPTY: 16; readonly LOST: 32; readonly TEXT: 64; readonly JOINED: 128; readonly OUTSIDE: 256 }
/** the placeholders the layer may draw as text in the page's face, whose own text the file may hold */
export declare const PAGE_TEXT_KINDS: readonly ['cite', 'ref', 'eqref']
/** a page text's code units at most, and a file's in all */
export declare const TEXT_MAX: number
export declare const PAGE_TEXT_ALL: number
/** a page text: 1 to TEXT_MAX code units; of white space a space alone; no control, bidi or separator character, no lone
 *  surrogate */
export declare function isPageText(s: unknown): s is string
/** why the maker laid a unit not (the file's `unlaid`): no anchor on our base page; its own marks set but not placed; a kind
 *  the file lays none of, or too many pieces; its anchor's lines not its tokens'; more than LINES_UNIT lines; a line on a page
 *  whose ink is not read whole; a line with no glyph of its own; a line whose glyphs a unit laid before it took; a line's
 *  erase past its bound; a line on a page not drawable; its faces past FONTS_MAX */
export declare const UNLAID: readonly ['noAnchor', 'unplacedMarks', 'kind', 'rects', 'linesUnit', 'dark', 'noLine', 'lineTaken', 'erase', 'undrawn', 'fonts']
export type UnlaidCode = (typeof UNLAID)[number]
/** a file's or a part's units not laid at most (`unlaid`) */
export declare const UNLAID_ALL: number
/** prep/<mid>/layout-<sha256>.json (spec §4.2). arXiv's PDF units, each page unrotated, y up, pages 1-based */
export interface LayoutFile {
  schema: 5
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
   *  page, x0, baseline, x1, top, bottom, size, font, flags (NAME_FLAG), unit (the unit a RUN_IN name leads, else -1),
   *  glue (the original's space between its joint and that unit's text, 0 where not RUN_IN), its TeX column's x0 and x1 */
  names: number[][]
  /** the paper's \lineskip and \lineskiplimit, PDF units, as TeX gave them (marks.mjs readSkipProbe); null: none given */
  lineskip: [lineskip: number, lineskiplimit: number] | null
  /** each colour piece's run's fill as TeX set it (marks.mjs readColours), by unit and k rising; the key only where a unit has one */
  colours?: [id: number, k: number, rgb: number][]
  /** why each unit the maker did not lay is the original's (UNLAID), by unit rising, none of `units`; the key only where a unit
   *  is not laid (a part's: of the units it tells) */
  unlaid?: [id: number, code: UnlaidCode][]
}
/** bytes, then UTF-8, then values and nesting counted, then JSON.parse, then every bound; a file of another `schema` is
 *  refused, one of another maker's `layout` is read; throws LayoutRefusal. `sized` false: none of the bounds a part holds
 *  of its own (the file's bytes and values, LINES_ALL, PAGE_TEXT_ALL, NAMES_MAX, FONTS_MAX), for a file cut into parts */
export declare function parseLayout(bytes: Uint8Array, o?: { sized?: boolean }): LayoutFile
/** a file already parsed, within the bounds of what holds it (a layer bundle): every bound parseLayout checks past
 *  JSON.parse; returns the value itself, its -0s written 0; throws LayoutRefusal */
export declare function checkLayout(value: unknown, o?: { sized?: boolean }): LayoutFile
/** the file as written: keys in the schema's order, numbers to a hundredth, no white space */
export declare function encodeLayout(file: LayoutFile): string
/** the paper's \lineskip and \lineskiplimit, or null: each within TeX's \maxdimen; `path` names it in a refusal */
export declare function checkLineskip(lineskip: unknown, path: string): [lineskip: number, lineskiplimit: number] | null
/** the keys of a layout part, in their order: the file's rows and tables, less the header, the side key, the views and
 *  `lineskip` */
export declare const PART_KEYS: readonly ['fonts', 'units', 'lines', 'frames', 'erase', 'ph', 'labels', 'headings', 'pageText', 'held', 'names']
/** a layout part: the file's rows and tables of PART_KEYS for the units of one part (a bundle 4 part holds one); its
 *  `fonts` is its own table, which its lines' font indices and its names' name an index of */
export type LayoutPart = Pick<LayoutFile, (typeof PART_KEYS)[number] | 'colours' | 'unlaid'>
/** a layout part already parsed: every row bound checkLayout checks, per part, with each row's page one of `lo` to `hi` and
 *  its box within that page's view; `views` are the views of pages lo to hi (stride 4), `pages` the paper's. Returns the
 *  value itself, its -0s written 0; throws LayoutRefusal (a RangeError for a call that is no pages of the paper) */
export declare function checkLayoutPart(value: unknown, o: { pages: number; views: readonly number[]; lo: number; hi: number }): LayoutPart
/** a layout part as written: the file's own encoders, numbers to a hundredth, keys in PART_KEYS' order, no white space */
export declare function encodeLayoutPart(part: LayoutPart): string
/** a layout part as encodeLayoutPart writes it, as the object (a writer checks it before it stringifies it) */
export declare function layoutPartRows(part: LayoutPart): LayoutPart
/** the parts' layouts as one part: rows by unit id (names by occurrence), the fonts table anew by first appearance (the
 *  lines by unit id, then the names), the parts unchanged; the layout maker's own order, so that parts cut from a file
 *  merge back to it */
export declare function mergeLayout(parts: readonly LayoutPart[]): LayoutPart
/** one located unit as the layer reads it */
export interface LayoutUnit {
  id: number; kind: (typeof UNIT_KINDS)[number]; depth: number; title: boolean; front: boolean; centred: boolean; pieces: number
  /** set flush left or flush right as TeX set its paragraph (UNIT_FLAG.FLUSH_LEFT, FLUSH_RIGHT); null: justified, centred or not told */
  flush: 'left' | 'right' | null
  lines: Float64Array                      // stride 8, as the file
  frames: Float64Array                     // stride 6
  erase: Float64Array[]                    // per line: x0, y0, x1, y1 (stride 4)
  ph: ReadonlyMap<number, { kind: (typeof PH_KINDS)[number]; flags: number; segs: Float64Array; text: string | null; fill: number | null }>   // by k; segs stride 6; text: the page text; fill: its glyphs' colour (0xRRGGBB, MIXED_FILL), null where black
  labels: Float64Array                     // per label: kind, page, x0, baseline, x1, top, bottom (stride 7)
  heading: string | null
  /** the lines its source does not write: no slot, never erased (rising, never its first) */
  held: readonly number[]
  /** each colour piece's run's fill (0xRRGGBB) as TeX set it, by its piece index */
  colours: ReadonlyMap<number, number>
}
/** a name's occurrence as the layer reads it */
export interface LayoutName {
  occurrence: number; key: NameKey; page: number; x0: number; baseline: number; x1: number; top: number; bottom: number; size: number; font: number
  centred: boolean; capitals: boolean
  /** the unit whose first line it leads (RUN_IN: set right before it on that line), else -1 */
  unit: number
  /** RUN_IN: the original's space after its joint, before the unit's text (PDF units, 0 for none) */
  glue: number
  /** its TeX column's text edges: the room it has on its line */
  cx0: number; cx1: number
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
