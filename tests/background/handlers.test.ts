import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { type HandlerDeps, createHandlers } from '@/entrypoints/background/handlers'
import { ProviderError } from '@/providers/types'
import { DEFAULT_FLOATING_ENTRY } from '@/shared/entry-settings'
import type { AxtMessage, AxtMessageType, AxtResponse, MessageSender } from '@/shared/messages'
import type { HelperStatus } from '@/shared/ocr'

// The rules the background keeps per message (DESIGN §8.0), at the table's own interface: a message and a sender in,
// the answer out. The modules behind it — the chain, the router, the status, the floating button's store — have their
// own tests; what is faked here is only what a rule touches

const READY: HelperStatus = { state: 'ready', version: '1.0.0' }

function harness(over: Partial<HandlerDeps> = {}) {
  const lines: Array<[string, string]> = []
  const deps = {
    chain: {},
    router: { forCall: vi.fn(), drop: vi.fn(async () => 0), bind: vi.fn() },
    offers: {},
    ocr: { status: vi.fn(async () => READY), ocr: vi.fn() },
    helperWaiter: { start: vi.fn(async () => undefined), until: vi.fn(() => null) },
    helperRestored: Promise.resolve(),
    helperRestart: { noticed: vi.fn() },
    tellTabs: vi.fn(),
    diagnostics: { record: (src: string, line: string) => void lines.push([src, line]), restored: Promise.resolve(), export: vi.fn() },
    cache: { clear: vi.fn(async () => 0), cleanup: vi.fn(async () => undefined), stats: vi.fn(async () => ({ entries: 0, bytes: 0 })) },
    toggle: vi.fn(async () => true),
    getConfig: vi.fn(async () => DEFAULT_CONFIG),
    getFloatingEntry: vi.fn(async () => DEFAULT_FLOATING_ENTRY),
    patchFloatingEntry: vi.fn(),
    zoomOf: vi.fn(async () => 1),
    openSettings: vi.fn(async () => undefined),
    environment: vi.fn(),
    ...over,
  } as unknown as HandlerDeps
  const handlers = createHandlers(deps)
  const send = <T extends AxtMessageType>(message: AxtMessage<T>, sender: MessageSender = { tabId: 7 }) => {
    const handler = handlers[message.type] as ((message: AxtMessage<T>, sender: MessageSender) => Promise<AxtResponse<T>> | undefined) | undefined
    if (!handler) throw new Error(`no handler for ${message.type}`)
    return handler(message, sender)
  }
  return { deps, send, lines }
}

const CALL = { scope: 's1', paper: '2401.00001v1', segments: [] } as unknown as AxtMessage<'axt:translate'>

