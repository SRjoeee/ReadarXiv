// The overlays through a pinch (the reader's design, §10.1–§10.2), on the demo paper in a headed window. Each run
// lights a band on both sides, waits for the right side's first figure overlay, then pinches with the reader's own
// pinch (Ctrl and the wheel over the pages, 36 steps, 83 % → about 245 %). It measures:
//   - the drift: every overlay against where the fractions of its page box, read at rest, put it; at steps 8, 16 and
//     24, and after PDF.js has drawn the pages again;
//   - the cost: layout, style and main-thread time over the pinch (CDP Performance.getMetrics), and the frames over
//     1.5× the median;
//   - how long no figure overlay was on the right after the redraw, and the figures laid again after it
//     (window.__reader.debug.paintsOf, from Task 30, over the pages laid before the pinch).
// Load 1 is the paper's own overlays; load 20 clones the first figure overlay 20 times. Exits 1 on a drift over 1 px.
//   node experiments/pdf-bilingual/spikes/pinch-overlays.mjs [runs]     AXT_BUILD=<dir> for another build
import { launchWithReader } from './extension.mjs'

const RUNS = Number(process.argv[2] ?? 3), paper = '2608.02163'
const results = []
for (let run = 1; run <= RUNS; run++) for (const load of [1, 20]) {
  const { context, readerUrl } = await launchWithReader({ profile: 'pinch-overlays', demos: true, headless: false, viewport: { width: 1440, height: 900 }, ...(process.env.AXT_BUILD ? { extension: process.env.AXT_BUILD } : {}) })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(readerUrl({ paper, mode: 'bilingual' }))
  await page.waitForFunction(() => window.__reader?.ready, null, { timeout: 90000 })
  // the second page in view on both sides, a band lit there, and the right side's figure overlays waited for
  await page.evaluate(() => { const { left, right } = window.__reader.debug; for (const s of [left, right]) s.viewer.currentPageNumber = 2 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => { const d = window.__reader.debug, id = [...d.left.anchors.keys()].find(k => d.left.anchors.get(k)?.rects?.[0]?.page === 2); d.light(id) })
  const figures = await page.waitForFunction(() => document.querySelectorAll('#right .axt-fig .axt-img > span').length > 0, null, { timeout: 60000 }).then(() => true, () => false)
  await page.waitForTimeout(1000)
  const counts = await page.evaluate(load => {
    const figs = [...document.querySelectorAll('#right .axt-fig')]
    const keeper = window.__reader.debug.right.keeper
    figs.slice(1).forEach(f => (keeper ? keeper.drop(f) : f.remove()))
    if (figs[0]) for (let i = 1; i < load; i++) figs[0].after(figs[0].cloneNode(true))
    return { figures: document.querySelectorAll('.axt-fig').length, labels: document.querySelectorAll('.axt-fig .axt-img > span').length, bands: document.querySelectorAll('.axt-hl').length }
  }, load)
  // every overlay, as fractions of its page box at rest; the same elements measured later, those still on the page
  // (a repaint replaces a figure's overlay with a new one, which says nothing of the old one's place)
  await page.evaluate(() => {
    window.__ov = [...document.querySelectorAll('.axt-fig, .axt-hl')].map(el => {
      const p = el.closest('.page').getBoundingClientRect(), r = el.getBoundingClientRect()
      return { el, f: [(r.left - p.left) / p.width, (r.top - p.top) / p.height, r.width / p.width, r.height / p.height] }
    })
  })
  const drift = () => page.evaluate(() => {
    const live = window.__ov.filter(o => o.el.isConnected && o.el.closest('.page'))
    const px = live.map(({ el, f: [fx, fy, fw, fh] }) => { const p = el.closest('.page').getBoundingClientRect(), r = el.getBoundingClientRect(); return Math.max(Math.abs(r.left - (p.left + fx * p.width)), Math.abs(r.top - (p.top + fy * p.height)), Math.abs(r.width - fw * p.width), Math.abs(r.height - fh * p.height)) })
    return { px: +Math.max(0, ...px).toFixed(1), measured: live.length, of: window.__ov.length }
  })
  await page.evaluate(() => {
    window.__frames = []
    const f = t => { window.__frames.push(t); requestAnimationFrame(f) }
    requestAnimationFrame(f)
    const right = document.querySelector('#right')
    window.__bare = 0
    let since = 0
    new MutationObserver(() => { const none = !right.querySelector('.axt-fig'); if (none && !since) since = performance.now(); if (!none && since) { window.__bare += performance.now() - since; since = 0 } }).observe(right, { childList: true, subtree: true })
    // the right side's pages laid before the pinch, and how often each has been laid
    const d = window.__reader.debug
    window.__laid0 = d.paintsOf ? [...new Set([...right.querySelectorAll('.page')].filter(p => d.right.laid?.has(Number(p.dataset.pageNumber))).map(p => Number(p.dataset.pageNumber)))].map(n => [n, d.paintsOf(n)]) : null
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
  await page.mouse.move(1080, 500)
  const m0 = await metrics(), t0 = await page.evaluate(() => performance.now())
  const mid = []
  await page.keyboard.down('Control')
  for (let i = 1; i <= 36; i++) {
    await page.mouse.wheel(0, -1.5)
    await page.waitForTimeout(16)
    if (i % 8 === 0 && i <= 24) mid.push((await drift()).px)
  }
  await page.keyboard.up('Control')
  const t1 = await page.evaluate(() => performance.now()), m1 = await metrics()
  await page.waitForTimeout(2500)
  const after_ = await drift(), settled = after_.px
  const after = await page.evaluate(([t0, t1]) => {
    const fr = window.__frames.filter(t => t >= t0 && t <= t1), iv = fr.slice(1).map((t, i) => t - fr[i]).sort((a, b) => a - b)
    const med = iv[Math.floor(iv.length / 2)] ?? 0
    const d = window.__reader.debug
    const repaints = window.__laid0?.reduce((sum, [n, k]) => sum + d.paintsOf(n) - k, 0) ?? null
    return { frames: iv.length, long: iv.filter(x => x > med * 1.5).length, bareMs: Math.round(window.__bare), repaints, scale: window.__reader.controller.getState().scale }
  }, [t0, t1])
  const d = k => +((m1[k] - m0[k]) * 1000).toFixed(1)
  const r = { run, load, figureLabels: figures, ...counts, mid, settled, settledOn: `${after_.measured}/${after_.of}`, ...after, layout: d('LayoutDuration'), style: d('RecalcStyleDuration'), task: d('TaskDuration'), errors }
  results.push(r)
  console.log(JSON.stringify(r))
  await context.close()
}
const worst = Math.max(...results.flatMap(r => [...r.mid, r.settled]))
console.log('\nload | layout ms | style ms | main thread ms | frames over 1.5× | drift mid-pinch / settled px | bare ms | repaints')
for (const load of [1, 20]) {
  const rs = results.filter(r => r.load === load), span = k => `${Math.min(...rs.map(r => r[k]))}–${Math.max(...rs.map(r => r[k]))}`
  console.log(`${load} | ${span('layout')} | ${span('style')} | ${span('task')} | ${span('long')} | ${Math.max(...rs.flatMap(r => r.mid))} / ${Math.max(...rs.map(r => r.settled))} | ${span('bareMs')} | ${rs.map(r => r.repaints).join(',')}`)
}
const errors = results.flatMap(r => r.errors)
console.log(errors.length ? `page errors: ${errors.join('; ')}` : 'page errors: none')
console.log(worst <= 1 && !errors.length ? 'all passed' : `FAIL: an overlay drifted ${worst} px`)
process.exit(worst <= 1 && !errors.length ? 0 : 1)
