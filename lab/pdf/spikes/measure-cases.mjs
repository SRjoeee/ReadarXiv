// lab/pdf/spikes/measure-cases.mjs
// Each paragraph's measure and each forced break's point the rebuilt prepare's marked compile states (packages/engine/src/marks/
// marks.ts STATEMENTS_TEX's MEASURE_TEX, `AXT-MEASURE` at LaTeX's para/end, read by marks/channels.ts readMeasures and placed by
// locate/measures.ts lineShape; and BREAKS_TEX's point `kb<n>` after \@gnewline's \unskip, kept apart by pageInk, `breaks`) under
// TeX: small documents of our own, compiled in each pinned TeX Live year's image under pdfLaTeX, XeLaTeX, LuaLaTeX and latex (its
// DVI made a PDF by dvipdfmx, with the DVI marks), with the marked original's head as today's reader writes it (MARK_DEF,
// LAYOUT_TEX, LINES_TEX: `base`) and with STATEMENTS_TEX after LAYOUT_TEX (`new`). Held: (1) no glyph, box or point of the base
// moves (each glyph's character, advance, baseline and size and each box's edges to 0.001 pt, LuaTeX's to 0.011, POINTS_TEX's
// accepted bound; every point of the base's the same, at its place), the new compile's other points the forced breaks' alone;
// (2) no TeX error of ours; (3) each statement read is TeX's own placement: of every paragraph it states, in a column or text
// block whose width is its \hsize (as the part places it), each full line TeX justified (every line but its last) stands from
// the measure's left edge (the first line's start aside: its indent box's, or a list's label hung left of it) to its right edge,
// to 0.02 pt (the frame's two edges stated to a hundredth each), glyph by glyph as pageInk reads them; under latex, whose PDF's
// glyphs dvipdfmx places by its own reckoning (layout-marks-cases.mjs's DVI note), the statements equal pdfLaTeX's of the same
// document, line for line, the PDF's deviation reported; (4) each forced break's point stands right after the last glyph of the line TeX ended there (the word the
// document writes before each `\\`), and a `\\` of a centred block or a table's row sets none. Exit 1 on a failure.
//   pnpm exec tsx lab/pdf/spikes/measure-cases.mjs [--years=2023,2025] [--engines=…] [--only=<case>,…] [--out=<dir>]
// Docker with the years' pinned images (lab/pdf/compile-images.json); no network.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pageInk } from '@readarxiv/engine'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { LINES_TEX } from '../../../packages/engine/src/compile/tex.ts'
import { lineShape } from '../../../packages/engine/src/locate/measures.ts'
import { framesOf, readMeasures } from '../../../packages/engine/src/marks/channels.ts'
import { DVI_LAYOUT_TEX, LAYOUT_TEX, STATEMENTS_TEX } from '../../../packages/engine/src/marks/marks.ts'
import { DVI_MARK_DEF, MARK_DEF } from '../../../packages/engine/src/source/latex-front.ts'
import { checkCompileImage, compileImageRef } from './compile-image.mjs'

const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : null
}
const YEARS = (arg('years') ?? '2023,2025').split(',')
const ENGINES = (arg('engines') ?? 'pdflatex,xelatex,lualatex,latex').split(',')
const OUT = resolve(arg('out') ?? join(tmpdir(), `measure-cases-${process.pid}`))

