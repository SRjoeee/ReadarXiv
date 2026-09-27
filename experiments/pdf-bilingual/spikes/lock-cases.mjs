// experiments/pdf-bilingual/spikes/lock-cases.mjs
// Cases for lock.mjs: the log readers, heights, the leading of units that grew, and the TeX itself — a two-column
// document whose translation is shorter must start every unit on the page and in the column the original did, with a
// run-in \paragraph head and a list among the units. Exits non-zero on a failure.
//   node experiments/pdf-bilingual/spikes/lock-cases.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MARK_DEF } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { heights, LINES_TEX, marksOf, readLines, readLockEvents, readTargets, SYNC_TEX, tightenedLeads, unitLeadTex } from './lock.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

// log readers
const log = 'x\nAXT-AT 3 0 1 346.0pt\nAXT-AT h2 1 2 12.5pt\nAXT-LINES 3 4 11.0pt\nAXT-BREAK 4\nAXT-GAP 5 30.5pt\n'
const t = readTargets(log)
check('targets read', t.size === 2 && JSON.stringify(t.get('h2')) === JSON.stringify({ page: 1, col: 2, total: 12.5 }), JSON.stringify([...t]))
check('lines read', JSON.stringify(readLines(log).get(3)) === JSON.stringify({ lines: 4, bs: 11 }))
const ev = readLockEvents(log)
check('events read, pages 1-based', ev.breaks[0]?.page === 5 && ev.gaps[0]?.page === 6 && ev.gaps[0]?.pt === 30.5, JSON.stringify(ev))

// heights: one column split, one within a column; line-count height where the marks cannot tell
const units = [{ pieces: [] }, { pieces: [] }]
const m = { width: 612, twoColumn: true, marks: new Map([['0s', { page: 0, x: 60, y: 700 }], ['0e', { page: 0, x: 250, y: 650 }], ['1s', { page: 0, x: 60, y: 100 }], ['1e', { page: 0, x: 400, y: 700 }]]) }
const h = heights(units, m, new Map([[1, { lines: 5, bs: 12 }]]))
check('height within a column', h.get(0).hy === 50)
check('height across columns by lines', h.get(1).hy === null && Math.abs(h.get(1).hl - (4 * 12 * 72) / 72.27) < 1e-9)

// leading of units that grew
const orig = new Map([[0, { hy: 100 }], [1, { hy: 100 }], [2, { hy: 100 }]])
const tr = new Map([[0, { hy: 130 }], [1, { hy: 110 }], [2, { hy: 90 }]])
const leads = tightenedLeads(orig, tr, { em: 1.3, min: 1.1 })
check('floor holds', leads.get(0) === 1.1)
check('proportional', Math.abs(leads.get(1) - 1.3 * 100 / 110) < 1e-9)
check('shorter units untouched', !leads.has(2))

// the TeX: original with probes, translation shorter, locked with the original's targets
const dir = mkdtempSync(join(tmpdir(), 'lock-cases-'))
const unit = (i, text, tr) => `${tr ? `\\axtsync{${i}}\\axtlines{${i}}\\axtlead{${i}}` : `\\axtat{${i}}\\axtlines{${i}}`}\\leavevmode\\axtmark{${i}s}${text}\\axtend{${i}e}\n\n`
const body = tr => {
  let s = ''
  for (let i = 0; i < 14; i++) {
    if (i % 5 === 0) s += `\\section{Part ${i}}\n`
    if (i === 7) s += '\\paragraph{Run-in head.}\n'
    // the last unit is the same short line in both, so that the original's last page never holds only its overflow
    s += unit(i, i === 13 ? 'The end.' : tr ? `\\lipsum[${i + 1}][1-2]` : `\\lipsum[${i + 1}]`, tr)
    if (i === 10) s += `\\begin{itemize}\n\\item ${unit(100, tr ? 'Short item.' : '\\lipsum[20][1-3]', tr)}\\end{itemize}\n`
  }
  return s
}
const doc = (tr, table = '') => `${MARK_DEF}${LINES_TEX}${SYNC_TEX}${tr ? unitLeadTex(1.3) : ''}\\axtsyncpoints{theorem}\n${table}\n\\documentclass[twocolumn]{article}\n\\usepackage{lipsum}\n\\begin{document}\n${body(tr)}\\end{document}\n`
const tex = (name, src) => {
  writeFileSync(join(dir, `${name}.tex`), src)
  try { execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'pdflatex', '-interaction=nonstopmode', `${name}.tex`], { stdio: 'ignore' }) } catch {}
  return readFileSync(join(dir, `${name}.log`), 'latin1')
}
const targets = readTargets(tex('original', doc(false)))
const table = '\\makeatletter\n' + [...targets].map(([i, x]) => `\\expandafter\\def\\csname axt@t@${i}\\endcsname{{${x.page}}{${x.col}}{${x.total}pt}}`).join('\n') + '\n\\makeatother'
const lockedLog = tex('locked', doc(true, table))
const [om, lm] = [await marksOf(join(dir, 'original.pdf')), await marksOf(join(dir, 'locked.pdf'))]
const col = (mm, x) => (mm.twoColumn && x >= mm.width / 2 ? 1 : 0)
const off = [...om.marks].filter(([k]) => k.endsWith('s')).filter(([k, o]) => { const l = lm.marks.get(k); return !l || l.page !== o.page || col(lm, l.x) !== col(om, o.x) })
check('targets recorded for units and headings', targets.size >= 15 && [...targets.keys()].some(k => k.startsWith('h')), `${targets.size}`)
check('every unit starts where the original did', off.length === 0, off.map(([k]) => k).join(' '))
check('same page count', lm.pages === om.pages, `${lm.pages} vs ${om.pages}`)
check('the lock inserted space', readLockEvents(lockedLog).gaps.length > 0)
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
