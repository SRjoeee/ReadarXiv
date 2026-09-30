// The width probe for papers already in a runs directory (plans/2026-09-30-generic-type.md, step 1): the reader's font
// probe with WIDTH_PROBE in its body — the paper's preamble, a sample of English in its body face at its body size —
// compiled once per paper, its log copied into every language's work/width. Only logs are kept.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/density-probe.mjs <runs dir> <paper>...
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { unpackSource } from '../../../src/pdf-reader/engine/tar.mjs'
import { openPaper, probeFiles } from '../../../src/pdf-reader/engine/live.mjs'
import { latin1, latin1Bytes } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
import { readWidthProbe, WIDTH_PROBE } from './density.mjs'

const run = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const [runs, ...ids] = process.argv.slice(2)
for (const id of ids) {
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(root, 'data/corpus', id, 'source.gz'))))
  const paper = openPaper(files), { project, meta } = paper
  const overrides = probeFiles(paper)
  const main = latin1(overrides.get(project.main))
  overrides.set(project.main, latin1Bytes(main.replace('\\begin{document}\\end{document}', `\\begin{document}${WIDTH_PROBE}\\end{document}`)))
  const dir = mkdtempSync(join(tmpdir(), 'width-'))
  for (const [p, b] of [...files, ...overrides]) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...faithfulDockerArgs(root), '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '120', meta.compiler, '-interaction=nonstopmode', project.main], { maxBuffer: 1 << 26 }).catch(() => null)
  const stem = project.main.split('/').pop().replace(/\.[^./]+$/, '')
  const log = existsSync(join(dir, `${stem}.log`)) ? readFileSync(join(dir, `${stem}.log`), 'latin1') : ''
  rmSync(dir, { recursive: true, force: true })
  for (const lang of readdirSync(runs)) {
    if (!existsSync(join(runs, lang, id, 'work'))) continue
    mkdirSync(join(runs, lang, id, 'work/width'), { recursive: true })
    writeFileSync(join(runs, lang, id, 'work/width', `${stem}.log`), log, 'latin1')
  }
  console.log(id, JSON.stringify(readWidthProbe(log)))
}
