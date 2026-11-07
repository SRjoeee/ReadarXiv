// What a host gives the chrome besides its session (interfaces/host design-a §1.1 Slots): its own controls in their approved
// places, and the words that are its own. The extension's service menu goes before the reading options, its download, settings
// and way back after them (in the bar, and as the reading options' first rows in a narrow window); its "open the settings"
// stands under a failure's card. The target languages are named by the host's own tables (the extension's are ported from
// another project and stay in it), and a failure's reason is worded by the host, which knows whether its translator has a key.
import { createContext, type ReactNode, useContext } from 'react'
import { LOCALES, localeInUse, type ProviderErrorKind } from '@readarxiv/ui'
import { DEFAULTS, type Prefs } from '../prefs.ts'
import type { ReaderController, Session } from './model.ts'

export interface LanguageItem {
  id: string
  name: string
  keywords: string
  selected: boolean
}
export interface Languages {
  /** a target as the reader names it wherever it shows one: by its own name */
  name(target: string): string
  /** the tag its name is written in */
  tag(target: string): string
  /** the menu's rows, `current` selected */
  items(current: string): readonly LanguageItem[]
}
export interface Slots {
  /** first in the bar's lead, before the contents' button: the website's way home */
  lead?: ReactNode
  /** last in the bar's lead, right after the paper's title (its next sibling): the website's short link to arXiv, which its
   *  sheet shows where the lead cannot hold the id */
  afterTitle?: ReactNode
  beforeOptions?: (at: 'bar' | 'options') => ReactNode
  afterOptions?: (at: 'bar' | 'options') => ReactNode
  /** the reading options' last rows: the website's interface language */
  options?: ReactNode
  /** the action under a failure's card whose remedy is the host's (a key: its settings) */
  card?: (action: 'settings') => ReactNode
}
/**
 * A host's words for the states the status capsule and the failure cards show, each in place of the catalogue's (the
 * website's own sentences: its words today): one override typed by state, never a second catalogue; a state the host does
 * not word keeps the catalogue's. A run under way (queued, preparing, translating, reconnecting) has no sentence of the
 * catalogue's (the progress line under the bar shows it, the extension's approved look): where a host words it, the capsule
 * says it too, with the spinner. A function is given what the state holds (a place in the queue, a count, the time a retry
 * is due, ms since the epoch) and is asked again as it changes
 */
export interface StateWords {
  /** the paper waiting in our server's queue, at its place */
  queued?: (position: number) => string
  /** the paper's layer being made */
  preparing?: string
  /** the paragraphs translated so far of the paper's: the count drawn as a part of its own where it stands in the sentence.
   *  `chip`: `showTranslation` stands beside it (the website's says the bare stage there in a window too narrow for both) */
  translating?: (got: number, total: number, chip?: boolean) => string
  /** our server's document followed, its stream lost and asked again */
  reconnecting?: string
  /** the run's chip that shows the translation (the reader's own choice of a display), where the translation is not on screen
   *  and some of it is there to be read: the original's display, or the original held while the paper is made (the
   *  website's "show translation"); none, no chip */
  showTranslation?: string
  /** the paper cannot be had as a bilingual PDF (R.status.noPdf) */
  noPdf?: string
  /** the link offered beside a bilingual version not to be had, given arXiv's HTML version of the paper with the hash that
   *  translates it: its address and its words (the website's: arXiv's HTML version where the extension is on the page, its
   *  store page where it is not), or null for none (a phone, where the extension cannot be had); none:
   *  the HTML version, R.status.useHtml */
  htmlLink?: (href: string) => { href: string; label: string } | null
  /** the paper too large to prepare (R.status.noPdf) */
  tooLarge?: string
  /** our server out of reach for now (R.status.notNow) */
  notNow?: (retryAt: number | null) => string
  /** our server busy for now (R.status.limited) */
  busy?: (retryAt: number | null) => string
  /** at the limit of new papers (R.status.limited) */
  limited?: (retryAt: number | null) => string
  /** a target the typesetter does not set, named by its own name (R.status.unsupported) */
  unsupported?: (language: string) => string
  /** passages that failed (S.failed.text) */
  failedPassages?: (n: number) => string
  /** the narrow window's translation alone (R.status.narrow) */
  narrow?: string
  /** the settings not read, the defaults in use (R.status.unreadable) */
  unreadable?: string
  /** a write of the settings refused (O.saveFailed) */
  saveFailed?: string
  /** the card of a run that translated nothing, by the chain's kind (the host's `reason`; R.status.rateLimited for a limit) */
  failed?: (kind: ProviderErrorKind) => string
  /** that card's lines under its reason, each a line of its own (the website's: when a retry can work, while its time is to
   *  come; the limit's note), given the kind and the time a retry is due (null: none named); none, or null: no line */
  cardLines?: (kind: ProviderErrorKind, retryAt: number | null) => { sub?: string | null; note?: string | null }
  /** the card where the original could not be read (the host's `reason` of the network) */
  originalLost?: string
  /** the way to arXiv's PDF of the paper where the original could not be read: given, the loss is the original's pane's card
   *  (the file sign in quiet ink, `originalLost` its words, this its link, in a new tab or this one as the settings say), the
   *  translation's pane left as it is (the website's); none, the translation's pane's card with a retry (the extension's) */
  openOriginal?: string
  /** the card of an address that names no paper (R.status.noPaper) */
  noPaper?: string
}

