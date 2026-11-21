// Probe: what a pinch does to the panes' scroll, frame by frame (docs/PDF-READER.md §6.8, §11.7). The reader offline, as
// `pnpm e2e:reader` opens it (its route table, the stand-in of the layer API holding the layer back: the places show the
// original's pages), on a long paper made of the sample's pages repeated; both panes level at a start zoom, then one pinch
// over the right pane as the browser sends a trackpad's: wheel events with Ctrl, through the DevTools protocol's synthetic
// pinch (Input.synthesizePinchGesture, a touchpad's, which Chromium turns into Ctrl-wheels), or Ctrl-wheels sent one by one.
// Per frame, read after the frame's layout (a ResizeObserver's callback, the last script before the paint): each pane's
// scrollTop, scrollHeight, clientHeight, its stack's transform, its indicator's thumb as laid out (place and length), the page
// at its view's centre and at the pointer's height; the left's scale; what ran in that frame (the wheels, the view's pinch,
// the scroll events, the follower's motion, the thumb's length set). Prints one JSON line of the summary; AXT_OUT=<dir> writes
// the frames as JSON there and the screencast's frames beside them (AXT_SHOTS=1).
// Usage: pnpm build && node tests/e2e/probes/pinch-jitter.mjs
//   AXT_EXT_DIR=<build>  START=0.26  FACTOR=2.15  AT=0.6 (the pointer's height in the right pane)  REPEAT=4 (the sample's
//   pages, repeated)  HOW=synth|wheel  DPR=1|2  W=1100 H=900  AXT_HEADED=1
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as PL from '@cantoo/pdf-lib'
import { copyWithGrants } from '../ext-copy.mjs'
import { launchWithReader } from '../lib/extension.mjs'
import { layerApi, mode, serves } from '../lib/layer-api.mjs'
import { RESOLVER_WALL, routeTable } from '../lib/route-table.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUILD = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}../.ext-pinch-jitter`
const env = (k, d) => (process.env[k] === undefined ? d : process.env[k])
const START = Number(env('START', 0.26)), FACTOR = env('FACTOR', '2.15'), AT = Number(env('AT', 0.6)), REPEAT = Number(env('REPEAT', 4)), ATX = Number(env('ATX', 0.5))
const HOW = env('HOW', 'synth'), DPR = Number(env('DPR', 1)), W = Number(env('W', 1100)), H = Number(env('H', 900))
const OUT = process.env.AXT_OUT ?? null
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const api = layerApi({})
const { sample } = api
// the sample's pages, repeated: a paper long enough to scroll at a quarter of its size
const long = await (async () => {
  const src = await PL.PDFDocument.load(sample.pdf)
  const out = await PL.PDFDocument.create()
  for (let r = 0; r < REPEAT; r++) for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p)
  return new Uint8Array(await out.save())
})()
const manifest = readFileSync(`${BUILD}/manifest.json`, 'utf8')
const LAYER_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== sample.id) return false
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><div class="submission-history"><strong>[v${sample.version}]</strong></div>` })
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(long) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, long.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${long.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(long.subarray(begin, end)) })
}

copyWithGrants(BUILD, EXT, { hostPermissions: LAYER_HOSTS.map(host => `${host}/*`) })
const { context, readerUrl } = await launchWithReader({
  profile: 'pinch-jitter', extension: EXT, headless: !process.env.AXT_HEADED, viewport: { width: W, height: H }, deviceScaleFactor: DPR, args: [RESOLVER_WALL],
})
const out = { build: BUILD, how: HOW, start: START, factor: FACTOR, at: AT, dpr: DPR }
try {
  await routeTable(context, [
    ['https://arxiv.org', arxiv],
    ['https://tex.readarxiv.org', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'none' })],
    ...LAYER_HOSTS.map(host => [host, (route, url) => (serves(url.pathname) ? api.route(route) : false)]),
  ])
  // the layer held back: the places show the original's pages, at the left's boxes
  api.set({ layer: mode.hang() })
  const page = await context.newPage()
  await page.goto(readerUrl({ live: '1', paper: sample.id, mode: 'bilingual' }))
  await page.waitForFunction(() => window.__reader?.view?.probe().original === 'open', null, { timeout: 60_000 })
  await sleep(800)
  await page.evaluate(s => window.__reader.controller.zoomTo(s), START)
  await sleep(900)
  // both panes to the paper's middle, level: a wheel over the right, then its rest
  const R0 = await page.locator('#right').boundingBox()
  await page.mouse.move(R0.x + R0.width * ATX, R0.y + R0.height * AT)
  const mid = await page.evaluate(() => { const c = document.getElementById('right'); return Math.round((c.scrollHeight - c.clientHeight) * 0.45) })
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, mid / 10); await sleep(30) }
  await sleep(1500)
  out.pages = await page.evaluate(() => window.__reader.view.probe().pages)
  out.before = await page.evaluate(() => { const p = window.__reader.view.probe(); return { scale: p.scale, driver: p.driver, levelError: p.levelError, compositing: p.compositing } })

  // ---------------------------------------------------------------- the recorder
  await page.evaluate(() => {
    const C = { left: document.getElementById('left'), right: document.getElementById('right') }
    const stack = s => C[s].querySelector(':scope > .pdfViewer')
    const thumb = s => document.querySelector(`.pane[data-side="${s}"] .indicator i`)
    const track = s => document.querySelector(`.pane[data-side="${s}"] .indicator`)
    const pagesOf = s => (s === 'left' ? [...stack('left').children].filter(e => e.classList.contains('page')) : [...stack('right').querySelectorAll(':scope > .axt-place')])
    const t0 = performance.now()
    const rec = { frames: [], marks: [] }
    window.__rec = rec
    const mark = (what, extra = {}) => rec.marks.push({ t: performance.now() - t0, what, ...extra })
    const scaleNow = () => Number.parseFloat(stack('left').style.getPropertyValue('--scale-factor')) / (96 / 72)
    // what ran: the wheels, the view's pinch, the scroll events (after the view's own listeners), the thumb's length
    document.addEventListener('wheel', e => mark('wheel', { dy: e.deltaY, ctrl: e.ctrlKey }), { capture: true, passive: true })
    const view = window.__reader.view, pinch = view.pinch
    view.pinch = (...a) => {
      const b = { L: C.left.scrollTop, R: C.right.scrollTop, scale: scaleNow() }
      const r = pinch.apply(view, a)
      mark('pinch', { factor: a[1], before: b, after: { L: C.left.scrollTop, R: C.right.scrollTop, scale: scaleNow() } })
      return r
    }
    for (const s of ['left', 'right']) {
      C[s].addEventListener('scroll', () => mark(`scroll-${s}`, { top: C[s].scrollTop }), { passive: true })
      C[s].addEventListener('scrollend', () => mark(`scrollend-${s}`, { top: C[s].scrollTop }), { passive: true })
      new MutationObserver(() => mark(`thumb-size-${s}`, { thumb: track(s).style.getPropertyValue('--thumb') })).observe(track(s), { attributes: true, attributeFilter: ['style'] })
      new MutationObserver(() => mark(`stack-style-${s}`, { transform: stack(s).style.transform })).observe(stack(s), { attributes: true, attributeFilter: ['style'] })
    }
    const pageAtY = (s, y) => {
      for (const p of pagesOf(s)) { const r = p.getBoundingClientRect(); if (r.bottom > y) return { n: Number(p.dataset.pageNumber), at: Math.round(((y - r.top) / r.height) * 1000) / 1000 } }
      return null
    }
    // one record a frame, after its layout: a ResizeObserver over an element the frame's first callback resizes
    const sentinel = Object.assign(document.createElement('div'), { style: 'position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;opacity:0' })
    document.body.append(sentinel)
    let n = 0, on = true
    const ro = new ResizeObserver(() => {
      if (!on) return
      const f = { i: n, t: performance.now() - t0, scale: scaleNow() }
      for (const s of ['left', 'right']) {
        const c = C[s], cr = c.getBoundingClientRect(), tr = track(s).getBoundingClientRect(), th = thumb(s).getBoundingClientRect()
        const st = stack(s)
        f[s] = {
          top: c.scrollTop, height: c.scrollHeight, client: c.clientHeight,
          transform: getComputedStyle(st).transform, anims: st.getAnimations().length,
          thumbTop: Math.round((th.top - tr.top) * 100) / 100, thumbLen: Math.round(th.height * 100) / 100, track: Math.round(tr.height),
          centre: pageAtY(s, cr.top + cr.height / 2), pointer: pageAtY(s, cr.top + cr.height * window.__at),
        }
      }
      rec.frames.push(f)
    })
    ro.observe(sentinel)
    const tick = () => { if (!on) return; n++; sentinel.style.width = `${1 + (n % 2)}px`; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    window.__stopRec = () => { on = false; ro.disconnect() }
  })
  await page.evaluate(at => { window.__at = at }, AT)

  const cdp = await context.newCDPSession(page)
  if (process.env.THROTTLE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) })
  const shots = []
  if (OUT && process.env.AXT_SHOTS) {
    mkdirSync(`${OUT}/shots`, { recursive: true })
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      shots.push({ t: metadata.timestamp, data })
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
  }
  await sleep(300)
  const x = R0.x + R0.width * ATX, y = R0.y + R0.height * AT
  // FACTOR: one gesture's scale, or several (comma-separated), GAP_MS apart
  for (const [g, factor] of String(env('FACTOR', 2.15)).split(',').map(Number).entries()) {
    if (g) await sleep(Number(env('GAP_MS', 700)))
    if (HOW === 'synth') {
      await cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor: factor, relativeSpeed: Number(env('SPEED', 400)), gestureSourceType: 'mouse' })
      continue
    }
    // a trackpad's pinch as Chromium sends it: Ctrl-wheels whose deltas are 100·ln of each step's scale, the fingers'
    // speed rising and falling (a sine's hump), a pause of PAUSE ms at its middle, GAP ms apart give or take half
    const steps = Number(env('STEPS', 60)), total = -100 * Math.log(factor), pause = Number(env('PAUSE', 0)), gap = Number(env('GAP', 8))
    let seed = 7
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    const weights = Array.from({ length: steps }, (_, i) => Math.sin((Math.PI * (i + 0.5)) / steps))
    const sum = weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < steps; i++) {
      if (pause && i === Math.floor(steps / 2)) await sleep(pause)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: (total * weights[i]) / sum, modifiers: 2 })
      await sleep(gap * (0.5 + rand()))
    }
  }
  await sleep(Number(env('SETTLE', 1500)))
  if (shots.length) await cdp.send('Page.stopScreencast')
  const rec = await page.evaluate(() => { window.__stopRec(); return window.__rec })
  out.after = await page.evaluate(() => { const p = window.__reader.view.probe(); return { scale: p.scale, driver: p.driver, levelError: p.levelError, motion: p.motion } })

  // ---------------------------------------------------------------- the summary
  const fr = rec.frames, marks = rec.marks
  // each mark to the frame it was painted in: the first record after it
  for (const m of marks) m.frame = fr.find(f => f.t >= m.t)?.i ?? null
  const pinches = marks.filter(m => m.what === 'pinch')
  const first = pinches[0]?.frame ?? 0, last = pinches.at(-1)?.frame ?? 0
  const during = fr.filter(f => f.i >= first - 1 && f.i <= last + 40)
  // the thumb's moves per frame, against the move the scroll's share asks (track - thumb) × Δ(top / max)
  const steps = []
  for (let k = 1; k < during.length; k++) {
    const a = during[k - 1], b = during[k]
    const row = { i: b.i, scale: b.scale, ran: marks.filter(m => m.frame === b.i).map(m => m.what).filter((w, j, all) => all.indexOf(w) === j) }
    for (const s of ['left', 'right']) {
      row[s] = { dThumb: Math.round((b[s].thumbTop - a[s].thumbTop) * 10) / 10, thumbTop: b[s].thumbTop, len: b[s].thumbLen, top: Math.round(b[s].top), height: b[s].height, centre: b[s].centre?.n ?? null, pointer: b[s].pointer, transform: b[s].transform, anims: b[s].anims }
    }
    steps.push(row)
  }
  /** a pinch in one direction moves each thumb one way: the frames whose move goes against the gesture's main direction */
  const reversals = s => {
    const d = steps.map(r => r[s].dThumb).filter(v => Math.abs(v) > 0.5)
    const sum = d.reduce((x, y) => x + y, 0), sign = Math.sign(sum)
    return { net: Math.round(sum * 10) / 10, against: d.filter(v => Math.sign(v) === -sign).length, againstPx: Math.round(d.filter(v => Math.sign(v) === -sign).reduce((x, y) => x + Math.abs(y), 0) * 10) / 10, moves: d.length }
  }
  const end = fr.at(-1)
  out.frames = { total: fr.length, pinchFrames: pinches.length, wheels: marks.filter(m => m.what === 'wheel').length }
  out.thumb = { left: reversals('left'), right: reversals('right') }
  out.maxJump = { left: Math.max(...steps.map(r => Math.abs(r.left.dThumb))), right: Math.max(...steps.map(r => Math.abs(r.right.dThumb))) }
  out.centreEnd = { left: end.left.centre, right: end.right.centre }
  out.centreDuring = steps.filter(r => r.left.centre !== r.right.centre).length
  if (OUT) {
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/frames.json`, JSON.stringify({ out, steps, marks, frames: fr }, null, 1))
    for (const [k, s] of shots.entries()) writeFileSync(`${OUT}/shots/${String(k).padStart(4, '0')}.jpg`, Buffer.from(s.data, 'base64'))
    writeFileSync(`${OUT}/shots.json`, JSON.stringify(shots.map(s => s.t)))
  }
} finally {
  await context.close()
}
console.log(JSON.stringify(out))
