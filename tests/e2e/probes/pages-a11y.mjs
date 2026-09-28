// Axe on the extension's own pages after the redesign (its design, §9): the popup in every state the gallery draws —
// light and dark side by side — and the settings page's four sections, a search, the service form and the style editor
// open, in both themes and both languages. `e2e:a11y` audits arXiv's pages, A against B; nothing else audits these. The
// gate is no serious or critical violation inside the popup or on the settings page; the rest are printed for the record.
// The gallery is a development page:
//   pnpm exec wxt build --mode development && node tests/e2e/probes/pages-a11y.mjs
// Environment: AXT_EXT_DIR another build; AXT_CHROME another Chrome.
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3-dev', import.meta.url))
const PROFILE = `${E2E}.profile-pages-a11y`
rmSync(PROFILE, { recursive: true, force: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1300, height: 1100 },
})
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const extensionId = new URL(worker.url()).host
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let failed = 0

/** A patch on the configuration the extension wrote at install */
const patch = change => worker.evaluate(async change => {
  for (let i = 0; i < 100 && !(await chrome.storage.local.get('config')).config; i++) await new Promise(r => setTimeout(r, 100))
  const { config } = await chrome.storage.local.get('config')
  await chrome.storage.local.set({ config: { ...config, ...change } })
}, change)

/** Axe on the page as it is; `scope` keeps the nodes inside it (the gallery's own frame is not the product) */
async function audit(name, scope) {
  await page.mouse.move(2, 2)
  await sleep(300)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const ours = []
  for (const v of violations) {
    const kept = await Promise.all(v.nodes.map(n => page.evaluate(([selector, scope]) => !scope || !!document.querySelector(selector)?.closest(scope), [n.target.join(' '), scope]).catch(() => true)))
    const nodes = v.nodes.filter((_, i) => kept[i])
    if (nodes.length) ours.push({ id: v.id, impact: v.impact, n: nodes.length, first: nodes[0].target.join(' ') })
  }
  const serious = ours.filter(v => v.impact === 'serious' || v.impact === 'critical')
  const rest = ours.filter(v => !serious.includes(v))
  console.log(`${serious.length ? 'FAIL' : 'ok  '} ${name}${serious.length ? ` — ${serious.map(v => `${v.id}×${v.n} ${v.first}`).join('; ')}` : ''}${rest.length ? ` (also ${rest.map(v => `${v.impact}:${v.id}×${v.n}`).join(', ')})` : ''}`)
  failed += serious.length
}
/** Leaving one of the extension's own pages for another has, once measured, aborted with net::ERR_ABORTED — a stray
 * navigation from the page just left races the new one; retried once */
const goto = async url => {
  try {
    await page.goto(url)
  } catch {
    await sleep(300)
    await page.goto(url)
  }
}
const open = async hash => {
  await goto(`chrome-extension://${extensionId}/options.html#${hash}`)
  await page.waitForSelector('main [data-card]')
  await sleep(500)
}

for (const lang of ['zh-CN', 'en']) {
  await patch({ uiLanguage: lang })
  await goto(`chrome-extension://${extensionId}/gallery.html`)
  await page.waitForSelector('main.popup')
  await sleep(800)
  await audit(`${lang}: the popup, every state, light and dark (the gallery)`, 'main.popup')
  for (const theme of ['light', 'dark']) {
    await patch({ theme })
    for (const section of ['translate', 'appearance', 'reading', 'data']) {
      await open(section)
      await audit(`${lang}, ${theme}: settings, ${section}`)
    }
    await open('translate')
    await page.locator('[data-row="translate/services"] > button[data-srow]').last().click()
    await page.waitForSelector('form[data-form="service"]')
    await audit(`${lang}, ${theme}: settings, the service form open`)
    await open('appearance')
    const style = page.locator('[data-row="appearance/styles"] > [data-srow]').nth(1)
    await style.hover()
    await style.locator('[data-icon-button]').click()
    await sleep(400)
    await audit(`${lang}, ${theme}: settings, a style's editor open`)
    await page.locator('.o-search input').fill('PDF')
    await sleep(400)
    await audit(`${lang}, ${theme}: settings, a search`)
  }
}
await context.close()
for (const e of errors) console.log(`FAIL page error — ${e}`)
process.exit(failed || errors.length ? 1 : 0)
