// experiments/pdf-bilingual/spikes/layer-fixtures.mjs
// The instant layer's fixture outputs (Plan 8b, Task 12; the layer lab reads the same): for each output, a paper into a
// target, what the layer needs to draw it over arXiv's page, in <LAYER_FIXTURES, else data/layer-fixtures>/<id>v<n>-<target>/:
//   arxiv.pdf    arXiv's PDF of that version, which the layer draws over;
//   layout.json  the paper's layout file (layout/make.mjs makeLayout, Task 6) over its marks (layout/paper.mjs
//                layoutMarksOfPaper: the mark probe, then the marked original with the layout marks of LAYOUT_CLASSES and
//                the paper's own switch, layout/marks.mjs), both compiled natively as spikes/layout-make.mjs compiles them
//                (latexmk in Docker's texlive/texlive:latest, no network), each compile kept by what it compiles in
//                data/layout/<id>v<n>/compiles/; refusal.json in its place where the maker refuses the paper, or a
//                stage of the marks fails (`refused`: probe, compile, marks or the maker's own; the reader then runs as
//                Plan 5's there);
//   units.json   the translation as the layer takes it: `units`, each unit with a translation, its pieces as TrPiece by
//                kOfSource (layer/pieces.mjs), its sentence starts in trText (mt.mjs sentencesOf's `tr`, null where the
//                engine gave none), its state and engine; and where it came from;
//   record.json  the units record it was read from (cache.mjs unitsOf's shape, each unit's source pieces' hash with it):
//                staging's bytes, or made here. A final compiled from it (layer-lab/finals.mjs) sets the same translation.
// The translation: staging's units record where staging holds the output (a GET of the public manifest at the output's
// oid under staging's versions, below; then of the record at the manifest's key, checked by its SHA-256 and length);
// else Microsoft's free endpoint as spikes/live-node.mjs calls it (mt.mjs translateTexts and translateUnits, the markers
// wire, every unit the target does not keep), with the sentence lengths the endpoint answers (sentLen) kept as the
// extension's service keeps them, so that its units have sentences as staging's do. A record already made for the same
// cut of the paper's units is taken again, never sent twice (--fresh: made anew): the output's own folder's, then the
// translations made for that cut before (out/layer-gate/translations/<output>/<cut>/, wherever their fixtures went), then
// the gate's fixed fixture's. Where none is of this cut and staging holds none, the fixed fixture's record of another cut
// (an earlier front end's) seeds every unit whose source is one of its (cache.mjs seedFrom), and only the rest is sent.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/layer-fixtures.mjs [--only=<paper>[:<target>],…] [--targets=<t>,…] [--fresh] [--list]
//       [--of=<fixtures folder>] [--engine=<worktree>] [--offline]
// With no option, Task 12's 21 outputs (OUTPUTS below, with the table-heavy, footnote-heavy and XeLaTeX papers found by
// their rules). --only names the outputs to make: <id>v<n>:<target>, or <id>:<target> for a paper whose version the list
// knows; a paper named without a target is made into each of --targets. --targets alone makes every paper of the list
// into those targets. --of makes the outputs a fixtures folder holds. --list prints the outputs and makes nothing.
// --engine makes the outputs with another worktree's engine (its src/pdf-reader/engine: the marks, the layout maker, the
// pieces), so that the layer gate (spikes/layer-gate.mjs --fixtures) measures a branch's maker end to end; its outputs go
// to LAYER_FIXTURES, which may then not be data/layer-fixtures (those are the gate's fixed inputs). --offline sends no
// request at all: a paper's files must be in data/, and a translation is the record made before (in LAYER_FIXTURES, else
// the same output's in data/layer-fixtures, for the same cut of the paper's units); an output that would need a request
// fails. The marks are the engine's (layout/paper.mjs, which asks TeX for the paper's own switch, what each macro sets
// and marks the layout compile with them; the maker, layout/make.mjs, must read the marked original as it was marked), so
// an engine of this file's has it: one of E5 on, or one whose marks.mjs still has punctuationMovers (before Task 2), which
// is marked as it was then. (The gate's `--switch` is no option any more: the switch is always asked.) Every compile is
// kept by what it compiles (data/layout/<id>v<n>/compiles/<key>.pdf and .log; COMPILES names another folder), and its
// marks file is read from it again every run by the engine's own reader, units and OPS given.
// Requests: arXiv (a paper's source and PDF where data/ has neither, 3.2 s apart), staging's public reads (GET only) and
// Microsoft's endpoint, each with the project's User-Agent and nothing else. Every file written inside the work tree is
// added to .git/info/exclude as it is written (the 2026-09-21 rule): no paper, nor anything made of one, is committed.
// Stops below 10 GiB free on the data's disk. Exits 1 where an output could not be made.
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { setDefaultResultOrder } from 'node:dns'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { getDocument, OPS, version as PDFJS } from 'pdfjs-dist/legacy/build/pdf.mjs'

