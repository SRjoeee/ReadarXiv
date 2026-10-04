import { describe, expect, it } from 'vitest'
import { EXTENSION_MARK, markWebAppPage, WEB_APP_HOSTS, WEB_APP_MATCHES } from '@/shared/web-app'

// The website's mark (shared/web-app.ts, DESIGN §4.0d): one attribute on <html>, its value the extension's version, so
// the website knows the extension is installed and which version it is. Nothing is read from the page, and nothing
// else is written to it

const page = () => new DOMParser().parseFromString('<!doctype html><html lang="en"><head><title>t</title></head><body><main id="app">x</main></body></html>', 'text/html')
const attributesOf = (el: Element) => Object.fromEntries([...el.attributes].map(a => [a.name, a.value]))

describe('markWebAppPage', () => {
  it('marks the page with the extension\'s version, as one attribute on <html>, and nothing else of it changed', () => {
    const doc = page()
    const before = { html: attributesOf(doc.documentElement), tree: doc.documentElement.innerHTML }
    markWebAppPage(doc, '0.4.1')
    expect(attributesOf(doc.documentElement)).toEqual({ ...before.html, [EXTENSION_MARK]: '0.4.1' })
    expect(doc.documentElement.innerHTML).toBe(before.tree)
  })

  it('writes the attribute once when it is marked again with the same version', async () => {
    const doc = page()
    const writes: string[] = []
    const watcher = new MutationObserver(records => { for (const r of records) writes.push(`${r.type}:${r.attributeName}`) })
    watcher.observe(doc.documentElement, { attributes: true, childList: true, subtree: true, characterData: true })
    markWebAppPage(doc, '0.4.1')
    markWebAppPage(doc, '0.4.1')
    await Promise.resolve()
    watcher.disconnect()
    expect(writes).toEqual([`attributes:${EXTENSION_MARK}`])
  })

  it('says the new version when the version changed', () => {
    const doc = page()
    markWebAppPage(doc, '0.4.1')
    markWebAppPage(doc, '0.4.2')
    expect(doc.documentElement.getAttribute(EXTENSION_MARK)).toBe('0.4.2')
  })

  it('is a contract with the website, not one of the extension\'s own marks', () => {
    expect(EXTENSION_MARK).toBe('data-readarxiv-extension')
  })
})

describe('the website\'s hosts', () => {
  it('are the website\'s alone, over https: staging now', () => {
    expect([...WEB_APP_HOSTS]).toEqual(['app-staging.readarxiv.org'])
    expect(WEB_APP_MATCHES).toEqual(['https://app-staging.readarxiv.org/*'])
  })
})
