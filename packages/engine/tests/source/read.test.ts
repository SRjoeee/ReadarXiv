import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { DEFINITIONS_FORMAT, NO_DEFINITIONS, readDefinitions } from '../../src/source/definitions.ts'
import { ReadBound, readSource, type SourceUnit, WALK_DEPTH } from '../../src/source/read.ts'

const tree = (files: Record<string, string>, main = 'main.tex') => ({
  main,
  files: new Map(Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)])),
})
const doc = (body: string, preamble = '', defs = NO_DEFINITIONS) =>
  readSource(
    tree({ 'main.tex': `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n` }),
    defs,
  )
/** a unit's pieces as the id reads them: t text, p element, o/c a span's open and close, n a nested unit (an explicit
 *  stack: spans nest deep) */
const flat = (content: readonly Piece[]): string[][] => {
  const out: string[][] = []
  const stack: { list: readonly Piece[]; k: number; close?: string }[] = [{ list: content, k: 0 }]
  while (stack.length) {
    const top = stack[stack.length - 1] as { list: readonly Piece[]; k: number; close?: string }
    if (top.k >= top.list.length) {
      stack.pop()
      if (top.close !== undefined) out.push(['c', top.close])
      continue
    }
    const p = top.list[top.k++] as Piece
    if (p.t === 'text') out.push(['t', p.s])
    else if (p.t === 'el') out.push(['p', p.src, p.kind])
    else if (p.t === 'span') {
      if (p.open !== undefined) out.push(['o', p.open, p.style])
      stack.push(p.close !== undefined ? { list: p.content, k: 0, close: p.close } : { list: p.content, k: 0 })
    } else out.push(['n', p.pre, p.post])
  }
  return out
}
const text = (u: SourceUnit) =>
  flat(u.content)
    .map((p) => (p[0] === 't' ? p[1] : p[0] === 'p' ? '·' : ''))
    .join('')
/** TeX's records as the definitions pass writes them */
const records = (...lines: string[]) =>
  readDefinitions(
    [`H ${DEFINITIONS_FORMAT}`, ...lines, `END ${lines.filter((l) => l.startsWith('M ')).length}`].join('\n'),
  )

describe('readSource: the cut', () => {
  it('cuts paragraphs at TeX’s paragraph ends, a comment’s empty line one of them', () => {
    const d = doc('First words here.\n\nSecond words here. % note\n\nThird words here.')
    expect(d.units.map((u) => [u.kind, text(u).trim()])).toEqual([
      ['para', 'First words here.'],
      ['para', 'Second words here.'],
      ['para', 'Third words here.'],
    ])
  })
  it('types the pieces where they are cut: math, a citation, a reference, a span’s style', () => {
    const [u] = doc('We see $x^2$ in \\cite{k} and \\ref{s}, \\emph{really}.').units
    expect(flat((u as SourceUnit).content)).toEqual([
      ['t', '\nWe see '],
      ['p', '$x^2$', 'math'],
      ['t', ' in '],
      ['p', '\\cite{k}', 'cite'],
      ['t', ' and '],
      ['p', '\\ref{s}', 'ref'],
      ['t', ', '],
      ['o', '\\emph{', 'italic'],
      ['t', 'really'],
      ['c', '}'],
      ['t', '.\n'],
    ])
  })
  it('nests a footnote in its paragraph, the inner unit first', () => {
    const d = doc('Words before\\footnote{A note of words.} words after.')
    expect(d.units.map((u) => u.kind)).toEqual(['footnote', 'para'])
    const outer = d.units[1] as SourceUnit
    expect(flat(outer.content)).toContainEqual(['n', '\\footnote{', '}'])
    expect(outer.content.find((p) => p.t === 'unit')).toMatchObject({ unit: d.units[0]?.id })
  })
  it('makes each table cell a unit, and gives equal units one id', () => {
    const d = doc('\\begin{tabular}{lll}\nOne & Same words & Two \\\\\nThree & Same words & Four\n\\end{tabular}')
    const cells = d.units.filter((u) => u.kind === 'cell')
    expect(cells.map((u) => text(u).trim())).toEqual(['One', 'Same words', 'Two', 'Three', 'Same words', 'Four'])
    expect(cells[1]?.id).toBe(cells[4]?.id)
    expect(new Set(cells.map((u) => u.id)).size).toBe(5)
  })
})

