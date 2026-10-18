// experiments/pdf-bilingual/spikes/typeset-gate.mjs
// The typesetting rule's gate (src/pdf-reader/engine/pipeline/typeset/): the maintainer's three goals, today's setting against
// the rule's, natively in Docker as the evaluation of 2026-10-01 ran them — and a failure where any paper falls behind
// its stored record.
//   (1) each block's space and place: where each unit starts against its original (drift, in columns, the paper's
//       median), its height against its original's (the share within 15 %);
//   (2) floats: each caption on its original's page, and within 30 pt of its original's place;
//   (3) pages and where each block ends: the pages against the original's, the end drift.
// Per paper: the font probe with its width and size probes, the original with its line probes, today's final (the
// reader's setting, no rule), the rule's measuring compile (previewTypesetting) and its final (finalTypesetting) —
// every pass, images in (latexmk), as the experiment and the evaluation compiled them. DRAFT=1 adds the measuring
// compile as the reader may make it — one pass, images as frames, the references of today's compile — and the final
// measured from it. A compile is kept by what it was given (the TeX image, the engine, every file beyond the paper's
// own): a run after a change to the rule compiles only what the change changed.
//
// The check, paper by paper against `papers` in records/typeset-gate.json: its pages no further from the original's,
// and a count that moved only nearer (a page short now a page long fails); start and end drift at most 0.03 column past
// the record; no float off its original's page that was on it, at most one more beyond 30 pt; blocks within 15 % at
// most 5 points fewer; the measuring compile likewise for pages and start drift; and under DRAFT=1 the final measured
// from a draft — the one the reader ships — as the final. And set by set, where the whole set was run, its means
// against the record's `baseline`: pages equal no fewer, start and end drift at most 0.005 column more, the shares
// (within 0.1 column, blocks, floats on their page and within 30 pt) at most a point fewer, units standing out — a
// unit's leading, against its original's, parted by more than 8 % from the median of the three before and the three
// after it (the reader sees a paragraph set looser) — at most a quarter point of the set's measured units more. A
// shift of every paper by less than its own slack fails there. The sets' means are printed — display-heavy papers (a
// quarter or more of their prose units hold a display) apart — and each paper further from its original's pages than
// today. Results of another TeX image or of another rule than the one checked (its files' hash) are refused as stale.
//
// The record changes only with a change that is adopted. Run the whole gate (ASIDE=1 DRAFT=1), judge the change on the
// fresh holdout — the round and the Chinese unseen must hold their sets too — and write the record (--baseline) in the
// commit that adopts it, whose message gives the sets' numbers before and after and each paper past its record, and
// why. Most real changes move a few papers past their record, CJK ones first (a leading 0.25 % looser on every unit
// sent 4 papers past theirs while 8 came nearer by more than 0.01 column): a paper past its record is a question, not a
// verdict, and a change is adopted when its sets hold and each such paper is answered. A change not adopted leaves the
// record as it was; the aside set judges once, at the end of a round, and is then spent.
//
// Data (AXT_DATA, the experiment's data folder, outside git): corpus/<id>/source.gz, each paper's translation at
// runs/visual-eval/<lang>/<id>/translation.json (spikes/typeset-translate.mjs makes one), metafont/ (the LH metrics
// Russian under pdfLaTeX needs; spikes/make-metafont.mjs). Results go to <AXT_DATA>/runs/typeset-gate/, the compiles
// to its cache/. The sets (records/typeset-gate.json): round, the 34 the rule was tuned on; unseen, 13 Chinese papers
// it never saw; newLanguage, 9 of the round's papers in a language they were not evaluated in; twoLayouts, Chinese
// 2608.02163; fresh, 10 of the unseen papers in Japanese, Korean, German and Russian (Microsoft's free engine) — the
// holdout that judges a change; aside, the other 3 in those languages, run only with ASIDE=1, for a final judgement.
// No model is asked. At most two compiles at a time, one above a load of 12.
//   AXT_DATA=<data> pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-gate.mjs     every paper, the check
//   … typeset-gate.mjs zh/2608.02163   these papers, no check
//   … typeset-gate.mjs --check [<lang>/<id>…]   the check on the results there (those papers alone, if named)
//   … typeset-gate.mjs --baseline      the results as the new record
//   STRATEGY=1 …  the paper's second strategy (CJK: pdfLaTeX's CJKutf8), into runs/typeset-gate-s1/, never checked
//   VARY='FLOW.window=50;DESIGN.Hans.lead=[1,1.45]' …  the rule with those parameters (JSON values), into
//                 runs/typeset-gate-<VARY>/, checked against the record: a parameter tried again on every paper
//   TAG=<name> …  results into runs/typeset-gate-<name>/: a change to the rule's code tried before it is kept
//   ENGINE=<engine folder> TAG=<name> …  the rule of another version (its plan, its compiles), measured on this one's
//                 original: past rules on the same papers; today is not compiled (the base run's stands)
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { originalFiles as originalHere } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { alignment, columnOf, marksOf } from '../../../src/pdf-reader/engine/pipeline/typeset/places.mjs'
import { readLines } from '../../../src/pdf-reader/engine/pipeline/typeset/tex.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/source/tar.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const DATA = process.env.AXT_DATA ?? join(root, 'data')
// the rule under test: this tree's, or another version's (ENGINE)
const ENGINE = resolve(process.env.ENGINE ?? new URL('../../../src/pdf-reader/engine', import.meta.url).pathname)
const { readFontProbe } = await import(join(ENGINE, 'latex-front.mjs'))
const { keptFor, openPaper, originalFiles, probeFiles, translationFiles } = await import(join(ENGINE, 'live.mjs'))
const { strategiesFor } = await import(join(ENGINE, 'scripts.mjs'))
const { finalTypesetting, FLOW, previewTypesetting } = await import(join(ENGINE, 'typeset/plan.mjs'))
const { DESIGN } = await import(join(ENGINE, 'typeset/type.mjs'))
const engineMarks = (await import(join(ENGINE, 'typeset/places.mjs'))).marksOf
const OTHER = !!process.env.ENGINE, DRAFT = !!process.env.DRAFT, ASIDE = !!process.env.ASIDE
const STRATEGY = Number(process.env.STRATEGY ?? 0), VARY = process.env.VARY ?? ''
for (const v of VARY.split(';').filter(Boolean)) {
  const [, path, value] = /^([\w.]+)=(.+)$/.exec(v) ?? []
  const keys = path?.split('.') ?? [], at = keys.slice(1, -1).reduce((o, k) => o?.[k], { FLOW, DESIGN }[keys[0]])
  if (!at || !(keys.at(-1) in at)) throw new Error(`VARY: no ${path}`)
  at[keys.at(-1)] = JSON.parse(value)
}
const TAG = [STRATEGY ? `s${STRATEGY}` : '', VARY.replace(/[^\w.=,[\]-]+/g, '_'), process.env.TAG ?? ''].filter(Boolean).join('-')
if (OTHER && !process.env.TAG) throw new Error('ENGINE needs a TAG')
const OUT = join(DATA, 'runs', TAG ? `typeset-gate-${TAG}` : 'typeset-gate'), BASE = join(DATA, 'runs', 'typeset-gate'), CACHE = join(BASE, 'cache')
const RECORD = join(root, 'records/typeset-gate.json')
const record = JSON.parse(readFileSync(RECORD, 'utf8'))
const SETS = Object.fromEntries(Object.entries(record.sets).filter(([set]) => ASIDE || set !== 'aside'))
// what a paper may lose against its record before the gate fails (I1 of the review of 2026-10-01: set means alone let
// one paper's drift triple and a float hold switched off pass)
const SLACK = { drift: 0.03, near: 1, blocks: 0.05 }
// what a set's means may lose against the record's baseline (the re-review of 2026-10-02, N1: every paper 0.029 later
// passed the paper's slack, and moved fresh's mean start drift 0.059 → 0.088)
const SET_SLACK = { drift: 0.005, share: 0.01, standing: 0.0025 }
// a paper is display-heavy when a quarter or more of its prose units hold a display (the review, I3)
const DISPLAY = /^(\$\$|\\\[|\\begin\s*\{(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat|dmath))/
const HEAVY = 0.25

// ---- what the results were made with: the TeX image, and the rule's files (and the parameters varied)
const image = (await run('docker', ['image', 'inspect', 'texlive/texlive:latest', '--format', '{{.Id}}'])).stdout.trim()
const files = dir => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)).map(g => join(f, g)) : /\.m?js$/.test(f) ? [f] : [])).sort()
const ruleHash = (() => { const h = createHash('sha256').update(JSON.stringify([VARY, STRATEGY])); for (const f of files(ENGINE)) h.update(f).update(readFileSync(join(ENGINE, f))); return h.digest('hex').slice(0, 16) })()

