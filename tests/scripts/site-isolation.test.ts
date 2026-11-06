// The website's isolation check (DESIGN §4.0d, scripts/site-isolation.mjs, run by scripts/check-output.mjs): no content
// script but the website's mark may run on the website's pages. The first version asked whether a match pattern
// *contained the host's name*, and Codex on #315 named what that walks past: patterns that cover the website without
// naming it. Every one of them is a case here, so the next rewrite cannot lose one.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node script, untyped
import { contentScriptsRunningOn, patternCoversHost } from '../../scripts/site-isolation.mjs'

const HOST = 'app-staging.readarxiv.org'
const covers = (pattern: string, host = HOST) => patternCoversHost(pattern, host) as boolean

describe('patternCoversHost', () => {
  it('sees the patterns that cover the website without naming it', () => {
    expect(covers('https://*.readarxiv.org/*')).toBe(true)
    expect(covers('https://*.org/*')).toBe(true)
    expect(covers('*://*/*')).toBe(true)
    expect(covers('https://*/*')).toBe(true)
    expect(covers('<all_urls>')).toBe(true)
  })

  it('sees the pattern that names it, and an apex wildcard\'s own host', () => {
    expect(covers(`https://${HOST}/*`)).toBe(true)
    expect(covers(`*://${HOST}/*`)).toBe(true)
    expect(covers('https://*.readarxiv.org/*', 'readarxiv.org')).toBe(true)
  })

  it('takes a pattern with a path as covering: some page of the website matches it', () => {
    expect(covers(`https://${HOST}/library`)).toBe(true)
    expect(covers('https://*.readarxiv.org/read/*')).toBe(true)
    expect(covers('<all_urls>')).toBe(true)
  })

  it('leaves alone what does not cover it', () => {
    expect(covers('https://arxiv.org/html/*')).toBe(false)
    expect(covers('https://*.arxiv.org/*')).toBe(false)
    expect(covers(`http://${HOST}/*`)).toBe(false)
    expect(covers('https://readarxiv.org/*')).toBe(false)
    expect(covers('https://app.readarxiv.org/*')).toBe(false)
    expect(covers('https://*.example.org/*')).toBe(false)
    expect(covers('https://evilreadarxiv.org/*')).toBe(false)
    expect(covers('https://readarxiv.org.example.org/*')).toBe(false)
    expect(covers('https://*.readarxiv.org/*', 'example.org')).toBe(false)
    expect(covers('file:///*')).toBe(false)
  })

  it('stops the check on a pattern Chrome would refuse, rather than reading it as not covering', () => {
    expect(() => covers('https://app-staging.readarxiv.org')).toThrow()
    expect(() => covers('https://a*b.org/*')).toThrow()
    expect(() => covers('not a pattern')).toThrow()
  })
})

describe('contentScriptsRunningOn', () => {
  const mark = { matches: [`https://${HOST}/*`], js: ['content-scripts/web-app.js'], run_at: 'document_start' }
  const arxiv = [
    { matches: ['https://arxiv.org/abs/*'], js: ['content-scripts/abstract.js'] },
    { matches: ['https://arxiv.org/html/*'], js: ['content-scripts/content.js'] },
    { matches: ['https://arxiv.org/pdf/*'], js: ['content-scripts/pdf.js'] },
  ]
  const running = (scripts: object[]) => (contentScriptsRunningOn(scripts, HOST) as { js: string[] }[]).map(entry => entry.js[0])

  it('finds the mark alone in the manifest as it is', () => {
    expect(running([...arxiv, mark])).toEqual(['content-scripts/web-app.js'])
  })

  for (const pattern of ['https://*.readarxiv.org/*', '*://*/*', '<all_urls>']) {
    it(`finds another script whose pattern is ${pattern}`, () => {
      const other = { matches: ['https://arxiv.org/html/*', pattern], js: ['content-scripts/content.js'] }
      expect(running([other, mark])).toEqual(['content-scripts/content.js', 'content-scripts/web-app.js'])
    })
  }

  it('lets a script keep a wildcard it excludes the website from, entirely', () => {
    const wide = { matches: ['https://*/*'], exclude_matches: [`https://${HOST}/*`], js: ['content-scripts/wide.js'] }
    expect(running([wide, mark])).toEqual(['content-scripts/web-app.js'])
    const allUrls = { matches: ['<all_urls>'], exclude_matches: ['https://*.readarxiv.org/*'], js: ['content-scripts/wide.js'] }
    expect(running([allUrls, mark])).toEqual(['content-scripts/web-app.js'])
  })

  it('does not take a partial exclusion for an exclusion: the script still runs on the rest of the website', () => {
    const wide = { matches: ['https://*/*'], exclude_matches: [`https://${HOST}/library/*`], js: ['content-scripts/wide.js'] }
    expect(running([wide, mark])).toEqual(['content-scripts/wide.js', 'content-scripts/web-app.js'])
  })

  it('does not let include or exclude globs, which only narrow, take a script off the list', () => {
    const globbed = { matches: ['<all_urls>'], include_globs: ['*arxiv*'], exclude_globs: ['*readarxiv*'], js: ['content-scripts/wide.js'] }
    expect(running([globbed, mark])).toEqual(['content-scripts/wide.js', 'content-scripts/web-app.js'])
  })

  it('has nothing to find in a manifest without content scripts', () => {
    expect(contentScriptsRunningOn([], HOST)).toEqual([])
  })
})
