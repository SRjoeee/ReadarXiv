// The languages the reader offers (the reader's design, §6.7): the ones the layer sets (the engine's rules TARGETS,
// tests/pdf-reader/ui/languages.test.ts holds the two equal), each named in its own language: by script (CJK in the design's
// order, then Latin, then Cyrillic), each alphabet's languages in the order of their own names
import type { MenuItem } from '@/ui/menu-item'
import { LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, type LangCode } from '@/config/languages'

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
    keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
    selected: code === current,
  }))
}
