// The ink probe asked where the document uses a macro (the compile move's B4, the display design's F15), at its interfaces, on
// content of our own (no TeX runs; lab/pdf/spikes/ask-cases.mjs holds the TeX): the asks' answers read from a pass's log in the
// ink section's form (marks.ts readInkAnswered, useAnswersOf), merged into the marking's inkless (mergeUses), slice 4's `nothing`
// held within it (probeFactsOf); the bibliography's pass's files with the asks (live.ts askedFiles: each sample right before its
// first use in running text, none in a heading, a caption, an algorithm's body or a sample whose groups do not close, ASK_TEX on
// the main file's first line); and madeBibliography's `asks`: the pass asked with them, its answers returned, asked again as
// today's where it did not run through.
import { describe, expect, it } from 'vitest'
import { askedFiles, openPaper } from '../src/compile/live.ts'
import { madeBibliography } from '../src/compile/paper.ts'
import { UNMARKED_HEAD, unmarkedFiles } from '../src/compile/guard.ts'
import {
  ASK_TEX,
  askable,
  inkSamples,
  mergeUses,
  probeFactsOf,
  readInkAnswered,
  readInkNothing,
  useAnswersOf,
} from '../src/marks/marks.ts'
import type { CompileRequest } from '../src/compile/live.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b)
/** one sample's listing as an ask writes it, its box's line given, and what TeX writes before the listing */
const listing = (i: number, box: string, nodes: string[], before: string[] = []) =>
  [
    `LAYOUT-PROBE 1 ink-at ${i}`,
    ...before,
    '> \\box74=',
    box,
    ...nodes,
    '',
    '! OK.',
    `LAYOUT-PROBE 1 ink-end ${i}`,
  ].join('\n')
const NONE = '\\hbox(0.0+0.0)x0.0'
const INKED = ['.\\T1/cmr/m/n/10 ,', '.\\glue 3.33 plus 1.66 minus 1.11']

describe('the asks’ answers, read from the pass’s log', () => {
  const log = [
    listing(0, NONE, []),
    listing(1, '\\hbox(4.3+0.0)x5.8', INKED),
    listing(2, NONE, [], ['! Undefined control sequence.']),
    // (a sample TeX passed over where it stands, between an alignment's rows: no rows at all)
  ].join('\n')
  const asked = ['\\nada', '\\kw', '\\undef', '\\myrule']
  it('answers a listing given whole with no error, inkless or not; one with an error or none is no answer', () => {
    expect(readInkAnswered(log, asked)).toEqual(['\\nada', '\\kw'])
    expect(useAnswersOf(log, asked)).toEqual({ inkless: ['\\nada'], inked: ['\\kw'] })
  })
  it('takes each answered source’s answer over the probe’s, the probe’s where the use gave none', () => {
    const probe = ['\\kw', '\\tnote{b}', '\\undef']
    expect(mergeUses(probe, { inkless: ['\\nada'], inked: ['\\kw', '\\tnote{b}'] })).toEqual(['\\undef', '\\nada'])
    expect(mergeUses(probe, null)).toEqual(probe)
  })
  it('holds slice 4’s `nothing` within the marking’s inkless: a source the use answered with ink is no longer one', () => {
    const units = [
      {
        kind: 'para',
        pieces: [
          { t: 'text', s: 'a ' },
          { t: 'ph', src: '\\kw' },
          { t: 'text', s: ' b' },
        ],
      },
    ] as never
    const probeLog = listing(0, NONE, [])
    expect(readInkNothing(probeLog, ['\\kw'])).toEqual(['\\kw'])
    expect(probeFactsOf(probeLog, units).nothing).toEqual(['\\kw'])
    expect(probeFactsOf(probeLog, units, ['\\kw']).nothing).toEqual(['\\kw'])
    expect(probeFactsOf(probeLog, units, []).nothing).toEqual([])
  })
  it('asks no sample whose own groups do not close in it', () => {
    expect(askable('\\nada{}')).toBe(true)
    expect(askable('\\begingroup')).toBe(false)
    expect(askable('\\endgroup{}')).toBe(false)
    expect(askable('\\bgroup x\\egroup')).toBe(true)
  })
})

