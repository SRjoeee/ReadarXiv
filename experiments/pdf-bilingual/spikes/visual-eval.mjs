// experiments/pdf-bilingual/spikes/visual-eval.mjs
// The visual evaluation's generator (plans/2026-09-27-geometry-lock-visual-eval-design.md): for a paper and a language,
// the translation once through Microsoft's free engine (the reader's wire), FIT and the H-rule lock
// compiled natively in Docker, every page rendered, the checks, and the paper's index; then the catalog.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>...   generate
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>... --reindex   render and index existing PDFs
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>... --generic   add the generic column to generated papers
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs <lang> <paper>... --flow[=<window>[:<horizon>[:<ahead>]]] [--floats] [--phys[=<lines>]] [--local=<lines>] [--keep] [--rate=<percent>] [--breaks] [--shrink=<percent>]   add the flow variant (a window of 50 lines by default; --floats: each float waits for its original's page; --phys: the final corrects the drift the preview measured, where it parts from the heights by more than <lines>; --local: the lead ahead only in that many lines before a jump the preview measured; --rate: what is taken back moves a unit's leading at most that percentage from the window's; --breaks: the correction starts again after each forced break the preview logged; --shrink: a CJK unit the floor of the leading cannot bring back set at a face down to that percentage)
//   pnpm exec tsx experiments/pdf-bilingual/spikes/visual-eval.mjs --catalog
import { execFile, execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { keptFor, openPaper, probeFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { latin1, latin1Bytes, markUnits, readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { scriptOf, strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { translateTexts, translateUnits } from '../../../src/pdf-reader/engine/mt.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
import { cjkType, compare, fitLeads, heights, lockedFiles, withCjkType, marksOf, originalProbeFiles, readColumns, readFloats, readForced, readLines, readLockEvents, readTargets, shrinkSizes, theoremEnvs } from './lock.mjs'
import { catalogEntry, COLUMNS, FIT, H_RULES, overfullCount, PARAMS, suspiciousPages } from './visual-eval-lib.mjs'
import { citeStyleOf, measureUnits, readSizeProbe, readWidthProbe, SIZE_PROBE, WIDTH_PROBE } from './density.mjs'
import { correctUnits, DESIGN, flowType, heightAtSize, solveType, unitHeights, unitLines } from './generic-type.mjs'
import { alignment, drifts, uniformity } from './alignment.mjs'

const run = promisify(execFile)
/** a unit as its translation is cached: its kind and its source, pieces by kind and text, pair ids aside */
export const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`
/** cached pieces with each nested note bound to the unit's own (the cache holds a copy of it) */
const rebind = (u, pieces) => { const own = u.pieces.filter(p => p.t === 'nested'); return pieces.map(p => (p.t === 'nested' ? own.find(q => q.pre === p.pre && q.post === p.post) ?? p : p)) }
const root = new URL('..', import.meta.url).pathname
const OUT = join(root, 'data/runs/visual-eval')
const argv = process.argv.slice(2)
const firstError = log => (log.match(/^(?:\S+:\d+: .*|! .*)$/m)?.[0] ?? 'no PDF').slice(0, 200)
/** a compile directory's main log and PDF, by the main file's name: a source tree holds figures as PDFs too, and the
 *  first PDF in the directory was one of them (2608.02785, 2608.06233: no marks, no numbers) */
const stemOf = paper => paper.project.main.split('/').pop().replace(/\.[^./]+$/, '')
const logIn = (d, stem) => { const f = join(d, `${stem}.log`); return existsSync(f) ? readFileSync(f, 'latin1') : '' }
const pdfIn = (d, stem) => { const f = join(d, `${stem}.pdf`); return existsSync(f) ? f : null }

/** the generic type for a translation (plans/2026-09-30-generic-type.md): its units measured against the original's
 *  lines (density.mjs), one type solved for the whole among the sizes the face has (`sizes`, the size probe's),
 *  and how long that took — what the reader would spend on it, the paper's sources already in memory */
function genericType({ paper, files, translated, lang, fonts, probe = null, sizes = null, oLog }) {
  const t0 = performance.now()
  const { units } = paper, script = scriptOf(lang)
  const sources = [...files].filter(([f]) => /\.(tex|sty|cls)$/i.test(f)).map(([, b]) => latin1(b)).join('\n')
  const bbl = [...files].filter(([f]) => /\.bbl$/i.test(f)).map(([, b]) => latin1(b)).join('\n')
  const byIndex = new Map(units.map((u, i) => [i, translated.get(u)]).filter(([, pieces]) => pieces))
  const measured = measureUnits({ units, translated: byIndex, lines: readLines(oLog), fonts, probe, citeStyle: citeStyleOf(sources, bbl), script })
  const type = solveType(measured, script, sizes)
  return { type, script, sizes, list: measured, units: measured.length, ms: performance.now() - t0 }
}
/** a compile's measured height over the original's, on the units the solver used: its line probes, each unit's lines at
 *  its leading, against the original's lines at the paper's */
function measuredRatio(list, log) {
  const lines = readLines(log)
  let o = 0, t = 0
  for (const u of list) { const l = lines.get(u.i); if (!l) continue; o += u.lo * u.bs; t += l.lines * l.bs }
  return o ? t / o : null
}
/** the type after one compile at the predicted type: the paper's density as that compile measured it, solved again
 *  among the sizes its own size probe found in the faces the translation is set in — the reader's preview measures,
 *  its final compile uses it, and no compile is added (step 4) */
function correctedType(g, log) {
  const t0 = performance.now(), measured = measuredRatio(g.list, log)
  if (measured == null) return null
  const sizes = readSizeProbe(log) ?? g.sizes
  return { type: solveType(correctUnits(g.list, g.script, g.type, measured), g.script, sizes), script: g.script, sizes, measured, ms: performance.now() - t0 }
}
/** lockedFiles options for a generic type: CJK through the strategy's CJK face and glue (withCjkType), which reach every
 *  role, the leading × the paper's; an alphabet's translated text at the size, then at the leading × the paper's */
function genericOpts({ type, script }, { strategy, fonts, em, theorems, paper, translated }) {
  const lead = `${type.lead.toFixed(4)}\\baselineskip`
  // a table: no taller than its original, never below 0.85 of its width — a block's rule, the same for every script
  const table = { fitHeight: true, fitMin: 0.85 }
  if (DESIGN[script].cjk) return { strategy: withCjkType(strategy, type), fonts, em, theorems, sync: false, lead, ...table }
  // the size compensates text that flows: paragraphs, captions and notes through their marks, a figure's text (a boxed
  // passage) through lock.mjs's in-group declaration. A line that does not flow — a table cell, a heading — is as tall
  // as its type whatever its length: set smaller it came out shorter than the original's, and on 2608.06701 the tables
  // pulled the pages after them a third of a column ahead (step 3). The author block keeps the class's
  const marked = markUnits(paper.units), index = new Map(paper.units.map((u, i) => [u, i])), sizes = new Map()
  for (const u of translated.keys()) if (marked(u) || (u.kind === 'figure' && !u.front)) sizes.set(index.get(u), type.size)
  // the compile measures how wide the faces the translation is set in come out at each size, for the next solve
  const probed = { ...strategy, pre: f => `${strategy.pre(f)}\\AtBeginDocument{${SIZE_PROBE}}\n` }
  return { strategy: probed, fonts, em, theorems, sync: false, lead, sizes, ...table }
}
/** the reader's font probe with the width probe in its body (density.mjs WIDTH_PROBE): the families and the body face's scale */
function widthProbeFiles(paper) {
  const files = probeFiles(paper), main = latin1(files.get(paper.project.main))
  files.set(paper.project.main, latin1Bytes(main.replace('\\begin{document}\\end{document}', `\\begin{document}${WIDTH_PROBE}\\end{document}`)))
  return files
}
/** a compile's numbers against the original: compare's, and the owner's terms (alignment.mjs) without their raw lists */
async function numbersFor(units, orig, om, pdf, log, extra = {}) {
  const tm = await marksOf(pdf), a = alignment(om, tm)
  return { ...compare(units, orig, tm), offPage: undefined, align: { pages: a.pages, matched: a.matched, missing: a.missing, drift: { ...a.drift, values: undefined }, size: { ...a.size, values: undefined } }, uniformity: uniformity(readLines(log), units), ...extra }
}
/** the last of a column's compiles, the one whose PDF the column shows (fit-3, else fit-2, ...) */
const finalOf = (work, prefix, shown, stem) => {
  const want = existsSync(shown) ? readFileSync(shown) : null
  for (let n = 6; n >= 1; n--) { const pdf = pdfIn(join(work, `${prefix}-${n}`), stem); if (pdf && want && readFileSync(pdf).equals(want)) return join(work, `${prefix}-${n}`) }
  return null
}

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

/** a paper's translation from its cache (translation.json, by each unit's kind and source), the units it lacks asked
 *  for and added to it: a front end that cuts the paper differently (a unit's pieces changed) asks only for the units it
 *  has not seen; a nested note is bound again to the unit it belongs to now, the cache holding a copy of it */
async function translationOf(dir, paper, lang) {
  const { units } = paper, cache = join(dir, 'translation.json')
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
    writeFileSync(cache, JSON.stringify({ entries: [...byKey].map(([key, pieces]) => ({ key, pieces })) }))
  }
  const asked = units.filter(u => !kept.has(u)).length
  return { translated, stats: { units: asked, untranslated: asked - translated.size, askedNow: todo.length } }
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
  const { translated, stats } = await translationOf(dir, paper, lang)
  base.translation = stats
  note('translated', JSON.stringify(base.translation))

  // 2. fonts and the original with probes: the target shared by FIT and the H-rule lock
  const probed = await compile(work, 'probe', paper, files, widthProbeFiles(paper), { engine: meta.compiler, rerun: false })
  const fonts = readFontProbe(probed.log), widthProbe = readWidthProbe(probed.log), sizeProbe = readSizeProbe(probed.log)
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

  // 2d. The generic type (plans/2026-09-30-generic-type.md): one set of type for the whole translation, found from its
  // predicted lines against the original's — no trial, one compile
  let generic = null
  const g = genericType({ paper, files, translated, lang, fonts, probe: widthProbe, sizes: sizeProbe, oLog: o.log })
  {
    const r = await compile(work, 'generic', paper, files, lockedFiles(paper, translated, genericOpts(g, { strategy, fonts, em, theorems, paper, translated })), { engine: strategy.engine, rerun: true })
    if (r.ok) { generic = r; copyFileSync(r.pdf, join(dir, 'generic.pdf')) } else base.failed.generic = firstError(r.log)
  }
  note('generic', !!generic, JSON.stringify(g.type), `${g.ms.toFixed(1)} ms`)

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
  if (generic) base.numbers.generic = await numbersFor(units, orig, om, generic.pdf, generic.log, { type: g.type, predicted: g.type.ratio, solveMs: g.ms, measured: g.units })
  for (const [key, result] of [['fit', fit], ['lockh', lockh]]) if (result) Object.assign(base.numbers[key], await numbersFor(units, orig, om, result.pdf, result.log))
  const index = await writeIndex(dir, base)
  note('done', JSON.stringify({ fit: index.numbers.fit?.samePage, lockh: index.numbers.lockh?.samePage, units: index.numbers.fit?.units }))
  return index
}

/** the generic column alone, for a paper generated before it: the cached translation, the probe's fonts and the marked
 *  original already in its work directory, one compile; then its numbers, the owner's terms for FIT and the H-rule
 *  lock from their own compiles, and the index again */
async function addGeneric(lang, id) {
  const dir = join(OUT, lang, id), work = join(dir, 'work')
  const t0 = Date.now(), note = (...a) => console.log(`[${lang} ${id} ${Math.round((Date.now() - t0) / 1000)}s]`, ...a)
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(files), { units, meta } = paper
  const { translated } = await translationOf(dir, paper, lang)
  const stem = stemOf(paper), fonts = readFontProbe(logIn(join(work, 'probe'), stem)), oLog = logIn(join(work, 'original'), stem), oPdf = pdfIn(join(work, 'original'), stem)
  const probe = readWidthProbe(logIn(join(work, 'width'), stem)), sizes = readSizeProbe(logIn(join(work, 'width'), stem))
  if (!oLog || !oPdf) { note('no marked original in', work); return }
  const strategy = strategiesFor(meta, lang)[0], theorems = theoremEnvs(files), { em } = PARAMS[lang]
  const g = genericType({ paper, files, translated, lang, fonts, probe, sizes, oLog })
  const optsOf = x => genericOpts(x, { strategy, fonts, em, theorems, paper, translated })
  // the first compile at the predicted type (the reader's preview), the second at the type its measurement corrects
  // (the reader's final); the column shows the second, and the numbers keep both
  const r1 = await compile(work, 'generic-1', paper, files, lockedFiles(paper, translated, optsOf(g)), { engine: strategy.engine, rerun: true })
  const g2 = r1.ok ? correctedType(g, r1.log) : null
  const r2 = g2 ? await compile(work, 'generic-2', paper, files, lockedFiles(paper, translated, optsOf(g2)), { engine: strategy.engine, rerun: true }) : null
  const r = r2?.ok ? r2 : r1
  index.failed ??= {}; index.numbers ??= {}
  delete index.failed.generic
  if (r.ok) copyFileSync(r.pdf, join(dir, 'generic.pdf')); else { index.failed.generic = firstError(r.log); rmSync(join(dir, 'generic.pdf'), { force: true }); delete index.numbers.generic }
  const om = await marksOf(oPdf), orig = heights(units, om, readLines(oLog))
  if (r.ok) index.numbers.generic = await numbersFor(units, orig, om, r.pdf, r.log, {
    type: (r2?.ok ? g2 : g).type, solveMs: g.ms + (g2?.ms ?? 0), measuredUnits: g.units, compiles: r2?.ok ? 2 : 1,
    first: r1.ok ? { type: g.type, measured: g2?.measured ?? measuredRatio(g.list, r1.log), numbers: await numbersFor(units, orig, om, r1.pdf, r1.log) } : null,
    second: r2?.ok ? { measured: measuredRatio(g.list, r2.log) } : null,
  })
  // FIT and the H-rule lock in the same terms, from the PDFs the page shows; their uniformity from the compile that made
  // them, when it is still in the work directory
  for (const key of ['fit', 'lockh']) {
    if (!index.numbers[key] || !existsSync(join(dir, `${key}.pdf`))) continue
    const last = finalOf(work, key, join(dir, `${key}.pdf`), stem)
    Object.assign(index.numbers[key], await numbersFor(units, orig, om, join(dir, `${key}.pdf`), last ? logIn(last, stem) : ''))
  }
  await writeIndex(dir, index)
  note('generic', r.ok, 'first', JSON.stringify(g.type), 'measured', g2?.measured?.toFixed(3), 'second', JSON.stringify(g2?.type), `solve ${(g.ms + (g2?.ms ?? 0)).toFixed(1)} ms`, JSON.stringify({ fit: index.numbers.fit?.align?.drift?.median, generic: index.numbers.generic?.align?.drift?.median }))
}

/** the flow variant (generic-type.mjs flowType) for a paper generated before it: the generic type, each unit's
 *  leading following the original's flow over `window` of its lines, what the range stopped taken back over `horizon`
 *  — from the predicted lines for the first compile (the reader's preview), from that compile's measured lines for the
 *  second (the reader's final), its knobs solved again from what the first measured. Two compiles, as the generic
 *  column's. Kept as `key` (numbers and PDF) */
async function addFlow(lang, id, { window, horizon, ahead = 0, floats = false, phys = false, local = 0, keep = false, rate = 0, breaks = false, shrink = 0, key }) {
  const paced = rate ? rate / 100 : Infinity
  const dir = join(OUT, lang, id), work = join(dir, 'work')
  const t0 = Date.now(), note = (...a) => console.log(`[${lang} ${id} ${Math.round((Date.now() - t0) / 1000)}s]`, ...a)
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(files), { units, meta } = paper
  const { translated } = await translationOf(dir, paper, lang)
  const stem = stemOf(paper), fonts = readFontProbe(logIn(join(work, 'probe'), stem)), oLog = logIn(join(work, 'original'), stem), oPdf = pdfIn(join(work, 'original'), stem)
  const widthLog = logIn(join(work, 'width'), stem), probe = readWidthProbe(widthLog), sizes = readSizeProbe(widthLog)
  if (!oLog || !oPdf) { note('no marked original in', work); return }
  const strategy = strategiesFor(meta, lang)[0], theorems = theoremEnvs(files), { em } = PARAMS[lang]
  const g = genericType({ paper, files, translated, lang, fonts, probe, sizes, oLog })
  const cjk = DESIGN[g.script].cjk, lo = readLines(oLog)
  // with `shrink` (CJK), a unit the floor of the leading cannot bring back set at a face down to that percentage
  const faceMin = cjk && shrink ? shrink / 100 : 0, byIndex = new Map(g.list.map(u => [u.i, u]))
  const faceStats = faces => (faces?.size ? { n: faces.size, min: Math.min(...faces.values()) } : null)
  // a unit's leading × the paper's (CJK) or × its size's (an alphabet) as \\axtlead@<unit> takes it, × the font size
  const factors = leads => new Map([...leads].filter(([i]) => lo.get(i)?.size).map(([i, l]) => [i, (l * lo.get(i).bs) / lo.get(i).size]))
  // with `floats`, each caption's float waits for its original's page and column (lock.mjs FLOAT_TEX)
  const om0 = floats || phys ? await marksOf(oPdf) : null
  const floatsAt = new Map(floats ? units.map((u, i) => [u, i, om0.marks.get(`${i}s`)]).filter(([u, , m]) => u.kind === 'caption' && m).map(([, i, m]) => [i, { page: m.page + 1, col: om0.twoColumn && m.x >= om0.width / 2 ? 1 : 0 }]) : [])
  const optsOf = (x, leads, faces) => ({ ...genericOpts(x, { strategy, fonts, em, theorems, paper, translated }), leads: factors(leads), floatsAt, ...(faces?.size ? { sizes: faces } : {}) })
  const spread = leads => { const v = [...leads.values()].sort((a, b) => a - b); return v.length ? { p10: v[Math.floor(v.length * 0.1)], median: v[v.length >> 1], p90: v[Math.floor(v.length * 0.9)] } : null }
  const t1 = performance.now(), flow1 = flowType(g.list, g.script, unitHeights(g.list, g.script, g.type), { window, horizon, ahead, rate: paced, shrink: faceMin ? { min: faceMin, heightAt: (i, f) => heightAtSize(byIndex.get(i), g.script, g.type, f) } : null })
  const leads1 = flow1.leads, faces1 = flow1.sizes, ms1 = performance.now() - t1
  const r1 = await compile(work, `${key}-1`, paper, files, lockedFiles(paper, translated, optsOf(g, leads1, faces1)), { engine: strategy.engine, rerun: true })
  let second = null
  if (r1.ok) {
    const t2 = performance.now(), lines = readLines(r1.log), got = g.list.filter(u => lines.get(u.i))
    // what the first compile measured at the type's own leading, the knobs solved again from it, and each unit's
    // measured lines carried to the new knobs by the prediction's change (none where only the leading changed)
    // (a unit the preview set at a smaller face: its lines as the full face would have taken them, by the prediction)
    const plain = unitLines(g.list, g.script, g.type), sized = unitLines(g.list, g.script, g.type, faces1)
    const full = u => (lines.get(u.i).lines * plain.get(u.i)) / sized.get(u.i)
    let o = 0, t = 0
    for (const u of got) { o += u.lo * u.bs; t += full(u) * g.type.lead * (cjk ? 1 : g.type.size) * u.bs }
    const measured = o ? t / o : 1, sizes2 = readSizeProbe(r1.log) ?? sizes
    const corrected = correctUnits(g.list, g.script, g.type, measured), type = solveType(corrected, g.script, sizes2)
    const before = unitLines(corrected, g.script, g.type), after = unitLines(corrected, g.script, type)
    const heights = new Map(got.map(u => [u.i, ((full(u) * after.get(u.i)) / before.get(u.i)) * (cjk ? 1 : type.size) * u.bs])), cu = new Map(corrected.map(u => [u.i, u]))
    // with `phys`, the drift the preview measured at each unit, pages and floats and all, is what the final corrects
    // (`phys` a number of lines: the measure taken only where it parts from the heights' account by more than that)
    const bsMedian = [...got.map(u => u.bs)].sort((a, b) => a - b)[got.length >> 1] ?? 12
    const seen = phys ? { drift: drifts(om0, await marksOf(r1.pdf)), preview: new Map(got.map(u => [u.i, lines.get(u.i).lines * lines.get(u.i).bs])), snap: phys === true ? undefined : phys * bsMedian, local, keep, ...(breaks ? { breaks: readForced(r1.log) } : {}) } : null
    const flow2 = flowType(got, g.script, heights, { window, horizon, ahead, measured: seen, rate: paced, shrink: faceMin ? { min: faceMin, heightAt: (i, f) => (heights.get(i) * heightAtSize(cu.get(i), g.script, type, f)) / heightAtSize(cu.get(i), g.script, type, 1) } : null })
    second = { type, script: g.script, sizes: sizes2, measured, leads: flow2.leads, faces: flow2.sizes, ms: performance.now() - t2 }
    // AXT_FLOW_DUMP=<file>: the final's flow inputs, to replay flowType outside the compile
    if (process.env.AXT_FLOW_DUMP) writeFileSync(process.env.AXT_FLOW_DUMP, JSON.stringify({ list: got.map(u => ({ i: u.i, lo: u.lo, bs: u.bs })), heights: [...heights], measured: seen && { ...seen, drift: [...seen.drift], preview: [...seen.preview], breaks: seen.breaks && [...seen.breaks] }, window, horizon, ahead, rate: paced }))
  }
  const r2 = second ? await compile(work, `${key}-2`, paper, files, lockedFiles(paper, translated, optsOf(second, second.leads, second.faces)), { engine: strategy.engine, rerun: true }) : null
  const r = r2?.ok ? r2 : r1
  index.failed ??= {}; index.numbers ??= {}
  delete index.failed[key]
  if (r.ok) copyFileSync(r.pdf, join(dir, `${key}.pdf`)); else { index.failed[key] = firstError(r.log); rmSync(join(dir, `${key}.pdf`), { force: true }); delete index.numbers[key] }
  const om = await marksOf(oPdf), orig = heights(units, om, lo)
  if (r.ok) index.numbers[key] = await numbersFor(units, orig, om, r.pdf, r.log, {
    window, horizon, ahead, type: (r2?.ok ? second : g).type, leads: spread(r2?.ok ? second.leads : leads1), faces: faceStats(r2?.ok ? second.faces : faces1), solveMs: g.ms + ms1 + (second?.ms ?? 0), compiles: r2?.ok ? 2 : 1,
    first: r1.ok ? { type: g.type, leads: spread(leads1), faces: faceStats(faces1), measured: second?.measured, numbers: await numbersFor(units, orig, om, r1.pdf, r1.log) } : null,
  })
  // other variants of the same paper may be compiling alongside: their numbers as they are now, this one's added
  const now = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  now.numbers ??= {}; now.failed ??= {}
  if (index.numbers[key]) now.numbers[key] = index.numbers[key]; else delete now.numbers[key]
  if (index.failed[key]) now.failed[key] = index.failed[key]; else delete now.failed[key]
  await writeIndex(dir, now)
  note(key, r.ok, 'first', JSON.stringify(g.type), 'measured', second?.measured?.toFixed(3), 'second', JSON.stringify(second?.type), 'leads', JSON.stringify(index.numbers[key]?.leads), JSON.stringify({ generic: index.numbers.generic?.align?.drift?.median, [key]: index.numbers[key]?.align?.drift?.median }))
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
  if (!PARAMS[lang] || !ids.length) { console.error('usage: visual-eval.mjs <lang> <paper>... [--reindex | --generic | --flow[=<window>[:<horizon>[:<ahead>]]]] | --catalog'); process.exit(2) }
  for (const id of ids) {
    if (argv.includes('--reindex')) { const dir = join(OUT, lang, id); await writeIndex(dir, JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))) }
    else if (argv.includes('--generic')) await addGeneric(lang, id).catch(e => console.error(`[${lang} ${id}] failed:`, e?.stack ?? e))
    else if (argv.some(a => a.startsWith('--flow'))) {
      // --flow[=<window>[:<horizon>[:<ahead>]]]: a window of 50 lines by default, kept as `flow`; another as
      // `flow<window>`, and `a<ahead>` after it when the drift aimed at is ahead of the original
      const [w, hz, ah = 0] = (argv.find(a => a.startsWith('--flow='))?.slice(7) ?? '50').split(':').map(Number)
      const floats = argv.includes('--floats'), physArg = argv.find(a => a === '--phys' || a.startsWith('--phys='))
      const phys = physArg ? (physArg.includes('=') ? Number(physArg.slice(7)) : true) : false
      const local = Number(argv.find(a => a.startsWith('--local='))?.slice(8) ?? 0), keep = argv.includes('--keep'), rate = Number(argv.find(a => a.startsWith('--rate='))?.slice(7) ?? 0), breaks = argv.includes('--breaks'), shrink = Number(argv.find(a => a.startsWith('--shrink='))?.slice(9) ?? 0)
      const key = `${w === 50 ? 'flow' : `flow${w}`}${ah ? `a${ah}` : ''}${floats ? 'f' : ''}${phys ? `p${phys === true ? '' : phys}` : ''}${local ? `l${local}` : ''}${keep ? 'k' : ''}${rate ? `r${rate}` : ''}${breaks ? 'b' : ''}${shrink ? `s${shrink}` : ''}`
      await addFlow(lang, id, { window: w, horizon: Number.isFinite(hz) ? hz : Math.max(w, 50), ahead: ah, floats, phys, local, keep, rate, breaks, shrink, key }).catch(e => console.error(`[${lang} ${id}] failed:`, e?.stack ?? e))
    }
    else await generate(lang, id).catch(e => console.error(`[${lang} ${id}] failed:`, e?.stack ?? e))
  }
  catalog()
}
