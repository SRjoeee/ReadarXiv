// A paper's macro whose meaning in force opens a conditional (`\def\iffa{\iffalse}`, an author's way of commenting a passage
// out) is read as the conditional it is. The source reader read `\iffa` as a placeholder and walked the passage TeX skips as
// text; the probe set that placeholder in a box of its ink section, where it opened a conditional that skipped every sample
// after it: no row of the look-ahead section was written, and no placeholder after a paper's macro of the paper got a mark.
// Now the walk reads a macro whose meaning is one of TeX's conditionals and nothing else as that conditional (its skipped branch
// skipped, its taken one walked), and no probe asks a sample whose leading macro's meaning opens a conditional it does not
// close. Content of our own, through the source reader and the marking's samples.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { aheadSamples, inkSamples, leadSamples } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
type Ph = { t: string; s?: string; src?: string }
function paperOf(body: string, preamble: string) {
  const paper = openPaper(
    new Map([['main.tex', enc(`\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`)]]),
  )
  const units = paper.units as { pieces: Ph[] }[]
  const text = units.map((u) => u.pieces.map((p) => (p.t === 'text' ? p.s : (p.src ?? ''))).join('')).join('\n')
  const asked = [
    ...inkSamples(paper.units),
    ...leadSamples(paper.units),
    ...aheadSamples(paper.units).flatMap((s) => [s.src, s.follows]),
  ]
  return { text, asked }
}

describe('a paper’s macro whose meaning opens a conditional', () => {
  it('one meaning \\iffalse: the passage TeX skips is no unit’s, and no piece of it is asked', () => {
    const r = paperOf(
      'Our shown words of a paragraph of ours.\n\n\\iffa\n\\section{Hidden}\nOur hidden words of a paragraph.\n\\fi\n\nOur last shown words.',
      '\\def \\iffa {\\iffalse}\n',
    )
    expect(r.text).not.toContain('hidden words')
    expect(r.text).toContain('last shown words')
    expect(r.asked.some((s) => s.startsWith('\\iffa'))).toBe(false)
  })
  it('one meaning \\iftrue: its branch is walked as text', () => {
    const r = paperOf(
      'Our first words of ours.\n\n\\iftr\nOur taken words of a paragraph.\n\\fi\n\nOur last words.',
      '\\def\\iftr{\\iftrue}\n',
    )
    expect(r.text).toContain('taken words of a paragraph')
    expect(r.asked.some((s) => s.startsWith('\\iftr'))).toBe(false)
  })
  it('one whose body opens a conditional it does not close: never a sample of the probe', () => {
    const r = paperOf('Our words with \\opn a\\fi{} in them, and more words of ours.', '\\def\\opn{\\ifnum1=1 }\n')
    expect(r.asked.some((s) => s.startsWith('\\opn'))).toBe(false)
  })
  it('one whose body closes every conditional it opens stays asked (control)', () => {
    const r = paperOf(
      'Our words with \\pick{} in them, and more words of ours.',
      '\\def\\pick{\\ifmmode x\\else y\\fi}\n',
    )
    expect(r.asked.some((s) => s.startsWith('\\pick'))).toBe(true)
  })
})
