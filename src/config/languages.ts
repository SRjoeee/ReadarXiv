// The target languages (UI.md §6, DESIGN §8.2): the generated table (`language-table.ts`, scripts/languages.ts, under
// UI.md §6's naming policy) and what the extension asks of it — a language's English name for the prompt, its label in
// a menu, the tag a translator is sent and the way back from a browser's tag, the direction it is written in.
import { z } from 'zod'
import { DEFAULT_LANG_CODE, EN_NAMES, ISO_639_1, LANG_CODES, type LangCode, OWN_NAMES, RTL_CODES, TAGS, ZH_NAMES } from './language-table'

export { DEFAULT_LANG_CODE, LANG_CODES, type LangCode }

export const langCodeSchema = z.enum(LANG_CODES)

/** The English names: the prompt's `{{targetLanguage}}` and the English menu's, one word (UI.md §6, rule 3) */
export const LANG_CODE_TO_EN_NAME: Readonly<Record<LangCode, string>> = EN_NAMES
/** The Simplified Chinese interface's names */
export const LANG_CODE_TO_ZH_NAME: Readonly<Record<LangCode, string>> = ZH_NAMES
/** Each language's name in itself: the menus' second name and the PDF reader's language button */
export const LANG_CODE_TO_LOCALE_NAME: Readonly<Record<LangCode, string>> = OWN_NAMES
/** The ISO 639-1 code a language is known by, where it has one */
export const ISO6393_TO_6391: Readonly<Partial<Record<LangCode, string>>> = ISO_639_1
/** The English interface's names: the prompt's own, no longer an overlay (UI.md §6, rule 3) */
export const LANG_CODE_TO_EN_UI_NAME: Record<LangCode, string> = EN_NAMES

const CODE_SET: ReadonlySet<string> = new Set(LANG_CODES)
export function isLangCode(value: string): value is LangCode {
  return CODE_SET.has(value)
}

/** The name a prompt gives the target language; a code the table does not hold comes back as it is */
export function englishName(code: string): string {
  return isLangCode(code) ? EN_NAMES[code] : code
}

/** The tag a translator is sent; a code the table does not hold comes back as it is */
export function toBcp47(code: string): string {
  return isLangCode(code) ? TAGS[code] : code
}

export const RTL_LANGUAGES: ReadonlySet<LangCode> = new Set(RTL_CODES)

/** Han or kana: a name written in Chinese or Japanese takes full-width parentheses (UI.md §6) */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u
const HANGUL = /\p{Script=Hangul}/u
const FULL_OPEN = '\uFF08'
const FULL_CLOSE = '\uFF09'
const FULL_COMMA = '\u3001'

/**
 * A menu's label (UI.md §6): the name in the interface's language (`inLocale`, the English one where that table has
 * none), with the language's own name beside it unless the two are the same or there is no own name. The parentheses
 * follow the outer name: full-width after Chinese and Japanese, half-width after the rest, Korean with no space before
 * them. A name that ends on a parenthetical of its own takes the own name inside it, after its kind's enumeration comma —
 * never a second pair after the first
 */
export function label(code: LangCode, inLocale: Partial<Record<LangCode, string>>): string {
  const name = inLocale[code] ?? EN_NAMES[code]
  const own = OWN_NAMES[code]
  if (!own || own === name) return name
  if (name.endsWith(FULL_CLOSE)) return `${name.slice(0, -1)}${FULL_COMMA}${own}${FULL_CLOSE}`
  if (name.endsWith(')')) return `${name.slice(0, -1)}, ${own})`
  if (CJK.test(name)) return `${name}${FULL_OPEN}${own}${FULL_CLOSE}`
  return HANGUL.test(name) ? `${name}(${own})` : `${name} (${own})`
}

/** A tag in lower case without its extensions (from the first singleton on: `-u-…`, `-x-…`), which say nothing of the language */
export function withoutExtensions(tag: string): string {
  const subtags = tag.trim().toLowerCase().split('-')
  const singleton = subtags.findIndex((part, i) => i > 0 && part.length === 1)
  return (singleton < 0 ? subtags : subtags.slice(0, singleton)).join('-')
}

/** Every tag and code the table answers to, in lower case: the tags it sends first, then the codes, then the ISO 639-1 codes */
const BY_TAG: ReadonlyMap<string, LangCode> = (() => {
  const map = new Map<string, LangCode>()
  const add = (key: string | undefined, code: LangCode) => { if (key && !map.has(key.toLowerCase())) map.set(key.toLowerCase(), code) }
  for (const code of LANG_CODES) add(TAGS[code], code)
  for (const code of LANG_CODES) add(code, code)
  for (const code of LANG_CODES) add(ISO_639_1[code], code)
  return map
})()

/** Hong Kong, Macao and Taiwan write Traditional Chinese */
const TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo'])

/**
 * The table's language for a browser's or a page's tag, or null where it names none: Chinese by its script, a script
 * written out winning over the region; any other tag by itself, then shorter, down to its primary language
 */
export function languageOfTag(tag: string): LangCode | null {
  const clean = withoutExtensions(tag)
  if (!clean) return null
  const subtags = clean.split('-')
  if (subtags[0] === 'zh' || subtags[0] === 'cmn') {
    const rest = subtags.slice(1)
    if (rest.includes('hant')) return 'cmn-Hant'
    if (rest.includes('hans')) return 'cmn'
    return rest.some(part => TRADITIONAL_REGIONS.has(part)) ? 'cmn-Hant' : 'cmn'
  }
  for (let n = subtags.length; n > 0; n--) {
    const found = BY_TAG.get(subtags.slice(0, n).join('-'))
    if (found) return found
  }
  return null
}

/** The same, falling back to the default language: what a stored tag of an older configuration becomes */
export function fromBcp47(tag: string): LangCode {
  return languageOfTag(tag) ?? DEFAULT_LANG_CODE
}

/** The scripts written right to left (ISO 15924), for a tag that names its script */
const RTL_SCRIPTS = new Set(['arab', 'hebr', 'thaa', 'syrc', 'nkoo', 'adlm', 'rohg', 'mand', 'samr', 'mend'])

/** Whether a tag is written right to left: by its script where it names one (ms-Arab, not ms), else by its language */
export function isRtlTag(tag: string): boolean {
  const subtags = withoutExtensions(tag).split('-')
  const script = subtags.slice(1).find(part => /^[a-z]{4}$/.test(part))
  if (script) return RTL_SCRIPTS.has(script)
  const code = languageOfTag(tag)
  return code !== null && RTL_LANGUAGES.has(code)
}