setDefaultResultOrder('ipv4first')
const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const REPO = resolve(root, '../..')
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const OFFLINE = process.argv.includes('--offline')
/** the engine the outputs are made with: this repository's, or another worktree's (--engine) */
const ENGINE = resolve(argOf('engine') ?? REPO)
const engine = path => import(pathToFileURL(join(ENGINE, 'src/pdf-reader/engine', path)).href)
const { sourceHash, seedFrom, unitsOf } = await engine('cache.mjs')
const { kOfSource, trPiecesOf } = await engine('layer/pieces.mjs')
const { encodeLayout, LAYOUT } = await engine('layout/file.mjs')
const { makeLayout } = await engine('layout/make.mjs')
const MARKS = await engine('layout/marks.mjs')
const { encodeLayoutMarks, LAYOUT_CLASSES, layoutMarksOf, parseLayoutMarks } = MARKS
const LIVE = await engine('live.mjs')
const { keptFor, openPaper, originalFiles, PIPELINE_CARRIES, PIPELINE_VERSION, TYPESETTING_VERSION } = LIVE
const { unpackSource } = await engine('tar.mjs')
// the translation's modules only where a request may be made (mt.mjs and the rules reach the extension's code by alias)
const { RULES_VERSION } = OFFLINE ? { RULES_VERSION: null } : await import(pathToFileURL(join(ENGINE, 'src/core/rules/latexml.ts')).href)
const { MICROSOFT_LANG, translateTexts, translateUnits } = OFFLINE ? { MICROSOFT_LANG: {} } : await engine('mt.mjs')
const DATA = process.env.AXT_DATA ?? join(root, 'data')
const OUT = resolve(process.env.LAYER_FIXTURES ?? join(DATA, 'layer-fixtures'))
/** the fixtures the gate holds fixed, whose records an --offline run may take again */
const REFS = resolve(join(DATA, 'layer-fixtures'))
/** each output's translations by the cut of its paper's units they were made for (out/layer-gate/translations/<output>/
 *  <cut>/: record.json and meta.json), wherever its fixtures are made to: a cut is translated once */
const TRANSLATIONS = join(root, 'out/layer-gate/translations')
const cutOf = hashes => createHash('sha256').update(hashes.join('\n')).digest('hex').slice(0, 16)
if (ENGINE !== REPO && OUT === REFS) throw new Error(`--engine: give LAYER_FIXTURES another folder than ${REFS} (the gate's fixed inputs)`)
const UA = 'ReadarXiv/0.1 (+https://readarxiv.org; research)'
const STAGING = 'https://app-staging.readarxiv.org'
/** staging's versions (2026-10-06): the pipeline's and the typesetting's are this engine's (a move here makes another cut
 *  and another output, which staging does not hold), the rules' this repository's; the image, the geometry schema and the
 *  chain the web's (container/image.json, src/shared/versions.ts GEOMETRY_SCHEMA, wrangler.jsonc MT_CHAIN) */
const STAGING_VERSIONS = { pipeline: PIPELINE_VERSION, typesetting: TYPESETTING_VERSION, rules: RULES_VERSION, image: '1', geometry: 2, chain: 'mt:microsoft>google-web' }
const FREE_MIN = 10 * 2 ** 30
const ARXIV_GAP_MS = 3200
const NM = new URL('../../../node_modules/pdfjs-dist/', import.meta.url).pathname
const open = bytes => getDocument({ data: bytes, verbosity: 0, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, useSystemFonts: false })

/** Task 12's outputs (spec §5): iteration 3's fifteen, then zh-TW, fr, es and the thesis in CJK; the table-heavy, the
 *  footnote-heavy and the XeLaTeX paper are found by their rules (picks below) */
