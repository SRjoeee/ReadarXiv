import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { ProviderStatus } from '@/providers/transport'
import type { AxtMessage, PageStatus } from '@/shared/messages'
import { deferred, mountHook } from '../ui/render-hook'

// The popup's data layer, mounted in a real React root: which ask publishes, and when the page reloads

const store = vi.hoisted(() => ({
  config: null as Config | null,
  watchers: [] as ((config: Config) => void)[],
}))
const wire = vi.hoisted(() => ({
  /** Every `axt:provider-status` ask, in order, with its answer held for the test */
  asks: [] as { message: { scope?: string; fresh?: boolean }; answer: { resolve: (s: unknown) => void; reject: (e: unknown) => void } }[],
  page: null as (() => Promise<unknown>) | null,
  /** What an abstract or PDF page answers `axt:entry-status`; null on any other page */
  entry: null as { paper: string; html: string | null } | null,
  /** Every message sent to the active tab, in order */
  toTab: [] as string[],
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { id: 'test-extension', getURL: (path: string) => path, openOptionsPage: vi.fn(), getPlatformInfo: async () => ({ os: 'mac' }), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
    commands: { getAll: async () => [] },
    tabs: { create: vi.fn(), query: async () => [] },
    i18n: { getUILanguage: () => 'en' },
  },
}))
vi.mock('@/config/storage', () => ({
  getConfig: async () => { if (!store.config) throw new Error('no config'); return store.config },
  setConfig: async (config: Config) => { store.config = config },
  watchConfig: (callback: (config: Config) => void) => { store.watchers.push(callback); return () => { store.watchers = store.watchers.filter(w => w !== callback) } },
  configFallbackReason: () => null,
}))
vi.mock('@/shared/messages', async importOriginal => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  sendMessage: (message: AxtMessage) => {
    if (message.type === 'axt:provider-status') {
      const answer = deferred<unknown>()
      wire.asks.push({ message, answer })
      return answer.promise
    }
    if (message.type === 'axt:helper-status') return Promise.resolve({ state: 'not-installed' })
    return Promise.resolve(undefined)
  },
  sendToActiveTab: (message: AxtMessage) => {
    wire.toTab.push(message.type)
    if (message.type === 'axt:page-status') return wire.page ? wire.page() : Promise.reject(new Error('no page'))
    // An entry page ignores every message but its own two, and an ignored message resolves `undefined`
    if (message.type === 'axt:entry-status') return Promise.resolve(wire.entry ?? undefined)
    if (wire.entry) return Promise.resolve(undefined)
    if (message.type === 'axt:restore-page') return Promise.resolve({ removedNodes: 1 })
    return Promise.resolve({ started: true })
  },
}))

import { usePopupData } from '@/entrypoints/popup/data'
import { applyLocaleFrom } from '@/ui/apply-locale'

const status = (id: string): ProviderStatus => ({ providerId: id, chosen: id, available: true, maxBatchChars: 1, maxBatchItems: 1, renderPath: 'tags', targetLanguage: 'cmn', promptId: 'default', revision: id, chain: [id], demotions: [], engine: { id } })
const page = (state: 'on' | 'stopped', session: string | null): PageStatus => ({ paper: '2401.00001', mode: 'side', preference: 'side', progress: { state, total: 1, requested: 1, done: 1, failed: 0, cached: 0, inFlight: 0 }, session, epoch: 'd#1' })
const savedAsks = () => wire.asks.filter(a => !a.message.scope)

