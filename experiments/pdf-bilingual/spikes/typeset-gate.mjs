// experiments/pdf-bilingual/spikes/typeset-gate.mjs
// The typesetting rule's gate (src/pdf-reader/engine/typeset/): the maintainer's three goals, today's setting against
// the rule's, on the evaluation round and on papers the rule was not tuned on, natively in Docker as the evaluation of
// 2026-10-01 ran them — and a failure where the rule falls behind its stored baseline.
//   (1) each block's space and place: where each unit starts against its original (drift, in columns, the mean of the
//       papers' medians), its height against its original's (the share within 15 %);
//   (2) floats: each caption on its original's page, and within 30 pt of its original's place (shares of all floats);
//   (3) pages and where each block ends: the pages against the original's (equal, more, fewer), the end drift.
// Per paper: the font probe with its width and size probes, the original with its line probes, today's final (the
// reader's setting, no rule), the rule's measuring compile (previewTypesetting) and its final (finalTypesetting) —
// every pass, images in (latexmk), as the experiment and the evaluation compiled them. A compile is kept by what it was
// given (the TeX image, the engine, every file beyond the paper's own): a run after a change to the rule compiles only
// what the change changed. A run prints, besides, the nearer of the measuring compile and the final, and each paper
// further from its original's pages than today.
//
// Data (AXT_DATA, the experiment's data folder, outside git): corpus/<id>/source.gz, each paper's translation at
// runs/visual-eval/<lang>/<id>/translation.json, metafont/ (the LH metrics Russian under pdfLaTeX needs;
// spikes/make-metafont.mjs). Results go to <AXT_DATA>/runs/typeset-gate/: numbers per paper, the compiles in cache/.
// The papers and the baseline are records/typeset-gate.json: the round of 34 (records/typesetting.md), the holdout —
// 13 Chinese papers the rule never saw, 9 of the round's papers in a language they were not evaluated in — and
// Chinese 2608.02163, a two-column body and a one-column appendix. No model is asked: a unit with no cached
// translation stays in English. At most two compiles at a time, one above a load of 12.
//   AXT_DATA=<data> pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-gate.mjs     every paper, the check
//   … typeset-gate.mjs zh/2608.02163   these papers, no check
//   … typeset-gate.mjs --check         the check on the results there
//   … typeset-gate.mjs --baseline      the results as the new baseline
//   STRATEGY=1 …  the paper's second strategy (CJK: pdfLaTeX's CJKutf8), into runs/typeset-gate-s1/, never checked
//   VARY='FLOW.window=50;DESIGN.Hans.lead=[1,1.45]' …  the rule with those parameters (JSON values), into
//                 runs/typeset-gate-<VARY>/, checked against the baseline: a parameter tried again on every paper
//   TAG=<name> …  results into runs/typeset-gate-<name>/: a change to the rule's code tried before it is kept
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs'
import { loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { keptFor, openPaper, originalFiles, probeFiles, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { alignment, columnOf, marksOf } from '../../../src/pdf-reader/engine/typeset/places.mjs'
import { finalTypesetting, FLOW, previewTypesetting } from '../../../src/pdf-reader/engine/typeset/plan.mjs'
import { DESIGN } from '../../../src/pdf-reader/engine/typeset/type.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const DATA = process.env.AXT_DATA ?? join(root, 'data')
const STRATEGY = Number(process.env.STRATEGY ?? 0), VARY = process.env.VARY ?? ''
for (const v of VARY.split(';').filter(Boolean)) {
  const [, path, value] = /^([\w.]+)=(.+)$/.exec(v) ?? []
  const keys = path?.split('.') ?? [], at = keys.slice(1, -1).reduce((o, k) => o?.[k], { FLOW, DESIGN }[keys[0]])
  if (!at || !(keys.at(-1) in at)) throw new Error(`VARY: no ${path}`)
  at[keys.at(-1)] = JSON.parse(value)
}
const TAG = [STRATEGY ? `s${STRATEGY}` : '', VARY.replace(/[^\w.=,[\]-]+/g, '_'), process.env.TAG ?? ''].filter(Boolean).join('-')
const OUT = join(DATA, 'runs', TAG ? `typeset-gate-${TAG}` : 'typeset-gate'), CACHE = join(DATA, 'runs', 'typeset-gate', 'cache')
const RECORD = join(root, 'records/typeset-gate.json')
const record = JSON.parse(readFileSync(RECORD, 'utf8'))
const SETS = record.sets
// what a later run may lose against the baseline before the gate fails: no page on any paper, no paper of pages equal;
// drifts and shares within what one paper's rounding moves. A paper further from its original's pages than today's
// setting is reported, not failed: the baseline holds the ones known (records/typesetting.md)
const SLACK = { drift: 0.005, share: 0.01 }

// ---- compiles: two at a time, one above a load of 12; each kept by what it was given
let active = 0
const limit = () => (loadavg()[0] > 12 ? 1 : 2)
async function slot() { while (active >= limit()) await new Promise(r => setTimeout(r, 3000)); active++ }
const image = (await run('docker', ['image', 'inspect', 'texlive/texlive:latest', '--format', '{{.Id}}'])).stdout.trim()
const METAFONT = existsSync(join(DATA, 'metafont')) ? realpathSync(join(DATA, 'metafont')) : null
async function compile(id, files, overrides, { main, engine, rerun, bbl }) {
  const hash = createHash('sha256').update(JSON.stringify([image, id, main, engine, rerun, !!bbl]))
  for (const [p, b] of [...overrides].sort(([a], [b]) => a.localeCompare(b))) hash.update(p).update(b)
  const keep = join(CACHE, hash.digest('hex').slice(0, 32))
  if (existsSync(`${keep}.log`)) return { ok: existsSync(`${keep}.pdf`), pdf: `${keep}.pdf`, log: readFileSync(`${keep}.log`, 'latin1'), cached: true }
  await slot()
  const dir = `${keep}.work`
  try {
    rmSync(dir, { recursive: true, force: true })
    for (const [p, b] of [...files, ...overrides]) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const tex = METAFONT ? ['-e', 'MKTEXTFM=0', '-e', 'MKTEXPK=0', '-e', 'MKTEXMF=0', '-v', `${METAFONT}:/axt-metafont:ro`, '-e', 'TFMFONTS=/axt-metafont//:'] : []
    const docker = cmd => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...tex, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
    // TeX writes its output where it runs, whichever folder the main file is in
    const stem = main.split('/').pop().replace(/\.[^./]+$/, '')
    if (rerun) await docker(['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...(bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main])
    else await docker([engine, '-interaction=nonstopmode', main])
    if (existsSync(join(dir, `${stem}.pdf`))) copyFileSync(join(dir, `${stem}.pdf`), `${keep}.pdf`)
    const log = existsSync(join(dir, `${stem}.log`)) ? readFileSync(join(dir, `${stem}.log`), 'latin1') : ''
    // no log: TeX never ran (Docker failed to start it); kept, it would fail every run after
    if (log) writeFileSync(`${keep}.log`, log, 'latin1')
    return { ok: existsSync(`${keep}.pdf`), pdf: `${keep}.pdf`, log }
  } finally { rmSync(dir, { recursive: true, force: true }); active-- }
}
async function marksOfFile(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 })
  try { return await marksOf(await task.promise) } finally { await task.destroy() }
}

// ---- a paper's translation as the experiment cached it: by kind and source, pieces by kind and text, pair ids aside
const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`
const rebind = (u, pieces) => { const own = u.pieces.filter(p => p.t === 'nested'); return pieces.map(p => (p.t === 'nested' ? own.find(q => q.pre === p.pre && q.post === p.post) ?? p : p)) }
function translationOf(lang, id, paper) {
  const byKey = new Map((JSON.parse(readFileSync(join(DATA, 'runs/visual-eval', lang, id, 'translation.json'), 'utf8')).entries ?? []).map(e => [e.key, e.pieces]))
  const kept = keptFor(paper, lang), translated = new Map()
  for (const u of paper.units) { const hit = !kept.has(u) && byKey.get(unitKey(u)); if (hit) translated.set(u, rebind(u, hit)) }
  return translated
}

// ---- the three goals of one compile against the original
const r3 = x => (x == null ? null : Number(x.toFixed(3)))
function goals(om, tm, units, log) {
  const a = alignment(om, tm)
  const floats = { n: 0, page: 0, near: 0 }
  units.forEach((u, i) => {
    const o = om.marks.get(`${i}s`), t = tm.marks.get(`${i}s`)
    if (u.kind !== 'caption' || !o || !t) return
    floats.n++
    if (o.page !== t.page) return
    floats.page++
    if (columnOf(om, o) === columnOf(om, t) && Math.abs(o.y - t.y) <= 30) floats.near++
  })
  return {
    pages: a.pages, start: { median: r3(a.drift.median), p90: r3(a.drift.p90), within: r3(a.drift.within) }, end: { median: r3(a.end.median), within: r3(a.end.within) },
    blocks: { n: a.size.values.length, within: r3(a.size.within) }, floats,
    overfull: [...log.matchAll(/^Overfull \\hbox \(([\d.]+)pt too wide\) in paragraph/gm)].filter(m => Number(m[1]) > 5).length,
  }
}

async function evaluate(lang, id) {
  const t0 = Date.now()
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(DATA, 'corpus', id, 'source.gz'))))
  const paper = openPaper(files), { meta, project } = paper
  const translated = translationOf(lang, id, paper), strategy = strategiesFor(meta, lang)[STRATEGY]
  if (!strategy) return { lang, id, failed: `no strategy ${STRATEGY}` }
  const full = engine => ({ main: project.main, engine, rerun: true, bbl: meta.bbl })
  const probe = await compile(id, files, probeFiles(paper, { width: true }), { main: project.main, engine: meta.compiler, rerun: false })
  const fonts = readFontProbe(probe.log)
  const [original, today] = await Promise.all([
    compile(id, files, originalFiles(paper, { lines: true }), full(meta.compiler)),
    compile(id, files, translationFiles(paper, translated, { strategy, fonts, draft: false }), full(strategy.engine)),
  ])
  if (!original.ok || !today.ok) return { lang, id, failed: original.ok ? 'today' : 'original' }
  const om = await marksOfFile(original.pdf)
  const out = { lang, id, strategy: strategy.name, units: paper.units.length, translated: translated.size, origPages: om.pages, columns: om.columns.join(''), pdfs: { original: original.pdf, today: today.pdf }, today: goals(om, await marksOfFile(today.pdf), paper.units, today.log) }
  const plan = previewTypesetting({ paper, translated, lang, strategy, fonts, fontLog: probe.log, original: { log: original.log, marks: om } })
  if (!plan.typeset) return { ...out, missing: plan.missing, preview: out.today, final: out.today, s: Math.round((Date.now() - t0) / 1000) }
  const preview = await compile(id, files, translationFiles(paper, translated, { strategy, fonts, draft: false, typeset: plan.typeset }), full(strategy.engine))
  if (!preview.ok) return { ...out, failed: 'preview' }
  const pm = await marksOfFile(preview.pdf)
  const fin = finalTypesetting(plan.state, { log: preview.log, marks: pm })
  const final = await compile(id, files, translationFiles(paper, translated, { strategy, fonts, draft: false, typeset: fin.typeset }), full(strategy.engine))
  if (!final.ok) return { ...out, failed: 'final' }
  const faces = [...fin.faces.values()]
  return {
    ...out, pdfs: { ...out.pdfs, preview: preview.pdf, final: final.pdf }, type: plan.type, finalType: fin.type, faces: faces.length ? { n: faces.length, min: Math.min(...faces) } : null, finalMissing: fin.missing,
    preview: goals(om, pm, paper.units, preview.log), final: goals(om, await marksOfFile(final.pdf), paper.units, final.log), s: Math.round((Date.now() - t0) / 1000),
  }
}

// ---- a set's numbers, and the check against the baseline
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
function summary(rows, v) {
  const xs = rows.map(r => r[v])
  const fl = xs.reduce((s, x) => ({ n: s.n + x.floats.n, page: s.page + x.floats.page, near: s.near + x.floats.near }), { n: 0, page: 0, near: 0 })
  return {
    papers: xs.length, equal: xs.filter(x => x.pages === 0).length, more: xs.filter(x => x.pages > 0).length, fewer: xs.filter(x => x.pages < 0).length,
    start: r3(mean(xs.map(x => x.start.median))), startWithin: r3(mean(xs.map(x => x.start.within))), end: r3(mean(xs.map(x => x.end.median))),
    blocks: r3(mean(xs.filter(x => x.blocks.within != null).map(x => x.blocks.within))), floatsPage: r3(fl.n ? fl.page / fl.n : null), floatsNear: r3(fl.n ? fl.near / fl.n : null),
    overfull: xs.reduce((s, x) => s + x.overfull, 0),
  }
}
const resultOf = spec => { const [lang, id] = spec.split('/'), f = join(OUT, lang, `${id}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null }
function tables() {
  const out = {}
  for (const [set, specs] of Object.entries(SETS)) {
    const rows = specs.map(resultOf)
    const lost = specs.filter((s, k) => !rows[k] || rows[k].failed)
    if (lost.length) { out[set] = { lost }; continue }
    // the nearer of the measuring compile and the final, as a reader holding both could show: fewer pages off, then
    // the smaller start drift
    const nearer = rows.map(r => ({ nearer: Math.abs(r.preview.pages) !== Math.abs(r.final.pages) ? (Math.abs(r.preview.pages) < Math.abs(r.final.pages) ? r.preview : r.final) : r.preview.start.median < r.final.start.median ? r.preview : r.final }))
    out[set] = { lost, today: summary(rows, 'today'), preview: summary(rows, 'preview'), rule: summary(rows, 'final'), nearer: summary(nearer, 'nearer') }
  }
  return out
}
const line = (k, s) => `  ${k.padEnd(8)} pages =/+/- ${s.equal}/${s.more}/${s.fewer}  start ${s.start} (≤0.1 ${Math.round(100 * s.startWithin)} %)  end ${s.end}  blocks ≤15 % ${Math.round(100 * s.blocks)} %  floats on page ${Math.round(100 * s.floatsPage)} %, ≤30 pt ${Math.round(100 * s.floatsNear)} %  overfull ${s.overfull}`
function check() {
  const now = tables(), problems = []
  for (const [set, t] of Object.entries(now)) {
    if (t.lost.length) { problems.push(`${set}: no result for ${t.lost.join(', ')}`); continue }
    console.log(`${set} (${t.rule.papers} papers)\n${line('today', t.today)}\n${line('preview', t.preview)}\n${line('rule', t.rule)}\n${line('nearer', t.nearer)}`)
    const base = record.baseline?.[set]
    for (const spec of SETS[set]) {
      const r = resultOf(spec), was = record.papers?.[spec]?.rule.pages
      if (Math.abs(r.final.pages) > Math.abs(r.today.pages)) console.log(`  further from the original's pages than today: ${spec}, the rule ${r.final.pages}, today ${r.today.pages}`)
      if (was != null && Math.abs(r.final.pages) > Math.abs(was)) problems.push(`${spec}: the rule ${r.final.pages} pages from the original, its baseline ${was}`)
    }
    if (!base) { console.log('  (no baseline)'); continue }
    if (t.rule.equal < base.equal) problems.push(`${set}: pages equal ${t.rule.equal}, baseline ${base.equal}`)
    for (const k of ['start', 'end']) if (t.rule[k] > base[k] + SLACK.drift) problems.push(`${set}: ${k} drift ${t.rule[k]}, baseline ${base[k]}`)
    for (const k of ['blocks', 'floatsPage', 'floatsNear']) if (t.rule[k] < base[k] - SLACK.share) problems.push(`${set}: ${k} ${t.rule[k]}, baseline ${base[k]}`)
  }
  for (const p of problems) console.log(`FAIL ${p}`)
  console.log(problems.length ? `${problems.length} failed` : 'the rule holds its baseline')
  return problems.length
}

const args = process.argv.slice(2)
if (args.includes('--baseline')) {
  if (TAG) { console.log('a baseline is written from the rule as it is, not a variant'); process.exit(1) }
  const t = tables()
  const lost = Object.values(t).flatMap(x => x.lost)
  if (lost.length) { console.log(`no baseline: no result for ${lost.join(', ')}`); process.exit(1) }
  record.baseline = Object.fromEntries(Object.entries(t).map(([set, x]) => [set, x.rule]))
  record.today = Object.fromEntries(Object.entries(t).map(([set, x]) => [set, x.today]))
  record.papers = Object.fromEntries(Object.values(SETS).flat().map(spec => { const r = resultOf(spec); return [spec, { orig: r.origPages, today: { pages: r.today.pages, start: r.today.start.median }, rule: { pages: r.final.pages, start: r.final.start.median, end: r.final.end.median, blocks: r.final.blocks.within }, ...(r.missing ? { missing: r.missing } : {}) }] }))
  record.written = new Date().toISOString().slice(0, 10)
  writeFileSync(RECORD, `${JSON.stringify(record, null, 1)}\n`)
  console.log(`baseline written: ${RECORD}`)
  process.exit(0)
}
if (args.includes('--check')) process.exit(STRATEGY ? 0 : check())
const named = args.filter(a => !a.startsWith('--'))
const tasks = (named.length ? named : [...new Set(Object.values(SETS).flat())]).map(s => s.split('/'))
let next = 0
await Promise.all(Array.from({ length: 2 }, async () => {
  while (next < tasks.length) {
    const [lang, id] = tasks[next++]
    const r = await evaluate(lang, id).catch(e => ({ lang, id, failed: String(e?.stack ?? e).slice(0, 400) }))
    mkdirSync(join(OUT, lang), { recursive: true })
    writeFileSync(join(OUT, lang, `${id}.json`), JSON.stringify(r))
    const s = x => (x ? `pages ${x.pages} start ${x.start.median} end ${x.end.median} blocks ${x.blocks.within} floats ${x.floats.page}/${x.floats.near}/${x.floats.n}` : '-')
    console.log(`${lang}/${id} ${r.failed ? `FAILED ${r.failed}` : `${r.s} s${r.missing ? ` no plan: ${r.missing}` : ''}\n  today ${s(r.today)}\n  rule  ${s(r.final)}`}`)
  }
}))
if (!named.length && !STRATEGY) process.exit(check())
