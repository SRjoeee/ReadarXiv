// The reader's performance gates (the reader's design, §12; Part 6, Task 43), in a real window on the demo paper:
//   1. the backdrop blur on the pills and the capsule while a pane scrolls, against the opaque floating surface;
//   2. dark pages while a pane scrolls, and at 400 % with the renderer's memory;
//   3. the scroll listeners on each pane's scroll container: ours a passive one, PDF.js's its own;
//   4. the animations running while reading: none but what follows the scroll or fades the indicators.
// A pane is scrolled by CDP's scroll gesture, which the compositor runs as a trackpad's would; the frames the browser
// composites are counted by CDP's screencast, the main thread's by requestAnimationFrame. Each run prints the machine's
// load; §12's rule is a quiet machine (under 5). The pinch is spikes/pinch-overlays.mjs.
// Build first; the demo papers made (spikes/reader-papers.mjs).
//   node experiments/pdf-bilingual/spikes/reader-perf.mjs [runs]
import { loadavg } from 'node:os'
import { execSync } from 'node:child_process'
import { launchWithReader } from './extension.mjs'

const paper = '2608.02163'
const RUNS = Number(process.argv[2] ?? 3)
const load = () => loadavg()[0].toFixed(1)
const { context, readerUrl } = await launchWithReader({ profile: 'reader-perf', demos: true, headless: false, viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.on('pageerror', e => console.log('page error:', e.message))
await page.goto(readerUrl({ paper, mode: 'bilingual' }))
await page.waitForFunction(() => window.__reader?.ready && window.__reader?.controller?.getState().settings, null, { timeout: 90_000 })
await page.waitForTimeout(1500)
const cdp = await context.newCDPSession(page)
const patch = change => page.evaluate(p => window.__reader.controller.patchSettings(c => {
  const next = { ...c }
  for (const [k, v] of Object.entries(p)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...c[k], ...v } : v
  return next
}), change)
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0 }
const r1 = x => Math.round(x * 10) / 10

/** one scroll of the left pane, from its top: 4000 px at 800 px/s; the composited frames' and the main thread's intervals */
async function scrollRun() {
  await page.evaluate(() => { for (const c of document.querySelectorAll('.viewerContainer')) c.scrollTop = 0 })
  await page.waitForTimeout(1200)
  const stamps = []
  const onFrame = f => { stamps.push(f.metadata.timestamp * 1000); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) }
  cdp.on('Page.screencastFrame', onFrame)
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 5, everyNthFrame: 1, maxWidth: 320, maxHeight: 200 })
  await page.evaluate(() => {
    window.__raf = []
    window.__anims = new Set()
    window.__on = true
    let last = performance.now()
    const tick = t => {
      window.__raf.push(t - last)
      last = t
      for (const a of document.getAnimations()) {
        const el = a.effect?.target
        if (el?.closest?.('.pdfViewer')) continue
        window.__anims.add(`${el?.className?.toString?.().split(' ')[0] ?? el?.tagName ?? '?'} ${a.animationName ?? a.transitionProperty ?? 'script'} ${a.timeline instanceof DocumentTimeline ? 'time' : 'scroll'}`)
      }
      if (window.__on) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const box = await page.locator('.pane[data-side="left"] .viewerContainer').boundingBox()
  await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), yDistance: -4000, speed: 800, gestureSourceType: 'mouse' })
  await cdp.send('Page.stopScreencast')
  cdp.off('Page.screencastFrame', onFrame)
  const { raf, anims } = await page.evaluate(() => { window.__on = false; return { raf: window.__raf.slice(1), anims: [...window.__anims] } })
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i])
  return { frames: stamps.length, framesP95: r1(pct(gaps, 0.95)), framesLong: gaps.filter(g => g > 25).length, rafP95: r1(pct(raf, 0.95)), rafLong: raf.filter(g => g > 25).length, anims }
}
/** runs of each case, interleaved so that a change in the machine's state falls on both */
async function compare(cases) {
  const out = Object.fromEntries(cases.map(c => [c.name, []]))
  for (let i = 0; i < RUNS; i++) for (const c of cases) { await c.set(); out[c.name].push({ ...(await scrollRun()), load: load() }) }
  for (const [name, runs] of Object.entries(out)) console.log(`${name}: ${runs.map(r => `frames ${r.frames}, p95 ${r.framesP95} ms, >25 ms ${r.framesLong}; main p95 ${r.rafP95}, >25 ${r.rafLong} (load ${r.load})`).join(' | ')}`)
  return out
}

console.log(`load at the start: ${load()}`)
// 1. blur against the opaque surface: a sheet adopted by the page (the reader's policy allows no inline style)
await page.evaluate(() => {
  const opaque = new CSSStyleSheet()
  opaque.replaceSync('html[data-probe-opaque] :is(.pill, .capsule) { backdrop-filter: none !important; background: var(--n-0) !important; }')
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, opaque]
})
const surface = on => page.evaluate(o => document.documentElement.toggleAttribute('data-probe-opaque', o), on)
const blur = await compare([{ name: 'blur', set: () => surface(false) }, { name: 'opaque', set: () => surface(true) }])
await surface(false)
console.log('animations while scrolling:', JSON.stringify([...new Set(Object.values(blur).flat().flatMap(r => r.anims))]))

// 2. dark pages, at the page's fit and at 400 %
const scheme = dark => patch({ pdfReader: { appearance: dark ? 'dark' : 'light', dimPages: true } }).then(() => page.waitForTimeout(800))
await compare([{ name: 'light', set: () => scheme(false) }, { name: 'dark', set: () => scheme(true) }])
await page.evaluate(() => window.__reader.controller.zoomTo(4))
await page.waitForTimeout(3000)
const memory = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics')
  const heap = metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0
  // the GPU process's resident memory: Chrome for Testing's, the one this probe launched
  const gpu = execSync("ps -Ao rss,command | grep 'Google Chrome for Testing Helper (GPU)' | grep reader-perf | grep -v grep | awk '{s+=$1} END {print s}'").toString().trim()
  return `JS heap ${Math.round(heap / 1048576)} MB, GPU process ${Math.round(Number(gpu || 0) / 1024)} MB`
}
await cdp.send('Performance.enable')
await scheme(false)
console.log(`400 %, light: ${await memory()}`)
await compare([{ name: '400 % light', set: () => scheme(false) }, { name: '400 % dark', set: () => scheme(true) }])
console.log(`400 %, dark: ${await memory()}`)
await page.evaluate(() => window.__reader.controller.zoomTo('page-width'))
await scheme(false)
await patch({ pdfReader: { appearance: 'system' } })

// 3. the scroll listeners on each pane's scroll container, by the script that added them
{
  const urls = new Map()
  cdp.on('Debugger.scriptParsed', s => urls.set(s.scriptId, s.url))
  await cdp.send('Debugger.enable')
  const listeners = []
  for (let i = 0; i < 2; i++) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.viewerContainer')[${i}]` })
    if (!result.objectId) continue
    const { listeners: ls } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId })
    for (const l of ls) if (/scroll|wheel/.test(l.type)) listeners.push(`${i ? 'right' : 'left'} ${l.type} passive=${l.passive} ${(urls.get(l.scriptId) ?? '?').split('/').pop()}:${l.lineNumber}`)
  }
  await cdp.send('Debugger.disable')
  console.log('scroll listeners:', JSON.stringify(listeners))
}
console.log(`load at the end: ${load()}`)
await context.close()
