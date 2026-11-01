// lab/pdf/spikes/ocg-reader.mjs
// The reader's lab gate of the per-unit optional-content erasure (docs/route/ocg-erasure.md §4, §7.3, §8; the page:
// ocg-reader/page.mjs): a pack fixture's base (our marked final pass, base.pdf) wrapped as the maker child wraps it (layout/wrap.mjs
// wrapFinal), its pages laid by the engine in Chromium over the wrapped document and their copies drawn as the reader draws them;
// G1 (all ON is our page), G3a (what render A hides lies inside the drawn units' hidden rectangles) and render A's time against our
// page's, per page. Lab only: the arXiv-derived fixtures and everything made of them stay in the scratch directory named.
//   pnpm exec tsx lab/pdf/spikes/ocg-reader.mjs --pack=<dir> --sources=<dir> --fixture=1512.03385v1-zh [--pages=1-12] [--png=1,3] [--out=<dir>]
//   pnpm exec tsx lab/pdf/spikes/ocg-reader.mjs --pack=<dir> --sources=<dir> --timing=2307.16209v1-zh [--pages=1-147]
// <dir> holds fixtures/<name>/{base.pdf,layout.json,units.json,record.json}, geometry/<name>-geometry.json and data/fonts/;
// `--sources` the papers' sources, <id>/source.gz: the wrap's units are the paper's source units (live.mjs openPaper), never the
// record's translations.
// Chromium is Playwright's, new headless, GPU canvases (AXT_CPU=1: software); TeX's hyphenation patterns from TinyTeX (TEXMF_DIST).
import * as PL from '@cantoo/pdf-lib'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, normalize, resolve } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { chromium } from 'playwright'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const arg = (k, d = null) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const REPO = resolve(new URL('../../..', import.meta.url).pathname)
const PACK = resolve(arg('pack') ?? '')
const NAME = arg('fixture') ?? arg('timing')
const OUT = resolve(arg('out') ?? join(PACK, 'ocg-reader'))
const TEXMF = process.env.TEXMF_DIST ?? join(process.env.HOME ?? '', 'Library/TinyTeX/texmf-dist')
const range = s => s.split(',').flatMap(t => { const [a, b] = t.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a] })
if (!NAME || !existsSync(join(PACK, 'fixtures', NAME))) throw new Error(`no fixture ${NAME} under ${PACK}/fixtures`)
mkdirSync(join(OUT, NAME), { recursive: true })

