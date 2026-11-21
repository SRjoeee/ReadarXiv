import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { LayoutRefusal } from '@/pdf-reader/engine/layout/json.mjs'
import { encodeLayoutMarks, inkSamples, LAYOUT_CLASSES, leadSamples, marksFile, parseLayoutMarks, probeSamples, readInkApart, readInkDecorated, readInkProbe, readInkTexts, readMarked, readMarkProbe, readNameProbe, readSkipProbe } from '@/pdf-reader/engine/layout/marks.mjs'
import { layoutMarksOfPaper, markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper, originalFiles, probeFiles } from '@/pdf-reader/engine/pipeline/live.mjs'

// A paper's layout marks in one call (layout/paper.mjs): the order of the two compiles and what each is asked, what the
// probe's answers set in the second, the log the marks are read from, the refusals and the PDF's `close`. The marks of the
// five papers are checked byte for byte against the layer gate's fixture maker by spikes/layout-paper-check.mjs (data this
// repository does not hold). With `converge` (Q1, the pass loop), that the marks file is today's for the same PDF and log; the
// loop's passes, on compile doubles, are packages/engine/tests/marked-loop.test.ts, and the loop against today's compile in a
// native TeX Live, on real papers, lab/pdf/spikes/q1-check.mjs

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
/** an engine's banner, the first line of a log TeX wrote (a compile with none ran no TeX: the guard's `engine`) */
const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n'
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
/** the marked original's answer: its PDF and a log whose last pass ran to the document's end (END_TEX's AXT-END, which every
 *  marked original carries: live.mjs originalFiles) */
