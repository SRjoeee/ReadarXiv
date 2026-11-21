// The interface's languages by their codes, and the pick of one, with no pack (docs/UI.md §6): the table of packs
// (index.ts LOCALES) is typed against these codes, so a code with no pack, or a pack with no code, does not compile. Apart
// from the packs so that a page that may not load them (a host's own pages around the reader: `@readarxiv/ui/languages`)
// picks the interface's language as the reader does.

export type LocaleCode = 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'en'

/**
 * The order is the menu's (the settings page's, and the website's list held to it): Simplified Chinese first, the
 * product's first language; Traditional beside it, so that a reader looking for Chinese finds both together; then
 * Japanese and Korean, the CJK languages in the order the targets list their scripts; English last, the fallback
 */
export const LOCALE_CODES: LocaleCode[] = ['zh-CN', 'zh-TW', 'ja', 'ko', 'en']

export const FALLBACK_LOCALE: LocaleCode = 'en'

// a lookup in the list, not `in` an object: `constructor` and `toString` are in every object, so a stored value like that
// would pass, and the pages would render nothing instead of falling back
export const isLocaleCode = (value: string): value is LocaleCode => (LOCALE_CODES as string[]).includes(value)

/** The script and region subtags that make Chinese Traditional (lower case): config/languages.ts reads a target so too */
const TRADITIONAL = new Set(['hant', 'tw', 'hk', 'mo'])

/**
 * One browser language tag's pack, or null when none is near. BCP-47 is case-insensitive, and what follows the first
 * singleton subtag is an extension (`zh-TW-u-nu-hanidec` is Taiwan's Chinese with Han digits), so both are set aside.
 * Chinese goes by its script: a script written out wins (`zh-Hans-TW` is Simplified), then Taiwan, Hong Kong and Macao
 * are Traditional, and the rest (`zh`, `zh-CN`, `zh-SG`) Simplified; Cantonese reads Traditional unless it says
 * `Hans`. Every other language by its code, then by its primary subtag (`ja-JP` → `ja`, `en-GB` → `en`).
 * A host's pages that may not load the packs pick by this rule too, through `@readarxiv/ui/languages`
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
