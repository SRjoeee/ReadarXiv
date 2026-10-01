// Stage 3 (S3a): the TeX page's static site, built into out/tex-site — what a CDN would serve, in its versioned layout:
//   tex.html                the entry (short-lived), loading the page's version
//   c/<cv>/                 the page: tex.js, tex-page.mjs, texlyre-busytex's runner (lib/), build.json
//   e/<eid>/                the engine: BusyTeX with our patches (busytex/research.diff, busytex/tree.diff), its worker
//                           (poc-site/tex-worker.js after poc-site/tex-tree.mjs), and the preloaded tier split by engine
//                           into tl-common, tl-pdftex, tl-xetex, tl-rest (Emscripten's file packager, no LZ4: served
//                           with brotli)
//   t/<tid>/index.txt       the tree's file index (poc-site/tex-tree.mjs); the tree's files under t/<tid>/ are served
//                           from TEXLIVE_TREE by tex-page/serve.mjs (tree.json says where)
// Every version is a content address of what it holds. A brotli copy (quality 11) of every file under c/, e/ and of
// the index sits beside it (.br), and of every file the manifest names in out/tex-br/; serve.mjs sends them.
//
// Inputs: data/busytex-site (setup.mjs), the TeX Live tree texlive-server serves (TEXLIVE_TREE, by default the one
// beside the corpus), tex-page/measured.json (derive.mjs: which preloaded files each engine's compiles open, and the
// manifest's keys), Emscripten's file packager (tools/file_packager.py of the version BusyTeX was built with, fetched
// into out/ once; Python 3).
//   node experiments/pdf-bilingual/tex-page/build.mjs
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, constants } from 'node:zlib'
import { indexText, parseIndex, resolve } from '../poc-site/tex-tree.mjs'
import { slimSets } from './manifest.mjs'
import { chooseIndex, versionOf, walk } from './tree.mjs'

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
const paths = walk(TREE)
const text = indexText(chooseIndex(paths, p => inBasic.has(p)))
const tid = versionOf(text, paths.map(p => `${p} ${statSync(join(TREE, p)).size}`).join("\n"))
const index = parseIndex(text)
say(`the tree: ${paths.length} files, ${index.size} basenames, ${inBasic.size} as the preloaded tier holds them; tid ${tid}`)

// ---------------------------------------------------------------- 3. the preloaded tier split by engine

