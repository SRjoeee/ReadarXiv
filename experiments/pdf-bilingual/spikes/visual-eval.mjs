// experiments/pdf-bilingual/spikes/visual-eval.mjs
// The visual evaluation's generator (plans/2026-09-27-geometry-lock-visual-eval-design.md): for a paper and a language,
// the translation once through Microsoft's free engine (the reader's wire), FIT and the H-rule lock
// compiled natively in Docker, every page rendered, the checks, and the paper's index; then the catalog.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>...   generate
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>... --reindex   render and index existing PDFs
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs --catalog
import { execFile, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { keptFor, openPaper, probeFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { latin1, readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { scriptOf, strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { translateTexts, translateUnits } from '../../../src/pdf-reader/engine/mt.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
import { cjkType, compare, fitLeads, heights, lockedFiles, withCjkType, marksOf, originalProbeFiles, readColumns, readFloats, readLines, readLockEvents, readTargets, shrinkSizes, theoremEnvs } from './lock.mjs'
import { catalogEntry, COLUMNS, FIT, H_RULES, overfullCount, PARAMS, suspiciousPages } from './visual-eval-lib.mjs'

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
  const base = { lang, paper: id, cls, numbers: {}, failed: {}, flags: [], diagnostics: {} }

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

  // 2. fonts and the original with probes: the target shared by FIT and the H-rule lock
  const fonts = readFontProbe((await compile(work, 'probe', paper, files, probeFiles(paper), { engine: meta.compiler, rerun: false })).log)
  const strategy = strategiesFor(meta, lang)[0]
  const theorems = theoremEnvs(files)
  const o = await compile(work, 'original', paper, files, originalProbeFiles(paper, theorems), { engine: meta.compiler, rerun: true })
  if (!o.ok) {
    for (const key of ['fit', 'lockh']) base.failed[key] = `the original with probes did not compile: ${firstError(o.log)}`
    return writeIndex(dir, base)
  }
  const om = await marksOf(o.pdf), orig = heights(units, om, readLines(o.log)), targets = readTargets(o.log)
  if (om.pages !== (await marksOf(join(dir, 'original.pdf'))).pages) base.flags.push('original-mismatch')
  const { em } = PARAMS[lang]
  const opts = { strategy, fonts, em, targets, theorems }
  // 2b. Locked by service H's rules (the owner, 2026-09-28): each block in its original's box — units at the lock's
  // leading with CJK tracked as H does, no unit moved off its original's page, a column ended early filled to its
  // original's height, floats at their original's height (SYNC_TEX), tables held to their original's box, and a unit still taller than its original set
  // smaller down to H's floor, twice, since a smaller unit may still not fit
  let lockh = null, sizes = new Map()
  {
    const cjk = ['Hans', 'Hant', 'Jpan', 'Kore'].includes(scriptOf(lang))
    // CJK at H's leading, 1.3 × the size; an alphabet at the paper's own, which a smaller size scales with it
    const hopts = { ...opts, strategy: cjk ? withCjkType(strategy, { lead: strategy.leading ?? 1, track: H_RULES.track, scale: 1 }) : strategy, ...(cjk ? {} : { lead: '\\baselineskip' }), h: true, columns: readColumns(o.log), floats: readFloats(o.log) }
    let r = await compile(work, 'lockh-1', paper, files, lockedFiles(paper, translated, hopts), { engine: strategy.engine, rerun: true })
    for (let pass = 2; pass <= 4 && r.ok; pass++) {
      const next = shrinkSizes(orig, heights(units, await marksOf(r.pdf), readLines(r.log)), sizes, { min: H_RULES.min, margin: H_RULES.margin })
      if ([...next].every(([i, f]) => sizes.get(i) === f)) break
      const s2 = await compile(work, `lockh-${pass}`, paper, files, lockedFiles(paper, translated, { ...hopts, sizes: next }), { engine: strategy.engine, rerun: true })
      if (!s2.ok) { base.flags.push(`lockh-pass-${pass}-failed`); break }
      r = s2; sizes = next
    }
    if (r.ok) lockh = r; else base.failed.lockh = firstError(r.log)
  }
  // 2c. The fit (the owner, 2026-09-28): no sync point. A trial at today's leading, the units' heights against the
  // original's, and the paper's one factor with each unit's nudge (lock.mjs fitLeads); a script that grows is first set
  // smaller as a whole, so that its leading need not close up
  let fit = null
  if (['Hans', 'Hant', 'Jpan', 'Kore'].includes(scriptOf(lang))) {
    // CJK: one set of type for the whole translation (lock.mjs cjkType): a trial at today's, the shares worked out,
    // a second trial to take up what the new line breaks moved, then the fit
    const todayType = { lead: strategy.leading ?? 1, track: 0, scale: 1 }
    const typeset = (name, t) => compile(work, name, paper, files, lockedFiles(paper, translated, { strategy: withCjkType(strategy, t), fonts, em, theorems, sync: false, lead: `${t.lead}\\baselineskip` }), { engine: strategy.engine, rerun: true })
    const ratio = async r => { const lines = readLines(r.log); return fitLeads(orig, heights(units, await marksOf(r.pdf), lines), lines, { lo: 0, hi: 99, band: 0 }).g }
    let t = todayType, r = await typeset('fit-1', todayType), total = 1
    for (let pass = 2; pass <= 3 && r.ok; pass++) {
      total *= await ratio(r)
      t = cjkType(total, todayType)
      const next = await typeset(`fit-${pass}`, t)
      if (!next.ok) { base.failed.fit = firstError(next.log); break }
      r = next
      total = t.reached
    }
    if (r.ok) fit = { ...r, g: total, held: t.reached, size: t.scale, type: t }; else base.failed.fit = firstError(r.log)
  } else {
    const fopts = { strategy, fonts, em, theorems, sync: false, lead: `${strategy.leading ?? 1}\\baselineskip` }
    let trial = await compile(work, 'fit-1', paper, files, lockedFiles(paper, translated, fopts), { engine: strategy.engine, rerun: true })
    const fitSizes = new Map()
    if (trial.ok) {
      const lines = readLines(trial.log), { g } = fitLeads(orig, heights(units, await marksOf(trial.pdf), lines), lines, { lo: 0, hi: 99, band: 0 })
      const size = Math.min(1, Math.max(FIT.minSize, Math.sqrt(g)))
      if (size < 0.999) {
        for (const i of lines.keys()) fitSizes.set(i, size)
        const second = await compile(work, 'fit-2', paper, files, lockedFiles(paper, translated, { ...fopts, sizes: fitSizes }), { engine: strategy.engine, rerun: true })
        if (second.ok) trial = second; else fitSizes.clear()
      }
    }
    if (trial.ok) {
      const lines = readLines(trial.log), { g, held, leads: fitLeadMap } = fitLeads(orig, heights(units, await marksOf(trial.pdf), lines), lines, FIT.alphabet)
      const r = await compile(work, 'fit-3', paper, files, lockedFiles(paper, translated, { ...fopts, sizes: fitSizes, leads: fitLeadMap }), { engine: strategy.engine, rerun: true })
      if (r.ok) fit = { ...r, g, held, size: fitSizes.values().next().value ?? 1 }; else base.failed.fit = firstError(r.log)
    } else base.failed.fit = firstError(trial.log)
  }
  if (fit) copyFileSync(fit.pdf, join(dir, 'fit.pdf'))
  note('fit', !!fit, fit ? `G ${fit.g.toFixed(3)} held ${fit.held.toFixed(3)} size ${fit.size.toFixed(3)}${fit.type ? ` lead ${fit.type.lead.toFixed(3)} track ${fit.type.track.toFixed(3)}` : ''}` : '')
  if (lockh) copyFileSync(lockh.pdf, join(dir, 'lockh.pdf'))
  note('lockh', !!lockh, 'smaller', sizes.size)

  // 3. numbers and checks
  if (fit) base.numbers.fit = { ...compare(units, orig, await marksOf(fit.pdf)), offPage: undefined, g: fit.g, held: fit.held, size: fit.size, ...(fit.type ? { type: fit.type } : {}) }
  if (lockh) base.numbers.lockh = { ...compare(units, orig, await marksOf(lockh.pdf)), offPage: undefined, smaller: sizes.size }
  for (const [key, result] of [['fit', fit], ['lockh', lockh]]) {
    if (!result) continue
    const marks = await marksOf(result.pdf)
    base.diagnostics[key] = {
      overfull: overfullCount(result.log),
      suspicious: key === 'lockh' ? suspiciousPages({ events: readLockEvents(result.log), leads: new Map(), min: em, lockedMarks: marks, lockedCompare: compare(units, orig, marks) }) : [],
    }
  }
  const index = await writeIndex(dir, base)
  note('done', JSON.stringify({ fit: index.numbers.fit?.samePage, lockh: index.numbers.lockh?.samePage, units: index.numbers.fit?.units }))
  return index
}

/** the page lists the round's papers alone when round.json names them ({ lang: [paper] }): a few at a time, the owner
 *  reviewing each round before more (2026-09-28); without it every paper generated */
function catalog() {
  const langs = {}
  const round = existsSync(join(OUT, 'round.json')) ? JSON.parse(readFileSync(join(OUT, 'round.json'), 'utf8')) : null
  for (const lang of existsSync(OUT) ? readdirSync(OUT) : []) {
    const d = join(OUT, lang)
    if (!existsSync(join(d)) || lang.endsWith('.json') || (round && !round[lang])) continue
    langs[lang] = readdirSync(d).filter(p => existsSync(join(d, p, 'index.json')) && (!round || round[lang].includes(p))).sort().map(p => catalogEntry(JSON.parse(readFileSync(join(d, p, 'index.json'), 'utf8'))))
  }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ columns: COLUMNS, langs }, null, 1))
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
