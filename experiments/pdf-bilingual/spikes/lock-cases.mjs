// experiments/pdf-bilingual/spikes/lock-cases.mjs
// Cases for lock.mjs: the log readers, heights, the leading of units that grew, and the TeX itself — a two-column
// document whose translation is shorter must start every unit on the page and in the column the original did, with a
// run-in \paragraph head and a list among the units. Exits non-zero on a failure.
//   node experiments/pdf-bilingual/spikes/lock-cases.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FIT_DEF, MARK_DEF, NO_OVERFLOW } from '../../../src/pdf-reader/engine/latex-front.mjs'
import { cjkType, fitLeads, heights, LINES_TEX, marksOf, readLines, readLockEvents, readTargets, shrinkSizes, SIZE_TEX, SYNC_TEX, tightenedLeads, unitLeadTex } from './lock.mjs'

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
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