describe('readSource: the three gaps the dossier found by probe', () => {
  it('reads a file \\input unbraced, as TeX does', () => {
    const d = readSource(
      tree({
        'main.tex': '\\documentclass{article}\\begin{document}\n\\input sections/intro\nAfter it.\n\\end{document}',
        'sections/intro.tex': 'The introduction holds these words.',
      }),
      NO_DEFINITIONS,
    )
    expect(d.files).toContain('sections/intro.tex')
    expect(d.units.map((u) => text(u).trim())).toEqual(['The introduction holds these words.', 'After it.'])
  })
  it('walks the text of a \\NewDocumentCommand macro as a span, as a \\newcommand one, by TeX’s specification and code', () => {
    const preamble = '\\NewDocumentCommand{\\note}{m}{\\textbf{#1}}\n'
    const defs = records(
      'M note \\protected macro:->\\__cmd_start:nNNnnn {m}\\note  \\note code {\\__cmd_grab_m_1:w }{}{}',
      'S note m',
      'C note \\protected\\long macro:#1->\\textbf {#1}',
      'M NewDocumentCommand \\protected\\long macro:#1#2#3->\\__cmd_check_definable:nNT {#1}',
    )
    const [u] = doc('A \\note{marked phrase} here.', preamble, defs).units
    expect(flat((u as SourceUnit).content)).toEqual([
      ['t', '\nA '],
      ['o', '\\note{', 'group'],
      ['t', 'marked phrase'],
      ['c', '}'],
      ['t', ' here.\n'],
    ])
  })
  it('reads groups and spans nested past any recursion limit', () => {
    const n = 20_000
    const d = doc(`Words ${'{'.repeat(n)}deep${'}'.repeat(n)} and ${'\\textbf{'.repeat(n)}bold${'}'.repeat(n)} end.`)
    expect(d.units).toHaveLength(1)
    const pieces = flat((d.units[0] as SourceUnit).content)
    expect(pieces.filter((p) => p[0] === 'o')).toHaveLength(2 * n)
    expect(text(d.units[0] as SourceUnit).trim()).toBe('Words deep and bold end.')
  })
})

describe('readSource: what TeX holds decides', () => {
  it('walks only the branch TeX takes of a \\newif conditional, by its value at the document’s start', () => {
    const defs = records('M ifdraft \\iffalse', 'M drafttrue macro:->\\let \\ifdraft \\iftrue ')
    const d = doc('\\ifdraft Draft words only.\\else Final words only.\\fi', '\\newif\\ifdraft\n', defs)
    expect(d.units.map((u) => text(u))).toEqual(['· Final words only.·\n'])
  })
  it('takes no theorem for an environment whose meaning sets no run-in head', () => {
    const defs = records(
      'M algorithm macro:->\\@protected@testopt \\algorithm \\\\algorithm {htbp}',
      'M endalgorithm macro:->\\end {algocf@algorithm}',
    )
    const d = doc('\\begin{algorithm}\nSome steps of words.\n\\end{algorithm}', '', defs)
    expect(d.units.map((u) => u.kind)).toEqual(['para'])
  })
})

