// The reader's settings are the extension's (the reader's design, §3, §9.1): these say which display they ask for,
// what a display chosen in the reader writes back, and whether figure text shows in a display
import type { Config } from '@/config/schema'
import type { Landing } from '@/shared/surface-config'
import type { EngineDisplay } from './engine/session.mjs'

/** the display the settings ask for: the HTML page's mode, unless the reader was last left on the original alone */
export function displayOf(config: Config): EngineDisplay {
  if (config.pdfReader.original) return 'original'
  return config.mode === 'only' ? 'translation' : 'bilingual'
}

/** the HTML page's mode a translated display stands for: stacked stays stacked, a side-by-side choice already */
function modeOf(config: Config, display: Exclude<EngineDisplay, 'original'>): Config['mode'] {
  if (display === 'translation') return 'only'
  return config.mode === 'stack' ? 'stack' : 'side'
}

/** the settings a display chosen in the reader writes: the original is marked; a translated display is the mode */
export function withDisplay(config: Config, display: EngineDisplay): Config {
  if (display === 'original') return { ...config, pdfReader: { ...config.pdfReader, original: true } }
  return { ...config, mode: modeOf(config, display), pdfReader: { ...config.pdfReader, original: false } }
}

/** figure text in a display: the switch on, and the display's mode among the modes ticked (as on the HTML page) */
export function figuresShown(config: Config, display: EngineDisplay): boolean {
  if (display === 'original' || !config.image.enabled) return false
  return config.image.modes.includes(modeOf(config, display))
}

export interface Follow {
  /** start the page again: a new target language once a translation has started (another document, from the source) */
  reload: boolean
  /** the display to show, or null to keep the one on screen */
  display: EngineDisplay | null
  /** the sync mode to apply, or null to keep the one in effect */
  sync: 'same' | 'off' | null
}

/**
 * What a landing of the settings changes in the reader (the reader's design, §9.1; Part 2's final review): only what
 * changed between the settings before and after it. Nothing on a refused write: it lands the defaults, which the
 * reader's own choices on screen outlive (and whose target language is no new language). A display the address names,
 * or one this visit holds, stays; so does a sync mode the address names, or a probe's mode other than the switch's two
 */
export function followOf(
  prev: Config,
  next: Config,
  from: Landing,
  at: { translating: boolean; addressDisplay: boolean; addressSync: boolean; held: boolean; display: EngineDisplay; syncMode: string },
): Follow {
  const none: Follow = { reload: false, display: null, sync: null }
  if (from === 'refused' || from === 'first') return none
  if (at.translating && next.targetLanguage !== prev.targetLanguage) return { ...none, reload: true }
  const wanted = displayOf(next)
  const display = !at.addressDisplay && !at.held && wanted !== displayOf(prev) && wanted !== at.display ? wanted : null
  const sync = next.pdfReader.sync ? 'same' : 'off'
  const switchable = at.syncMode === 'same' || at.syncMode === 'off'
  return { reload: false, display, sync: !at.addressSync && switchable && next.pdfReader.sync !== prev.pdfReader.sync && sync !== at.syncMode ? sync : null }
}
