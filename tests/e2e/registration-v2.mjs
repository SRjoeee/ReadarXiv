// The registration of a laid page on a build of the rebuilt reader (AXT_READER=v2), in a real browser, on the reader package's
// CC0 fixture s1-columns and with no network, as reader-v2.mjs runs it (one route table, the stand-in of our server's /api/v2,
// the echo endpoint as the extension's own service).
//
// A laid page is the left's page drawn (the slot's view) under its overlay (`.axt-over`: the translation's SVG, its text layer
// and links, the crops of what stays), laid at the scale the page is drawn at. So, at a device pixel ratio of 2 and of 1, at the
// fit and at each step of the zoom menu (among them those where PDF.js floors away most of a CSS px of the page's width), on
// every page laid:
//   - the page's drawing is on the slot's box at the pixel ratio, as PDF.js sizes a page view's canvas;
//   - the overlay is the slot's box, and its SVG the page's own size from the slot's corner: PDF.js draws the page at the
//     zoom's scale and rounds the slot's box down (to its --scale-round-x and -y, a CSS px at an integral ratio), so the
//     translation drawn at that scale registers with the page's drawing only where it is not rounded with the box (the SVG
//     past the slot by less than that step; the reader package's e2e "I1" measures the residue on the pixels).
// (The old reader's half of this script, its copy of the composed document kept far from the view and drawn again pixel for
// pixel, is the old reader's mechanism; the rebuilt reader's laid page far and back is its very drawing: the reader package's
// e2e, "port: a laid page far and back is its very drawing".)
//
// Usage: pnpm build && pnpm e2e:registration     (AXT_READER's default, v2)
// Environment: AXT_HEADED=1 watches it run; AXT_EXT_DIR points at another build; AXT_DPR=1.1,1.8 runs those ratios alone.
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { copyWithGrants } from './ext-copy.mjs'
import { startEchoEndpoint } from './lib/echo-endpoint.mjs'
import { launchWithReader } from './lib/extension.mjs'
import { RESOLVER_WALL, routeTable } from './lib/route-table.mjs'
import { loadFixture, v2Api } from './lib/v2-api.mjs'
import { seedService } from './options-page.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const BUILD = process.env.AXT_EXT_DIR ?? fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url))
const EXT = `${HERE}.ext-registration-v2`
const WINDOW = { width: 1512, height: 848 }
const RATIOS = process.env.AXT_DPR ? process.env.AXT_DPR.split(',').map(Number) : [2, 1]
const ZOOMS = ['page-width', 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.5]
const fixture = loadFixture('s1-columns')
const PAPER = fixture.paper
const ABSTRACT_PAGE = `<!doctype html><title>stand-in abstract</title><meta name="citation_title" content="Columns, Captions and Links: a Fixture of Our Own"><div class="submission-history"><strong>[v${fixture.version}]</strong></div>`
const manifest = readFileSync(`${BUILD}/manifest.json`, 'utf8')
const API_HOSTS = ['https://readarxiv.com', ...['https://app-staging.readarxiv.org'].filter(host => manifest.includes(host))]

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  if (m[1] === 'abs') return route.fulfill({ status: 200, contentType: 'text/html', body: ABSTRACT_PAGE })
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const bytes = fixture.pdf, r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(bytes) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, bytes.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${bytes.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(bytes.subarray(begin, end)) })
}

/** in the page: every laid page's slot, its drawing's canvas and its overlay, against the slot's box at the pixel ratio */
const measure = () => [...document.querySelectorAll('section.pane[data-side="right"] .axt-slot')].flatMap(slot => {
  const over = slot.querySelector('.axt-over')
  const view = slot.querySelector('.axt-slot-view')
  const canvas = view?.querySelector('canvas:not(.axt-crops)')
  if (!over || !canvas?.width) return []
  const box = r => { const b = r.getBoundingClientRect(); return [b.width, b.height, b.left, b.top] }
  const svg = over.querySelector('svg')
  // (PDF.js's rounding of the page view's box, CSS px: the denominator of its output scale's fraction, 1 at an integral ratio)
  const round = ['x', 'y'].map(a => Number.parseFloat(getComputedStyle(canvas).getPropertyValue(`--scale-round-${a}`)) || 1)
  // (the page's own size at the zoom, unrounded, apart from the overlay's own sizing: its SVG's page units at PDF.js's scale
  // factor, the viewer's; sorted, as a turned page's box is its frame's turned)
  const css = name => Number.parseFloat(getComputedStyle(canvas).getPropertyValue(name))
  const vb = svg?.viewBox?.baseVal
  const factor = css('--scale-factor') * (css('--user-unit') || 1)
  const own = vb?.width && factor ? [vb.width * factor, vb.height * factor] : null
  return [{ page: Number(slot.dataset.pageNumber), dpr: devicePixelRatio, slot: box(view), canvas: [canvas.width, canvas.height], over: box(over), svg: svg ? box(svg) : null, round, own }]
})

