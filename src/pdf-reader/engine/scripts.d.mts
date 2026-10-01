// scripts.mjs's types (JavaScript until the engine's port), for the reader's tests
/** the languages the typesetting gate verified, as BCP 47 tags */
export declare const VERIFIED: readonly string[]
/** whether a BCP 47 tag names a language whose typesetting is verified */
export declare function verified(tag: string): boolean
/** a way to typeset a translation: its engine, the preamble it adds, and the factor on the paper's spacing that
 *  translated units are set at (absent for the paper's own) */
export interface Strategy { name: string; engine: string; xe: boolean; leading?: number; authors?: false; pre(fonts: unknown): string }
/** the strategies to try for a paper (its compiler, `meta.compiler`) in a target language, in order */
export declare function strategiesFor(meta: { compiler?: string }, lang: string): Strategy[]
/** whether the author block's names and places are translated into `lang` */
export declare function authorsTranslated(lang: string): boolean
