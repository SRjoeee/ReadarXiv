// The languages the reader typesets (the reader's design, §6.7): the nine the typesetting gate verified
// (engine/scripts.mjs VERIFIED), in the design's order, each named in its own language
import type { MenuItem } from '@/ui/Menu'
import { LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, type LangCode } from '@/config/languages'

export const READER_LANGUAGES: readonly LangCode[] = ['jpn', 'cmn', 'cmn-Hant', 'kor', 'deu', 'spa', 'fra', 'por', 'rus']

export function languageItems(current: string): MenuItem[] {
  return READER_LANGUAGES.map(code => ({
    id: code,
    name: LANG_CODE_TO_LOCALE_NAME[code],
    keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
    selected: code === current,
  }))
}
