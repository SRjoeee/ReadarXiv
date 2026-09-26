// The popup's and the settings page's pixels, held while the redesign adds its shared controls (Part 3): the old pages
// have no `ui` root, and nothing Part 3 adds may reach them. `--baseline` records the build as it draws them — the
// popup's page off a paper, and each section of the settings page, in light and dark; without it, the build is compared
// with that record byte for byte, and whatever differs fails, both copies kept for a look. Build first.
//   pnpm build && node tests/e2e/probes/pages-pixels.mjs [--baseline]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/pages-pixels', import.meta.url))
const PROFILE = `${E2E}.profile-pages-pixels`
const recording = process.argv.includes('--baseline')
const base = join(OUT, 'baseline')
const dir = recording ? base : join(OUT, 'current')
if (!recording && !existsSync(base)) throw new Error('no baseline: run with --baseline on the build before Part 3')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })

/** the settings page's sections, by the hash it opens each at (entrypoints/options/App.tsx) */
const SECTIONS = ['services', 'reading', 'pdf-reader', 'prompts', 'data']
const STILL = { animations: 'disabled', caret: 'hide' }

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  viewport: { width: 1100, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host
const errors = []
const page = await context.newPage()
page.on('pageerror', e => errors.push(e.message))
const save = (name, bytes) => writeFileSync(join(dir, name), bytes)
/** a page opened afresh: the settings page reads its section from the hash once, as it loads */
async function open(path, ready) {
  await page.goto('about:blank')
  await page.goto(`chrome-extension://${id}/${path}`)
  await page.waitForSelector(ready)
  await page.waitForTimeout(800)
  await page.mouse.move(0, 0)
}

for (const scheme of ['light', 'dark']) {
  // the theme is the system's in a fresh profile: the colour scheme picks light or dark
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 360, height: 640 })
  await open('popup.html', 'main')
  save(`${scheme}-popup.png`, await page.locator('main').screenshot(STILL))
  await page.setViewportSize({ width: 1100, height: 900 })
  for (const section of SECTIONS) {
    await open(`options.html#${section}`, 'nav')
    save(`${scheme}-options-${section}.png`, await page.screenshot({ fullPage: true, ...STILL }))
  }
}
await context.close()

let failed = errors.length
for (const e of errors) console.log(`FAIL page error — ${e}`)
if (recording) console.log(`baseline recorded: ${readdirSync(base).length} files in ${base}`)
else {
  for (const name of readdirSync(base)) {
    const same = existsSync(join(dir, name)) && readFileSync(join(base, name)).equals(readFileSync(join(dir, name)))
    console.log(`${same ? 'ok  ' : 'FAIL'} ${name}`)
    if (!same) failed++
  }
}
process.exit(failed ? 1 : 0)
