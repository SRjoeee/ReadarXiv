// The one place an address from a host or a document becomes a link the chrome draws (chrome/links.ts): the page's own origin,
// or https to arXiv's or an origin the host names; never a script's or a data address, never a foreign origin (the review of #616)
import { describe, expect, it } from 'vitest'
import { linkable } from '../../src/chrome/links.ts'

describe('a link the chrome draws (linkable)', () => {
  it("arXiv's pages by https, the page's own origin, an origin the host names; each as parsed", () => {
    expect(linkable('https://arxiv.org/html/2608.02163v2#readarxiv')).toBe(
      'https://arxiv.org/html/2608.02163v2#readarxiv',
    )
    expect(linkable(`${location.origin}/options.html#reading/pdf`)).toBe(`${location.origin}/options.html#reading/pdf`)
    expect(linkable('/options.html')).toBe(`${location.origin}/options.html`)
    expect(linkable('https://store.example/detail/x', ['https://store.example'])).toBe('https://store.example/detail/x')
    expect(linkable('http://127.0.0.1:8123/store', ['http://127.0.0.1:8123'])).toBe('http://127.0.0.1:8123/store')
  })
  it('none for a script, a data address, a foreign origin, arXiv by http, a named origin by http off the loopback', () => {
    for (const href of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      'https://evil.example/arxiv.org',
      'https://arxiv.org.evil.example/html/x',
      'http://arxiv.org/html/x',
      'http://store.example/detail/x',
      '',
      null,
      undefined,
    ])
      expect(linkable(href, ['http://store.example', 'https://store.example']), String(href)).toBeNull()
  })
})
