// Stage 3 (S3a): the TeX page's static site, built into out/tex-site — what a CDN would serve, in its versioned layout:
//   tex.html                the entry (short-lived), loading the page's version
//   c/<cv>/                 the page: tex.js, tex-page.mjs, texlyre-busytex's runner (lib/), build.json; legal/: the
//                           licences, and the source the AGPL asks for (NOTICE.txt says what is where)
//   e/<eid>/                the engine: BusyTeX with our patches (busytex/research.diff, tree.diff, tex-log.diff,
//                           xdvipdfmx.diff), its worker
//                           (poc-site/tex-worker.js after poc-site/tex-tree.mjs), and the preloaded tier split by engine
//                           into tl-common, tl-pdftex, tl-xetex, tl-rest (Emscripten's file packager, no LZ4: served
//                           with brotli)
//   t/<tid>/                the TeX Live tree (served from TEXLIVE_TREE by tex-page/serve.mjs; tree.json says where):
//                           <tid> is its files' paths and contents alone; its file index (poc-site/tex-tree.mjs)
//                           beside them as index-<iid>.txt, <iid> the index's own content, named in build.json
//   b/<bid>.bin             the manifest's files of the engines, in bundles (both engines', each engine's own): one
//                           object for each, its version its content's
// build.json gives the SHA-256 of every file the page fetches ahead (the engine, its preloads, the bundles, the index,
// the faces): a file handed over by the page's framer is kept only when its bytes are those
// and out/tex-upload/<cv>.tsv, the upload list: every object with the local file to store and its headers
// (upload.mjs; the first build makes the brotli copy of every file of the tree, about 30 minutes, kept by content)
// Every version is a content address of what it holds. A brotli copy (quality 11) of every file under b/, c/, e/ and
// of the index sits beside it (.br), and of every file the manifest names in out/tex-br/; serve.mjs sends them.
//
// Inputs: data/busytex-site (setup.mjs), the TeX Live tree texlive-server serves (TEXLIVE_TREE, by default the one
// beside the corpus), tex-page/measured.json (derive.mjs: which preloaded files each engine's compiles open, and the
// manifest's keys), Emscripten's file packager (tools/file_packager.py of the version BusyTeX was built with, fetched
// into out/ once; Python 3).
//   [REHASH=1] [FRAMERS=<origins>] node experiments/pdf-bilingual/tex-page/build.mjs
//   REHASH: hash the whole tree again, for publishing; FRAMERS: the origins that may drive the page (build.json)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { everyFileAhead } from '../poc-site/tex-page.mjs'
import { parseIndex, resolve } from '../poc-site/tex-tree.mjs'
import { buildManifest, REFERENCE, scannedOnly, slimSets, worth } from './manifest.mjs'
import { brotliSizes, brotliTo } from './sizes.mjs'
import { writeUploadList } from './upload.mjs'
import { hashTree, indexName, treeIndex, treeVersion, versionOf } from './tree.mjs'

