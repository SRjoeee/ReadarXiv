// The languages the reader typesets (the reader's design, §6.7): the nine the typesetting gate verified
// (engine/scripts.mjs VERIFIED), in the design's order, each named in its own language
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

export const READER_LANGUAGES: readonly LangCode[] = ['jpn', 'cmn', 'cmn-Hant', 'kor', 'deu', 'spa', 'fra', 'por', 'rus']

export function languageItems(current: string): MenuItem[] {
  return READER_LANGUAGES.map(code => ({
    id: code,
    name: LANG_CODE_TO_LOCALE_NAME[code],
    keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
    selected: code === current,
  }))
}
