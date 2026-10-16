// left-part.mjs's types: the left of a part, its units placed from those that may touch its pages
import type { Anchor, DocToken, FrameRule, UnitText } from './anchors.mjs'

export interface LeftPartOptions { bounds?: Map<string, [number, number]>; floating?: (id: number) => boolean; floatMatch?: Map<number, number[] | null> | null; frame?: FrameRule; minCoverage?: number }
/** where each unit may reach, as token intervals [lo, hi] (at most two), by the units' order, before any is matched */
export declare function leftReach(doc: readonly DocToken[], units: readonly UnitText[], o: Omit<LeftPartOptions, 'frame' | 'minCoverage'>): [number, number][][]
/** the anchors of the units whose first rectangle stands on pages a to b, as anchorUnits over the whole paper places them under
 *  the frame given; `read` the units (indices) the place was made of */
export declare function leftOfPart(doc: DocToken[], units: UnitText[], o: LeftPartOptions, pages: [number, number], reach?: [number, number][][]): { anchors: Map<number, Anchor>; read: number[] }
/** what the left of pages a to b reads: the units that may touch them (C), theirs (V1), and V1's (V2): unit indices, and
 *  their pages as a flag a page */
export declare function partSets(doc: readonly DocToken[], units: readonly UnitText[], pages: [number, number], reach: [number, number][][]): Record<'C' | 'V1' | 'V2', { units: number[]; pages: Uint8Array }>
