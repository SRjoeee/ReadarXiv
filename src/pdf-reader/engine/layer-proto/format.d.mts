// format.mjs's types: the layer's wire format, BUNDLE 4 (the prepare pipeline's bundle 4 contract)
import type { LayoutFile, LayoutPart } from '../layout/file.mjs'
import type { RemovalManifest } from '../layout/addon-manifest.mjs'
import type { ReadBundle } from './bundle.mjs'
import type { BundleUnit } from './units.mjs'

export type { UnitWire } from './bundle.mjs'
import type { UnitWire } from './bundle.mjs'

// ---------------------------------------------------------------- the versions and the bounds
/** the format: raised with any change to the shape of a head, part, left part or catalog */
export declare const BUNDLE4: '4'
/** a units chunk's own format (envelope `"format":"1"`): raised only by a change to the chunk's shape */
export declare const UNITS_FORMAT: '1'
/** the reader's contract, `b4-j<PDFJS>` (until the pin moves, next's extension asks for BUNDLE 3's) */
export declare const CTAG4: string
/** the content's, `<CTAG4>-p<PIPELINE>-l<LAYOUT>-r<REMOVAL>`: a key's directory, the catalog's name */
export declare const VTAG4: string
/** a units chunk's bytes at most, and its values (counted before JSON.parse) */
export declare const UNITS_CAP: number
export declare const UNITS_VALUES: number
/** the chunks a paper's units may fill at most, and their bytes and values in all: an abuse guard (10 times the longest real
 *  book and more), not a limit on a paper's length */
export declare const CHUNKS_MAX: number
export declare const UNITS_TOTAL_BYTES: number
export declare const UNITS_TOTAL_VALUES: number
export declare const HEAD_CAP: number
export declare const HEAD_VALUES: number
export declare const PART_CAP: number
export declare const PART_VALUES: number
export declare const LEFT_CAP: number
export declare const LEFT_VALUES: number
export declare const CATALOG_CAP: number
export declare const CATALOG_VALUES: number
/** a part's tail at most, raw */
export declare const TAIL_CAP: number
/** a part's content at most, in bytes: everything but its tail's base64 (the cut holds a part to it) */
export declare const CONTENT_MAX: number
/** a left part's tokens at most, and the tokens its spans may name, per token */
export declare const TOKENS_PAGE: number
export declare const SPANNED_PER_TOKEN: number
/** the tokens' wire: integers of TOKEN_SCALE (thousandths of a PDF unit); a decoded value past ±TOKEN_LIMIT is no PDF's */
export declare const TOKEN_SCALE: number
export declare const TOKEN_LIMIT: number
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
export interface ReadHead {
  kind: 'head'; sha256: string; bytes: number; paper: { id: string; version: number; pages: number }
  base: { bytes: number; sha256: string; xref: number }; versions: HeadVersions
  units: (Ref & { from: number; to: number })[]; lineskip: [number, number] | null; cites: [string, string][] | null
}
export interface LayerIndex {
  kind: 'index'; sha256: string
  head: ReadHead
  units: readonly (BundleUnit | null)[]; kinds: readonly (string | null)[]; dropped: readonly number[]
}
/** what the parts told so far fix: a pure function of the parts' sequence */
export interface PartChain {
  readonly head: string; readonly through: number
  /** the last part's digest, null before any */
  readonly last: string | null
  /** the last K entry told, in (slot, id) order (-Infinity, -1 before any) */
  readonly slot: number; readonly id: number
  readonly reach: number
  /** the views of pages through + 1 … reach */
  readonly ahead: readonly number[]
  /** base.bytes + every tail told */
  readonly end: number
  /** the last cross-reference section's offset (base.xref before any tail) */
  readonly xref: number
  /** the next fresh object number, and the page tree root, null before any tail */
  readonly next: number | null; readonly root: number | null
  /** the removed pages told */
  readonly r: number
}
export interface ReadPart {
  kind: 'part'; sha256: string; bytes: number; head: string; prev: string | null
  pages: [from: number, to: number]; reach: number; views: readonly number[]
  left: UnitWire[]; fileOnly: [id: number, after: number][]; layout: LayoutPart | null
  addon: { manifest: RemovalManifest; tail: Uint8Array | null; r: number } | null
  leftParts: (Ref & { page: number })[]
  /** the state after this part */
  chain: PartChain
}
export interface ReadLeftPart {
  kind: 'left'; sha256: string; bytes: number; page: number; first: number
  table: { n: number; l: Float32Array; r: Float32Array; y: Float32Array; h: Float32Array; top: Float32Array; bottom: Float32Array }
  spans: [id: number, ranges: number[]][]; pairs: [id: number, runs: number[]][]
}
export interface ReadCatalog {
  kind: 'catalog'; sha256: string; bytes: number; paper: { id: string; version: number; pages: number }; versions: HeadVersions
  head: Ref; units: (Ref & { from: number; to: number })[]; parts: (Ref & { from: number; to: number })[]
  end: { through: number; refused?: EndWhy }
}

