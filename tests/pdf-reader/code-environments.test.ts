import { describe, expect, it } from 'vitest'
import { documentBounds, inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'

// Code stays as the paper has it: the body of an environment a paper defines as code is never a unit, so never sent to
// a translator (2610.19159: 832 of its 2,645 units were the lines of its appendix's agent transcripts, set in an
// environment of its own that does what alltt does; Microsoft sent their ASCII punctuation back full-width). Prose
// around it, \texttt and all, is cut as before

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const project = (files: Record<string, string>) => loadProject(inMemory(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)]))), 'main.tex', { tables: true })
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('').replace(/\s+/g, ' ').trim()
const texts = (files: Record<string, string>) => (project(files).units as unknown as Unit[]).map(textOf)
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`

/** 2610.19159's construct, its definition's shape (sec/appendix2.tex, in the body of a file the document \inputs): a
 *  group in typewriter type, its lines obeyed, its spaces made active by a macro of the paper's; a quote inside each
 *  block. The lines are ours */
const TRANSCRIPT = [
  '\\begingroup\\lccode`\\~=`\\ %',
  '\\lowercase{\\endgroup\\def\\blockobeyspaces{%',
  '  \\catcode`\\ =\\active\\def~{\\leavevmode\\space}}}',
  '\\newenvironment{transcript}{%',
  ' \\begingroup\\fontencoding{T1}\\ttfamily\\fontsize{8}{9.2}\\selectfont\\raggedright',
  ' \\obeylines\\blockobeyspaces}{\\par\\endgroup}',
  '',
  'Agents may use \\texttt{curl} or the search tools of each harness to reach the internet.',
  '',
  '\\begin{quote}\\noindent The full paper is verified end to end.',
  '\\end{quote}',
  '\\begin{transcript}',
  '\\begin{quote}\\noindent pdflatex -interaction=nonstopmode report.tex \\textgreater{}/\\allowbreak{}tmp/\\allowbreak{}build.log 2\\textgreater{}\\&1',
  'echo \\textquotedbl{}=== CHECK ===\\textquotedbl{}; grep -c \\textquotesingle{}undefined\\textquotesingle{} /\\allowbreak{}tmp/\\allowbreak{}build.log',
  '\\end{quote}',
  '\\end{transcript}',
  '{\\color{teal}',
  '\\begin{transcript}',
  '\\begin{quote}\\noindent === CHECK ===',
  'All checks passed, with nothing left to report.',
  '\\end{quote}',
  '\\end{transcript}',
  '}',
  'The paragraph after the transcripts.',
].join('\n')

