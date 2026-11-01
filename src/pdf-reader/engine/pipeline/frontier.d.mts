// frontier.mjs's types: K, F and the need bounds of the page stream's parts, made again only from what changed
import type { CutKnown, WholePaper } from '../layer-proto/cut.mjs'
import type { BundleUnit } from '../layer-proto/units.mjs'
import type { TableGroups } from '../layer-proto/format.mjs'

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
