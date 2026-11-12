// lab/typeset/parity/run.mjs [--work=<dir>] [--out=<dir>] [--pages=<n>,…] [--toggles=on] [--fresh=off|all] [--gate=<file>] [<pair>…]: the parity check whole (README.md): v2's pages laid
// (v2.mjs, the heavy slot's `test`), every page drawn three ways and read back (render.mjs, the slot's `e2e`), then measured
// and the sheet written (measure.mjs). Defaults: lab-data's refactor-2026-11/parity/ (the sheet, parity.json) and its work/
// (the entry's pages, the raw measures). Exits with measure.mjs's code: 1 where a page of v2's is worse than today's or the run
// is not judged whole; measure.mjs is told the pairs, which must be the ones the drawing drew.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { LAB } from '../../../packages/typeset/tests/replay/tap.ts'
import { bundlesLine, headsFor } from '../../../packages/typeset/tests/replay/bundles.ts'
import { L1_BUNDLES_DIR as BUNDLES } from '../../../packages/typeset/tests/replay/l1.ts'
import { PAIRS } from './pairs.mjs'
import { ADDED_HEADING, apartOf, runApart } from '../added.mjs'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
/** --toggles=on: both readers with every switch of "What to translate" on, its sheet in parity/toggles-on/ */
const TOGGLES = arg('toggles') === 'on' ? 'on' : null
const OUT = arg('out', join(LAB, 'refactor-2026-11', 'parity', ...(TOGGLES ? ['toggles-on'] : [])))
const WORK = arg('work', join(OUT, 'work'))
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const pages = process.argv.slice(2).filter((a) => a.startsWith('--pages=') || a.startsWith('--toggles='))
const toggles = TOGGLES ? [`--toggles=${TOGGLES}`] : []
/** --fresh=off: v2 laid without fresh rows, the sheet as before lane parity-fresh; --fresh=all: the review mode, every unit
 *  fresh (v2.mjs), with --gate=<the gate sheet's parity.json> for measure.mjs; a fill is never a run's */
const FRESH = arg('fresh')
if (FRESH !== undefined && !['off', 'cache', 'all'].includes(FRESH)) throw new Error(`run.mjs: --fresh=${FRESH}: off, cache or all (a fill is v2.mjs's own step)`)
const fresh = FRESH ? [`--fresh=${FRESH}`] : []
const gate = arg('gate') ? [`--gate=${arg('gate')}`] : []
// (the added pairs, lab/typeset/added.mjs: drawn and judged after the set's in a run of their own, `--apart`, its sheet and work
// under <out>/added and <work>/added, its verdict printed after the set's under its heading, its exit joined to the set's; a run
// asked for added pairs alone is that run)
const { pairs, later, apart } = apartOf(asked.length ? asked : PAIRS, { named: asked.length > 0 })
if (!pairs.length && later.length) process.exit(runApart(import.meta.filename, later, { dirs: { out: OUT, work: WORK } }))
if (apart) console.log(`${ADDED_HEADING} ${pairs.join(', ')}`)
// (the bundles every step serves, named once here and by each step; a set AXT_L1_BUNDLES that is no bundles folder, or lacks a pair
// asked, stops the run before any step: bundles.ts, as l1.ts resolves it)
console.log(bundlesLine(BUNDLES))
headsFor(pairs, BUNDLES)
const SLOT = join(LAB, 'bin', 'heavy-slot.sh')
const HERE = import.meta.dirname
const step = (slot, script, ...a) => {
  const cmd = [process.execPath, join(HERE, script), ...a]
  const r = spawnSync(slot && existsSync(SLOT) ? SLOT : cmd[0], slot && existsSync(SLOT) ? [slot, '--', ...cmd] : cmd.slice(1), { stdio: 'inherit' })
  return r.status ?? 1
}
if (step('test', 'v2.mjs', `--out=${join(WORK, 'v2')}`, ...toggles, ...fresh, ...pairs)) process.exit(2)
if (step('e2e', 'render.mjs', `--work=${WORK}`, `--out=${OUT}`, ...pages, ...pairs)) process.exit(2)
const status = step(null, 'measure.mjs', `--work=${WORK}`, `--out=${OUT}`, ...gate, ...pairs)
process.exit(Math.max(status, runApart(import.meta.filename, later, { dirs: { out: OUT, work: WORK } })))
