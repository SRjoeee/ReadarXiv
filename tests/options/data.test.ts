import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { FallbackReason } from '@/config/storage'
import type { AxtMessage } from '@/shared/messages'
import { mountHook } from '../ui/render-hook'

// The settings page's data layer, mounted in a real React root — what is the page's own. The chain, the re-read of a
// change saved elsewhere and the reload's waits are the surface configuration's and are tested at its interface
// (tests/shared/surface-config.test.ts); here: a refused save is no error on this page, the page's drafts are what
// holds the reload, and the popup's pack broadcast reaches the lookup

const store = vi.hoisted(() => ({
  /** Set: the stored value cannot be read — reads give the defaults, the store refuses writes (config/storage.ts) */
  unreadable: null as FallbackReason | null,
  ConfigUnreadableError: class extends Error {
    constructor(readonly reason: FallbackReason) { super('refused') }
  },
  config: null as Config | null,
  watchers: [] as ((config: Config) => void)[],
  /** Writes and reloads in the order they happened */
  log: [] as string[],
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { id: 'test-extension', getURL: (path: string) => path, getPlatformInfo: async () => ({ os: 'mac' }), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
    i18n: { getUILanguage: () => 'en' },
  },
}))
vi.mock('@/config/storage', () => ({
  getConfig: async () => { if (!store.config) throw new Error('no config'); return store.config },
  setConfig: async (config: Config) => {
    if (store.unreadable) { store.log.push('refused'); throw new store.ConfigUnreadableError(store.unreadable) }
    store.config = config
    store.log.push(`set:${config.targetLanguage}`)
  },
  resetConfig: async () => {
    store.unreadable = null
    store.log.push('reset')
  },
  ConfigUnreadableError: store.ConfigUnreadableError,
  watchConfig: (callback: (config: Config) => void) => { store.watchers.push(callback); return () => { store.watchers = store.watchers.filter(w => w !== callback) } },
  configFallbackReason: () => store.unreadable,
}))
vi.mock('@/shared/messages', async importOriginal => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  sendMessage: (message: AxtMessage) => {
    if (message.type === 'axt:cache-stats') return Promise.resolve({ ok: true, entries: 0, bytes: 0 })
    if (message.type === 'axt:helper-status') return Promise.resolve({ state: 'not-installed' })
    return Promise.resolve(undefined)
  },
}))

import { useOptionsData } from '@/entrypoints/options/data'
import { applyLocaleFrom } from '@/ui/apply-locale'
import { drafts } from '@/ui/drafts'

const saveElsewhere = (config: Config) => {
  store.config = config
  for (const watcher of store.watchers) watcher(config)
}

describe('useOptionsData', () => {
  let reload: ReturnType<typeof vi.fn>
  beforeEach(() => {
    store.config = { ...DEFAULT_CONFIG, uiLanguage: 'en' }
    store.unreadable = null
    store.watchers = []
    store.log = []
    applyLocaleFrom('en')
    reload = vi.fn(() => { store.log.push('reload') })
    vi.spyOn(location, 'reload').mockImplementation(reload as () => void)
  })

  it('a stored configuration that cannot be read: a save is refused, the page stays on what is in effect and says why; the reset is the way out', async () => {
    store.unreadable = { kind: 'tooNew', stored: 99, supported: DEFAULT_CONFIG.version }
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null)
    expect(hook.current().fallbackReason).toEqual(store.unreadable)

    let kept: Config | null = null
    await hook.run(async () => { kept = await hook.current().patch(latest => ({ ...latest, targetLanguage: 'jpn' })) })
    expect((kept as Config | null)?.targetLanguage).toBe(DEFAULT_CONFIG.targetLanguage)
    expect(hook.current().config?.targetLanguage).toBe(DEFAULT_CONFIG.targetLanguage)
    expect(hook.current().fallbackReason).toMatchObject({ kind: 'tooNew' })
    expect(store.log).toEqual(['refused'])

    await hook.run(async () => { await hook.current().reset() })
    expect(hook.current().fallbackReason).toBeNull()
    await hook.run(async () => { await hook.current().patch(latest => ({ ...latest, targetLanguage: 'jpn' })) })
    expect(hook.current().config?.targetLanguage).toBe('jpn')
    expect(store.log).toEqual(['refused', 'reset', 'set:jpn'])
    await hook.unmount()
  })

  it('under a draft the reload waits for the draft to close, and the other settings follow meanwhile', async () => {
    // The fourth local pass of S1: a service being edited in another tab's drawer is local until “Connect”; the reload the
    // watcher asked for would have discarded it
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null || reload.mock.calls.length > 0)
    const release = drafts.hold()
    await hook.run(() => saveElsewhere({ ...DEFAULT_CONFIG, uiLanguage: 'zh-CN', targetLanguage: 'jpn' }))
    expect(reload).not.toHaveBeenCalled()
    expect(hook.current().config?.targetLanguage).toBe('jpn')
    // A second change while it waits asks for no second reload
    await hook.run(() => saveElsewhere({ ...DEFAULT_CONFIG, uiLanguage: 'zh-CN', targetLanguage: 'kor' }))
    release()
    await hook.flush()
    expect(reload).toHaveBeenCalledTimes(1)
    await hook.unmount()
  })

  it('a pack downloaded on the popup shows installed on the Chrome card without a click; another target starts no lookup', async () => {
    const listeners = vi.mocked(browser.runtime.onMessage.addListener).mock.calls.length
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().pack !== null)
    expect(hook.current().pack).toBe('unsupported') // no Translator API in the test runtime
    const onMessage = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[listeners]?.[0] as (message: unknown) => void
    // The other surface's download installed the pack: from here on the API answers, and only a lookup shows it
    const availability = vi.fn(async () => 'available')
    ;(globalThis as { Translator?: unknown }).Translator = { availability }
    try {
      await hook.run(() => onMessage({ type: 'axt:pack-changed', target: 'jpn' }))
      expect(availability).not.toHaveBeenCalled()
      expect(hook.current().pack).toBe('unsupported')
      await hook.run(() => onMessage({ type: 'axt:pack-changed', target: DEFAULT_CONFIG.targetLanguage }))
      expect(availability).toHaveBeenCalledTimes(1)
      expect(hook.current().pack).toBe('available')
    } finally {
      delete (globalThis as { Translator?: unknown }).Translator
    }
    await hook.unmount()
  })

})
