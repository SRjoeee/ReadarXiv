// lab/typeset/checkpoint/real.mjs --examples=<pick.mjs's file> --render=<render.mjs's render.json> --out=<dir>
// [--only=<example id>,…] [--variants=c,b,d] [--fresh] [--suffix=<s>]: the checkpoint's examples drawn by the reader itself, so that what the sheet shows
// can be told apart from what the sheet's own drawing page adds. Each example's paper is opened by `openReader` (real/main.ts)
// with a website-like host: our server's v2 document of the paper (its layer the bundle the sheet used, the head's canonical
// bytes under its digest; its rows one object made from the variant's dump, a row a unit), arXiv's PDF under our server's path;
// the typesetter's seam `engine.lay` given the reader harness's stand-in over the variant's dump (convert.ts fixtureLay). The
// translation's pane alone, at scale 1, device scale 2: the example's region (the sheet's, render.json) cut from the page as the
// reader composed it, `<out>/img/<id>-r.png` for the new lay (c), `<id>-r<v>.png` for another variant. With --laid=<laid.mjs's
// file>, the pages it holds are the typesetter's own display list instead of the converted dump (`<id>-rl.png`). Served on the loopback;
// Playwright's Chromium behind a route table that refuses every other request. Licensed papers: the images stay in lab-data.
// Run through heavy-slot.sh e2e (one browser at a time); it stops when the disk has less than 12 GiB free.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'
import { write } from '../../../packages/format/src/index.ts'
import { answerBytes, startServer } from '../../../packages/reader/e2e/server.mjs'
import { readerAssets } from '../../../packages/reader/src/vite.ts'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const HERE = import.meta.dirname
const OUT = arg('out')
const BUILD = arg('build', join(OUT, '.real'))
const only = arg('only')?.split(',') ?? null
const LAID = arg('laid') ? JSON.parse(readFileSync(arg('laid'), 'utf8')) : null
const VARIANTS = LAID ? ['c'] : arg('variants', 'c').split(',')
const FRESH = process.argv.includes('--fresh')
/** --suffix=<s>: each example's image `img/<id>-<s>.png` (the second sheet's after: `fixed`) */
const SUFFIX = arg('suffix')
const sheet = JSON.parse(readFileSync(arg('examples'), 'utf8'))
const regions = JSON.parse(readFileSync(arg('render'), 'utf8'))
const DPR = 2
const MIN_FREE_GIB = 12
const TABLES = process.env.AXT_FACE_TABLES ?? '/Users/cheongzhiyan/Developer/readarxiv-web-wt/refactor-read/web/src/fonts/static'
const SLICES = (
  process.env.AXT_FACE_SLICES ??
  '/Users/cheongzhiyan/Developer/readarxiv-web-wt/sweep/sweep-data/cache/static/static-fonts:/Users/cheongzhiyan/Developer/readarxiv-web-wt/rate-limit/web/public/static-fonts'
).split(':')

const freeGiB = () => Number(execFileSync('df', ['-g', '/'], { encoding: 'utf8' }).trim().split('\n')[1].split(/\s+/)[3])
if (freeGiB() < MIN_FREE_GIB) throw new Error(`disk: ${freeGiB()} GiB free, under ${MIN_FREE_GIB}`)

mkdirSync(join(OUT, 'img'), { recursive: true })
await build({
  configFile: false,
  root: join(HERE, 'real'),
  base: '/',
  logLevel: 'warn',
  plugins: [readerAssets()],
  build: { outDir: BUILD, emptyOutDir: true, target: 'es2022' },
})

