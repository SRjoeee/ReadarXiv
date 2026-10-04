// A Chinese sentence that ends on a name written in another script (a language's own name). UI.md §1 rule 9 asks for a
// space between Chinese and Latin text, and a name in Latin, Cyrillic, Greek or Arabic letters is such text; a name in
// Han, kana or hangul sits against the Chinese as the Chinese does; a space there reads as a gap.
// So a pack writes the template with no space and lets this add it

const SETS_AGAINST_CHINESE = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** `name` as it follows Chinese text: with a leading space unless it is empty or begins in Han, kana or hangul */
export function spacedAfterChinese(name: string): string {
  return name === '' || SETS_AGAINST_CHINESE.test(name) ? name : ` ${name}`
}