const WORDS = 'we show that the considerably larger model of a results in an experimental setting is'.split(' ')
/** prose of n words, long enough to fill several justified lines */
const prose = (n, k = 0) => Array.from({ length: n }, (_, i) => WORDS[(i * 7 + k) % WORDS.length]).join(' ')
/** the paragraphs whose measure TeX sets otherwise than its frame, and the ones it does not */
const MEASURES = [
  prose(80),
  `\\begin{itemize}\\item ${prose(60, 1)}\\item ${prose(50, 2)}\\begin{enumerate}\\item ${prose(60, 3)}\\end{enumerate}\\end{itemize}`,
  `\\begin{quote}${prose(70, 4)}\\end{quote}`,
  `\\begin{description}\\item[Term] ${prose(60, 5)}\\end{description}`,
  `{\\hangindent=2em \\hangafter=1 ${prose(70, 6)}\\par}`,
  `{\\hangindent=-3em \\hangafter=-2 ${prose(70, 7)}\\par}`,
  `{\\leftskip=2em \\rightskip=1em ${prose(70, 8)}\\par}`,
  `\\noindent\\begin{minipage}{0.6\\linewidth}${prose(50, 9)}\\end{minipage}`,
  `\\begin{wrapfigure}{r}{0.35\\linewidth}\\centering\\rule{2cm}{3cm}\\end{wrapfigure}${prose(160, 10)}`,
  `\\begin{thebibliography}{9}\\bibitem{a} ${prose(40, 11)}\\bibitem{b} ${prose(40, 12)}\\end{thebibliography}`,
].join('\n\n')
/** the forced breaks: each `\\` and each `\break` ending a paragraph's line after a word of its own (Qa, Qb, …), the point to
 *  stand right after its last glyph; those of a centred block and of a table's row set none, nor a `\break` that ends no line of
 *  a paragraph (Zt, Zu) */
