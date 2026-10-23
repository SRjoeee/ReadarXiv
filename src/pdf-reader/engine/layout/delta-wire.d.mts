// delta-wire.mjs's types: our base as an incremental update over arXiv's PDF, as its head says it and a holder checks it
/** a base of ours is a delta over arXiv's PDF, or our whole PDF (`full`: no `kind` on the wire) */
export declare const BASE_KINDS: readonly ['delta', 'full']
export type BaseKind = (typeof BASE_KINDS)[number]
/** the delta's bytes at most */
export declare const DELTA_MAX_BYTES: number
/** the delta's share of our whole base page's bytes at most: past it the whole base is kept */
export declare const DELTA_MAX_SHARE: number
/** the objects at most, of either document read and of the delta written */
export declare const DELTA_OBJECTS_MAX: number
/** the replaced pages' ranges a head names at most */
export declare const REPLACED_MAX: number
/** why a base of ours is whole where a delta was asked (the builder's, the proof's, or the page pass's of a delta it was given) */
export declare const DELTA_WHYS: readonly ['delta-parse', 'delta-encrypted', 'delta-xref', 'delta-stream', 'delta-pages', 'delta-boxes', 'delta-bound', 'delta-empty', 'delta-proof', 'delta-shape']
export type DeltaWhy = (typeof DELTA_WHYS)[number]
/** 1-based inclusive page ranges, ascending, non-overlapping, adjacent ones merged */
export type PageRanges = [from: number, to: number][]
/** pages as ranges, merged */
export declare function rangesOf(pages: Iterable<number>): PageRanges
/** the pages of ranges, rising */
export declare function pagesOf(ranges: PageRanges): number[]
/** the pages ranges hold */
export declare function countOf(ranges: PageRanges): number
/** why `ranges` is not a replaced-pages list within pages 1 to `last` (1 to REPLACED_MAX ranges, merged), null where it is */
export declare function replacedWhy(ranges: unknown, last: number): string | null
/** the delta's own section read from its bytes (`orig` arXiv's PDF's length and startxref): its kind, startxref (composed),
 *  /Prev, /Size and every entry [number, generation, offset], each checked to point at its `n g obj`; or why not */
export declare function deltaSection(delta: Uint8Array, orig: { bytes: number; xref: number }): { kind: 'table' | 'stream'; startxref: number; prev: number; size: number; rows: [number, number, number][]; why?: undefined } | { why: string }
/** why a unit's ink stays the original's on our wrapped pages (layout/own.mjs, layout/wrap.mjs) */
export declare const UNHIDDEN: readonly ['marks', 'across', 'spell', 'page', 'bounds']
export type Unhidden = (typeof UNHIDDEN)[number]
/** a head's counts of our pages' wrap (in `base.stats`) */
export declare const WRAP_STATS: readonly ['wrapped', 'refusedPages', 'unhidden', 'split', 'groups', 'labelKept']
export interface WrapStats { wrapped: number; refusedPages: number; unhidden: Record<Unhidden, number>; split: number; groups: number; labelKept: number }
/** the units a head lists as the original's, or with their label kept, at most */
export declare const UNHIDDEN_MAX: number
/** why a wrap's head fields do not read (`<path>: <why>`), null where they do */
export declare function wrapWhy(stats: unknown, unhidden: unknown, labelKept: unknown): string | null
