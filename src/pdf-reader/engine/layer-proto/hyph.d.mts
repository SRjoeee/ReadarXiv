// hyph.mjs's types: v0's hyphenation (ported from the prototype at 9e56fca)

/** a language's patterns as loaded: Liang's points by letters, the exceptions, the longest pattern */
export interface Patterns { pats: Map<string, number[]>; exceptions: Map<string, string>; maxLen: number }
/** the languages of TeX's pattern files the layer hyphenates with */
export type PatternLanguage = 'en' | 'de' | 'fr' | 'es' | 'pt'
/** TeX's pattern files under texmf-dist, by language */
export declare const TEX_PATTERN_FILES: Readonly<Record<PatternLanguage, string>>
/** how each pattern file is decoded: Latin-1 (TeX's 8-bit files) or UTF-8 (hyph-utf8's) */
export declare const TEX_PATTERN_ENCODINGS: Readonly<Record<PatternLanguage, 'latin1' | 'utf8'>>
/** a TeX pattern file, decoded as its `encoding` (Latin-1 by default), as { patterns, exceptions }: what a host serves */
export declare function patternsOfTex(text: string, encoding?: 'latin1' | 'utf8'): { patterns: string[]; exceptions: string[] }
/** patternsOfTex's { patterns, exceptions } as breakPoints reads them */
export declare function hyphenationOf(j: { patterns: readonly string[]; exceptions: readonly string[] }): Patterns
/** a language's patterns, fetched once from `url` (patternsOfTex's JSON); null where there are none, true for Russian
 *  (its rules need none) */
export declare function loadHyphenation(lang: string, url?: string): Promise<Patterns | true | null>
/** where `word` may break: offsets into it. `mins`: the fewest letters left before and after a break, the layout rules'
 *  (rules/layout.mjs hyphenation) for the language, required for a language of patterns; Russian's rules need none */
export declare function breakPoints(word: string, lang: 'ru', data: Patterns | true | null | undefined, mins?: { left: number; right: number }): number[]
export declare function breakPoints(word: string, lang: string, data: Patterns | true | null | undefined, mins: { left: number; right: number }): number[]
