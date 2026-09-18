import { beforeEach, describe, expect, it } from 'vitest'
import { AUTO_TRANSLATE_HASH } from '@/core/abstract/link'
import { htmlUrlOf, injectPdfEntry, paperIdFromPdfPath, PDF_ENTRY_CLASS, relabelPdfEntry, retargetPdfEntry, translatedHtmlUrlOf } from '@/core/pdf/entry'

// The bilingual entry on arXiv's PDF page (issue #169)

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

describe('injectPdfEntry', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('adds one link, in a shadow root, pointing where the click should go', () => {
    const href = translatedHtmlUrlOf('2501.07202v1')
    expect(injectPdfEntry(document, { label: 'Bilingual version (Read arXiv)', href })).toBe(true)

    const host = document.querySelector(`.${PDF_ENTRY_CLASS}`)
    expect(host).not.toBeNull()
    const link = host!.shadowRoot!.querySelector('a')!
    expect(link.getAttribute('href')).toBe(href)
    expect(link.textContent).toBe('Bilingual version (Read arXiv)')
    // A plain link: the reader's click navigates by itself, with nothing to dismiss first
    expect(host!.shadowRoot!.querySelector('button')).toBeNull()
  })

  it('opens in a new tab by default and in this one when the reader says so, following the setting either way', () => {
    const link = () => document.querySelector(`.${PDF_ENTRY_CLASS}`)!.shadowRoot!.querySelector('a')!
    injectPdfEntry(document, { label: 'a', href: 'https://arxiv.org/html/x' })
    // The PDF the reader is on must still be there when the translation opens (the owner, 2026-09-18)
    expect([link().getAttribute('target'), link().getAttribute('rel')]).toEqual(['_blank', 'noopener'])
    expect(retargetPdfEntry(document, false)).toBe(true)
    expect([link().getAttribute('target'), link().getAttribute('rel')]).toEqual([null, null])

    document.body.innerHTML = ''
    injectPdfEntry(document, { label: 'a', href: 'https://arxiv.org/html/x', newTab: false })
    expect(link().getAttribute('target')).toBeNull()
    expect(retargetPdfEntry(document, true)).toBe(true)
    expect(link().getAttribute('target')).toBe('_blank')
  })

  it('is idempotent, and leaves the rest of the document alone', () => {
    document.body.innerHTML = '<div id="viewer">the PDF</div>'
    const before = document.getElementById('viewer')!.outerHTML
    expect(injectPdfEntry(document, { label: 'a', href: 'https://arxiv.org/html/x' })).toBe(true)
    expect(injectPdfEntry(document, { label: 'a', href: 'https://arxiv.org/html/x' })).toBe(false)
    expect(document.querySelectorAll(`.${PDF_ENTRY_CLASS}`)).toHaveLength(1)
    expect(document.getElementById('viewer')!.outerHTML).toBe(before)
  })

  it('answers false for a document with no body, rather than throwing inside the content script', () => {
    const doc = new DOMParser().parseFromString('<root/>', 'application/xml')
    expect(doc.body ?? null).toBeNull()
    expect(injectPdfEntry(doc, { label: 'a', href: 'https://arxiv.org/html/x' })).toBe(false)
  })
})

describe('relabelPdfEntry', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('follows a change of interface language while the PDF stays open', () => {
    injectPdfEntry(document, { label: 'Bilingual version (Read arXiv)', href: 'https://arxiv.org/html/x' })
    // The label is whatever the content script resolved from the locale pack; the module only has to replace it
    expect(relabelPdfEntry(document, 'Zweisprachige Fassung (Read arXiv)')).toBe(true)
    expect(document.querySelector(`.${PDF_ENTRY_CLASS}`)!.shadowRoot!.querySelector('a')!.textContent)
      .toBe('Zweisprachige Fassung (Read arXiv)')
  })

  it('answers false when no entry is on the page', () => {
    expect(relabelPdfEntry(document, 'x')).toBe(false)
  })
})
