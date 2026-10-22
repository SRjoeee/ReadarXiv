// tex-kernel.mjs's types
/** control symbols TeX and the LaTeX kernel define to set no ink and read nothing after them: `\@ \/ \- \, \; \: \! \ ` */
export declare const INK_FREE_SYMBOLS: readonly string[]
/** control words with no argument that set no ink and read nothing after them (names without the backslash) */
export declare const INK_FREE_WORDS: readonly string[]
/** control words whose only argument is an optional priority (names without the backslash): no ink */
export declare const BREAK_HINTS: readonly string[]
/** the regular expression source of a leading ink-free control sequence (symbols, words and break hints), to build a pattern from */
export declare const INK_FREE_LEAD: string
/** whether a placeholder's whole source is one entry of INK_FREE_SYMBOLS or INK_FREE_WORDS, alone or before an empty group */
export declare function inkFree(src: string | undefined | null): boolean