// ---------------------------------------------------------------- readers
/** a units chunk as received (`before`: the chunk read before it, null for the first); a unit that does not stand is null at
 *  its id and in `dropped`; throws BundleRefusal, a TypeError for bytes that are no Uint8Array */
export declare function readUnitsChunk(bytes: Uint8Array, o: { ref: Ref; before?: ReadUnitsChunk | null; caps?: Caps }): Promise<ReadUnitsChunk>
export declare function readHead(bytes: Uint8Array, o: { ref: Ref; caps?: Caps }): Promise<ReadHead>
/** the units of chunks read in order, head-less: every unit (null where dropped), its kind and the ids dropped */
export interface ReadUnits {
  units: (BundleUnit | null)[]; kinds: (string | null)[]; dropped: number[]
  /** each chunk's ids */
  index: { from: number; to: number }[]
  /** the chunk holding a unit; throws a RangeError for an id that is none */
  chunkOf(id: number): number
  /** the ids below chunk k's `from` that its nested pieces name, rising */
  externalRefs(k: number): number[]
}
/** chunks read as one chain: each after the one before, of one paper and pipeline, 1 to CHUNKS_MAX of them; throws BundleRefusal */
export declare function unitsOfChunks(chunks: readonly ReadUnitsChunk[]): ReadUnits
/** sync: the head and its chunks bound (each chunk's range, digest and bytes the head's ref, in order, read as one `before`
 *  chain; paper and pipeline the head's); with `catalog`, its head and units equal these */
export declare function indexOf(head: ReadHead, chunks: readonly ReadUnitsChunk[], o?: { catalog?: ReadCatalog }): LayerIndex
/** a part against the index and the chain (null before the first part): any failure refuses the whole part */
export declare function readPart(bytes: Uint8Array, o: { ref: Ref; index: LayerIndex; chain?: PartChain | null; caps?: Caps }): Promise<ReadPart>
export declare function readLeftPart(bytes: Uint8Array, o: { ref: Ref & { page: number }; streamOf(id: number): number | undefined; caps?: Caps }): Promise<ReadLeftPart>
/** the catalog as fetched by name (no ref: its digest is computed); with `key`, its directory is the VTAG its versions make */
export declare function readCatalog(bytes: Uint8Array, o?: { key?: string; paper?: { id: string; version: number }; caps?: Caps }): Promise<ReadCatalog>
/** the parts as the whole BUNDLE 3 reading (lab, the equality harness): parts in order, layout merged (mergeLayout), manifests
 *  merged, tails concatenated */
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
export declare function writeUnitChunks(o: { paper: { id: string; version: number }; units: readonly BundleUnit[] }): Promise<(Written & { from: number; to: number })[]>
export declare function writeHead(o: {
  paper: { id: string; version: number; pages: number }; base: { bytes: number; sha256: string; xref: number }; image: string
  units: readonly (Written & { from: number; to: number })[]; lineskip: readonly [number, number] | null; cites: readonly (readonly [string, string])[] | null
}): Promise<Written>
export declare function writeLeftPart(o: {
  paper: { id: string; version: number }; page: number; first: number; tokens: TokenWire
  spans: readonly (readonly [number, readonly number[]])[]; pairs: readonly (readonly [number, readonly number[]])[]
}): Promise<Written & { page: number; emptied: boolean }>
export declare function writePart(o: {
  paper: { id: string; version: number }; head: string; prev: string | null; pages: readonly [number, number]; views: readonly number[]
  left: readonly UnitWire[]; fileOnly: readonly (readonly [number, number])[]; layout: LayoutPart | null
  addon: { manifest: RemovalManifest; tail: Uint8Array | null } | null; leftParts: readonly (Written & { page: number })[]
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
/** a key taken apart: an object's { paper, version, ctag, sha256 }, a catalog's { paper, version, vtag }; null for what keyOf
 *  and catalogKey would not write */
export declare function keyParts(key: string): { paper: string; version: number; ctag: string; sha256: string } | { paper: string; version: number; vtag: string; ctag?: undefined } | null
/** the last page of the part that begins at page `a` of `N` in the doubling schedule: min(N, 2a − 1) */
export declare function partTarget(a: number, N: number): number
