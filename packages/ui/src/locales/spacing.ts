// A name set into a sentence of Chinese or Japanese (a language's own name, a service's, a style's). UI.md §1 rule 9 asks
// for a space between Chinese and Latin text, and Japanese takes one between itself and a Latin word too (UI.md §1, the
// Japanese line): a name in any script but Han, kana or hangul (Latin, Cyrillic, Greek, Arabic, Devanagari, Thai and the
// rest) is such text, while a name in Han, kana or hangul, or one that ends on full-width punctuation, sits against the
// sentence as the sentence does, and a space there reads as a gap.
// So a pack writes the template with no space and lets these add it. Korean needs none: it spaces its words anyway, and a
// Korean template keeps particles away from a name instead (UI.md §1, the Korean line)

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u
const CJK_FIRST = new RegExp(`^${CJK.source}`, 'u')
const CJK_LAST = new RegExp(`${CJK.source}$`, 'u')

/** `name` as it follows CJK text: with a leading space unless it is empty or begins in Han, kana, hangul or full-width punctuation */
export function spacedAfterCjk(name: string): string {
  return name === '' || CJK_FIRST.test(name) ? name : ` ${name}`
}

/** `name` as CJK text follows it: with a trailing space unless it is empty or ends in Han, kana, hangul or full-width punctuation */
export function spacedBeforeCjk(name: string): string {
  return name === '' || CJK_LAST.test(name) ? name : `${name} `
}

/** `name` with CJK text on both sides of it */
export function spacedWithinCjk(name: string): string {
  return spacedBeforeCjk(spacedAfterCjk(name))
}
