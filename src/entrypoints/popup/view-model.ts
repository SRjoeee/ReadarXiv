// The popup's state model: the inputs are what a few messages return plus the popup's own state (which menu is open,
// what P0's field holds), the output is "what every element shows right now": the state table of docs/UI.md §4 with the
// redesign's changes (its design, §5). A pure function with no side effects; the gallery and the tests feed it the
// inputs in fixtures.ts.
//
// Rules in one place: no state pill, the page being translated is said by the primary button; one note at a time
// (paused > replaced > images paused > the chosen service cannot run), its icon the alert for something blocked or
// stopped and the information for something that goes on; every menu the view offers is drawn whether open or not (a
// popover's contents exist before it opens), they open at any time, a change while the page is on restarts it in place
// (data.ts), and only a choice that cannot run leaves the page behind the settings.
import { languageItems, READER_LANGUAGES } from '@/pdf-reader/ui/languages'
import { activeStyle } from '@/config/appearance'
import { LANG_CODES, LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, toBcp47 } from '@/config/languages'
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
import { MANAGE_SERVICES, serviceItems } from '@/ui/service-items'
import { styleTile } from '@/ui/appearance/tiles'
import { NoActiveTabError } from '@/shared/messages'
import type { MenuListItem } from '@/ui/controls/MenuList'
import { PREVIEW_TARGET, S, languageLabel, languageName, parseFatal, profileName, reasonText, serviceName } from '@/ui/strings'
import { isPaperAddress, readQuery } from './find'

export type { PackState }
export { MANAGE_SERVICES }
/** The same for the style menu: not a profile, it opens the settings page at the row that holds them */
export const MANAGE_STYLES = '__manage-styles'
/** The same for the prompt menu (the redesign's design, §5.3): every menu whose list the reader can change ends so */
export const MANAGE_PROMPTS = '__manage-prompts'
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
  /** The reader's services whose key the endpoint refused (the service health record, the redesign's design, §4) */
  rejected: readonly string[]
  /**
   * The active tab as far as the popup may know it, once the first ask about its page has settled (null before): its
   * address where the extension may read it — arXiv's pages, by the host permission; null on any other — and whether the
   * popup is still asking a page that has not answered (the content script comes at document_idle). An arXiv paper's
   * page still asked is loading, not P0 (the redesign's design, §5.4)
   */
  tab: { url: string | null; asking: boolean } | null
  /** P0's field (§5.4): what it holds, and the two checks' answer for the paper it names, once both are back */
  find: { query: string; entries: { id: string; html: string | null; pdf: string | null } | null }
}

export interface Row { value: string; replaced?: string }
export interface Entry { label: string; disabled: boolean }
/**
 * A note (§5.2): its words; its icon, the alert for something blocked or stopped and the information for something that
 * goes on; `settings` adds the button that opens the options page
 */
export interface Note { text: string; tone: 'alert' | 'info'; settings: boolean }
/** A menu as the shared menu list draws it (@/ui/controls/MenuList, Part 3): its name, whether it searches, its rows */
export interface MenuView { label: string; search: boolean; items: MenuListItem[] }
/** One of P0's entries for a paper it names: the address it opens, or null where the checks ruled it out */
export interface FoundEntry { label: string; href: string | null }
/** What P0's field recognised (§5.4), drawn under it; null for an empty field, under which the help line stands */
export type Found =
  /** an arXiv PDF or HTML address: one brand row, the way it opens and the paper */
  | { kind: 'open'; format: 'pdf' | 'html'; label: string; paper: string; href: string }
  /** words: arXiv's own search */
  | { kind: 'search'; label: string; href: string }
  /**
   * a paper named by its abstract address, its id or its DOI: its line, and its two entries once both checks are back.
   * `note`'s tone is P17's own (`noHtmlNote`): alert with neither entry offered, info with the PDF entry still working
   */
  | { kind: 'paper'; paper: string; entries: { html: FoundEntry; pdf: FoundEntry } | null; note: Pick<Note, 'text' | 'tone'> | null }
  /** a link that is not an arXiv paper's: said, and Enter does nothing */
  | { kind: 'elsewhere'; text: string }

