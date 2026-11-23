import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '../../src/compile/live.ts'
import { LAYOUT_CLASSES, probeSamples, readMarkProbe } from '../../src/marks/marks.ts'

// F's closing mark stands only where TeX's probe answered that it changes nothing (PDF-READER §18.111; the review of #674). An
// author's mark between two names may be a macro that reads what follows it (`\@ifnextchar,{…}{…}`, `\xspace`): a mark between
// its call and the comma is what it then reads, and the marked paper prints other content than the paper. The macro's call is
// asked of the mark probe as it stands (a sample of its own, probeSamples), and its closing mark stands where TeX answered `0`
// for what follows it; with no answer, or another, none: the member stays as the line reads it. Words of our own.

const enc = (s: string) => new TextEncoder().encode(s)
const PRE = '\\makeatletter\n\\newcommand{\\authmarkx}[1]{\\textsuperscript{#1}\\@ifnextchar,{YES}{NO}}\n\\makeatother'
const BODY = '\\title{A Title of Ours}\n\\author{Ann Lee\\authmarkx{1}, Bob Ray}\n\\maketitle\nWords of ours.'
const paperOf = () =>
  openPaper(new Map([['main.tex', enc(`\\documentclass{article}\n${PRE}\n\\begin{document}\n${BODY}\n\\end{document}\n`)]]))
/** the marked TeX, with the probe's answers for the front samples as a log of `code` for every follower, where given */
const markedOf = (code: string | null) => {
  const paper = paperOf()
  const samples = probeSamples(paper.units, paper.project.complete)
  const log =
    code === null
      ? null
      : samples
          .map((s, i) => (!s.ahead && s.command.startsWith('front ') ? `LAYOUT-PROBE 1 punct ${i} ${code.repeat(8)}` : ''))
          .join('\n')
  const switches = log === null ? null : readMarkProbe(log, samples)
  // (its box begun apart from a word, as TeX answers for a call that opens with \textsuperscript: its opening mark may stand)
  const tex = new TextDecoder('latin1').decode(
    originalFiles(paper, {
      lines: true,
      layout: LAYOUT_CLASSES,
      switches,
      apart: ['\\authmarkx{1}'],
      complete: paper.project.complete,
    }).get('main.tex'),
  )
  return tex.slice(tex.indexOf('\\author'), tex.indexOf('\\maketitle'))
}
const closingAfter = (tex: string, src: string) => /^\\protect\\axtpm\{p\d+\.\d+b\}/.test(tex.slice(tex.indexOf(src) + src.length))

describe('F’s closing mark on TeX’s answer alone', () => {
  it('a macro that reads what follows it: no closing mark where no probe answered (no switches)', () => {
    expect(closingAfter(markedOf(null), '\\authmarkx{1}')).toBe(false)
  })
  it('its call is asked of the mark probe as it stands', () => {
    const paper = paperOf()
    expect(
      probeSamples(paper.units, paper.project.complete).some((s) => !s.ahead && s.src === '\\authmarkx{1}'),
    ).toBe(true)
  })
  it('TeX answered that the closing mark changes the box (1, 2): none', () => {
    expect(closingAfter(markedOf('1'), '\\authmarkx{1}')).toBe(false)
    expect(closingAfter(markedOf('2'), '\\authmarkx{1}')).toBe(false)
  })
  it('TeX answered 0 before the comma: the closing mark stands', () => {
    expect(closingAfter(markedOf('0'), '\\authmarkx{1}')).toBe(true)
  })
  it('a piece first on a row after `\\\\`: its closing mark on TeX’s answer too', () => {
    const paper = openPaper(
      new Map([
        [
          'main.tex',
          enc(
            '\\documentclass{IEEEtran}\n\\begin{document}\n\\title{A Title of Ours}\n\\author{\\IEEEauthorblockN{Ann Lee}\n\\IEEEauthorblockA{\\textsuperscript{1}First Place of Ours\\\\\n\\textsuperscript{2}Second Place of Ours}}\n\\maketitle\nWords of ours.\n\\end{document}\n',
          ),
        ],
      ]),
    )
    const tex = new TextDecoder('latin1').decode(
      originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'),
    )
    expect(closingAfter(tex, '\\textsuperscript{2}')).toBe(false)
  })
})
