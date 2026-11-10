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
// files stay in lab-data. Run through heavy-slot.sh e2e; it stops when the volume of the work or of the sheet has less than
// 12 GiB free. The run's manifest (<work>/raw/run.json) says what it was asked and what it drew: written at the start (not
// done), its pairs not drawn and why as they come, done at the end; each pair's raw file names the run and the v2.mjs file it
// drew from, so that measure.mjs judges this run's drawing alone and the whole of it.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
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
import { analyse, boxesOf } from './analyse.mjs'
import { hyphFileOf, pdfOf, whyNot } from './inputs.mjs'
import { PAIRS } from './pairs.mjs'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const HERE = import.meta.dirname
const ROOT = join(HERE, '..', '..', '..')
const WORK = arg('work')
const OUT = arg('out')
if (!WORK || !OUT) throw new Error('render.mjs: --work=<dir> and --out=<dir> are required')
const PAGES = arg('pages')?.split(',').map(Number) ?? null
/** the toggles both readers draw under: the defaults, or every switch on (--toggles=on); each pair's v2 file must be laid under
 *  the same (v2.mjs --toggles) */
const TOGGLES = arg('toggles') === 'on' ? 'on' : 'defaults'
const CLASSES_ON = { figures: true, tables: true, heads: true, references: true, names: true }
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const pairs = asked.length ? asked : PAIRS
/** the web's tree of this release (its faces' module and static index): AXT_WEB, else the worktree beside the face tables */
const WEB = process.env.AXT_WEB ?? join(TABLES, '..', '..', '..', '..')
const MODS = join(ROOT, 'node_modules')
const PDFJS = join(ROOT, 'node_modules/.pnpm/pdfjs-dist@6.3.289/node_modules/pdfjs-dist')
/** CSS px a point (PDF.js's scale 1) and device px a CSS px */
export const SCALE = 96 / 72
export const DPR = 2
const MIN_FREE_GIB = 12
mkdirSync(join(WORK, 'raw'), { recursive: true })
mkdirSync(join(OUT, 'img'), { recursive: true })
/** the GiB free on the volume an existing path is on (statfs: the blocks an unprivileged writer may use, on any platform) */
const freeGiBOf = (path) => {
  const st = statfsSync(path)
  return (st.bavail * st.bsize) / 2 ** 30
}
/** the least free of the volumes the run writes to: the raw files' (work) and the images' (out) */
const freeGiB = () => Math.min(...[WORK, OUT].map(freeGiBOf))
if (freeGiB() < MIN_FREE_GIB) throw new Error(`disk: ${freeGiB().toFixed(1)} GiB free, under ${MIN_FREE_GIB}`)
const json = (f) => JSON.parse(readFileSync(f, 'utf8'))
const sha = (b) => createHash('sha256').update(b).digest('hex')
/** today's prepare dumps read so far, by paper (prepOf) */
const preps = new Map()
// (the manifest, written before anything is drawn: a run that stops or fails leaves it not done)
const RUN = { id: `${new Date().toISOString()}-${process.pid}`, at: new Date().toISOString(), pairs, pages: PAGES, toggles: TOGGLES, done: false, stopped: null, missing: [] }
const manifest = () => writeFileSync(join(WORK, 'raw', 'run.json'), `${JSON.stringify(RUN, null, 1)}\n`)
manifest()
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
  todayDesc.set(pair, { head: c.head, units: c.units, parts: c.parts, rows: `/rows/${pair}.json`, target, original: `/arxiv/${seg}.pdf`, classes: TOGGLES === 'on' ? CLASSES_ON : null })
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
  if ((v2.toggles ?? 'defaults') !== TOGGLES) {
    missing.push({ pair, why: `v2.mjs laid it under the toggles ${v2.toggles ?? 'defaults'}, the drawing is asked ${TOGGLES}` })
    todayDesc.delete(pair)
    continue
  }
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
      const f = hyphFileOf(name.slice(0, -'.json'.length))
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
// (the pairs that cannot be drawn, told before any is: a run that stops still names them)
RUN.missing = missing
manifest()
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
// (the pixel readings analyse.mjs makes with, pixels.mjs: its functions on the lab page's globalThis.parityPixels)
const pixelsJs = readFileSync(join(HERE, 'pixels.mjs'), 'utf8').replace(/^export /gm, '')
const pixelNames = [...pixelsJs.matchAll(/^(?:async )?function (\w+)|^const (\w+) =/gm)].map((m) => m[1] ?? m[2])
await labPage.addScriptTag({ content: `(() => {\n${pixelsJs}\nglobalThis.parityPixels = { ${pixelNames.join(', ')} }\n})()` })

