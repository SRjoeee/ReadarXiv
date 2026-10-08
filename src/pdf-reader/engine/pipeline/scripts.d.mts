// scripts.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a way to typeset a translation: its engine, the preamble it adds, and the factor on the paper's spacing that
 *  translated units are set at (absent for the paper's own) */
export interface Strategy { name: string; engine: string; xe: boolean; leading?: number; authors?: false; front?: string; pre(fonts: unknown): string }
/** the strategies to try for a paper (its compiler, `meta.compiler`) in a target language, in order */
export declare function strategiesFor(meta: { compiler?: string }, lang: string): Strategy[]
// the script of a language (rules/script.mjs), re-exported
export { scriptOf } from '../rules/script.mjs'
/** the tags of babel's locale files a final tries for `lang`, the first the TeX tree holds imported: the tag itself,
 *  its language and script, its language */
export declare function babelTags(lang: string): string[]
/** the CJK scripts' typesetting (their faces, spacing and leading), by script */
export declare const CJK: Record<string, unknown>