// ---- compiles: two at a time, one above a load of 12; each kept by what it was given
let active = 0
const limit = () => (loadavg()[0] > 12 ? 1 : 2)
async function slot() { while (active >= limit()) await new Promise(r => setTimeout(r, 3000)); active++ }
const METAFONT = existsSync(join(DATA, 'metafont')) ? realpathSync(join(DATA, 'metafont')) : null
async function compile(id, sources, overrides, { main, engine, rerun, bbl }) {
  const hash = createHash('sha256').update(JSON.stringify([image, id, main, engine, rerun, !!bbl]))
  for (const [p, b] of [...overrides].sort(([a], [b]) => a.localeCompare(b))) hash.update(p).update(b)
  const keep = join(CACHE, hash.digest('hex').slice(0, 32))
  const read = ext => (existsSync(`${keep}.${ext}`) ? readFileSync(`${keep}.${ext}`, ext === 'log' ? 'latin1' : 'utf8') : null)
  if (existsSync(`${keep}.log`)) return { ok: existsSync(`${keep}.pdf`), pdf: `${keep}.pdf`, log: read('log'), aux: read('aux'), bbl: read('bbl') }
  await slot()
  const dir = `${keep}.work`
  try {
    rmSync(dir, { recursive: true, force: true })
    for (const [p, b] of [...sources, ...overrides]) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const tex = METAFONT ? ['-e', 'MKTEXTFM=0', '-e', 'MKTEXPK=0', '-e', 'MKTEXMF=0', '-v', `${METAFONT}:/axt-metafont:ro`, '-e', 'TFMFONTS=/axt-metafont//:'] : []
    const docker = cmd => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...tex, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
    // TeX writes its output where it runs, whichever folder the main file is in
    const stem = main.split('/').pop().replace(/\.[^./]+$/, '')
    if (rerun) await docker(['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...(bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main])
    else await docker([engine, '-interaction=nonstopmode', main])
    // a PDF cut short — the compile's time ran out while xdvipdfmx wrote it (ja 2608.12606, under load) — is no PDF, and
    // is not kept: the next run compiles it again
    const pdf = join(dir, `${stem}.pdf`), whole = existsSync(pdf) && readFileSync(pdf).subarray(-1024).includes('%%EOF'), cut = !whole && existsSync(pdf) && statSync(pdf).size > 0
    if (whole) copyFileSync(pdf, `${keep}.pdf`)
    for (const ext of ['aux', 'bbl']) if (existsSync(join(dir, `${stem}.${ext}`))) copyFileSync(join(dir, `${stem}.${ext}`), `${keep}.${ext}`)
    const log = existsSync(join(dir, `${stem}.log`)) ? readFileSync(join(dir, `${stem}.log`), 'latin1') : ''
    // no log: TeX never ran (Docker failed to start it); kept, it would fail every run after
    if (log && !cut) writeFileSync(`${keep}.log`, log, 'latin1')
    return { ok: existsSync(`${keep}.pdf`), pdf: `${keep}.pdf`, log, aux: read('aux'), bbl: read('bbl') }
  } finally { rmSync(dir, { recursive: true, force: true }); active-- }
}
const marksIn = async (file, reader = marksOf) => { const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }); try { return await reader(await task.promise) } finally { await task.destroy() } }

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
const med = xs => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
/** units standing out: each unit the compile's line probes read, its leading over its size against its original's,
 *  parted by more than 8 % from the median of the three before it and the three after it — what the owner saw as a
 *  paragraph set looser than its neighbours (records/typesetting.md, Metrics) */
