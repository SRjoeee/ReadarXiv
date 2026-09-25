// The popup's state model: the inputs are what a few messages return plus the popup's own UI
// state (which menu is open), the output is "what every element shows right now" (the state table
// of docs/UI.md §4). A pure function with no side effects; the gallery and the tests feed it the
// inputs in fixtures.ts.
//
// Rules in one place: no state pill, the page being translated is said by the primary button; one
// note at a time (paused > replaced > images paused > the chosen service cannot run); the menus
// open at any time, a change while the page is on restarts it in place (data.ts), and only a
// choice that cannot run leaves the page behind the settings.
import { activeStyle } from '@/config/appearance'
import { LANG_CODES, LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME } from '@/config/languages'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { CONFIG_UNREADABLE } from '@/config/storage'
import { chosenService, isBuiltInService, isLlmChosen, serviceRuns } from '@/config/services'
import type { Mode } from '@/core/renderer'
import { supportsTarget } from '@/providers/microsoft'
import { BUILT_IN_PROMPTS } from '@/providers/prompt-library'
import type { ProviderStatus } from '@/providers/transport'
import type { EntryStatus, PageStatus } from '@/shared/messages'
import type { StartResult } from '@/core/session'
import { pageDecision } from '@/shared/page-action'
import type { PackState } from '@/shared/pack'
import type { MenuItem } from '@/ui/Menu'
import { MANAGE_SERVICES, serviceItems } from '@/ui/service-items'
import { styleTile } from '@/ui/appearance/tiles'
import { NoActiveTabError } from '@/shared/messages'
import { PREVIEW_TARGET, S, languageLabel, languageName, parseFatal, profileName, reasonText, serviceName } from '@/ui/strings'

export type { PackState }
export { MANAGE_SERVICES }
/** The same for the style menu: not a profile, it opens the settings page at the section that holds them */
export const MANAGE_STYLES = '__manage-styles'
export type MenuKind = 'service' | 'language' | 'prompt' | 'style'

export interface PopupInput {
  page: PageStatus | null
  /** The saved settings' chain: what a translation started now would run on; null until asked or when the ask failed */
  saved: ProviderStatus | null
  /**
   * The running session's own chain — its engine, its hand-overs — while the page is on; null when the page is off
   * or its status has not come back. Never stood in for by `saved`: the two can describe different chains after a
   * change saved elsewhere, and an unknown session shows as unknown (Codex on #185)
   */
  session: ProviderStatus | null
  config: Config | null
  /** The offline service's language pack; null until asked */
  pack: PackState | null
  /** `chainRevision` of the saved configuration; null until computed. A page whose `running.revision` differs is behind */
  savedRevision: string | null
  /** Which menu is open (the popup's own state) */
  menu: MenuKind | null
  /**
   * What an abstract or PDF page answered (§4.0b): null on the HTML full text, where `page` speaks instead, and on
   * any other page, where nothing answers at all
   */
  entry: EntryStatus | null
  /** The translate shortcut as Chrome reports it; null when unbound or unknown */
  shortcut: string | null
}

export interface Row { value: string; replaced?: string }
export interface Entry { label: string; disabled: boolean }
/** A note under the card; `settings` adds the button that opens the options page */
export interface Note { text: string; settings: boolean }

export interface PopupView {
  empty: boolean
  service: Row
  language: Row
  /** Only while the LLM is the chosen service */
  prompt: Row | null
  /** The chosen translation style (S-P-82); the menu lists what the settings page holds */
  style: Row
  highlight: boolean
  images: boolean
  menu: { kind: MenuKind; label: string; items: MenuItem[]; search: boolean } | null
  note: Note | null
  failed: string | null
  primary: { label: string; action: 'translate' | 'restore' | 'retranslate' | 'openHtml'; disabled: boolean; shortcut?: string }
  secondary: { label: string; action: 'restore' } | null
  /**
   * An abstract or PDF page's two entries, drawn in the primary button's place (the reader's design, §2): the HTML
   * version or the bilingual PDF, the reader's to choose. Null elsewhere
   */
  entries: { html: Entry; pdf: Entry } | null
  mode: { value: Mode; note: string | null }
}

/**
 * The “not a paper page” screen. **Computed at call time, not at module load**: this module is imported before
 * `applyLocale`, a constant would freeze the fallback language into it, and a Chinese interface would show one English button (Codex on #161)
 */
const empty = (): PopupView => ({
  empty: true,
  service: { value: '' },
  language: { value: '' },
  prompt: null,
  style: { value: '' },
  highlight: true,
  images: true,
  menu: null,
  note: null,
  failed: null,
  primary: { label: S.primary.translate, action: 'translate', disabled: true },
  secondary: null,
  entries: null,
  mode: { value: DEFAULT_CONFIG.mode, note: null },
})

