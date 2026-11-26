// An accent's argument after white space: TeX skips spaces before an undelimited argument (TeXbook ch. 20), so `\= T` sets
// T with a macron as `\=T` does, `\' e` sets é, and so for every accent the source reader knows, a control symbol (\=, \', \^,
// \., \", \~, \`) as a control word (\v, \u, \H, \c, \d, \b, \t, \r, \k). The source reader skipped them after a letter-named
// accent alone, so `(A\= T)` became the piece `\= ` (the space its argument) and the text "T"; the piece, glued to the word
// before it, got no mark and no ink, and the reader's lay refused its unit `unproven` (2611.16683v1's FIG. 1 caption, drawn in
// English with its row answered).
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'

const enc = (s: string) => new TextEncoder().encode(s)
/** a unit's text pieces as the source's characters: each piece's bytes (read latin1) decoded as UTF-8 on its own, as the
 *  instrument decodes a piece (a character split between two pieces decodes to U+FFFD in each) */
const utf8 = (latin: string) => new TextDecoder().decode(Uint8Array.from(latin, (c) => c.charCodeAt(0)))
const piecesOf = (text: string, preamble = '') => {
  const u = openPaper(
    new Map([
      ['main.tex', enc(`\\documentclass{article}\n${preamble}\\begin{document}\n${text}\n\\end{document}\n`)],
    ]),
  ).units.find((x) => x.kind === 'para')!
  return (u.pieces as { t: string; s?: string; src?: string }[]).map((p) =>
    p.t === 'text' ? utf8(p.s!.replace(/^\n|\n$/g, '')) : `[${utf8(p.src!)}]`,
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

  it('its argument a whole character: a letter of more than one byte, and a base letter with its combining marks (Devin on #689)', () => {
    // (the source's bytes are read latin1: one code unit of the scanner is one byte, and a letter of UTF-8's two or three bytes,
    // or a letter with a combining mark after it, cut after its first byte decodes to U+FFFD on both sides of the cut)
    expect(piecesOf('We write (A\\= \u03b1) here in a sentence that is long enough to be one unit.')).toEqual([
      'We write (A',
      '[\\= \u03b1]',
      ') here in a sentence that is long enough to be one unit.',
    ])
    expect(piecesOf('We write (A\\=\u03b1) here in a sentence that is long enough to be one unit.')).toEqual([
      'We write (A',
      '[\\=\u03b1]',
      ') here in a sentence that is long enough to be one unit.',
    ])
    expect(piecesOf('We write (A\\= y\u0301\u0323) here in a sentence that is long enough to be one unit.')).toEqual([
      'We write (A',
      '[\\= y\u0301\u0323]',
      ') here in a sentence that is long enough to be one unit.',
    ])
  })

  it("an accent the paper defines anew with no argument: read by the paper's definition, the word after it whole (Devin on #689)", () => {
    // (TeX reads no argument for a macro of no parameter, and skips no space after a control symbol: `\= approximately` is
    // the paper's dash, a space, and the whole word)
    const ps = piecesOf(
      'We find the value \\= approximately two in a sentence that is long enough to be one unit.',
      '\\renewcommand{\\=}{\\textemdash}\n',
    )
    expect(ps.join('')).toContain('approximately two')
    expect(ps.filter((p) => p.startsWith('[')).every((p) => !/[a-z]/.test(p.slice(2)))).toBe(true)
    // (the other side: defined anew with an argument, its argument is read past the space as LaTeX's accent's is)
    expect(
      piecesOf('We write (A\\= T) here in a sentence that is long enough to be one unit.', '\\renewcommand{\\=}[1]{\\bar{#1}}\n'),
    ).toEqual(['We write (A', '[\\= T]', ') here in a sentence that is long enough to be one unit.'])
  })

  it('a letter-named accent as before', () => {
    expect(piecesOf('We write (A\\r T) here in a sentence that is long enough to be one unit.')).toEqual([
      'We write (A',
      '[\\r T]',
      ') here in a sentence that is long enough to be one unit.',
    ])
  })
})
