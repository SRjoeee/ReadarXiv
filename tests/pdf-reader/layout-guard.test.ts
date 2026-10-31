import * as PL from '@cantoo/pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { auxUnits, braceBalance, compilerOfPdf, errorCount, errorUnits, firstError, marksOutOfPlace, ownErrors, pagesOfLog, preambleUnits, tellsTwice, texLiveOf, texLiveOfPdf, unbalancedUnits, unmarkedFiles } from '@/pdf-reader/engine/layout/guard.mjs'
import { WHY_MAX } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { ALLOCATION_FAILED } from '@/pdf-reader/engine/pipeline/memory.mjs'
import { inkSamples, LAYOUT_CLASSES, probeSamples, readInkProbe, readMarkProbe } from '@/pdf-reader/engine/layout/marks.mjs'
import { handoverOf, layoutMarksOfPaper, markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, markedPreamble, openPaper, originalFiles, probeFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
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
/** the same compile with its PDF written by its driver (XeTeX's .xdv made a PDF by xdvipdfmx): its log tells no destination of
 *  ours set twice, so a mark of ours in a file it wrote is out of place whatever else it shows (guard.mjs copiesOutOfPlace) */
const viaDriver = (c: Compiled): Compiled => ({ ...c, log: (c.log ?? '').replace(/Output written on main\.pdf/, 'Output written on main.xdv') })
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

  it('finds each unit where it is written after a babel name the preamble writes literally is wrapped (nips\'s abstract)', () => {
    // (the wrap, \axtnma{abstract}…\axtnmb{abstract}, lies before every unit: spans taken after it were its 34 bytes early)
    const source = '\\documentclass{article}\n\\renewenvironment{abstract}{\\vskip.075in\\centerline{\\large\\bf Abstract}\\vspace{0.5ex}\\begin{quote}}{\\par\\end{quote}\\vskip 1ex}\n\\begin{document}\nA first paragraph of some words here.\n\nAnother paragraph of words.\n\\end{document}\n'
    const { files, spans, paper } = markedFiles(paperOf(source))
    const text = dec(files.get('main.tex'))
    expect(text).toContain('\\axtnma{abstract}Abstract\\axtnmb{abstract}')
    const lines = spans.lines?.() ?? []
    expect(lines).toHaveLength(paper.units.length)
    for (const x of lines) {
      const i = paper.units.indexOf(x.unit as never)
      const at = text.slice(x.from, x.to)
      expect(at, `unit ${i}`).toContain(`\\axtmark{${i}s}`)
      expect(text.split('\n').slice(x.first - 1, x.last).join('\n'), `unit ${i}`).toContain(at.trim())
    }
    expect(unbalancedUnits(paper, files, lines, spans.skip)).toEqual({ units: new Set(), other: false })
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

describe('tellsTwice: a log that names every destination of ours set twice', () => {
  it('is TeX\'s own PDF\'s (pdfTeX, LuaTeX), never one its driver writes (XeTeX\'s .xdv, a DVI)', () => {
    expect(tellsTwice(`${TEX}${out(3)}`)).toBe(true)
    expect(tellsTwice(`${TEX}Output written on\nmain.pdf (3 pages, 9 bytes).\n`)).toBe(false)
    expect(tellsTwice(`${TEX}Output written on main.xdv (3 pages, 9 bytes).\n`)).toBe(false)
    expect(tellsTwice(`${TEX}Output written on main.dvi (3 pages, 9 bytes).\n`)).toBe(false)
    expect(tellsTwice(`${TEX}! Emergency stop.\n`)).toBe(false)
    expect(tellsTwice(null)).toBe(false)
  })
})

describe('the preamble as the marked original writes it, read by the mark probe: the units TeX\'s errors there stand at', () => {
  const FRONT = '\\documentclass{article}\n\\title{A Title}\n\\author{Ann Lee}\n\\begin{document}\n\\maketitle\nWe use words here.\n\\end{document}\n'
  const front = () => paperOf(FRONT)

  it('marks the units the main file\'s preamble holds; none there, no marked preamble (the probe byte for byte as before)', () => {
    expect(markedPreamble(paperOf())).toBeNull()
    const p = front(), mp = markedPreamble(p)
    if (!mp) throw new Error('no marked preamble')
    expect(p.units.slice(0, 2).map(u => u.kind)).toEqual(['heading', 'author'])
    expect(mp.text).toContain('\\title{\\axthmark{h0s}A Title\\axthmark{h0e}}')
    expect(mp.text).toContain('\\author{\\leavevmode\\axtmark{1s}Ann Lee\\axtend{1e}}')
    expect(mp.text).not.toContain('\\begin{document}')
    // (the probe over it: the paper's own preamble in its place, the line probes inert, and its lines where `first` says)
    const probe = new TextDecoder().decode(probeFiles(p, { marks: true, preamble: mp.text }).get('main.tex'))
    expect(probe).toContain(`${mp.text}`)
    expect(probe).toContain('\\protected\\def\\axtlines#1{}')
    expect(probe.split('\n')[mp.first - 1]).toBe('\\documentclass{article}')
    expect(probe.split('\n')[mp.last - 1]).toBe('\\author{\\leavevmode\\axtmark{1s}Ann Lee\\axtend{1e}}')
    expect(new TextDecoder().decode(probeFiles(p, { marks: true }).get('main.tex'))).not.toContain('\\axtmark{1s}')
    // (under `latex`, the probe's head holds the DVI marks too: `first` counts them)
    const readme = JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], process: { compiler: 'latex' } })
    const dvi = paperOf(FRONT, [['00README.json', readme]]), dmp = markedPreamble(dvi)
    if (!dmp) throw new Error('no marked preamble')
    expect(new TextDecoder().decode(probeFiles(dvi, { marks: true, preamble: dmp.text }).get('main.tex')).split('\n')[dmp.first - 1]).toBe('\\documentclass{article}')
  })

  it('preambleUnits: an error on a line of the preamble whose text holds a mark of ours names its unit; no other', () => {
    const range = { first: 10, last: 20 }
    const csname = (line: number, at: string) => `! Missing \\endcsname inserted.\n<to be read again> \n                   \\unhbox \nl.${line} ${at}\n\n`
    expect(preambleUnits(csname(12, '...ode\\axtmark{1s}Ann Lee\\axtend{1e}}'), 5, range)).toEqual(new Set([1]))
    expect(preambleUnits(csname(12, '\\author{\\axtlines{3}\\leavevmode'), 5, range)).toEqual(new Set([3]))
    // (past the preamble, a line of another file, no mark in its text, a unit past the paper's)
    expect(preambleUnits(csname(25, '\\axtmark{1s}Ann Lee'), 5, range)).toEqual(new Set())
    expect(preambleUnits(csname(12, '\\author{Ann Lee}'), 5, range)).toEqual(new Set())
    expect(preambleUnits(csname(12, '\\axtmark{9s}Ann Lee'), 5, range)).toEqual(new Set())
  })

  it('in markedOfPaper: units TeX raised errors at in the probe\'s preamble unmarked before the marked compile, no compile more (2610.37668v1)', async () => {
    const p = front(), mp = markedPreamble(p)
    if (!mp) throw new Error('no marked preamble')
    const line = mp.first + mp.text.split('\n').findIndex(l => l.includes('\\axtmark{1s}'))
    const err = `! Missing \\endcsname inserted.\n<to be read again> \n                   \\unhbox \nl.${line} ...ode\\axtmark{1s}Ann Lee\\axtend{1e}}\n\n`
    const blamed = compiler([{ ok: false, log: `${PROBE_LOG.replace('This is pdfTeX', `${TEX}${err}`)}AXT-END\n` }, PROBE, ran(PDF, '', 3)])
    const made = await markedOfPaper(p, { final: false, compile: blamed.compile, pages: 3 })
    expect(made).toMatchObject({ pdf: PDF, guard: { extra: 0, unmarked: [1], names: true, failed: ['preamble'] } })
    expect(blamed.asked).toHaveLength(3)
    // (the first probe over the marked preamble, the second over the paper's own, whose answers are taken)
    expect(has(blamed.asked[0], '\\axtmark{1s}')).toBe(true)
    expect(dec(blamed.asked[1]?.overrides.get('main.tex'))).toBe(dec(probeFiles(p, { marks: true }).get('main.tex')))
    expect([has(blamed.asked[2], '\\axtmark{1s}'), has(blamed.asked[2], '\\axthmark{h0s}')]).toEqual([false, true])
    // (a probe over the marked preamble that ran through with no error of ours there: its answers, one probe, every unit marked)
    const clean = compiler([{ ok: false, log: `${PROBE_LOG}AXT-END\n` }, ran(PDF, '', 3)])
    expect(await markedOfPaper(p, { final: false, compile: clean.compile, pages: 3 })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: expect.any(Object) })
    expect(clean.asked).toHaveLength(2)
    expect(has(clean.asked[1], '\\axtmark{1s}')).toBe(true)
    // (one that stopped before its body wrote a row: asked again over the paper's own preamble, nothing blamed, the guard as before)
    const short = compiler([{ ok: false, log: `${TEX}! Emergency stop.\n` }, PROBE, ran(PDF, '', 3)])
    expect(await markedOfPaper(p, { final: false, compile: short.compile, pages: 3 })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: expect.any(Object) })
    expect(short.asked).toHaveLength(3)
    expect(has(short.asked[2], '\\axtmark{1s}')).toBe(true)
    // (one that stopped in its body, in a sample of its own (2610.21884v1's \ar@{-} in the ink section): the paper's own preamble's
    // probe stops there too, and its rows are taken as they are; one probe)
    const body = compiler([{ ok: false, log: `${PROBE_LOG}! TeX capacity exceeded, sorry [input stack size=10000].\n` }, ran(PDF, '', 3)])
    expect(await markedOfPaper(p, { final: false, compile: body.compile, pages: 3 })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: expect.any(Object) })
    expect(body.asked).toHaveLength(2)
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
    const made = await markedOfPaper(paperOf(), { final: false, compile: c.compile, pages: 3 })
    expect(made).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: { probe: expect.any(Number), compile: expect.any(Number) } })
    expect(c.asked).toHaveLength(2)
  })

  it('a mark out of place: the units it names unmarked, the names kept, one compile more', async () => {
    const aux = '\\@writefile{toc}{\\etoc@depthtag {main\\axtend {2e}}}\n'
    for (const answer of [viaDriver(ran(PDF, '', 3, { aux })), viaDriver(ran(PDF, '', 3, { files: new Map([['main.toc', enc('\\etoc@depthtag {main\\axtend {2e}}\n')]]) }))]) {
      const c = compiler([PROBE, answer, ran(PDF1)])
      const made = await markedOfPaper(paperOf(), { compile: c.compile })
      expect(made).toMatchObject({ pdf: PDF1, ms: { guard: expect.any(Number) }, guard: { extra: 1, unmarked: [2], names: true, failed: ['aux'] } })
      expect(c.asked).toHaveLength(3)
      expect(has(c.asked[2], '\\axtmark{2s}')).toBe(false)
      expect(has(c.asked[2], NAMES_OFF)).toBe(false)
    }
    // (with an error in another unit: both unmarked, then the error's unit marked again, the smaller remedy, where it holds)
    const e = errorAt(1, 'here.')
    const both = compiler([PROBE, viaDriver(ran(PDF, e.log, 3, { aux })), ran(PDF1), ran(PDF2)])
    expect(await markedOfPaper(paperOf(), { compile: both.compile })).toMatchObject({ pdf: PDF2, guard: { extra: 2, unmarked: [2], names: true, failed: ['aux', 'errors'] } })
    expect([has(both.asked[2], '\\axtmark{1s}'), has(both.asked[2], '\\axtmark{2s}')]).toEqual([false, false])
    expect([has(both.asked[3], '\\axtmark{1s}'), has(both.asked[3], '\\axtmark{2s}')]).toEqual([true, false])
    // (mended by neither: the units unmarked, then the names off too; the best that ran stands, as before the guard)
    const c = compiler([PROBE, viaDriver(ran(PDF, '', 3, { aux })), viaDriver(ran(PDF1, '', 3, { aux })), viaDriver(ran(PDF2, '', 3, { aux }))])
    expect(await markedOfPaper(paperOf(), { compile: c.compile })).toMatchObject({ pdf: PDF, guard: { extra: 2, failed: ['aux'] } })
    expect(has(c.asked[3], NAMES_OFF)).toBe(true)
  })

  it('a mark a file holds that TeX set once where the paper sets its text, or never: no compile more, the unit marked (2609.36054v2, 2610.21201v1)', async () => {
    // (an endnote package writes each note's text into the aux and prints it from there: its marks are set once, at the notes;
    // a class that writes an author's name into the aux and discards it sets it never: both the paper's, and TeX's own log, which
    // names every destination it set twice, names none)
    for (const aux of [
      '\\enotez@note {1}{1}{0}{0}{0}{a}{\\axtlines {2}\\leavevmode \\axtmark {2s}Another paragraph of words.\\axtend {2e}}\n',
      '\\jmlr@author{\\leavevmode \\axtmark {1s}We use\\axtend {1e}}{\\leavevmode \\axtmark {1s}We use\\axtend {1e}}\n',
    ]) {
      for (const answer of [ran(PDF, '', 3, { aux }), ran(PDF, '', 3, { files: new Map([['main.aux', enc(aux)]]) })]) {
        const c = compiler([PROBE, answer])
        expect(await markedOfPaper(paperOf(), { final: false, compile: c.compile, pages: 3 })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: expect.any(Object) })
        expect(c.asked).toHaveLength(2)
      }
    }
  })

  it('a mark a file holds that TeX set twice stands: its log names it, the reading drops it, the unit the original\'s (2610.21084v1)', async () => {
    // (a class that sets an author's name again in the e-mail footnote: pdfTeX keeps the first destination and names the other)
    const aux = '\\emailauthor{a@b.c}{\\leavevmode \\axtmark {2s}Another paragraph of words.\\axtend {2e}}\n'
    const twice = 'pdfTeX warning (ext4): destination with the same identifier (name{axt-2e}) has been already used, duplicate ignored\n'
    const c = compiler([PROBE, ran(PDF, twice, 3, { aux })])
    const made = await markedOfPaper(paperOf(), { final: false, compile: c.compile, pages: 3 })
    expect(made).toEqual({ pdf: PDF, log: expect.stringContaining('name{axt-2e}'), options: expect.any(Object), ms: expect.any(Object) })
    expect(c.asked).toHaveLength(2)
  })

  it('a mark a file holds stays out of place where the compile shows anything else, or its log cannot tell a destination set twice', async () => {
    const aux = '\\enotez@note {1}{1}{0}{0}{0}{a}{\\axtlines {2}\\leavevmode \\axtmark {2s}Another paragraph of words.\\axtend {2e}}\n'
    // (its PDF written by its driver: XeTeX's xdvipdfmx, the DVI driver latexmk runs, tell no log the host returns)
    const xe = compiler([PROBE, viaDriver(ran(PDF, '', 3, { aux })), ran(PDF1)])
    expect(await markedOfPaper(paperOf(), { final: false, compile: xe.compile, pages: 3 })).toMatchObject({ pdf: PDF1, guard: { extra: 1, unmarked: [2], names: true, failed: ['aux'] } })
    expect(has(xe.asked[2], '\\axtmark{2s}')).toBe(false)
    // (a TeX error, wherever it stands: 2610.21201's etoc depth tag inside a \csname of its contents)
    const csname = '! Missing \\endcsname inserted.\n<to be read again> \n                   \\axtend \nl.1 \\etoc@depthtag {main\\axtend {2e}}\n\n'
    const err = compiler([PROBE, ran(PDF, csname, 3, { aux: '\\@writefile{toc}{\\etoc@depthtag {main\\axtend {2e}}}\n' }), ran(PDF1)])
    expect(await markedOfPaper(paperOf(), { final: false, compile: err.compile, pages: 3 })).toMatchObject({ pdf: PDF1, guard: { extra: 1, unmarked: [2], failed: ['aux', 'errors'] } })
    // (other pages than arXiv's)
    const long = compiler([PROBE, ran(PDF, '', 4, { aux }), ran(PDF1, '', 3)])
    expect(await markedOfPaper(paperOf(), { final: false, compile: long.compile, pages: 3 })).toMatchObject({ pdf: PDF1, guard: { extra: 1, unmarked: [2], failed: ['pages', 'aux'] } })
    // (a mark of ours printed on a page)
    const shown = compiler([PROBE, ran(PDF, '', 3, { aux }), ran(PDF1)])
    const textOf = async (pdf: Uint8Array) => [pdf === PDF ? 'Notes 1 \\axtmark {2s}Another paragraph' : 'Notes 1 Another paragraph']
    expect(await markedOfPaper(paperOf(), { final: false, compile: shown.compile, pages: 3, textOf })).toMatchObject({ pdf: PDF1, guard: { extra: 1, failed: ['aux', 'text'] } })
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
    // (with errors of the paper's own left in both: the smaller remedy kept where it has no more than the first's)
    const own = '! Undefined control sequence.\nl.3 \\newcommand{\\bert}{\\foo}\n'
    const kept = compiler([PROBE, stopped(`${own}${e.log}`), ran(PDF1, own), ran(PDF2, own)])
    expect(await markedOfPaper(paperOf(), { compile: kept.compile })).toMatchObject({ pdf: PDF2, guard: { extra: 2, unmarked: [], names: false, judged: 'no compile left' } })
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
    expect(await markedOfPaper(paperOf(), { compile: texs.compile })).toEqual({ refused: 'compile', why: 'the paper\'s own source (article) does not run through on TeX Live 2025: ! Undefined control sequence. (l.3 \\newcommand{\\bert}{\\foo})', own: { ran: false, short: false, limit: null, tree: '2025' }, ms: expect.any(Object), guard: expect.objectContaining({ extra: 2 }) })
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
    const thin = compiler([timed(PROBE, 10), timed(viaDriver(ran(PDF, '', 3, { aux })), 100), ran(PDF1)])
    expect(await markedOfPaper(paperOf(), { compile: thin.compile, compileBudgetMs: 160 })).toMatchObject({ pdf: PDF, guard: { extra: 0, judged: 'no compile left' } })
    expect(thin.asked).toHaveLength(2)
    const short = compiler([timed(PROBE, 10), timed(stopped('! Undefined control sequence.\nl.3 x\n'), 100)])
    expect(await markedOfPaper(paperOf(), { compile: short.compile, compileBudgetMs: 160 })).toMatchObject({ refused: 'compile', why: expect.stringContaining('the paper\'s own source was not compiled') })
    expect(short.asked).toHaveLength(2)
    // (room for one: the remedy, and no more)
    const one = compiler([timed(PROBE, 10), timed(viaDriver(ran(PDF, '', 3, { aux })), 100), timed(viaDriver(ran(PDF1, '', 3, { aux })), 100), ran(PDF2)])
    expect(await markedOfPaper(paperOf(), { compile: one.compile, compileBudgetMs: 240 })).toMatchObject({ pdf: PDF, guard: { extra: 1 } })
    expect(one.asked).toHaveLength(3)
    // (TeX never ran: `engine` only where the host names the engine unknown; any other answer with no TeX in it, the web's over-cap
    // one among them, the compile's)
    const overCap = 'axt-runner: the compile\'s result is 70000000 bytes, over the 67108864 cap'
    for (const [answer, refused, why] of [
      [{ ok: false, error: 'axt-runner: unknown engine: "latex"', log: 'axt-runner: unknown engine: "latex"\n' }, 'engine', 'the pdflatex compile ran no TeX: axt-runner: unknown engine: "latex"'],
      [{ ok: false, error: 'Compilation timeout (the wall limit)', log: TEX }, 'compile', 'the marked original was stopped by the host\'s time limit'],
      [{ ok: false, log: `${overCap}\n` }, 'compile', `the pdflatex compile ran no TeX: ${overCap}`],
    ] as const) {
      const c = compiler([PROBE, answer, ran(PDF1)])
      expect(await markedOfPaper(paperOf(), { compile: c.compile })).toMatchObject({ refused, why })
      expect(c.asked).toHaveLength(2)
    }
    // (and the unmarked original's: TeX never ran in it, the host naming no engine unknown)
    const fail = stopped('! Undefined control sequence.\nl.3 \\newcommand{\\bert}{\\foo}\n')
    const capped = compiler([PROBE, fail, fail, { ok: false, log: `${overCap}\n` }])
    expect(await markedOfPaper(paperOf(), { compile: capped.compile })).toMatchObject({ refused: 'compile', why: `the pdflatex compile of the paper's own source ran no TeX: ${overCap}` })
    // (a host that names the compilers it runs: a paper of another is refused before any compile)
    const none = compiler([PROBE, ran(PDF)])
    expect(await markedOfPaper(paperOf(), { compile: none.compile, engines: ['xelatex'] })).toEqual({ refused: 'engine', why: 'the paper is compiled by pdflatex, which the host does not run', ms: {} })
    expect(none.asked).toHaveLength(0)
  })

  it('writes a refusal\'s why without the log\'s control characters, within WHY_MAX', async () => {
    const raw = `axt-runner: \u0007bell\u0000 and\u001b[31m colour ${'x'.repeat(400)}`
    const c = compiler([PROBE, { ok: false, log: `${raw}\n` }])
    const made = await markedOfPaper(paperOf(), { compile: c.compile })
    if (!('refused' in made)) throw new Error('not refused')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters a why is kept without
    expect(made.why).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
    expect(made.why?.length).toBeLessThanOrEqual(WHY_MAX)
    expect(made.why).toMatch(/^the pdflatex compile ran no TeX: axt-runner: bell and \[31m colour x+/)
  })

  it('a page count not arXiv\'s is a check that fails; with several toplevel sources the first file\'s pages are arXiv\'s first', async () => {
    const c = compiler([PROBE, ran(PDF, '', 3), ran(PDF1, '', 4)])
    expect(await markedOfPaper(paperOf(), { compile: c.compile, pages: async () => 4 })).toMatchObject({ pdf: PDF1, guard: { extra: 1, names: false, failed: ['pages'] } })
    expect(c.asked).toHaveLength(3)
    // (more pages than arXiv's, mended by nothing: without the base page the marked original stands for the carry to judge,
    // as before; with it, none of other pages than arXiv's stands, and the unmarked original tells whose fault it is:
    // here its own 5 pages, TeX's, with no final pass asked; layout-route-fallbacks.test.ts has the other cases)
    const more = compiler([PROBE, ran(PDF, '', 5), ran(PDF1, '', 5), ran(UNMARKED, '', 5)])
    expect(await markedOfPaper(paperOf(), { final: false, compile: more.compile, pages: 4 })).toMatchObject({ pdf: PDF, guard: { failed: ['pages'] } })
    const based = compiler([PROBE, ran(PDF, '', 5), ran(PDF1, '', 5), ran(UNMARKED, '', 5)])
    expect(await markedOfPaper(paperOf(), { compile: based.compile, pages: 4 })).toMatchObject({ refused: 'compile', why: 'the paper\'s own source (article) has 5 pages, arXiv\'s PDF 4 on TeX Live 2025', own: { ran: true, short: false } })
    expect(based.asked).toHaveLength(4)
    const readme = JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }, { usage: 'toplevel', filename: 'supplement.tex' }], process: { compiler: 'pdflatex' } })
    const paper = paperOf(SOURCE, [['00README.json', readme], ['supplement.tex', '\\documentclass{article}\\begin{document}S\\end{document}\n']])
    expect(paper.meta.toplevels).toBe(2)
    const two = compiler([PROBE, ran(PDF, '', 3)])
    expect(await markedOfPaper(paper, { final: false, compile: two.compile, pages: 4 })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: expect.any(Object) })
    expect(two.asked).toHaveLength(2)
    // (no 00README, two uncited \documentclass files, 1008.0072v1's case: the toplevel sources guessed, the same rule)
    const guessed = paperOf(SOURCE, [['supplement.tex', '\\documentclass{article}\\begin{document}S\\end{document}\n']])
    expect(guessed.meta).toMatchObject({ main: 'main.tex', mainGuessed: true, toplevels: 2 })
    const both = compiler([PROBE, ran(PDF, '', 3)])
    expect(await markedOfPaper(guessed, { final: false, compile: both.compile, pages: 4 })).toEqual({ pdf: PDF, log: expect.any(String), options: expect.any(Object), ms: expect.any(Object) })
    expect(both.asked).toHaveLength(2)
  })
})

