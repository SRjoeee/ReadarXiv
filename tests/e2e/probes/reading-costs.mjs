// Probe: what a translated paper costs while it is being read — long tasks while scrolling through it as translations
// arrive (from the cache: the network is not what is measured), the cost of a mode switch, and the heap over three
// translate / restore cycles (what a restore leaves behind).
// Usage: pnpm build && node tests/e2e/probes/reading-costs.mjs [paper]
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PAPER = process.argv[2] ?? '2312.17141'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const context = await chromium.launchPersistentContext(`${E2E}.profile-hl`, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--enable-precise-memory-info', '--js-flags=--expose-gc'],
  viewport: { width: 1440, height: 900 },
})
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const toTab = message => worker.evaluate(async m => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return chrome.tabs.sendMessage(tab.id, m) }, message)

const page = await context.newPage()
await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
await page.bringToFront()
await sleep(3500)
const cdp = await context.newCDPSession(page)
await page.evaluate(() => {
  // Long animation frames, not long tasks: a mode switch is one attribute written, and its whole cost — the style
  // recalculation and the layout — falls in the frame's rendering, which the Long Tasks API does not count
  window.__long = []
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: 'long-animation-frame' })
})
const longs = () => page.evaluate(() => window.__long.splice(0))
const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const { usedSize } = await cdp.send('Runtime.getHeapUsage'); const dom = await cdp.send('Memory.getDOMCounters'); return { heapMB: Math.round(usedSize / 1e5) / 10, nodes: dom.nodes, listeners: dom.jsEventListeners } }
const scrollThrough = () => page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 900) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)) } window.scrollTo(0, 0) })

console.log(`=== ${PAPER}`)
console.log('before anything:', JSON.stringify(await heap()))
await toTab({ type: 'axt:translate-page' })
await sleep(2500)
await longs()
const t0 = Date.now()
await scrollThrough()
await sleep(4000)
const scrolling = await longs()
console.log(`scrolling through while translations arrive (${Math.round((Date.now() - t0) / 1000)} s): ${scrolling.length} long frames (over 50 ms), the longest ${Math.max(0, ...scrolling)} ms, sum ${scrolling.reduce((a, b) => a + b, 0)} ms; over 100 ms: ${scrolling.filter(d => d > 100).length}`)
console.log('translated:', JSON.stringify(await heap()))

for (const mode of ['stack', 'only', 'side']) {
  await longs()
  await toTab({ type: 'axt:set-mode', mode })
  await sleep(1500)
  console.log(`switch to ${mode}: long frames ${JSON.stringify(await longs())}`)
}

for (let cycle = 1; cycle <= 1; cycle++) {
  await toTab({ type: 'axt:restore-page' })
  await sleep(1500)
  const restored = await heap()
  await toTab({ type: 'axt:translate-page' })
  await sleep(2000)
  await scrollThrough()
  await sleep(3000)
  console.log(`cycle ${cycle}: restored ${JSON.stringify(restored)} → translated again ${JSON.stringify(await heap())}`)
}
await toTab({ type: 'axt:restore-page' })
await sleep(1500)
console.log('restored at the end:', JSON.stringify(await heap()))
await context.close()
