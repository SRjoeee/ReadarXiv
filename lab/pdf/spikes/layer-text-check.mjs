// lab/pdf/spikes/layer-text-check.mjs — the layer's text rendering in a browser (docs/PDF-READER.md §11.8): on one page of the
// layer lab's quick view, drawn as the readers draw it, what view/text-rendering.mjs's probe decided (the attribute on <html>,
// the SVG's computed text-rendering and smoothing), and every character's place (the browser's own layout,
// getStartPositionOfChar) as drawn against the same page forced to geometricPrecision and forced to `auto`: where the probe
// keeps geometricPrecision the first difference is 0 and the second shows what it guards against; where it takes `auto` the
// first is the difference `auto` makes. Run in Chromium on each system (in Docker for Linux), and with BROWSER=webkit.
//   node lab/pdf/spikes/layer-text-check.mjs <lab port> <fixture> <page> [dpr]      prints one JSON line
// The lab: node lab/pdf/layer-lab/serve.mjs --port=<port>, on a pack (lab/pdf/layer-lab/README.md)
import { chromium, webkit } from 'playwright'

const [port = '8101', fixture = '2608.16117v1-de', p = '2', dpr = '2'] = process.argv.slice(2)
const n = Number(p)
const browser = process.env.BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: Number(dpr) })
  const page = await ctx.newPage()
  await page.goto(`http://127.0.0.1:${port}/#${new URLSearchParams({ f: fixture, a: 'v0', b: 'original', p, z: '0.75', s: 'single', panel: '0' })}`)
  await page.waitForSelector('html[data-ready="1"]', { timeout: 300_000 })
  await page.waitForSelector(`#pane-a .page[data-page="${n}"][data-rendered="1"] .axt-layer svg.tl`, { timeout: 300_000 })
  const out = await page.evaluate(async n => {
    const svg = document.querySelector(`#pane-a .page[data-page="${n}"] .axt-layer svg.tl`)
    const frame = () => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))
    await document.fonts.ready
    await frame()
    const unit = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width
    const places = () => [...svg.querySelectorAll('text')].map(t => { const xs = []; for (let i = 0; i < t.getNumberOfChars(); i++) { try { xs.push(t.getStartPositionOfChar(i).x) } catch { xs.push(Number.NaN) } } return xs })
    const diff = (a, b) => {
      let max = 0, sum = 0, k = 0, over = 0
      for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].length; j++) {
        const d = Math.abs(a[i][j] - b[i][j]) * unit
        if (!Number.isFinite(d)) continue
        k++; sum += d; if (d > max) max = d; if (d > 0.1) over++
      }
      return { chars: k, maxPx: +max.toFixed(4), meanPx: +(sum / Math.max(1, k)).toFixed(5), over01: over }
    }
    const cs = getComputedStyle(svg)
    const decided = { attribute: document.documentElement.getAttribute('data-axt-layer-text'), textRendering: cs.textRendering, smoothing: cs.webkitFontSmoothing ?? null }
    const drawn = places()
    svg.style.textRendering = 'geometricPrecision'
    await frame()
    const precise = places()
    svg.style.textRendering = 'auto'
    await frame()
    const auto = places()
    svg.style.textRendering = ''
    // (what the decision costs at a commit: the page's words read and laid out twice off the view, five times, the median)
    const T = await import('/src/pdf-reader/engine/view/text-rendering.mjs')
    const ms = []
    for (let i = 0; i < 5; i++) { const t0 = performance.now(); T.probeWords(document, T.wordsOf(svg)); ms.push(performance.now() - t0) }
    ms.sort((a, b) => a - b)
    return { decided, vsGeometricPrecision: diff(drawn, precise), autoVsGeometricPrecision: diff(auto, precise), probeMs: +ms[2].toFixed(2), words: T.wordsOf(svg).length }
  }, n)
  console.log(JSON.stringify({ browser: `${process.env.BROWSER ?? 'chromium'} ${browser.version()}`, platform: process.platform, dpr: Number(dpr), fixture, page: n, ...out }))
} finally { await browser.close() }
