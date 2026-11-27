import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'

// A bibliography entry's key (docs/PDF-READER.md §20.3): the `\bibitem`'s argument, which hyperref names the entry's destination
// by (`cite.<key>`), kept with the entry's first unit where the argument is characters only as the source reader reads it: no
// control sequence, no group, no comment, no active character (nothing TeX would expand). Every other character is the key's as
// written, `_`, `:`, `+`, `/`, `.`, `-`, `&` among them: whether a destination's name equals `cite.` and it is the landing's to
// read, never a class of characters.

const enc = (s: string) => new TextEncoder().encode(s)
const doc = (entries: string) =>
  `\\documentclass{article}\n\\begin{document}\nText.\n\\begin{thebibliography}{9}\n${entries}\n\\end{thebibliography}\n\\end{document}\n`
const entriesOf = (files: Record<string, string>) =>
  openPaper(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)]))).units.filter((u) => u.kind === 'reference')
const keysOf = (entries: string) => entriesOf({ 'main.tex': doc(entries) }).map((u) => u.key)

describe("a bibliography entry's key, the \\bibitem's argument (cite.<key>)", () => {
  it('a plain key, with a label or without', () => {
    expect(keysOf('\\bibitem{doe2020}\nJane Doe. A study. 2020.\n\\bibitem[Roe(2021)]{roe21}\nJohn Roe. Another. 2021.\n')).toEqual(
      ['doe2020', 'roe21'],
    )
  })
  it('every character a key may hold as written: _ : + / . - & and digits, case kept', () => {
    expect(keysOf('\\bibitem[Doe(2020)]{Doe_2020:a+b/c.d-e&F9}\nJane Doe. A study. 2020.\n')).toEqual([
      'Doe_2020:a+b/c.d-e&F9',
    ])
  })
  it('a label of a group of its own, the argument after spaces and a line end (a .bbl as BibTeX writes it)', () => {
    expect(keysOf('\\bibitem[{Doe et~al.(2020)}]%\n  {doe:2020}\nJane Doe. A study. 2020.\n')).toEqual(['doe:2020'])
  })
  it('an argument that is more than characters gives no key: a control sequence, a group, an active character', () => {
    expect(
      keysOf(
        [
          '\\bibitem{\\keyname}\nOne. 2020.',
          '\\bibitem{a{b}c}\nTwo. 2020.',
          '\\bibitem{a~b}\nThree. 2020.',
          '\\bibitem{plain}\nFour. 2020.',
        ].join('\n'),
      ),
    ).toEqual([undefined, undefined, undefined, 'plain'])
  })
  it("a comment in the argument is TeX's to drop, with its line's end and the next line's leading spaces: apacite's `{%` form", () => {
    expect(keysOf('\\bibitem [\\protect \\citeauthoryear {%\nDoe%\n}{%\nDoe%\n}{%\n{\\protect \\APACyear {2020}}%\n}]{%\ndoe2020where}\nJane Doe. 2020.\n')).toEqual([
      'doe2020where',
    ])
    expect(keysOf('\\bibitem{ab%\n   cd}\nOne. 2020.\n')).toEqual(['abcd'])
  })
  it("REVTeX's entry between \\BibitemOpen and \\BibitemShut keeps its key", () => {
    expect(keysOf('\\bibitem [{\\citenamefont {Doe}(2020)}]{Doe2020}\\BibitemOpen Jane Doe, A study (2020)\\BibitemShut {NoStop}\n')).toEqual(
      ['Doe2020'],
    )
  })
  it("the job's .bbl, read where \\bibliography stands: its entries' keys", () => {
    const main = '\\documentclass{article}\n\\begin{document}\nText \\cite{a-1}.\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n'
    const bbl = '\\begin{thebibliography}{1}\n\n\\bibitem{a-1}\nA.~Author.\n\\newblock A title.\n\\newblock 2020.\n\n\\end{thebibliography}\n'
    expect(entriesOf({ 'main.tex': main, 'main.bbl': bbl }).map((u) => u.key)).toEqual(['a-1'])
  })
  it("an entry's later paragraph, TeX's other unit of it, carries no key: the key is the entry's first unit's", () => {
    const units = entriesOf({ 'main.tex': doc('\\bibitem{two}\nFirst paragraph of it.\n\nSecond paragraph of it.\n') })
    expect(units.map((u) => u.key)).toEqual(['two', undefined])
  })
})

