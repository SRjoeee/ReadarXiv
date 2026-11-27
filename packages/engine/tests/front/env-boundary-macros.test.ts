// A paper's own macro that stands for an environment's boundary (docs/PDF-READER.md §18.73): read as the boundary it is, from the
// paper's definition in force where it is called, never from its name. Its call cuts the text as the written `\begin{…}` /
// `\end{…}` would: a list's or a box's opening ends the paragraph before it, a theorem's end closes the theorem, a display's
// opening and its end are one display. Kept as a placeholder inside the paragraph, TeX sets no ink for it, and the reader's
// layout could not prove the unit. A macro that only looks like one (its `\begin` in an argument it does not execute, in a
// conditional's branch, in a string) stays what it was. Read through the source reader's public entry, on sources of our own.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/index.ts'

type Piece = { t: string; s?: string; src?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string, preamble = '') =>
  `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`
const unitsOf = (body: string, preamble = '') =>
  openPaper(new Map([['main.tex', enc(doc(body, preamble))]])).units.map((u) => ({
    kind: u.kind,
    pieces: u.pieces as Piece[],
  }))
const textOf = (u: { pieces: Piece[] }) =>
  u.pieces
    .filter((p) => p.t === 'text')
    .map((p) => p.s)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
/** each unit as its kind, its text and its placeholders' sources */
const read = (body: string, preamble = '') =>
  unitsOf(body, preamble).map((u) => ({
    kind: u.kind,
    text: textOf(u),
    phs: u.pieces.filter((p) => p.t === 'ph').map((p) => p.src),
  }))

const LIST = '\\newcommand{\\ben}{\\begin{enumerate}}\n\\newcommand{\\een}{\\end{enumerate}}\n'
const LIST_BODY =
  'Words of the paragraph before it\n\\ben\n\\item The first item has words\n\\item The second item has words\n\\een\nWords of the paragraph after it.'
const LIST_UNITS = [
  { kind: 'para', text: 'Words of the paragraph before it', phs: [] },
  { kind: 'para', text: 'The first item has words', phs: [] },
  { kind: 'para', text: 'The second item has words', phs: [] },
  { kind: 'para', text: 'Words of the paragraph after it.', phs: [] },
]

describe("a macro whose body opens or closes a list or a box: the paragraph ends at its call, as at the written \\begin's", () => {
  it('a list opened and closed by the paper\'s macros (`\\ben … \\een`)', () => {
    expect(read(LIST_BODY, LIST)).toEqual(LIST_UNITS)
  })
  it('a list closed by a written \\end, opened by the macro', () => {
    expect(read(LIST_BODY.replace('\\een', '\\end{enumerate}'), LIST)).toEqual(LIST_UNITS)
  })
  it('a box whose options the body writes (`\\begin{mdframed}[…]`): nothing after the call is its argument', () => {
    expect(
      read(
        'Words before the box.\n\\beginCBOX Boxed words are here.\n\\closeCBOX\nWords after the box.',
        '\\newcommand{\\beginCBOX}{\\begin{mdframed}[backgroundcolor=blue!3]}\n\\newcommand{\\closeCBOX}{\\end{mdframed}}\n',
      ),
    ).toEqual([
      { kind: 'para', text: 'Words before the box.', phs: [] },
      { kind: 'para', text: 'Boxed words are here.', phs: [] },
      { kind: 'para', text: 'Words after the box.', phs: [] },
    ])
  })
  it("a body that ends at `\\begin{…}`: the environment's own arguments are read after the call, as after the written one", () => {
    expect(
      read(
        'Words before the box.\n\\bbox{0.5\\textwidth} Boxed words are here.\n\\end{minipage}\nWords after the box.',
        '\\newcommand{\\bbox}{\\begin{minipage}}\n',
      ),
    ).toEqual([
      { kind: 'para', text: 'Words before the box.', phs: [] },
      { kind: 'para', text: 'Boxed words are here.', phs: [] },
      { kind: 'para', text: 'Words after the box.', phs: [] },
    ])
  })
  it("\\newenvironment's begin and end parts used apart (`\\note … \\endnote`)", () => {
    expect(
      read(
        'Words before the note.\n\\note Inside the note there are words.\n\\endnote\nWords after the note.',
        '\\newenvironment{note}{\\begin{quote}}{\\end{quote}}\n',
      ),
    ).toEqual([
      { kind: 'para', text: 'Words before the note.', phs: [] },
      { kind: 'para', text: 'Inside the note there are words.', phs: [] },
      { kind: 'para', text: 'Words after the note.', phs: [] },
    ])
  })
  it('through another of the paper\'s macros, and through a \\let of one', () => {
    expect(read(LIST_BODY.replace('\\ben', '\\bl').replace('\\een', '\\el'), `${LIST}\\newcommand{\\bl}{\\ben}\n\\let\\el\\een\n`)).toEqual(
      LIST_UNITS,
    )
  })
})

