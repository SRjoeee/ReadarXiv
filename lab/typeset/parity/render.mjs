// lab/typeset/parity/render.mjs --work=<dir> --out=<dir> [<pair>…]: every page of each pair drawn three ways in one Chromium,
// at one scale (PDF.js's scale 1: 96/72 CSS px a point, device scale 2), and what each drew read back:
//   original  arXiv's page (PDF.js), and its link annotations;
//   today     today's door over the release's server-made bundle and the pair's door rows, drawn as the reading view draws a
//             laid page (today/entry.mjs: its copy, its SVG, its links, the engine's sheet and faces);
//   v2        the reader package (openReader, its own composer, served faces and sheet) drawing the entry's Page of v2.mjs
//             (<work>/v2/<pair>.json) through the lay seam (v2page/main.ts).
// Each side is shot twice: whole (what a reader sees) and its translated text alone (copy, crops and links hidden), and the
// pixels are read in the browser (analyse.mjs): the ink darkness of the translated text, the difference of today's pane and
// v2's, inside and outside the units' boxes. Writes <work>/raw/<pair>.json (every page's measures of both sides) and the
// sheet's images under <out>/img/ (WebP, the panes at half the device resolution: 1.33 px a point). Offline: a server on the
// loopback answers every file from disk, the browser refuses every other request. Licensed papers: the images and the raw
// files stay in lab-data. Run through heavy-slot.sh e2e; it stops when the disk has less than 12 GiB free.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build as esbuild } from 'esbuild'
import { build as vite } from 'vite'
import { write } from '../../../packages/format/src/index.ts'
import { answerBytes, startServer } from '../../../packages/reader/e2e/server.mjs'
import { readerAssets } from '../../../packages/reader/src/vite.ts'
import { doorRows } from '../../../packages/typeset/tests/replay/rows.ts'
import { CACHE, paperOf } from '../../../packages/typeset/tests/replay/today.ts'
import { L1_BUNDLES } from '../../../packages/typeset/tests/replay/l1.ts'
import { LAB, TODAY } from '../../../packages/typeset/tests/replay/tap.ts'
import { SLICES, TABLES } from '../served-metrics.mjs'
import { analyse } from './analyse.mjs'
import { pdfOf, whyNot } from './inputs.mjs'
import { FIRST, PAIRS } from './pairs.mjs'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const HERE = import.meta.dirname
const ROOT = join(HERE, '..', '..', '..')
const WORK = arg('work')
const OUT = arg('out')
if (!WORK || !OUT) throw new Error('render.mjs: --work=<dir> and --out=<dir> are required')
const PAGES = arg('pages')?.split(',').map(Number) ?? null
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const pairs = asked.length ? asked : PAIRS
/** the web's tree of this release (its faces' module and static index): AXT_WEB, else the worktree beside the face tables */
const WEB = process.env.AXT_WEB ?? join(TABLES, '..', '..', '..', '..')
const MODS = join(ROOT, 'node_modules')
const PDFJS = join(ROOT, 'node_modules/.pnpm/pdfjs-dist@6.3.289/node_modules/pdfjs-dist')
const HYPH = [join(CACHE, 'static/hyph'), join(LAB, 'refactor-2026-11', 'baseline', 'static', 'hyph')]
/** CSS px a point (PDF.js's scale 1) and device px a CSS px */
export const SCALE = 96 / 72
export const DPR = 2
const MIN_FREE_GIB = 12
const freeGiB = () => Number(execFileSync('df', ['-g', '/'], { encoding: 'utf8' }).trim().split('\n')[1].split(/\s+/)[3])
if (freeGiB() < MIN_FREE_GIB) throw new Error(`disk: ${freeGiB()} GiB free, under ${MIN_FREE_GIB}`)
mkdirSync(join(WORK, 'raw'), { recursive: true })
mkdirSync(join(OUT, 'img'), { recursive: true })
const json = (f) => JSON.parse(readFileSync(f, 'utf8'))
const sha = (b) => createHash('sha256').update(b).digest('hex')
// ---------------------------------------------------------------- today's page: esbuild over today's engine and the web
const standIn = {
  // (run.mjs opened with `records` and kept, as baseline/tools/reader.mjs's stand-in: the crops' audit; the drawing the same)
  name: 'run-stand-in',
  setup(b) {
    b.onResolve({ filter: /^\.\/run\.mjs$/ }, (a) =>
      a.importer.endsWith('layer-proto/reader.mjs') ? { path: join(a.importer, '../run.mjs'), namespace: 'base-run' } : null,
    )
    b.onLoad({ filter: /.*/, namespace: 'base-run' }, (a) => ({
      resolveDir: join(a.path, '..'),
      contents: `export * from ${JSON.stringify(a.path)}
import { openProto as real } from ${JSON.stringify(a.path)}
export async function openProto(o) { const run = await real({ ...o, records: true }); (globalThis.__baseRuns ??= []).push(run); return run }`,
    }))
  },
}
const aliases = {
  name: 'aliases',
  setup(b) {
    b.onResolve({ filter: /^@today\// }, (a) => ({ path: join(TODAY, 'src/pdf-reader/engine', a.path.slice(7)) }))
    b.onResolve({ filter: /^@web\// }, (a) => ({ path: join(WEB, 'web/src', a.path.slice(5)) }))
    // (the web's engine pin, empty in the released worktree, is today's engine: the same commit)
    b.onResolve({ filter: /vendor\/readarxiv\/src\// }, (a) => ({ path: join(TODAY, 'src', a.path.split('vendor/readarxiv/src/')[1]) }))
  },
}
const todayJs = (
  await esbuild({
    entryPoints: [join(HERE, 'today', 'entry.mjs')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['pdfjs-dist'],
    plugins: [aliases, standIn],
    loader: { '.json': 'json' },
    logLevel: 'warning',
    nodePaths: [MODS, join(TODAY, 'node_modules')],
    absWorkingDir: join(WEB),
    tsconfig: join(WEB, 'tsconfig.json'),
  })
).outputFiles[0].text
const engineCss = readFileSync(join(TODAY, 'src/pdf-reader/engine/view/engine.css'))

// ---------------------------------------------------------------- v2's page: the reader through Vite, the lay seam replaced
const TYPESET = /export async function typesetLay\(o(?::[^)]*)?\)(?::[^{]*)?\{\n/g
const layHook = {
  name: 'parity-lay',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/packages/reader/src/compose/typeset.ts')) return null
    const found = code.match(TYPESET) ?? []
    if (found.length !== 1) throw new Error('parity: compose/typeset.ts no longer holds typesetLay once')
    return code.replace(
      found[0],
      `${found[0]}  const parity = (globalThis as { __parityLay?: (p: unknown, r: unknown, m: unknown) => Page }).__parityLay\n  if (parity) return (part, rows) => parity(part, rows, o.served.metrics)\n`,
    )
  },
}
const BUILD = join(WORK, '.v2page')
await vite({
  configFile: false,
  root: join(HERE, 'v2page'),
  base: '/',
  logLevel: 'warn',
  plugins: [readerAssets(), layHook],
  build: { outDir: BUILD, emptyOutDir: true, target: 'es2022' },
})

// ---------------------------------------------------------------- what the server answers
const segOf = (paper) => paper.replace('.', '_')
const objects = new Map()
const bytesAt = new Map()
const docs = new Map()
const files = new Map()
let current = null
const sliceDir = (name) => SLICES.map((d) => join(d, name)).find((f) => existsSync(f))
const todayDesc = new Map()
const missing = []
for (const pair of pairs) {
  const paper = paperOf(pair)
  const target = /-([a-z]{2,3})$/.exec(pair)?.[1]
  const v2f = join(WORK, 'v2', `${pair}.json`)
  const cat = join(CACHE, 'papers', paper, 'catalog.json')
  const bundle = join(L1_BUNDLES, paper)
  const rows = doorRows(pair)
  const why = whyNot(pair, WORK)
  if (why) {
    missing.push({ pair, why })
    continue
  }
  const seg = segOf(paper)
  objects.set(`/api/v2/o/arxiv/${seg}.pdf`, pdfOf.get(paper))
  objects.set(`/arxiv/${seg}.pdf`, pdfOf.get(paper))
  // (today's: the catalog's objects by digest, from the sweep cache; its rows the door rows, as the baseline's reader laid them)
  const c = json(cat)
  files.set(`/rows/${pair}.json`, Buffer.from(JSON.stringify([...rows.values()])))
  todayDesc.set(pair, { head: c.head, units: c.units, parts: c.parts, rows: `/rows/${pair}.json`, target, original: `/arxiv/${seg}.pdf` })
  // (v2's: our server's v2 document over the L1 bundle, its head's canonical bytes under its digest: real.mjs's)
  const listing = readdirSync(bundle)
  for (const f of listing) if (/^[0-9a-f]{64}\./.test(f)) objects.set(`/api/v2/o/p/${seg}/fx/${f.split('.')[0]}`, join(bundle, f))
  const head = json(join(bundle, 'head.json'))
  const { bytes, digest } = write('head', head)
  bytesAt.set(`/api/v2/o/p/${seg}/fx/${digest}`, Buffer.from(bytes))
  const refOf = (d) => {
    const f = listing.find((x) => x.startsWith(`${d}.`))
    return { path: `p/${seg}/fx/${d}`, sha256: d, bytes: statSync(join(bundle, f)).size }
  }
  // (a row a unit the Page lays, its text the drawn runs': what the reader's own text layer reads; the drawing is the Page's)
  const v2 = json(v2f)
  const byId = new Map()
  for (const [pg, f] of Object.entries(v2.facts))
    for (const m of f.members) {
      if (!m.text || byId.has(m.text)) continue
      const laid = v2.pages[pg]?.members.find((x) => x.ord === m.ord && x.state === 'laid')
      const s = laid ? laid.lines.map((l) => l[3].map((it) => it.s).join('')).join(' ') : ''
      byId.set(m.text, { id: m.text, ok: true, content: [{ t: 'text', s }], by: 'parity' })
    }
  const rb = Buffer.from(JSON.stringify({ format: 1, rows: [...byId.values()] }))
  const rsha = sha(rb)
  bytesAt.set(`/api/v2/o/r/${seg}/${target}/fx/${rsha}`, rb)
  docs.set(pair, {
    v: 1,
    pv: seg,
    epoch: 'e1',
    rev: 2,
    paper: head.paper.id,
    version: head.paper.version,
    prepare: { attempt: 1, state: 'done', why: null, retryAt: null, at: 0, build: 'fx', stage: null, units: head.units.map(refOf), html: null },
    layer: { catalog: { path: `p/${seg}/fx/${digest}`, sha256: digest, bytes: bytes.length }, units: head.units.map(refOf), format: 1, build: 'fx', stale: false },
    targets: {
      [target]: {
        attempt: 1,
        state: 'done',
        why: null,
        retryAt: null,
        at: 0,
        translator: 'fx',
        units: null,
        rows: [{ path: `r/${seg}/${target}/fx/${rsha}`, sha256: rsha, bytes: rb.length }],
        done: byId.size,
        total: byId.size,
        view: 1,
      },
    },
  })
}
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.icc': 'application/octet-stream' }
const send = (res, body, type) => {
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}
const routes = [
  {
    prefix: '/h/',
    handle(_req, res, url) {
      if (url.pathname === '/h/page.html') return send(res, readFileSync(join(HERE, 'today', 'index.html')), 'text/html; charset=utf-8')
      if (url.pathname === '/h/entry.js') return send(res, todayJs, TYPES['.js'])
      if (url.pathname === '/h/engine.css') return send(res, engineCss, 'text/css')
      if (url.pathname === '/h/blank.html') return send(res, '<!doctype html><meta charset="utf-8"><body></body>', 'text/html')
      return false
    },
  },
  {
    prefix: '/obj/',
    handle(req, res, url) {
      const d = url.pathname.slice(5)
      if (!/^[0-9a-f]{64}$/.test(d)) return false
      const f = join(CACHE, 'objects', d)
      if (!existsSync(f)) return false
      answerBytes(req, res, readFileSync(f))
      return true
    },
  },
  {
    prefix: '/rows/',
    handle(_req, res, url) {
      const b = files.get(url.pathname)
      if (!b) return false
      return send(res, b, TYPES['.json'])
    },
  },
  {
    prefix: '/pdfjs/',
    handle(_req, res, url) {
      const m = /^\/pdfjs\/(build|cmaps|standard_fonts|wasm|iccs)\/([\w.-]+)$/.exec(url.pathname)
      if (!m) return false
      const f = join(PDFJS, m[1], m[2])
      if (!existsSync(f)) return false
      return send(res, readFileSync(f), TYPES[`.${m[2].split('.').pop()}`] ?? 'application/octet-stream')
    },
  },
  {
    prefix: '/static-fonts/',
    handle(_req, res, url) {
      const name = url.pathname.slice('/static-fonts/'.length)
      if (/^[\w-]+\.json$/.test(name)) {
        const f = join(TABLES, name)
        if (!existsSync(f)) return false
        return send(res, readFileSync(f), TYPES['.json'])
      }
      if (/^[0-9a-f]{16}\.woff2$/.test(name)) {
        const f = sliceDir(name)
        if (!f) return false
        res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'max-age=3600', 'access-control-allow-origin': '*' })
        return res.end(readFileSync(f))
      }
      return false
    },
  },
  {
    prefix: '/hyph/',
    handle(_req, res, url) {
      const name = url.pathname.slice('/hyph/'.length)
      if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)*\.json$/.test(name)) return false
      const f = HYPH.map((d) => join(d, name)).find((x) => existsSync(x))
      if (!f) return false
      return send(res, readFileSync(f), TYPES['.json'])
    },
  },
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
        return send(res, JSON.stringify(d), 'application/json')
      }
      const b = bytesAt.get(url.pathname)
      if (!b) return false
      answerBytes(req, res, b, { type: url.pathname.includes('/r/') ? 'application/json' : 'application/octet-stream' })
      return true
    },
  },
]
const server = await startServer({ out: BUILD, objects, routes })

