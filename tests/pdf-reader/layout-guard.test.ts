import { describe, expect, it } from 'vitest'
import { auxUnits, braceBalance, errorCount, errorUnits, firstError, marksOutOfPlace, ownErrors, pagesOfLog, texLiveOf, unbalancedUnits, unmarkedFiles } from '@/pdf-reader/engine/layout/guard.mjs'
import { inkSamples, LAYOUT_CLASSES, probeSamples, readInkProbe, readMarkProbe } from '@/pdf-reader/engine/layout/marks.mjs'
import { markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import type { UnitLines } from '@/pdf-reader/engine/pipeline/tex-errors.mjs'

// The layout guard (layout/guard.mjs, layout/paper.mjs markedOfPaper; R1 of 2026-10-19): the marked original must be the paper.
// Each check on synthetic answers (a brace a unit's writing doubled, a mark of ours a compile wrote into a file where no
// text is set, an error count above the unmarked original's, a page count not arXiv's), each blame (the units at the errors'
// lines, at the line TeX ignored all text after, the units a mark out of place names; none, the name marks off), the order of
// the compiles the guard asks and their bound, and the refusal's why: TeX's ('compile', 'texlive', 'engine') or ours ('marks')

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array(0))
const SOURCE = '\\documentclass{article}\n\\newcommand{\\bert}{BERT}\n\\begin{document}\nWe use \\bert{} as in \\cite{a} with $x$ and \\ref{s} here.\\footnote{A note.}\n\nAnother paragraph of words.\n\\end{document}\n'
const paperOf = (source = SOURCE, more: [string, string][] = []) => openPaper(new Map([['main.tex', enc(source)], ...more.map(([p, t]): [string, Uint8Array] => [p, enc(t)])]))

const CITE = 'LAYOUT-PROBE 1 punct 0 22220000', REF = 'LAYOUT-PROBE 1 punct 1 00000000', FOOTNOTE = 'LAYOUT-PROBE 1 punct 2 00220000'
const PROBE_LOG = ['This is pdfTeX', CITE, REF, FOOTNOTE, 'LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt', ''].join('\n')
const PROBE: Compiled = { ok: true, log: PROBE_LOG }
const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n'
const END = 'AXT-END\n'
const out = (pages: number) => `Output written on main.pdf (${pages} pages, 9999 bytes).\n`
const PDF = enc('%PDF-1.7 the marked original'), PDF1 = enc('%PDF-1.7 the first again'), PDF2 = enc('%PDF-1.7 the second again'), UNMARKED = enc('%PDF-1.7 the paper alone')
/** a compile that ran through: its banner, `body` (errors), AXT-END and its pages */
const ran = (pdf: Uint8Array, body = '', pages = 3, more: Partial<Compiled> = {}): Compiled => ({ ok: true, pdf, log: `${TEX}${body}${END}${out(pages)}`, ...more })
/** a compile TeX ran that stopped short of the document's end */
const stopped = (body: string): Compiled => ({ ok: true, pdf: PDF, log: `${TEX}${body}! Emergency stop.\n*** (job aborted, no legal \\end found)\n` })

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
/** the marked original's files as markedOfPaper writes them (the probe's answers above), and its units' spans */
function markedFiles(paper = paperOf(), o: { unmarked?: number[]; names?: boolean } = {}) {
  const switches = readMarkProbe(PROBE_LOG, probeSamples(paper.units)), inkless = readInkProbe(PROBE_LOG, inkSamples(paper.units))
  const spans: { lines?: () => UnitLines<SourceUnit>[]; skip?: number } = {}
  const files = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, switches, inkless, ...(o.unmarked ? { unmarked: o.unmarked } : {}), ...(o.names === false ? { names: false } : {}), spans })
  return { files, spans, paper }
}
/** an error TeX logs at a unit's line in the marked file, its place before `at` in that line's text */
function errorAt(unit: number, at: string, message = 'Undefined control sequence.', paper = paperOf()) {
  const { files, spans } = markedFiles(paper)
  const x = spans.lines?.().find(s => s.unit === paper.units[unit])
  if (!x) throw new Error(`no span of unit ${unit}`)
  const line = dec(files.get('main.tex')).split('\n')[x.last - 1] as string
  const k = line.indexOf(at)
  if (k < 0) throw new Error(`"${at}" is not on line ${x.last}`)
  return { log: `! ${message}\n<recently read> \\foo \n\nl.${x.last} ${line.slice(0, k)}\n${' '.repeat(k + 5)}${line.slice(k)}\n`, line: x.last }
}
const has = (req: CompileRequest | undefined, s: string) => dec(req?.overrides.get('main.tex')).includes(s)
const NAMES_OFF = '\\let\\axt@nmall\\relax'

