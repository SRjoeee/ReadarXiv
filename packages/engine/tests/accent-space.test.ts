// An accent's argument after white space: TeX skips spaces before an undelimited argument (TeXbook ch. 20), so `\= T` sets
// T with a macron as `\=T` does, `\' e` sets é, and so for every accent the source reader knows, a control symbol (\=, \', \^,
// \., \", \~, \`) as a control word (\v, \u, \H, \c, \d, \b, \t, \r, \k). The source reader skipped them after a letter-named
// accent alone, so `(A\= T)` became the piece `\= ` (the space its argument) and the text "T"; the piece, glued to the word
// before it, got no mark and no ink, and the reader's lay refused its unit `unproven` (2611.16683v1's FIG. 1 caption, drawn in
// English with its row answered).
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const piecesOf = (text: string) => {
  const u = openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n\\begin{document}\n${text}\n\\end{document}\n`)]]),
  ).units.find((x) => x.kind === 'para')!
  return (u.pieces as { t: string; s?: string; src?: string }[]).map((p) =>
    p.t === 'text' ? p.s!.replace(/^\n|\n$/g, '') : `[${p.src}]`,
  )
}

describe("an accent's argument after white space", () => {
  it('a control-symbol accent: the letter after the space is its argument, not text', () => {
    expect(piecesOf('Our class of drives is the abelian untwisted (A\\= T) class, a sentence long enough.')).toEqual([
      'Our class of drives is the abelian untwisted (A',
      '[\\= T]',
      ') class, a sentence long enough.',
    ])
  })

  it('a group after the space, and an accent whose letter is read into its word, alike', () => {
    // (the letter joined to its word, the word one text piece: its bytes as the source's are read, accentLetter)
    const ps = piecesOf("We write (A\\= {T}) here, and the word caf\\' e is one word, a sentence long enough.")
    expect(ps.slice(0, 2)).toEqual(['We write (A', '[\\= {T}]'])
    expect(ps).toHaveLength(3)
    expect(ps[2]).toMatch(/^\) here, and the word caf.+ is one word/)
  })

  it('a letter-named accent as before', () => {
    expect(piecesOf('We write (A\\r T) here in a sentence that is long enough to be one unit.')).toEqual([
      'We write (A',
      '[\\r T]',
      ') here in a sentence that is long enough to be one unit.',
    ])
  })
})
