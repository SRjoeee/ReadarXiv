// The extension's PDF reader, its session (session/host.ts openReader; docs/PDF-READER.md §11.7, Stage 5 Tasks 9 and 12): the
// look it reads of the settings, the display a reader opens in, the settings written through the surface and followed as they
// land, the paper's version and title from its abstract page, and the run started once a translated display is shown. PDF.js
// and the view are stand-ins here: the view is its own file's to test (reader-view.test.ts), the run run.test.ts's, and the
// real page e2e:reader's
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { ENTRY_CHECK_MS } from '@/core/pdf/entry'
import type { SessionEvent } from '@/pdf-reader/session/events'

vi.mock('@/pdf-reader/pdfjs', () => ({ ASSETS: {}, EventBus: class {}, LinkTarget: {}, PDFLinkService: class {}, PDFPageView: class {}, PDFViewer: class {}, TextLayerBuilder: class {}, pdfjsLib: { getDocument: () => ({ promise: new Promise(() => {}), destroy: async () => {} }) } }))
const { displayFrom, openReader, outward, prefsOf } = await import('@/pdf-reader/session/host')
const { abstractOf, ownVersion } = await import('@/pdf-reader/session/paper')

/** the view as the host drives it: its commands recorded, its events the host's to hear */
function fakeView() {
  let host: { emit(e: unknown): void; prefs: { subscribe(l: (p: unknown) => void): () => void } } | null = null
  const v = {
    setDisplay: vi.fn((d: string) => host?.emit({ type: 'display', display: d })), setSync: vi.fn(), showOriginal: vi.fn(async () => 'opened'), dispose: vi.fn(),
    probe: vi.fn(() => ({ sync: true })), originalData: vi.fn(() => null), zoomBy: vi.fn(), zoomTo: vi.fn(), goToPage: vi.fn(), goToUnit: vi.fn(), lead: vi.fn(), pinch: vi.fn(), setNarrow: vi.fn(),
  }
  return { v, make: (h: never) => { host = h; return v as never }, host: () => host }
}
/** the settings' surface as the host takes it: what it holds, the landings a test makes, the writes the host asked */
function fakeSurface(stored: Config | null = DEFAULT_CONFIG, o: { refuse?: boolean } = {}) {
  let config = stored, onLanded: ((c: Config, from: 'first' | 'own' | 'elsewhere' | 'refused') => void) | null = null
  const writes: Config[] = []
  const surface = {
    start: () => () => {}, subscribe: () => () => {},
    state: () => ({ config, revision: null, fallbackReason: null, resetFailed: false, pack: null }),
    patch: async (change: (c: Config) => Config) => {
      if (o.refuse) throw new Error('storage refused')
      const next = change(config ?? DEFAULT_CONFIG)
      writes.push(next)
      config = next
      onLanded?.(next, 'own')
      return next
    },
  }
  return { writes, make: (deps: { onLanded?: typeof onLanded }) => { onLanded = deps.onLanded ?? null; return surface as never }, land: (next: Config, from: 'elsewhere' | 'first' = 'elsewhere') => { config = next; onLanded?.(next, from) } }
}
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve() }
async function opened(query = 'paper=2600.00001v1', o: { config?: Config; refuse?: boolean; fetch?: typeof fetch } = {}) {
  const view = fakeView(), surface = fakeSurface(o.config ?? DEFAULT_CONFIG, o)
  const events: SessionEvent[] = []
  const run = vi.fn(() => ({ retry: vi.fn(), retarget: vi.fn(), setClasses: vi.fn(), dispose: vi.fn(), side: null, probe: () => ({ state: 'looking', lost: 0 }) }))
  const session = await openReader(
    { left: document.createElement('div'), right: document.createElement('div'), params: new URLSearchParams(query), emit: e => events.push(e), reading: { config: o.config ?? DEFAULT_CONFIG, fallbackReason: null } },
    { view: view.make as never, surface: surface.make as never, store: null, run: run as never, fetch: o.fetch ?? (vi.fn(async () => new Response('', { status: 404 })) as never) },
  )
  return { session, view: view.v, surface, events, run }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('the host of the reading view', () => {
  it('reads the look of the settings: the panes swapped, the pages dimmed, the theme (the system\'s where asked), the highlight', () => {
    const config = { ...DEFAULT_CONFIG, theme: 'system' as const, pdfReader: { ...DEFAULT_CONFIG.pdfReader, swapped: true, dimPages: false }, reading: { ...DEFAULT_CONFIG.reading, sentenceHighlight: false } }
    expect(prefsOf(config, true)).toEqual({ swapped: true, dimPages: false, theme: 'dark', highlight: false })
    expect(prefsOf({ ...config, theme: 'light' }, true).theme).toBe('light')
    expect(prefsOf(config, false).theme).toBe('light')
  })

  it('opens in the display the address names, else, asked to translate, the translated display the settings name, else the settings\'', () => {
    const config = { ...DEFAULT_CONFIG, mode: 'only' as const, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: false } }
    expect(displayFrom(new URLSearchParams('mode=original'), config)).toBe('original')
    expect(displayFrom(new URLSearchParams(''), config)).toBe('translation')
    expect(displayFrom(new URLSearchParams('mode=nonsense'), { ...config, pdfReader: { ...config.pdfReader, original: true } })).toBe('original')
    expect(displayFrom(new URLSearchParams('ask=translate'), { ...config, mode: 'side', pdfReader: { ...config.pdfReader, original: true } })).toBe('bilingual')
  })

  it('opens a link out of the paper only for a web page or a mail address: no script, no data, no page of the browser\'s or the extension\'s', () => {
    for (const ok of ['https://example.org/a?b#c', 'http://example.org', 'mailto:someone@example.org']) expect(outward(ok), ok).toBe(true)
    for (const no of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'chrome-extension://abc/options.html', 'chrome://settings', 'file:///etc/passwd', 'blob:https://x/1', 'not a url', '']) expect(outward(no), no).toBe(false)
  })
})

