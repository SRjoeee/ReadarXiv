// format.mjs's types: the layer's wire format, BUNDLE 4 (the prepare pipeline's bundle 4 contract)
import type { LayoutFile, LayoutPart } from '../layout/file.mjs'
import type { ReadBundle } from './bundle.mjs'
import type { BundleUnit, InkBundleUnit, OcrBundleUnit } from './units.mjs'
import type { Draw, DrawSource } from './draw.mjs'

export type { UnitWire } from './bundle.mjs'
import type { UnitWire } from './bundle.mjs'

// ---------------------------------------------------------------- the versions and the bounds
/** the format: raised with any change to the shape of a head, part, left part or catalog; 6, a part with no layout says why;
 *  7, a left part's draw items carry their fills; 8, the head's base says whose PDF the layer is drawn over (ours or arXiv's)
 *  and `orig` names arXiv's beside ours, the catalog names the base; 9, our base wrapped by optional content; 10, the ink units
 *  and a part's figure units; 11, a figure row's set and room; 12, the head's and the catalog's recogniser (`versions.ocr`) and
 *  the late units chunks of the bitmap figures' labels */
export declare const BUNDLE5: '12'
/** the formats a reader takes: its own, 7's (a bundle drawn over arXiv's PDF; its head read as `base.source` 'arxiv'), 9's,
 *  10's (a figure row of 10's each unit its own set, with no room) and 11's (no recogniser named, no late chunk) */
export declare const BUNDLES_READ: readonly ['7', '9', '10', '11', '12']
/** whose PDF a layer is drawn over: our compile's final pass, or arXiv's */
export declare const BASE_SOURCES: readonly ['ours', 'arxiv']
export type BaseSource = (typeof BASE_SOURCES)[number]
/** how a base of ours is held: a delta over arXiv's PDF, or our whole PDF (`full`, no `kind` on the wire); the delta's bounds */
export { BASE_KINDS, DELTA_MAX_BYTES, DELTA_MAX_SHARE, REPLACED_MAX, deltaSection, replacedWhy } from '../layout/delta-wire.mjs'
/** why a head of 8's base is arXiv's (`base.why`): LAYOUT_REFUSED's codes, which each part with no layout says too */
export declare const BASE_WHYS: typeof LAYOUT_REFUSED
/** whether a head's layer draws: its base is ours (BUNDLE 8); a head of 7 and every head over arXiv's PDF draw nothing */
export declare const layerDraws: (base: unknown) => boolean
/** the limits a retryable refusal names: the box's wall clock and the compile budget */
export declare const RETRY_LIMITS: readonly ['wall', 'budget']
/** whether a refusal of our base page may be transient (the host retries it once rather than commit a fallback head): exactly
 *  where it names the wall clock or the compile budget (`limit` 'wall' or 'budget') */
export declare const baseRefusalRetryable: (refusal: unknown) => boolean
/** a units chunk's own format (envelope `"format":"1"`): raised only by a change to the chunk's shape */
export declare const UNITS_FORMAT: '1'
export declare const INK_UNITS_FORMAT: '2'
export declare const UNITS_FORMATS_READ: readonly string[]
/** the reader's contract, `b<BUNDLE5>-j<PDFJS>`, named with the 5 beside bundle.mjs's CTAG whatever BUNDLE5's value */
export declare const CTAG5: string
/** the content's, `<CTAG5>-p<PIPELINE>-l<LAYOUT>-r<REMOVAL>-o<OCR>`: a key's directory, the catalog's name */
export declare const VTAG5: string
/** a units chunk's bytes at most, and its values (counted before JSON.parse) */
export declare const UNITS_CAP: number
export declare const UNITS_VALUES: number
/** the chunks a paper's units may fill at most, and their bytes and values in all: an abuse guard (10 times the longest real
 *  book and more), not a limit on a paper's length */
