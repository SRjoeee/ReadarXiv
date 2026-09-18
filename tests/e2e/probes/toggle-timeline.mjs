// Probe: the main thread's timeline over the start of a translation and over a restore, task by task — for each task
// longer than a few milliseconds, when it began (from the first of them: the request's arrival), how long it ran, and how much
// of it was script, style recalculation (with the number of elements it covered) and layout; a recalculation or a
// layout that ran inside a script was **forced** by a geometry read and is marked `!`. Then when the first frame
// after the request was committed (what the reader sees as the answer to the click) and when the last long task ended
// (when the page is theirs again).
// A forced layout costs a reader time only when a later write makes the browser lay the page out again before it
// paints — this probe is how to tell. Reuses the profile highlight-lag.mjs leaves behind (its cache holds the papers).
// Usage: pnpm build && node tests/e2e/probes/toggle-timeline.mjs [paper ...]
//   AXT_EXT_DIR  another build          AXT_ROUNDS  start → restore rounds per paper (default 3; the first fills the cache)
//   AXT_MODE     side | stack | only    AXT_SCROLL=1  read the whole paper before restoring, as a reader would have
//   AXT_READ=1   trace twelve screens of reading after each start
//   AXT_IMAGES   on | off: image translation for this run (the profile keeps the last choice)
//   AXT_VERBOSE=1  the task table of every round, not of the last only
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const E2E = fileURLToPath(new URL('../', import.meta.url))
const EXT = process.env.AXT_EXT_DIR ? resolve(process.env.AXT_EXT_DIR) : fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const PAPERS = process.argv.slice(2).length ? process.argv.slice(2) : ['2401.00418', '2312.17141']
const ROUNDS = Number(process.env.AXT_ROUNDS ?? 3)
const MODE = process.env.AXT_MODE
const TASK_FLOOR_US = 8000
const sleep = ms => new Promise(r => setTimeout(r, ms))

const context = await chromium.launchPersistentContext(`${E2E}.profile-hl`, {
  ...(process.env.AXT_CHROME ? { executablePath: process.env.AXT_CHROME } : { channel: 'chromium' }),
  headless: !process.env.AXT_HEADED,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  viewport: { width: 1440, height: 900 },
})
context.setDefaultNavigationTimeout(90_000)
let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker')
// Image translation (§15) starts with the page's and reads the layout for its own targets: on or off for the whole
// probe, since the profile keeps whatever the last probe left
if (process.env.AXT_IMAGES) {
  await worker.evaluate(async on => {
    const { config } = await chrome.storage.local.get('config')
    if (config?.image) await chrome.storage.local.set({ config: { ...config, image: { ...config.image, enabled: on } } })
  }, process.env.AXT_IMAGES === 'on')
}
// When the page's first request for a translation reaches the background, from the moment the background sent the
// start — both on the background's clock. On a first visit the text is this much plus the service's answer away
await worker.evaluate(() => {
  globalThis.__axtFirstRequest = null
  chrome.runtime.onMessage.addListener(message => {
    // The tab title's own request goes out with the start in either order of things: the paper's blocks are what is timed
    const blocks = message?.type === 'axt:translate' && message.request?.segments?.some(seg => seg.id !== 'document.title')
    if (blocks && globalThis.__axtStartSent !== null && globalThis.__axtFirstRequest === null) globalThis.__axtFirstRequest = performance.now() - globalThis.__axtStartSent
  })
})
const startTab = message => worker.evaluate(async m => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  globalThis.__axtFirstRequest = null
  globalThis.__axtStartSent = performance.now()
  return chrome.tabs.sendMessage(tab.id, m)
}, message)
const toTab = message => worker.evaluate(async m => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return chrome.tabs.sendMessage(tab.id, m)
}, message)

async function traced(cdp, fn) {
  const events = []
  const onData = e => events.push(...e.value)
  cdp.on('Tracing.dataCollected', onData)
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,toplevel,blink.user_timing', transferMode: 'ReportEvents' })
  await fn()
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  await cdp.send('Tracing.end')
  await done
  cdp.off('Tracing.dataCollected', onData)
  return events
}

const ms = us => Math.round(us / 100) / 10
const inside = (inner, outer) => inner.ts >= outer.ts && inner.ts + inner.dur <= outer.ts + outer.dur

