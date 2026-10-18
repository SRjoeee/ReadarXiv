import { describe, expect, it, vi } from 'vitest'
import { createSurfaceConfig } from '@/shared/surface-config'
import * as configStorage from '@/config/storage'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { displayOf, figuresShown, firstConfig, followOf, withDisplay } from '@/pdf-reader/settings'

const with_ = (patch: Partial<Config>, reader: Partial<Config['pdfReader']> = {}): Config => ({ ...DEFAULT_CONFIG, ...patch, pdfReader: { ...DEFAULT_CONFIG.pdfReader, ...reader } })

describe('displayOf: the display the shared settings ask for', () => {
  it('is the HTML page\'s mode, side by side or the translation alone, unless the reader was left on the original', () => {
    expect(displayOf(with_({ mode: 'side' }))).toBe('bilingual')
    expect(displayOf(with_({ mode: 'stack' }))).toBe('bilingual')
    expect(displayOf(with_({ mode: 'only' }))).toBe('translation')
    expect(displayOf(with_({ mode: 'only' }, { original: true }))).toBe('original')
  })
})

describe('withDisplay: what a display chosen in the reader writes', () => {
  it('writes the HTML page\'s mode and leaves the original', () => {
    expect(withDisplay(with_({ mode: 'side' }, { original: true }), 'translation')).toMatchObject({ mode: 'only', pdfReader: { original: false } })
    expect(withDisplay(with_({ mode: 'only' }), 'bilingual')).toMatchObject({ mode: 'side', pdfReader: { original: false } })
  })

  it('keeps stacked, already a side-by-side choice for the HTML page', () => {
    expect(withDisplay(with_({ mode: 'stack' }), 'bilingual').mode).toBe('stack')
  })

  it('marks the original and leaves the mode as it was', () => {
    const next = withDisplay(with_({ mode: 'only' }), 'original')
    expect(next.mode).toBe('only')
    expect(next.pdfReader.original).toBe(true)
  })

  it('changes nothing else', () => {
    const before = with_({ mode: 'side', targetLanguage: 'jpn' })
    const after = withDisplay(before, 'translation')
    // the original's mark alone of the reader's own (#299, Part 2: the whole of pdfReader was put back before)
    expect({ ...after, mode: before.mode, pdfReader: { ...after.pdfReader, original: before.pdfReader.original } }).toEqual(before)
  })
})

describe('figuresShown: figure text in a display', () => {
  it('follows the switch alone: figure text shows in every translated display (the redesign\'s design, §4)', () => {
    expect(figuresShown(with_({}), 'bilingual')).toBe(true)
    expect(figuresShown(with_({}), 'translation')).toBe(true)
    expect(figuresShown(with_({ image: { enabled: false } }), 'bilingual')).toBe(false)
  })

  it('is off for the original alone, which has no figure text to show', () => {
    expect(figuresShown(with_({}), 'original')).toBe(false)
  })
})

describe("followOf: what a landing of the settings changes in the reader (Part 2's final review)", () => {
  const at = (over: Partial<Parameters<typeof followOf>[3]> = {}) => ({ translating: false, held: false, stopped: false, addressDisplay: false, addressSync: false, display: 'bilingual' as const, syncMode: 'same', ...over })
  const side = with_({ mode: 'side' }), only = with_({ mode: 'only' })

  it('follows a display chosen elsewhere', () => {
    expect(followOf(side, only, 'elsewhere', at())).toEqual({ reload: false, display: 'translation', sync: null, retry: false })
  })

  it('changes nothing for a change of something it does not show, nor for its own write of what is on screen', () => {
    expect(followOf(side, with_({ mode: 'side', reading: { sentenceHighlight: true, openIn: 'same-tab' } }), 'elsewhere', at())).toEqual({ reload: false, display: null, sync: null, retry: false })
    expect(followOf(side, only, 'own', at({ display: 'translation' }))).toEqual({ reload: false, display: null, sync: null, retry: false })
  })

  it('follows nothing on a refused write, not even a language the defaults name while a translation runs', () => {
    const defaults = { ...only, targetLanguage: 'cmn' as const }
    expect(followOf({ ...side, targetLanguage: 'jpn' as const }, defaults, 'refused', at({ translating: true }))).toEqual({ reload: false, display: null, sync: null, retry: false })
  })

  it('starts again for a new target language once a translation has started, and only then', () => {
    expect(followOf(side, { ...side, targetLanguage: 'deu' as const }, 'elsewhere', at({ translating: true })).reload).toBe(true)
    expect(followOf(side, { ...side, targetLanguage: 'deu' as const }, 'own', at({ translating: true })).reload).toBe(true)
    expect(followOf(side, { ...side, targetLanguage: 'deu' as const }, 'elsewhere', at()).reload).toBe(false)
  })

  it('keeps a display the address names', () => {
    expect(followOf(side, only, 'elsewhere', at({ addressDisplay: true })).display).toBeNull()
  })

  it('runs a stopped translation again when the services change: a key set on the settings page, a service chosen here (Part 4)', () => {
    expect(followOf(side, { ...side, fallback: { enabled: false } }, 'elsewhere', at({ stopped: true })).retry).toBe(true)
    expect(followOf(side, { ...side, provider: 'google-web' }, 'own', at({ stopped: true })).retry).toBe(true)
  })

  it('runs nothing again for a change of what is not the chain, nor when nothing stopped', () => {
    expect(followOf(side, only, 'elsewhere', at({ stopped: true })).retry).toBe(false)
    expect(followOf(side, { ...side, provider: 'google-web' }, 'elsewhere', at()).retry).toBe(false)
  })

  it('reloads for a new language rather than run again', () => {
    const f = followOf(side, { ...side, targetLanguage: 'deu' as const }, 'elsewhere', at({ stopped: true, translating: true }))
    expect([f.reload, f.retry]).toEqual([true, false])
  })

  it('keeps the original a paper or a language that cannot be had holds, whatever another page chooses (the final review)', () => {
    expect(followOf(side, only, 'elsewhere', at({ held: true, display: 'original' })).display).toBeNull()
  })

  it('follows the sync switch, not over a sync the address names or a probe\'s other mode', () => {
    const off = with_({ mode: 'side' }, { sync: false })
    expect(followOf(side, off, 'elsewhere', at()).sync).toBe('off')
    expect(followOf(side, off, 'elsewhere', at({ addressSync: true })).sync).toBeNull()
    expect(followOf(side, off, 'elsewhere', at({ syncMode: 'pointer' })).sync).toBeNull()
    expect(followOf(side, off, 'own', at({ syncMode: 'off' })).sync).toBeNull()
  })
})

