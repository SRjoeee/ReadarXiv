// experiments/pdf-bilingual/spikes/line-env-cases.mjs
// Environments TeX reads line by line (src/pdf-reader/engine/latex-front.mjs LINE_ENVS) under TeX: small papers, each
// with every kind — comment.sty's own and the paper's (\excludecomment, \specialcomment, a class's), the kernel's and
// verbatim.sty's verbatim, fancyvrb's, listings' (and their environments of the paper's own), a table holding a hidden
// row — a paragraph after each, compiled natively in Docker as the gates compile (latexmk -f in nonstop mode for every
// pass, the engine once for a draft): the marked original with its line probes, and a Chinese translation as the rule
// sets it, draft and final. 2608.16117's `\end{comment}\axtlines{14}` kept its comment open: the marked original
// stopped, the translation's XeTeX gave the pages before it. Exits non-zero on a failure.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/line-env-cases.mjs
//   ENGINE=<another tree's src/pdf-reader/engine> … — that engine's files, on the same cases (a version before the fix)
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { hostedFontsDockerArgs } from './faithful.mjs'
// the faces the TeX page's tree serves beside TeX Live's (Source Han Serif, URW's base 35: faithful.mjs)
const HOSTED = hostedFontsDockerArgs(new URL('../data/fonts', import.meta.url).pathname)

const ENGINE = resolve(process.env.ENGINE ?? new URL('../../../src/pdf-reader/engine', import.meta.url).pathname)
const { openPaper, originalFiles, translationFiles } = await import(join(ENGINE, 'live.mjs'))
const { strategiesFor } = await import(join(ENGINE, 'scripts.mjs'))
const { marksOf: marksOfPdf } = await import(join(ENGINE, 'typeset/places.mjs'))
const { readLines, typesetting } = await import(join(ENGINE, 'typeset/tex.mjs'))
const { DESIGN } = await import(join(ENGINE, 'typeset/type.mjs'))

let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`) }
const enc = s => new TextEncoder().encode(s)
const root = mkdtempSync(join(tmpdir(), 'line-env-cases-'))
let n = 0
/** a compile as the gates make it: every pass (latexmk -f, nonstop), or the engine once; the log, the PDF if any */
function compile(files, overrides, { engine = 'pdflatex', full = true } = {}) {
  const dir = join(root, `c${++n}`)
  for (const [p, b] of [...files, ...overrides]) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
  const cmd = full ? ['latexmk', engine === 'xelatex' ? '-xelatex' : '-pdf', '-interaction=nonstopmode', '-f', 'main.tex'] : [engine, '-interaction=nonstopmode', 'main.tex']
  try { execFileSync('docker', ['run', '--rm', '--init', '--network', 'none', ...HOSTED, '-v', `${dir}:/work`, '-w', '/work', 'texlive/texlive:latest', 'timeout', '300', ...cmd], { stdio: 'ignore' }) } catch {}
  const read = (f, how) => { try { return readFileSync(join(dir, f), how) } catch { return null } }
  // a draft under XeTeX writes the xdv alone when asked once; its stop or its end is in the log either way
  return { log: read('main.log', 'latin1') ?? '', pdf: read('main.pdf') }
}
const marksOf = async pdf => { const task = getDocument({ data: new Uint8Array(pdf), verbosity: 0 }); try { return await marksOfPdf(await task.promise) } finally { await task.destroy() } }
/** the PDF's text, TeX's quotes as the source writes them; CJK through PDF.js's character maps */
const PDFJS = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))
const textOf = async pdf => {
  const task = getDocument({ data: new Uint8Array(pdf), verbosity: 0, cMapUrl: join(PDFJS, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(PDFJS, 'standard_fonts/') })
  try { const doc = await task.promise; let out = ''; for (let p = 1; p <= doc.numPages; p++) out += (await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join(' ') + '\n'; return out.replace(/\u2019/g, "'") } finally { await task.destroy() }
}
const STOP = /^(?:! Emergency stop\.|! TeX capacity exceeded|\(That makes 100 errors)/m
const firstError = log => (log.match(/^! .*$/m) ?? [''])[0]
const dropped = log => (log.match(/Characters dropped after/g) ?? []).length

const PREAMBLE = String.raw`\documentclass{paperclass}
\usepackage{comment}\usepackage{fancyvrb}\usepackage{listings}
\excludecomment{hidden}
\specialcomment{boxed}{\begingroup\itshape}{\endgroup}
\lstnewenvironment{code}{}{}
\DefineVerbatimEnvironment{MyVerbatim}{Verbatim}{}`
const BODY = String.raw`A paragraph before the comment, with words enough to fill a line of the page and more.
\begin{comment}
Hidden words.
\end{comment}
The paragraph after the comment.

