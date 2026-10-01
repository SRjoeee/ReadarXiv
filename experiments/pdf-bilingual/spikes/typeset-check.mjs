// experiments/pdf-bilingual/spikes/typeset-check.mjs
// The engine's typesetting rule (src/pdf-reader/engine/typeset/) on the evaluation round, compiled natively the way the
// experiment compiled it, against the experiment's numbers for the same rule (records/round-34.json): the check that
// the engine sets what the experiment chose. Per paper: the font probe with its width and size probes, the original
// with its line probes, the preview at previewTypesetting, the final at finalTypesetting — each a native compile in
// Docker (latexmk, every pass, as the experiment's) — then pages, drift and blocks against the original.
// Needs the round's data (AXT_DATA, the experiment's data/ folder: runs/visual-eval with each paper's translation.json,
// corpus/ with its source, metafont/ with the fonts TeX Live lacks); asks no model: a unit with no cached translation
// stays in English.
//   AXT_DATA=<data folder> pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-check.mjs <lang> <paper>...
//   AXT_DATA=<data folder> pnpm exec tsx experiments/pdf-bilingual/spikes/typeset-check.mjs --summary
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { keptFor, openPaper, originalFiles, probeFiles, translationFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { alignment, marksOf } from '../../../src/pdf-reader/engine/typeset/places.mjs'
import { finalTypesetting, previewTypesetting } from '../../../src/pdf-reader/engine/typeset/plan.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const DATA = process.env.AXT_DATA ?? join(root, 'data')
const V = join(DATA, 'runs/visual-eval'), OUT = join(DATA, 'runs/typeset-check')
const round = JSON.parse(readFileSync(join(V, 'round.json'), 'utf8'))
const expected = JSON.parse(readFileSync(join(root, 'records/round-34.json'), 'utf8')).papers

// a unit as the experiment cached its translation: its kind and its source, pieces by kind and text, pair ids aside
const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`
const rebind = (u, pieces) => { const own = u.pieces.filter(p => p.t === 'nested'); return pieces.map(p => (p.t === 'nested' ? own.find(q => q.pre === p.pre && q.post === p.post) ?? p : p)) }
function translationOf(dir, paper, lang) {
  const byKey = new Map((JSON.parse(readFileSync(join(dir, 'translation.json'), 'utf8')).entries ?? []).map(e => [e.key, e.pieces]))
  const kept = keptFor(paper, lang), translated = new Map()
  for (const u of paper.units) { const hit = !kept.has(u) && byKey.get(unitKey(u)); if (hit) translated.set(u, rebind(u, hit)) }
  return translated
}

async function compile(dir, files, overrides, { main, engine, rerun, bbl }) {
  rmSync(dir, { recursive: true, force: true })
  for (const [p, b] of [...files, ...overrides]) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const metafont = join(DATA, 'metafont')
  const tex = ['-e', 'MKTEXTFM=0', '-e', 'MKTEXPK=0', '-e', 'MKTEXMF=0', '-v', `${metafont}:/axt-metafont:ro`, '-e', 'TFMFONTS=/axt-metafont//:']
  const docker = cmd => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...tex, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
  const stem = main.split('/').pop().replace(/\.[^./]+$/, '')
  if (rerun) await docker(['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...(bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main])
  else await docker([engine, '-interaction=nonstopmode', main])
  const pdf = join(dir, `${stem}.pdf`), log = join(dir, `${stem}.log`)
  return { ok: existsSync(pdf), pdf, log: existsSync(log) ? readFileSync(log, 'latin1') : '' }
}
async function marksOfFile(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 })
  try { return await marksOf(await task.promise) } finally { await task.destroy() }
}

async function check(lang, id) {
  const dir = join(OUT, lang, id), t0 = Date.now()
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(DATA, 'corpus', id, 'source.gz'))))
  const paper = openPaper(files), { meta, project } = paper
  const translated = translationOf(join(V, lang, id), paper, lang), strategy = strategiesFor(meta, lang)[0]
  const probe = await compile(join(dir, 'probe'), files, probeFiles(paper, { width: true }), { main: project.main, engine: meta.compiler, rerun: false })
  const original = await compile(join(dir, 'original'), files, originalFiles(paper, { lines: true }), { main: project.main, engine: meta.compiler, rerun: true, bbl: meta.bbl })
  if (!original.ok) return { lang, id, failed: 'original' }
  const om = await marksOfFile(original.pdf), fonts = readFontProbe(probe.log)
  const plan = previewTypesetting({ paper, translated, lang, strategy, fonts, fontLog: probe.log, original: { log: original.log, marks: om } })
  const preview = await compile(join(dir, 'preview'), files, translationFiles(paper, translated, { strategy, fonts, draft: false, typeset: plan.typeset }), { main: project.main, engine: strategy.engine, rerun: true, bbl: meta.bbl })
  if (!preview.ok) return { lang, id, failed: 'preview' }
  const fin = finalTypesetting(plan.state, { log: preview.log, marks: await marksOfFile(preview.pdf) })
  const final = await compile(join(dir, 'final'), files, translationFiles(paper, translated, { strategy, fonts, draft: false, typeset: fin.typeset }), { main: project.main, engine: strategy.engine, rerun: true, bbl: meta.bbl })
  if (!final.ok) return { lang, id, failed: 'final' }
  const a = alignment(om, await marksOfFile(final.pdf)), r = x => Number(x.toFixed(3))
  const faces = [...fin.faces.values()]
  return {
    lang, id, s: Math.round((Date.now() - t0) / 1000), pages: a.pages, drift: { median: r(a.drift.median), p90: r(a.drift.p90), within: r(a.drift.within) },
    blocks: { within: r(a.size.within) }, faces: faces.length ? { n: faces.length, min: Math.min(...faces) } : null,
  }
}

const args = process.argv.slice(2)
if (args[0] === '--summary') {
  const rows = []
  for (const [lang, ids] of Object.entries(round)) for (const id of ids) { const f = join(OUT, lang, `${id}.json`); if (existsSync(f)) rows.push(JSON.parse(readFileSync(f, 'utf8'))) }
  let same = 0
  for (const x of rows) {
    const e = expected[`${x.lang}/${x.id}`]?.[['zh', 'ja', 'ko'].includes(x.lang) ? 'flow46fp8r5bs95' : 'flow46fp8r5b']
    if (x.failed || !e) { console.log(`${x.lang} ${x.id}: ${x.failed ? `failed at the ${x.failed}` : 'no expected numbers'}`); continue }
    const ok = x.pages === e.pages && Math.abs(x.drift.median - e.drift.median) <= 0.02
    if (ok) same++
    console.log(`${ok ? 'same' : 'DIFF'} ${x.lang} ${x.id}: pages ${x.pages} (${e.pages}), drift ${x.drift.median.toFixed(3)} (${e.drift.median.toFixed(3)}), within ${x.drift.within} (${e.drift.within}), faces ${x.faces?.n ?? 0} (${e.faces?.n ?? 0})`)
  }
  const mean = f => rows.filter(x => !x.failed).reduce((s, x) => s + f(x), 0) / rows.filter(x => !x.failed).length
  console.log(`${same} of ${rows.length} as the experiment (pages equal and drift within 0.02 column); engine: pages equal ${rows.filter(x => x.pages === 0).length}, drift ${mean(x => x.drift.median).toFixed(3)}, within ${Math.round(100 * mean(x => x.drift.within))} %`)
} else {
  const [lang, ...ids] = args
  for (const id of ids) {
    const r = await check(lang, id).catch(e => ({ lang, id, failed: String(e?.stack ?? e).slice(0, 300) }))
    mkdirSync(join(OUT, lang), { recursive: true })
    writeFileSync(join(OUT, lang, `${id}.json`), JSON.stringify(r))
    console.log(JSON.stringify(r))
  }
}
