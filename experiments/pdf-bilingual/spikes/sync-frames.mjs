// How smoothly the other side follows, frame by frame, as the screen shows it: the live reader on one paper, the left
// side scrolled by a synthetic trackpad pan (CDP's scroll gesture), the frames the browser composites captured
// (CDP's screencast), and each pane's step from frame to frame found by matching its rows. At the same speed the
// follower's step should equal the driver's in every frame; a frame where it does not is a frame the follower dropped
// or made up. The follower by script and on the compositor (REPORT, seventeenth addendum), each with the page idle and
// with the main thread held up as PDF.js's drawing holds it (35 ms of work every 80 ms). The capture goes on through
// the rest's glide, which should ease in steps that only shrink, with no jump where it ends. The main thread's long
// tasks during the pan are counted too, for what either follower costs there. Local corpus, the build's default service.
//   node spikes/sync-frames.mjs [id]
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serveSite } from './live-site.mjs'
import { launchWithReader } from './extension.mjs'
const root = new URL('..', import.meta.url).pathname
const paper = process.argv[2] ?? '2608.02163'
const site = await serveSite()
const src = await new Promise(r => {
  const s = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const [, kind, id] = decodeURIComponent(req.url).match(/^\/(src|pdf)\/(.+)$/) ?? []
    try { res.end(readFileSync(join(root, 'data/corpus', id, kind === 'src' ? 'source.gz' : 'arxiv.pdf'))) } catch { res.statusCode = 404; res.end() }
  }).listen(0, '127.0.0.1', () => r(s))
})
const at = `http://127.0.0.1:${src.address().port}`
const { context, readerUrl } = await launchWithReader({ profile: 'sync-frames' })
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(readerUrl({ paper, live: '1', mode: 'bilingual', site: `http://127.0.0.1:${site.address().port}`, endpoint: 'http://localhost:8070', src: `${at}/src/${paper}`, pdf: `${at}/pdf/${paper}` }))
await page.waitForFunction(() => window.__reader?.live?.done, null, { timeout: 900000, polling: 500 })
const failed = await page.evaluate(() => window.__reader.live.failed)
if (failed) throw new Error(`the live run failed: ${failed}`)
const cdp = await context.newCDPSession(page)
const helper = await context.newPage() // decodes the frames, in a page of its own

const panes = () => page.evaluate(() => {
  const d = window.__reader.debug, r = c => { const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
  return { left: r(d.left.container), right: r(d.right.container), dpr: devicePixelRatio }
})
/** each frame's rows, per pane: the mean brightness across the middle of the pane, row by row (device pixels) */
async function profiles(frames, box) {
  const out = []
  for (let i = 0; i < frames.length; i += 8) out.push(...(await profilesOf(frames.slice(i, i + 8), box)))
  return out
}
function profilesOf(frames, box) {
  return helper.evaluate(async ({ frames, box }) => {
    const out = []
    for (const b64 of frames) {
      const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob())
      const cv = new OffscreenCanvas(bmp.width, bmp.height), g = cv.getContext('2d')
      g.drawImage(bmp, 0, 0)
      const k = bmp.width / box.vw, per = {}
      for (const side of ['left', 'right']) {
        const p = box[side], x0 = Math.round((p.x + p.w * 0.15) * k), w = Math.round(p.w * 0.7 * k), y0 = Math.round(p.y * k), h = Math.round(p.h * k)
        const data = g.getImageData(x0, y0, w, h).data, rows = new Float32Array(h)
        for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; s += data[i] + data[i + 1] + data[i + 2] } rows[y] = s / (3 * w) }
        per[side] = Array.from(rows)
      }
      out.push(per)
    }
    return out
  }, { frames, box })
}
/** how far a pane's content moved up between two frames: the shift that best matches the rows, within ±max */
function stepOf(a, b, max = 400) {
  let best = 0, err = Infinity
  const n = a.length, lo = Math.round(n * 0.1), hi = Math.round(n * 0.9)
  for (let s = -max; s <= max; s++) {
    let e = 0, c = 0
    for (let y = lo; y < hi; y++) { const z = y + s; if (z < 0 || z >= n) continue; e += Math.abs(b[y] - a[z]); c++ }
    if (c > n * 0.4 && e / c < err) { err = e / c; best = s }
  }
  return { s: best, err }
}

