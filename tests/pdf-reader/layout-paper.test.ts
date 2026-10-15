import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { inkSamples, LAYOUT_CLASSES, parseLayoutMarks, probeSamples, readInkProbe, readMarkProbe } from '@/pdf-reader/engine/layout/marks.mjs'
import { layoutMarksOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper, originalFiles, probeFiles } from '@/pdf-reader/engine/pipeline/live.mjs'

// A paper's layout marks in one call (layout/paper.mjs): the order of the two compiles and what each is asked, what the
// probe's answers set in the second, the log the marks are read from, the refusals and the PDF's `close`. The marks of the
// five papers are checked byte for byte against the layer gate's fixture maker by spikes/layout-paper-check.mjs (data this
// repository does not hold). With `converge` (CM), against a fake compile: the drafts and the marked passes, what each is
// given, when it settles, the bound, the fallbacks and the refusals; CM against today's compile in a native TeX Live, on
// real papers, is spikes/cm-check.mjs

const enc = (s: string) => new TextEncoder().encode(s)
const SOURCE = '\\documentclass{article}\n\\newcommand{\\bert}{BERT}\n\\begin{document}\nWe use \\bert{} as in \\cite{a} with $x$ and \\ref{s} here.\\footnote{A note.}\n\nAnother paragraph of words.\n\\end{document}\n'
const paperOf = (source = SOURCE) => openPaper(new Map([['main.tex', enc(source)]]))
const text = (files: Map<string, Uint8Array>) => Object.fromEntries([...files].map(([name, bytes]) => [name, new TextDecoder().decode(bytes)]))

/** the probe's rows as TeX writes them to its log: \cite does not let a mark stand before its follower, \ref lets every one,
 *  \footnote is a call; the macro \bert sets no ink (an empty box) */
const CITE = 'LAYOUT-PROBE 1 punct 0 22220000', REF = 'LAYOUT-PROBE 1 punct 1 00000000', FOOTNOTE = 'LAYOUT-PROBE 1 punct 2 00220000'
const INK = ['LAYOUT-PROBE 1 ink-at 0', '> \\box54=', '\\hbox(0.0+0.0)x0.0', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 0']
/** and the paper's \lineskip and \lineskiplimit, LaTeX's own */
const SKIP = 'LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt'
const PROBE_LOG = ['This is pdfTeX', CITE, REF, FOOTNOTE, ...INK, SKIP, ''].join('\n')
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
    // (the probe's log answers no name: its own text not known, as a probe of a paper that wraps none; its skips, LaTeX's
    // 1pt and 0pt, in PDF units as the file writes every number, to a hundredth: 72 / 72.27 is 1)
    expect(marks.marking).toEqual({ classes: [...LAYOUT_CLASSES], switches, inkless, texts: [], names: {}, lineskip: [1, 0] })
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

// ---- CM, converge then mark (`converge`): the unmarked original in draft passes, then the marked original one pass at a
// time in the files the passes before returned, until a pass writes the files it was given

const END = 'AXT-END\n'
const LINES = 'AXT-LINES 0 3 12.0pt 10\n'
const filesOf = (o: Record<string, string>) => new Map(Object.entries(o).map(([p, t]) => [p, enc(t)]))
/** a draft's answer: TeX ran to the document's end, no PDF, the files it made */
const draftOf = (files: Record<string, string>, log = END): Compiled => ({ ok: true, pdf: null, log, aux: files['main.aux'] ?? null, files: filesOf(files) })
/** a marked pass's answer: its PDF, its log, the files it made */
const markedOf = (files: Record<string, string>, { pdf = PDF, log = `${LINES}${END}` }: { pdf?: Uint8Array; log?: string } = {}): Compiled => ({ ok: true, pdf, log, aux: files['main.aux'] ?? null, files: filesOf(files) })
const AUX = '\\relax \n\\newlabel{s}{{1}{1}}\n'
const PROBE: Compiled = { ok: true, log: PROBE_LOG }
const markedFiles = (paper: ReturnType<typeof paperOf>) => {
  const switches = readMarkProbe(PROBE_LOG, probeSamples(paper.units)), inkless = readInkProbe(PROBE_LOG, inkSamples(paper.units))
  return originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless })
}
/** the files a request was given, each as text */
const given = (req: CompileRequest | undefined) => text(req?.overrides ?? new Map())
const cmOf = async (answers: (Compiled | Error)[], paper = paperOf(), doc = fakeDoc().doc) => {
  const c = compiler(answers), o = opener(doc)
  const made = await layoutMarksOfPaper(paper, { compile: c.compile, open: o.open, OPS, converge: true })
  return { made, asked: c.asked, ...o, paper }
}

