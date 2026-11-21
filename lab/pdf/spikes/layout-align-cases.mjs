// lab/pdf/spikes/layout-align-cases.mjs
// The alignment probe under TeX (src/pdf-reader/engine/layout/marks.mjs LAYOUT_TEX's AXT-ALIGN, read by readAlign): small
// documents, each unit's start and end mark set by hand after MARK_DEF and LAYOUT_TEX as the marked original sets them, compiled
// in each pinned TeX Live year's image under pdfLaTeX, XeLaTeX and LuaLaTeX, and each unit's reading held to how TeX set its
// paragraph. The cases are the constructs that end a paragraph: its own \par (a footnote's \endgraf, \parbox's \@@par, a
// minipage, a list, center, a centring group closed before its blank line), and a box's close, which TeX Live 2023's LaTeX ends
// with no \par (it sets no \partokencontext): elsarticle's abstract, a \vbox and a \vtop of no \par, the mark in a group or an
// environment inside the box, a box inside a paragraph, a marginal note; and 1,000 paragraphs, 700 of them in two environments
// that span them, for TeX's save stack (the run's maximum is printed). Exit 1 on a reading that is not TeX's or a TeX error.
//   pnpm exec tsx lab/pdf/spikes/layout-align-cases.mjs [--engine=<worktree>] [--years=2023,2025] [--out=<dir>]
// --engine reads MARK_DEF, LAYOUT_TEX and readAlign from another worktree's engine (next's, to see what it read). Docker with the
// years' pinned images (lab/pdf/compile-images.json); no network.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkCompileImage, compileImageRef } from './compile-image.mjs'

const arg = name => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null }
const ROOT = resolve(arg('engine') ?? join(import.meta.dirname, '../../..'))
const E = f => import(pathToFileURL(join(ROOT, 'src/pdf-reader/engine', f)).href)
const { MARK_DEF } = await E('source/latex-front.mjs')
const { LAYOUT_TEX, readAlign } = await E('layout/marks.mjs')
const YEARS = (arg('years') ?? '2023,2025').split(',')
const ENGINES = ['pdflatex', 'xelatex', 'lualatex']
const OUT = resolve(arg('out') ?? join(tmpdir(), `layout-align-cases-${process.pid}`))

