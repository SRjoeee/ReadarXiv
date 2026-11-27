// A bibliography's field command read by the definition TeX keeps. LaTeX's \providecommand defines a command only where it is
// undefined, so the first definition in force is the one TeX uses; a paper that provides `\bibinfo` with an optional first
// argument (`[2][]{#2}`) before its bibliography makes `\bibinfo{author}{Ann Lee}` set "author" (its #2, the optional #1 taken
// as its default) and then the group "Ann Lee" as text of its own. Read as the two-argument field pair that sets its second
// argument alone (`sets` 0), the unit's source writes "Ann Lee" where TeX set "authorAnn Lee": the field names were glyphs
// no piece of the source wrote, the ownership's letters rule refused every entry (`unlocated: text past its source`), and
// every entry was drawn as the original's. The call is now read by the definition in force, as TeX reads it.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const entry =
  '\\begin{thebibliography}{9}\n\\bibitem{a} \\bibinfo{author}{Ann Lee} \\& \\bibinfo{author}{Bo Chan}\n\\newblock \\emph{\\bibinfo{title}{A long title of a book}}.\n\\end{thebibliography}'
/** the reference unit's pieces: its text, an open piece as `[` with its command and what the source reader says it sets */
const pieces = (preamble: string, head = '') => {
  const u = openPaper(
    new Map([
      [
        'main.tex',
        enc(`\\documentclass{article}\n${preamble}\\begin{document}\nSome text.\n${head}${entry}\n\\end{document}\n`),
      ],
    ]),
  ).units.find((x) => x.kind === 'reference')!
  return (u.pieces as { t: string; s?: string; src?: string; sets?: number }[]).map((p) =>
    p.t === 'text' ? p.s! : p.t === 'open' ? `[${p.src}|${p.sets ?? '-'}` : p.t === 'close' ? ']' : `<${p.src}>`,
  )
}
/** the text the source states a unit sets: its text pieces in order */
const textOf = (ps: readonly string[]) => ps.filter((p) => !/^[[\]<]/.test(p)).join('')

describe('a field command read by the definition TeX keeps', () => {
  it('the two-argument field pair sets its second argument alone (the control)', () => {
    const ps = pieces('\\providecommand{\\bibinfo}[2]{#2}\n')
    expect(ps.filter((p) => p.startsWith('[\\bibinfo'))).toEqual([
      '[\\bibinfo{author}{|0',
      '[\\bibinfo{author}{|0',
      '[\\bibinfo{title}{|0',
    ])
    expect(textOf(ps)).not.toContain('author')
  })

  it('provided with an optional first argument: the field name is the argument TeX sets, the value a group after it', () => {
    const ps = pieces('\\providecommand{\\bibinfo}[2][]{#2}\n')
    expect(ps.slice(0, 6)).toEqual(['[\\bibinfo{|0', 'author', ']', '[{|-', 'Ann Lee', ']'])
    expect(textOf(ps)).toContain('authorAnn Lee')
    expect(textOf(ps)).toContain('titleA long title of a book')
  })

  it('provided again before the bibliography with two arguments: the first definition is the one in force', () => {
    const ps = pieces('\\providecommand{\\bibinfo}[2][]{#2}\n', '\\providecommand{\\bibinfo}[2]{#2}\n')
    expect(textOf(ps)).toContain('authorAnn Lee')
  })

  it('a call that supplies the optional argument: its braced group is the argument TeX sets (Codex, local review)', () => {
    const u = openPaper(
      new Map([
        [
          'main.tex',
          enc(
            '\\documentclass{article}\n\\providecommand{\\bibinfo}[2][]{#2}\n\\begin{document}\nSome text.\n\\begin{thebibliography}{9}\n\\bibitem{a} \\bibinfo[author]{Ann Lee}, A long title of a book.\n\\end{thebibliography}\n\\end{document}\n',
          ),
        ],
      ]),
    ).units.find((x) => x.kind === 'reference')!
    const ps = (u.pieces as { t: string; s?: string; src?: string; sets?: number }[]).map((p) =>
      p.t === 'text' ? p.s! : p.t === 'open' ? `[${p.src}|${p.sets ?? '-'}` : p.t === 'close' ? ']' : `<${p.src}>`,
    )
    expect(ps.slice(0, 3)).toEqual(['[\\bibinfo[author]{|0', 'Ann Lee', ']'])
  })

  it('provided first in the bibliography with an optional argument: read so there too', () => {
    const ps = pieces('', '\\providecommand{\\bibinfo}[2][]{#2}\n')
    expect(textOf(ps)).toContain('authorAnn Lee')
  })
})

/** the reference units' pieces where the bibliography is the job's .bbl (BibTeX's, as \bibliography reads it), `head` the lines
 *  before its first entry where a style writes its definitions */
