// frontier.mjs's types: K, F and the need bounds of the page stream's parts, made again only from what changed
import type { CutKnown, WholePaper } from '../layer-proto/cut.mjs'
import type { BundleUnit } from '../layer-proto/units.mjs'
import type { TableGroups } from '../layer-proto/format.mjs'
import type { LeftStreams } from '../layer-proto/need.mjs'

/** what the frontier was made of so far: the times K was made, the units whose rows were asked, the entries' own pages read */
export interface FrontierWork { made: number; rows: number; entries: number }
export interface FrontierStream {
  /** K, F and NB over the units `ids` in K for good (rising) and the left's units as they stand: the last call's where neither
   *  they, their rows nor the left changed */
  of(ids: readonly number[]): { K: CutKnown['K']; F: number[]; NB: Int32Array }
  /** the units the maker was told: the rows of each told for the first time asked again (its stub) */
  told(ids: readonly number[]): void
  readonly work: FrontierWork
}
export declare function frontierStream(o: {
  paper: { id: string; version: number }; N: number; bundle: readonly BundleUnit[]; grouped: TableGroups
  left: { pages: WholePaper['left']['pages']; units(): WholePaper['left']['units'] }
  /** the maker's stream: the rows of units `ids` (make.mjs partOf's); null, no layout */
  st: { layout(ids: readonly number[]): NonNullable<WholePaper['layout']> } | null
}): FrontierStream

/** where the left stands for the page stream's parts: the least slot in K and the least stream each unit may get, the smallest
 *  unit whose left anchor is not final, the final left units' streams */
export interface LeftBounds { slotLow: Float64Array; streamLow: Float64Array; uMin: number; streams: LeftStreams }
export declare function leftBoundsOf(left: { units: readonly (readonly [number, number, readonly (readonly number[])[], ...unknown[]])[]; done(i: number): boolean; next: number; made: number; N: number }, n: number): LeftBounds
/** the last page the part from page `a` takes where it may be cut now, everything it reads final; else 0 */
export declare function partClosable(o: {
  K: CutKnown['K']; F: readonly number[]; NB: Int32Array | readonly number[]; a: number; H: number; N: number; n: number; now: LeftBounds
  inK(i: number): boolean; made: number | null; members: ReadonlyMap<number, readonly number[]>
}): number
