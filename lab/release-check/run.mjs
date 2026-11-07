#!/usr/bin/env node
// lab/release-check/run.mjs: `pnpm release-check --tier <fast|full|release>`, every gate of the tier as it exists
// (lab/release-check/gates.mjs), in design §4.9's order, each heavy one through the lab's heavy slot where the machine has
// it; then one report, release-check.md and release-check.json: per gate pass, fail or skipped with its reason (a gate whose
// input is not on this machine is skipped and says which, never passed), its numbers, each invariant's GO or NO-GO, the
// numbers against design §7's targets, and the verdict: GO only when every gate of the tier passed. Exit 0 on GO, 1 on NO-GO,
// 2 on a usage error. The tiers and where each runs: lab/release-check/CI.md. Not shipped.
//
//   pnpm release-check --tier fast|full|release [--only=<id>,…] [--online] [--plan]
//                      [--out=<dir>] [--work=<dir>] [--private=<file>] [--min-free=<GiB>]
//   --only      run these gates of the tier alone, the verdict theirs (the others listed as not run; a gate one of them reads
//               after is read where an earlier run left its outputs)
//   --online    run the live gates (the release tier's online e2e and the live placeholder run): the network, under the
//               project's User-Agent, never our production server (tests/e2e/lib/online.mjs); without it they are skipped
//   --plan      list the tier's gates and what each would skip for, run nothing
//   --out       where the report goes (default lab/release-check/out/<tier>, git-ignored)
//   --work      where the corpus gates write (default <out>/work): hundreds of MB a corpus run
//   --private   the private repository's gates, their commands and any result recorded for the release candidate (default
//               <lab data>/refactor-2026-11/lanes/L12/private-gates.json); a private gate is named, never run here
//   --min-free  a gate that writes corpus outputs is skipped under this many GiB free (default 12, the lab runners' own floor)
// Environment: AXT_LAB_DATA the lab-data directory (default ~/Developer/readarxiv-lab-data); RELEASE_CHECK_BASE the base
// worktree of the speed check.
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { arch, availableParallelism, homedir, platform, totalmem } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GATES, INVARIANTS, TIERS } from './gates.mjs'
import { gatesOf, invariantLine, markdownOf, targetLines, verdictOf } from './verdict.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const opt = name => {
  const i = argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i < 0) return null
  return argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : (argv[i + 1] ?? '')
}
const tier = opt('tier')
if (!TIERS.includes(tier)) {
  console.error(`release-check: --tier ${TIERS.join('|')} (given: ${tier ?? 'none'})`)
  process.exit(2)
}
const labData = process.env.AXT_LAB_DATA ?? join(homedir(), 'Developer', 'readarxiv-lab-data')
const out = resolve(opt('out') ?? join(ROOT, 'lab/release-check/out', tier))
const ctx = {
  root: ROOT,
  labData: existsSync(labData) ? labData : null,
  refactor: join(labData, 'refactor-2026-11'),
  work: resolve(opt('work') ?? join(out, 'work')),
  online: argv.includes('--online'),
  minFree: Number(opt('min-free') ?? 12),
}
const SLOT = join(labData, 'bin', 'heavy-slot.sh')
const privateFile = opt('private') ?? join(ctx.refactor, 'lanes', 'L12', 'private-gates.json')
const privates = existsSync(privateFile) ? JSON.parse(readFileSync(privateFile, 'utf8')) : {}
const only = opt('only')?.split(',').filter(Boolean) ?? null
const tierGates = gatesOf(GATES, tier)
if (only) for (const id of only) if (!tierGates.some(g => g.id === id)) {
  console.error(`release-check: no gate ${id} in tier ${tier}`)
  process.exit(2)
}

const freeGiB = () => Math.floor((statfsSync(ROOT).bavail * statfsSync(ROOT).bsize) / 2 ** 30)
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()

/** why a gate would not run on this machine now, before its steps: null where it runs */
function skipOf(g, results) {
  if (g.network === 'live' && !ctx.online) return 'a live gate (the network): run with --online'
  for (const a of g.after ?? []) {
    const r = results[a]
    // (a gate left out by --only: its outputs are read where an earlier run left them)
    if (r && r.status !== 'pass' && r.status !== 'not run') return `needs ${a}, which ${r.status === 'skipped' ? 'was skipped' : r.status === 'fail' ? 'failed' : 'did not run'}`
  }
  for (const n of g.needs?.(ctx) ?? []) if (!n.path || !existsSync(n.path)) return `needs ${n.what}${n.path ? `: ${n.path} is not on this machine` : ', not given'}`
  if (g.disk && freeGiB() < ctx.minFree) return `${freeGiB()} GiB free, under ${ctx.minFree} (the corpus runners' floor)`
  return null
}