for (const pair of pairs) {
  if (!todayDesc.has(pair)) continue
  if (RUN.stopped) {
    missing.push({ pair, why: RUN.stopped })
    continue
  }
  if (freeGiB() < MIN_FREE_GIB) {
    RUN.stopped = `the disk has under ${MIN_FREE_GIB} GiB free`
    console.log(`stopped: ${RUN.stopped}`)
    missing.push({ pair, why: RUN.stopped })
    continue
  }
  const t0 = Date.now()
  const paper = paperOf(pair)
  const target = /-([a-z]{2,3})$/.exec(pair)[1]
  const v2Bytes = readFileSync(join(WORK, 'v2', `${pair}.json`))
  const v2 = JSON.parse(v2Bytes.toString('utf8'))
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
  await vp.evaluate((o) => globalThis.__p.open(o), { paper, target, pages: v2.pages, classes: TOGGLES === 'on' ? CLASSES_ON : null })
  try {
    await vp.waitForFunction(() => globalThis.__p.state()?.layer.s === 'ready', null, { timeout: 60_000, polling: 100 })
  } catch {
    errors.v2.push(`not ready: ${JSON.stringify(await vp.evaluate(() => globalThis.__p.state()))}`)
  }
  // (the pages this run is to draw of the pair: every page of arXiv's, or those --pages names)
  const expected = Array.from({ length: opened.orig }, (_, i) => i + 1).filter((n) => !PAGES || PAGES.includes(n))
  const out = { pair, paper, target, run: RUN.id, v2: sha(v2Bytes), expected, opened, pages: [] }
  for (const n of expected) {
    const rec = { page: n }
    try {
      // the original
      const o = await tp.evaluate(([k, s]) => globalThis.today.original(k, s), [n, SCALE])
      const clip = { x: 0, y: 0, width: o.size[0], height: o.size[1] }
      const A = await shot(tp, clip)
      rec.view = o.view
      rec.original = { links: o.links, bordered: o.bordered, linkBoxes: o.linkBoxes, runs: o.runs, fonts: o.fonts }
      // today's
      await tp.evaluate(() => globalThis.today.textOnly(false))
      const t = await tp.evaluate(([k, s]) => globalThis.today.page(k, s), [n, SCALE])
      await frames(tp)
      const T = await shot(tp, clip)
      await tp.evaluate(() => globalThis.today.textOnly(true))
      await frames(tp)
      const Tt = await shot(tp, clip)
      await tp.evaluate(() => globalThis.today.textOnly(false))
      // (its drawing without its text: the copy, the original's ink it keeps, its crops and pastes)
      await tp.evaluate(() => globalThis.today.copyOnly(true))
      await frames(tp)
      const Tc = await shot(tp, clip)
      await tp.evaluate(() => globalThis.today.copyOnly(false))
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
      // (its translated text alone, its figure texts with it: the page's darkness is read outside them, analyse.mjs)
      await vp.evaluate(() => globalThis.__p.textOnly(true))
      await frames(vp)
      const Vt = await shot(vp, vclip)
      await vp.evaluate(() => globalThis.__p.textOnly(false))
      // (its drawing without its text: the page view's copy and the crops)
      await vp.evaluate(() => globalThis.__p.copyOnly(true))
      await frames(vp)
      const Vc = await shot(vp, vclip)
      await vp.evaluate(() => globalThis.__p.copyOnly(false))
      // the pixels: the panes, the text's darkness, the difference, each side against arXiv's page (analyse.mjs, in the lab's
      // own page)
      const boxes = boxesOf(rec, v2, n)
      const px = await labPage.evaluate(analyse, {
        A,
        T,
        Tt,
        Tc,
        V,
        Vt,
        Vc,
        view: o.view,
        boxes,
        textBoxes: textBoxesOf(rec, v2, n),
        ...fidelityOf(rec, v2, n, prepOf(paper)),
        scale: SCALE * DPR,
      })
      for (const [k, b64] of Object.entries(px.images)) writeFileSync(join(OUT, 'img', `${pair}-p${n}-${k}.webp`), Buffer.from(b64, 'base64'))
      delete px.images
      rec.px = px
    } catch (e) {
      rec.error = String(e?.message ?? e).slice(0, 300)
    }
    out.pages.push(rec)
  }
  // (today's sentence boxes of each page drawn, read once every page is: a unit's sentences are known once all its pages are told,
  // as in a reading session; today/entry.mjs litBoxes)
  for (const rec of out.pages) {
    if (rec.error || !rec.today?.committed || rec.today.shownOriginal) continue
    try {
      rec.today.litBoxes = await tp.evaluate(([k, s]) => globalThis.today.litBoxes(k, s), [rec.page, SCALE])
    } catch (e) {
      rec.error = `today's sentence boxes: ${String(e?.message ?? e).slice(0, 280)}`
    }
  }
  out.errors = errors
  writeFileSync(join(WORK, 'raw', `${pair}.json`), `${JSON.stringify(out)}\n`)
  console.log(`${pair}: ${out.pages.length} pages in ${((Date.now() - t0) / 1000).toFixed(0)} s; page errors today ${errors.today.length}, v2 ${errors.v2.length}${errors.v2.length ? ` (${errors.v2.slice(0, 2).join(' | ')})` : ''}`)
  await tp.evaluate(() => globalThis.today.dispose())
  await tc.close()
  await vp.evaluate(() => globalThis.__p.close())
  await vc.close()
}
RUN.missing = missing
RUN.done = true
manifest()
console.log(`missing: ${missing.map((m) => `${m.pair} (${m.why})`).join('; ') || 'none'}`)
console.log(`refused requests: ${refused.length}${refused.length ? ` (${refused.slice(0, 3).join(', ')})` : ''}`)
await browser.close()
await server.close()
// (the built page is made again on every run: not kept in the work directory)
rmSync(BUILD, { recursive: true, force: true })

