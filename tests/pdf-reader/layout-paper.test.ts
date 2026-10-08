import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { inkSamples, LAYOUT_CLASSES, parseLayoutMarks, probeSamples, readInkProbe, readMarkProbe } from '@/pdf-reader/engine/layout/marks.mjs'
import { layoutMarksOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper, originalFiles, probeFiles } from '@/pdf-reader/engine/pipeline/live.mjs'

// A paper's layout marks in one call (layout/paper.mjs): the order of the two compiles and what each is asked, what the
// probe's answers set in the second, the log the marks are read from, the refusals and the PDF's `close`. The marks of the
// five papers are checked byte for byte against the layer gate's fixture maker by spikes/layout-paper-check.mjs (data this
// repository does not hold)

const enc = (s: string) => new TextEncoder().encode(s)
const SOURCE = '\\documentclass{article}\n\\newcommand{\\bert}{BERT}\n\\begin{document}\nWe use \\bert{} as in \\cite{a} with $x$ and \\ref{s} here.\\footnote{A note.}\n\nAnother paragraph of words.\n\\end{document}\n'
const paperOf = (source = SOURCE) => openPaper(new Map([['main.tex', enc(source)]]))
const text = (files: Map<string, Uint8Array>) => Object.fromEntries([...files].map(([name, bytes]) => [name, new TextDecoder().decode(bytes)]))

/** the probe's rows as TeX writes them to its log: \cite does not let a mark stand before its follower, \ref lets every one,
 *  \footnote is a call; the macro \bert sets no ink (an empty box) */
