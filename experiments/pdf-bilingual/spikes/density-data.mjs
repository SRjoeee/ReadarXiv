// Held-out data for the line predictor (plans/2026-09-30-generic-type.md, step 1): for each paper, its font probe and
// its original with line probes, once; for each language, the translation (Microsoft's free engine, the reader's wire,
// cached by unit as visual-eval.mjs caches it) and one compile at base typography — the paper's size, the script's
// leading as the reader sets it, no fitting — as a visual-eval `fit-1` is. Nothing is rendered.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/density-data.mjs <paper>... [--langs=zh,ja,ko,de,ru] [--out=<dir>]
import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { keptFor, openPaper, probeFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { readFontProbe } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { translateTexts, translateUnits } from '../../../src/pdf-reader/engine/mt.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
import { lockedFiles, originalProbeFiles, theoremEnvs, withCjkType } from './lock.mjs'
import { PARAMS } from './visual-eval-lib.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const opt = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const OUT = opt('out', join(root, 'data/runs/density'))
const LANGS = opt('langs', 'zh,ja,ko,de,ru').split(',')
const CJK = new Set(['zh', 'ja', 'ko'])
const unitKey = u => `${u.kind}\u0000${JSON.stringify(u.pieces.map(p => [p.t, p.s ?? p.src ?? `${p.pre}\u0001${p.post}`]))}`
const rebind = (u, pieces) => { const own = u.pieces.filter(p => p.t === 'nested'); return pieces.map(p => (p.t === 'nested' ? own.find(q => q.pre === p.pre && q.post === p.post) ?? p : p)) }

async function compile(dir, paper, files, overrides, { engine, rerun }) {
  rmSync(dir, { recursive: true, force: true })
  for (const [p, b] of files) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  for (const [p, b] of overrides) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const { project, meta } = paper
  const stem = project.main.split('/').pop().replace(/\.[^./]+$/, '')
  const t0 = Date.now()
  const docker = cmd => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...faithfulDockerArgs(root), '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
  if (rerun) await docker(['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...(meta.bbl ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', project.main])
  else await docker([engine, '-interaction=nonstopmode', project.main])
  // only the log is kept: sources, figures and the PDF go, the held-out set is for counting lines
  const log = join(dir, `${stem}.log`), ok = existsSync(join(dir, `${stem}.pdf`))
  const text = existsSync(log) ? readFileSync(log, 'latin1') : ''
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${stem}.log`), text, 'latin1')
  return { ok, log: text, ms: Date.now() - t0 }
}

for (const id of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
  const t0 = Date.now(), note = (...a) => console.log(`[${id} ${Math.round((Date.now() - t0) / 1000)}s]`, ...a)
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(files)
  const shared = join(OUT, '_original', id)
  const probe = await compile(join(shared, 'probe'), paper, files, probeFiles(paper), { engine: paper.meta.compiler, rerun: false })
  const fonts = readFontProbe(probe.log), theorems = theoremEnvs(files)
  const original = await compile(join(shared, 'original'), paper, files, originalProbeFiles(paper, theorems), { engine: paper.meta.compiler, rerun: true })
  note('original', original.ok, `${original.ms} ms`, JSON.stringify(fonts))
  if (!original.ok) continue
  for (const lang of LANGS) {
    const dir = join(OUT, lang, id), work = join(dir, 'work')
    mkdirSync(work, { recursive: true })
    for (const k of ['probe', 'original']) { mkdirSync(join(work, k), { recursive: true }); for (const f of readdirSync(join(shared, k))) copyFileSync(join(shared, k, f), join(work, k, f)) }
    const cache = join(dir, 'translation.json')
    const byKey = new Map((existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')).entries : []).map(e => [e.key, e.pieces]))
    const kept = keptFor(paper, lang), translated = new Map(), todo = []
    for (const u of paper.units) { if (kept.has(u)) continue; const hit = byKey.get(unitKey(u)); if (hit) translated.set(u, rebind(u, hit)); else todo.push(u) }
    if (todo.length) {
      const { results } = await translateUnits(todo, texts => translateTexts(texts, lang).then(r => r.map(text => (text == null ? null : { text, by: null }))), 'markers')
      for (const [u, r] of results) if (r.pieces) { translated.set(u, r.pieces); byKey.set(unitKey(u), r.pieces) }
      writeFileSync(cache, JSON.stringify({ entries: [...byKey].map(([key, pieces]) => ({ key, pieces })) }))
    }
    const strategy = strategiesFor(paper.meta, lang)[0]
    const base = { lead: strategy.leading ?? 1, track: 0, scale: 1 }
    const opts = { strategy: CJK.has(lang) ? withCjkType(strategy, base) : strategy, fonts, em: PARAMS[lang].em, theorems, sync: false, lead: `${base.lead}\\baselineskip` }
    const r = await compile(join(work, 'base'), paper, files, lockedFiles(paper, translated, opts), { engine: strategy.engine, rerun: true })
    note(lang, 'translated', translated.size, 'asked', todo.length, 'base', r.ok, `${r.ms} ms`)
  }
}
