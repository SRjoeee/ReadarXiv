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
  /** the paragraphs translated so far of the paper's: the count drawn as a part of its own where it stands in the sentence */
  translating?: (got: number, total: number) => string
  /** our server's document followed, its stream lost and asked again */
  reconnecting?: string
  /** the paper cannot be had as a bilingual PDF (R.status.noPdf) */
  noPdf?: string
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
  /** the card where the original could not be read (the host's `reason` of the network) */
  originalLost?: string
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
   *  the paper side by side was narrowed while reading */
  narrow?: 'told' | 'shown'
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
