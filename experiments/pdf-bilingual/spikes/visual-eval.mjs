// experiments/pdf-bilingual/spikes/visual-eval.mjs
// The visual evaluation's generator (plans/2026-09-27-geometry-lock-visual-eval-design.md): for a paper and a language,
// the translation once through Microsoft's free engine (the reader's wire), today's typesetting and the locked one
// compiled natively in Docker, every page rendered, the checks, and the paper's index; then the catalog.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>...   generate
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>... --reindex   render and index existing PDFs
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs --catalog
import { execFile, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { keptFor, lostIn, openPaper, probeFiles, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { latin1, readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { translateTexts, translateUnits } from '../../../src/pdf-reader/engine/mt.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
import { compare, heights, lockedFiles, marksOf, originalProbeFiles, readLines, readLockEvents, readTargets, shrinkSizes, theoremEnvs, tightenedLeads } from './lock.mjs'
import { catalogEntry, COLUMNS, overfullCount, PARAMS, SHRINK_MIN, suspiciousPages } from './visual-eval-lib.mjs'

const run = promisify(execFile)
/** a unit as its translation is cached: its kind and its source, pieces by kind and text, pair ids aside */
export const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`
/** cached pieces with each nested note bound to the unit's own (the cache holds a copy of it) */
const rebind = (u, pieces) => { const own = u.pieces.filter(p => p.t === 'nested'); return pieces.map(p => (p.t === 'nested' ? own.find(q => q.pre === p.pre && q.post === p.post) ?? p : p)) }
const root = new URL('..', import.meta.url).pathname
const OUT = join(root, 'data/runs/visual-eval')
const argv = process.argv.slice(2)
const firstError = log => (log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? 'no PDF').slice(0, 200)

async function compile(work, name, paper, files, overrides, { engine, rerun }) {
  const dir = join(work, name)
  rmSync(dir, { recursive: true, force: true })
  for (const [p, b] of files) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  for (const [p, b] of overrides) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const { project, meta } = paper
  const stem = project.main.split('/').pop().replace(/\.[^./]+$/, '')
  const docker = cmd => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...faithfulDockerArgs(root), '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
  if (rerun) await docker(['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...(meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', project.main])
  else await docker([engine, '-interaction=nonstopmode', project.main])
  const pdf = join(dir, `${stem}.pdf`), log = join(dir, `${stem}.log`)
  return { ok: existsSync(pdf), pdf, log: existsSync(log) ? readFileSync(log, 'latin1') : '' }
}

/** every page of a column: 144 dpi into pages/, 24 dpi into thumbs/, named <column>-<n>.jpg */
function render(dir, key) {
  for (const [sub, dpi] of [['pages', 144], ['thumbs', 24]]) {
    const d = join(dir, sub)
    mkdirSync(d, { recursive: true })
    for (const f of readdirSync(d)) if (f.startsWith(`${key}-`)) rmSync(join(d, f))
    execFileSync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=82', '-r', String(dpi), join(dir, `${key}.pdf`), join(d, key)])
    for (const f of readdirSync(d)) { const m = f.match(new RegExp(`^${key}-0*(\\d+)\\.jpg$`)); if (m) renameSync(join(d, f), join(d, `${key}-${Number(m[1])}.jpg`)) }
  }
}

/** the paper's index from what its directory holds: columns present or failed, rendered, with their page counts */
async function writeIndex(dir, base) {
  const columns = []
  for (const c of COLUMNS) {
    const file = join(dir, `${c.key}.pdf`)
    if (existsSync(file)) { render(dir, c.key); columns.push({ ...c, pages: (await marksOf(file)).pages }) }
    else if (base.failed?.[c.key]) columns.push({ ...c, pages: null })
  }
  const index = { ...base, columns }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 1))
  return index
}

async function generate(lang, id) {
  const dir = join(OUT, lang, id), work = join(dir, 'work')
  mkdirSync(work, { recursive: true })
  const t0 = Date.now(), note = (...a) => console.log(`[${lang} ${id} ${Math.round((Date.now() - t0) / 1000)}s]`, ...a)
  copyFileSync(join(root, 'data/corpus', id, 'arxiv.pdf'), join(dir, 'original.pdf'))
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(files)
  const { units, meta, project } = paper
  const cls = latin1(files.get(project.main)).match(/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)?.[1] ?? '?'
  const base = { lang, paper: id, cls, numbers: {}, failed: {}, flags: [], lostExtra: [], overfull: 0, suspicious: [] }

  // 1. the translation, once: both columns read it. Cached by each unit's kind and source (unitKey), so a front end
  // that cuts the paper differently asks only for the units it has not seen; a nested note is bound again to the unit
  // it belongs to now, the cache holding a copy of it
  const cache = join(dir, 'translation.json')
  const translated = new Map()
  const entries = existsSync(cache) ? (JSON.parse(readFileSync(cache, 'utf8')).entries ?? []) : []
  const byKey = new Map(entries.map(e => [e.key, e.pieces]))
  const kept = keptFor(paper, lang), todo = []
  for (const u of units) {
    if (kept.has(u)) continue
    const hit = byKey.get(unitKey(u))
    if (hit) translated.set(u, rebind(u, hit)); else todo.push(u)
  }
  if (todo.length) {
    const { results } = await translateUnits(todo, texts => translateTexts(texts, lang).then(r => r.map(text => (text == null ? null : { text, by: null }))), 'markers')
    for (const [u, r] of results) if (r.pieces) { translated.set(u, r.pieces); byKey.set(unitKey(u), r.pieces) }
  }
  const asked = units.filter(u => !kept.has(u)).length
  base.translation = { units: asked, untranslated: asked - translated.size, askedNow: todo.length }
  if (todo.length) writeFileSync(cache, JSON.stringify({ entries: [...byKey].map(([key, pieces]) => ({ key, pieces })) }))
  note('translated', JSON.stringify(base.translation))

  // 2. fonts, the original with probes (the lock's target), today, locked twice
  const fonts = readFontProbe((await compile(work, 'probe', paper, files, probeFiles(paper), { engine: meta.compiler, rerun: false })).log)
  const strategy = strategiesFor(meta, lang)[0]
  const theorems = theoremEnvs(files)
  const o = await compile(work, 'original', paper, files, originalProbeFiles(paper, theorems), { engine: meta.compiler, rerun: true })
  const today = await compile(work, 'today', paper, files, translationFiles(paper, translated, { strategy, fonts, draft: false }), { engine: strategy.engine, rerun: true })
  if (today.ok) copyFileSync(today.pdf, join(dir, 'today.pdf')); else base.failed.today = firstError(today.log)
  note('today', today.ok)
  if (!o.ok) { base.failed.locked = `the original with probes did not compile: ${firstError(o.log)}`; return writeIndex(dir, base) }
  const om = await marksOf(o.pdf), orig = heights(units, om, readLines(o.log)), targets = readTargets(o.log)
  if (om.pages !== (await marksOf(join(dir, 'original.pdf'))).pages) base.flags.push('original-mismatch')
  const { em, min } = PARAMS[lang]
  const opts = { strategy, fonts, em, targets, theorems }
  let locked = await compile(work, 'locked-1', paper, files, lockedFiles(paper, translated, opts), { engine: strategy.engine, rerun: true })
  let leads = new Map()
  if (locked.ok) {
    leads = tightenedLeads(orig, heights(units, await marksOf(locked.pdf), readLines(locked.log)), { em, min })
    if (leads.size) {
      const second = await compile(work, 'locked-2', paper, files, lockedFiles(paper, translated, { ...opts, leads }), { engine: strategy.engine, rerun: true })
      if (second.ok) locked = second; else { base.flags.push('second-pass-failed'); leads = new Map() }
    }
  }
  if (locked.ok) copyFileSync(locked.pdf, join(dir, 'locked.pdf')); else base.failed.locked = firstError(locked.log)
  note('locked', locked.ok, 'tightened', leads.size)

  // 2b. Locked with smaller type (the owner, 2026-09-28): the units still taller than their original set smaller, down
  // to SHRINK_MIN, as service H does to a block too long for its box; twice, since a smaller unit may still not fit
  let shrunk = null, sizes = new Map()
  if (locked.ok) for (let pass = 1; pass <= 2; pass++) {
    const cur = shrunk ?? locked
    const next = shrinkSizes(orig, heights(units, await marksOf(cur.pdf), readLines(cur.log)), sizes, { min: SHRINK_MIN })
    if ([...next].every(([i, f]) => sizes.get(i) === f)) break
    const r = await compile(work, `shrink-${pass}`, paper, files, lockedFiles(paper, translated, { ...opts, leads, sizes: next }), { engine: strategy.engine, rerun: true })
    if (!r.ok) { base.failed.shrink = firstError(r.log); break }
    shrunk = r; sizes = next
  }
  if (shrunk) copyFileSync(shrunk.pdf, join(dir, 'shrink.pdf'))
  else if (locked.ok && !base.failed.shrink) copyFileSync(locked.pdf, join(dir, 'shrink.pdf'))
  note('shrink', !!shrunk, 'smaller', sizes.size)

  // 3. numbers and checks
  if (today.ok) base.numbers.today = { ...compare(units, orig, await marksOf(today.pdf)), offPage: undefined }
  if (existsSync(join(dir, 'shrink.pdf')) && !base.failed.shrink) base.numbers.shrink = { ...compare(units, orig, await marksOf(join(dir, 'shrink.pdf'))), offPage: undefined, smaller: sizes.size }
  if (locked.ok) {
    const lm = await marksOf(locked.pdf), lc = compare(units, orig, lm)
    base.numbers.locked = { ...lc, offPage: undefined }
    base.suspicious = suspiciousPages({ events: readLockEvents(locked.log), leads, min, lockedMarks: lm, lockedCompare: lc })
    base.overfull = overfullCount(locked.log)
    if (today.ok) { const t = lostIn(today.log), l = lostIn(locked.log); base.lostExtra = [...l].filter(([c, n]) => n > (t.get(c) ?? 0)).map(([c]) => c) }
  }
  const index = await writeIndex(dir, base)
  note('done', JSON.stringify({ today: index.numbers.today?.samePage, locked: index.numbers.locked?.samePage, units: index.numbers.locked?.units, suspicious: index.suspicious.length }))
  return index
}

function catalog() {
  const langs = {}
  for (const lang of existsSync(OUT) ? readdirSync(OUT) : []) {
    const d = join(OUT, lang)
    if (!existsSync(join(d)) || lang === 'index.json') continue
    langs[lang] = readdirSync(d).filter(p => existsSync(join(d, p, 'index.json'))).sort().map(p => catalogEntry(JSON.parse(readFileSync(join(d, p, 'index.json'), 'utf8'))))
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ langs }, null, 1))
  console.log('catalog', Object.entries(langs).map(([l, a]) => `${l} ${a.length}`).join(', '))
}

if (argv.includes('--catalog')) catalog()
else {
  const [lang, ...ids] = argv.filter(a => !a.startsWith('--'))
  if (!PARAMS[lang] || !ids.length) { console.error('usage: visual-eval.mjs <lang> <paper>... [--reindex] | --catalog'); process.exit(2) }
  for (const id of ids) {
    if (argv.includes('--reindex')) { const dir = join(OUT, lang, id); await writeIndex(dir, JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))) }
    else await generate(lang, id).catch(e => console.error(`[${lang} ${id}] failed:`, e?.stack ?? e))
  }
  catalog()
}
