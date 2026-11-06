import { describe, expect, it } from 'vitest'
import { instrumentFromPlan, type PageRead, ROLE, readAlign } from '../../src/marks/instrument.ts'
import { markSource } from '../../src/marks/mark.ts'
import { NO_DEFINITIONS } from '../../src/source/definitions.ts'
import { readSource } from '../../src/source/read.ts'

const enc = new TextEncoder()
/** a page of B as pageInk reads it: one glyph a character on one line, the points at their glyph counts */
const page = (text: string, points: [string, number][]): PageRead => ({
  glyphs: [...text].map((u, j) => ({ u, x0: j * 5, x1: j * 5 + 4, y: 100, size: 10 })),
  boxes: [],
  points: points.map(([name, glyph]) => ({ name, glyph, box: 0 })),
})

describe('instrumentFromPlan: B’s points joined to the units through the plan', () => {
  it('owns a unit’s text between its points, a formula between its own, the label before its start', () => {
    const tree = {
      main: 'main.tex',
      files: new Map([
        ['main.tex', enc.encode('\\documentclass{article}\\begin{document}\nWe see $x$ here.\n\\end{document}\n')],
      ]),
    }
    const doc = readSource(tree, NO_DEFINITIONS)
    const { plan } = markSource(tree, doc)
    // "1. We see x here." : a label "1. ", the unit's text, its formula's glyph between p0.1a and p0.1b
    const pg = page('1. We see x here.', [
      ['bs1', 0],
      ['0s', 3],
      ['p0.1a', 10],
      ['p0.1b', 11],
      ['0e', 17],
      ['be1', 17],
    ])
    const ins = instrumentFromPlan({ ink: null, pages: [pg], plan, doc, made: { compiler: 'pdflatex', tree: '2025' } })
    const G = ins.glyphs[0]
    expect(G && [...G.role]).toEqual([4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1])
    expect(G && [...G.unit].every((u) => u === 0)).toBe(true)
    expect(G?.piece[10]).toBe(1)
    expect(ins.units[0]?.id).toBe(doc.units[0]?.id)
    expect(ROLE.element).toBe(2)
  })
  it('reads each unit’s alignment as its end mark states it, none for one set in two', () => {
    const log = [
      'AXT-ALIGN 3 p 1 0.0pt 1 0.0pt 0 0.0pt',
      'AXT-ALIGN 4 p 0 0.0pt 0 0.0pt 1 0.0pt',
      'AXT-ALIGN 5 p 0 0.0pt 0 0.0pt 1 0.0pt',
      'AXT-ALIGN 5 p 0 0.0pt 1 0.0pt 0 0.0pt',
    ].join('\n')
    expect([...readAlign(log)]).toEqual([
      [3, 'c'],
      [4, 'j'],
    ])
  })
})