// ---------------------------------------------------------------- what the server answers
const examples = sheet.corrections.flatMap((c) => c.examples.map((e) => ({ ...e, correction: c.id })))
const todo = examples.filter(
  (e) => (!only || only.includes(e.id)) && regions[e.id]?.region && (!LAID || LAID[e.pair]?.pages?.[e.page]),
)
const objects = new Map()
const bytesAt = new Map()
const docs = new Map()
const dumps = new Map()
const segOf = (paper) => paper.replace('.', '_')
/** a variant's dump as the rows object our server would hold: a row a unit, its text the dump's (the dump is what is painted) */
const rowsOf = (dump) => ({
  format: 1,
  rows: dump.units.map((u) => ({
    id: u.id,
    ok: true,
    content: [{ t: 'text', s: u.lines.map((l) => l.text ?? '').join(' ') }],
    by: 'baseline',
  })),
})
for (const e of todo) {
  const seg = segOf(e.paper)
  objects.set(`/api/v2/o/arxiv/${seg}.pdf`, e.pdf)
  const files = readdirSync(e.bundle)
  for (const f of files)
    if (/^[0-9a-f]{64}\./.test(f)) objects.set(`/api/v2/o/p/${seg}/fx/${f.split('.')[0]}`, join(e.bundle, f))
  // (the head: the canonical bytes of the bundle's head.json, whose digest is the sheet's head: checked)
  const { bytes, digest } = write('head', JSON.parse(readFileSync(join(e.bundle, 'head.json'), 'utf8')))
  // (--fresh: the bundle prepared again since the sheet, by a later head of the engine: its own head served)
  if (digest !== e.head && !FRESH) throw new Error(`${e.id}: the bundle's head is ${digest}, the sheet's ${e.head}`)
  bytesAt.set(`/api/v2/o/p/${seg}/fx/${digest}`, Buffer.from(bytes))
  const head = JSON.parse(readFileSync(join(e.bundle, 'head.json'), 'utf8'))
  const refOf = (d) => {
    const f = files.find((x) => x.startsWith(`${d}.`))
    return { path: `p/${seg}/fx/${d}`, sha256: d, bytes: statSync(join(e.bundle, f)).size }
  }
  for (const v of VARIANTS) {
    const key = `${seg}|${e.target}|${v}`
    if (docs.has(key)) continue
    const dump = JSON.parse(readFileSync(e.dumps[v], 'utf8'))
    const rb = Buffer.from(JSON.stringify(rowsOf(dump)))
    const sha = createHash('sha256').update(rb).digest('hex')
    bytesAt.set(`/api/v2/o/r/${seg}/${e.target}/fx/${sha}`, rb)
    dumps.set(`/dump/${seg}-${e.target}-${v}.json`, e.dumps[v])
    docs.set(key, {
      v: 1,
      pv: seg,
      epoch: 'e1',
      rev: 2,
      paper: head.paper.id,
      version: head.paper.version,
      prepare: { attempt: 1, state: 'done', why: null, retryAt: null, at: 0, build: 'fx', stage: null, units: head.units.map(refOf), html: null },
      layer: { catalog: { path: `p/${seg}/fx/${digest}`, sha256: digest, bytes: bytes.length }, units: head.units.map(refOf), format: 1, build: 'fx', stale: false },
      targets: {
        [e.target]: {
          attempt: 1,
          state: 'done',
          why: null,
          retryAt: null,
          at: 0,
          translator: 'fx',
          units: null,
          rows: [{ path: `r/${seg}/${e.target}/fx/${sha}`, sha256: sha, bytes: rb.length }],
          done: dump.units.length,
          total: dump.units.length,
          view: 1,
        },
      },
    })
  }
}
// (the served faces: each face's slices, the file and its code points: render.mjs's)
const index = JSON.parse(readFileSync(join(TABLES, 'index.json'), 'utf8'))
const groups = new Map()
const slicesOf = (id) => {
  const entry = index.faces[id]
  if (!entry) return []
  if (!groups.has(entry.group)) groups.set(entry.group, JSON.parse(readFileSync(join(TABLES, `${entry.group}.json`), 'utf8')))
  const g = groups.get(entry.group)
  return (g.faces[id] ?? []).flatMap((s, k) => {
    if (!s) return []
    const name = s.path.split('/').pop()
    if (!SLICES.some((d) => existsSync(join(d, name)))) return []
    const r = g.slices[k]
    const range = []
    for (let i = 0; i < r.length; i += 2) range.push(`U+${r[i].toString(16)}-${r[i + 1].toString(16)}`)
    return [{ url: `/slice/${name}`, range: range.join(',') }]
  })
}
/** the document followed: the variant now open (one paper and variant a context) */
let current = null
const routes = [
  {
    prefix: '/api/v2/',
    handle(req, res, url) {
      if (url.pathname.startsWith('/api/v2/papers/')) {
        const seg = url.pathname.slice('/api/v2/papers/'.length)
        const d = current && docs.get(current)
        if (!d || (d.pv !== seg && d.pv.replace(/v\d+$/, '') !== seg)) {
          res.writeHead(404, { 'content-type': 'application/json' })
          return res.end('{"error":"not-found"}')
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify(d))
      }
      const b = bytesAt.get(url.pathname)
      if (!b) return false
      answerBytes(req, res, b, { type: url.pathname.includes('/r/') ? 'application/json' : 'application/octet-stream' })
      return true
    },
  },
  {
    prefix: '/dump/',
    handle(_req, res, url) {
      const f = dumps.get(url.pathname)
      if (!f) return false
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(readFileSync(f))
    },
  },
  {
    prefix: '/slice/',
    handle(_req, res, url) {
      const name = url.pathname.slice('/slice/'.length)
      if (!/^[0-9a-f]+\.woff2$/.test(name)) return false
      const f = SLICES.map((d) => join(d, name)).find((p) => existsSync(p))
      if (!f) return false
      res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'max-age=3600' })
      return res.end(readFileSync(f))
    },
  },
]
const server = await startServer({ out: BUILD, objects, routes })

