/**
 * Whether a character is a letter or a digit (Unicode's L and N), the rest of a text, a space aside, its marks (punctuation,
 * separators, symbols): what a unit's letters are, beside its marks. One reading for the engine and the typesetter: the engine's
 * alignment of a unit's letters with TeX's glyphs (packages/engine locate/facts.ts fold), the two bases it reads off TeX's
 * glyphs outside every group, its letters' and its marks' (locate/group-style.ts), and the typesetter's choice of the base a
 * translated character outside every group is drawn in, a letter in the letters', a mark in the marks' (breaker/tokens.ts:
 * docs/PDF-READER.md §18.114). A grapheme cluster is a letter where any code point of it is one
 */
export const isLetterOrDigit = (ch: string): boolean => LETTER_OR_DIGIT.test(ch)
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
