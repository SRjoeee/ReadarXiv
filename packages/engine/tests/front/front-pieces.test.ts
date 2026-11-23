import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '../../src/compile/live.ts'
import { LAYOUT_CLASSES, probeSamples, readMarkProbe } from '../../src/marks/marks.ts'

// A piece between the texts of a front unit gets a point on each side (F, PDF-READER §18.111). An author block's unit of several
// names sets each name's marks after it, between its texts: `Ann Lee\IEEEauthorrefmark{1}, Bob Ray\IEEEauthorrefmark{2}`,
// `Ann Lee\textsuperscript{1}, Bob Ray`, `Ann Lee\inst{1}, Bob Ray\inst{2}`. The marking gave such a piece no point (a paper's
// macro glued to the word before it is read as part of that word) or its opening point alone (a command may read what follows
// it): TeX stated no point between the piece's ink and the next name's, and the ownership could not tell them apart (lane
// own-2's 15 author-block members `unproven`). Each now has its opening and its closing mark, robust as a front unit's marks
// are (\protect before each); a piece after the unit's last text (a trail, the ownership's) or before its first keeps the
// reading of before. Words of our own.

const enc = (s: string) => new TextEncoder().encode(s)
const markedOf = (cls: string, body: string) => {
  const paper = openPaper(new Map([['main.tex', enc(`${cls}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
  // (TeX's answers for the front pieces, as TeX answers for these calls: 0 before every follower, each box begun apart from a
  // word; front-pieces-probed.test.ts holds the marks to the answers)
  const samples = probeSamples(paper.units, paper.project.complete)
  const log = samples.map((s, i) => (!s.ahead && s.front ? `LAYOUT-PROBE 1 punct ${i} ${'0'.repeat(8)}` : '')).join('\n')
  const tex = new TextDecoder('latin1').decode(
    originalFiles(paper, {
      lines: true,
      layout: LAYOUT_CLASSES,
      switches: readMarkProbe(log, samples),
      apart: samples.flatMap((s) => (!s.ahead && s.front ? [s.src] : [])),
      complete: paper.project.complete,
    }).get('main.tex'),
  )
  return tex.slice(tex.indexOf('\\begin{document}'))
}
/** the marks right around a piece's source in the marked text: [before it, after it] */
const around = (tex: string, src: string) => {
  const at = tex.indexOf(src)
  expect(at, src).toBeGreaterThanOrEqual(0)
  const before = /(?:\\protect\\axtpm[am]?\{[np]\d+\.\d+a\})$/.exec(tex.slice(0, at))?.[0] ?? null
  const after = /^(?:\\protect\\axtpm\{[np]\d+\.\d+b\})/.exec(tex.slice(at + src.length))?.[0] ?? null
  return [!!before, !!after]
}

describe('a piece between the texts of a front unit: a point on each side', () => {
  it("IEEEtran's \\IEEEauthorrefmark between two names of one block", () => {
    const tex = markedOf(
      '\\documentclass{IEEEtran}',
      '\\title{A Title of Ours}\n\\author{\\IEEEauthorblockN{Ann Lee\\IEEEauthorrefmark{1}, Bob Ray\\IEEEauthorrefmark{2}}}\n\\maketitle\nWords of ours.',
    )
    expect(around(tex, '\\IEEEauthorrefmark{1}')).toEqual([true, true])
  })
  it('\\textsuperscript between two names of \\author', () => {
    const tex = markedOf(
      '\\documentclass{article}',
      '\\title{A Title of Ours}\n\\author{Ann Lee\\textsuperscript{1}, Bob Ray\\textsuperscript{2}}\n\\maketitle\nWords of ours.',
    )
    expect(around(tex, '\\textsuperscript{1}')).toEqual([true, true])
  })
  it("llncs's \\inst between two names written in one \\author", () => {
    const tex = markedOf(
      '\\documentclass{llncs}',
      '\\title{A Title of Ours}\n\\author{Ann Lee\\inst{1}, Bob Ray\\inst{2}}\n\\institute{A Place}\n\\maketitle\nWords of ours.',
    )
    expect(around(tex, '\\inst{1}')).toEqual([true, true])
  })
  it('a piece first on a row after `\\\\`: its opening point before the break, as the marking sets it there, and its closing one after it', () => {
    const tex = markedOf(
      '\\documentclass{IEEEtran}',
      '\\title{A Title of Ours}\n\\author{\\IEEEauthorblockN{Ann Lee}\n\\IEEEauthorblockA{\\textsuperscript{1}First Place of Ours\\\\\n\\textsuperscript{2}Second Place of Ours}}\n\\maketitle\nWords of ours.',
    )
    // (nothing of ours between the break and what follows it: the break looks ahead for `*` and `[`, a row begins with its own
    // first token)
    expect(tex).toMatch(/First Place of Ours\\protect\\axtpma\{p\d+\.(\d+)a\}\\\\\n\\textsuperscript\{2\}\\protect\\axtpm\{p\d+\.\1b\}Second/)
  })
  it('a piece after a command that may read what follows it gets no mark of ours', () => {
    const tex = markedOf(
      '\\documentclass{article}\n\\usepackage{xspace}\n\\newcommand{\\lab}{Lab\\xspace}',
      '\\title{A Title of Ours}\n\\author{Ann Lee \\lab$^1$, Bob Ray}\n\\maketitle\nWords of ours.',
    )
    expect(tex).toContain('\\lab$^1$')
  })
  it('a piece another piece follows keeps the reading of before: its ink runs to the next text, the two one run', () => {
    // (2608.11884v1: `<a name>\\textsuperscript{1,2}\\corresponding,`, a paper's macro after the superscript that reads what
    // follows it and so gets no mark: a closing point between the two left the macro's ink no one's, the name unproven)
    const tex = markedOf(
      '\\documentclass{article}\n\\newcommand{\\corresponding}{\\textsuperscript{*}\\xspace}\n\\usepackage{xspace}',
      '\\title{A Title of Ours}\n\\author{Ann Lee\\textsuperscript{1}\\corresponding, Bob Ray\\textsuperscript{2}, Cy Day}\n\\maketitle\nWords of ours.',
    )
    expect(around(tex, '\\textsuperscript{1}')).toEqual([true, false])
    expect(around(tex, '\\textsuperscript{2}')).toEqual([true, true])
  })
  it('the controls: a piece after the last text (a trail) and one in a paragraph keep the reading of before', () => {
    const tex = markedOf(
      '\\documentclass{article}',
      '\\title{A Title of Ours}\n\\author{Ann Lee\\textsuperscript{1}, Bob Ray\\textsuperscript{2}}\n\\maketitle\nWords of ours\\textsuperscript{3} go on.',
    )
    expect(around(tex, '\\textsuperscript{2}')[1]).toBe(false)
    expect(around(tex, '\\textsuperscript{3}')[1]).toBe(false)
  })
})