// An entry is one unit from its \bibitem to the next (latex-front.ts bibliography): an environment written inside it, one its
// package defines to set no paragraph, is part of it, its \begin and \end a pair round its body in the entry's unit. apacite
// writes an entry's authors in `APACrefauthors` (apacite.sty: `\begingroup \APACrefauthstyle` … `\endgroup`) and the rest of the
// entry after it in field commands of its own: read as one environment of its own, the entry was cut after its authors, and the
// rest, no word of it outside a command's argument, was no unit at all (its ink an ink unit made on the page).
const APA = (key: string, who: string, title: string) =>
  [
    `\\bibitem [\\protect \\citeauthoryear {%\n${who}%\n}{%\n${who}%\n}{%\n{\\protect \\APACyear {2020}}%\n}]{%\n${key}}`,
    `\\APACinsertmetastar {%\n${key}}%`,
    '\\begin{APACrefauthors}%',
    `${who}, J\\BPBI E.%`,
    '\\end{APACrefauthors}%',
    '\\unskip\\',
    '\\newblock',
    '\\APACrefYearMonthDay{2020}{}{}.',
    '\\newblock',
    `{\\BBOQ}\\APACrefatitle {${title}} {${title}}{\\BBCQ}`,
    '\\newblock',
    '\\APACjournalVolNumPages{A Journal}{1}{2}{3--4}.',
    '\\PrintBackRefs{\\CurrentBib}',
    '',
  ].join('\n')
const textOf = (u: { pieces: readonly { t: string; s?: string; src?: string }[] }) =>
  u.pieces.map((p) => (p.t === 'text' ? p.s : `<${p.t}:${(p.src ?? '').slice(0, 24)}>`)).join('')

describe('an environment written in an entry is part of it: the entry one unit', () => {
  it("apacite's entry: its authors and the rest one unit, the environment a pair round the authors, the key its own", () => {
    const units = entriesOf({ 'main.tex': doc(`${APA('doe2020', 'Doe', 'A Title of Ours')}\n${APA('roe2021', 'Roe', 'Another Title')}`) })
    expect(units.map((u) => u.key)).toEqual(['doe2020', 'roe2021'])
    const [a] = units
    const t = textOf(a!)
    expect(t).toMatch(/^<ph:\\APACinsertmetastar[^>]*><open:\\begin\{APACrefauthors\}/)
    expect(t).toContain('Doe, J')
    expect(t).toContain('<close:\\end{APACrefauthors}')
    expect(t).toContain('APACrefatitle')
    expect(t).toContain('APACjournalVolNumPages')
  })
  it('an environment outside a bibliography still ends the paragraph’s unit, as before', () => {
    const units = openPaper(
      new Map([['main.tex', enc('\\documentclass{article}\n\\begin{document}\nBefore it.\n\\begin{quote}Inside it.\\end{quote}\nAfter it.\n\\end{document}\n')]]),
    ).units.map((u) => u.pieces.map((p) => (p.t === 'text' ? p.s : '')).join('').trim())
    expect(units).toEqual(['Before it.', 'Inside it.', 'After it.'])
  })
})

describe('a theorem written in an entry stays a theorem: its title a heading, its body its own (the walk reads it apart)', () => {
  it('a remark of the paper’s with a title, inside an entry: the title a heading unit, the remark a theorem unit, the entry before it its own', () => {
    const tex =
      '\\documentclass{article}\n\\newtheorem{remark}{Remark}\n\\begin{document}\nText.\n\\begin{thebibliography}{9}\n\\bibitem{t}\nAuthor. A title of ours. 2020.\n\\begin{remark}[Limitations of the study]\nA remark of ours.\n\\end{remark}\n\\end{thebibliography}\n\\end{document}\n'
    const units = openPaper(new Map([['main.tex', enc(tex)]])).units
    // (its text pieces: the year is a number the entry keeps, a placeholder)
    const text = (u: (typeof units)[number]) => u.pieces.map((p) => (p.t === 'text' ? p.s : '')).join('').trim()
    expect(units.filter((u) => u.kind === 'heading').map(text)).toContain('Limitations of the study')
    expect(units.filter((u) => u.kind === 'theorem').map(text)).toContain('A remark of ours.')
    expect(units.filter((u) => u.kind === 'reference').map((u) => [u.key, text(u)])).toContainEqual(['t', 'Author. A title of ours.'])
  })
})
