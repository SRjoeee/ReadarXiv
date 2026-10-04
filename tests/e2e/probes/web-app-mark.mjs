// Probe for the website's mark (DESIGN §4.0d, shared/web-app.ts): on the website's own pages the extension writes one
// attribute on <html>, its value its version, and on no other page. What it asks of the real browser:
//   1. the website's page carries the mark, with the extension's version;
//   2. the mark is there before the page's first script runs (an inline script at the top of <head> reads it): the
//      website can read it without waiting for anything;
//   3. nothing else of the page changed: <html> holds `lang` and the mark alone, <head> and <body> are as served;
//   4. no other page carries it: arXiv, an unrelated site, the website's name inside another host, and the website
//      over plain http.
// The hosts are routed to a local page: no request leaves the machine, and the website need not exist.
// Usage: pnpm build && node tests/e2e/probes/web-app-mark.mjs      (AXT_CHROME=<binary> for another Chrome; AXT_EXT_DIR for another build)
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-web-app-mark`
const MARK = 'data-readarxiv-extension'
const WEBSITE = 'https://app-staging.readarxiv.org/'
const HEAD = `<meta charset="utf-8"><title>probe</title><script>window.axtMarkAtFirstScript = document.documentElement.getAttribute('${MARK}')</script>`
const BODY = '<body><main id="app"><p>hello</p></main></body>'
const PAGE = `<!doctype html><html lang="en"><head>${HEAD}</head>${BODY}</html>`

rmSync(PROFILE, { recursive: true, force: true })
const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
context.setDefaultNavigationTimeout(60_000)
// Every address below goes to the one local page, and nothing leaves the machine
await context.route(() => true, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }))
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const { version, id } = await worker.evaluate(() => ({ version: chrome.runtime.getManifest().version, id: chrome.runtime.id }))
// What reaches the page, as a script of the page's own would hear it: any message to the window, and the one event WXT's
// wrapper dispatches on `document` when a content script starts (its name carries the extension's id, which this
// probe knows and a page would have to). The init script is in place before the page's first script
await context.addInitScript(extensionId => {
  window.axtHeard = []
  window.addEventListener('message', event => window.axtHeard.push(`message ${JSON.stringify(event.data)}`))
  document.addEventListener(`${extensionId}:web-app:wxt:content-script-started`, () => window.axtHeard.push('wxt content-script-started event'))
}, id)
const page = context.pages()[0] ?? await context.newPage()

let failed = 0
const check = (name, ok, detail) => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}

const read = () => page.evaluate(mark => ({
  mark: document.documentElement.getAttribute(mark),
  first: window.axtMarkAtFirstScript,
  heard: window.axtHeard,
  htmlAttributes: [...document.documentElement.attributes].map(a => a.name).sort(),
  head: document.head.innerHTML,
  body: document.body.outerHTML,
}), MARK)

await page.goto(WEBSITE, { waitUntil: 'load' })
const site = await read()
check('the website\'s page is marked with the extension\'s version', site.mark === version, `${MARK}="${site.mark}", the extension is ${version}`)
check('…before the page\'s first script ran', site.first === version, `an inline script at the top of <head> read "${site.first}"`)
check('…and nothing else of the page changed', JSON.stringify(site.htmlAttributes) === JSON.stringify(['lang', MARK].sort()) && site.head === HEAD && site.body === BODY, `<html> holds ${site.htmlAttributes.join(', ')}; <head> as served: ${site.head === HEAD}; <body> as served: ${site.body === BODY}`)
// Message listeners are told in a task of their own: a moment for one to arrive
await new Promise(resolve => setTimeout(resolve, 500))
const heard = (await read()).heard
const messages = heard.filter(entry => entry.startsWith('message'))
check('…and no message was sent to the page', messages.length === 0, messages.length === 0 ? 'no message event reached the window' : `the page heard: ${messages.join('; ')}`)
// WXT's wrapper still dispatches its start event on `document`; only a listener that names it (the extension's id is in the name) hears it. Recorded, not judged
console.log(`INFO the start event on document, heard by a listener that names it: ${heard.includes('wxt content-script-started event')}`)

for (const [name, url] of [
  ['https://arxiv.org/abs/…', 'https://arxiv.org/abs/1706.03762'],
  ['https://example.org/', 'https://example.org/'],
  ['the website\'s name inside another host', 'https://app-staging.readarxiv.org.example.org/'],
  ['the website over plain http', 'http://app-staging.readarxiv.org/'],
]) {
  await page.goto(url, { waitUntil: 'load' })
  const seen = await read()
  check(`no mark on ${name}`, seen.mark === null && seen.first === null, `${MARK}=${JSON.stringify(seen.mark)}, read at the first script: ${JSON.stringify(seen.first)}`)
}

await context.close()
console.log(failed === 0 ? '\nall rows PASS' : `\n${failed} row(s) FAIL`)
process.exit(failed === 0 ? 0 : 1)
