// The live pipeline (poc-reader/live.mjs) end to end in Node: Microsoft's free endpoint for the translation, native
// TeX Live in Docker for the compiles (one pass = the engine once, then BibTeX when asked; every pass = latexmk).
// Prints the timeline and keeps each PDF, to check the pipeline's logic before the browser runs it.
//   node spikes/live-node.mjs id [lang]
//   ECHO=1 node spikes/live-node.mjs id — no engine: every text comes back as it went, marked, in the tags format an
//     LLM gets (the pipeline and the compiles alone, as reader-live's LLM_MOCK checks them in the browser)
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { unpackSource } from '../poc-reader/tar.mjs'
import { openPaper, runLive } from '../poc-reader/live.mjs'
import { translateTexts } from '../poc-reader/mt.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const [id, lang = 'zh'] = process.argv.slice(2)
/** ECHO: the mark before a text's first letter, never before a leading placeholder (a table's \toprule) */
const echo = t => { let done = false; return t.split(/(<[^>]*>)/).map(part => (done || part.startsWith('<') || !/\p{L}/u.test(part) ? part : ((done = true), part.replace(/\p{L}/u, l => `ECHO ${l}`)))).join('') }
const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
const paper = openPaper(files)
const out = join(root, 'data/runs/live-node', id); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })
const t0 = Date.now(), at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
let n = 0
async function compile({ main, engine, rerun, bibtex, overrides }) {
  const dir = join(out, `c${++n}`)
  for (const [p, b] of files) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  for (const [p, b] of overrides) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  // TeX writes its output where it runs, the project's root, whatever directory the main file is in
  const stem = main.split('/').pop().replace(/\.[^./]+$/, ''), start = Date.now()
  const docker = cmd => run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...faithfulDockerArgs(root), '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { maxBuffer: 1 << 26 }).catch(() => null)
  if (rerun) await docker(['latexmk', { xelatex: '-xelatex', lualatex: '-lualatex' }[engine] ?? '-pdf', ...(bibtex === false ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main])
  else { await docker([engine, '-interaction=nonstopmode', main]); if (bibtex) await docker(['bibtex', stem]) }
  const read = (ext, enc) => { const f = join(dir, `${stem}.${ext}`); return existsSync(f) ? readFileSync(f, enc) : null }
  const pdf = read('pdf')
  return { ok: !!pdf?.length, pdf, aux: read('aux', 'utf8'), bbl: bibtex ? read('bbl', 'utf8') : null, log: read('log', 'latin1') ?? '', ms: Date.now() - start }
}
const r = await runLive(paper, {
  lang, compile, ...(process.env.ECHO ? { format: 'tags', translate: async texts => texts.map(echo) } : { translate: texts => translateTexts(texts, lang) }),
  onUpdate: ({ pdf, texts, translated, final }) => { const f = join(out, final ? 'final.pdf' : `preview-${translated}.pdf`); writeFileSync(f, pdf); if (final) writeFileSync(join(out, 'final-texts.json'), JSON.stringify(texts)); console.log(at(), final ? 'FINAL' : 'preview', translated, 'units →', f.slice(root.length)) },
  onOriginal: ({ pdf }) => { writeFileSync(join(out, 'original-marked.pdf'), pdf); console.log(at(), 'original with marks') },
  note: (event, data) => console.log(at(), event, JSON.stringify(data)),
})
console.log(at(), 'done', JSON.stringify(r), 'units', paper.units.length, 'kept names', paper.kept.size)
