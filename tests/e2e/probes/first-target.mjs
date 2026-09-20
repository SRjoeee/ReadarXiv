// Probe: the target language a new installation starts with (DESIGN §9, config/first-target.ts), in a real browser —
// a fresh profile per run, so the extension is installed each time, with the browser's preferred languages set by
// `--accept-lang`. Prints what the background saw and what it stored.
// Usage: pnpm build && node tests/e2e/probes/first-target.mjs ["ja-JP,en-US" ...]
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-first-target`
const LISTS = process.argv.slice(2).length ? process.argv.slice(2) : ['en-US,ja-JP,zh-CN', 'zh-TW,en', 'ko-KR', 'fr-CA,fr,en', 'en-US,en']
const sleep = ms => new Promise(r => setTimeout(r, ms))

for (const list of LISTS) {
  rmSync(PROFILE, { recursive: true, force: true })
  const context = await chromium.launchPersistentContext(PROFILE, {
    ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
    headless: !process.env.AXT_HEADED,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--accept-lang=${list}`],
  })
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker')
  // Waited for, not slept through: the write follows the install event by however long the worker takes to start
  for (let i = 0; i < 50 && !(await worker.evaluate(async () => 'config' in await chrome.storage.local.get('config'))); i++) await sleep(200)
  const seen = await worker.evaluate(async () => ({
    preferred: navigator.languages,
    ui: chrome.i18n.getUILanguage(),
    stored: (await chrome.storage.local.get('config')).config?.targetLanguage ?? '(nothing stored)',
  }))
  console.log(`--accept-lang=${list.padEnd(20)} the background sees ${JSON.stringify(seen.preferred)}, interface ${seen.ui} → stored target: ${seen.stored}`)
  await context.close()
}
rmSync(PROFILE, { recursive: true, force: true })