function standingOut(log, olines) {
  const v = [...readLines(log)].filter(([i, x]) => x.size && olines.get(i)?.size).sort((a, b) => a[0] - b[0]).map(([i, x]) => x.bs / x.size / (olines.get(i).bs / olines.get(i).size))
  let n = 0
  v.forEach((x, j) => { const around = [...v.slice(Math.max(0, j - 3), j), ...v.slice(j + 1, j + 4)]; if (around.length && Math.abs(x / med(around) - 1) > 0.08) n++ })
  return { n, of: v.length }
}
function goals(om, tm, units, log, olines) {
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
    blocks: { n: a.size.values.length, within: r3(a.size.within) }, floats, standing: standingOut(log, olines),
    overfull: [...log.matchAll(/^Overfull \\hbox \(([\d.]+)pt too wide\) in paragraph/gm)].filter(m => Number(m[1]) > 5).length,
  }
}

async function evaluate(lang, id) {
  const t0 = Date.now()
  const { files: sources } = await unpackSource(new Uint8Array(readFileSync(join(DATA, 'corpus', id, 'source.gz'))))
  const paper = openPaper(sources), { meta, project } = paper
  const translated = translationOf(lang, id, paper), strategy = strategiesFor(meta, lang)[STRATEGY]
  if (!strategy) return { lang, id, failed: `no strategy ${STRATEGY}` }
  const prose = paper.units.filter(u => u.kind === 'para' || u.kind === 'theorem' || u.kind === 'item')
  const displayShare = r3(prose.length ? prose.filter(u => u.pieces.some(p => p.t === 'ph' && DISPLAY.test(p.src ?? ''))).length / prose.length : 0)
  const full = engine => ({ main: project.main, engine, rerun: true, bbl: meta.bbl })
  const probe = await compile(id, sources, probeFiles(paper, { width: true }), { main: project.main, engine: meta.compiler, rerun: false })
  const fonts = readFontProbe(probe.log)
  // the original the rule plans from (its version's), and this tree's, which every version is measured on
  const [original, here, today] = await Promise.all([
    compile(id, sources, originalFiles(paper, { lines: true }), full(meta.compiler)),
    OTHER ? compile(id, sources, originalHere(paper, { lines: true }), full(meta.compiler)) : null,
    OTHER ? null : compile(id, sources, translationFiles(paper, translated, { strategy, fonts, draft: false }), full(strategy.engine)),
  ])
  if (!original.ok || (here && !here.ok) || (today && !today.ok)) return { lang, id, failed: !original.ok || (here && !here.ok) ? 'original' : 'today' }
  const om = await marksIn((here ?? original).pdf), olines = readLines((here ?? original).log)
  const out = { lang, id, image, rule: ruleHash, strategy: strategy.name, units: paper.units.length, translated: translated.size, displayShare, origPages: om.pages, columns: om.columns.join(''), pdfs: { original: (here ?? original).pdf, ...(today ? { today: today.pdf } : {}) }, ...(today ? { today: goals(om, await marksIn(today.pdf), paper.units, today.log, olines) } : {}) }
  const plan = previewTypesetting({ paper, translated, lang, strategy, fonts, fontLog: probe.log, original: { log: original.log, marks: await marksIn(original.pdf, engineMarks) } })
  if (!plan.typeset) return { ...out, missing: plan.missing, preview: out.today, final: out.today, s: Math.round((Date.now() - t0) / 1000) }
  const preview = await compile(id, sources, translationFiles(paper, translated, { strategy, fonts, draft: false, typeset: plan.typeset }), full(strategy.engine))
  if (!preview.ok) return { ...out, failed: 'preview' }
  const fin = finalTypesetting(plan.state, { log: preview.log, marks: await marksIn(preview.pdf, engineMarks) }, translated)
  const final = await compile(id, sources, translationFiles(paper, translated, { strategy, fonts, draft: false, typeset: fin.typeset }), full(strategy.engine))
  if (!final.ok) return { ...out, failed: 'final' }
  const faces = [...fin.faces.values()]
  const result = {
    ...out, pdfs: { ...out.pdfs, preview: preview.pdf, final: final.pdf }, type: plan.type, faces: faces.length ? { n: faces.length, min: Math.min(...faces) } : null, finalMissing: fin.missing,
    preview: goals(om, await marksIn(preview.pdf), paper.units, preview.log, olines), final: goals(om, await marksIn(final.pdf), paper.units, final.log, olines),
  }
  // the measuring compile as the reader may make it — one pass, images as frames, today's references — and the final
  // measured from it
  if (DRAFT && today) {
    const draft = await compile(id, sources, translationFiles(paper, translated, { strategy, fonts, draft: true, aux: today.aux, bbl: meta.bbl ? null : today.bbl, typeset: plan.typeset }), { main: project.main, engine: strategy.engine, rerun: false })
    const finD = draft.ok ? finalTypesetting(plan.state, { log: draft.log, marks: await marksIn(draft.pdf, engineMarks) }, translated) : null
    const finalD = finD && (await compile(id, sources, translationFiles(paper, translated, { strategy, fonts, draft: false, typeset: finD.typeset }), full(strategy.engine)))
    if (finalD?.ok) result.finalD = goals(om, await marksIn(finalD.pdf), paper.units, finalD.log, olines)
  }
  return { ...result, s: Math.round((Date.now() - t0) / 1000) }
}

