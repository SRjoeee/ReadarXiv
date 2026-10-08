// lab/pdf/spikes/layer-fixtures-fault-check.mjs
// The fixture maker's own faults stay faults (E5 fix round 1): spikes/layer-fixtures.mjs makes the marks through the
// engine's layoutMarksOfPaper, which turns whatever its compile callback throws into a refusal, and a refusal is a paper the
// maker cannot lay out (refusal.json written, layout.json removed). A fault of the maker's own — the 10 GiB disk guard, a
// full disk — must fail the run as before: exit 1, nothing written for the output. This runs the maker on one output
// offline with TeX Live's compile cache empty (so that a compile is asked for) and the disk reported full, and checks that.
//   pnpm exec tsx lab/pdf/spikes/layer-fixtures-fault-check.mjs [<id>v<n>:<target>]
// Data (outside git): the output's paper in data/layout/<id>/ and its record among data/layer-fixtures, as the maker's
// --offline run needs. Compiles nothing and makes no request; writes only into a folder it removes (out/layer-gate/
// fault-check). Exits 1 where the fault is swallowed.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const output = process.argv[2] ?? '1706.03762v7:zh'
const work = join(root, 'out/layer-gate/fault-check')
rmSync(work, { recursive: true, force: true })
mkdirSync(join(work, 'compiles'), { recursive: true })
// the disk reported full: node:fs's statfsSync, which the maker's guard reads, as the ESM exports see it after the patch
const preload = join(work, 'full-disk.mjs')
writeFileSync(preload, "import fs from 'node:fs'\nimport { syncBuiltinESMExports } from 'node:module'\nfs.statfsSync = () => ({ bavail: 0, bsize: 1 })\nsyncBuiltinESMExports()\n")
let out = '', code = 0
try {
  out = execFileSync(join(root, '../../node_modules/.bin/tsx'), [join(root, 'spikes/layer-fixtures.mjs'), '--offline', `--only=${output}`], {
    env: { ...process.env, LAYER_FIXTURES: join(work, 'fixtures'), COMPILES: join(work, 'compiles'), NODE_OPTIONS: `--import=${preload}` },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (e) { code = e.status ?? 1; out = `${e.stdout ?? ''}${e.stderr ?? ''}` }
const dir = join(work, 'fixtures', output.replace(':', '-'))
const written = existsSync(dir) ? readdirSync(dir) : []
const checks = [
  ['exits 1', code === 1, `exit ${code}`],
  ['names the disk guard', /FAIL .*less than 10 GiB free/.test(out), out.split('\n').find(l => l.startsWith('FAIL'))?.slice(0, 120) ?? 'no FAIL line'],
  ['writes nothing for the output', written.length === 0, written.join(' ') || 'nothing'],
]
let failed = 0
for (const [name, ok, detail] of checks) { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`) }
rmSync(work, { recursive: true, force: true })
process.exitCode = failed ? 1 : 0
