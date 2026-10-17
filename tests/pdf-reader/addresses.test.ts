import { describe, expect, it } from 'vitest'
import { READER_API, readerAddresses } from '@/pdf-reader/addresses'

// Where the reader fetches the paper and its layer (Stage 5 Task 17): arXiv's PDF and our server, or, for the probes,
// servers on this machine. A page that frames the reader chooses none of them (Devin on #301)

const of = (query: Record<string, string>) => readerAddresses(new URLSearchParams(query), '1706.03762')
const DEFAULTS = { pdf: 'https://arxiv.org/pdf/1706.03762', api: 'https://readarxiv.com' }

describe('readerAddresses', () => {
  it('without parameters: arXiv for the paper, and our server as the build names it (production\'s in the tests)', () => {
    expect(READER_API).toBe('https://readarxiv.com')
    expect(of({})).toEqual(DEFAULTS)
    expect(readerAddresses(new URLSearchParams(), '1706.03762', 'https://app-staging.readarxiv.org').api).toBe('https://app-staging.readarxiv.org')
  })

  it('takes a server on this machine for either, as the probes run their own', () => {
    expect(of({ pdf: 'http://[::1]:5555/pdf/2608.02163', api: 'http://127.0.0.1:8787/anything' })).toEqual({ pdf: 'http://[::1]:5555/pdf/2608.02163', api: 'http://127.0.0.1:8787' })
  })

  it('a release build takes no server on this machine: the probes\' seam is a development build\'s, never one any arXiv page may frame', () => {
    const local = new URLSearchParams({ pdf: 'http://[::1]:5555/pdf/2608.02163', api: 'http://127.0.0.1:8787/anything' })
    expect(readerAddresses(local, '1706.03762', READER_API, { loopback: false })).toEqual(DEFAULTS)
    expect(readerAddresses(local, '1706.03762', READER_API, { loopback: true }).api).toBe('http://127.0.0.1:8787')
    // arXiv for the paper stays, in either
    expect(readerAddresses(new URLSearchParams({ pdf: 'https://arxiv.org/pdf/1706.03762v7' }), '1706.03762', READER_API, { loopback: false }).pdf).toBe('https://arxiv.org/pdf/1706.03762v7')
  })

  it('takes arXiv for the paper itself, and not for our server', () => {
    expect(of({ pdf: 'https://arxiv.org/pdf/1706.03762v7', api: 'https://arxiv.org' })).toEqual({ ...DEFAULTS, pdf: 'https://arxiv.org/pdf/1706.03762v7' })
  })

  it('refuses anything else: another host, a lookalike, credentials before the host, another scheme, a malformed value', () => {
    for (const value of ['https://evil.example/x', 'http://127.0.0.1.evil.example/', 'http://localhost@evil.example/', 'javascript:alert(1)', 'not a url', 'http://arxiv.org/pdf/x', 'https://arxiv.org.evil.example/pdf/x', 'https://readarxiv.com.evil.example/']) {
      expect(of({ pdf: value, api: value }), value).toEqual(DEFAULTS)
    }
  })
})
