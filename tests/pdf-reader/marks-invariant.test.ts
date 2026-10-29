// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
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
/** the points (`/axt-<name> ri`) of each page of a PDF, in stream order: [page, name] */
const pointsOf = async (pdf: Uint8Array) => {
  const doc = await getDocument({ data: pdf.slice(), verbosity: 0 }).promise
  const out: [number, string][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const ops = await (await doc.getPage(n)).getOperatorList()
    ops.fnArray.forEach((f, j) => { const name = (ops.argsArray[j]?.[0] as { name?: string } | undefined)?.name; if (f === OPS.setRenderingIntent && typeof name === 'string' && name.startsWith('axt-')) out.push([n, name.slice(4)]) })
  }
  await doc.loadingTask.destroy()
  return out
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
  it('a macro before its word\'s suffix (\\tf{}s: Transform-ers at a line\'s end) and a macro that reads nothing past its arguments', async () => {
    const r = await compare(doc('\\newcommand\\tf{Transformer}\\newcommand\\method{RoBERTa}\\newcommand\\share{91.5}\\newcommand\\rate{0.73}', `${lines('\\tf{}s')}\n\n${lines('\\method{}s')}\n\nThe share is \\share{}\\cite{a} of all, and the rate \\rate{} \\cite{a} here.`))
    expect(r.marked).toEqual(r.own)
    // (the marks it set: \\tf{} before its suffix its opening mark alone; \\rate{} TeX answered for, both, and the citation past
    // white space after it both; \\share{}, its probed call glued to the citation, both where TeX answered so for that follower;
    // the citation right against it none)
    expect([r.marksOf('\\tf{}'), r.marksOf('\\rate{}'), r.marksOf('\\share{}'), r.marksOf('\\cite{a}')]).toEqual(['a', 'ab', 'ab', ''])
    expect(r.switches['\\share']).toBe('00000000')
    expect(r.switches['\\rate']).toBe('00000000')
  }, 900_000)
  it('a macro whose body ends in an argument (\\pair{Ro}{\\bert}: \\xspace in it), and one that redefines another', async () => {
    const r = await compare(doc('\\usepackage{xspace}\\newcommand\\pair[2]{#1#2}\\newcommand\\bert{BERT\\xspace}\\newcommand\\setx[1]{\\renewcommand\\s{#1}}\\newcommand\\s{none}', `${lines('\\pair{Ro}{\\bert}.')}\n\n\\setx{abc}The value \\s{} here and \\s.`))
    expect(r.marked).toEqual(r.own)
  }, 900_000)
  it('a citation in a macro under cite\'s superscripts, a footnote in a macro under fnpct, and a kern after a macro\'s last letter (mathptmx: V.)', async () => {
    const r = await compare(doc('\\usepackage[super]{cite}\\usepackage{fnpct}\\usepackage{url}\\usepackage{mathptmx}\\newcommand\\rc[1]{\\cite{#1}}\\newcommand\\fnurl[1]{\\footnote{\\url{#1}}}\\newcommand\\kv[2]{#1#2V}', `${lines('work \\rc{a}.')}\n\n${lines('a site\\fnurl{http://x.org}.')}\n\n${lines('the \\kv{I}{x}.')}`))
    expect(r.marked).toEqual(r.own)
    // (TeX's answers: a closing mark before the full stop moves it under cite's superscripts, under fnpct and after the V)
    for (const c of ['\\rc', '\\kv']) expect(r.switches[c]?.[0], c).not.toBe('0')
  }, 900_000)
  it('a footnote\'s call under fnpct before the full stop it moves in front of the call: the call\'s closing mark after it', async () => {
    const r = await compare(doc('\\usepackage{fnpct}', `${lines('a site\\footnote{A note of words.}.')}`))
    expect(r.marked).toEqual(r.own)
    expect(r.switches['\\footnote']?.[0]).toBe('3')
  }, 900_000)
  it('a box, a formula or a rule glued to a word (TeX hyphenates no word a box follows), and the shapes the marking now marks', async () => {
    const r = await compare(doc('\\newcommand\\st{\\mbox{$\\star$}}\\newcommand\\sq{\\textsuperscript{2}}\\newcommand\\ru{\\rule{1pt}{1ex}}\\newcommand\\pp{\\,pp}', `${lines('characterization\\st{}')}\n\n${lines('representation\\sq{}')}\n\n${lines('representation\\ru{}')}\n\n${lines('a gap of 0.58\\pp{} or')}\n\nA F\\o lner sequence, and\\slash or a code, by Zhou\\textsuperscript{1} and others.`))
    expect(r.marked).toEqual(r.own)
    // (the marks it set: \\pp{}, whose box begins with a kern, both; the box, the formula and the rule glued, none)
    expect([r.marksOf('\\pp{}'), r.marksOf('\\st{}'), r.marksOf('\\sq{}'), r.marksOf('\\ru{}')]).toEqual(['ab', '', '', ''])
  }, 900_000)
  it('a call ending in a control word before white space and a citation or a macro: TeX skips the space, so the next piece stands against the word', async () => {
    // (\\tf answered for by its first call, \\tf{}: every mark safe before a word. After \\tf the space is skipped, and an
    // opening mark on \\cite{a} or \\tg{} would stand against Transformer's last letter: a citation's box keeps TeX from
    // hyphenating the word before it, a mark's whatsit does not, and Transformer would break where the paper's does not)
    const r = await compare(doc('\\newcommand\\tf{Transformer}\\newcommand\\tg{Gizmo}', `First the \\tf{} here.\n\n${['\\tf.', '\\tf s', '\\tf 2', '\\tf \\tg{}', '\\tf \\cite{a}'].map(x => lines(x)).join('\n\n')}`))
    expect(r.marked).toEqual(r.own)
    expect(r.switches['\\tf']).toBe('00000000')
    expect([r.marksOf('\\cite{a}'), r.marksOf('\\tg{}')]).toEqual(['', ''])
  }, 900_000)
  it('a unit that opens after a command TeX skips the space after (paralist\'s inline items, \\item Which: 2610.21098): its line probe past that space', async () => {
    const r = await compare(`\\documentclass{article}\n\\usepackage{paralist}\n\\begin{document}\nWith this design we ask four questions.\n\\begin{inparaenum} [(1)]\n  \\item Which pressures reduce verified task success (VTS)?\n  \\item How much of each loss occurs together with a harness limit?\n  \\item Where do failed episodes end, and does the failure record reveal which pressure was assigned?\n\\end{inparaenum}\n\nNext paragraph.\n\\end{document}\n`)
    expect(r.marked).toEqual(r.own)
  }, 900_000)
  it('a macro whose last glyph is its argument\'s, probed by one call (\\fmt{x}{x}.) and called with another (\\fmt{x}{V}.: mathptmx kerns V with the full stop)', async () => {
    const r = await compare(doc('\\usepackage{mathptmx}\\newcommand\\fmt[2]{\\textrm{#1#2}}', `First \\fmt{x}{x}. here.\n\n${lines('the \\fmt{x}{V}.')}`))
    expect(r.marked).toEqual(r.own)
    expect(r.switches['\\fmt']?.[0]).toBe('0')
    expect(r.marksOf('\\fmt{x}{V}')).toBe('a')
  }, 900_000)
  it('a \\def whose first argument runs to a space (\\def\\foo#1 #2): no closing mark for TeX to read into it', async () => {
    const r = await compare(doc('\\def\\foo#1 #2{(#1|#2)}', `${lines('\\foo{one}{two} {three}')}`))
    expect(r.marked).toEqual(r.own)
    expect(r.marksOf('\\foo{one}{two}')).toBe('a')
  }, 900_000)
  it('a complete macro whose call is more errors than TeX goes on past, asked about last: the probe\'s other answers stand', async () => {
    // (\\bad's four undefined commands, in each of the punctuation test's 32 boxes, make more than the hundred errors one
    // paragraph may hold, and TeX stops: \\nothing's ink answer, asked before, says it sets none, and it has no mark)
    const r = await compare(doc('\\newcommand\\bad{\\axtundefA\\axtundefA\\axtundefA\\axtundefA x}\\newcommand\\nothing{\\relax}', `A word\\nothing{} here, and \\bad{} there \\cite{a}.`))
    expect(r.marked).toEqual(r.own)
    expect(r.inkless).toContain('\\nothing{}')
    expect(r.switches['\\cite']).toBe('00000000')
    expect(r.switches['\\bad']).toBeUndefined()
    expect(r.marksOf('\\nothing{}')).toBe('')
  }, 900_000)
  it('the front matter\'s units, marked as any unit: an author block\'s names and places and its \\thanks notes, set in \\maketitle', async () => {
    const r = await compare(`\\documentclass{article}\n\\usepackage{hyperref}\n\\title{Counting Paths}\n\\author{Ada Lovelace\\thanks{Analytical Engine Society.} \\and Charles Babbage\\thanks{Difference Engine Club.}\\\\ Cambridge, England}\n\\date{}\n\\begin{document}\n\\maketitle\n${lines('a word')}\n\\end{document}\n`)
    expect(r.marked).toEqual(r.own)
    // (the names' unit, which \\maketitle sets in a table's cell, and each note, which \\thanks keeps for the foot of the page)
    expect([r.unitMarksOf('Ada Lovelace'), r.unitMarksOf('Analytical Engine'), r.unitMarksOf('Difference Engine')]).toEqual(['se', 'se', 'se'])
  }, 900_000)
  it('a \\thanks\'s placeholders, robust (\\protect\\axtpma) through its \\protected@xdef, and \\protect\\url marked before its prefix, under hyperref (2610.20484, 2610.11256, 2610.21880)', async () => {
    const r = await compare(`\\documentclass{article}\n\\usepackage{hyperref}\n\\title{Counting Paths}\n\\author{Ada Lovelace\\thanks{Corresponding author: \\texttt{ada@x.org}, or \\protect\\url{c@d.org}. Email: \\href{mailto:e@f.org}{e@f.org}.}}\n\\date{}\n\\begin{document}\n\\maketitle\n${lines('a word')}\n\\end{document}\n`)
    expect(r.marked).toEqual(r.own)
    // (the note's own marks, and each placeholder's: \\texttt's and \\url's both, \\href's text its opening one)
    expect(r.unitMarksOf('Corresponding author')).toBe('se')
    expect([r.marksOf('\\texttt{ada@x.org}'), r.marksOf('\\url{c@d.org}'), r.marksOf('e@f.org')?.includes('a')]).toEqual(['ab', 'ab', true])
  }, 900_000)
  it('a unit that ends inside \\emph{...} on a centred line (2610.21880\'s IEEEtran author block): its end mark keeps the italic correction \\emph adds after its group', async () => {
    const r = await compare(`\\documentclass[conference]{IEEEtran}\n\\begin{document}\n\\title{A Title}\n\\author{Sohani Hiam, Mohammad Soleymani, \\emph{Senior Member, IEEE}, \\\\and Rafael F. Schaefer, \\emph{Senior Member, IEEE}\n \\\\ \n\\thanks{This work was supported.}}\n\\maketitle\n\\begin{center}\nA centred paragraph of Rafael F. Schaefer, \\emph{Senior Member, IEEE}\n\\end{center}\n\\end{document}\n`)
    expect(r.marked).toEqual(r.own)
    expect([r.unitMarksOf('Sohani Hiam'), r.unitMarksOf('A centred paragraph')]).toEqual(['se', 'se'])
  }, 900_000)
  it('but not two of them whose texts are equal, which a class compares (revtex4-2 sets two authors\' equal affiliations once)', async () => {
    const r = await compare(`\\documentclass[aps,prl,twocolumn]{revtex4-2}\n\\begin{document}\n\\title{Counting Paths}\n\\author{Ada Lovelace}\n\\affiliation{Department of Engines, Cambridge, England}\n\\author{Charles Babbage}\n\\affiliation{Department of Engines, Cambridge, England}\n\\author{Mary Somerville}\n\\affiliation{Royal Institution, London, England}\n\\begin{abstract}A short abstract of the paper.\\end{abstract}\n\\maketitle\n${lines('a word')}\n\\end{document}\n`)
    expect(r.marked).toEqual(r.own)
    expect([r.unitMarksOf('Department of Engines'), r.unitMarksOf('Royal Institution'), r.unitMarksOf('Mary Somerville')]).toEqual(['', 'se', 'se'])
  }, 900_000)
  it('revtex4-2, whose ltxgrid makes its columns without \\@makecol: each page\'s text block bracketed by body points at \\@outputpage', async () => {
    const r = await compare(`\\documentclass[aps,prl,twocolumn]{revtex4-2}\n\\begin{document}\n\\title{Counting Paths}\n\\author{Ada Lovelace}\n\\affiliation{Department of Engines}\n\\maketitle\n${lines('a word', 40)}\n\\begin{equation}a^2+b^2=c^2\\end{equation}\n${lines('a word', 30)}\n\\end{document}\n`)
    expect(r.marked).toEqual(r.own)
    const points = await pointsOf(r.pdf)
    const pages = new Set(r.marked.map(x => Number(x.split(' ')[0])))
    expect(pages.size).toBeGreaterThan(1)
    // (every page one bracket, opening before its closing)
    for (const p of pages) {
      const names = points.filter(([q]) => q === p).map(([, n]) => n).filter(n => /^b[se]\d+$/.test(n))
      expect(names.map(n => n[1]), `page ${p}`).toEqual(['s', 'e'])
    }
  }, 900_000)
  it('cite.sty\'s superscripts under hyperref: no mark between the citation and the punctuation it moves before its number, its closing mark after that punctuation (2610.19274v1)', async () => {
    const r = await compare(doc('\\usepackage[super]{cite}\\usepackage{hyperref}', `${lines('work \\cite{a}.')}\n\n${lines('et al.~\\cite{a}, which')}`))
    expect(r.marked).toEqual(r.own)
    expect(r.switches['\\cite']?.slice(0, 4)).toBe('3333')
    expect(r.marksOf('\\cite{a}')).toBe('ab')
  }, 900_000)
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
  it('a complete macro glued to the placeholder after it (2610.21098\'s \\HarnessLimitShare{}\\%): its closing mark where TeX answered so for that follower', async () => {
    const r = await compare(doc('\\newcommand\\share{91.5}\\newcommand\\rate{0.73}', `${lines('of \\share{}\\% each')}\n\n${lines('of \\rate{}\\S{} each')}`))
    expect(r.marked).toEqual(r.own)
    expect([r.switches['\\share'], r.marksOf('\\share{}'), r.marksOf('\\rate{}')]).toEqual(['00000000', 'ab', 'ab'])
  }, 900_000)
  it('backref\'s lists after the entries under hyperref\'s pagebackref, the class\'s \\backrefalt and backref\'s own printer (2610.37668v1): the list marked around where TeX sets it, every item where the paper sets it', async () => {
    const bib = '\\begin{thebibliography}{9}\n\n\\bibitem{a}\nA. Author and B. Writer.\n\\newblock A title of the work, 2020.\n\n\\bibitem{b}\nC. Third and D. Fourth.\n\\newblock Another title of a work here, 2021.\n\n\\bibitem{c}\nE. Never Cited.\n\\newblock A work no page cites, 2019.\n\n\\end{thebibliography}'
    const body = `${lines('see \\cite{a}', 20)}\n\n\\clearpage\nAlso \\cite{a,b} on another page.\n\n${bib}`
    for (const pre of ['\\usepackage{xcolor}\\usepackage[numbers]{natbib}\\usepackage[pagebackref]{hyperref}\\renewcommand*{\\backref}[1]{}\\renewcommand*{\\backrefalt}[4]{{\\color{gray}\\enspace#2}}', '\\usepackage[pagebackref]{hyperref}']) {
      const r = await compare(`\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`)
      expect(r.marked, pre).toEqual(r.own)
      // (each entry's list piece has both its marks, the uncited one's around nothing; no other piece's or unit's moved)
      const entries = (r.units as { kind: string; pieces: { t: string; src?: string }[] }[]).map((u, i) => [u, i] as const).filter(([u]) => u.kind === 'reference')
      expect(entries.length, pre).toBe(3)
      const dests = await (async () => { const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'); const d = await getDocument({ data: r.pdf.slice(), verbosity: 0 }).promise; const all = await d.getDestinations(); await d.loadingTask.destroy(); return new Set(all instanceof Map ? all.keys() : Object.keys(all ?? {})) })()
      for (const [u, i] of entries) {
        const k = u.pieces.length - 1
        expect(u.pieces[k]?.src).toBe('\\axtbackref')
        expect([dests.has(`axt-p${i}.${k}a`), dests.has(`axt-p${i}.${k}b`)], `${pre} ${i}`).toEqual([true, true])
      }
      // (the list's page numbers are on the page, after the entries' text: "1, 2" for a, "2" for b)
      expect(r.own.join('\n')).toMatch(/2021\./)
    }
  }, 900_000)
})
