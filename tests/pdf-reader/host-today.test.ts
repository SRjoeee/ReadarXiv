// Today's reader behind the one chrome (host/today.ts): its session opened in the chrome's panes on the page's address and its
// first read of the settings, its settings told to the chrome as the preferences and to the slots' store with the pack, the
// chrome's patches written as configuration changes; the store's writes held until the session is open; the controller as the
// probes read it. The session itself is reader-host.test.ts's; here it is a stand-in
import { describe, expect, it, vi } from 'vitest'
import { createController, DEFAULTS, type SessionEvent as ChromeEvent, type SessionHost as ChromeHost } from '@readarxiv/reader'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { ConfigReading } from '@/config/storage'
import { prefsOf, withPrefs } from '@/pdf-reader/host/prefs'
import { configStore, probeController, todayOpen } from '@/pdf-reader/host/today'
import type { Session, SessionEvent, SessionHost } from '@/pdf-reader/session/events'

const opened = vi.hoisted(() => ({ hosts: [] as unknown[], session: null as unknown }))
vi.mock('@/pdf-reader/session/host', () => ({
  openReader: vi.fn(async (host: unknown) => {
    opened.hosts.push(host)
    return opened.session
  }),
}))

const fakeSession = (): Session => ({ setDisplay: vi.fn(), setSyncMode: vi.fn(), zoomBy: vi.fn(), zoomTo: vi.fn(), goToPage: vi.fn(), patchSettings: vi.fn(), pdfBytes: vi.fn(async () => null), openOriginal: vi.fn(), goToUnit: vi.fn(), lead: vi.fn(), retry: vi.fn(), setNarrow: vi.fn(), pinch: vi.fn() })
const chromeHost = () => {
  const told: ChromeEvent[] = []
  return { host: { left: document.createElement('div'), right: document.createElement('div'), emit: (e: ChromeEvent) => told.push(e) } as ChromeHost, told }
}
/** today's session opened as the page opens it: on its address and its first read */
async function open(o: { query?: string; reading?: ConfigReading | null } = {}) {
  opened.hosts.length = 0
  const session = fakeSession()
  opened.session = session
  const reading = o.reading === undefined ? { config: DEFAULT_CONFIG, fallbackReason: null } : o.reading
  const store = configStore(reading?.config ?? null)
  const { host, told } = chromeHost()
  const params = new URLSearchParams(o.query ?? 'paper=2608.02163')
  const chrome = await todayOpen({ params, reading, store })(host)
  return { session, store, told, chrome, params, given: opened.hosts[0] as SessionHost }
}

describe('today\'s session in the chrome\'s panes', () => {
  it('is opened in the chrome\'s panes on the page\'s address', async () => {
    const { given, params } = await open({ query: 'paper=hep-th/9711200&embedded=1' })
    expect(given.params).toBe(params)
    expect(given.params.get('paper')).toBe('hep-th/9711200')
    expect([given.left, given.right].every(p => p instanceof HTMLElement)).toBe(true)
  })

  it('is handed the page\'s first read of the settings, so that a storage that did not answer is not waited on twice (Codex on #329)', async () => {
    const reading = { config: { ...DEFAULT_CONFIG, targetLanguage: 'jpn' as const }, fallbackReason: null }
    for (const given of [reading, null]) {
      const { given: host } = await open({ reading: given })
      expect(host.reading, String(given && 'read')).toBe(given)
    }
  })

  it('tells the settings as the preferences, and the slots\' store the settings with their pack; every other event as it is', async () => {
    const { given, store, told } = await open()
    const jpn = { ...DEFAULT_CONFIG, targetLanguage: 'jpn' as const }
    given.emit({ type: 'settings', config: jpn, pack: 'available' } as SessionEvent)
    expect(store.state()).toEqual({ config: jpn, pack: 'available' })
    expect(told).toEqual([{ type: 'prefs', prefs: prefsOf(jpn) }])
    given.emit({ type: 'page', side: 'left', page: 2, pages: 9 })
    expect(told.at(-1)).toEqual({ type: 'page', side: 'left', page: 2, pages: 9 })
  })

  it('writes the chrome\'s patches as configuration changes on what storage holds when their turn comes (host/prefs.ts withPrefs)', async () => {
    const { chrome, session } = await open()
    chrome.setPrefs({ target: 'de', classes: { references: true } })
    const change = vi.mocked(session.patchSettings).mock.calls[0]![0]
    const latest: Config = { ...DEFAULT_CONFIG, theme: 'dark' }
    expect(change(latest)).toEqual(withPrefs(latest, { target: 'de', classes: { references: true } }))
    expect(change(latest)).toMatchObject({ theme: 'dark', targetLanguage: 'deu', pdfReader: { classes: { references: true } } })
    // the session's own commands are the chrome's
    chrome.setDisplay('translation')
    expect(session.setDisplay).toHaveBeenCalledWith('translation')
  })

  it('opens the store\'s writes once the session is: one made before it is held, then written in its order', async () => {
    const store = configStore(DEFAULT_CONFIG)
    const first = (c: Config) => ({ ...c, provider: 'google-web' })
    store.patch(first)
    const session = fakeSession()
    opened.session = session
    await todayOpen({ params: new URLSearchParams('paper=2608.02163'), reading: null, store })(chromeHost().host)
    expect(vi.mocked(session.patchSettings).mock.calls).toEqual([[first]])
    const next = (c: Config) => ({ ...c, provider: 'microsoft' })
    store.patch(next)
    expect(vi.mocked(session.patchSettings).mock.calls).toEqual([[first], [next]])
  })
})

describe('the slots\' store (configStore)', () => {
  it('holds the first read until the session tells, and tells its listeners of a change only', () => {
    const store = configStore(DEFAULT_CONFIG)
    expect(store.state()).toEqual({ config: DEFAULT_CONFIG, pack: null })
    const heard = vi.fn()
    const off = store.subscribe(heard)
    store.told(DEFAULT_CONFIG, null)
    expect(heard).not.toHaveBeenCalled()
    store.told(DEFAULT_CONFIG, 'downloadable')
    expect([heard.mock.calls.length, store.state().pack]).toEqual([1, 'downloadable'])
    off()
    store.told({ ...DEFAULT_CONFIG }, 'downloadable')
    expect(heard).toHaveBeenCalledOnce()
  })
})

describe('the controller as the probes read it (window.__reader.controller)', () => {
  it('is the chrome\'s, its state with the settings and the pack beside the preferences, and its patchSettings the store\'s write', async () => {
    const store = configStore(DEFAULT_CONFIG)
    store.told(DEFAULT_CONFIG, 'available')
    const controller = createController({ open: async () => ({}) as never, paper: '2608.02163', first: { prefs: DEFAULTS, unreadable: false }, defaults: DEFAULTS })
    const probed = probeController(controller, store) as typeof controller & { patchSettings(change: (c: Config) => Config): void }
    expect(probed.getState()).toMatchObject({ prefs: DEFAULTS, paper: { id: '2608.02163' }, settings: DEFAULT_CONFIG, pack: 'available' })
    const change = (c: Config) => ({ ...c, theme: 'dark' as const })
    const patch = vi.spyOn(store, 'patch')
    probed.patchSettings(change)
    expect(patch).toHaveBeenCalledWith(change)
    // the rest is the chrome's own
    expect(probed.zoomBy).toBe(controller.zoomBy)
  })
})
