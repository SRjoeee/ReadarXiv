// Stage 3 (S3a): the time to a translation's first preview, today's TeX page against the new one, over slow links.
// A visit is what the live reader does up to its first preview: frame the page, init, hand over the paper, compile
// the font probe, then the first preview (live.mjs runLive; the translation is a pseudo-translation, ready at once).
// Each page is served by tex-page/serve.mjs over HTTP/2 with TLS, as a CDN would serve it — today's as it is served
// today (uncompressed, its tree as texlive-server answers it), the new one as built (brotli) — through a link that
// adds a round trip before every response and shares one rate among all bodies (serve.mjs `link`). A first visit
// starts from an empty browser profile; the revisit follows in the same profile, for the same paper.
// Measured: the time to the preview's `compiled`, the bytes sent, the requests, and the requests a compile waited
// for (the tree's files asked for while a compile ran: synchronous, so each costs a round trip).
//   pnpm exec tsx experiments/pdf-bilingual/tex-page/speed.mjs [--papers=2608.02163,2608.18090] [--langs=de,zh]
//     [--profiles=300/10,50/30,10/60,20/200] [--pages=old,new] [--out=name]
// Needs: tex-page/build.mjs's site, tex-page/measure.mjs's record run (the probes' fonts), Playwright's Chromium.
// Compiles one at a time. Output: out/tex-measure/<name>/speed.jsonl
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { loadavg, tmpdir } from 'node:os'
import { join } from 'node:path'
import { hintsFor, paperJobs, TODAY } from './jobs.mjs'
import { certificateSpki, serveTexSite } from './serve.mjs'

