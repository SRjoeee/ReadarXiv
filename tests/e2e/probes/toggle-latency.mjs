// Probe: what a reader waits for after a click on the floating button's main button — from the pointer's release to
// the page's state changing (`data-axt-on` on <html>) and to the frame after it — for a translation's start and for
// a restore, on papers of three sizes. Says how much of the wait is the message path (page → background → page, with
// the background's decision) and how much is the page's own work.
// Usage: pnpm build && node tests/e2e/probes/toggle-latency.mjs [paper ...]
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-hl`
const PAPERS = process.argv.slice(2).length ? process.argv.slice(2) : ['2410.00260', '2401.00418', '2312.17141']
const sleep = ms => new Promise(r => setTimeout(r, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
context.setDefaultNavigationTimeout(90_000)

for (const id of PAPERS) {
  const page = await context.newPage()
  await page.goto(`https://arxiv.org/html/${id}`, { waitUntil: 'load' })
  await page.bringToFront()
  await sleep(3500)
  const elements = await page.evaluate(() => document.querySelectorAll('*').length)
  await page.evaluate(() => {
    window.__clicks = []
    let t0 = 0
    // The release of the press is when the reader has asked; the floating button acts on the click that follows it
    window.addEventListener('pointerup', () => { t0 = performance.now() }, true)
    new MutationObserver(() => {
      const changed = performance.now()
      const on = document.documentElement.hasAttribute('data-axt-on')
      requestAnimationFrame(() => requestAnimationFrame(() => window.__clicks.push({ on, toState: Math.round(changed - t0), toFrame: Math.round(performance.now() - t0) })))
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-axt-on'] })
    // Long tasks, as the page's own PerformanceObserver reports them
    window.__long = []
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: false })
  })
  const main = await page.evaluate(() => { const r = document.querySelector('.axt-floating').shadowRoot.querySelector('.axt-fb-main').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  const rounds = []
  for (let round = 0; round < 3; round++) {
    await page.mouse.click(main.x, main.y)
    await sleep(6000)
    await page.evaluate(async () => { for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 30000); y += 1800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100)) } window.scrollTo(0, 0) })
    await sleep(3000)
    const longOn = await page.evaluate(() => window.__long.splice(0))
    await page.mouse.click(main.x, main.y)
    await sleep(2500)
    const longOff = await page.evaluate(() => window.__long.splice(0))
    const [on, off] = await page.evaluate(() => window.__clicks.splice(0))
    rounds.push({ on, off, longOn: longOn.slice(0, 4), longOff })
  }
  console.log(`\n=== ${id}: ${elements} elements`)
  for (const r of rounds) console.log(`translate: state after ${r.on?.toState} ms, frame after ${r.on?.toFrame} ms (long tasks ${JSON.stringify(r.longOn)}) | restore: state after ${r.off?.toState} ms, frame after ${r.off?.toFrame} ms (long tasks ${JSON.stringify(r.longOff)})`)
  await page.close()
}
await context.close()
