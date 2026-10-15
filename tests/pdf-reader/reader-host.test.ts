// The extension's host of the reading view (session/host.ts; docs/PDF-READER.md §11.7): the look it reads of the
// settings, and the display a reader opens in. PDF.js is not loaded here: the host's kit is checked in a real browser by
// pnpm e2e:reader's development entry
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'

vi.mock('@/pdf-reader/pdfjs', () => ({ ASSETS: {}, EventBus: class {}, LinkTarget: {}, PDFLinkService: class {}, PDFPageView: class {}, PDFViewer: class {}, pdfjsLib: {} }))
// the view itself is its own file's to test (reader-view.test.ts): here, what the host asks of it
const view = vi.hoisted(() => ({ setDisplay: vi.fn(), setSync: vi.fn(), showOriginal: vi.fn(async () => 'opened'), dispose: vi.fn(), probe: vi.fn(() => ({})), originalData: vi.fn(() => null) }))
vi.mock('@/pdf-reader/engine/view.mjs', () => ({ createReaderView: () => view }))
const { displayFrom, openView, outward, prefsOf, readerHost } = await import('@/pdf-reader/session/host.ts')

describe('the host of the reading view', () => {
  it('reads the look of the settings: the panes swapped, the pages dimmed, the theme (the system\'s where asked), the highlight', () => {
    const config = { ...DEFAULT_CONFIG, theme: 'system' as const, pdfReader: { ...DEFAULT_CONFIG.pdfReader, swapped: true, dimPages: false }, reading: { ...DEFAULT_CONFIG.reading, sentenceHighlight: false } }
    expect(prefsOf(config, true)).toEqual({ swapped: true, dimPages: false, theme: 'dark', highlight: false })
    expect(prefsOf({ ...config, theme: 'light' }, true).theme).toBe('light')
    expect(prefsOf(config, false).theme).toBe('light')
  })

  it('opens in the display the address names, else the settings\'', () => {
    const config = { ...DEFAULT_CONFIG, mode: 'only' as const, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: false } }
    expect(displayFrom(new URLSearchParams('mode=original'), config)).toBe('original')
    expect(displayFrom(new URLSearchParams(''), config)).toBe('translation')
    expect(displayFrom(new URLSearchParams('mode=nonsense'), { ...config, pdfReader: { ...config.pdfReader, original: true } })).toBe('original')
  })
})

describe('a link out of the paper', () => {
  it('opens only a web page or a mail address: no script, no data, no page of the browser\'s or the extension\'s', () => {
    for (const ok of ['https://example.org/a?b#c', 'http://example.org', 'mailto:someone@example.org']) expect(outward(ok), ok).toBe(true)
    for (const no of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'chrome-extension://abc/options.html', 'chrome://settings', 'file:///etc/passwd', 'blob:https://x/1', 'not a url', '']) expect(outward(no), no).toBe(false)
  })
})

describe('the settings as they change elsewhere', () => {
  it('reach the controller (the page\'s look is drawn from its state) and the view\'s preferences', () => {
    let changed: (c: typeof DEFAULT_CONFIG) => void = () => {}
    const emit = vi.fn()
    const host = readerHost({ left: document.createElement('div'), right: document.createElement('div'), params: new URLSearchParams(''), emit }, DEFAULT_CONFIG, '2600.00001', cb => { changed = cb; return () => {} })
    const heard: unknown[] = []
    host.prefs.subscribe(p => heard.push(p))
    const next = { ...DEFAULT_CONFIG, theme: 'dark' as const, pdfReader: { ...DEFAULT_CONFIG.pdfReader, swapped: true } }
    changed(next)
    expect(emit).toHaveBeenCalledWith({ type: 'settings', config: next, pack: null })
    expect(heard).toEqual([prefsOf(next, false)])
    host.stop()
  })

  const panes = () => ({ left: document.createElement('div'), right: document.createElement('div'), params: new URLSearchParams('') })
  it('a first read the page gave up on (no answer in its time) is read again, and the late answer followed', async () => {
    const emit = vi.fn()
    const stored = { ...DEFAULT_CONFIG, theme: 'dark' as const }
    let answer: (r: { config: typeof DEFAULT_CONFIG; fallbackReason: null }) => void = () => {}
    const read = vi.fn(() => new Promise<{ config: typeof DEFAULT_CONFIG; fallbackReason: null }>(r => { answer = r }))
    const host = readerHost({ ...panes(), emit, reading: null }, DEFAULT_CONFIG, '2600.00001', () => () => {}, read)
    const heard: unknown[] = []
    host.prefs.subscribe(p => heard.push(p))
    expect(read).toHaveBeenCalledTimes(1)
    answer({ config: stored, fallbackReason: null })
    await Promise.resolve(); await Promise.resolve()
    expect(emit).toHaveBeenCalledWith({ type: 'settings', config: stored, pack: null })
    // and the settings are no longer said to be unreadable
    expect(emit).toHaveBeenCalledWith({ type: 'notice', why: null })
    expect(heard).toEqual([prefsOf(stored, false)])
    // a page whose first read answered reads nothing again
    const again = vi.fn()
    readerHost({ ...panes(), emit: vi.fn(), reading: { config: stored, fallbackReason: null } }, stored, 'x', () => () => {}, again).stop()
    expect(again).not.toHaveBeenCalled()
    host.stop()
  })

  it('valid settings coming in clear the notice of unreadable ones', () => {
    let changed: (c: typeof DEFAULT_CONFIG) => void = () => {}
    const emit = vi.fn()
    const host = readerHost({ ...panes(), emit, reading: { config: DEFAULT_CONFIG, fallbackReason: { kind: 'unknown' } } }, DEFAULT_CONFIG, 'x', cb => { changed = cb; return () => {} }, vi.fn())
    changed({ ...DEFAULT_CONFIG, theme: 'light' })
    expect(emit).toHaveBeenCalledWith({ type: 'notice', why: null })
    host.stop()
  })
})

describe('the view opened on a first read given up on', () => {
  const late = { ...DEFAULT_CONFIG, mode: 'only' as const, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: false, sync: false } }
  const open = (read: () => Promise<{ config: typeof DEFAULT_CONFIG; fallbackReason: null }>) => openView({ left: document.createElement('div'), right: document.createElement('div'), params: new URLSearchParams('paper=2600.00001'), emit: vi.fn(), reading: null }, { watch: () => () => {}, read })
  it('takes the display and the sync of the late answer, where the reader has not chosen them meanwhile', async () => {
    view.setDisplay.mockClear(); view.setSync.mockClear()
    open(async () => ({ config: late, fallbackReason: null }))
    expect(view.setDisplay.mock.calls).toEqual([['bilingual']])
    expect(view.setSync.mock.calls).toEqual([[true]])
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(view.setDisplay.mock.calls.at(-1)).toEqual(['translation'])
    expect(view.setSync.mock.calls.at(-1)).toEqual([false])
  })

  it('keeps what the reader chose before the late answer came', async () => {
    view.setDisplay.mockClear(); view.setSync.mockClear()
    let answer: (r: { config: typeof DEFAULT_CONFIG; fallbackReason: null }) => void = () => {}
    const session = open(() => new Promise(r => { answer = r }))
    session.setDisplay('original')
    session.setSyncMode('same')
    answer({ config: late, fallbackReason: null })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(view.setDisplay.mock.calls.at(-1)).toEqual(['original'])
    expect(view.setSync.mock.calls.at(-1)).toEqual([true])
  })
})