const echo = await startEchoEndpoint()
copyWithGrants(BUILD, EXT, { hostPermissions: ['http://127.0.0.1/*', ...API_HOSTS.map(host => `${host}/*`)] })
try {
  for (const dpr of RATIOS) {
    console.log(`\n# a device pixel ratio of ${dpr}, a window of ${WINDOW.width} × ${WINDOW.height}`)
    const { context, worker, id, readerUrl } = await launchWithReader({ profile: `registration-v2-${dpr}`, extension: EXT, headless: !process.env.AXT_HEADED, viewport: WINDOW, deviceScaleFactor: dpr, args: [RESOLVER_WALL] })
    const api = v2Api({ fixtures: [fixture], base: API_HOSTS[0], extension: `chrome-extension://${id}` })
    const pageErrors = []
    try {
      const guard = await routeTable(context, [
        ['https://arxiv.org', arxiv],
        [echo.origin, route => route.continue()],
        ...API_HOSTS.map(host => [host, (route, url) => api.route(route, url)]),
      ])
      for (let tries = 0; tries < 50 && !(await worker.evaluate(() => chrome.storage.local.get('config').then(r => !!r.config))); tries++) await sleep(200)
      await seedService(worker, { id: 'svc-e2eecho0', name: 'echo', baseURL: echo.baseURL, model: 'local-echo' })
      await worker.evaluate(async () => { const { config } = await chrome.storage.local.get('config'); await chrome.storage.local.set({ config: { ...config, targetLanguage: 'deu' } }) })
      const page = await context.newPage()
      page.on('pageerror', e => pageErrors.push(e.message))
      await page.goto(readerUrl({ live: '1', paper: PAPER, mode: 'bilingual' }))
      const laid = await page.waitForFunction(() => (window.__reader?.probe?.().laidPages ?? 0) >= 1, null, { timeout: 60_000 }).then(() => true, () => false)
      check(`DPR ${dpr}: the paper's first page is laid on the right`, laid)
      if (!laid) continue
      for (const z of ZOOMS) {
        await page.evaluate(z => window.__reader.controller.zoomTo(z), z)
        // (the page drawn again at the zoom, its crops 600 ms after: PDF-READER §6.8)
        await sleep(1500)
        const m = await page.evaluate(measure)
        for (const p of m) {
          const atRatio = [Math.round(p.slot[0] * dpr), Math.round(p.slot[1] * dpr)]
          check(`DPR ${dpr}, zoom ${z}, page ${p.page}: the page's drawing is on the slot's box at the pixel ratio`, Math.abs(p.canvas[0] - atRatio[0]) <= 1 && Math.abs(p.canvas[1] - atRatio[1]) <= 1, `canvas ${JSON.stringify(p.canvas)}, the box at ${dpr} ${JSON.stringify(atRatio)}`)
          const near = (a, b) => !!a && a.every((v, i) => Math.abs(v - b[i]) <= 0.05)
          // (the SVG from the slot's corner, the page's size: the slot's, or past it by what the rounding down took, under its step)
          const framed = (svg, slot) => near(svg.slice(2), slot.slice(2)) && [0, 1].every(i => svg[i] >= slot[i] - 0.05 && svg[i] - slot[i] < p.round[i] + 0.05) && !!p.own && near(svg.slice(0, 2).sort((a, b) => a - b), [...p.own].sort((a, b) => a - b))
          check(`DPR ${dpr}, zoom ${z}, page ${p.page}: the overlay is the slot's box, its SVG the page's own size from the slot's corner`, near(p.over, p.slot) && (!p.svg || framed(p.svg, p.slot)), JSON.stringify({ slot: p.slot, over: p.over, svg: p.svg, round: p.round, own: p.own }))
        }
        if (!m.length) {
          // (what the right's first slots hold, where none measured: their parts and canvases)
          const seen = await page.evaluate(() => [...document.querySelectorAll('section.pane[data-side="right"] .axt-slot')].slice(0, 2).map(s => ({
            n: s.dataset.pageNumber,
            parts: [...s.querySelectorAll('*')].slice(0, 12).map(e => `${e.tagName.toLowerCase()}.${typeof e.className === 'string' ? e.className.split(' ').join('.') : ''}`),
            canvases: [...s.querySelectorAll('canvas')].map(c => `${c.className || '-'} ${c.width}x${c.height}`),
          })))
          check(`DPR ${dpr}, zoom ${z}: a laid page measured`, false, `none; ${JSON.stringify(seen)}`)
        }
      }
      check(`DPR ${dpr}: no request left the route table`, guard.violations.length === 0, guard.violations.map(v => `${v.method} ${v.url}`).join('; '))
      check(`DPR ${dpr}: no page of the reader threw`, pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
      await page.close()
    } finally {
      await api.release()
      await context.close().catch(() => undefined)
    }
  }
} finally {
  await echo.close()
  rmSync(EXT, { recursive: true, force: true })
}
const pass = results.filter(r => r.ok).length
console.log(`\n${pass}/${results.length} passed`)
for (const r of results.filter(x => !x.ok)) console.log(`FAILED ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
process.exit(pass === results.length ? 0 : 1)
