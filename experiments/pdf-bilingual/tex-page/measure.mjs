// Stage 3 (S3a): the TeX page measured on the corpus, through the page itself. Each paper's compiles are the ones the
// live reader asks for — the font probe, the marked original, a translation's first preview (the first 2,500
// characters translated, as live.mjs's first batch) and its final — built with the reader's own pipeline functions
// (pseudo-translations, as the research's harness), and sent to the TeX page framed by an extension page
// (host/: the page accepts extension pages only), as session.mjs openCompiler does.
//
//   record    today's page (poc-site at a7a2a056, BusyTeX's full basic tier, texlive-server on :8070 behind a logging
//             proxy), a fresh frame — a fresh worker — for each compile, so that every compile's files are its own:
//             which files of the preloaded tier each compile stats or opens, which it asks the file server for, and
//             its PDF. The input of build.mjs's slim preloads and manifests (derive.mjs)
//   identity  `--page=old|new`, one frame for each paper (a visit, as the reader has it): every compile's PDF and
//             outcome, to compare with compare.mjs. The new page is the build in out/tex-site (build.mjs)
// Both fix the PDFs' dates (SOURCE_DATE_EPOCH, FORCE_SOURCE_DATE: a snippet appended to the worker this harness
// serves, the same for both pages), so that the same input gives the same bytes.
//
//   pnpm exec tsx experiments/pdf-bilingual/tex-page/measure.mjs --mode=record [--papers=a,b|--limit=n] [--out=name]
//   pnpm exec tsx experiments/pdf-bilingual/tex-page/measure.mjs --mode=identity --page=new [--out=name]
// Options: --jobs=probe,orig,de-prev,... (default below), --fontpapers=n (the first n papers also run the other CJK
// scripts' first previews, for the font manifests), --resume (skip papers already done in that run).
// Compiles: at most 2 at a time, 1 while the machine's load is above 12. Output: out/tex-measure/<name>/ (jobs.jsonl,
// papers.jsonl, requests.jsonl, opened.jsonl, pdf/). Needs: `node setup.mjs`, texlive-server on :8070 (record, and
// identity of the old page), `node tex-page/build.mjs` (the new page), Playwright's Chromium.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { loadavg, tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { corpus, hintsFor, paperJobs, TODAY } from './jobs.mjs'

const EXP = new URL('..', import.meta.url).pathname
const REPO = new URL('../../../', import.meta.url).pathname
const { chromium } = createRequire(REPO)('playwright')
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const flag = name => process.argv.includes(`--${name}`)

const MODE = arg('mode', 'record')
const PAGE = MODE === 'record' ? 'old' : arg('page', 'new')
const OUT = join(EXP, 'out/tex-measure', arg('out', `${MODE}-${PAGE}`))
const SITE = join(EXP, 'out/tex-site')
const FILESERVER = 'http://localhost:8070'
const JOBS = arg('jobs', 'probe,orig,de-prev,de-final,zh-prev,zh-final,zhc-prev').split(',')
const FONT_JOBS = ['zht-prev', 'ja-prev', 'ko-prev']
const FONT_PAPERS = Number(arg('fontpapers', '12'))
/** the PDFs' dates, fixed (2026-01-01) */
const EPOCH = '1767225600'

mkdirSync(join(OUT, 'pdf'), { recursive: true })
const log = (file, row) => appendFileSync(join(OUT, file), `${JSON.stringify(row)}\n`)
const sha = b => createHash('sha256').update(b).digest('hex')

// ---------------------------------------------------------------- the server: the page under test, the jobs' files

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json', '.txt': 'text/plain' }
/** appended to the worker served: fixed dates, and (for a recorded job) the preloaded files a compile stats or opens */
const SNIPPET = `
;(() => {
  // [measure.mjs] fixed dates; for a recorded compile (an endpoint .../j/<tag>), the preloaded files it stats or opens
  const P = BusytexPipeline.prototype, seen = new Set()
  let tag = null
  const reload = P.reload_module
  P.reload_module = async function (env, ...rest) {
    const M = await reload.call(this, { ...env, SOURCE_DATE_EPOCH: '${EPOCH}', FORCE_SOURCE_DATE: '1' }, ...rest)
    const FS = M.FS, open = FS.open, stat = FS.stat
    const note = path => { if (tag && typeof path === 'string' && (path.startsWith('/texlive/') || path.startsWith('/etc/'))) seen.add(path) }
    FS.open = function (path, ...r) { const s = open.call(this, path, ...r); note(path); return s }
    FS.stat = function (path, ...r) { const s = stat.call(this, path, ...r); if (FS.isFile(s.mode)) note(path); return s }
    return M
  }
  const compile = P.compile
  P.compile = async function (...a) {
    tag = (/\\/j\\/([^/]+)/.exec(a[9] || '') || [])[1] || null
    seen.clear()
    try { return await compile.apply(this, a) } finally {
      if (tag) { const x = new XMLHttpRequest(); x.open('POST', '/measure/opened?tag=' + tag, false); x.send(JSON.stringify([...seen])) }
    }
  }
})()
`
// today's page, as it was at TODAY
const todayDir = join(EXP, 'out/tex-today')
if (PAGE === 'old') {
  mkdirSync(todayDir, { recursive: true })
  for (const f of ['tex.html', 'tex.js']) writeFileSync(join(todayDir, f), execFileSync('git', ['show', `${TODAY}:experiments/pdf-bilingual/poc-site/${f}`], { cwd: REPO }))
}
const EXTRA = join(EXP, 'data/pk-flat')

