// Probe for the toolbar button's two states (UI.md §5.1): grey by default, lit for a tab whose page the extension
// works on. What it asks of the real browser:
//   1. each of the three pages — abstract, PDF, full text — lights its own tab, and no other page does;
//   2. Chrome drops a value set for one tab when that tab goes to another document, which is what turns the button grey
//      again with no code of ours. Chrome has no getter for an icon, so this is read from the title: Chromium's
//      `ExtensionAction::ClearAllValuesForTab`, called on a cross-document navigation, erases the two together (UI.md §5.1);
//   3. a page brought back from the back/forward cache, whose script does not run again, lights its tab once more.
// Usage: pnpm build && node tests/e2e/probes/action-icon.mjs      (AXT_CHROME=<binary> for another Chrome)
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-action-icon`
const PAPER = '1706.03762'
rmSync(PROFILE, { recursive: true, force: true })
const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  // Playwright turns the back/forward cache off by default, and check 3 is about exactly that cache
  ignoreDefaultArgs: ['--disable-back-forward-cache'],
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
context.setDefaultNavigationTimeout(90_000)
const page = context.pages()[0] ?? await context.newPage()
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let failed = 0
const check = (name, ok, detail) => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
}

// The worker records which tabs it lit, and still lights them
await worker.evaluate(() => {
  globalThis.axtLit = []
  const setIcon = chrome.action.setIcon.bind(chrome.action)
  chrome.action.setIcon = details => { globalThis.axtLit.push(details.tabId ?? null); return setIcon(details) }
})
const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id)
const lit = () => worker.evaluate(() => globalThis.axtLit.splice(0))
const visit = async url => {
  await page.goto(url, { waitUntil: 'load' })
  await sleep(1500)
  return lit()
}

check('the manifest starts the button grey', (await worker.evaluate(() => JSON.stringify(chrome.runtime.getManifest().action.default_icon))).includes('mark-off-16.png'), 'default_icon')
for (const url of [`https://arxiv.org/abs/${PAPER}`, `https://arxiv.org/pdf/${PAPER}`, `https://arxiv.org/html/${PAPER}`]) {
  const calls = await visit(url)
  check(`${new URL(url).pathname} lights its own tab`, calls.length === 1 && calls[0] === tabId, `setIcon for ${JSON.stringify(calls)}, the tab is ${tabId}`)
}
for (const url of ['https://arxiv.org/', 'https://example.com/']) {
  const calls = await visit(url)
  check(`${url} lights nothing`, calls.length === 0, `setIcon for ${JSON.stringify(calls)}`)
}

// The per-tab store is cleared by a cross-document navigation, and kept across a same-document one
const title = () => worker.evaluate(id => chrome.action.getTitle({ tabId: id }), tabId)
const DEFAULT = await title()
await worker.evaluate(id => chrome.action.setTitle({ tabId: id, title: 'axt-probe' }), tabId)
await page.goto('https://example.com/#elsewhere')
await sleep(300)
const afterHash = await title()
await page.goto(`https://arxiv.org/abs/${PAPER}`, { waitUntil: 'load' })
await sleep(1500)
const afterNavigation = await title()
check('a value set for one tab survives a hash change and is dropped when the tab goes to another document', afterHash === 'axt-probe' && afterNavigation === DEFAULT, `after the hash: “${afterHash}”, after the navigation: “${afterNavigation}” (default “${DEFAULT}”)`)
await lit()

// Back to the abstract from example.com: served from the back/forward cache when Chrome keeps it there, which a
// value left on the abstract's window tells
await page.evaluate(() => { window.axtProbeKept = true })
await page.goto('https://example.com/', { waitUntil: 'load' })
await sleep(500)
await lit()
// A page restored from the cache fires no load event: the commit is what there is to wait for
await page.goBack({ waitUntil: 'commit' })
await sleep(1500)
const cached = await page.evaluate(() => window.axtProbeKept === true)
const back = await lit()
check('going back to the abstract lights its tab again, from the back/forward cache or not', back.length === 1 && back[0] === tabId, `from the cache: ${cached}, setIcon for ${JSON.stringify(back)}`)

await context.close()
process.exit(failed ? 1 : 0)
