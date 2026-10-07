// C0 in the browser: each unchanged source compiled by BusyTeX (TeX Live 2026) in headless Chromium, with the basic tier
// preloaded and every other file fetched on demand from the local package server (http://localhost:8070). Same main file,
// engine and .bbl rule as the native control. One fresh page per paper in one browser context (so the 93 MB basic tier is
// cached as it would be for a returning reader). Sequential, so the renderer's peak memory can be sampled.
// Output: out/c0-browser.json, compiled PDFs in data/runs/browser/<id>.pdf
//   node spikes/c0-browser.mjs [id ...]
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { analyze } from './paper-meta.mjs'
const require = createRequire(new URL('../../../', import.meta.url))
const { chromium } = require('playwright')

const root = new URL('..', import.meta.url).pathname
const ENDPOINT = process.env.ENDPOINT ?? 'http://localhost:8070'
const LIMIT_MS = 300000
const only = process.argv.slice(2)
// DIRS=a,b,c compiles those folders instead of the corpus (minimal reproductions)
const corpus = process.env.DIRS ? process.env.DIRS.split(',').map(d => ({ id: d.split('/').filter(Boolean).slice(-2).join('/'), dir: d, kind: 'tar' })) : JSON.parse(readFileSync(join(root, 'out/corpus.json'), 'utf8')).filter(r => (r.kind === 'tar' || r.kind === 'single') && (!only.length || only.includes(r.id)))
const outFile = join(root, process.env.OUT ?? 'out/c0-browser.json')
const results = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : []
const done = new Set(results.map(r => r.id))
const PDF_DIR = process.env.PDF_DIR ?? join(root, 'data/runs/browser')
mkdirSync(PDF_DIR, { recursive: true })
const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' }
const pages = pdf => { try { return Number(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }).match(/^Pages:\s+(\d+)/m)?.[1]) } catch { return null } }

let current = null // { dir, files }
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0])
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  try {
    if (path === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><title>c0</title>') }
    if (path === '/job.json') return res.end(JSON.stringify(current))
    if (path.startsWith('/extra/')) return res.end(readFileSync(join(process.env.EXTRA_DIR, path.slice(7))))
    const file = path.startsWith('/lib/') ? join(root, 'node_modules/texlyre-busytex/dist', path.slice(5)) : path.startsWith('/src/') ? join(current.dir, path.slice(5)) : join(root, process.env.SITE ?? 'data/busytex-site', path.slice(1))
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.end(readFileSync(file))
  } catch { res.statusCode = 404; res.end() }
}).listen(0)
const origin = `http://localhost:${server.address().port}`

