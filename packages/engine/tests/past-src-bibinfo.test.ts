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
