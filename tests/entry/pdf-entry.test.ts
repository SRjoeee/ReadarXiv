import { describe, expect, it, vi } from 'vitest'
import { AUTO_TRANSLATE_HASH } from '@/core/abstract/link'
import { bilingualPdfOf, htmlUrlOf, htmlVersionOf, paperIdFromPdfPath, pdfUrlOf, readerWanted, sourceKindOf, translatedHtmlUrlOf } from '@/core/pdf/entry'

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

describe('readerWanted: the PDF page and its reader (the reader\'s design, §2)', () => {
  it('opens the reader when the setting is on, translating only when asked', () => {
    expect(readerWanted({ enabled: true, hash: '' })).toEqual({ open: true, translate: false })
    expect(readerWanted({ enabled: true, hash: '#readarxiv' })).toEqual({ open: true, translate: true })
  })

  it('opens it off the setting only for #readarxiv, an explicit request', () => {
    expect(readerWanted({ enabled: false, hash: '' })).toEqual({ open: false, translate: false })
    expect(readerWanted({ enabled: false, hash: '#readarxiv' })).toEqual({ open: true, translate: true })
  })

  it('reads the hash as the HTML page does, in any capitalisation: the name is written ReadarXiv too (#299, Part 5\'s M4)', () => {
    for (const hash of ['#ReadarXiv', '#READARXIV']) expect(readerWanted({ enabled: false, hash })).toEqual({ open: true, translate: true })
    expect(readerWanted({ enabled: false, hash: '#readarxiv-not' })).toEqual({ open: false, translate: false })
  })
})

describe('a paper\'s two entries, checked (the PDF page\'s HEADs, and the popup\'s search: the redesign\'s design, §5.4)', () => {
  const answering = (status: number, type?: string) => vi.fn(async () => new Response(null, { status, headers: type ? { 'content-type': type } : {} }))
  const failing = () => vi.fn(async () => { throw new TypeError('Failed to fetch') })

  it('offers the HTML version unless arXiv says there is none: only a 404 or a 410 does', async () => {
    const fetchFn = answering(200)
    expect(await htmlVersionOf('2501.07202', fetchFn)).toBe('https://arxiv.org/html/2501.07202#readarxiv')
    expect(fetchFn).toHaveBeenCalledWith('https://arxiv.org/html/2501.07202', { method: 'HEAD', credentials: 'omit' })
    for (const status of [404, 410]) expect(await htmlVersionOf('2501.07202', answering(status))).toBeNull()
    for (const said of [answering(429), answering(503), failing()]) expect(await htmlVersionOf('2501.07202', said)).toBe('https://arxiv.org/html/2501.07202#readarxiv')
    expect(await htmlVersionOf('hep-th/9711200', answering(200), 'https://export.arxiv.org')).toBe('https://export.arxiv.org/html/hep-th/9711200#readarxiv')
  })

  it('offers the bilingual PDF unless the source is a PDF-only submission; anything else says nothing', async () => {
    const fetchFn = answering(200, 'application/gzip')
    expect(await bilingualPdfOf('2501.07202', fetchFn)).toBe('https://arxiv.org/pdf/2501.07202#readarxiv')
    expect(fetchFn).toHaveBeenCalledWith('https://arxiv.org/src/2501.07202', { method: 'HEAD', credentials: 'omit' })
    expect(await bilingualPdfOf('2501.07202', answering(200, 'application/pdf'))).toBeNull()
    for (const said of [answering(200, 'text/html'), answering(404), answering(503), failing()]) expect(await bilingualPdfOf('2501.07202', said)).toBe('https://arxiv.org/pdf/2501.07202#readarxiv')
  })
})
