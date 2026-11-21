// A target of the configuration as the chain is asked it, apart from the translators so that the popup and the settings
// page, which only ask whether Microsoft serves a language, bundle neither the AI SDK nor the chain (wire-formats.ts's
// reason: 43 kB against 276 kB)
import { microsoftServesTarget } from '@readarxiv/translate'
import { toBcp47 } from '@/config/languages'
import type { Lang } from '@readarxiv/translate'

/** The target as the chain is asked it: BCP-47, the configuration storing ISO 639-3 (`config/languages.ts` toBcp47) */
export const langOf = (code: string): Lang => toBcp47(code)

/**
 * The three targets whose script, as the language table labels it (Cyrillic), Microsoft's endpoint cannot write: their
 * two-letter codes are in its table and come back Latin every time (measured 2026-09-09), so it is not offered them, and
 * the fallback answers them as it did (`microsoft.ts` SCRIPT_UNAVAILABLE before stage 4b)
 */
const MICROSOFT_SCRIPT_UNAVAILABLE = new Set(['bos', 'uzn', 'azj'])
export const microsoftServes = (code: string): boolean => !MICROSOFT_SCRIPT_UNAVAILABLE.has(code)

/** Whether Microsoft's endpoint serves a target language of the configuration (the package's table, the host's mapping) */
export const supportsTarget = (code: string): boolean => microsoftServes(code) && microsoftServesTarget(langOf(code))
