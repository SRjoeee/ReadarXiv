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

/** a write: a patch, never a whole object; the classes and the highlight by the fields it names */
export type PrefsPatch = Partial<Omit<WritablePrefs, 'classes' | 'highlight'>> & {
  classes?: Partial<WritablePrefs['classes']>
  highlight?: Partial<WritablePrefs['highlight']>
}

/** a highlight band: its colour, its strength over the page (`opacity`, the share of its colour in the wash, as the hosts' stores
 *  keep it: the extension's highlight profile, the website's band) and its name, null for a built-in band, which the reader names */
export interface Band {
  id: string
  colour: string
  opacity: number
  name: string | null
}

export interface Prefs extends WritablePrefs {
  /** the highlight's bands the visitor may pick */
  readonly bands: readonly Band[]
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

/** a band's strength, at least and at most (the extension's settings schema clamps a profile's opacity so, as today's look
 *  sheet did: src/core/renderer/style-preset.ts appearanceRule) */
const BAND_MIN = 0.05,
  BAND_MAX = 0.6
/**
 * The highlight's paint, the band chosen (`highlight.band` among `bands`; the first where it names none of them, as today's
 * `activeHighlight`): its colour and its strength as the wash's two variables, which the reader's sheet reads for every band it
 * lights, a sentence's or a whole unit's, on a page light, dark or dimmed (styles.ts `.axt-hl`); the strength a whole percentage,
 * clamped. A band of no colour (the extension's `''`) is the sheet's green at its strength. Null where the host gives no band:
 * the sheet's own green at 22 %
 */
export function bandPaint(
  p: Pick<Prefs, 'bands' | 'highlight'>,
): { '--axt-hl-color'?: string; '--axt-hl-mix': string } | null {
  const band = p.bands.find((b) => b.id === p.highlight.band) ?? p.bands[0]
  if (!band) return null
  const strength = Number.isFinite(band.opacity) ? band.opacity : 0.22
  const mix = Math.round(Math.min(BAND_MAX, Math.max(BAND_MIN, strength)) * 100)
  return { ...(band.colour ? { '--axt-hl-color': band.colour } : {}), '--axt-hl-mix': `${mix}%` }
}
