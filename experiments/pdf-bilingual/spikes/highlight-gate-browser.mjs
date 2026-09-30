// The highlight's gate in a real browser (plans/2026-10-01-pdf-highlight.md, B1; the Node half is highlight-gate.mjs):
// the extension's build, the reader on demo papers, the real pointer.
//  checks (exit non-zero on a failure), on the build under test:
//  - no hole: for units lit on both sides, points on a grid inside each band painted: the pointer there finds a unit —
//    its own, or a smaller one painted over it (a heading run into its paragraph's first line)
//  - a miss is held: the pointer moved off every unit keeps what is lit 50 ms, not 250 ms
//  - both sides painted; the tasks that write the highlight force no layout (a Chrome trace: no Layout inside them)
//  costs, the build against BASE_BUILD, interleaved (both browsers open, runs alternating):
//  - a sweep of real pointer moves (220 down each pane, zig-zagging, one a frame) over a spread of formulas, of aligned
//    displays, and a two-column page: per light — a move that changed what is lit — the script of the task that
//    painted (the mousemove handler, or the animation frame) and the style and layout of the frame that follows,
//    p50 / p95 / max; layouts forced inside those tasks; long tasks
//  - opening the heaviest paper and a two-column one: the time to ready (text and anchors), the side's layouts
//    (timing.leftLayout / rightLayout), the long tasks until ready plus 3 s
//  - a fast scroll (120 wheel steps of 600 px, 16 ms apart) with a unit lit: long tasks
// The demo papers (made on this machine, never in the repository: arXiv's papers may not be redistributed) are staged
// into a copy of each build, as extension.mjs does with poc-reader/papers.
//   node experiments/pdf-bilingual/spikes/highlight-gate-browser.mjs [checks|costs|all]
//   BUILD=<dir> the build under test (default .output/chrome-mv3), LABEL its name in the output; BASE_BUILD=<dir> the one
//   to compare with (costs);
//   PAPERS=<dir> the demo papers (default poc-reader/papers); CHECK=<ids> the papers checked (default 2608.02163);
//   SWEEP=<id:unit,…> the sweeps' papers and the unit each starts at; OPEN=<ids> the papers opened; ROUNDS=<n>
//   → out/highlight-gate-browser.json
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = new URL('../../../', import.meta.url).pathname
const root = new URL('..', import.meta.url).pathname
const { chromium } = createRequire(REPO)('playwright')
const what = process.argv[2] ?? 'all'
const BUILD = process.env.BUILD ?? join(REPO, '.output/chrome-mv3'), BASE = process.env.BASE_BUILD
const PAPERS = process.env.PAPERS ?? join(root, 'poc-reader/papers')
const CHECK = (process.env.CHECK ?? '2608.02163').split(',')
const SWEEP = (process.env.SWEEP ?? '2608.08350:139,2608.29181:30,2608.06701:17').split(',').map(s => s.split(':')).map(([id, unit]) => [id, Number(unit)])
const OPEN = (process.env.OPEN ?? '2608.02459,2608.04322').split(',')
const ROUNDS = Number(process.env.ROUNDS ?? 3)
const result = {}
let failed = 0
const check = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++ }
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3) }
const stats = xs => ({ n: xs.length, p50: q(xs, 0.5), p95: q(xs, 0.95), max: q(xs, 1) })

/** a build with the demo papers, in Playwright's Chromium; its temporary copies go when it closes */
async function launch(build, label) {
  if (!existsSync(join(build, 'pdf-reader.html'))) throw new Error(`no reader in ${build}`)
  const copy = mkdtempSync(join(tmpdir(), `hl-gate-${label}-`)), profile = mkdtempSync(join(tmpdir(), `hl-gate-profile-${label}-`))
  cpSync(build, copy, { recursive: true })
  cpSync(PAPERS, join(copy, 'pdf-reader/papers'), { recursive: true })
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1600, height: 1000 }, args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`] })
  const close = context.close.bind(context)
  context.close = async () => { try { await close() } finally { for (const d of [copy, profile]) rmSync(d, { recursive: true, force: true, maxRetries: 3 }) } }
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const id = new URL(worker.url()).host
  return { label, context, url: q => `chrome-extension://${id}/pdf-reader.html?${new URLSearchParams(q)}` }
}
async function open(b, paper) {
  const page = await b.context.newPage()
  page.on('pageerror', e => check(`${b.label} ${paper}: no page error`, false, e.message))
  await page.goto(b.url({ paper, mode: 'bilingual' }))
  await page.waitForFunction(() => window.__reader?.ready && window.__reader.debug, null, { timeout: 240_000, polling: 200 })
  await page.waitForTimeout(1500)
  return page
}
/** both sides scrolled so that a unit's first line stands 150 px down, its pages drawn */
const at = (page, id) => page.evaluate(async id => { const d = window.__reader.debug; for (const s of [d.left, d.right]) { const top = d.unitDocTop(s, id); if (top != null) s.container.scrollTop = top - 150 } await new Promise(r => setTimeout(r, 2000)) }, id)
const frames = (page, n = 2) => page.evaluate(n => new Promise(r => { const f = k => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n) }), n)