const visits = new Map() // vid → { files: Map, compiles: Map tag → job }
const requestsSeen = [] // the new page's tree requests: [t, path, bytes]
function siteFile(path) {
  if (PAGE === 'old') {
    if (path === '/busytex/busytex_worker.js') return { body: readFileSync(join(EXP, 'data/busytex-patched/busytex/busytex_worker.js'), 'utf8') + SNIPPET, type: TYPES['.js'] }
    const file = path.startsWith('/lib/') ? join(EXP, 'node_modules/texlyre-busytex/dist', path.slice(5)) : path.startsWith('/busytex/') ? join(EXP, 'data/busytex-patched', path.slice(1)) : path.startsWith('/extra/') ? join(EXTRA, path.slice(7)) : join(todayDir, path.slice(1))
    return existsSync(file) ? { body: readFileSync(file), type: TYPES[extname(file)] ?? 'application/octet-stream' } : null
  }
  const file = join(SITE, path.slice(1))
  if (!file.startsWith(SITE) || !existsSync(file)) return null
  if (path.endsWith('/busytex_worker.js')) return { body: readFileSync(file, 'utf8') + SNIPPET, type: TYPES['.js'] }
  return { body: readFileSync(file), type: TYPES[extname(file)] ?? 'application/octet-stream' }
}
let root = null
const treeRoot = () => (root ??= JSON.parse(readFileSync(join(SITE, 'tree.json'), 'utf8')).root)

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const path = decodeURIComponent(url.pathname)
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', '*')
  if (req.method === 'OPTIONS') return res.end()
  const body = async () => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks) }
  try {
    let m
    if (path === '/extra/list.json' && PAGE === 'old') return res.end(JSON.stringify(existsSync(EXTRA) ? readdirSync(EXTRA) : []))
    if (path === '/measure/opened') { log('opened.jsonl', { tag: url.searchParams.get('tag'), files: JSON.parse(String(await body())) }); return res.end('ok') }
    if (path === '/measure/pdf') { const b = await body(); writeFileSync(join(OUT, 'pdf', `${url.searchParams.get('tag').replace('~', '__')}.pdf`), b); return res.end(sha(b)) }
    if ((m = /^\/visit\/([^/]+)\.json$/.exec(path))) {
      const v = visits.get(m[1])
      return res.end(JSON.stringify({ project: [...v.files.keys()], compiles: [...v.compiles].map(([tag, j]) => ({ tag, main: j.main, engine: j.engine, rerun: j.rerun, bibtex: j.bibtex, overrides: [...j.overrides.keys()] })) }))
    }
    if ((m = /^\/visit\/([^/]+)\/p\/(.+)$/.exec(path))) return res.end(visits.get(m[1]).files.get(m[2]))
    if ((m = /^\/visit\/([^/]+)\/o\/([^/]+)\/(.+)$/.exec(path))) return res.end(visits.get(m[1]).compiles.get(m[2]).overrides.get(m[3]))
    // today's file server, behind a logging proxy: the compile's tag in the address (record mode)
    if ((m = /^\/tl\/j\/([^/]+)\/(\d+)\/(.+)$/.exec(url.pathname))) {
      const [, tag, fmt, raw] = m, name = decodeURIComponent(raw), t = Date.now()
      const r = await fetch(`${FILESERVER}/${fmt}/${encodeURIComponent(name)}`)
      const b = Buffer.from(await r.arrayBuffer())
      log('requests.jsonl', { tag: decodeURIComponent(tag), fmt: Number(fmt), name, status: r.status, bytes: r.status === 200 ? b.length : 0, fileid: r.headers.get('fileid'), ms: Date.now() - t })
      res.statusCode = r.status
      res.setHeader('content-type', 'application/octet-stream')
      return res.end(r.status === 200 ? b : '')
    }
    // the new page's tree
    if (PAGE === 'new' && (m = /^\/t\/([^/]+)\/(.+)$/.exec(path)) && !existsSync(join(SITE, path.slice(1)))) {
      const file = join(treeRoot(), m[2])
      if (!existsSync(file)) { res.statusCode = 404; return res.end() }
      const b = readFileSync(file)
      requestsSeen.push([Date.now(), m[2], b.length])
      res.setHeader('content-type', 'application/octet-stream')
      res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      return res.end(b)
    }
    const f = siteFile(path)
    if (!f) { res.statusCode = 404; return res.end() }
    res.setHeader('content-type', f.type)
    res.setHeader('cache-control', 'public, max-age=86400')
    res.end(f.body)
  } catch (e) { res.statusCode = 500; res.end(String(e?.stack ?? e)) }
}).listen(0, '127.0.0.1')
await new Promise(r => server.on('listening', r))
const ORIGIN = `http://127.0.0.1:${server.address().port}`

