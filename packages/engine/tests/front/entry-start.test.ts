import { describe, expect, it } from 'vitest'
import { openPaper } from '../../src/compile/live.ts'
import { markUnits, patch, startOf } from '../../src/source/latex-front.ts'

// A bibliography entry whose first ink is a number the entry keeps as the original's (keepNumbers: a year, a volume): an entry
// with no author, a software's or a web page's (ACM-Reference-Format's `\bibinfo{year}{2023}\natexlab{}.`, IEEEtran's
// `(2024) {Agency} …`). Its start mark goes before the number, as before an inline formula or an identifier that comes first: TeX
// sets the number as written, the entry's first ink. Passed over as any other placeholder of a head, the year stood before the
// start mark, and where it opened a group the entry had no start mark at all: the entry's ink was read up to the next entry's
// marks, its label, its year and its address the next entry's text (2402.10294v1's references [1] to [6], F29)

type Piece = { t: string; s?: string; src?: string }
const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)
const doc = (entries: string) =>
  `\\documentclass{article}\n\\providecommand\\bibinfo[2]{#2}\\providecommand\\natexlab[1]{#1}\n\\begin{document}\nText.\n\\begin{thebibliography}{9}\n${entries}\n\\end{thebibliography}\n\\end{document}\n`
const paperOf = (entries: string) => openPaper(new Map([['main.tex', enc(doc(entries))]]))
const entriesOf = (entries: string) => paperOf(entries).units.filter((u) => u.kind === 'reference')
/** the piece the entry's start mark goes before, as its source, or null where it has none */
const startPiece = (u: { pieces: readonly Piece[] }) => {
  const [at, cut] = startOf(u.pieces as never)
  if (at < 0) return null
  const p = u.pieces[at]!
  return p.t === 'text' ? (p.s ?? '').slice(cut) : (p.src ?? p.t)
}
/** the marked main file, each unit's start and end marks markUnits' */
const marked = (entries: string) => {
  const paper = paperOf(entries)
  return dec(patch(paper.project as never, new Map(), { mark: markUnits(paper.units) }).get('main.tex')!)
}

const ACM = (key: string, year: string, title: string) =>
  `\\bibitem[${key}(${year})]%\n        {${key}}\n \\bibinfo{year}{${year}}\\natexlab{}.\n\\newblock \\bibinfo{booktitle}{\\emph{${title}}}.\n\\newblock\n\\url{https://example.org/${key}}\n`

describe("an entry whose first ink is a number it keeps: its start mark before the number, as before a formula (F29)", () => {
  it("ACM's entry with no author, the year in its field's group first: the start mark before the year", () => {
    const [a, b] = entriesOf(`${ACM('tool', '2023', 'Some Editing Tool')}\n${ACM('store', '2024', 'A Vector Store')}`)
    expect(startPiece(a!)).toBe('2023')
    expect(startPiece(b!)).toBe('2024')
  })
  it('the marked file writes the start mark inside the field, right before the year', () => {
    const tex = marked(ACM('tool', '2023', 'Some Editing Tool'))
    expect(tex).toMatch(/\\bibinfo\{year\}\{\\leavevmode\\axtmark\{\d+s\}2023\}\\natexlab\{\}\./)
  })
  it("IEEEtran's entry with no author: a declaration passed over, then the year", () => {
    const [u] = entriesOf(
      '\\bibitem{who}\n\\BIBentryALTinterwordspacing\n(2024) {WHO} Fact sheets. [Online]. Available:\n  \\url{https://example.org/who}\n\\BIBentrySTDinterwordspacing\n',
    )
    expect(startPiece(u!)).toBe('(2024)')
  })
  it('an entry with an author first: the start mark before the name, as before', () => {
    const [u] = entriesOf(
      '\\bibitem[Doe(2020)]{doe}\n\\bibfield{author}{\\bibinfo{person}{Jane Doe}.} \\bibinfo{year}{2020}\\natexlab{}.\n\\newblock \\bibinfo{title}{A Study}.\n',
    )
    expect(startPiece(u!)).toBe('Jane Doe')
  })
  it('a number after the first word is no head: the start mark before the word', () => {
    const [u] = entriesOf('\\bibitem{x}\nSmith. 2020. A study of things.\n')
    expect(startPiece(u!)).toBe('Smith. ')
  })
})
