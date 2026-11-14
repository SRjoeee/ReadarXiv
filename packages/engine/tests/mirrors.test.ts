// @vitest-environment node
// Lists of the back half held to the definition each mirrors (design-reduction 3c's second kind, R6): a list that copies a
// definition names it, and a check here fails on an entry the definition lacks, or one it holds that the list does not.
import * as PL from '@cantoo/pdf-lib'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { QUIET_NAMES } from '../src/ink.ts'
import { OPERATORS } from '../src/remove.ts'

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