const BREAKS = [
  `${prose(30)} Qa\\\\ \\indent ${prose(20, 1)} Qb\\\\[2pt] ${prose(20, 2)} Qc\\\\* ${prose(20, 3)} Qd\\newline ${prose(20, 4)}`,
  `${prose(12, 5)} Qe\\\\`,
  `\\parbox{6cm}{${prose(8, 6)} Qf\\\\ ${prose(8, 7)}}`,
  `\\begin{center}${prose(6, 8)} Zz\\\\ ${prose(6, 9)}\\end{center}`,
  `\\begin{tabular}{l}${prose(3)} Zy\\\\ ${prose(3, 1)}\\end{tabular}`,
  `\\section{A title Qg\\\\ in two lines}${prose(20, 10)}`,
  // (LaTeX's \break where it ends a line in a paragraph: after an \hfill (amsart's addresses), in a \vbox's paragraph, inside a
  // macro's argument, in a p column's cell; none in an \hbox, in an l column's cell, between paragraphs, in a formula)
  `${prose(10, 11)} Qh\\hfill\\break ${prose(10, 12)} \\hbox{${prose(2, 13)} Zu\\break ${prose(2, 14)}} ${prose(6, 15)}`,
  `\\vbox{\\hsize=6cm ${prose(8, 16)} Qi\\break ${prose(8, 17)}}`,
  `${prose(10, 18)} \\textbf{${prose(2, 19)} Qk\\break ${prose(2, 20)}} ${prose(6, 21)}\\par\\break ${prose(6, 22)}`,
  `\\begin{tabular}{lp{4cm}}${prose(2, 23)} Zt\\break ${prose(2, 24)} & ${prose(6, 25)} Ql\\break ${prose(4, 26)}\\end{tabular}`,
  `${prose(4, 27)} $x\\break y$ ${prose(4, 28)}`,
].join('\n\n')
const WANT_BREAKS = ['Qa', 'Qb', 'Qc', 'Qd', 'Qe', 'Qf', 'Qg', 'Qh', 'Qi', 'Qk', 'Ql']
const doc = (cls, pre, body) => `${cls}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const CASES = {
  measures: doc('\\documentclass{article}', '\\usepackage{wrapfig}', MEASURES),
  twocolumn: doc('\\documentclass[twocolumn]{article}', '\\usepackage{wrapfig}', MEASURES),
  breaks: doc('\\documentclass{article}', '', BREAKS),
}
if (arg('only')) for (const k of Object.keys(CASES)) if (!arg('only').split(',').includes(k)) delete CASES[k]
const headOf = (e, statements) =>
  `${MARK_DEF}${e === 'latex' ? DVI_MARK_DEF : ''}${LAYOUT_TEX}${e === 'latex' ? DVI_LAYOUT_TEX : ''}${statements ? STATEMENTS_TEX : ''}${LINES_TEX}`

/** a PDF's pages as pageInk reads them */
async function inkOf(file) {
  if (!existsSync(file)) return null
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 })
  const pdf = await task.promise
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const pg = await pdf.getPage(n)
    pages.push({ ...pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate }), view: pg.view })
  }
  await task.destroy()
  return pages
}
/** the base's and the new compile's pages: equal glyphs, boxes and points, the new one's forced breaks its only other points */
function sameInk(A, B, e) {
  if (A.length !== B.length) return { why: `${A.length} pages, ${B.length}` }
  const tol = e === 'lualatex' ? 0.011 : 0.001
  let split = 0
  for (let p = 0; p < A.length; p++) {
    const a = A[p]
    const b = B[p]
    if (a.glyphs.length !== b.glyphs.length || a.boxes.length !== b.boxes.length) return { why: `page ${p + 1}: ${a.glyphs.length}/${b.glyphs.length} glyphs` }
    // (under dvipdfmx, xdvipdfmx's and latex's, a glyph of the text run an added point splits, on the baseline of the point's
    // next glyph, may stand up to 0.02 pt off: the writer places it anew, absolutely, where the base reached it by a TJ kern;
    // layout-cell-cases.mjs sameInk's bound, reported)
    const splitBy = (g) => {
      let last = null
      for (const q of b.breaks ?? []) if (q.glyph <= g) last = q
      return !!last && last.glyph < b.glyphs.length && Math.abs(b.glyphs[last.glyph].y - b.glyphs[g].y) < 0.001
    }
    for (let g = 0; g < a.glyphs.length; g++) {
      const x = a.glyphs[g]
      const y = b.glyphs[g]
      if (x.u !== y.u) return { why: `page ${p + 1} glyph ${g}: ${x.u}/${y.u}` }
      const d = Math.max(Math.abs(x.x0 - y.x0), Math.abs(x.x1 - y.x1), Math.abs(x.y - y.y), Math.abs(x.size - y.size))
      if (d > tol && (e === 'xelatex' || e === 'latex') && d <= 0.02 && splitBy(g)) split = Math.max(split, d)
      else if (d > tol) return { why: `page ${p + 1} glyph ${g} moved ${d.toFixed(4)} pt` }
    }
    for (let i = 0; i < a.boxes.length; i++) if (Math.abs(a.boxes[i] - b.boxes[i]) > tol) return { why: `page ${p + 1} a box moved` }
    const key = (q) => `${q.name}|${q.glyph}|${q.box}`
    if (a.points.map(key).join(',') !== b.points.map(key).join(',')) return { why: `page ${p + 1}: the points differ` }
    if ((a.paraEnds ?? []).map(key).join(',') !== (b.paraEnds ?? []).map(key).join(',')) return { why: `page ${p + 1}: the paragraph ends differ` }
    if ((a.breaks ?? []).length) return { why: `page ${p + 1}: a forced break's point in the base` }
  }
  return { why: null, split }
}

