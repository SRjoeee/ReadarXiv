// tolerant.mjs's types
/** the unit's words a mark is placed by: the last TOLERANT_WORDS before an end mark (the first after a start mark), at
 *  least TOLERANT_MIN of them */
export declare const TOLERANT_WORDS: number
export declare const TOLERANT_MIN: number
/** a word of the unit's: its text, and whether it is a reference's or a citation's own rendering */
export interface OurWord { t: string; ref?: boolean }
/** a word of arXiv's: its text, and whether it begins or ends its line */
export interface TheirWord { t: string; first?: boolean; last?: boolean }
/** the places of arXiv's words where `ours` stands, the mark's side last (see tolerant.mjs) */
export declare function wordsAt(ours: readonly OurWord[], theirs: readonly TheirWord[], o: { end: boolean; atLineEnd?: boolean }): { at: number; sub: number }[]
