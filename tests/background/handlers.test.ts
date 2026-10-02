import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { type HandlerDeps, createHandlers } from '@/entrypoints/background/handlers'
import { ProviderError } from '@/providers/types'
import { DEFAULT_FLOATING_ENTRY } from '@/shared/entry-settings'
import type { AxtMessage, AxtMessageType, AxtResponse, MessageSender } from '@/shared/messages'

// The rules the background keeps per message (DESIGN §8.0), at the table's own interface: a message and a sender in,
// the answer out. The modules behind it — the chain, the router, the status, the floating button's store — have their
// own tests; what is faked here is only what a rule touches

function harness(over: Partial<HandlerDeps> = {}) {
  const lines: Array<[string, string]> = []
  const deps = {
    chain: {},
    router: { forCall: vi.fn(), drop: vi.fn(async () => 0), bind: vi.fn() },
    offers: {},
    ocr: { ocr: vi.fn() },
    diagnostics: { record: (src: string, line: string) => void lines.push([src, line]), restored: Promise.resolve(), export: vi.fn() },
    cache: { clear: vi.fn(async () => 0), cleanup: vi.fn(async () => undefined), stats: vi.fn(async () => ({ entries: 0, bytes: 0 })) },
    toggle: vi.fn(async () => true),
    decide: vi.fn(async () => ({ action: 'retranslate', behind: false, enabled: true })),
    getConfig: vi.fn(async () => DEFAULT_CONFIG),
    getFloatingEntry: vi.fn(async () => DEFAULT_FLOATING_ENTRY),
    patchFloatingEntry: vi.fn(),
    zoomOf: vi.fn(async () => 1),
    openSettings: vi.fn(async () => undefined),
    lightAction: vi.fn(async () => undefined),
    environment: vi.fn(),
    health: { reject: vi.fn(async () => undefined), clear: vi.fn(async () => false) },
    warmup: { done: vi.fn(async () => undefined), seen: vi.fn(async () => undefined), giveWay: vi.fn(async () => undefined) },
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
/** One of the reader's services, as the settings page stores it before its connection test */
const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-x', model: 'x/y', thinking: 'disabled' as const }

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

    it('a call naming one of the reader\'s services writes the health record: success clears it, a refused key marks it; a call naming none, or a free engine, writes nothing (the redesign\'s design, §4)', async () => {
      const answering = (answer: unknown) => ({ router: { forCall: vi.fn(async () => ({ translate: vi.fn(async () => answer) })) } as unknown as HandlerDeps['router'] })
      const health = () => ({ reject: vi.fn(async () => undefined), clear: vi.fn(async () => true) })
      const named = { ...CALL, type: 'axt:translate' as const, providerId: 'svc-abcd1234' }
      const good = { ok: true, result: { segments: [], provider: 'svc-abcd1234' }, cached: 0 }

      const cleared = health()
      await harness({ ...answering(good), health: cleared }).send(named)
      expect(cleared.clear).toHaveBeenCalledWith('svc-abcd1234')
      expect(cleared.reject).not.toHaveBeenCalled()

      const refused = health()
      const stored = vi.fn(async () => ({ ...DEFAULT_CONFIG, services: [SVC] }))
      await harness({ ...answering({ ok: false, error: { kind: 'auth', message: 'bad key', isolatable: false, status: 401 } }), health: refused, getConfig: stored }).send(named)
      expect(refused.reject).toHaveBeenCalledWith('svc-abcd1234')

      const plain = health()
      await harness({ ...answering(good), health: plain }).send({ ...CALL, type: 'axt:translate' })
      await harness({ ...answering(good), health: plain }).send({ ...named, providerId: 'google-web' })
      expect(plain.clear).not.toHaveBeenCalled()
      expect(plain.reject).not.toHaveBeenCalled()
    })

    it('a named call marks only a 401 (the redesign\'s design, §4): a 403 is not about the key, and a service no longer stored is not marked', async () => {
      const answering = (error: unknown) => ({ router: { forCall: vi.fn(async () => ({ translate: vi.fn(async () => ({ ok: false, error })) })) } as unknown as HandlerDeps['router'] })
      const named = { ...CALL, type: 'axt:translate' as const, providerId: SVC.id }
      const withService = vi.fn(async () => ({ ...DEFAULT_CONFIG, services: [SVC] }))
      for (const error of [
        { kind: 'auth', message: 'forbidden', isolatable: false, status: 403 },
        { kind: 'auth', message: 'no status', isolatable: false },
        { kind: 'rate-limit', message: 'slow down', isolatable: false, status: 429 },
        { kind: 'network', message: 'offline', isolatable: false },
      ]) {
        const health = { reject: vi.fn(async () => undefined), clear: vi.fn(async () => true) }
        const answer = await harness({ ...answering(error), health, getConfig: withService }).send(named)
        expect([error.message, health.reject.mock.calls.length]).toEqual([error.message, 0])
        // the answer itself is untouched: the settings page shows the failure as it came
        expect(answer).toEqual({ ok: false, error })
      }
      const gone = { reject: vi.fn(async () => undefined), clear: vi.fn(async () => true) }
      await harness({ ...answering({ kind: 'auth', message: 'bad key', isolatable: false, status: 401 }), health: gone, getConfig: vi.fn(async () => DEFAULT_CONFIG) }).send(named)
      expect(gone.reject).not.toHaveBeenCalled()
    })

    it('a candidate\'s test (a service as the settings page would save it): a success clears the mark only when it tested the stored key and address; a failure touches nothing (the redesign\'s design, §4; ruling 16)', async () => {
      const answering = (answer: unknown) => ({ router: { forCall: vi.fn(async () => ({ translate: vi.fn(async () => answer) })) } as unknown as HandlerDeps['router'] })
      const health = () => ({ reject: vi.fn(async () => undefined), clear: vi.fn(async () => true) })
      const stored = vi.fn(async () => ({ ...DEFAULT_CONFIG, services: [SVC] }))
      const tested = (candidate: typeof SVC) => ({ ...CALL, type: 'axt:translate' as const, providerId: SVC.id, candidate })
      const good = { ok: true, result: { segments: [], provider: SVC.id }, cached: 0 }

      // the stored key and address, another model: the stored key answered
      const same = health()
      await harness({ ...answering(good), health: same, getConfig: stored }).send(tested({ ...SVC, model: 'other/model' }))
      expect(same.clear).toHaveBeenCalledWith(SVC.id)

      // a new key: not cleared here — the save that follows changes the key, and the watcher clears the mark then
      const renewed = health()
      await harness({ ...answering(good), health: renewed, getConfig: stored }).send(tested({ ...SVC, apiKey: 'sk-new' }))
      expect(renewed.clear).not.toHaveBeenCalled()

      // a refusal, of the stored key or another: nothing marked, nothing cleared, the answer as it came
      for (const candidate of [SVC, { ...SVC, apiKey: 'sk-new' }]) {
        const failed = health()
        const error = { kind: 'auth', message: 'bad key', isolatable: false, status: 401 }
        const answer = await harness({ ...answering({ ok: false, error }), health: failed, getConfig: stored }).send(tested(candidate))
        expect([failed.reject.mock.calls.length, failed.clear.mock.calls.length]).toEqual([0, 0])
        expect(answer).toEqual({ ok: false, error })
      }
    })

    it('a record write that fails leaves the test\'s answer as the service gave it: the record is kept beside the answer, never instead of it (#299, row 28; Codex on #306)', async () => {
      const answering = (answer: unknown) => ({ router: { forCall: vi.fn(async () => ({ translate: vi.fn(async () => answer) })) } as unknown as HandlerDeps['router'] })
      const refusing = () => ({ reject: vi.fn(async () => { throw new Error('storage refused') }), clear: vi.fn(async () => { throw new Error('storage refused') }) })
      const stored = vi.fn(async () => ({ ...DEFAULT_CONFIG, services: [SVC] }))
      const named = { ...CALL, type: 'axt:translate' as const, providerId: SVC.id }
      const good = { ok: true, result: { segments: [], provider: SVC.id }, cached: 0 }
      const refusal = { ok: false, error: { kind: 'auth', message: 'bad key', isolatable: false, status: 401 } }

      // a success whose clear fails, the stored service's and a candidate's with the stored key: still a success
      const cleared = harness({ ...answering(good), health: refusing(), getConfig: stored })
      await expect(cleared.send(named)).resolves.toEqual(good)
      await expect(cleared.send({ ...named, candidate: SVC })).resolves.toEqual(good)
      // a refusal whose mark fails: still that refusal, not a failure before any request
      const marked = harness({ ...answering(refusal), health: refusing(), getConfig: stored })
      await expect(marked.send(named)).resolves.toEqual(refusal)
      // and the log says the record was not written, with nothing of the key
      expect(cleared.lines.map(([, line]) => line)).toEqual([expect.stringContaining('record'), expect.stringContaining('record')])
      expect(marked.lines.map(([, line]) => line)).toEqual([expect.stringContaining('record')])
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

  describe('axt:ocr', () => {
    const call = { type: 'axt:ocr', imageHash: 'h', image: '', mime: 'image/png', paper: 'p', scope: 's1' } as const

    it('binds the scope to the sender\'s tab before the recognition is asked for', async () => {
      const order: string[] = []
      const bind = vi.fn(() => void order.push('bind'))
      const ocr = vi.fn(async () => { order.push('ocr'); return { ok: false as const, error: { kind: 'unknown' as const, message: 'x' } } })
      const { send } = harness({ router: { bind } as unknown as HandlerDeps['router'], ocr: { ocr } })
      await send(call)
      expect(bind).toHaveBeenCalledWith('s1', 7)
      expect(order).toEqual(['bind', 'ocr'])
    })

    it('a call without a scope binds nothing, and a recognition that throws is answered as a failure', async () => {
      const bind = vi.fn()
      const ocr = vi.fn(async () => { throw new Error('port closed') })
      const { send } = harness({ router: { bind } as unknown as HandlerDeps['router'], ocr: { ocr } })
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

  it('axt:toggle-decision answers what the toggle would do in the tab that asked, doing nothing; from an extension page nothing, and a page with no decision null', async () => {
    const { send, deps } = harness()
    await expect(send({ type: 'axt:toggle-decision' })).resolves.toEqual({ decision: { action: 'retranslate', behind: false, enabled: true } })
    expect(deps.decide).toHaveBeenCalledWith(7)
    expect(deps.toggle).not.toHaveBeenCalled()
    expect(send({ type: 'axt:toggle-decision' }, { tabId: undefined })).toBeUndefined()
    vi.mocked(deps.decide).mockResolvedValueOnce(undefined)
    await expect(send({ type: 'axt:toggle-decision' })).resolves.toEqual({ decision: null })
  })

  describe('axt:entry-settings', () => {
    const config = { ...DEFAULT_CONFIG, uiLanguage: 'ja', reading: { ...DEFAULT_CONFIG.reading, openIn: 'new-tab' } } as typeof DEFAULT_CONFIG
    const floating = { ...DEFAULT_FLOATING_ENTRY, side: 'left' as const }

    it('answers what a page needs of the configuration, the floating button\'s state and the tab\'s zoom', async () => {
      const { send, deps } = harness({ getConfig: async () => config, getFloatingEntry: async () => floating, zoomOf: vi.fn(async () => 1.25) })
      await expect(send({ type: 'axt:entry-settings' })).resolves.toEqual({ uiLanguage: 'ja', openIn: 'new-tab', zoom: 1.25, pdfReader: true, theme: 'system', floating })
      expect(deps.zoomOf).toHaveBeenCalledWith(7)
    })

    it('answers the PDF reader\'s switch, for the PDF page (the reader\'s design, §2)', async () => {
      const off = { ...config, pdfReader: { ...config.pdfReader, enabled: false } }
      const { send } = harness({ getConfig: async () => off, getFloatingEntry: async () => floating, zoomOf: vi.fn(async () => 1) })
      await expect(send({ type: 'axt:entry-settings' })).resolves.toMatchObject({ pdfReader: false })
    })

    it('answers the extension\'s appearance, for the floating button (the redesign\'s design, §3)', async () => {
      const dark = { ...config, theme: 'dark' as const }
      const { send } = harness({ getConfig: async () => dark, getFloatingEntry: async () => floating, zoomOf: vi.fn(async () => 1) })
      await expect(send({ type: 'axt:entry-settings' })).resolves.toMatchObject({ theme: 'dark' })
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

  it('axt:page-usable lights the toolbar button for the sender\'s tab, answers nothing, and survives a tab gone meanwhile', async () => {
    const lightAction = vi.fn(async () => undefined)
    const { send } = harness({ lightAction })
    expect(send({ type: 'axt:page-usable' }, { tabId: 7 })).toBeUndefined()
    expect(lightAction).toHaveBeenCalledWith(7)
    // From an extension page there is no tab, and no button of its own to light
    expect(send({ type: 'axt:page-usable' }, { tabId: undefined })).toBeUndefined()
    expect(lightAction).toHaveBeenCalledTimes(1)
    lightAction.mockRejectedValueOnce(new Error('No tab with id: 7'))
    expect(send({ type: 'axt:page-usable' }, { tabId: 7 })).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 0))
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
      'axt:entry-settings', 'axt:ocr', 'axt:open-settings', 'axt:page-usable',
      'axt:provider-status', 'axt:set-floating-entry', 'axt:tex-give-way', 'axt:tex-seen', 'axt:tex-warmed', 'axt:toggle', 'axt:toggle-decision', 'axt:translate',
    ])
  })

  describe('axt:tex-warmed', () => {
    it('hands the offscreen document\'s report to the warm-up, and a report it could not keep is a line in the log', async () => {
      const done = vi.fn(async () => undefined)
      const { send } = harness({ warmup: { done, seen: vi.fn(), giveWay: vi.fn() } })
      const result = { ok: true as const, lang: 'zh', versions: 'c/e/t/i', files: 41, bytes: 1, ms: 1 }
      await expect(send({ type: 'axt:tex-warmed', result })).resolves.toEqual({ ok: true })
      expect(done).toHaveBeenCalledWith(result)
      const failing = harness({ warmup: { done: vi.fn(async () => { throw new Error('storage gone') }), seen: vi.fn(), giveWay: vi.fn() } })
      await expect(failing.send({ type: 'axt:tex-warmed', result })).resolves.toEqual({ ok: true })
      expect(failing.lines.some(([, line]) => line.includes('storage gone'))).toBe(true)
    })

    it('the reader\'s: the versions its TeX page said, and that it needs the page now, handed to the warm-up', async () => {
      const seen = vi.fn(async () => undefined), giveWay = vi.fn(async () => undefined)
      const { send } = harness({ warmup: { done: vi.fn(), seen, giveWay } })
      await expect(send({ type: 'axt:tex-seen', versions: 'c/e/t/i' })).resolves.toEqual({ ok: true })
      expect(seen).toHaveBeenCalledWith('c/e/t/i')
      await expect(send({ type: 'axt:tex-give-way' })).resolves.toEqual({ ok: true })
      expect(giveWay).toHaveBeenCalledTimes(1)
    })
  })
})
