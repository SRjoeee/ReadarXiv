// Probe for the cost of "show the original" (the maintainer, 2026-09-19: translating answers at once, undoing it
// hesitates). Translates a paper to rest, then sends `axt:restore-page` under a CDP trace and says where the time
// went: the content script's own run (`FunctionCall`), the style recalculation and the layout that follow it, and the
// longest task. The same trace is taken for the start of a translation, for comparison, and the three loops of
// `restore()` are timed apart on the translated page (read-only: nothing is removed) to say which of them it is.
// Reuses the profile highlight-lag.mjs leaves behind (its cache holds the papers), so a paper settles in seconds.
// Usage: pnpm build && node tests/e2e/probes/restore-cost.mjs [paper ...]   (default 2410.00260 2312.17141)
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ? resolve(process.env.AXT_EXT_DIR) : fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-hl`
const PAPERS = process.argv.slice(2).length ? process.argv.slice(2) : ['2410.00260', '2312.17141']
const IDLE = /session idle: (\d+)\/(\d+) requested of (\d+), (\d+) failed, (\d+) cached/
const sleep = ms => new Promise(r => setTimeout(r, ms))

const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
context.setDefaultNavigationTimeout(90_000)
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')

const idleStable = async (page, logs) => {
  let last = null
  let stable = 0
  for (let i = 0; i < 400 && stable < 3; i++) {
    await sleep(1000)
    const idle = logs.findLast(l => IDLE.test(l.text))
    const pending = await page.evaluate(() => document.querySelectorAll('.axt-pending').length).catch(() => 1)
    stable = idle && pending === 0 && idle.text === last?.text ? stable + 1 : 0
    last = idle
  }
  return last?.text
}

/** Runs `fn` under a trace; returns the main thread's events of the kinds that make up a reader's wait */
async function traced(cdp, fn) {
  const events = []
  const onData = e => events.push(...e.value)
  cdp.on('Tracing.dataCollected', onData)
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,toplevel', transferMode: 'ReportEvents' })
  await fn()
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  await cdp.send('Tracing.end')
  await done
  cdp.off('Tracing.dataCollected', onData)
  const ms = e => Math.round(e.dur / 100) / 10
  const of = name => events.filter(e => e.name === name && e.ph === 'X' && e.dur > 500)
  const sum = list => Math.round(list.reduce((t, e) => t + e.dur, 0) / 100) / 10
  const tasks = of('RunTask').sort((a, b) => b.dur - a.dur)
  return {
    longestTasks: tasks.slice(0, 3).map(ms),
    script: sum(of('FunctionCall')) + sum(of('EvaluateScript')),
    recalc: of('UpdateLayoutTree').map(e => `${ms(e)} ms/${e.args?.elementCount ?? '?'} el`).sort((a, b) => Number.parseFloat(b) - Number.parseFloat(a)).slice(0, 3),
    recalcTotal: sum(of('UpdateLayoutTree')),
    layoutTotal: sum(of('Layout')),
    paintTotal: sum([...of('Paint'), ...of('PrePaint'), ...of('Layerize'), ...of('Commit')]),
    gc: sum([...of('MajorGC'), ...of('MinorGC'), ...of('V8.GC_MC_BACKGROUND_MARKING')]),
  }
}

const toTab = (type) => worker.evaluate(async t => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return chrome.tabs.sendMessage(tab.id, { type: t })
}, type)

for (const id of PAPERS) {
  const page = await context.newPage()
  const logs = []
  page.on('console', m => { const t = m.text(); if (t.includes('[axt]')) logs.push({ t: Date.now(), text: t }) })
  await page.goto(`https://arxiv.org/html/${id}`, { waitUntil: 'load' })
  await page.bringToFront()
  await sleep(3000)
  const cdp = await context.newCDPSession(page)
  const elements = await page.evaluate(() => document.querySelectorAll('*').length)

  // The start of a translation, for comparison: the click's own cost, not the translations arriving after it
  const start = await traced(cdp, async () => { await toTab('axt:translate-page'); await sleep(1200) })
  // Scroll the whole paper through so that every block is requested and the page is as heavy as it gets
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 1800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) }
    window.scrollTo(0, 0)
  })
  const idle = await idleStable(page, logs)
  const translated = await page.evaluate(() => ({
    all: document.querySelectorAll('*').length,
    injected: document.querySelectorAll('.axt-t, .axt-img, .axt-hl, .axt-peek').length,
    marked: [...document.querySelectorAll('*')].filter(el => el.getAttributeNames().some(n => n.startsWith('data-axt-'))).length,
  }))

  // The three loops of restore(), timed apart without changing anything (the page's own world shares the DOM)
  const loops = await page.evaluate(() => {
    const time = fn => { const t = performance.now(); const r = fn(); return { ms: Math.round((performance.now() - t) * 10) / 10, r } }
    const findInjected = time(() => document.querySelectorAll('.axt-t, .axt-img, .axt-hl, .axt-peek').length)
    const skeletonQueries = time(() => { let n = 0; for (const node of document.querySelectorAll('.axt-t, .axt-img, .axt-hl, .axt-peek')) n += node.querySelectorAll('.axt-skeleton').length; return n })
    const everyAttribute = time(() => { let n = 0; for (const el of Array.from(document.querySelectorAll('*'))) for (const attr of Array.from(el.attributes)) if (attr.name.startsWith('data-axt-')) n++; return n })
    const bySelector = time(() => { let n = 0; for (const el of document.querySelectorAll('[data-axt-id],[data-axt-state],[data-axt-for],[data-axt-pairs],[data-axt-mirrored],[data-axt-split],[data-axt-tail],[data-axt-fit],[data-axt-inline]')) for (const name of el.getAttributeNames()) if (name.startsWith('data-axt-')) n++; return n })
    return { findInjected, skeletonQueries, everyAttribute, bySelector }
  })

  const restore = await traced(cdp, async () => { await toTab('axt:restore-page'); await sleep(1500) })
  const after = await page.evaluate(() => ({ all: document.querySelectorAll('*').length, ours: document.querySelectorAll('[class*="axt-t"], [data-axt-id]').length }))

  console.log(`\n=== ${id}: ${elements} elements; translated ${translated.all} (${translated.injected} injected nodes, ${translated.marked} elements carrying data-axt-*); ${idle ?? 'never idle'}`)
  console.log('start of a translation:', JSON.stringify(start))
  console.log('restore              :', JSON.stringify(restore))
  console.log('restore()\'s loops, read-only:', JSON.stringify(loops))
  console.log(`after restore: ${after.all} elements, ${after.ours} of ours left`)
  await page.close()
}
await context.close()