describe('braceBalance: a text\'s braces outside comments and verbatim', () => {
  it('counts groups, a control symbol as a symbol, nothing in a comment, \\verb or a verbatim environment', () => {
    expect(braceBalance('{a{b}c}')).toBe(0)
    expect(braceBalance('\\foreach \\i in {0,...,3} {{')).toBe(2)
    expect(braceBalance('\\{ \\} \\\\{')).toBe(1)
    expect(braceBalance('a % {{{\nb}')).toBe(-1)
    expect(braceBalance('\\verb|{| and \\verb*+}+ x')).toBe(0)
    expect(braceBalance('\\begin{verbatim}\n{{{\n\\end{verbatim}\n{')).toBe(1)
    expect(braceBalance('\\begin{itemize}\\item {x}\\end{itemize}')).toBe(0)
  })
})

describe('unbalancedUnits: before the compile, a unit whose writing changes its file\'s braces', () => {
  it('finds none in a paper the writer writes as it is, and the unit whose rendering doubles a brace (2610.21377\'s loop header)', () => {
    const clean = markedFiles()
    expect(unbalancedUnits(clean.paper, clean.files, clean.spans.lines?.() ?? [], clean.spans.skip)).toEqual({ units: new Set(), other: false })
    // (the writer's mistake: unit 2 written with a brace its source does not have)
    const paper = paperOf()
    ;(paper.units[2] as { pieces: unknown[] }).pieces.push({ t: 'ph', src: '{' })
    const bad = markedFiles(paper)
    expect(unbalancedUnits(paper, bad.files, bad.spans.lines?.() ?? [], bad.spans.skip)).toEqual({ units: new Set([2]), other: false })
    // left unmarked, the unit is the paper's own bytes: the file is balanced again, its other units marked as before
    const fixed = markedFiles(paper, { unmarked: [2] })
    expect(dec(fixed.files.get('main.tex'))).toContain('\nAnother paragraph of words.\n\\end{document}')
    expect(dec(fixed.files.get('main.tex'))).not.toContain('\\axtmark{2s}')
    expect(dec(fixed.files.get('main.tex'))).toContain('\\axtmark{1s}')
    expect(unbalancedUnits(paper, fixed.files, fixed.spans.lines?.() ?? [], fixed.spans.skip)).toEqual({ units: new Set(), other: false })
  })

  it('blames a nested unit by its own range, and a file whose balance moved past its units (our other edits) as `other`', () => {
    const paper = paperOf()
    ;(paper.units[0] as { pieces: unknown[] }).pieces.push({ t: 'ph', src: '}' })
    const nested = markedFiles(paper)
    expect(unbalancedUnits(paper, nested.files, nested.spans.lines?.() ?? [], nested.spans.skip)).toEqual({ units: new Set([0]), other: false })
    const clean = markedFiles()
    const edited = new Map(clean.files)
    edited.set('main.tex', enc(`${dec(clean.files.get('main.tex')).replace('\\begin{document}', '{\\begin{document}')}`))
    expect(unbalancedUnits(clean.paper, edited, clean.spans.lines?.() ?? [], clean.spans.skip).other).toBe(true)
  })

  it('in markedOfPaper: the unit left the paper\'s own before the compile, no compile more, the guard\'s record', async () => {
    const paper = paperOf()
    ;(paper.units[2] as { pieces: unknown[] }).pieces.push({ t: 'ph', src: '{' })
    const c = compiler([PROBE, ran(PDF)])
    const made = await markedOfPaper(paper, { compile: c.compile })
    expect(made).toMatchObject({ pdf: PDF, guard: { extra: 0, unmarked: [2], names: true, failed: ['braces'] } })
    expect(c.asked).toHaveLength(2)
    expect(has(c.asked[1], '\\axtmark{2s}')).toBe(false)
    expect(has(c.asked[1], '\\axtmark{1s}')).toBe(true)
  })
})

