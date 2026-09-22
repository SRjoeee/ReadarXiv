// The multi-language gate (#32): a change to how a translation is typeset passes only if no target language loses by
// it. For every paper of a fixed sample and every language, the live pipeline's final compile — the strategies of
// strategiesFor (scripts.mjs) in order, moving on as the reader does, translationFiles, latexmk to the end — with the pseudo-translation (latex-front.mjs, as
// long as a real one and written in the language) in place of an engine's, and the paper's own marked compile beside
// it. Per result: whether it compiled with every letter set, and with which strategy; the target script's letters found in the PDF's text
// against those put in (a font without them drops them, and the reader anchors on that text); "Missing character"
// lines; TeX errors; overfull boxes and pages against the original's; references left unresolved.
//   node spikes/lang-gate.mjs [--langs=zh,ja] [--papers=id,id] [--parallel=5] [--accept | --check] [--tune=Jpan.leading=1.1,…]
// --tune tries other values of a script's parameters (scripts.mjs: CJK) and writes out/lang-gate-tune-<values>.json
// Writes out/lang-gate.json and each PDF to out/lang-gate/; --accept stores the result as the baseline, --check
// compares with it and exits 1 on a loss (a result lost, letters lost, more errors, unresolved references, or more overfull
// boxes; pages are reported, not judged: a change to the spacing moves them on purpose). The baseline is the corpus's,
// local like the corpus: store it on the commit before a change, check the change against it. The originals and the
// font probes are cached in out/lang-gate-orig.json.
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { pseudoTranslate, readFontProbe } from '../poc-reader/latex-front.mjs'
import { openPaper, originalFiles, probeFiles, translationFiles, unsettable } from '../poc-reader/live.mjs'
import { CJK, scriptOf, strategiesFor } from '../poc-reader/scripts.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
import { unpackSource } from '../poc-reader/tar.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const flag = name => process.argv.includes(`--${name}`)
// 24 of the 113 papers that compile in the browser as they stand, by document class: article 8, IEEEtran 3,
// revtex4-2 3, acmart 2, amsart 2, and one each of llncs, elsarticle, achemso, ieeeconf, sn-jnl, aastex631
const SAMPLE = ['2608.02163', '2608.05876', '2608.09746', '2608.12333', '2608.18090', '2608.23393', '2608.26528', '2608.29867', '2608.06701', '2608.15016', '2608.25750', '2608.06233', '2608.20847', '2608.23586', '2608.06007', '2608.24839', '2608.02785', '2608.24503', '2608.21180', '2608.15761', '2608.25928', '2608.09038', '2608.02991', '2608.12606']
// the first batch (REPORT, eleventh addendum): CJK, Latin-script languages whose letters T1 holds, Cyrillic
const LANGS = arg('langs', 'zh,zh-Hant,ja,ko,de,es,fr,pt,ru').split(',')
const PAPERS = arg('papers', SAMPLE.join(',')).split(',')
const PARALLEL = Number(arg('parallel', '5'))
const TUNE = arg('tune', '')
for (const setting of TUNE ? TUNE.split(',') : []) {
  const [path, value] = setting.split('='), [script, key] = path.split('.')
  if (!CJK[script] || !(key in CJK[script])) throw new Error(`--tune: no parameter ${path}`)
  CJK[script][key] = Number(value)
}
const tag = TUNE ? `-tune-${TUNE.replace(/[^A-Za-z0-9.]+/g, '_')}` : ''
const OUT = join(root, `out/lang-gate${tag}.json`)
const BASELINE = join(root, 'out/lang-gate-baseline.json')
const ORIGINALS = join(root, 'out/lang-gate-orig.json')
const PDFS = join(root, `out/lang-gate${tag}`)
const WORK = join(root, 'data/runs/lang-gate')

/** the letters that show a language's text reached the page: its script's, or for a Latin one the letters beyond ASCII */
const LETTERS = {
  Hans: /\p{Script=Han}/gu,
  Hant: /\p{Script=Han}/gu,
  Jpan: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  Kore: /\p{Script=Hangul}/gu,
  Arab: /\p{Script=Arabic}/gu,
  Hebr: /\p{Script=Hebrew}/gu,
  Cyrl: /\p{Script=Cyrillic}/gu,
  Grek: /\p{Script=Greek}/gu,
  Deva: /\p{Script=Devanagari}/gu,
  Thai: /\p{Script=Thai}/gu,
  Latn: /(?![A-Za-z])\p{Script=Latin}/gu,
}
const lettersIn = (text, lang) => (text.normalize('NFKC').match(LETTERS[scriptOf(lang)]) ?? []).length