/** The timeline of the page's main thread from the content script's first call on */
function timeline(events) {
  const complete = events.filter(e => e.ph === 'X' && e.dur > 0)
  // The page's main thread: the one that recalculated styles the longest. A restore runs whole inside the message's
  // dispatch, which the trace does not attribute to the content script, so the thread cannot be found by our URL
  const recalcBy = new Map()
  for (const e of complete) if (e.name === 'UpdateLayoutTree') recalcBy.set(`${e.pid}:${e.tid}`, (recalcBy.get(`${e.pid}:${e.tid}`) ?? 0) + e.dur)
  const [main] = [...recalcBy].sort((a, b) => b[1] - a[1])
  if (!main) return null
  const thread = complete.filter(e => `${e.pid}:${e.tid}` === main[0])
  // Time runs from the first task of any length: the message's arrival (the path to it is toggle-latency.mjs's subject)
  const first = thread.filter(e => e.name === 'RunTask' && e.dur >= TASK_FLOOR_US).sort((a, b) => a.ts - b.ts)[0]
  if (!first) return null
  const t0 = first.ts
  // A continuation after an `await` runs in a microtask checkpoint and has no FunctionCall of its own
  const SCRIPT = new Set(['FunctionCall', 'EvaluateScript', 'RunMicrotasks', 'BlinkScheduler_PerformMicrotaskCheckpoint', 'TimerFire', 'FireAnimationFrame'])
  const scripts = thread.filter(e => SCRIPT.has(e.name))
  const forced = e => scripts.some(s => s !== e && inside(e, s))
  const tasks = thread.filter(e => e.name === 'RunTask' && e.ts + e.dur >= t0 && e.dur >= TASK_FLOOR_US).sort((a, b) => a.ts - b.ts)
  const rows = tasks.map(task => {
    const within = name => thread.filter(e => e.name === name && inside(e, task))
    const part = name => {
      const list = within(name)
      const total = list.reduce((t, e) => t + e.dur, 0)
      const forcedTotal = list.filter(forced).reduce((t, e) => t + e.dur, 0)
      return { total: ms(total), forced: ms(forcedTotal) }
    }
    // The outermost script calls only: a nested call's time is already in its caller's
    const outer = thread.filter(e => SCRIPT.has(e.name) && inside(e, task)).filter((e, _, all) => !all.some(o => o !== e && inside(e, o)))
    const recalc = part('UpdateLayoutTree')
    const reach = Math.max(0, ...within('UpdateLayoutTree').map(e => e.args?.elementCount ?? 0))
    const layout = part('Layout')
    // A script's own time: what it forced is the browser's work, counted in its own columns
    const script = ms(outer.reduce((t, e) => t + e.dur, 0)) - recalc.forced - layout.forced
    return { at: ms(task.ts - t0), dur: ms(task.dur), script: Math.round(script * 10) / 10, recalc, layout, reach }
  })
  const commits = thread.filter(e => (e.name === 'Commit' || e.name === 'Paint') && e.ts >= t0).sort((a, b) => a.ts - b.ts)
  const firstFrame = commits[0] ? ms(commits[0].ts + commits[0].dur - t0) : null
  // The page marks what it sees arrive (`performance.mark`, on the trace's own clock); the frame that showed it is the
  // first committed after the mark. The mark is made in a MutationObserver's callback, so at the latest as the task
  // that wrote the node ends — still ahead of that frame
  const shownAfter = name => {
    const mark = events.filter(e => e.name === name && e.ts >= t0).sort((a, b) => a.ts - b.ts)[0]
    const frame = mark && commits.find(c => c.ts >= mark.ts)
    return frame ? ms(frame.ts + frame.dur - t0) : null
  }
  const last = rows.filter(r => r.dur >= 50).at(-1)
  const sum = key => Math.round(rows.reduce((t, r) => t + (typeof r[key] === 'number' ? r[key] : r[key].total), 0))
  const sumForced = key => Math.round(rows.reduce((t, r) => t + r[key].forced, 0))
  return {
    rows,
    firstFrame,
    skeletonShown: shownAfter('axt:skeleton'),
    textShown: shownAfter('axt:text'),
    settled: last ? Math.round(last.at + last.dur) : 0,
    busy: Math.round(rows.reduce((t, r) => t + r.dur, 0)),
    script: sum('script'), recalc: sum('recalc'), recalcForced: sumForced('recalc'), layout: sum('layout'), layoutForced: sumForced('layout'),
  }
}