// ---------------------------------------------------------------- the browser
const pw = await import('playwright')
const browser = await pw.chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] })
const refused = []
const out = existsSync(join(OUT, 'real.json')) ? JSON.parse(readFileSync(join(OUT, 'real.json'), 'utf8')) : {}
const wait = (ms) => new Promise((f) => setTimeout(f, ms))
todo.sort((a, b) => a.pair.localeCompare(b.pair) || a.page - b.page)
const byKey = new Map()
for (const e of todo) for (const v of VARIANTS) {
  const k = `${segOf(e.paper)}|${e.target}|${v}`
  byKey.set(k, [...(byKey.get(k) ?? []), e])
}
for (const [key, list] of byKey) {
  if (freeGiB() < MIN_FREE_GIB) {
    console.log(`stopped: the disk has under ${MIN_FREE_GIB} GiB free`)
    break
  }
  const [seg, target, v] = key.split('|')
  current = key
  const context = await browser.newContext({ viewport: { width: 1100, height: 1250 }, deviceScaleFactor: DPR })
  await context.route('**/*', (route) => {
    const u = route.request().url()
    if (u.startsWith(server.origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
    refused.push(u)
    return route.abort()
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (x) => errors.push(String(x)))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`)
  })
  await page.goto(`${server.origin}/index.html`)
  await page.waitForFunction(() => !!globalThis.__r)
  const e0 = list[0]
  const faces = [e0.faces.latin, ...(e0.faces.cjk ? [e0.faces.cjk] : []), 'cmun-serif-regular'].filter(
    (f, i, a) => a.indexOf(f) === i,
  )
  await page.evaluate((o) => globalThis.__r.open(o), {
    paper: e0.paper,
    target,
    dump: `/dump/${seg}-${target}-${v}.json`,
    laid: LAID?.[e0.pair]?.pages ?? null,
    slices: Object.fromEntries(faces.map((f) => [f, slicesOf(f)])),
    faces,
  })
  try {
    await page.waitForFunction(
      () => {
        const s = globalThis.__r.state()
        return s?.layer.s === 'ready' && s.rows.s === 'complete'
      },
      null,
      { timeout: 60_000, polling: 100 },
    )
  } catch {
    console.log(`${key}: not ready ${JSON.stringify(await page.evaluate(() => globalThis.__r.state()))}`)
  }
  for (const e of list) {
    const res = { id: e.id, variant: v, problems: [] }
    try {
      const reg = regions[e.id].region
      await page.evaluate((n) => globalThis.__r.go(n), e.page)
      await wait(400)
      await page.evaluate(([n, top]) => globalThis.__r.reveal(n, top), [e.page, reg[3]])
      await page.waitForFunction(
        (n) => {
          const s = globalThis.__r.slot(n)
          return s?.over && s.canvas && s.marks === 0
        },
        e.page,
        { timeout: 30_000, polling: 100 },
      )
      await wait(600)
      await page.evaluate(() => globalThis.__r.fonts())
      await page.evaluate(() => new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f))))
      const s = await page.evaluate((n) => globalThis.__r.slot(n), e.page)
      const vb = (s.viewBox ?? '0 0 612 792').split(' ').map(Number)
      const k = s.rect[2] / vb[2]
      const clip = {
        x: s.rect[0] + reg[0] * k,
        y: s.rect[1] + (vb[3] - reg[3]) * k,
        width: (reg[2] - reg[0]) * k,
        height: (reg[3] - reg[1]) * k,
      }
      const file = SUFFIX ? `img/${e.id}-${SUFFIX}.png` : `img/${e.id}-r${LAID ? 'l' : v === 'c' ? '' : v}.png`
      await page.screenshot({ path: join(OUT, file), clip })
      Object.assign(res, { file, scale: Math.round(k * 1000) / 1000, members: s.members, crops: s.crops, size: [Math.round(clip.width * DPR), Math.round(clip.height * DPR)] })
    } catch (err) {
      res.problems.push(String(err?.message ?? err).slice(0, 300))
    }
    out[`${e.id}|${LAID ? 'laid' : v}`] = res
    console.log(`${e.id} ${v} p${e.page}: ${res.file ?? '-'} scale ${res.scale} members ${res.members} crops ${res.crops} ${res.problems.join('; ')}`)
  }
  if (errors.length) console.log(`  ${key} page messages: ${errors.length} (${errors.slice(0, 4).map((x) => x.slice(0, 160)).join(' | ')})`)
  await context.close()
}
writeFileSync(join(OUT, 'real.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(`refused requests: ${refused.length}${refused.length ? ` (${refused.slice(0, 3).join(', ')})` : ''}`)
await browser.close()
await server.close()