const HERE = new URL('.', import.meta.url).pathname
const EXP = join(HERE, '..')
const OUT = join(EXP, 'out/tex-site')
const WORK = join(EXP, 'out/tex-build')
const BUSYTEX = join(EXP, 'data/busytex-site/busytex')
const EMSCRIPTEN = '5.0.4'
const TREE = process.env.TEXLIVE_TREE ?? join(dirname(realpathSync(join(EXP, 'data/corpus'))), 'tl2026/2026/texmf-dist')
const measured = JSON.parse(readFileSync(join(HERE, 'measured.json'), 'utf8'))
const t0 = Date.now()
const say = s => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${s}`)
const sha = b => createHash('sha256').update(b).digest('hex')
for (const need of [BUSYTEX, TREE]) if (!existsSync(need)) throw new Error(`missing ${need} (README.md, Setup)`)

// ---------------------------------------------------------------- 1. BusyTeX's preloaded tier, unpacked

/** texlive-basic.js → { files: [{ filename, start, end }], compressed: { offsets, sizes, successes } } */
function packageMeta(js) {
  const code = js.split('\n').filter(l => !l.startsWith('//')).join('\n')
  const json = (from, open) => {
    let at = code.indexOf(open, from), depth = 0
    const start = at
    for (; at < code.length; at++) {
      if (code[at] === '{') depth++
      else if (code[at] === '}' && --depth === 0) break
    }
    return JSON.parse(code.slice(start, at + 1))
  }
  return { files: json(code.lastIndexOf('loadPackage({"files"'), '{').files, compressed: json(code.indexOf('var compressedData = '), '{') }
}

/** Emscripten's LZ4 package format: 2,048-byte chunks, each an LZ4 block or stored as it is */
function lz4Block(src, outLength) {
  const out = new Uint8Array(outLength)
  let p = 0, o = 0
  while (p < src.length) {
    const token = src[p++]
    let literal = token >> 4
    if (literal === 15) for (let b = 255; b === 255;) { b = src[p++]; literal += b }
    out.set(src.subarray(p, p + literal), o)
    p += literal; o += literal
    if (p >= src.length) break
    const offset = src[p] | (src[p + 1] << 8)
    p += 2
    let match = token & 15
    if (match === 15) for (let b = 255; b === 255;) { b = src[p++]; match += b }
    match += 4
    for (let k = 0; k < match; k++, o++) out[o] = out[o - offset]
  }
  return out
}

function unpackBasic(dir) {
  const meta = packageMeta(readFileSync(join(BUSYTEX, 'texlive-basic.js'), 'utf8'))
  const done = join(dir, '.done')
  if (existsSync(done)) return meta.files.map(f => f.filename)
  const data = readFileSync(join(BUSYTEX, 'texlive-basic.data'))
  const { offsets, sizes, successes } = meta.compressed
  const CHUNK = 2048
  const total = meta.files.reduce((n, f) => Math.max(n, f.end), 0)
  const chunk = n => {
    const raw = data.subarray(offsets[n], offsets[n] + sizes[n])
    return successes[n] ? lz4Block(raw, Math.min(CHUNK, total - n * CHUNK)) : raw
  }
  for (const f of meta.files) {
    const out = new Uint8Array(f.end - f.start)
    for (let n = Math.floor(f.start / CHUNK), at = 0; at < out.length; n++) {
      const c = chunk(n), from = Math.max(f.start - n * CHUNK, 0), to = Math.min(f.end - n * CHUNK, c.length)
      out.set(c.subarray(from, to), at)
      at += to - from
    }
    const path = join(dir, f.filename)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, out)
  }
  writeFileSync(done, '')
  return meta.files.map(f => f.filename)
}
const BASIC = join(WORK, 'basic')
const basic = unpackBasic(BASIC)
say(`the preloaded tier: ${basic.length} files`)

// ---------------------------------------------------------------- 2. the tree and its index

const DIST = '/texlive/texmf-dist/'
const bytesOf = p => readFileSync(p)
/** the tree's paths that hold the same bytes as the preloaded tier's copy: kpathsea found those in the tier first */
const inBasic = new Set()
for (const f of basic) {
  if (!f.startsWith(DIST)) continue
  const rel = f.slice(DIST.length), t = join(TREE, rel)
  if (existsSync(t) && statSync(t).size === statSync(join(BASIC, f)).size && sha(bytesOf(t)) === sha(bytesOf(join(BASIC, f)))) inBasic.add(rel)
}
// the index: every file of the tree, the search paths of BusyTeX's texmf.cnf (TeX Live 2026's), kpathsea's order among
// files of one name (poc-site/tex-tree.mjs; tex-page/kpathsea-check.mjs holds it against TeX Live's kpsewhich)
const { paths, text } = treeIndex(TREE, readFileSync(join(BUSYTEX, 'texmf.cnf'), 'utf8'))
// the tree's version is its files alone (paths and contents): every file stays at t/<tid>/<path> for good, and a change
// of the index's rules is a new index file beside them (index-<iid>.txt), named in the page's build.json
// REHASH=1: every file hashed again, as a build for publishing must be (33 s)
const hashes = hashTree(TREE, paths, join(WORK, 'tree-hashes.json'), { rehash: !!process.env.REHASH })
const tid = treeVersion([...hashes])
const INDEX = indexName(text)
const index = parseIndex(text)
say(`the tree: ${paths.length} files, ${index.names.size} basenames (${[...index.names.values()].filter(p => p.length > 1).length} held more than once, ${index.dependent.size} answered by program), ${inBasic.size} as the preloaded tier holds them; tid ${tid}, ${INDEX}`)

// ---------------------------------------------------------------- 3. the preloaded tier split by engine

// what is worth fetching ahead over the reference link (manifest.mjs worth): a file the share of the papers needs
const keep = worth(REFERENCE)
const opened = new Set(basic.filter(f => Object.values(measured.opened).some(d => d.shares[f] !== undefined)))
const basicSizes = await brotliSizes([...opened].map(f => join(BASIC, f)))
const kept = Object.fromEntries(Object.entries(measured.opened).map(([engine, { shares }]) => [engine, new Set(Object.entries(shares)
  .filter(([f, share]) => !scannedOnly(engine, f) && basicSizes.has(join(BASIC, f)) && keep(basicSizes.get(join(BASIC, f)), share)).map(([f]) => f))]))
const parts = slimSets(basic, kept, {
  // the tier's small files the tree does not hold as they are (configuration, maps; not other engines' formats and
  // caches), and its configuration outside the tree: a compile could not fetch them
  always: p => statSync(join(BASIC, p)).size < 256 * 1024 && !/\/texmf-var\/(web2c|luatex-cache)\//.test(p) && (!p.startsWith(DIST) || !inBasic.has(p.slice(DIST.length))),
})
say(`parts: ${Object.entries(parts).map(([k, v]) => `${k} ${v.length}`).join(', ')}`)

const emscripten = join(EXP, `out/emscripten-${EMSCRIPTEN}`)
if (!existsSync(join(emscripten, 'tools/file_packager.py'))) execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', EMSCRIPTEN, 'https://github.com/emscripten-core/emscripten', emscripten], { stdio: 'inherit' })
const emConfig = join(WORK, 'emscripten-config')
mkdirSync(join(WORK, 'em/bin'), { recursive: true })
// the packager needs a configuration, though it uses none of its tools
writeFileSync(emConfig, `LLVM_ROOT = '${join(WORK, 'em/bin')}'\nBINARYEN_ROOT = '${join(WORK, 'em')}'\nNODE_JS = '${process.execPath}'\n`)

const stageAll = join(WORK, 'stage')
rmSync(stageAll, { recursive: true, force: true })
const engineDir = join(WORK, 'engine')
rmSync(engineDir, { recursive: true, force: true })
mkdirSync(engineDir, { recursive: true })
for (const [name, files] of Object.entries(parts)) {
  const stage = join(stageAll, name)
  for (const f of files) {
    mkdirSync(dirname(join(stage, f)), { recursive: true })
    linkSync(join(BASIC, f), join(stage, f))
  }
  execFileSync('python3', [join(emscripten, 'tools/file_packager.py'), `tl-${name}.data`, '--preload', `${stage}@/`, `--js-output=tl-${name}.js`, '--export-name=BusytexPipeline'], { cwd: engineDir, env: { ...process.env, EM_CONFIG: emConfig }, stdio: ['ignore', 'ignore', 'pipe'] })
}
say('packages made')

// ---------------------------------------------------------------- 4. the engine

const patched = join(WORK, 'patched')
rmSync(patched, { recursive: true, force: true })
mkdirSync(patched, { recursive: true })
for (const f of ['busytex.js', 'busytex_pipeline.js', 'busytex_biber.js']) copyFileSync(join(BUSYTEX, f), join(patched, f))
execFileSync('patch', ['-s', '-p0', '-d', patched, '-i', join(EXP, 'busytex/research.diff')])
execFileSync('patch', ['-s', '-p0', '-d', patched, '-i', join(EXP, 'busytex/tree.diff')])
execFileSync('patch', ['-s', '-p0', '-d', patched, '-i', join(EXP, 'busytex/tex-log.diff')])
execFileSync('patch', ['-s', '-p0', '-d', patched, '-i', join(EXP, 'busytex/xdvipdfmx.diff')])
for (const f of ['busytex.js', 'busytex_pipeline.js', 'busytex_biber.js']) copyFileSync(join(patched, f), join(engineDir, f))
copyFileSync(join(BUSYTEX, 'busytex_worker.js'), join(engineDir, 'busytex_worker_busytex.js'))
const treeCode = readFileSync(join(EXP, 'poc-site/tex-tree.mjs'), 'utf8').replace(/^export /gm, '')
writeFileSync(join(engineDir, 'busytex_worker.js'), `${treeCode}\n${readFileSync(join(EXP, 'poc-site/tex-worker.js'), 'utf8')}`)
for (const f of ['busytex.wasm', 'biber.js', 'biber.wasm', 'biber.data']) symlinkSync(realpathSync(join(BUSYTEX, f)), join(engineDir, f))
const engineFiles = readdirSync(engineDir).sort()
const eid = versionOf(...engineFiles.flatMap(f => [f, readFileSync(join(engineDir, f))]))

// ---------------------------------------------------------------- 5. the page, its build.json

/** the programs of an engine's compiles: a key of its manifest is handed to all of them */
const PROGRAMS_OF = { pdflatex: ['pdflatex', 'bibtex8', 'makeindex'], xelatex: ['xelatex', 'xdvipdfmx', 'bibtex8', 'makeindex'] }
/** a manifest key's file: the one every program of the engine (all, for a script's) would fetch; null when they differ,
 *  and the key is left to the compile, which asks for it as the program it is */
const pathOf = (key, engine) => {
  const at = key.indexOf('/'), format = Number(key.slice(0, at)), name = key.slice(at + 1)
  const answers = new Set((PROGRAMS_OF[engine] ?? Object.keys(PROGRAMS_OF).flatMap(e => PROGRAMS_OF[e])).map(program => resolve(index, format, name, program)))
  return answers.size === 1 ? [...answers][0] : null
}
const candidates = [...new Set([...Object.values(measured.fetched.groups), ...Object.values(measured.fetched.pooled)].flatMap(d => Object.keys(d.shares)))]
const treeSizes = await brotliSizes(candidates.map(pathOf).filter(Boolean).map(p => join(TREE, p)))
const keys = buildManifest(measured.fetched, (key, share) => { const p = pathOf(key); return !!p && keep(treeSizes.get(join(TREE, p)), share) })
const entry = key => {
  const at = key.indexOf('/'), format = Number(key.slice(0, at)), name = key.slice(at + 1), path = pathOf(key)
  return [format, name, path, statSync(join(TREE, path)).size]
}
const manifest = {
  engines: Object.fromEntries(Object.entries(keys.engines).map(([e, list]) => [e, list.map(entry)])),
  fonts: Object.fromEntries(Object.entries(keys.fonts).map(([s, list]) => [s, list.map(entry)])),
}
const pageDir = join(WORK, 'page')
rmSync(pageDir, { recursive: true, force: true })
mkdirSync(join(pageDir, 'lib'), { recursive: true })
// the engines' common files in bundles, one object each — the files both engines' manifests name, and each engine's
// own: a first visit asks for a handful of objects, not hundreds (a CDN's request limits and price, the round trips).
// Each is b/<its content's version>.bin, so that a new page keeps the bundles whose files did not change
const bundleDir = join(WORK, 'bundles')
rmSync(bundleDir, { recursive: true, force: true })
mkdirSync(bundleDir, { recursive: true })
{
  const pathsOf = e => new Set((manifest.engines[e] ?? []).map(entry => entry[2]))
  const P = pathsOf('pdflatex'), X = pathsOf('xelatex')
  const groups = { common: [...P].filter(p => X.has(p)), pdflatex: [...P].filter(p => !X.has(p)), xelatex: [...X].filter(p => !P.has(p)) }
  manifest.bundles = {}
  for (const [name, list] of Object.entries(groups)) {
    if (!list.length) continue
    const files = []
    let offset = 0
    const parts = list.sort().map(p => { const b = readFileSync(join(TREE, p)); files.push([p, offset, b.length]); offset += b.length; return b })
    const bytes = Buffer.concat(parts)
    const bid = versionOf(JSON.stringify(files), bytes)
    writeFileSync(join(bundleDir, `${bid}.bin`), bytes)
    manifest.bundles[name] = { url: `/b/${bid}.bin`, size: offset, files }
  }
}
for (const f of ['tex.js', 'tex-page.mjs']) copyFileSync(join(EXP, 'poc-site', f), join(pageDir, f))
// the licences and the offer of the source, with the page they cover (c/<cv>/legal/, linked from tex.html): BusyTeX
// is under the GNU AGPL, version 3 or later (texlyre-busytex), our page, worker and patches under the GNU GPL, version
// 3 (this repository's), and the two run as one program, so its source is offered as the AGPL asks: ours here as it
// was built, BusyTeX's and TeX Live's at the addresses NOTICE.txt gives. The tree under t/ is under TeX Live's terms
// (LICENSE.TL, LICENSE.CTAN) and each package's own
{
  const legal = join(pageDir, 'legal')
  const SOURCE = ['package.json', 'setup.mjs', 'spikes/make-metafont.mjs', 'poc-site/tex.js', 'poc-site/tex-page.mjs', 'poc-site/tex-worker.js', 'poc-site/tex-tree.mjs', 'busytex/research.diff', 'busytex/tree.diff', 'busytex/tex-log.diff', 'busytex/xdvipdfmx.diff', 'tex-page/build.mjs', 'tex-page/tree.mjs', 'tex-page/kpathsea.mjs', 'tex-page/manifest.mjs', 'tex-page/sizes.mjs', 'tex-page/measured.json']
  for (const f of SOURCE) { mkdirSync(dirname(join(legal, 'source', f)), { recursive: true }); copyFileSync(join(EXP, f), join(legal, 'source', f)) }
  copyFileSync(join(EXP, 'node_modules/texlyre-busytex/LICENSE'), join(legal, 'AGPL-3.0.txt'))
  copyFileSync(join(EXP, '../../LICENSE'), join(legal, 'GPL-3.0.txt'))
  for (const f of ['LICENSE.TL', 'LICENSE.CTAN']) copyFileSync(join(dirname(TREE), f), join(legal, f))
  copyFileSync(join(BUSYTEX, 'versions.txt'), join(legal, 'busytex-versions.txt'))
  const busytex = JSON.parse(readFileSync(join(EXP, 'node_modules/texlyre-busytex/package.json'), 'utf8')).version
  writeFileSync(join(legal, 'NOTICE.txt'), `The TeX page of Read arXiv: TeX in the browser, for the reader's bilingual PDFs.

