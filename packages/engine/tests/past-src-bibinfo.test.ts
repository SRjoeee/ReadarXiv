// A bibliography's field command read by the definition TeX keeps. LaTeX's \providecommand defines a command only where it is
// undefined, so the first definition in force is the one TeX uses; a paper that provides `\bibinfo` with an optional first
// argument (`[2][]{#2}`) before its bibliography makes `\bibinfo{author}{Ann Lee}` set "author" (its #2, the optional #1 taken
// as its default) and then the group "Ann Lee" as text of its own. Read as the two-argument field pair that sets its second
// argument alone (`sets` 0), the unit's source writes "Ann Lee" where TeX set "authorAnn Lee": the field names were glyphs
// no piece of the source wrote, the ownership's letters rule refused every entry (`unlocated: text past its source`), and
// every entry was drawn as the original's. RED in phase 1 of lane past-src: no product code moved.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const entry =
  '\\begin{thebibliography}{9}\n\\bibitem{a} \\bibinfo{author}{Ann Lee} \\& \\bibinfo{author}{Bo Chan}\n\\newblock \\emph{\\bibinfo{title}{A long title of a book}}.\n\\end{thebibliography}'
/** the reference unit's open pieces that name \bibinfo, with what the source reader states they set */
const bibinfoOpens = (preamble: string, head = '') => {
  const u = openPaper(
    new Map([
      [
        'main.tex',
        enc(`\\documentclass{article}\n${preamble}\\begin{document}\nSome text.\n${head}${entry}\n\\end{document}\n`),
      ],
    ]),
  ).units.find((x) => x.kind === 'reference')!
  return (u.pieces as { t: string; src?: string; sets?: number }[])
    .filter((p) => p.t === 'open' && /^\\bibinfo/.test(p.src ?? ''))
    .map((p) => p.sets)
}

describe('a field command read by the definition TeX keeps', () => {
  it('the two-argument field pair sets its second argument alone (the control)', () => {
    expect(bibinfoOpens('\\providecommand{\\bibinfo}[2]{#2}\n')).toEqual([0, 0, 0])
  })

  it('provided with an optional first argument: no pair that sets its argument alone (TeX sets the field name)', () => {
    const sets = bibinfoOpens('\\providecommand{\\bibinfo}[2][]{#2}\n')
    expect(sets.length === 0 || sets.every((s) => s !== 0)).toBe(true)
  })

  it('provided again before the bibliography with two arguments: the first definition is the one in force', () => {
    const sets = bibinfoOpens('\\providecommand{\\bibinfo}[2][]{#2}\n', '\\providecommand{\\bibinfo}[2]{#2}\n')
    expect(sets.length === 0 || sets.every((s) => s !== 0)).toBe(true)
  })
})