describe('an environment the paper defines as code is kept as it is, never a unit', () => {
  it('2610.19159\'s transcripts: typewriter type with its lines obeyed, as alltt sets it; the prose around them cut as before', () => {
    const got = texts({ 'main.tex': doc('\\section{Transcripts}\n\\input{sec/appendix}', '\\usepackage{xcolor}'), 'sec/appendix.tex': TRANSCRIPT })
    expect(got.filter(t => /pdflatex|grep|CHECK|checks passed/.test(t))).toEqual([])
    expect(got).toContain('Agents may use or the search tools of each harness to reach the internet.')
    expect(got).toContain('The full paper is verified end to end.')
    expect(got).toContain('The paragraph after the transcripts.')
  })

  const block = 'for x in range(10): print(x, "done")'
  const cut = (pre: string, env: string) => texts({ 'main.tex': doc(`A paragraph before the block.\n\n\\begin{${env}}\n${block}\n\\end{${env}}\n\nThe paragraph after the block.`, pre) })
  const KEPT: [string, string, string][] = [
    ['a group in typewriter type with its lines obeyed', '\\newenvironment{tx}{\\begingroup\\ttfamily\\obeylines}{\\par\\endgroup}', 'tx'],
    ['the same in plain TeX\'s switch, by a document environment', '\\NewDocumentEnvironment{dx}{}{\\tt\\obeylines}{}', 'dx'],
    ['one that opens alltt', '\\usepackage{alltt}\\newenvironment{ax}{\\small\\begin{alltt}}{\\end{alltt}}', 'ax'],
    ['one that begins as a verbatim', '\\newenvironment{vx}{\\verbatim}{\\endverbatim}', 'vx'],
    ['one that opens fancyvrb\'s Verbatim, as fancyvrb documents it', '\\usepackage{fancyvrb}\\newenvironment{fx}{\\VerbatimEnvironment\\begin{Verbatim}[fontsize=\\small]}{\\end{Verbatim}}', 'fx'],
    ['a verbatim under a name of the paper\'s', '\\let\\vy\\verbatim\\let\\endvy\\endverbatim', 'vy'],
    ['one that opens another of the paper\'s code environments', '\\newenvironment{tx}{\\ttfamily\\obeylines}{}\\newenvironment{outer}{\\begin{tx}}{\\end{tx}}', 'outer'],
    ['fancyvrb\'s \\CustomVerbatimEnvironment', '\\usepackage{fancyvrb}\\CustomVerbatimEnvironment{vz}{Verbatim}{}', 'vz'],
    ['fancyvrb\'s \\DefineVerbatimEnvironment', '\\usepackage{fancyvrb}\\DefineVerbatimEnvironment{vd}{Verbatim}{}', 'vd'],
    ['listings\' \\lstnewenvironment', '\\usepackage{listings}\\lstnewenvironment{lx}{}{}', 'lx'],
    ['minted\'s \\newminted, by the name it defines', '\\usepackage{minted}\\newminted{python}{}', 'pythoncode'],
    ['minted\'s \\newminted, by the name it is given', '\\usepackage{minted}\\newminted[pyc]{python}{}', 'pyc'],
    ['tcolorbox\'s listing, by \\NewTCBListing', '\\usepackage[listings]{tcolorbox}\\NewTCBListing{tl}{}{}', 'tl'],
    ['tcolorbox\'s listing, by \\ProvideTCBListing', '\\usepackage[listings]{tcolorbox}\\ProvideTCBListing{tp}{}{}', 'tp'],
  ]
  for (const [what, pre, env] of KEPT) {
    it(what, () => expect(cut(pre, env)).toEqual(['A paragraph before the block.', 'The paragraph after the block.']))
  }

  it('not typewriter type alone (a prompt box, 2608.03063\'s seqbox), nor lines obeyed alone (verse): their words are prose', () => {
    expect(cut('\\newenvironment{px}{\\ttfamily\\small}{}', 'px')).toContain(block)
    expect(cut('\\newenvironment{po}{\\obeylines\\itshape}{}', 'po')).toContain(block)
  })

  it('a definition in a comment defines nothing', () => {
    expect(cut('%\\newenvironment{tx}{\\ttfamily\\obeylines}{}', 'tx')).toContain(block)
  })

  it('by the last definition, as TeX takes it, and not one a \\Provide… after it would have made', () => {
    expect(cut('\\newenvironment{tx}{\\ttfamily\\obeylines}{}\\renewenvironment{tx}{\\itshape}{}', 'tx')).toContain(block)
    expect(cut('\\newenvironment{tx}{\\itshape}{}\\renewenvironment{tx}{\\ttfamily\\obeylines}{}', 'tx')).not.toContain(block)
    expect(cut('\\newenvironment{tx}{\\itshape}{}\\ProvideDocumentEnvironment{tx}{}{\\ttfamily\\obeylines}{}', 'tx')).toContain(block)
  })

  it('by the last definition whatever made it: a listing package\'s environment the paper defines again as prose is prose', () => {
    expect(cut('\\usepackage{listings}\\lstnewenvironment{snippet}{}{}\n\\renewenvironment{snippet}{\\itshape}{}', 'snippet')).toContain(block)
  })

  it('what the begin code defines is no part of what it sets: a definition\'s body there opens nothing, sets no type', () => {
    expect(cut('\\usepackage{alltt}\\newenvironment{remark}{\\def\\code{\\begin{alltt}}\\itshape}{}', 'remark')).toContain(block)
    expect(cut('\\newenvironment{verse}{\\newcommand\\code[1]{{\\tt ##1}}\\obeylines\\itshape}{}', 'verse')).toContain(block)
    expect(cut('\\newenvironment{tx}{\\def\\code{x}\\ttfamily\\obeylines}{}', 'tx')).not.toContain(block)
  })

  it('a command \\let to one of the verbatim\'s internal macros is no verbatim (\\verbatim@font): a prompt box set in its type stays prose', () => {
    expect(cut('\\makeatletter\\let\\promptfont\\verbatim@font\\makeatother\n\\newenvironment{promptbox}{\\par\\promptfont\\small}{\\par}', 'promptbox')).toContain(block)
  })

  it('LaTeX\'s and the packages\' definers by their own names: \\provideenvironment (memoir, makecmds) defines nothing defined before it; no \\providenewenvironment', () => {
    expect(cut('\\provideenvironment{tx}{\\ttfamily\\obeylines}{}', 'tx')).not.toContain(block)
    expect(cut('\\newenvironment{tx}{\\itshape}{}\\provideenvironment{tx}{\\ttfamily\\obeylines}{}', 'tx')).toContain(block)
    expect(cut('\\providenewenvironment{tx}{\\ttfamily\\obeylines}{}', 'tx')).toContain(block)
  })

  it('fancyvrb\'s \\RecustomVerbatimEnvironment, the last definition, makes code; there is no \\ReCustomVerbatimEnvironment', () => {
    expect(cut('\\usepackage{fancyvrb}\\newenvironment{vz}{\\itshape}{}\\RecustomVerbatimEnvironment{vz}{Verbatim}{}', 'vz')).not.toContain(block)
    expect(cut('\\usepackage{fancyvrb}\\ReCustomVerbatimEnvironment{vq}{Verbatim}{}', 'vq')).toContain(block)
    const p = project({ 'main.tex': doc('Words.', '\\usepackage{fancyvrb}\\RecustomVerbatimEnvironment{vz}{Verbatim}{}\\ReCustomVerbatimEnvironment{vq}{Verbatim}{}') }) as unknown as { lineEnvs: Set<string> }
    expect([p.lineEnvs.has('vz'), p.lineEnvs.has('vq')]).toEqual([true, false])
  })

  it('one that opens a starred environment of the paper\'s by its name (\\DefineVerbatimEnvironment{Code*})', () => {
    const pre = '\\usepackage{fancyvrb}\\DefineVerbatimEnvironment{Code*}{Verbatim}{}\\newenvironment{wrap}{\\VerbatimEnvironment\\begin{Code*}}{\\end{Code*}}'
    expect(cut(pre, 'wrap')).toEqual(['A paragraph before the block.', 'The paragraph after the block.'])
    expect((project({ 'main.tex': doc('Words.', pre) }) as unknown as { lineEnvs: Set<string> }).lineEnvs.has('wrap')).toBe(true)
  })

  it('a code environment begun and ended by macros of the paper\'s (\\newcommand\\btx{\\begin{tx}})', () => {
    const got = texts({ 'main.tex': doc(`A paragraph before the block.\n\n\\btx\n${block}\n\\etx\n\nThe paragraph after the block.`, '\\newenvironment{tx}{\\ttfamily\\obeylines}{}\n\\newcommand\\btx{\\begin{tx}}\n\\newcommand\\etx{\\end{tx}}') })
    expect(got).toEqual(['A paragraph before the block.', 'The paragraph after the block.'])
  })
})

