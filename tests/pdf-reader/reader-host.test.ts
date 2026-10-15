// The extension's host of the reading view (session/host.ts; docs/PDF-READER.md §11.7): the look it reads of the
// settings, and the display a reader opens in. PDF.js is not loaded here: the host's kit is checked in a real browser by
// pnpm e2e:reader's development entry
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'

vi.mock('@/pdf-reader/pdfjs', () => ({ ASSETS: {}, EventBus: class {}, LinkTarget: {}, PDFLinkService: class {}, PDFPageView: class {}, PDFViewer: class {}, pdfjsLib: {} }))
// the view itself is its own file's to test (reader-view.test.ts): here, what the host asks of it
const view = vi.hoisted(() => ({ setDisplay: vi.fn(), setSync: vi.fn(), showOriginal: vi.fn(async () => 'opened'), dispose: vi.fn(), probe: vi.fn(() => ({})), originalData: vi.fn(() => null) }))
vi.mock('@/pdf-reader/engine/view.mjs', () => ({ createReaderView: () => view }))
const { displayFrom, layerTransport, openView, outward, prefsOf, readerHost } = await import('@/pdf-reader/session/host.ts')

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

describe('the settings changed elsewhere while the view is open', () => {
  const changed = { ...DEFAULT_CONFIG, mode: 'only' as const, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: false, sync: false } }
  const open = (watch: (cb: (c: typeof DEFAULT_CONFIG) => void) => () => void, query = 'paper=2600.00001') => openView({ left: document.createElement('div'), right: document.createElement('div'), params: new URLSearchParams(query), emit: vi.fn(), reading: { config: DEFAULT_CONFIG, fallbackReason: null } }, { watch, read: vi.fn() })
  it('move the view\'s display and sync as a late read does: unless the address names the display or the reader chose', () => {
    let tell: (c: typeof DEFAULT_CONFIG) => void = () => {}
    view.setDisplay.mockClear(); view.setSync.mockClear()
    const session = open(cb => { tell = cb; return () => {} })
    tell(changed)
    expect(view.setDisplay.mock.calls.at(-1)).toEqual(['translation'])
    expect(view.setSync.mock.calls.at(-1)).toEqual([false])
    session.setDisplay('original')
    session.setSyncMode('same')
    tell({ ...changed, pdfReader: { ...changed.pdfReader, original: false, sync: false } })
    expect(view.setDisplay.mock.calls.at(-1)).toEqual(['original'])
    expect(view.setSync.mock.calls.at(-1)).toEqual([true])
    // an address that names the display holds it
    view.setDisplay.mockClear()
    open(cb => { tell = cb; return () => {} }, 'paper=2600.00001&mode=bilingual')
    tell(changed)
    expect(view.setDisplay.mock.calls).toEqual([['bilingual']])
  })
})

describe('the paper\'s title where its PDF has none', () => {
  const panes = () => ({ left: document.createElement('div'), right: document.createElement('div'), params: new URLSearchParams(''), emit: vi.fn() })
  it('is the abstract page\'s citation_title, one request to arXiv made only then; nothing where it cannot be had', async () => {
    const fetch = vi.fn(async (url: string) => new Response('<!doctype html><meta name="citation_title" content="  Counting Lattice Paths  ">', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const host = readerHost({ ...panes(), reading: { config: DEFAULT_CONFIG, fallbackReason: null } }, DEFAULT_CONFIG, '2600.00001', () => () => {}, vi.fn())
    expect(await host.titleFallback?.()).toBe('Counting Lattice Paths')
    expect(fetch).toHaveBeenCalledWith('https://arxiv.org/abs/2600.00001', { credentials: 'omit' })
    fetch.mockImplementationOnce(async () => new Response('gone', { status: 404 }))
    expect(await host.titleFallback?.()).toBe('')
    fetch.mockImplementationOnce(async () => { throw new TypeError('offline') })
    expect(await host.titleFallback?.()).toBe('')
    host.stop()
    vi.unstubAllGlobals()
  })
})


describe('the layer\'s transport (layerTransport)', () => {
  const sha256 = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>))].map(x => x.toString(16).padStart(2, '0')).join('')
  const original = new Uint8Array([37, 80, 68, 70, 45, 49])
  const viewOf = (data: Uint8Array | null) => ({ originalData: () => (data ? Promise.resolve(data) : null) }) as never

  it('fetches an object by its whole digest under the reader\'s ctag, with no credentials; an answer that is not ok refuses it', async () => {
    const { CTAG4 } = await import('@/pdf-reader/engine/layer-proto/format.mjs')
    const calls: [string, RequestInit][] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { calls.push([url, init]); return url.endsWith('b'.repeat(64)) ? new Response('nope', { status: 404 }) : new Response(new Uint8Array([1, 2, 3])) })
    const t = layerTransport(viewOf(original), 'https://readarxiv.com', { id: 'math/0601001', version: 2 })
    const signal = new AbortController().signal
    expect([...(await t.fetchObject({ kind: 'part', sha256: 'a'.repeat(64), bytes: 3 }, signal))]).toEqual([1, 2, 3])
    expect(calls[0]?.[0]).toBe(`https://readarxiv.com/api/v1/layer/math_0601001v2/${CTAG4}/o/${'a'.repeat(64)}`)
    expect(calls[0]?.[1]).toMatchObject({ credentials: 'omit', signal })
    await expect(t.fetchObject({ kind: 'part', sha256: 'b'.repeat(64), bytes: 3 }, signal)).rejects.toThrow(/404/)
    vi.unstubAllGlobals()
  })

  it('binds the base where the original\'s bytes are its length and its digest, and nowhere else', async () => {
    const base = { bytes: original.length, sha256: await sha256(original), xref: 0 }
    expect(await layerTransport(viewOf(original), 'https://x', { id: '2600.00001', version: 1 }).bind(base)).toBe(true)
    expect(await layerTransport(viewOf(original), 'https://x', { id: '2600.00001', version: 1 }).bind({ ...base, sha256: 'c'.repeat(64) })).toBe(false)
    expect(await layerTransport(viewOf(original), 'https://x', { id: '2600.00001', version: 1 }).bind({ ...base, bytes: 7 })).toBe(false)
    expect(await layerTransport(viewOf(null), 'https://x', { id: '2600.00001', version: 1 }).bind(base)).toBe(false)
  })
})
