import { describe, expect, it } from 'vitest'
import { readerAddresses } from '@/pdf-reader/engine/addresses.mjs'

// Where the live reader fetches the paper and sends its typesetting (the reader's design, §2): its own addresses, or,
// for the probes, servers on this machine. A page that frames the reader chooses none of them (Devin on #301)

const of = (query: Record<string, string>) => readerAddresses(new URLSearchParams(query), '1706.03762')
const DEFAULTS = { site: 'http://127.0.0.1:8071', endpoint: 'http://localhost:8070', src: 'https://arxiv.org/src/1706.03762', pdf: 'https://arxiv.org/pdf/1706.03762' }

describe('readerAddresses', () => {
  it('without parameters: arXiv for the paper, and the TeX page and its file server as the experiment runs them', () => {
    expect(of({})).toEqual(DEFAULTS)
  })

  it('takes a server on this machine for any of them, as the probes run their own', () => {
    expect(of({ site: 'http://127.0.0.1:54321', endpoint: 'http://localhost:8070', src: 'http://127.0.0.1:5555/src/2608.02163', pdf: 'http://[::1]:5555/pdf/2608.02163' }))
      .toEqual({ site: 'http://127.0.0.1:54321', endpoint: 'http://localhost:8070', src: 'http://127.0.0.1:5555/src/2608.02163', pdf: 'http://[::1]:5555/pdf/2608.02163' })
  })

  it('takes arXiv for the paper itself, and not for the TeX page', () => {
    expect(of({ src: 'https://arxiv.org/src/1706.03762v7', pdf: 'https://arxiv.org/pdf/1706.03762v7', site: 'https://arxiv.org' }))
      .toEqual({ ...DEFAULTS, src: 'https://arxiv.org/src/1706.03762v7', pdf: 'https://arxiv.org/pdf/1706.03762v7' })
  })

  it('refuses anything else: another host, a lookalike, credentials before the host, another scheme, a malformed value', () => {
    for (const value of ['https://evil.example/tex', 'http://127.0.0.1.evil.example/', 'http://localhost@evil.example/', 'javascript:alert(1)', 'not a url', 'http://arxiv.org/src/x', 'https://arxiv.org.evil.example/src/x']) {
      expect(of({ site: value, endpoint: value, src: value, pdf: value }), value).toEqual(DEFAULTS)
    }
  })
})