let bad = 0
const counts = {}
for (const year of YEARS) {
  const image = compileImageRef(process.env, year)
  await checkCompileImage(image, [])
  const dir = join(OUT, year)
  rmSync(dir, { recursive: true, force: true })
  for (const h of ['base', 'new'])
    for (const e of ENGINES)
      for (const [name, src] of Object.entries(CASES)) {
        mkdirSync(join(dir, `${h}-${e}-${name}`), { recursive: true })
        writeFileSync(join(dir, `${h}-${e}-${name}`, 'main.tex'), `${headOf(e, h === 'new')}${src}`)
      }
  const pass = (e) =>
    `timeout 120 ${e} -interaction=nonstopmode main.tex >/dev/null 2>&1${e === 'latex' ? '; dvipdfmx -q main.dvi >/dev/null 2>&1' : ''}`
  writeFileSync(join(dir, 'run.sh'), `${ENGINES.map((e) => `for d in *-${e}-*/; do (cd "$d" && ${pass(e)}; ${pass(e)}); done`).join('\n')}\ntrue\n`)
  execFileSync(
    'docker',
    ['run', '--rm', '--network', 'none', '-e', 'SOURCE_DATE_EPOCH=1700000000', '-e', 'FORCE_SOURCE_DATE=1', '-v', `${dir}:/work`, '-w', '/work', image, 'sh', 'run.sh'],
    { stdio: 'ignore', timeout: 3_600_000 },
  )
  for (const e of ENGINES)
    for (const name of Object.keys(CASES)) {
      const at = join(dir, `new-${e}-${name}`)
      const base = join(dir, `base-${e}-${name}`)
      const faults = []
      const notes = []
      const log = existsSync(join(at, 'main.log')) ? readFileSync(join(at, 'main.log'), 'latin1') : ''
      const baseLog = existsSync(join(base, 'main.log')) ? readFileSync(join(base, 'main.log'), 'latin1') : ''
      const errors = (log.match(/^! .*$/gm) ?? []).slice(0, 3)
      if (errors.join('|') !== (baseLog.match(/^! .*$/gm) ?? []).slice(0, 3).join('|')) faults.push(`TeX: ${errors.join(' | ')}`)
      else if (errors.length) notes.push(`the base's own errors too: ${errors[0]}`)
      const A = await inkOf(join(base, 'main.pdf'))
      const B = await inkOf(join(at, 'main.pdf'))
      if (!A || !B) faults.push('no PDF')
      else {
        const r = sameInk(A, B, e)
        if (r.why) faults.push(`INK: ${r.why}`)
        else if (r.split) notes.push(`a run a point splits placed anew by the writer, ${r.split.toFixed(4)} pt`)
      }
      let checked = 0
      let stated = 0
      let worst = 0
      if (B && name !== 'breaks') {
        // (3) each stated paragraph's full lines against its measure as the part places it
        const measures = readMeasures(log)
        const frames = framesOf(B.map((pg) => ({ points: pg.points, view: pg.view })), log)
        // (each paragraph end's place: its page and glyph count, by serial; the paragraph's glyphs from the end before it)
        const ends = []
        B.forEach((pg, p) => {
          for (const x of pg.paraEnds ?? []) ends.push({ p, g: x.glyph, n: Number(/^qe(\d+)/.exec(x.name)[1]) })
        })
        ends.sort((x, y) => x.p - y.p || x.g - y.g)
        ends.forEach((end, k) => {
          const s = measures.get(end.n)
          if (!s) return
          const prev = ends[k - 1]
          const pg = B[end.p]
          const from = prev && prev.p === end.p ? prev.g : 0
          const gs = pg.glyphs.slice(from, end.g).filter((g) => /\S/.test(g.u) && !g.blank)
          if (!gs.length) return
          // (its lines in TeX's order: the glyphs in stream order, a line each change of baseline: a paragraph runs from a column
          // into the next)
          const rows = []
          for (const g of gs) {
            const r = rows.at(-1)
            if (r && Math.abs(r.y - g.y) < 0.05) r.gs.push(g)
            else rows.push({ y: g.y, gs: [g] })
          }
          const f = frames[end.p]
          if (!f || prev?.p !== end.p) return
          // (each line's column: the one whose width is the paragraph's \hsize and that holds the line, else the block of that
          // width; the frame's edges stated to a hundredth each)
          const colOf = (r) => {
            const x0 = Math.min(...r.gs.map((g) => g.x0))
            const x1 = Math.max(...r.gs.map((g) => g.x1))
            return (
              f.columns.find((c) => Math.abs(c[1] - c[0] - s.hsize) <= 0.02 && x1 > c[0] && x0 < c[1]) ??
              (Math.abs(f.block[1] - f.block[0] - s.hsize) <= 0.02 ? f.block : undefined)
            )
          }
          if (!colOf(rows[0])) return
          stated++
          // (the frame's two edges stated to a hundredth each: 0.02 pt. Under latex the PDF's glyphs are dvipdfmx's, which draws a
          // glyph with no special before it by its own reckoning, off TeX's place (layout-marks-cases.mjs's DVI note): there the
          // statements are held equal to pdfLaTeX's of the same document below, and the PDF's deviation is reported)
          const tol = e === 'latex' ? Number.POSITIVE_INFINITY : 0.02
          rows.slice(0, -1).forEach((r, i) => {
            const col = colOf(r)
            if (!col) return
            const [indent, length] = lineShape(s, i + 1)
            const m0 = col[0] + indent + s.leftskip
            const m1 = col[0] + indent + length - s.rightskip
            const l0 = Math.min(...r.gs.map((g) => g.x0))
            const l1 = Math.max(...r.gs.map((g) => g.x1))
            // (the first line's start is its indent box's or its label's, which a list hangs left of the measure: its end alone)
            const left = i === 0 || Math.abs(l0 - m0) <= tol
            if (!left || Math.abs(l1 - m1) > tol)
              faults.push(`qe${end.n} line ${i + 1}: [${l0.toFixed(2)}, ${l1.toFixed(2)}] against [${m0.toFixed(2)}, ${m1.toFixed(2)}]`)
            worst = Math.max(worst, Math.abs(l1 - m1), i === 0 ? 0 : Math.abs(l0 - m0))
            checked++
          })
        })
        if (!stated) faults.push('no paragraph stated a measure')
        if (e === 'latex') {
          // (TeX's statements under latex: those of pdfLaTeX's compile of the same document, line for line)
          const pdf = join(dir, `new-pdflatex-${name}`, 'main.log')
          if (!existsSync(pdf)) notes.push('no pdfLaTeX compile to hold the statements to')
          else {
            const other = readMeasures(readFileSync(pdf, 'latin1'))
            const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)
            if (!same([...measures], [...other])) faults.push(`the statements differ from pdfLaTeX's (${measures.size} / ${other.size})`)
            else notes.push(`${measures.size} statements pdfLaTeX's; the PDF's lines dvipdfmx's, up to ${worst.toFixed(3)} pt off them`)
          }
        }
      }
      let points = 0
      if (B && name === 'breaks') {
        // (4) each forced break's point right after the word before its `\\`, in order; none in a centred block or a table
        const got = []
        B.forEach((pg) => {
          for (const k of pg.breaks ?? []) {
            const before = pg.glyphs.slice(0, k.glyph).filter((g) => /\S/.test(g.u)).slice(-2).map((g) => g.u).join('')
            got.push(before)
          }
        })
        points = got.length
        if (got.join(',') !== WANT_BREAKS.join(',')) faults.push(`breaks after ${got.join(',')}, TeX's ${WANT_BREAKS.join(',')}`)
      }
      counts[`${year} ${e}`] ??= { ok: 0, fail: 0 }
      counts[`${year} ${e}`][faults.length ? 'fail' : 'ok']++
      if (faults.length) bad++
      console.log(
        `${faults.length ? 'FAIL' : 'ok  '} ${year} ${e} ${name}: ${name === 'breaks' ? `${points} forced breaks' points` : `${stated} paragraphs placed, ${checked} full lines on their measure (the largest deviation ${worst.toFixed(3)} pt)`}${notes.length ? `; ${notes.join('; ')}` : ''}${faults.length ? `; ${faults.slice(0, 6).join('; ')}${faults.length > 6 ? ` (+${faults.length - 6})` : ''}` : ''}`,
      )
    }
}
for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v.ok} ok, ${v.fail} FAIL`)
console.log(`the documents and their logs: ${OUT}`)
process.exit(bad ? 1 : 0)
