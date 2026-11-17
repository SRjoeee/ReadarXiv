// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { markedOfPaper } from '../../packages/engine/src/compile/paper.ts'
import { openPaper } from '../../packages/engine/src/compile/live.ts'
import { compileImageRef } from '../../lab/pdf/spikes/compile-image.mjs'

// "The marks do not move the page": a marked original as the layout compile makes it (markedOfPaper: the probe, its answers to
// the marking, the marked compile), against the paper compiled as it is, in the pinned TeX Live image, offline: every text item
// of the two PDFs at the same place, its text the same. Each document holds a shape where a mark could move a line — a word's
// suffix after a macro (its hyphenation), a macro whose body ends in an argument (\xspace in it), a citation or a footnote in a
// macro (cite's superscripts and fnpct move the punctuation), a kern after a macro's last letter, a box or a formula glued to a
// word (TeX hyphenates no word a box follows, and one a mark's whatsit follows) — each in a narrow measure, so that some line
// breaks in the word it is about

const IMAGE = compileImageRef()
const docker = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0
type Request = { main: string; rerun: boolean; overrides: Map<string, Uint8Array> }
/** a compile in the image: the paper's files and the request's, pdflatex once, or three times where it is rerun */
const compiler = (files: Map<string, Uint8Array>) => async ({ main, rerun, overrides }: Request) => {
  const dir = mkdtempSync(join(tmpdir(), 'axt-invariant-'))
  try {
    for (const [p, b] of [...files, ...overrides]) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), b) }
    for (let pass = 0; pass < (rerun ? 3 : 1); pass++) {
      try { execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${dir}:/work`, '-w', '/work', IMAGE, 'pdflatex', '-interaction=nonstopmode', main], { stdio: 'pipe', timeout: 300_000 }) } catch { /* errors are the log's */ }
    }
    const read = (f: string) => { try { return readFileSync(join(dir, f)) } catch { return null } }
    const stem = main.replace(/\.tex$/, '')
    const pdf = read(`${stem}.pdf`)
    return { ok: !!pdf, pdf: pdf ? new Uint8Array(pdf) : null, log: read(`${stem}.log`)?.toString('latin1') ?? '', aux: read(`${stem}.aux`)?.toString('utf8') ?? null, bbl: null, ms: 1 }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
/** every text item of a PDF, its text and its place, by page */
const itemsOf = async (pdf: Uint8Array) => {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  const out: string[] = []
  for (let n = 1; n <= doc.numPages; n++) for (const it of (await (await doc.getPage(n)).getTextContent()).items as { str: string; transform: number[] }[]) if (it.str.trim()) out.push(`${n} ${it.transform[4]?.toFixed(2)} ${it.transform[5]?.toFixed(2)} ${it.str}`)
  await doc.loadingTask.destroy()
  return out
}
/** the destinations a PDF names */
const destsOf = async (pdf: Uint8Array) => {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  const all = await doc.getDestinations()
  await doc.loadingTask.destroy()
  return new Set(all instanceof Map ? all.keys() : Object.keys(all ?? {}))
}
/** the marked original's items against the paper's own; the marks it set, by each piece's source: 'a' its opening mark, 'b' its
 *  closing one, of the first piece of that source */
async function compare(tex: string) {
  const files = new Map([['main.tex', new TextEncoder().encode(tex)]])
  const paper = openPaper(files), compile = compiler(files)
  const made = await markedOfPaper(paper, { compile: compile as never, final: false })
  if (!('pdf' in made) || !made.pdf) throw new Error(`no marked original: ${JSON.stringify(made).slice(0, 300)}`)
  const own = await compile({ main: 'main.tex', rerun: true, overrides: new Map() })
  const dests = await destsOf(made.pdf)
  const marksOf = (src: string) => {
    for (const [i, u] of paper.units.entries()) for (const [k, p] of (u.pieces as { t: string; src?: string }[]).entries()) if (p.t === 'ph' && p.src === src) return `${dests.has(`axt-p${i}.${k}a`) ? 'a' : ''}${dests.has(`axt-p${i}.${k}b`) ? 'b' : ''}`
    return null
  }
  const options = made.options as { switches?: Record<string, string>; inkless?: string[]; texts?: [string, string][] }
  /** a unit's own marks, by its first text: 's' its start mark, 'e' its end mark */
  const unitMarksOf = (first: string) => {
    const i = paper.units.findIndex(u => (u.pieces as { t: string; s?: string }[]).some(p => p.t === 'text' && (p.s ?? '').trim().startsWith(first)))
    return i < 0 ? null : `${dests.has(`axt-${i}s`) ? 's' : ''}${dests.has(`axt-${i}e`) ? 'e' : ''}`
  }
  return { marked: await itemsOf(made.pdf), own: await itemsOf(own.pdf as Uint8Array), marksOf, unitMarksOf, switches: options.switches ?? {}, inkless: options.inkless ?? [], texts: options.texts ?? [], pdf: made.pdf, units: paper.units }
}
/** a paragraph each with a few more words before `x`, so that some line ends inside the word `x` is about (never none: a
 *  paragraph that opens with a macro has its start mark after it, which an \\xspace in it sees, as before this marking) */
const lines = (x: string, n = 14) => Array.from({ length: n }, (_, i) => `${'one two three four five six seven eight nine ten eleven '.split(' ').slice(0, 1 + (i % 10)).join(' ')} ${x} and more words after it to fill the line out.`).join('\n\n')
const doc = (pre: string, body: string) => `\\documentclass{article}\n${pre}\n\\begin{document}\n\\hsize=4.2cm \\textwidth=4.2cm \\columnwidth=4.2cm \\linewidth=4.2cm\n${body}\n\\begin{thebibliography}{9}\\bibitem{a} A. Author. A title. 2020.\\end{thebibliography}\n\\end{document}\n`

describe.skipIf(!docker)('the marked original sets every text item where the paper\'s own compile does', () => {
  it('a paper\'s macro that looks ahead before a formula, a citation or a footnote\'s call (2609.20976\'s \\snr, \\ac{SNR}\\xspace): the placeholder after it marked where TeX answered so, \\footnote not (\\xspace sets no space before it)', async () => {
    const pre = '\\usepackage{xspace}\\usepackage{acronym}\\usepackage{url}\\newcommand{\\snr}{\\ac{SNR}\\xspace}\\newcommand{\\lgn}{\\texttt{lognormal\\allowbreak\\_galaxies}\\xspace}\\newcommand{\\nmx}{\\textsc{nm}\\xspace}'
    const r = await compare(doc(pre, `\\begin{acronym}\\acro{SNR}{signal-to-noise ratio}\\end{acronym}\n\n${lines('high \\snr $\\geq 50$')}\n\n${lines('the \\snr \\cite{a}')}\n\n${lines('code \\lgn \\footnote{\\url{https://x.org}}')}\n\n${lines('by \\nmx{}\\cite{a}')}`))
    expect(r.marked).toEqual(r.own)
    const { aheadKey } = await import('@/pdf-reader/engine/layout/marks.mjs')
    // (the formula and the citation after \\snr: its opening mark alone, theirs both — a closing mark after \\snr would make the
    // space TeX skipped after it a second one; the footnote after \\lgn none; the citation right against \\nmx{}'s last letter
    // none, \\xspace setting no space before the `{}`: a mark's whatsit there would let TeX hyphenate the word the citation's
    // box keeps whole, which no box's width shows)
    expect([r.switches[aheadKey('\\snr', ' ', '$\\geq 50$')], r.switches[aheadKey('\\snr', ' ', '\\cite{a}')], r.switches[aheadKey('\\lgn', ' ', '\\footnote{\\url{https://x.org}}')], r.switches[aheadKey('\\nmx{}', '', '\\cite{a}')]]).toEqual(['1', '1', '2', '2'])
    expect([r.marksOf('\\snr'), r.marksOf('$\\geq 50$'), r.marksOf('\\cite{a}'), r.marksOf('\\nmx{}')]).toEqual(['a', 'ab', 'ab', 'a'])
  }, 900_000)
  it('a sample that leaves TeX\'s state broken (2010.11929v2\'s \\tikz\\fill, cut in two: \\tikz alone opens a picture it never closes, in which pgf\'s \\selectfont selects \\nullfont) before a letter macro and a look-ahead pair: both answered as without it', async () => {
    const pre = '\\usepackage{tikz}\\usepackage{xspace}\\newcommand\\bert{BERT}\\newcommand{\\nmx}{\\textsc{nm}\\xspace}'
    const body = `The \\bert{} model.\n\n${lines('by \\nmx{}\\cite{a}')}`
    const [broken, clean] = [await compare(doc(pre, `A dot \\tikz\\fill (0,0) circle (.5ex); here.\n\n${body}`)), await compare(doc(pre, body))]
    expect(broken.marked).toEqual(broken.own)
    const { aheadKey } = await import('@/pdf-reader/engine/layout/marks.mjs')
    const answers = (r: typeof clean) => ({ text: r.texts.find(([s]) => s === '\\bert{}')?.[1], inkless: r.inkless.includes('\\bert{}'), pair: r.switches[aheadKey('\\nmx{}', '', '\\cite{a}')], marks: [r.marksOf('\\bert{}'), r.marksOf('\\nmx{}'), r.marksOf('\\cite{a}')] })
    // (\\bert{}: its text, a box with ink; the citation right against \\nmx{}: 2, its opening mark alone, none on the citation)
    expect(answers(clean)).toEqual({ text: 'BERT', inkless: false, pair: '2', marks: ['ab', 'a', ''] })
    expect(answers(broken)).toEqual(answers(clean))
  }, 900_000)
})
