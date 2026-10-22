// The reader's registration in a real browser, on the repository's sample paper (tests/fixtures/pdf/sample-1/) and with no
// network, as reader.mjs runs it: one route table answers every request, the stand-in of the layer API serves the sample's
// layer, and the extension's own translation comes from the local echo endpoint.
//
// A laid page's copy is the original's page drawn by PDF.js, with the erase over it (its paper fills and swaps), under the
// SVG of its translation and its links. PDF.js draws a page at its unrounded scale and floors its canvas to whole CSS px;
// the copy, the SVG and the links are right only where they are laid at the scale PDF.js drew at, from the page's top-left,
// never at a floored size over the page's width (the canvas's or the box's). Where the floor drops most of a pixel, an erase
// laid at the floored scale falls short of the ink by a device pixel or two at the page's far corner, and the original's
// ink shows past it. So, at a device pixel ratio of 1 and of 2, at each zoom where PDF.js floors away at least 0.6 of a CSS
// px of the page's width (chosen from what the browser draws, not from a table), and on every page laid near the view:
//   - registration: the copy made from PDF.js's canvas (the source a commit takes) and the copy made from the page drawn at
//     the place's k (exact by construction) are the same, pixel for pixel, within anti-aliasing (the side's registration());
//   - residue: the original's ink left within 2 px of the rectangles the copy's paper fills and swaps cover is no more than
//     at the aligned zoom (100 %, where nothing is floored) on the same page, scaled by the zoom's area;
//   - the frame: the SVG and the links are the page's size at its scale, not its floored box; and a copy drawn from the
//     document is on the place's box at the pixel ratio, as PDF.js's canvas is;
// and a page retired and laid again at the same zoom gives the same copy, 0 pixels differing (the time's half of the rule).
//
// Each check has its positive control: run on the code before the fix (origin/next a567506a), every registration and
// frame check at a chosen zoom fails (the numbers are the fix's pull request's). The copy drawn from the document is drawn
// on the context PDF.js draws a page view on, so the two copies agree to the pixel where the frame is right: 0 differ.
//
// Usage: pnpm build && pnpm e2e:registration     (first time: npx playwright install chromium)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build; AXT_DPR=1.1,1.8 runs those ratios alone.
// AXT_MEASURE=1 checks nothing and measures the commit's path instead, at the fit and at 100 %: its source and its copy (ms,
// the median of five) and the long tasks of the browser's own recopy after the zoom, a line a page (PDF-READER.md §11.8).
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
/** the zooms tried: the fit and the menu's steps around it; those PDF.js floors at least FLOORED of a CSS px off are checked */
const ZOOMS = ['page-width', 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.5]
const FLOORED = 0.6
/** a channel differing by more than this is a pixel differing (anti-aliasing apart); and how many such a copy may hold */
const TOLERANCE = 16
const DIFFERING_MAX = 0
/** the residue: ink darker than 240 within 2 px of an erased rectangle; the slack over the aligned zoom's, in device px */
const RESIDUE_SLACK = 4

const sampleCut = await cutSample(sampleFiles())
const LATIN_FACE = readFileSync(fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)))
const api = layerApi({ layer4: sampleCut, faces: { ids: Object.keys(FACES), ranges: [32, 126, 160, 255, 0x2010, 0x2027], bytes: new Uint8Array(LATIN_FACE) } })
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

/** the drawing calls made on each canvas while `__axtRecord` is set (the copies registration() draws): its rectangles and
 *  what each path became (a fill, a clip), and each drawImage's count of arguments and, for one of nine, where it drew: a
 *  copy's paper fills (a path filled) and swaps (a path clipped, then the removed page drawn in at 0, 0) are what it erased;
 *  its restores and crops (a part of a page drawn into a box) are the original's ink put back on purpose */