\begin{verbatim}
x = 1
\end{verbatim}
   The paragraph after verbatim, indented.

\begin{verbatim*}
y = 2
\end{verbatim*}
The paragraph after a starred verbatim.

\begin{lstlisting}
z = 3
\end{lstlisting}
\textbf{Label.} The paragraph after a listing, begun bold.

\begin{Verbatim}
w = 4
\end{Verbatim}
The paragraph after fancyvrb.

\begin{hidden}
Excluded words.
\end{hidden}
The paragraph after an excluded comment of the paper's own.

\begin{boxed}
The paragraph inside a special comment.

\end{boxed}

\begin{code}
v = 5
\end{code}
The paragraph after a listing environment of the paper's own.

\begin{MyVerbatim}
u = 6
\end{MyVerbatim}
The paragraph after a verbatim environment of the paper's own.

\begin{CCSXML}
<ccs2012/>
\end{CCSXML}
The paragraph after the class's comment.

\begin{tabular}{l}
A cell of the table.\\
\begin{comment}
A row hidden.\\
\end{comment}
Another cell of the table.\\
\end{tabular}

The paragraph after the table.`
const AFTER = ['The paragraph after the comment.', 'The paragraph after verbatim, indented.', 'The paragraph after a starred verbatim.', 'The paragraph after a listing, begun bold.', 'The paragraph after fancyvrb.', "The paragraph after an excluded comment of the paper's own.", 'The paragraph inside a special comment.', "The paragraph after a listing environment of the paper's own.", "The paragraph after a verbatim environment of the paper's own.", "The paragraph after the class's comment.", 'The paragraph after the table.']
// the class a paper ships, defining a comment of its own (acmart's \excludecomment{CCSXML})
const CLASS = '\\LoadClass{article}\n\\RequirePackage{comment}\n\\excludecomment{CCSXML}\n'
const files = new Map([['main.tex', enc(`${PREAMBLE}\n\\begin{document}\n${BODY}\n\\end{document}\n`)], ['paperclass.cls', enc(CLASS)]])
const paper = openPaper(files)
const units = paper.units
const indexOf = words => units.findIndex(u => u.pieces.some(p => p.t === 'text' && p.s.includes(words.replace(/\.$/, ''))))
const after = AFTER.map(indexOf)
check('the cases are units', after.every(i => i >= 0), JSON.stringify(after))

// the paper's own compile, unmarked: what the marked one must match
const plain = compile(files, new Map())
const plainText = plain.pdf ? (await textOf(plain.pdf)).replace(/\s+/g, ' ') : ''
check('the paper compiles as it is, every paragraph after its environment set', !!plain.pdf && !STOP.test(plain.log) && AFTER.every(w => plainText.includes(w)), firstError(plain.log))

// the marked original with its line probes, as the reader compiles it
const orig = compile(files, originalFiles(paper, { lines: true }))
check('the marked original reaches its end', !!orig.pdf && !STOP.test(orig.log), firstError(orig.log))
check('nothing of ours dropped after an environment\'s end', dropped(orig.log) === dropped(plain.log), `${dropped(orig.log)} against the paper's ${dropped(plain.log)}`)
const lines = readLines(orig.log)
check('every paragraph after an environment has its line probe', after.every(i => lines.has(i)), JSON.stringify(after.filter(i => !lines.has(i))))
const om = orig.pdf ? await marksOf(orig.pdf) : null
check('every paragraph after an environment has its marks on the page', !!om && after.every(i => om.marks.has(`${i}s`) && om.marks.has(`${i}e`)), JSON.stringify(after.filter(i => !om?.marks.has(`${i}s`))))
const origText = orig.pdf ? (await textOf(orig.pdf)).replace(/\s+/g, ' ') : ''
check('the marked original sets every paragraph the paper does', AFTER.every(w => origText.includes(w)), JSON.stringify(AFTER.filter(w => !origText.includes(w))))

