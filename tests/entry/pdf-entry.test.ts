import { describe, expect, it } from 'vitest'
import { AUTO_TRANSLATE_HASH } from '@/core/abstract/link'
import { htmlUrlOf, paperIdFromPdfPath, translatedHtmlUrlOf } from '@/core/pdf/entry'

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