export declare const CHUNKS_MAX: number
export declare const UNITS_TOTAL_BYTES: number
export declare const UNITS_TOTAL_VALUES: number
/** the last unit id a paper the guard accepts can hold (UNITS_TOTAL_VALUES), and the most ids forwarded as `dropped` (M19, M21) */
export declare const UNIT_ID_MAX: number
export declare const DROPPED_MAX: number
export declare const HEAD_CAP: number
export declare const HEAD_VALUES: number
export declare const PART_CAP: number
export declare const PART_VALUES: number
export declare const LEFT_CAP: number
export declare const LEFT_VALUES: number
export declare const CATALOG_CAP: number
export declare const CATALOG_VALUES: number
/** a part's content at most, in bytes (the cut holds a part to it) */
export declare const CONTENT_MAX: number
/** a left part's tokens at most, and the tokens its spans may name, per token */
export declare const TOKENS_PAGE: number
export declare const SPANNED_PER_TOKEN: number
/** the tokens' wire: integers of TOKEN_SCALE (thousandths of a PDF unit); a decoded value past ±TOKEN_LIMIT is no PDF's */
export declare const TOKEN_SCALE: number
/** the six coded fields of a left part's tokens, in the wire's order */
export declare const TOKEN_FIELDS: readonly ['l', 'r', 'y', 'h', 'top', 'bottom']
/** a number on the wire's grid (thousandths of a PDF unit), as the views and rectangles of a part are written */
export declare const onGrid: (v: number) => number
export declare const TOKEN_LIMIT: number
/** a left rectangle of a part lies within its page's view by this, PDF units */
export declare const RECT_SLACK: number
/** why the parts end before the paper does: FINAL (the paper's own, which no other build changes) and BUILD-SCOPED (of the
 *  build's resources), and both */
export declare const FINAL_END_WHYS: readonly ['bound', 'part']
export declare const BUILD_END_WHYS: readonly ['memory', 'internal', 'deadline']
export declare const END_WHYS: readonly ['bound', 'part', 'memory', 'internal', 'deadline']
/** whether an ending is final: no other build of the engine would end otherwise */
export declare function isFinalEnd(why: string): why is 'bound' | 'part'

// ---------------------------------------------------------------- types
/** a reference to an object (amendment M1): its kind, digest and bytes, and its place (`from` and `to` of a chunk or a part,
 *  `page` of a left part); no key, which is derived from the digest */
export interface Ref { kind: Kind; sha256: string; bytes: number; from?: number; to?: number; page?: number }
export interface Caps { bytes?: number; values?: number }
export type HeadVersions = { pipeline: string; layout: string; removal: string; pdfjs: string; image: string }
export type EndWhy = (typeof END_WHYS)[number]
/** the tokens' wire for one page: `perPage` [n], and each field n integers of TOKEN_SCALE, delta-coded */
export interface TokenWire { perPage: number[]; l: number[]; r: number[]; y: number[]; h: number[]; top: number[]; bottom: number[] }

export interface ReadUnitsChunk {
  kind: 'units'; sha256: string; bytes: number
  /** the values the chunk holds, as countValues counts them */
  values: number
  paper: { id: string; version: number }; pipeline: string
  from: number; to: number
  /** [i] is unit from + i; null where it does not stand */
  units: (BundleUnit | null)[]
  /** the ids that did not stand, rising */
  dropped: number[]
  /** a flag for each of ids 0 … to, carried to the next chunk */
  stands: Uint8Array
}
/** a chunk read with `bodies: false` (amendment M21): `units` holds `true` (stands) or null, and `part` what the index keeps of them */
export interface ReadUnitsChunkLight extends Omit<ReadUnitsChunk, 'units'> {
  units: (true | null)[]
  part: { kinds: (string | null)[]; records: UnitRecords; external: number[] }
  /** each unit's piece count, 0 for a unit that does not stand (amendment M24) */
  pieces: Uint32Array
}
/** the page-and-line check a base of ours passed: our page count and arXiv's (both the paper's), every page box equal to
 *  arXiv's, the share of our lines found on arXiv's PDF (0 to 1, to a ten-thousandth) */
