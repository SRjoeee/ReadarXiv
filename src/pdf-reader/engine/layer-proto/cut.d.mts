// cut.mjs's types: a paper made whole, cut into BUNDLE 4's objects (the bundle 4 contract C3b, C3c)
import type { LayoutFile, LayoutPart } from '../layout/file.mjs'
import type { RemovalManifest } from '../layout/addon-manifest.mjs'
import type { Box, UnitWire } from './bundle.mjs'
import type { TokenWire, Written } from './format.mjs'
import type { NeedEntry } from './need.mjs'
import type { BundleUnit } from './units.mjs'

/** the paper made whole: BUNDLE 3's reading (readBundle) or the object the producer holds */
export interface WholePaper {
  paper: { id: string; version: number; pages: number }
  /** `xref`: the original's startxref, which BUNDLE 3 does not carry (`CutOptions.base` may supply it) */
  base: { bytes: number; sha256: string; xref?: number }
  versions?: { image: string }
  /** the paper's units, none dropped (a null is refused: the chunks hold what stands) */
  units: readonly (BundleUnit | null)[]
  left: { pages: readonly Box[]; units: readonly UnitWire[] }
  layout: LayoutFile | null
  /** the whole add-on (BUNDLE 3's): only its manifest is read, by the default (no `chainAddon`); its tail cannot be cut */
  addon?: { manifest: RemovalManifest } | null
}
/** one page's left part input: the tokens (the web's TokenWire), the spans [id, ranges] and, optionally, the pairs */
export interface LeftPageInput {
  first: number; tokens: TokenWire
  spans: readonly (readonly [number, readonly number[]])[]; pairs?: readonly (readonly [number, readonly number[]])[]
}
/** a K entry: what needsOf reads, and the unit it stands for */
export interface CutEntry extends NeedEntry {
  id: number; slot: number
  /** a layout-only unit's `after` (today's `before`), null for a left unit */
  after: number | null
}
export interface CutOptions {
  /** the page's left part input, called once for each page in page order (null: a page with no tokens) */
  leftPages(page: number): LeftPageInput | null | Promise<LeftPageInput | null>
  /** the last page of the part that begins at page `a` of `N` (a to N); default `partTarget` (the doubling schedule). A harness cuts at any split with it */
  target?(a: number, N: number): number
  /** F as an array indexed by page 0..N of indices into K (-1 for none); default `needFrontier` (the door's rule, need.mjs) */
  frontier?(K: readonly CutEntry[], N: number): readonly number[]
  /** the add-on for a candidate page range of part `index` (its layout part), or null (the part's pages are refused, drawn by
   *  erase and restore). It takes part in the part's size, so the hook is called for each range the size search tries, several
   *  times for one index, and must have no effect until `acceptAddon`. A tail past TAIL_CAP (or a part past any bound) shortens the
   *  part like any size refusal; one page's tail is kept within TAIL_CAP by the writer of the tails (E3), else that page ships no layout. Without the hook, `whole.addon`'s manifest is carried
   *  without its tail (clean pages stay, removed pages are refused as TAIL_NOT_CARRIED), else all pages are refused */
  chainAddon?(index: number, part: { pages: [number, number]; layout: LayoutPart }): Promise<{ manifest: RemovalManifest; tail: Uint8Array | null } | null> | { manifest: RemovalManifest; tail: Uint8Array | null } | null
  /** called once for each part that has a layout, in order, with the range that was kept: the hook's state advances here */
  acceptAddon?(index: number, part: { pages: [number, number] }): Promise<void> | void
  base?: { bytes: number; sha256: string; xref: number }
  image?: string
  lineskip?: [number, number] | null
  cites?: [string, string][] | null
}
export interface Cut {
  units: (Written & { from: number; to: number })[]
  head: Written
  /** in page order; `leftParts` the part's own, pages from..to */
  parts: (Written & { from: number; to: number; leftParts: (Written & { page: number })[] })[]
  /** one for each page 1..N */
  left: (Written & { page: number })[]
  /** what the catalog's `end` is (the Worker writes it) */
  end: { through: number }
}
/** a removed page's reason when the whole add-on's manifest is carried without its tail */
export declare const TAIL_NOT_CARRIED: 'tail not carried'
/** the frontier by the door's rule: needsOf(K, N, false, layout-only).lay */
export declare function needFrontier(K: readonly NeedEntry[], N: number): number[]
export declare function cutBundle(whole: WholePaper, o: CutOptions): Promise<Cut>
