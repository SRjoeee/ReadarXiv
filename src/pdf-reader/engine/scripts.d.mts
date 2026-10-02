// scripts.mjs's types (JavaScript until the engine's port), for the reader's tests
export { VERIFIED, verified } from './verified.mjs'
/** a way to typeset a translation: its engine, the preamble it adds, and the factor on the paper's spacing that
 *  translated units are set at (absent for the paper's own) */
export interface Strategy { name: string; engine: string; xe: boolean; leading?: number; authors?: false; front?: string; pre(fonts: unknown): string }
/** the strategies to try for a paper (its compiler, `meta.compiler`) in a target language, in order */
export declare function strategiesFor(meta: { compiler?: string }, lang: string): Strategy[]
/** whether the author block's names and places are translated into `lang` */
export declare function authorsTranslated(lang: string): boolean
/** what the TeX page is told a visit will use: the paper's engine and the language's first strategy's, the CJK script
 *  whose faces it sets; `own`: the marked original's, its own engine alone */
export declare function texHints(meta: { compiler?: string }, lang: string, own?: boolean): { engines: string[]; fonts: string[] }
