// The extension's page's parts of the reader's chrome (src/pdf-reader/host/parts.ts): the first read as the one preference
// model, a failure's words by the service chosen, the probes' hook
import { describe, expect, it, vi } from 'vitest'
import { INITIAL, type ReaderController } from '@readarxiv/reader'
import { LOCALES } from '@readarxiv/ui'
import { DEFAULT_CONFIG } from '@/config/schema'
import { DEFAULT_PREFS, extensionParts, firstOf } from '@/pdf-reader/host/parts'
import { prefsOf } from '@/pdf-reader/host/prefs'
import { configStore } from '@/pdf-reader/host/today'

const controller = { getState: () => INITIAL } as unknown as ReaderController

describe('the extension page\'s parts of the chrome', () => {
  it('the first read: none in its time, or one that fell back, is unreadable; a read is the one model', () => {
    expect(firstOf(null)).toEqual({ prefs: null, unreadable: true })
    expect(firstOf({ config: DEFAULT_CONFIG, fallbackReason: { kind: 'unknown' } } as never)).toEqual({ prefs: prefsOf(DEFAULT_CONFIG), unreadable: true })
    expect(firstOf({ config: { ...DEFAULT_CONFIG, theme: 'dark' }, fallbackReason: null } as never)).toMatchObject({ prefs: { theme: 'dark' }, unreadable: false })
    expect(DEFAULT_PREFS()).toEqual(prefsOf(DEFAULT_CONFIG))
  })
  it('a missing key is the key\'s only where the service chosen carries one: a built-in engine is told it without a key', () => {
    const builtIn = configStore({ ...DEFAULT_CONFIG, provider: 'microsoft' })
    const own = configStore({ ...DEFAULT_CONFIG, provider: 'svc-mine', services: [{ id: 'svc-mine', name: 'mine' }] } as never)
    const en = LOCALES.en
    expect(extensionParts({ controller, store: builtIn, embedded: false }).reason('no-key')).toBe(en.REASON_KEYLESS['no-key'])
    expect(extensionParts({ controller, store: own, embedded: false }).reason('no-key')).toBe(en.REASON['no-key'])
    expect(extensionParts({ controller, store: own, embedded: false }).reason('network')).toBe(en.REASON.network)
  })
  it('the probes\' hook gets the controller as the probes read it, with the settings, and the session', () => {
    const store = configStore(DEFAULT_CONFIG)
    const hook = vi.fn()
    const parts = extensionParts({ controller, store, embedded: true, probe: hook })
    const session = {}
    parts.probe?.(controller, session as never)
    const [{ controller: probed, session: s }] = hook.mock.calls[0]!
    expect(s).toBe(session)
    expect(probed.getState()).toMatchObject({ settings: DEFAULT_CONFIG, pack: null, phase: INITIAL.phase })
    expect(parts.settingsHref).toMatch(/options\.html#reading\/pdf$/)
  })
})
