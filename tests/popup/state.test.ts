import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { CONFIG_VERSION, type Config, DEFAULT_CONFIG, MODE_VALUES } from '@/config/schema'
import { getConfig, setConfig } from '@/config/storage'
import { type PopupHost, createPopupState } from '@/entrypoints/popup/state'
import { MANAGE_SERVICES, MANAGE_STYLES } from '@/entrypoints/popup/view-model'
import type { ProviderStatus } from '@/providers/transport'
import { type AxtMessage, type EntryStatus, type PageStatus, answerMessages } from '@/shared/messages'
import type { PackState } from '@/shared/pack'
import { applyLocaleFrom } from '@/ui/apply-locale'

// What the popup knows and can do (popup/state.ts), through its interface: a page and a background that answer by
// script, the real configuration store on a fake browser, a clock the test moves. No React, no module replaced

const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-x', model: 'x/y', thinking: 'disabled' as const }
const BASE: Config = { ...DEFAULT_CONFIG, uiLanguage: 'en', services: [SVC] }
const status = (id: string): ProviderStatus => ({ providerId: id, chosen: id, available: true, maxBatchChars: 1, maxBatchItems: 1, renderPath: 'tags', targetLanguage: 'cmn', promptId: 'default', revision: id, chain: [id], demotions: [], identity: '', engine: { id } })
const page = (state: 'on' | 'stopped', session: string | null, epoch = 'd#1'): PageStatus => ({ paper: '2401.00001', mode: 'side', preference: 'side', progress: { state, total: 1, requested: 1, done: 1, failed: 0, cached: 0, inFlight: 0 }, session, epoch })

const until = async (done: () => boolean) => {
  for (let i = 0; i < 300 && !done(); i++) await new Promise(resolve => setTimeout(resolve, 0))
  expect(done()).toBe(true)
}
const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(resolve => setTimeout(resolve, 0)) }

/** A tab and a background that answer by script, and everything the popup asked of them, in order */
function world() {
  const w = {
    /** What the tab's full text answers `axt:page-status`: a status, `undefined` (a listener that ignores it), or `null` for no listener at all */
    page: null as PageStatus | null | undefined,
    entry: undefined as ({ paper: string; html: string | null } & Partial<EntryStatus>) | undefined,
    /** The tab's answers to the other messages */
    answers: {} as Record<string, unknown>,
    toTab: [] as AxtMessage[],
    toBackground: [] as AxtMessage[],
    /** Held provider asks, when the test wants to decide the order of the answers */
    hold: false,
    held: [] as { message: AxtMessage<'axt:provider-status'>; resolve(s: ProviderStatus): void; reject(e: unknown): void }[],
    broadcast: (_: unknown): void => undefined,
    opened: [] as string[],
    optionsPages: 0,
    closed: 0,
    downloads: [] as string[],
    reloads: 0,
    pack: 'available' as PackState,
    embedded: false,
  }
  const host: PopupHost = {
    toTab: (async (message: AxtMessage) => {
      w.toTab.push(message)
      if (message.type === 'axt:page-status') { if (w.page === null) throw new Error('Could not establish connection'); return w.page }
      if (message.type === 'axt:entry-status') return w.entry
      // An entry page ignores every message but its own two
      if (w.entry && message.type !== 'axt:open-html') return undefined
      return w.answers[message.type] ?? (message.type === 'axt:restore-page' ? { removedNodes: 1 } : { started: true })
    }) as PopupHost['toTab'],
    toBackground: (async (message: AxtMessage) => {
      w.toBackground.push(message)
      if (message.type === 'axt:provider-status') {
        if (w.hold) return new Promise((resolve, reject) => { w.held.push({ message, resolve, reject }) })
        return status(message.scope ? `session:${message.scope}` : 'saved')
      }
      return undefined
    }) as PopupHost['toBackground'],
    // The real listener over the popup's handlers, so a broadcast is decoded as the browser's would be
    onBroadcast: handlers => {
      const listen = answerMessages(handlers)
      w.broadcast = message => void listen(message, {}, () => undefined)
      return () => { w.broadcast = () => undefined }
    },
    openTab: async url => { w.opened.push(url) },
    openOptionsPage: () => { w.optionsPages++ },
    url: path => `ext://${path}`,
    shortcut: async () => '⌥T',
    get embedded() { return w.embedded },
    close: () => { w.closed++ },
    downloadPack: async target => { w.downloads.push(target) },
    config: { localeStale: () => false, reload: () => { w.reloads++ }, packState: async () => w.pack, announce: () => undefined },
  }
  const popup = createPopupState(host)
  const sent = (type: string) => w.toTab.filter(m => m.type === type)
  const asked = (scope?: string) => w.toBackground.filter((m): m is AxtMessage<'axt:provider-status'> => m.type === 'axt:provider-status' && m.scope === scope)
  return { w, popup, sent, asked, input: () => popup.state().input, error: () => popup.state().error }
}