export interface BaseCheck { pages: [ours: number, arxiv: number]; boxes: 'equal'; carried: number }
/** a base of ours held as a delta over arXiv's PDF (`kind` 'delta'): `bytes` and `sha256` the delta section's, `xref` its
 *  startxref in the composed document (arXiv's bytes first), the check's pages [M, N] (M < N only for a paper of several
 *  toplevel sources), the pages it writes again (`replaced`, ranges within our M) and its counts */
export interface DeltaBase { source: 'ours'; kind: 'delta'; bytes: number; sha256: string; xref: number; pages: number; tree: string; check: BaseCheck; replaced: [from: number, to: number][]; stats: import('../layout/delta.mjs').DeltaStats & Partial<WrapStats>; unhidden?: [unit: number, why: Unhidden][]; labelKept?: number[]; ledger?: import("../layout/ledger.mjs").LedgerSummary }
/** our pages wrapped by optional content (layout/wrap.mjs): every unit with a group `axt:u<id>` and in neither list is the
 *  reader's to hide where it draws it; `unhidden` the units whose ink stays the original's and why, `labelKept` those whose
 *  label is left the original's ink (only the body drawn) */
export type WrapStats = import('../layout/delta-wire.mjs').WrapStats
export type Unhidden = import('../layout/delta-wire.mjs').Unhidden
/** the PDF a layer is drawn over (the head's `base`): ours, the final pass of our marked compile, with its page count, the
 *  TeX Live year it was compiled on ('2025') and its check; or arXiv's, with why ours was refused where a head of 8 says it
 *  (absent: a head of 7, or a producer that made no base of its own). `xref`: the PDF's last cross-reference section's
 *  offset */
export type HeadBase =
  | { source: 'ours'; kind?: undefined; bytes: number; sha256: string; xref: number; pages: number; tree: string; check: BaseCheck; stats?: WrapStats; unhidden?: [unit: number, why: Unhidden][]; labelKept?: number[]; ledger?: import("../layout/ledger.mjs").LedgerSummary }
  | DeltaBase
  | { source: 'arxiv'; bytes: number; sha256: string; xref: number; why?: LayoutRefused }
export interface ReadHead {
  kind: 'head'; sha256: string; bytes: number; paper: { id: string; version: number; pages: number }
  /** the head's format (BUNDLES_READ) */
  bundle: '7' | '8'
  /** the PDF the layer is drawn over */
  base: HeadBase
  /** arXiv's PDF, where the base is ours; null where the base is arXiv's */
  /** with its startxref (`xref`) where the base is a delta: the section the delta's /Prev names */
  orig: { bytes: number; sha256: string; xref?: number } | null
  versions: HeadVersions
  units: (Ref & { from: number; to: number })[]; lineskip: [number, number] | null
  /** 1: the parts may carry the draw of their pages' left parts (a page can still have none); 0 (absent in the bytes): not made with them */
  draw: 0 | 1
}
export interface LayerIndex {
  kind: 'index'; sha256: string
  head: ReadHead
  units: readonly (BundleUnit | null)[]; kinds: readonly (string | null)[]; dropped: readonly number[]
  /** derived once from the units (amendment M15): the index's shape is frozen with it */
  records: UnitRecords
  /** the late chunks past the head's (the bitmap figures' labels, PDF-READER §19.15), in id order; none in an index of the head's alone */
  late?: readonly (Ref & { from: number; to: number })[]
}
/**
 * An index made of chunks read without bodies (amendment M24): each unit a stands flag, its kind and its piece count, the
 * records as the full index has them. What readPart checks a part against is all in it; the door, the rows and the merge need
 * the bodies and refuse it (a TypeError)
 */
