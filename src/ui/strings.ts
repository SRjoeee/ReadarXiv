// The extension's own helpers over the string catalogue (docs/UI.md §3 and §6). The catalogue — the packs, the live
// bindings `S`, `O`, `R` and `setLocale` — is `@readarxiv/ui`'s; what stays here reads what only the extension holds:
// its configuration tables, the language names ported from Read Frog, its services and the core.
//
// It also hands the core its sentences (the failure widget's), at load and on every switch: a module that switches the
// pack loads this one (ui/apply-locale.ts does).
import { LOCALES, type LocaleCode, localeInUse, O, onLocale, type ProviderErrorKind as CatalogueErrorKind, S } from '@readarxiv/ui'
import { BUILT_IN_HIGHLIGHTS, BUILT_IN_STYLES, NAME_MAX } from '@/config/appearance'
import { LANG_CODE_TO_JA_NAME, LANG_CODE_TO_KO_NAME, LANG_CODE_TO_ZH_TW_NAME } from '@/config/language-names'
import { LANG_CODE_TO_EN_UI_NAME, LANG_CODE_TO_ZH_NAME, type LangCode, label } from '@/config/languages'
import { isBuiltInService } from '@/config/services'
import type { FallbackReason } from '@/config/storage'
import type { ProviderErrorKind } from '@/providers/types'
import { setCoreStrings } from '@/core/strings'

/** The catalogue states the error kinds it words a reason for (it imports nothing of the extension); they are the
 *  providers' own, both ways: a kind added on one side and not on the other does not compile */
const _kindsAgree: [ProviderErrorKind, CatalogueErrorKind] extends [CatalogueErrorKind, ProviderErrorKind] ? true : false = true

/**
 * Which set of language names each interface language uses for the target-language menu. A pack
 * does not carry its own copy of 180 language names — adding a language must stay one small file —
 * so it points at a table instead, and a language without one reads them in English. The Chinese
 * table is Read Frog's, the English one its overlay; Traditional Chinese, Japanese and Korean are
 * CLDR's (config/language-names.ts, generated)
 */
const LOCALE_LANGUAGE_NAMES: Record<LocaleCode, Partial<Record<LangCode, string>>> = {
  'zh-CN': LANG_CODE_TO_ZH_NAME,
  'zh-TW': LANG_CODE_TO_ZH_TW_NAME,
  ja: LANG_CODE_TO_JA_NAME,
  ko: LANG_CODE_TO_KO_NAME,
  en: LANG_CODE_TO_EN_UI_NAME,
}

/** The core renders the failure widget itself and knows no pack (DESIGN §4.2): hand it this locale's sentences, at load and on every switch */
function installCoreStrings(): void {
  // (the widget knows the kind alone, not the engine: its key reasons are the keyless words)
  setCoreStrings({ lang: localeInUse(), retry: S.page.retry, failureTitle: kind => reasonText(kind) })
}

/**
 * A target language's name in the interface's language — what a **row** shows. One name, because
 * the row is a line of the interface and has one line's worth of room: "Simplified Mandarin Chinese
 * (简体中…)" truncated mid-word while the Chinese pack, whose two names happen to be identical,
 * showed the tidy "简体中文" (reported 2026-09-11). The reader's own name for it lives in the menu
 */
export function languageName(code: LangCode): string {
  return LOCALE_LANGUAGE_NAMES[localeInUse()][code] ?? LANG_CODE_TO_EN_UI_NAME[code]
}

/**
 * The same name with the language's own beside it ("日语（日本語）", "Japanese (日本語)") — what the
 * **menu** shows. Target language and interface language are separate choices (UI.md §6), so the
 * list has to be readable whichever interface language is set: a reader looking for their language
 * finds it by how it is written at home
 */
export function languageLabel(code: LangCode): string {
  return label(code, LOCALE_LANGUAGE_NAMES[localeInUse()])
}

/**
 * An appearance profile's name. The ones that ship with the extension are ours, so they follow the
 * interface's language; a profile the reader added, or a shipped one they **renamed**, keeps the
 * name they gave it — which is what "the stored name is still the one it shipped with" tests for
 */