// ---------------------------------------------------------------- the browser
const pw = await import('playwright')
const browser = await pw.chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] })
const refused = []
const guard = async (context) => {
  await context.route('**/*', (route) => {
    const u = route.request().url()
    if (u.startsWith(server.origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue()
    refused.push(u)
    return route.abort()
  })
}
const wait = (ms) => new Promise((f) => setTimeout(f, ms))
const frames = (page) => page.evaluate(() => new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f))))
const shot = async (page, clip) => (await page.screenshot({ clip, type: 'png' })).toString('base64')
const lab = await browser.newContext({ viewport: { width: 400, height: 300 } })
await guard(lab)
const labPage = await lab.newPage()
await labPage.goto(`${server.origin}/h/blank.html`)

for (const pair of pairs) {
  if (!todayDesc.has(pair)) continue
  if (freeGiB() < MIN_FREE_GIB) {
    console.log(`stopped: the disk has under ${MIN_FREE_GIB} GiB free`)
    break
  }
  const t0 = Date.now()
  const paper = paperOf(pair)
  const target = /-([a-z]{2,3})$/.exec(pair)[1]
  const v2 = json(join(WORK, 'v2', `${pair}.json`))
  const errors = { today: [], v2: [] }
  // (today's context: the original and today's drawing, one page at a time on a stage the page's size)
  const tc = await browser.newContext({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: DPR })
  await guard(tc)
  const tp = await tc.newPage()
  tp.on('pageerror', (x) => errors.today.push(String(x).slice(0, 200)))
  await tp.goto(`${server.origin}/h/page.html`)
  await tp.waitForFunction(() => !!globalThis.todayReady)
  const opened = await tp.evaluate((d) => globalThis.today.open(d), todayDesc.get(pair))
  // (v2's context: the reader on its v2 document, the entry's pages through the lay seam)
  current = pair
  const vc = await browser.newContext({ viewport: { width: 1100, height: 1300 }, deviceScaleFactor: DPR })
  await guard(vc)
  const vp = await vc.newPage()
  vp.on('pageerror', (x) => errors.v2.push(String(x).slice(0, 200)))
  vp.on('console', (m) => {
    if (m.type() === 'error') errors.v2.push(m.text().slice(0, 200))
  })
  await vp.goto(`${server.origin}/index.html`)
  await vp.waitForFunction(() => !!globalThis.__p)
  await vp.evaluate((o) => globalThis.__p.open(o), { paper, target, pages: v2.pages })
  try {
    await vp.waitForFunction(() => globalThis.__p.state()?.layer.s === 'ready', null, { timeout: 60_000, polling: 100 })
  } catch {
    errors.v2.push(`not ready: ${JSON.stringify(await vp.evaluate(() => globalThis.__p.state()))}`)
  }
  const out = { pair, paper, target, opened, pages: [] }
  for (let n = 1; n <= opened.orig; n++) {
    if (PAGES && !PAGES.includes(n)) continue
    const rec = { page: n }
    try {
      // the original
      const o = await tp.evaluate(([k, s]) => globalThis.today.original(k, s), [n, SCALE])
      const clip = { x: 0, y: 0, width: o.size[0], height: o.size[1] }
      const A = await shot(tp, clip)
      rec.view = o.view
      rec.original = { links: o.links }
      // today's
      await tp.evaluate(() => globalThis.today.textOnly(false))
      const t = await tp.evaluate(([k, s]) => globalThis.today.page(k, s), [n, SCALE])
      await frames(tp)
      const T = await shot(tp, clip)
      await tp.evaluate(() => globalThis.today.textOnly(true))
      await frames(tp)
      const Tt = await shot(tp, clip)
      await tp.evaluate(() => globalThis.today.textOnly(false))
      rec.today = t
      // v2's
      await vp.evaluate((k) => globalThis.__p.textOnly(false) && globalThis.__p.go(k), n)
      await wait(300)
      await vp.evaluate((k) => globalThis.__p.reveal(k), n)
      const laidHere = (v2.pages[n]?.members ?? []).some((m) => m.state === 'laid')
      try {
        await vp.waitForFunction(
          ([k, want]) => {
            const s = globalThis.__p.slot(k)
            return !!s && s.canvas && s.marks === 0 && (!want || s.over)
          },
          [n, laidHere],
          { timeout: 30_000, polling: 100 },
        )
      } catch {
        errors.v2.push(`p${n}: no committed overlay in 30 s ${JSON.stringify(await vp.evaluate((k) => globalThis.__p.slot(k), n))}`)
      }
      await wait(laidHere ? 400 : 1200)
      await vp.evaluate(() => globalThis.__p.fonts())
      await vp.evaluate((k) => globalThis.__p.reveal(k), n)
      await frames(vp)
      const s = await vp.evaluate((k) => globalThis.__p.slot(k), n)
      const vclip = { x: s.rect[0], y: s.rect[1], width: s.rect[2], height: s.rect[3] }
      const V = await shot(vp, vclip)
      rec.v2 = { ...(await vp.evaluate(([k, view]) => globalThis.__p.measure(k, view), [n, o.view])), rect: s.rect, canvases: s.canvases }
      const figs = (v2.facts[n]?.members ?? []).filter((m) => /figure/.test(m.kind)).map((m) => m.ord)
      await vp.evaluate((hide) => globalThis.__p.textOnly(true, hide), figs)
      await frames(vp)
      const Vt = await shot(vp, vclip)
      await vp.evaluate(() => globalThis.__p.textOnly(false))
      // the pixels: the panes, the text's darkness, the difference (analyse.mjs, in the lab's own page)
      const boxes = boxesOf(rec, v2, n)
      const px = await labPage.evaluate(analyse, { A, T, Tt, V, Vt, view: o.view, boxes, textBoxes: textBoxesOf(rec, v2, n), scale: SCALE * DPR })
      for (const [k, b64] of Object.entries(px.images)) writeFileSync(join(OUT, 'img', `${pair}-p${n}-${k}.webp`), Buffer.from(b64, 'base64'))
      delete px.images
      rec.px = px
    } catch (e) {
      rec.error = String(e?.message ?? e).slice(0, 300)
    }
    out.pages.push(rec)
  }
  out.errors = errors
  writeFileSync(join(WORK, 'raw', `${pair}.json`), `${JSON.stringify(out)}\n`)
  console.log(`${pair}: ${out.pages.length} pages in ${((Date.now() - t0) / 1000).toFixed(0)} s; page errors today ${errors.today.length}, v2 ${errors.v2.length}${errors.v2.length ? ` (${errors.v2.slice(0, 2).join(' | ')})` : ''}`)
  await tp.evaluate(() => globalThis.today.dispose())
  await tc.close()
  await vp.evaluate(() => globalThis.__p.close())
  await vc.close()
}
for (const pair of FIRST) if (!pairs.includes(pair)) missing.push({ pair, why: whyNot(pair, WORK) ?? 'not asked of this run' })
writeFileSync(join(WORK, 'raw', 'missing.json'), `${JSON.stringify(missing, null, 1)}\n`)
console.log(`missing: ${missing.map((m) => `${m.pair} (${m.why})`).join('; ') || 'none'}`)
console.log(`refused requests: ${refused.length}${refused.length ? ` (${refused.slice(0, 3).join(', ')})` : ''}`)
await browser.close()
await server.close()
// (the built page is made again on every run: not kept in the work directory)
rmSync(BUILD, { recursive: true, force: true })