describe('the run, once a translated display is shown (what is not seen takes no resources)', () => {
  it('starts in a translated display, over the paper\'s version; not in the original until the reader chooses a translated one', async () => {
    const a = await opened('paper=2600.00001v3')
    await flush()
    expect(a.run).toHaveBeenCalledTimes(1)
    expect((a.run.mock.calls[0] as unknown[])[1]).toEqual({ id: '2600.00001', version: 3 })
    const b = await opened('paper=2600.00001v3&mode=original')
    await flush()
    expect(b.run).not.toHaveBeenCalled()
    b.session.setDisplay('bilingual')
    await flush()
    expect(b.run).toHaveBeenCalledTimes(1)
  })

  it('an id with no version: the latest its abstract page lists, one request for it and the title', async () => {
    const html = '<!doctype html><meta name="citation_title" content=" A Title "><div class="submission-history"><b>[v1]</b> Mon <a href="/abs/2600.00001v2">[v2]</a> Tue <strong>[v3]</strong></div>'
    const fetch = vi.fn(async () => new Response(html, { status: 200 }))
    const a = await opened('paper=2600.00001', { fetch: fetch as never })
    await flush(20)
    expect((a.run.mock.calls[0] as unknown[])[1]).toEqual({ id: '2600.00001', version: 3 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://arxiv.org/abs/2600.00001', { credentials: 'omit', referrerPolicy: 'no-referrer', signal: expect.any(AbortSignal) })
    expect(abstractOf(html)).toEqual({ title: 'A Title', version: 3 })
    expect(ownVersion('hep-th/9711200v2')).toEqual({ id: 'hep-th/9711200', version: 2 })
    expect(ownVersion('2600.00001')).toBeNull()
  })

  it('an address whose paper is no arXiv id opens with no paper: nothing fetched, no run, no setting written, nothing thrown, whatever else it asks', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 404 }))
    for (const query of ['paper=../list/cs.AI/new&ask=translate', 'paper=xv3&ask=translate', 'live=1&paper=1706.03762/../../x&mode=bilingual']) {
      const a = await opened(query, { config: { ...DEFAULT_CONFIG, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: true } }, fetch: fetch as never })
      await flush(20)
      a.session.setDisplay('bilingual')
      await flush(20)
      expect([query, a.run.mock.calls.length, a.surface.writes.length, a.view.showOriginal.mock.calls.length]).toEqual([query, 0, 0, 0])
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('no version to be had (arXiv\'s page not read): the bilingual version cannot be had now, the original stays', async () => {
    const a = await opened('paper=2600.00001')
    await flush(20)
    expect(a.run).not.toHaveBeenCalled()
    expect(a.events).toContainEqual({ type: 'unavailable', why: 'unreachable', retryAt: null })
  })

  it('an unversioned paper whose abstract page failed and whose HTML probe never answers: unavailable still comes, within ENTRY_CHECK_MS', async () => {
    vi.useFakeTimers()
    try {
      const fetch = vi.fn((url: string) => (String(url).includes('/abs/') ? Promise.reject(new TypeError('Failed to fetch')) : new Promise<Response>(() => {})))
      const a = await opened('paper=2600.00001', { fetch: fetch as never })
      await vi.advanceTimersByTimeAsync(ENTRY_CHECK_MS - 1)
      expect(a.events.some(e => e.type === 'unavailable')).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(a.events).toContainEqual({ type: 'unavailable', why: 'unreachable', retryAt: null })
    } finally { vi.useRealTimers() }
  })

  it('an id with no version whose abstract page could not be read: a retry reads it again, and the run starts once arXiv answers (Devin on #390)', async () => {
    let up = false
    const html = '<!doctype html><meta name="citation_title" content="T"><div class="submission-history"><b>[v1]</b> <strong>[v2]</strong></div>'
    const fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/abs/')) { if (!up) throw new TypeError('Failed to fetch'); return new Response(html, { status: 200 }) }
      return new Response('', { status: 404 })
    })
    const a = await opened('paper=2600.00001', { fetch: fetch as never })
    await flush(20)
    expect(a.run).not.toHaveBeenCalled()
    expect(a.events).toContainEqual({ type: 'unavailable', why: 'unreachable', retryAt: null })
    up = true
    a.session.retry()
    await flush(30)
    expect(a.run).toHaveBeenCalledOnce()
    expect((a.run.mock.calls[0] as unknown[])[1]).toEqual({ id: '2600.00001', version: 2 })
  })

  it('a paper the layer cannot be had for: the original shown for the visit, the translated displays not chosen again; the HTML version said', async () => {
    const a = await opened()
    await flush()
    const emit = ((a.run.mock.calls[0] as unknown[])[2] as { emit(e: unknown): void }).emit
    emit({ type: 'unavailable', why: 'no-source', retryAt: null })
    await flush()
    expect(a.view.setDisplay).toHaveBeenLastCalledWith('original')
    expect(a.events).toContainEqual({ type: 'html', url: null })
    a.view.setDisplay.mockClear()
    a.session.setDisplay('bilingual')
    expect(a.view.setDisplay).not.toHaveBeenCalled()
    // passing ones leave the display alone
    const b = await opened()
    await flush()
    ;((b.run.mock.calls[0] as unknown[])[2] as { emit(e: unknown): void }).emit({ type: 'unavailable', why: 'unreachable', retryAt: null })
    expect(b.view.setDisplay).not.toHaveBeenCalledWith('original')
  })

  it('asks arXiv for the paper\'s HTML version once a visit, however often the bilingual version cannot be had', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 404 }))
    const a = await opened('paper=2600.00001v1', { fetch: fetch as never })
    await flush()
    const emit = ((a.run.mock.calls[0] as unknown[])[2] as { emit(e: unknown): void }).emit
    for (let i = 0; i < 4; i++) emit({ type: 'unavailable', why: 'refused', retryAt: Date.now() + 1000 })
    await flush(20)
    const html = (fetch.mock.calls as unknown as [string][]).filter(([url]) => String(url).includes('/html/'))
    expect(html).toHaveLength(1)
    expect(a.events.filter(e => e.type === 'html')).toHaveLength(4)
  })

  it('the original\'s download opens arXiv\'s PDF in a tab of its own, with no opener: the browser streams and saves it, the reader reads none of it', async () => {
    const opened_ = vi.fn(() => null)
    vi.stubGlobal('open', opened_)
    const a = await opened('paper=2600.00001v1')
    a.session.openOriginal()
    // the browser's viewer asked by the address, so that no reader is laid over the new tab; no opener, no referrer
    expect(opened_).toHaveBeenCalledWith('https://arxiv.org/pdf/2600.00001v1#axt-viewer', '_blank', 'noopener,noreferrer')
    expect(a.view.originalData).not.toHaveBeenCalled()
    expect(await a.session.pdfBytes('translation')).toBeNull()
  })

  it('asks the prepare once a visit, whatever the runs', async () => {
    const a = await opened()
    await flush()
    const may = ((a.run.mock.calls[0] as unknown[])[2] as { mayPrepare(): boolean }).mayPrepare
    expect([may(), may(), may()]).toEqual([true, false, false])
  })
})

