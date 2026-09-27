// How fast the popup paints (the redesign's design, §12: the popup opens as fast as it did), in the toolbar's place and
// in the floating button's panel: popup.html opened in a tab the toolbar popup's size, and the panel's frame opened by
// the floating button's main button on an abstract page — ten times each, the median of the first contentful paint.
// `--baseline` records the build as it is (Part 4's Task 30: the popup as Part 3 left it); without it the build is
// measured against that record, and a median more than 10 % and 4 ms slower fails. Build first; the panel needs the
// network (arXiv).
//   node tests/e2e/probes/popup-first-paint.mjs [--baseline]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const EXT = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const OUT = fileURLToPath(new URL('../../../experiments/pdf-bilingual/out/popup-first-paint/', import.meta.url))
const BASELINE = join(OUT, 'baseline.json')
const RUNS = 10
/** an abstract page, where the floating button's main button opens the panel */
const ABSTRACT = `https://arxiv.org/abs/${process.env.AXT_PAPER ?? '1706.03762'}`
const recording = process.argv.includes('--baseline')
mkdirSync(OUT, { recursive: true })
if (!recording && !existsSync(BASELINE)) throw new Error('no baseline: run with --baseline on the build before the change')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const median = values => {
  if (values.length < RUNS) console.warn(`only ${values.length} of ${RUNS} runs painted`)
  if (values.length < RUNS / 2) throw new Error(`only ${values.length} of ${RUNS} runs painted`)
  const s = [...values].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
/** the first contentful paint of a page or a frame, from its own time origin; null if none came within 5 s */
const firstPaint = target => target.evaluate(() => new Promise(resolve => {
  const read = () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime
  const wait = (n = 0) => (read() !== undefined || n > 100 ? resolve(read() ?? null) : setTimeout(() => wait(n + 1), 50))
  wait()
}))

const profile = mkdtempSync(join(tmpdir(), 'popup-first-paint-'))
// the profile goes when the process ends, a failure's throw included (a profile a run once filled the disk)
process.on('exit', () => rmSync(profile, { recursive: true, force: true }))
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
context.setDefaultNavigationTimeout(90_000)
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const id = new URL(worker.url()).host

const toolbar = []
for (let i = 0; i < RUNS; i++) {
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 320, height: 600 })
  await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'load' })
  toolbar.push(await firstPaint(popup))
  await popup.close()
}
const panel = []
const page = await context.newPage()
for (let i = 0; i < RUNS; i++) {
  await page.goto(ABSTRACT, { waitUntil: 'load' })
  await sleep(1500)
  // a real click, pressed and released: the press puts up the button's drag shield (pdf-entry.mjs)
  const at = await page.evaluate(() => {
    const r = document.querySelector('.axt-floating')?.shadowRoot?.querySelector('.axt-fb-main')?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  })
  if (!at) throw new Error('no floating button on the abstract page')
  await page.mouse.click(at.x, at.y)
  await sleep(2500)
  const frame = page.frames().find(f => f.url().includes('/popup.html'))
  panel.push(frame ? await firstPaint(frame) : null)
}
await context.close()

const now = { toolbar: median(toolbar.filter(Number.isFinite)), panel: median(panel.filter(Number.isFinite)) }
if (recording) {
  writeFileSync(BASELINE, JSON.stringify(now, null, 1))
  console.log(`baseline recorded: toolbar ${now.toolbar.toFixed(1)} ms, panel ${now.panel.toFixed(1)} ms (medians of ${RUNS})`)
  process.exit(0)
}
const before = JSON.parse(readFileSync(BASELINE, 'utf8'))
let failed = 0
for (const where of ['toolbar', 'panel']) {
  const slower = now[where] > before[where] * 1.1 + 4
  console.log(`${slower ? 'FAIL' : 'ok  '} ${where}: first contentful paint ${before[where].toFixed(1)} → ${now[where].toFixed(1)} ms (median of ${RUNS})`)
  if (slower) failed++
}
process.exit(failed ? 1 : 0)