describe('the refusal names the unmarked original\'s verdict and the trees tried; handoverOf, the host\'s rule over it', () => {
  const fail = stopped('! Undefined control sequence.\nl.3 \\newcommand{\\bert}{\\foo}\n')
  const ERR = '! Undefined control sequence. (l.3 \\newcommand{\\bert}{\\foo})'
  const TEX23 = 'This is pdfTeX, Version 3.141592653-2.6-1.40.25 (TeX Live 2023) (preloaded format=pdflatex)\n'
  const fail23: Compiled = { ok: true, pdf: PDF, log: `${TEX23}! Undefined control sequence.\nl.3 \\newcommand{\\bert}{\\foo}\n! Emergency stop.\n` }
  const declaring = (year: string) => paperOf(SOURCE, [['00README.json', JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], texlive_version: year, process: { compiler: 'pdflatex' } })]])

  it('names it where the unmarked original was compiled: TeX\'s failure, a short one, a host\'s limit, a throw, and ours', async () => {
    const texs = compiler([PROBE, fail, fail, fail])
    expect(await markedOfPaper(paperOf(), { compile: texs.compile })).toMatchObject({ refused: 'compile', own: { ran: false, short: false, limit: null, tree: '2025' } })
    // (it ran through, with fewer pages than arXiv's: TeX's too)
    const short = compiler([PROBE, ran(PDF, '', 3), ran(PDF1, '', 3), ran(UNMARKED, '', 3)])
    expect(await markedOfPaper(paperOf(), { compile: short.compile, pages: 4 })).toMatchObject({ refused: 'compile', why: 'the paper\'s own source (article) has 3 pages, arXiv\'s PDF 4 on TeX Live 2025', own: { ran: true, short: true, limit: null, tree: '2025' } })
    // (stopped by a host's limit; a compile that threw, in which TeX told nothing)
    const limited = compiler([PROBE, fail, fail, { ok: false, error: 'Compilation timeout (the wall limit)', log: TEX }])
    expect(await markedOfPaper(paperOf(), { compile: limited.compile })).toMatchObject({ refused: 'compile', why: 'the paper\'s own source was stopped by the host\'s time limit', own: { ran: false, short: false, limit: 'time', tree: '2025' } })
    const threw = compiler([PROBE, fail, fail, new Error('the box went away')])
    expect(await markedOfPaper(paperOf(), { compile: threw.compile })).toMatchObject({ refused: 'compile', own: { ran: false, short: false, limit: null, tree: null } })
    // (the unmarked original makes the pages: ours)
    const ours = compiler([PROBE, fail, fail, ran(UNMARKED)])
    expect(await markedOfPaper(paperOf(), { compile: ours.compile })).toMatchObject({ refused: 'marks', own: { ran: true, short: false, limit: null, tree: '2025' } })
  })

  it('names none where the unmarked original was not compiled', async () => {
    const limited = compiler([PROBE, { ok: false, error: 'Compilation timeout (the wall limit)', log: TEX }])
    expect(await markedOfPaper(paperOf(), { compile: limited.compile })).not.toHaveProperty('own')
    const timed = (c: Compiled, ms: number): Compiled => ({ ...c, ms })
    const untold = compiler([timed(PROBE, 10), timed(fail, 100)])
    expect(await markedOfPaper(paperOf(), { compile: untold.compile, compileBudgetMs: 160 })).not.toHaveProperty('own')
    expect(await markedOfPaper(paperOf(), { compile: compiler([]).compile, engines: ['xelatex'] })).not.toHaveProperty('own')
    // (a marked original that stands carries no verdict)
    const errors = compiler([PROBE, ran(PDF, errorAt(2, 'paragraph').log), ran(UNMARKED, errorAt(2, 'paragraph').log)])
    expect(await markedOfPaper(paperOf(), { compile: errors.compile })).not.toHaveProperty('own')
  })

  it('takes the host\'s `tried` for its why: every tree tried, then the box\'s; texlive where the paper declares a year none of them is', async () => {
    // (undeclared: the compile's, on both trees)
    const plain = compiler([PROBE, fail, fail, fail])
    expect(await markedOfPaper(paperOf(), { compile: plain.compile, tried: ['2023'] })).toMatchObject({ refused: 'compile', why: `the paper's own source (article) does not run through on TeX Live 2023 or 2025: ${ERR}` })
    // (declares 2023, tried there first and then here: its own year was tried, so the compile's)
    const routed = compiler([PROBE, fail, fail, fail])
    expect(await markedOfPaper(declaring('2023'), { compile: routed.compile, tried: ['2023'] })).toMatchObject({ refused: 'compile', why: `the paper (article) declares TeX Live 2023; its own source does not run through on TeX Live 2023 or 2025: ${ERR}`, own: { tree: '2025' } })
    // (and through layoutMarksOfPaper, which takes the same options: refused before anything is opened)
    const whole = compiler([PROBE, fail, fail, fail])
    const open = async () => { throw new Error('nothing to open') }
    expect(await layoutMarksOfPaper(declaring('2023'), { compile: whole.compile, open, OPS: {}, tried: ['2023'] })).toMatchObject({ refused: 'compile', why: `the paper (article) declares TeX Live 2023; its own source does not run through on TeX Live 2023 or 2025: ${ERR}`, own: { tree: '2025' } })
    // (declares a year no tree tried is: TeX Live's, every tree named)
    const other = compiler([PROBE, fail23, fail23, fail23])
    expect(await markedOfPaper(declaring('2022'), { compile: other.compile, tried: ['2025'] })).toMatchObject({ refused: 'texlive', why: `the paper (article) declares TeX Live 2022; on TeX Live 2025 or 2023 its own source does not run through: ${ERR}`, own: { tree: '2023' } })
    // (none tried, or the box's own year among them, or no year: today's whys)
    for (const tried of [[], ['2025'], null, ['x', 2025]]) {
      const c = compiler([PROBE, fail, fail, fail])
      expect(await markedOfPaper(declaring('2023'), { compile: c.compile, tried: tried as string[] | null })).toMatchObject({ refused: 'texlive', why: `the paper (article) declares TeX Live 2023; on TeX Live 2025 its own source does not run through: ${ERR}` })
    }
  })

  it('handoverOf: the other served tree, once, where TeX failed on the paper\'s own source and no host\'s limit stopped it', () => {
    const served = ['2025', '2023']
    const failed = { ran: false, short: false, limit: null, tree: '2025' }
    expect(handoverOf(failed, { declared: null, served, last: false })).toBe('2023')
    expect(handoverOf({ ...failed, tree: '2023' }, { declared: '2023', served, last: false })).toBe('2025')
    expect(handoverOf({ ...failed, ran: true, short: true }, { declared: '2025', served, last: false })).toBe('2023')
    // (the declared year first where several trees are left)
    expect(handoverOf(failed, { declared: '2022', served: ['2025', '2023', '2022'], last: false })).toBe('2022')
    expect(handoverOf(failed, { declared: '2021', served: ['2025', '2023', '2022'], last: false })).toBe('2023')
    // (never: it made the pages here, a host's limit, TeX that never ran or a compile that threw, the last tree, one tree served,
    // no verdict)
    for (const [own, o] of [
      [{ ...failed, ran: true }, { served, last: false }],
      [{ ...failed, limit: 'time' }, { served, last: false }],
      [{ ...failed, tree: null }, { served, last: false }],
      [failed, { served, last: true }],
      [failed, { served: ['2025'], last: false }],
      [undefined, { served, last: false }],
    ] as const) expect(handoverOf(own, { declared: null, ...o })).toBeNull()
  })
})

