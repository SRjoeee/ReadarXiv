// The types of delta-wire.mjs (today's module, moved as it is into the engine package, JavaScript until its port): what
// its declarations stated, now a TypeScript module of the package (which holds no declaration file), each value of the
// JavaScript re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as delta_wire_js from './delta-wire.mjs'
/** a base of ours is a delta over arXiv's PDF, or our whole PDF (`full`: no `kind` on the wire) */
export const BASE_KINDS = delta_wire_js.BASE_KINDS as readonly ['delta', 'full']
export type BaseKind = (typeof BASE_KINDS)[number]
/** the delta's bytes at most */
export const DELTA_MAX_BYTES = delta_wire_js.DELTA_MAX_BYTES as number
/** the delta's share of our whole base page's bytes at most: past it the whole base is kept */
export const DELTA_MAX_SHARE = delta_wire_js.DELTA_MAX_SHARE as number
/** the objects at most, of either document read and of the delta written */
export const DELTA_OBJECTS_MAX = delta_wire_js.DELTA_OBJECTS_MAX as number
/** the replaced pages' ranges a head names at most */
export const REPLACED_MAX = delta_wire_js.REPLACED_MAX as number
/** why a base of ours is whole where a delta was asked (the builder's, the proof's, or the page pass's of a delta it was given) */
export const DELTA_WHYS = delta_wire_js.DELTA_WHYS as readonly [
  'delta-parse',
  'delta-encrypted',
  'delta-xref',
  'delta-stream',
  'delta-pages',
  'delta-boxes',
  'delta-bound',
  'delta-empty',
  'delta-proof',
  'delta-shape',
]
export type DeltaWhy = (typeof DELTA_WHYS)[number]
/** 1-based inclusive page ranges, ascending, non-overlapping, adjacent ones merged */
export type PageRanges = [from: number, to: number][]
/** pages as ranges, merged */
export const rangesOf = delta_wire_js.rangesOf as (pages: Iterable<number>) => PageRanges
/** the pages of ranges, rising */
export const pagesOf = delta_wire_js.pagesOf as (ranges: PageRanges) => number[]
/** the pages ranges hold */
export const countOf = delta_wire_js.countOf as (ranges: PageRanges) => number
/** why `ranges` is not a replaced-pages list within pages 1 to `last` (1 to REPLACED_MAX ranges, merged), null where it is */
export const replacedWhy = delta_wire_js.replacedWhy as (ranges: unknown, last: number) => string | null
/** the delta's own section read from its bytes (`orig` arXiv's PDF's length and startxref): its kind, startxref (composed),
 *  /Prev, /Size and every entry [number, generation, offset], each checked to point at its `n g obj`; or why not */
export const deltaSection = delta_wire_js.deltaSection as (
  delta: Uint8Array,
  orig: { bytes: number; xref: number },
) =>
  | {
      kind: 'table' | 'stream'
      startxref: number
      prev: number
      size: number
      rows: [number, number, number][]
      why?: undefined
    }
  | { why: string }
/** why a unit's ink stays the original's on our wrapped pages (layout/own.mjs, layout/wrap.mjs) */
export const UNHIDDEN = delta_wire_js.UNHIDDEN as readonly ['marks', 'across', 'spell', 'page', 'bounds']
export type Unhidden = (typeof UNHIDDEN)[number]
/** a head's counts of our pages' wrap (in `base.stats`) */
export const WRAP_STATS = delta_wire_js.WRAP_STATS as readonly [
  'wrapped',
  'refusedPages',
  'unhidden',
  'split',
  'groups',
  'labelKept',
]
export interface WrapStats {
  wrapped: number
  refusedPages: number
  unhidden: Record<Unhidden, number>
  split: number
  groups: number
  labelKept: number
}
/** the units a head lists as the original's, or with their label kept, at most */
export const UNHIDDEN_MAX = delta_wire_js.UNHIDDEN_MAX as number
/** why a wrap's head fields do not read (`<path>: <why>`), null where they do */
export const wrapWhy = delta_wire_js.wrapWhy as (stats: unknown, unhidden: unknown, labelKept: unknown) => string | null
