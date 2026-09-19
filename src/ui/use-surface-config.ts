// A surface's React binding to its configuration (shared/surface-config.ts): the few lines the popup and the settings
// page share. What the module needs from a page painted by React — which locale it was painted in, how to reload it —
// is given here; what differs between the two (what holds a reload back, what follows a landing) comes from the caller.
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Config } from '@/config/schema'
import { pickLocale } from '@/locales'
import { type SurfaceConfig, type SurfaceConfigDeps, type SurfaceConfigState, createSurfaceConfig } from '@/shared/surface-config'
import { browserLanguages } from './apply-locale'
import { localeInUse } from './strings'

/** The stored interface language resolves to another pack than the one in use (chosen once, before the first paint) */
export const localeStale = (config: Config) => pickLocale(config.uiLanguage, browserLanguages()) !== localeInUse()

/** `deps` are read once, at the first render: what they call may change, the functions themselves must not need to */
export function useSurfaceConfig(deps: Pick<SurfaceConfigDeps, 'holds' | 'onLanded'> = {}): { surface: SurfaceConfig; state: SurfaceConfigState } {
  const [surface] = useState(() => createSurfaceConfig({ localeStale, reload: () => location.reload(), ...deps }))
  // Started in an effect and stopped by its clean-up, so a strict-mode remount follows the configuration once
  useEffect(() => surface.start(), [surface])
  return { surface, state: useSyncExternalStore(surface.subscribe, surface.state) }
}
