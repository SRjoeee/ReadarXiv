import { describe, expect, it } from 'vitest'
import { markedOfPaper } from '../../packages/engine/src/compile/paper.ts'
import { type Compiled, type CompileRequest, openPaper, originalFiles, probeFiles } from '../../packages/engine/src/compile/live.ts'
import { inkSamples, LAYOUT_CLASSES, leadSamples, probeSamples, readInkApart, readInkDecorated, readInkProbe, readInkTexts, readMarkProbe, readNameProbe, readSkipProbe } from '../../packages/engine/src/marks/marks.ts'

// A paper's marked compile (compile/paper.ts markedOfPaper): the order of the two compiles and what each is asked, what the
// probe's answers set in the second, the log a host reads the marks from, the options it reads them with, and the refusals.
// Held here since lane c1-rewrites: the same compile was held through today's read stage (layout/paper.mjs layoutMarksOfPaper,
// layout/marks.mjs readMarked, its marks file: layout-paper-today.test.ts), which the cut-over deletes with today's engine; the
// marks' reading is the rebuilt prepare's (packages/engine locate). The loop's passes (`converge`) are
// packages/engine/tests/marked-loop.test.ts's, its requests and results without the loop byte for byte there too

const enc = (s: string) => new TextEncoder().encode(s)
const SOURCE = '\\documentclass{article}\n\\newcommand{\\bert}{BERT}\n\\begin{document}\nWe use \\bert{} as in \\cite{a} with $x$ and \\ref{s} here.\\footnote{A note.}\n\nAnother paragraph of words.\n\\end{document}\n'
const paperOf = (source = SOURCE) => openPaper(new Map([['main.tex', enc(source)]]))
const text = (files: ReadonlyMap<string, Uint8Array>) => Object.fromEntries([...files].map(([name, bytes]) => [name, new TextDecoder().decode(bytes)]))

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
 *  marked original carries: live.ts originalFiles) */
const original = (log = 'AXT-LINES 0 3 12.0pt 10\nAXT-END\n'): Compiled => ({ ok: true, pdf: PDF, log })
const END = 'AXT-END\n'
const LINES = 'AXT-LINES 0 3 12.0pt 10\n'
const filesOf = (o: Record<string, string>) => new Map(Object.entries(o).map(([p, t]) => [p, enc(t)]))
/** a draft's answer: TeX ran to the document's end, no PDF, the files it made */
const draftOf = (files: Record<string, string>, log = END): Compiled => ({ ok: true, pdf: null, log, aux: files['main.aux'] ?? null, files: filesOf(files) })
const AUX = '\\relax \n\\newlabel{s}{{1}{1}}\n'
const PROBE: Compiled = { ok: true, log: PROBE_LOG }
/** the files a request was given, each as text */
const given = (req: CompileRequest | undefined) => text(req?.overrides ?? new Map())

describe('markedOfPaper: the probe, then the marked original with its answers', () => {
  it('compiles the mark probe in one pass, then the marked original with the probe\'s answers: its switch and its inkless macros in the marked files, and in the options it gives', async () => {
    const paper = paperOf()
    const switches = readMarkProbe(PROBE_LOG, probeSamples(paper.units)), inkless = readInkProbe(PROBE_LOG, inkSamples(paper.units))
    // (the answers say something, or the second request would not show they were used)
    expect(switches).toEqual({ '\\cite': '22220000', '\\ref': '00000000', '\\footnote': '00220000' })
    expect(inkless).toEqual(['\\bert{}'])
    const c = compiler([{ ok: false, pdf: null, log: PROBE_LOG }, original()])
    const made = await markedOfPaper(paper, { final: false, compile: c.compile })
    if (!('pdf' in made)) throw new Error(`refused: ${made.refused}`)
    expect(c.asked).toHaveLength(2)
    // the probe: one pass, no BibTeX, the paper's main file and engine, the mark probe's files
    expect(c.asked[0]).toMatchObject({ main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: false })
    expect(given(c.asked[0])).toEqual(text(probeFiles(paper, { marks: true })))
    expect(given(c.asked[0])['main.tex']).toContain('LAYOUT-PROBE')
    // the original: every pass, BibTeX as the run asks it, lines and the layout marks of every class, the probe's switch and its inkless macros
    expect(c.asked[1]).toMatchObject({ main: 'main.tex', engine: 'pdflatex', rerun: true, bibtex: null })
    expect(given(c.asked[1])).toEqual(text(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless })))
    expect(given(c.asked[1])).not.toEqual(text(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES })))
    // (the marking it was made with, for the host that reads its marks: every class, the paper's switch, its inkless macros;
    // the paper's \\bert, defined to read nothing past its arguments and called, complete)
    expect(made.options).toMatchObject({ engine: 'pdflatex', classes: LAYOUT_CLASSES, switches, inkless, complete: { bert: 0 } })
    expect(made.ms).toEqual({ probe: expect.any(Number), compile: expect.any(Number) })
  })

  it('reads the probe\'s answers and the original\'s log from their last pass: the marked files made with the last pass\'s answers', async () => {
    const paper = paperOf()
    // (what the first pass logged and the last did not is not read: the footnote's answer, the lines of unit 2)
    const last = ['This is pdfTeX', CITE, REF, ...INK, ''].join('\n')
    const switches = readMarkProbe(last, probeSamples(paper.units))
    expect(switches).toEqual({ '\\cite': '22220000', '\\ref': '00000000' })
    const c = compiler([{ ok: true, log: stepped(PROBE_LOG, last) }, original(stepped('AXT-LINES 2 9 12.0pt 10\npdfTeX warning (dest): destination with the same identifier (name{axt-0s}) has been already used, duplicate ignored\n', 'AXT-LINES 0 3 12.0pt 10\nAXT-LINES 1 2 12.0pt 10\nAXT-END\n'))])
    const made = await markedOfPaper(paper, { final: false, compile: c.compile })
    if (!('pdf' in made)) throw new Error(`refused: ${made.refused}`)
    expect(given(c.asked[1])).toEqual(text(originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless: readInkProbe(last, inkSamples(paper.units)) })))
    expect(made.options.switches).toEqual(switches)
    expect(made.log).toContain('AXT-LINES 1 2 12.0pt 10')
    expect(made.log).not.toContain('AXT-LINES 2 9 12.0pt 10')
  })

  it('reads the probe\'s answers from its log whether or not the compile made a PDF (a probe has no pages)', async () => {
    const c = compiler([{ ok: false, error: 'no PDF', log: PROBE_LOG }, original()])
    expect(await markedOfPaper(paperOf(), { final: false, compile: c.compile })).toHaveProperty('pdf', PDF)
  })

  it('refuses at the probe where its compile gave no log, and asks for nothing more', async () => {
    for (const probe of [{ ok: false, error: 'the page is down' }, { ok: true, log: '' }, new Error('the compiler threw')]) {
      const c = compiler([probe, original()])
      expect(await markedOfPaper(paperOf(), { final: false, compile: c.compile })).toEqual({ refused: 'probe', ms: { probe: expect.any(Number) } })
      expect(c.asked).toHaveLength(1)
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
      expect(await markedOfPaper(paperOf(), { final: false, compile: c.compile })).toEqual({ ...want, ms: { probe: expect.any(Number), compile: expect.any(Number) } })
      expect(c.asked).toHaveLength(2)
    }
  })
})

