// src/pdf-reader/engine/layer-proto/stutter.mjs
// A translator's stutter, one place: Microsoft sometimes writes a word twice in a row where the source has it once (the M1
// survey of 2608.16117: "konformen konformen" in the German abstract; about 0.3 % of the units of the 30 outputs the layer
// gate measures). The drawing sets the word once (layer2.mjs tokensOf2): a function of a translated text piece and the
// unit's source alone, applied where a unit's text becomes tokens, so that every host's rows, a cached translation too,
// are drawn so, and the rows, the cache and the plain text the sentence offsets count in keep the translation as it came
// (the word table keeps each drawn word's place in it). Imports nothing.
//
// The rule, for any input: two equal words (case aside, NFC) with nothing but white space between them, each of
// STUTTER_MIN letters or more of a script that sets words apart by spaces (no CJK, no Thai and the like: their words are not
// so delimited), each a whole word (no letter, digit or backslash beside it: never a TeX command's name), are one; the
// second goes, with the white space before it. Not where the unit's source itself sets any word twice so (a "very very" its
// translation may write "очень очень", a name like "Walla Walla"): a translation's repeat is then read as the source's. A
// legitimate repeat of a short word ("that that", "had had", "nous nous") is under STUTTER_MIN, and a placeholder, a marker
// or a formula is never a text piece's.

/** the fewest letters a word must have for its repeat to be taken for a stutter */
export const STUTTER_MIN = 5
/** a run of letters and their marks */
const WORD = /[\p{L}\p{M}]+/gu
/** scripts whose words are not set apart by spaces (or are CJK's): a repeat in them is not this rule's */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u
/** a character that would make a letter run part of something larger than a word: a digit, a backslash (a TeX command), an underscore */
const JOINS = /[\p{N}\\_]/u
const letters = w => (w.match(/\p{L}/gu) ?? []).length
const keyOf = w => w.normalize('NFC').toLowerCase()

/** each whole word of `s`, in order: { w, at, end } (UTF-16 offsets) */
function wordsOf(s) {
  const out = []
  for (const m of s.matchAll(WORD)) {
    const at = m.index, end = at + m[0].length
    if (JOINS.test(s[at - 1] ?? '') || JOINS.test(s[end] ?? '')) continue
    out.push({ w: m[0], at, end })
  }
  return out
}
/** each adjacent repeat of a whole word in `s` (white space alone between the two), with no bound on the word's length:
 *  [first, second] */
function repeatsIn(s) {
  const ws = wordsOf(s), out = []
  for (let i = 0; i + 1 < ws.length; i++) {
    const a = ws[i], b = ws[i + 1]
    if (b.at > a.end && /^\s+$/u.test(s.slice(a.end, b.at)) && keyOf(a.w) === keyOf(b.w)) out.push([a, b])
  }
  return out
}

/** whether a unit's source sets any word twice in a row (a word of two letters or more): its translation's repeats are then
 *  left as they are */
export const sourceRepeats = src => typeof src === 'string' && repeatsIn(src).some(([a]) => letters(a.w) >= 2)

/**
 * The ranges of a translated text `s` the drawing leaves out, [from, to) in UTF-16 offsets, rising and apart: for each
 * stutter, the white space before its second word and the word (a third and more of the same word go too, each with the
 * white space before it). None for a word under STUTTER_MIN letters or of a script whose words are not set apart by spaces
 */
export function stutterCuts(s) {
  if (typeof s !== 'string' || !s) return []
  const out = []
  for (const [a, b] of repeatsIn(s)) {
    if (letters(a.w) < STUTTER_MIN || UNSPACED.test(a.w)) continue
    out.push([a.end, b.end])
  }
  return out
}