const RECORDER = `(() => {
  const P = CanvasRenderingContext2D.prototype, ops = new WeakMap()
  const keep = (ctx, entry) => { if (!window.__axtRecord) return; const c = ctx.canvas; let l = ops.get(c); if (!l) ops.set(c, (l = [])); if (l.length < 400000) l.push(entry) }
  for (const name of ['beginPath', 'fill', 'clip', 'restore']) { const f = P[name]; P[name] = function (...a) { keep(this, [name]); return f.apply(this, a) } }
  const rect = P.rect
  P.rect = function (x, y, w, h) { keep(this, ['rect', x, y, w, h]); return rect.call(this, x, y, w, h) }
  const draw = P.drawImage
  P.drawImage = function (...a) { keep(this, ['drawImage', a.length, ...(a.length === 9 ? a.slice(5) : [])]); return draw.apply(this, a) }
  window.__axtOps = c => ops.get(c) ?? null
  window.__axtLong = []
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__axtLong.push([e.startTime, e.duration]) }).observe({ type: 'longtask' })
})()`

/** in the page: the registration of every page laid near the view, with the residue of its copy from PDF.js's canvas */
const measureAll = () => window.__axtMeasure()
const MEASURE = `window.__axtMeasure = async () => {
  const side = window.__reader.side(), scale = window.__reader.view.probe().scale
  const laid = [...document.querySelectorAll('#right .axt-place[data-axt-layer]')].filter(p => p.querySelector('canvas.axt-layer-copy')?.width > 0).map(p => Number(p.dataset.pageNumber))
  const out = []
  for (const n of laid) {
    window.__axtRecord = true
    let r
    try { r = await side.registration(n, { tolerance: ${TOLERANCE}, canvases: true }) } finally { window.__axtRecord = false }
    if (!r) continue
    const { copies, ...seen } = r
    if (copies) {
      // the rectangles erased: each path filled, and each path clipped that the removed page is drawn into at 0, 0; and the
      // boxes the original's ink is put back into (a restore's, a crop's)
      const rects = [], kept = []
      let path = null, clipped = null
      for (const o of window.__axtOps(copies.source) ?? []) {
        if (o[0] === 'beginPath') path = []
        else if (o[0] === 'rect' && path) path.push(o.slice(1))
        else if (o[0] === 'fill' && path) { rects.push(...path); path = null }
        else if (o[0] === 'clip' && path) { clipped = path; path = null }
        else if (o[0] === 'drawImage') { if (clipped && o[1] === 3) rects.push(...clipped); if (o[1] === 9) kept.push(o.slice(2)); clipped = null }
        else if (o[0] === 'restore') clipped = null
      }
      const c = copies.source, W = c.width, H = c.height, px = c.getContext('2d').getImageData(0, 0, W, H).data
      const mask = new Uint8Array(W * H)
      const paint = ([x, y, w, h], grow, v) => {
        const x0 = Math.max(0, Math.floor(Math.min(x, x + w) - grow)), x1 = Math.min(W, Math.ceil(Math.max(x, x + w) + grow))
        const y0 = Math.max(0, Math.floor(Math.min(y, y + h) - grow)), y1 = Math.min(H, Math.ceil(Math.max(y, y + h) + grow))
        for (let yy = y0; yy < y1; yy++) if (x1 > x0) mask.fill(v, yy * W + x0, yy * W + x1)
      }
      for (const r of rects) paint(r, 2, 1)
      for (const r of kept) paint(r, 1, 0)
      seen.kept = kept.length
      let residue = 0
      for (let p = 0; p < W * H; p++) if (mask[p] && (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 < 240) residue++
      seen.rects = rects.length
      seen.residue = residue
      for (const k of Object.values(copies)) { k.width = 0; k.height = 0 }
    }
    // the frame: the SVG and the links at the page's size at its scale (the page box is that floored)
    const place = document.querySelector('#right .axt-place[data-page-number="' + n + '"]')
    const frame = el => (el ? el.getBoundingClientRect() : null)
    const svg = frame(place?.querySelector('.axt-layer > svg')), links = frame(place?.querySelector('.axt-layer > .axt-links')), box = frame(place?.querySelector('.axt-layer'))
    seen.frame = { want: [r.size[0] * scale * 4 / 3, r.size[1] * scale * 4 / 3], box: box && [box.width, box.height], svg: svg && [svg.width, svg.height], links: links && [links.width, links.height] }
    out.push(seen)
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
      const hooked = await page.evaluate(() => typeof window.__axtOps === 'function')
      check(`DPR ${dpr}: the canvas recorder runs in the reader's page`, hooked)
      const laid = await page.waitForFunction(() => { const l = document.querySelector('#right .axt-place[data-page-number="1"] .axt-layer'); return l?.querySelector('canvas.axt-layer-copy')?.width > 0 && /\[echo\]/.test(l.querySelector('svg')?.textContent ?? '') }, null, { timeout: 60_000 }).then(() => true, () => false)
      check(`DPR ${dpr}: the sample's first page is laid on the right`, laid)
      if (!laid || !hooked) continue
      await page.waitForFunction(() => window.__reader.side()?.probe().ended === true, null, { timeout: 30_000 }).catch(() => undefined)
      // (the pages near the view laid: two at least, so that every zoom checks the same pages)
      await page.waitForFunction(() => document.querySelectorAll('#right .axt-place[data-axt-layer] canvas.axt-layer-copy').length >= 2, null, { timeout: 30_000 }).catch(() => undefined)
      if (MEASURING) {
        const median = v => [...v].sort((a, b) => a - b)[v.length >> 1]
        for (const z of ['page-width', 1]) {
          const t0 = await page.evaluate(() => performance.now())
          await page.evaluate(z => window.__reader.view.zoomTo(z), z)
          await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
          await sleep(1500)
          await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
          const long = await page.evaluate(t0 => window.__axtLong.filter(([at]) => at >= t0).map(([, d]) => Math.round(d)), t0)
          const runs = []
          for (let i = 0; i < 5; i++) runs.push(await page.evaluate(measureAll))
          for (const p of runs[0].pages) {
            const of = runs.map(r => r.pages.find(q => q.page === p.page)?.ms).filter(Boolean)
            console.log(`MEASURE DPR ${dpr}, zoom ${z} (scale ${runs[0].scale.toFixed(4)}), page ${p.page}: from ${p.from}, source ${median(of.map(m => m.source)).toFixed(1)} ms, copy ${median(of.map(m => m.copy)).toFixed(1)} ms, the page drawn from the document ${median(of.map(m => m.doc ?? m.source)).toFixed(1)} ms; the zoom's recopy: ${long.length} long task(s), longest ${Math.max(0, ...long)} ms, ${long.reduce((a, b) => a + b, 0)} ms in all`)
          }
        }
        await page.close()
        continue
      }

      // ------------------------------------------------------------------ the time's half: retired, then laid again
      await page.waitForFunction(settled, null, { timeout: 15_000 }).catch(() => undefined)
      await sleep(1500)
      const first = await page.evaluate(() => {
        const c = document.querySelector('#right .axt-place[data-page-number="1"] canvas.axt-layer-copy')
        window.__axtFirst = { w: c.width, h: c.height, px: c.getContext('2d').getImageData(0, 0, c.width, c.height).data }
        return { retirements: window.__reader.side().probe().retirements, commits: window.__reader.side().probe().commits }
      })
      await page.evaluate(() => { document.getElementById('right').scrollTop = 1e7 })
      const retired = await page.waitForFunction(r => window.__reader.side().probe().retirements > r && !document.querySelector('#right .axt-place[data-page-number="1"] canvas.axt-layer-copy'), first.retirements, { timeout: 20_000 }).then(() => true, () => false)
      await page.evaluate(() => { document.getElementById('right').scrollTop = 0 })
      const again = retired && await page.waitForFunction(() => document.querySelector('#right .axt-place[data-page-number="1"] canvas.axt-layer-copy')?.width > 0, null, { timeout: 30_000 }).then(() => true, () => false)
      const same = again ? await page.evaluate(() => {
        const c = document.querySelector('#right .axt-place[data-page-number="1"] canvas.axt-layer-copy'), a = window.__axtFirst
        if (c.width !== a.w || c.height !== a.h) return { differing: -1, size: [c.width, c.height], was: [a.w, a.h] }
        const b = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let differing = 0
        for (let i = 0; i < a.px.length; i += 4) if (a.px[i] !== b[i] || a.px[i + 1] !== b[i + 1] || a.px[i + 2] !== b[i + 2]) differing++
        window.__axtFirst = null
        return { differing, size: [c.width, c.height] }
      }) : null
      check(`DPR ${dpr}: page 1 retired and laid again at the same zoom draws the same copy (0 pixels differ)`, same?.differing === 0, JSON.stringify({ retired, again, ...same }))

      // ------------------------------------------------------------------ each zoom
      const seen = []
      for (const z of ZOOMS) {
        await page.evaluate(z => window.__reader.view.zoomTo(z), z)
        await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
        // (the left's pages drawn at the zoom, then the copies drawn again from them: RECOPY_MS after the change)
        await sleep(1500)
        await page.waitForFunction(settled, null, { timeout: 20_000 }).catch(() => undefined)
        const m = await page.evaluate(measureAll)
        seen.push({ z, ...m })
        for (const p of m.pages) console.log(`  zoom ${z} (scale ${m.scale.toFixed(4)}) page ${p.page}: from ${p.from}, k ${p.k.toFixed(5)}, source k ${p.kSource.toFixed(5)}, PDF.js floored ${(p.lost / dpr).toFixed(3)} CSS px; source ${JSON.stringify(p.source)}, document ${JSON.stringify(p.doc ?? null)}; ${p.differing ?? '-'} of ${p.compared ?? '-'} px differ (max ${p.maxDiff ?? '-'}), residue ${p.residue ?? '-'} over ${p.rects ?? '-'} rects (${p.kept ?? '-'} kept); frame ${JSON.stringify(p.frame)}`)
      }
      const aligned = seen.find(s => s.z === 1)
      const floorOf = n => aligned?.pages.find(p => p.page === n)?.residue
      const chosen = seen.filter(s => s.pages.some(p => p.from !== 'doc' && p.lost / dpr >= FLOORED))
      check(`DPR ${dpr}: zooms where PDF.js floors at least ${FLOORED} of a CSS px off the page's width (two at least, chosen from what it drew)`, chosen.length >= 2, chosen.map(s => `${s.z} (${s.scale.toFixed(4)})`).join(', '))
      for (const s of chosen) {
        for (const p of s.pages) {
          if (p.from === 'doc' || p.lost / dpr < FLOORED) continue
          check(`DPR ${dpr}, zoom ${s.z}, page ${p.page}: the copy from PDF.js's canvas is the copy at the place's k`, p.differing <= DIFFERING_MAX && p.kSource === p.k, `${p.differing} of ${p.compared} px differ by more than ${TOLERANCE} (max ${p.maxDiff}); source k ${p.kSource}, place k ${p.k}`)
          const floor = floorOf(p.page)
          const bound = floor === undefined ? null : floor * (s.scale / aligned.scale) ** 2 + RESIDUE_SLACK * dpr
          check(`DPR ${dpr}, zoom ${s.z}, page ${p.page}: the ink left at the erased rectangles is no more than at the aligned zoom`, bound !== null && p.residue <= bound, `${p.residue} px darker than 240 within 2 px of ${p.rects} rects; at 100 %: ${floor ?? 'not measured'} (bound ${bound === null ? '-' : bound.toFixed(1)})`)
          const box = p.frame.box && [Math.round(p.frame.box[0] * dpr), Math.round(p.frame.box[1] * dpr)]
          check(`DPR ${dpr}, zoom ${s.z}, page ${p.page}: the copy drawn from the document is on the place's box at the pixel ratio, as PDF.js sizes a page view's`, !!box && p.doc?.[0] === box[0] && p.doc?.[1] === box[1] && p.source[0] === box[0] && p.source[1] === box[1], `document ${JSON.stringify(p.doc)}, PDF.js ${JSON.stringify(p.source)}, the box at ${dpr} ${JSON.stringify(box)}`)
          const near = (a, b) => !!a && Math.abs(a[0] - b[0]) <= 0.05 && Math.abs(a[1] - b[1]) <= 0.05
          check(`DPR ${dpr}, zoom ${s.z}, page ${p.page}: the SVG and the links are the page's size at its scale, not its floored box`, near(p.frame.svg, p.frame.want) && (!p.frame.links || near(p.frame.links, p.frame.want)), JSON.stringify(p.frame))
        }
      }
      const atAligned = aligned?.pages ?? []
      check(`DPR ${dpr}: at the aligned zoom (100 %) PDF.js floors nothing and the two copies agree`, atAligned.length > 0 && atAligned.every(p => p.from === 'doc' || (Math.abs(p.lost) < 1e-6 && p.differing <= DIFFERING_MAX)), atAligned.map(p => `page ${p.page}: lost ${p.lost}, ${p.differing} differ, residue ${p.residue}`).join('; '))
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
note('the copies compared are drawn by registration(): the page shown is not touched')
process.exit(pass === results.length ? 0 : 1)
