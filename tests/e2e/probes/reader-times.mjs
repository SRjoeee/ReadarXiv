// The reader's two first moments in the extension, offline, as e2e:reader runs it (the repository's sample paper answered for
// arXiv, the stand-in of the layer API, the local echo endpoint translating): from the reader's navigation to the original's
// first page drawn on the left, and to the first page laid on the right. A fresh tab each time, `--runs` times; prints the
// median and the 90th percentile of each, and writes them as JSON. A reading, not an assertion.
//   pnpm build && node tests/e2e/probes/reader-times.mjs [--runs 12] [--out <file.json>]
// AXT_EXT_DIR names another build (a base build kept aside: the same probe reads both).
// What a moment is, read in the page on every frame: the left's page 1 drawn (its canvas holds pixels); the right's page 1
// laid (today's reader: its layer's copy canvas; the reader package: its probe's `at.firstLaid`, ms from its open, whichever
// the page has).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FACES } from '../../../src/pdf-reader/engine/rules/font-roles.mjs'
import { copyWithGrants } from '../ext-copy.mjs'
import { startEchoEndpoint } from '../lib/echo-endpoint.mjs'
import { launchWithReader } from '../lib/extension.mjs'
import { cutSample, sampleFiles } from '../lib/layer-cut.mjs'
import { layerApi, mode, serves } from '../lib/layer-api.mjs'
import { RESOLVER_WALL, routeTable } from '../lib/route-table.mjs'
import { seedService } from '../options-page.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const RUNS = Number(arg('--runs') ?? 12)
const OUT = arg('--out')
const BUILD = process.env.AXT_EXT_DIR ?? join(ROOT, '.output/chrome-mv3')
const EXT = join(ROOT, 'tests/e2e/.ext-reader-times')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const sampleCut = await cutSample(sampleFiles())
const LATIN_FACE = readFileSync(join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'))
const api = layerApi({ layer4: sampleCut, faces: { ids: Object.keys(FACES), ranges: [32, 126, 160, 255, 0x2010, 0x2027], bytes: new Uint8Array(LATIN_FACE) } })
const { sample } = api
const PAPER = sample.id
const ABSTRACT_PAGE = `<!doctype html><title>stand-in abstract</title><meta name="citation_title" content="Counting Lattice Paths Around Blocked Cells"><div class="submission-history"><strong>[v${sample.version}]</strong></div>`
const manifest = readFileSync(join(BUILD, 'manifest.json'), 'utf8')
const LAYER_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: ABSTRACT_PAGE })
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(sample.pdf) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, sample.pdf.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${sample.pdf.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(sample.pdf.subarray(begin, end)) })
}
const echo = await startEchoEndpoint()
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...LAYER_HOSTS.map(host => `${host}/*`)] })
const { context, worker, readerUrl } = await launchWithReader({ profile: 'reader-times', extension: EXT, viewport: { width: 1440, height: 900 }, args: [RESOLVER_WALL] })
await routeTable(context, [
  ['https://arxiv.org', arxiv],
  ['https://tex.readarxiv.org', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'none' })],
  [echo.origin, route => route.continue()],
  ...LAYER_HOSTS.map(host => [host, (route, url) => (serves(url.pathname) ? api.route(route) : false)]),
])
for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config)).catch(() => false)); tries++) await sleep(200)
await seedService(worker, { id: 'svc-times0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
await worker.evaluate(async () => {
  const { config } = await chrome.storage.local.get('config')
  await chrome.storage.local.set({ config: { ...config, targetLanguage: 'deu', theme: 'light' } })
})
api.set({ layer: mode.ready() })

/** in the page, from its first script: each moment's time since the navigation began, read every frame */
const WATCH = () => {
  const at = {}
  const tick = () => {
    const now = performance.now()
    if (at.left === undefined) {
      const c = document.querySelector('#left .page[data-page-number="1"] canvas, .axt-pane.left .page[data-page-number="1"] canvas')
      if (c && c.width > 0) at.left = now
    }
    if (at.laid === undefined) {
      const copy = document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer canvas.axt-layer-copy')
      if (copy && copy.width > 0) at.laid = now
      const probe = window.__reader?.probe?.()
      if (probe && typeof probe['at.firstLaid'] === 'number' && typeof probe['at.open'] === 'number') at.laid = probe['at.open'] + probe['at.firstLaid']
    }
    window.__times = at
    if (at.left === undefined || at.laid === undefined) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
const runs = []
for (let i = 0; i < RUNS + 1; i++) {
  const page = await context.newPage()
  await page.addInitScript(WATCH)
  await page.goto(readerUrl({ live: '1', paper: PAPER, mode: 'bilingual' }))
  const t = await page.waitForFunction(() => window.__times?.left !== undefined && window.__times?.laid !== undefined && window.__times, null, { timeout: 60_000 }).then(h => h.jsonValue()).catch(() => null)
  await page.close()
  // (the first run warms the browser's caches of the build's own files: not counted)
  if (i > 0) runs.push(t ?? { left: null, laid: null })
  console.log(`run ${i}${i === 0 ? ' (warm-up)' : ''}: left ${t?.left?.toFixed(0) ?? '—'} ms, laid ${t?.laid?.toFixed(0) ?? '—'} ms`)
}
await context.close()
await echo.close?.()
const stat = xs => {
  const v = xs.filter(x => typeof x === 'number').sort((a, b) => a - b)
  if (!v.length) return null
  const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))]
  return { n: v.length, p50: Math.round(q(0.5)), p90: Math.round(q(0.9)), min: Math.round(v[0]), max: Math.round(v[v.length - 1]) }
}
const result = { build: BUILD, runs: RUNS, left: stat(runs.map(r => r.left)), laid: stat(runs.map(r => r.laid)), at: new Date().toISOString() }
console.log(JSON.stringify(result))
if (OUT) writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`)