/** the original lines of the units either side lays on the page (PDF units [x0, y0, x1, y1], their fonts' boxes): where the
 *  original's text darkness is read, the ink the translation stands for */
function textBoxesOf(rec, v2, n) {
  const partOf = new Map(Object.entries(v2.today).map(([o, t]) => [t.today, Number(o)]))
  const laid = new Set([
    ...(v2.pages[n]?.members ?? []).filter((m) => m.state === 'laid').map((m) => m.ord),
    ...(rec.today?.units ?? []).map((u) => partOf.get(u.id)).filter((o) => o !== undefined),
  ])
  const out = []
  for (const m of v2.facts[n]?.members ?? [])
    if (laid.has(m.ord) && !/figure/.test(m.kind)) for (const l of m.lines) if (l[0] === n) out.push([l[2], l[6], l[3], l[5]])
  return out
}

/** the boxes of the page's units, PDF units [x0, y0, x1, y1]: each unit's lines on A (its original ink) and each line either
 *  side drew; a pixel that differs outside all of them differs where both should show arXiv's page */
function boxesOf(rec, v2, n) {
  const out = []
  for (const m of v2.facts[n]?.members ?? [])
    for (const l of m.lines) if (l[0] === n) out.push([l[2] - 1, l[6] - 1, l[3] + 1, l[5] + 1])
  for (const u of [...(rec.today?.units ?? []), ...(rec.today?.figures ?? []), ...(rec.today?.names ?? []), ...(rec.v2?.units ?? [])])
    for (const l of u.lines)
      if (l.x0 !== null) out.push(l.rot ? [l.x0 - 1, l.y0 - 1, l.x1 + 1, l.y1 + 1] : [l.x0 - 1, l.y - 0.3 * l.size, l.x1 + 1, l.y + 1.0 * l.size])
  for (const c of [...(rec.today?.crops ?? []), ...(rec.v2?.crops ?? [])]) out.push([c[1] - 1, c[2] - 1, c[3] + 1, c[4] + 1])
  return out
}
