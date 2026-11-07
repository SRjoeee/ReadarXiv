// The reader package in the extension (a build of AXT_READER=v2): the PDF page opens, the chrome is drawn, the original's
// first page is drawn on the left by the package's panes, and the reader's state reaches the chrome; our server answers 503
// (no v2 stand-in yet), so the layer is refused for a while and the capsule says so. Offline: the sample answered for arXiv,
// one route table refusing any other request. A reading for the lane, not a gate.
//   AXT_READER=v2 pnpm build && node tests/e2e/probes/v2-smoke.mjs [--shot <file.png>]
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyWithGrants } from '../ext-copy.mjs'
import { launchWithReader } from '../lib/extension.mjs'
import { layerApi } from '../lib/layer-api.mjs'
import { RESOLVER_WALL, routeTable } from '../lib/route-table.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const BUILD = process.env.AXT_EXT_DIR ?? join(ROOT, '.output/chrome-mv3')
const EXT = join(ROOT, 'tests/e2e/.ext-v2-smoke')
const { sample } = layerApi()
const PDF = sample.pdf
const PAPER = sample.id
const asked = []
const arxiv = (route, url) => {
  const m = /^\/(pdf|abs|html|src)\/([^/]+)$/.exec(url.pathname)
  if (!m || m[2].replace(/v\d+$/, '') !== PAPER) return false
  if (m[1] !== 'pdf') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'none' })
  const r = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '')
  if (!r) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from(PDF) })
  const begin = Number(r[1]), end = Math.min(Number(r[2]) + 1, PDF.length)
  return route.fulfill({ status: 206, contentType: 'application/pdf', headers: { 'content-range': `bytes ${begin}-${end - 1}/${PDF.length}`, 'accept-ranges': 'bytes' }, body: Buffer.from(PDF.subarray(begin, end)) })
}
copyWithGrants(BUILD, EXT, { hostPermissions: ['https://readarxiv.com/*'] })
const { context, readerUrl } = await launchWithReader({ profile: 'v2-smoke', extension: EXT, viewport: { width: 1440, height: 900 }, args: [RESOLVER_WALL] })
await routeTable(context, [
  ['https://arxiv.org', (route, url) => { asked.push(`arxiv ${url.pathname}`); return arxiv(route, url) }],
  ['https://readarxiv.com', (route, url) => { asked.push(`ours ${route.request().method()} ${url.pathname}`); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"busy"}' }) }],
])
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
const consoleErrors = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text().slice(0, 1500)) })
await page.goto(readerUrl({ paper: PAPER, mode: 'bilingual' }))
const drawn = await page.waitForFunction(() => [...document.querySelectorAll('#left canvas')].some(c => c.width > 0), null, { timeout: 30_000 }).then(() => true, () => false)
await page.waitForTimeout(3000)
const seen = await page.evaluate(() => ({
  bar: !!document.querySelector('header.chrome.bar'),
  title: document.querySelector('header.chrome.bar')?.textContent?.slice(0, 80) ?? '',
  leftCanvases: document.querySelectorAll('#left canvas').length,
  rightCanvases: document.querySelectorAll('#right canvas').length,
  capsule: document.querySelector('.capsule')?.textContent ?? null,
  state: window.__reader?.reader?.state?.() ? (s => ({ original: s.original.s, layer: s.layer.s, rows: s.rows.s, pages: s.view.sides.left.pages }))(window.__reader.reader.state()) : null,
  phase: window.__reader?.controller?.getState?.().phase ?? null,
  canvases: document.querySelectorAll('canvas').length,
  panes: ['left', 'right'].map(id => { const el = document.getElementById(id); return el ? { box: [el.clientWidth, el.clientHeight, el.scrollHeight], children: [...el.children].map(c => `${c.tagName.toLowerCase()}.${[...c.classList].join('.')}[${c.children.length}]`).slice(0, 4) } : null }),
  root: document.querySelector('main')?.className ?? null,
}))
const shot = arg('--shot')
if (shot) await page.screenshot({ path: shot })
console.log(JSON.stringify({ drawn, ...seen, errors, console: consoleErrors.slice(0, 6), asked: [...new Set(asked)].slice(0, 12) }, null, 1))
await context.close()
process.exit(drawn && seen.bar && errors.length === 0 ? 0 : 1)