const OUTPUTS = [
  ['1512.03385v1', ['zh', 'ja', 'de', 'ru', 'zh-TW']],
  ['1706.03762v7', ['zh', 'ko', 'de', 'ru', 'fr']],
  ['2608.04322v1', ['zh', 'es']],
  ['2010.11929v2', ['zh']],
  ['1810.04805v2', ['zh']],
  ['2610.02069v1', ['zh', 'de', 'ru']],
  ['2307.16209v1', ['de', 'zh']],
]
const PICKS = [['table-heavy', 'zh'], ['footnote-heavy', 'zh'], ['xelatex', 'zh']]
/** Microsoft's codes beyond mt.mjs's (live-node's three) */
const MS_LANG = { ...MICROSOFT_LANG, 'zh-TW': 'zh-Hant' }

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const flag = name => process.argv.includes(`--${name}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const free = dir => { const s = statfsSync(dir); return s.bavail * s.bsize }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// ---- the exclude: every file written inside the work tree, by its path there (data/ may be a link to another tree's)
let excludeFile = null
function exclude(file) {
  const rel = relative(REPO, resolve(file))
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..') return
  excludeFile ??= execFileSync('git', ['-C', REPO, 'rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'], { encoding: 'utf8' }).trim()
  const line = `/${rel.split(sep).join('/')}`
  const had = existsSync(excludeFile) ? readFileSync(excludeFile, 'utf8') : ''
  if (had.split('\n').includes(line)) return
  mkdirSync(dirname(excludeFile), { recursive: true })
  appendFileSync(excludeFile, `${had && !had.endsWith('\n') ? '\n' : ''}${line}\n`)
}
/** a file written and excluded */
function write(file, bytes) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  exclude(file)
}

// ---- requests: the project's User-Agent, and nothing else
let lastArxiv = 0
async function arxivGet(url) {
  if (OFFLINE) throw new Error(`--offline: ${url} would be fetched`)
  const wait = lastArxiv + ARXIV_GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  } finally { lastArxiv = Date.now() }
}
async function stagingGet(path) {
  if (OFFLINE) throw new Error(`--offline: ${STAGING}/${path} would be fetched`)
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(`${STAGING}/${path}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    } catch (e) {
      if (i === 3) throw new Error(`${STAGING}/${path}: ${e.message}`)
      await sleep(2000 * 2 ** i)
    }
  }
}
/** one request to Microsoft's endpoint as mt.mjs translateMicrosoft makes it, with each answer's sentence lengths kept as
 *  the extension's service keeps them (the segment's `alignment`), which mt.mjs sentencesOf reads */
async function microsoft(texts, to) {
  if (OFFLINE) throw new Error('--offline: Microsoft\'s endpoint would be asked')
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://edge.microsoft.com/translate/translatetext?${new URLSearchParams({ from: '', to: MS_LANG[to] ?? to, isEnterpriseClient: 'false' })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(texts) })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      return json.map(item => {
        const t = item?.translations?.[0]
        if (typeof t?.text !== 'string') return null
        const s = t.sentLen
        return { text: t.text, by: 'microsoft', ...(Array.isArray(s?.srcSentLen) && Array.isArray(s?.transSentLen) ? { alignment: { source: s.srcSentLen, target: s.transSentLen } } : {}) }
      })
    } catch (e) { if (attempt === 3) throw e; await sleep(1500 * (attempt + 1)) }
  }
}

// ---- the outputs
/** the corpus's papers by id, with their versions (out/corpus.json, spikes/corpus.mjs's record; CORPUS_RECORD names another) */
function corpusRows() {
  const file = process.env.CORPUS_RECORD ?? join(root, 'out/corpus.json')
  if (!existsSync(file)) throw new Error(`no corpus record at ${file} (spikes/corpus.mjs writes it; CORPUS_RECORD names another)`)
  return new Map(JSON.parse(readFileSync(file, 'utf8')).filter(r => r.version && existsSync(join(DATA, 'corpus', r.id, 'source.gz'))).map(r => [r.id, r]))
}
const paperOfCorpus = async id => openPaper((await unpackSource(new Uint8Array(readFileSync(join(DATA, 'corpus', id, 'source.gz'))))).files)
/** the corpus paper with the most units of a kind, by the pipeline's own cutting */
async function mostOf(kind) {
  let best = null
  for (const [id, row] of corpusRows()) {
    let n = 0
    try { n = (await paperOfCorpus(id)).units.filter(u => u.kind === kind).length } catch { continue }
    if (!best || n > best.n) best = { id: `${id}v${row.version}`, n }
  }
  if (!best) throw new Error(`no corpus paper has a ${kind} unit`)
  return best.id
}
/** spikes/corpus.mjs's seeded draw continued past its 130: the first paper whose source analyze sets with XeLaTeX
 *  (`node spikes/corpus.mjs 400` fetches them) */