// Each class of difference against today's reader (lanes/L2-source.md, the exit's classes 1 to 10), on the minimal source
// that shows it: what TeX does there, which the new reader follows
describe('readSource: the corrections of stage 1c, each on its minimal source', () => {
  it('1. reads a file in the Latin encoding the paper declares to inputenc, as TeX reads its bytes', () => {
    const t = 'Une phrase en fran\xe7ais, d\xe9j\xe0 lue.'
    const bytes = Uint8Array.from(
      `\\documentclass{article}\n\\usepackage[latin1]{inputenc}\n\\begin{document}\n${t}\n\\end{document}\n`,
      (c) => c.charCodeAt(0),
    )
    const d = readSource({ main: 'main.tex', files: new Map([['main.tex', bytes]]) }, NO_DEFINITIONS)
    expect(d.units.map((u) => text(u).trim())).toEqual(['Une phrase en français, déjà lue.'])
  })
  it('2. ends a table’s row after a macro whose meaning ends with \\\\, whatever its source’s comment after it', () => {
    const defs = records('M dirrow \\long macro:#1->\\multicolumn {2}{l}{\\itshape #1\\rule [-3pt]{0pt}{10pt}}\\\\')
    const d = doc(
      '\\begin{tabular}{ll}\nOne cell & Two cell \\\\\n\\dirrow{Words of the row}\n\\midrule\nThree cell & Four cell \\\\\n\\end{tabular}',
      '\\newcommand\\dirrow[1]{\\multicolumn{2}{l}{\\itshape #1\\rule[-3pt]{0pt}{10pt}}\\\\%\n}\n',
      defs,
    )
    expect(d.units.map((u) => text(u).trim())).toEqual([
      'One cell',
      'Two cell',
      'Words of the row',
      '·\nThree cell',
      'Four cell',
    ])
  })
  it('3. sets no word of a branch the body’s own \\Xtrue turns away (TeX: \\let\\ifX\\iftrue)', () => {
    const defs = records(
      'M ifLong \\iffalse',
      'M Longtrue macro:->\\let \\ifLong \\iftrue ',
      'M Longfalse macro:->\\let \\ifLong \\iffalse ',
    )
    const d = doc(
      '\\Longtrue\n\\ifLong\\else\nShort version words only.\n\\fi\nCommon words for both.',
      '\\newif\\ifLong\n',
      defs,
    )
    expect(d.units.map((u) => text(u).replace(/\s+/g, ' ').trim())).toEqual(['· ·· Common words for both.'])
  })
  it('4. reads natbib’s \\natexlab as TeX holds it (macro:#1->): its letter no text, whatever the .bbl provides', () => {
    const defs = records('M natexlab macro:#1->')
    const d = doc(
      '\\begin{thebibliography}{9}\n\\providecommand{\\natexlab}[1]{#1}\n\\bibitem{a} A.~Author, 2020{\\natexlab{a}}, A title of words.\n\\end{thebibliography}',
      '',
      defs,
    )
    const [u] = d.units.filter((x) => x.kind === 'reference')
    expect(flat((u as SourceUnit).content)).toContainEqual(['p', '\\natexlab{a}', 'other'])
    expect(text(u as SourceUnit)).not.toMatch(/\ba\}/)
  })
  it('5. reads the words of a paper’s own environment TeX sets, as any other text', () => {
    const defs = records(
      'M folha macro:->\\@protected@testopt \\folha \\\\folha {x}',
      'M endfolha \\long macro:->\\relax ',
    )
    const d = doc(
      '\\begin{folha}\n\\begin{flushright}\n\\parbox{2in}{{\\bfseries{"Line one of words.\\\\\nLine two of words."}}}\n\\end{flushright}\n\\end{folha}',
      '\\newenvironment{folha}[1][x]{}{}\n',
      defs,
    )
    expect(d.units.map((u) => text(u).replace(/\s+/g, ' ').trim())).toEqual([
      '·"Line one of words.· Line two of words."',
    ])
  })
  it('6. reads a note inside a group of an author block once, nested where TeX sets its mark, the row whole', () => {
    const d = doc(
      '\\maketitle\nBody words here.',
      '\\author{\\textbf{Ann Author\\thanks{A note of several words.}} \\and Bob Author}\n',
    )
    const notes = d.units.filter((u) => u.kind === 'footnote')
    expect(notes.map((u) => text(u))).toEqual(['A note of several words.'])
    const ann = d.units.find((u) => u.kind === 'author' && text(u).includes('Ann')) as SourceUnit
    expect(flat(ann.content)).toEqual([
      ['o', '\\textbf{', 'bold'],
      ['t', 'Ann Author'],
      ['n', '\\thanks{', '}'],
      ['c', '}'],
      ['t', ' '],
    ])
  })
  it('7. sets none of the lines of a comment.sty environment TeX excludes (\\def\\ProcessCutFile{})', () => {
    const defs = records(
      "M CCSXML macro:->\\endgroup \\message {Excluding 'CCSXML' comment.}\\begingroup \\DefaultCutFileName \\def \\ProcessCutFile {}\\def \\ThisComment ##1{}\\ProcessComment {CCSXML}",
      'M endCCSXML undefined',
    )
    const d = doc(
      '\\begin{CCSXML}\n<ccs2012>\n<concept>\n<concept_id>10010147</concept_id>\n</concept>\n</ccs2012>\n\\end{CCSXML}\nBody words here.',
      '\\usepackage{comment}\n\\excludecomment{CCSXML}\n',
      defs,
    )
    expect(d.units.map((u) => text(u).trim())).toEqual(['Body words here.'])
  })
  it('8. keeps a package’s float over a later \\newtheorem of the same name (LaTeX refuses the second definition)', () => {
    const defs = records('M algorithm macro:->\\@protected@testopt \\algorithm \\\\algorithm {htbp}')
    const d = doc(
      '\\begin{algorithm}\nSome steps of words.\n\\end{algorithm}',
      '\\newtheorem{algorithm}{Algorithm}\n',
      defs,
    )
    expect(d.units.map((u) => u.kind)).toEqual(['para'])
  })
  it('9. sets the branch TeX takes of \\ifdefined, by TeX’s meaning at the document’s start', () => {
    const defs = records('M Preprint macro:->1')
    const d = doc(
      '\\ifdefined\\Preprint\nThe preprint words.\n\\else\nThe other words.\n\\fi',
      '\\newcommand\\Preprint{1}\n',
      defs,
    )
    expect(d.units.map((u) => text(u).replace(/\s+/g, ' ').trim())).toEqual(['· The preprint words. ·'])
  })
  it('10. ends a formula at its own group’s math shift: a $ inside \\text{…} is that group’s formula', () => {
    const [u] = doc('We have $u = v \\text{ for a.e. $t$}$, and more words $x$ here.', '\\usepackage{amsmath}\n').units
    expect(flat((u as SourceUnit).content)).toEqual([
      ['t', '\nWe have '],
      ['p', '$u = v \\text{ for a.e. $t$}$', 'math'],
      ['t', ', and more words '],
      ['p', '$x$', 'math'],
      ['t', ' here.\n'],
    ])
  })
})