// a Chinese translation as the rule sets it: every unit's float, line probe, size and leading before its start mark
const [xe] = strategiesFor(paper.meta, 'zh')
// each text translated, the unit's leading and trailing space kept as pieces of their own, as mt.mjs rehydrate keeps them
const translated = new Map(units.map((u, i) => [u, u.pieces.flatMap((p, k) => {
  if (p.t !== 'text' || !/\S/.test(p.s)) return [p]
  const lead = k === 0 ? p.s.match(/^\s*/)[0] : '', trail = k === u.pieces.length - 1 ? p.s.match(/\s*$/)[0] : ''
  return [...(lead ? [{ t: 'text', s: lead }] : []), { ...p, tr: true, s: `\u8bd1\u6587${i}` }, ...(trail ? [{ t: 'text', s: trail }] : [])]
})]))
const all = new Map(units.map((_, i) => [i, 1.1]))
const typeset = typesetting(units, { design: DESIGN.Hans, strategy: xe.name, type: { lead: 1.35, track: 0, scale: 1 }, leads: all, sizes: new Map(all), floatsAt: new Map(), tableMin: 0.85 })
const draft = compile(files, translationFiles(paper, translated, { strategy: xe, fonts: null, draft: true, typeset }), { engine: 'xelatex', full: false })
check('the translation\'s draft reaches its end', !STOP.test(draft.log) && /AXT-END/.test(draft.log), firstError(draft.log))
check('every translated paragraph after an environment has its line probe', after.every(i => readLines(draft.log).has(i)), JSON.stringify(after.filter(i => !readLines(draft.log).has(i))))
const final = compile(files, translationFiles(paper, translated, { strategy: xe, fonts: null, draft: false, typeset: typeset.final }), { engine: 'xelatex' })
const finalText = final.pdf ? (await textOf(final.pdf)).replace(/\s+/g, '') : ''
check('the translation\'s final reaches its end, every paragraph after an environment set', !!final.pdf && !STOP.test(final.log) && after.every(i => finalText.includes(`\u8bd1\u6587${i}`)), firstError(final.log) || JSON.stringify(after.filter(i => !finalText.includes(`\u8bd1\u6587${i}`))))

// verbatim.sty's verbatim and comment (it redefines both): what follows their \end on its line is dropped, a probe with it
const vfiles = new Map([['main.tex', enc(String.raw`\documentclass{article}
\usepackage{verbatim}
\begin{document}
A paragraph before.
\begin{verbatim}
x = 1
\end{verbatim}
The paragraph after verbatim.sty's verbatim.

\begin{comment}
Hidden.
\end{comment}
The paragraph after verbatim.sty's comment.
\end{document}
`)]])
const vpaper = openPaper(vfiles), vplain = compile(vfiles, new Map()), vorig = compile(vfiles, originalFiles(vpaper, { lines: true }))
const vafter = ["verbatim.sty's verbatim", "verbatim.sty's comment"].map(w => vpaper.units.findIndex(u => u.pieces.some(p => p.t === 'text' && p.s.includes(w))))
check('verbatim.sty: the marked original drops nothing the paper does not, and every probe is read', !!vorig.pdf && !STOP.test(vorig.log) && dropped(vorig.log) === dropped(vplain.log) && vafter.every(i => readLines(vorig.log).has(i)), `${dropped(vorig.log)} dropped, probes ${JSON.stringify(vafter.filter(i => !readLines(vorig.log).has(i)))}`)

// a table holding a hidden row, alone: fitted (FIT_DEF's \axtfit), it went into an argument, where comment.sty cannot
// read its lines
const tfiles = new Map([['main.tex', enc(String.raw`\documentclass{article}
\usepackage{comment}
\begin{document}
\begin{tabular}{l}
A cell of the table.\\
\begin{comment}
A row hidden.\\
\end{comment}
Another cell of the table.\\
\end{tabular}

The paragraph after the table.
\end{document}
`)]])
const tpaper = openPaper(tfiles)
const ttranslated = new Map(tpaper.units.map((u, i) => [u, u.pieces.map(p => (p.t === 'text' && /\S/.test(p.s) ? { ...p, tr: true, s: `${p.s.match(/^\s*/)[0]}\u8bd1\u6587${i}${p.s.match(/\s*$/)[0]}` } : p))]))
const tfinal = compile(tfiles, translationFiles(tpaper, ttranslated, { strategy: xe, fonts: null, draft: false }), { engine: 'xelatex' })
const ttext = tfinal.pdf ? (await textOf(tfinal.pdf)).replace(/\s+/g, '') : ''
check('a translated table holding a hidden row: set with no TeX error, every cell and the paragraph after it', !!tfinal.pdf && !/^! /m.test(tfinal.log) && tpaper.units.every((_, i) => ttext.includes(`\u8bd1\u6587${i}`)), firstError(tfinal.log))

console.log(failed ? `${failed} failed` : 'all passed', `(${root})`)
process.exit(failed ? 1 : 0)
