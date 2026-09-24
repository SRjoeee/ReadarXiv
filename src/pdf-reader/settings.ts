// The reader's settings are the extension's (the reader's design, §3, §9.1): these say which display they ask for,
// what a display chosen in the reader writes back, and whether figure text shows in a display
import type { Config } from '@/config/schema'
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