async function firstXelatex() {
  let seed = 290
  const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const ids = new Set()
  while (ids.size < 400) ids.add(`2608.${String(1 + Math.floor(rand() * 31132)).padStart(5, '0')}`)
  const rows = corpusRows()
  for (const id of [...ids].slice(130)) {
    const row = rows.get(id)
    if (!row) continue
    try { if ((await paperOfCorpus(id)).meta.compiler === 'xelatex') return `${id}v${row.version}` } catch {}
  }
  throw new Error('no XeLaTeX paper past the draw\'s 130 (run node spikes/corpus.mjs 400 first)')
}
const PICK = { 'table-heavy': () => mostOf('cell'), 'footnote-heavy': () => mostOf('footnote'), xelatex: firstXelatex }

/** the outputs asked for, [paper with its version, target], each once */
async function outputsAsked() {
  const versions = new Map(OUTPUTS.map(([p]) => [p.replace(/v\d+$/, ''), p]))
  const targets = arg('targets')?.split(',').filter(Boolean) ?? null
  const asked = []
  const only = arg('only'), of = arg('of')
  if (of) {
    // the outputs a fixtures folder holds (--of=data/layer-fixtures: the layer lab's, the gate's)
    for (const name of readdirSync(resolve(of)).sort()) { const m = /^(.+v\d+)-([A-Za-z-]+)$/.exec(name); if (m) asked.push([m[1], m[2]]) }
  } else if (only) {
    for (const item of only.split(',').filter(Boolean)) {
      const [paper, target] = item.split(':')
      const id = /v\d+$/.test(paper) ? paper : versions.get(paper)
      if (!id) throw new Error(`--only: give ${paper}'s version (${paper}v<n>)`)
      if (target) asked.push([id, target])
      else if (targets) for (const t of targets) asked.push([id, t])
      else throw new Error(`--only: ${paper} names no target, and no --targets is given`)
    }
  } else {
    for (const [id, ts] of OUTPUTS) for (const t of targets ?? ts) asked.push([id, t])
    for (const [pick, t] of PICKS) {
      try { const id = await PICK[pick](); for (const u of targets ?? [t]) asked.push([id, u]) } catch (e) { console.log(`FAIL ${pick}: ${e.message}`); failed++ }
    }
  }
  const seen = new Set()
  return asked.filter(([id, t]) => { const k = `${id}:${t}`; if (seen.has(k)) return false; seen.add(k); return true })
}

// ---- a paper: its source and arXiv's PDF, its layout file (once, whatever the target)
async function paperFiles(id) {
  const dir = join(DATA, 'layout', id)
  mkdirSync(dir, { recursive: true })
  const bare = id.replace(/v\d+$/, ''), corpus = join(DATA, 'corpus', bare)
  for (const [file, url] of [['source.gz', `https://arxiv.org/e-print/${id}`], ['arxiv.pdf', `https://arxiv.org/pdf/${id}`]]) {
    const path = join(dir, file)
    if (existsSync(path)) continue
    // the corpus's copy where it is of this version, else arXiv's
    const row = existsSync(join(corpus, file)) ? (() => { try { return corpusRows().get(bare) } catch { return null } })() : null
    if (row && `${bare}v${row.version}` === id) copyFileSync(join(corpus, file), path)
    else writeFileSync(path, await arxivGet(url))
    exclude(path)
  }
  return dir
}
/**
 * One compile of a paper's files in Docker's TeX Live (no network, 2 CPUs, 3 GB, 600 s), in a folder of its own: its PDF's
 * bytes and its log, or null where it made no PDF. Kept by what it compiles (its name is the files' key) in
 * <COMPILES, else data/layout/<id>v<n>/compiles>, so that a compile is made once whichever engine reads it: what the
 * marks file holds is read again from it every run, by the engine's own reader (layoutMarksOf), since another branch's
 * reader reads the same compile otherwise
 */
