// Probe for the hover highlight's follow latency (DESIGN §7.7): how long the band takes to reach the sentence under a moving
// pointer, and what the main thread does per frame while it moves. Drives the pointer from outside the page at a fixed
// cadence (CDP `Input.dispatchMouseEvent`, not awaited one by one, so a blocked main thread queues input as it would for a
// real mouse) and records inside the page the pointer events, every rewrite of the band layer, long tasks and frame gaps.
// A CDP trace over each sweep gives the per-frame breakdown (hit test, style, layout, script, paint).
//
// Conditions: settled page in side / stack / only mode with the highlight on, the same sweep with it off (control), the sweep
// while translations are still landing, and the page-scroll settle. Usage: pnpm build && node tests/e2e/probes/highlight-lag.mjs
// Environment: AXT_PAPER (default 2410.00260), AXT_PAPER_BUSY (default 2312.17141, swept while it translates), AXT_CHROME.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { openOptions, openSection, setSwitch } from '../options-page.mjs'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PROFILE = `${E2E}.profile-hl`
const OUT = process.env.AXT_OUT ?? `${E2E}.hl-lag`
const PAPER = process.env.AXT_PAPER ?? '2410.00260'
const BUSY = process.env.AXT_PAPER_BUSY ?? '2312.17141'
const IDLE = /session idle: (\d+)\/(\d+) requested of (\d+), (\d+) failed, (\d+) cached/
/** Pointer cadence and step: 125 Hz, 3 px per event — a slow deliberate sweep down a column */
const PERIOD_MS = 8
const STEP_PX = 3
const sleep = ms => new Promise(r => setTimeout(r, ms))
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const stats = xs => ({ n: xs.length, p50: pct(xs, 0.5), p90: pct(xs, 0.9), max: xs.length ? Math.max(...xs) : null })
const r1 = x => x === null || x === undefined ? null : Math.round(x * 10) / 10

rmSync(PROFILE, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const context = await chromium.launchPersistentContext(PROFILE, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
context.setDefaultNavigationTimeout(90_000)
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
const extId = worker.url().split('/')[2]
const options = await openOptions(context, extId)
await openSection(options, 'services')
await setSwitch(options, '图片翻译', false)
await openSection(options, 'reading')
await setSwitch(options, '对照高亮', true)

async function openPaper(id) {
  const page = await context.newPage()
  const logs = []
  page.on('console', m => { const t = m.text(); if (t.includes('[axt]')) logs.push({ t: Date.now(), text: t }) })
  await page.goto(`https://arxiv.org/html/${id}#readarxiv`, { waitUntil: 'domcontentloaded' })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  return { page, logs, cdp }
}

/** Instrumentation inside the page: pointer events, band-layer rewrites, long tasks, scroll events, frame times */
const instrument = page => page.evaluate(() => {
  const L = { moves: [], layer: [], long: [], scrolls: [], frames: [], running: false }
  window.__lag = L
  document.addEventListener('pointermove', e => L.moves.push([e.timeStamp, performance.now(), e.clientX, e.clientY, scrollY]), { capture: true, passive: true })
  document.addEventListener('scroll', () => L.scrolls.push(performance.now()), { capture: true, passive: true })
  new PerformanceObserver(list => { for (const e of list.getEntries()) L.long.push([e.startTime, e.duration]) }).observe({ type: 'longtask', buffered: true })
  L.watch = () => {
    const layer = document.querySelector('.axt-hl')
    if (!layer || layer.__watched) return !!layer
    layer.__watched = true
    new MutationObserver(() => {
      // Read back from the inline style, not from geometry: a layout read here would force the layout this probe is measuring
      const bands = [...layer.children].map(b => ({ side: b.getAttribute('data-axt-hl-side'), left: parseFloat(b.style.left), width: parseFloat(b.style.width), top: parseFloat(b.style.top), height: parseFloat(b.style.height) }))
      L.layer.push([performance.now(), bands])
    }).observe(layer, { childList: true })
    return true
  }
  L.reset = () => { L.moves = []; L.layer = []; L.long = []; L.scrolls = []; L.frames = [] }
  L.start = () => { L.running = true; const tick = t => { L.frames.push(t); if (L.running) requestAnimationFrame(tick) }; requestAnimationFrame(tick) }
  L.stop = () => { L.running = false }
})
const collect = page => page.evaluate(() => { const { moves, layer, long, scrolls, frames } = window.__lag; return { moves, layer, long, scrolls, frames } })

/** The column to sweep: the centre x of the first real translation on screen, and the vertical span of the viewport */
const column = page => page.evaluate(() => {
  const real = [...document.querySelectorAll('.axt-t:not(.axt-pending, .axt-error, .axt-mirror, .axt-split)')]
  const on = real.map(el => el.getBoundingClientRect()).find(r => r.height > 0 && r.bottom > 0 && r.top < innerHeight)
  return { x: on ? on.left + on.width * 0.4 : innerWidth * 0.6, y0: 60, y1: innerHeight - 40 }
})

async function sweep(cdp, x, y0, y1) {
  const pending = []
  const t0 = performance.now()
  let i = 0
  const send = y => pending.push(cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }).catch(() => {}))
  for (let y = y0; y <= y1; y += STEP_PX, i++) {
    const wait = t0 + i * PERIOD_MS - performance.now()
    if (wait > 0) await sleep(wait)
    send(y)
  }
  for (let y = y1; y >= y0; y -= STEP_PX, i++) {
    const wait = t0 + i * PERIOD_MS - performance.now()
    if (wait > 0) await sleep(wait)
    send(y)
  }
  await Promise.all(pending)
}

