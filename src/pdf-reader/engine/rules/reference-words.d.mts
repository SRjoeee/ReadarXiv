// reference-words.mjs's types
/** the reference words, case folded (an abbreviation's stop kept) */
export declare const REFERENCE_WORDS: readonly string[]
/** whether a word is a reference word, its case folded */
export declare function isReferenceWord(w: string | null | undefined): boolean