describe('firstConfig: the session\'s first configuration, never waited on for ever (Codex on #329)', () => {
  const surface = () => createSurfaceConfig({ localeStale: () => false, reload: () => undefined })
  const stored = with_({ targetLanguage: 'jpn' })
  const readOk = { config: stored, fallbackReason: null }
  const never = () => new Promise<never>(() => {})

  describe('the page has read the settings (its own read, before its first paint)', () => {
    it('starts on that reading at once, whatever the session\'s own read does: it stalls, or it rejects — no timer, no unreadable note (Codex on #329, round 2)', async () => {
      vi.spyOn(configStorage, 'readConfig').mockReturnValueOnce(never())
      expect(await firstConfig(surface(), readOk, never())).toEqual({ config: stored, provisional: { why: null } })
      vi.spyOn(configStorage, 'readConfig').mockRejectedValueOnce(new Error('the extension context was invalidated'))
      const s = surface()
      expect(await firstConfig(s, readOk, never())).toEqual({ config: stored, provisional: { why: null } })
      expect(s.state().config).toBeNull()
      vi.restoreAllMocks()
    })

    it('a reading that fell back to the defaults carries its reason: the session says it too, as the page did', async () => {
      const reason = { kind: 'tooNew' as const, stored: 99, supported: 20 }
      vi.spyOn(configStorage, 'readConfig').mockReturnValueOnce(never())
      expect(await firstConfig(surface(), { config: DEFAULT_CONFIG, fallbackReason: reason }, never())).toEqual({ config: DEFAULT_CONFIG, provisional: { why: reason } })
      vi.restoreAllMocks()
    })

    it('the surface goes on reading behind it: its landing is there to be followed', async () => {
      const read = vi.spyOn(configStorage, 'readConfig').mockResolvedValue({ config: with_({ targetLanguage: 'kor' }), fallbackReason: null })
      const s = surface()
      await firstConfig(s, readOk, never())
      await vi.waitFor(() => expect(s.state().config?.targetLanguage).toBe('kor'))
      expect(read).toHaveBeenCalled()
      vi.restoreAllMocks()
    })
  })

  describe('the page\'s read did not answer (null)', () => {
    it('the defaults at once, said to be provisional: not waited on twice', async () => {
      vi.spyOn(configStorage, 'readConfig').mockReturnValueOnce(never())
      expect(await firstConfig(surface(), null, never())).toEqual({ config: DEFAULT_CONFIG, provisional: { why: { kind: 'unknown' } } })
      vi.restoreAllMocks()
    })

    it('the surface\'s own landing, when it was there already: a configuration that landed is never thrown away', async () => {
      vi.spyOn(configStorage, 'readConfig').mockResolvedValueOnce({ config: stored, fallbackReason: null })
      const s = surface()
      // landed already (the surface publishes the pack\'s state before the configuration: wait for the configuration)
      await new Promise<void>(resolve => { s.subscribe(() => { if (s.state().config) resolve() }); s.start() })
      expect(await firstConfig(s, null, Promise.resolve())).toEqual({ config: stored, provisional: null })
      vi.restoreAllMocks()
    })
  })

  describe('no reading given (a host that made none)', () => {
    it('is what the surface lands, when it lands before the clock is over', async () => {
      vi.spyOn(configStorage, 'readConfig').mockResolvedValueOnce({ config: stored, fallbackReason: null })
      expect(await firstConfig(surface(), undefined, never())).toEqual({ config: stored, provisional: null })
      vi.restoreAllMocks()
    })

    it('is the defaults when the clock is over first: storage that never answers, or refuses its first read (the surface swallows it and publishes nothing)', async () => {
      vi.spyOn(configStorage, 'readConfig').mockReturnValueOnce(never())
      expect(await firstConfig(surface(), undefined, Promise.resolve())).toEqual({ config: DEFAULT_CONFIG, provisional: { why: { kind: 'unknown' } } })
      vi.spyOn(configStorage, 'readConfig').mockRejectedValueOnce(new Error('the extension context was invalidated'))
      const s = surface()
      expect(await firstConfig(s, undefined, Promise.resolve())).toEqual({ config: DEFAULT_CONFIG, provisional: { why: { kind: 'unknown' } } })
      expect(s.state().config).toBeNull()
      vi.restoreAllMocks()
    })
  })
})