const bblPieces = (preamble: string, head: string, entries = ENTRIES) => {
  const units = openPaper(
    new Map([
      [
        'main.tex',
        enc(
          `\\documentclass{article}\n${preamble}\\begin{document}\nSome text.\n\\bibliography{refs}\n\\end{document}\n`,
        ),
      ],
      ['main.bbl', enc(`\\begin{thebibliography}{9}\n${head}\n${entries}\n\\end{thebibliography}\n`)],
    ]),
  ).units.filter((x) => x.kind === 'reference')
  return units.flatMap((u) =>
    (u.pieces as { t: string; s?: string; src?: string; sets?: number }[]).map((p) =>
      p.t === 'text' ? p.s! : p.t === 'open' ? `[${p.src}|${p.sets ?? '-'}` : p.t === 'close' ? ']' : `<${p.src}>`,
    ),
  )
}
const ENTRIES =
  '\\bibitem{a} \\bibinfo{author}{Ann Lee} \\& \\bibinfo{author}{Bo Chan}\n\\newblock \\bibinfo{journal}{Annals of Things}.'
const OPTIONAL = '\\providecommand{\\bibinfo}[2][]{#2}\n'
/** the two-argument field pair, each call read so: no field name in the text */
const PAIRS = ['[\\bibinfo{author}{|0', '[\\bibinfo{author}{|0', '[\\bibinfo{journal}{|0']

describe("a bibliography head's definitions read in the order TeX runs them", () => {
  it("a head that replaces the paper's definition: its replacement reads the entries (\\def, \\renewcommand)", () => {
    for (const head of ['\\def\\bibinfo#1#2{#2}', '\\renewcommand{\\bibinfo}[2]{#2}', '\\gdef\\bibinfo #1#2{#2}']) {
      const ps = bblPieces(OPTIONAL, head)
      expect(
        ps.filter((p) => p.startsWith('[\\bibinfo')),
        head,
      ).toEqual(PAIRS)
      expect(textOf(ps), head).not.toMatch(/author|journal/)
    }
  })

  it('a head that provides, or defines only where undefined, yields to the definition in force', () => {
    for (const head of [
      '\\providecommand{\\bibinfo}[2]{#2}',
      '\\newcommand{\\bibinfo}[2]{#2}',
      '\\ifx\\bibinfo\\undefined \\def\\bibinfo#1#2{#2}\\fi',
      '\\expandafter\\ifx\\csname bibinfo\\endcsname\\relax \\def\\bibinfo#1#2{#2}\\fi',
      '\\@ifundefined{bibinfo}{\\def\\bibinfo#1#2{#2}}{}',
    ]) {
      expect(textOf(bblPieces(OPTIONAL, head)), head).toContain('authorAnn Lee')
    }
  })

  it("in the head's own order: a later definition replaces an earlier one, a later \\providecommand does not", () => {
    expect(textOf(bblPieces('', `${OPTIONAL}\\def\\bibinfo#1#2{#2}`))).not.toMatch(/author|journal/)
    expect(textOf(bblPieces('', `\\def\\bibinfo#1#2{#2}\n${OPTIONAL}`))).not.toMatch(/author|journal/)
    const first = textOf(bblPieces('', `\\providecommand{\\bibinfo}[2]{#2}\n\\def\\bibinfo#1#2{#1}`))
    expect(first).toContain('author')
    expect(first).not.toContain('Ann Lee')
  })
})

describe("a field command's call read by its definition: its arguments, the one its body sets", () => {
  it('an optional-first wrapper of one braced argument sets that argument (\\showarticletitle[2][]{#2})', () => {
    const ps = bblPieces(
      '',
      '\\providecommand{\\showarticletitle}[2][]{#2}',
      '\\bibitem{a} Ann Lee. \\showarticletitle{A long title of a book}. Annals of Things.',
    )
    expect(textOf(ps)).toContain('A long title of a book')
    expect(ps.filter((p) => p.startsWith('<') && p.includes('long title'))).toEqual([])
  })

  it('a three-argument field command with an optional first sets its third: the field name is no text ([3][]{#3})', () => {
    for (const [preamble, head] of [
      ['\\providecommand{\\bibinfo}[3][]{#3}\n', ''],
      ['', '\\providecommand{\\bibinfo}[3][]{#3}'],
    ]) {
      const ps = bblPieces(preamble!, head!)
      expect(textOf(ps)).not.toMatch(/author|journal/)
      expect(textOf(ps)).toContain('Ann Lee')
      expect(textOf(ps)).toContain('Annals of Things')
    }
  })

  it('a definition that sets its first argument of two: the field name is the text, the value TeX drops no text', () => {
    const ps = bblPieces('', '\\def\\bibinfo#1#2{#1}')
    expect(textOf(ps)).toContain('author')
    expect(textOf(ps)).not.toContain('Ann Lee')
  })
})
