// @vitest-environment node
// One included graphic is one ink, and TeX is asked about the marks of a placeholder after a paper's macro whatever its class
// and whatever unit it stands in (2611.18114v1's affiliations: `\textsuperscript{3}\afficon[…]{logo_columbia}`, the logo a
// paper's macro around \includegraphics, set in a front unit).
//
// 1. The marking left the logo's piece unmarked: a placeholder right after a paper's macro, which may read what follows
//    (marks.ts LOOKS_AHEAD), gets marks only where the look-ahead probe says they move nothing, and the probe asked about a
//    placeholder of AHEAD_FOLLOWS's classes alone, a paper's macro not among them ("found by the text TeX sets for it": a
//    macro that sets ink and no text has nothing to be found by). Asked now; and a front unit's pairs are asked as the unit
//    carries its marks, with `\protect` before each (its marks robust): an answer about another token list is no answer.
// 2. With no piece of its own, the logo's paths fell to two readings: a thin bar under the baseline was taken as the line's
//    rule (own.ts lineRulesOf), the crown left to no one, and the wrap refused the page ('a form partly owned'). Every box a
//    placed form paints is that placement's (pageInk's `boxForms`), never a rule of a line, and owned whole by one piece.
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { pageInk } from '../src/ink.ts'
import { aheadSection, probeSamples } from '../src/marks/marks.ts'
import { lineRulesOf } from '../src/own/own.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const paperOf = (tex: string) => openPaper(new Map([['main.tex', enc(tex)]]))
const aheadOf = (tex: string) => {
  const p = paperOf(tex)
  return probeSamples(p.project.units, p.project.complete).filter((s) => s.ahead) as {
    key: string
    src: string
    follows: string
    lead: string
  }[]
}
const ICON = '\\newcommand{\\icon}{\\rule{1ex}{1ex}}'

describe('the look-ahead probe asks about a placeholder after a paper macro', () => {
  it("a paper's macro after a paper's macro, in a body paragraph: asked, with no lead", () => {
    const tex = `\\documentclass{article}\n${ICON}\n\\begin{document}\nOur own words before\\textsuperscript{1}\\icon{} and our words after it, long enough.\n\\end{document}\n`
    expect(aheadOf(tex).map((s) => [s.src, s.follows, s.lead])).toEqual([['\\textsuperscript{1}', '\\icon{}', '']])
  })
  it("in a front unit: asked with the unit's lead, its key another question than the body's", () => {
    const tex = `\\documentclass{article}\n${ICON}\n\\title{A title of ours}\n\\author{Ann Lee\\textsuperscript{1}\\icon{} of Our Place}\n\\begin{document}\n\\maketitle\nOur own first paragraph, long enough to be a unit of its own.\n\\end{document}\n`
    const [s] = aheadOf(tex)
    expect(s).toMatchObject({ src: '\\textsuperscript{1}', follows: '\\icon{}', lead: '\\protect' })
    expect(s!.key.startsWith('\\protect')).toBe(true)
  })
  it("the probe's boxes set a front pair's marks with its lead", () => {
    const tex = aheadSection([
      {
        key: 'k',
        src: '\\textsuperscript{1}',
        gap: '',
        follows: '\\icon{}',
        math: false,
        lead: '\\protect',
        ahead: true,
      },
    ])
    expect(tex).toContain(
      '\\protect\\axtpma{q0a}\\textsuperscript{1}\\protect\\axtpm{q0b}\\protect\\axtpma{q0c}\\icon{}',
    )
  })
  it('a text symbol after a paper macro is not asked: it reads nothing and is found by its character', () => {
    const tex = `\\documentclass{article}\n${ICON}\n\\begin{document}\nOur own words before\\textsuperscript{1}\\S{} and our words after it, long enough.\n\\end{document}\n`
    expect(aheadOf(tex)).toEqual([])
  })
})

const OPTIONS = { verbosity: 0, useSystemFonts: false, isEvalSupported: false, fontExtraProperties: true }
/** one page: a word, a rule under it on the page, and one form painted twice beside it, each painting a thin bar under the line */
async function inkOf() {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  page.node.setFontDictionary(PL.PDFName.of('F1'), (await doc.embedFont(PL.StandardFonts.Helvetica)).ref)
  const fm = doc.context.register(
    doc.context.stream('0 -1 20 0.5 re f 4 2 12 8 re f', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, -5, 40, 20],
      Resources: {},
    }),
  )
  page.node.set(
    PL.PDFName.of('Resources'),
    doc.context.obj({ Font: page.node.Resources()!.get(PL.PDFName.of('Font'))!, XObject: { Fm: fm } }),
  )
  page.node.set(
    PL.PDFName.of('Contents'),
    doc.context.register(
      doc.context.stream(
        'BT /F1 10 Tf 72 700 Td (Words of ours here) Tj ET 72 698 30 0.5 re f q 1 0 0 1 90 700 cm /Fm Do Q q 1 0 0 1 120 700 cm /Fm Do Q',
      ),
    ),
  )
  const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }))
  const task = getDocument({ ...OPTIONS, data: bytes })
  const pg = await (await task.promise).getPage(1)
  const ops = await pg.getOperatorList()
  const ink = pageInk(
    OPS as unknown as Record<string, number>,
    ops as never,
    pg.commonObjs as never,
    { rotate: 0, indices: true, forms: true } as never,
  ) as unknown as {
    glyphs: { u?: string; x0: number; x1: number; y: number; size: number }[]
    boxes: number[]
    paths: number[]
    boxForms?: number[]
  }
  await task.destroy()
  return ink
}

describe('one included graphic is one ink', () => {
  it('each box states the placed form that painted it: 0 on the page, one number for each painting of a form', async () => {
    const ink = await inkOf()
    expect(ink.boxForms).toBeDefined()
    const forms = ink.boxForms!
    expect(forms.length).toBe(ink.boxes.length / 4)
    expect(forms[0]).toBe(0)
    const placed = [...new Set(forms.filter((f) => f > 0))]
    expect(placed.length).toBe(2)
  })
  it("a line's rule is the page's own bar under it, never a bar a placed form paints", async () => {
    const ink = await inkOf()
    const page = { glyphs: ink.glyphs as never, boxes: ink.boxes, paths: ink.paths, forms: ink.boxForms }
    const glyphs = ink.glyphs.map((_, g) => [1, g] as [number, number])
    const boxes = ink.paths.map((_, b) => [1, b] as [number, number])
    const { rules } = lineRulesOf([page], glyphs, boxes)
    expect(rules.map(([, b]) => b)).toEqual([0])
  })
})
