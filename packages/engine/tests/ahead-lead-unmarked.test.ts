// A placeholder right after a paper's macro has its marks where TeX answered that they move nothing (the probe's look-ahead
// section: aheadSamples, readMarkProbe 0 or 1), as the marking takes the answer: but only where the macro got its own opening mark
// (layoutMarking's `opened`). A macro that has none of its own by the marking's own rules (passed over at its unit's head before
// the start mark: a cell's `\boldmath`, an author's `\IEEEauthorrefmark{2}`; or one TeX answered sets no ink: a reference's
// `\doiprefix`) left the placeholder after it unmarked whatever TeX answered, and its unit the original's. The mark the answer
// allows is given there too. Content of our own, through the source reader, the samples and the marking with TeX's answer given.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { aheadSamples, LAYOUT_CLASSES, layoutMarking } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
type Ph = { t: string; s?: string; src?: string }
/** the marked unit holding the placeholder `follows`, with TeX's answer `code` for the pair of `lead` and it */
function marked(
  body: string,
  preamble: string,
  lead: string,
  follows: string,
  code: string,
  inkless: string[] = [],
  own: Record<string, string> = {},
) {
  const paper = openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`)]]),
  )
  const sample = aheadSamples(paper.units).find((s) => s.src === lead && s.follows === follows)
  if (!sample) throw new Error(`no pair ${lead} ${follows}`)
  const { units } = layoutMarking(paper.units, LAYOUT_CLASSES, { switches: { ...own, [sample.key]: code }, inkless })
  for (const [i, u] of (paper.units as { pieces: Ph[] }[]).entries()) {
    const k = u.pieces.findIndex((p) => p.t === 'ph' && p.src === follows)
    if (k >= 0) return { name: `p${i}.${k}`, written: (units[i]!.pieces as Ph[]).map((p) => p.src ?? p.s).join('') }
  }
  throw new Error(`no placeholder ${follows}`)
}
const PRE = '\\newcommand{\\mylead}{\\bfseries}\n'

describe('TeX answered that marks after a paper’s macro move nothing, and the macro had no mark of its own', () => {
  it('a macro passed over at its unit’s head: the formula after it has its opening mark', () => {
    const x = marked('\\mylead $x$ and our own words of a paragraph go on after it.', PRE, '\\mylead', '$x$', '0')
    expect(x.written).toContain(`{${x.name}a}`)
  })
  it('a macro TeX answered sets no ink: the placeholder after it has its opening mark', () => {
    const x = marked(
      'Our own words of a paragraph with \\mylead\\url{https://example.org/ours} in it and more words.',
      PRE,
      '\\mylead',
      '\\url{https://example.org/ours}',
      '0',
      ['\\mylead'],
      // (TeX's answer for the URL's own command before the text after it: its marks move nothing)
      { '\\url': '00000000' },
    )
    expect(x.written).toContain(`{${x.name}a}`)
  })
  it('TeX answered 2: no mark (control)', () => {
    const x = marked('\\mylead $x$ and our own words of a paragraph go on after it.', PRE, '\\mylead', '$x$', '2')
    expect(x.written).not.toContain(`{${x.name}a}`)
  })
})
