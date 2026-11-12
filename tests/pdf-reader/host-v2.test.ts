// The extension as the reader package's host (AXT_READER 'v2'): host conformance as interfaces/host design-a §5 names it,
// for the members whose adapters are the extension's (fetch, prefs; translate in host-translate.test.ts), and the reader's
// state told to the chrome as its events
import { describe, expect, it, vi } from 'vitest'
import { DEFAULTS, eventsOf, INITIAL, type ReaderState, reduce } from '@readarxiv/reader'
import { DEFAULT_CONFIG } from '@/config/schema'
import { crashTold, hostFetch, hostPrefs, surfaceStore, v2Open } from '@/pdf-reader/host/v2'

const API = 'https://readarxiv.com'

describe('the extension host fetch', () => {
  it('resolves our server\'s paths against it and sends no credentials and no referrer', async () => {
    const seen = vi.fn(async (_u: string, _i?: RequestInit) => new Response('ok'))
    const f = hostFetch({ api: API, loopback: false, fetch: seen as unknown as typeof fetch })
    await f('/api/v2/p/2600.00001v1')
    await f('https://arxiv.org/pdf/2600.00001v1', { headers: { range: 'bytes=0-9' } })
    expect(seen.mock.calls.map(c => c[0])).toEqual(['https://readarxiv.com/api/v2/p/2600.00001v1', 'https://arxiv.org/pdf/2600.00001v1'])
    for (const [, init] of seen.mock.calls) expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
  })
  it('refuses another origin, a framing page\'s server and credentials in a URL, with no request sent', async () => {
    const seen = vi.fn(async () => new Response('ok'))
    const f = hostFetch({ api: API, loopback: false, fetch: seen as unknown as typeof fetch })
    for (const url of ['https://evil.example/x', 'http://arxiv.org/pdf/1', 'https://u:p@arxiv.org/pdf/1', 'http://127.0.0.1:8787/api/v2/x']) await expect(f(url)).rejects.toThrow(TypeError)
    expect(seen).not.toHaveBeenCalled()
  })
  it('takes a server on this machine only where the build allows one', async () => {
    const seen = vi.fn(async () => new Response('ok'))
    await expect(hostFetch({ api: API, loopback: true, fetch: seen as unknown as typeof fetch })('http://127.0.0.1:8787/api/v2/x')).resolves.toBeInstanceOf(Response)
    expect(seen).toHaveBeenCalledOnce()
  })
})

