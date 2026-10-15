// The extension's host of the reading view (session/host.ts; docs/PDF-READER.md §11.7): the look it reads of the
// settings, and the display a reader opens in. PDF.js is not loaded here: the host's kit is checked in a real browser by
// pnpm e2e:reader's development entry
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'

vi.mock('@/pdf-reader/pdfjs', () => ({ ASSETS: {}, EventBus: class {}, LinkTarget: {}, PDFLinkService: class {}, PDFPageView: class {}, PDFViewer: class {}, pdfjsLib: {} }))
const { displayFrom, prefsOf } = await import('@/pdf-reader/session/host.ts')

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
