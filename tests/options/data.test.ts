import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browser } from 'wxt/browser'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { FallbackReason } from '@/config/storage'
import type { AxtMessage } from '@/shared/messages'
import { mountHook } from '../ui/render-hook'

// The settings page's data layer (INVENTORY S1), mounted in a real React root: a change saved elsewhere shows, and
// the reload an interface language takes waits for the page's drafts

const store = vi.hoisted(() => ({
  /** Set: the stored value cannot be read — reads give the defaults, the store refuses writes (config/storage.ts) */
  unreadable: null as FallbackReason | null,
  /** Set: storage refuses the reset's write */
  resetRefused: false,
  ConfigUnreadableError: class extends Error {
    constructor(readonly reason: FallbackReason) { super('refused') }
  },
  config: null as Config | null,
  watchers: [] as ((config: Config) => void)[],
  /** When set, every write waits for it: the test decides when a save lands */
  gate: null as Promise<void> | null,
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
    if (store.gate) await store.gate
    if (store.unreadable) { store.log.push('refused'); throw new store.ConfigUnreadableError(store.unreadable) }
    store.config = config
    store.log.push(`set:${config.targetLanguage}`)
  },
  resetConfig: async () => {
    if (store.resetRefused) { store.log.push('reset refused'); throw new Error('QUOTA_BYTES quota exceeded') }
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
    store.resetRefused = false
    store.watchers = []
    store.gate = null
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

  it('a reset storage refuses leaves the notice up and says the reset did not go through; the next one that succeeds clears both', async () => {
    store.unreadable = { kind: 'invalid', where: 'mode', message: 'x' }
    store.resetRefused = true
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null)
    await hook.run(async () => { await hook.current().reset() })
    expect(hook.current().resetFailed).toBe(true)
    expect(hook.current().fallbackReason).toMatchObject({ kind: 'invalid' })
    // Repaired without an event reaching this page, then a save here: the accepted save clears the line too
    store.unreadable = null
    await hook.run(async () => { await hook.current().patch(latest => ({ ...latest, targetLanguage: 'jpn' })) })
    expect(hook.current().resetFailed).toBe(false)
    store.unreadable = { kind: 'invalid', where: 'mode', message: 'x' }
    store.resetRefused = true
    await hook.run(async () => { await hook.current().reset() })
    expect(hook.current().resetFailed).toBe(true)
    // Repaired elsewhere: the refused-reset line goes with the notice, and does not return with a later fallback
    store.unreadable = null
    store.resetRefused = false
    await hook.run(() => saveElsewhere({ ...DEFAULT_CONFIG, uiLanguage: 'en' }))
    await hook.until(() => hook.current().fallbackReason === null)
    expect(hook.current().resetFailed).toBe(false)
    store.unreadable = { kind: 'invalid', where: 'mode', message: 'x' }
    await hook.run(async () => { await hook.current().reset() })
    expect(hook.current().resetFailed).toBe(false)
    expect(hook.current().fallbackReason).toBeNull()
    expect(store.log).toEqual(['reset refused', 'set:jpn', 'reset refused', 'reset'])
    await hook.unmount()
  })

  it('a change saved elsewhere shows without a reload', async () => {
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null || reload.mock.calls.length > 0)
    expect(hook.current().config?.targetLanguage).toBe(DEFAULT_CONFIG.targetLanguage)
    await hook.run(() => saveElsewhere({ ...DEFAULT_CONFIG, uiLanguage: 'en', targetLanguage: 'jpn' }))
    expect(hook.current().config?.targetLanguage).toBe('jpn')
    expect(reload).not.toHaveBeenCalled()
    await hook.unmount()
  })

  it('an interface language saved elsewhere reloads the page at once when nothing is being edited', async () => {
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null || reload.mock.calls.length > 0)
    await hook.run(() => saveElsewhere({ ...DEFAULT_CONFIG, uiLanguage: 'zh-CN' }))
    expect(reload).toHaveBeenCalledTimes(1)
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

  it('the reload waits for a save queued as the draft closes: the prompt editor and the glossary save and close in one breath', async () => {
    // The fifth local pass of S1: `save()` queues its patch on the write chain and closes the editor; the hold ends,
    // and a reload issued at once would cut the write off before its read of the store came back
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null || reload.mock.calls.length > 0)
    const release = drafts.hold()
    await hook.run(() => saveElsewhere({ ...DEFAULT_CONFIG, uiLanguage: 'zh-CN' }))
    expect(reload).not.toHaveBeenCalled()
    let land!: () => void
    store.gate = new Promise<void>(resolve => { land = resolve })
    const saved = hook.current().patch(latest => ({ ...latest, targetLanguage: 'kor' }))
    release()
    await hook.flush()
    expect(reload).not.toHaveBeenCalled()
    land()
    await saved
    await hook.flush()
    expect(store.config?.targetLanguage).toBe('kor')
    expect(reload).toHaveBeenCalledTimes(1)
    await hook.unmount()
  })

  it('a draft opened while the reload waits for a write holds it again', async () => {
    // The fifth local pass of S1: the wait for the write ended in an unconditional reload, over a prompt opened meanwhile
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null || reload.mock.calls.length > 0)
    const releaseFirst = drafts.hold()
    await hook.run(() => saveElsewhere({ ...DEFAULT_CONFIG, uiLanguage: 'zh-CN' }))
    let land!: () => void
    store.gate = new Promise<void>(resolve => { land = resolve })
    const saved = hook.current().patch(latest => ({ ...latest, targetLanguage: 'kor' }))
    releaseFirst()
    await hook.flush()
    const releaseSecond = drafts.hold()
    land()
    await saved
    await hook.flush()
    expect(reload).not.toHaveBeenCalled()
    releaseSecond()
    await hook.flush()
    expect(reload).toHaveBeenCalledTimes(1)
    await hook.unmount()
  })

  it('a save queued while the reload waits for an earlier one lands before the reload', async () => {
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null || reload.mock.calls.length > 0)
    const release = drafts.hold()
    await hook.run(() => saveElsewhere({ ...DEFAULT_CONFIG, uiLanguage: 'zh-CN' }))
    let land!: () => void
    store.gate = new Promise<void>(resolve => { land = resolve })
    const first = hook.current().patch(latest => ({ ...latest, targetLanguage: 'kor' }))
    release()
    await hook.flush()
    const second = hook.current().patch(latest => ({ ...latest, targetLanguage: 'fra' }))
    land()
    await Promise.all([first, second])
    await hook.flush()
    expect(store.log).toEqual(['set:kor', 'set:fra', 'reload'])
    await hook.unmount()
  })

  it('a stored interface language that differs from the one in use at the first read reloads the page', async () => {
    // Codex on #185: a change landing between the locale's read and the hook's first read has no watcher yet
    store.config = { ...DEFAULT_CONFIG, uiLanguage: 'zh-CN' }
    const hook = await mountHook(useOptionsData)
    await hook.until(() => hook.current().config !== null || reload.mock.calls.length > 0)
    expect(reload).toHaveBeenCalledTimes(1)
    await hook.unmount()
  })

  it('a pack downloaded on the popup shows installed on the Chrome card without a click; another target starts no lookup (INVENTORY S7)', async () => {
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
