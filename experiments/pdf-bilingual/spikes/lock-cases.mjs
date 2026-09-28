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

// a unit whose last line falls just past the column's foot: TeX moves that line to the next column only at the next
// breakpoint, so a sync point that reads the page before it would end the next column as well (2608.24839, page 1)
const footBody = tr => `\\noindent\\rule{0pt}{\\dimexpr\\textheight-15pt\\relax}\n\n${unit(0, tr ? 'One.\\newline Two.' : 'One.\\newline Two.\\newline Three.\\newline Four.\\newline Five.\\newline Six.', tr)}${unit(1, 'The end.', tr)}`
const footDoc = (tr, tbl = '') => `${MARK_DEF}${LINES_TEX}${SYNC_TEX}${tr ? unitLeadTex(1.3) : ''}\n${tbl}\n\\documentclass[twocolumn]{article}\n\\begin{document}\n${footBody(tr)}\\end{document}\n`
const footTargets = readTargets(tex('foot-original', footDoc(false)))
const footTable = '\\makeatletter\n' + [...footTargets].map(([i, x]) => `\\expandafter\\def\\csname axt@t@${i}\\endcsname{{${x.page}}{${x.col}}{${x.total}pt}}`).join('\n') + '\n\\makeatother'
tex('foot-locked', footDoc(true, footTable))
const [fo, fl] = [await marksOf(join(dir, 'foot-original.pdf')), await marksOf(join(dir, 'foot-locked.pdf'))]
const at = (mm, k) => { const x = mm.marks.get(k); return x && `${x.page} ${mm.width && x.x >= mm.width / 2 ? 1 : 0}` }
check('a line past the foot: the next unit starts where the original did', at(fl, '1s') === at(fo, '1s'), `${at(fl, '1s')} vs ${at(fo, '1s')}`)
check('a line past the foot: same page count', fl.pages === fo.pages, `${fl.pages} vs ${fo.pages}`)

// the same in one column, the next unit a list's first \item, before which the list's \par does nothing: \newpage
// shipped the page and then a second one holding only the line (2608.09746, pages 8 and 9)
const itemBody = tr => `\\noindent\\rule{0pt}{\\dimexpr\\textheight-22pt\\relax}\n\n${unit(0, tr ? 'One.\\newline Two.' : 'One.\\newline Two.\\newline Three.\\newline Four.\\newline Five.\\newline Six.', tr)}\\begin{itemize}\n\\item ${unit(1, 'The end.', tr)}\\end{itemize}\n`
const itemDoc = (tr, tbl = '') => `${MARK_DEF}${LINES_TEX}${SYNC_TEX}${tr ? unitLeadTex(1.3) : ''}\\axtsyncpoints{theorem}\n${tbl}\n\\documentclass{article}\n\\begin{document}\n${itemBody(tr)}\\end{document}\n`
const itemTargets = readTargets(tex('item-original', itemDoc(false)))
const itemTable = '\\makeatletter\n' + [...itemTargets].map(([i, x]) => `\\expandafter\\def\\csname axt@t@${i}\\endcsname{{${x.page}}{${x.col}}{${x.total}pt}}`).join('\n') + '\n\\makeatother'
tex('item-locked', itemDoc(true, itemTable))
const [io, il] = [await marksOf(join(dir, 'item-original.pdf')), await marksOf(join(dir, 'item-locked.pdf'))]
check('a line past the foot in a list: the next item starts where the original did', il.marks.get('1s')?.page === io.marks.get('1s')?.page, `${il.marks.get('1s')?.page} vs ${io.marks.get('1s')?.page}`)
check('a line past the foot in a list: same page count', il.pages === io.pages, `${il.pages} vs ${io.pages}`)
// unit leading is the unit's own: a footnote's paragraph ending first inside the unit, a unit in a group that closes
// before its paragraph ends, a unit set once in a box (as a caption is measured) — after each, the paper's leading
// again and no TeX error (2608.02163: 13 pt leading leaked into the English that followed, down to the references);
// a unit begun in a group whose paragraph first ends inside a box — a table's p-column cell, a split in a display —
// puts nothing in the alignment (2608.21180: "Misplaced \\noalign", 2608.09038: "Missing $ inserted")
const leadBody = [
  `\\axtlines{0}\\axtlead{0}\\leavevmode A unit with a note.\\footnote{${'A long note. '.repeat(40)}} It goes on.\\par\\message{^^JLEAD-AFTER footnote \\the\\baselineskip^^J}`,
  `\\axtlines{3}\\axtlead{3}\\leavevmode A unit a list ends.\\begin{itemize}\\item\\message{^^JLEAD-AFTER initem \\the\\baselineskip^^J}${'Item text. '.repeat(30)}\\end{itemize}\\message{^^JLEAD-AFTER list \\the\\baselineskip^^J}${'After the list. '.repeat(30)}\\par`,
  `{\\axtlead{1}\\leavevmode A unit in a group.}\\par\\message{^^JLEAD-AFTER group \\the\\baselineskip^^J}`,
  `\\sbox0{\\axtlead{2}\\leavevmode A unit in a box.}\\leavevmode Plain text.\\par\\message{^^JLEAD-AFTER box \\the\\baselineskip^^J}`,
  `{\\bfseries\\axtlead{4}\\leavevmode A unit begun bold.} It goes on \\begin{tabular}{p{3cm}}\\hline Cell text.\\\\\\hline\\end{tabular} and ends.\\par\\message{^^JLEAD-AFTER table \\the\\baselineskip^^J}`,
  `\\textbf{\\axtlead{5}\\leavevmode A unit begun bold} goes on\\begin{align*}\\begin{split}a&=b\\\\&=c\\end{split}\\end{align*}and ends.\\par\\message{^^JLEAD-AFTER display \\the\\baselineskip^^J}`,
].join('\n\n')
const leadLog = tex('lead', `${LINES_TEX}${unitLeadTex(1.3)}\n\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n${leadBody}\n\\end{document}\n`)
const after = Object.fromEntries([...leadLog.matchAll(/^LEAD-AFTER (\w+) (\S+)/gm)].map(m => [m[1], m[2]]))
check('the paper\'s leading after a unit with a footnote, in a group, in a box, in and after a list that ends it, and before a table and a display', ['footnote', 'group', 'box', 'initem', 'list', 'table', 'display'].every(k => after[k] === '12.0pt'), JSON.stringify(after))
check('line counts of the unit\'s own paragraph, not its footnote\'s or the list\'s', readLines(leadLog).get(0)?.lines === 1 && readLines(leadLog).get(3)?.lines === 1, JSON.stringify([...readLines(leadLog)]))
check('unit leading raises no TeX error', !/^! /m.test(leadLog), (leadLog.match(/^! .*/m) ?? [''])[0])
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