export interface LightLayerIndex {
  kind: 'index'; light: true; sha256: string
  head: ReadHead
  units: readonly (true | null)[]; kinds: readonly (string | null)[]; pieces: Uint32Array; dropped: readonly number[]
  records: UnitRecords
  late?: readonly (Ref & { from: number; to: number })[]
}
/** what the parts told so far fix: a pure function of the parts' sequence */
export interface PartChain {
  readonly head: string; readonly through: number
  /** the last part's digest, null before any */
  readonly last: string | null
  /** the last K entry told, in (slot, id) order (-Infinity, -1 before any) */
  readonly slot: number; readonly id: number
  /** a flag for each unit of the paper that a part has told (as a left unit or a file-only one): none is told twice */
  readonly told: Uint8Array
  /** each unit whose figure row a part told (a figure unit's left anchor is told apart, in `told`) */
  readonly figured?: Uint8Array
  /** a flag for each table group (groupsOfCells) that an earlier part told a member of: a later part tells no other member of it (amendment M18) */
  readonly groups: Uint8Array
  /** the furthest page any part's views reached (a part whose own units reach less far leaves the rest to the part that told them) */
  readonly reach: number
  /** the views of pages through + 1 … reach */
  readonly ahead: readonly number[]
}
/** why a part has no layout, as its wire records it in place of one: TeX's (`compile`, `texlive`, `engine`), ours (`marks`),
 *  the carry's (`carry`), and BUNDLE 8's where our compile is no base page (`final`: the final pass failed, moved a mark or had
 *  no budget; `boxes`: a page of ours not arXiv's size, or other page counts) */
export declare const LAYOUT_REFUSED: readonly ['compile', 'carry', 'engine', 'texlive', 'marks', 'final', 'boxes', 'wrap']
export type LayoutRefused = (typeof LAYOUT_REFUSED)[number]
/** a record's `why`, in code units at most */
export declare const WHY_MAX: 300
export interface LayoutRefusalRecord { refused: LayoutRefused; why: string }
/** whether a part's `layout` is a refusal's record, not a layout part */
export declare const isLayoutRefusal: (v: unknown) => v is LayoutRefusalRecord
export interface ReadPart {
  kind: 'part'; sha256: string; bytes: number; head: string; prev: string | null
  pages: [from: number, to: number]; reach: number; views: readonly number[]
  /** `layout` null where the part has none, whatever its wire held there (a refusal's record, or null) */
  left: UnitWire[]; fileOnly: [id: number, after: number][]; layout: LayoutPart | null
  /** why the part has no layout, as its wire recorded it; null where it has one, or where none was recorded */
  noLayout: Readonly<LayoutRefusalRecord> | null
  /** the rules near its table cells by page (x0, y0, x1, y1 stride 4: layer2.mjs cellBands), null where the layout is none or no page has any */
  rules: Readonly<Record<number, readonly number[]>> | null
  /** its pages' figure units (BUNDLE 10, figure-rows.mjs), none where its layout is none */
  figures: readonly import('./figure-rows.mjs').FigureRow[]
  leftParts: (Ref & { page: number })[]
  /** the state after this part */
  chain: PartChain
}
export interface ReadLeftPart {
  kind: 'left'; sha256: string; bytes: number; page: number; first: number
  table: { n: number; l: Float32Array; r: Float32Array; y: Float32Array; h: Float32Array; top: Float32Array; bottom: Float32Array }
  spans: [id: number, ranges: number[]][]; pairs: [id: number, runs: number[]][]
  /** the page's draw geometry (E-C), checked; null: the browser reads the page itself */
  draw: Draw | null
}
/** the base a catalog of 8 names (catalogBase): ours by its name (baseKey), digest and bytes; arXiv's by its digest and bytes */
export type CatalogBase = { source: 'ours'; kind?: undefined; key: string; sha256: string; bytes: number } | { source: 'ours'; kind: 'delta'; object: { key: string; sha256: string; bytes: number } } | { source: 'arxiv'; sha256: string; bytes: number }
export interface ReadCatalog {
  kind: 'catalog'; bundle: '7' | '8'; sha256: string; bytes: number; paper: { id: string; version: number; pages: number }; versions: HeadVersions
  head: Ref
  /** the base, in a catalog of 8; null in one of 7 */
  base: CatalogBase | null
  units: (Ref & { from: number; to: number })[]; parts: (Ref & { from: number; to: number })[]
  end: { through: number; refused?: EndWhy }
}