describe('an environment of the paper\'s own that opens a verbatim is read by lines, as the verbatim it opens', () => {
  const VERBATIMS: [string, string][] = [
    ['fancyvrb\'s Verbatim, as fancyvrb documents it', '\\usepackage{fancyvrb}\\newenvironment{fx}{\\VerbatimEnvironment\\begin{Verbatim}[fontsize=\\small]}{\\end{Verbatim}}'],
    ['the kernel\'s verbatim, after a size', '\\newenvironment{fx}{\\small\\verbatim}{\\endverbatim}'],
  ]
  const source = (pre: string) => doc('A paragraph before the block.\n\n\\begin{fx}\nx = 1\n\\end{document}\n\\end{fx}\nThe paragraph after the block.', pre)
  for (const [what, pre] of VERBATIMS) {
    it(`${what}: an \\end{document} in its lines ends nothing, and nothing of the reader's goes on its \\end's line`, () => {
      const p = openPaper(new Map([['main.tex', enc(source(pre))]]))
      expect((p.units as unknown as Unit[]).map(textOf)).toEqual(['A paragraph before the block.', 'The paragraph after the block.'])
      const tex = new TextDecoder().decode(originalFiles(p, { lines: true }).get('main.tex'))
      expect(tex).toContain('\\end{fx}\n\\axtlines{1}\\leavevmode\\axtmark{1s}The paragraph after the block.')
    })
  }
  it('a \\begin of one in a definition\'s body begins nothing where it is defined: the document after it is read whole', () => {
    for (const shorthand of ['\\newcommand\\start{\\begin{fx}}', '\\def\\start{\\begin{fx}}', '\\newenvironment{gx}{\\begin{fx}}{\\end{fx}}', '\\newcommand\\bv{\\begin{verbatim}}']) {
      const tex = doc('A first paragraph of the paper.\n\n\\begin{fx}\nx = 1\n\\end{fx}\n\nA second paragraph of the paper.', `${VERBATIMS[0]?.[1]}\n${shorthand}`)
      const p = openPaper(new Map([['main.tex', enc(tex)]]))
      expect((p.units as unknown as Unit[]).map(textOf), shorthand).toEqual(['A first paragraph of the paper.', 'A second paragraph of the paper.'])
      // the document as the walk finds it, by the paper's environments read by lines: its \\begin{document} the real one
      expect(documentBounds(tex, { lineEnvs: (p.project as unknown as { lineEnvs: Set<string> }).lineEnvs }).begin, shorthand).toBe(tex.indexOf('\\begin{document}'))
    }
  })
  it('not one set as alltt sets its body, whose lines TeX reads as it reads any', () => {
    const p = project({ 'main.tex': doc('Words.', '\\newenvironment{tx}{\\ttfamily\\obeylines}{}') }) as unknown as { lineEnvs: Set<string> }
    expect(p.lineEnvs.has('tx')).toBe(false)
  })
})