/** Whether the chosen service can run on its own, decided from the settings (no round trip, no stale chain) */
export function runnable(config: Config, pack: PackState | null): boolean {
  const own = chosenService(config)
  if (own) return serviceRuns(own)
  // A service id naming nothing: a popup left open while another tab deleted it. `getProvider`
  // falls back to a built-in, so saying "usable" here would have the reader believe their LLM is
  // translating while something else is (Codex on #157)
  if (!isBuiltInService(config.provider)) return false
  switch (config.provider) {
    case 'chrome-builtin':
      return pack === 'available'
    case 'microsoft':
      return supportsTarget(config.targetLanguage)
    default:
      return true
  }
}

/** Why it cannot (S-P-31 / S-P-32) */
function cannotRunWhy(config: Config, pack: PackState | null): string {
  if (chosenService(config)) return S.note.llmNoKey
  if (!isBuiltInService(config.provider)) return S.note.serviceGone
  switch (config.provider) {
    case 'chrome-builtin':
      return pack === 'downloading' ? S.note.chromeDownloading : S.note.chromeNoPack
    case 'microsoft':
      return S.note.microsoftUnsupported
    default:
      return ''
  }
}

/**
 * The popup on the two pages that are not the full text (UI.md S-P-03b, the maintainer 2026-09-18: “whatever the
 * reader opened — abs, PDF or HTML — the popup is something they can click”).
 *
 * The same rows as anywhere else, because the settings they show are the same settings; the one difference is the
 * button, which opens the HTML version and translates it there. **Disabled, not hidden, when that paper has no HTML
 * version**: a reader who came for the translation is told the answer instead of finding a control that does nothing.
 */
function entryView(entry: EntryStatus, config: Config, input: PopupInput): PopupView {
  const { pack, menu, saved } = input
  const canRun = runnable(config, pack)
  // The rule that starts a translation on the full text (`pageDecision`): the chosen service, or the free one that
  // takes over from it. The page this button opens starts by that rule, so the button must not refuse what the page
  // would do (Devin on #247: with a fallback the full text's button was enabled and this one was not)
  const canStart = canRun || !!saved?.fallback
  const named = (id: string) => serviceName(id, config.services)
  const noHtml = entry.html === null
  const why = () => cannotRunWhy(config, pack)

  return {
    empty: false,
    service: { value: named(config.provider) },
    language: { value: languageName(config.targetLanguage) },
    prompt: isLlmChosen(config) ? { value: promptName(config) } : null,
    style: { value: profileName(activeStyle(config.appearance)) },
    highlight: config.reading.sentenceHighlight,
    images: config.image.enabled,
    menu: menu === null ? null : menuOf(menu, config, pack),
    note: noHtml
      ? { text: S.note.noHtml, settings: false }
      : canRun ? null : { text: saved?.fallback ? S.note.willFallback(why(), named(saved.fallback.id)) : S.note.cannotRun(why()), settings: true },
    failed: null,
    // No shortcut badge: ⌥T toggles a translated page, and there is none here yet (UI.md S-P-50)
    // Not the paper page's label: this page is not what gets translated (UI.md S-P-50b, the owner 2026-09-18)
    // not drawn: the entries below are (S-P-50b); kept as the HTML entry, the action a page's own button would take
    primary: { label: S.entry.html, action: 'openHtml', disabled: noHtml || !canStart },
    secondary: null,
    // a paper that cannot be had as a bilingual PDF greys its entry without words (§1's rule); either entry opens a page
    // that translates by the same rule as the full text's button (Devin on #247)
    entries: { html: { label: S.entry.html, disabled: noHtml || !canStart }, pdf: { label: S.entry.pdf, disabled: entry.pdf === null || !canStart } },
    mode: { value: config.mode, note: null },
  }
}

