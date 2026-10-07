// Does the PoC extension load? Prints the extension id, or the load error from chrome://extensions
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const { chromium } = createRequire(new URL('../../../', import.meta.url))('playwright')
const EXT = new URL('../poc-ext', import.meta.url).pathname
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'poc-')), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] })
const w = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null)
if (w) console.log('loaded', new URL(w.url()).host)
else {
  const page = await context.newPage()
  await page.goto('chrome://extensions')
  await page.waitForTimeout(1500)
  console.log('not loaded; page text:', (await page.evaluate(() => document.querySelector('extensions-manager')?.shadowRoot?.textContent ?? document.body.innerText)).replace(/\s+/g, ' ').slice(0, 600))
}
await context.close()
