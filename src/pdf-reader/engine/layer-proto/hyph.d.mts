// hyph.mjs's types: v0's hyphenation (ported from the prototype at 9e56fca)

/** a language's patterns as loaded: Liang's points by letters, the exceptions, the longest pattern */
export interface Patterns { pats: Map<string, number[]>; exceptions: Map<string, string>; maxLen: number }
/** TeX's pattern files under texmf-dist, by language */
export declare const TEX_PATTERN_FILES: Readonly<Record<'en' | 'de', string>>
/** a TeX pattern file (decoded as Latin-1) as { patterns, exceptions }: what the prototype's host served */
export declare function patternsOfTex(latin1: string): { patterns: string[]; exceptions: string[] }
/** a language's patterns, fetched once from `url` (patternsOfTex's JSON); null where there are none, true for Russian
 *  (its rules need none) */
export declare function loadHyphenation(lang: string, url?: string): Promise<Patterns | true | null>
/** where `word` may break: offsets into it. `mins`: the fewest letters left before and after a break, the layout rules'
 *  (rules/layout.mjs hyphenation) for the language, required for a language of patterns; Russian's rules need none */
export declare function breakPoints(word: string, lang: 'ru', data: Patterns | true | null | undefined, mins?: { left: number; right: number }): number[]
export declare function breakPoints(word: string, lang: string, data: Patterns | true | null | undefined, mins: { left: number; right: number }): number[]