async function run({ compositor, load }) {
  await page.evaluate(on => window.__reader.session.setCompositor(on), compositor)
  const box = await panes()
  // the pointer over the left side, both sides at their tops, and a rest for the levelling
  await page.mouse.move(box.left.x + box.left.w * 0.5, box.left.y + box.left.h * 0.5)
  await page.evaluate(() => { const d = window.__reader.debug; d.left.container.scrollTop = 0; d.right.container.scrollTop = 0 })
  await page.mouse.wheel(0, 1)
  await page.waitForTimeout(1200)
  const before = await page.evaluate(() => { const d = window.__reader.debug; return [d.left.container.scrollTop, d.right.container.scrollTop] })
  const frames = []
  const onFrame = f => { frames.push(f.data); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) }
  cdp.on('Page.screencastFrame', onFrame)
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
  await page.evaluate(() => { window.__long = []; window.__lo?.disconnect(); window.__lo = new PerformanceObserver(l => window.__long.push(...l.getEntries().map(e => e.duration))); window.__lo.observe({ type: 'longtask' }) })
  if (load) await page.evaluate(() => { window.__load = setInterval(() => { const t = performance.now(); while (performance.now() - t < 35); }, 80) })
  await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(box.left.x + box.left.w * 0.5), y: Math.round(box.left.y + box.left.h * 0.5), yDistance: -3000, speed: 1500, gestureSourceType: 'mouse' })
  const panned = frames.length
  await page.evaluate(() => clearInterval(window.__load))
  const long = await page.evaluate(() => { window.__lo.disconnect(); return window.__long })
  const moved = await page.evaluate(() => window.__reader.debug.left.container.scrollTop)
  // the rest: the wait, the glide, and a while after it
  await page.waitForTimeout(1100)
  await cdp.send('Page.stopScreencast')
  cdp.off('Page.screencastFrame', onFrame)
  // AXT_DUMP=<dir>: a few of the frames written out, to look at
  if (process.env.AXT_DUMP) {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(process.env.AXT_DUMP, { recursive: true })
    for (const i of [0, 20, 40, 60, 80, frames.length - 1]) if (frames[i]) writeFileSync(join(process.env.AXT_DUMP, `${compositor ? 'compositor' : 'script'}-${load ? 'busy' : 'idle'}-${i}.jpg`), Buffer.from(frames[i], 'base64'))
  }
  const vw = page.viewportSize().width
  const rows = await profiles(frames, { ...box, vw })
  const all = []
  for (let i = 1; i < rows.length; i++) all.push({ d: stepOf(rows[i - 1].left, rows[i].left), f: stepOf(rows[i - 1].right, rows[i].right) })
  const steps = all.slice(0, panned - 1), rest = all.slice(panned - 1).map(s => s.f.s).filter(v => v)
  // frames in the pan: where the driver moved
  const pan = steps.filter(s => Math.abs(s.d.s) > 0)
  const bad = pan.filter(s => Math.abs(s.f.s - s.d.s) > 2)
  let D = 0, F = 0, gap = []
  for (const s of steps) { D += s.d.s; F += s.f.s; gap.push(Math.abs(D - F)) }
  gap.sort((a, b) => a - b)
  const stalls = pan.filter(s => Math.abs(s.f.s) <= 1).length
  if (process.env.AXT_DUMP) console.log(steps.slice(0, 60).map(s => `${s.d.s}/${s.f.s}`).join(' '))
  return { long: `${long.length} long tasks, ${Math.round(long.reduce((a, b) => a + b, 0))} ms`, rest, frames: panned, panFrames: pan.length, driverMoved: Math.round(moved - before[0]), driverSeen: D, off: bad.length, stalls, gapP95: gap[Math.floor(gap.length * 0.95)] ?? 0, gapMax: gap.at(-1) ?? 0 }
}

/** the rest's glide over a long way: the follower put 300 px off, a nudge of the driver, and the frames till it has
 *  settled — its steps, which should grow and then only shrink, and add up to the way */
async function glide({ compositor }) {
  await page.evaluate(on => window.__reader.session.setCompositor(on), compositor)
  await page.evaluate(() => { window.__reader.debug.right.container.scrollTop += 300 })
  await page.waitForTimeout(300)
  const box = await panes(), frames = []
  const onFrame = f => { frames.push(f.data); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) }
  cdp.on('Page.screencastFrame', onFrame)
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
  await page.mouse.wheel(0, 2)
  await page.waitForTimeout(1200)
  await cdp.send('Page.stopScreencast')
  cdp.off('Page.screencastFrame', onFrame)
  const rows = await profiles(frames, { ...box, vw: page.viewportSize().width })
  const steps = []
  for (let i = 1; i < rows.length; i++) steps.push(stepOf(rows[i - 1].right, rows[i].right).s)
  return steps.filter(v => v)
}

await page.evaluate(() => window.__reader.session.setSyncMode('same'))
// a pan down and back first, so that the pages the runs pass have been drawn once
{
  const b = await panes(), at = { x: Math.round(b.left.x + b.left.w / 2), y: Math.round(b.left.y + b.left.h / 2) }
  await cdp.send('Input.synthesizeScrollGesture', { ...at, yDistance: -3600, speed: 3000, gestureSourceType: 'mouse' })
  await cdp.send('Input.synthesizeScrollGesture', { ...at, yDistance: 3600, speed: 3000, gestureSourceType: 'mouse' })
  await page.waitForTimeout(1500)
}
for (const load of [false, true]) for (const compositor of [false, true]) {
  const r = await run({ compositor, load })
  console.log(`${compositor ? 'compositor' : 'script    '} ${load ? 'busy' : 'idle'}: ${r.frames} frames, ${r.panFrames} with the driver moving (it moved ${r.driverMoved} px, ${r.driverSeen} seen); follower off in ${r.off}, still in ${r.stalls}; the two apart p95 ${r.gapP95} px, most ${r.gapMax} px; ${r.long}`)
  console.log(`  the rest's glide, the follower's steps: ${r.rest.join(' ') || 'none'}`)
}
for (const compositor of [false, true]) console.log(`${compositor ? 'compositor' : 'script    '} glide, the follower's steps: ${(await glide({ compositor })).join(' ')}`)
console.log('page errors:', errors.length, errors.slice(0, 3))
await context.close(); site.close(); src.close()