// ---------------------------------------------------------------- readers
/** a units chunk as received (`before`: the chunk read before it, null for the first); a unit that does not stand is null at
 *  its id and in `dropped`; throws BundleRefusal, a TypeError for bytes that are no Uint8Array */
/**
 * `dropped` (amendment M19): for a chunk read alone (`before` null, `ref.from` > 0), the ids below `from` that did not stand,
 * rising (default none: every other earlier id stands); a nested piece naming one drops its unit as in the chain. `bodies:
 * false` (M21): `units` holds `true` or null for each id, and the kinds, records and external refs are kept in `part`; every
 * check runs as with bodies. A TypeError for `dropped` with `before`, or ids not below `from`, rising
 */
export declare function readUnitsChunk(bytes: Uint8Array, o: { ref: Ref; before?: ReadUnitsChunk | ReadUnitsChunkLight | null; dropped?: readonly number[]; bodies?: true; caps?: Caps }): Promise<ReadUnitsChunk>
export declare function readUnitsChunk(bytes: Uint8Array, o: { ref: Ref; before?: ReadUnitsChunk | ReadUnitsChunkLight | null; dropped?: readonly number[]; bodies: false; caps?: Caps }): Promise<ReadUnitsChunkLight>
/** the ids that did not stand in chunks read in order, rising: what a service forwards for reading a chunk alone */
export declare function droppedOf(chunks: readonly (ReadUnitsChunk | ReadUnitsChunkLight)[]): number[]
export declare function readHead(bytes: Uint8Array, o: { ref: Ref; caps?: Caps }): Promise<ReadHead>
/** the units' records (amendment M15), derived once, one entry a unit, its id the index */
export interface UnitRecords {
  /** the unit's UNIT_KINDS index; KIND_NONE for another kind or a unit that does not stand */
  kind: Uint8Array
  /** RECORD_FLAG: the unit's flags (TITLE, FRONT, BRACKETED, KEPT) and AUTHOR */
  flags: Uint8Array
  /** a heading's depth (-1 a \part …); DEPTH_NONE where the unit has none */
  depth: Int8Array
  /** the plain source text's length (mt.mjs plainSource); 0 for none */
  plainLength: Uint32Array
  /** the table cells' place, the fields groupOf reads */
  cells: ReadonlyMap<number, { table: number; row: number; col: number; span: number; head: boolean }>
  /** the plain source of the heading units */
  headings: ReadonlyMap<number, string>
}
/** the flags of a unit's record: the bundle's unit flags and AUTHOR (kind `author`) */
export declare const RECORD_FLAG: { readonly TITLE: 1; readonly FRONT: 2; readonly BRACKETED: 4; readonly KEPT: 8; readonly AUTHOR: 16 }
/** a record's depth for a unit with none, and its kind for none of UNIT_KINDS or a unit that does not stand */
export declare const DEPTH_NONE: -128
export declare const KIND_NONE: 255
/** the units of chunks read in order, head-less: every unit (null where dropped), its kind and the ids dropped */
export interface ReadUnits {
  units: (BundleUnit | null)[]; kinds: (string | null)[]; dropped: number[]
  /** the units' records (amendment M15) */
  records: UnitRecords
  /** each chunk's ids */
  index: { from: number; to: number }[]
  /** the chunk holding a unit; throws a RangeError for an id that is none */
  chunkOf(id: number): number
  /** the ids below chunk k's `from` that its nested pieces name, rising */
  externalRefs(k: number): number[]
}
/** the same, bodies-free: `units` holds `true` (stands) or null */
export interface ReadUnitsLight extends Omit<ReadUnits, 'units'> { units: (true | null)[]; pieces: Uint32Array }
/** chunks read as one chain: each after the one before, of one paper and pipeline, 1 to CHUNKS_MAX of them; throws BundleRefusal */
export declare function unitsOfChunks(chunks: readonly ReadUnitsChunk[], o?: { bodies?: true }): ReadUnits
/** bodies-free (M21): `units` holds `true` or null; the chunks may be read with `bodies: false` or with their bodies (a chunk read bodies-free given to the first form throws a TypeError) */
export declare function unitsOfChunks(chunks: readonly (ReadUnitsChunk | ReadUnitsChunkLight)[], o: { bodies: false }): ReadUnitsLight
/** the late chunks a layer may hold past its head's (the bitmap figures' labels) */
export declare const LATE_MAX: number
/** sync: the head and its chunks bound (each chunk's range, digest and bytes the head's ref, in order, read as one `before`
 *  chain; paper and pipeline the head's), LATE_MAX late chunks of bitmap figures' labels after them at most; with `catalog`, its
 *  head and units equal these */
