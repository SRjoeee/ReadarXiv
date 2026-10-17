// The names of the layer's links that have no text under them (UI.md S-R-25, the owner's words of 2026-10-17): by where the
// link goes, in the interface's language, said to screen readers as the link's name (set as text: links.mjs)
import { afterEach, describe, expect, it } from 'vitest'
import { linkNameOf } from '@/pdf-reader/ui/link-names'
import { setLocale } from '@/ui/strings'

afterEach(() => setLocale('en'))

describe('the names of links with no text under them', () => {
  it('in Chinese: elsewhere in the paper, a web page by its site, an email by its address, else a link', () => {
    setLocale('zh-CN')
    expect(linkNameOf({ internal: true })).toBe('本文中的其他位置')
    expect(linkNameOf({ url: 'https://github.com/org/repo?x=1#y' })).toBe('打开 github.com')
    expect(linkNameOf({ url: 'mailto:a.b@example.org?subject=hi' })).toBe('发邮件给 a.b@example.org')
    expect(linkNameOf({ url: 'mailto:' })).toBe('链接')
    expect(linkNameOf({ url: 'not a url' })).toBe('链接')
  })

  it('in English, and the language read at each call (the interface switched meanwhile)', () => {
    setLocale('en')
    expect(linkNameOf({ internal: true })).toBe('Elsewhere in this paper')
    expect(linkNameOf({ url: 'http://www.example.org/a' })).toBe('Opens www.example.org')
    expect(linkNameOf({ url: 'mailto:someone%40example.org' })).toBe('Email someone@example.org')
    expect(linkNameOf({ url: 'ftp://example.org' })).toBe('Link')
    setLocale('zh-CN')
    expect(linkNameOf({ internal: true })).toBe('本文中的其他位置')
  })
})