export function derivePopupView(input: PopupInput): PopupView {
  const { page, saved, session, config, pack, menu, shortcut, savedRevision, entry } = input
  // An abstract or PDF page: the popup works there too, and its button takes the reader to the HTML version.
  // `== null` on purpose: a tab whose content script ignores `axt:page-status` resolves `undefined` rather than
  // rejecting, and an undefined page is no page (it once rendered an empty popup on every PDF page)
  if (page == null && entry != null && config !== null) return entryView(entry, config, input)
  if (page == null) return empty()
  if (config === null) return { ...empty(), empty: false, mode: { value: page.preference, note: null } }

  const progress = page.progress
  const on = progress.state === 'on'
  const paused = progress.state === 'stopped' && progress.fatal !== undefined
  const canRun = runnable(config, pack)
  const demoted = on ? session?.engine.demoted : undefined
  // The page runs on settings other than the saved ones. A change made here restarts the page at
  // once (data.ts), so this is what is left: a choice that cannot start, and a change made from
  // another tab, which leaves this page pinned to the session it began (Codex on #157). Either way
  // the reader is offered “Translate again” — enabled when the saved settings can actually run. The rule is
  // the toggle's too (shared/page-action.ts): the page's revision against the saved settings' digest
  const decision = pageDecision(page, { revision: savedRevision, canRun, fallback: !!saved?.fallback }) ?? { action: 'translate' as const, behind: false, enabled: canRun || !!saved?.fallback }
  const { action, behind } = decision
  const named = (id: string) => serviceName(id, config.services)

  const service: Row = demoted && session
    ? { value: named(session.engine.id), replaced: named(demoted.id) }
    : { value: named(config.provider) }
  const language: Row = { value: languageName(config.targetLanguage) }
  // The prompt decides how an LLM translates; the free services do not read it
  const prompt: Row | null = isLlmChosen(config) ? { value: promptName(config) } : null
  // How the translation looks. The page applies a change straight away, so this needs no restart
  const style: Row = { value: profileName(activeStyle(config.appearance)) }

  const note: Note | null = paused ? { text: S.note.paused(reasonText(parseFatal(progress.fatal ?? '').kind)), settings: true }
    : demoted && session ? { text: S.note.replaced(named(demoted.id), reasonText(demoted.kind), named(session.engine.id)), settings: true }
    : page.images?.fatal ? { text: S.note.imagesPaused(reasonText(parseFatal(page.images.fatal).kind)), settings: true }
    : !canRun && (!on || behind)
      ? { text: !on && saved?.fallback ? S.note.willFallback(cannotRunWhy(config, pack), named(saved.fallback.id)) : S.note.cannotRun(cannotRunWhy(config, pack)), settings: true }
      : null

  const failedCount = progress.failed + (page.images?.failed ?? 0)
  const failed = failedCount > 0 && progress.state !== 'idle' && !progress.fatal && !page.images?.fatal ? S.failed.text(failedCount) : null

  const primary: PopupView['primary'] = { label: action === 'restore' ? S.primary.restore : action === 'retranslate' ? S.primary.retranslate : S.primary.translate, action, disabled: !decision.enabled }
  // On every action the key actually performs, “Show original” included: ⌥T translates a page that is not
  // translated and restores one that is, so the badge belongs on both faces of the same button
  // (user 2026-09-11). A paused session retries rather than restores, which is what its label says
  if (!primary.disabled && shortcut) primary.shortcut = shortcut
  const secondary = behind || paused ? { label: S.primary.restore, action: 'restore' as const } : null

  return {
    empty: false,
    service,
    language,
    prompt,
    style,
    highlight: config.reading.sentenceHighlight,
    images: config.image.enabled,
    menu: menu === null ? null : menuOf(menu, config, pack),
    note,
    failed,
    primary,
    secondary,
    entries: null,
    mode: { value: page.preference, note: page.mode !== page.preference ? S.mode.narrow : null },
  }
}

function promptName(config: Config): string {
  const id = config.prompts.promptId
  return BUILT_IN_PROMPTS[id]?.name ?? config.prompts.patterns.find(p => p.id === id)?.name ?? id
}

function menuOf(kind: MenuKind, config: Config, pack: PackState | null): NonNullable<PopupView['menu']> {
  switch (kind) {
    case 'service':
      return { kind, label: S.rows.service, search: false, items: serviceItems(config, pack) }
    case 'language':
      return {
        kind,
        label: S.rows.language,
        search: true,
        items: LANG_CODES.map(code => ({
          id: code,
          name: languageLabel(code),
          keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_LOCALE_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
          selected: code === config.targetLanguage,
        })),
      }
    case 'prompt':
      return {
        kind,
        label: S.rows.prompt,
        search: false,
        items: [...Object.values(BUILT_IN_PROMPTS), ...config.prompts.patterns].map(p => ({ id: p.id, name: p.name, selected: p.id === config.prompts.promptId })),
      }
    case 'style':
      // Whatever the settings page holds, in its order: the reader's own profiles sit among the
      // built-in ones there, and a second order here would make the same list read as two lists.
      // Each name carries the same sample sentence the settings tiles use, drawn in that style —
      // the names alone ("Muted", "Blurred") do not show what they do
      return {
        kind,
        label: S.rows.style,
        search: false,
        items: [
          ...config.appearance.styles.map(p => ({
            id: p.id,
            name: profileName(p),
            hint: PREVIEW_TARGET,
            preview: styleTile(p),
            selected: p.id === config.appearance.activeStyle,
          })),
          // The same position and role as in the service menu: the last row is not a style but the way in to managing them (S-P-83)
          { id: MANAGE_STYLES, name: S.rows.manageStyles, selected: false },
        ],
      }
  }
}


/** What a failed popup action says (S-P-90): a known failure in the interface language, anything else as it was thrown */
export function actionErrorText(e: unknown): string {
  if (e instanceof NoActiveTabError) return S.noActiveTab
  // By name: thrown here by a write of the popup's own, or in the page by the mode's save and carried back as a failure reply
  if (e instanceof Error && e.name === CONFIG_UNREADABLE) return S.settingsUnreadable
  return e instanceof Error ? e.message : String(e)
}

/** A refused start, in the interface's language: the session answers with a code (core/session StartRefusal), the popup with the sentence */
export function startRefusalText(result: Extract<StartResult, { started: false }>): string {
  switch (result.reason) {
    case 'already-on': return S.page.alreadyOn
    case 'session-over': return S.page.sessionOver
    case 'not-paper': return S.page.notPaper
    case 'nothing-to-translate': return S.page.nothingToTranslate
    case 'backend-silent': return S.page.backendSilentWith(result.detail ?? '')
    case 'no-service': return S.page.noService
  }
}
