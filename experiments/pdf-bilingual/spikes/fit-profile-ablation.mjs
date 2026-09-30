// Five-paper offline ablation. No translator, no extra trial; Original is the acceptance target.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { CASES, digest, profileFor, profileRecords } from './fit-profiles.mjs'
import { prepareProfileSource } from './fit-profile-source.mjs'
import { faithfulDockerArgs } from './faithful.mjs'
import { marksOf } from './lock.mjs'
import { profilePositions as positions } from './fit-profile-metrics.mjs'
const run = promisify(execFile), root = new URL('..', import.meta.url).pathname
const data = join(root, 'data/runs/visual-eval'), out = resolve(process.argv[2] ?? join(root, 'data/runs/fit-profile-ablation', String(Date.now())))
mkdirSync(out, { recursive: true })
const records = profileRecords(data), resultFile = join(out, 'results.json')
const rows = process.argv.includes('--resume') && existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')).rows : []
for (const [lang, paper] of CASES) {
  if (rows.some(r => r.lang === lang && r.paper === paper)) continue
  const folder = join(data, lang, paper), dest = join(out, `${lang}-${paper}`), profile = profileFor(records, lang, paper)
  const t0 = performance.now(), source = prepareProfileSource(join(folder, 'work/fit-1'), dest, profile), prepareMs = performance.now() - t0
  const reference = join(folder, 'fit.pdf'), original = join(folder, 'work/original', `${source.stem}.pdf`)
  const referenceHash = digest(readFileSync(reference)), originalHash = digest(readFileSync(original))
  const engine = profile.cjk ? '-xelatex' : '-pdf', start = performance.now()
  let failure = null, stdout = '', stderr = ''
  try { ({ stdout, stderr } = await run('docker', ['run', '--rm', '--init', '--network', 'none', '--cpus', '2', '--memory', '3g', ...faithfulDockerArgs(root), '-v', `${dest}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', 'latexmk', engine, '-interaction=nonstopmode', source.main], { maxBuffer: 1 << 26 })) } catch (e) { failure = e.message.slice(0, 300); stdout = e.stdout ?? ''; stderr = e.stderr ?? '' }
  const compileMs = performance.now() - start
  writeFileSync(join(dest, 'compile.stdout.txt'), stdout); writeFileSync(join(dest, 'compile.stderr.txt'), stderr)
  const logFile = join(dest, `${source.stem}.log`), log = existsSync(logFile) ? readFileSync(logFile, 'latin1') : '', errors = [...log.matchAll(/^! .*/gm)].map(m => m[0])
  const row = { lang, paper, profile, source, referenceHash, originalHash, prepareMs, compileMs, failure, errors,
    texPasses: (stdout.match(/Run number \d+ of rule '(?:pdf|xe|lua)latex'/g) ?? []).length,
    missingGlyphs: (log.match(/^Missing character:/gm) ?? []).length, overfullH: (log.match(/^Overfull \\hbox/gm) ?? []).length, overfullV: (log.match(/^Overfull \\vbox/gm) ?? []).length }
  if (!failure && !errors.length) {
    const compareStart = performance.now(), o = await marksOf(original), f = await marksOf(reference), c = await marksOf(join(dest, `${source.stem}.pdf`))
    row.fitToOriginal = positions(o, f); row.candidateToOriginal = positions(o, c); row.candidateToFit = positions(f, c); row.compareMs = performance.now() - compareStart
  }
  rows.push(row); writeFileSync(join(out, 'results.json'), JSON.stringify({ mode: 'native cached-input pilot; leave-one-paper-out; original primary; existing fit-1 IDs only; no production timing claim', rows }, null, 2))
  console.log(JSON.stringify({ lang, paper, compileMs: Math.round(compileMs), texPasses: row.texPasses, failure: row.failure, fit: row.fitToOriginal, candidate: row.candidateToOriginal }))
}
console.log(`Evidence: ${out}`)
