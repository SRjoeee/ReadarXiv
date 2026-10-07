// hints.mjs's types
/** the scripts whose first strategy is XeLaTeX with xeCJK */
export declare const CJK_SCRIPTS: readonly string[]
/** what the TeX page is told a visit will use: the paper's engine and the language's first strategy's, the CJK script
 *  whose faces it sets; `own`: the marked original's, its own engine alone */
export declare function texHints(meta: { compiler?: string }, lang: string, own?: boolean): { engines: string[]; fonts: string[] }
