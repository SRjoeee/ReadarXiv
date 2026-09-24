import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { displayOf, figuresShown, followOf, withDisplay } from '@/pdf-reader/settings'

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
    expect({ ...after, mode: before.mode, pdfReader: before.pdfReader }).toEqual(before)
  })
})

describe('figuresShown: figure text in a display', () => {
  it('follows the switch and the modes ticked, a side-by-side display standing for the HTML page\'s side or stacked mode', () => {
    expect(figuresShown(with_({}), 'bilingual')).toBe(true)
    expect(figuresShown(with_({ image: { enabled: false, modes: ['stack', 'side', 'only'] } }), 'bilingual')).toBe(false)
    expect(figuresShown(with_({ mode: 'side', image: { enabled: true, modes: ['only'] } }), 'bilingual')).toBe(false)
    expect(figuresShown(with_({ mode: 'side', image: { enabled: true, modes: ['only'] } }), 'translation')).toBe(true)
    expect(figuresShown(with_({ mode: 'stack', image: { enabled: true, modes: ['stack'] } }), 'bilingual')).toBe(true)
  })

  it('is off for the original alone, which has no figure text to show', () => {
    expect(figuresShown(with_({}), 'original')).toBe(false)
  })
})

describe("followOf: what a landing of the settings changes in the reader (Part 2's final review)", () => {
  const at = (over: Partial<Parameters<typeof followOf>[3]> = {}) => ({ translating: false, addressDisplay: false, addressSync: false, held: false, display: 'bilingual' as const, syncMode: 'same', ...over })
  const side = with_({ mode: 'side' }), only = with_({ mode: 'only' })

  it('follows a display chosen elsewhere', () => {
    expect(followOf(side, only, 'elsewhere', at())).toEqual({ reload: false, display: 'translation', sync: null })
  })

  it('changes nothing for a change of something it does not show, nor for its own write of what is on screen', () => {
    expect(followOf(side, with_({ mode: 'side', reading: { sentenceHighlight: true, openIn: 'same-tab' } }), 'elsewhere', at())).toEqual({ reload: false, display: null, sync: null })
    expect(followOf(side, only, 'own', at({ display: 'translation' }))).toEqual({ reload: false, display: null, sync: null })
  })

  it('follows nothing on a refused write, not even a language the defaults name while a translation runs', () => {
    const defaults = { ...only, targetLanguage: 'cmn' as const }
    expect(followOf({ ...side, targetLanguage: 'jpn' as const }, defaults, 'refused', at({ translating: true }))).toEqual({ reload: false, display: null, sync: null })
  })

  it('starts again for a new target language once a translation has started, and only then', () => {
    expect(followOf(side, { ...side, targetLanguage: 'deu' as const }, 'elsewhere', at({ translating: true })).reload).toBe(true)
    expect(followOf(side, { ...side, targetLanguage: 'deu' as const }, 'own', at({ translating: true })).reload).toBe(true)
    expect(followOf(side, { ...side, targetLanguage: 'deu' as const }, 'elsewhere', at()).reload).toBe(false)
  })

  it('keeps a display the address names, or one this visit holds', () => {
    expect(followOf(side, only, 'elsewhere', at({ addressDisplay: true })).display).toBeNull()
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