export interface PopupView {
  /**
   * What the popup is for (the redesign's design, §5): `pending`, nothing heard about the tab yet (the brand row alone);
   * `loading`, an arXiv paper's page that has not answered yet; `find`, no paper (P0); `paper`, the full text (P1–P16);
   * `entry`, an abstract or PDF page (P17); `reader`, the PDF reader open over a PDF (S-P-03c)
   */
  kind: 'pending' | 'loading' | 'find' | 'paper' | 'entry' | 'reader'
  service: Row
  language: Row
  /** Only while the LLM is the chosen service */
  prompt: Row | null
  /** The chosen translation style (S-P-82). Null where styles do nothing or are not shown: the reader, an entry page */
  style: Row | null
  highlight: boolean
  images: boolean
  /** Every menu the view offers, drawn whether open or not; null before the settings are read */
  menus: { service: MenuView; language: MenuView; prompt: MenuView | null; style: MenuView | null } | null
  /** Which of them is open: the popup's own state, where the view has that menu */
  menu: MenuKind | null
  note: Note | null
  failed: string | null
  primary: { label: string; action: 'translate' | 'restore' | 'retranslate' | 'openHtml' | 'readerTranslate' | 'readerOriginal'; disabled: boolean; shortcut?: string }
  /**
   * The primary's other face beside it (P9 / P13, §5.2; the retranslate cue): showing the original. `shortcut` where the
   * key restores while Translate again is offered beside it (the cue): the chip goes on the face the key acts on
   */
  secondary: { label: string; action: 'restore'; shortcut?: string } | null
  /**
   * An abstract or PDF page's two entries, drawn in the primary button's place (the reader's design, §2): the HTML
   * version or the bilingual PDF, the reader's to choose. Null elsewhere
   */
  entries: { html: Entry; pdf: Entry } | null
  /** `disabled`: the modes this page cannot show, greyed with S-P-75 (the PDF reader cannot stack) */
  mode: { value: Mode; note: string | null; disabled?: readonly Mode[] }
  /** P0's field and what it recognised (§5.4); null on every other kind */
  find: { query: string; found: Found | null } | null
}

/**
 * A view of a kind with nothing in it yet. **Computed at call time, not at module load**: this module is imported before
 * `applyLocale`, a constant would freeze the fallback language into it, and a Chinese interface would show one English
 * button (Codex on #161)
 */
const blank = (kind: PopupView['kind']): PopupView => ({
  kind,
  service: { value: '' },
  language: { value: '' },
  prompt: null,
  style: null,
  highlight: true,
  images: true,
  menus: null,
  menu: null,
  note: null,
  failed: null,
  primary: { label: S.primary.translate, action: 'translate', disabled: true },
  secondary: null,
  entries: null,
  mode: { value: DEFAULT_CONFIG.mode, note: null },
  find: null,
})