describe('texLiveOfPdf: the TeX Live year arXiv\'s PDF says, from the Info dictionary PDF.js resolves', () => {
  const BANNER = (year: string) => `This is pdfTeX, Version 3.141592653-2.6-1.40.25 (TeX Live ${year}) kpathsea version 6.3.5`
  /** a PDF.js document that answers getMetadata with this (PDF.js 6 puts the Info keys it has no field for in `info.Custom`, a Map) */
  const docOf = (custom: Map<string, unknown> | undefined) => ({ getMetadata: async () => ({ info: custom ? { Producer: 'pikepdf', Custom: custom } : { Producer: 'pikepdf' }, metadata: null }) }) as never

  it('reads the year from the banner of the Info dictionary', async () => {
    expect(await texLiveOfPdf(docOf(new Map([['DOI', 'x'], ['PTEX.Fullbanner', BANNER('2023')]])))).toBe('2023')
    expect(await texLiveOfPdf(docOf(new Map([['PTEX.Fullbanner', BANNER('2025')]])))).toBe('2025')
    // (the year is a string, the type texLiveOf gives; a banner a distribution words otherwise still has it)
    expect(typeof await texLiveOfPdf(docOf(new Map([['PTEX.Fullbanner', BANNER('2025')]])))).toBe('string')
    expect(await texLiveOfPdf(docOf(new Map([['PTEX.Fullbanner', 'This is pdfTeX (TeX Live 2020/Debian) kpathsea']])))).toBe('2020')
  })

  it('is null where the document does not say: no banner, a banner without a year, another value, nothing of Info', async () => {
    expect(await texLiveOfPdf(docOf(undefined))).toBeNull()
    expect(await texLiveOfPdf(docOf(new Map([['DOI', 'x'], ['arXivID', '2610.20713']])))).toBeNull()
    expect(await texLiveOfPdf(docOf(new Map([['PTEX.Fullbanner', 'This is pdfTeX, Version 3.141592653-2.6-1.40.25']])))).toBeNull()
    expect(await texLiveOfPdf(docOf(new Map<string, unknown>([['PTEX.Fullbanner', { name: 'TeX Live 2023' }], ['PTEX.Fullbanner2', BANNER('2023')]])))).toBeNull()
    // (no other signal counts: not the Producer, not another key)
    expect(await texLiveOfPdf({ getMetadata: async () => ({ info: { Producer: 'pdfTeX-1.40.25 TeX Live 2023', Custom: new Map([['Notes', BANNER('2023')]]) } }) } as never)).toBeNull()
    expect(await texLiveOfPdf({ getMetadata: async () => null } as never)).toBeNull()
    expect(await texLiveOfPdf({ getMetadata: async () => ({}) } as never)).toBeNull()
    expect(await texLiveOfPdf({} as never)).toBeNull()
    expect(await texLiveOfPdf(null as never)).toBeNull()
  })

  it('does not throw where getMetadata does, and lets a memory-class error through', async () => {
    expect(await texLiveOfPdf({ getMetadata: async () => { throw new Error('broken') } } as never)).toBeNull()
    expect(await texLiveOfPdf({ getMetadata: () => { throw new Error('broken') } } as never)).toBeNull()
    await expect(texLiveOfPdf({ getMetadata: async () => { throw new RangeError(ALLOCATION_FAILED) } } as never)).rejects.toThrow(ALLOCATION_FAILED)
  })

  it('reads a real PDF through PDF.js: the Info the trailer names, not the banner of an included PDF or of an object nothing names', async () => {
    const pdf = await PL.PDFDocument.create({ updateMetadata: false })
    pdf.addPage([612, 792])
    // (the objects an included figure leaves behind: pdfTeX copies its Info dictionary as an object, banner and all, and a
    // superseded Info stays in the file; both come after the page and before the document's own Info in object order)
    const decoy = (year: string) => pdf.context.register(pdf.context.obj({ Producer: PL.PDFString.of('pdfTeX-1.40.20'), 'PTEX.Fullbanner': PL.PDFString.of(BANNER(year)) }))
    decoy('2019'); decoy('2021')
    const info = pdf.context.lookup(pdf.context.trailerInfo.Info) as PL.PDFDict | undefined ?? pdf.context.obj({})
    info.set(PL.PDFName.of('PTEX.Fullbanner'), PL.PDFString.of(BANNER('2023')))
    pdf.context.trailerInfo.Info = pdf.context.register(info)
    decoy('2024')
    const bytes = await pdf.save({ useObjectStreams: false })
    // (the banners are in the bytes in that order, the document's second: a scan of the file would not tell it)
    const raw = new TextDecoder('latin1').decode(bytes)
    expect([...raw.matchAll(/\(TeX Live (\d{4})\)/g)].map(m => m[1])).toEqual(['2019', '2021', '2023', '2024'])
    const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise
    try {
      expect(((await doc.getMetadata()).info as { Custom?: unknown }).Custom).toBeInstanceOf(Map)
      expect(await texLiveOfPdf(doc as never)).toBe('2023')
    } finally { await doc.loadingTask.destroy() }
  })
})