describe('markedOfPaper: the probe and the marked compile, the reading left to the host', () => {
  it('gives the marked PDF, its last pass\'s log and the options its marks are read with: the classes, the paper\'s switch and every answer of the probe', async () => {
    const paper = paperOf()
    // (a browser compiler's log of two passes: the last pass's is the one read)
    const log = stepped('AXT-LINES 0 1 12.0pt 10', 'AXT-LINES 0 3 12.0pt 10\nAXT-END')
    const made = await markedOfPaper(paper, { final: false, compile: compiler([{ ok: true, log: PROBE_LOG }, original(log)]).compile })
    if (!('pdf' in made)) throw new Error(`refused: ${made.refused}`)
    expect(made.pdf).toBe(PDF)
    expect(made.log).toContain('AXT-LINES 0 3 12.0pt 10')
    expect(made.log).not.toContain('AXT-LINES 0 1 12.0pt 10')
    const ink = inkSamples(paper.units)
    expect(made.options).toEqual({ engine: 'pdflatex', classes: LAYOUT_CLASSES, switches: readMarkProbe(PROBE_LOG, probeSamples(paper.units)), inkless: readInkProbe(PROBE_LOG, ink), texts: readInkTexts(PROBE_LOG, [...ink, ...leadSamples(paper.units, ink)]), decorated: readInkDecorated(PROBE_LOG, [...ink, ...leadSamples(paper.units, ink)]), names: readNameProbe(PROBE_LOG), lineskip: readSkipProbe(PROBE_LOG), complete: { bert: 0 }, apart: readInkApart(PROBE_LOG, ink) })
    expect(made.ms).toEqual({ probe: expect.any(Number), compile: expect.any(Number) })
    expect(made).not.toHaveProperty('cm')
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
      // (Q1: a pass 1 that did not run through falls back to today's compile, judged the same way: the guard's refusal, the
      // loop's record beside it)
      const cm = await markedOfPaper(paperOf(), { final: false, compile: compiler([PROBE, draftOf({ 'main.aux': AUX }, 'the log of a halted pass\n'), answer, answer, unmarked]).compile, converge: true })
      expect(cm, why).toEqual({ ...refused, cm: { drafts: 1, marked: 0, settled: false, fallback: 'draft-failed' } })
    }
    // one that went past its errors to the document's end is the marked original, as before
    const past = await markedOfPaper(paperOf(), { final: false, compile: compiler([PROBE, original(`! Undefined control sequence.\nl.12 \\foo\n${LINES}${END}`)]).compile })
    expect(past).toHaveProperty('pdf', PDF)
  })

  it('refuses its probe or its compile, with the times of the stages that ran (and the loop\'s record)', async () => {
    expect(await markedOfPaper(paperOf(), { final: false, compile: compiler([{ ok: true, log: '' }]).compile })).toEqual({ refused: 'probe', ms: { probe: expect.any(Number) } })
    expect(await markedOfPaper(paperOf(), { final: false, compile: compiler([new Error('no compiler')]).compile })).toEqual({ refused: 'probe', ms: { probe: expect.any(Number) } })
    const timeout: Compiled = { ok: false, error: 'Compilation timeout (the wall limit)' }
    expect(await markedOfPaper(paperOf(), { final: false, compile: compiler([{ ok: true, log: PROBE_LOG }, timeout]).compile })).toEqual({ refused: 'compile', why: 'the marked original was stopped by the host\'s time limit', limit: 'time', ms: { probe: expect.any(Number), compile: expect.any(Number) }, guard: { extra: 0, unmarked: [], names: true, failed: ['ran'] } })
    const cm = await markedOfPaper(paperOf(), { final: false, compile: compiler([{ ok: true, log: PROBE_LOG }, timeout]).compile, converge: true })
    expect(cm).toMatchObject({ refused: 'compile', cm: expect.any(Object) })
  })
})
