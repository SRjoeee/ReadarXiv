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
export declare const PREFIX_WORDS: readonly ['protect']
export declare function prefixWord(src: string | undefined | null): boolean
/** LaTeX's declarations with no argument that set no ink (a font's, a size's, a paragraph's shape, \strut, \null) */
export declare const DECLARATION_WORDS: readonly string[]
/** control words whose argument is a key written to an auxiliary file: \label, \index */
export declare const AUX_WORDS: readonly string[]
/** TeX's \penalty */
export declare const PENALTY_WORDS: readonly string[]
/** what LaTeX and booktabs set between a table's rows */
export declare const ROW_RULES: readonly string[]
/** the kernel's macros that expand to one of their arguments alone: [how many they take, which they give] */
export declare const ARGUMENT_SELECTORS: Readonly<Record<string, readonly [number, number]>>
/** the argument a definition expands to alone, { of, arg }, or null */
export declare function selectsArgument(params: number, body: string | null | undefined): { of: number; arg: number } | null
/** TeX's and LaTeX's spaces in text: control symbols, control words, and the commands whose argument is a length */
export declare const SPACE_SYMBOLS: readonly string[]
export declare const SPACE_WORDS: readonly string[]
export declare const SPACE_LENGTHS: readonly string[]
/** the spaces of negative width among SPACE_SYMBOLS */
export declare const NEGATIVE_SPACES: readonly string[]
/** a control symbol that is a space in math alone (amsmath's \>) */
export declare const MATH_SPACE_SYMBOLS: readonly string[]
/** a source's leading space as a pattern source (`negative`: the negative spaces too; `math`: the math alone's too) */
export declare function spaceLead(options?: { negative?: boolean; math?: boolean }): string
/** a source that is one space whole, as a pattern source (`math`: the math alone's too) */
export declare function spaceSource(options?: { math?: boolean }): string
