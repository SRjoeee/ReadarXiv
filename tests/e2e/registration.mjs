// The reader's registration in a real browser, on the repository's sample paper (tests/fixtures/pdf/sample-1/) and with no
// network, as reader.mjs runs it: one route table answers every request, the stand-in of the layer API serves the sample's
// layer (lib/layer-cut.mjs: a head of ours, its base our final pass wrapped by optional content), and the extension's own
// translation comes from the local echo endpoint.
//
// A laid page's copy is the composed document's page rendered by PDF.js at the place's k, the groups of the units drawn there
// hidden (docs/route/ocg-erasure.md §4), under the SVG of its translation and its links. PDF.js draws a page view at its
// unrounded scale and floors its canvas to whole CSS px; the copy, the SVG and the links are right only where they are laid at
// the scale the page is drawn at, from the page's top-left, never at a floored size over the page's width. So, at a device pixel
// ratio of 1 and of 2, at the fit and each step of the zoom menu (among them those where PDF.js floors away most of a CSS px of
// the page's width), and on every page laid near the view:
//   - the copy is on the place's box at the pixel ratio, as PDF.js sizes a page view's canvas;
//   - the SVG and the links are the page's size at its scale, not its floored box;
// and a page drawn again at the same zoom gives the same copy, 0 pixels differing, while one far from the view and back is its
// kept drawing, nothing drawn again (the time's half of the rule).
// (Before the per-unit erasure a copy could also be cut from PDF.js's canvas of the original, and its erase rectangles' residue
// was measured here; a copy is now always rendered from the composed document, and what it hides is glyph-exact by its groups:
// the pixel gates of lab/pdf/spikes/ocg-gate.mjs and lab/pdf/spikes/ocg-reader.mjs.)
//
// Usage: pnpm build && pnpm e2e:registration     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build; AXT_DPR=1.1,1.8 runs those ratios alone;
// AXT_BASE=delta cuts the sample as a layer held as a delta over arXiv's PDF.
// AXT_MEASURE=1 checks nothing and measures the copy instead, at the fit and at 100 %: each laid copy's render (ms, the median
// of five) and the long tasks of the browser's own recopy after the zoom, a line a page (PDF-READER.md §11.8).
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { FACES } from '../../src/pdf-reader/engine/rules/font-roles.mjs'
import { copyWithGrants } from './ext-copy.mjs'
import { startEchoEndpoint } from './lib/echo-endpoint.mjs'
import { launchWithReader } from './lib/extension.mjs'
import { cutSample, sampleFiles } from './lib/layer-cut.mjs'
import { layerApi, serves } from './lib/layer-api.mjs'
import { RESOLVER_WALL, routeTable } from './lib/route-table.mjs'
import { seedService } from './options-page.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUILD = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}.ext-registration`
/** the window: a laptop's (the owner's fit, 87 %, at a pixel ratio of 2) */
const WINDOW = { width: 1512, height: 848 }
const RATIOS = process.env.AXT_DPR ? process.env.AXT_DPR.split(',').map(Number) : [2, 1]
const MEASURING = process.env.AXT_MEASURE === '1'
/** the zooms tried: the fit and the menu's steps around it, each checked (among them those PDF.js floors most of a CSS px off) */
const ZOOMS = ['page-width', 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.5]
// AXT_BASE=delta: the sample's layer held as a delta over arXiv's PDF (lib/layer-cut.mjs `base: 'delta'`, every page replaced)
const DELTA = process.env.AXT_BASE === 'delta'
const sampleCut = await cutSample(sampleFiles(), DELTA ? { base: 'delta' } : undefined)
const LATIN_FACE = readFileSync(fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)))
const api = layerApi({ layer4: sampleCut, bound: DELTA, faces: { ids: Object.keys(FACES), ranges: [32, 126, 160, 255, 0x2010, 0x2027], bytes: new Uint8Array(LATIN_FACE) } })
const { sample } = api
const PAPER = sample.id
const ABSTRACT_PAGE = `<!doctype html><title>stand-in abstract</title><meta name="citation_title" content="Counting Lattice Paths Around Blocked Cells"><div class="submission-history"><strong>[v${sample.version}]</strong></div>`
const manifest = readFileSync(`${BUILD}/manifest.json`, 'utf8')
const LAYER_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const note = text => console.log(`NOTE ${text}`)