// the compile, run inside the page
async function compileInPage(endpoint) {
  const { BusyTexRunner, PdfLatex, XeLatex, LuaLatex } = await import('/lib/index.js')
  const job = await (await fetch('/job.json')).json()
  const out = { isolated: self.crossOriginIsolated }
  try {
    const t0 = performance.now()
    const runner = new BusyTexRunner({ busytexBasePath: '/busytex', preloadDataPackages: job.preload })
    await runner.initialize(true)
    out.initMs = Math.round(performance.now() - t0)
    const read = async p => new Uint8Array(await (await fetch('/src/' + p.split('/').map(encodeURIComponent).join('/'))).arrayBuffer())
    const additionalFiles = await Promise.all(job.files.filter(p => p !== job.main).map(async path => ({ path, content: await read(path) })))
    for (const x of job.extra ?? []) additionalFiles.push({ path: x, content: new Uint8Array(await (await fetch('/extra/' + x)).arrayBuffer()) })
    const input = await read(job.main) // bytes: a decoded string would be encoded again as UTF-8 on the way in
    const Engine = { xelatex: XeLatex, lualatex: LuaLatex }[job.compiler] ?? PdfLatex
    const t1 = performance.now()
    const r = await new Engine(runner).compile({ input, mainTexPath: job.main, additionalFiles, bibtex: job.bbl ? false : null, rerun: true, remoteEndpoint: endpoint, verbose: 'silent' })
    out.compileMs = Math.round(performance.now() - t1)
    out.success = r.success; out.exitCode = r.exitCode
    const log = String(r.log ?? '')
    out.firstError = (log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? '').slice(0, 200)
    out.missing = [...new Set([...log.matchAll(/File `([^']+)' not found/g)].map(m => m[1]))].slice(0, 5)
    out.logTail = log.slice(-1500)
    out.fullLog = log
    out.steps = JSON.stringify((r.logs ?? []).map(l => ({ cmd: l.cmd, exit: l.exit_code, aux: String(l.aux ?? '').slice(0, 20000), log: String(l.log ?? '').slice(-3000) })))
    if (r.pdf) { let s = ''; for (let i = 0; i < r.pdf.length; i += 0x8000) s += String.fromCharCode(...r.pdf.subarray(i, i + 0x8000)); out.pdf = btoa(s) }
    runner.terminate?.()
  } catch (e) { out.error = String(e?.stack ?? e).slice(0, 500) }
  return out
}

// peak RSS of this Playwright Chromium's renderer processes, sampled every 500 ms
function rendererRssMB() {
  try {
    const ps = execFileSync('ps', ['-axo', 'rss=,command='], { encoding: 'utf8', maxBuffer: 1 << 24 })
    return Math.round(ps.split('\n').filter(l => l.includes('ms-playwright') && l.includes('--type=renderer')).reduce((a, l) => a + Number(l.trim().split(/\s+/)[0]), 0) / 1024)
  } catch { return null }
}

const browser = await chromium.launch()
const context = await browser.newContext()
let remote = { n: 0, bytes: 0, miss: 0 }
context.on('requestfinished', async req => {
  if (!req.url().startsWith(ENDPOINT)) return
  const resp = await req.response()
  remote.n++
  if (resp?.status() !== 200) remote.miss++
  else remote.bytes += Number((await resp.allHeaders())['content-length'] ?? 0)
})

for (const row of corpus) {
  if (done.has(row.id)) continue
  const dir = row.dir ?? join(root, 'data/corpus', row.id, 'src')
  // a prepared variant says itself what to compile and how (spikes/c1-prepare.mjs)
  const job = existsSync(join(dir, '.axt-job.json')) ? JSON.parse(readFileSync(join(dir, '.axt-job.json'), 'utf8')) : null
  const meta = job ? { main: job.main, compiler: job.engine, documentclass: job.documentclass, bbl: job.bbl } : analyze(dir)
  const r = { id: row.id, main: meta.main, compiler: meta.compiler, documentclass: meta.documentclass, bbl: meta.bbl }
  if (!meta.main) { r.result = 'no-main'; results.push(r); continue }
  current = { extra: process.env.EXTRA_DIR ? readdirSync(process.env.EXTRA_DIR) : [], preload: (process.env.PRELOAD ?? '/busytex/texlive-basic.js').split(','), dir, main: meta.main, compiler: meta.compiler, bbl: meta.bbl, files: walk(dir).map(p => relative(dir, p)).filter(p => !p.endsWith('00README.json') && !p.endsWith('.axt-job.json')) }
  remote = { n: 0, bytes: 0, miss: 0 }
  const page = await context.newPage()
  let peak = 0
  const sampler = setInterval(() => { const m = rendererRssMB(); if (m > peak) peak = m }, 500)
  try {
    await page.goto(origin + '/')
    let timer
    const res = await Promise.race([page.evaluate(compileInPage, ENDPOINT), new Promise(r => { timer = setTimeout(() => r({ error: 'timeout' }), LIMIT_MS) })])
    clearTimeout(timer) // a pending timer kept the process alive for five minutes after the last paper
    Object.assign(r, res)
  } catch (e) { r.error = String(e).slice(0, 300) }
  clearInterval(sampler)
  await page.close().catch(() => undefined)
  r.peakRendererMB = peak
  r.remote = remote
  if (r.steps) { writeFileSync(join(PDF_DIR, `${row.id.replace('/', '__')}.steps.json`), r.steps); delete r.steps }
  if (r.fullLog) { writeFileSync(join(PDF_DIR, `${row.id.replace('/', '__')}.log`), r.fullLog); delete r.fullLog }
  if (r.pdf) { const p = join(PDF_DIR, `${row.id.replace('/', '__')}.pdf`); writeFileSync(p, Buffer.from(r.pdf, 'base64')); delete r.pdf; r.pages = pages(p) }
  r.arxivPages = pages(join(root, 'data/corpus', row.id, 'arxiv.pdf'))
  r.result = r.error === 'timeout' ? 'timeout' : r.pages == null ? 'no-pdf' : r.arxivPages && Math.abs(r.pages - r.arxivPages) <= 1 ? 'pass' : 'pages-differ'
  results.push(r)
  writeFileSync(outFile, JSON.stringify(results, null, 1))
  console.log(`${r.id} ${r.result} ${r.compiler} ${r.documentclass} pages=${r.pages}/${r.arxivPages} init=${r.initMs} compile=${r.compileMs} remote=${remote.n}/${Math.round(remote.bytes / 1024)}KB peak=${peak}MB ${r.firstError ?? r.error ?? ''}`.slice(0, 260))
}
await browser.close(); server.close()
