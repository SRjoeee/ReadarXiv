// left-side.mjs's types: the original's side for the prepare, a page at a time
import type { LeftPageInput } from '../layer-proto/cut.mjs'
import type { Box, UnitWire } from '../layer-proto/bundle.mjs'
import type { ColumnRule } from '../view/highlight.mjs'
import type { Anchor, DocToken } from './anchors.mjs'

export interface LeftSide {
  /** each page's view on the thousandth grid, pages 1 to N: the cutter's `whole.left.pages` */
  pages: Box[]
  /** the units located, ids rising: [id, stream (its first token), rectangles on the grid]: the cutter's `whole.left.units` */
  units: UnitWire[]
  /** the page's left part input, a pure function of the page (any order, any number of times): null for a page with no token.
   *  A page past the writer's bounds is given in full (the writer empties it). Throws a RangeError for a page that is none and
   *  for a token whose field is not finite or is past ±TOKEN_LIMIT */
  leftPages(page: number): LeftPageInput | null
  /** the units located, the document's tokens, the units that ship runs, the runs, the units with pairs the gate left out, and the pairs the
   *  filter dropped from the units that ship runs */
  stats: { units: number; tokens: number; paired: number; runs: number; gated: number; filtered: number }
}
/**
 * `doc`: the tokens the anchors were made on, in page order (fitted: tokens whose fields are not finite are dropped before anchoring);
 * `views`: each page's box as PDF.js gives it, pages 1 to N; `anchors`: anchorUnits' result. Throws a RangeError for a token whose
 * page goes backwards or past the views. `edges`: the tokens' ink edges made already (layout/arxiv.mjs readArxivText's, whose tokens
 * hold no item); `columns`: the rule of the pages' columns the far push reads (view/highlight.mjs pageColumns, today's; columnsOfTokens',
 * the text's alone: `() => columnsOfTokens(doc, views)`)
 */
export declare function leftSideOf(o: { doc: readonly DocToken[]; views: readonly (readonly number[])[]; anchors: ReadonlyMap<number, Anchor | null>; edges?: { l: ArrayLike<number>; r: ArrayLike<number> } | null; columns?: ColumnRule }): LeftSide
/** leftSideOf a unit at a time: each unit given as its anchor is final (`add`, in any order; `none` for one with none), a page's
 *  left part input once every unit with a token on it is given; the tokens' layout made first, so the pages' columns' rule is
 *  given (a whole run's) */
export interface LeftSideStream {
  pages: Box[]
  add(id: number, anchor: Anchor | null): void
  none(id: number): void
  /** the units given that are located, ids rising */
  units(): UnitWire[]
  leftPages(page: number): LeftPageInput | null
  stats: LeftSide['stats']
  /** how many units were given, located or not */
  done(): number
}
export declare function leftSideStream(o: { doc: readonly DocToken[]; views: readonly (readonly number[])[]; edges?: { l: ArrayLike<number>; r: ArrayLike<number> } | null; columns: ColumnRule }): LeftSideStream