describe("a theorem's end by the paper's macro closes the theorem", () => {
  const THM = '\\newtheorem{THM}{Theorem}\n\\newcommand{\\THEOREM}{\\begin{THM}}\n\\newcommand{\\eT}{\\end{THM}}\n'
  const UNITS = [
    { kind: 'theorem', text: 'Every graph here is fine.', phs: [] },
    { kind: 'para', text: 'Then the text goes on.', phs: [] },
  ]
  it('opened by the written \\begin', () => {
    expect(read('\\begin{THM} Every graph here is fine.\n\\eT\nThen the text goes on.', THM)).toEqual(UNITS)
  })
  it("opened by the paper's macro too", () => {
    expect(read('\\THEOREM Every graph here is fine.\n\\eT\nThen the text goes on.', THM)).toEqual(UNITS)
  })
})

describe("a display opened by the paper's macro is one display, whatever its definition takes", () => {
  const ONE = (src: string) => [{ kind: 'para', text: 'Words before the formula and words after it.', phs: [src] }]
  it('a macro of one argument, its body more than `\\begin{equation}` (`\\be{label}`)', () => {
    expect(
      read(
        'Words before the formula\n\\be{eq:a}\nx = y\n\\ee\nand words after it.',
        '\\newcommand{\\be}[1]{\\begin{equation}\\label{#1}}\n\\newcommand{\\ee}{\\end{equation}}\n',
      ),
    ).toEqual(ONE('\\be{eq:a}\nx = y\n\\ee'))
  })
  it('closed by a written \\end{equation}', () => {
    expect(
      read(
        'Words before the formula\n\\be{eq:a}\nx = y\n\\end{equation}\nand words after it.',
        '\\newcommand{\\be}[1]{\\begin{equation}\\label{#1}}\n',
      ),
    ).toEqual(ONE('\\be{eq:a}\nx = y\n\\end{equation}'))
  })
  it("a written \\begin{equation} closed by the paper's macro", () => {
    expect(
      read('Words before the formula\n\\begin{equation}\nx = y\n\\ee\nand words after it.', '\\newcommand{\\ee}{\\end{equation}}\n'),
    ).toEqual(ONE('\\begin{equation}\nx = y\n\\ee'))
  })
  it('a macro whose argument TeX delimits by a token (`\\def\\bal#1\\eal{\\begin{align}#1\\end{align}}`)', () => {
    expect(
      read('Words before the formula\n\\bal\nx &= y\n\\eal\nand words after it.', '\\def\\bal#1\\eal{\\begin{align}#1\\end{align}}\n'),
    ).toEqual(ONE('\\bal\nx &= y\n\\eal'))
  })
  it('a \\let of such a macro, and a macro whose body calls one', () => {
    const P = '\\newcommand{\\be}{\\begin{equation}}\n\\newcommand{\\ee}{\\end{equation}}\n'
    expect(read('Words before the formula\n\\bq\nx = y\n\\eq\nand words after it.', `${P}\\let\\bq\\be\n\\let\\eq\\ee\n`)).toEqual(
      ONE('\\bq\nx = y\n\\eq'),
    )
    expect(
      read('Words before the formula\n\\bx\nx = y\n\\ex\nand words after it.', `${P}\\newcommand{\\bx}{\\be}\n\\newcommand{\\ex}{\\ee}\n`),
    ).toEqual(ONE('\\bx\nx = y\n\\ex'))
    expect(
      read(
        'Words before the formula\n\\bx\nx = y\n\\ee\nand words after it.',
        `${P}\\newcommand{\\bel}[1]{\\begin{equation}\\label{#1}}\n\\newcommand{\\bx}{\\bel{eq:b}}\n`,
      ),
    ).toEqual(ONE('\\bx\nx = y\n\\ee'))
  })
})

