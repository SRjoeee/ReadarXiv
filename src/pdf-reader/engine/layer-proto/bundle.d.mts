// bundle.mjs's types: the layer bundle as the engine writes it and both readers read it (the web mirrors them in its
// src/shared/bundle.ts)
import type { CellPlace, SourceUnit } from '../source/latex-front.mjs'
import type { RemovalManifest } from '../layout/addon-manifest.mjs'
import type { LayoutFile } from '../layout/file.mjs'

export type { CellPlace } from '../source/latex-front.mjs'
/** the bundle's format */
export declare const BUNDLE: '1'
/** a bundle's bytes at most, as a reader decodes them, and its values, counted before JSON.parse */
export declare const BUNDLE_CAP: number
export declare const BUNDLE_VALUES: number
/** a string at most, in code units, of a unit and of a row (§4.1's reader bound; layout/json.mjs's) */
export { STRING_MAX } from '../layout/json.mjs'
/** the reader's contract, `b<BUNDLE>-j<PDFJS>`: what a reader asks by, and the versions it refuses a bundle of another */
export declare const CTAG: string
/** the content's, `<CTAG>-p<PIPELINE>-l<LAYOUT>-r<REMOVAL>`: a bundle key's last part; a reader names the maker's
 *  versions, never compares them */
export declare const VTAG: string
/** a unit's flags (KEPT: openPaper's `kept`, nameCells) */
export declare const UNIT_FLAG_BITS: { readonly TITLE: 1; readonly FRONT: 2; readonly BRACKETED: 4; readonly KEPT: 8 }
/** a piece as openPaper reads it, positions dropped: a text (with the source as written where it differs, an accent's
 *  letter), a placeholder, a group's open and close paired by `id`, a nested unit by its id */
export type BundlePiece = [0, s: string] | [0, s: string, src: string] | [1, src: string] | [2, id: number, src: string] | [3, id: number, src: string] | [4, pre: string, unit: number, post: string]
/** a unit: its kind, flags, depth, table cell, display edges and pieces; its id is its index */
export type BundleUnit = [kind: string, flags: number, depth: number | null, cell: CellPlace | null, edges: { lead?: string; trail?: string; inner?: string } | null, pieces: BundlePiece[]]
/** a page's box, PDF units */
export type Box = [x0: number, y0: number, x1: number, y1: number]
/** a located unit of the original's side: its id, its stream index (the text layer's order), its line rectangles */
export type UnitWire = [id: number, stream: number, rects: [page: number, x0: number, y0: number, x1: number, y1: number][]]
/** the bundle's versions: the reader's contract (bundle, pdfjs), which a reader compares with its own, and the
 *  maker's (pipeline, layout, removal) and the compiler image's name, which it reads as tokens alone */
export interface BundleVersions { bundle: string; pipeline: string; layout: string; removal: string; pdfjs: string; image: string }
/** the bundle as the file holds it (the layer-only plan §3.1) */
export interface LayerBundle {
  schema: 1
  paper: { id: string; version: number; pages: number }
  /** arXiv's PDF the bundle was made over: its fingerprint, and our copy of those bytes, `/api/v1/original/<id>v<n>` */
  base: { bytes: number; sha256: string; url: string }
  versions: BundleVersions
  /** the paper's units (openPaper's), ids their indices, language-independent */
  units: BundleUnit[]
  /** the original's side as the anchors locate it: v0's geometry, and both panes' anchors (the identity map) */
  left: { kinds: string[]; pages: Box[]; units: UnitWire[] }
  /** LAYOUT 3; null where the maker refused (v0 then draws from `left` alone) */
  layout: LayoutFile | null
  /** the add-on; null where the remover refused, crashed or ran out of time (readers then erase and restore) */
  addon: { manifest: RemovalManifest; tail: string /* base64 of the bytes after arXiv's */ } | null
}
/** the bundle as readBundle gives it: each unit it dropped null at its id (`dropped`, those ids rising), and the
 *  add-on's tail its bytes, decoded once */
export interface ReadBundle extends Omit<LayerBundle, 'units' | 'addon'> {
  units: (BundleUnit | null)[]
  addon: { manifest: RemovalManifest; tail: Uint8Array } | null
  dropped: number[]
}
/** what writeBundle writes a bundle from: the engine fills the versions */
export interface BundleParts {
  paper: LayerBundle['paper']
  base: LayerBundle['base']
  /** the compiler image's name */
  image: string
  units: BundleUnit[]
  left: LayerBundle['left']
  layout: LayoutFile | null
  addon: { manifest: RemovalManifest; tail: Uint8Array } | null
}
/** a bundle refused, and why (a JSON path and what) */
export declare class BundleRefusal extends Error {
  constructor(why: string)
  readonly why: string
}
/** the bundle's units from openPaper's paper (its `units` and `kept`); throws on a piece the front end does not make */
export declare function bundleUnitsOf(paper: { units: readonly SourceUnit[]; kept: ReadonlySet<SourceUnit> }): BundleUnit[]
/** the bundle file's bytes (UTF-8 JSON) from its parts, under the engine's versions; the same parts, the same bytes.
 *  Never past BUNDLE_CAP or BUNDLE_VALUES (readBundle's defaults): the add-on written null where it would be, then the
 *  layout too, which the prepare sees reading the bundle back; past them with neither, throws BundleRefusal */
export declare function writeBundle(parts: BundleParts): Uint8Array
/** the bundle as received (bytes, or a string), within caps.bytes (BUNDLE_CAP) and caps.values (BUNDLE_VALUES) counted
 *  before JSON.parse, then every check of §3.3 (of the versions, the contract's compared, the maker's read as tokens); a
 *  bad unit dropped, null at its id; throws BundleRefusal */
export declare function readBundle(json: Uint8Array | string, caps?: { bytes?: number; values?: number }): ReadBundle
/** `layer/<id>v<n>/<VTAG>.json`, an old identifier's slash written _; throws a RangeError on an identifier or a
 *  version that is not one */
export declare function bundleKey(paper: string, version: number): string
