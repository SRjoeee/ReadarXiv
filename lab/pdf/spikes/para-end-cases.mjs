// lab/pdf/spikes/para-end-cases.mjs
// The marked compile's paragraph ends (src/pdf-reader/engine/layout/marks.mjs, the para/end point `qe<n><code>`) under TeX: a
// small document compiled in Docker (the image of compile-image.mjs; NATIVE_TEX=1 this machine's TeX Live, as
// layout-marks-cases.mjs does), as the run marks it (live.mjs originalFiles with the layout marks, after the mark probe), and
// the same with no mark (v0): every text item where v0 has it, and a paragraph end stated before the first glyph of every
// paragraph that follows another, whatever node the paragraph before ends in (docs/PDF-READER.md §18.66): a footnote's mark
// under hyperref's colour links (its link end and the colour stack's pop are the list's last nodes, whatsits), a plain
// \href, a citation, a full stop. Exits non-zero on a failure.
//   pnpm exec tsx lab/pdf/spikes/para-end-cases.mjs     (KEEP=1 keeps the compiles' folder)
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pageInk } from '@readarxiv/engine'
import { MARK_CLASSES, probeSamples, readMarkProbe } from '../../../src/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles, probeFiles } from '../../../src/pdf-reader/engine/pipeline/live.mjs'
import { checkCompileImage, COMPILE_IMAGE, PLATFORM } from './compile-image.mjs'

await checkCompileImage()
const NATIVE = process.env.NATIVE_TEX === '1'
const dir = mkdtempSync(join(tmpdir(), 'para-end-cases-'))
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`)
}

// (each paragraph after the first opens with a letter of its own, A to F, so that its first glyph is found by it)
const SRC = String.raw`\documentclass{article}
\usepackage[colorlinks]{hyperref}
\begin{document}
Zero paragraph that ends with a footnote's mark.~\footnote{The note's own text.}
\medbreak
\noindent
\textbf{A} The paragraph after a footnote, run in.

Then one that ends with a plain link \href{https://example.org}{here}
\medbreak
\noindent
\textbf{B} The paragraph after a link, run in.

Then one that ends with a citation \cite{k}

C opens the paragraph after a citation.

Then one that ends with a full stop.

D opens the paragraph after a full stop.
\begin{thebibliography}{9}\bibitem{k} The cited work.\end{thebibliography}
\end{document}
`
const OPENS = ['AThe', 'BThe', 'Copens', 'Dopens']

function compile(jobs) {
  const script = jobs
    .map((j) => `cd ${NATIVE ? dir : '/work'}/${j.name} && for i in ${Array.from({ length: j.passes }, (_, k) => k + 1).join(' ')}; do pdflatex -interaction=nonstopmode main.tex >> term.txt 2>&1; done`)
    .join('\n')
  writeFileSync(join(dir, 'run.sh'), `${script}\n`)
  if (NATIVE) {
    const env = { ...process.env, PATH: `${process.env.NATIVE_TEX_BIN ?? join(process.env.HOME ?? '', 'Library/TinyTeX/bin/universal-darwin')}:/usr/bin:/bin`, ...(process.env.NATIVE_TEXMFLOCAL ? { TEXMFLOCAL: process.env.NATIVE_TEXMFLOCAL } : {}) }
    try {
      execFileSync('sh', [join(dir, 'run.sh')], { cwd: dir, env, stdio: 'ignore', timeout: 600_000 })
    } catch {}
    return
  }
  try {
    execFileSync('docker', ['run', ...PLATFORM, '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', COMPILE_IMAGE, 'sh', 'run.sh'], { stdio: 'ignore', timeout: 600_000 })
  } catch {}
}
const write = (name, files) => {
  mkdirSync(join(dir, name), { recursive: true })
  for (const [path, bytes] of files) writeFileSync(join(dir, name, path), bytes)
}
const read = (name, ext) => {
  try {
    return readFileSync(join(dir, name, `main.${ext}`))
  } catch {
    return null
  }
}

const files = new Map([['main.tex', new TextEncoder().encode(SRC)]])
const paper = openPaper(files)
write('probe', [...files, ...probeFiles(paper, { marks: true })])
compile([{ name: 'probe', passes: 1 }])
const switches = readMarkProbe(read('probe', 'log')?.toString('latin1') ?? '', probeSamples(paper.units))
write('v0', [...files, ...originalFiles(paper, { lines: true, transcode: false })])
write('v1', [...files, ...originalFiles(paper, { lines: true, layout: MARK_CLASSES, switches })])
compile([
  { name: 'v0', passes: 2 },
  { name: 'v1', passes: 2 },
])

async function inkOf(name) {
  const bytes = read(name, 'pdf')
  if (!bytes?.length) return null
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  const pdf = await task.promise
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const pg = await pdf.getPage(n)
    pages.push(pageInk(OPS, await pg.getOperatorList(), pg.commonObjs, { rotate: pg.rotate }))
  }
  await task.destroy()
  return pages
}
const a = await inkOf('v0')
const b = await inkOf('v1')
check('both compiles made', !!a && !!b, `v0 ${!!a}, v1 ${!!b}`)
if (a && b) {
  // (every glyph of v0 where v1 has it: the points move no text)
  const ga = a.flatMap((p) => p.glyphs.filter((g) => !g.blank)),
    gb = b.flatMap((p) => p.glyphs.filter((g) => !g.blank))
  const off = ga.filter((g, k) => !gb[k] || gb[k].u !== g.u || Math.abs(gb[k].x0 - g.x0) > 0.001 || Math.abs(gb[k].y - g.y) > 0.001)
  check('the marks move no glyph', ga.length === gb.length && off.length === 0, `${ga.length} / ${gb.length} glyphs, ${off.length} moved`)
  const pg = b[0]
  const ends = new Set((pg.paraEnds ?? []).map((e) => e.glyph))
  // (the paragraph's first glyph: where its first characters, blanks aside, begin)
  const inked = pg.glyphs.map((g, k) => [g.u, k]).filter(([u]) => /\S/.test(u))
  const text = inked.map(([u]) => u).join('')
  for (const w of OPENS) {
    const i = text.indexOf(w)
    const at = i >= 0 ? inked[i][1] : -1
    check(`a paragraph end stated before the paragraph that opens with "${w}"`, at >= 0 && ends.has(at), `glyph ${at}, ends ${[...ends].join(',')}`)
  }
}
if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
else console.log(`kept: ${dir}`)
console.log(failed ? `${failed} failed` : 'all ok')
process.exit(failed ? 1 : 0)
