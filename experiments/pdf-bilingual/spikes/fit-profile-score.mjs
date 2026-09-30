// Read-only PDF analysis plus an evidence record; no compile or translation request.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { digest } from './fit-profiles.mjs'
import { profilePositions } from './fit-profile-metrics.mjs'
import { walk } from './fit-profile-source.mjs'
import { marksOf } from './lock.mjs'
const root = new URL('..', import.meta.url).pathname, out = resolve(process.argv[2]), path = join(out, 'results.json')
const report = JSON.parse(readFileSync(path, 'utf8'))
const counts = log => ({ errors: (log.match(/^! /gm) ?? []).length, missingGlyphs: (log.match(/^Missing character:/gm) ?? []).length,
  overfullH: (log.match(/^Overfull \\hbox/gm) ?? []).length, overfullV: (log.match(/^Overfull \\vbox/gm) ?? []).length })
const body = s => s.slice(s.includes('\\begin{document}') ? s.indexOf('\\begin{document}') : 0).replace(/\\axtsize\{\d+\}/g, '')
for (const row of report.rows) {
  const source = join(root, 'data/runs/visual-eval', row.lang, row.paper), original = join(source, 'work/original', `${row.source.stem}.pdf`)
  const reference = join(source, 'fit.pdf'), finalFolder = join(source, 'work/fit-3')
  if (digest(readFileSync(original)) !== row.originalHash || digest(readFileSync(reference)) !== row.referenceHash) throw new Error('Reference PDF changed')
  const drift = walk(join(source, 'work/fit-1')).filter(p => p.endsWith('.tex')).filter(p => {
    const final = join(finalFolder, relative(join(source, 'work/fit-1'), p))
    return !existsSync(final) || body(readFileSync(p, 'utf8')) !== body(readFileSync(final, 'utf8'))
  }).map(p => relative(source, p))
  row.referenceBodyDifferences = drift
  row.referenceMatchesFinalPDF = digest(readFileSync(join(finalFolder, `${row.source.stem}.pdf`))) === row.referenceHash
  row.fitDiagnostics = counts(readFileSync(join(finalFolder, `${row.source.stem}.log`), 'latin1'))
  row.originalDiagnostics = counts(readFileSync(join(source, 'work/original', `${row.source.stem}.log`), 'latin1'))
  if (!row.failure && !row.errors.length) {
    const o = await marksOf(original), f = await marksOf(reference), c = await marksOf(join(out, `${row.lang}-${row.paper}`, `${row.source.stem}.pdf`))
    row.fitToOriginal = profilePositions(o, f); row.candidateToOriginal = profilePositions(o, c); row.candidateToFit = profilePositions(f, c)
  }
  console.log(JSON.stringify({ lang: row.lang, profile: { lead: row.profile.lead, scale: row.profile.scale, track: row.profile.track },
    training: row.profile.training.length, drift, referenceMatchesFinalPDF: row.referenceMatchesFinalPDF,
    compileMs: Math.round(row.compileMs), texPasses: row.texPasses, fit: row.fitToOriginal, candidate: row.candidateToOriginal,
    fitDiagnostics: row.fitDiagnostics, candidateDiagnostics: { errors: row.errors.length, missingGlyphs: row.missingGlyphs, overfullH: row.overfullH, overfullV: row.overfullV } }))
}
report.scoring = 'Original primary; page and column-aware starts, XY distance and within-column start/end heights; existing original missing marks included'
writeFileSync(join(out, 'scored-results.json'), JSON.stringify(report, null, 2))