const COMPILES = process.env.GATE_PDF_CACHE ?? process.env.COMPILES ?? null
async function compiled(dir, name, files, paper, opts = {}) {
  const at = COMPILES ? join(COMPILES, dir.split(sep).pop()) : join(dir, 'compiles'), pdfF = join(at, `${name}.pdf`), logF = join(at, `${name}.log`)
  if (existsSync(logF)) return { pdf: existsSync(pdfF) ? new Uint8Array(readFileSync(pdfF)) : null, log: readFileSync(logF, 'latin1') }
  const c = await compiledNow(dir, name, files, paper, opts)
  if (c) { mkdirSync(at, { recursive: true }); if (c.pdf) write(pdfF, c.pdf); write(logF, Buffer.from(c.log, 'latin1')) }
  return c
}
async function compiledNow(dir, name, files, paper, { passes = null } = {}) {
  if (free(dir) < FREE_MIN) throw new Error(`less than 10 GiB free on ${dir}`)
  const main = paper.project.main, stem = main.split('/').pop().replace(/\.[^.]+$/, '')
  const build = join(dir, `build-${name}`)
  rmSync(build, { recursive: true, force: true })
  try {
    for (const [p, b] of files) { const f = join(build, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const flag = { xelatex: '-xelatex', lualatex: '-lualatex' }[paper.meta.compiler] ?? '-pdf'
    const once = passes === 1 ? ['-e', '$max_repeat=1'] : []
    await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', '-v', `${build}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '600', 'latexmk', flag, ...once, ...(paper.meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main], { maxBuffer: 1 << 26 }).catch(() => null)
    const pdf = join(build, `${stem}.pdf`), log = join(build, `${stem}.log`)
    return existsSync(log) ? { pdf: existsSync(pdf) ? new Uint8Array(readFileSync(pdf)) : null, log: readFileSync(log, 'latin1') } : null
  } finally { rmSync(build, { recursive: true, force: true }) }
}

/** the layout file of a paper, or the maker's refusal, with the stats */
async function layoutOf(id, paper, dir) {
  const { files: source } = await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
  const keyOf = marked => {
    const hash = createHash('sha256')
    for (const [p, b] of [...source, ...marked].sort((a, b) => (a[0] < b[0] ? -1 : 1))) hash.update(p).update(b)
    return hash.digest('hex').slice(0, 16)
  }
  /** the marks file of a compile, by its key: one file a key, or the single marks.json of before where its key is this one */
  const marksAt = key => join(dir, `marks-${key}.json`)
  const cached = key => {
    const legacy = join(dir, 'marks.json'), stamp = join(dir, 'marks.key')
    for (const f of [marksAt(key), existsSync(stamp) && readFileSync(stamp, 'utf8') === key ? legacy : null]) {
      if (!f || !existsSync(f)) continue
      try { const bytes = new Uint8Array(readFileSync(f)); parseLayoutMarks(bytes); return bytes } catch {}
    }
    return null
  }
  let marksBytes = null, switched = null, asked = false
  const withSource = marked => { const all = new Map(source); for (const [p, b] of marked) all.set(p, b); return all }
  if (typeof MARKS.punctuationMovers === 'function') {
    // an engine of before Task 2: the paper's own switch from its preamble, then from the compile's log too, compiled
    // again where they differ (as spikes/layout-make.mjs did)
    let movers = MARKS.punctuationMovers(paper, '')
    for (let pass = 0; pass < 2 && !marksBytes; pass++) {
      const marked = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, movesPunctuation: movers })
      const key = keyOf(marked)
      if ((marksBytes = cached(key))) break
      const c = await compiled(dir, key, withSource(marked), paper)
      if (!c?.pdf) break
      const again = MARKS.punctuationMovers(paper, c.log)
      if (pass === 0 && again.join() !== movers.join()) { movers = again; continue }
      marksBytes = await marksOf(c, paper, { classes: LAYOUT_CLASSES, movesPunctuation: movers })
      write(marksAt(key), marksBytes)
    }
  } else {
    // E5's: the engine makes the marks in one call (layout/paper.mjs); the compiles are this file's, kept by what they compile
    const { layoutMarksOfPaper } = await engine('layout/paper.mjs')
    const compile = async req => {
      const probe = !req.rerun
      const c = await compiled(dir, `${probe ? 'probe-' : ''}${keyOf(req.overrides)}`, withSource(req.overrides), paper, { passes: probe ? 1 : null })
      return c ? { ok: !!c.pdf?.length, pdf: c.pdf, log: c.log } : { ok: false, error: 'no log' }
    }
    const made = await layoutMarksOfPaper(paper, { compile, open: async bytes => { const task = open(bytes); return { doc: await task.promise, close: () => task.destroy() } }, OPS })
    if (!('marks' in made)) return { refused: made.refused, stats: null }
    marksBytes = Buffer.from(made.marks)
    asked = true
  }
  if (!marksBytes) return { refused: 'compile', stats: null }
  const marks = parseLayoutMarks(marksBytes)
  if (asked) {
    const { switches, inkless, texts } = marks.marking
    switched = MARKS.switchedOf(switches)
    console.log(`${id}: inkless ${inkless.length} of ${MARKS.inkSamples(paper.units).length}: ${inkless.slice(0, 12).join(' ')}`)
    console.log(`${id}: texts ${texts.length / 2}: ${Array.from({ length: Math.min(12, texts.length / 2) }, (_, i) => `${texts[2 * i]}=${texts[2 * i + 1]}`).join(' ')}`)
  }
  const task = open(new Uint8Array(readFileSync(join(dir, 'arxiv.pdf'))))
  const m = /^(.+)v(\d+)$/.exec(id)
  try {
    const arxivDoc = await task.promise
    const tm = performance.now()
    const out = await makeLayout({ units: paper.units, marks, arxiv: arxivDoc, OPS, paper: { id: m[1], version: Number(m[2]) }, left: '', pdfjs: PDFJS })
    // (the maker's own time, and its operator lists' within it: the server's prepare reads them once for the remover too)
    out.stats.makerMs = Math.round(performance.now() - tm)
    // GATE_DBG=<dir>: the maker's own diagnostics, where it gives them
    if (out.stats.dbg && process.env.GATE_DBG) writeFileSync(join(process.env.GATE_DBG, `${id}.json`), JSON.stringify({ dbg: out.stats.dbg, u: out.stats.dbgU }))
    return 'file' in out ? { text: encodeLayout(out.file), stats: out.stats, switched } : { refused: out.refused, stats: out.stats, switched }
  } finally { await task.destroy() }
}
/** a compile's marks file, as bytes */
async function marksOf(c, paper, marking) {
  const task = open(c.pdf)
  try { return Buffer.from(encodeLayoutMarks(await layoutMarksOf(await task.promise, c.log, { engine: paper.meta.compiler, ...marking }))) } finally { await task.destroy() }
}