export declare function indexOf(head: ReadHead, chunks: readonly ReadUnitsChunk[], o?: { catalog?: ReadCatalog }): LayerIndex
/** chunks read with `bodies: false` give a light index (M24; chunks of the two kinds mixed, too, at runtime) */
export declare function indexOf(head: ReadHead, chunks: readonly ReadUnitsChunkLight[], o?: { catalog?: ReadCatalog }): LightLayerIndex
/** the index with one more late chunk, read alone (readUnitsChunk with the index's `dropped`): a new index */
export declare function indexWithLate<I extends LayerIndex | LightLayerIndex>(index: I, chunk: I extends LightLayerIndex ? ReadUnitsChunkLight : ReadUnitsChunk): I
/** a part against the index and the chain (null before the first part): any failure refuses the whole part */
export declare function readPart(bytes: Uint8Array, o: { ref: Ref; index: LayerIndex | LightLayerIndex; chain?: PartChain | null; caps?: Caps }): Promise<ReadPart>
export declare function readLeftPart(bytes: Uint8Array, o: { ref: Ref & { page: number }; streamOf(id: number): number | undefined; caps?: Caps }): Promise<ReadLeftPart>
/** the catalog as fetched by name (no ref: its digest is computed); with `key`, its directory is the VTAG its versions make */
export declare function readCatalog(bytes: Uint8Array, o?: { key?: string; paper?: { id: string; version: number }; caps?: Caps }): Promise<ReadCatalog>
/** the parts as the whole BUNDLE 3 reading (lab, the equality harness): parts in order, layout merged (mergeLayout), the rules
 *  by page */
export declare function mergeParts(index: LayerIndex, parts: readonly ReadPart[]): ReadBundle

// ---------------------------------------------------------------- writers
export type Kind = 'units' | 'head' | 'part' | 'left' | 'catalog'
export interface Written {
  kind: Kind; bytes: Uint8Array; sha256: string
  /** the object's name (keyOf; the catalog's catalogKey) */
  key: string
  /** the values it holds, as countValues counts them */
  values: number
  ref: Ref
}
/** the units as chunks, greedy by id; a unit past either cap alone throws BundleRefusal (`kind` 'units', and `id`), and the
 *  chunks past CHUNKS_MAX, UNITS_TOTAL_BYTES or UNITS_TOTAL_VALUES `units-too-large` (its `data` { what, bound, size }) */
