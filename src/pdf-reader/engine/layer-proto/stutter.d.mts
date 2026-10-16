// stutter.mjs's types (JavaScript until the engine's port)
/** the fewest letters a word must have for its repeat to be taken for a stutter */
export declare const STUTTER_MIN: number
/** whether a unit's source sets any word (two letters or more) twice in a row */
export declare function sourceRepeats(src: string | null | undefined): boolean
/** the ranges of a translated text the drawing leaves out, [from, to) in UTF-16 offsets, rising: each stutter's second word with the white space before it */
export declare function stutterCuts(s: string): [number, number][]