describe('the settings, written and followed', () => {
  it('a display or a sync chosen here is written through the surface; a write that goes through is said, one refused told', async () => {
    const a = await opened()
    a.session.setDisplay('translation')
    a.session.setSyncMode('off')
    await flush(20)
    expect(a.surface.writes.map(c => [c.mode, c.pdfReader.original, c.pdfReader.sync])).toEqual([['only', false, true], ['only', false, false]])
    expect(a.events.filter(e => e.type === 'saved').length).toBe(2)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const b = await opened('paper=2600.00001v1', { refuse: true })
    b.session.patchSettings(c => ({ ...c, theme: 'dark' }))
    await flush(20)
    expect(b.events).toContainEqual({ type: 'refused' })
  })

  it('settings that land from elsewhere reach the controller and the view\'s look, and move the display and the sync by settings.ts\'s rule', async () => {
    const a = await opened()
    const changed = { ...DEFAULT_CONFIG, theme: 'dark' as const, mode: 'only' as const, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: false, sync: false } }
    a.surface.land(changed)
    expect(a.events).toContainEqual({ type: 'settings', config: changed, pack: null })
    expect(a.view.setDisplay).toHaveBeenLastCalledWith('translation')
    expect(a.view.setSync).toHaveBeenLastCalledWith(false)
    // a display chosen here is written, and a later change made elsewhere is followed as any is (the shipped reader's rule)
    a.session.setDisplay('bilingual')
    await flush(20)
    a.surface.land({ ...changed, mode: 'side', pdfReader: { ...changed.pdfReader, original: true, sync: false } })
    expect(a.view.setDisplay).toHaveBeenLastCalledWith('original')
  })

  it('a first read given up on: the display and sync the reader chose meanwhile stand over the late answer', async () => {
    const view = fakeView(), surface = fakeSurface(null)
    const run = vi.fn(() => ({ retry: vi.fn(), retarget: vi.fn(), dispose: vi.fn(), side: null, probe: () => ({ state: 'looking', lost: 0 }) }))
    const session = await openReader({ left: document.createElement('div'), right: document.createElement('div'), params: new URLSearchParams('paper=2600.00001v1'), emit: () => {}, reading: { config: DEFAULT_CONFIG, fallbackReason: { kind: 'unknown' } } }, { view: view.make as never, surface: surface.make as never, store: null, run: run as never, fetch: vi.fn(async () => new Response('', { status: 404 })) as never })
    session.setDisplay('original')
    session.setSyncMode('off')
    await flush(20)
    view.v.setDisplay.mockClear(); view.v.setSync.mockClear()
    surface.land({ ...DEFAULT_CONFIG, mode: 'only', pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: false, sync: true } }, 'first')
    expect(view.v.setDisplay).not.toHaveBeenCalled()
    expect(view.v.setSync).not.toHaveBeenCalled()
  })

  it('asked to translate (#readarxiv): an original left on is let go', async () => {
    const a = await opened('paper=2600.00001v1&ask=translate', { config: { ...DEFAULT_CONFIG, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: true } } })
    await flush(20)
    expect(a.surface.writes.at(-1)?.pdfReader.original).toBe(false)
  })

  it('an address that names the display holds it', async () => {
    const a = await opened('paper=2600.00001v1&mode=bilingual')
    a.view.setDisplay.mockClear()
    a.surface.land({ ...DEFAULT_CONFIG, mode: 'only', pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: false } })
    expect(a.view.setDisplay).not.toHaveBeenCalled()
  })

  it('a new target language once a translation has started is the run\'s, in place (its code the layer\'s), once this page\'s writes are in: the page is not loaded again', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...location, reload, search: '' })
    const a = await opened()
    await flush()
    const r = a.run.mock.results[0]?.value as { retarget: ReturnType<typeof vi.fn> }
    a.surface.land({ ...DEFAULT_CONFIG, targetLanguage: 'jpn' })
    await flush(20)
    expect(r.retarget).toHaveBeenCalledWith('ja')
    expect(reload).not.toHaveBeenCalled()
  })

  it('a hold for the language before is lifted by another target (the translated display shown again); a hold for the paper\'s own reason stays', async () => {
    const a = await opened()
    await flush()
    const r = a.run.mock.results[0]?.value as { retarget: ReturnType<typeof vi.fn> }
    const emit = ((a.run.mock.calls[0] as unknown[])[2] as { emit(e: unknown): void }).emit
    emit({ type: 'unavailable', why: 'target', retryAt: null })
    expect(a.view.setDisplay).toHaveBeenLastCalledWith('original')
    a.surface.land({ ...DEFAULT_CONFIG, targetLanguage: 'jpn' })
    await flush(20)
    expect(r.retarget).toHaveBeenCalledWith('ja')
    expect(a.view.setDisplay).toHaveBeenLastCalledWith(displayFrom(new URLSearchParams(''), DEFAULT_CONFIG))
    const b = await opened()
    await flush()
    const rb = b.run.mock.results[0]?.value as { retarget: ReturnType<typeof vi.fn> }
    ;((b.run.mock.calls[0] as unknown[])[2] as { emit(e: unknown): void }).emit({ type: 'unavailable', why: 'no-source', retryAt: null })
    b.surface.land({ ...DEFAULT_CONFIG, targetLanguage: 'jpn' })
    await flush(20)
    expect(rb.retarget).not.toHaveBeenCalled()
    expect(b.view.setDisplay).toHaveBeenLastCalledWith('original')
  })

  it('what to translate is the run\'s from its start, and a change of it, here or elsewhere, is told the run in place, once a change: nothing written to the image switch (S-R-27)', async () => {
    const a = await opened()
    await flush()
    const host = (a.run.mock.calls[0] as unknown[])[2] as { classes(): Config['pdfReader']['classes'] }
    expect(host.classes()).toEqual(DEFAULT_CONFIG.pdfReader.classes)
    const r = a.run.mock.results[0]?.value as { setClasses: ReturnType<typeof vi.fn> }
    // from the reading options: written through the surface, and followed as it lands
    a.session.patchSettings(c => ({ ...c, pdfReader: { ...c.pdfReader, classes: { ...c.pdfReader.classes, names: true } } }))
    await flush(20)
    const names = { ...DEFAULT_CONFIG.pdfReader.classes, names: true }
    expect(r.setClasses.mock.calls).toEqual([[names]])
    expect(a.surface.writes.at(-1)?.image).toEqual(DEFAULT_CONFIG.image)
    expect(host.classes()).toEqual(names)
    // from the settings page: the same; a landing that changes something else tells the run nothing more
    const back = { ...DEFAULT_CONFIG, pdfReader: { ...DEFAULT_CONFIG.pdfReader, classes: { ...names, tables: false } } }
    a.surface.land(back)
    a.surface.land({ ...back, reading: { ...back.reading, sentenceHighlight: false } })
    await flush(20)
    expect(r.setClasses.mock.calls).toEqual([[names], [back.pdfReader.classes]])
    // and the HTML page's figure switch is no toggle of the reader's
    a.surface.land({ ...back, image: { enabled: false } })
    await flush(20)
    expect(r.setClasses).toHaveBeenCalledTimes(2)
  })
})
