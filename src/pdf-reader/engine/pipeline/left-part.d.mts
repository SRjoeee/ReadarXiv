// left-part.mjs's types: the left of a part, its units placed from those that may touch its pages
import type { Anchor, DocToken, FrameRule, UnitText } from './anchors.mjs'

/** `forward` (rule 5): the indices of the units written inside a float; `wholeIndex` the whole document's index a holder keeps */
export interface LeftPartOptions { bounds?: Map<string, [number, number]>; floating?: (id: number) => boolean; floatMatch?: Map<number, number[] | null> | null; frame?: FrameRule; minCoverage?: number; forward?: ReadonlySet<number> | null; wholeIndex?: { index: unknown } | null }
/** where each unit may reach, as token intervals [lo, hi] (at most two), by the units' order, before any is matched */
export declare function leftReach(doc: readonly DocToken[], units: readonly UnitText[], o: Omit<LeftPartOptions, 'frame' | 'minCoverage'> & { forwardSpan?: ((id: number, from: number) => { lo: number; hi: number } | null) | null }): [number, number][][]
/** the anchors of the units whose first rectangle stands on pages a to b, as anchorUnits over the whole paper places them under
 *  the frame given: required, the whole document's frame rule (pageFrame over the part's units is another frame; a TypeError
 *  where none is given); `read` the units (indices) the place was made of */
export declare function leftOfPart(doc: DocToken[], units: UnitText[], o: LeftPartOptions & { frame: FrameRule }, pages: [number, number], reach?: [number, number][][]): { anchors: Map<number, Anchor>; read: number[]; before: number[] }
/** what the left of pages a to b reads: the units that may touch them (C), theirs (V1), and V1's (V2): unit indices, and
 *  their pages as a flag a page */
export declare function partSets(doc: readonly DocToken[], units: readonly UnitText[], pages: [number, number], reach: [number, number][][], ivs?: [number, number][][]): Record<'C' | 'V1' | 'V2', { units: number[]; pages: Uint8Array }>
/** each unit's reach as page intervals (partSets' `ivs`, made once for the parts that read one reach) */
export declare function pageReach(doc: readonly DocToken[], reach: [number, number][][]): [number, number][][]
/** the units anchored by ranges of a page as their bounds become final (the page stream): each range once every unit its left
 *  reads has its match final, by leftOfPart under the whole document's frame */
export interface RangedAnchors {
  bounds: Map<string, [number, number]>
  /** each page's first token and last; the last page with a token */
  firstTok: Int32Array
  lastTok: Int32Array
  lastPage: number
  /** the first page not anchored yet */
  readonly am: number
  /** unit `id`'s own marks' pages while its bounds are not final: the least and the last (0: none) */
  own(id: number, low: number, high: number): void
  /** unit `id`'s bounds final: [first token, last token], or null for none */
  mark(id: number, bounds: [number, number] | null): void
  /** a bound of a pair of marks no unit's (bounds.size, matchUnits' switch) */
  bound(key: string, bounds: [number, number]): void
  isMarked(id: number): boolean
  isSettled(id: number): boolean
  /** the ranges anchored while ready: each unit first framed on the page to onAnchor, each final one reaching no later page
   *  settled without one; past the last page every unit left settled; each told by its id, in their ids' order */
  run(onAnchor: (id: number, anchor: Anchor) => void, onSettle: (id: number) => void): void
}
/** `units` in the order TeX sets them (the text's: anchors.mjs orderOf), each called by its id; `forward` their places */
export declare function rangedAnchors(doc: readonly DocToken[], units: readonly UnitText[], o: Omit<LeftPartOptions, 'bounds' | 'minCoverage' | 'frame' | 'wholeIndex'> & { frame: FrameRule; boundsKnown?: (() => boolean) | null }): RangedAnchors
