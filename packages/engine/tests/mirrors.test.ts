// @vitest-environment node
// Lists of the back half held to the definition each mirrors (design-reduction 3c's second kind, R6): a list that copies a
// definition names it, and a check here fails on an entry the definition lacks, or one it holds that the list does not.
import * as PL from '@cantoo/pdf-lib'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { markedPreamble, openPaper, originalFiles, probeFiles, type Spans } from '../src/compile/live.ts'
import { END_TEX, LINES_TEX } from '../src/compile/tex.ts'
import { QUIET_NAMES } from '../src/ink.ts'
import {
  ASK_TEX,
  CALL_TEX,
  CARRY_END_TEX,
  CARRY_TEX,
  classNamesTex,
  DVI_LAYOUT_TEX,
  LAYOUT_CLASSES,
  LAYOUT_TEX,
  MARK_CS,
  NAMES_TEX,
  refsTex,
  regionsTex,
  STATEMENTS_TEX,
  UNMARK_CS,
  withoutOurMarks,
} from '../src/marks/marks.ts'
import { OPERATORS } from '../src/remove.ts'
import { DVI_MARK_DEF, MARK_DEF } from '../src/source/latex-front.ts'

describe('the operators of a content stream (remove.ts OPERATORS: PDF 32000-1:2008 Annex A, Table A.1)', () => {
  it('are the 73 operators pdf-lib lists (PDFOperatorNames), each once, none past three bytes', () => {
    const names = Object.values(PL.PDFOperatorNames) as string[]
    expect(names).toHaveLength(73)
    expect(new Set(OPERATORS).size).toBe(OPERATORS.length)
    expect([...OPERATORS].sort()).toEqual([...names].sort())
    expect(OPERATORS.filter((t) => t.length > 3)).toEqual([])
  })
})

describe('the operations a char procedure may hold that paint nothing (ink.ts QUIET_NAMES)', () => {
  it('are each a name of PDF.js’s operator table (pdfjs-dist’s OPS), none dropped unseen', () => {
    const table = OPS as unknown as Record<string, number>
    expect(QUIET_NAMES.filter((n) => !Object.hasOwn(table, n))).toEqual([])
    expect(new Set(QUIET_NAMES).size).toBe(QUIET_NAMES.length)
  })
})