The engine under /e/ is BusyTeX as texlyre-busytex ${busytex} publishes it, with our patches: free software under the
GNU Affero General Public License, version 3 or later (AGPL-3.0.txt). This page (tex.js, tex-page.mjs), its worker
(tex-worker.js, tex-tree.mjs) and the patches are Read arXiv's, under the GNU General Public License, version 3
(GPL-3.0.txt; https://github.com/SRjoeee/ReadarXiv). They run with BusyTeX as one program, whose complete corresponding
source is offered here:
  - this page's and its worker's, our patches to BusyTeX, and the build that made this site: source/ (setup.mjs
    fetches BusyTeX's published files and applies source/busytex/research.diff; tex-page/build.mjs builds the site,
    applying source/busytex/tree.diff, source/busytex/tex-log.diff and source/busytex/xdvipdfmx.diff);
  - BusyTeX's: https://github.com/TeXlyre/texlyre-busytex/tree/v${busytex}, its published files
    https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v${busytex}, and the sources those were built from
    (busytex-versions.txt: TeX Live 2026, expat, fontconfig, Emscripten).

The TeX Live tree under /t/ is TeX Live 2026's texmf-dist, under TeX Live's terms (LICENSE.TL) and CTAN's
(LICENSE.CTAN), each package under its own licence (its files in the tree say which); TeX Live's sources:
https://tug.org/texlive/ . One directory is added: fonts/tfm/axt-metafont/, the metrics of LH Cyrillic fonts TeX Live
does not ship, made by TeX Live's own METAFONT (mktextfm) from the LH fonts' sources in the tree, under their licence
(the LaTeX Project Public License; source/spikes/make-metafont.mjs makes them).
`)
}
copyFileSync(join(EXP, 'node_modules/texlyre-busytex/dist/index.js'), join(pageDir, 'lib/index.js'))
const EXTRA = join(EXP, 'data/pk-flat')
const extra = existsSync(EXTRA) ? readdirSync(EXTRA) : []
if (extra.length) { mkdirSync(join(pageDir, 'extra')); for (const f of extra) copyFileSync(join(EXTRA, f), join(pageDir, 'extra', f)) }
const size = f => statSync(join(engineDir, f)).size
const build = {
  eid, tid,
  engine: `/e/${eid}/`, tree: `/t/${tid}/`, index: INDEX,
  packages: Object.fromEntries(Object.keys(parts).map(p => [p, size(`tl-${p}.data`)])),
  wasm: size('busytex.wasm'),
  engines: { pdflatex: ['common', 'pdftex'], xelatex: ['common', 'xetex'] },
  manifest, extra,
  // FRAMERS: the origins that may drive the page, comma-separated (the store's extension, the development one
  // chrome-extension://llohepijpkbbfhjolcichpamiokeecab, https://app.readarxiv.org); unset, on this machine: any extension
  framers: (process.env.FRAMERS ?? '').split(',').map(o => o.trim()).filter(Boolean),
}
// the SHA-256 of every file the page fetches ahead for some visit (tex-page.mjs everyFileAhead), by its address: a
// file the framer hands over is kept only when its bytes are these (another extension that frames the page over arXiv
// shares its partition: the warm-up review's I1)
{
  const bytesAt = url => {
    if (url.startsWith(build.engine)) return readFileSync(join(engineDir, url.slice(build.engine.length)))
    if (url.startsWith('/b/')) return readFileSync(join(bundleDir, url.slice('/b/'.length)))
    if (url === `${build.tree}${INDEX}`) return Buffer.from(text)
    if (url.startsWith(build.tree)) return readFileSync(join(TREE, decodeURIComponent(url.slice(build.tree.length))))
    throw new Error(`${url}: fetched ahead, and no file of this build`)
  }
  build.sha256 = Object.fromEntries(everyFileAhead(build).map(url => [url, sha(bytesAt(url))]))
}
const cv = versionOf(JSON.stringify(build), ...readdirSync(pageDir, { recursive: true }).sort().filter(f => statSync(join(pageDir, f)).isFile()).flatMap(f => [f, readFileSync(join(pageDir, f))]))
writeFileSync(join(pageDir, 'build.json'), JSON.stringify({ cv, page: `/c/${cv}/`, ...build }))

// ---------------------------------------------------------------- 6. the site, with brotli copies

rmSync(OUT, { recursive: true, force: true })
const place = (from, to) => { mkdirSync(dirname(to), { recursive: true }); execFileSync('cp', ['-R', from, to]) }
place(pageDir, join(OUT, 'c', cv))
place(engineDir, join(OUT, 'e', eid))
place(bundleDir, join(OUT, 'b'))
mkdirSync(join(OUT, 't', tid), { recursive: true })
writeFileSync(join(OUT, 't', tid, INDEX), text)
writeFileSync(join(OUT, 'tex.html'), `<!doctype html><meta charset="utf-8"><title>TeX</title><link rel="license" href="/c/${cv}/legal/NOTICE.txt"><script type="module" src="/c/${cv}/tex.js"></script>\n`)
writeFileSync(join(OUT, 'tree.json'), JSON.stringify({ tid, index: INDEX, root: TREE }))

const BR = join(EXP, 'out/tex-br')
const site = readdirSync(OUT, { recursive: true }).map(f => join(OUT, f)).filter(f => statSync(f).isFile() && /\/(b|c|e|t)\//.test(f))
const treeFiles = [...new Set([...Object.values(manifest.engines), ...Object.values(manifest.fonts)].flat().map(e => e[2]))]
const jobs = [...site.map(f => [f, `${f}.br`]), ...treeFiles.map(p => [join(TREE, p), join(BR, 't', tid, `${p}.br`)])]
for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map(([f, to]) => brotliTo(f, to)))
say(`brotli: ${jobs.length} files`)

const sum = files => files.reduce((n, f) => n + statSync(f).size, 0)
const mb = n => `${(n / 1e6).toFixed(2)} MB`
for (const p of Object.keys(parts)) say(`tl-${p}: ${parts[p].length} files, ${mb(size(`tl-${p}.data`))} raw, ${mb(statSync(join(OUT, 'e', eid, `tl-${p}.data.br`)).size)} brotli`)
for (const [k, list] of [...Object.entries(manifest.engines), ...Object.entries(manifest.fonts)]) say(`manifest ${k}: ${list.length} entries, ${new Set(list.map(e => e[2])).size} files, ${mb(sum([...new Set(list.map(e => e[2]))].map(p => join(TREE, p))))} raw, ${mb(sum([...new Set(list.map(e => e[2]))].map(p => join(BR, 't', tid, `${p}.br`))))} brotli`)
for (const [k, b] of Object.entries(manifest.bundles)) say(`bundle ${k} (${b.url}): ${b.files.length} files, ${mb(b.size)} raw, ${mb(statSync(join(OUT, `${b.url.slice(1)}.br`)).size)} brotli`)
say(`index: ${mb(statSync(join(OUT, 't', tid, INDEX)).size)} raw, ${mb(statSync(join(OUT, 't', tid, `${INDEX}.br`)).size)} brotli`)

// ---------------------------------------------------------------- 7. the upload list (upload.mjs; verify.mjs checks the bucket)

const LIST = join(EXP, 'out/tex-upload', `${cv}.tsv`)
const rows = await writeUploadList({ site: OUT, tree: TREE, tid, hashes, out: LIST, say })
for (const top of ['b', 'c', 'e', 't', 'tex.html']) {
  const of = rows.filter(r => r.key === top || r.key.startsWith(`${top}/`))
  say(`upload ${top}: ${of.length} objects, ${of.filter(r => r.encoding).length} as brotli, ${mb(of.reduce((n, r) => n + r.bytes, 0))} stored`)
}
say(`upload list: ${relative(process.cwd(), LIST)}`)
say(`built: c/${cv} e/${eid} t/${tid} in ${relative(process.cwd(), OUT)}`)