// ---------------------------------------------------------------- the browser: the host extension, two tabs

const HOST = new URL('./host', import.meta.url).pathname
const profile = mkdtempSync(join(tmpdir(), 'tex-measure-'))
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${HOST}`, `--load-extension=${HOST}`] })
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
const hostUrl = `chrome-extension://${new URL(sw.url()).host}/host.html`

let running = 0
const limit = () => (loadavg()[0] > 12 ? 1 : 2)
async function slot() { for (;;) { if (running < limit()) { running++; return } await new Promise(r => setTimeout(r, 2000)) } }

/**
 * One visit in a tab: frame the page, init, the project, then each compile in turn. → { readyMs, initMs, init, results }
 * The compiles take a slot each (the init one too: it is CPU work)
 */
async function visit(tab, vid, init) {
  await slot()
  let out
  try {
    out = await tab.evaluate(async ({ url, init, harness, vid }) => {
      const h = window.texHost
      const t0 = performance.now()
      const ready = await h.open(url)
      const readyMs = performance.now() - t0
      h.send(init)
      const done = await h.wait(d => d?.type === 'init-done', 600000)
      const initMs = performance.now() - t0
      const v = await (await fetch(`${harness}/visit/${vid}.json`)).json()
      const get = async p => new Uint8Array(await (await fetch(`${harness}/${p.split('/').map(encodeURIComponent).join('/')}`)).arrayBuffer())
      const project = await Promise.all(v.project.map(async path => ({ path, content: await get(`visit/${vid}/p/${path}`) })))
      h.send({ type: 'project', key: vid, files: project })
      return { ready, readyMs, initMs, init: done, compiles: v.compiles }
    }, { url: `${ORIGIN}/tex.html`, init, harness: ORIGIN, vid })
  } finally { running-- }
  out.results = []
  for (const c of out.compiles) {
    await slot()
    try {
      const r = await tab.evaluate(async ({ c, harness, vid }) => {
        const h = window.texHost
        const get = async p => new Uint8Array(await (await fetch(`${harness}/${p.split('/').map(encodeURIComponent).join('/')}`)).arrayBuffer())
        const overrides = await Promise.all(c.overrides.map(async path => ({ path, content: await get(`visit/${vid}/o/${c.tag}/${path}`) })))
        const id = h.seen.filter(s => s.type === 'compiled').length + 1
        const t0 = performance.now()
        h.send({ type: 'compile', id, key: vid, main: c.main, engine: c.engine, rerun: c.rerun, bibtex: c.bibtex, overrides })
        const r = await h.wait(d => d?.type === 'compiled' && d.id === id, 600000)
        const wallMs = performance.now() - t0
        let pdfSha = null
        if (r.pdf) pdfSha = await (await fetch(`${harness}/measure/pdf?tag=${encodeURIComponent(c.tag)}`, { method: 'POST', body: r.pdf })).text()
        const log = String(r.log ?? '')
        return { tag: c.tag, ok: r.ok, ms: r.ms, wallMs, pdfBytes: r.pdf?.byteLength ?? 0, pdfSha, network: r.network, error: r.error, log: c.tag.endsWith('~probe') ? log : null, firstError: log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0]?.slice(0, 200) ?? null, logTail: r.ok ? null : log.slice(-1500) }
      }, { c, harness: ORIGIN, vid })
      out.results.push(r)
    } finally { running-- }
  }
  await tab.evaluate(() => window.texHost.close())
  return out
}

// ---------------------------------------------------------------- the runs