/** The second line of the settings page's fallback notice, in the reader's language (S-O-01) */
export function fallbackText(reason: FallbackReason): string {
  switch (reason.kind) {
    case 'tooNew':
      return O.fallbackWhy.tooNew(reason.stored, reason.supported)
    case 'upgradeFailed':
      return O.fallbackWhy.upgradeFailed(reason.stored, reason.supported)
    case 'invalid': {
      // The field's own sentence when the pack has one; the zod diagnostic otherwise (it is English developer text)
      const key = reason.where.split('.').filter(s => !/^\d+$/.test(s)).pop() ?? ''
      return O.fallbackWhy.invalid(reason.where, O.fallbackWhy.field[key] ?? reason.message)
    }
    default:
      return O.fallbackWhy.unknown
  }
}

/**
 * What a duplicate is called: the name as displayed, set into the pack's words for a copy (a suffix in Chinese and
 * English, joined after the name in Japanese). **The name gives way, not those words** — clipping the finished string would eat them off a name already
 * at the limit and hand back a copy indistinguishable from its source (Codex on #161). The name is shortened until the
 * whole fits, since a pack may space the name from its words or not, depending on how the name ends
 */
export function copyName(profile: { id: string; name: string }, kind: 'styles' | 'highlights' = 'styles'): string {
  const name = profileName(profile, kind)
  const named = (room: number) => O.reading.copyName(name.slice(0, room).trimEnd())
  let room = name.length
  while (room > 1 && named(room).length > NAME_MAX) room--
  return named(room)
}

export function profileName(profile: { id: string; name: string }, kind: 'styles' | 'highlights' = 'styles'): string {
  const shipped = kind === 'styles' ? BUILT_IN_STYLES : BUILT_IN_HIGHLIGHTS
  const original = shipped.find(p => p.id === profile.id)
  if (!original || original.name !== profile.name) return profile.name
  const names: Record<string, string> = kind === 'styles' ? O.reading.builtInStyles : O.reading.builtInHighlights
  return names[profile.id] ?? profile.name
}

/**
 * The order the three modes are offered in (UI.md S-P-70). “Side by side” comes first: on a wide screen it is
 * the layout most readers stay in. Presentation only — `MODE_VALUES` (config/schema.ts) stays the
 * data order, and the popup's mode bar reads this one
 */
export const MODE_ORDER = ['side', 'stack', 'only'] as const

/** The settings page (docs/UI.md §3.2). Same register as `S`: nouns for states, verbs for buttons */

/**
 * §3.4: ProviderErrorKind → a reader's sentence. `aborted` is the reader's own doing and shows nothing. `engine`, the id of the
 * engine the failure is about where the caller knows it: a missing or refused key is worded as the key's only for an engine that
 * carries one — the reader's own services; a built-in one (a web translator's 401 or 403, Chrome's translator not ready), or one
 * not known, is told it without naming a key (#88 E5)
 */
export function reasonText(kind: ProviderErrorKind, engine?: string): string {
  const current = LOCALES[localeInUse()]
  if ((kind === 'auth' || kind === 'no-key') && (engine === undefined || isBuiltInService(engine))) return current.REASON_KEYLESS[kind]
  return current.REASON[kind]
}

/** `kind: diagnostic` → its parts; lives in the core now (pipeline/fatal.ts), re-exported for the popup and the tests */
export { parseFatal } from '@/core/pipeline/fatal'

/** service id → the name a reader sees (§2): built-ins by id, the reader's own by the name they gave */
export function serviceName(id: string, services: readonly { id: string; name: string }[] = []): string {
  switch (id) {
    case 'openai-compat':
      return S.service.llm
    case 'google-web':
      return S.service.google
    case 'chrome-builtin':
      return S.service.chrome
    case 'microsoft':
      return S.service.microsoft
    default:
      return services.find(s => s.id === id)?.name ?? id
  }
}

onLocale(installCoreStrings)
installCoreStrings()