describe('marksOutOfPlace and auxUnits: a mark of ours a compile wrote where no text is set', () => {
  it('passes a list entry\'s text and a label\'s title, which LaTeX writes a caption into by design', () => {
    expect(marksOutOfPlace('\\@writefile{lof}{\\contentsline {figure}{\\numberline {1}{\\ignorespaces \\axtlines {14}\\leavevmode \\axtmark {14s}A caption.\\axtend {14e}}}{3}{figure.1}\\protected@file@percent }\n')).toEqual([])
    expect(marksOutOfPlace('\\newlabel{fig:x}{{1}{3}{\\axtlines {14}\\textbf {\\leavevmode \\axtmark {14s}Title}\\axtend {14e}}{figure.1}{}}\n')).toEqual([])
    expect(marksOutOfPlace('\\contentsline {section}{\\numberline {1}Intro\\footnote {\\axtlines {5}\\leavevmode \\axtmark {5s}A note.\\axtend {5e}}}{1}{section.1}%\n')).toEqual([])
    // (a babel name's marks are written through by design, anywhere)
    expect(marksOutOfPlace('\\@writefile{toc}{\\protect \\axtnma {contentsname}Contents\\protect \\axtnmb {contentsname}}\n% \\axtend {7e}\n')).toEqual([])
  })

  it('names a mark in a key, a number, or a command\'s argument that is no text: 2610.21201\'s etoc depth tag', () => {
    expect(marksOutOfPlace('\\@writefile{toc}{\\etoc@depthtag {main\\axtend {2e}}}\n')).toEqual(['2e'])
    expect(marksOutOfPlace('\\etoc@depthtag {appendix\\axtend {109e}}\n')).toEqual(['109e'])
    expect(marksOutOfPlace('\\newlabel{key\\axtend {5e}}{{1}{3}}\n\\newlabel{k}{{1\\axtpma {p6.2a}}{3}{T}{a}{}}\n')).toEqual(['5e', 'p6.2a'])
  })

  it('reads the files a compile returned, else its main aux, each mark by its unit; never the log, a frame\'s mark or a page\'s columns', () => {
    const files = new Map([
      ['main.toc', enc('\\etoc@depthtag {main\\axtend {2e}}\n')],
      ['main.aux', enc('\\@writefile{toc}{\\etoc@depthtag {x\\axtpma {p218.6a}}}\\@writefile{toc}{\\etoc@depthtag {\\axthmark {h69s}\\axtmark {t185s}\\axtcolour {c5.3}\\axtmark {c2-3}\\axtmark {g1a}}}\n')],
      ['main.log', enc('l.12 \\axtend {9e}\n')],
    ])
    expect(auxUnits({ ok: true, files }, 1000, 'main')).toEqual(new Set([2, 218, 69, 185, 5]))
    expect(auxUnits({ ok: true, aux: '\\@writefile{toc}{\\etoc@depthtag {main\\axtend {2e}}}\n' }, 1000, 'main')).toEqual(new Set([2]))
    // (ids past the paper's units are no unit of it)
    expect(auxUnits({ ok: true, files }, 100, 'main')).toEqual(new Set([2, 69, 5]))
  })
})

