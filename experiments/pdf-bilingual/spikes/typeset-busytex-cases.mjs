// experiments/pdf-bilingual/spikes/typeset-busytex-cases.mjs
// The typesetting rule's TeX under the reader's own compiler — BusyTeX in Chromium, its pdfTeX and its XeTeX — for the
// cases whose answer hangs on the LaTeX it ships: each page's columns as MARK_DEF reads them (latex-front.mjs), at the
// end of a revtex paper whose grid closes at \end{document} before its last pages go out. typeset-tex-cases.mjs is the
// native reference for the same documents. Needs the TeX Live package server (texlive-server, http://localhost:8070;
// ENDPOINT to change it), data/busytex-patched (README.md, setup) and Playwright's Chromium. One pass a document, no
// bibtex: marks and destinations are set as the pages go out. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-busytex-cases.mjs
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { MARK_DEF } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { marksOf } from '../../../src/pdf-reader/engine/typeset/places.mjs'

const { chromium } = createRequire(new URL('../../../', import.meta.url))('playwright')
const root = new URL('..', import.meta.url).pathname
const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:8070'
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' }

// the documents, as typeset-tex-cases.mjs has them: marked paragraphs, then references with no unit mark
const marked = (n, from = 0) => Array.from({ length: n }, (_, j) => j + from).map(k => `\\leavevmode\\axtmark{${k}s}\\lipsum[${k + 1}]\\par`).join('\n')
const bib = n => `\\begin{thebibliography}{99}${Array.from({ length: n }, (_, k) => `\\bibitem{b${k}} A. Author${k}, B. Writer, and C. Someone, A title of a paper that runs on for a while, Journal ${k} (2020) ${100 + k}.`).join('\n')}\\end{thebibliography}`
const refsLast = refs => `\\documentclass[aps,prb,twocolumn]{revtex4-2}\\usepackage{lipsum}\\begin{document}\\title{T}\\maketitle ${marked(14)}${bib(refs)}\\end{document}\n`
const oneEnd = `\\documentclass[twocolumn]{article}\\usepackage{lipsum}\\begin{document}${marked(14)}\\onecolumn ${marked(4, 20)}${bib(40)}\\end{document}\n`
const docs = ['pdflatex', 'xelatex'].flatMap(engine => [
  { name: `refs-${engine}`, engine, src: MARK_DEF + refsLast(90) },
  { name: `refs2-${engine}`, engine, src: MARK_DEF + refsLast(260) },
  { name: `end1-${engine}`, engine, src: MARK_DEF + oneEnd },
])

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  try {
    if (path === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><title>cases</title>') }
    const file = path.startsWith('/lib/') ? join(root, 'node_modules/texlyre-busytex/dist', path.slice(5)) : join(root, 'data/busytex-patched', path.slice(1))
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.end(readFileSync(file))
  } catch { res.statusCode = 404; res.end() }
}).listen(0)

/** in the page: each document compiled once, its PDF as base64 and its log's first error */
async function inPage({ endpoint, docs }) {
  const { BusyTexRunner, PdfLatex, XeLatex } = await import('/lib/index.js')
  const runner = new BusyTexRunner({ busytexBasePath: '/busytex', preloadDataPackages: ['/busytex/texlive-basic.js'] })
  await runner.initialize(true)
  const out = []
  for (const d of docs) {
    const Engine = d.engine === 'xelatex' ? XeLatex : PdfLatex
    const r = await new Engine(runner).compile({ input: d.src, mainTexPath: `${d.name}.tex`, additionalFiles: [], bibtex: false, rerun: false, remoteEndpoint: endpoint, verbose: 'silent' })
    let pdf = null
    if (r.pdf?.length) { let s = ''; for (let i = 0; i < r.pdf.length; i += 0x8000) s += String.fromCharCode(...r.pdf.subarray(i, i + 0x8000)); pdf = btoa(s) }
    out.push({ name: d.name, pdf, error: (String(r.log ?? '').match(/^! .*$/m)?.[0] ?? '').slice(0, 160) })
  }
  runner.terminate?.()
  return out
}

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const results = await page.evaluate(inPage, { endpoint: ENDPOINT, docs: docs.map(({ name, engine, src }) => ({ name, engine, src })) })
  const cols = {}
  for (const r of results) {
    if (!r.pdf) { cols[r.name] = `no PDF ${r.error}`; continue }
    const task = getDocument({ data: new Uint8Array(Buffer.from(r.pdf, 'base64')), verbosity: 0 })
    try { cols[r.name] = (await marksOf(await task.promise)).columns.join('') } finally { await task.destroy() }
  }
  for (const engine of ['pdflatex', 'xelatex']) {
    const one = cols[`refs-${engine}`], two = cols[`refs2-${engine}`], end = cols[`end1-${engine}`]
    check(`BusyTeX's ${engine}: the references alone on revtex's last page, or its last two, read two columns`, /^2{3,}$/.test(one) && /^2{4,}$/.test(two), JSON.stringify([one, two]))
    check(`BusyTeX's ${engine}: a document that ends in one column ends in one`, /^2+1+$/.test(end), end)
  }
} finally { await browser.close(); server.close() }
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
