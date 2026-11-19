// @vitest-environment node
// Lists of the back half held to the definition each mirrors (design-reduction 3c's second kind, R6): a list that copies a
// definition names it, and a check here fails on an entry the definition lacks, or one it holds that the list does not.
import { readFileSync } from 'node:fs'
import * as PL from '@cantoo/pdf-lib'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { LINES_TEX } from '../src/compile/tex.ts'
import { QUIET_NAMES } from '../src/ink.ts'
import { LAYOUT_TEX, NAMES_TEX, UNMARK_CS } from '../src/marks/marks.ts'
import { OPERATORS } from '../src/remove.ts'
import { MARK_DEF } from '../src/source/latex-front.ts'

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

// The lists of our own marks mirror our own marked TeX: each member a macro that TeX defines (`\def\axt…` or
// `\protected\def\axt…`, a name of letters alone), read here off the TeX the engine writes, no TeX run. compile/guard.ts keeps
// MARK_CS and OUR_MARKS to itself: they are read off its source
describe('the marks our marked TeX defines (compile/guard.ts MARK_CS and OUR_MARKS, marks/marks.ts UNMARK_CS)', () => {
  const defined = (...texts: string[]) =>
    new Set(
      texts.flatMap((t) => [...t.matchAll(/\\(?:protected\\)?[gex]?def\\(axt[a-z]+)(?![a-z@])/g)].map((m) => m[1])),
    )
  const guard = readFileSync(new URL('../src/compile/guard.ts', import.meta.url), 'utf8')
  it("are MARK_DEF's, LINES_TEX's and LAYOUT_TEX's, each of MARK_CS and of OUR_MARKS", () => {
    const ours = defined(MARK_DEF, LINES_TEX, LAYOUT_TEX)
    const markCs = [
      .../const MARK_CS: ReadonlySet<string> = new Set\(\[([^\]]*)\]/.exec(guard)![1]!.matchAll(/'([^']+)'/g),
    ].map((m) => m[1])
    const ourMarks = /const OUR_MARKS =\s*\/[^\n]*?\(\?:([a-z|]+)\)/.exec(guard)![1]!.split('|')
    expect(markCs).toHaveLength(8)
    expect(ourMarks).toHaveLength(8)
    expect(markCs.filter((n) => !ours.has(n))).toEqual([])
    expect(ourMarks.filter((n) => !ours.has(n))).toEqual([])
  })
  it("are LAYOUT_TEX's and NAMES_TEX's, each of UNMARK_CS", () => {
    const ours = defined(LAYOUT_TEX, NAMES_TEX)
    expect(UNMARK_CS.filter((n) => !ours.has(n))).toEqual([])
  })
})