async function trace(page, fn) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' })
  await fn()
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  await cdp.send('Tracing.end')
  const { stream } = await done
  let text = ''
  for (;;) { const { data, eof, base64Encoded } = await cdp.send('IO.read', { handle: stream, size: 1 << 22 }); text += base64Encoded ? Buffer.from(data, 'base64').toString() : data; if (eof) break }
  await cdp.send('IO.close', { handle: stream })
  const json = JSON.parse(text)
  return Array.isArray(json) ? json : json.traceEvents
}

// ---------------------------------------------------------------- checks
async function checks(b) {
  for (const paper of CHECK) {
    const page = await open(b, paper)
    // units lit on both sides whose first lines are on the first two pages of each side, a dozen
    const ids = await page.evaluate(() => {
      const d = window.__reader.debug
      return [...d.left.anchors.keys()].filter(id => { const a = d.left.anchors.get(id), c = d.right.anchors.get(id); return a && c && a.rects[0].page <= 2 && c.rects[0].page <= 2 }).slice(0, 12)
    })
    let points = 0, holes = 0, other = 0, bothSides = 0
    for (const id of ids) {
      await at(page, id)
      // the bands the unit paints, lit by the harness, then let go
      const bands = await page.evaluate(id => {
        const d = window.__reader.debug
        d.light(id)
        const out = [...document.querySelectorAll('.axt-hl')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, side: e.closest('#left') ? 'L' : 'R' } })
        d.light(null)
        return out
      }, id)
      if (new Set(bands.map(x => x.side)).size === 2) bothSides++
      for (const band of bands) for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
        const x = band.x + 1 + ((band.w - 2) * (i + 0.5)) / 6, y = band.y + 1 + ((band.h - 2) * (j + 0.5)) / 4
        if (y < 50 || y > 990) continue
        await page.mouse.move(x, y)
        await frames(page)
        // what the pointer found: the build's own answer where it has one (a miss is held, so what is lit does not
        // tell), else what is lit
        const hit = await page.evaluate(() => { const d = window.__reader.debug; return 'pointerHit' in d ? d.pointerHit : document.querySelector('.axt-hl') ? 'lit' : null })
        points++
        if (hit === null) holes++
        else if (hit !== id && hit !== 'lit') other++
      }
    }
    check(`${b.label} ${paper}: no hole inside what is painted`, holes === 0, `${holes} of ${points} points on ${ids.length} units' bands lit nothing; ${other} lit a smaller unit painted over them`)
    check(`${b.label} ${paper}: both sides painted`, bothSides === ids.length, `${bothSides} of ${ids.length}`)
    ;(result.checks ??= {})[`${b.label} ${paper}`] = { units: ids.length, points, holes, other }
    // a miss held: on a unit, then off every unit (the page's margin, a few px in from its edge)
    const off = await page.evaluate(id => { const d = window.__reader.debug, s = d.left, a = s.anchors.get(id), pv = d.pageView(s, a.rects[0].page), pr = pv.div.getBoundingClientRect(); return { x: pr.left + 4, y: pr.top + pr.height / 2 } }, ids[0])
    await at(page, ids[0])
    const band = await page.evaluate(id => { const d = window.__reader.debug; d.light(id); const r = document.querySelector('#left .axt-hl').getBoundingClientRect(); d.light(null); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, ids[0])
    await page.mouse.move(band.x, band.y)
    await frames(page)
    await page.mouse.move(off.x, off.y)
    await frames(page, 1)
    const t0 = Date.now()
    await page.waitForTimeout(50)
    const at50 = await page.evaluate(() => document.querySelectorAll('.axt-hl').length)
    await page.waitForTimeout(200)
    const at250 = await page.evaluate(() => document.querySelectorAll('.axt-hl').length)
    check(`${b.label} ${paper}: a miss keeps the wash 50 ms and lets it go by 250 ms`, at50 > 0 && at250 === 0, JSON.stringify({ at50, at250, waited: Date.now() - t0 }))
    // the pointer's frames read no layout: a sweep over the first unit's pages
    await at(page, ids[0])
    const s = await sweep(page)
    check(`${b.label} ${paper}: no layout forced where the highlight is written`, s.lights > 0 && s.forcedLayouts === 0, JSON.stringify({ lights: s.lights, forced: s.forcedLayouts, forcedMs: s.forcedMs }))
    result.checks[`${b.label} ${paper}`].sweep = s
    await page.close()
  }
}