const words = n => Array.from({ length: n }, (_, i) => ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'][i % 8]).join(' ')
/** a unit of n words between its two marks */
const u = (i, n = 40) => `\\axtmark{${i}s}${words(n)}\\axtmark{${i}e}`
const doc = (cls, pre, body) => `\\documentclass{${cls}}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const all = (from, n, code) => Object.fromEntries(Array.from({ length: n }, (_, k) => [from + k, code]))

/** each case: its document, and the alignment TeX set each unit's paragraph by */
const CASES = {
  elsarticle: [doc('elsarticle', '', `\\begin{frontmatter}\\title{T}\\author{A}\n\\begin{abstract}\n${u(1, 80)}\n\\end{abstract}\n\\begin{keyword}\n${u(2, 30)}\n\\end{keyword}\n\\end{frontmatter}\n${u(3)}\n`), { 1: 'j', 2: 'l', 3: 'j' }],
  boxes: [doc('article', '', [
    `\\setbox0=\\vbox{\\hsize=200pt ${u(4)}}`,
    `{\\raggedright ${u(5)}\\par}`,
    `\\setbox0=\\vbox{\\hsize=200pt {\\itshape ${u(6)}}}`,
    `\\begin{flushright}${u(7)}\\end{flushright}`,
    `\\setbox0=\\vtop{\\hsize=200pt \\raggedleft ${u(8)}}`,
    `{\\centering ${u(9)}\\par}`,
    `\\setbox0=\\vbox{\\hsize=200pt \\begin{small}${u(10)}\\end{small}}`,
    `{\\raggedright ${u(11)}\\par}`,
  ].join('\n\n')), { 4: 'j', 5: 'l', 6: 'j', 7: 'r', 8: 'r', 9: 'c', 10: 'j', 11: 'l' }],
  inner: [doc('article', '', `{\\raggedright ${words(10)} \\vbox{\\hsize 3cm \\raggedleft ${u(12, 12)}} ${u(13)}\\par}\n\n${words(30)} \\marginpar{\\raggedright ${u(14, 10)}} ${u(15)}\n`), { 12: 'r', 13: 'l', 14: 'l', 15: 'j' }],
  ended: [doc('article', '\\usepackage{xcolor}', [
    `{\\raggedright ${words(10)}\\footnote{${u(16, 20)}} ${u(17)}\\par}`,
    `\\parbox{5cm}{\\raggedright ${u(18, 20)}}`,
    `\\begin{minipage}{5cm}\\raggedleft ${u(19, 20)}\\end{minipage}`,
    `\\begin{itemize}\\item ${u(20, 20)}\\item ${u(21, 20)}\\end{itemize}`,
    `{\\centering ${u(22)}}\n`,
    `{\\bfseries ${u(23)}}\\par`,
    `\\begin{center}${u(24)}\\end{center}`,
  ].join('\n\n')), { 16: 'j', 17: 'l', 18: 'l', 19: 'r', 20: 'j', 21: 'j', 22: 'j', 23: 'j', 24: 'c' }],
  long: [doc('article', '\\usepackage{multicol}', `\\begin{multicols}{2}\n${Array.from({ length: 400 }, (_, k) => u(100 + k, 12)).join('\n\n')}\n\\end{multicols}\n\\begin{quote}\n${Array.from({ length: 300 }, (_, k) => u(600 + k, 12)).join('\n\n')}\n\\end{quote}\n${Array.from({ length: 300 }, (_, k) => u(1000 + k, 12)).join('\n\n')}\n`), { ...all(100, 400, 'j'), ...all(600, 300, 'j'), ...all(1000, 300, 'j') }],
}

let bad = 0
for (const year of YEARS) {
  const image = compileImageRef(process.env, year)
  await checkCompileImage(image, [])
  const dir = join(OUT, year)
  rmSync(dir, { recursive: true, force: true })
  for (const e of ENGINES) for (const [name, [src]] of Object.entries(CASES)) {
    mkdirSync(join(dir, `${e}-${name}`), { recursive: true })
    writeFileSync(join(dir, `${e}-${name}`, 'main.tex'), `${MARK_DEF}${LAYOUT_TEX}\n\\tracingstats=1 ${src}`)
  }
  // (two passes each, as a paper's marked original gets; the date fixed, so that two probes' PDFs can be compared byte for byte)
  writeFileSync(join(dir, 'run.sh'), `${ENGINES.map(e => `for d in ${e}-*/; do (cd "$d" && ${e} -interaction=nonstopmode main.tex >/dev/null 2>&1; ${e} -interaction=nonstopmode main.tex >/dev/null 2>&1); done`).join('\n')}\n`)
  execFileSync('docker', ['run', '--rm', '--network', 'none', '-e', 'SOURCE_DATE_EPOCH=1700000000', '-e', 'FORCE_SOURCE_DATE=1', '-v', `${dir}:/work`, '-w', '/work', image, 'sh', 'run.sh'], { stdio: 'ignore', timeout: 1_200_000 })
  for (const e of ENGINES) for (const [name, [, want]] of Object.entries(CASES)) {
    const log = join(dir, `${e}-${name}`, 'main.log')
    if (!existsSync(log)) { console.log(`FAIL ${year} ${e} ${name}: no log`); bad++; continue }
    const text = readFileSync(log, 'latin1')
    const got = Object.fromEntries(readAlign(text))
    const wrong = Object.entries(want).filter(([i, c]) => got[i] !== c).map(([i, c]) => `${i}: ${got[i] ?? 'none'} (TeX ${c})`)
    const errors = (text.match(/^! .*$/gm) ?? []).slice(0, 3)
    const save = /(\d+)s stack positions/.exec(text)?.[1] ?? '?'
    if (wrong.length || errors.length) bad++
    console.log(`${wrong.length || errors.length ? 'FAIL' : 'ok  '} ${year} ${e} ${name}${wrong.length ? `: ${wrong.slice(0, 8).join('; ')}${wrong.length > 8 ? ` (${wrong.length})` : ''}` : ''}${errors.length ? `; TeX: ${errors.join(' | ')}` : ''} (save stack ${save})`)
  }
}
console.log(`the documents and their logs: ${OUT}`)
process.exit(bad ? 1 : 0)