const EXP = new URL('..', import.meta.url).pathname
const REPO = new URL('../../../', import.meta.url).pathname
const { chromium } = createRequire(REPO)('playwright')
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const PAPERS = arg('papers', '2608.02163,2608.18090').split(',')
const LANGS = arg('langs', 'de,zh').split(',')
const PROFILES = arg('profiles', '300/10,50/30,10/60,20/200').split(',').map(p => { const [mbit, rtt] = p.split('/').map(Number); return { mbit, rtt, name: p } })
const PAGES = arg('pages', 'old,new').split(',')
const OUT = join(EXP, 'out/tex-measure', arg('out', 'speed'))
mkdirSync(OUT, { recursive: true })
const fontsOf = new Map(readFileSync(join(EXP, 'out/tex-measure', arg('fonts', 'record-old'), 'papers.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(p => [p.id, p.fonts]))

// today's page as it was at TODAY
mkdirSync(join(EXP, 'out/tex-today'), { recursive: true })
for (const f of ['tex.html', 'tex.js']) writeFileSync(join(EXP, 'out/tex-today', f), execFileSync('git', ['show', `${TODAY}:experiments/pdf-bilingual/poc-site/${f}`], { cwd: REPO }))

// the visits' files, from a server of their own (not throttled: the reader has them before it frames the page)
const visits = new Map()
const files = createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let m
  if ((m = /^\/visit\/([^/]+)\.json$/.exec(path))) {
    const v = visits.get(m[1])
    return res.end(JSON.stringify({ project: [...v.files.keys()], compiles: [...v.compiles].map(([tag, j]) => ({ tag, main: j.main, engine: j.engine, rerun: j.rerun, bibtex: j.bibtex, overrides: [...j.overrides.keys()] })) }))
  }
  if ((m = /^\/visit\/([^/]+)\/p\/(.+)$/.exec(path))) return res.end(visits.get(m[1]).files.get(m[2]))
  if ((m = /^\/visit\/([^/]+)\/o\/([^/]+)\/(.+)$/.exec(path))) return res.end(visits.get(m[1]).compiles.get(m[2]).overrides.get(m[3]))
  res.statusCode = 404
  res.end()
}).listen(0, '127.0.0.1')
await new Promise(r => files.on('listening', r))
const FILES = `http://127.0.0.1:${files.address().port}`

const link = { rtt: 0, mbit: 0 }
let served = []
const log = row => served.push(row)
const servers = {}
for (const page of PAGES) servers[page] = await serveTexSite({ tls: true, today: page === 'old', link, log })
const origin = page => `https://127.0.0.1:${servers[page].address().port}`

const HOST = new URL('./host', import.meta.url).pathname
async function browser() {
  const profile = mkdtempSync(join(tmpdir(), 'tex-speed-'))
  // the self-signed certificate trusted by its key, so that the browser caches as it would a CDN's responses
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--ignore-certificate-errors-spki-list=${certificateSpki()}`, `--disable-extensions-except=${HOST}`, `--load-extension=${HOST}`] })
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const tab = await context.newPage()
  await tab.goto(`chrome-extension://${new URL(sw.url()).host}/host.html`)
  return { context, tab, close: async () => { await context.close(); rmSync(profile, { recursive: true, force: true }) } }
}

/** one visit up to the first preview → { ms, init, probe, preview, ... } with wall-clock stamps for the server's log */
async function visit(tab, page, vid, init) {
  return tab.evaluate(async ({ url, init, files, vid }) => {
    const get = async p => new Uint8Array(await (await fetch(`${files}/${p.split('/').map(encodeURIComponent).join('/')}`)).arrayBuffer())
    const v = await (await fetch(`${files}/visit/${vid}.json`)).json()
    const project = await Promise.all(v.project.map(async path => ({ path, content: await get(`visit/${vid}/p/${path}`) })))
    const compiles = await Promise.all(v.compiles.map(async c => ({ ...c, overrides: await Promise.all(c.overrides.map(async path => ({ path, content: await get(`visit/${vid}/o/${c.tag}/${path}`) }))) })))
    const h = window.texHost
    const t0 = Date.now()
    await h.open(url)
    h.send(init)
    const done = await h.wait(d => d?.type === 'init-done', 900000)
    const initAt = Date.now()
    h.send({ type: 'project', key: vid, files: project })
    const out = []
    for (const [i, c] of compiles.entries()) {
      const at = Date.now()
      h.send({ type: 'compile', id: i + 1, key: vid, main: c.main, engine: c.engine, rerun: c.rerun, bibtex: c.bibtex, overrides: c.overrides })
      const r = await h.wait(d => d?.type === 'compiled' && d.id === i + 1, 900000)
      out.push({ tag: c.tag, ok: r.ok, ms: r.ms, at, end: Date.now(), network: r.network })
    }
    const progress = h.seen.filter(s => s.type === 'progress').length
    h.close()
    return { t0, initAt, init: done, compiles: out, end: Date.now(), progress }
  }, { url: `${origin(page)}/tex.html`, init, files: FILES, vid })
}

const results = []
const record = row => { results.push(row); appendFileSync(join(OUT, 'speed.jsonl'), `${JSON.stringify(row)}\n`); console.log(JSON.stringify(row)) }
const jobsFor = async (id, lang) => {
  const p = await paperJobs(id, ['probe', `${lang}-prev`], fontsOf.get(id))
  return { p, names: ['probe', `${lang}-prev`] }
}

// warm-up, not measured: the new page's brotli copies of the tree's files these visits fetch (made on demand)
if (PAGES.includes('new')) {
  const b = await browser()
  for (const id of PAPERS) for (const lang of LANGS) {
    const { p, names } = await jobsFor(id, lang)
    visits.set('warm', { files: p.files, compiles: p.jobs })
    await visit(b.tab, 'new', 'warm', hintsFor(p.meta, names))
  }
  await b.close()
}

for (const profile of PROFILES) {
  for (const id of PAPERS) {
    for (const lang of LANGS) {
      const { p, names } = await jobsFor(id, lang)
      const vid = `${id}-${lang}`
      visits.set(vid, { files: p.files, compiles: p.jobs })
      for (const page of PAGES) {
        const init = page === 'old' ? { type: 'init', endpoint: `${origin('old')}/tl` } : hintsFor(p.meta, names)
        const b = await browser()
        Object.assign(link, { rtt: profile.rtt, mbit: profile.mbit })
        for (const which of ['first', 'revisit']) {
          served = []
          const load = loadavg()[0]
          const v = await visit(b.tab, page, vid, init).catch(e => ({ error: String(e?.message ?? e).slice(0, 300) }))
          const mine = served.slice()
          const during = (from, to) => mine.filter(r => r.t >= from && r.t <= to && (r.path.startsWith('/tl/') || /^\/t\/[^/]+\/(?!index-[0-9a-f]+\.txt$)/.test(r.path)))
          const preview = v.compiles?.at(-1)
          record({
            page, profile: profile.name, paper: id, lang, visit: which, load: +load.toFixed(1), error: v.error ?? v.init?.error,
            ok: preview?.ok, firstPreviewMs: preview ? preview.end - v.t0 : null, initMs: v.initAt ? v.initAt - v.t0 : null,
            probeMs: v.compiles?.[0]?.ms, previewMs: preview?.ms, bytes: mine.reduce((n, r) => n + r.bytes, 0), requests: mine.length,
            blocking: v.compiles ? v.compiles.reduce((n, c) => n + during(c.at, c.end).length, 0) : null, progress: v.progress,
          })
        }
        Object.assign(link, { rtt: 0, mbit: 0 })
        await b.close()
      }
      visits.delete(vid)
    }
  }
}
writeFileSync(join(OUT, 'speed.json'), JSON.stringify(results, null, 1))
for (const s of Object.values(servers)) s.close()
files.close()