/** arXiv's addresses for the sample: its abstract page and its PDF (ranges answered as arXiv answers them), nothing else */
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: ABSTRACT_PAGE })
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const bytes = sample.pdf, r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(bytes) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, bytes.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${bytes.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(bytes.subarray(begin, end)) })
}
const tex = route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'no TeX page in this run' })

/** the long tasks of the reader's page, for the measure */
const RECORDER = `(() => {
  window.__axtLong = []
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__axtLong.push([e.startTime, e.duration]) }).observe({ type: 'longtask' })
})()`

/** in the page: every page laid near the view, its copy's size, the copy rendered again from the composed document (ms), and
 *  the frame of its SVG and links against the page's size at its scale */
const VIEWS = sampleCut.views.map(v => [v[2] - v[0], v[3] - v[1]])
const measureAll = views => window.__axtMeasure(views)
const MEASURE = `window.__axtMeasure = async views => {
  const scale = window.__reader.view.probe().scale
  const laid = [...document.querySelectorAll('#right .axt-place[data-axt-layer]')].filter(p => p.querySelector('canvas.axt-layer-copy')?.width > 0).map(p => Number(p.dataset.pageNumber))
  const out = []
  for (const n of laid) {
    const place = document.querySelector('#right .axt-place[data-page-number="' + n + '"]')
    const copy = place.querySelector('canvas.axt-layer-copy')
    const frame = el => (el ? el.getBoundingClientRect() : null)
    const svg = frame(place.querySelector('.axt-layer > svg')), links = frame(place.querySelector('.axt-layer > .axt-links')), box = frame(place.querySelector('.axt-layer'))
    const size = views[n - 1]
    out.push({ page: n, copy: [copy.width, copy.height], frame: { want: [size[0] * scale * 4 / 3, size[1] * scale * 4 / 3], box: box && [box.width, box.height], svg: svg && [svg.width, svg.height], links: links && [links.width, links.height] } })
  }
  return { scale, dpr: devicePixelRatio, pages: out }
}`