const done = new Set(flag('resume') && existsSync(join(OUT, 'papers.jsonl')) ? readFileSync(join(OUT, 'papers.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l).id) : [])
const all = corpus()
const chosen = arg('papers', '') ? arg('papers', '').split(',') : all.slice(0, Number(arg('limit', all.length)))
const recorded = MODE === 'identity' ? new Map(readFileSync(join(EXP, 'out/tex-measure', arg('fonts', 'record-old'), 'papers.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(p => [p.id, p.fonts])) : null

const initFor = (meta, names) => (PAGE === 'old' ? { type: 'init', endpoint: FILESERVER } : hintsFor(meta, names))

async function recordPaper(tab, id, index) {
  const names = [...JOBS, ...(index < FONT_PAPERS ? FONT_JOBS : [])]
  const probeOnly = await paperJobs(id, ['probe'], null)
  if (!probeOnly) { log('papers.jsonl', { id, skipped: 'no LaTeX source' }); return }
  // a fresh frame for each compile: the probe first, whose log names the fonts the translations need
  const one = async (tag, job, files) => {
    const vid = `${tag}`
    visits.set(vid, { files, compiles: new Map([[tag, job]]) })
    const load = loadavg()[0]
    const v = await visit(tab, vid, { type: 'init', endpoint: `${ORIGIN}/tl/j/${encodeURIComponent(tag)}` }).catch(e => ({ error: String(e?.message ?? e).slice(0, 300), results: [] }))
    visits.delete(vid)
    const r = v.results[0] ?? { tag, ok: false, error: v.error }
    const { log: lg, ...rest } = r
    log('jobs.jsonl', { ...rest, paper: id, job: job.job, engine: job.engine, script: job.script ?? null, rerun: job.rerun, bibtex: job.bibtex, initMs: v.initMs, load: +load.toFixed(1) })
    console.log(`${tag} ${r.ok ? 'ok' : 'FAIL'} ${r.ms ?? '-'} ms load ${load.toFixed(1)} ${r.firstError ?? r.error ?? ''}`)
    return lg
  }
  const [probeTag, probe] = [...probeOnly.jobs][0]
  const probeLog = await one(probeTag, probe, probeOnly.files)
  const fonts = readFontProbe(probeLog ?? '')
  const p = await paperJobs(id, names.filter(n => n !== 'probe'), fonts)
  for (const [tag, job] of p.jobs) await one(tag, job, p.files)
  for (const n of names) if (n !== 'probe' && !p.jobs.has(`${id}~${n}`)) log('jobs.jsonl', { tag: `${id}~${n}`, paper: id, job: n, skipped: 'no such strategy' })
  log('papers.jsonl', { id, compiler: p.meta.compiler, documentclass: p.meta.documentclass, bbl: !!p.meta.bbl, units: p.units, files: p.files.size, fonts })
}

async function identityPaper(tab, id, index) {
  const names = [...JOBS, ...(index < FONT_PAPERS ? FONT_JOBS : [])]
  if (!recorded.has(id)) { log('papers.jsonl', { id, skipped: 'not in the record run' }); return }
  const p = await paperJobs(id, names, recorded.get(id))
  if (!p) { log('papers.jsonl', { id, skipped: 'no LaTeX source' }); return }
  const vid = id
  visits.set(vid, { files: p.files, compiles: p.jobs })
  const load = loadavg()[0]
  const t0 = Date.now()
  const v = await visit(tab, vid, initFor(p.meta, names)).catch(e => ({ error: String(e?.message ?? e).slice(0, 300), results: [] }))
  visits.delete(vid)
  for (const r of v.results) {
    const job = p.jobs.get(r.tag)
    const { log: lg, ...rest } = r
    log('jobs.jsonl', { ...rest, paper: id, job: job.job, engine: job.engine, script: job.script ?? null, load: +load.toFixed(1) })
    console.log(`${r.tag} ${r.ok ? 'ok' : 'FAIL'} ${r.ms} ms ${r.firstError ?? r.error ?? ''}${r.network?.length ? ` network ${r.network}` : ''}`)
  }
  log('papers.jsonl', { id, compiler: p.meta.compiler, initMs: v.initMs, init: v.init, error: v.error, wallMs: Date.now() - t0, load: +load.toFixed(1) })
}

const t0 = Date.now()
const queue = chosen.map((id, i) => [id, all.indexOf(id)]).filter(([id]) => !done.has(id))
const tabs = await Promise.all([0, 1].map(async () => { const t = await context.newPage(); await t.goto(hostUrl); return t }))
await Promise.all(tabs.map(async tab => {
  while (queue.length) {
    const [id, index] = queue.shift()
    await (MODE === 'record' ? recordPaper : identityPaper)(tab, id, index).catch(e => { console.log(id, 'harness error', e.stack); log('papers.jsonl', { id, error: String(e.message).slice(0, 300) }) })
  }
}))
if (PAGE === 'new') writeFileSync(join(OUT, 'tree-requests.json'), JSON.stringify(requestsSeen))
console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s`)
await context.close()
rmSync(profile, { recursive: true, force: true })
server.close()