const doc = String.raw`\documentclass{article}
\newcommand\kw{}
\newcommand\nada{}
\newcommand\capt{}
\begin{document}
\section{A title \nada}
Words \kw{} and \nada{} here, \begingroup\small a group\endgroup{} then.
\input{more}
\begin{figure}\caption{A caption \capt}\end{figure}
\bibliographystyle{plain}
\bibliography{refs}
\end{document}
`
const MORE = 'More \\kw{} words and \\capt{} there.\n'
const paperOf = () =>
  openPaper(
    new Map([
      ['main.tex', enc(doc)],
      ['more.tex', enc(MORE)],
      ['refs.bib', enc('@misc{a,title={x}}\n')],
    ]),
  )

describe('the bibliography’s pass’s files with the asks (askedFiles)', () => {
  it('asks each sample right before its first use in running text, none in a heading’s title or a caption, nor a group’s own edge', () => {
    const paper = paperOf()
    const { files, asked } = askedFiles(paper, inkSamples(paper.units))
    expect(asked).toEqual(['\\kw{}', '\\nada{}', '\\capt{}'])
    const main = dec(files.get('main.tex')),
      more = dec(files.get('more.tex'))
    expect(main).toContain('Words \\axtask{0}{\\kw{}}\\kw{} and \\axtask{1}{\\nada{}}\\nada{} here')
    expect(main).toContain('\\section{A title \\nada}')
    expect(main).toContain('\\caption{A caption \\capt}')
    expect(main).toContain('\\begingroup\\small a group\\endgroup{}')
    // (a sample's first use in another file asked there; its later uses not)
    expect(more).toBe('More \\kw{} words and \\axtask{2}{\\capt{}}\\capt{} there.\n')
  })
  it('writes ASK_TEX after the unmarked head, on the main file’s first line: every line of the paper where it was', () => {
    const paper = paperOf()
    const main = dec(askedFiles(paper, inkSamples(paper.units)).files.get('main.tex'))
    expect(main.startsWith(`${UNMARKED_HEAD}${ASK_TEX}\\documentclass{article}\n`)).toBe(true)
    expect(ASK_TEX).not.toContain('\n')
    expect(main.split('\n').length).toBe(dec(unmarkedFiles(paper).get('main.tex')).split('\n').length)
  })
  it('gives the unmarked original where no sample is asked, and holds no file it asks nothing in', () => {
    const paper = paperOf()
    expect(askedFiles(paper, [])).toEqual({ files: unmarkedFiles(paper), asked: [] })
    expect([...askedFiles(paper, ['\\kw{}']).files.keys()]).toEqual(['main.tex'])
  })
})

describe('madeBibliography with `asks`', () => {
  const ASKED_LOG = `This is pdfTeX\n${listing(0, '\\hbox(4.3+0.0)x5.8', INKED)}\n${listing(1, NONE, [])}\nAXT-END\n`
  const host = (logs: string[], ok = true) => {
    const asked: CompileRequest[] = []
    const compile = async (req: CompileRequest) => {
      const log = logs[asked.length] ?? logs.at(-1)!
      asked.push(req)
      return { ok, log, files: new Map([['main.aux', enc('\\relax\n')]]) }
    }
    return { asked, compile }
  }
  it('asks the pass with the asks and returns what TeX answered where the document uses each macro', async () => {
    const paper = paperOf()
    const h = host([ASKED_LOG])
    const r = await madeBibliography(paper, { compile: h.compile, asks: true })
    expect(h.asked.length).toBe(1)
    expect(dec(h.asked[0]!.overrides!.get('main.tex'))).toContain(ASK_TEX)
    expect(h.asked[0]).toMatchObject({ bibtex: true, draft: true, files: true })
    expect(r.uses).toEqual({ inkless: ['\\nada{}'], inked: ['\\kw{}'] })
  })
  it('asks the pass again as today’s where the one with the asks did not run through, and returns no answer', async () => {
    const paper = paperOf()
    const h = host(['This is pdfTeX\n(That makes 100 errors; please try again.)\n', ASKED_LOG])
    const r = await madeBibliography(paper, { compile: h.compile, asks: true })
    expect(h.asked.length).toBe(2)
    expect(dec(h.asked[1]!.overrides!.get('main.tex'))).toBe(dec(unmarkedFiles(paper).get('main.tex')))
    expect(r.uses).toBeUndefined()
  })
  it('without `asks`, asks today’s pass alone', async () => {
    const paper = paperOf()
    const h = host([ASKED_LOG])
    const r = await madeBibliography(paper, { compile: h.compile })
    expect(h.asked.length).toBe(1)
    expect(dec(h.asked[0]!.overrides!.get('main.tex'))).toBe(dec(unmarkedFiles(paper).get('main.tex')))
    expect(r.uses).toBeUndefined()
  })
})