/** one step: through the heavy slot where it names one and the machine has the slot, its output kept in the log */
function runStep(step, log) {
  if (step.fresh) {
    const dir = resolve(step.fresh)
    if (!dir.startsWith(`${ctx.work}/`)) throw new Error(`a fresh directory outside the work directory: ${dir}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
  }
  const cmd = step.slot && existsSync(SLOT) ? [SLOT, step.slot, '--', ...step.cmd] : step.cmd
  const t0 = performance.now()
  return new Promise(done => {
    const file = createWriteStream(log)
    const chunks = []
    const child = spawn(cmd[0], cmd.slice(1), { cwd: ROOT, env: { ...process.env, ...step.env }, stdio: ['ignore', 'pipe', 'pipe'] })
    for (const s of [child.stdout, child.stderr])
      s.on('data', d => {
        chunks.push(d)
        file.write(d)
      })
    const end = exit =>
      file.end(() => {
        const text = Buffer.concat(chunks).toString('utf8')
        // (the time it waited for the heavy slot, which another lane held, is not the gate's)
        const waited = Number(/heavy-slot: \w+ slot \S+ taken after (\d+)s/.exec(text)?.[1] ?? 0) * 1000
        done({ cmd: step.cmd, exit, ms: Math.max(0, Math.round(performance.now() - t0) - waited), waited, log, text })
      })
    child.on('error', e => {
      chunks.push(Buffer.from(String(e)))
      end(127)
    })
    child.on('close', (code, signal) => end(code ?? (signal ? 128 : 1)))
  })
}

async function runGate(g, results) {
  const base = { id: g.id, title: g.title, tier: g.tier, stage: g.stage, holds: g.holds }
  if (g.private) {
    const p = privates[g.id] ?? {}
    const r = p.result
    return r ? { ...base, status: r.status === 'pass' ? 'pass' : 'fail', reason: `recorded by the private repository: ${r.date ?? ''} at ${r.commit ?? '?'}${r.evidence ? `, ${r.evidence}` : ''}`, command: p.command } : { ...base, status: 'private', reason: "the private repository's, not run here", command: p.command, note: p.last ? `last: ${p.last}` : undefined }
  }
  if (only && !only.includes(g.id)) return { ...base, status: 'not run', reason: 'not in --only' }
  const skip = skipOf(g, results)
  if (skip) return { ...base, status: 'skipped', reason: skip }
  mkdirSync(join(out, 'logs'), { recursive: true })
  mkdirSync(ctx.work, { recursive: true })
  const steps = []
  const t0 = performance.now()
  let planned
  try {
    planned = g.steps(ctx)
  } catch (e) {
    return { ...base, status: 'fail', reason: `its command could not be made: ${e.message}` }
  }
  for (const [i, step] of planned.entries()) {
    console.log(`release-check: ${g.id} ${i + 1}: ${step.cmd.join(' ').slice(0, 160)}`)
    const s = await runStep(step, join(out, 'logs', `${g.id.replace(/[^\w.-]/g, '_')}.${i + 1}.log`))
    steps.push(s)
    if (s.exit !== 0 && !step.all) break
  }
  const waited = steps.reduce((n, s) => n + s.waited, 0)
  const ms = Math.round(performance.now() - t0) - waited
  const stepsOut = steps.map(s => ({ cmd: s.cmd.join(' '), exit: s.exit, ms: s.ms, waited: s.waited, log: relative(ROOT, s.log) }))
  let judged
  try {
    judged = g.judge ? g.judge(ctx, steps) : { pass: steps.every(s => s.exit === 0) }
  } catch (e) {
    judged = { pass: false, note: `its output could not be read: ${e.message}` }
  }
  const failed = steps.find(s => s.exit !== 0)
  const status = judged.skip ? 'skipped' : judged.pass ? 'pass' : 'fail'
  // (a failed step named by its script, or its command's first words)
  const stepName = st => st.cmd.find(a => /\.(?:m?js|sh|ts)$/.test(a))?.split('/').pop() ?? st.cmd.slice(0, 2).join(' ')
  const reason = judged.skip ?? (status === 'fail' ? (failed ? `${stepName(failed)} exit ${failed.exit}` : 'its counts') : undefined)
  console.log(`release-check: ${g.id}: ${status}${reason ? ` (${reason})` : ''}, ${Math.round(ms / 1000)} s${waited ? ` (and ${Math.round(waited / 1000)} s waiting for the heavy slot)` : ''}`)
  return { ...base, status, reason, note: judged.note || undefined, ms, waited, numbers: judged.numbers, findings: judged.findings, steps: stepsOut }
}

if (argv.includes('--plan')) {
  for (const g of tierGates) console.log(`${g.tier.padEnd(7)} ${g.stage.padEnd(8)} ${g.id.padEnd(22)} ${g.private ? "the private repository's" : skipOf(g, {}) ?? 'runs'}`)
  process.exit(0)
}

const started = new Date().toISOString()
const results = {}
for (const g of tierGates) results[g.id] = await runGate(g, results)
const invariants = INVARIANTS.map(i => invariantLine(i, GATES, tier, results))
// (with --only the verdict is the chosen gates': a job that runs part of a tier, CI.md)
const judged = only ? tierGates.filter(g => only.includes(g.id)) : tierGates
const { verdict, why } = verdictOf(only ? 'part' : tier, judged, results, invariants)
const report = {
  format: 'readarxiv/release-check 1',
  tier,
  only,
  verdict,
  why,
  commit: git('rev-parse', 'HEAD'),
  dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  started,
  ended: new Date().toISOString(),
  machine: `${platform()} ${arch()}, Node ${process.versions.node}, ${availableParallelism()} cores, ${Math.round(totalmem() / 2 ** 30)} GiB, ${freeGiB()} GiB free`,
  labData: ctx.labData,
  work: ctx.work,
  online: ctx.online,
  gates: tierGates.map(g => results[g.id]),
  invariants,
  targets: targetLines(results),
}
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'release-check.json'), `${JSON.stringify(report, null, 1)}\n`)
writeFileSync(join(out, 'release-check.md'), markdownOf(report))
console.log(`release-check: tier ${tier}: ${verdict}; ${join(relative(ROOT, out) || '.', 'release-check.md')}`)
for (const w of why) console.log(`  ${w}`)
process.exit(verdict === 'GO' ? 0 : 1)