// ---- a translation: staging's record, else Microsoft's
const outputIdentity = (paper, version, target, v) => ['axt-out/1', paper, `v${version}`, target, v.chain, `p${v.pipeline}`, `t${v.typesetting}`, `r${v.rules}`, `i${v.image}`, `g${v.geometry}`].join('|')
/** staging's units record of the output, or null where staging holds none (or one of other versions) */
async function stagingRecord(paperId, version, target) {
  const oid = sha256(outputIdentity(paperId, version, target, STAGING_VERSIONS)).slice(0, 32)
  const bytes = await stagingGet(`out/${oid}/manifest.json`)
  if (!bytes) return null
  const manifest = JSON.parse(Buffer.from(bytes).toString('utf8'))
  const v = manifest.versions ?? {}
  if (manifest.kind !== 'final' || manifest.oid !== oid || Object.entries(STAGING_VERSIONS).some(([k, x]) => v[k] !== x)) return null
  const ref = manifest.units
  if (!/^out\/[0-9a-f]{32}\/[0-9a-f]{64}\.json$/.test(ref?.key ?? '')) throw new Error(`staging's manifest ${oid}: no units record`)
  const record = await stagingGet(ref.key)
  if (!record) throw new Error(`staging ${ref.key}: not found`)
  if (sha256(record) !== ref.sha256 || record.length !== ref.bytes) throw new Error(`staging ${ref.key}: not the bytes its manifest names`)
  return { record, from: { host: STAGING, oid, units: ref.key, sha256: ref.sha256, made: manifest.made, quality: manifest.quality?.counts ?? null } }
}
/** a record made here: every unit the target does not keep, through Microsoft's endpoint on the markers wire */
async function microsoftRecord(paper, target, hashes) {
  const kept = keptFor(paper, target)
  const todo = paper.units.filter(u => !kept.has(u))
  const t0 = Date.now()
  const { results: got, how } = await translateUnits(todo, texts => translateTexts(texts, target, { parallel: 2, send: microsoft }), 'markers')
  const results = new Map()
  paper.units.forEach((u, i) => { const r = got.get(u); if (r) results.set(i, { ...r, tried: 'microsoft' }) })
  const record = Buffer.from(JSON.stringify({ units: unitsOf(paper.units, kept, hashes, results) }))
  return { record, from: { endpoint: 'edge.microsoft.com/translate/translatetext', how, ms: Date.now() - t0 } }
}
/**
 * A record of this cut of the paper's units, its translations carried over from records of another cut (`from`: the
 * gate's fixed fixture's, made by an earlier front end, with its pipeline): each unit whose source is one of theirs, by
 * its hash or but for its pairs' numbers (cache.mjs seedFrom, as a copy's seed), and whose translation that pipeline's
 * carries over into this one (live.mjs PIPELINE_CARRIES: not one holding a marker's `#`); every other unit the target
 * does not keep sent through
 * Microsoft's endpoint on the markers wire, as microsoftRecord sends a paper's, at its rate. A front end that cuts the
 * units anew (PIPELINE 10's) sends only what it made new
 */