describe('compilerOfPdf: the compiler arXiv\'s PDF says made it, from the Info dictionary\'s Creator and Producer', () => {
  const docOf = (info: Record<string, unknown> | null) => ({ getMetadata: async () => (info === null ? null : { info }) }) as never

  it('names the compiler of the route that wrote the PDF: dvips is latex, pdfTeX pdflatex, XeTeX\'s driver xelatex, LuaTeX lualatex', async () => {
    // 1007.0072v1: a figure-less revtex4 paper arXiv made with latex, dvips and Ghostscript
    expect(await compilerOfPdf(docOf({ Creator: 'dvips(k) 5.98 Copyright 2009 Radical Eye Software', Producer: 'GPL Ghostscript GIT PRERELEASE 9.22' }))).toBe('latex')
    expect(await compilerOfPdf(docOf({ Creator: 'dvips(k) 2024.1 (TeX Live 2024) Copyright 2024 Radical Eye Software', Producer: 'Ghostscript 10.03.1' }))).toBe('latex')
    expect(await compilerOfPdf(docOf({ Creator: 'LaTeX with hyperref', Producer: 'pdfTeX-1.40.25' }))).toBe('pdflatex')
    expect(await compilerOfPdf(docOf({ Creator: 'LaTeX with hyperref', Producer: 'xdvipdfmx (20240305)' }))).toBe('xelatex')
    expect(await compilerOfPdf(docOf({ Creator: 'LaTeX with hyperref', Producer: 'LuaTeX-1.17.0' }))).toBe('lualatex')
  })

  it('is null where the document does not say, or says a tool that is no compiler of the route (a PDF library, a converter)', async () => {
    expect(await compilerOfPdf(docOf({}))).toBeNull()
    expect(await compilerOfPdf(docOf({ Creator: 'Microsoft Word', Producer: 'Adobe PDF Library' }))).toBeNull()
    expect(await compilerOfPdf(docOf({ Producer: 'pikepdf 8.0' }))).toBeNull()
    expect(await compilerOfPdf(docOf({ Creator: 5, Producer: { name: 'pdfTeX' } }))).toBeNull()
    expect(await compilerOfPdf(docOf(null))).toBeNull()
    expect(await compilerOfPdf({} as never)).toBeNull()
    expect(await compilerOfPdf(null as never)).toBeNull()
  })

  it('does not throw where getMetadata does, and lets a memory-class error through', async () => {
    expect(await compilerOfPdf({ getMetadata: async () => { throw new Error('broken') } } as never)).toBeNull()
    await expect(compilerOfPdf({ getMetadata: async () => { throw new RangeError(ALLOCATION_FAILED) } } as never)).rejects.toThrow(ALLOCATION_FAILED)
  })
})