export declare function writeUnitChunks(o: { paper: { id: string; version: number }; units: readonly (BundleUnit | InkBundleUnit | OcrBundleUnit)[]; start?: number; before?: ChunkTotals | null; ink?: boolean }): Promise<(Written & { from: number; to: number })[]>
export interface ChunkTotals { chunks: number; bytes: number; values: number }
export declare function chunkTotals(chunks: readonly { bytes: Uint8Array; values: number }[]): ChunkTotals
export declare function writeHead(o: {
  paper: { id: string; version: number; pages: number }
  /** the PDF the layer is drawn over; one given with no `source` is arXiv's (as every base was before BUNDLE 8) */
  base: HeadBase | { bytes: number; sha256: string; xref: number; source?: undefined }
  /** arXiv's PDF: written where the base is ours (and required there), ignored else */
  orig?: { bytes: number; sha256: string; xref?: number } | null
  image: string
  units: readonly (Written & { from: number; to: number })[]; lineskip: readonly [number, number] | null
  /** the parts may carry draws: the head says `draw: 1` (omitted when false) */
  draw?: boolean
}): Promise<Written>
export declare function writeLeftPart(o: {
  paper: { id: string; version: number }; page: number; first: number; tokens: TokenWire
  spans: readonly (readonly [number, readonly number[]])[]; pairs: readonly (readonly [number, readonly number[]])[]
  /** the page's draw geometry in PDF.js's shapes (draw.mjs wireOf): shed to null, never thrown, for any reason the reader would refuse it */
  draw?: DrawSource | Draw | null
  /** or as its JSON, as draw.mjs wireText made it (checked): it stands in the part's text as it is, neither parsed nor checked again */
  drawText?: string | null
}): Promise<Written & { page: number; emptied: boolean; drawShed: boolean }>
export declare function writePart(o: {
  paper: { id: string; version: number }; head: string; prev: string | null; pages: readonly [number, number]; views: readonly number[]
  left: readonly UnitWire[]; fileOnly: readonly (readonly [number, number])[]; layout: LayoutPart | LayoutRefusalRecord | null
  rules?: Readonly<Record<number, readonly number[]>> | null; figures?: readonly import('./figure-rows.mjs').FigureRowWire[]; leftParts: readonly (Written & { page: number })[]
}): Promise<Written & { from: number; to: number }>
/** the catalog, written by the Worker from the refs it committed (only sha256, bytes, from and to of each are read) */
export declare function writeCatalog(o: {
  head: ReadHead; units: readonly { from: number; to: number; sha256: string; bytes: number }[]
  parts: readonly { from: number; to: number; sha256: string; bytes: number }[]
  end: { through: number; refused?: EndWhy }
}): Promise<Written>

// ---------------------------------------------------------------- keys
/** `layer/<id>v<n>/<ctag>/<sha256>.json` (the web stores it as `layer3/…`): every kind but the catalog is named by its whole
 *  digest; `<id>v<n>` with an old identifier's slash written _; throws a RangeError on what is not one */
export declare function keyOf(paper: string, version: number, ctag: string, sha256: string): string
/** the catalog's name, `layer/<id>v<n>/<vtag>.json`; throws a RangeError on what is not one */
export declare function catalogKey(paper: string, version: number, vtag: string): string
/** a base page of ours' name, `base/<id>v<n>/<sha256>.pdf` (R2's key, immutable); throws a RangeError on what is not one */
export declare function baseKey(paper: string, version: number, sha256: string): string
/** a delta's name, `layer/<id>v<n>/<ctag>/<sha256>.delta`: a bundle object beside the units chunks, never a /base/ PDF */
export declare function deltaKey(paper: string, version: number, sha256: string): string
/** why a delta base would not be read in a head of `N` pages over `orig` (the head reader's refusal), null where it would */
export declare function deltaBaseWhy(base: unknown, orig: { bytes: number; sha256: string; xref: number }, N: number): string | null
/** whether bytes are the delta a head names (length, digest, its section over the head's orig, its startxref): null, or why not */
export declare function checkDelta(head: ReadHead, bytes: Uint8Array): Promise<string | null>
/** the base a catalog names, of its head as read */
export declare function catalogBase(head: ReadHead): CatalogBase
/** a key taken apart: an object's { paper, version, ctag, sha256 }, a catalog's { paper, version, vtag }; null for what keyOf
 *  and catalogKey would not write */
export declare function keyParts(key: string): { paper: string; version: number; ctag: string; sha256: string } | { paper: string; version: number; vtag: string; ctag?: undefined } | null
/** the last page of the part that begins at page `a` of `N` in the doubling schedule: min(N, 2a − 1) */
/** the table groups of the cells (M18): `of[id]` a unit's group number or -1, `members[g]` the ids of group g, rising */
export interface TableGroups { of: Int32Array; count: number; members: number[][] }
export declare function groupsOfCells(cells: ReadonlyMap<number, { table: number; row: number; col: number; span: number; head: boolean }>, n: number): TableGroups
/** the groups of a paper's units as bundleUnitsOf gives them */
export declare function groupsOfUnits(units: readonly BundleUnit[]): TableGroups
export declare function partTarget(a: number, N: number): number
