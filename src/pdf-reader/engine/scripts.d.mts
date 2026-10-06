// scripts.mjs's types (JavaScript until the engine's port), for the reader's tests
export { VERIFIED, verified } from './verified.mjs'
/** a way to typeset a translation: its engine, the preamble it adds, and the factor on the paper's spacing that
 *  translated units are set at (absent for the paper's own) */
/** a font a paper's files load by name that NFSS can load again: its control sequence, role, weight, shape and size (pt) */
export interface NamedFont { cs: string; role: 'rm' | 'sf' | 'tt'; bold: boolean; shape: 'up' | 'it' | 'sl' | 'sc'; size: number }
export interface Strategy { name: string; engine: string; xe: boolean; leading?: number; authors?: false; front?: string; pre(fonts: unknown, named?: NamedFont[]): string }
/** the fonts a paper's own files (their texts) load by name with \font that NFSS can load again (fontname's text faces) */
export declare function namedFonts(texts: string[]): NamedFont[]
/** the strategies to try for a paper (its compiler, `meta.compiler`) in a target language, in order */
export declare function strategiesFor(meta: { compiler?: string }, lang: string): Strategy[]
/** whether the author block's names and places are translated into `lang` */
export declare function authorsTranslated(lang: string): boolean
/** the script a BCP 47 tag is written in (its likely script) */
export declare function scriptOf(lang: string): string
/** the CJK scripts' typesetting (their faces, spacing and leading), by script */
export declare const CJK: Record<string, unknown>
