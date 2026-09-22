// Boundary PoC runner: serves our "static site" (compiler page + BusyTeX assets) on one origin and a paper's source
// (standing in for arXiv's /src/) on another, loads the PoC extension into Chromium, opens its reader page twice in the
// same profile (a first visit and a returning one) and once in sandbox-probe mode.
//   node spikes/poc-run.mjs <paper id> [isolated]
import { createServer } from 'node:http'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { analyze } from './paper-meta.mjs'
const require = createRequire(new URL('../../../', import.meta.url))
const { chromium } = require('playwright')

const root = new URL('..', import.meta.url).pathname
const [id, isolated] = process.argv.slice(2)
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' }
const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const serve = handler => new Promise(r => { const s = createServer(handler).listen(0, '127.0.0.1', () => r(s)) })

const site = await serve((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  if (isolated) { res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin') }
  const file = path.startsWith('/lib/') ? join(root, 'node_modules/texlyre-busytex/dist', path.slice(5)) : path.startsWith('/busytex/') ? join(root, 'data/busytex-site', path.slice(1)) : join(root, 'poc-site', path.slice(1))
  try { res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.setHeader('Access-Control-Allow-Origin', '*'); res.end(readFileSync(file)) } catch { res.statusCode = 404; res.end() }
})
const dir = join(root, 'data/corpus', id, 'src')
const meta = analyze(dir)
const list = { main: meta.main, compiler: meta.compiler, files: walk(dir).map(p => relative(dir, p)).filter(p => !p.endsWith('00README.json')) }
const job = await serve((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (path === '/list.json') return res.end(JSON.stringify(list))
  try { res.end(readFileSync(join(dir, path.slice(5)))) } catch { res.statusCode = 404; res.end() }
})
const siteOrigin = `http://127.0.0.1:${site.address().port}`, jobOrigin = `http://127.0.0.1:${job.address().port}`

const EXT = join(root, 'poc-ext')
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'poc-profile-')), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] })
const [worker] = context.serviceWorkers().length ? context.serviceWorkers() : [await context.waitForEvent('serviceworker')]
const extId = new URL(worker.url()).host
let bytes = 0
context.on('requestfinished', async req => { if (req.url().startsWith(siteOrigin)) { const r = await req.response(); bytes += Number((await r?.allHeaders())?.['content-length'] ?? 0) } })
async function visit(mode) {
  bytes = 0
  const page = await context.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 200)) })
  await page.goto(`chrome-extension://${extId}/reader.html?mode=${mode}&site=${encodeURIComponent(siteOrigin)}&job=${encodeURIComponent(jobOrigin)}&endpoint=${encodeURIComponent('http://localhost:8070')}`)
  const out = await page.waitForFunction(() => window.__poc, null, { timeout: 300000 }).then(h => h.jsonValue())
  await page.close()
  return { ...out, siteBytesMB: +(bytes / 1048576).toFixed(1), log: out.log ? out.log.slice(-160) : undefined }
}
console.log('first visit ', JSON.stringify(await visit('site')))
console.log('second visit', JSON.stringify(await visit('site')))
console.log('sandbox     ', JSON.stringify(await visit('sandbox')))
await context.close(); site.close(); job.close()
