// The interface's own languages (docs/UI.md §6). Separate from `targetLanguage`, which is what the
// paper is translated into: a reader in Tokyo may well translate into Japanese and want the buttons
// in Japanese too, but the two are different choices and neither implies the other.
//
// Adding a language is one file and one line in LOCALES. Everything else follows: the type comes
// from the Chinese pack, so a missing key does not compile, and the settings menu is built from
// this table. English is the fallback — not because the readers are English speakers (a reader of
// English needs no translator on arXiv) but because it is the one language a paper-reading audience
// can be assumed to get by in when their own is not here yet.
import { en } from './en.ts'
import { ja } from './ja.ts'
import { ko } from './ko.ts'
import { zh } from './zh-CN.ts'
import { zhTW } from './zh-TW.ts'

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
export type LocaleCode = keyof typeof LOCALES

/**
 * The kinds of failure a pack words a reason for (`REASON`, `REASON_KEYLESS`): a translator's error kinds, stated here
 * because the catalogue imports nothing of the extension; the extension holds them equal to its own at compile time
 * (src/ui/strings.ts)
 */
export type ProviderErrorKind = 'no-key' | 'network' | 'rate-limit' | 'auth' | 'bad-request' | 'invalid-response' | 'timeout' | 'aborted' | 'unknown'

/**
 * The order is the menu's (the settings page's, and the website's list held to it): Simplified Chinese first, the
 * product's first language; Traditional beside it, so that a reader looking for Chinese finds both together; then
 * Japanese and Korean, the CJK languages in the order the targets list their scripts; English last, the fallback
 */
export const LOCALES = {
  'zh-CN': zh,
  'zh-TW': zhTW,
  ja,
  ko,
  en,
} as const

/** Each language in its own name, which is the only name a reader looking for it will recognise */
export const LOCALE_NAMES: Record<LocaleCode, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  en: 'English',
}

export const FALLBACK_LOCALE: LocaleCode = 'en'
export const LOCALE_CODES = Object.keys(LOCALES) as LocaleCode[]

// `in` also finds `constructor` and `toString`: a stored value like that would pass, `LOCALES[value]`
// would be a function, and the pages would render nothing instead of falling back (Codex on #161)
export const isLocaleCode = (value: string): value is LocaleCode => Object.hasOwn(LOCALES, value)

/** The script and region subtags that make Chinese Traditional (lower case): config/languages.ts reads a target so too */
const TRADITIONAL = new Set(['hant', 'tw', 'hk', 'mo'])

/**
 * One browser language tag's pack, or null when none is near. BCP-47 is case-insensitive, and what follows the first
 * singleton subtag is an extension (`zh-TW-u-nu-hanidec` is Taiwan's Chinese with Han digits), so both are set aside.
 * Chinese goes by its script: a script written out wins (`zh-Hans-TW` is Simplified), then Taiwan, Hong Kong and Macao
 * are Traditional, and the rest (`zh`, `zh-CN`, `zh-SG`) Simplified; Cantonese reads Traditional unless it says
 * `Hans`. Every other language by its code, then by its primary subtag (`ja-JP` → `ja`, `en-GB` → `en`).
 * The website mirrors this rule (readarxiv-web, settings.ts `nearestCode`); a change here is a change there
 */
export function localeOfTag(tag: string): LocaleCode | null {
  const wanted = tag.trim().toLowerCase().replace(/-[a-z0-9](-.*)?$/, '')
  const [primary = '', ...rest] = wanted.split('-')
  if (primary === 'zh' || primary === 'cmn' || primary === 'yue') {
    if (rest.includes('hans')) return 'zh-CN'
    return primary === 'yue' || rest.some(part => TRADITIONAL.has(part)) ? 'zh-TW' : 'zh-CN'
  }
  return LOCALE_CODES.find(code => code.toLowerCase() === wanted)
    ?? LOCALE_CODES.find(code => code.toLowerCase().split('-')[0] === primary)
    ?? null
}

/**
 * Which pack to use, given what the reader chose and what the browser reports. `chosen` wins when it names a language
 * we have; otherwise the browser's list is walked in order, each tag by `localeOfTag`. Nothing matches: English
 */
export function pickLocale(chosen: string | undefined, uiLanguages: readonly string[]): LocaleCode {
  if (chosen && chosen !== 'auto' && isLocaleCode(chosen)) return chosen
  for (const tag of uiLanguages) {
    const code = localeOfTag(tag)
    if (code) return code
  }
  return FALLBACK_LOCALE
}