/** in the page: every laid copy drawn at the zoom (its pixels the place's box's at the pixel ratio, within PDF.js's floor) */
const settled = () => {
  const laid = [...document.querySelectorAll('#right .axt-place[data-axt-layer] .axt-layer')].filter(l => l.querySelector('canvas.axt-layer-copy')?.width > 0)
  return laid.length > 0 && laid.every(l => Math.abs(l.querySelector('canvas.axt-layer-copy').width - l.getBoundingClientRect().width * devicePixelRatio) <= 2 * devicePixelRatio + 1)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const echo = await startEchoEndpoint()
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...LAYER_HOSTS.map(host => `${host}/*`)] })
try {
  for (const dpr of RATIOS) {
    console.log(`\n# a device pixel ratio of ${dpr}, a window of ${WINDOW.width} × ${WINDOW.height}`)
    const { context, worker, readerUrl } = await launchWithReader({ profile: `registration-${dpr}`, extension: EXT, headless: !process.env.AXT_HEADED, viewport: WINDOW, deviceScaleFactor: dpr, args: [RESOLVER_WALL] })
    const pageErrors = []
    try {
      const guard = await routeTable(context, [
        ['https://arxiv.org', arxiv],
        ['https://tex.readarxiv.org', tex],
        [echo.origin, route => route.continue()],
        ...LAYER_HOSTS.map(host => [host, (route, url) => (serves(url.pathname) ? api.route(route) : false)]),
      ])
      for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config))); tries++) await sleep(200)
      await seedService(worker, { id: 'svc-e2eecho0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
      await worker.evaluate(async () => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: 'deu' } }) })
      await context.addInitScript(RECORDER)
      const page = await context.newPage()
      page.on('pageerror', e => pageErrors.push(e.message))
      await page.goto(readerUrl({ live: '1', paper: PAPER, mode: 'bilingual' }))
      await page.evaluate(MEASURE)
      const laid = await page.waitForFunction(() => { const l = document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer'); return l?.querySelector('canvas.axt-layer-copy')?.width > 0 && /\[echo\]/.test(l.querySelector('svg')?.textContent ?? '') }, null, { timeout: 60_000 }).then(() => true, () => false)
      check(`DPR ${dpr}: the sample's first page is laid on the right`, laid)
      if (!laid) continue
      await page.waitForFunction(() => window.__reader.side()?.probe().ended === true, null, { timeout: 30_000 }).catch(() => undefined)
      // (the pages near the view laid: two at least, so that every zoom checks the same pages)
      await page.waitForFunction(() => document.querySelectorAll('#right .axt-place[data-axt-layer] canvas.axt-layer-copy').length >= 2, null, { timeout: 30_000 }).catch(() => undefined)
      check(`DPR ${dpr}: the composed document is opened once for the head, whatever its parts`, (await page.evaluate(() => window.__reader.side().probe().composed)) === 1)
      if (MEASURING) {
        for (const z of ['page-width', 1]) {
          const t0 = await page.evaluate(() => performance.now())
          await page.evaluate(z => window.__reader.view.zoomTo(z), z)
          await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
          await sleep(1500)
          await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
          const long = await page.evaluate(t0 => window.__axtLong.filter(([at]) => at >= t0).map(([, d]) => Math.round(d)), t0)
          const m = await page.evaluate(measureAll, VIEWS)
          console.log(`MEASURE DPR ${dpr}, zoom ${z} (scale ${m.scale.toFixed(4)}): copies ${m.pages.map(p => `${p.page} ${p.copy.join('x')}`).join(', ')}; the zoom's recopy: ${long.length} long task(s), longest ${Math.max(0, ...long)} ms, ${long.reduce((a, b) => a + b, 0)} ms in all`)
        }
        await page.close()
        continue
      }

      // ------------------------------------------------------------------ the time's half: kept off the view and put back; drawn again
      await page.waitForFunction(settled, null, { timeout: 15_000 }).catch(() => undefined)
      await sleep(1500)
      const first = await page.evaluate(() => {
        const c = document.querySelector('#right .axt-place[data-page-number="1"] canvas.axt-layer-copy')
        window.__axtFirst = { w: c.width, h: c.height, px: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, el: c }
        const p = window.__reader.side().probe()
        return { retirements: p.retirements, copies: p.copies }
      })
      /** page 1's copy now against the first: its size, the pixels that differ, and whether it is the first's very canvas */
      const againstFirst = () => page.evaluate(() => {
        const c = document.querySelector('#right .axt-place[data-page-number="1"] canvas.axt-layer-copy'), a = window.__axtFirst
        if (c.width !== a.w || c.height !== a.h) return { differing: -1, size: [c.width, c.height], was: [a.w, a.h], same: c === a.el }
        const b = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let differing = 0
        for (let i = 0; i < a.px.length; i += 4) if (a.px[i] !== b[i] || a.px[i + 1] !== b[i + 1] || a.px[i + 2] !== b[i + 2]) differing++
        return { differing, size: [c.width, c.height], same: c === a.el }
      })
      // far from the view: out of the document, its drawing kept (layer-side.mjs KEEP_PIXELS); back: put back as it was, nothing drawn
      await page.evaluate(() => { document.getElementById('right').scrollTop = 1e7 })
      const retired = await page.waitForFunction(r => window.__reader.side().probe().retirements > r && !document.querySelector('#right .axt-place[data-page-number="1"] canvas.axt-layer-copy'), first.retirements, { timeout: 20_000 }).then(() => true, () => false)
      await page.evaluate(() => { document.getElementById('right').scrollTop = 0 })
      const back = retired && await page.waitForFunction(() => document.querySelector('#right .axt-place[data-page-number="1"] canvas.axt-layer-copy')?.width > 0, null, { timeout: 30_000 }).then(() => true, () => false)
      const kept = back ? await againstFirst() : null
      const copiesBack = await page.evaluate(() => window.__reader.side().probe().copies)
      check(`DPR ${dpr}: page 1 far from the view and back is put back as it was drawn: its very copy, 0 pixels differing, no copy drawn again`, kept?.same === true && kept.differing === 0 && copiesBack === first.copies, JSON.stringify({ retired, back, ...kept, copies: [first.copies, copiesBack] }))
      // drawn again at the same zoom (a zoom away and back: the recopy at each): the same copy, 0 pixels differing
      const z0 = await page.evaluate(() => window.__reader.view.probe().scale)
      for (const z of [z0 * 1.25, z0]) {
        await page.evaluate(z => window.__reader.view.zoomTo(z), z)
        await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
        await sleep(1500)
        await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
      }
      const drawn = await againstFirst()
      await page.evaluate(() => { window.__axtFirst = null })
      check(`DPR ${dpr}: page 1 drawn again at the same zoom (a zoom away and back) draws the same copy (0 pixels differ)`, drawn?.same === false && drawn.differing === 0, JSON.stringify(drawn))

      // ------------------------------------------------------------------ each zoom
      const seen = []
      for (const z of ZOOMS) {
        await page.evaluate(z => window.__reader.view.zoomTo(z), z)
        await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
        // (the copies drawn again at the zoom: RECOPY_MS after the change)
        await sleep(1500)
        await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
        const m = await page.evaluate(measureAll, VIEWS)
        seen.push({ z, ...m })
        for (const p of m.pages) console.log(`  zoom ${z} (scale ${m.scale.toFixed(4)}) page ${p.page}: copy ${p.copy.join('x')}, frame ${JSON.stringify(p.frame)}`)
      }
      for (const s of seen) {
        for (const p of s.pages) {
          const box = p.frame.box && [Math.round(p.frame.box[0] * dpr), Math.round(p.frame.box[1] * dpr)]
          check(`DPR ${dpr}, zoom ${s.z}, page ${p.page}: the copy is on the place's box at the pixel ratio, as PDF.js sizes a page view's`, !!box && Math.abs(p.copy[0] - box[0]) <= 1 && Math.abs(p.copy[1] - box[1]) <= 1, `copy ${JSON.stringify(p.copy)}, the box at ${dpr} ${JSON.stringify(box)}`)
          const near = (a, b) => !!a && Math.abs(a[0] - b[0]) <= 0.05 && Math.abs(a[1] - b[1]) <= 0.05
          check(`DPR ${dpr}, zoom ${s.z}, page ${p.page}: the SVG and the links are the page's size at its scale, not its floored box`, near(p.frame.svg, p.frame.want) && (!p.frame.links || near(p.frame.links, p.frame.want)), JSON.stringify(p.frame))
        }
      }
      check(`DPR ${dpr}: no request left the route table`, guard.violations.length === 0, guard.violations.map(v => `${v.method} ${v.url}`).join('; '))
      check(`DPR ${dpr}: no page of the reader threw`, pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
      await page.close()
    } finally {
      await context.close().catch(() => undefined)
    }
  }
} finally {
  await echo.close()
  await api.release?.()
  rmSync(EXT, { recursive: true, force: true })
}
const pass = results.filter(r => r.ok).length
console.log(`\n${pass}/${results.length} passed`)
for (const r of results.filter(x => !x.ok)) console.log(`FAILED ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
process.exit(pass === results.length ? 0 : 1)