// The lists of our own marks mirror our own marked TeX: each member a macro that TeX defines (`\def\axt…`,
// `\protected\def\axt…`, `\let\axt…`, a name of letters alone), read here off the TeX the engine writes, no TeX run. The guard
// (compile/guard.ts) reads MARK_CS alone, every reader of it (tests/guard-marks.test.ts holds each to every member)
describe('the marks our marked TeX defines (marks/marks.ts MARK_CS and UNMARK_CS)', () => {
  const defined = (...texts: string[]) =>
    new Set(
      texts.flatMap((t) =>
        [...t.matchAll(/\\(?:let|(?:protected\\)?(?:long\\)?[gex]?def)\\(axt[a-z]+)(?![a-z@])/g)].map((m) => m[1]),
      ),
    )
  /** the macros of a letters-only name the marked original's TeX defines that name no unit, so none of MARK_CS: why each */
  const NOT_MARKS: Record<string, string> = {
    axtskip: "MARK_DEF's \\axtend's own: the glue it takes off, defined where it is used, never written into a source",
    axtendhook: "END_TEX's flag that it hooked the document's end once, never written into a source",
    axtnma:
      "a babel name's start mark, no unit's name: written through by design (NAME_MARK_FILE), read apart (guard.ts NAME_MARK), taken out with ours (withoutOurMarks)",
    axtnmb: "a babel name's end mark: as \\axtnma",
    axtask:
      "the loop's first pass's ask, its argument a sample's index: taken out of every file that pass wrote (paper.ts unasked), never the pass the guard reads",
  }
  it("are every macro the marked original's TeX defines, MARK_CS, but those that name no unit, each once", () => {
    // (every head the marked original and the mark probe's preamble carry: originalFiles', probeFiles'; a sample of each made of
    // its arguments)
    const ours = defined(
      MARK_DEF,
      DVI_MARK_DEF,
      LAYOUT_TEX,
      STATEMENTS_TEX,
      ASK_TEX,
      DVI_LAYOUT_TEX,
      CALL_TEX,
      CARRY_END_TEX,
      CARRY_TEX,
      classNamesTex(['\\begin{IEEEproof}']),
      regionsTex(['verbatim', 'lstlisting']),
      refsTex(['key']),
      END_TEX,
      LINES_TEX,
    )
    expect(new Set(MARK_CS).size).toBe(MARK_CS.length)
    expect(MARK_CS.filter((n) => n in NOT_MARKS)).toEqual([])
    expect([...MARK_CS, ...Object.keys(NOT_MARKS)].sort()).toEqual([...ours].sort())
  })
  it("are LAYOUT_TEX's and NAMES_TEX's, each of UNMARK_CS", () => {
    const ours = defined(LAYOUT_TEX, NAMES_TEX)
    expect(UNMARK_CS.filter((n) => !ours.has(n))).toEqual([])
  })

  // (a paper of our own with every kind of unit the marking marks: a front block whose head is a paper's macro, a footnote's
  // call and an author's call in it, a heading, a macro's definition that holds text, a paragraph that begins and one that ends
  // with a paper's macro, a formula, a colour, a paper's own \protect\cite, a citation first after a display (the carrier), a
  // cell, a footnote, a reference; and a style whose
  // abstract writes its name literally)
  const enc = (s: string) => new TextEncoder().encode(s)
  const dec = (b: Uint8Array | undefined) => new TextDecoder('latin1').decode(b)
  const MAIN = [
    '\\documentclass{article}',
    '\\usepackage{xcolor}',
    '\\usepackage{refs}',
    '\\newcommand{\\myname}{Ann}',
    '\\newcommand{\\bert}{BERT}',
    '\\newcommand{\\etal}{et al.}',
    '\\title{A \\textbf{Bold} Title}',
    '\\author{\\myname{} Lee\\textsuperscript{1}\\thanks{A note.} \\and Bob Ray}',
    '\\begin{document}',
    '\\maketitle',
    '\\bert{} is a model of words with $x$ in it \\protect\\cite{a} and \\textcolor{red}{red words}.',
    '',
    'We read the words of Smith\\etal',
    '',
    'We define the words by',
    '\\[ x = y \\]',
    '\\cite{a} gives them.',
    '',
    '\\begin{tabular}{l}',
    'A cell of words\\\\',
    '\\end{tabular}',
    '',
    'Another paragraph\\footnote{A footnote.} of words.',
    '\\begin{thebibliography}{1}',
    '\\bibitem{a} A. Author, A title of a paper.',
    '\\end{thebibliography}',
    '\\end{document}',
    '',
  ].join('\n')
  const STY = ['\\ProvidesPackage{refs}', '\\renewenvironment{abstract}{\\section*{Abstract}}{\\par}', ''].join('\n')
  const paperOf = (main: string) =>
    openPaper(
      new Map([
        ['main.tex', enc(main)],
        ['refs.sty', enc(STY)],
      ]),
    )

  it("are, with what the marking writes right before one, all it writes: the marked original, our marks taken out, is the paper's", () => {
    const paper = paperOf(MAIN),
      spans: Spans = {}
    // (the citation first after a display: TeX's display probe said it opens none, so the carrier stands before it)
    const out = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, spans, quiet: ['\\cite{a}'] })
    const main = dec(out.get('main.tex')).slice(spans.skip),
      sty = dec(out.get('refs.sty'))
    // (each kind written: a front unit's robust lead, a start mark's, a call, a babel name's marks in the style)
    for (const s of [
      '\\protect\\axthpk{',
      '\\protect\\axtpma{',
      '\\leavevmode\\axtmark{',
      '\\axtcall{',
      '\\axtpmd{',
      '\\axttg{',
      '\\axtcolour{',
    ])
      expect(main).toContain(s)
    expect(sty).toContain('\\axtnma{abstract}Abstract\\axtnmb{abstract}')
    expect(withoutOurMarks(main)).toBe(MAIN)
    expect(withoutOurMarks(sty)).toBe(STY)
  })

  it('cover what a marked preamble carries, every one defined in the mark probe over it as in the marked compile', () => {
    // (a preamble is not told from the body: a unit of any kind can stand there, a macro's definition that holds text among them,
    // so that the probe takes the marked original's own TeX for the marks, CALL_TEX where the marked compile loads it)
    const headOf = (paper: ReturnType<typeof paperOf>) => {
      const mp = markedPreamble(paper)
      if (!mp) throw new Error('no marked preamble')
      const probe = dec(probeFiles(paper, { marks: true, preamble: mp }).get('main.tex'))
      return { mp, head: probe.slice(0, probe.indexOf(END_TEX)) }
    }
    const called = headOf(paperOf(MAIN))
    const carried = new Set([...called.mp.text.matchAll(/\\(axt[a-z]+)(?![a-z@])/g)].map((m) => m[1]))
    expect([...carried].sort()).toEqual(['axtcall', 'axtend', 'axthmark', 'axthpk', 'axtmark', 'axtpma'])
    expect(called.head.startsWith(called.mp.marks)).toBe(true)
    expect(called.mp.marks).toContain(CALL_TEX)
    // (the marked preamble is written before the display probe answers: no carrier in it, nor its TeX in the probe's head)
    expect(called.mp.marks).not.toContain(CARRY_TEX)
    expect(called.mp.marks).not.toContain(CARRY_END_TEX)
    expect(MARK_CS.filter((n) => !defined(called.head).has(n))).toEqual(['axtpmd'])
    // (no author's call anywhere: no CALL_TEX in the marked compile, none in the probe, the probe's bytes as they were)
    const single = headOf(paperOf(MAIN.replace(' \\and Bob Ray', '')))
    expect(single.mp.text).not.toContain('\\axtcall')
    expect(single.head).not.toContain(CALL_TEX)
    expect(MARK_CS.filter((n) => !defined(single.head).has(n))).toEqual(['axtpmd', 'axtcall'])
  })
})