// ---- the wrap, as the maker child makes it, kept by the base's digest
const FX = join(PACK, 'fixtures', NAME)
const baseBytes = new Uint8Array(readFileSync(join(FX, 'base.pdf')))
const digest = createHash('sha256').update(baseBytes).update(readFileSync(join(REPO, 'src/pdf-reader/engine/layout/wrap.mjs'))).update(readFileSync(join(REPO, 'src/pdf-reader/engine/layout/own.mjs'))).update(existsSync(join(FX, 'base.json')) ? readFileSync(join(FX, 'base.json')) : 'no record').digest('hex').slice(0, 16)
const wrappedPath = join(OUT, NAME, `wrapped-${digest}.pdf`), headPath = join(OUT, NAME, `wrapped-${digest}.json`), glyphsPath = join(OUT, NAME, `wrapped-${digest}-ink2.json`)
if (!existsSync(wrappedPath) || !existsSync(glyphsPath)) {
  const { wrapFinal } = await import(join(REPO, 'src/pdf-reader/engine/layout/wrap.mjs'))
  const { openPaper } = await import(join(REPO, 'src/pdf-reader/engine/pipeline/live.mjs'))
  const { unpackSource } = await import(join(REPO, 'src/pdf-reader/engine/source/tar.mjs'))
  const sourceGz = join(resolve(arg('sources') ?? ''), NAME.replace(/-[a-z]+$/, ''), 'source.gz')
  if (!existsSync(sourceGz)) throw new Error(`no source at ${sourceGz} (--sources)`)
  const opened = openPaper((await unpackSource(new Uint8Array(readFileSync(sourceGz)))).files), units = opened.units
  const t0 = performance.now()
  const r = await wrapFinal(baseBytes, {
    PL, getDocument, OPS, units, texts: (existsSync(join(FX, 'base.json')) ? JSON.parse(readFileSync(join(FX, 'base.json'), 'utf8'))?.texts : null) ?? null, inkless: (existsSync(join(FX, 'base.json')) ? JSON.parse(readFileSync(join(FX, 'base.json'), 'utf8'))?.inkless : null) ?? null, names: opened.theoremNames ?? null, documentOptions: { verbosity: 0, useSystemFonts: false, isEvalSupported: false, fontExtraProperties: true, standardFontDataUrl: join(REPO, 'node_modules/pdfjs-dist/standard_fonts/'), cMapUrl: join(REPO, 'node_modules/pdfjs-dist/cmaps/'), cMapPacked: true },
    deflate: b => new Uint8Array(deflateSync(b, { level: 6 })), inflate: (b, limit) => new Uint8Array(inflateSync(b, { maxOutputLength: limit + 1 })), keepOwned: true,
  })
  if ('refused' in r) throw new Error(`wrap refused: ${r.refused}: ${r.why}`)
  writeFileSync(wrappedPath, r.bytes)
  writeFileSync(headPath, JSON.stringify({ stats: r.stats, unhidden: r.unhidden, labelKept: r.labelKept, own: r.own, ms: Math.round(performance.now() - t0) }))
  // (each page's glyphs as ownership read them, with their group, in device px at the page's k (2.5), y down: what a hidden pixel
  // outside the layout file's rectangles belongs to)
  const { pageInk } = await import(join(REPO, 'src/pdf-reader/engine/layout/ink.mjs'))
  const task = getDocument({ data: baseBytes.slice(), verbosity: 0, fontExtraProperties: true, standardFontDataUrl: join(REPO, 'node_modules/pdfjs-dist/standard_fonts/'), cMapUrl: join(REPO, 'node_modules/pdfjs-dist/cmaps/'), cMapPacked: true })
  const doc = await task.promise, glyphs = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), vp = page.getViewport({ scale: 2.5 })
    const ink = pageInk(OPS, await page.getOperatorList(), page.commonObjs, { rotate: page.rotate, indices: true })
    const G = r.owned.glyphs[p - 1] ?? []
    const B = r.owned.boxes?.[p - 1] ?? []
    const dev = (x0, y0, x1, y1) => { const [a, b] = vp.convertToViewportPoint(x0, y0), [c, d] = vp.convertToViewportPoint(x1, y1); return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)] }
    // (its painted paths too: a rule or a bar a unit owns)
    const paths = []
    for (let b = 0; 4 * b + 3 < ink.boxes.length; b++) if (ink.paths[b] >= 0 && B[b]) paths.push([B[b], ...dev(ink.boxes[4 * b], ink.boxes[4 * b + 1], ink.boxes[4 * b + 2], ink.boxes[4 * b + 3]), 'path'])
    glyphs.push([...ink.glyphs.map((g, i) => [G[i] ?? null, ...dev(Math.min(g.x0, g.ix0), g.bottom, Math.max(g.x1, g.ix1), g.top)]), ...paths])
    page.cleanup()
  }
  await task.destroy()
  writeFileSync(glyphsPath, JSON.stringify(glyphs))
}

