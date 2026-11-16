// The extension's page's parts of the reader's chrome (src/pdf-reader/host/parts.ts): the first read as the one preference
// model, a failure's words by the service chosen, the probes' hook
import { describe, expect, it, vi } from 'vitest'
import { createController, DEFAULTS, INITIAL, type ReaderController } from '@readarxiv/reader'
import { LOCALES } from '@readarxiv/ui'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { DEFAULT_PREFS, extensionParts, firstOf, probeController } from '@/pdf-reader/host/parts'
import { prefsOf } from '@/pdf-reader/host/prefs'
import { surfaceStore } from '@/pdf-reader/host/v2'
import type { PackState } from '@/shared/pack'
import type { SurfaceConfig, SurfaceConfigState } from '@/shared/surface-config'

describe('the extension page\'s parts of the chrome', () => {
  it('the first read: none in its time, or one that fell back, is unreadable; a read is the one model', () => {
    expect(firstOf(null)).toEqual({ prefs: null, unreadable: true })
    expect(firstOf({ config: DEFAULT_CONFIG, fallbackReason: { kind: 'unknown' } } as never)).toEqual({ prefs: prefsOf(DEFAULT_CONFIG), unreadable: true })
    expect(firstOf({ config: { ...DEFAULT_CONFIG, theme: 'dark' }, fallbackReason: null } as never)).toMatchObject({ prefs: { theme: 'dark' }, unreadable: false })
    expect(DEFAULT_PREFS()).toEqual(prefsOf(DEFAULT_CONFIG))
  })
})

/** the configuration surface the rebuilt reader's page reads (shared/surface-config.ts), as the slots' store takes it: its state,
 *  its listeners, its writes recorded */
function surfaceOf(config: Config | null, pack: PackState | null = null) {
  const state: SurfaceConfigState = { config, revision: 'r1', fallbackReason: null, resetFailed: false, pack }
  const patch = vi.fn(async (change: (latest: Config) => Config) => change(state.config ?? DEFAULT_CONFIG))
  const surface: Pick<SurfaceConfig, 'state' | 'subscribe' | 'patch'> = { state: () => state, subscribe: () => () => {}, patch }
  return { surface, patch }
}
const chrome = { getState: () => INITIAL } as unknown as ReaderController

describe('the parts over the rebuilt reader\'s store (host/v2.ts surfaceStore)', () => {
  it('a missing key is the key\'s only where the service chosen carries one: a built-in engine is told it without a key', () => {
    const builtIn = surfaceStore(surfaceOf({ ...DEFAULT_CONFIG, provider: 'microsoft' }).surface)
    const own = surfaceStore(surfaceOf({ ...DEFAULT_CONFIG, provider: 'svc-mine', services: [{ id: 'svc-mine', name: 'mine' }] } as never).surface)
    const en = LOCALES.en
    expect(extensionParts({ controller: chrome, store: builtIn, embedded: false }).reason('no-key')).toBe(en.REASON_KEYLESS['no-key'])
    expect(extensionParts({ controller: chrome, store: own, embedded: false }).reason('no-key')).toBe(en.REASON['no-key'])
    expect(extensionParts({ controller: chrome, store: own, embedded: false }).reason('network')).toBe(en.REASON.network)
  })

  it('the probes\' hook gets the controller as the probes read it, with the settings, and the session', () => {
    const store = surfaceStore(surfaceOf(DEFAULT_CONFIG).surface)
    const hook = vi.fn()
    const parts = extensionParts({ controller: chrome, store, embedded: true, probe: hook })
    const session = {}
    parts.probe?.(chrome, session as never)
    const [{ controller: probed, session: s }] = hook.mock.calls[0]!
    expect(s).toBe(session)
    expect(probed.getState()).toMatchObject({ settings: DEFAULT_CONFIG, pack: null, phase: INITIAL.phase })
    expect(parts.settingsHref).toMatch(/options\.html#reading\/pdf$/)
  })

  it('the controller as the probes read it (probeController): the chrome\'s, its state with the settings and the pack beside the preferences, and its patchSettings the surface\'s write', () => {
    const { surface, patch } = surfaceOf(DEFAULT_CONFIG, 'available')
    const store = surfaceStore(surface)
    const controller = createController({ open: async () => ({}) as never, paper: '2608.02163', first: { prefs: DEFAULTS, unreadable: false }, defaults: DEFAULTS })
    const probed = probeController(controller, store) as typeof controller & { patchSettings(change: (c: Config) => Config): void }
    expect(probed.getState()).toMatchObject({ prefs: DEFAULTS, paper: { id: '2608.02163' }, settings: DEFAULT_CONFIG, pack: 'available' })
    const change = (c: Config) => ({ ...c, theme: 'dark' as const })
    probed.patchSettings(change)
    expect(patch).toHaveBeenCalledWith(change)
    // the rest is the chrome's own
    expect(probed.zoomBy).toBe(controller.zoomBy)
  })
})
