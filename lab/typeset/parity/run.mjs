// lab/typeset/parity/run.mjs [--work=<dir>] [--out=<dir>] [--pages=<n>,…] [<pair>…]: the parity check whole (README.md): v2's pages laid
// (v2.mjs, the heavy slot's `test`), every page drawn three ways and read back (render.mjs, the slot's `e2e`), then measured
// and the sheet written (measure.mjs). Defaults: lab-data's refactor-2026-11/parity/ (the sheet, parity.json) and its work/
// (the entry's pages, the raw measures). Exits with measure.mjs's code: 1 where a page of v2's is worse than today's or the run
// is not judged whole; measure.mjs is told the pairs, which must be the ones the drawing drew.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { LAB } from '../../../packages/typeset/tests/replay/tap.ts'
import { PAIRS } from './pairs.mjs'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const OUT = arg('out', join(LAB, 'refactor-2026-11', 'parity'))
const WORK = arg('work', join(OUT, 'work'))
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const pages = process.argv.slice(2).filter((a) => a.startsWith('--pages='))
const pairs = asked.length ? asked : PAIRS
const SLOT = join(LAB, 'bin', 'heavy-slot.sh')
const HERE = import.meta.dirname
const step = (slot, script, ...a) => {
  const cmd = [process.execPath, join(HERE, script), ...a]
  const r = spawnSync(slot && existsSync(SLOT) ? SLOT : cmd[0], slot && existsSync(SLOT) ? [slot, '--', ...cmd] : cmd.slice(1), { stdio: 'inherit' })
  return r.status ?? 1
}
if (step('test', 'v2.mjs', `--out=${join(WORK, 'v2')}`, ...pairs)) process.exit(2)
if (step('e2e', 'render.mjs', `--work=${WORK}`, `--out=${OUT}`, ...pages, ...pairs)) process.exit(2)
process.exit(step(null, 'measure.mjs', `--work=${WORK}`, `--out=${OUT}`, ...pairs))