describe('readSource: the paper’s own words, as TeX holds them', () => {
  it('reads theorem names, cleveref’s and hyperref’s words and babel’s in force from the definitions, plain words alone', () => {
    const defs = records(
      'M thm macro:->\\@thm {thm}{Teorema}',
      'M lem macro:->\\@thm {\\let \\thm@swap \\@gobble \\th@plain }{thm}{Lema}',
      'M rem \\long macro:->\\thmt@parsetheoremargs {rem}',
      'M thmt@original@rem macro:->\\@thm {\\th@remark }{rem}{Observação}',
      'M claim macro:->\\@spthm {claim}{Claim}{\\bfseries }{\\itshape }',
      'M fancy macro:->\\@thm {fancy}{\\textsc {Fancy}}',
      'M cref@thm@name macro:->teorema',
      'M cref@thm@name@plural macro:->teoremas',
      'M sectionautorefname macro:->Sec.',
      'M figurename macro:->Figura',
      'M refname macro:->\\textsc {Refs}',
    )
    const d = doc(
      '\\begin{thm}A b.\\end{thm}\\begin{lem}C d.\\end{lem}\\begin{rem}E f.\\end{rem}\\begin{claim}G h.\\end{claim}\\begin{fancy}I j.\\end{fancy}',
      '\\newtheorem{thm}{Teorema}\\newtheorem{lem}[thm]{Lema}\\newtheorem{fancy}{\\textsc{Fancy}}\n',
      defs,
    )
    expect(d.names).toEqual([
      ['theorem:thm', 'Teorema'],
      ['theorem:lem', 'Lema'],
      ['theorem:rem', 'Observação'],
      ['theorem:claim', 'Claim'],
      ['autoref:section', 'Sec.'],
      ['cref:thm', 'teorema'],
      ['cref:thm:plural', 'teoremas'],
      ['babel:figure', 'Figura'],
    ])
  })
})

describe('readSource: a display’s own stop', () => {
  it('states on the display’s element the punctuation it sets at its end that is its sentence’s', () => {
    const [u] = doc(
      'We have\n\\begin{equation}\nx = y.\\label{e}\n\\end{equation}\nand\n\\[ a = \\left. b \\right. \\]\nand\n\\[ c,\\quad \\]\nso.',
      '\\usepackage{amsmath}\n',
    ).units
    const els = (u as SourceUnit).content.filter((p) => p.t === 'el')
    expect(els.map((p) => (p.t === 'el' ? [p.kind, p.stop] : []))).toEqual([
      ['display', '.'],
      ['display', undefined],
      ['display', ','],
    ])
  })
})

describe('readSource: its bounds', () => {
  // (a link's text, a note, an environment: the walk enters each by a call of its own; TeX stops at 255 grouping levels)
  const nested = (n: number, open: string, close: string) => `${open.repeat(n)}deep${close.repeat(n)}`
  it('ends in ReadBound, not a stack overflow, where the walk nests past WALK_DEPTH, executed by TeX or not', () => {
    expect(() => doc(`Text ${nested(100_000, '\\href{u}{', '}')} here.`)).toThrow(ReadBound)
    expect(() => doc(`Text ${nested(300, '\\footnote{', '}')} here.`)).toThrow(ReadBound)
    expect(() => doc(`Text ${nested(100_000, '\\begin{itemize}\\item ', '\\end{itemize}')} here.`)).toThrow(ReadBound)
  })
  it('walks no part TeX never sets: a false branch, the text after \\end{document}', () => {
    const skipped = doc(`Text \\iffalse ${nested(100_000, '\\href{u}{', '}')}\\fi here.`)
      .units.map(text)
      .join('')
    expect(skipped).toContain('here.')
    expect(skipped).not.toContain('deep')
    const after = readSource(
      tree({
        'main.tex': `\\documentclass{article}\\begin{document}\nText here.\n\\end{document}\n${nested(100_000, '\\href{u}{', '}')}`,
      }),
      NO_DEFINITIONS,
    )
    expect(after.units.map(text).join('')).not.toContain('deep')
  })
  it('reads a nesting just under its bound', () => {
    const d = doc(`Text ${nested(WALK_DEPTH - 8, '\\href{u}{', '}')} here.`)
    expect(d.units.some((u) => text(u).includes('deep'))).toBe(true)
  })
})