describe('errorUnits: the units the marked compile\'s errors stand in', () => {
  it('places an error by its line and context, less the paper\'s own, and the unit at the line TeX ignored all text after', () => {
    const { files, spans, paper } = markedFiles()
    const lines = spans.lines?.() ?? []
    const e = errorAt(2, 'paragraph')
    expect(errorUnits(paper, `${TEX}${e.log}${END}`, files, lines)).toEqual(new Set([2]))
    // (the unmarked original's error at the same text, our marks aside, is the paper's own)
    const own = ownErrors(`${TEX}! Undefined control sequence.\n<recently read> \\foo \n\nl.6 Another \n            paragraph of words.\n${END}`)
    expect(errorUnits(paper, `${TEX}${e.log}${END}`, files, lines, own)).toEqual(new Set())
    // (a letter lost is the paper's own letters)
    expect(errorUnits(paper, `${TEX}${errorAt(2, 'paragraph', 'Missing character: There is no ^^c3 (U+00C3) in font cmr10!').log}`, files, lines)).toEqual(new Set())
    expect(errorUnits(paper, `${TEX}! Incomplete \\iffalse; all text was ignored after line ${e.line}.\n<inserted text> \n                \\fi \n<*> ./main.tex\n`, files, lines)).toEqual(new Set([2]))
    expect(errorCount(`${TEX}${e.log}${e.log}${END}`)).toBe(2)
    expect(firstError(`${TEX}${e.log}`)).toMatch(/^! Undefined control sequence\. \(l\.\d+ /)
  })

  it('reads the pages TeX wrote, its TeX Live year, and the unmarked original as the paper with draft frames and END_TEX', () => {
    expect(pagesOfLog(`${TEX}${out(2)}`)).toBe(2)
    // (a line TeX wrapped at 79 characters, joined again)
    const wrapped = `${`Output written on ${'x'.repeat(100)}`.slice(0, 72)} (12 pa`
    expect(wrapped).toHaveLength(79)
    expect(pagesOfLog(`${TEX}${wrapped}\nges, 1 bytes).\n`)).toBe(12)
    expect(pagesOfLog('Output written on main.xdv (36 pages, 1 bytes).\n')).toBe(36)
    expect(texLiveOf(TEX)).toBe('2025')
    const paper = paperOf()
    const files = unmarkedFiles(paper)
    expect([...files.keys()]).toEqual(['main.tex'])
    const text = dec(files.get('main.tex'))
    expect(text.split('\n').slice(1).join('\n')).toBe(SOURCE)
    expect(text.split('\n')[0]).toMatch(/^\\PassOptionsToPackage\{draft\}\{graphicx\}.*AXT-END/)
    expect(text).not.toContain('\\axtmark')
  })
})

describe('markedOfPaper: the checks after the marked compile, each remedy, and the guard\'s bound', () => {
  it('a paper whose marked original passes costs no compile more and has no guard record (a caption\'s marks in its list are text)', async () => {
    const aux = '\\@writefile{lof}{\\contentsline {figure}{\\numberline {1}{\\ignorespaces \\axtmark {1s}A caption.\\axtend {1e}}}{3}{figure.1}}\n'
    const c = compiler([PROBE, ran(PDF, '', 3, { aux })])
    const made = await markedOfPaper(paperOf(), { compile: c.compile, pages: 3 })
    expect(made).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: { probe: expect.any(Number), compile: expect.any(Number) } })
    expect(c.asked).toHaveLength(2)
  })

  it('a mark out of place: the units it names unmarked, the names kept, one compile more', async () => {
    const aux = '\\@writefile{toc}{\\etoc@depthtag {main\\axtend {2e}}}\n'
    for (const answer of [ran(PDF, '', 3, { aux }), ran(PDF, '', 3, { files: new Map([['main.toc', enc('\\etoc@depthtag {main\\axtend {2e}}\n')]]) })]) {
      const c = compiler([PROBE, answer, ran(PDF1)])
      const made = await markedOfPaper(paperOf(), { compile: c.compile })
      expect(made).toMatchObject({ pdf: PDF1, ms: { guard: expect.any(Number) }, guard: { extra: 1, unmarked: [2], names: true, failed: ['aux'] } })
      expect(c.asked).toHaveLength(3)
      expect(has(c.asked[2], '\\axtmark{2s}')).toBe(false)
      expect(has(c.asked[2], NAMES_OFF)).toBe(false)
    }
    // (with an error in another unit: both unmarked, then the error's unit marked again, the smaller remedy, where it holds)
    const e = errorAt(1, 'here.')
    const both = compiler([PROBE, ran(PDF, e.log, 3, { aux }), ran(PDF1), ran(PDF2)])
    expect(await markedOfPaper(paperOf(), { compile: both.compile })).toMatchObject({ pdf: PDF2, guard: { extra: 2, unmarked: [2], names: true, failed: ['aux', 'errors'] } })
    expect([has(both.asked[2], '\\axtmark{1s}'), has(both.asked[2], '\\axtmark{2s}')]).toEqual([false, false])
    expect([has(both.asked[3], '\\axtmark{1s}'), has(both.asked[3], '\\axtmark{2s}')]).toEqual([true, false])
    // (mended by neither: the units unmarked, then the names off too; the best that ran stands, as before the guard)
    const c = compiler([PROBE, ran(PDF, '', 3, { aux }), ran(PDF1, '', 3, { aux }), ran(PDF2, '', 3, { aux })])
    expect(await markedOfPaper(paperOf(), { compile: c.compile })).toMatchObject({ pdf: PDF, guard: { extra: 2, failed: ['aux'] } })
    expect(has(c.asked[3], NAMES_OFF)).toBe(true)
  })

  it('errors above the unmarked original\'s: the original compiled, the units its other errors stand in unmarked', async () => {
    const e = errorAt(2, 'paragraph')
    const c = compiler([PROBE, ran(PDF, e.log), ran(UNMARKED), ran(PDF1)])
    const made = await markedOfPaper(paperOf(), { compile: c.compile })
    expect(made).toMatchObject({ pdf: PDF1, guard: { extra: 2, unmarked: [2], names: true, failed: ['errors'] } })
    expect(c.asked).toHaveLength(4)
    // (the unmarked original: the paper's own source, no mark; then the marked one with unit 2 the paper's own)
    expect(has(c.asked[2], '\\axtmark')).toBe(false)
    expect(has(c.asked[3], '\\axtmark{2s}')).toBe(false)
    expect(has(c.asked[3], '\\axtmark{1s}')).toBe(true)
  })

  it('errors no more than the unmarked original\'s are the paper\'s own: the marked original stands, one compile more', async () => {
    const e = errorAt(2, 'paragraph')
    const c = compiler([PROBE, ran(PDF, e.log), ran(UNMARKED, e.log)])
    expect(await markedOfPaper(paperOf(), { compile: c.compile })).toMatchObject({ pdf: PDF, guard: { extra: 1, unmarked: [], names: true, failed: ['errors'], judged: 'its errors are the paper\'s own' } })
    expect(c.asked).toHaveLength(3)
  })

  it('a compile that did not run through, its first error in a unit: the unit unmarked and the names off, then the unit marked again', async () => {
    const e = errorAt(2, 'paragraph')
    // (the smaller remedy holds: the names were the fault, the unit is marked again)
    const both = compiler([PROBE, stopped(e.log), ran(PDF1), ran(PDF2)])
    expect(await markedOfPaper(paperOf(), { compile: both.compile })).toMatchObject({ pdf: PDF2, guard: { extra: 2, unmarked: [], names: false, failed: ['ran', 'errors'] } })
    expect([has(both.asked[2], '\\axtmark{2s}'), has(both.asked[2], NAMES_OFF)]).toEqual([false, true])
    expect([has(both.asked[3], '\\axtmark{2s}'), has(both.asked[3], NAMES_OFF)]).toEqual([true, true])
    // (it does not: the first remedy is kept)
    const first = compiler([PROBE, stopped(e.log), ran(PDF1), stopped(e.log)])
    expect(await markedOfPaper(paperOf(), { compile: first.compile })).toMatchObject({ pdf: PDF1, guard: { extra: 2, unmarked: [2], names: false } })
  })

  it('"all text was ignored after line N" blames the unit at line N (2610.21288)', async () => {
    const { line } = errorAt(2, 'paragraph')
    const ignored = `! Incomplete \\iffalse; all text was ignored after line ${line}.\n<inserted text> \n                \\fi \n<*> ./main.tex\n`
    const c = compiler([PROBE, stopped(ignored), ran(PDF1), ran(PDF2)])
    expect(await markedOfPaper(paperOf(), { compile: c.compile })).toMatchObject({ pdf: PDF2, guard: { extra: 2, names: false } })
    expect(has(c.asked[2], '\\axtmark{2s}')).toBe(false)
  })

  it('nothing blamed: one compile with the name marks off, every unit marked', async () => {
    const c = compiler([PROBE, stopped('! Undefined control sequence.\nl.3 \\newcommand{\\bert}{\\foo}\n'), ran(PDF1)])
    expect(await markedOfPaper(paperOf(), { compile: c.compile })).toMatchObject({ pdf: PDF1, guard: { extra: 1, unmarked: [], names: false, failed: ['ran', 'errors'] } })
    expect(c.asked).toHaveLength(3)
    expect([has(c.asked[2], NAMES_OFF), has(c.asked[2], '\\axtmark{2s}')]).toEqual([true, true])
  })

  it('asks two compiles more at most, the unmarked original\'s among them: TeX\'s failure, or ours', async () => {
    const fail = stopped('! Undefined control sequence.\nl.3 \\newcommand{\\bert}{\\foo}\n')
    const ours = compiler([PROBE, fail, fail, ran(UNMARKED), ran(PDF2), ran(PDF2)])
    expect(await markedOfPaper(paperOf(), { compile: ours.compile })).toMatchObject({ refused: 'marks', why: expect.stringContaining('where the paper\'s own source makes 3 pages'), guard: { extra: 2 } })
    expect(ours.asked).toHaveLength(4)
    const texs = compiler([PROBE, fail, fail, fail, ran(PDF2)])
    expect(await markedOfPaper(paperOf(), { compile: texs.compile })).toEqual({ refused: 'compile', why: 'the paper\'s own source (article) does not run through on TeX Live 2025: ! Undefined control sequence. (l.3 \\newcommand{\\bert}{\\foo})', ms: expect.any(Object), guard: expect.objectContaining({ extra: 2 }) })
    expect(texs.asked).toHaveLength(4)
    // (a paper that declares another TeX Live year than the box's: TeX Live's)
    const readme = JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], texlive_version: '2023', process: { compiler: 'pdflatex' } })
    const tl = compiler([PROBE, fail, fail, fail])
    expect(await markedOfPaper(paperOf(SOURCE, [['00README.json', readme]]), { compile: tl.compile })).toMatchObject({ refused: 'texlive', why: 'the paper (article) declares TeX Live 2023; on TeX Live 2025 its own source does not run through: ! Undefined control sequence. (l.3 \\newcommand{\\bert}{\\foo})' })
  })

  it('starts no compile the host\'s budget cannot hold, and none where TeX never ran or a host\'s limit stopped it', async () => {
    const aux = '\\@writefile{toc}{\\etoc@depthtag {main\\axtend {2e}}}\n'
    const timed = (c: Compiled, ms: number): Compiled => ({ ...c, ms })
    // (probe 10, marked 100: 50 left is under 1.2 x 100)
    const thin = compiler([timed(PROBE, 10), timed(ran(PDF, '', 3, { aux }), 100), ran(PDF1)])
    expect(await markedOfPaper(paperOf(), { compile: thin.compile, compileBudgetMs: 160 })).toMatchObject({ pdf: PDF, guard: { extra: 0, judged: 'no compile left' } })
    expect(thin.asked).toHaveLength(2)
    const short = compiler([timed(PROBE, 10), timed(stopped('! Undefined control sequence.\nl.3 x\n'), 100)])
    expect(await markedOfPaper(paperOf(), { compile: short.compile, compileBudgetMs: 160 })).toMatchObject({ refused: 'compile', why: expect.stringContaining('the paper\'s own source was not compiled') })
    expect(short.asked).toHaveLength(2)
    // (room for one: the remedy, and no more)
    const one = compiler([timed(PROBE, 10), timed(ran(PDF, '', 3, { aux }), 100), timed(ran(PDF1, '', 3, { aux }), 100), ran(PDF2)])
    expect(await markedOfPaper(paperOf(), { compile: one.compile, compileBudgetMs: 240 })).toMatchObject({ pdf: PDF, guard: { extra: 1 } })
    expect(one.asked).toHaveLength(3)
    for (const [answer, refused] of [[{ ok: false, error: 'axt-runner: unknown engine: "latex"', log: 'axt-runner: unknown engine: "latex"\n' }, 'engine'], [{ ok: false, error: 'Compilation timeout (the wall limit)', log: TEX }, 'compile']] as const) {
      const c = compiler([PROBE, answer, ran(PDF1)])
      expect(await markedOfPaper(paperOf(), { compile: c.compile })).toMatchObject({ refused })
      expect(c.asked).toHaveLength(2)
    }
    // (a host that names the compilers it runs: a paper of another is refused before any compile)
    const none = compiler([PROBE, ran(PDF)])
    expect(await markedOfPaper(paperOf(), { compile: none.compile, engines: ['xelatex'] })).toEqual({ refused: 'engine', why: 'the paper is compiled by pdflatex, which the host does not run', ms: {} })
    expect(none.asked).toHaveLength(0)
  })

  it('a page count not arXiv\'s is a check that fails; with several toplevel sources the first file\'s pages are arXiv\'s first', async () => {
    const c = compiler([PROBE, ran(PDF, '', 3), ran(PDF1, '', 4)])
    expect(await markedOfPaper(paperOf(), { compile: c.compile, pages: async () => 4 })).toMatchObject({ pdf: PDF1, guard: { extra: 1, names: false, failed: ['pages'] } })
    expect(c.asked).toHaveLength(3)
    // (more pages than arXiv's, mended by nothing: the marked original stands for the carry to judge, as before)
    const more = compiler([PROBE, ran(PDF, '', 5), ran(PDF1, '', 5), ran(UNMARKED, '', 5)])
    expect(await markedOfPaper(paperOf(), { compile: more.compile, pages: 4 })).toMatchObject({ pdf: PDF, guard: { failed: ['pages'] } })
    const readme = JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }, { usage: 'toplevel', filename: 'supplement.tex' }], process: { compiler: 'pdflatex' } })
    const paper = paperOf(SOURCE, [['00README.json', readme], ['supplement.tex', '\\documentclass{article}\\begin{document}S\\end{document}\n']])
    expect(paper.meta.toplevels).toBe(2)
    const two = compiler([PROBE, ran(PDF, '', 3)])
    expect(await markedOfPaper(paper, { compile: two.compile, pages: 4 })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: expect.any(Object) })
    expect(two.asked).toHaveLength(2)
  })
})
