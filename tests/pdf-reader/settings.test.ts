import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { displayOf, figuresShown, withDisplay } from '@/pdf-reader/settings'

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