/** today's prepare dump of a paper (the original's lines and elements of today's units), read once (`preps`) */
function prepOf(paper) {
  if (!preps.has(paper)) {
    const f = join(LAB, 'refactor-2026-11', 'baseline', 'prepare', `${paper}.prepare.json`)
    preps.set(paper, existsSync(f) ? new Map(json(f).units.map((u) => [u.ord, u])) : new Map())
  }
  return preps.get(paper)
}

/** a drawn line's band, PDF units: its ink across, 0.3 of its size under its baseline to 1.0 over (a turned line its box) */
function bandOf(l) {
  return l.rot ? [l.x0 - 0.5, l.y0 - 0.5, l.x1 + 0.5, l.y1 + 0.5] : [l.x0 - 0.5, l.y - 0.3 * l.size, l.x1 + 0.5, l.y + 1.0 * l.size]
}
/** a part line's box on A [x0, bottom, x1, top]; a prepare line's */
function partBox(l) {
  return [l[2], Math.min(l[5], l[6]), l[3], Math.max(l[5], l[6])]
}
function prepBox(l) {
  return [l.x0, Math.min(l.top, l.bottom), l.x1, Math.max(l.top, l.bottom)]
}
/** whether a crop is drawn where its source stands (its page, its box within half a point) */
function inPlace(c, n) {
  return c[10] === n && [1, 2, 3, 4].every((i) => c[i + 5] !== null && Math.abs(c[i] - c[i + 5]) <= 0.5)
}

