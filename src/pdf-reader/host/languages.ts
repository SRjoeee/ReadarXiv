// The languages the reader offers (the reader's design, §6.7): the ones the layer sets (the engine's rules TARGETS,
// tests/pdf-reader/ui/languages.test.ts holds the two equal), each named in its own language: by script (CJK in the design's
// order, then Latin, then Cyrillic), each alphabet's languages in the order of their own names
import type { MenuItem } from '@/ui/menu-item'
import { LANG_CODE_TO_LOCALE_NAME, type LangCode, toBcp47 } from '@/config/languages'
import { codeOf } from './prefs'
import { languageKeywords } from '@/ui/language-keywords'

/**
 * A target language as the reader names it, wherever it shows one: by its own name, as the menu lists it, whatever the
 * interface's language (Japanese in Japanese, never in English; the maintainer, 2026-10-04). A code the table lacks (a
 * setting written by another version) shows as the code
 */
export function ownName(code: string): string {
  return LANG_CODE_TO_LOCALE_NAME[code as LangCode] ?? code
}

export const READER_LANGUAGES: readonly LangCode[] = [
  'jpn', 'cmn', 'cmn-Hant', 'kor',
  'ind', 'zsm', 'ces', 'deu', 'spa', 'fra', 'ita', 'nld', 'pol', 'por', 'swe', 'tur',
  'bul', 'rus', 'ukr',
]

export function languageItems(current: string): MenuItem[] {
  return READER_LANGUAGES.map(code => ({
    id: code,
    name: LANG_CODE_TO_LOCALE_NAME[code],
    keywords: languageKeywords(code),
    selected: code === current,
  }))
}

/** the reader's languages as its chrome asks for them (packages/reader chrome/parts.tsx Languages): by the target's tag, the
 *  preference model's (BCP 47; host/prefs.ts codeOf takes a tag back to its code) */
export function chromeLanguages(): { name(tag: string): string; tag(tag: string): string; items(current: string): { id: string; name: string; keywords: string; selected: boolean }[] } {
  return {
    name: tag => ownName(codeOf(tag)),
    tag: tag => tag,
    items: current => languageItems(codeOf(current)).map(i => ({ ...i, id: toBcp47(i.id), keywords: i.keywords ?? '' })),
  }
}
