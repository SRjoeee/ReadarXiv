// A paper's macro whose meaning in force opens a conditional (`\def\iffa{\iffalse}`, an author's way of commenting a passage
// out) is read as the conditional it is. The source reader read `\iffa` as a placeholder and walked the passage TeX skips as
// text; the probe set that placeholder in a box of its ink section, where it opened a conditional that skipped every sample
// after it: no row of the look-ahead section was written, and no placeholder after a paper's macro of the paper got a mark.
// Now the walk reads a macro whose meaning is one of TeX's conditionals and nothing else as that conditional (its skipped branch
// skipped, its taken one walked), and no probe asks a sample whose leading macro's meaning opens a conditional it does not
// close. Content of our own, through the source reader and the marking's samples.
import { describe, expect, it } from 'vitest'
import { openPaper, probeFiles } from '../src/compile/live.ts'
import { aheadSamples, inkSamples, leadSamples } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
type Ph = { t: string; s?: string; src?: string }
function paperOf(body: string, preamble: string, cls = 'article') {
  const paper = openPaper(
    new Map([['main.tex', enc(`\\documentclass{${cls}}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`)]]),
  )
  const units = paper.units as { pieces: Ph[] }[]
  const text = units.map((u) => u.pieces.map((p) => (p.t === 'text' ? p.s : (p.src ?? ''))).join('')).join('\n')
  // (the words the walk reads as text, a placeholder's source apart)
  const prose = units.map((u) => u.pieces.map((p) => (p.t === 'text' ? p.s : ' ')).join('')).join('\n')
  const asked = [
    ...inkSamples(paper.units),
    ...leadSamples(paper.units),
    ...aheadSamples(paper.units).flatMap((s) => [s.src, s.follows]),
  ]
  // (the probe as the prepare writes it: what follows its own \begin{document}, every section's samples)
  const main = new TextDecoder('latin1').decode([...probeFiles(paper, { marks: true }).values()][0])
  const probe = main.slice(main.lastIndexOf('\\begin{document}'))
  return { text, prose, asked, probe }
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

describe('a conditional a paper’s macro stands for is read as decided only where the reader reads it whole', () => {
  it('one meaning \\if compares its two characters as TeX does: equal letters, its first branch is set', () => {
    const r = paperOf(
      'Our first words of ours.\n\n\\ifeq aa Our taken words of a branch.\\else Our skipped words of a branch.\\fi\n\nOur last words.',
      '\\def\\ifeq{\\if}\n',
    )
    expect(r.prose).toContain('taken words of a branch')
    expect(r.prose).not.toContain('skipped words')
  })
  it('one meaning \\if, two letters that differ: its \\else branch is set (control)', () => {
    const r = paperOf(
      'Our first words of ours.\n\n\\ifeq ab Our skipped words of a branch.\\else Our taken words of a branch.\\fi\n\nOur last words.',
      '\\def\\ifeq{\\if}\n',
    )
    expect(r.prose).toContain('taken words of a branch')
    expect(r.prose).not.toContain('skipped words')
  })
  it('one whose branch TeX sets calls another such macro: its nesting is TeX’s, not the scan’s, and it is read as before', () => {
    // (TeX sets the outer's first branch, so it expands \no there and counts the conditional it opens: the inner \else and \fi
    // are the inner's. The scan counts TeX's conditionals by name and takes them for the outer's: the outer is not read as
    // decided, and the inner, read whole, is)
    const r = paperOf(
      '\\yes Our outer taken words. \\no Our inner skipped words. \\else Our inner taken words. \\fi Our outer still taken words. \\else Our outer skipped words. \\fi\n\nOur last words.',
      '\\def\\yes{\\iftrue}\\def\\no{\\iffalse}\n',
    )
    expect(r.prose).toContain('outer taken words')
    expect(r.prose).toContain('inner taken words')
    expect(r.prose).toContain('outer still taken words')
    expect(r.prose).not.toContain('inner skipped words')
  })
  it('one in a branch TeX skips is not expanded there: the outer’s \\fi is the first, as the scan reads it (control)', () => {
    // (`\iffa … \iffa … \fi … \fi`: TeX skips the outer's branch without expanding the inner call, whose \fi ends the outer)
    const r = paperOf(
      'Our first words of ours.\n\n\\iffa Our skipped words. \\iffa Our inner words. \\fi Our taken words of ours.\n\nOur last words.',
      '\\def\\iffa{\\iffalse}\n',
    )
    expect(r.prose).not.toContain('skipped words')
    expect(r.prose).not.toContain('inner words')
    expect(r.prose).toContain('taken words of ours')
  })
  it('a complete call whose meaning opens a conditional: never a sample of the punctuation probe', () => {
    const r = paperOf(
      'Our words with \\opn{0} our hidden words\\fi{} in them, and more words of ours.',
      '\\newcommand{\\opn}[1]{\\ifnum#1=1 }\n',
    )
    expect(r.probe).not.toContain('\\opn')
  })
  it('a call glued after a complete call whose meaning opens a conditional: never its follower in the punctuation probe', () => {
    const r = paperOf(
      'Our words with \\share\\opn{0} our hidden words\\fi{} in them, and more words of ours.',
      '\\newcommand{\\share}{ours}\\newcommand{\\opn}[1]{\\ifnum#1=1 }\n',
    )
    expect(r.probe).toContain('\\share')
    expect(r.probe).not.toContain('\\opn')
  })
  it('a front piece whose meaning opens a conditional: never a sample of the punctuation probe', () => {
    // (a macro of an optional argument is no complete one: the author block's piece between its texts alone asks it)
    const r = paperOf(
      '\\maketitle\nOur words of ours.',
      '\\newcommand{\\opn}[1][1]{\\ifnum#1=0 }\\title{Our Title}\\author{Ann Ours \\opn[0] and Bob Ours\\fi{} and Cy Ours}\n',
    )
    expect(r.probe).not.toContain('\\opn')
  })
})
