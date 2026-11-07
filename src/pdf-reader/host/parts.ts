// What the extension's page gives the reader's chrome (packages/reader chrome/parts.tsx): the first read of the settings as the
// one preference model, and the chrome's parts: the extension's slots, its target languages, its failures' words (a key's
// reason is the key's only where the service chosen carries one, #88 E5), its settings page, its defaults, the probes' hook.
import type { Parts, Prefs, ReaderController } from '@readarxiv/reader'
import { DEFAULT_CONFIG } from '@/config/schema'
import type { ConfigReading } from '@/config/storage'
import { reasonText } from '@/ui/strings'
import { chromeLanguages } from './languages'
import { settingsUrl } from './links'
import { prefsOf } from './prefs'
import { type ConfigStore, extensionSlots } from './slots'
import { probeController } from './today'

/** the page's own first read, bounded (ui/first-read.ts): none in its time, or one that fell back, is unreadable (S-R-21) */
export function firstOf(reading: ConfigReading | null): { prefs: Prefs | null; unreadable: boolean } {
  return { prefs: reading ? prefsOf(reading.config) : null, unreadable: !reading || reading.fallbackReason !== null }
}

export const DEFAULT_PREFS = (): Prefs => prefsOf(DEFAULT_CONFIG)

export function extensionParts(o: { controller: ReaderController; store: ConfigStore; embedded: boolean; probe?: (w: { controller: ReaderController; session: unknown }) => void }): Parts {
  const { controller, store } = o
  return {
    slots: extensionSlots({ controller, store, embedded: o.embedded }),
    languages: chromeLanguages(),
    reason: kind => reasonText(kind, store.state().config?.provider),
    settingsHref: settingsUrl(),
    defaults: DEFAULT_PREFS(),
    // the probes' contract (the e2e's, the lab's spikes): the controller as it was, its state with the extension's settings
    probe: (c, session) => o.probe?.({ controller: probeController(c, store), session }),
  }
}