/**
 * What analyse.mjs reads of each side's drawing against arXiv's page (pixels.mjs): each drawn group's bands (`groups`, by side:
 * today's units `t:<ord>`, figure texts `f:<id>`, names `n:<id>`; v2's members `p:<ord>`), the original's lines of every unit
 * either side draws (`origs`: the part's `p:<ord>`, today's prepare dump's `q:<ord>`), the figure texts' drawn boxes (outside
 * which the page's darkness is read), each side's translated units' original lines (`regions`, its figure texts aside) and its
 * crops drawn away from their source (`moved`), and each element's ink on A (`elements`, `<group>:<piece>`: v2's the part's
 * El.ink, today's its prepare dump's segments)
 */
function fidelityOf(rec, v2, n, prep) {
  const facts = new Map((v2.facts[n]?.members ?? []).map((m) => [m.ord, m]))
  const partOf = new Map(Object.entries(v2.today).map(([o, t]) => [t.today, Number(o)]))
  const drawnLines = (u) => u.lines.filter((l) => l.n > 0 && l.x0 !== null)
  const groups = {
    today: [
      ...(rec.today?.units ?? []).map((u) => ({ id: `t:${u.id}`, boxes: drawnLines(u).map(bandOf) })),
      ...(rec.today?.figures ?? []).map((u) => ({ id: `f:${u.id}`, boxes: drawnLines(u).map(bandOf) })),
      ...(rec.today?.names ?? []).map((u) => ({ id: `n:${u.id}`, boxes: drawnLines(u).map(bandOf) })),
    ],
    v2: (rec.v2?.units ?? []).map((u) => ({ id: `p:${u.id}`, boxes: drawnLines(u).map(bandOf) })),
  }
  const figBoxes = [
    ...(rec.today?.figures ?? []).flatMap(drawnLines),
    ...(rec.v2?.units ?? []).filter((u) => /figure/.test(facts.get(u.id)?.kind ?? '')).flatMap(drawnLines),
  ].map((l) => { const b = bandOf(l); return [b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1] })
  const onPage = (m) => (m?.lines ?? []).filter((l) => l[0] === n).map(partBox)
  const prepLines = (u) => (u?.lines ?? []).filter((l) => l.page === n && !l.rot).map(prepBox)
  const origs = [
    ...(rec.v2?.units ?? []).map((u) => ({ id: `p:${u.id}`, boxes: onPage(facts.get(u.id)) })),
    ...(rec.today?.units ?? []).map((u) => ({ id: `q:${u.id}`, boxes: prepLines(prep.get(u.id)) })),
  ].filter((o) => o.boxes.length)
  const text = (k) => !/figure/.test(k ?? '')
  const regions = {
    today: (rec.today?.units ?? []).flatMap((u) => {
      const m = facts.get(partOf.get(u.id))
      return m ? (text(m.kind) ? onPage(m) : []) : text(prep.get(u.id)?.kind) ? prepLines(prep.get(u.id)) : []
    }),
    v2: (rec.v2?.units ?? []).flatMap((u) => (text(facts.get(u.id)?.kind) ? onPage(facts.get(u.id)) : [])),
  }
  const moved = {
    today: (rec.today?.crops ?? []).filter((c) => !inPlace(c, n)).map((c) => c.slice(1, 5)),
    v2: (rec.v2?.crops ?? []).filter((c) => !inPlace(c, n)).map((c) => c.slice(1, 5)),
  }
  const elements = {
    today: (rec.today?.units ?? []).flatMap((u) =>
      (prep.get(u.id)?.elements ?? []).map((e) => ({ id: `${u.id}:${e.k}`, boxes: (e.segs ?? []).filter((g) => g.page === n).map(prepBox) })).filter((e) => e.boxes.length),
    ),
    v2: [...facts.values()].flatMap((m) => (m.els ?? []).map(([k, , boxes]) => ({ id: `${m.ord}:${k}`, boxes: boxes.map((b) => [b[0], b[1], b[2], b[3]]) })).filter((e) => e.boxes.length)),
  }
  return { figBoxes, groups, origs, regions, moved, elements }
}

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

