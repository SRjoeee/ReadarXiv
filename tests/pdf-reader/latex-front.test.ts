import { describe, expect, it } from 'vitest'
import { inMemory, loadProject, patch } from '@/pdf-reader/engine/latex-front.mjs'

// The PDF reader's LaTeX front end: what of a paper's source is prose to translate

type Unit = { kind: string; pieces: { t: string; s?: string }[] }
const project = (tex: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex')
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('')
/** every unit's words replaced by a mark of its own, and the main file as it is then typeset */
const patched = (p: ReturnType<typeof project>) => {
  const units = p.units as Unit[]
  const translated = new Map(units.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
  return new TextDecoder().decode(patch(p, translated as Map<(typeof p.units)[number], unknown[]>).get('main.tex'))
}

describe('the front matter\'s notes (1706.03762: the author block\'s footnotes stayed in English)', () => {
  const AUTHORS = '\\author{Alice\\thanks{Equal contribution. Listing order is random.}\\\\ Bob\\footnotemark[1] \\hspace{1mm}\\thanks{Work performed while at X.}}'

  it('in the preamble: each \\thanks of the author block is a footnote of its own, and the names are no unit', () => {
    const p = project(`\\documentclass{article}\\title{The Paper}${AUTHORS}\\begin{document}\\maketitle\nWords here.\\end{document}`)
    const units = p.units as Unit[]
    expect(units.filter(u => u.kind === 'footnote').map(textOf)).toEqual(['Equal contribution. Listing order is random.', 'Work performed while at X.'])
    expect(units.some(u => /Alice|Bob/.test(textOf(u)))).toBe(false)
    // typeset: the notes translated in place, the names, marks and spacing as the author wrote them
    const tex = patched(p)
    expect(tex).toMatch(/\\author\{Alice\\thanks\{<T\d+>\}\\\\ Bob\\footnotemark\[1\] \\hspace\{1mm\}\\thanks\{<T\d+>\}\}/)
  })

  it('in the body too, where some classes want the author block', () => {
    const p = project(`\\documentclass{article}\\begin{document}\\title{The Paper}${AUTHORS}\\maketitle\nWords here.\\end{document}`)
    expect((p.units as Unit[]).filter(u => u.kind === 'footnote').map(textOf)).toEqual(['Equal contribution. Listing order is random.', 'Work performed while at X.'])
    expect(patched(p)).toContain('\\author{Alice\\thanks{<T')
  })

  it('an affiliation\'s note as well; the title\'s note stays the title\'s, and the title is still the title', () => {
    const p = project('\\documentclass{article}\\title{The Paper\\thanks{Supported by a grant.}}\\author{Alice}\\affil{Somewhere\\thanks{Now elsewhere.}}\\begin{document}\\maketitle\nWords.\\end{document}')
    const units = p.units as (Unit & { title?: boolean })[]
    expect(units.filter(u => u.kind === 'footnote').map(textOf).sort()).toEqual(['Now elsewhere.', 'Supported by a grant.'])
    expect(units.filter(u => u.title).map(textOf)).toEqual(['The Paper'])
    expect(units.some(u => /Somewhere|Alice/.test(textOf(u)))).toBe(false)
  })
})

describe('declarations that take no argument (2608.05876: five of eight tables stayed in English)', () => {
  it('a table in a brace group after \\centering: the group is no argument of \\centering, and each cell is a unit', () => {
    const p = loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode('\\documentclass{article}\\begin{document}\n\\begin{table}\\centering\n{\\small\n\\begin{tabular}{ll}\\toprule[1pt]\nFrozen profile & Prompting only \\\\\n\\end{tabular}}\n\\caption{A caption here.}\n\\end{table}\n\\end{document}')]])), 'main.tex', { tables: true })
    const units = p.units as Unit[]
    expect(units.filter(u => u.kind === 'cell').map(u => textOf(u).trim())).toEqual(['Frozen profile', 'Prompting only'])
    // the rule's optional width is still the rule's
    expect(units.some(u => /1pt/.test(textOf(u)))).toBe(false)
    expect(patched(p)).toMatch(/\\centering\n\{\\small\n\\begin\{tabular\}\{ll\}\\toprule\[1pt\]<T\d+>&<T\d+>\\\\/)
  })

  it('a size switch before a group in a paragraph: the group\'s words are the paragraph\'s', () => {
    const p = project('\\documentclass{article}\\begin{document}\nWords before \\small{words inside} and after.\n\\end{document}')
    expect((p.units as Unit[]).map(u => textOf(u).trim())).toEqual(['Words before words inside and after.'])
  })
})

