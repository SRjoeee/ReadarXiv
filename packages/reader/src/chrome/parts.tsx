// What a host gives the chrome besides its session (interfaces/host design-a §1.1 Slots): its own controls in their approved
// places, and the words that are its own. The extension's service menu goes before the reading options, its download, settings
// and way back after them (in the bar, and as the reading options' first rows in a narrow window); its "open the settings"
// stands under a failure's card. The target languages are named by the host's own tables (the extension's are ported from
// another project and stay in it), and a failure's reason is worded by the host, which knows whether its translator has a key.
import { createContext, type ReactNode, useContext } from 'react'
import { LOCALES, localeInUse, type ProviderErrorKind } from '@readarxiv/ui'
import { DEFAULTS, type Prefs } from '../prefs.ts'

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
  lead?: ReactNode
  beforeOptions?: (at: 'bar' | 'options') => ReactNode
  afterOptions?: (at: 'bar' | 'options') => ReactNode
  options?: ReactNode
  /** the action under a failure's card whose remedy is the host's (a key: its settings) */
  card?: (action: 'settings') => ReactNode
}
export interface Parts {
  slots: Slots
  languages: Languages
  /** a failure's reason as a sentence */
  reason(kind: ProviderErrorKind): string
  /** where the host's settings are, for the capsule's way there while they cannot be read (S-R-21); none: no link */
  settingsHref: string | null
  /** the preferences shown, greyed, until the host's land */
  defaults: Prefs
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
