import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { readArgs, paperParams } from '@/pdf-reader/engine/rules/arg-roles.mjs'

// A command and its arguments are one piece of the source: no unit begins or ends between them, so nothing of the
// reader's — a lead, a mark, a line probe — is written there. #407's review: `\vbox{…}\begin{center}` was marked
// `\begin{\leavevmode\axtmark{0s}center}`, and the marked compile broke. \vbox's group was read as its box
// specification, a dimension, and the token after it, \begin, as its content: the call ended between \begin and its
// name, and the name's group was walked as a group of text

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`
const paper = (body: string) => openPaper(new Map([['main.tex', enc(doc(body))]]))
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('').replace(/\s+/g, ' ').trim()
const texts = (body: string) => (paper(body).units as unknown as Unit[]).map(textOf)
const marked = (body: string) => new TextDecoder().decode(originalFiles(paper(body), { lines: true }).get('main.tex'))
/** the reader's insertions where TeX would take them for an argument, or inside a name: none may stand there */
const misplaced = (tex: string) => [
  ...tex.matchAll(/\\(?:begin|end|label|ref|eqref|cite[a-z]*|includegraphics|input)\*?\s*(?:\[[^\]]*\])*\{[^{}]*\\(?:axt|leavevmode)/g),
  ...tex.matchAll(/\\(?:begin|hbox|vbox|vtop|raise|label|ref|cite|textbf|mbox)\s*\\(?:axt|leavevmode)/g),
].map(m => m[0])

describe('the reader writes nothing between a command and its arguments', () => {
  it('#407\'s case: a raw \\vbox{…} before \\begin{center} — its marked original keeps \\begin{center} whole', () => {
    const tex = marked('\\vbox{A boxed paragraph of words.}\\begin{center}Centered words in the paper.\\end{center}\n\nA paragraph after.')
    expect(misplaced(tex)).toEqual([])
    expect(tex).toContain('\\begin{center}')
    expect(texts('\\vbox{A boxed paragraph of words.}\\begin{center}Centered words in the paper.\\end{center}')).toEqual(['A boxed paragraph of words.', 'Centered words in the paper.'])
  })

  it('a box\'s content is its group, and the words after it are the paragraph\'s, whole (no token taken for the content)', () => {
    expect(texts('Words before \\hbox{abc def} more words after it.')).toEqual(['Words before abc def more words after it.'])
    expect(texts('Words \\vbox to 2cm{A boxed paragraph of words.} and more after.')).toEqual(['Words A boxed paragraph of words. and more after.'])
    expect(texts('Words \\hbox spread 1em{spread words} and more after.')).toEqual(['Words spread words and more after.'])
  })

  it('a label after a box is the label\'s, its key no text (2212.06817\'s figure: \\hbox{\\includegraphics…}\\label{fig:…})', () => {
    const body = 'Some words of the paper before the figure.\n\n\\centering\n\\hbox{\\includegraphics[scale=0.3]{card.png}}\n\\label{fig:main_card}\n\nWords after the figure.'
    expect(texts(body)).toEqual(['Some words of the paper before the figure.', 'Words after the figure.'])
    expect(misplaced(marked(body))).toEqual([])
  })

  it('an argument TeX takes as one token takes that command\'s own arguments with it: \\raise2pt\\hbox{…} is one call', () => {
    const tex = marked('\\raise2pt\\hbox{Raised words open the paragraph} and the paragraph goes on.')
    expect(misplaced(tex)).toEqual([])
    expect(tex).toContain('\\raise2pt\\hbox{Raised words open the paragraph}')
  })
})

describe('the role table reads TeX\'s own syntax as TeX does', () => {
  const read = (src: string, name: string) => {
    const params = paperParams(name, null)
    if (!params) throw new Error(`no parameters for ${name}`)
    const r = readArgs(src, 0, params)
    return r.complete ? r.args.map(a => src.slice(a.start, a.end).trim()) : null
  }
  it('a dimension is never a group; a box\'s specification is `to` or `spread` and a dimension', () => {
    expect(read('{words} more', 'hbox')).toEqual(['{words}'])
    expect(read(' to 2cm{words}', 'vbox')).toEqual(['to 2cm', '{words}'])
    expect(read(' spread 1em {words}', 'hbox')).toEqual(['spread 1em', '{words}'])
    expect(read('2pt\\hbox{x}', 'raise')).toEqual(['2pt', '\\hbox'])
    expect(read(' 3pt plus 1fil', 'vskip')).toEqual(['3pt plus 1fil'])
  })
})