/** Open the popup on a page and wait until it has heard from everyone */
async function opened(setup: (w: ReturnType<typeof world>['w']) => void = () => undefined) {
  const made = world()
  setup(made.w)
  const stop = made.popup.start()
  await until(() => made.input().config !== null && made.input().saved !== null)
  await flush()
  return { ...made, stop }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  fakeBrowser.reset()
  vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('en')
  applyLocaleFrom('en')
  await setConfig(BASE)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('opening the popup', () => {
  it('nothing is asked before it starts; then the page, the saved settings\' chain (with the barrier) and the shortcut', async () => {
    const made = world()
    made.w.page = page('stopped', null)
    await flush()
    expect(made.w.toTab).toEqual([])
    expect(made.w.toBackground).toEqual([])
    const stop = made.popup.start()
    await until(() => made.input().saved !== null && made.input().page !== null && made.input().config !== null)
    await flush()
    expect(made.asked()).toEqual([{ type: 'axt:provider-status', fresh: true }])
    expect(made.input()).toMatchObject({ page: { progress: { state: 'stopped' } }, entry: null, saved: { providerId: 'saved' }, session: null, shortcut: '⌥T', menu: null, pack: 'available' })
    expect(made.input().config).toEqual(BASE)
    expect(made.error()).toBeNull()
    stop()
  })

  it('the state is the same object until something changes: a subscriber rendered from it is not asked to render again for nothing', async () => {
    const p = await opened(w => { w.page = page('stopped', null) })
    const before = p.popup.state()
    expect(p.popup.state()).toBe(before)
    p.popup.actions.openMenu('service')
    expect(p.popup.state()).not.toBe(before)
    expect(p.input().menu).toBe('service')
    p.stop()
  })

  it('a page still loading is asked six more times, 500 ms apart, and no more; an answer ends the asking (Codex on #3)', async () => {
    const made = world()
    const stop = made.popup.start()
    await flush()
    expect(made.sent('axt:page-status')).toHaveLength(1)
    for (let i = 0; i < 3; i++) { vi.advanceTimersByTime(500); await flush() }
    expect(made.sent('axt:page-status')).toHaveLength(4)
    made.w.page = page('stopped', null)
    vi.advanceTimersByTime(500)
    await flush()
    expect(made.input().page).not.toBeNull()
    vi.advanceTimersByTime(5000)
    await flush()
    expect(made.sent('axt:page-status')).toHaveLength(5)
    stop()

    const silent = world()
    const stopSilent = silent.popup.start()
    for (let i = 0; i < 12; i++) { vi.advanceTimersByTime(500); await flush() }
    expect(silent.sent('axt:page-status')).toHaveLength(7)
    stopSilent()
  })

  it('an abstract or PDF page ignores the status ask — it resolves undefined — and is asked what it is instead (S-P-03b)', async () => {
    const p = await opened(w => { w.page = undefined; w.entry = { paper: '2501.07202', html: 'https://arxiv.org/html/2501.07202#readarxiv' } })
    expect(p.input().page).toBeNull()
    expect(p.input().entry).toEqual({ paper: '2501.07202', html: 'https://arxiv.org/html/2501.07202#readarxiv' })
    p.stop()
  })

  it('stopped, it asks and polls nothing more', async () => {
    const p = await opened(w => { w.page = page('on', 's1') })
    p.stop()
    const before = p.w.toTab.length + p.w.toBackground.length
    vi.advanceTimersByTime(3000)
    await flush()
    expect(p.w.toTab.length + p.w.toBackground.length).toBe(before)
  })
})

describe('while the page translates', () => {
  it('the page and its session\'s own chain are asked every 500 ms; when the page stops the polling stops and the saved chain is asked again', async () => {
    const p = await opened(w => { w.page = page('on', 's1') })
    const statusAsks = p.sent('axt:page-status').length
    vi.advanceTimersByTime(500)
    await flush()
    expect(p.sent('axt:page-status')).toHaveLength(statusAsks + 1)
    expect(p.asked('s1').length).toBeGreaterThan(0)
    expect(p.input().session?.providerId).toBe('session:s1')
    const savedAsks = p.asked().length
    p.w.page = page('stopped', null)
    vi.advanceTimersByTime(500)
    await flush()
    expect(p.input().page?.progress.state).toBe('stopped')
    expect(p.asked()).toHaveLength(savedAsks + 1)
    const after = p.sent('axt:page-status').length
    vi.advanceTimersByTime(2000)
    await flush()
    expect(p.sent('axt:page-status')).toHaveLength(after)
    p.stop()
  })

  it('a first saved ask that failed does not leave the button disabled after “Show original”: the chain is asked again when the page stops (local review)', async () => {
    const made = world()
    made.w.page = page('on', 's1')
    made.w.hold = true
    const stop = made.popup.start()
    await until(() => made.input().page?.progress.state === 'on' && made.w.held.length > 0)
    made.w.held.find(h => !h.message.scope)?.reject(new Error('the chain did not settle'))
    await flush()
    expect(made.input().saved).toBeNull()
    made.w.hold = false
    made.w.page = page('stopped', null)
    made.popup.actions.restore()
    await until(() => made.input().saved !== null)
    expect(made.asked().every(a => a.fresh === true)).toBe(true)
    stop()
  })

  it('the session\'s chain shows only once it has answered — never the saved chain in its place — and goes with its session (Codex on #185)', async () => {
    const made = world()
    made.w.page = page('on', 's1')
    made.w.hold = true
    const stop = made.popup.start()
    await until(() => made.input().page?.progress.state === 'on' && made.w.held.some(h => !h.message.scope))
    made.w.held.find(h => !h.message.scope)?.resolve(status('saved-chain'))
    await flush()
    expect(made.input()).toMatchObject({ saved: { providerId: 'saved-chain' }, session: null })
    vi.advanceTimersByTime(500)
    await until(() => made.w.held.some(h => h.message.scope === 's1'))
    // The page restarted onto another session before s1's answer came back: s1's hand-overs are not s2's
    made.w.page = page('on', 's2')
    vi.advanceTimersByTime(500)
    await until(() => made.input().page?.session === 's2')
    made.w.held.find(h => h.message.scope === 's1')?.resolve(status('s1-chain'))
    await flush()
    expect(made.input().session).toBeNull()
    stop()
  })
})

describe('the three page commands act on the epoch read at the click', () => {
  it('translate, retranslate and restore each ask the page its epoch and send the command every door sends', async () => {
    const p = await opened(w => { w.page = page('stopped', null, 'd#7') })
    p.popup.actions.translate()
    await until(() => p.sent('axt:translate-page').length === 1)
    p.popup.actions.retranslate()
    await until(() => p.sent('axt:translate-page').length === 2)
    p.popup.actions.restore()
    await until(() => p.sent('axt:restore-page').length === 1)
    expect(p.sent('axt:translate-page')).toEqual([{ type: 'axt:translate-page', epoch: 'd#7' }, { type: 'axt:translate-page', restart: true, epoch: 'd#7' }])
    expect(p.sent('axt:restore-page')).toEqual([{ type: 'axt:restore-page', epoch: 'd#7' }])
    expect(p.error()).toBeNull()
    p.stop()
  })

  it('the epoch is the page\'s at the click, not the last poll\'s: a hand-over restart in between would make that one stale', async () => {
    const p = await opened(w => { w.page = page('on', 's1', 'd#1') })
    p.w.page = page('on', 's2', 'd#2')
    p.popup.actions.restore()
    await until(() => p.sent('axt:restore-page').length === 1)
    expect(p.sent('axt:restore-page')[0]).toEqual({ type: 'axt:restore-page', epoch: 'd#2' })
    p.stop()
  })

  it('a refused start and a refused restore are said in the interface\'s language, and the page is asked again either way', async () => {
    const p = await opened(w => { w.page = page('stopped', null); w.answers['axt:translate-page'] = { started: false, reason: 'no-service' }; w.answers['axt:restore-page'] = { refused: true } })
    const asks = p.sent('axt:page-status').length
    p.popup.actions.translate()
    await until(() => p.error() !== null)
    expect(p.error()).not.toBe('no-service')
    expect(p.sent('axt:page-status').length).toBeGreaterThan(asks + 1)
    p.popup.actions.restore()
    await until(() => p.error() === 'That translation has ended')
    // The next action clears the line before it runs
    p.w.answers['axt:restore-page'] = { removedNodes: 1 }
    p.popup.actions.restore()
    await until(() => p.error() === null)
    p.stop()
  })

  it('retry-failed goes to the page', async () => {
    const p = await opened(w => { w.page = page('on', 's1') })
    p.popup.actions.retryFailed()
    await until(() => p.sent('axt:retry-failed').length === 1)
    p.stop()
  })
})

describe('a settings change restarts a page that is on, in place, once the background\'s chain reflects the save', () => {
  it('the save, then the saved chain asked fresh, then the restart with the page\'s epoch — in that order', async () => {
    const p = await opened(w => { w.page = page('on', 's1', 'd#3') })
    p.w.hold = true
    p.popup.actions.openMenu('language')
    p.popup.actions.chooseLanguage('jpn')
    expect(p.input().menu).toBeNull()
    await until(() => p.w.held.some(h => !h.message.scope))
    expect((await getConfig()).targetLanguage).toBe('jpn')
    // The restart waits for the chain built from what was just saved
    expect(p.sent('axt:translate-page')).toEqual([])
    for (const h of p.w.held.splice(0)) h.resolve(status('saved'))
    p.w.hold = false
    await until(() => p.sent('axt:translate-page').length === 1)
    expect(p.sent('axt:translate-page')[0]).toEqual({ type: 'axt:translate-page', restart: true, epoch: 'd#3' })
    p.stop()
  })

  it('a page that is not on is only saved for', async () => {
    const p = await opened(w => { w.page = page('stopped', null) })
    p.popup.actions.chooseLanguage('jpn')
    await until(() => p.input().config?.targetLanguage === 'jpn')
    await flush()
    expect(p.sent('axt:translate-page')).toEqual([])
    p.stop()
  })

  it('a choice that cannot run only saves: the offline service without its pack leaves the page where it is', async () => {
    const p = await opened(w => { w.page = page('on', 's1'); w.pack = 'downloadable' })
    p.popup.actions.chooseService('chrome-builtin')
    await until(() => p.input().config?.provider === 'chrome-builtin')
    await flush()
    expect(p.sent('axt:translate-page')).toEqual([])
    // With the pack there it restarts
    p.w.pack = 'available'
    p.popup.actions.chooseService('microsoft')
    await until(() => p.sent('axt:translate-page').length === 1)
    p.stop()
  })

  it('a service deleted in another tab while the menu was open is not stored, and nothing restarts (Codex on #157)', async () => {
    const p = await opened(w => { w.page = page('on', 's1') })
    p.popup.actions.chooseService('svc-gone')
    await flush()
    expect((await getConfig()).provider).toBe(BASE.provider)
    expect(p.sent('axt:translate-page')).toEqual([])
    p.popup.actions.chooseService(SVC.id)
    await until(() => p.sent('axt:translate-page').length === 1)
    expect((await getConfig()).provider).toBe(SVC.id)
    p.stop()
  })

  it('a prompt deleted in another tab while the menu was open is not stored, and nothing restarts: it would resolve to the default silently (local review)', async () => {
    await setConfig({ ...BASE, provider: SVC.id, prompts: { promptId: 'default', patterns: [{ id: 'mine', name: 'Mine', systemPrompt: 's {{targetLanguage}} {{glossary}}', prompt: '{{input}}' }] } })
    const p = await opened(w => { w.page = page('on', 's1') })
    p.popup.actions.choosePrompt('gone')
    await flush()
    expect((await getConfig()).prompts.promptId).toBe('default')
    expect(p.sent('axt:translate-page')).toEqual([])
    // The reader's own prompt and a built-in one both still name something
    p.popup.actions.choosePrompt('mine')
    await until(() => p.sent('axt:translate-page').length === 1)
    expect((await getConfig()).prompts.promptId).toBe('mine')
    p.popup.actions.choosePrompt('precision-rewrite')
    await until(() => p.sent('axt:translate-page').length === 2)
    p.stop()
  })

  it('a prompt restarts the page only when the chosen service reads prompts', async () => {
    const p = await opened(w => { w.page = page('on', 's1') })
    p.popup.actions.choosePrompt('precision-rewrite')
    await until(() => p.input().config?.prompts.promptId === 'precision-rewrite')
    await flush()
    expect(p.sent('axt:translate-page')).toEqual([])
    await setConfig({ ...(await getConfig()), provider: SVC.id })
    p.popup.actions.choosePrompt('default')
    await until(() => p.sent('axt:translate-page').length === 1)
    p.stop()
  })
})

describe('the choices the page applies by itself are saved and nothing is sent', () => {
  it('a style that still exists is stored; one deleted elsewhere is not (Codex on #161); the highlight and image switches', async () => {
    const p = await opened(w => { w.page = page('on', 's1') })
    const style = BASE.appearance.styles[1]?.id ?? BASE.appearance.styles[0]!.id
    p.popup.actions.chooseStyle(style)
    await until(() => p.input().config?.appearance.activeStyle === style)
    p.popup.actions.chooseStyle('style-gone')
    await flush()
    expect((await getConfig()).appearance.activeStyle).toBe(style)
    p.popup.actions.setHighlight(!BASE.reading.sentenceHighlight)
    await until(() => p.input().config?.reading.sentenceHighlight === !BASE.reading.sentenceHighlight)
    expect(p.sent('axt:translate-page')).toEqual([])
    p.stop()
  })

  it('switching images back on with every mode unticked ticks them all: enabled with no mode to run in shows as on and does nothing (Codex on #157)', async () => {
    await setConfig({ ...BASE, image: { enabled: false, modes: [] } })
    const p = await opened(w => { w.page = page('stopped', null) })
    p.popup.actions.setImages(true)
    await until(() => p.input().config?.image.enabled === true)
    expect(p.input().config?.image.modes).toEqual([...MODE_VALUES])
    p.popup.actions.setImages(false)
    await until(() => p.input().config?.image.enabled === false)
    expect(p.input().config?.image.modes).toEqual([...MODE_VALUES])
    p.stop()
  })

  it('a mode: on the full text the page switches and saves it itself; on an abstract or PDF page it is saved here (Devin on #247)', async () => {
    const full = await opened(w => { w.page = page('on', 's1') })
    full.popup.actions.chooseMode('stack')
    await until(() => full.sent('axt:set-mode').length === 1)
    expect(full.sent('axt:set-mode')[0]).toEqual({ type: 'axt:set-mode', mode: 'stack' })
    expect((await getConfig()).mode).toBe(BASE.mode)
    full.stop()

    const abs = await opened(w => { w.page = undefined; w.entry = { paper: '2501.07202', html: 'https://arxiv.org/html/2501.07202#readarxiv' } })
    abs.popup.actions.chooseMode('only')
    await until(() => abs.input().config?.mode === 'only')
    expect(abs.sent('axt:set-mode')).toEqual([])
    expect(abs.error()).toBeNull()
    abs.stop()
  })

  it('a stored configuration this build cannot read: the write is refused, and the popup says so on its error line', async () => {
    const p = await opened(w => { w.page = page('stopped', null) })
    await fakeBrowser.storage.local.set({ config: { ...BASE, version: CONFIG_VERSION + 1 }, config$: { v: CONFIG_VERSION + 1 } })
    p.popup.actions.setHighlight(false)
    await until(() => p.error() !== null)
    expect(p.error()).toMatch(/settings/i)
    p.stop()
  })
})

describe('the rows that lead elsewhere', () => {
  it('“Manage services” brings the settings page to the front; “Manage styles” opens its Reading section; framed beside the floating button the popup asks to go', async () => {
    const p = await opened(w => { w.page = page('stopped', null) })
    p.popup.actions.chooseService(MANAGE_SERVICES)
    await flush()
    expect(p.w.optionsPages).toBe(1)
    expect(p.w.closed).toBe(0)
    p.w.embedded = true
    p.popup.actions.chooseStyle(MANAGE_STYLES)
    await flush()
    expect(p.w.opened).toEqual(['ext:///options.html#reading'])
    expect(p.w.closed).toBe(1)
    p.popup.actions.openOptions()
    expect(p.w.optionsPages).toBe(2)
    expect((await getConfig()).provider).toBe(BASE.provider)
    p.stop()
  })

  it('an abstract or PDF page: the paper opens in a new tab by default, in this tab when the reader chose so, and the popup closes; with no HTML version it says why', async () => {
    const html = 'https://arxiv.org/html/2501.07202#readarxiv'
    const p = await opened(w => { w.page = undefined; w.entry = { paper: '2501.07202', html } })
    p.popup.actions.openHtml()
    await until(() => p.w.closed === 1)
    expect(p.w.opened).toEqual([html])
    await setConfig({ ...(await getConfig()), reading: { ...BASE.reading, openIn: 'same-tab' } })
    await until(() => p.input().config?.reading.openIn === 'same-tab')
    p.w.answers['axt:open-html'] = { opened: true }
    p.popup.actions.openHtml()
    await until(() => p.w.closed === 2)
    expect(p.sent('axt:open-html')).toHaveLength(1)
    expect(p.w.opened).toEqual([html])
    p.stop()

    const none = await opened(w => { w.page = undefined; w.entry = { paper: '2501.07202', html: null } })
    none.popup.actions.openHtml()
    await until(() => none.error() !== null)
    expect(none.error()).toMatch(/no HTML version/)
    expect(none.w.closed).toBe(0)
    none.stop()
  })

  it('the PDF entry opens the paper\'s PDF asking for the reader, in a new tab by default or on the page itself, and the popup closes (the reader\'s design, §2)', async () => {
    const pdf = 'https://arxiv.org/pdf/2501.07202#readarxiv'
    const p = await opened(w => { w.page = undefined; w.entry = { paper: '2501.07202', html: null, kind: 'abs', pdf, readerOpen: false } })
    p.popup.actions.openPdf()
    await until(() => p.w.closed === 1)
    expect(p.w.opened).toEqual([pdf])
    await setConfig({ ...(await getConfig()), reading: { ...BASE.reading, openIn: 'same-tab' } })
    await until(() => p.input().config?.reading.openIn === 'same-tab')
    p.w.answers['axt:open-pdf'] = { opened: true }
    p.popup.actions.openPdf()
    await until(() => p.w.closed === 2)
    expect(p.sent('axt:open-pdf')).toHaveLength(1)
    p.stop()
  })
})

describe('the offline service\'s pack and the broadcasts', () => {
  it('a download runs from the click, moves this tab\'s session onto the rebuilt chain, and asks the saved chain again (Codex on #157)', async () => {
    const p = await opened(w => { w.page = page('on', 's1'); w.pack = 'downloadable' })
    const before = p.asked().length
    p.popup.actions.downloadPack()
    await until(() => p.w.toBackground.some(m => m.type === 'axt:engine-ready'))
    expect(p.w.downloads).toEqual([BASE.targetLanguage])
    expect(p.w.toBackground.find(m => m.type === 'axt:engine-ready')).toEqual({ type: 'axt:engine-ready', id: 'chrome-builtin', scope: 's1' })
    await until(() => p.asked().length > before)
    p.stop()
  })

  it('a pack downloaded on the settings page is looked up again, another target\'s is not', async () => {
    const p = await opened(w => { w.page = page('stopped', null); w.pack = 'downloadable' })
    p.w.pack = 'available'
    p.w.broadcast({ type: 'axt:pack-changed', target: 'jpn' })
    await flush()
    expect(p.input().pack).toBe('downloadable')
    p.w.broadcast({ type: 'axt:pack-changed', target: BASE.targetLanguage })
    await until(() => p.input().pack === 'available')
    p.stop()
  })

  it('a change saved elsewhere shows without reopening, and the saved chain is asked fresh', async () => {
    const p = await opened(w => { w.page = page('stopped', null) })
    const before = p.asked().length
    await setConfig({ ...BASE, targetLanguage: 'jpn' })
    await until(() => p.input().config?.targetLanguage === 'jpn' && p.asked().length > before)
    expect(p.asked().at(-1)).toEqual({ type: 'axt:provider-status', fresh: true })
    expect(p.w.reloads).toBe(0)
    p.stop()
  })
})
