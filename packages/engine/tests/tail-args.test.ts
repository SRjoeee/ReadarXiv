// @vitest-environment node
// A pair's tail argument (`\authorname{Ann Lee}{1,2}`, the body `\mbox{#1\textsuperscript{#2}}`): the source reader read the call
// as a pair round its first argument, its close piece `}{1,2}`, so the superscript TeX sets was markup, hidden with the text and
// drawn by no element. Each argument after the prose one is a piece of its own (source/latex-front.ts tailGroups), marked
// inside its braces only where TeX answers that those marks move nothing and that the tail sets something (marks/marks.ts
// tailSamples): a tail TeX never prints (a \label's key) is left unmarked because TeX says so, not because a list does.
// Content of our own.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import {
  aheadSection,
  layoutMarking,
  MARK_CLASSES,
  probeFactsOf,
  probeSamples,
  tailKey,
  tailSamples,
} from '../src/marks/marks.ts'
import { tailGroups, tailPiece } from '../src/source/latex-front.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const TEX = `\\documentclass{article}
\\newcommand{\\authorname}[2]{\\mbox{#1\\textsuperscript{#2}}}
\\newcommand{\\term}[2]{\\emph{#1}\\label{#2}}
\\begin{document}
Our own first paragraph, long enough to be a unit of its own, with \\authorname{Cy Doe}{3} in it and more words after it.

Our own last paragraph names a \\term{key word}{sec:ours} of ours, long enough to be a unit of its own.
\\end{document}
`
const paper = () => openPaper(new Map([['main.tex', enc(TEX)]]))

describe("a pair's tail argument is a piece of its own", () => {
  it('the reader: the close is the prose argument’s brace, each argument after it a tail placeholder', () => {
    const u = paper().units[0]!
    const k = u.pieces.findIndex((p) => tailPiece(p))
    expect(u.pieces[k - 1]).toMatchObject({ t: 'close', src: '}' })
    expect(u.pieces[k]).toMatchObject({ t: 'ph', src: '{3}' })
  })
  it('only braced groups right after each other are tails: anything else between keeps the close as it was', () => {
    expect(tailGroups('}{a}{b}', 1, 7)).toEqual([
      [1, 4],
      [4, 7],
    ])
    expect(tailGroups('} {a}', 1, 5)).toBeNull()
    expect(tailGroups('}[a]{b}', 1, 7)).toBeNull()
  })
  it('the probe asks about each tail: the call, the call with marks inside the tail’s braces, the call with it emptied', () => {
    const s = tailSamples(paper().units)
    expect(s.map((x) => x.src)).toEqual(['\\authorname{Cy Doe}{3}', '\\term{key word}{sec:ours}'])
    expect(probeSamples(paper().units).filter((x) => x.ahead)).toHaveLength(2)
    const tex = aheadSection(s)
    // (the opening mark set on a box's empty list too, \axthpk's rule: the tail's braces open the list of the box its macro
    // sets it in, `\textsuperscript{#2}`'s, where \axtpma's rule for the paragraph TeX resumes after a display gobbled it)
    expect(tex).toContain('\\authorname{Cy Doe}{\\axthpk{q0a}3\\axtpm{q0b}}')
    expect(tex).toContain('\\authorname{Cy Doe}{}')
  })
  it('the marking: inside the braces where TeX answered 0; as the paper writes it where it answered 2', () => {
    const p = paper()
    const [a, b] = tailSamples(p.units)
    const switches = { [tailKey(a!.src, 0)]: '0', [tailKey(b!.src, 0)]: '2' }
    const laid = layoutMarking(p.units, MARK_CLASSES, { switches } as never) as {
      units: { pieces: { src?: string }[] }[]
    }
    const src = (i: number) => laid.units[i]!.pieces.map((x) => x.src ?? (x as { s?: string }).s ?? '').join('')
    expect(src(0)).toMatch(/\\authorname\{Cy Doe\}\{\\axthpk\{p0\.\d+a\}3\\axtpm\{p0\.\d+b\}\}/)
    expect(src(1)).toContain('\\term{key word}{sec:ours}')
  })
})

describe('a tail TeX sets nothing for is stated empty (#679 review: an unprinted key kept its paragraph the original)', () => {
  it('the probe answers 1 where the call with the tail emptied is the call’s own box', () => {
    const tex = aheadSection(tailSamples(paper().units))
    expect(tex).toContain('\\ifx\\axt@qa\\axt@qg\\xdef\\axt@qo{1}')
  })
  it('the instrument’s probe facts name each tail TeX answered 1: no element of unknown ink', () => {
    const p = paper()
    const log = 'LAYOUT-PROBE 1 ahead 0 0\nLAYOUT-PROBE 1 ahead 1 1\n'
    const k = p.units[1]!.pieces.findIndex((x) => tailPiece(x))
    expect(probeFactsOf(log, p.units).tails).toEqual([{ unit: 1, piece: String(k) }])
    // (an answer 2, the tail sets something its marks would move, is no proof of no ink)
    expect(probeFactsOf('LAYOUT-PROBE 1 ahead 1 2\n', p.units).tails).toEqual([])
  })
})