describe('the definition in force where the macro is called decides, in the order TeX reads them', () => {
  it('a redefinition later in the preamble replaces the boundary', () => {
    expect(read(LIST_BODY, `${LIST}\\renewcommand{\\ben}{\\textbf{N}}\n`)[0]!.phs).toEqual(['\\ben'])
  })
  it('a boundary defined last in the preamble is one, whatever was defined before it', () => {
    expect(read(LIST_BODY, `\\newcommand{\\ben}{\\textbf{N}}\n\\renewcommand{\\ben}{\\begin{enumerate}}\n\\newcommand{\\een}{\\end{enumerate}}\n`)).toEqual(
      LIST_UNITS,
    )
  })
  it('the first of two preamble definitions TeX replaces is not read (`\\newcommand{\\be}[1]{…}` then `\\def\\be{…}`)', () => {
    expect(
      read(
        'Words before the formula\n\\be \\label{eq:c}\nx = y\n\\ee\nand words after it.',
        '\\newcommand{\\be}[1]{\\begin{equation}\\label{#1}}\n\\newcommand{\\ee}{\\end{equation}}\n\\def\\be{\\begin{equation}}\n',
      ),
    ).toEqual([{ kind: 'para', text: 'Words before the formula and words after it.', phs: ['\\be \\label{eq:c}\nx = y\n\\ee'] }])
  })
  it('a redefinition in the body ends the boundary from there on', () => {
    const us = read(
      'Words before the formula\n\\be\nx = y\n\\ee\nand words after it.\n\n\\renewcommand{\\be}{B}\\renewcommand{\\ee}{E}\nMore words \\be{} and \\ee{} here.',
      '\\newcommand{\\be}{\\begin{equation}}\n\\newcommand{\\ee}{\\end{equation}}\n',
    )
    expect(us[0]).toEqual({ kind: 'para', text: 'Words before the formula and words after it.', phs: ['\\be\nx = y\n\\ee'] })
    expect(us.at(-1)!.text).toBe('More words and here.')
  })
})

describe('a macro that only looks like a boundary stays what it was (the controls)', () => {
  const kept = (preamble: string) => {
    const us = read(LIST_BODY, preamble)
    // (the call a placeholder of the paragraph before the list's items, as before)
    expect(us[0]!.phs).toEqual(['\\ben'])
    expect(us[0]!.text).toBe('Words of the paragraph before it')
  }
  it('its \\begin in a string', () => kept('\\newcommand{\\ben}{\\string\\begin\\{enumerate\\}}\n'))
  it("its \\begin in a conditional's branch", () => kept('\\newcommand{\\ben}{\\iffalse\\begin{enumerate}\\fi}\n'))
  it('its \\begin in an argument a macro does not execute', () =>
    kept('\\newcommand{\\gobble}[1]{}\n\\newcommand{\\ben}{\\gobble{\\begin{enumerate}}}\n'))
  it('a meaning the reading cannot tell (an \\edef, a \\let of a character) leaves the call as it was read, the rest read', () => {
    expect(read(LIST_BODY, `${LIST}\\edef\\cx{\\ben}\n\\let\\cy=y\n`)).toEqual(LIST_UNITS)
    expect(read('Words before \\cx{} and \\cy{} after it.', `${LIST}\\edef\\cx{\\ben}\n\\let\\cy=y\n`)).toEqual([
      { kind: 'para', text: 'Words before and after it.', phs: ['\\cx{}', '\\cy{}'] },
    ])
  })
  it('a \\let made before the macro it copies is defined', () => {
    const us = read(
      'Words before the formula\n\\bq\nx = y\n\\eq\nand words after it.',
      '\\let\\bq\\be\n\\let\\eq\\ee\n\\newcommand{\\be}{\\begin{equation}}\n\\newcommand{\\ee}{\\end{equation}}\n',
    )
    expect(us).toEqual([{ kind: 'para', text: 'Words before the formula x = y and words after it.', phs: ['\\bq', '\\eq'] }])
  })
  it("a theorem's look-alike end: the written \\end closes it", () => {
    expect(
      read(
        '\\begin{THM} Every graph here is fine.\n\\eT more words.\n\\end{THM}\nThen the text goes on.',
        '\\newtheorem{THM}{Theorem}\n\\newcommand{\\eT}{\\texttt{\\string\\end\\{THM\\}}}\n',
      ).map((u) => u.kind),
    ).toEqual(['theorem', 'para'])
  })
  it("a delimited macro whose body is no environment, and one whose body sets the display whole around an undelimited argument", () => {
    expect(read('Words before \\pair a b\\endpair{} and after it.', '\\def\\pair#1\\endpair{(#1)}\n')).toEqual([
      { kind: 'para', text: 'Words before a b and after it.', phs: ['\\pair', '\\endpair{}'] },
    ])
    expect(read('Words before the formula \\eqn{x = y} and words after it.', '\\newcommand{\\eqn}[1]{\\begin{equation}#1\\end{equation}}\n')).toEqual([
      { kind: 'para', text: 'Words before the formula and words after it.', phs: ['\\eqn{x = y}'] },
    ])
  })
})
