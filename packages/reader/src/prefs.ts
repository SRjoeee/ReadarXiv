// The visitor's preferences, one shape in both hosts (interfaces/host design-a §1.1): what the reader reads, writes as a
// patch and watches through `host.prefs`. Each host maps its own store to it; neither store changes (the extension's saved
// configuration keeps its schema: its adapter maps `mode` + `pdfReader.*`, the website keeps its `axt.*` keys).

export type Display = 'original' | 'bilingual' | 'translation'
export const CLASSES = ['figures', 'tables', 'heads', 'references', 'names'] as const
export type ClassName = (typeof CLASSES)[number]
export type UiLanguage = 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'en'

export interface WritablePrefs {
  display: Display
  /** the target language, a tag the host names (BCP 47); a tag the reader does not set leaves the original shown */
  target: string
  sync: boolean
  /** what the reader translates on a laid page (the reading options' "What to translate") */
  classes: Readonly<Record<ClassName, boolean>>
  theme: 'system' | 'light' | 'dark'
  swapped: boolean
  dim: boolean
  /** the sentence highlight, and the band it is drawn in (an id of `bands`) */
  highlight: { on: boolean; band: string }
  /** the interface's language: the chrome's words from `ui`'s catalogue */
  ui: UiLanguage
}

export interface Prefs extends WritablePrefs {
  /** the highlight's bands the visitor may pick: `name` null for a built-in band, which the reader names */
  readonly bands: readonly { id: string; colour: string; name: string | null }[]
  /** where the reader's own links open */
  readonly links: 'new-tab' | 'same-tab'
  /** who translates here, opaque; a change asks again what failed. The website's: null */
  readonly translator: string | null
}

export const DEFAULTS: Prefs = {
  display: 'bilingual',
  target: 'zh-Hans',
  sync: true,
  classes: { figures: true, tables: true, heads: true, references: false, names: false },
  theme: 'system',
  swapped: false,
  dim: true,
  highlight: { on: true, band: 'soft-green' },
  ui: 'en',
  bands: [],
  links: 'new-tab',
  translator: null,
}
