// @vitest-environment node
// A pair whose call TeX sets in one box (`\authorname{Adeen Flinker}{3}`, the body `\mbox{#1\textsuperscript{#2}}`): TeX cannot
// break a line inside an \hbox, and the lay broke the name at its space ("Adeen / Flinker"). Which calls TeX sets unbreakable is
// TeX's to say, not a list of box commands': the look-ahead probe sets each pair's call, as the unit carries it, in a paragraph
// of zero width; one line (\prevgraf 1) is a call TeX breaks nowhere, and the instrument states its group a box (SpanAt.box).
// Asked only of a pair whose text holds white space (no line breaks elsewhere in a word but by hyphenation, which an hbox
// forbids too). Content of our own.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { aheadSection, boxKey, boxSamples, probeFactsOf, probeSamples } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const TEX = `\\documentclass{article}
\\newcommand{\\authorname}[2]{\\mbox{#1\\textsuperscript{#2}}}
\\begin{document}
Our own first paragraph, long enough to be a unit of its own, with \\authorname{Adeen Flinker}{3} and \\textbf{two words} in it.
\\end{document}
`
const paper = () => openPaper(new Map([['main.tex', enc(TEX)]]))

describe('a pair TeX sets in one box', () => {
  it('the probe asks each pair whose text holds a space, the call set in a paragraph of zero width', () => {
    const s = boxSamples(paper().units)
    expect(s.map((x) => x.src)).toEqual(['\\authorname{Adeen Flinker}{3}', '\\textbf{two words}'])
    expect(s.map((x) => x.key)).toEqual([boxKey('\\authorname{Adeen Flinker}{3}'), boxKey('\\textbf{two words}')])
    expect(probeSamples(paper().units).filter((x) => x.ahead)).toHaveLength(3)
    const tex = aheadSection(s)
    expect(tex).toContain('\\vbox{\\hsize\\z@')
    expect(tex).toContain('\\authorname{Adeen Flinker}{3}\\par\\xdef\\axt@qn{\\the\\prevgraf}')
  })
  it('the facts name the open of each pair TeX set on one line (0), none of one it broke (2)', () => {
    const p = paper()
    const pieces = p.units[0]!.pieces
    const open = pieces.findIndex((x) => x.t === 'open' && x.src?.startsWith('\\authorname'))
    // (the tail's sample first, then the two boxes)
    const log = 'LAYOUT-PROBE 1 ahead 0 0\nLAYOUT-PROBE 1 ahead 1 0\nLAYOUT-PROBE 1 ahead 2 2\n'
    expect(probeFactsOf(log, p.units).boxed).toEqual([{ unit: 0, piece: String(open) }])
  })
})