// ---------------------------------------------------------------- costs
/** the sweep's path: 220 points down a pane's whole height, zig-zagging across it every 20 points */
const path = (page, side) => page.evaluate(side => {
  const d = window.__reader.debug, c = (side === 'L' ? d.left : d.right).container.getBoundingClientRect(), pts = []
  for (let i = 0; i < 220; i++) { const t = (i % 40) / 20, tri = t <= 1 ? t : 2 - t; pts.push({ x: c.left + 30 + (c.width - 60) * tri, y: c.top + 30 + ((c.height - 60) * i) / 220 }) }
  return pts
}, side)
async function sweep(page) {
  await page.evaluate(() => {
    window.__lt = []; window.__mut = []
    new PerformanceObserver(l => window.__lt.push(...l.getEntries().map(e => e.duration))).observe({ type: 'longtask' })
    // when the highlight is written: a band added or removed
    const mo = new MutationObserver(rs => { if (rs.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.classList?.contains('axt-hl')))) window.__mut.push(performance.now()) })
    for (const c of document.querySelectorAll('.viewerContainer')) mo.observe(c, { subtree: true, childList: true })
  })
  const pts = [...(await path(page, 'L')), ...(await path(page, 'R'))]
  const events = await trace(page, async () => {
    await page.evaluate(() => { console.timeStamp('hl-gate'); window.__sync = performance.now() })
    for (const p of pts) { await page.mouse.move(p.x, p.y); await page.waitForTimeout(12) }
    await page.waitForTimeout(400)
  })
  const got = await page.evaluate(() => ({ mut: window.__mut, lt: window.__lt, sync: window.__sync }))
  const stamp = events.find(e => e.name === 'TimeStamp' && e.args?.data?.message === 'hl-gate')
  const offset = stamp.ts / 1000 - got.sync, main = events.filter(e => e.tid === stamp.tid && e.pid === stamp.pid && e.ph === 'X')
  const sl = main.filter(e => e.name === 'UpdateLayoutTree' || e.name === 'Layout').sort((a, b) => a.ts - b.ts)
  const tasks = main.filter(e => e.name === 'FireAnimationFrame' || (e.name === 'EventDispatch' && e.args?.data?.type === 'mousemove')).sort((a, b) => a.ts - b.ts)
  const paints = main.filter(e => e.name === 'Paint' || e.name === 'PrePaint' || e.name === 'UpdateLayerTree').map(e => e.ts).sort((a, b) => a - b)
  // a light: the task in which a band was written (its mutation record comes at its end, a microtask)
  const script = [], after = [], forced = []
  for (const t of got.mut.map(m => (m + offset) * 1000)) {
    const task = tasks.filter(e => e.ts <= t && e.ts + e.dur >= t - 2000).at(-1)
    if (!task) continue
    const end = task.ts + task.dur
    script.push(task.dur / 1000)
    const inside = sl.filter(y => y.ts >= task.ts && y.ts < end)
    if (inside.length) forced.push(inside.reduce((a, y) => a + y.dur, 0) / 1000)
    const next = paints.find(x => x >= end) ?? end + 16700
    after.push(sl.filter(y => y.ts >= end && y.ts < next).reduce((a, y) => a + y.dur, 0) / 1000)
  }
  return { moves: pts.length, lights: script.length, script: stats(script), styleLayout: stats(after), forcedLayouts: forced.length, forcedMs: stats(forced), longTasks: { n: got.lt.length, total: +got.lt.reduce((a, b) => a + b, 0).toFixed(1) }, raw: { script, after } }
}
async function scroll(page, id) {
  await at(page, id)
  await page.evaluate(id => { window.__reader.debug.light(id); window.__lt = []; new PerformanceObserver(l => window.__lt.push(...l.getEntries().map(e => e.duration))).observe({ type: 'longtask' }) }, id)
  const c = await page.evaluate(() => { const r = window.__reader.debug.left.container.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await page.mouse.move(c.x, c.y)
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(16) }
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(16) }
  await page.waitForTimeout(1500)
  const lt = await page.evaluate(() => window.__lt)
  return { n: lt.length, total: +lt.reduce((a, b) => a + b, 0).toFixed(1), max: q(lt, 1) }
}
async function opening(b, paper) {
  const page = await b.context.newPage()
  await page.addInitScript(() => { window.__lt = []; new PerformanceObserver(l => window.__lt.push(...l.getEntries().map(e => ({ at: e.startTime, ms: e.duration })))).observe({ type: 'longtask', buffered: true }) })
  await page.goto(b.url({ paper, mode: 'bilingual' }))
  await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 240_000, polling: 50 })
  const ready = await page.evaluate(() => performance.now())
  await page.waitForTimeout(3000)
  const r = await page.evaluate(ready => { const t = window.__reader.timing; return { ready, opened: t.opened, anchors: t.anchors, leftLayout: t.leftLayout ?? null, rightLayout: t.rightLayout ?? null, longTasks: window.__lt.filter(x => x.at < ready + 3000) } }, ready)
  await page.close()
  return { ...r, longTasks: { n: r.longTasks.length, total: +r.longTasks.reduce((a, x) => a + x.ms, 0).toFixed(1) } }
}
async function costs(builds) {
  for (let round = 0; round < ROUNDS; round++) for (const b of round % 2 ? [...builds].reverse() : builds) {
    for (const [paper, unit] of SWEEP) {
      const page = await open(b, paper)
      await at(page, unit)
      const s = await sweep(page)
      const f = await scroll(page, unit)
      await page.close()
      ;((result.sweep ??= {})[`${paper} ${b.label}`] ??= []).push({ ...s, fastScroll: f })
      console.log(round, b.label, paper, 'sweep', JSON.stringify({ ...s, raw: undefined }), 'fast scroll', JSON.stringify(f))
    }
    for (const paper of OPEN) {
      const o = await opening(b, paper)
      ;((result.open ??= {})[`${paper} ${b.label}`] ??= []).push(o)
      console.log(round, b.label, paper, 'open', JSON.stringify(o))
    }
  }
  // per build and paper, the rounds pooled
  result.summary = {}
  for (const [key, runs] of Object.entries(result.sweep ?? {})) {
    result.summary[`sweep ${key}`] = { lights: runs.map(r => r.lights), script: stats(runs.flatMap(r => r.raw.script)), styleLayout: stats(runs.flatMap(r => r.raw.after)), forced: runs.map(r => r.forcedLayouts), longTasks: runs.map(r => r.longTasks), fastScroll: runs.map(r => r.fastScroll) }
    for (const r of runs) delete r.raw
  }
  for (const [key, runs] of Object.entries(result.open ?? {})) result.summary[`open ${key}`] = { readyMs: stats(runs.map(r => r.ready)), anchorsMs: stats(runs.map(r => r.anchors)), layoutMs: stats(runs.flatMap(r => [r.leftLayout, r.rightLayout].filter(x => x != null))), longTasks: runs.map(r => r.longTasks) }
  for (const [key, v] of Object.entries(result.summary)) console.log(key, JSON.stringify(v))
}

const head = await launch(BUILD, process.env.LABEL ?? 'head')
const base = BASE && (what === 'costs' || what === 'all') ? await launch(BASE, 'base') : null
try {
  if (what === 'checks' || what === 'all') await checks(head)
  if (what === 'costs' || what === 'all') await costs(base ? [base, head] : [head])
} finally {
  await head.context.close()
  await base?.context.close()
}
mkdirSync(join(root, 'out'), { recursive: true })
writeFileSync(join(root, 'out/highlight-gate-browser.json'), JSON.stringify(result, null, 1))
console.log(failed ? `${failed} failed` : 'all passed')
process.exitCode = failed ? 1 : 0
