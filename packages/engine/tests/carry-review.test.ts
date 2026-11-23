// The fix round of #671 (Devin's two findings), on content of our own.
//
// 1. The display probe is asked of a nested note (marks.ts carrySource) the bytes the marked TeX holds for it. The walker drops a
//    comment and its line's end (latex-front.ts, the `%` step), and patch writes a space where one stood between a control word
//    and the next word, so that the name ends where the source ended it; a serialiser of its own that joins the pieces as they
//    are asks the probe `\relaxwith`, a command the paper never wrote: TeX errs, the note gets no carrier, and its paragraph is as
//    at the base.
// 2. A call ending in a control word, before a word: the mark probe's word follower says '2' for three things — the space
//    TeX's tokenizer skips after the control word, which the `{}` box keeps (a ≠ b); an opening mark that changes the box (a ≠
//    d); and, read by readMarkProbe, no answer at all. Only where TeX answers that the skipped space is the only difference, its
//    opening mark changing nothing (the code 4, punctuationSection), is that mark written; any other answer keeps the reading of
//    before: no mark, no line moved.
import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '../src/compile/live.ts'
import {
  carrySamples,
  LAYOUT_CLASSES,
  layoutMarking,
  MARK_CLASSES,
  punctuationSection,
  readMarkProbe,
  withoutOurMarks,
} from '../src/marks/marks.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder('latin1').decode(b)
const paperOf = (body: string) =>
  openPaper(new Map([['main.tex', enc(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))

describe("the display probe is asked of a nested note the bytes the marked TeX holds for it (Devin's first finding on #671)", () => {
  const cases: [string, string][] = [
    [
      'a comment between a control word and the next word',
      "We define words here\n\\[ a = b \\]\n\\footnote{A note of ours \\relax% a comment of the paper's\nwith words after it.} shows it, and more words.",
    ],
    [
      'a comment and an indent TeX skips after its line end',
      'We define words here\n\\[ a = b \\]\n\\footnote{A note of ours \\relax%\n    with words after it.} shows it, and more words.',
    ],
    [
      'no comment, the control word ended by `{}`',
      'We define words here\n\\[ a = b \\]\n\\footnote{A note of ours \\relax{} with words.} shows it.',
    ],
  ]
  for (const [what, body] of cases)
    it(`${what}: the sample is the marked TeX's own bytes, its control word ended where the source ended it`, () => {
      const paper = paperOf(body)
      const sample = carrySamples(paper.project.units).find((s) => s.startsWith('\\footnote{'))
      expect(sample).toBeDefined()
      const marked = withoutOurMarks(dec(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex')))
      expect(marked).toContain(sample)
      expect(sample).not.toMatch(/\\relax[A-Za-z]/)
    })
})

describe("a call's opening mark before a word only where TeX answered the skipped space the only difference (Devin's analysis on #671)", () => {
  const unit = (pieces: SourceUnit<null>['pieces']): SourceUnit<null> => ({
    file: null,
    kind: 'para',
    start: 0,
    end: 0,
    pieces,
  })
  /** the opening mark the marking writes for `\footnotemark` before a word, first after a display or in a paragraph's text */
  const opening = (codes: string | null, afterDisplay: boolean) => {
    const pieces: SourceUnit<null>['pieces'] = afterDisplay
      ? [
          { t: 'text', s: 'We define ' },
          { t: 'ph', src: '\\[ a = b \\]' },
          { t: 'text', s: '\n' },
        ]
      : [{ t: 'text', s: 'We define words ' }]
    const k = pieces.length
    pieces.push({ t: 'ph', src: '\\footnotemark' }, { t: 'text', s: ' of words.' })
    const u = unit(pieces)
    const switches = codes === null ? {} : { '\\footnotemark': codes }
    const quiet = afterDisplay ? ['\\footnotemark'] : []
    return (
      layoutMarking([u] as unknown as SourceUnit[], MARK_CLASSES, { lines: false, switches, quiet }).units[0]!
        .pieces as {
        t: string
        src?: string
      }[]
    )
      .map((p) => (p.t === 'ph' ? (p.src ?? '') : ''))
      .find((x) => x.endsWith(`{n0.${k}a}`))
      ?.replace(/\{.*$/, '')
  }
  it('4, the skipped space alone: its opening mark (the carrier first after a display)', () => {
    expect([opening('00000040', true), opening('00000040', false)]).toEqual(['\\axtpmd', '\\axtpma'])
  })
  it('2, an opening mark that changes the box: no mark, as before', () => {
    expect([opening('00000020', true), opening('00000020', false)]).toEqual([undefined, undefined])
  })
  it('no answer (x, or the command not in the probe): no mark, as before', () => {
    expect([opening('000000x0', true), opening(null, true), opening(null, false)]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })
  it("the probe answers 4 where the `{}` box differs and the opening mark's box does not, and readMarkProbe reads it", () => {
    const tex = punctuationSection([{ src: '\\footnotemark', call: true }])
    // (the word follower's branch where a ≠ b: a = d, 4; else 2)
    expect(tex).toContain('\\ifx\\axt@qa\\axt@qd\\xdef\\axt@qo{\\axt@qo4}\\else\\xdef\\axt@qo{\\axt@qo2}\\fi')
    expect(
      readMarkProbe('LAYOUT-PROBE 1 punct 0 00000040\n', [
        { command: '\\footnotemark', src: '\\footnotemark', call: true },
      ] as never),
    ).toEqual({
      '\\footnotemark': '00000040',
    })
  })
})