const CITE = 'LAYOUT-PROBE 1 punct 0 22220000', REF = 'LAYOUT-PROBE 1 punct 1 00000000', FOOTNOTE = 'LAYOUT-PROBE 1 punct 2 00220000'
const INK = ['LAYOUT-PROBE 1 ink-at 0', '> \\box54=', '\\hbox(0.0+0.0)x0.0', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 0']
const PROBE_LOG = ['This is pdfTeX', CITE, REF, FOOTNOTE, ...INK, ''].join('\n')
/** a browser compiler's log: each step's log joined with its terminal output, the earlier pass's lines before the last's */
const stepped = (...passes: string[]) => passes.map(p => `$ pdflatex main.tex\nLOG:\n${p}\n==\nSTDOUT:\nterminal output\n`).join('')

const PDF = enc('%PDF-1.7 the marked original')
/** a PDF.js document as layoutMarksOf reads it: one page, a destination of the first unit's start, and a spy on the operator lists */
function fakeDoc(over: Record<string, unknown> = {}) {
  const getOperatorList = vi.fn(async () => ({ fnArray: [], argsArray: [] }))
  return {
    getOperatorList,
    doc: {
      numPages: 1,
      getPage: async () => ({ view: [0, 0, 612, 792], rotate: 0, commonObjs: { get: () => null }, getTextContent: async () => ({ items: [], styles: {} }), getOperatorList }),
      getDestinations: async () => new Map([['axt-0s', [{ num: 1, gen: 0 }, { name: 'XYZ' }, 72, 700, null]]]),
      getPageIndex: async () => 0,
      ...over,
    },
  }
}

/** a compiler that answers the probe, then the original, and records what it was asked */
function compiler(answers: (Compiled | Error)[]) {
  const asked: CompileRequest[] = []
  return {
    asked,
    compile: async (req: CompileRequest): Promise<Compiled> => {
      asked.push(req)
      const a = answers[asked.length - 1] ?? { ok: false, error: 'not asked for' }
      if (a instanceof Error) throw a
      return a
    },
  }
}
const original = (log = 'AXT-LINES 0 3 12.0pt 10\n'): Compiled => ({ ok: true, pdf: PDF, log })

function opener(doc: unknown = fakeDoc().doc, closing: () => Promise<void> = async () => {}) {
  const close = vi.fn(closing)
  const open = vi.fn(async (_pdf: Uint8Array) => ({ doc, close }))
  return { open, close }
}

describe('layoutMarksOfPaper', () => {
  it('compiles the mark probe in one pass, then the marked original with the probe\'s answers, and reads the original\'s marks', async () => {
    const paper = paperOf()
    const switches = readMarkProbe(PROBE_LOG, probeSamples(paper.units)), inkless = readInkProbe(PROBE_LOG, inkSamples(paper.units))
    // (the answers say something, or the second request would not show they were used)
    expect(switches).toEqual({ '\\cite': '22220000', '\\ref': '00000000', '\\footnote': '00220000' })
    expect(inkless).toEqual(['\\bert{}'])
    const c = compiler([{ ok: false, pdf: null, log: PROBE_LOG }, original()])
    const { doc, getOperatorList } = fakeDoc()
    const { open, close } = opener(doc)
    const made = await layoutMarksOfPaper(paper, { compile: c.compile, open, OPS })
    if (!('marks' in made)) throw new Error(`refused: ${made.refused}`)
    expect(c.asked).toHaveLength(2)
    // the probe: one pass, no BibTeX, the paper's main file and engine, the mark probe's files
    expect(c.asked[0]).toMatchObject({ main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: false })
    expect(text(c.asked[0]?.overrides ?? new Map())).toEqual(text(probeFiles(paper, { marks: true })))
    expect(text(c.asked[0]?.overrides ?? new Map())['main.tex']).toContain('LAYOUT-PROBE')
    // the original: every pass, BibTeX as the run asks it, lines and the layout marks of every class, the probe's switch and its inkless macros
    expect(c.asked[1]).toMatchObject({ main: 'main.tex', engine: 'pdflatex', rerun: true, bibtex: null })
    expect(text(c.asked[1]?.overrides ?? new Map())).toEqual(text(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless })))
    expect(text(c.asked[1]?.overrides ?? new Map())).not.toEqual(text(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES })))
    // the marks: the original's PDF opened once, the file marked as the compile was
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(PDF)
    expect(close).toHaveBeenCalledTimes(1)
    const marks = parseLayoutMarks(made.marks)
    expect(marks.engine).toBe('pdflatex')
    expect(marks.marking).toEqual({ classes: [...LAYOUT_CLASSES], switches, inkless, texts: [] })
    expect(marks.marks).toEqual([['0s', 1, 72, 700]])
    expect(marks.lines).toEqual([[0, 3]])
    // (the units and PDF.js's operator codes were given: each page's operator list was read)
    expect(getOperatorList).toHaveBeenCalled()
    expect(made.ms).toEqual({ probe: expect.any(Number), compile: expect.any(Number), marks: expect.any(Number) })
  })

  it('asks BibTeX of nothing for a paper that ships its bibliography', async () => {
    const paper = openPaper(new Map([['main.tex', enc('\\documentclass{article}\n\\begin{document}\nSee \\cite{a}.\n\n\\bibliography{refs}\n\\end{document}\n')], ['main.bbl', enc('\\begin{thebibliography}{1}\n\\bibitem{a} A.\n\\end{thebibliography}\n')]]))
    expect(paper.meta.bbl).toBe(true)
    const c = compiler([{ ok: true, log: PROBE_LOG }, original()])
    await layoutMarksOfPaper(paper, { compile: c.compile, open: opener().open, OPS })
    expect(c.asked.map(r => r.bibtex)).toEqual([false, false])
  })

  it('reads the log of the last pass: the probe\'s answers and the original\'s lines', async () => {
    const paper = paperOf()
    // (what the first pass logged and the last did not is not read: the footnote's answer, the lines of unit 2, the mark TeX
    // dropped as set twice)
    const last = ['This is pdfTeX', CITE, REF, ...INK, ''].join('\n')
    const switches = readMarkProbe(last, probeSamples(paper.units))
    expect(switches).toEqual({ '\\cite': '22220000', '\\ref': '00000000' })
    const c = compiler([{ ok: true, log: stepped(PROBE_LOG, last) }, original(stepped('AXT-LINES 2 9 12.0pt 10\npdfTeX warning (dest): destination with the same identifier (name{axt-0s}) has been already used, duplicate ignored\n', 'AXT-LINES 0 3 12.0pt 10\nAXT-LINES 1 2 12.0pt 10\n'))])
    const made = await layoutMarksOfPaper(paper, { compile: c.compile, open: opener().open, OPS })
    if (!('marks' in made)) throw new Error(`refused: ${made.refused}`)
    expect(text(c.asked[1]?.overrides ?? new Map())).toEqual(text(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless: readInkProbe(last, inkSamples(paper.units)) })))
    const marks = parseLayoutMarks(made.marks)
    expect(marks.lines).toEqual([[0, 3], [1, 2]])
    expect(marks.dropped).toEqual([])
    expect(marks.marks).toEqual([['0s', 1, 72, 700]])
    expect(marks.marking.switches).toEqual(switches)
  })

  it('reads the probe\'s answers from its log whether or not the compile made a PDF (a probe has no pages)', async () => {
    const c = compiler([{ ok: false, error: 'no PDF', log: PROBE_LOG }, original()])
    const { open } = opener()
    expect(await layoutMarksOfPaper(paperOf(), { compile: c.compile, open, OPS })).toHaveProperty('marks')
  })

  it('refuses at the probe where its compile gave no log, asks for nothing more, and opens nothing', async () => {
    for (const probe of [{ ok: false, error: 'the page is down' }, { ok: true, log: '' }, new Error('the compiler threw')]) {
      const c = compiler([probe, original()])
      const { open, close } = opener()
      const made = await layoutMarksOfPaper(paperOf(), { compile: c.compile, open, OPS })
      expect(made).toEqual({ refused: 'probe', ms: { probe: expect.any(Number) } })
      expect(c.asked).toHaveLength(1)
      expect(open).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
    }
  })

  it('refuses at the compile where the original gave no PDF, or none that can be called one', async () => {
    for (const second of [{ ok: false, error: 'Compilation timeout' }, { ok: false, pdf: null, log: 'a halted pass' }, { ok: true, log: 'no PDF either' }, { ok: true, pdf: new Uint8Array(0), log: '' }, new Error('the compiler threw')]) {
      const c = compiler([{ ok: true, log: PROBE_LOG }, second])
      const { open, close } = opener()
      const made = await layoutMarksOfPaper(paperOf(), { compile: c.compile, open, OPS })
      expect(made).toEqual({ refused: 'compile', ms: { probe: expect.any(Number), compile: expect.any(Number) } })
      expect(c.asked).toHaveLength(2)
      expect(open).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
    }
  })

  it('refuses at the marks where the PDF cannot be opened or its reading throws, and closes what it opened', async () => {
    const reads: [string, () => ReturnType<typeof opener>][] = [
      ['the document has no pages', () => opener(fakeDoc({ numPages: 0 }).doc)],
      ['a page cannot be read', () => opener(fakeDoc({ getPage: async () => { throw new Error('bad page') } }).doc)],
      ['the destinations cannot be read', () => opener(fakeDoc({ getDestinations: async () => { throw new Error('bad destinations') } }).doc)],
    ]
    for (const [why, make] of reads) {
      const c = compiler([{ ok: true, log: PROBE_LOG }, original()])
      const { open, close } = make()
      const made = await layoutMarksOfPaper(paperOf(), { compile: c.compile, open, OPS })
      expect(made, why).toEqual({ refused: 'marks', ms: { probe: expect.any(Number), compile: expect.any(Number), marks: expect.any(Number) } })
      expect(close, why).toHaveBeenCalledTimes(1)
    }
    const c = compiler([{ ok: true, log: PROBE_LOG }, original()])
    const open = vi.fn(async (_pdf: Uint8Array): Promise<{ doc: unknown; close(): Promise<void> }> => { throw new Error('not a PDF') })
    expect(await layoutMarksOfPaper(paperOf(), { compile: c.compile, open, OPS })).toEqual({ refused: 'marks', ms: expect.any(Object) })
  })

  it('does not lose the marks to a close that fails, and never throws', async () => {
    const c = compiler([{ ok: true, log: PROBE_LOG }, original()])
    const { open, close } = opener(fakeDoc().doc, async () => { throw new Error('the worker is gone') })
    const made = await layoutMarksOfPaper(paperOf(), { compile: c.compile, open, OPS })
    expect(made).toHaveProperty('marks')
    expect(close).toHaveBeenCalledTimes(1)
    // a failing close after a failing reading changes nothing either
    const failing = opener(fakeDoc({ numPages: 0 }).doc, async () => { throw new Error('the worker is gone') })
    const again = compiler([{ ok: true, log: PROBE_LOG }, original()])
    expect(await layoutMarksOfPaper(paperOf(), { compile: again.compile, open: failing.open, OPS })).toMatchObject({ refused: 'marks' })
    expect(failing.close).toHaveBeenCalledTimes(1)
  })
})
