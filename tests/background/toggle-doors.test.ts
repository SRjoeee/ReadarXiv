import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { installContextMenu, installToggleCommand, toggleTranslation } from '@/entrypoints/background/context-menu'
import { createHandlers } from '@/entrypoints/background/handlers'

// The background's wiring of the one toggle into its three doors — the context menu, the keyboard command and the
// floating button's main button (the `axt:toggle` handler). What each door decides is the toggle's (context-menu.ts,
// tests/entry/context-menu.test.ts); this pins that each is handed the whole of it, the retranslate cue included
// (UI.md P6b): a door left without `madeGood` would restore the page the popup offers to translate again

vi.mock('@/entrypoints/background/context-menu', async importOriginal => ({
  ...await importOriginal<typeof import('@/entrypoints/background/context-menu')>(),
  installContextMenu: vi.fn(),
  refreshContextMenu: vi.fn(),
  installToggleCommand: vi.fn(),
  toggleTranslation: vi.fn(async () => true),
}))
vi.mock('@/entrypoints/background/handlers', () => ({ createHandlers: vi.fn(() => ({})) }))

afterEach(() => {
  vi.restoreAllMocks()
  fakeBrowser.reset()
})

describe('the toggle\'s three doors (the background, index.ts)', () => {
  it('the menu, the key and the floating button are each handed the same saved settings and the same retranslate cue', async () => {
    // what the worker's start-up reaches that the in-memory browser does not implement
    vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('en')
    vi.spyOn(fakeBrowser.tabs.onZoomChange, 'addListener').mockImplementation(() => undefined)
    const { default: background } = await import('@/entrypoints/background')
    background.main()
    const menu = vi.mocked(installContextMenu).mock.calls[0]![0]
    const key = vi.mocked(installToggleCommand).mock.calls[0]![0]
    await vi.mocked(createHandlers).mock.calls[0]![0].toggle(7)
    const [floating, tabId] = vi.mocked(toggleTranslation).mock.calls[0]!
    expect(tabId).toBe(7)
    const doors = [menu, key, floating]
    expect(doors.map(d => typeof d.madeGood)).toEqual(['function', 'function', 'function'])
    expect(new Set(doors.map(d => d.madeGood)).size).toBe(1)
    expect(new Set(doors.map(d => d.saved)).size).toBe(1)
  })
})
