// Spike B: does BusyTeX compile a real arXiv paper in a real Chromium, unchanged and with ctex and Chinese text put in?
// Serves the assets, the wrapper and the paper's source from disk; records time, bytes fetched, success and the log's tail.
//   node spikes/busytex.mjs <source dir> <main.tex> <variant: original | zh-xelatex | zh-pdflatex> [data packages, comma separated]
import { createServer } from 'node:http'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../', import.meta.url))
const { chromium } = require('playwright')

const [srcDir, mainTex, variant = 'original', packages = ''] = process.argv.slice(2)
const root = new URL('..', import.meta.url).pathname
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' }
const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })

let tex = readFileSync(join(srcDir, mainTex), 'utf8')
if (variant !== 'original') {
  // what a translated source would carry at the least: a CJK package after the class line, and Chinese in the body
  tex = tex.replace(/(\\documentclass(\[[^\]]*\])?\{[^}]*\})/, variant === 'zh-xelatex' ? '$1\n\\usepackage[fontset=fandol]{ctex}' : '$1\n\\usepackage{CJKutf8}')
  const zh = '本文提出一种计算高阶混合导数的方法，并在若干偏微分方程上验证其精度与效率。'
  tex = tex.replace(/\\begin\{abstract\}/, variant === 'zh-xelatex' ? `\\begin{abstract}\n${zh}\n\n` : `\\begin{abstract}\n\\begin{CJK}{UTF8}{gbsn}${zh}\\end{CJK}\n\n`)
}
const files = walk(srcDir).filter(p => p !== join(srcDir, mainTex) && !p.endsWith('00README.json')).map(p => p.slice(srcDir.length + 1))

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  try {
    if (path === '/') { res.setHeader('content-type', 'text/html'); return res.end('<script type=module src=/harness.js></script>') }
    if (path === '/main.tex') return res.end(tex)
    if (path === '/files.json') return res.end(JSON.stringify(files))
    if (path === '/harness.js') { res.setHeader('content-type', 'text/javascript'); return res.end(HARNESS) }
    const file = path.startsWith('/lib/') ? join(root, 'node_modules/texlyre-busytex/dist', path.slice(5)) : path.startsWith('/src/') ? join(srcDir, path.slice(5)) : join(root, 'data/busytex-site', path.slice(1))
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.end(readFileSync(file))
  } catch { res.statusCode = 404; res.end() }
}).listen(0)

const HARNESS = `
import { BusyTexRunner, PdfLatex, XeLatex } from '/lib/index.js'
const out = { variant: ${JSON.stringify(variant)}, isolated: self.crossOriginIsolated }
try {
  const t0 = performance.now()
  const pk = ${JSON.stringify(packages.split(',').filter(Boolean))}
  const runner = new BusyTexRunner({ busytexBasePath: '/busytex', verbose: false, ...(pk.length ? { preloadDataPackages: pk } : {}) })
  await runner.initialize(true)
  out.initMs = Math.round(performance.now() - t0)
  const names = await (await fetch('/files.json')).json()
  const additionalFiles = await Promise.all(names.map(async path => ({ path, content: new Uint8Array(await (await fetch('/src/' + path)).arrayBuffer()) })))
  const engine = ${JSON.stringify(variant)} === 'zh-xelatex' ? new XeLatex(runner) : new PdfLatex(runner)
  const t1 = performance.now()
  const r = await engine.compile({ input: await (await fetch('/main.tex')).text(), additionalFiles, rerun: true, verbose: 'silent' })
  out.compileMs = Math.round(performance.now() - t1)
  out.success = r.success; out.exitCode = r.exitCode; out.pdfBytes = r.pdf?.length ?? 0
  out.fullLog = String(r.log ?? '').slice(-6000)
  out.logTail = String(r.log ?? '').split('\\n').filter(l => /^!|Error|error:|not found|Missing|Output written|No pages/.test(l)).slice(-14)
  if (r.pdf) { let s = ''; for (const b of r.pdf) s += String.fromCharCode(b); out.pdfBase64 = btoa(s) }
  out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
} catch (e) { out.error = String(e?.stack ?? e).slice(0, 600) }
window.__result = out
`

const browser = await chromium.launch()
const page = await browser.newPage()
let fetched = 0; const big = []
page.on('response', async r => { const n = Number(r.headers()['content-length'] ?? 0); fetched += n; if (n > 3e6) big.push(r.url().split('/').pop() + ' ' + Math.round(n / 1048576) + 'MB') })
page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)))
await page.goto(`http://localhost:${server.address().port}/`)
await page.waitForFunction(() => window.__result, null, { timeout: 900000 })
const result = await page.evaluate(() => window.__result)
if (result.fullLog) { writeFileSync(join(root, `out/busytex-${variant}.log`), result.fullLog); delete result.fullLog }
if (result.pdfBase64) { writeFileSync(join(root, `out/busytex-${variant}.pdf`), Buffer.from(result.pdfBase64, 'base64')); delete result.pdfBase64 }
console.log(JSON.stringify({ ...result, fetchedMB: Math.round(fetched / 1048576), bigFiles: big }, null, 1))
await browser.close(); server.close()
