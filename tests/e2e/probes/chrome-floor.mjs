// Probe for the manifest's floor (DESIGN §1): the extension on a Chrome between the manifest's floor (131, anchor positioning) and the
// built-in translator's arrival (138). Expected: `Translator` absent, the Chrome card on the settings page says it is
// unavailable with no download button, and nothing else complains. Run 2026-09-17 on Chrome for Testing 137.0.7151.119
// (`npx @puppeteer/browsers install chrome@137`). Usage: node tests/e2e/probes/chrome-floor.mjs <chrome binary>
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { openSection } from '../options-page.mjs'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const CHROME = process.argv[2]
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-floor`
rmSync(PROFILE, { recursive: true, force: true })
const context = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME, headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1100, height: 900 },
})
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const extId = worker.url().split('/')[2]
const version = await worker.evaluate(() => navigator.userAgent.match(/Chrome\/(\d+)/)?.[1])
// The error listener goes on before the page loads: an exception while the settings page initialises is what this
// probe exists to see (Codex on #215 — attached after the load, `pageErrors: []` proved nothing)
const errors = []
const options = await context.newPage()
options.on('pageerror', e => errors.push(String(e)))
await options.goto(`chrome-extension://${extId}/options.html`)
await options.waitForLoadState('domcontentloaded')
await openSection(options, 'services')
await options.waitForTimeout(1500)
const facts = await options.evaluate(() => ({
  translator: typeof globalThis.Translator,
  cards: Array.from(document.querySelectorAll('[data-axt-service], article, li, div')).map(el => el.textContent?.trim() ?? '').filter(t => /Chrome/.test(t) && t.length < 200).slice(0, 4),
  downloadButtons: Array.from(document.querySelectorAll('button')).filter(b => /Download|下载/.test(b.textContent ?? '')).length,
}))
await options.waitForTimeout(500)
console.log(JSON.stringify({ chrome: version, ...facts, pageErrors: errors }, null, 2))
await context.close()
