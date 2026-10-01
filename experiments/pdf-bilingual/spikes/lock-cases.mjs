// experiments/pdf-bilingual/spikes/lock-cases.mjs
// Cases for lock.mjs: the log readers, heights, the leading of units that grew, and the TeX itself — a two-column
// document whose translation is shorter must start every unit on the page and in the column the original did, with a
// run-in \paragraph head and a list among the units. Exits non-zero on a failure.
//   node experiments/pdf-bilingual/spikes/lock-cases.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FIT_DEF, latin1Bytes, MARK_DEF, NO_OVERFLOW } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { openPaper } from '../../../src/pdf-reader/engine/live.mjs'
import { strategiesFor } from '../../../src/pdf-reader/engine/scripts.mjs'
import { cjkType, fitLeads, FLOAT_TEX, heights, LINES_TEX, lockedFiles, marksOf, readColumns, readFloats, readForced, readLines, readLockEvents, readTargets, shrinkSizes, SIZE_TEX, SYNC_TEX, tightenedLeads, unitLeadTex } from './lock.mjs'

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }

// log readers
const log = 'x\nAXT-AT 3 0 1 346.0pt\nAXT-AT h2 1 2 12.5pt\nAXT-LINES 3 4 11.0pt\nAXT-BREAK 4\nAXT-GAP 5 30.5pt\n'
const t = readTargets(log)
check('targets read', t.size === 2 && JSON.stringify(t.get('h2')) === JSON.stringify({ page: 1, col: 2, total: 12.5 }), JSON.stringify([...t]))
check('lines read', JSON.stringify(readLines(log).get(3)) === JSON.stringify({ lines: 4, bs: 11 }))
// a sync point logged at or past its column's height at the break stood on the next column (RT-1's unit 37); one
// logged before it stays; the last column has no next and keeps its point
const moved = readTargets('AXT-AT 37 4 1 397.76pt\nAXT-AT 36 4 1 314.7pt\nAXT-COL 4 1 395.6pt\nAXT-AT 38 5 1 45.1pt\nAXT-AT 50 5 1 400pt\nAXT-COL 5 1 390pt\n')
check('a point past its column\'s height is the top of the next column', JSON.stringify(moved.get('37')) === JSON.stringify({ page: 5, col: 1, total: 0 }) && moved.get('36').page === 4 && moved.get('50').page === 5, JSON.stringify([...moved]))
const two = readTargets('AXT-AT 7 2 1 600pt\nAXT-COL 2 1 590pt\nAXT-COL 2 2 580pt\n')
check('in two columns the next column is the page\'s second', JSON.stringify(two.get('7')) === JSON.stringify({ page: 2, col: 2, total: 0 }), JSON.stringify([...two]))
check('columns and floats read', readColumns('AXT-COL 3 2 512.5pt\n').get('3@2') === '512.5' && readFloats('AXT-FLOAT 4 230.1pt\n').get('4') === '230.1')
const aimed = shrinkSizes(new Map([[0, { hy: 100 }]]), new Map([[0, { hy: 121 }]]), new Map(), { min: 0.6, margin: 0.02 })
check('a size aimed a little inside the box', Math.abs(aimed.get(0) - Math.sqrt(100 / 121) * 0.98) < 1e-9, JSON.stringify([...aimed]))
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
const tex = (name, src, engine = 'pdflatex') => {
  writeFileSync(join(dir, `${name}.tex`), src)
  try { execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', engine, '-interaction=nonstopmode', `${name}.tex`], { stdio: 'ignore' }) } catch {}
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
// puts nothing in the alignment (2608.21180: "Misplaced \\noalign", 2608.09038: "Missing $ inserted"); a display
// inside a unit is set at the paper's leading, and the unit's own lines after it at the unit's
const leadBody = [
  `\\axtlines{0}\\axtlead{0}\\leavevmode A unit with a note.\\footnote{${'A long note. '.repeat(40)}} It goes on.\\par\\message{^^JLEAD-AFTER footnote \\the\\baselineskip^^J}`,
  `\\axtlines{3}\\axtlead{3}\\leavevmode A unit a list ends.\\begin{itemize}\\item\\message{^^JLEAD-AFTER initem \\the\\baselineskip^^J}${'Item text. '.repeat(30)}\\end{itemize}\\message{^^JLEAD-AFTER list \\the\\baselineskip^^J}${'After the list. '.repeat(30)}\\par`,
  `{\\axtlead{1}\\leavevmode A unit in a group.}\\par\\message{^^JLEAD-AFTER group \\the\\baselineskip^^J}`,
  `\\sbox0{\\axtlead{2}\\leavevmode A unit in a box.}\\leavevmode Plain text.\\par\\message{^^JLEAD-AFTER box \\the\\baselineskip^^J}`,
  `{\\bfseries\\axtlines{4}\\axtlead{4}\\leavevmode A unit begun bold.} It goes on \\begin{tabular}{p{3cm}}\\hline Cell text.\\\\\\hline\\end{tabular} and ends.\\par\\message{^^JLEAD-AFTER table \\the\\baselineskip^^J}`,
  `\\axtlead{6}\\leavevmode A unit with a display\\[x\\message{^^JLEAD-AFTER indisplay \\the\\baselineskip^^J}\\]that goes on\\message{^^JLEAD-UNIT afterdisplay \\the\\baselineskip^^J}.\\par`,
  `\\textbf{\\axtlines{5}\\axtlead{5}\\leavevmode A unit begun bold} goes on\\begin{align*}\\begin{split}a&=b\\\\&=c\\end{split}\\end{align*}and ends.\\par\\message{^^JLEAD-AFTER display \\the\\baselineskip^^J}`,
].join('\n\n')
const leadLog = tex('lead', `${LINES_TEX}${unitLeadTex(1.3)}\n\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n${leadBody}\n\\end{document}\n`)
const after = Object.fromEntries([...leadLog.matchAll(/^LEAD-AFTER (\w+) (\S+)/gm)].map(m => [m[1], m[2]]))
check('the paper\'s leading after a unit with a footnote, in a group, in a box, in and after a list that ends it, before a table and a display, and inside a display', ['footnote', 'group', 'box', 'initem', 'list', 'table', 'display', 'indisplay'].every(k => after[k] === '12.0pt'), JSON.stringify(after))
const unitAfter = leadLog.match(/^LEAD-UNIT afterdisplay ([\d.]+)pt$/m)
check('the unit\'s own leading after a display inside it: 1.3 × 10 pt', Math.abs(Number(unitAfter?.[1]) - 13) < 0.001, unitAfter?.[0])
check('line counts of the unit\'s own paragraph, not its footnote\'s or the list\'s', readLines(leadLog).get(0)?.lines === 1 && readLines(leadLog).get(3)?.lines === 1, JSON.stringify([...readLines(leadLog)]))
check('unit leading raises no TeX error', !/^! /m.test(leadLog), (leadLog.match(/^! .*/m) ?? [''])[0])
// the same inside a box, as framed.sty and tcolorbox set their contents: a unit whose paragraph a list ends, the list's
// own units, a unit after the list — each at 1.3 × 10 pt and the paper's leading after each, never 1.3 × 1.3 × …
// (RT-1's model card: the leading grew unit by unit, 13 pt to 43 pt, and the card ran off the page)
const boxedBody = `\\setbox0\\vbox{\\axtlines{10}\\axtlead{10}\\leavevmode A heading.\\begin{itemize}\\item\\axtlines{11}\\axtlead{11}\\leavevmode Item one.\\item\\axtlead{12}\\leavevmode Item two.\\end{itemize}\\message{^^JBOXED afterlist \\the\\baselineskip^^J}\\axtlines{13}\\axtlead{13}\\leavevmode Another heading\\message{^^JBOXED inunit \\the\\baselineskip^^J}.\\par\\message{^^JBOXED afterunit \\the\\baselineskip^^J}}\\box0`
const boxedLog = tex('lead-boxed', `${LINES_TEX}${unitLeadTex(1.3)}\n\\documentclass{article}\n\\begin{document}\n${boxedBody}\n\\end{document}\n`)
const boxed = Object.fromEntries([...boxedLog.matchAll(/^BOXED (\w+) (\S+)/gm)].map(m => [m[1], m[2]]))
check('in a box: the paper\'s leading after a list that ends a unit and after the next unit, the next at 1.3 × 10 pt', boxed.afterlist === '12.0pt' && Math.abs(parseFloat(boxed.inunit) - 13) < 0.001 && boxed.afterunit === '12.0pt', JSON.stringify(boxed))
check('in a box: line counts of each unit\'s own paragraph', readLines(boxedLog).get(10)?.lines === 1 && readLines(boxedLog).get(11)?.lines === 1 && readLines(boxedLog).get(13)?.lines === 1, JSON.stringify([...readLines(boxedLog)]))
check('in a box: no TeX error', !/^! /m.test(boxedLog), (boxedLog.match(/^! .*/m) ?? [''])[0])
// the fit: one factor for the paper, each unit nudged within its band
const fitted = fitLeads(new Map([[0, { hy: 100 }], [1, { hy: 100 }], [2, { hy: 100 }]]), new Map([[0, { hy: 90 }], [1, { hy: 80 }], [2, { hy: 100 }]]), new Map([[0, { lines: 5, bs: 15, size: 10 }], [1, { lines: 5, bs: 15, size: 10 }], [2, { lines: 5, bs: 15, size: 10 }], [3, { lines: 1, bs: 15, size: 10 }]]), { lo: 0.9, hi: 1.25, band: 0.08 })
check('fit: G the summed ratio, each unit within its band, one with no pair at G', Math.abs(fitted.g - 300 / 270) < 1e-9 && Math.abs(fitted.leads.get(1) - 1.5 * (300 / 270) * 1.08) < 1e-9 && Math.abs(fitted.leads.get(3) - 1.5 * (300 / 270)) < 1e-9, JSON.stringify([fitted.g, [...fitted.leads]]))
// the CJK fit's type: shared out within its ranges, what no knob can give left over
const base = { lead: 1.3, track: 0, scale: 1 }
const grow = cjkType(1.1, base), shrink = cjkType(0.9, base), far = cjkType(1.4, base)
check('CJK type: a translation 10 % short grows by leading and tracking, the scale kept', Math.abs(grow.reached - 1.1) < 1e-9 && grow.lead > 1.3 && grow.track > 0 && grow.scale === 1, JSON.stringify(grow))
check('CJK type: a translation 10 % long shrinks by leading and scale, no negative tracking', Math.abs(shrink.reached - 0.9) < 1e-9 && shrink.lead < 1.3 && shrink.scale < 1 && shrink.track === 0, JSON.stringify(shrink))
check('CJK type: past every range, each knob at its end and the rest left', Math.abs(far.lead - 1.45) < 1e-9 && Math.abs(far.track - 0.05) < 1e-9 && far.reached < 1.4, JSON.stringify(far))
check('lines read with their size', readLines('AXT-LINES 3 4 11.0pt 10.95\n').get(3)?.size === 10.95)
// a forced break — \\clearpage, \\newpage, a column ended by one in two columns — logged by the output routine, and the
// unit after it the next whose lines the log gives; LaTeX's own float passes (penalties below -10000) are not breaks
check('forced breaks read as the unit after each', JSON.stringify([...readForced('AXT-LINES 1 3 11.0pt 10\nAXT-FORCED\nAXT-FORCED\nAXT-LINES 2 1 11.0pt 10\nAXT-LINES 3 2 11.0pt 10\nAXT-FORCED\n')]) === '[2]')
const forcedLog = tex('forced', `${MARK_DEF}${LINES_TEX}\n\\documentclass[twocolumn]{article}\n\\usepackage{lipsum}\n\\begin{document}\n\\axtlines{1}\\lipsum[1]\n\n\\axtlines{2}\\lipsum[2]\n\n\\clearpage\n\\axtlines{3}\\lipsum[3]\n\n\\begin{figure}[t]\\centering\\rule{2cm}{9cm}\\caption{\\axtlines{4}A float.}\\end{figure}\n\\axtlines{5}\\lipsum[4-8]\n\n\\newpage\n\\axtlines{6}\\lipsum[9]\n\n\\end{document}\n`)
check('forced breaks in a compile: after \\clearpage and after a column ended by \\newpage, and nowhere a float or a full column took', JSON.stringify([...readForced(forcedLog)]) === '[3,6]', JSON.stringify([...readForced(forcedLog)]))
// a unit set smaller: its own paragraph at the factor, the size back after it; a caption measured in a box gets none
const sizes = shrinkSizes(new Map([[0, { hy: 90 }], [1, { hy: 90 }], [2, { hy: 100 }]]), new Map([[0, { hy: 100 }], [1, { hy: 200 }], [2, { hy: 90 }]]), new Map(), { min: 0.9 })
check('size factors: the square root of how much taller, down to the floor, none for a shorter unit', Math.abs(sizes.get(0) - Math.sqrt(0.9)) < 1e-9 && sizes.get(1) === 0.9 && !sizes.has(2), JSON.stringify([...sizes]))
const sizeLog = tex('size', `\\makeatletter\\expandafter\\def\\csname axtsize@7\\endcsname{0.9}\\expandafter\\def\\csname axtsize@8\\endcsname{0.9}\\makeatother${LINES_TEX}${SIZE_TEX}${unitLeadTex(1.3)}\n\\documentclass{article}\n\\begin{document}\n\\makeatletter\n\\axtsize{7}\\axtlead{7}\\leavevmode A smaller unit with a note.\\footnote{A note.}\\message{^^JSIZE-IN \\f@size^^J}\\par\\message{^^JSIZE-AFTER \\f@size^^J}\n\\sbox0{\\axtsize{7}A caption measured.}\\leavevmode Plain.\\par\\message{^^JSIZE-BOX \\f@size^^J}\n\\axtsize{7}\\leavevmode A unit a list ends.\\begin{itemize}\\item\\message{^^JSIZE-ITEM \\f@size^^J}Item text.\\item\\axtsize{8}\\leavevmode A unit in the list.\\par\\message{^^JSIZE-INLIST \\f@size^^J}\\end{itemize}\\message{^^JSIZE-LIST \\f@size^^J}\n\\end{document}\n`)
const sz = k => sizeLog.match(new RegExp(`^SIZE-${k} (\\S+)`, 'm'))?.[1]
check('a unit set smaller: 9 pt inside, 10 pt after, and after a box', sz('IN') === '9' && sz('AFTER') === '10' && sz('BOX') === '10', JSON.stringify([sz('IN'), sz('AFTER'), sz('BOX')]))
check('a list opened right after a smaller unit: its items at 10 pt, a unit in it back to 10 after, 10 after the list (2608.02785)', sz('ITEM') === '10' && sz('INLIST') === '10' && sz('LIST') === '10', JSON.stringify([sz('ITEM'), sz('INLIST'), sz('LIST')]))
check('unit size raises no TeX error', !/^! /m.test(sizeLog), (sizeLog.match(/^! .*/m) ?? [''])[0])
const sizeBoxLog = tex('size-boxed', `\\makeatletter\\expandafter\\def\\csname axtsize@7\\endcsname{0.9}\\makeatother${LINES_TEX}${SIZE_TEX}${unitLeadTex(1.3)}\n\\documentclass{article}\n\\begin{document}\n\\makeatletter\n\\setbox0\\vbox{\\axtsize{7}\\leavevmode A unit a list ends.\\begin{itemize}\\item Item text.\\end{itemize}\\message{^^JSIZE-BOXLIST \\f@size^^J}Plain.\\par\\message{^^JSIZE-BOXAFTER \\f@size^^J}}\\box0\n\\end{document}\n`)
const szb = k => sizeBoxLog.match(new RegExp(`^SIZE-${k} (\\S+)`, 'm'))?.[1]
check('in a box: 10 pt after a list that ends a smaller unit, and after the next paragraph', szb('BOXLIST') === '10' && szb('BOXAFTER') === '10', JSON.stringify([szb('BOXLIST'), szb('BOXAFTER')]))
// what a unit set smaller hands back, and the size the next one starts from, where the paper's own smaller sizes are
// the size a unit was set at: article's \small is 9 pt, 0.9 of its 10; its \footnotesize 8 pt, 0.8 of it
const typeLog = tex('size-type', `\\makeatletter\\expandafter\\def\\csname axtsize@7\\endcsname{0.9}\\expandafter\\def\\csname axtsize@8\\endcsname{0.9}\\expandafter\\def\\csname axtsize@9\\endcsname{0.8}\\expandafter\\def\\csname axtsize@10\\endcsname{0.8}\\makeatother${LINES_TEX}${SIZE_TEX}${unitLeadTex(1.3)}\n\\documentclass{article}\n\\begin{document}\n\\makeatletter\n`
  + `\\axtsize{7}\\axtlead{7}\\leavevmode A smaller unit.\\par\\message{^^JTYPE-AFTER \\f@size\\space\\the\\baselineskip^^J}\n`
  + `{\\small\\axtsize{8}\\axtlead{8}\\leavevmode A smaller unit in the paper's small type.\\message{^^JTYPE-SMALLIN \\f@size^^J}\\par\\message{^^JTYPE-SMALLAFTER \\f@size\\space\\the\\baselineskip^^J}}\n`
  + `\\axtsize{9}\\axtlead{9}\\leavevmode A unit with a note.\\footnote{\\axtsize{10}\\axtlead{10}A note that is a unit.\\message{^^JTYPE-NOTE \\f@size^^J}}\\message{^^JTYPE-BODY \\f@size^^J}\\par\n`
  + `\\axtsize{7}\\axtlead{7}\\leavevmode A unit with a box \\parbox{5cm}{\\axtsize{8}\\axtlead{8}A unit in the box.\\message{^^JTYPE-INBOX \\f@size^^J}\\par} and on.\\message{^^JTYPE-OUTBOX \\f@size^^J}\\par\\message{^^JTYPE-LAST \\f@size\\space\\the\\baselineskip^^J}\n`
  + `\\end{document}\n`)
const ty = k => typeLog.match(new RegExp(`^TYPE-${k} (.+)$`, 'm'))?.[1]
check('after a unit set smaller at its own leading: the paper\'s 10 pt on 12 pt, and the references after it (2608.05876 in Russian)', ty('AFTER') === '10 12.0pt' && ty('LAST') === '10 12.0pt', JSON.stringify([ty('AFTER'), ty('LAST')]))
check('a unit in the paper\'s \\small once a unit set at 9 pt is over: 0.9 of its own 9 pt, and \\small\'s 9 pt on 11 pt after it', ty('SMALLIN') === '8.1' && ty('SMALLAFTER') === '9 11.0pt', JSON.stringify([ty('SMALLIN'), ty('SMALLAFTER')]))
check('a note that is a unit, in a unit set at the note size: 0.8 of the note\'s own 8 pt, the unit\'s 8 pt after it', ty('NOTE') === '6.4' && ty('BODY') === '8', JSON.stringify([ty('NOTE'), ty('BODY')]))
check('a unit begun inside one set smaller, the paper\'s size unchanged: 0.9 of the paper\'s 10 pt, not of 9', ty('INBOX') === '9' && ty('OUTBOX') === '9', JSON.stringify([ty('INBOX'), ty('OUTBOX')]))
check('unit type raises no TeX error', !/^! /m.test(typeLog), (typeLog.match(/^! .*/m) ?? [''])[0])
// a CJK unit set smaller (flowType's shrink) through the same size: xeCJK's face follows \fontsize, the CJK text in it
// 0.95 as wide, and the paper's size after it. Characters by code (^^^^6c49): this file stays ASCII
const cjkUnit = tex('size-cjk', `\\makeatletter\\expandafter\\def\\csname axtsize@7\\endcsname{0.95}\\makeatother${LINES_TEX}${SIZE_TEX}${unitLeadTex(1.3)}\n\\documentclass{article}\n\\usepackage{xeCJK}\n\\setCJKmainfont{FandolSong-Regular.otf}\n\\begin{document}\n\\makeatletter\n\\setbox2\\hbox{^^^^6c49^^^^5b57^^^^6c49^^^^5b57}\\message{^^JCJK-OUT \\the\\wd2^^J}\n\\axtsize{7}\\axtlead{7}\\leavevmode\\setbox2\\hbox{^^^^6c49^^^^5b57^^^^6c49^^^^5b57}\\message{^^JCJK-IN \\the\\wd2^^J}^^^^6c49^^^^5b57.\\par\\message{^^JCJK-AFTER \\f@size^^J}\n\\end{document}\n`, 'xelatex')
const cjkW = k => Number(cjkUnit.match(new RegExp(`^CJK-${k} ([\\d.]+)pt`, 'm'))?.[1])
check('a CJK unit set at 0.95: its CJK text 0.95 as wide, the paper\'s 10 pt after it', Math.abs(cjkW('IN') / cjkW('OUT') - 0.95) < 0.002 && cjkUnit.match(/^CJK-AFTER (\S+)/m)?.[1] === '10', `${cjkW('IN')} ${cjkW('OUT')} ${cjkUnit.match(/^CJK-AFTER (\S+)/m)?.[1]} ${(cjkUnit.match(/^! .*/m) ?? [''])[0]}`)
// a translated table no wider than the wider of the line and its original, the original's counters not counted twice
const fitBody = [
  `\\begin{minipage}{0.3\\textwidth}\\sbox0{\\axtfit{\\begin{tabular}{p{5cm}p{5cm}}A & B\\end{tabular}}{\\begin{tabular}{p{5cm}p{5cm}}C & D\\end{tabular}}}\\message{^^JFIT narrowbox \\the\\wd0 \\space\\the\\linewidth^^J}\\end{minipage}`,
  `\\sbox0{\\axtfit{\\begin{tabular}{l}${'Wide translated text '.repeat(12)}\\end{tabular}}{\\begin{tabular}{l}Narrow\\end{tabular}}}\\message{^^JFIT toline \\the\\wd0 \\space\\the\\linewidth^^J}`,
  `\\sbox0{\\axtfit{\\begin{tabular}{l}${'Wider translated text '.repeat(16)}\\end{tabular}}{\\begin{tabular}{l}${'Wide original '.repeat(14)}\\end{tabular}}}\\sbox2{\\begin{tabular}{l}${'Wide original '.repeat(14)}\\end{tabular}}\\message{^^JFIT tooriginal \\the\\wd0 \\space\\the\\wd2^^J}`,
  `\\newcounter{probe}\\sbox0{\\axtfit{\\begin{tabular}{l}\\stepcounter{probe}A\\end{tabular}}{\\begin{tabular}{l}\\stepcounter{probe}B\\end{tabular}}}\\message{^^JFIT counter \\the\\value{probe}^^J}`,
].join('\n\n')
const fitLog = tex('fit', `${FIT_DEF}\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n${fitBody}\n\\end{document}\n`)
const fw = k => fitLog.match(new RegExp(`^FIT ${k} (\\S+)pt (\\S+)pt`, 'm'))?.slice(1).map(Number)
const [nb, nl] = fw('narrowbox') ?? [], [tl, tlw] = fw('toline') ?? [], [to, tow] = fw('tooriginal') ?? []
check('a table as wide as its original, past a narrow box, is not scaled to the box (RT-1\'s model card)', nb > 280 && nl < 110, JSON.stringify([nb, nl]))
check('a translation wider than the line, its original not: scaled to the line', Math.abs(tl - tlw) < 0.01, JSON.stringify([tl, tlw]))
check('a translation wider than an original already past the line: scaled to the original', Math.abs(to - tow) < 0.01 && tow > 345, JSON.stringify([to, tow]))
check('the original, set only to be measured, counts nothing', fitLog.match(/^FIT counter (\d+)/m)?.[1] === '1', fitLog.match(/^FIT counter .*/m)?.[0])
check('fitted tables raise no TeX error', !/^! /m.test(fitLog), (fitLog.match(/^! .*/m) ?? [''])[0])
// a float the translation made taller than the page: set smaller to the page's height, not past its foot (RT-1's model card)
const floatLog = tex('float', `${NO_OVERFLOW}\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nText.\n\\begin{figure}[p]\\centering\\rule{2cm}{1.3\\textheight}\\caption{A tall one.}\\end{figure}\n\\begin{figure}\\centering\\rule{2cm}{3cm}\\caption{A short one.}\\end{figure}\n\\end{document}\n`)
check('a float taller than the page is set smaller, and only that one', (floatLog.match(/Float set smaller/g) ?? []).length === 1 && !/Float too large/.test(floatLog), (floatLog.match(/Float (set smaller|too large)[^\n]*/g) ?? []).join(' | '))
check('floats set smaller raise no TeX error', !/^! /m.test(floatLog), (floatLog.match(/^! .*/m) ?? [''])[0])
// H's rules: the padding before a unit is glue once the column has content, so that it goes at a break before the
// unit, and \vspace* at the top of an empty column; a column the translation ends early is filled to its original's
// height and broken without \vfil
const padLog = tex('pad', `${SYNC_TEX}\\documentclass{article}\n\\makeatletter\\axt@htrue\\def\\axt@t@a{{0}{1}{60pt}}\\def\\axt@t@b{{1}{1}{30pt}}\\expandafter\\def\\csname axt@c@0@1\\endcsname{200pt}\\makeatother\n\\begin{document}\nFirst line.\\par\n\\axtsync{a}\\message{^^JPAD glue \\the\\lastskip^^J}Second.\\par\n\\axtsync{b}\\message{^^JPAD top \\the\\lastskip\\space\\the\\pagetotal^^J}Third.\\par\n\\end{document}\n`)
const pad = k => padLog.match(new RegExp(`^PAD ${k} (\\S+)(?: (\\S+))?`, 'm'))
check('H: padding on a column with content is glue', parseFloat(pad('glue')?.[1]) > 40, pad('glue')?.[0])
check('H: a column ended early filled to its height, and the next unit\'s padding at its top kept', /AXT-BREAK 0/.test(padLog) && pad('top')?.[1] === '0.0pt', pad('top')?.[0])
check('H: no TeX error', !/^! /m.test(padLog), (padLog.match(/^! .*/m) ?? [''])[0])
// every role at the same type (plans/2026-09-30-generic-type.md, step 3): a translated table cell, heading or figure text
// set at the unit's size inside its own group — the cell, the heading — and the paper's size after it; a PDF bookmark
// keeps the heading's text alone
const rolesDoc = `${SIZE_TEX}\\makeatletter\\expandafter\\def\\csname axtsize@0\\endcsname{0.5}\\expandafter\\def\\csname axtsize@1\\endcsname{0.5}\\makeatother
\\documentclass{article}\\usepackage{hyperref}\\begin{document}\\makeatletter
\\section{\\axtsizein{0}\\texorpdfstring{\\message{^^JROLE-SIZE head \\f@size^^J}}{}Heading}\\message{^^JROLE-SIZE after-head \\f@size^^J}
\\begin{tabular}{l}\\axtsizein{1}\\message{^^JROLE-SIZE cell \\f@size^^J}Cell\\\\ Next\\message{^^JROLE-SIZE next-cell \\f@size^^J}\\end{tabular}\\message{^^JROLE-SIZE after-table \\f@size^^J}
\\makeatother\\end{document}\n`
const rolesLog = tex('roles', rolesDoc) + tex('roles', rolesDoc)
const roleSizes = [...rolesLog.matchAll(/^ROLE-SIZE (\S+) ([\d.]+)/gm)].reduce((m, x) => m.set(x[1], Number(x[2])), new Map())
check('a translated role at its unit\'s size, inside its group only', roleSizes.get('head') === 7.2 && roleSizes.get('after-head') === 10 && roleSizes.get('cell') === 5 && roleSizes.get('next-cell') === 10 && roleSizes.get('after-table') === 10, JSON.stringify([...roleSizes]))
// the bookmark as hyperref writes it (UTF-16, each character an escaped pair): a leaked {0} would read 0Heading
const bookmark = readFileSync(join(dir, 'roles.out'), 'latin1').replace(/\\000/g, '')
check('a sized heading raises no TeX error and keeps its bookmark text', !/^! /m.test(rolesLog) && !/Token not allowed in a PDF string/.test(rolesLog) && /\{(\\376\\377)?Heading\}/.test(bookmark), bookmark)
// the same through the pipeline: a paper with a booktabs table and a heading, every unit translated and sized, through
// lockedFiles and patch — a table cell's size goes after its row's rules (\toprule is \noalign, which must follow the
// row's end: before it, 2608.06701 stopped at "Misplaced \noalign")
const tablePaper = openPaper(new Map([['main.tex', latin1Bytes(String.raw`\documentclass{article}
\usepackage{booktabs}
\begin{document}
\section{A heading of the paper}
Some body text long enough to be a paragraph of the paper, with a second sentence after it.
\begin{table}[h]
\centering
\begin{tabular}{ll}
\toprule
Name & Value \\
\midrule
First row & one \\
\bottomrule
\end{tabular}
\caption{A caption for the table.}
\end{table}
\end{document}
`)]]))
const upper = new Map(tablePaper.units.map(u => [u, u.pieces.map(q => (q.t === 'text' ? { ...q, tr: true, s: q.s.toUpperCase() } : q))]))
const tableFiles = lockedFiles(tablePaper, upper, { strategy: strategiesFor(tablePaper.meta, 'de')[0], fonts: null, em: 1.05, theorems: [], sync: false, lead: '\\baselineskip', sizes: new Map(tablePaper.units.map((u, i) => [i, 0.8])) })
writeFileSync(join(dir, 'table.tex'), tableFiles.get('main.tex'))
const tableLog = tex('table', readFileSync(join(dir, 'table.tex'), 'latin1'))
check('sized cells, heading and caption through the pipeline: no TeX error', !/^! /m.test(tableLog) && tablePaper.units.some(u => u.kind === 'cell'), (tableLog.match(/^! .*/m) ?? [''])[0])
check('the sized roles are marked in the source', (readFileSync(join(dir, 'table.tex'), 'latin1').match(/\\axtsizein\{/g) ?? []).length >= 4)
// a table no taller than its original (the generic type, step 3): \axtfit with \axtfitheighttrue scales a translation
// that wraps to more lines down to the original's height — and with \axt@fitmin, never below that share of its width
const fitDoc = min => `${FIT_DEF}\\documentclass{article}\\usepackage{graphicx}\\begin{document}\\makeatletter\\axtfitheighttrue${min ? `\\def\\axt@fitmin{${min}}` : ''}
\\setbox0\\hbox{\\begin{tabular}{p{4cm}}Short text\\end{tabular}}\\message{^^JFIT orig \\the\\dimexpr\\ht0+\\dp0\\relax^^J}
\\setbox2\\hbox{\\begin{tabular}{p{4cm}}${'Long translated text '.repeat(6)}\\end{tabular}}\\message{^^JFIT natural \\the\\dimexpr\\ht2+\\dp2\\relax\\space\\the\\wd2^^J}
\\setbox4\\hbox{\\axtfit{\\begin{tabular}{p{4cm}}${'Long translated text '.repeat(6)}\\end{tabular}}{\\begin{tabular}{p{4cm}}Short text\\end{tabular}}}\\message{^^JFIT fitted \\the\\dimexpr\\ht4+\\dp4\\relax\\space\\the\\wd4^^J}
\\makeatother\\end{document}\n`
const fitRead = log => Object.fromEntries([...log.matchAll(/^FIT (\w+) ([\d.]+)pt(?: ([\d.]+)pt)?/gm)].map(m => [m[1], { h: Number(m[2]), w: Number(m[3] ?? 0) }]))
const capped = fitRead(tex('fitcap', fitDoc(0)))
check('a table that grew is set no taller than its original', capped.fitted.h <= capped.orig.h + 0.5 && capped.natural.h > capped.orig.h * 2, JSON.stringify(capped))
const floored = fitRead(tex('fitmin', fitDoc(0.9)))
check('never below the floor\'s share of its width', floored.fitted.w >= 0.9 * floored.natural.w - 0.5 && floored.fitted.h > floored.orig.h, JSON.stringify(floored))
// a translation narrower than its original keeps the original's width, the table in its middle: whatever the paper
// scales the table by — adjustbox's max width, a \resizebox to the line — it scales the translation by alike. A
// narrower Japanese Table 9 of 2608.15761 escaped the 0.95 its original was scaled by and stood 5.6 % larger
const WIDE_ORIG = `\\begin{tabular}{l}${'A wide original column '.repeat(5)}\\end{tabular}`
const keptDoc = `${FIT_DEF}\\documentclass{article}\\usepackage{graphicx}\\usepackage{adjustbox}\\begin{document}\\makeatletter
\\setbox0\\hbox{\\axtfit{\\begin{tabular}{l}Narrow translation\\end{tabular}}{\\begin{tabular}{l}${'A wider original '.repeat(3)}\\end{tabular}}}\\setbox2\\hbox{\\begin{tabular}{l}${'A wider original '.repeat(3)}\\end{tabular}}\\message{^^JKEPT width \\the\\wd0 \\space\\the\\wd2^^J}
\\setbox4\\hbox{\\begin{adjustbox}{max width=\\linewidth}${WIDE_ORIG}\\end{adjustbox}}\\setbox6\\hbox{\\begin{adjustbox}{max width=\\linewidth}\\axtfit{\\begin{tabular}{l}Narrow translation\\end{tabular}}{${WIDE_ORIG}}\\end{adjustbox}}\\message{^^JKEPT scaled \\the\\wd6 \\space\\the\\wd4^^J}
\\setbox8\\hbox{\\resizebox{\\linewidth}{!}{\\axtfit{\\begin{tabular}{l}Narrow translation\\end{tabular}}{\\begin{tabular}{l}${'A wider original '.repeat(3)}\\end{tabular}}}}\\setbox9\\hbox{\\resizebox{\\linewidth}{!}{\\begin{tabular}{l}Narrow translation\\end{tabular}}}\\message{^^JKEPT line \\the\\ht8 \\space\\the\\ht9^^J}
\\makeatother\\end{document}\n`
const keptLog = tex('fitkept', keptDoc)
const kept = k => keptLog.match(new RegExp(`^KEPT ${k} (\\S+)pt (\\S+)pt`, 'm'))?.slice(1).map(Number)
const [kw, kow] = kept('width') ?? [], [ks, kos] = kept('scaled') ?? [], [kl, knl] = kept('line') ?? []
check('a narrower translation keeps its original\'s width', Math.abs(kw - kow) < 0.01, JSON.stringify([kw, kow]))
check('scaled by the paper as its original was: adjustbox\'s max width', Math.abs(ks - kos) < 0.01, JSON.stringify([ks, kos]))
check('and a \\resizebox to the line: no taller than the original would be, far less than the narrow table alone', kl < 0.6 * knl, JSON.stringify([kl, knl]))
// in a float's vertical list after \centering and a \label (2608.21180's Table 3), the kept width goes into a paragraph
// as the table did, so that \centering centres it: a bare \hbox there sat at the left margin, 80 pt off its original
const centredLog = tex('fitcentred', `${FIT_DEF}\\documentclass{article}\\usepackage{graphicx}\\begin{document}\\makeatletter
\\setbox0\\vbox{\\hsize=300pt\\centering\\axtfit{\\begin{tabular}{l}Narrow\\end{tabular}}{\\begin{tabular}{l}${'A wider original '.repeat(2)}\\end{tabular}}\\message{^^JCENTRED \\ifhmode paragraph\\else vertical\\fi^^J}\\par}
\\makeatother\\end{document}\n`)
check('a kept width joins a paragraph, where \\centering centres it', /^CENTRED paragraph/m.test(centredLog), (centredLog.match(/^CENTRED .*/m) ?? [''])[0])
check('kept widths raise no TeX error', !/^! /m.test(keptLog), (keptLog.match(/^! .*/m) ?? [''])[0])
// a table set to a width (tabular*) whose translation is wider than that width: set at its natural width and scaled
// to the width it had, not run past the column (Japanese Table 1 of 2608.05876 ran 38 pt into the next column); one
// that fits keeps its width and its spread columns
const STAR = '@{}l@{\\extracolsep{\\fill}}rr@{}'
const starDoc = `${FIT_DEF}\\documentclass{article}\\usepackage{graphicx}\\begin{document}\\makeatletter
\\setbox0\\hbox{\\axtfit{\\axtstar\\begin{tabular*}{\\linewidth}{${STAR}}${'Very wide translated heading '.repeat(3)} & 1 & 2 \\\\ Row & 3 & 4\\axtstarbody\\end{tabular*}}{\\begin{tabular*}{\\linewidth}{${STAR}}Heading & 1 & 2 \\\\ Row & 3 & 4\\end{tabular*}}}\\message{^^JSTAR wide \\the\\wd0 \\space\\the\\linewidth^^J}
\\setbox2\\hbox{\\axtfit{\\axtstar\\begin{tabular*}{\\linewidth}{${STAR}}Short & 1 & 2\\axtstarbody\\end{tabular*}}{\\begin{tabular*}{\\linewidth}{${STAR}}Heading & 1 & 2\\end{tabular*}}}\\message{^^JSTAR fits \\the\\wd2 \\space\\the\\linewidth^^J}
\\newcounter{probe}\\setbox4\\hbox{\\axtfit{\\axtstar\\begin{tabular*}{\\linewidth}{${STAR}}\\stepcounter{probe}A & 1 & 2\\axtstarbody\\end{tabular*}}{\\begin{tabular*}{\\linewidth}{${STAR}}B & 1 & 2\\end{tabular*}}}\\message{^^JSTAR counter \\the\\value{probe}^^J}
\\makeatother\\end{document}\n`
const starLog = tex('fitstar', starDoc)
const star = k => starLog.match(new RegExp(`^STAR ${k} (\\S+)pt (\\S+)pt`, 'm'))?.slice(1).map(Number)
const [sw, slw] = star('wide') ?? [], [sf, sfl] = star('fits') ?? []
check('a tabular* wider than its width once translated: scaled to that width, not past it', Math.abs(sw - slw) < 0.01 && !/Overfull \\hbox[^\n]*in alignment/.test(starLog), JSON.stringify([sw, slw, (starLog.match(/Overfull \\hbox[^\n]*/) ?? [''])[0]]))
check('a tabular* that fits keeps its width', Math.abs(sf - sfl) < 0.01, JSON.stringify([sf, sfl]))
check('a tabular* measured once counts once', starLog.match(/^STAR counter (\d+)/m)?.[1] === '1', starLog.match(/^STAR counter .*/m)?.[0])
check('fitted tabular* raises no TeX error', !/^! /m.test(starLog), (starLog.match(/^! .*/m) ?? [''])[0])
// a translated line of names in a box that does not wrap (IEEEtran's author block, article's \author: a tabular's c
// column) wider than the line: set as a paragraph of the line's width, centred, its lines broken. Japanese names ran
// 126 pt past 2608.06701's page. One that fits is as it was
const wideDoc = `${FIT_DEF}\\documentclass{article}\\begin{document}\\makeatletter
\\setbox0\\hbox{\\begin{tabular}[t]{@{}c@{}}\\axtwide{${'Alice Example\\textsuperscript{1}, '.repeat(9)}and Bob Example\\textsuperscript{2}}\\\\ Somewhere\\end{tabular}}\\message{^^JWIDE long \\the\\wd0 \\space\\the\\linewidth\\space\\the\\dimexpr\\ht0+\\dp0\\relax^^J}
\\setbox2\\hbox{\\begin{tabular}[t]{@{}c@{}}\\axtwide{Alice Example, Bob Example}\\\\ Somewhere\\end{tabular}}\\setbox4\\hbox{\\begin{tabular}[t]{@{}c@{}}Alice Example, Bob Example\\\\ Somewhere\\end{tabular}}\\message{^^JWIDE short \\the\\wd2 \\space\\the\\wd4^^J}
\\newcounter{probe}\\setbox6\\hbox{\\begin{tabular}{c}\\axtwide{\\stepcounter{probe}${'Name '.repeat(90)}}\\end{tabular}}\\message{^^JWIDE counter \\the\\value{probe}^^J}
\\par\\axtwide{A name in running text stays as it is.}
\\makeatother\\end{document}\n`
const wideLog = tex('wide', wideDoc)
const wide = k => wideLog.match(new RegExp(`^WIDE ${k} (\\S+)pt (\\S+)pt`, 'm'))?.slice(1).map(Number)
const [ww, wlw] = wide('long') ?? [], [ws, wso] = wide('short') ?? []
check('a line of names wider than the line, in a box that does not wrap: broken within the line', ww <= wlw + 0.01 && !/Overfull \\hbox/.test(wideLog), JSON.stringify([ww, wlw, (wideLog.match(/Overfull \\hbox[^\n]*/) ?? [''])[0]]))
check('a line of names that fits is as it was', Math.abs(ws - wso) < 0.01, JSON.stringify([ws, wso]))
check('names measured once count once', wideLog.match(/^WIDE counter (\d+)/m)?.[1] === '1', wideLog.match(/^WIDE counter .*/m)?.[0])
check('wide names raise no TeX error', !/^! /m.test(wideLog), (wideLog.match(/^! .*/m) ?? [''])[0])
// a float waits for its original's page and column (FLOAT_TEX): a figure the translation reaches a page early is held
// until the page the original set it on, a column early until that column; one already there goes as LaTeX would;
// \clearpage still sends every float out, and a float is never held more than two pages
const para = n => `${'Words of a paragraph that fills the page. '.repeat(40)}\\par\n`.repeat(n)
const floatDoc = cols => `\\documentclass${cols === 2 ? '[twocolumn]' : ''}{article}\\usepackage[paperheight=6in,paperwidth=5in,margin=0.5in]{geometry}
${FLOAT_TEX}\\makeatletter\\expandafter\\def\\csname axt@fp@1\\endcsname{2 0}\\expandafter\\def\\csname axt@fp@2\\endcsname{1 0}\\expandafter\\def\\csname axt@fp@3\\endcsname{9 0}\\expandafter\\def\\csname axt@fp@4\\endcsname{${cols === 2 ? '1 1' : '1 0'}}\\makeatother
\\begin{document}
Start.
\\begin{figure}[t]\\centering\\rule{2cm}{1cm}\\caption{\\axtfloatat{1}\\leavevmode\\axtmark{1s}Held to page two.}\\end{figure}
\\begin{table}[t]\\centering\\rule{2cm}{1cm}\\caption{\\axtfloatat{2}\\leavevmode\\axtmark{2s}Already on its page.}\\end{table}
${cols === 2 ? '\\begin{table}[t]\\centering\\rule{2cm}{1cm}\\caption{\\axtfloatat{4}\\leavevmode\\axtmark{4s}Held to the right column.}\\end{table}' : ''}
${para(1)}
\\begin{table}[t]\\centering\\rule{2cm}{1cm}\\caption{\\axtfloatat{3}\\leavevmode\\axtmark{3s}Far ahead, not held.}\\end{table}
${para(4)}
\\end{document}
`
const MARKS = `\\protected\\def\\axtmark#1{\\pdfdest name{axt-#1} xyz\\relax}\n`
const floatPages = async (name, cols) => { tex(name, MARKS + floatDoc(cols)); return marksOf(join(dir, `${name}.pdf`)) }
const f1 = await floatPages('float1', 1)
const pg = (m, k) => m.marks.get(`${k}s`)?.page, colOf = (m, k) => (m.marks.get(`${k}s`)?.x >= m.width / 2 ? 1 : 0)
check('a float held to its original\'s page', pg(f1, 1) === 1, JSON.stringify([...f1.marks]))
check('a float of another kind already on its page goes as LaTeX would', pg(f1, 2) === 0, JSON.stringify([pg(f1, 2)]))
check('a float whose page is more than two ahead is not held', pg(f1, 3) <= 1, JSON.stringify([pg(f1, 3)]))
const f2 = await floatPages('float2', 2)
check('in two columns, a float held to its original\'s column', pg(f2, 4) === 0 && colOf(f2, 4) === 1 && pg(f2, 1) === 1, JSON.stringify([...f2.marks]))
const clearLog = tex('floatclear', MARKS + floatDoc(1).replace(`${para(1)}\n\\begin{table}`, '\\clearpage\n\\leavevmode\\axtmark{9s}After the break.\n\\begin{table}'))
const fc = await marksOf(join(dir, 'floatclear.pdf'))
check('\\clearpage sends a held float out before the text after the break', pg(fc, 1) < pg(fc, 9) && !/^! /m.test(clearLog), JSON.stringify([...fc.marks]))
// a class that sets its own \@floatboxreset inside each float environment (IEEEtran: \def\table{\def\@floatboxreset{…}
// \@float{table}}): the float is held all the same (2608.06701's tables went a page early)
const ieeeFloats = String.raw`\makeatletter\def\table{\def\@floatboxreset{\reset@font\footnotesize\@setminipage}\@float{table}}\def\endtable{\end@float}\def\figure{\def\@floatboxreset{\reset@font\normalsize\@setminipage}\@float{figure}}\def\endfigure{\end@float}\makeatother`
tex('floatieee', MARKS + floatDoc(1).replace('\\begin{document}', `${ieeeFloats}\n\\begin{document}`))
const fi = await marksOf(join(dir, 'floatieee.pdf'))
check('held when the class sets its own \\@floatboxreset in each float', pg(fi, 1) === 1, JSON.stringify([...fi.marks]))
// a caption outside a float (\captionof in a minipage) notes nothing: the float after it goes as LaTeX would
const capofDoc = `\\documentclass{article}\\usepackage{caption}${FLOAT_TEX}\\makeatletter\\expandafter\\def\\csname axt@fp@5\\endcsname{2 0}\\makeatother
\\begin{document}\\begin{minipage}{\\linewidth}\\centering\\rule{2cm}{1cm}\\captionof{figure}{\\axtfloatat{5}Not a float.}\\end{minipage}
\\begin{figure}[t]\\centering\\rule{2cm}{1cm}\\caption{\\leavevmode\\axtmark{6s}A float with no note of its own.}\\end{figure}
${para(3)}\\end{document}
`
const capofLog = tex('capof', MARKS + capofDoc)
const co = await marksOf(join(dir, 'capof.pdf'))
check('a caption outside a float holds no float, and raises no TeX error', pg(co, 6) === 0 && !/^! /m.test(capofLog), JSON.stringify([...co.marks, (capofLog.match(/^! .*/m) ?? [''])[0]]))
check('held floats raise no TeX error', !/^! /m.test(tex('float1', MARKS + floatDoc(1)) + tex('float2', MARKS + floatDoc(2))))
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