describe('the paper\'s own macros (2608.06007: its run-in headings \\nosection{…} stayed in English)', () => {
  const doc = (defs: string, body: string) => project(`\\documentclass{article}${defs}\\begin{document}\n${body}\n\\end{document}`)

  it('an argument the macro typesets as prose is translated, and the macro stays around it', () => {
    const p = doc('\\newcommand{\\nosection}[1]{\\vspace{3pt}\\noindent\\textbf{#1}}', '\\nosection{Contributions.}\n\nThe text of the paragraph.')
    expect((p.units as Unit[]).map(u => textOf(u).trim())).toEqual(['Contributions.', 'The text of the paragraph.'])
    expect(patched(p)).toMatch(/\\nosection\{<T0>\}/)
  })

  it('in a bare group or a box too; one handed to \\label, \\ref or math stays as it is', () => {
    const p = doc(
      '\\newcommand{\\bl}[1]{$\\bullet$\\hspace{1mm}{#1}}\\newcommand{\\hl}[1]{\\color{red}{#1}}\\newcommand\\figref[1]{Figure~\\ref{#1}}\\newcommand{\\vect}[1]{$\\mathbf{#1}$}',
      '\\bl{Bulleted words} and \\figref{fig:alpha} with \\vect{xyz} and \\hl{red words} end.',
    )
    const text = (p.units as Unit[]).map(textOf).join('|')
    expect(text).toContain('Bulleted words')
    expect(text).toContain('red words')
    expect(text).not.toMatch(/fig:alpha|xyz/)
  })

  it('with a key before the prose, or an optional first argument, the other arguments stay as they are', () => {
    const p = doc('\\newcommand{\\tagged}[2]{\\label{#1}\\textbf{#2}}\\newcommand{\\note}[2][red]{\\textcolor{#1}{#2}}', '\\tagged{key:one}{Label words} then \\note[blue]{noted words} end.')
    expect((p.units as Unit[]).map(u => textOf(u).trim()).join('')).toBe('Label words then noted words end.')
    expect(patched(p)).toMatch(/\\tagged\{key:one\}\{<T0>/)
  })

  it('one around whole paragraphs or a figure is walked as an environment is: each paragraph a unit, the call in place (2608.25210)', () => {
    const p = doc('\\newcommand{\\techreport}[1]{#1}', 'Before.\n\n\\techreport{First paragraph inside.\n\nSecond paragraph inside.}\n\nAfter.')
    expect((p.units as Unit[]).map(u => textOf(u).trim())).toEqual(['Before.', 'First paragraph inside.', 'Second paragraph inside.', 'After.'])
    expect(patched(p)).toMatch(/\\techreport\{<T1>\n\n<T2>\}/)
  })

  it('an argument without braces is one token, as TeX takes it (2608.12096: \\inline{\\onenode x})', () => {
    const p = doc('\\newcommand{\\inline}[1]{\\fbox{#1}}\\newcommand{\\onenode}[1]{\\mbox{$#1$}}', 'The graph \\inline{\\onenode x} has one node.')
    // the node's x goes with \\onenode, as a piece no engine sees
    expect((p.units as Unit[]).map(u => textOf(u).trim())).toEqual(['The graph  has one node.'])
    expect(patched(p)).toContain('\\inline{\\onenode x}')
  })

  it('a macro with two prose arguments stays opaque', () => {
    const p = doc('\\newcommand{\\pair}[2]{\\textbf{#1} and \\emph{#2}}', 'Start \\pair{first words}{second words} end.')
    expect((p.units as Unit[]).map(textOf).join('')).not.toMatch(/first words|second words/)
  })
})
