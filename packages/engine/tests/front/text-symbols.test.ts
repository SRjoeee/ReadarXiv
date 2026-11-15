import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'
import { TEXT_CHARACTERS } from '../../src/source/latex-front.ts'
import { TEXT_SYMBOLS } from '../../src/source/text-symbols.ts'

// LaTeX's text symbols are characters of the unit's text (F9 (d)): the front end's whole table of them (TEXT_SYMBOLS), not the
// eleven it read so before, so that a symbol inside a word or a phrase is no marker that cuts it ("don\textquotesingle t",
// "hole\textendash{}galaxy", "(\S\ref{…})"). Two places stay as they were, by TeX's reading of where the symbol stands: before the
// unit's first word, where everything the unit opens with is its edge (a typed bullet that opens a hand-made list's item), and a
// note's mark — the symbols LaTeX's \@fnsymbol sets, †, ‡, § and ¶ — right after a word with no space, or alone in a
// superscript (the coordinator's ruling of 2026-11-11): "Beren Millidge\textdagger" keeps its person and its mark apart. A
// unit's letters are counted on its decoded text: a symbol's UTF-8 bytes are no letter

type Piece = { t: string; s?: string; src?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const dec = (s: string) => new TextDecoder().decode(Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff)))
const unitsOf = (body: string, preamble = '') =>
  openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`)]]),
  ).units.map((u) => ({ kind: u.kind, pieces: u.pieces as Piece[] }))
const said = (u: { pieces: Piece[] }) =>
  dec(
    u.pieces
      .filter((p) => p.t === 'text')
      .map((p) => p.s)
      .join(''),
  )
    .replace(/\s+/g, ' ')
    .trim()
const phs = (u: { pieces: Piece[] }) => u.pieces.filter((p) => p.t === 'ph').map((p) => p.src)
const one = (body: string, preamble = '') => unitsOf(body, preamble)[0]!

describe("the front end's whole table of text symbols is text inside a unit (F9 (d))", () => {
  it("is one list with the table: every entry but `\\_` (the identifier rule's) and the kernel's letters (letters of their word)", () => {
    const letters = ['o', 'O', 'ss', 'ae', 'AE', 'oe', 'OE', 'aa', 'AA', 'l', 'L']
    expect([...TEXT_CHARACTERS.keys(), ...letters, '_'].map((n) => `\\${n}`).sort()).toEqual(Object.keys(TEXT_SYMBOLS).sort())
    for (const [n, c] of TEXT_CHARACTERS) expect(TEXT_SYMBOLS[`\\${n}`], n).toBe(c)
  })
  it('inside the text each is its character, TeX\'s skipped space after a control word with it', () => {
    const u = one('See \\S 3 at 20\\textdegree C on black hole\\textendash{}galaxy pairs\\dots{} as noted.')
    expect(said(u)).toBe('See §3 at 20°C on black hole–galaxy pairs… as noted.')
    expect(phs(u)).toEqual([])
  })
  it('a symbol inside a word is no marker that cuts it', () => {
    const u = one("We don\\textquotesingle t read the paper\\textquotesingle s tables and\\slash or its figures.")
    expect(said(u)).toBe("We don't read the paper's tables and/or its figures.")
  })
  it('a section sign after an opening parenthesis or a word and a space is text: (§ before a reference)', () => {
    const u = one('Results are shown later (\\S\\ref{sec:a}) and in \\S 4 of the report.')
    expect(said(u)).toBe('Results are shown later (§) and in §4 of the report.')
    expect(phs(u)).toEqual(['\\ref{sec:a}'])
  })
})

describe("before the unit's first word a symbol is the unit's edge, as everything it opens with is", () => {
  it('a typed bullet opening an item of a hand-made list', () => {
    const u = one('\\textbullet The driver mapping holds every field.')
    expect(phs(u)).toEqual(['\\textbullet'])
    expect(said(u)).toBe('The driver mapping holds every field.')
  })
  it('after a formula that opens the unit, the first word as the start mark reads it, a symbol is text', () => {
    const u = one('$\\leq 5$\\% of the rated load at any time.')
    expect(phs(u)).toEqual(['$\\leq 5$'])
    expect(said(u)).toBe('% of the rated load at any time.')
  })
  it('one of the escaped characters at a cell\'s head likewise: `\\#` before its word', () => {
    const cells = unitsOf('\\begin{tabular}{ll}\n\\# layers & Model size \\\\\n\\end{tabular}').filter((u) => u.kind === 'cell')
    expect(cells.map((c) => [phs(c), said(c)])).toEqual([
      [['\\#'], 'layers'],
      [[], 'Model size'],
    ])
  })
})

describe("a note's mark right after a word, or alone in a superscript, stays an element (the coordinator's ruling)", () => {
  it("an author's name and its dagger: the mark apart from the name", () => {
    const u = unitsOf('\\maketitle Body text here.', '\\title{A Title}\\author{Jane Doe\\textdagger, John Roe\\textdagger}').find(
      (x) => x.kind === 'author',
    )!
    expect(phs(u)).toEqual(['\\textdagger', '\\textdagger'])
    expect(said(u)).toBe('Jane Doe, John Roe')
  })
  it('a run of marks after a word, a group closed between them and the word: each an element', () => {
    const u = one('The \\textbf{result}\\dag\\ddag{} holds for every case.')
    expect(phs(u)).toEqual(['\\dag', '\\ddag{}'])
  })
  it('alone in a superscript: the superscript one element, as it was', () => {
    const u = one('The result\\textsuperscript{\\textdagger} holds for every case.')
    expect(phs(u)).toEqual(['\\textsuperscript{\\textdagger}'])
  })
  it('a mark after a space is text: a note key inside a note', () => {
    const u = one('Funded by the agency. \\textdagger Corresponding author of the work.')
    expect(said(u)).toBe('Funded by the agency. †Corresponding author of the work.')
  })
})

describe("a unit's letters are counted on its decoded text", () => {
  it("an ellipsis's UTF-8 bytes are no letter: a cell of one letter and an ellipsis is no unit", () => {
    const cells = unitsOf('\\begin{tabular}{ll}\nOur method & 3k\\dots \\\\\n\\end{tabular}').filter((u) => u.kind === 'cell')
    expect(cells.map(said)).toEqual(['Our method'])
  })
})
