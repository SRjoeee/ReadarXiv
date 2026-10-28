// Probe: what a pinch over a laid page costs the browser (docs/PDF-READER.md §11.8, "The layer's text, at the page's weight":
// where the layer's SVG text is drawn with `text-rendering: auto`, the browser lays it out again at each scale a pinch's steps
// set by CSS, which under geometricPrecision it does not). The reader on the sample's layer, offline, as `pnpm e2e:reader`
// opens it (its stand-in of the layer API, its route table, the echo endpoint's German): page 1 laid, then bursts of pinch
// steps over the right pane through the reader's own `pinch` (each burst out and back), and per step: the browser's own
// accounts of the main thread's work over the bursts (the DevTools protocol's Performance metrics: layout, style and task
// time), the time from the step to the second frame after it, and the long animation frames meanwhile.
// Run it for two builds and compare: AXT_EXT_DIR=<build> picks one (default .output/chrome-mv3); AXT_HEADED=1 a headed window.
// Usage: pnpm build && node tests/e2e/probes/pinch-cost.mjs [bursts=5] [steps=12]     Prints one JSON line.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FACES } from '../../../src/pdf-reader/engine/rules/font-roles.mjs'
import { copyWithGrants } from '../ext-copy.mjs'
import { startEchoEndpoint } from '../lib/echo-endpoint.mjs'
import { launchWithReader } from '../lib/extension.mjs'
import { cutSample, sampleFiles } from '../lib/layer-cut.mjs'
import { layerApi, mode, serves } from '../lib/layer-api.mjs'
import { RESOLVER_WALL, routeTable } from '../lib/route-table.mjs'
import { seedService } from '../options-page.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUILD = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}../.ext-pinch`
const BURSTS = Number(process.argv[2] ?? 5), STEPS = Number(process.argv[3] ?? 12)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const sampleCut = await cutSample(sampleFiles())
const LATIN_FACE = readFileSync(fileURLToPath(new URL('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)))
const api = layerApi({ layer4: sampleCut, faces: { ids: Object.keys(FACES), ranges: [32, 126, 160, 255, 0x2010, 0x2027], bytes: new Uint8Array(LATIN_FACE) } })
const { sample } = api
const manifest = readFileSync(`${BUILD}/manifest.json`, 'utf8')
const LAYER_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== sample.id) return false
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><div class="submission-history"><strong>[v${sample.version}]</strong></div>` })
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(sample.pdf) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, sample.pdf.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${sample.pdf.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(sample.pdf.subarray(begin, end)) })
}
const tex = route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'no TeX page in this run' })

const echo = await startEchoEndpoint()
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...LAYER_HOSTS.map(host => `${host}/*`)] })
const { context, worker, readerUrl } = await launchWithReader({
  profile: 'pinch-cost', extension: EXT, headless: !process.env.AXT_HEADED, viewport: { width: 1440, height: 900 }, args: [RESOLVER_WALL],
})
const out = { build: BUILD, headed: !!process.env.AXT_HEADED }
try {
  await routeTable(context, [
    ['https://arxiv.org', arxiv],
    ['https://tex.readarxiv.org', tex],
    [echo.origin, route => route.continue()],
    ...LAYER_HOSTS.map(host => [host, (route, url) => (serves(url.pathname) ? api.route(route) : false)]),
  ])
  for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config)).catch(() => false)); tries++) await sleep(200)
  await seedService(worker, { id: 'svc-e2eecho0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
  await worker.evaluate(async () => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: 'deu' } }) })
  api.set({ layer: mode.ready() })
  const page = await context.newPage()
  await page.goto(readerUrl({ live: '1', paper: sample.id, mode: 'bilingual' }))
  await page.waitForFunction(() => window.__reader?.view?.probe().original === 'open', null, { timeout: 60_000 })
  const laid = await page.waitForFunction(() => /\[echo\]/.test(document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer svg')?.textContent ?? ''), null, { timeout: 60_000 }).then(() => true, () => false)
  if (!laid) throw new Error('page 1 was not laid')
  await sleep(Number(process.env.SETTLE_MS ?? 4000))
  out.layerText = await page.evaluate(() => ({ attribute: document.documentElement.getAttribute('data-axt-layer-text'), rendering: getComputedStyle(document.querySelector('#right .axt-layer > svg')).textRendering, smoothing: getComputedStyle(document.querySelector('#right .axt-layer > svg')).webkitFontSmoothing, tspans: document.querySelectorAll('#right .axt-layer svg tspan').length }))
  const at = await page.evaluate(() => { const r = document.querySelector('#right .axt-place[data-page-number="1"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 3] })
  await page.evaluate(() => { window.__loaf = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__loaf.push(e.duration) }).observe({ type: 'long-animation-frame' }) })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
  const m0 = await metrics()
  const steps = []
  for (let b = 0; b < BURSTS; b++) {
    for (const factor of [1.04, 1 / 1.04]) {
      for (let i = 0; i < STEPS; i++) {
        steps.push(await page.evaluate(([x, y, f]) => new Promise(resolve => {
          const t0 = performance.now()
          window.__reader.controller.pinch('right', f, [x, y])
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)))
        }), [...at, factor]))
      }
      // (the burst's end: the pages drawn again once the steps rest, as a pinch ends)
      await sleep(900)
    }
  }
  const m1 = await metrics()
  const per = name => Math.round(((m1[name] - m0[name]) * 1000 * 1000) / steps.length) / 1000
  out.perStep = { layoutMs: per('LayoutDuration'), styleMs: per('RecalcStyleDuration'), scriptMs: per('ScriptDuration'), taskMs: per('TaskDuration'), layouts: Math.round(((m1.LayoutCount - m0.LayoutCount) / steps.length) * 100) / 100 }
  const loaf = await page.evaluate(() => window.__loaf)
  const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(f * s.length))] * 10) / 10 }
  Object.assign(out, { steps: steps.length, stepMs: { p50: q(steps, 0.5), p95: q(steps, 0.95), mean: Math.round((steps.reduce((a, b) => a + b, 0) / steps.length) * 10) / 10 }, longFrames: loaf.length, longFrameMs: loaf.length ? { p50: q(loaf, 0.5), max: Math.round(Math.max(...loaf)) } : null })
} finally {
  await context.close()
  await echo.close()
}
console.log(JSON.stringify(out))
