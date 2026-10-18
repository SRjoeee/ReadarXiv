// One BusyTeX instance through a long reading session: a few hundred small compiles in one worker, pdfLaTeX and
// XeLaTeX in turn, as one TeX page runs them. Fails when a compile fails or when a file a compile opened is still open
// in the worker's file system after it (each such file holds a descriptor until the instance has none left: "No file
// descriptors available" after about 160 compiles, found by the XeLaTeX-under-BusyTeX investigation, 2026-10-01).
//   node experiments/pdf-bilingual/tex-page/fd-check.mjs [--n=300] [--pipeline=<busytex_pipeline.js>]
// The pipeline checked defaults to the one tex-page/build.mjs built (out/tex-site); give data/busytex-patched's to
// check today's. BusyTeX's other files are data/busytex-patched's; texlive-server on :8070 serves the tree.
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join } from 'node:path'

const EXP = new URL('..', import.meta.url).pathname
const { chromium } = createRequire(new URL('../../../', import.meta.url).pathname)('playwright')
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const N = Number(arg('n', '300'))
const built = existsSync(join(EXP, 'out/tex-site/e')) ? readdirSync(join(EXP, 'out/tex-site/e')).map(d => join(EXP, 'out/tex-site/e', d, 'busytex_pipeline.js')).find(existsSync) : null
const PIPELINE = arg('pipeline', built)
if (!PIPELINE) throw new Error('no pipeline to check: node tex-page/build.mjs, or --pipeline=<file>')
// after each compile, the worker says which of its file system's streams are open
const REPORT = `
;(() => { const c = BusytexPipeline.prototype.compile; BusytexPipeline.prototype.compile = async function (...a) { const r = await c.apply(this, a); const M = await this.Module; postMessage({ open: M.FS.streams.map((s, fd) => (s ? fd + ' ' + s.path : null)).filter(Boolean) }); return r } })()
`
const TYPES = { '.js': 'text/javascript', '.wasm': 'application/wasm' }
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><title>fd-check</title>') }
  res.setHeader('cache-control', 'max-age=86400')
  if (p === '/busytex/busytex_worker.js') { res.setHeader('content-type', TYPES['.js']); return res.end(readFileSync(join(EXP, 'data/busytex-patched/busytex/busytex_worker.js'), 'utf8') + REPORT) }
  const f = p === '/busytex/busytex_pipeline.js' ? PIPELINE : p.startsWith('/lib/') ? join(EXP, 'node_modules/texlyre-busytex/dist', p.slice(5)) : p.startsWith('/busytex/') ? join(EXP, 'data/busytex-patched', p.slice(1)) : null
  if (!f || !existsSync(f)) { res.statusCode = 404; return res.end() }
  res.setHeader('content-type', TYPES[extname(f)] ?? 'application/octet-stream')
  res.end(readFileSync(f))
}).listen(0, '127.0.0.1')
await new Promise(r => server.on('listening', r))
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${server.address().port}/`)
const t0 = Date.now()
const r = await page.evaluate(async n => {
  const { BusyTexRunner, PdfLatex, XeLatex } = await import('/lib/index.js')
  const runner = new BusyTexRunner({ busytexBasePath: '/busytex', preloadDataPackages: ['/busytex/texlive-basic.js'] })
  await runner.initialize(true)
  let open = []
  runner.worker.addEventListener('message', e => { if (e.data?.open) open = e.data.open })
  const doc = new TextEncoder().encode('\\documentclass{article}\\begin{document}A page, $x^2$, \\textbf{bold}.\\end{document}\n')
  const out = { failed: [], leaked: [], most: 0 }
  for (let i = 0; i < n; i++) {
    const Engine = i % 2 ? XeLatex : PdfLatex
    try {
      const c = await new Engine(runner).compile({ input: doc, mainTexPath: 'main.tex', rerun: i % 3 === 0, bibtex: false, verbose: 'silent', remoteEndpoint: 'http://localhost:8070' })
      if (!c.pdf?.byteLength) out.failed.push([i, String(c.log).match(/^! .*$/m)?.[0] ?? String(c.log).slice(-200)])
    } catch (e) { out.failed.push([i, String(e.message).slice(0, 200)]) }
    out.most = Math.max(out.most, open.length)
    const extra = open.filter(s => !/^[012] /.test(s))
    if (extra.length && out.leaked.length < 3) out.leaked.push([i, extra.slice(-4)])
    if (out.failed.length > 3) break
  }
  out.compiles = n
  return out
}, N)
const ok = !r.failed.length && !r.leaked.length
console.log(`${PIPELINE}\n${r.compiles} compiles in one instance, ${Math.round((Date.now() - t0) / 1000)} s: ${r.failed.length} failed, at most ${r.most} streams open after a compile${r.leaked.length ? `; left open: ${JSON.stringify(r.leaked)}` : ''}${r.failed.length ? `; failures: ${JSON.stringify(r.failed)}` : ''}`)
console.log(ok ? 'PASS' : 'FAIL')
await browser.close()
server.close()
process.exit(ok ? 0 : 1)