/** Pointer event → band-layer rewrite latency: for each rewrite, the earliest not-yet-credited move whose document position lies in one of the new bands */
function latencies(L) {
  const total = []
  const queue = []
  let next = 0
  for (const [t, bands] of L.layer) {
    if (!bands.length) continue
    let hit = -1
    for (let j = next; j < L.moves.length && L.moves[j][0] <= t; j++) {
      const [, , cx, cy, sy] = L.moves[j]
      const y = cy + sy
      if (bands.some(b => cx >= b.left && cx <= b.left + b.width && y >= b.top - 1 && y <= b.top + b.height + 1)) { hit = j; break }
    }
    if (hit < 0) continue
    total.push(t - L.moves[hit][0])
    queue.push(L.moves[hit][1] - L.moves[hit][0])
    next = hit + 1
  }
  const gaps = []
  for (let i = 1; i < L.frames.length; i++) gaps.push(L.frames[i] - L.frames[i - 1])
  return { rewrites: L.layer.filter(([, b]) => b.length).length, clears: L.layer.filter(([, b]) => !b.length).length, moves: L.moves.length, total: stats(total), queue: stats(queue), frameGap: stats(gaps), longTasks: L.long.map(([, d]) => Math.round(d)) }
}

const METRICS = ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration']
async function metrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.filter(m => METRICS.includes(m.name)).map(m => [m.name, m.value]))
}
const delta = (a, b) => Object.fromEntries(METRICS.map(k => [k, /Count/.test(k) ? b[k] - a[k] : r1((b[k] - a[k]) * 1000)]))

/** A CDP trace around `run`, summarised per event name on the busiest renderer thread; `Layout` split by forced (has a stack) or not */
async function traced(cdp, run) {
  const events = []
  const onData = e => events.push(...e.value)
  cdp.on('Tracing.dataCollected', onData)
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' })
  await run()
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  await cdp.send('Tracing.end')
  await done
  cdp.off('Tracing.dataCollected', onData)
  const byThread = new Map()
  for (const e of events) if (e.name === 'RunTask') byThread.set(`${e.pid}:${e.tid}`, (byThread.get(`${e.pid}:${e.tid}`) ?? 0) + 1)
  const main = [...byThread.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const sum = new Map()
  const open = new Map()
  const add = (name, dur, forced) => {
    const key = forced === undefined ? name : `${name}${forced ? ' (forced)' : ''}`
    const s = sum.get(key) ?? { n: 0, ms: 0, max: 0 }
    s.n++; s.ms += dur; s.max = Math.max(s.max, dur)
    sum.set(key, s)
  }
  for (const e of events.filter(e => `${e.pid}:${e.tid}` === main).sort((a, b) => a.ts - b.ts)) {
    if (e.ph === 'X') add(e.name, (e.dur ?? 0) / 1000)
    else if (e.ph === 'B') open.set(e.name, e)
    else if (e.ph === 'E') {
      const b = open.get(e.name)
      if (!b) continue
      open.delete(e.name)
      add(e.name, (e.ts - b.ts) / 1000, e.name === 'Layout' ? !!b.args?.beginData?.stackTrace : undefined)
    }
  }
  return Object.fromEntries([...sum.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 14).map(([k, v]) => [k, { n: v.n, ms: r1(v.ms), max: r1(v.max) }]))
}

/** One measured sweep: latency stats from inside the page, layout / style counts from the Performance domain, the trace summary */
async function measure(label, { page, cdp }, { trace = true } = {}) {
  await page.evaluate(() => window.__lag.reset())
  const { x, y0, y1 } = await column(page)
  // A warm-up move creates the band layer, which the page-side observer then watches
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y0 + 40 })
  await sleep(120)
  const watched = await page.evaluate(() => window.__lag.watch())
  await page.evaluate(() => window.__lag.reset())
  const before = await metrics(cdp)
  await page.evaluate(() => window.__lag.start())
  const run = () => sweep(cdp, x, y0, y1)
  const summary = trace ? await traced(cdp, run) : await run().then(() => undefined)
  await page.evaluate(() => window.__lag.stop())
  await sleep(150)
  const after = await metrics(cdp)
  const L = await collect(page)
  const result = { label, watched, x: Math.round(x), ...latencies(L), perf: delta(before, after), trace: summary }
  console.log(JSON.stringify(result))
  return result
}

