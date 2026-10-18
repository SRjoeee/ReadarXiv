// text-symbols.mjs's types
/** LaTeX's text symbols, each the one character it sets: the layout maker's and the layer's one table */
export declare const TEXT_SYMBOLS: Readonly<Record<string, string>>
/** a symbol's text (TEXT_SYMBOLS), its source alone or followed by `{}`, else null */
export declare function symbolText(src: string | undefined | null): string | null