async function seededRecord(paper, target, hashes, from) {
  const kept = keptFor(paper, target)
  const results = new Map()
  for (const { record: rec, pipeline } of from) {
    // (as a copy carries over: the units its pipeline's translations this one reads alike, PIPELINE_CARRIES)
    const carries = pipeline === PIPELINE_VERSION ? () => true : (PIPELINE_CARRIES[pipeline] ?? (() => false))
    const { seed } = await seedFrom(rec, paper.units)
    for (const [i, x] of seed) if (!results.has(i) && !kept.has(paper.units[i]) && carries(x.pieces)) results.set(i, x)
  }
  const carried = results.size
  const todo = paper.units.filter((u, i) => !kept.has(u) && !results.has(i))
  const t0 = Date.now()
  let how = null
  if (todo.length) {
    const r = await translateUnits(todo, texts => translateTexts(texts, target, { parallel: 2, send: microsoft }), 'markers')
    how = r.how
    paper.units.forEach((u, i) => { const x = r.results.get(u); if (x) results.set(i, { ...x, tried: 'microsoft' }) })
  }
  const record = Buffer.from(JSON.stringify({ units: unitsOf(paper.units, kept, hashes, results) }))
  return { record, from: { carried, sent: todo.length, endpoint: 'edge.microsoft.com/translate/translatetext', how, ms: Date.now() - t0 } }
}
/** the record's units as the layer takes them: each unit's pieces as TrPiece by its source pieces' indices */
async function layerUnits(paper, record) {
  const { seed } = await seedFrom(record, paper.units)
  const units = [], unread = []
  for (const [i, s] of [...seed].sort((a, b) => a[0] - b[0])) {
    const pieces = trPiecesOf(s.pieces, kOfSource(paper.units[i].pieces))
    if (!pieces) { unread.push(i); continue }
    const tr = s.sentences?.tr
    units.push({ id: i, pieces, sentences: Array.isArray(tr) ? [...tr] : null, state: s.state, by: s.by ?? null })
  }
  return { units, unread }
}