describe('markedOfPaper: the compiler a package does not name is arXiv\'s PDF\'s, when the host reads it', () => {
  // (1007.0072v1: no 00README, no figure, so the compiler is a guess, pdflatex; arXiv made the PDF with latex and dvips, Letter,
  // where our pdfTeX base is A4)
  const ENGINES = (asked: CompileRequest[]) => asked.map(r => r.engine)

  it('asks every compile of the engine the host read, the probe included, and the DVI marks go with it', async () => {
    const paper = paperOf()
    expect(paper.meta).toMatchObject({ compiler: 'pdflatex', compilerGuessed: true })
    const c = compiler([PROBE])
    await markedOfPaper(paper, { compile: c.compile, compilerOf: async () => 'latex' })
    expect(ENGINES(c.asked)[0]).toBe('latex')
    // (the probe's source carries the DVI marks under latex: the engine's dviEngine)
    expect(dec(c.asked[0]?.overrides?.get('main.tex'))).toContain('axt@dvidest')
    expect(paper.meta).toMatchObject({ compiler: 'latex', compilerGuessed: false })
  })

  it('leaves the guess alone where the host reads nothing, throws, or names an engine that is none of the four', async () => {
    for (const compilerOf of [undefined, async () => null, async () => { throw new Error('no PDF') }, async () => 'tex' as string]) {
      const paper = paperOf()
      const c = compiler([PROBE])
      await markedOfPaper(paper, { compile: c.compile, ...(compilerOf ? { compilerOf } : {}) })
      expect(ENGINES(c.asked)[0]).toBe('pdflatex')
      expect(paper.meta).toMatchObject({ compiler: 'pdflatex', compilerGuessed: true })
    }
  })

  it('does not ask for a compiler the package names (00README.json): arXiv\'s own word stands', async () => {
    const paper = paperOf(SOURCE, [['00README.json', JSON.stringify({ process: { compiler: 'pdflatex' }, sources: [{ filename: 'main.tex', usage: 'toplevel' }] })]])
    expect(paper.meta.compilerGuessed).toBeFalsy()
    let asks = 0
    const c = compiler([PROBE])
    await markedOfPaper(paper, { compile: c.compile, compilerOf: async () => { asks++; return 'latex' } })
    expect([asks, ENGINES(c.asked)[0]]).toEqual([0, 'pdflatex'])
  })

  it('lets a failed allocation of the host\'s reader through', async () => {
    await expect(markedOfPaper(paperOf(), { compile: compiler([PROBE]).compile, compilerOf: async () => { throw new RangeError(ALLOCATION_FAILED) } })).rejects.toThrow(ALLOCATION_FAILED)
  })

  it('layoutMarksOfPaper passes it on', async () => {
    const paper = paperOf()
    const c = compiler([PROBE])
    await layoutMarksOfPaper(paper, { compile: c.compile, open: async () => null as never, OPS: {} as never, compilerOf: async () => 'latex' }).catch(() => {})
    expect(ENGINES(c.asked)[0]).toBe('latex')
  })
})
