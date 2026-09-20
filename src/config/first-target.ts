// The target language a new reader starts with (DESIGN §9). It used to be Simplified Chinese for everyone, whatever
// the browser said. Chosen once, when the extension is installed, and written into the configuration: from then on it
// is the reader's setting like any other, shown on the popup's first screen and one click from changed. Not an `auto`
// resolved at every read: the target enters the cache key and the engine chain, and a reader reordering the browser's
// languages would find every cached translation gone and the page in another language.
//
// Neither reference project chooses it (checked 2026-09-20: Read Frog and FluentRead both default to Simplified
// Chinese, and read the browser's language for the interface only).
import { DEFAULT_LANG_CODE, type LangCode, languageOfTag } from './languages'

/** A paper is in English: English is never what it is to be translated into */
const SOURCE: LangCode = 'eng'

/**
 * `preferred` is the browser's list of languages, most wanted first (`navigator.languages`); `ui` the language of
 * its own interface. **The first preferred language that is not English**, because many who read papers run an
 * English system with their own language second, and the interface's language alone would say English. Then the
 * interface's, if it is not English; then Simplified Chinese, as before. A tag the table cannot place is passed over
 */
export function pickTargetLanguage(preferred: readonly string[], ui?: string): LangCode {
  for (const tag of [...preferred, ...(ui ? [ui] : [])]) {
    const language = typeof tag === 'string' ? languageOfTag(tag) : null
    if (language && language !== SOURCE) return language
  }
  return DEFAULT_LANG_CODE
}
