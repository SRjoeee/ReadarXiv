// The names of the layer's links that have no text under them (UI.md S-R-25, the owner's words of 2026-10-17): by where the
// link goes, in the interface's language, said to screen readers as the link's name: the reader package's rule (linkNameOf)
// over the interface pack's words (R.linkName), read at each call
import { afterEach, describe, expect, it } from 'vitest'
import { linkNameOf } from '@readarxiv/reader'
import { R, setLocale } from '@readarxiv/ui'

afterEach(() => setLocale('en'))

/** a link's name as the reader names it: the package's rule over the pack's words of the moment */
const nameOf = (to: { url: string } | { internal: true }) => linkNameOf(to, R.linkName)

describe('the names of links with no text under them, by the reader package\'s rule (linkNameOf) over the pack\'s words', () => {
  it('in Chinese: elsewhere in the paper, a web page by its site, an email by its address, else a link (linkNameOf, R.linkName)', () => {
    setLocale('zh-CN')
    expect(nameOf({ internal: true })).toBe('本文中的其他位置')
    expect(nameOf({ url: 'https://github.com/org/repo?x=1#y' })).toBe('打开 github.com')
    expect(nameOf({ url: 'mailto:a.b@example.org?subject=hi' })).toBe('发邮件给 a.b@example.org')
    expect(nameOf({ url: 'mailto:' })).toBe('链接')
    expect(nameOf({ url: 'not a url' })).toBe('链接')
  })

  it('in English, and the language read at each call, the interface switched meanwhile (linkNameOf, R.linkName)', () => {
    setLocale('en')
    expect(nameOf({ internal: true })).toBe('Elsewhere in this paper')
    expect(nameOf({ url: 'http://www.example.org/a' })).toBe('Opens www.example.org')
    expect(nameOf({ url: 'mailto:someone%40example.org' })).toBe('Email someone@example.org')
    expect(nameOf({ url: 'ftp://example.org' })).toBe('Link')
    setLocale('zh-CN')
    expect(nameOf({ internal: true })).toBe('本文中的其他位置')
  })
})