describe('usePopupData', () => {
  let reload: ReturnType<typeof vi.fn>
  beforeEach(() => {
    store.config = { ...DEFAULT_CONFIG, uiLanguage: 'en' }
    store.watchers = []
    wire.asks = []
    wire.entry = null
    wire.toTab = []
    wire.page = async () => page('stopped', null)
    applyLocaleFrom('en')
    reload = vi.fn()
    vi.spyOn(location, 'reload').mockImplementation(reload as () => void)
  })

  it('asks the saved settings chain again when the page stops: a first ask that failed must not leave the button disabled', async () => {
    // The fourth local pass of S1: a page on shows its session's chain and the polling stops with the page
    wire.page = async () => page('on', 's1')
    const hook = await mountHook(usePopupData)
    await hook.until(() => hook.current().input.page?.progress.state === 'on' && savedAsks().length === 1)
    await hook.run(() => savedAsks()[0]?.answer.reject(new Error('the chain did not settle')))
    expect(hook.current().input.saved).toBeNull()
    // The reader restores from the popup; the page reports itself stopped
    wire.page = async () => page('stopped', null)
    await hook.run(() => hook.current().actions.restore())
    expect(hook.current().input.page?.progress.state).toBe('stopped')
    expect(savedAsks()).toHaveLength(2)
    // With the barrier, as every saved ask: made while a configuration change's ask waits on its read, an ask without
    // it would answer first from the previous chain and, being the newer ask, keep the answer
    expect(savedAsks().every(a => a.message.fresh === true)).toBe(true)
    await hook.run(() => savedAsks()[1]?.answer.resolve(status('google-web')))
    expect(hook.current().input.saved?.providerId).toBe('google-web')
    await hook.unmount()
  })

  it('a page that is on shows its session chain only once it has answered — never the saved chain in its place', async () => {
    wire.page = async () => page('on', 's1')
    const hook = await mountHook(usePopupData)
    await hook.until(() => savedAsks().length === 1 && hook.current().input.page?.progress.state === 'on')
    await hook.run(() => savedAsks()[0]?.answer.resolve(status('saved-chain')))
    expect(hook.current().input.saved?.providerId).toBe('saved-chain')
    expect(hook.current().input.session).toBeNull()
    const poll = wire.asks.find(a => a.message.scope === 's1')
    if (poll) {
      await hook.run(() => poll.answer.resolve(status('session-chain')))
      expect(hook.current().input.session?.providerId).toBe('session-chain')
    }
    await hook.unmount()
  })

  it('a stored interface language that differs from the one in use at the first read reloads the popup', async () => {
    // Codex on #185: a change landing between the locale's read and the hook's first read has no watcher yet
    store.config = { ...DEFAULT_CONFIG, uiLanguage: 'zh-CN' }
    const hook = await mountHook(usePopupData)
    await hook.until(() => reload.mock.calls.length > 0)
    expect(reload).toHaveBeenCalledTimes(1)
    await hook.unmount()
  })

  it('the same interface language at the first read does not reload', async () => {
    const hook = await mountHook(usePopupData)
    await hook.until(() => hook.current().input.config !== null)
    expect(reload).not.toHaveBeenCalled()
    expect(hook.current().input.config?.uiLanguage).toBe('en')
    await hook.unmount()
  })

  it('a change saved elsewhere shows without reopening, and the saved chain is asked fresh', async () => {
    const hook = await mountHook(usePopupData)
    await hook.until(() => hook.current().input.config !== null)
    expect(hook.current().input.config?.targetLanguage).toBe(DEFAULT_CONFIG.targetLanguage)
    store.config = { ...DEFAULT_CONFIG, uiLanguage: 'en', targetLanguage: 'jpn' }
    await hook.run(() => { for (const watcher of store.watchers) watcher(store.config as Config) })
    // The change reaches the hook through a re-read of storage on the serial write chain — one tick locally, more on
    // a loaded CI runner (#215's CI failed here once with the old value still showing)
    await hook.until(() => hook.current().input.config?.targetLanguage === 'jpn')
    expect(savedAsks().at(-1)?.message.fresh).toBe(true)
    expect(reload).not.toHaveBeenCalled()
    await hook.unmount()
  })

  it('on an abstract or PDF page a mode is saved here, not sent to a page that has no listener for it (Devin on #247)', async () => {
    wire.page = async () => undefined
    wire.entry = { paper: '2501.07202', html: 'https://arxiv.org/html/2501.07202#axt-translate' }
    const hook = await mountHook(usePopupData)
    await hook.until(() => hook.current().input.entry !== null && hook.current().input.config !== null)
    await hook.run(() => hook.current().actions.chooseMode('only'))
    await hook.until(() => store.config?.mode === 'only')
    expect(wire.toTab).not.toContain('axt:set-mode')
    expect(hook.current().error).toBeNull()
    await hook.unmount()
  })

  it('on the full text the page switches its own layout and saves the preference: the popup only asks it to', async () => {
    const hook = await mountHook(usePopupData)
    await hook.until(() => hook.current().input.config !== null)
    await hook.run(() => hook.current().actions.chooseMode('only'))
    await hook.until(() => wire.toTab.includes('axt:set-mode'))
    expect(store.config?.mode).toBe(DEFAULT_CONFIG.mode)
    await hook.unmount()
  })

  it('a pack downloaded on the settings page shows installed here without a click; another target starts no lookup', async () => {
    const listeners = vi.mocked(browser.runtime.onMessage.addListener).mock.calls.length
    const hook = await mountHook(usePopupData)
    await hook.until(() => hook.current().input.pack !== null)
    expect(hook.current().input.pack).toBe('unsupported') // no Translator API in the test runtime
    const onMessage = vi.mocked(browser.runtime.onMessage.addListener).mock.calls[listeners]?.[0] as (message: unknown) => void
    // The other surface's download installed the pack: from here on the API answers, and only a lookup shows it
    const availability = vi.fn(async () => 'available')
    ;(globalThis as { Translator?: unknown }).Translator = { availability }
    try {
      await hook.run(() => onMessage({ type: 'axt:pack-changed', target: 'jpn' }))
      expect(availability).not.toHaveBeenCalled()
      expect(hook.current().input.pack).toBe('unsupported')
      await hook.run(() => onMessage({ type: 'axt:pack-changed', target: DEFAULT_CONFIG.targetLanguage }))
      expect(availability).toHaveBeenCalledTimes(1)
      expect(hook.current().input.pack).toBe('available')
    } finally {
      delete (globalThis as { Translator?: unknown }).Translator
    }
    await hook.unmount()
  })

})
