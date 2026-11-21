// The interface's own languages (docs/UI.md §6). Separate from `targetLanguage`, which is what the
// paper is translated into: a reader in Tokyo may well translate into Japanese and want the buttons
// in Japanese too, but the two are different choices and neither implies the other.
//
// Adding a language is one file, its code in codes.ts and one line in LOCALES. Everything else follows:
// the type comes from the Chinese pack, so a missing key does not compile, LOCALES is typed against the
// codes, so a pack with no code or a code with no pack does not either, and the settings menu is built
// from this table. English is the fallback — not because the readers are English speakers (a reader of
// English needs no translator on arXiv) but because it is the one language a paper-reading audience
// can be assumed to get by in when their own is not here yet.
import type { LocaleCode } from './codes.ts'
import { en } from './en.ts'
import { ja } from './ja.ts'
import { ko } from './ko.ts'
import { zh } from './zh-CN.ts'
import { zhTW } from './zh-TW.ts'

// the codes and the pick, which name no pack (codes.ts)
export { FALLBACK_LOCALE, isLocaleCode, LOCALE_CODES, type LocaleCode, localeOfTag, pickLocale } from './codes.ts'

/**
 * The Chinese pack's shape with its literals widened: `brand: 'Read arXiv'` becomes `string`, so
 * another pack can hold another sentence, while a **missing** key still fails to compile. Tuples
 * keep their length (the two stop lists have a fixed number of steps)
 */
type Widen<T> =
  T extends string ? string
    : T extends (...args: infer A) => infer R ? (...args: A) => R
      : T extends object ? { readonly [K in keyof T]: Widen<T[K]> }
        : T

export type Locale = Widen<typeof zh>

/**
 * The kinds of failure a pack words a reason for (`REASON`, `REASON_KEYLESS`): a translator's error kinds, stated here
 * because the catalogue imports nothing of the extension; the extension holds them equal to its own at compile time
 * (src/ui/strings.ts)
 */
export type ProviderErrorKind = 'no-key' | 'network' | 'rate-limit' | 'auth' | 'bad-request' | 'invalid-response' | 'timeout' | 'aborted' | 'unknown'

/** Each language's pack, in the order of the codes (codes.ts LOCALE_CODES, the menu's) */
export const LOCALES = {
  'zh-CN': zh,
  'zh-TW': zhTW,
  ja,
  ko,
  en,
} as const satisfies Record<LocaleCode, unknown>

/** Each language in its own name, which is the only name a reader looking for it will recognise */
export const LOCALE_NAMES: Record<LocaleCode, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  en: 'English',
}