describe('the extension host prefs over the configuration surface', () => {
  const surface = (config: typeof DEFAULT_CONFIG | null) => {
    let state = { config, revision: 'r1', fallbackReason: null, resetFailed: false, pack: null }
    const listeners = new Set<() => void>()
    const patches: unknown[] = []
    return {
      state: () => state,
      subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
      start: vi.fn(),
      patch: vi.fn(async (change: (c: typeof DEFAULT_CONFIG) => typeof DEFAULT_CONFIG) => { const next = change(state.config ?? DEFAULT_CONFIG); patches.push(next); state = { ...state, config: next }; for (const l of listeners) l(); return next }),
      land(c: typeof DEFAULT_CONFIG, fallbackReason: unknown = null) { state = { ...state, config: c, fallbackReason: fallbackReason as null }; for (const l of listeners) l() },
      patches,
    }
  }
  it('a read waits for the first landing, and gives the one model', async () => {
    const s = surface(null)
    const p = hostPrefs(s as never).read()
    expect(s.start).toHaveBeenCalled()
    s.land({ ...DEFAULT_CONFIG, theme: 'dark' })
    await expect(p).resolves.toMatchObject({ theme: 'dark', translator: 'r1' })
  })
  it('stored and unreadable (the surface fell back to the defaults): told as null, the read too; a readable landing after it told as values', async () => {
    const s = surface(null)
    const store = hostPrefs(s as never)
    const told = vi.fn()
    store.watch(told)
    const read = store.read()
    s.land(DEFAULT_CONFIG, { kind: 'invalid', where: 'mode', message: 'nonsense' })
    await expect(read).resolves.toBeNull()
    expect(told).toHaveBeenLastCalledWith(null)
    s.land({ ...DEFAULT_CONFIG, theme: 'dark' })
    expect(told).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }))
  })
  it('the slots\' store: the same snapshot until the surface changes (useSyncExternalStore loops on a new one each read)', () => {
    const s = surface(DEFAULT_CONFIG)
    const store = surfaceStore(s as never)
    expect(store.state()).toBe(store.state())
    const first = store.state()
    s.land({ ...DEFAULT_CONFIG, theme: 'dark' })
    expect(store.state()).not.toBe(first)
    expect(store.state().config?.theme).toBe('dark')
  })
  it('asked to translate (the PDF page\'s ask=translate): the first read lets a stored original display go, written as the old reader wrote it, the mode untouched; read as let go until the write lands', async () => {
    for (const mode of ['side', 'stack', 'only'] as const) {
      const s = surface({ ...DEFAULT_CONFIG, mode, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: true } })
      const store = hostPrefs(s as never, { askedToTranslate: true })
      await expect(store.read()).resolves.toMatchObject({ display: mode === 'only' ? 'translation' : 'bilingual' })
      expect(s.patches).toEqual([{ ...DEFAULT_CONFIG, mode, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: false } }])
    }
    // (not asked: the original stays, nothing written; asked where the original is not stored: nothing written either)
    const plain = surface({ ...DEFAULT_CONFIG, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: true } })
    await expect(hostPrefs(plain as never).read()).resolves.toMatchObject({ display: 'original' })
    const translated = surface(DEFAULT_CONFIG)
    await expect(hostPrefs(translated as never, { askedToTranslate: true }).read()).resolves.toMatchObject({ display: 'bilingual' })
    expect([...plain.patches, ...translated.patches]).toEqual([])
    // (a landing before the write's: still let go; once it has landed, a later original display chosen elsewhere is followed)
    const late = surface(null)
    const store = hostPrefs(late as never, { askedToTranslate: true })
    const told = vi.fn()
    store.watch(told)
    late.land({ ...DEFAULT_CONFIG, pdfReader: { ...DEFAULT_CONFIG.pdfReader, original: true } })
    expect(told).toHaveBeenLastCalledWith(expect.objectContaining({ display: 'bilingual' }))
    await Promise.resolve()
    late.land({ ...late.state().config!, pdfReader: { ...late.state().config!.pdfReader, original: true } })
    expect(told).toHaveBeenLastCalledWith(expect.objectContaining({ display: 'original' }))
  })
  it('a write is a patch on the latest stored, every other field untouched; a landing from elsewhere is told', async () => {
    const s = surface(DEFAULT_CONFIG)
    const store = hostPrefs(s as never)
    const told = vi.fn()
    store.watch(told)
    await store.write({ classes: { ...DEFAULTS.classes, references: true } })
    expect(s.patches[0]).toEqual({ ...DEFAULT_CONFIG, pdfReader: { ...DEFAULT_CONFIG.pdfReader, classes: { ...DEFAULT_CONFIG.pdfReader.classes, references: true } } })
    expect(told).toHaveBeenLastCalledWith(expect.objectContaining({ classes: expect.objectContaining({ references: true }) }))
  })
})