// ---- a set's numbers, and the check against the record
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
function summary(xs) {
  const fl = xs.reduce((s, x) => ({ n: s.n + x.floats.n, page: s.page + x.floats.page, near: s.near + x.floats.near }), { n: 0, page: 0, near: 0 })
  return {
    papers: xs.length, equal: xs.filter(x => x.pages === 0).length, more: xs.filter(x => x.pages > 0).length, fewer: xs.filter(x => x.pages < 0).length,
    start: r3(mean(xs.map(x => x.start.median))), startWithin: r3(mean(xs.map(x => x.start.within))), end: r3(mean(xs.map(x => x.end.median))),
    blocks: r3(mean(xs.filter(x => x.blocks.within != null).map(x => x.blocks.within))), floatsPage: r3(fl.n ? fl.page / fl.n : null), floatsNear: r3(fl.n ? fl.near / fl.n : null),
    overfull: xs.reduce((s, x) => s + x.overfull, 0),
    // units standing out where the compiles read their lines (the rule's; today's sets no line probe)
    ...(xs.every(x => x.standing) && xs.some(x => x.standing.of) ? { standing: xs.reduce((s, x) => s + x.standing.n, 0), measured: xs.reduce((s, x) => s + x.standing.of, 0) } : {}),
  }
}
const resultIn = (dir, spec) => { const [lang, id] = spec.split('/'), f = join(dir, lang, `${id}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null }
const resultOf = spec => resultIn(OUT, spec)
// today's numbers: this run's, or the base run's where this one compiles no today (ENGINE)
const todayOf = (spec, r) => r.today ?? resultIn(BASE, spec)?.today
function tables() {
  const out = {}
  for (const [set, specs] of Object.entries(SETS)) {
    const rows = specs.map(resultOf)
    const lost = specs.filter((s, k) => !rows[k] || rows[k].failed || !todayOf(s, rows[k]))
    if (lost.length) { out[set] = { lost }; continue }
    const heavy = rows.filter(r => r.displayShare >= HEAVY), light = rows.filter(r => !(r.displayShare >= HEAVY))
    const of = (rs, v) => rs.map(r => (v === 'today' ? todayOf(`${r.lang}/${r.id}`, r) : r[v]))
    out[set] = {
      lost, today: summary(of(rows, 'today')), preview: summary(of(rows, 'preview')), rule: summary(of(rows, 'final')),
      ...(rows.every(r => r.finalD) ? { draft: summary(of(rows, 'finalD')) } : {}),
      heavy: heavy.length ? { today: summary(of(heavy, 'today')), rule: summary(of(heavy, 'final')) } : null,
      light: light.length && heavy.length ? { today: summary(of(light, 'today')), rule: summary(of(light, 'final')) } : null,
    }
  }
  return out
}
const line = (k, s) => `  ${k.padEnd(14)} pages =/+/- ${s.equal}/${s.more}/${s.fewer}  start ${s.start} (≤0.1 ${Math.round(100 * s.startWithin)} %)  end ${s.end}  blocks ≤15 % ${Math.round(100 * s.blocks)} %  floats on page ${Math.round(100 * s.floatsPage)} %, ≤30 pt ${Math.round(100 * s.floatsNear)} %  overfull ${s.overfull}${s.measured ? `  standing out ${s.standing} of ${s.measured}` : ''}`
/** a page count that moved, and not nearer the original's: further, or as far on the other side (−1 → +1) */
const pagesLost = (now, was) => now !== was && Math.abs(now) >= Math.abs(was)
/** a paper's result against its record: what it lost past the slack — the final, the final measured from a draft where
 *  the run made one (DRAFT=1), and the measuring compile */
function lossesOf(spec, r, was) {
  const out = [], p = r.preview
  for (const [what, f] of [['', r.final], ["the draft-measured final's ", r.finalD]]) {
    if (!f) continue
    if (pagesLost(f.pages, was.pages)) out.push(`${what}pages ${f.pages}, record ${was.pages}`)
    for (const k of ['start', 'end']) if (f[k].median > was[k] + SLACK.drift) out.push(`${what}${k} drift ${f[k].median}, record ${was[k]}`)
    if (f.floats.page < was.floats.page) out.push(`${what}floats on their page ${f.floats.page}, record ${was.floats.page}`)
    if (f.floats.near < was.floats.near - SLACK.near) out.push(`${what}floats within 30 pt ${f.floats.near}, record ${was.floats.near}`)
    if (was.blocks != null && f.blocks.within != null && f.blocks.within < was.blocks - SLACK.blocks) out.push(`${what}blocks ${f.blocks.within}, record ${was.blocks}`)
  }
  if (pagesLost(p.pages, was.preview.pages)) out.push(`the measuring compile's pages ${p.pages}, record ${was.preview.pages}`)
  if (p.start.median > was.preview.start + SLACK.drift) out.push(`the measuring compile's start drift ${p.start.median}, record ${was.preview.start}`)
  return out.map(x => `${spec}: ${x}`)
}
/** a set's means against the record's baseline: what the set lost past SET_SLACK */
function setLosses(name, s, base) {
  const out = []
  if (s.equal < base.equal) out.push(`pages equal ${s.equal}, baseline ${base.equal}`)
  for (const k of ['start', 'end']) if (s[k] > base[k] + SET_SLACK.drift) out.push(`${k} drift ${s[k]}, baseline ${base[k]}`)
  for (const k of ['startWithin', 'blocks', 'floatsPage', 'floatsNear']) if (base[k] != null && s[k] != null && s[k] < base[k] - SET_SLACK.share) out.push(`${k} ${s[k]}, baseline ${base[k]}`)
  if (base.measured && s.measured && s.standing / s.measured > base.standing / base.measured + SET_SLACK.standing) out.push(`units standing out ${s.standing} of ${s.measured}, baseline ${base.standing} of ${base.measured}`)
  return out.map(x => `${name}: ${x}`)
}
function check(only = []) {
  const now = tables(), problems = []
  for (const [set, t] of Object.entries(now)) {
    const specs = SETS[set].filter(s => !only.length || only.includes(s)), whole = specs.length === SETS[set].length
    if (!specs.length) continue
    if (!only.length && t.lost.length) { problems.push(`${set}: no result for ${t.lost.join(', ')}`); continue }
    // the whole set run: its means, and against the record's baseline
    if (whole && !t.lost.length) {
      console.log(`${set} (${t.rule.papers} papers)\n${line('today', t.today)}\n${line('preview', t.preview)}\n${line('rule', t.rule)}${t.draft ? `\n${line('draft-measured', t.draft)}` : ''}`)
      if (t.heavy) console.log(`${line(`heavy ${t.heavy.rule.papers} today`, t.heavy.today)}\n${line(`heavy ${t.heavy.rule.papers} rule`, t.heavy.rule)}${t.light ? `\n${line(`light ${t.light.rule.papers} rule`, t.light.rule)}` : ''}`)
      const base = record.baseline?.[set]
      if (!base) console.log(`  ${set}: no baseline`)
      else problems.push(...setLosses(set, t.rule, base), ...(t.draft ? setLosses(`${set}, the draft-measured final`, t.draft, base) : []))
      const drafted = specs.filter(s => resultOf(s)?.finalD)
      if (drafted.length && drafted.length < specs.length) problems.push(`${set}: a draft-measured final for ${drafted.length} of ${specs.length} papers: run it again with DRAFT=1`)
    }
    for (const spec of specs) {
      const r = resultOf(spec), was = record.papers?.[spec], today = r && todayOf(spec, r)
      if (!r || r.failed || !today) { problems.push(`${spec}: no result`); continue }
      // a code change tried under TAG, or another version (ENGINE), is checked as it was run; the rule as it stands, and
      // its parameters varied (VARY), only on results of the files as they are now
      if (r.image !== image || (r.rule !== ruleHash && !process.env.TAG && !OTHER)) { problems.push(`${spec}: a stale result (${r.image !== image ? 'another TeX image' : 'another rule'}): run it again`); continue }
      if (Math.abs(r.final.pages) > Math.abs(today.pages)) console.log(`  further from the original's pages than today: ${spec}, the rule ${r.final.pages}, today ${today.pages}`)
      if (was) problems.push(...lossesOf(spec, r, was))
      else console.log(`  ${spec}: no record`)
    }
  }
  for (const p of problems) console.log(`FAIL ${p}`)
  console.log(problems.length ? `${problems.length} failed` : 'every paper and every set holds its record')
  return problems.length
}

const args = process.argv.slice(2), named = args.filter(a => !a.startsWith('--'))
if (args.includes('--baseline')) {
  if (TAG) { console.log('a record is written from the rule as it is, not a variant'); process.exit(1) }
  const t = tables(), lost = Object.values(t).flatMap(x => x.lost)
  if (lost.length) { console.log(`no record: no result for ${lost.join(', ')}`); process.exit(1) }
  record.image = image
  record.baseline = Object.fromEntries(Object.entries(t).map(([set, x]) => [set, x.rule]))
  record.today = Object.fromEntries(Object.entries(t).map(([set, x]) => [set, x.today]))
  const old = record.papers ?? {}
  record.papers = { ...old, ...Object.fromEntries(Object.values(SETS).flat().map(spec => {
    const r = resultOf(spec), f = r.final
    return [spec, { orig: r.origPages, displayShare: r.displayShare, today: { pages: r.today.pages, start: r.today.start.median }, pages: f.pages, start: f.start.median, end: f.end.median, blocks: f.blocks.within, floats: f.floats, preview: { pages: r.preview.pages, start: r.preview.start.median }, ...(r.missing ? { missing: r.missing } : {}) }]
  })) }
  record.written = new Date().toISOString().slice(0, 10)
  writeFileSync(RECORD, `${JSON.stringify(record, null, 1)}\n`)
  console.log(`record written: ${RECORD}`)
  process.exit(0)
}
if (args.includes('--check')) process.exit(STRATEGY ? 0 : check(named))
const tasks = (named.length ? named : [...new Set(Object.values(SETS).flat())]).map(s => s.split('/'))
let next = 0
await Promise.all(Array.from({ length: 2 }, async () => {
  while (next < tasks.length) {
    const [lang, id] = tasks[next++]
    const r = await evaluate(lang, id).catch(e => ({ lang, id, failed: String(e?.stack ?? e).slice(0, 400) }))
    mkdirSync(join(OUT, lang), { recursive: true })
    writeFileSync(join(OUT, lang, `${id}.json`), JSON.stringify(r))
    const s = x => (x ? `pages ${x.pages} start ${x.start.median} end ${x.end.median} blocks ${x.blocks.within} floats ${x.floats.page}/${x.floats.near}/${x.floats.n}` : '-')
    console.log(`${lang}/${id} ${r.failed ? `FAILED ${r.failed}` : `${r.s} s${r.missing ? ` no plan: ${r.missing}` : ''}\n  today ${s(r.today)}\n  rule  ${s(r.final)}${r.finalD ? `\n  draft ${s(r.finalD)}` : ''}`}`)
  }
}))
if (!named.length && !STRATEGY) process.exit(check())
