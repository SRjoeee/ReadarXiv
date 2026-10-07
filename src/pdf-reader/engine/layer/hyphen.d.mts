// hyphen.mjs's types
export interface Hyphenator {
  lang: string
  /** the fewest letters a break leaves before and after it */
  left: number
  right: number
  /** offsets in `word` where it may break (a word of letters only; anything else gives []) */
  points(word: string): number[]
}
export declare const HYPHEN_LANGS: readonly ['en', 'de', 'fr', 'es', 'pt', 'ru']
/** a language's hyphenator, its patterns imported only when asked; null for a language with none (every language in
 *  Slice 1) */
export declare function loadHyphenator(lang: string): Promise<Hyphenator | null>