const parts = slimSets(basic, { pdflatex: new Set(measured.slim.pdflatex), xelatex: new Set(measured.slim.xelatex) }, {
  // XeLaTeX's fontconfig opens every font of the tier the first time a compile looks a font up by name; no compile of
  // the corpus needs a Type 1 or AFM font that way (identity, S3a report): those stay in the rest. (ICU's data stays
  // in: XeTeX opens its converters at every start, and stops without them — "cannot read font names")
  leave: { xelatex: p => p.includes('/fonts/type1/') || p.includes('/fonts/afm/') },
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
for (const f of ['busytex.js', 'busytex_pipeline.js', 'busytex_biber.js']) copyFileSync(join(patched, f), join(engineDir, f))
copyFileSync(join(BUSYTEX, 'busytex_worker.js'), join(engineDir, 'busytex_worker_busytex.js'))
const treeCode = readFileSync(join(EXP, 'poc-site/tex-tree.mjs'), 'utf8').replace(/^export /gm, '')
writeFileSync(join(engineDir, 'busytex_worker.js'), `${treeCode}\n${readFileSync(join(EXP, 'poc-site/tex-worker.js'), 'utf8')}`)
for (const f of ['busytex.wasm', 'biber.js', 'biber.wasm', 'biber.data']) symlinkSync(realpathSync(join(BUSYTEX, f)), join(engineDir, f))
const engineFiles = readdirSync(engineDir).sort()
const eid = versionOf(...engineFiles.flatMap(f => [f, readFileSync(join(engineDir, f))]))

// ---------------------------------------------------------------- 5. the page, its build.json

const entry = ([key]) => {
  const at = key.indexOf('/')
  const format = Number(key.slice(0, at)), name = key.slice(at + 1), path = resolve(index, format, name)
  return path ? [format, name, path, statSync(join(TREE, path)).size] : null
}
const manifest = {
  engines: Object.fromEntries(Object.entries(measured.manifest.engines).map(([e, keys]) => [e, keys.map(k => entry([k])).filter(Boolean)])),
  fonts: Object.fromEntries(Object.entries(measured.manifest.fonts).map(([s, keys]) => [s, keys.map(k => entry([k])).filter(Boolean)])),
}
const pageDir = join(WORK, 'page')
rmSync(pageDir, { recursive: true, force: true })
mkdirSync(join(pageDir, 'lib'), { recursive: true })
for (const f of ['tex.js', 'tex-page.mjs']) copyFileSync(join(EXP, 'poc-site', f), join(pageDir, f))
copyFileSync(join(EXP, 'node_modules/texlyre-busytex/dist/index.js'), join(pageDir, 'lib/index.js'))
const EXTRA = join(EXP, 'data/pk-flat')
const extra = existsSync(EXTRA) ? readdirSync(EXTRA) : []
if (extra.length) { mkdirSync(join(pageDir, 'extra')); for (const f of extra) copyFileSync(join(EXTRA, f), join(pageDir, 'extra', f)) }
const size = f => statSync(join(engineDir, f)).size
const build = {
  eid, tid,
  engine: `/e/${eid}/`, tree: `/t/${tid}/`,
  packages: Object.fromEntries(Object.keys(parts).map(p => [p, size(`tl-${p}.data`)])),
  wasm: size('busytex.wasm'),
  engines: { pdflatex: ['common', 'pdftex'], xelatex: ['common', 'xetex'] },
  manifest, extra,
}
const cv = versionOf(JSON.stringify(build), ...readdirSync(pageDir, { recursive: true }).sort().filter(f => statSync(join(pageDir, f)).isFile()).flatMap(f => [f, readFileSync(join(pageDir, f))]))
writeFileSync(join(pageDir, 'build.json'), JSON.stringify({ cv, page: `/c/${cv}/`, ...build }))

// ---------------------------------------------------------------- 6. the site, with brotli copies

rmSync(OUT, { recursive: true, force: true })
const place = (from, to) => { mkdirSync(dirname(to), { recursive: true }); execFileSync('cp', ['-R', from, to]) }
place(pageDir, join(OUT, 'c', cv))
place(engineDir, join(OUT, 'e', eid))
mkdirSync(join(OUT, 't', tid), { recursive: true })
writeFileSync(join(OUT, 't', tid, 'index.txt'), text)
writeFileSync(join(OUT, 'tex.html'), `<!doctype html><meta charset="utf-8"><title>TeX</title><script type="module" src="/c/${cv}/tex.js"></script>\n`)
writeFileSync(join(OUT, 'tree.json'), JSON.stringify({ tid, root: TREE }))

const brotli = promisify(brotliCompress)
const BR = join(EXP, 'out/tex-br')
mkdirSync(BR, { recursive: true })
/** a brotli copy of `file` at `to`, from a cache keyed by the content */
async function br(file, to) {
  const bytes = readFileSync(file)
  const cachedCopy = join(BR, `${sha(bytes)}.br`)
  if (!existsSync(cachedCopy)) writeFileSync(cachedCopy, await brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }))
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(cachedCopy, to)
}
const site = readdirSync(OUT, { recursive: true }).map(f => join(OUT, f)).filter(f => statSync(f).isFile() && /\/(c|e|t)\//.test(f))
const treeFiles = [...new Set([...Object.values(manifest.engines), ...Object.values(manifest.fonts)].flat().map(e => e[2]))]
const jobs = [...site.map(f => [f, `${f}.br`]), ...treeFiles.map(p => [join(TREE, p), join(BR, 't', tid, `${p}.br`)])]
for (let i = 0; i < jobs.length; i += 4) await Promise.all(jobs.slice(i, i + 4).map(([f, to]) => br(f, to)))
say(`brotli: ${jobs.length} files`)

const sum = files => files.reduce((n, f) => n + statSync(f).size, 0)
const mb = n => `${(n / 1e6).toFixed(2)} MB`
for (const p of Object.keys(parts)) say(`tl-${p}: ${parts[p].length} files, ${mb(size(`tl-${p}.data`))} raw, ${mb(statSync(join(OUT, 'e', eid, `tl-${p}.data.br`)).size)} brotli`)
for (const [k, list] of [...Object.entries(manifest.engines), ...Object.entries(manifest.fonts)]) say(`manifest ${k}: ${list.length} entries, ${new Set(list.map(e => e[2])).size} files, ${mb(sum([...new Set(list.map(e => e[2]))].map(p => join(TREE, p))))} raw, ${mb(sum([...new Set(list.map(e => e[2]))].map(p => join(BR, 't', tid, `${p}.br`))))} brotli`)
say(`index: ${mb(statSync(join(OUT, 't', tid, 'index.txt')).size)} raw, ${mb(statSync(join(OUT, 't', tid, 'index.txt.br')).size)} brotli`)
say(`built: c/${cv} e/${eid} t/${tid} in ${relative(process.cwd(), OUT)}`)