async function scrollSettle({ page }, times = 3) {
  const out = []
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.__lag.reset())
    await page.mouse.wheel(0, 240)
    await sleep(1200)
    const L = await collect(page)
    const lastScroll = L.scrolls.at(-1)
    const rewrite = L.layer.find(([t]) => lastScroll !== undefined && t > lastScroll)
    out.push({ scrollEvents: L.scrolls.length, scrollSpanMs: r1(L.scrolls.length ? L.scrolls.at(-1) - L.scrolls[0] : 0), settleToRewriteMs: rewrite && lastScroll !== undefined ? r1(rewrite[0] - lastScroll) : null })
  }
  console.log(JSON.stringify({ label: 'page scroll → band moves to the sentence now under the pointer', out }))
  return out
}

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
async function scrollThrough(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 800) { await page.evaluate(top => window.scrollTo(0, top), y); await sleep(120) }
}
async function setMode(page, name) {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extId}/popup.html`)
  await page.bringToFront()
  await popup.getByRole('button', { name, exact: true }).click()
  await sleep(300)
  await popup.close()
  await page.bringToFront()
  await sleep(2500)
}

const results = []
// ── A. The light paper, settled: side / stack / only, then the control with the highlight off ─────────────────────
{
  const paper = await openPaper(PAPER)
  await scrollThrough(paper.page)
  console.log(await idleStable(paper.page, paper.logs))
  await paper.page.evaluate(() => window.scrollTo(0, 0))
  await sleep(1500)
  await instrument(paper.page)
  const modeOf = () => paper.page.evaluate(() => document.documentElement.getAttribute('data-axt-mode'))
  results.push(await measure(`${PAPER} settled, mode ${await modeOf()}, highlight on`, paper))
  results.push(await measure(`${PAPER} settled, mode ${await modeOf()}, highlight on (repeat)`, paper))
  results.push({ label: `${PAPER} scroll settle`, settle: await scrollSettle(paper) })
  await paper.page.evaluate(() => window.scrollTo(0, 0))
  await sleep(500)
  await setMode(paper.page, '上下')
  results.push(await measure(`${PAPER} settled, mode ${await modeOf()}, highlight on`, paper))
  await setMode(paper.page, '仅译文')
  results.push(await measure(`${PAPER} settled, mode ${await modeOf()}, highlight on`, paper))
  await setMode(paper.page, '左右')
  await setSwitch(options, '对照高亮', false)
  await sleep(800)
  results.push(await measure(`${PAPER} settled, mode ${await modeOf()}, highlight OFF (control)`, paper))
  await setSwitch(options, '对照高亮', true)
  await sleep(800)
  await paper.page.close()
}
// ── B. The heavy paper while it translates (live engine, cold cache), then settled ───────────────────────────────
{
  const paper = await openPaper(BUSY)
  await sleep(1500)
  await instrument(paper.page)
  const height = await paper.page.evaluate(() => document.documentElement.scrollHeight)
  let stop = 0
  for (let y = 0; y < height && stop < 6; y += 800, stop++) {
    await paper.page.evaluate(top => window.scrollTo(0, top), y)
    await sleep(400)
    results.push(await measure(`${BUSY} translating, scroll stop ${stop} at ${y}px, highlight on`, paper, { trace: stop < 3 }))
  }
  await scrollThrough(paper.page)
  console.log(await idleStable(paper.page, paper.logs))
  await paper.page.evaluate(() => window.scrollTo(0, 0))
  await sleep(1500)
  results.push(await measure(`${BUSY} settled, mode side, highlight on`, paper))
  results.push(await measure(`${BUSY} settled, mode side, highlight on (repeat)`, paper))
  await setSwitch(options, '对照高亮', false)
  await sleep(800)
  results.push(await measure(`${BUSY} settled, mode side, highlight OFF (control)`, paper))
  await paper.page.close()
}
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2))
console.log(`written ${OUT}/results.json`)
await context.close()
