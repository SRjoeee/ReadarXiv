import { describe, expect, it } from 'vitest'
import { AUTO_TRANSLATE_HASH } from '@/core/abstract/link'
import { htmlUrlOf, paperIdFromPdfPath, pdfUrlOf, sourceKindOf, translatedHtmlUrlOf } from '@/core/pdf/entry'

// The bilingual entry on arXiv's PDF page (issue #169): where it leads. The floating button itself: floating-button.test.ts

describe('paperIdFromPdfPath', () => {
  it('reads the id arXiv serves a PDF under, keeping the version the reader opened', () => {
    const cases: [string, string | null][] = [
      ['/pdf/2501.07202', '2501.07202'],
      ['/pdf/2501.07202v1', '2501.07202v1'],
      ['/pdf/2501.07202v1.pdf', '2501.07202v1'],
      ['/pdf/2501.07202/', '2501.07202'],
      ['/pdf/1706.03762v7', '1706.03762v7'],
      // five-digit numbers arrived in 2015 (1501.00001) and the old style is still served
      ['/pdf/hep-th/9711200', 'hep-th/9711200'],
      ['/pdf/hep-th/9711200v3', 'hep-th/9711200v3'],
      ['/pdf/math.GT/0309136', 'math.GT/0309136'],
      // A subject class is not always two capitals: arXiv serves this PDF at this very path (measured 2026-09-21)
      ['/pdf/cond-mat.mes-hall/0601001', 'cond-mat.mes-hall/0601001'],
    ]
    for (const [path, id] of cases) expect([path, paperIdFromPdfPath(path)]).toEqual([path, id])
  })

  it('offers nothing for a path that is not a paper', () => {
    for (const path of ['/pdf/', '/pdf/not-an-id', '/abs/2501.07202', '/html/2501.07202', '/pdf/2501.072', '/pdf/../etc', '/pdf/2501.07202v1/extra']) {
      expect([path, paperIdFromPdfPath(path)]).toEqual([path, null])
    }
  })
})

describe('the URLs', () => {
  it('stays on the page\'s own origin, and the reader\'s link carries the hash that starts the translation', () => {
    expect(htmlUrlOf('2501.07202v1')).toBe('https://arxiv.org/html/2501.07202v1')
    expect(translatedHtmlUrlOf('hep-th/9711200')).toBe(`https://arxiv.org/html/hep-th/9711200${AUTO_TRANSLATE_HASH}`)
    // The content script passes `location.origin`, so an arXiv that answers on another host keeps its own
    expect(htmlUrlOf('2501.07202', 'https://export.arxiv.org')).toBe('https://export.arxiv.org/html/2501.07202')
  })
})

describe('the PDF entry (the reader\'s design, §2)', () => {
  it('asks the PDF address for the reader, translating, an old-style id keeping its slash', () => {
    expect(pdfUrlOf('1706.03762v7')).toBe('https://arxiv.org/pdf/1706.03762v7#readarxiv')
    expect(pdfUrlOf('hep-th/9711200')).toBe('https://arxiv.org/pdf/hep-th/9711200#readarxiv')
  })

  it('reads what a HEAD on /src/ says: gzip is a source, a PDF is a PDF-only submission, anything else says nothing', () => {
    expect(sourceKindOf('application/gzip')).toBe('source')
    expect(sourceKindOf('application/x-gzip; charset=binary')).toBe('source')
    expect(sourceKindOf('application/pdf')).toBe('pdf-only')
    for (const other of [null, 'text/html', '']) expect(sourceKindOf(other)).toBe('unknown')
  })
})
