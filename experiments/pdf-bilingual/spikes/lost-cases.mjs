// The characters a compile could not set (live.mjs lostIn), counted in the last TeX pass's log: the browser's compiler
// joins every step's log, and a paper and its translation can take different numbers of passes. Exits non-zero on a
// failure.   node spikes/lost-cases.mjs
import assert from 'node:assert/strict'
import { lostIn, unsettable } from '../poc-reader/live.mjs'

/** one step of the browser compiler's joined log (poc-site/tex.js), as BusyTeX's pipeline writes it */
const step = (cmd, log) => [`$ ${cmd}`, 'EXITCODE: 0', '', 'TEXMFLOG:', '', '==', 'MISSFONTLOG:', '', '==', 'LOG:', log, '==', 'STDOUT:', log, '==', 'STDERR:', '', '======'].join('\n')
const joined = (...steps) => steps.join('\n\n')
const miss = 'Missing character: There is no é (U+00E9) in font cmr10!'
const cases = []

cases.push(['a browser compile: the last TeX pass alone, whatever the earlier passes\' logs hold (Devin and Codex on #294)', () => {
  const log = joined(step('pdflatex -synctex=1 x.tex', miss), step('bibtex x', ''), step('pdflatex -synctex=1 x.tex', miss), step('pdflatex -synctex=1 x.tex', miss))
  assert.deepEqual([...lostIn(log)], [['00E9', 1]])
}])
cases.push(['a step after the last pass is no TeX pass: xdvipdfmx, bibtex, biber, makeindex', () => {
  const log = joined(step('xelatex x.tex', miss), step('xdvipdfmx x.xdv', miss), step('makeindex x', miss))
  assert.deepEqual([...lostIn(log)], [['00E9', 1]])
}])
cases.push(['a native compile\'s .log is read whole: two losses in one pass are two', () => {
  assert.deepEqual([...lostIn(`${miss}\n${miss}`)], [['00E9', 2]])
}])
cases.push(['a translation that took more passes than the original, and loses no more, is settable', () => {
  const original = joined(step('pdflatex x.tex', miss), step('pdflatex x.tex', miss))
  const translation = { ok: true, log: joined(step('pdflatex x.tex', miss), step('pdflatex x.tex', miss), step('pdflatex x.tex', miss)) }
  assert.equal(unsettable(translation, lostIn(original)), false)
}])

let failed = 0
for (const [name, run] of cases) {
  try { run(); console.log('ok  ', name) } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]) }
}
process.exitCode = failed ? 1 : 0
