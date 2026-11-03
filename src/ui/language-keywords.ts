// The words a target language is found by in a language menu's search (the popup's, the settings page's and the PDF
// reader's): its names in every interface language, its own name and its code. A reader types the name they know it by,
// whatever the interface is set to: Japanese's name for German finds Deutsch on an English interface, as German and the
// Chinese name do.
// The website's reader answers its menu with a list of its own (its seam of pdf-reader/ui/languages) and never imports this.
import { LANG_CODE_TO_EN_NAME, LANG_CODE_TO_EN_UI_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, type LangCode } from '@/config/languages'
import { LANG_CODE_TO_JA_NAME, LANG_CODE_TO_KO_NAME, LANG_CODE_TO_ZH_TW_NAME } from '@/config/language-names'

const TABLES = [LANG_CODE_TO_EN_NAME, LANG_CODE_TO_EN_UI_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, LANG_CODE_TO_ZH_TW_NAME, LANG_CODE_TO_JA_NAME, LANG_CODE_TO_KO_NAME]

export function languageKeywords(code: LangCode): string {
  return [...new Set([...TABLES.map(table => table[code]), code].filter(Boolean))].join(' ')
}