export interface Parts {
  slots: Slots
  languages: Languages
  /** the host's words for the capsule's and the cards' states; none: the catalogue's */
  words?: StateWords
  /** the narrow window's rule, where side by side shows the translation alone (interfaces/host design-a §6, one of the
   *  host-divergent behaviours): `told` (the extension's, the default) keeps side by side chosen on the display switch and
   *  says so in the capsule (S-R-14); `shown` (the website's: its owner's rule of 2026-11-03) shows the translation chosen
   *  with side by side greyed (the stored side by side kept for a wider window), and says so only where a window that showed
   *  the paper side by side was narrowed while reading; and while the paper is made (prepared, translated after its prepare,
   *  or refused for now with nothing laid) it holds the original on screen until the reader chooses a display */
  narrow?: 'told' | 'shown'
  /** the signs the capsule and the cards are drawn with: `plain` (the extension's, the default) the information sign for every
   *  state but a run's spinner and a toast's own, the alert for every card; `by-state` (the website's: the interface review of
   *  2026-11-03) a clock while a retry's time is to come and the information sign once it has come, the alert in the danger's
   *  red for a failure, in the capsule as on its card, and a card that waits (our server or the service out of reach for
   *  now, a limit) a clock in quiet ink */
  signs?: 'plain' | 'by-state'
  /** when a retry is offered where its time is named (a refusal for now, a rows' wait): `at-once` (the extension's, the default)
   *  at once, a press before the time asking nothing; `when-due` (the website's) at its time: the capsule's chip absent until
   *  then, the card's greyed (still a stop of the keyboard's, pressing it doing nothing), the chrome drawn again at the time */
  retry?: 'at-once' | 'when-due'
  /** a refusal for now with nothing laid (our server out of reach, busy, a limit): `kept` (the extension's, the default) keeps
   *  the display chosen, arXiv's pages where the translation would be, the switch whole; `original` (the website's) shows the
   *  original alone (held for now, never written) with the translated displays greyed, until the refusal passes */
  refusal?: 'kept' | 'original'
  /** when the sync's switch can be pressed: `side-by-side` (the extension's, the default) wherever both sides are shown;
   *  `located` (the website's) there only once the sides can scroll together (both sides' pages laid out), greyed until then */
  sync?: 'side-by-side' | 'located'
  /** a failure's reason as a sentence */
  reason(kind: ProviderErrorKind): string
  /** where the host's settings are, for the capsule's way there while they cannot be read (S-R-21); none: no link */
  settingsHref: string | null
  /** the preferences shown, greyed, until the host's land */
  defaults: Prefs
  /** the host's probe hooks, given the controller and the session once it is open (the extension's `window.__reader`) */
  probe?: (controller: ReaderController, session: Session) => void
}

const own = (t: string) => t
export const PARTS: Parts = {
  slots: {},
  languages: { name: own, tag: own, items: () => [] },
  reason: (kind) => LOCALES[localeInUse()].REASON[kind],
  settingsHref: null,
  defaults: DEFAULTS,
}
const Context = createContext<Parts>(PARTS)
export const PartsProvider = Context.Provider
export const useParts = (): Parts => useContext(Context)
