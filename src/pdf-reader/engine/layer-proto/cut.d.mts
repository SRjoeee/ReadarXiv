// cut.mjs's types: a paper made whole, cut into BUNDLE 4's objects (the bundle 4 contract C3b, C3c)
import type { LayoutFile, LayoutPart } from '../layout/file.mjs'
import type { RemovalManifest } from '../layout/addon-manifest.mjs'
import type { Box, UnitWire } from './bundle.mjs'
import type { HeadBase, LayoutRefusalRecord, TableGroups, TokenWire, Written } from './format.mjs'
import type { NeedEntry } from './need.mjs'
import type { BundleUnit } from './units.mjs'

/** the paper made whole: BUNDLE 3's reading (readBundle) or the object the producer holds */
export interface WholePaper {
  paper: { id: string; version: number; pages: number }
  /** `xref`: the original's startxref, which BUNDLE 3 does not carry (`CutOptions.base` may supply it); BUNDLE 8's `source` and,
   *  of a base of ours, its pages, tree and check (format.mjs HeadBase) */
  base: HeadBase | { bytes: number; sha256: string; xref?: number; source?: undefined }
  /** arXiv's PDF, where the base is ours (format.mjs writeHead) */
  orig?: { bytes: number; sha256: string } | null
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
  /** the page's draw geometry (draw.mjs), null or absent for none */
  draw?: import('./draw.mjs').DrawSource | import('./draw.mjs').Draw | null
  /** or as its JSON, as wireText made it (checked; format.mjs writeLeftPart `drawText`), null or absent for none */
  drawText?: string | null
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
  /** a page with no tokens may give its draw alone (`{ drawText }`): its first token the next page's, its tokens none */
  leftPages(page: number): LeftPageInput | { drawText: string } | null | Promise<LeftPageInput | { drawText: string } | null>
  /** the last page of the part that begins at page `a` of `N` (a to N); default `partTarget` (the doubling schedule), extended over
   *  the need bound (`extend`). A harness cuts at any split with it; a target given is taken as given, never extended */
  target?(a: number, N: number): number
  /** whether the schedule's target of each part is extended over the need bound (need.mjs needBound: the last page whose part laying
   *  a page reads): the least b from the target on with b at least the bound of every page of the part, within the paper and
   *  `partPagesMax`. A preference, never a requirement: a part that does not fit with it is shortened as ever, and a page whose
   *  closure then reaches past its part waits for the next one (the door gates it). Default true; the parts differ, their contents do not */
  extend?: boolean
  /** the most pages any part has (default PART_PAGES_MAX, 5000; a positive whole number, else a RangeError): the schedule's target is
   *  clamped to it before the extension and the fit, so a part is never wider, extension or not */
  partPagesMax?: number
  /** F as an array indexed by page 0..N of indices into K (-1 for none); default `needFrontier` (the door's rule, need.mjs) */
  frontier?(K: readonly CutEntry[], N: number): readonly number[]
  /** the add-on for a candidate page range of part `index` (its layout part), or null (the part's pages are refused, drawn by
   *  erase and restore). It takes part in the part's size, so the hook is called for each range the size search tries, several
   *  times for one index, and must have no effect until `acceptAddon`. A tail past TAIL_CAP (or a part past any bound) shortens the
   *  part like any size refusal; one page's tail is kept within TAIL_CAP by the writer of the tails (E3), else that page ships no layout. Without the hook, `whole.addon`'s manifest is carried
   *  without its tail (clean pages stay, removed pages are refused as TAIL_NOT_CARRIED); with no `whole.addon`, no part has an
   *  add-on (`addon: null`, M20). A hook that answers null plans the part's pages as not planned */
  chainAddon?(index: number, part: { pages: [number, number]; layout: LayoutPart }): Promise<{ manifest: RemovalManifest; tail: Uint8Array | null } | null> | { manifest: RemovalManifest; tail: Uint8Array | null } | null
  /** called once for each part that has a layout, in order, with the range that was kept: the hook's state advances here */
  acceptAddon?(index: number, part: { pages: [number, number] }): Promise<void> | void
  /** the base to write, as the whole's (`WholePaper.base`) is; given, it wins */
  base?: HeadBase | { bytes: number; sha256: string; xref?: number; source?: undefined }
  /** arXiv's PDF beside a base of ours (`WholePaper.orig`); given, it wins */
  orig?: { bytes: number; sha256: string } | null
  image?: string
  lineskip?: [number, number] | null
  /** the parts' left parts may carry draws (the head says so): set where the caller's `leftPages` give them */
  draw?: boolean
  /** the producer's verdict on each part as cut with its layout (partCutter's) */
  verdict?: PartVerdict | null
  /** the record of a part a verdict or a part's bound refused its layout (partCutter's) */
  recordOf?: ((refused: PartRefusal) => LayoutRefusalRecord | null) | null
  /** the record a part of a whole with no layout carries */
  noLayout?: LayoutRefusalRecord | null
}
/** a part's layout refused, and why ({ refused, ...the why's numbers }), or kept (null) */
export type PartRefusal = { refused: string; [why: string]: unknown }
/** the producer's verdict on a part as cut with its layout: its pages, what it was cut from, the part written */
export type PartVerdict = (part: { pages: [number, number]; input: { part: LayoutPart | null }; written: Written }) => PartRefusal | null | Promise<PartRefusal | null>
/** what a part is cut on (partCutter's `next`): K, F closed over the table groups, the need bound (null: no extension), the rows */
export interface CutKnown {
  K: readonly (CutEntry & { left: UnitWire | null; lu: unknown; first: number; last: number; lastLeft: number })[]
  F: readonly number[]
  NB?: ArrayLike<number> | null
  layout?: Pick<LayoutFile, 'fonts' | 'units' | 'lines' | 'frames' | 'erase' | 'ph' | 'labels' | 'headings' | 'pageText' | 'held' | 'names'> | null
  /** the record of a part cut with no layout file (`layout` null): why there is none (the wire's `layout: { refused, why }`); null, none recorded */
  noLayout?: LayoutRefusalRecord | null
}
export type CutPart = Written & { from: number; to: number; leftParts: (Written & { page: number })[] }
/** the cut a part at a time: cutBundle's, fed what is known when each part is cut */
export interface PartCutter {
  /** the part from `from`, or null past the paper's last page */
  next(known: CutKnown): Promise<CutPart | null>
  readonly parts: CutPart[]
  readonly left: (Written & { page: number })[]
  /** each part's: null, the verdict's refusal, or { refused: 'part' } (its first page alone past a part's bounds with its layout) */
  readonly verdicts: (PartRefusal | null)[]
  /** the page the next part begins at */
  readonly from: number
}
/** K over the whole paper and its frontier closed over the table groups: what partCutter cuts a paper made whole on */
export declare function wholeFrontier(whole: WholePaper, frontier?: CutOptions['frontier'], grouped?: TableGroups): { K: CutKnown['K']; F: number[] }
export declare function partCutter(o: {
  paper: { id: string; version: number }; N: number; head: Written; views: readonly Box[]
  leftPages: CutOptions['leftPages']; addon?: { manifest: RemovalManifest } | null
  chainAddon?: CutOptions['chainAddon'] | null; acceptAddon?: CutOptions['acceptAddon'] | null
  target?: CutOptions['target'] | null; partPagesMax?: number; verdict?: PartVerdict | null
  /** false: no part nor left part kept once given (`parts` and `left` hold nulls): a stream's */
  retain?: boolean
  /** the record of a part a verdict or a part's bound refused its layout (`verdicts[i]`), written in place of its layout */
  recordOf?: ((refused: PartRefusal) => LayoutRefusalRecord | null) | null
}): PartCutter
export interface Cut {
  units: (Written & { from: number; to: number })[]
  head: Written
  /** in page order; `leftParts` the part's own, pages from..to */
  parts: CutPart[]
  /** one for each page 1..N */
  left: (Written & { page: number })[]
  /** what the catalog's `end` is (the Worker writes it) */
  end: { through: number }
}
/** the most pages a part is extended over: the web's bound on a part's pages (M21) */
export declare const PART_PAGES_MAX: 5000
/** a removed page's reason when the whole add-on's manifest is carried without its tail */
export declare const TAIL_NOT_CARRIED: 'tail not carried'
/** the frontier by the door's rule: needsOf(K, N, false, layout-only).lay */
export declare function needFrontier(K: readonly NeedEntry[], N: number): number[]
export declare function cutBundle(whole: WholePaper, o: CutOptions): Promise<Cut>
/** cutBundle's start: the whole checked, its chunks and head written, and the cutter with what each part is cut on */
export declare function wholeCutter(whole: WholePaper, o: CutOptions): Promise<{ units: Cut['units']; head: Written; cutter: PartCutter; known: CutKnown; N: number }>