describe('the background\'s handlers', () => {
  describe('axt:translate', () => {
    it('goes to the chain the session is bound to, for the sender\'s tab', async () => {
      const translate = vi.fn(async () => ({ ok: true, result: { segments: [], provider: 'p' }, cached: 0 }))
      const forCall = vi.fn(async () => ({ translate }))
      const { send } = harness({ router: { forCall } as unknown as HandlerDeps['router'] })
      await expect(send({ ...CALL, type: 'axt:translate' })).resolves.toMatchObject({ ok: true })
      expect(forCall).toHaveBeenCalledWith('s1', 7)
      expect(translate).toHaveBeenCalledWith(expect.objectContaining({ scope: 's1' }))
    })

    it('a chain that cannot be built is answered as a failure of its kind, and the log gets the kind without the message', async () => {
      const forCall = vi.fn(async () => { throw new ProviderError('auth', 'key sk-secret refused') })
      const { send, lines } = harness({ router: { forCall } as unknown as HandlerDeps['router'] })
      await expect(send({ ...CALL, type: 'axt:translate' })).resolves.toEqual({ ok: false, error: expect.objectContaining({ kind: 'auth', message: 'key sk-secret refused' }) })
      expect(lines).toHaveLength(1)
      expect(lines[0]?.[0]).toBe('background')
      expect(lines[0]?.[1]).toContain('auth')
      expect(lines[0]?.[1]).not.toContain('sk-secret')
    })
  })

  it('axt:cancel-scope answers how many requests were withdrawn, and 0 when the withdrawal itself fails', async () => {
    const drop = vi.fn(async () => 3)
    const { send } = harness({ router: { drop } as unknown as HandlerDeps['router'] })
    await expect(send({ type: 'axt:cancel-scope', scope: 's1' })).resolves.toEqual({ cancelled: 3 })
    expect(drop).toHaveBeenCalledWith(['s1'])
    drop.mockRejectedValueOnce(new Error('gone'))
    await expect(send({ type: 'axt:cancel-scope', scope: 's1' })).resolves.toEqual({ cancelled: 0 })
  })

  describe('axt:helper-status', () => {
    it('a plain query probes without a recheck, tells no tab, and lets the restart see the answer', async () => {
      const { send, deps } = harness()
      await expect(send({ type: 'axt:helper-status' })).resolves.toEqual(READY)
      expect(deps.ocr.status).toHaveBeenCalledWith(undefined)
      expect(deps.tellTabs).not.toHaveBeenCalled()
      expect(deps.helperRestart.noticed).toHaveBeenCalledWith(READY)
    })

    it('a recheck that finds the helper tells the open papers, which parked their bitmaps', async () => {
      const { send, deps } = harness()
      await send({ type: 'axt:helper-status', recheck: true })
      expect(deps.ocr.status).toHaveBeenCalledWith({ recheck: true })
      expect(deps.tellTabs).toHaveBeenCalledWith({ type: 'axt:helper-ready' })
    })

    it('a recheck that finds nothing tells nobody; a stale worker is still noticed', async () => {
      const stale: HelperStatus = { state: 'restarting' }
      const { send, deps } = harness({ ocr: { status: vi.fn(async () => stale), ocr: vi.fn() } })
      await expect(send({ type: 'axt:helper-status', recheck: true })).resolves.toEqual(stale)
      expect(deps.tellTabs).not.toHaveBeenCalled()
      expect(deps.helperRestart.noticed).toHaveBeenCalledWith(stale)
    })
  })

  describe('axt:helper-await', () => {
    it('with start it begins the wait and answers its deadline', async () => {
      let until: number | null = null
      const start = vi.fn(async () => { until = 1234 })
      const { send } = harness({ helperWaiter: { start, until: () => until } })
      await expect(send({ type: 'axt:helper-await', start: true })).resolves.toEqual({ until: 1234 })
      expect(start).toHaveBeenCalledTimes(1)
    })

    it('without it, the answer waits for the previous worker\'s wait to be restored and starts nothing', async () => {
      let until: number | null = null
      let restore!: () => void
      const helperRestored = new Promise<void>(resolve => { restore = () => { until = 5678; resolve() } })
      const start = vi.fn(async () => undefined)
      const { send } = harness({ helperWaiter: { start, until: () => until }, helperRestored })
      const answer = send({ type: 'axt:helper-await' })
      restore()
      await expect(answer).resolves.toEqual({ until: 5678 })
      expect(start).not.toHaveBeenCalled()
    })
  })

  describe('axt:ocr', () => {
    const call = { type: 'axt:ocr', imageHash: 'h', image: '', mime: 'image/png', paper: 'p', scope: 's1' } as const

    it('binds the scope to the sender\'s tab before the recognition is asked for', async () => {
      const order: string[] = []
      const bind = vi.fn(() => void order.push('bind'))
      const ocr = vi.fn(async () => { order.push('ocr'); return { ok: false as const, error: { kind: 'unknown' as const, message: 'x' } } })
      const { send } = harness({ router: { bind } as unknown as HandlerDeps['router'], ocr: { status: vi.fn(), ocr } })
      await send(call)
      expect(bind).toHaveBeenCalledWith('s1', 7)
      expect(order).toEqual(['bind', 'ocr'])
    })

    it('a call without a scope binds nothing, and a recognition that throws is answered as a failure', async () => {
      const bind = vi.fn()
      const ocr = vi.fn(async () => { throw new Error('port closed') })
      const { send } = harness({ router: { bind } as unknown as HandlerDeps['router'], ocr: { status: vi.fn(), ocr } })
      const { scope: _scope, ...unscoped } = call
      await expect(send(unscoped)).resolves.toEqual({ ok: false, error: { kind: 'unknown', message: 'port closed' } })
      expect(bind).not.toHaveBeenCalled()
    })
  })

  it('axt:toggle toggles the tab that asked; from an extension page there is no tab, and nothing is answered', async () => {
    const { send, deps } = harness()
    await expect(send({ type: 'axt:toggle' })).resolves.toEqual({ acted: true })
    expect(deps.toggle).toHaveBeenCalledWith(7)
    expect(send({ type: 'axt:toggle' }, { tabId: undefined })).toBeUndefined()
    expect(deps.toggle).toHaveBeenCalledTimes(1)
  })

  describe('axt:entry-settings', () => {
    const config = { ...DEFAULT_CONFIG, uiLanguage: 'ja', reading: { ...DEFAULT_CONFIG.reading, openIn: 'new-tab' } } as typeof DEFAULT_CONFIG
    const floating = { ...DEFAULT_FLOATING_ENTRY, side: 'left' as const }

    it('answers what a page needs of the configuration, the floating button\'s state and the tab\'s zoom', async () => {
      const { send, deps } = harness({ getConfig: async () => config, getFloatingEntry: async () => floating, zoomOf: vi.fn(async () => 1.25) })
      await expect(send({ type: 'axt:entry-settings' })).resolves.toEqual({ uiLanguage: 'ja', openIn: 'new-tab', zoom: 1.25, floating })
      expect(deps.zoomOf).toHaveBeenCalledWith(7)
    })

    it('a zoom that cannot be read, or a sender without a tab, is a zoom of 1', async () => {
      const zoomOf = vi.fn(async () => { throw new Error('No tab with id 7') })
      const { send } = harness({ zoomOf })
      await expect(send({ type: 'axt:entry-settings' })).resolves.toMatchObject({ zoom: 1 })
      await expect(send({ type: 'axt:entry-settings' }, { tabId: undefined })).resolves.toMatchObject({ zoom: 1 })
      expect(zoomOf).toHaveBeenCalledTimes(1)
    })
  })

  it('axt:open-settings says whether the page opened', async () => {
    const openSettings = vi.fn(async () => undefined)
    const { send } = harness({ openSettings })
    await expect(send({ type: 'axt:open-settings' })).resolves.toEqual({ opened: true })
    openSettings.mockRejectedValueOnce(new Error('no options page'))
    await expect(send({ type: 'axt:open-settings' })).resolves.toEqual({ opened: false })
  })

  it('axt:diag records a page\'s line and answers nothing; a line of the wrong shape, or claiming to be the background\'s, is dropped', () => {
    const { send, lines } = harness()
    expect(send({ type: 'axt:diag', src: 'content', line: '[axt] a line' })).toBeUndefined()
    send({ type: 'axt:diag', src: 'background', line: 'forged' } as unknown as AxtMessage<'axt:diag'>)
    send({ type: 'axt:diag', src: 'popup', line: 42 } as unknown as AxtMessage<'axt:diag'>)
    expect(lines).toEqual([['content', '[axt] a line']])
  })

  it('axt:diag-export waits for the previous worker\'s lines, then exports with the environment', async () => {
    const order: string[] = []
    let restore!: () => void
    const restored = new Promise<void>(resolve => { restore = () => { order.push('restored'); resolve() } })
    const environment = { extension: { version: '0.4.1', buildRef: 'ref' }, browser: 'UA', platform: 'mac' }
    const exported = { exportedAt: 't', ...environment, entries: [] }
    const diagnostics = { record: vi.fn(), restored, export: vi.fn(() => { order.push('export'); return exported }) }
    const { send } = harness({ diagnostics, environment: async () => environment })
    const answer = send({ type: 'axt:diag-export' })
    restore()
    await expect(answer).resolves.toBe(exported)
    expect(diagnostics.export).toHaveBeenCalledWith(environment)
    expect(order).toEqual(['restored', 'export'])
  })

  describe('the cache messages', () => {
    it('axt:cache-clear answers how many entries went; an unusable store is reported as it is, not as 0 removed', async () => {
      const clear = vi.fn(async () => 12)
      const { send } = harness({ cache: { clear, cleanup: vi.fn(), stats: vi.fn() } })
      await expect(send({ type: 'axt:cache-clear' })).resolves.toEqual({ ok: true, removed: 12 })
      clear.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      await expect(send({ type: 'axt:cache-clear' })).resolves.toEqual({ ok: false, message: 'IndexedDB unavailable' })
    })

    it('axt:cache-stats counts after the expired entries were cleaned, and reports a failure of either step', async () => {
      const order: string[] = []
      const cleanup = vi.fn(async () => void order.push('cleanup'))
      const stats = vi.fn(async () => { order.push('stats'); return { entries: 4, bytes: 2048 } })
      const { send } = harness({ cache: { clear: vi.fn(), cleanup, stats } })
      await expect(send({ type: 'axt:cache-stats' })).resolves.toEqual({ ok: true, entries: 4, bytes: 2048 })
      expect(order).toEqual(['cleanup', 'stats'])
      cleanup.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      await expect(send({ type: 'axt:cache-stats' })).resolves.toEqual({ ok: false, message: 'IndexedDB unavailable' })
    })
  })

  it('answers every message the background is sent, and none that is meant for a page', () => {
    const { deps } = harness()
    expect(Object.keys(createHandlers(deps)).sort()).toEqual([
      'axt:cache-clear', 'axt:cache-stats', 'axt:cancel-scope', 'axt:diag', 'axt:diag-export', 'axt:engine-ready',
      'axt:entry-settings', 'axt:helper-await', 'axt:helper-status', 'axt:ocr', 'axt:open-settings',
      'axt:provider-status', 'axt:set-floating-entry', 'axt:toggle', 'axt:translate',
    ])
  })
})
