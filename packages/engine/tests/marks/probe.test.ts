import { describe, expect, it } from 'vitest'
import { markSource } from '../../src/marks/mark.ts'
import {
  BOX_RESET,
  bblHead,
  ownGuard,
  probeBytes,
  probeFile,
  probeSamples,
  readAnswers,
  unprobed,
} from '../../src/marks/probe.ts'
import { DEFINITIONS_FORMAT, NO_DEFINITIONS, readDefinitions } from '../../src/source/definitions.ts'
import { readSource } from '../../src/source/read.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()
const tree = (body: string, preamble = '', more: [string, string][] = []) => ({
  main: 'main.tex',
  files: new Map([
    ['main.tex', enc.encode(`\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`)],
    ...more.map(([p, t]): [string, Uint8Array] => [p, enc.encode(t)]),
  ]),
})
const records = (...lines: string[]) =>
  readDefinitions(
    [`H ${DEFINITIONS_FORMAT}`, ...lines, `END ${lines.filter((l) => l.startsWith('M ')).length}`].join('\n'),
  )
const row = (...f: (string | number)[]) => `LAYOUT-PROBE 1 ${f.join(' ')}`

describe('the mark probe, asked in the first pass', () => {
  it('chooses its samples before TeX: each asked command once, each macro of the paper’s own its units call, the pairs', () => {
    const t = tree('We cite \\cite{a} and \\cite{b}, see \\foo, and \\foo again.', '\\newcommand\\foo{F}\n')
    const s = probeSamples(readSource(t, NO_DEFINITIONS))
    expect(s.punct).toEqual([
      { command: '\\cite', src: '\\cite{a}' },
      { command: '\\foo', src: '\\foo', own: true },
    ])
    expect(s.seen).toEqual(['\\cite'])
    expect(s.ink).toEqual(['\\foo'])
  })

  it('states the paper’s complete macros on TeX’s meanings: none that reads on, ends in an argument or sets a structure', () => {
    const t = tree(
      '\\foo, \\bar{x}, \\baz, \\qux{y} and \\quux.',
      '\\newcommand\\foo{F}\n\\newcommand\\bar[1]{\\textbf{#1}}\n\\newcommand\\baz{\\@ifnextchar[{a}{b}}\n\\newcommand\\qux[1]{#1}\n\\newcommand\\quux{\\end{tabular}}\n',
    )
    const doc = readSource(
      t,
      records(
        'M foo macro:->F',
        'M bar macro:#1->\\textbf {#1}',
        'M baz macro:->\\@ifnextchar [{a}{b}',
        'M qux macro:#1->#1',
        'M quux macro:->\\end {tabular}',
      ),
    )
    expect(doc.complete).toEqual([
      ['bar', 1],
      ['foo', 0],
    ])
  })

  it('reads TeX’s answers from the log by the samples’ rows, an error in a box answering for its follower', () => {
    const s = probeSamples(readSource(tree('A \\cite{a} b \\foo{} c.', '\\newcommand\\foo{F}\n'), NO_DEFINITIONS))
    const log = [
      'This is pdfTeX',
      row('probe-begin', 2, 1, 0, 0),
      row('punct-at', 0, 0, 'a'),
      row('punct', 0, '00000000'),
      row('punct-at', 1, 2, 'd'),
      '! Undefined control sequence.',
      row('punct', 1, '00000000'),
      row('ink-at', 0),
      '> \\box60=',
      '\\hbox(6.83331+0.0)x6.94446',
      '.\\T1/cmr/m/n/10 F',
      '',
      '! OK.',
      row('ink-end', 0),
      row('lineskip', '1.0pt', '0.0pt'),
      row('probe-end'),
    ].join('\n')
    const a = readAnswers(log, s)
    // (an error where the opening mark stands alone before the follower: no mark there, today's 2)
    expect(a.switches).toEqual({ '\\cite': '00000000', '\\foo': '00200000' })
    expect(a.texts).toEqual([['\\foo{}', 'F']])
    expect(a.inkless).toEqual([])
    expect(a.lineskip?.[0]).toBeCloseTo(72 / 72.27)
    expect(a.probed).toEqual([{ command: '\\foo', src: '\\foo{}' }])
    expect(unprobed(log)).toBe('This is pdfTeX\n')
  })

  it('writes the file the pass reads at its end: the marks’ definitions and the sections in a box never shipped', () => {
    const s = probeSamples(readSource(tree('A \\foo{} b.', '\\newcommand\\foo{F}\n'), NO_DEFINITIONS))
    const f = probeFile(s, 'pdflatex', '\\providecommand{\\urlprefix}{URL }')
    expect(f).toContain('\\begingroup\\setbox0\\vbox{')
    expect(f).toContain('\\providecommand{\\urlprefix}{URL }')
    expect(f).toContain(`/\\axt@qn}${BOX_RESET}`)
    expect(f).toContain(ownGuard('\\foo', '').split('{}')[0] as string)
    expect(f.trimEnd().endsWith('\\typeout{LAYOUT-PROBE 1 probe-end }')).toBe(true)
  })

  it('takes a bibliography’s own definitions from its .bbl’s head: no \\begin{thebibliography}, a \\newcommand provided, no \\renewcommand', () => {
    const t = tree('Text \\cite{a}.\n\\bibliography{refs}', '', [
      [
        'main.bbl',
        '\\begin{thebibliography}{9}\n\\providecommand{\\natexlab}[1]{#1}\n\\newcommand{\\etalchar}[1]{$^{#1}$}\n\\renewcommand{\\refname}{R}\n\\bibitem{a} A.\n\\end{thebibliography}\n',
      ],
    ])
    expect(bblHead(t)).toBe('\n\\providecommand{\\natexlab}[1]{#1}\n\\providecommand{\\etalchar}[1]{$^{#1}$}\n\n')
  })

  it('writes the file in the encoding the paper declares', () => {
    expect([...probeBytes('é', 'latin1')]).toEqual([0xe9])
    expect([...probeBytes('é', 'utf8')]).toEqual([0xc3, 0xa9])
    expect([...probeBytes('€', 'cp1252')]).toEqual([0x80])
  })

  it('places a command the probe never saw as with no probe, one it saw and did not answer with no mark', () => {
    const t = tree('We cite \\cite{a} here.')
    const doc = readSource(t, NO_DEFINITIONS)
    const marks = (seen: string[]) =>
      markSource(t, doc, { answers: { switches: { '\\ref': '00000000' }, seen } }).plan.marks.filter((m) =>
        m.name.startsWith('p'),
      ).length
    expect(marks([])).toBe(2)
    expect(marks(['\\cite'])).toBe(0)
    expect(dec.decode(markSource(t, doc).tree.files.get('main.tex'))).toContain('\\axtpma{p0.')
  })
})
