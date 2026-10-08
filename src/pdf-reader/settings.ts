// The reader's settings are the extension's (the reader's design, §3, §9.1): these say which display they ask for,
// what a display chosen in the reader writes back, and whether figure text shows in a display
import { chainConfigChanged } from '@/config/revision'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { ConfigReading, FallbackReason } from '@/config/storage'
import type { Landing, SurfaceConfig } from '@/shared/surface-config'
import type { EngineDisplay } from './engine/session.mjs'

/**
 * The session's first configuration, which is never waited on for ever. The page has already read the settings once
 * before its first paint, bounded (`reading`, ui/first-read.ts), and the session starts on that reading at once — its
 * configuration, and its reason where it fell back — while the surface goes on reading behind it: the landing that comes
 * is followed as any change of the settings is (session.mjs `landed`). A second read that stalls or is refused, which
 * the surface answers with nothing at all, costs the PDF nothing, and says nothing against settings that were read.
 * Without a reading (`null`: the page's read did not answer in its time; `undefined`: a host that made none), the
 * surface's landing is waited for — not at all for `null`, whose time is spent, and for the clock `giveUp` otherwise —
 * and the defaults stand in if it has not come, said to be provisional. A configuration that landed is never thrown away
 */
export async function firstConfig(
  surface: Pick<SurfaceConfig, 'state' | 'subscribe' | 'start'>,
  reading: ConfigReading | null | undefined,
  giveUp: Promise<void>,
): Promise<{ config: Config; provisional: { why: FallbackReason | null } | null }> {
  const landing = new Promise<void>(resolve => { const off = surface.subscribe(() => { if (surface.state().config) { off(); resolve() } }); surface.start() })
  if (reading && !surface.state().config) return { config: reading.config, provisional: { why: reading.fallbackReason } }
  await Promise.race([landing, reading === null ? Promise.resolve() : giveUp])
  const config = surface.state().config
  return config ? { config, provisional: null } : { config: DEFAULT_CONFIG, provisional: { why: { kind: 'unknown' } } }
}

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

/** figure text in a display: every translated display, while the switch is on (the redesign's design, §4) */
export function figuresShown(config: Config, display: EngineDisplay): boolean {
  return display !== 'original' && config.image.enabled
}

export interface Follow {
  /** start the page again: a new target language once a translation has started (another document, from the source) */
  reload: boolean
  /** the display to show, or null to keep the one on screen */
  display: EngineDisplay | null
  /** the sync mode to apply, or null to keep the one in effect */
  sync: 'same' | 'off' | null
  /** run a translation that stopped short again, in place: the services changed (Part 4) */
  retry: boolean
}

/**
 * What a landing of the settings changes in the reader (the reader's design, §9.1; Part 2's final review): only what
 * changed between the settings before and after it. Nothing on a refused write: it lands the defaults, which the
 * reader's own choices on screen outlive (and whose target language is no new language). A display the address names
 * stays; so does a sync mode the address names, or a probe's mode other than the switch's two
 */
export function followOf(
  prev: Config,
  next: Config,
  from: Landing,
  /** held: the original, held for the visit, since its paper or its language cannot be had as a bilingual PDF;
   *  stopped: the last translation stopped short, and a retry can mend it */
  at: { translating: boolean; held: boolean; stopped: boolean; addressDisplay: boolean; addressSync: boolean; display: EngineDisplay; syncMode: string },
): Follow {
  const none: Follow = { reload: false, display: null, sync: null, retry: false }
  if (from === 'refused' || from === 'first') return none
  if (at.translating && next.targetLanguage !== prev.targetLanguage) return { ...none, reload: true }
  const wanted = displayOf(next)
  const display = !at.addressDisplay && !at.held && wanted !== displayOf(prev) && wanted !== at.display ? wanted : null
  const sync = next.pdfReader.sync ? 'same' : 'off'
  const switchable = at.syncMode === 'same' || at.syncMode === 'off'
  return {
    reload: false,
    display,
    sync: !at.addressSync && switchable && next.pdfReader.sync !== prev.pdfReader.sync && sync !== at.syncMode ? sync : null,
    // a translation that stopped short runs again once the services change: most often the key the card sent the
    // reader to set (the reader's design, §8)
    retry: at.stopped && chainConfigChanged(prev, next),
  }
}
