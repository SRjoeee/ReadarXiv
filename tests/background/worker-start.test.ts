import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { translationCache } from '@/cache'
import { sweepAtStart } from '@/entrypoints/background/handlers'

// What the worker does of itself when it starts (the background, index.ts), run as the browser runs it: the cache's expired
// entries swept (#88 E6). What the sweep deletes is handlers.test.ts's; this pins that the start asks for it, of the cache
// the worker serves from, and before any message

vi.mock('@/entrypoints/background/context-menu', async importOriginal => ({
  ...await importOriginal<typeof import('@/entrypoints/background/context-menu')>(),
  installContextMenu: vi.fn(),
  refreshContextMenu: vi.fn(),
  installToggleCommand: vi.fn(),
}))
vi.mock('@/entrypoints/background/handlers', () => ({ createHandlers: vi.fn(() => ({})), sweepAtStart: vi.fn(async () => undefined) }))

afterEach(() => {
  vi.restoreAllMocks()
  fakeBrowser.reset()
})

describe('the worker\'s start (#88 E6)', () => {
  it('sweeps the translation cache\'s expired entries once, with the log to tell a failure to', async () => {
    vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('en')
    vi.spyOn(fakeBrowser.tabs.onZoomChange, 'addListener').mockImplementation(() => undefined)
    const { default: background } = await import('@/entrypoints/background')
    background.main()
    expect(vi.mocked(sweepAtStart)).toHaveBeenCalledOnce()
    const [deps] = vi.mocked(sweepAtStart).mock.calls[0]!
    expect(deps.cache).toBe(translationCache)
    expect(typeof deps.diagnostics.record).toBe('function')
  })
})