const original = (log = 'AXT-LINES 0 3 12.0pt 10\nAXT-END\n'): Compiled => ({ ok: true, pdf: PDF, log })

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
    const made = await layoutMarksOfPaper(paper, { final: false, compile: c.compile, open, OPS })
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
    const marks = made.marks
    // (in memory as the file is read back: the maker takes them as they are)
    expect(parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks(marks)))).toEqual(marks)
    // the unit marks the left is anchored by, read from the same document: the start mark of unit 0 (no word on the page)
    expect(made.unitMarks).toEqual(new Map([['0s', { page: 1, x: 72, y: 700, t: null }]]))
    expect(marks.engine).toBe('pdflatex')
    // (the probe's log answers no name: its own text not known, as a probe of a paper that wraps none; its skips, LaTeX's
    // 1pt and 0pt, in PDF units as the file writes every number, to a hundredth: 72 / 72.27 is 1)
    // (the paper's \\bert, defined to read nothing past its arguments and called: the marking's; TeX's box for it begins with a letter)
    expect(marks.marking).toEqual({ classes: [...LAYOUT_CLASSES], switches, inkless, texts: [], names: {}, lineskip: [1, 0], complete: { bert: 0 }, apart: [] })
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
    await layoutMarksOfPaper(paper, { final: false, compile: c.compile, open: opener().open, OPS })
    expect(c.asked.map(r => r.bibtex)).toEqual([false, false])
  })

  it('reads the log of the last pass: the probe\'s answers and the original\'s lines', async () => {
    const paper = paperOf()
    // (what the first pass logged and the last did not is not read: the footnote's answer, the lines of unit 2, the mark TeX
    // dropped as set twice)
    const last = ['This is pdfTeX', CITE, REF, ...INK, ''].join('\n')
    const switches = readMarkProbe(last, probeSamples(paper.units))
    expect(switches).toEqual({ '\\cite': '22220000', '\\ref': '00000000' })
    const c = compiler([{ ok: true, log: stepped(PROBE_LOG, last) }, original(stepped('AXT-LINES 2 9 12.0pt 10\npdfTeX warning (dest): destination with the same identifier (name{axt-0s}) has been already used, duplicate ignored\n', 'AXT-LINES 0 3 12.0pt 10\nAXT-LINES 1 2 12.0pt 10\nAXT-END\n'))])
    const made = await layoutMarksOfPaper(paper, { final: false, compile: c.compile, open: opener().open, OPS })
    if (!('marks' in made)) throw new Error(`refused: ${made.refused}`)
    expect(text(c.asked[1]?.overrides ?? new Map())).toEqual(text(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless: readInkProbe(last, inkSamples(paper.units)) })))
    const marks = made.marks
    expect(marks.lines).toEqual([[0, 3], [1, 2]])
    expect(marks.dropped).toEqual([])
    expect(marks.marks).toEqual([['0s', 1, 72, 700]])
    expect(marks.marking.switches).toEqual(switches)
  })

  it('reads the probe\'s answers from its log whether or not the compile made a PDF (a probe has no pages)', async () => {
    const c = compiler([{ ok: false, error: 'no PDF', log: PROBE_LOG }, original()])
    const { open } = opener()
    expect(await layoutMarksOfPaper(paperOf(), { final: false, compile: c.compile, open, OPS })).toHaveProperty('marks')
  })

  it('refuses at the probe where its compile gave no log, asks for nothing more, and opens nothing', async () => {
    for (const probe of [{ ok: false, error: 'the page is down' }, { ok: true, log: '' }, new Error('the compiler threw')]) {
      const c = compiler([probe, original()])
      const { open, close } = opener()
      const made = await layoutMarksOfPaper(paperOf(), { final: false, compile: c.compile, open, OPS })
      expect(made).toEqual({ refused: 'probe', ms: { probe: expect.any(Number) } })
      expect(c.asked).toHaveLength(1)
      expect(open).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
    }
  })

  it('refuses at the compile where the original gave no PDF, or none that can be called one, and asks no compile more where TeX never ran', async () => {
    // (a host's limit, or a compile TeX never ran — no engine banner —, is no mark's fault, and no compile mends it; it is the
    // compile's but where the host names the engine unknown (the guard's tests); a throw is the host's)
    const ran = { extra: 0, unmarked: [], names: true, failed: ['ran'] }
    const cases: [Compiled | Error, Record<string, unknown>][] = [
      [{ ok: false, error: 'Compilation timeout' }, { refused: 'compile', why: 'the marked original was stopped by the host\'s time limit', limit: 'time', guard: ran }],
      [{ ok: false, pdf: null, log: 'a halted pass' }, { refused: 'compile', why: 'the pdflatex compile ran no TeX: a halted pass', guard: ran }],
      [{ ok: true, log: 'no PDF either' }, { refused: 'compile', why: 'the pdflatex compile ran no TeX: no PDF either', guard: ran }],
      [{ ok: true, pdf: new Uint8Array(0), log: '' }, { refused: 'compile', why: 'the pdflatex compile ran no TeX', guard: ran }],
      [new Error('the compiler threw'), { refused: 'compile', why: 'the compile threw' }],
    ]
    for (const [second, want] of cases) {
      const c = compiler([{ ok: true, log: PROBE_LOG }, second])
      const { open, close } = opener()
      const made = await layoutMarksOfPaper(paperOf(), { final: false, compile: c.compile, open, OPS })
      expect(made).toEqual({ ...want, ms: { probe: expect.any(Number), compile: expect.any(Number) } })
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
      const made = await layoutMarksOfPaper(paperOf(), { final: false, compile: c.compile, open, OPS })
      expect(made, why).toEqual({ refused: 'marks', ms: { probe: expect.any(Number), compile: expect.any(Number), marks: expect.any(Number) } })
      expect(close, why).toHaveBeenCalledTimes(1)
    }
    const c = compiler([{ ok: true, log: PROBE_LOG }, original()])
    const open = vi.fn(async (_pdf: Uint8Array): Promise<{ doc: unknown; close(): Promise<void> }> => { throw new Error('not a PDF') })
    expect(await layoutMarksOfPaper(paperOf(), { final: false, compile: c.compile, open, OPS })).toEqual({ refused: 'marks', ms: expect.any(Object) })
  })

  it('writes the lab\'s file of the marks in memory as they are, or none: never a file of other marks than the maker is given', async () => {
    // a page of 300,001 words, one past the file's WORDS_MAX (300,000): the marks in memory keep them (bounded a page, not by
    // the file), and the file of them is refused, not written as a file its parser refuses or reads as other marks
    const items = Array.from({ length: 300_001 }, (_, i) => ({ str: `w${i}`, transform: [1, 0, 0, 1, 72 + (i % 50) * 9, 700 - Math.floor(i / 50) * 0.1], width: 8, height: 1, hasEOL: true, fontName: 'f' }))
    const { doc } = fakeDoc({ getPage: async () => ({ view: [0, 0, 612, 792], rotate: 0, commonObjs: { get: () => null }, getTextContent: async () => ({ items, styles: {} }), getOperatorList: async () => ({ fnArray: [], argsArray: [] }) }) })
    const c = compiler([{ ok: true, log: PROBE_LOG }, original()])
    const made = await layoutMarksOfPaper(paperOf(), { final: false, compile: c.compile, open: opener(doc).open, OPS })
    if (!('marks' in made)) throw new Error(`refused: ${made.refused}`)
    expect(made.marks.words.length).toBe(300_001)
    expect(() => marksFile(made.marks)).toThrow(LayoutRefusal)
    // past MARKS_VALUES by owned pieces within OWNED_ALL (13 of 19,000 glyphs beside 200,000 tokens): not their own ink cut
    // from the last pieces (a layout of that file would leave pieces out that the maker matched), but no file
    const small = await layoutMarksOfPaper(paperOf(), { final: false, compile: compiler([{ ok: true, log: PROBE_LOG }, original()]).compile, open: opener().open, OPS })
    if (!('marks' in small)) throw new Error(`refused: ${small.refused}`)
    const glyphs = (k: number) => [`p0.${10 + k}a`, 0, 19_000, ...Array.from({ length: 19_000 }, () => [1, 72, 700, 10, 0]).flat()]
    const heavy = { ...small.marks, words: ['w'], chars: ['x'], tokens: Array.from({ length: 200_000 }, () => [1, 72, 700, 5, 5, 0]).flat(), owned: Array.from({ length: 13 }, (_, k) => glyphs(k)) } as typeof small.marks
    expect(() => marksFile(heavy)).toThrow(LayoutRefusal)
    // within every bound: the file, which parsed is the marks
    expect(parseLayoutMarks(enc(marksFile(small.marks)))).toEqual(small.marks)
  }, 60_000)

  it('does not lose the marks to a close that fails, and never throws', async () => {
    const c = compiler([{ ok: true, log: PROBE_LOG }, original()])
    const { open, close } = opener(fakeDoc().doc, async () => { throw new Error('the worker is gone') })
    const made = await layoutMarksOfPaper(paperOf(), { final: false, compile: c.compile, open, OPS })
    expect(made).toHaveProperty('marks')
    expect(close).toHaveBeenCalledTimes(1)
    // a failing close after a failing reading changes nothing either
    const failing = opener(fakeDoc({ numPages: 0 }).doc, async () => { throw new Error('the worker is gone') })
    const again = compiler([{ ok: true, log: PROBE_LOG }, original()])
    expect(await layoutMarksOfPaper(paperOf(), { final: false, compile: again.compile, open: failing.open, OPS })).toMatchObject({ refused: 'marks' })
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
const cmOf = async (answers: (Compiled | Error)[], paper = paperOf(), doc = fakeDoc().doc, filesBound?: { count: number; bytes: number }) => {
  const c = compiler(answers), o = opener(doc)
  const made = await layoutMarksOfPaper(paper, { final: false, compile: c.compile, open: o.open, OPS, converge: true, ...(filesBound ? { filesBound } : {}) })
  return { made, asked: c.asked, ...o, paper }
}

describe('markedOfPaper: the probe and the marked compile, the reading left to the host', () => {
  it('gives the marked PDF, its last pass\'s log and readMarked\'s options; read by the host it is layoutMarksOfPaper\'s marks', async () => {
    const paper = paperOf()
    // (a browser compiler's log of two passes: the last pass's is the one read)
    const log = stepped('AXT-LINES 0 1 12.0pt 10', 'AXT-LINES 0 3 12.0pt 10\nAXT-END')
    const made = await markedOfPaper(paper, { final: false, compile: compiler([{ ok: true, log: PROBE_LOG }, original(log)]).compile, OPS })
    if (!('pdf' in made)) throw new Error(`refused: ${made.refused}`)
    expect(made.pdf).toBe(PDF)
    expect(made.log).toContain('AXT-LINES 0 3 12.0pt 10')
    expect(made.log).not.toContain('AXT-LINES 0 1 12.0pt 10')
    const ink = inkSamples(paper.units)
    expect(made.options).toEqual({ engine: 'pdflatex', classes: LAYOUT_CLASSES, switches: readMarkProbe(PROBE_LOG, probeSamples(paper.units)), inkless: readInkProbe(PROBE_LOG, ink), texts: readInkTexts(PROBE_LOG, [...ink, ...leadSamples(paper.units, ink)]), decorated: readInkDecorated(PROBE_LOG, [...ink, ...leadSamples(paper.units, ink)]), names: readNameProbe(PROBE_LOG), lineskip: readSkipProbe(PROBE_LOG), complete: { bert: 0 }, apart: readInkApart(PROBE_LOG, ink) })
    expect(made.ms).toEqual({ probe: expect.any(Number), compile: expect.any(Number) })
    expect(made).not.toHaveProperty('cm')
    // read by the host as layerOfPaper reads `marked` (readMarked with the units and the operator codes): the same marks
    const read = await readMarked(fakeDoc().doc, made.log, { ...made.options, units: paper.units, OPS } as never)
    const whole = await layoutMarksOfPaper(paper, { final: false, compile: compiler([{ ok: true, log: PROBE_LOG }, original(log)]).compile, open: opener().open, OPS })
    if (!('marks' in whole)) throw new Error(`refused: ${whole.refused}`)
    expect(encodeLayoutMarks(read.marks)).toBe(encodeLayoutMarks(whole.marks))
    expect(read.unitMarks).toEqual(whole.unitMarks)
  })

  it('takes no marked original that did not run through: stopped short or short of AXT-END, today\'s compile and CM\'s fallback alike', async () => {
    // 2610.20713 on TL2025: a hundred errors, the PDF of the 7 pages of 15 set before them, no AXT-END
    const HUNDRED = '! Extra alignment tab has been changed to \\cr.\n(That makes 100 errors; please try again.) \nOutput written on main.xdv (7 pages, 540996 bytes).\n'
    const STOP = '! File ended while scanning use of \\next.\n! Emergency stop.\n*** (job aborted, no legal \\end found)\n\nOutput written on main.xdv (2 pages, 88144 bytes).\n'
    const short = [
      ['a hundred errors', `${TEX}${LINES}${HUNDRED}`, '! Extra alignment tab has been changed to \\cr.'],
      ['an emergency stop in the last pass, an earlier one complete', stepped(`${TEX}${LINES}${END}`, `${TEX}${LINES}${STOP}`), '! File ended while scanning use of \\next.'],
      ['a last pass halted short of AXT-END, an earlier one complete', stepped(`${TEX}${LINES}${END}`, `${TEX}${LINES}! Missing $ inserted.\n`), '! Missing $ inserted.'],
    ] as const
    // (the guard: nothing blamed, the name marks off, the same failure; the unmarked original runs through, so it is ours)
    const ms = { probe: expect.any(Number), compile: expect.any(Number), guard: expect.any(Number) }
    const unmarked: Compiled = { ok: true, pdf: PDF, log: `${TEX}${END}Output written on main.pdf (3 pages, 1000 bytes).\n` }
    for (const [why, log, first] of short) {
      const answer: Compiled = { ok: true, pdf: PDF, log }
      // (the unmarked original's verdict with it: it ran through, so no host hands the paper to another tree)
      const refused = { refused: 'marks', why: `the marked original does not run through (${first}), nor with the name marks off, where the paper's own source makes 3 pages`, own: { ran: true, short: false, limit: null, tree: '2025' }, ms, guard: { extra: 2, unmarked: [], names: true, failed: ['ran', 'errors'] } }
      const c = compiler([PROBE, answer, answer, unmarked])
      expect(await markedOfPaper(paperOf(), { final: false, compile: c.compile }), why).toEqual(refused)
      expect(c.asked.map(r => [r.rerun, given(r)['main.tex']?.includes('\\let\\axt@nmall\\relax'), given(r)['main.tex']?.includes('\\axtmark')]), why).toEqual([[false, false, true], [true, false, true], [true, true, true], [true, false, false]])
      const o = opener()
      expect(await layoutMarksOfPaper(paperOf(), { final: false, compile: compiler([PROBE, answer, answer, unmarked]).compile, open: o.open, OPS }), why).toEqual(refused)
      expect(o.open, why).not.toHaveBeenCalled()
      // (Q1: a pass 1 that did not run through falls back to today's compile, judged the same way: the guard's refusal, the
      // loop's record beside it)
      const cm = await markedOfPaper(paperOf(), { final: false, compile: compiler([PROBE, draftOf({ 'main.aux': AUX }, 'the log of a halted pass\n'), answer, answer, unmarked]).compile, converge: true })
      expect(cm, why).toEqual({ ...refused, cm: { drafts: 1, marked: 0, settled: false, fallback: 'draft-failed' } })
    }
    // one that went past its errors to the document's end is the marked original, as before
    const past = await markedOfPaper(paperOf(), { final: false, compile: compiler([PROBE, original(`! Undefined control sequence.\nl.12 \\foo\n${LINES}${END}`)]).compile })
    expect(past).toHaveProperty('pdf', PDF)
  })

  it('refuses as layoutMarksOfPaper does, its probe or its compile, with the times of the stages that ran (and the loop\'s record)', async () => {
    expect(await markedOfPaper(paperOf(), { final: false, compile: compiler([{ ok: true, log: '' }]).compile })).toEqual({ refused: 'probe', ms: { probe: expect.any(Number) } })
    expect(await markedOfPaper(paperOf(), { final: false, compile: compiler([new Error('no compiler')]).compile })).toEqual({ refused: 'probe', ms: { probe: expect.any(Number) } })
    const timeout: Compiled = { ok: false, error: 'Compilation timeout (the wall limit)' }
    expect(await markedOfPaper(paperOf(), { final: false, compile: compiler([{ ok: true, log: PROBE_LOG }, timeout]).compile })).toEqual({ refused: 'compile', why: 'the marked original was stopped by the host\'s time limit', limit: 'time', ms: { probe: expect.any(Number), compile: expect.any(Number) }, guard: { extra: 0, unmarked: [], names: true, failed: ['ran'] } })
    const cm = await markedOfPaper(paperOf(), { final: false, compile: compiler([{ ok: true, log: PROBE_LOG }, timeout]).compile, converge: true })
    expect(cm).toMatchObject({ refused: 'compile', cm: expect.any(Object) })
    for (const [answers, why] of [[[{ ok: true, log: '' }], 'probe'], [[{ ok: true, log: PROBE_LOG }, timeout], 'compile']] as const) {
      expect(await layoutMarksOfPaper(paperOf(), { final: false, compile: compiler([...answers]).compile, open: opener().open, OPS })).toMatchObject({ refused: why })
    }
  })
})

describe('layoutMarksOfPaper without converge', () => {
  it('asks exactly today\'s two compiles, and gives no CM record', async () => {
    for (const converge of [undefined, false]) {
      const paper = paperOf(), c = compiler([PROBE, original()])
      const made = await layoutMarksOfPaper(paper, { final: false, compile: c.compile, open: opener().open, OPS, ...(converge === undefined ? {} : { converge }) })
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

// (the pass loop's own behaviour — each pass's request, the settled pass as B and the log, the fallbacks, the bound — is held in
// packages/engine/tests/marked-loop.test.ts, on the package's markedOfPaper; here, what today's reader reads of it)
describe('layoutMarksOfPaper with converge (Q1, the pass loop)', () => {
  it('gives the marks file today\'s compile gives for the same PDF and log: no pass count enters it', async () => {
    const log = stepped('AXT-LINES 0 2 12.0pt 10\n', `AXT-LINES 0 3 12.0pt 10\nAXT-LINES 1 2 12.0pt 10\n${END}`)
    const today = compiler([PROBE, { ok: true, pdf: PDF, log }])
    const off = await layoutMarksOfPaper(paperOf(), { final: false, compile: today.compile, open: opener().open, OPS })
    const on = await cmOf([PROBE, draftOf({ 'main.aux': AUX }), markedOf({ 'main.aux': '\\relax \n' }, { log }), markedOf({ 'main.aux': '\\relax \n' }, { log })])
    if (!('marks' in off) || !('marks' in on.made)) throw new Error('refused')
    expect(on.made.cm).toEqual({ drafts: 1, marked: 2, settled: true })
    expect(encodeLayoutMarks(on.made.marks)).toBe(encodeLayoutMarks(off.marks))
    expect(on.made.unitMarks).toEqual(off.unitMarks)
  })
})
