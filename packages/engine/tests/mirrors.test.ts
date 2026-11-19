// @vitest-environment node
// Lists of the back half held to the definition each mirrors (design-reduction 3c's second kind, R6): a list that copies a
// definition names it, and a check here fails on an entry the definition lacks, or one it holds that the list does not.
import * as PL from '@cantoo/pdf-lib'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { END_TEX, LINES_TEX } from '../src/compile/tex.ts'
import { QUIET_NAMES } from '../src/ink.ts'
import {
  ASK_TEX,
  CALL_TEX,
  classNamesTex,
  DVI_LAYOUT_TEX,
  LAYOUT_TEX,
  MARK_CS,
  NAMES_TEX,
  refsTex,
  regionsTex,
  STATEMENTS_TEX,
  UNMARK_CS,
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
    axtnma: "a babel name's start mark: written through by design (NAME_MARK_FILE), read apart (guard.ts NAME_MARK)",
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
})
