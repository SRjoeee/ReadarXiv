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
  it('an argument that is more than characters gives no key: a control sequence, a group, an active character, a comment', () => {
    expect(
      keysOf(
        [
          '\\bibitem{\\keyname}\nOne. 2020.',
          '\\bibitem{a{b}c}\nTwo. 2020.',
          '\\bibitem{a~b}\nThree. 2020.',
          '\\bibitem{ab%\n}\nFour. 2020.',
          '\\bibitem{plain}\nFive. 2020.',
        ].join('\n'),
      ),
    ).toEqual([undefined, undefined, undefined, undefined, 'plain'])
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