describe('the reader state told to the chrome', () => {
  const state = (o: Partial<ReaderState> = {}): ReaderState => ({
    paper: { id: '2600.00001', version: 1, title: '', html: null, pdf: '' },
    prefs: DEFAULTS,
    settings: { s: 'landed', refused: 0 },
    original: { s: 'opening', loaded: 0, total: 0 },
    layer: { s: 'none' },
    rows: { target: 'de', from: 'here', s: 'none' },
    view: { display: 'bilingual', sync: { on: true, available: false }, scale: 1, zoom: 'page-width', narrow: false, sides: { left: { page: 1, pages: 0 }, right: { page: 1, pages: 0 } }, outline: [], heading: null },
    reconnecting: false,
    network: false,
    crashed: false,
    ...o,
  }) as ReaderState
  const fold = (states: ReaderState[]) => {
    let chrome = INITIAL, prev: ReaderState | null = null
    for (const s of states) { for (const e of eventsOf(prev, s)) chrome = reduce(chrome, e); prev = s }
    return chrome
  }
  it('the original opened, the layer preparing, the rows arriving, then complete: the chrome\'s phases as today\'s session gives them', () => {
    const a = state(), b = state({ original: { s: 'open', pages: 4, ours: false } })
    expect(fold([a, b]).phase).toBe('ready')
    const c = state({ original: { s: 'open', pages: 4, ours: false }, layer: { s: 'preparing', stage: 'units' } })
    // (the prepare's stage, our server's record's, as the share of its stretch the progress line stands at)
    expect(fold([a, b, c])).toMatchObject({ phase: 'preparing', preparing: { progress: 0.52 } })
    const d = { ...c, layer: { s: 'ready', laid: 0, total: 4, asOriginal: 0 }, rows: { target: 'de', from: 'here', s: 'arriving', got: 3, total: 10, lost: 0, waits: true } } as ReaderState
    expect(fold([a, b, c, d])).toMatchObject({ phase: 'translating', progress: 0.3 })
    const e = { ...d, layer: { s: 'ready', laid: 2, total: 4, asOriginal: 0 }, rows: { target: 'de', from: 'here', s: 'complete', got: 10, total: 10, lost: 0, stopped: null } } as ReaderState
    expect(fold([a, b, c, d, e])).toMatchObject({ phase: 'ready', layer: { laid: 2, total: 4 } })
  })
  it('a key missing: the card with the settings; a language the reader does not set: the language\'s notice', () => {
    const open = state({ original: { s: 'open', pages: 4, ours: false }, layer: { s: 'ready', laid: 0, total: 4, asOriginal: 0 } })
    const noKey = { ...open, rows: { target: 'de', from: 'here', s: 'failed', why: { kind: 'unconfigured', code: 'no-key' }, got: 0, total: 10, lost: 0 } } as ReaderState
    expect(fold([state(), open, noKey])).toMatchObject({ phase: 'failed', failure: 'no-key' })
    const target = { ...open, rows: { target: 'ar', from: 'here', s: 'failed', why: { kind: 'target' }, got: 0, total: 0, lost: 0 } } as ReaderState
    expect(fold([state(), open, target]).languageSupported).toBe(false)
  })
  it('a layer refused for good greys the translated displays; one refused for a while says so and keeps them', () => {
    const open = state({ original: { s: 'open', pages: 4, ours: false } })
    expect(fold([open, { ...open, layer: { s: 'refused', why: 'no-source', retryAt: null } } as ReaderState]).available).toBe(false)
    expect(fold([open, { ...open, layer: { s: 'refused', why: 'busy', retryAt: 5 } } as ReaderState])).toMatchObject({ available: true, unavailable: { why: 'busy', retryAt: 5 } })
  })
  it('tells nothing twice: a state that did not change yields no event', () => {
    const s = state()
    expect(eventsOf(s, s)).toEqual([])
  })
  it('an address that names no paper (S-R-20): no reader opened, nothing asked; what the reader chooses written as settings', async () => {
    const written: unknown[] = []
    const prefs = { read: vi.fn(), write: vi.fn(async (p: unknown) => { written.push(p) }), watch: vi.fn() }
    const emitted: unknown[] = []
    const session = await v2Open({ host: { prefs } as never, paper: '', visit: undefined, original: '' })({ left: document.createElement('div'), right: document.createElement('div'), emit: (e: unknown) => emitted.push(e) } as never)
    session.setDisplay('translation')
    session.retry()
    expect([written, emitted]).toEqual([[{ display: 'translation' }], []])
  })
  it('a session that crashed is told to the chrome as a session that could not be opened is: a failure, once (the website shows its own)', () => {
    const before = state(), crashed = { ...before, crashed: true }
    const fails = (events: { type: string; event?: string }[]) => events.filter(e => e.type === 'fail' && e.event === 'crashed').length
    expect(fails(crashTold(eventsOf(before, crashed), crashed, before))).toBe(1)
    expect(fails(crashTold(eventsOf(crashed, crashed), crashed, crashed))).toBe(0)
    expect(fails(crashTold(eventsOf(null, before), before, null))).toBe(0)
  })
})

