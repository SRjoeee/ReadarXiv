// The target language a new reader starts with (DESIGN §9). It used to be Simplified Chinese for everyone, whatever
// the browser said. Chosen once, when the extension is installed, and written into the configuration: from then on it
// is the reader's setting like any other, shown on the popup's first screen and one click from changed. Not an `auto`
// resolved at every read: the target enters the cache key and the engine chain, and a reader reordering the browser's
// languages would find every cached translation gone and the page in another language.
//
// Conservative on purpose: where the table cannot say what the browser asked for — an unknown tag, a script it does
// not list — the tag is passed over for the next one. Starting a reader in the wrong script is worse than starting
// them in the default, which they change in one click.
//
// Neither reference project chooses it (checked 2026-09-20: Read Frog and FluentRead both default to Simplified
// Chinese, and read the browser's language for the interface only).
import { DEFAULT_LANG_CODE, type LangCode, languageOfTag } from './languages'

/** A paper is in English: English is never what it is to be translated into */
const SOURCE: LangCode = 'eng'

/** What a browser calls a language the table lists under another code: Chrome offers Filipino as `fil` and Norwegian as `no` */
const ALSO_KNOWN_AS: Record<string, LangCode> = { fil: 'tgl', no: 'nob', iw: 'heb', in: 'ind' }

/**
 * The table's entries that name a script, and whether a tag of that language without a script subtag means that
 * script (CLDR's likely script: Serbian is Cyrillic by default; Bosnian, Uzbek, Azerbaijani, Malay and Javanese are
 * Latin). A reader is never started in a script their browser did not ask for — `ms-MY` is not Malay in Jawi, `sr-Latn`
 * is not Cyrillic Serbian (Devin and Codex on #272): such a tag is passed over like one the table cannot place. That
 * the table has no Latin entry for these languages is the table's gap, not decided here
 */
const NAMED_SCRIPT: Partial<Record<LangCode, { script: string; unmarked: boolean }>> = {
  srp: { script: 'cyrl', unmarked: true },
  bos: { script: 'cyrl', unmarked: false },
  uzn: { script: 'cyrl', unmarked: false },
  azj: { script: 'cyrl', unmarked: false },
  zlm: { script: 'arab', unmarked: false },
  jav: { script: 'java', unmarked: false },
}

/** The language a browser's tag asks for, or null: one the table cannot place, or can place only in another script */
function wanted(tag: string): LangCode | null {
  const subtags = tag.trim().toLowerCase().split('-')
  const language = ALSO_KNOWN_AS[subtags[0] ?? ''] ?? languageOfTag(tag)
  const named = language ? NAMED_SCRIPT[language] : undefined
  if (!language || !named) return language
  // A script subtag is the four-letter one (BCP-47)
  const asked = subtags.slice(1).find(part => /^[a-z]{4}$/.test(part))
  return (asked ? asked === named.script : named.unmarked) ? language : null
}

/**
 * `preferred` is the browser's list of languages, most wanted first (`navigator.languages`); `ui` the language of
 * its own interface. **The first preferred language that is not English**, because many who read papers run an
 * English system with their own language second, and the interface's language alone would say English. Then the
 * interface's, if it is not English; then Simplified Chinese, as before. A tag the table cannot place is passed over
 */
export function pickTargetLanguage(preferred: readonly string[], ui?: string): LangCode {
  for (const tag of [...preferred, ...(ui ? [ui] : [])]) {
    const language = typeof tag === 'string' ? wanted(tag) : null
    if (language && language !== SOURCE) return language
  }
  return DEFAULT_LANG_CODE
}