/** Whether the chosen service can run on its own, decided from the settings (no round trip, no stale chain) */
export function runnable(config: Config, pack: PackState | null, rejected: readonly string[] = []): boolean {
  const own = chosenService(config)
  if (own) return serviceRuns(own) && !rejected.includes(own.id)
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
function cannotRunWhy(config: Config, pack: PackState | null, rejected: readonly string[]): string {
  const own = chosenService(config)
  if (own) return rejected.includes(own.id) ? S.note.llmRejected : S.note.llmNoKey
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

/** Why the chosen service cannot run, and who takes over if one does; null when it can run (the entry pages' views) */
function serviceNote(config: Config, { pack, saved, rejected }: PopupInput): Note | null {
  if (runnable(config, pack, rejected)) return null
  const why = cannotRunWhy(config, pack, rejected)
  return saved?.fallback
    ? { text: S.note.willFallback(why, serviceName(saved.fallback.id, config.services)), tone: 'info', settings: true }
    : { text: S.note.cannotRun(why), tone: 'alert', settings: true }
}

/**
 * Every menu of a view, built from the settings (§5.3): the reader open lists the nine languages it typesets and has no
 * styles; an entry page shows no styles either
 */
function menusOf(config: Config, { pack, rejected }: PopupInput, { reader = false, style = !reader }: { reader?: boolean; style?: boolean } = {}): NonNullable<PopupView['menus']> {
  return {
    service: {
      label: S.rows.service,
      search: false,
      items: serviceItems(config, pack, rejected).map(({ selected, ...item }) => ({ ...item, checked: selected, ...(item.id === MANAGE_SERVICES ? { manage: true as const } : {}) })),
    },
    language: {
      label: S.rows.language,
      search: true,
      // the reader's nine are named in their own languages, and say so (`lang`, round 3); the full list names each in the
      // interface's language with its own after it, one string of two languages, which no single `lang` fits
      items: reader
        ? languageItems(config.targetLanguage).map(({ selected, ...item }) => ({ ...item, checked: selected, lang: toBcp47(item.id) }))
        : LANG_CODES.map(code => ({
            id: code,
            name: languageLabel(code),
            keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_LOCALE_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
            checked: code === config.targetLanguage,
          })),
    },
    prompt: isLlmChosen(config)
      ? {
          label: S.rows.prompt,
          search: false,
          items: [
            ...[...Object.values(BUILT_IN_PROMPTS), ...config.prompts.patterns].map(p => ({ id: p.id, name: p.name, checked: p.id === config.prompts.promptId })),
            // the way to where prompts are managed, as the service and style menus end (§5.3)
            { id: MANAGE_PROMPTS, name: S.rows.managePrompts, checked: false, manage: true as const },
          ],
        }
      : null,
    // Whatever the settings page holds, in its order: the reader's own profiles sit among the built-in ones there, and a
    // second order here would make the same list read as two lists. Each name carries the sample sentence drawn in that
    // style — the names alone ("Muted", "Blurred") do not show what they do. The sample is Chinese (locales/preview.ts)
    // under every interface, and says so on the sample (`lang`, Part 3's MenuList)
    style: style
      ? {
          label: S.rows.style,
          search: false,
          items: [
            ...config.appearance.styles.map(p => ({ id: p.id, name: profileName(p), hint: PREVIEW_TARGET, preview: styleTile(p), lang: 'zh-CN', checked: p.id === config.appearance.activeStyle })),
            // The same position and role as in the service menu: the way in to managing them (S-P-83)
            { id: MANAGE_STYLES, name: S.rows.manageStyles, checked: false, manage: true as const },
          ],
        }
      : null,
  }
}

/** The open menu, where the view has it: a style menu asked for on the reader, a prompt menu once the service is no LLM, are not */
const openOf = (menu: MenuKind | null, menus: NonNullable<PopupView['menus']>): MenuKind | null => (menu !== null && menus[menu] !== null ? menu : null)

/**
 * Why a paper's HTML entry is greyed (S-P-33, S-P-33a), one rule for an entry page and for the paper P0 names: arXiv has
 * no HTML version of it; with no PDF entry either there is nothing to translate, which blocks, else the PDF entry beside
 * it goes on
 */
const noHtmlNote = (pdf: string | null): Pick<Note, 'text' | 'tone'> => (pdf === null ? { text: S.note.noHtml, tone: 'alert' } : { text: S.note.noHtmlVersion, tone: 'info' })

/**
 * The popup on the two pages that are not the full text (UI.md S-P-03b, the maintainer 2026-09-18: “whatever the
 * reader opened — abs, PDF or HTML — the popup is something they can click”): the group, a note, and the two entries
 * (§5.5). **The entries are disabled, not hidden, when they cannot act**: a reader who came for the translation is told
 * the answer instead of finding a control that does nothing. The display, the switches and the style belong to a
 * translated page, and are hidden here
 */
function entryView(entry: EntryStatus, config: Config, input: PopupInput): PopupView {
  const { pack, saved, rejected } = input
  const canRun = runnable(config, pack, rejected)
  // The rule that starts a translation on the full text (`pageDecision`): the chosen service, or the free one that
  // takes over from it. The page this button opens starts by that rule, so the button must not refuse what the page
  // would do (Devin on #247: with a fallback the full text's button was enabled and this one was not)
  const canStart = canRun || !!saved?.fallback
  const named = (id: string) => serviceName(id, config.services)
  const noHtml = entry.html === null
  const menus = menusOf(config, input, { style: false })
  return {
    kind: 'entry',
    service: { value: named(config.provider) },
    language: { value: languageName(config.targetLanguage) },
    prompt: isLlmChosen(config) ? { value: promptName(config) } : null,
    style: null,
    highlight: config.reading.sentenceHighlight,
    images: config.image.enabled,
    menus,
    menu: openOf(input.menu, menus),
    // The service's note first: it is why both entries are greyed, or who takes over. Then the HTML version's, which
    // says "nothing to translate" only when the PDF entry is not offered either (Part 5's final review)
    note: serviceNote(config, input) ?? (noHtml ? { ...noHtmlNote(entry.pdf), settings: false } : null),
    failed: null,
    // not drawn: the entries below are (S-P-50b); kept as the HTML entry, the action a page's own button would take
    primary: { label: S.entry.html, action: 'openHtml', disabled: noHtml || !canStart },
    secondary: null,
    // a paper that cannot be had as a bilingual PDF greys its entry without words (§1's rule); either entry opens a page
    // that translates by the same rule as the full text's button (Devin on #247)
    entries: { html: { label: S.entry.html, disabled: noHtml || !canStart }, pdf: { label: S.entry.pdf, disabled: entry.pdf === null || !canStart } },
    mode: { value: config.mode, note: null },
    find: null,
  }
}

/**
 * The popup while the PDF reader is laid over a PDF page (the reader's design, §9.2): it acts on the reader through the
 * settings alone, which the reader follows. The rows are the ordinary ones, the language menu holds the nine the reader
 * typesets, stacked is greyed (a stored stacked shows as side by side, what the reader shows), the primary shows the
 * original or the translation, and there is no style: styles do nothing on a typeset PDF
 */
function readerView(entry: EntryStatus, config: Config, input: PopupInput): PopupView {
  const base = entryView(entry, config, input)
  const original = config.pdfReader.original
  const held = entry.pdf === null || !READER_LANGUAGES.includes(config.targetLanguage)
  const menus = menusOf(config, input, { reader: true })
  return {
    ...base,
    kind: 'reader',
    menus,
    menu: openOf(input.menu, menus),
    // the note of a service that cannot run; the HTML version's is not this page's matter
    note: serviceNote(config, input),
    // the reader holds the original for a paper with no source and a language it does not typeset: the switch would
    // change nothing on screen, so it is greyed, without words, as the PDF entry is (Codex on #301)
    primary: original
      ? { label: S.primary.translate, action: 'readerTranslate', disabled: held }
      : { label: S.primary.restore, action: 'readerOriginal', disabled: held },
    entries: null,
    mode: { value: config.mode === 'stack' ? 'side' : config.mode, note: null, disabled: ['stack'] },
  }
}

/** P0's field and what it recognises (§5.4): the words of the row under it, and a paper's entries once both checks are back */
function findView(input: PopupInput): NonNullable<PopupView['find']> {
  const { query, entries } = input.find
  const read = readQuery(query)
  switch (read.kind) {
    case 'empty':
      return { query, found: null }
    case 'open':
      return { query, found: { kind: 'open', format: read.format, label: S.entry[read.format], paper: S.find.paper(read.id), href: read.href } }
    case 'search':
      return { query, found: { kind: 'search', label: S.find.search(read.query), href: read.href } }
    case 'elsewhere':
      return { query, found: { kind: 'elsewhere', text: S.find.elsewhere } }
    case 'paper': {
      const answer = entries?.id === read.id ? entries : null
      // The same two entries as P17's (the design's §5.4): greyed by the two checks arXiv answers AND by whether the
      // chosen service can even start — nothing here would then open a translation bound to fail (the config unread
      // yet, at P0, is no reason to grey what the checks already cleared)
      const { config, pack, saved, rejected } = input
      const canStart = config === null || runnable(config, pack, rejected) || !!saved?.fallback
      return {
        query,
        found: {
          kind: 'paper',
          paper: S.find.paper(read.id),
          entries: answer && {
            html: { label: S.entry.html, href: canStart ? answer.html : null },
            pdf: { label: S.entry.pdf, href: canStart ? answer.pdf : null },
          },
          // a greyed entry says why as P17's does (S-P-50b): the HTML version's absence, in full when there is no PDF either
          note: answer?.html === null ? noHtmlNote(answer.pdf) : null,
        },
      }
    }
  }
}

/** No full text and no entry page (§5.4): nothing heard yet; an arXiv paper's page not answering while the popup asks; or P0 */
function noPaper(input: PopupInput): PopupView {
  const { tab } = input
  if (tab === null) return blank('pending')
  if (tab.asking && tab.url !== null && isPaperAddress(tab.url)) return blank('loading')
  return { ...blank('find'), find: findView(input) }
}

export function derivePopupView(input: PopupInput): PopupView {
  const { page, saved, session, config, pack, shortcut, savedRevision, entry, rejected } = input
  // An abstract or PDF page, or the reader open, that has already answered (`entry != null`) is never P0's search —
  // whatever the tab poll still says (Opus's review of Task 33) — but with the settings not read yet there is
  // nothing to build either view from: loading, not the paper's own screen and not P0's (item 4)
  if (page == null && entry?.readerOpen) return config === null ? blank('loading') : readerView(entry, config, input)
  // `== null` on purpose: a tab whose content script ignores `axt:page-status` resolves `undefined` rather than
  // rejecting, and an undefined page is no page (it once rendered an empty popup on every PDF page)
  if (page == null && entry != null) return config === null ? blank('loading') : entryView(entry, config, input)
  if (page == null) return noPaper(input)
  if (config === null) return { ...blank('paper'), mode: { value: page.preference, note: null } }

  const progress = page.progress
  const on = progress.state === 'on'
  const paused = progress.state === 'stopped' && progress.fatal !== undefined
  const canRun = runnable(config, pack, rejected)
  const demoted = on ? session?.engine.demoted : undefined
  // The page runs on settings other than the saved ones. A change made here restarts the page at
  // once (data.ts), so this is what is left: a choice that cannot start, and a change made from
  // another tab, which leaves this page pinned to the session it began (Codex on #157). Either way
  // the reader is offered “Translate again” — enabled when the saved settings can actually run. The rule is
  // the toggle's too (shared/page-action.ts): the page's revision against the saved settings' digest
  const decision = pageDecision(page, { revision: savedRevision, canRun, fallback: !!saved?.fallback }) ?? { action: 'translate' as const, behind: false, enabled: canRun || !!saved?.fallback }
  const { action, behind } = decision
  const named = (id: string) => serviceName(id, config.services)
  // The retranslate cue (the branch's final review): the page runs on the free service since its chosen one's key was
  // refused, and that key has been made good — the record holds the service no more, and the chain a start would run on
  // runs it again. The saved chain is the test: a 403 is `auth` too and never recorded (background/health-guard.ts marks
  // a 401 alone), and while the chain in force
  // still passes the service over, a start would meet the same refusal. The page is offered its way back as P13 offers
  // it (the design gives the cue no words of its own: P13's pair, as it is), and P6's note, whose reason no longer
  // holds, goes. The key still restores (shared/page-action.ts decides for every door), so its chip goes on Show original.
  // `session.engine.demoted` is only the most recent hand-over (transport.ts): a transient failure of the free engine
  // that took over — one more hand-over, on top of the key's — would hide the key's refusal here, and the cue would
  // never show even once the key is good again (Opus's review of Task 33). `demotions` holds every hand-over still in
  // force, by engine; the chosen engine's own is the one the cue reads, whichever position it is in
  const refused = on ? session?.demotions.find(d => d.kind === 'auth' && d.id === session.providerId) : undefined
  const madeGood = !!refused && !!session && !rejected.includes(refused.id) && saved?.engine.id === refused.id && !saved.engine.demoted

  const service: Row = demoted && session
    ? { value: named(session.engine.id), replaced: named(demoted.id) }
    : { value: named(config.provider) }
  const language: Row = { value: languageName(config.targetLanguage) }
  // The prompt decides how an LLM translates; the free services do not read it
  const prompt: Row | null = isLlmChosen(config) ? { value: promptName(config) } : null
  // How the translation looks. The page applies a change straight away, so this needs no restart
  const style: Row = { value: profileName(activeStyle(config.appearance)) }

  const note: Note | null = paused ? { text: S.note.paused(reasonText(parseFatal(progress.fatal ?? '').kind)), tone: 'alert', settings: true }
    : demoted && session && !madeGood ? { text: S.note.replaced(named(demoted.id), reasonText(demoted.kind), named(session.engine.id)), tone: 'info', settings: true }
    : page.images?.fatal ? { text: S.note.imagesPaused(reasonText(parseFatal(page.images.fatal).kind)), tone: 'alert', settings: true }
    : !canRun && (!on || behind)
      ? !on && saved?.fallback
        ? { text: S.note.willFallback(cannotRunWhy(config, pack, rejected), named(saved.fallback.id)), tone: 'info', settings: true }
        : { text: S.note.cannotRun(cannotRunWhy(config, pack, rejected)), tone: 'alert', settings: true }
      : null

  const failedCount = progress.failed + (page.images?.failed ?? 0)
  const failed = failedCount > 0 && progress.state !== 'idle' && !progress.fatal && !page.images?.fatal ? S.failed.text(failedCount) : null

  // On every action the key actually performs, “Show original” included: ⌥T translates a page that is not
  // translated and restores one that is, so the badge belongs on both faces of the same button
  // (user 2026-09-11). A paused session retries rather than restores, which is what its label says
  const key = shortcut ?? undefined
  let primary: PopupView['primary']
  let secondary: PopupView['secondary']
  // behind the settings as well (the key changed, say), the ordinary faces already offer Translate again, and the key does it
  if (madeGood && !behind) {
    primary = { label: S.primary.retranslate, action: 'retranslate', disabled: !canRun }
    secondary = { label: S.primary.restore, action: 'restore', ...(key ? { shortcut: key } : {}) }
  } else {
    primary = { label: action === 'restore' ? S.primary.restore : action === 'retranslate' ? S.primary.retranslate : S.primary.translate, action, disabled: !decision.enabled }
    if (!primary.disabled && key) primary.shortcut = key
    secondary = behind || paused ? { label: S.primary.restore, action: 'restore' } : null
  }
  const menus = menusOf(config, input)

  return {
    kind: 'paper',
    service,
    language,
    prompt,
    style,
    highlight: config.reading.sentenceHighlight,
    images: config.image.enabled,
    menus,
    menu: openOf(input.menu, menus),
    note,
    failed,
    primary,
    secondary,
    entries: null,
    mode: { value: page.preference, note: page.mode !== page.preference ? S.mode.narrow : null },
    find: null,
  }
}

function promptName(config: Config): string {
  const id = config.prompts.promptId
  return BUILT_IN_PROMPTS[id]?.name ?? config.prompts.patterns.find(p => p.id === id)?.name ?? id
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