describe('layoutMarksOfPaper without converge', () => {
  it('asks exactly today\'s two compiles, and gives no CM record', async () => {
    for (const converge of [undefined, false]) {
      const paper = paperOf(), c = compiler([PROBE, original()])
      const made = await layoutMarksOfPaper(paper, { compile: c.compile, open: opener().open, OPS, ...(converge === undefined ? {} : { converge }) })
      expect(made).not.toHaveProperty('cm')
      expect(c.asked).toEqual([
        { main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: false, overrides: probeFiles(paper, { marks: true }) },
        { main: 'main.tex', engine: 'pdflatex', rerun: true, bibtex: null, overrides: markedFiles(paper) },
      ])
      // (no request carries CM's fields, not even as undefined)
      for (const req of c.asked) expect(Object.keys(req).sort()).toEqual(['bibtex', 'engine', 'main', 'overrides', 'rerun'])
    }
  })
})

describe('layoutMarksOfPaper with converge (CM)', () => {
  it('asks the probe as today, then one draft of the unmarked original, then the marked original in its files: settled in one marked pass', async () => {
    const { made, asked, open, paper } = await cmOf([PROBE, draftOf({ 'main.aux': AUX }), markedOf({ 'main.aux': AUX })])
    if (!('marks' in made)) throw new Error(`refused: ${made.refused}`)
    expect(made.cm).toEqual({ drafts: 1, marked: 1, settled: true })
    expect(asked).toHaveLength(3)
    expect(asked[0]).toEqual({ main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: false, overrides: probeFiles(paper, { marks: true }) })
    // the draft: the unmarked original (unit marks and line probes), one pass with no output, its files asked for, and
    // BibTeX where the paper ships no bibliography
    expect(asked[1]).toMatchObject({ main: 'main.tex', engine: 'pdflatex', rerun: false, draft: true, files: true, bibtex: true })
    expect(given(asked[1])).toEqual(text(originalFiles(paper, { lines: true })))
    // the marked pass: the marked original with the draft's files over it, one pass, its PDF; no BibTeX, its input the same
    expect(asked[2]).toMatchObject({ main: 'main.tex', engine: 'pdflatex', rerun: false, draft: false, files: true, bibtex: false })
    expect(given(asked[2])).toEqual({ ...text(markedFiles(paper)), 'main.aux': AUX })
    expect(open).toHaveBeenCalledWith(PDF)
    expect(parseLayoutMarks(made.marks).lines).toEqual([[0, 3]])
    expect(made.ms).toEqual({ probe: expect.any(Number), compile: expect.any(Number), marks: expect.any(Number) })
  })

  it('runs a second draft where the first left the next pass a bibliography or an index with text, or a list it set from nothing', async () => {
    const toc = '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Intro}{1}{}}\n'
    const cases: [string, Record<string, string>, string][] = [
      ['a bibliography BibTeX made', { 'main.aux': AUX, 'main.bbl': '\\begin{thebibliography}{1}\n\\bibitem{a} A.\n\\end{thebibliography}\n' }, `No file main.bbl.\n${END}`],
      ['an index makeindex made', { 'main.aux': AUX, 'main.ind': '\\begin{theindex}\n\\item x, 1\n\\end{theindex}\n' }, `No file main.ind.\n${END}`],
      ['a contents list set from nothing', { 'main.aux': toc, 'main.toc': '' }, `No file main.toc.\n${END}`],
    ]
    for (const [why, files, log] of cases) {
      const { made, asked } = await cmOf([PROBE, draftOf(files, log), draftOf(files), markedOf(files)])
      expect(made, why).toMatchObject({ cm: { drafts: 2, marked: 1, settled: true } })
      expect(asked.map(r => r.draft), why).toEqual([undefined, true, true, false])
      // (the second draft is given the first's files)
      expect(given(asked[2]), why).toMatchObject(files)
    }
  })

  it('reads the aux from the first draft\'s files, not its lossy `aux` field', async () => {
    const files = { 'main.aux': '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Intro}{1}{}}\n', 'main.toc': '' }
    const first: Compiled = { ...draftOf(files, `No file main.toc.\n${END}`), aux: null }
    const { made, asked } = await cmOf([PROBE, first, draftOf(files), markedOf(files)])
    expect(made).toMatchObject({ cm: { drafts: 2, marked: 1, settled: true } })
    expect(asked.map(r => r.draft)).toEqual([undefined, true, true, false])
  })

  it('runs one draft where the first left a bibliography it never looked for or a blank one, or a list it found', async () => {
    const toc = '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Intro}{1}{}}\n'
    const cases: [Record<string, string>, string][] = [
      // (BibTeX's for an aux that cites with no \bibdata: a paper whose bibliography is inline never reads it, 1706.03762)
      [{ 'main.aux': AUX, 'main.bbl': '\\begin{thebibliography}{}\n\n\\end{thebibliography}\n' }, END],
      [{ 'main.aux': AUX, 'main.bbl': '\n  \n' }, `No file main.bbl.\n${END}`],
      [{ 'main.aux': toc, 'main.toc': '\\contentsline {section}{\\numberline {1}Intro}{1}{}\n' }, END],
    ]
    for (const [files, log] of cases) {
      const { made, asked } = await cmOf([PROBE, draftOf(files, log), markedOf(files)])
      expect(made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
      expect(asked).toHaveLength(3)
    }
  })

  it('asks BibTeX on the first draft where the paper ships no bibliography, then only where its input changed', async () => {
    const aux1 = '\\relax \n\\citation{a}\n\\bibdata{refs}\n\\bibstyle{plain}\n\\newlabel{s}{{1}{1}}\n'
    const aux2 = '\\relax \n\\citation{a}\n\\citation{b}\n\\bibdata{refs}\n\\bibstyle{plain}\n\\newlabel{s}{{1}{1}}\n'
    const bbl1 = '\\begin{thebibliography}{1}\n\\bibitem{a} A.\n\\end{thebibliography}\n', bbl2 = '\\begin{thebibliography}{2}\n\\bibitem{a} A.\n\\bibitem{b} B.\n\\end{thebibliography}\n'
    const { made, asked } = await cmOf([
      PROBE,
      draftOf({ 'main.aux': aux1, 'main.bbl': bbl1 }, `No file main.bbl.\n${END}`),
      // (a citation the first draft had not written: the bibliography's input changed)
      draftOf({ 'main.aux': aux2 }),
      // (BibTeX after this pass, a new bibliography: not the files it was given)
      markedOf({ 'main.aux': aux2, 'main.bbl': bbl2 }),
      markedOf({ 'main.aux': aux2 }),
    ], openPaper(new Map([['main.tex', enc(SOURCE)], ['refs.bib', enc('@article{a}')]])))
    expect(made).toMatchObject({ cm: { drafts: 2, marked: 2, settled: true } })
    expect(asked.map(r => r.bibtex)).toEqual([false, true, false, true, false])
    expect(given(asked[4])).toMatchObject({ 'main.aux': aux2, 'main.bbl': bbl2 })
    // a paper that ships its bibliography asks none, whatever its aux cites
    const shipped = openPaper(new Map([['main.tex', enc('\\documentclass{article}\n\\begin{document}\nSee \\cite{a}.\n\n\\bibliography{refs}\n\\end{document}\n')], ['main.bbl', enc(bbl1)]]))
    const again = await cmOf([PROBE, draftOf({ 'main.aux': aux1 }), markedOf({ 'main.aux': aux2 }), markedOf({ 'main.aux': aux2 })], shipped)
    expect(again.made).toMatchObject({ cm: { drafts: 1, marked: 2, settled: true } })
    expect(again.asked.map(r => r.bibtex)).toEqual([false, false, false, false])
  })

  it('gives each pass every file the passes before returned, the latest copy of each, over the paper\'s own files but never over the pass\'s', async () => {
    const paper = openPaper(new Map([['main.tex', enc(SOURCE)], ['extra.sty', enc('% the paper\'s own\n')]]))
    const toc = '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Intro}{1}{}}\n'
    const { made, asked } = await cmOf([
      PROBE,
      draftOf({ 'main.aux': toc, 'main.toc': '', 'extra.sty': '% written by the paper\'s filecontents\n' }, `No file main.toc.\n${END}`),
      draftOf({ 'main.toc': 'T2\n' }),
      markedOf({ 'main.toc': 'T2\n' }),
    ], paper)
    expect(made).toMatchObject({ cm: { drafts: 2, marked: 1, settled: true } })
    // (a file not returned keeps its bytes; a later copy replaces it)
    expect(given(asked[3])).toMatchObject({ 'main.aux': toc, 'main.toc': 'T2\n', 'extra.sty': '% written by the paper\'s filecontents\n' })
    expect(given(asked[3])['main.tex']).toEqual(text(markedFiles(paper))['main.tex'])
    // (a file a pass wrote at a path of the original's own — the unmarked copy, under openout_any=p — never replaces the
    // marked pass's: its marks would be gone)
    const over = await cmOf([PROBE, draftOf({ 'main.aux': AUX, 'main.tex': '% written by the pass\n' }), markedOf({ 'main.aux': AUX, 'main.tex': text(markedFiles(paperOf()))['main.tex'] as string })])
    expect(over.made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
    expect(given(over.asked[2])['main.tex']).toEqual(text(markedFiles(paperOf()))['main.tex'])
  })

  it('compares bytes, not paths: a rewrite of the bytes a pass was given (its own, the carried or the paper\'s) is the same', async () => {
    const ind = '\\begin{theindex}\n\\item x, 1\n\\end{theindex}\n'
    const paper = openPaper(new Map([['main.tex', enc(SOURCE)], ['main.ind', enc(ind)], ['extra.sty', enc('% the paper\'s own\n')]]))
    // (makeindex wrote the index the paper ships, byte for byte: nothing new to read, one draft; the marked pass rewrote a
    // file of the paper's with its own bytes: settled)
    const { made, asked } = await cmOf([PROBE, draftOf({ 'main.aux': AUX, 'main.ind': ind }), markedOf({ 'main.aux': AUX, 'main.ind': ind, 'extra.sty': '% the paper\'s own\n' })], paper)
    expect(made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
    expect(asked).toHaveLength(3)
    // (and other bytes than the paper's are another file)
    const other = await cmOf([PROBE, draftOf({ 'main.aux': AUX, 'main.ind': `${ind}\n\\item y, 2\n` }), draftOf({ 'main.aux': AUX }), markedOf({ 'main.aux': AUX, 'extra.sty': '% rewritten\n' }), markedOf({ 'main.aux': AUX, 'extra.sty': '% rewritten\n' })], paper)
    expect(other.made).toMatchObject({ cm: { drafts: 2, marked: 2, settled: true } })
  })

  it('compiles the marked original again where a pass wrote other files than it was given, and reads the marks of the one that wrote the same', async () => {
    const pdf2 = enc('%PDF-1.7 the second marked pass')
    const { made, asked, open } = await cmOf([
      PROBE,
      draftOf({ 'main.aux': AUX }),
      markedOf({ 'main.aux': '\\relax \n\\newlabel{s}{{1}{2}}\n' }),
      markedOf({ 'main.aux': '\\relax \n\\newlabel{s}{{1}{2}}\n' }, { pdf: pdf2, log: `AXT-LINES 0 4 12.0pt 10\n${END}` }),
    ])
    if (!('marks' in made)) throw new Error(`refused: ${made.refused}`)
    expect(made.cm).toEqual({ drafts: 1, marked: 2, settled: true })
    expect(given(asked[3])['main.aux']).toBe('\\relax \n\\newlabel{s}{{1}{2}}\n')
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(pdf2)
    expect(parseLayoutMarks(made.marks).lines).toEqual([[0, 4]])
  })

  it('takes a mark in a file the paper writes and reads back as a difference, a name\'s mark only in the aux and the lists as none', async () => {
    // (pdfx reads a marked .xmpdata in the next pass: that pass is not latexmk's fixed point)
    const xmp = (title: string) => `\\Title{${title}}\n`
    const bare = await cmOf([PROBE, draftOf({ 'main.aux': AUX, 'main.xmpdata': xmp('A paper') }), markedOf({ 'main.aux': AUX, 'main.xmpdata': xmp('\\axthmark {h2s}A paper') }), markedOf({ 'main.aux': AUX, 'main.xmpdata': xmp('\\axthmark {h2s}A paper') })])
    expect(bare.made).toMatchObject({ cm: { drafts: 1, marked: 2, settled: true } })
    // a name's mark in a file that is not the aux or a list is one too
    const named = '\\protect \\axtnma {abstract}Abstract\\protect \\axtnmb {abstract}'
    const cut = await cmOf([PROBE, draftOf({ 'main.aux': AUX, 'comment.cut': 'Abstract\n' }), markedOf({ 'main.aux': AUX, 'comment.cut': `${named}\n` }), markedOf({ 'main.aux': AUX, 'comment.cut': `${named}\n` })])
    expect(cut.made).toMatchObject({ cm: { drafts: 1, marked: 2, settled: true } })
    // a changed number is a difference whatever the marks
    const page = await cmOf([PROBE, draftOf({ 'main.aux': AUX, 'main.toc': `${named}\n` }), markedOf({ 'main.aux': AUX, 'main.toc': `${named}\n`.replace('Abstract', 'Abstract 2') }), markedOf({ 'main.aux': AUX, 'main.toc': `${named}\n`.replace('Abstract', 'Abstract 2') })])
    expect(page.made).toMatchObject({ cm: { drafts: 1, marked: 2, settled: true } })
  })

  it('stops at five TeX passes in all, drafts with them, and keeps the last PDF, not settled', async () => {
    const pdf5 = enc('%PDF-1.7 the fifth pass')
    const moving = (n: number, pdf = PDF) => markedOf({ 'main.aux': `\\relax \n\\newlabel{s}{{1}{${n}}}\n` }, { pdf })
    const one = await cmOf([PROBE, draftOf({ 'main.aux': AUX }), moving(2), moving(3), moving(4), moving(5, pdf5), moving(6)])
    expect(one.made).toMatchObject({ marks: expect.any(Uint8Array), cm: { drafts: 1, marked: 4, settled: false } })
    expect(one.asked).toHaveLength(6)
    expect(one.open).toHaveBeenCalledWith(pdf5)
    const bbl = '\\begin{thebibliography}{1}\n\\bibitem{a} A.\n\\end{thebibliography}\n'
    const two = await cmOf([PROBE, draftOf({ 'main.aux': AUX, 'main.bbl': bbl }, `No file main.bbl.\n${END}`), draftOf({ 'main.aux': AUX }), moving(2), moving(3), moving(4, pdf5), moving(5)])
    expect(two.made).toMatchObject({ cm: { drafts: 2, marked: 3, settled: false } })
    expect(two.asked).toHaveLength(6)
    expect(two.open).toHaveBeenCalledWith(pdf5)
  })

  it('takes a list that differs only by a babel name\'s marks as the same, and a changed label as another', async () => {
    const toc = '\\contentsline {section}{\\numberline {1}Contents}{1}{section.1}\n'
    const named = '\\contentsline {section}{\\numberline {1}\\protect \\axtnma {contentsname}Contents\\protect \\axtnmb {contentsname}}{1}{section.1}\n'
    const aux = '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}Contents}{1}{section.1}}\n\\newlabel{s}{{1}{1}}\n'
    const auxNamed = '\\relax \n\\@writefile{toc}{\\contentsline {section}{\\numberline {1}\\protect \\axtnma {contentsname}Contents\\protect \\axtnmb {contentsname}}{1}{section.1}}\n\\newlabel{s}{{1}{1}}\n'
    const same = await cmOf([PROBE, draftOf({ 'main.aux': aux, 'main.toc': toc }), markedOf({ 'main.aux': auxNamed, 'main.toc': named })])
    expect(same.made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
    const label = await cmOf([PROBE, draftOf({ 'main.aux': aux, 'main.toc': toc }), markedOf({ 'main.aux': auxNamed.replace('{{1}{1}}', '{{1}{2}}'), 'main.toc': named }), markedOf({ 'main.aux': auxNamed.replace('{{1}{1}}', '{{1}{2}}'), 'main.toc': named })])
    expect(label.made).toMatchObject({ cm: { drafts: 1, marked: 2, settled: true } })
    // (a file the pass made that it was not given is another too)
    const added = await cmOf([PROBE, draftOf({ 'main.aux': AUX }), markedOf({ 'main.aux': AUX, 'main.out': 'x' }), markedOf({ 'main.aux': AUX, 'main.out': 'x' })])
    expect(added.made).toMatchObject({ cm: { drafts: 1, marked: 2, settled: true } })
  })

  it('falls back to today\'s compile where a draft returned no files or did not run through', async () => {
    const bbl = '\\begin{thebibliography}{1}\n\\bibitem{a} A.\n\\end{thebibliography}\n'
    const cases: [string, (Compiled | Error)[], 'no-files' | 'draft-failed' | 'aux-jobs' | 'bib-missing', number][] = [
      ['a host that returns no files', [PROBE, { ok: true, pdf: null, log: END }], 'no-files', 1],
      ['a draft that is not ok', [PROBE, { ...draftOf({ 'main.aux': AUX }), ok: false, error: 'limit cpu' }], 'draft-failed', 1],
      ['a draft that timed out (a host returns files only with ok)', [PROBE, { ok: false, pdf: null, log: 'the log of a pass the wall stopped\n', error: 'Compilation timeout' }], 'draft-failed', 1],
      ['a draft that stopped short', [PROBE, draftOf({ 'main.aux': AUX }, `! Emergency stop.\n${END}`)], 'draft-failed', 1],
      ['a draft with no AXT-END', [PROBE, draftOf({ 'main.aux': AUX }, 'the log of a halted pass\n')], 'draft-failed', 1],
      ['a second draft that did not run through', [PROBE, draftOf({ 'main.aux': AUX, 'main.bbl': bbl }, `No file main.bbl.\n${END}`), draftOf({ 'main.aux': AUX }, '! TeX capacity exceeded, sorry [main memory size=5000000].\n')], 'draft-failed', 2],
      ['a bibliography job beside the main one\'s (chapterbib, multibib): latexmk runs BibTeX on it, a pass does not', [PROBE, draftOf({ 'main.aux': AUX, 'chap.aux': '\\relax \n\\bibstyle{plain}\n\\bibdata{refs}\n' })], 'aux-jobs', 1],
      ['a bibliography whose .bib the project lacks: latexmk skips the step, BibTeX writes an empty one', [PROBE, draftOf({ 'main.aux': `${AUX}\\bibdata{refs,more}\n` })], 'bib-missing', 1],
      ['a biber datasource the project lacks', [PROBE, draftOf({ 'main.aux': AUX, 'main.bcf': '<bcf:controlfile><bcf:bibdata><bcf:datasource type="file" datatype="bibtex">refs.bib</bcf:datasource></bcf:bibdata></bcf:controlfile>' })], 'bib-missing', 1],
      ['a marked pass that returned no files', [PROBE, draftOf({ 'main.aux': AUX }), { ok: true, pdf: PDF, log: `${LINES}${END}` }], 'no-files', 1],
    ]
    for (const [why, answers, fallback, drafts] of cases) {
      const { made, asked, open, paper } = await cmOf([...answers, original()])
      expect(made, why).toMatchObject({ marks: expect.any(Uint8Array), cm: { drafts, settled: false, fallback } })
      // today's request for the marked original, exactly
      expect(asked.at(-1), why).toEqual({ main: 'main.tex', engine: 'pdflatex', rerun: true, bibtex: null, overrides: markedFiles(paper) })
      expect(open, why).toHaveBeenCalledWith(PDF)
    }
    // (and as today where it fails too)
    const failed = await cmOf([PROBE, { ok: true, pdf: null, log: END }, { ok: false, error: 'Compilation timeout' }])
    expect(failed.made).toEqual({ refused: 'compile', ms: { probe: expect.any(Number), compile: expect.any(Number) }, cm: { drafts: 1, marked: 0, settled: false, fallback: 'no-files' } })
  })

  it('takes an aux of another name with no \\bibdata (an \\include\'d chapter\'s) as no bibliography job', async () => {
    const made = await cmOf([PROBE, draftOf({ 'main.aux': AUX, 'chap.aux': '\\relax \n\\@setckpt{chap}{\\setcounter{page}{2}}\n' }), markedOf({ 'main.aux': AUX })])
    expect(made.made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
    expect(made.made.cm).not.toHaveProperty('fallback')
  })

  it('keeps CM where every .bib the aux names is in the project', async () => {
    const paper = openPaper(new Map([['main.tex', enc(SOURCE)], ['refs.bib', enc('@article{a}')], ['more.bib', enc('@article{b}')]]))
    const made = await cmOf([PROBE, draftOf({ 'main.aux': `${AUX}\\bibdata{refs, more}\n` }), markedOf({ 'main.aux': `${AUX}\\bibdata{refs, more}\n` })], paper)
    expect(made.made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
    expect(made.made.cm).not.toHaveProperty('fallback')
  })

  it('refuses at the compile where a draft throws or a marked pass did not run through, and opens nothing', async () => {
    const bad: [string, Compiled | Error][] = [
      ['not ok', { ...markedOf({ 'main.aux': AUX }), ok: false }],
      ['stopped short', markedOf({ 'main.aux': AUX }, { log: `! Emergency stop.\n${END}` })],
      ['no AXT-END', markedOf({ 'main.aux': AUX }, { log: LINES })],
      ['no PDF', markedOf({ 'main.aux': AUX }, { pdf: new Uint8Array(0) })],
      ['timed out, no files with it', { ok: false, pdf: null, log: LINES, error: 'Compilation timeout' }],
      ['a throw', new Error('the compiler threw')],
    ]
    for (const [why, answer] of bad) {
      const { made, asked, open, close } = await cmOf([PROBE, draftOf({ 'main.aux': AUX }), answer, original()])
      expect(made, why).toEqual({ refused: 'compile', ms: { probe: expect.any(Number), compile: expect.any(Number) }, cm: { drafts: 1, marked: 1, settled: false } })
      expect(asked, why).toHaveLength(3)
      expect(open, why).not.toHaveBeenCalled()
      expect(close, why).not.toHaveBeenCalled()
    }
    const thrown = await cmOf([PROBE, new Error('the compiler threw'), original()])
    expect(thrown.made).toEqual({ refused: 'compile', ms: { probe: expect.any(Number), compile: expect.any(Number) }, cm: { drafts: 1, marked: 0, settled: false } })
    expect(thrown.asked).toHaveLength(2)
  })

  it('starts no bet the host\'s compile budget cannot hold: a second draft or a marked pass after the first', async () => {
    const bbl = '\\begin{thebibliography}{1}\n\\bibitem{a} A.\n\\end{thebibliography}\n'
    const timed = (c: Compiled, ms: number): Compiled => ({ ...c, ms })
    const moving = (n: number, ms: number) => timed(markedOf({ 'main.aux': `\\relax \n\\newlabel{s}{{1}{${n}}}\n` }), ms)
    const run = async (answers: Compiled[], compileBudgetMs?: number | null) => {
      const c = compiler(answers), o = opener()
      const made = await layoutMarksOfPaper(paperOf(), { compile: c.compile, open: o.open, OPS, converge: true, ...(compileBudgetMs === undefined ? {} : { compileBudgetMs }) })
      return { made, asked: c.asked, open: o.open }
    }
    // a draft that would have asked for a second (a bibliography it looked for): probe 10 ms, draft 100 ms
    const draft = timed(draftOf({ 'main.aux': AUX, 'main.bbl': bbl }, `No file main.bbl.\n${END}`), 100)
    // 210 left after them: room for a pass of 1.2 x 100; 200 - 110 = 90 is not, and the marked pass comes next
    expect((await run([timed(PROBE, 10), draft, timed(draftOf({ 'main.aux': AUX }), 100), moving(1, 100)], 320)).made).toMatchObject({ cm: { drafts: 2, marked: 1, settled: true } })
    const thin = await run([timed(PROBE, 10), draft, moving(1, 100)], 200)
    expect(thin.made).toMatchObject({ marks: expect.any(Uint8Array), cm: { drafts: 1, marked: 1, settled: true } })
    expect(thin.asked.map(r => r.draft)).toEqual([undefined, true, false])
    // a marked pass that did not settle is kept where the next does not fit: the first marked pass is no bet, and is asked
    const pdf1 = enc('%PDF-1.7 the first marked pass')
    const kept = await run([timed(PROBE, 10), timed(draftOf({ 'main.aux': AUX }), 100), timed(markedOf({ 'main.aux': '\\relax \n\\newlabel{s}{{1}{2}}\n' }, { pdf: pdf1 }), 150), moving(3, 150)], 300)
    expect(kept.made).toMatchObject({ marks: expect.any(Uint8Array), cm: { drafts: 1, marked: 1, settled: false } })
    expect(kept.asked).toHaveLength(3)
    expect(kept.open).toHaveBeenCalledWith(pdf1)
    // (no budget, or null: every bet as the bound allows)
    for (const budget of [undefined, null]) expect((await run([timed(PROBE, 10), timed(draftOf({ 'main.aux': AUX }), 100), moving(2, 1e6), moving(2, 1e6)], budget)).made).toMatchObject({ cm: { drafts: 1, marked: 2, settled: true } })
  })

  it('gives the marks file today\'s compile gives for the same PDF and log: no pass count enters it', async () => {
    const log = stepped('AXT-LINES 0 2 12.0pt 10\n', `AXT-LINES 0 3 12.0pt 10\nAXT-LINES 1 2 12.0pt 10\n${END}`)
    const today = compiler([PROBE, { ok: true, pdf: PDF, log }])
    const off = await layoutMarksOfPaper(paperOf(), { compile: today.compile, open: opener().open, OPS })
    const on = await cmOf([PROBE, draftOf({ 'main.aux': AUX }), markedOf({ 'main.aux': '\\relax \n' }, { log }), markedOf({ 'main.aux': '\\relax \n' }, { log })])
    if (!('marks' in off) || !('marks' in on.made)) throw new Error('refused')
    expect(on.made.cm).toEqual({ drafts: 1, marked: 2, settled: true })
    expect(Buffer.from(on.made.marks).equals(Buffer.from(off.marks))).toBe(true)
  })
})
