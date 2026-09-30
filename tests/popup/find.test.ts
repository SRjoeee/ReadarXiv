import { describe, expect, it } from 'vitest'
import { ADVANCED_SEARCH, isPaperAddress, readQuery, searchUrl } from '@/entrypoints/popup/find'

// P0's field (the redesign's design, §5.4): every way a paper is written, and what is not one. An id is tried before a
// link: `math.GT/0309136` reads as a host name with a path, and `2501.07202` as one without
const open = (format: 'pdf' | 'html', id: string) => ({ kind: 'open', format, id, href: `https://arxiv.org/${format}/${id}#readarxiv` })
const paper = (id: string) => ({ kind: 'paper', id })
const search = (query: string) => ({ kind: 'search', query, href: searchUrl(query) })
const ELSEWHERE = { kind: 'elsewhere' }

const CASES: [string, unknown][] = [
  // nothing yet
  ['', { kind: 'empty' }],
  ['   ', { kind: 'empty' }],
  // an arXiv PDF address, in every version and spelling: that page, translating
  ['https://arxiv.org/pdf/2501.07202', open('pdf', '2501.07202')],
  ['https://arxiv.org/pdf/2501.07202v1', open('pdf', '2501.07202v1')],
  ['https://arxiv.org/pdf/2501.07202v1.pdf', open('pdf', '2501.07202v1')],
  ['http://arxiv.org/pdf/hep-th/9901001v2', open('pdf', 'hep-th/9901001v2')],
  ['arxiv.org/pdf/1706.03762', open('pdf', '1706.03762')],
  ['https://www.arxiv.org/pdf/cond-mat.mes-hall/0601001', open('pdf', 'cond-mat.mes-hall/0601001')],
  // an arXiv HTML address, likewise
  ['https://arxiv.org/html/2501.07202v1', open('html', '2501.07202v1')],
  ['https://arxiv.org/html/2501.07202v1/', open('html', '2501.07202v1')],
  ['https://arxiv.org/html/2501.07202v1#S3', open('html', '2501.07202v1')],
  ['https://export.arxiv.org/html/2501.07202', open('html', '2501.07202')],
  // an abstract address, a bare id, a cited id, an arXiv DOI: a paper, its two entries offered
  ['https://arxiv.org/abs/2501.07202v1', paper('2501.07202v1')],
  ['https://arxiv.org/abs/2501.07202?context=cs.CL', paper('2501.07202')],
  ['https://export.arxiv.org/abs/math.GT/0309136', paper('math.GT/0309136')],
  ['2501.07202', paper('2501.07202')],
  ['2501.07202v1', paper('2501.07202v1')],
  [' 0704.0001 ', paper('0704.0001')],
  ['hep-th/9901001', paper('hep-th/9901001')],
  ['math.GT/0309136', paper('math.GT/0309136')],
  ['cond-mat.mes-hall/0601001v1', paper('cond-mat.mes-hall/0601001v1')],
  ['arXiv:2501.07202', paper('2501.07202')],
  ['arxiv: 2501.07202v2', paper('2501.07202v2')],
  ['arXiv:2501.07202 [cs.CL]', paper('2501.07202')],
  ['ARXIV:hep-th/9901001', paper('hep-th/9901001')],
  ['10.48550/arXiv.2501.07202', paper('2501.07202')],
  ['doi:10.48550/ARXIV.2501.07202', paper('2501.07202')],
  ['10.48550/arXiv.hep-th/9901001', paper('hep-th/9901001')],
  ['https://doi.org/10.48550/arXiv.2501.07202', paper('2501.07202')],
  // a link that is not an arXiv paper's: said, and Enter does nothing
  ['https://doi.org/10.1038/s41586-021-03819-2', ELSEWHERE],
  ['https://doi.org/%ZZ', ELSEWHERE],
  ['https://www.nature.com/articles/s41586-021-03819-2', ELSEWHERE],
  ['nature.com/articles/s41586-021-03819-2', ELSEWHERE],
  ['www.semanticscholar.org', ELSEWHERE],
  ['https://arxiv.org/list/cs.CL/recent', ELSEWHERE],
  ['https://arxiv.org/abs/not-an-id', ELSEWHERE],
  // anything else: words for arXiv's own search
  ['attention is all you need', search('attention is all you need')],
  ['Vaswani', search('Vaswani')],
  ['node.js', search('node.js')],
  ['10.1038/s41586-021-03819-2', search('10.1038/s41586-021-03819-2')],
  ['量子纠错', search('量子纠错')],
]

describe('what P0\'s field reads (the redesign\'s design, §5.4)', () => {
  for (const [text, expected] of CASES) it(`${JSON.stringify(text)}`, () => expect(readQuery(text)).toEqual(expected))

  it('searches as arXiv\'s own header does, and links its advanced search', () => {
    expect(searchUrl('attention is all you need')).toBe('https://arxiv.org/search/?query=attention+is+all+you+need&searchtype=all&source=header')
    expect(ADVANCED_SEARCH).toBe('https://arxiv.org/search/advanced')
  })

  it('knows a paper\'s page on arxiv.org, where the extension answers, from any other address', () => {
    for (const url of ['https://arxiv.org/html/2501.07202v1', 'https://arxiv.org/abs/hep-th/9711200', 'https://arxiv.org/pdf/2501.07202']) expect([url, isPaperAddress(url)]).toEqual([url, true])
    for (const url of ['https://arxiv.org/list/cs.CL/recent', 'https://export.arxiv.org/abs/2501.07202', 'https://example.com/html/2501.07202', 'chrome-extension://abc/popup.html', 'not an address']) expect([url, isPaperAddress(url)]).toEqual([url, false])
  })
})
