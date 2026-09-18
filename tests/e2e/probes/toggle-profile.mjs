// Probe: a CPU profile of the page's main thread over the start of a translation and over a restore, by function —
// which of our functions the script time of those two long tasks is spent in. Needs an unminified build
// (`build.minify: false` for one build), or the names are single letters.
// Usage: AXT_EXT_DIR=.output/chrome-mv3-profile node tests/e2e/probes/toggle-profile.mjs [paper]
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = resolve(process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url)))
const PAPER = process.argv[2] ?? '2312.17141'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const context = await chromium.launchPersistentContext(`${E2E}.profile-hl`, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const toTab = type => worker.evaluate(async t => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return chrome.tabs.sendMessage(tab.id, { type: t }) }, type)

const page = await context.newPage()
await page.goto(`https://arxiv.org/html/${PAPER}`, { waitUntil: 'load' })
await page.bringToFront()
await sleep(3500)
const cdp = await context.newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })

/** Self time and total time per function of ours (and the browser's own entries), from a sampled profile */
async function profile(label, fn) {
  await cdp.send('Profiler.start')
  await fn()
  const { profile } = await cdp.send('Profiler.stop')
  const byId = new Map(profile.nodes.map(n => [n.id, n]))
  const self = new Map()
  const dt = profile.timeDeltas
  for (const [i, id] of profile.samples.entries()) self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0))
  const total = new Map()
  const walk = node => { let t = self.get(node.id) ?? 0; for (const c of node.children ?? []) t += walk(byId.get(c)); total.set(node.id, t); return t }
  walk(profile.nodes[0])
  const rows = new Map()
  for (const n of profile.nodes) {
    const f = n.callFrame
    if (!f.url.includes('content-scripts')) continue
    const key = `${f.functionName || '(anonymous)'}:${f.lineNumber}`
    const row = rows.get(key) ?? { name: f.functionName || '(anonymous)', line: f.lineNumber, self: 0, total: 0 }
    row.self += self.get(n.id) ?? 0
    row.total = Math.max(row.total, total.get(n.id) ?? 0)
    rows.set(key, row)
  }
  const ms = us => Math.round(us / 100) / 10
  const top = [...rows.values()].filter(r => r.total > 1500).sort((a, b) => b.total - a.total).slice(0, 28)
  console.log(`\n===== ${label}: functions of the content script, by total time (self)`)
  for (const r of top) console.log(`${String(ms(r.total)).padStart(7)} ms  (${String(ms(r.self)).padStart(6)} self)  ${r.name}  :${r.line}`)
  // The browser's own work the script asked for synchronously
  const native = new Map()
  for (const n of profile.nodes) if (!n.callFrame.url && (self.get(n.id) ?? 0) > 0) native.set(n.callFrame.functionName, (native.get(n.callFrame.functionName) ?? 0) + self.get(n.id))
  console.log('native:', [...native.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${ms(v)}`).join(' · '))
}

await profile(`start of a translation — ${PAPER}`, async () => { await toTab('axt:translate-page'); await sleep(1500) })
await page.evaluate(async () => { for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 40000); y += 1800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100)) } window.scrollTo(0, 0) })
await sleep(6000)
const setMode = mode => worker.evaluate(async m => { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return chrome.tabs.sendMessage(tab.id, { type: 'axt:set-mode', mode: m }) }, mode)
await profile(`switch to stack — ${PAPER}`, async () => { await setMode('stack'); await sleep(1200) })
await profile(`switch back to side — ${PAPER}`, async () => { await setMode('side'); await sleep(1200) })
await profile(`restore — ${PAPER}`, async () => { await toTab('axt:restore-page'); await sleep(1200) })
await context.close()