for (const id of PAPERS) {
  const page = await context.newPage()
  await page.goto(`https://arxiv.org/html/${id}`, { waitUntil: 'load' })
  await page.bringToFront()
  await sleep(3500)
  const cdp = await context.newCDPSession(page)
  const elements = await page.evaluate(() => document.querySelectorAll('*').length)
  console.log(`\n=== ${id}: ${elements} elements`)
  page.on('console', m => { if (m.text().includes('[axt] images:')) console.log(`  ${m.text().slice(0, 160)}`) })
  const say = (label, round, t) => {
    if (!t) return console.log(`  ${label}: no task of that length in the trace`)
    console.log(`  ${label} ${round + 1}: first frame ${t.firstFrame} ms${t.skeletonShown === null ? '' : `, first skeleton shown by ${t.skeletonShown} ms, first translated text by ${t.textShown} ms`}, last long task over at ${t.settled} ms; tasks over ${TASK_FLOOR_US / 1000} ms add up to ${t.busy} ms — script ${t.script}, recalc ${t.recalc} (${t.recalcForced} forced), layout ${t.layout} (${t.layoutForced} forced)`)
    if (round === ROUNDS - 1 || process.env.AXT_VERBOSE) for (const r of t.rows) console.log(`    +${String(r.at).padStart(7)} ms  task ${String(r.dur).padStart(6)} ms | script ${String(r.script).padStart(6)} | recalc ${String(r.recalc.total).padStart(6)}${r.recalc.forced ? '!' : ' '}${String(r.reach).padStart(6)} el | layout ${String(r.layout.total).padStart(6)}${r.layout.forced ? '!' : ' '}`)
  }
  for (let round = 0; round < ROUNDS; round++) {
    // What the reader sees arrive: the first skeleton and the first translated text, marked on the trace's clock
    await page.evaluate(() => {
      const seen = new Set()
      const mo = new MutationObserver(records => {
        for (const r of records) {
          // A translation either arrives as a new node or fills the skeleton's node, which then drops its pending class
          const changed = r.type === 'attributes' ? [r.target] : [...r.addedNodes]
          for (const n of changed) {
            if (n.nodeType !== 1 || !n.classList.contains('axt-t') || n.classList.contains('axt-mirror')) continue
            const key = n.classList.contains('axt-pending') ? 'axt:skeleton' : 'axt:text'
            if (seen.has(key)) continue
            seen.add(key)
            performance.mark(key)
          }
        }
        if (seen.has('axt:text')) mo.disconnect()
      })
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true })
    })
    say('start  ', round, timeline(await traced(cdp, async () => { await startTab({ type: 'axt:translate-page', ...(MODE ? { mode: MODE } : {}) }); await sleep(2500) })))
    console.log(`            the first request for the paper's blocks reached the background ${Math.round(await worker.evaluate(() => globalThis.__axtFirstRequest ?? NaN))} ms after the start was sent`)
    if (process.env.AXT_READ) {
      // Reading on: twelve screens at a reader's pace while the translations land (from the cache after round 1) —
      // what each arriving batch costs the main thread, and how far its style recalculation reaches
      const events = await traced(cdp, async () => {
        await page.evaluate(async () => { for (let i = 1; i <= 12; i++) { window.scrollTo(0, i * 900); await new Promise(r => setTimeout(r, 350)) } })
        await sleep(1500)
      })
      const t = timeline(events)
      const recalcs = events.filter(e => e.name === 'UpdateLayoutTree' && e.ph === 'X')
      const reach = recalcs.reduce((n, e) => n + (e.args?.elementCount ?? 0), 0)
      console.log(`  reading ${round + 1}: recalc ${ms(recalcs.reduce((n, e) => n + e.dur, 0))} ms over ${reach} elements in ${recalcs.length} passes; tasks over ${TASK_FLOOR_US / 1000} ms add up to ${t?.busy ?? 0} ms, the longest ${Math.max(0, ...(t?.rows ?? []).map(r => r.dur))} ms`)
      await page.evaluate(() => window.scrollTo(0, 0))
    }
    if (process.env.AXT_SCROLL) {
      await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 1800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) } window.scrollTo(0, 0) })
      for (let i = 0; i < 120 && await page.evaluate(() => document.querySelectorAll('.axt-pending').length) > 0; i++) await sleep(1000)
    }
    await sleep(3000)
    say('restore', round, timeline(await traced(cdp, async () => { await toTab({ type: 'axt:restore-page' }); await sleep(1500) })))
    await sleep(1000)
  }
  await page.close()
}
await context.close()