const FAITHFUL = faithfulDockerArgs(root)
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
/** a compile in TeX Live 2026 (Docker), as the browser's BusyTeX can run it (faithful.mjs): the source, the pipeline's
 *  files over it, latexmk to the end or one pass */
async function compile(files, dir, { main, engine, rerun, bibtex, overrides }) {
  rmSync(dir, { recursive: true, force: true })
  for (const [p, b] of files) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  for (const [p, b] of overrides) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  // TeX writes its output where it runs, the project's root, whatever directory the main file is in
  const stem = main.split('/').pop().replace(/\.[^./]+$/, ''), t0 = Date.now()
  const docker = cmd => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...FAITHFUL, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
  if (rerun) await docker(['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...(bibtex === false ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main])
  else await docker([engine, '-interaction=nonstopmode', main])
  const pdf = join(dir, `${stem}.pdf`), logFile = join(dir, `${stem}.log`)
  return { ok: existsSync(pdf) && statSync(pdf).size > 0, pdf, log: existsSync(logFile) ? readFileSync(logFile, 'utf8') : '', ms: Date.now() - t0 }
}
const pdfText = pdf => (sh('pdftotext', ['-q', pdf, '-']) ?? '').replace(/-\n/g, '')
const pagesOf = pdf => Number(sh('pdfinfo', [pdf])?.match(/^Pages:\s+(\d+)/m)?.[1]) || null
const count = (text, re) => (text.match(re) ?? []).length
const logSignals = log => ({
  missing: count(log, /^Missing character: There is no/gm),
  errors: count(log, /^! /gm),
  overfull: count(log, /^Overfull \\hbox/gm),
  firstError: log.match(/^! .*$/m)?.[0]?.slice(0, 160) ?? null,
})

/** the originals, cached by what their compiles are made of: the pipeline's files for the probe and the marked original */
const originals = existsSync(ORIGINALS) ? JSON.parse(readFileSync(ORIGINALS, 'utf8')) : {}
const fingerprint = (...overrides) => { const h = createHash('sha256'); for (const o of overrides) for (const [p, b] of [...o].sort(([a], [c]) => a.localeCompare(c))) h.update(p).update(b); return h.digest('hex').slice(0, 16) }
async function openOne(id) {
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(files)
  const made = fingerprint(probeFiles(paper), originalFiles(paper))
  if (originals[id]?.made !== made) {
    const { meta, project } = paper
    const probe = await compile(files, join(WORK, id, 'probe'), { main: project.main, engine: meta.compiler, rerun: false, overrides: probeFiles(paper) })
    const orig = await compile(files, join(WORK, id, 'orig'), { main: project.main, engine: meta.compiler, rerun: true, bibtex: meta.bbl ? false : null, overrides: originalFiles(paper) })
    const text = orig.ok ? pdfText(orig.pdf) : ''
    originals[id] = { made, fonts: readFontProbe(probe.log), ok: orig.ok, pages: orig.ok ? pagesOf(orig.pdf) : null, unresolved: count(text, /\?\?/g), ...logSignals(orig.log), ms: orig.ms }
    rmSync(join(WORK, id), { recursive: true, force: true })
    writeFileSync(ORIGINALS, JSON.stringify(originals, null, 1))
  }
  return { files, paper, original: originals[id] }
}

async function one({ files, paper, original }, id, lang) {
  const { meta, project, units, kept } = paper
  const translated = new Map(units.filter(u => !kept.has(u)).map(u => [u, pseudoTranslate(u, lang)]))
  const expected = [...translated.values()].flat().filter(p => p.tr).reduce((a, p) => a + lettersIn(p.s, lang), 0)
  const tried = []
  // each attempt in a directory of its own: the other languages of this paper compile beside it at the same time
  const dirOf = k => join(WORK, id, `${lang}-${k}`)
  let r = null, strategy = null
  for (const [k, s] of strategiesFor(meta, lang).entries()) {
    strategy = s
    r = await compile(files, dirOf(k), { main: project.main, engine: s.engine, rerun: true, bibtex: meta.bbl ? false : null, overrides: translationFiles(paper, translated, { strategy: s, fonts: original.fonts, draft: false, aux: null, bbl: null }) })
    tried.push(s.name)
    if (r.ok && !unsettable(r)) break
  }
  const ok = r.ok && !unsettable(r)
  const row = { id, lang, script: scriptOf(lang), ok, pdf: r.ok, strategy: ok ? strategy.name : null, tried, expected, ms: r.ms, ...logSignals(r.log), refOverfull: original.overfull, refPages: original.pages }
  if (r.ok) {
    const text = pdfText(r.pdf)
    Object.assign(row, { pages: pagesOf(r.pdf), found: lettersIn(text, lang), unresolved: count(text, /\?\?/g) - original.unresolved })
    row.coverage = expected ? +(row.found / expected).toFixed(3) : null
    mkdirSync(PDFS, { recursive: true })
    writeFileSync(join(PDFS, `${id}-${lang}.pdf`), readFileSync(r.pdf))
  }
  for (const k of tried.keys()) rmSync(dirOf(k), { recursive: true, force: true })
  return row
}

const median = xs => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
function summary(rows) {
  const out = {}
  for (const lang of LANGS) {
    const rs = rows.filter(r => r.lang === lang), ok = rs.filter(r => r.ok)
    out[lang] = {
      compiled: `${ok.length}/${rs.length}`,
      coverage: median(ok.map(r => r.coverage)),
      missing: ok.filter(r => r.missing > 0).length,
      newErrors: ok.filter(r => r.errors > 0).length,
      pageRatio: median(ok.map(r => (r.refPages ? +(r.pages / r.refPages).toFixed(2) : null))),
      overfullAdded: median(ok.map(r => r.overfull - r.refOverfull)),
      fallback: ok.filter(r => r.strategy !== r.tried[0]).length,
    }
  }
  return out
}
/** what got worse against the baseline, paper by paper */
function losses(rows, base) {
  const was = new Map(base.map(r => [`${r.id}/${r.lang}`, r]))
  const out = []
  for (const r of rows) {
    const b = was.get(`${r.id}/${r.lang}`)
    if (!b) continue
    const why = []
    if (b.ok && !r.ok) why.push(`no PDF (${r.firstError ?? 'no error in the log'})`)
    if (b.ok && r.ok) {
      if (r.coverage != null && b.coverage != null && r.coverage < b.coverage - 0.02) why.push(`coverage ${b.coverage} → ${r.coverage}`)
      if (r.missing > b.missing) why.push(`missing characters ${b.missing} → ${r.missing}`)
      if (r.errors > b.errors) why.push(`errors ${b.errors} → ${r.errors} (${r.firstError})`)
      if (r.unresolved > b.unresolved) why.push(`unresolved references ${b.unresolved} → ${r.unresolved}`)
      // overfull boxes move with any change to the text; a loss is a clear rise, not a box or two
      if (r.overfull > b.overfull + Math.max(2, Math.ceil(b.overfull * 0.1))) why.push(`overfull boxes ${b.overfull} → ${r.overfull}`)
    }
    if (why.length) out.push(`${r.id} ${r.lang}: ${why.join('; ')}`)
  }
  return out
}

const jobs = []
for (const id of PAPERS) for (const lang of LANGS) jobs.push({ id, lang })
const opened = new Map()
const rows = []
let next = 0
const t0 = Date.now()
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  while (next < jobs.length) {
    const { id, lang } = jobs[next++]
    if (!opened.has(id)) opened.set(id, openOne(id))
    const row = await one(await opened.get(id), id, lang).catch(e => ({ id, lang, ok: false, tried: [], firstError: `harness: ${e.message}` }))
    rows.push(row)
    console.log(`${String(rows.length).padStart(3)}/${jobs.length} ${id} ${lang} ${row.ok ? `${row.strategy}, ${row.pages}/${row.refPages} pp, coverage ${row.coverage}, missing ${row.missing}, errors ${row.errors}` : `FAILED ${row.firstError ?? ''}`}`)
  }
}))
rows.sort((a, b) => a.id.localeCompare(b.id) || LANGS.indexOf(a.lang) - LANGS.indexOf(b.lang))
writeFileSync(OUT, JSON.stringify(rows, null, 1))
console.log(`\n${rows.length} compiles in ${Math.round((Date.now() - t0) / 60000)} min`)
console.table(summary(rows))
if (flag('accept')) { writeFileSync(BASELINE, JSON.stringify(rows, null, 1)); console.log(`baseline stored: ${BASELINE}`) }
if (flag('check')) {
  const lost = losses(rows, JSON.parse(readFileSync(BASELINE, 'utf8')))
  console.log(lost.length ? `LOSSES (${lost.length}):\n${lost.join('\n')}` : 'no language lost anything against the baseline')
  process.exit(lost.length ? 1 : 0)
}