// ---- the run
let failed = 0
const engineCommit = (() => {
  const head = execFileSync('git', ['-C', ENGINE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const dirty = execFileSync('git', ['-C', ENGINE, 'status', '--porcelain', '--untracked-files=no', '--', 'src/pdf-reader/engine'], { encoding: 'utf8' }).trim()
  return dirty ? `${head}+changes` : head
})()
const asked = await outputsAsked()
console.log(`${asked.length} outputs: ${asked.map(([id, t]) => `${id}:${t}`).join(' ')}`)
if (flag('list')) process.exit(failed ? 1 : 0)

const papers = new Map()
for (const [id, target] of asked) {
  const out = join(OUT, `${id}-${target}`)
  try {
    if (!papers.has(id)) {
      const dir = await paperFiles(id)
      const paper = openPaper((await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))).files)
      const t0 = Date.now()
      const layout = await layoutOf(id, paper, dir)
      const hashes = await Promise.all(paper.units.map(sourceHash))
      papers.set(id, { dir, paper, layout, hashes, ms: Date.now() - t0 })
      const s = layout.stats
      console.log(`${id}: ${layout.text ? `layout ${layout.text.length} bytes` : `refused (${layout.refused})`}${layout.switched?.length ? `, switched ${layout.switched.join(' ')}` : ''}${s ? `, lines carried ${s.lines.carried}/${s.lines.total}, units located ${s.units.located}/${s.units.total}` : ''}${s ? `, ph ${JSON.stringify({ found: s.ph.found, lost: s.ph.lost, unmarked: s.ph.unmarked, symbols: s.ph.symbols, twice: s.ph.twice, unmatched: s.ph.unmatched, foreign: s.ph.foreign, shared: s.ph.shared })}` : ''} (${Date.now() - t0} ms${s?.makerMs !== undefined ? `; maker ${s.makerMs} ms, its operator lists ${Math.round(s.ms?.ops ?? 0)} ms` : ''})`)
    }
    const { dir, paper, layout, hashes } = papers.get(id)
    const m = /^(.+)v(\d+)$/.exec(id)
    mkdirSync(out, { recursive: true })
    copyFileSync(join(dir, 'arxiv.pdf'), join(out, 'arxiv.pdf'))
    exclude(join(out, 'arxiv.pdf'))
    if (layout.text) { write(join(out, 'layout.json'), layout.text); rmSync(join(out, 'refusal.json'), { force: true }) }
    else { write(join(out, 'refusal.json'), JSON.stringify({ refused: layout.refused, stats: layout.stats }, null, 1)); rmSync(join(out, 'layout.json'), { force: true }) }
    // the translation: the record made before, where it is of this cut of the units; else staging's; else Microsoft's
    const recordFile = join(out, 'record.json'), unitsFile = join(out, 'units.json')
    let record = null, from = null, source = null
    // the record made before: this output's, else (another folder, --engine) the same output's among the gate's fixtures
    for (const d of flag('fresh') ? [] : [out, join(REFS, `${id}-${target}`)]) {
      const rf = join(d, 'record.json'), uf = join(d, 'units.json')
      if (record || !existsSync(rf) || !existsSync(uf)) continue
      const had = JSON.parse(readFileSync(rf, 'utf8')), meta = JSON.parse(readFileSync(uf, 'utf8'))
      if (had.units?.length === hashes.length && had.units.every((u, i) => u.hash === hashes[i])) {
        record = had; from = meta.from; source = meta.source
        if (d !== out) write(recordFile, readFileSync(rf))
      }
    }
    // (the translations made for this cut before, whatever folder they were made into)
    const cache = join(TRANSLATIONS, `${id}-${target}`, cutOf(hashes))
    if (!record && !flag('fresh') && existsSync(join(cache, 'record.json'))) {
      const meta = JSON.parse(readFileSync(join(cache, 'meta.json'), 'utf8'))
      record = JSON.parse(readFileSync(join(cache, 'record.json'), 'utf8')); from = meta.from; source = meta.source
      write(recordFile, readFileSync(join(cache, 'record.json')))
    }
    if (!record) {
      const staged = await stagingRecord(m[1], Number(m[2]), target)
      // (else the gate's fixed fixture's translations carried over where the cut is another, the rest sent)
      const old = join(REFS, `${id}-${target}`, 'record.json'), oldMeta = join(REFS, `${id}-${target}`, 'units.json')
      const made = staged ?? (existsSync(old) ? await seededRecord(paper, target, hashes, [{ record: JSON.parse(readFileSync(old, 'utf8')), pipeline: existsSync(oldMeta) ? JSON.parse(readFileSync(oldMeta, 'utf8')).pipeline : null }]) : await microsoftRecord(paper, target, hashes))
      source = staged ? 'staging' : 'microsoft'
      from = made.from
      write(recordFile, made.record)
      record = JSON.parse(Buffer.from(made.record).toString('utf8'))
      write(join(cache, 'record.json'), made.record)
      write(join(cache, 'meta.json'), JSON.stringify({ source, from, pipeline: PIPELINE_VERSION, made: new Date().toISOString() }))
    }
    const { units, unread } = await layerUnits(paper, record)
    const states = {}
    for (const u of record.units) states[u.state] = (states[u.state] ?? 0) + 1
    write(unitsFile, JSON.stringify({
      schema: 1, paper: { id: m[1], version: Number(m[2]) }, target, source, from,
      engine: engineCommit, pipeline: PIPELINE_VERSION, layout: LAYOUT, made: new Date().toISOString(),
      states, unread, units,
    }))
    const sentences = units.filter(u => u.sentences?.length).length
    console.log(`ok   ${id}:${target} ${source}: ${units.length} units (${sentences} with sentences), states ${JSON.stringify(states)}${unread.length ? `, unread ${unread.length}` : ''}`)
  } catch (e) {
    failed++
    console.log(`FAIL ${id}:${target}: ${String(e?.stack ?? e).slice(0, 600)}`)
  }
}
process.exitCode = failed ? 1 : 0
