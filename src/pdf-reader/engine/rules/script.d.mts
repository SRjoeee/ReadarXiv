// script.mjs's types (JavaScript until the engine's port)
/** the script a BCP 47 tag is written in (its likely script) */
export declare const scriptOf: (lang: string) => string
/** a CJK character: a code point of Unicode's CJK blocks (Hangul's and the full-width forms among them) */
export declare const CJK: RegExp
/** CJK, and the characters of `extra` (code points) */
export declare function cjkClassWith(extra: readonly number[]): RegExp
/** a letter of a CJK script by its Script property: Han, Hiragana, Katakana, Hangul */
export declare const CJK_LETTER: RegExp
/** a character a script that sets no spaces between its words sets none beside: Han, kana, Bopomofo, the CJK blocks' marks but Hangul's */
export declare const SPACELESS: RegExp