// ---- the server: the page, the engine, PDF.js, the fixture, the faces, TeX's patterns
const HYPH = new Map()
const { patternsOfTex, TEX_PATTERN_FILES, TEX_PATTERN_ENCODINGS } = await import(join(REPO, 'src/pdf-reader/engine/layer-proto/hyph.mjs'))
// (each file in its encoding: hyph-utf8's French, Spanish and Portuguese are UTF-8, TeX's 8-bit files Latin-1)
for (const [lang, rel] of Object.entries(TEX_PATTERN_FILES)) if (existsSync(join(TEXMF, rel))) HYPH.set(lang, JSON.stringify(patternsOfTex(readFileSync(join(TEXMF, rel), TEX_PATTERN_ENCODINGS[lang]), TEX_PATTERN_ENCODINGS[lang])))
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.pdf': 'application/pdf', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.wasm': 'application/wasm' }
const fileOf = path => {
  const at = (root, rest) => { const f = normalize(join(root, decodeURIComponent(rest))); return f.startsWith(root) ? f : null }
  if (path === '/') return join(REPO, 'lab/pdf/spikes/ocg-reader/index.html')
  if (path.startsWith('/page/')) return at(join(REPO, 'lab/pdf/spikes/ocg-reader'), path.slice(6))
  if (path.startsWith('/engine/')) return at(join(REPO, 'src/pdf-reader/engine'), path.slice(8))
  if (path.startsWith('/pdfjs/')) return at(join(REPO, 'node_modules/pdfjs-dist'), path.slice(7))
  if (path.startsWith('/zod/')) return at(join(REPO, 'node_modules/zod'), path.slice(5))
  if (path.startsWith('/fonts/')) return at(join(PACK, 'data/fonts'), path.slice(7))
  if (path === `/fx/${NAME}/wrapped.pdf`) return wrappedPath
  if (path === `/fx/${NAME}/wrapped.json`) return headPath
  if (path === `/fx/${NAME}/glyphs.json`) return glyphsPath
  if (path === `/fx/${NAME}/geometry.json`) return join(PACK, 'geometry', `${NAME}-geometry.json`)
  if (path.startsWith(`/fx/${NAME}/`)) return at(FX, path.slice(NAME.length + 5))
  return null
}
// (the engine's own `../../../core/…` imports clamp at the root and name /core, the repository's src/core: TypeScript transpiled as
// it is served, a directory's module sent to its index)
const ESBUILD = createRequire(join(REPO, 'node_modules/tsx/package.json'))('esbuild')
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path.startsWith('/core/')) {
    const at = normalize(join(REPO, 'src/core', decodeURIComponent(path.slice(6))))
    const found = [at, `${at}.ts`, join(at, 'index.ts')].find(f => f.startsWith(join(REPO, 'src/core')) && existsSync(f) && /\.(ts|mjs|js)$/.test(f) && !f.endsWith('/'))
    if (!found) { res.writeHead(404); res.end(); return }
    if (found.endsWith('index.ts') && !at.endsWith('index.ts')) { res.writeHead(302, { location: `${path.replace(/\/+$/, '')}/index.ts` }); res.end(); return }
    const code = readFileSync(found, 'utf8')
    res.writeHead(200, { 'content-type': 'text/javascript' })
    res.end(found.endsWith('.ts') ? ESBUILD.transformSync(code, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile: found }).code : code)
    return
  }
  if (path.startsWith('/hyph/')) { const j = HYPH.get(path.slice(6, -5)); res.writeHead(j ? 200 : 404, { 'content-type': 'application/json' }); res.end(j ?? 'null'); return }
  const f = fileOf(path)
  if (!f || !existsSync(f)) { if (process.env.AXT_TRACE) console.error('404', path); res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise(ok => server.listen(0, '127.0.0.1', ok))
const url = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch({ channel: 'chromium', args: process.env.AXT_CPU === '1' ? ['--disable-gpu'] : [] })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
  page.on('pageerror', e => console.error('page:', e.message))
  await page.goto(url)
  await page.waitForFunction(() => !!window.ocg)
  if (arg('timing')) {
    const r = await page.evaluate(o => window.ocg.timing(o), { name: NAME, pages: range(arg('pages') ?? '1-12') })
    writeFileSync(join(OUT, NAME, 'timing.json'), JSON.stringify(r, null, 1))
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1] }
    const p95 = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] }
    const col = k => r.rows.map(x => x[k])
    console.log(JSON.stringify({ fixture: NAME, groups: r.groups, configMs: Math.round(r.configMs), pages: r.rows.length, coldA: [med(col('a')), p95(col('a'))], coldBase: [med(col('base')), p95(col('base'))], warmA: [med(col('aWarm')), p95(col('aWarm'))], warmBase: [med(col('baseWarm')), p95(col('baseWarm'))] }))
  } else {
    const pngs = range(arg('png') ?? '0').filter(Boolean)
    const r = await page.evaluate(o => window.ocg.run(o), { name: NAME, target: NAME.split('-').at(-1), pages: range(arg('pages') ?? '1-12'), png: pngs, explain: process.argv.includes('--explain') })
    const head = JSON.parse(readFileSync(headPath, 'utf8'))
    writeFileSync(join(OUT, NAME, 'run.json'), JSON.stringify({ head, ...r }, null, 1))
    for (const p of pngs) { const el = await page.$(`#page-${p}`); if (el) await el.screenshot({ path: join(OUT, NAME, `copy-${p}.png`) }) }
    for (const x of r.pages) if (x.onPng) { writeFileSync(join(OUT, NAME, `on-${x.p}.png`), Buffer.from(x.onPng.split(',')[1], 'base64')); delete x.onPng }
    console.log(JSON.stringify({ fixture: NAME, wrap: { ...head.stats, ms: head.ms }, N: r.N, groups: r.groups, drawn: r.drawn, hiding: r.hiding, skipped: r.skipped }))
    for (const x of r.pages) console.log(JSON.stringify(x))
  }
} finally { await browser.close(); server.close() }
