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
/** a one-file paper's body, read and marked */
const paper = (body: string) => {
  const tree = {
    main: 'main.tex',
    files: new Map([['main.tex', enc.encode(`\\documentclass{article}\\begin{document}\n${body}\n\\end{document}\n`)]]),
  }
  const doc = readSource(tree, NO_DEFINITIONS)
  return { doc, plan: markSource(tree, doc).plan }
}
const roles = (ins: { glyphs: { role: Uint8Array }[] }, p = 0) => [...(ins.glyphs[p]?.role ?? [])]

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

  it('owns an element between its two points across a page break inside the bodies (stream.mjs ownedOf: closed)', () => {
    const { doc, plan } = paper('We cite \\cite{a} here.')
    expect(plan.marks.map((m) => m.name)).toEqual(expect.arrayContaining(['p0.1a', 'p0.1b']))
    const one = page('We cite [1', [
      ['bs1', 0],
      ['0s', 0],
      ['p0.1a', 8],
      ['be1', 10],
    ])
    const two = page('] here.', [
      ['bs2', 0],
      ['p0.1b', 1],
      ['0e', 7],
      ['be2', 7],
    ])
    const ins = instrumentFromPlan({
      ink: null,
      pages: [one, two],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
    expect(roles(ins, 0)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 2, 2])
    expect(roles(ins, 1)).toEqual([2, 1, 1, 1, 1, 1, 1])
    expect(ins.glyphs[1]?.piece[0]).toBe(1)
  })
  it('reads a piece whose closing point TeX did not set as an opening alone, to the text after it', () => {
    const { doc, plan } = paper('We cite \\cite{a} here.')
    const pg = page('We cite [1] here.', [
      ['0s', 0],
      ['p0.1a', 8],
      ['0e', 17],
    ])
    const ins = instrumentFromPlan({ ink: null, pages: [pg], plan, doc, made: { compiler: 'pdflatex', tree: '2025' } })
    expect(roles(ins).slice(8, 13)).toEqual([2, 2, 2, 2, 1])
  })
  it('tells the text after an opening alone up to its unit’s next mark, though it spells no letter (a URL’s dots before the stop)', () => {
    const { doc, plan } = paper('See \\doi{a.b}.')
    const names = plan.marks.map((m) => m.name)
    expect(names).toContain('p0.1a')
    expect(names).not.toContain('p0.1b')
    const pg = page('See a.b.', [
      ['0s', 0],
      ['p0.1a', 4],
      ['0e', 8],
    ])
    const ins = instrumentFromPlan({ ink: null, pages: [pg], plan, doc, made: { compiler: 'pdflatex', tree: '2025' } })
    expect(roles(ins)).toEqual([1, 1, 1, 1, 2, 2, 2, 1])
  })
  it('gives a unit’s text the painted paths in its range, never a turned glyph’s box', () => {
    const { doc, plan } = paper('A rule here.')
    const base = page('A rule here.', [
      ['0s', 0],
      ['0e', 12],
    ])
    const points = base.points.map((x) => (x.name === '0e' ? { ...x, box: 2 } : x))
    const pg: PageRead = { ...base, points, boxes: [0, 99, 20, 99.4, 0, 0, 5, 30], paths: [0, -4] }
    const ins = instrumentFromPlan({ ink: null, pages: [pg], plan, doc, made: { compiler: 'pdflatex', tree: '2025' } })
    expect([...(ins.boxes[0]?.role ?? [])]).toEqual([1, 0])
  })

  it('lets go a line of a unit’s range its source does not spell, on a line of its own below the unit’s (own.mjs releaseLines)', () => {
    const { doc, plan } = paper('We see here.')
    const at = (u: string, j: number, y: number) => ({ u, x0: j * 5, x1: j * 5 + 4, y, size: 10 })
    const glyphs = [...'Wesee']
      .map((u, j) => at(u, j, 100))
      .concat(
        [...'note'].map((u, j) => at(u, j, 50)),
        [...'here.'].map((u, j) => at(u, j, 90)),
      )
    const pg: PageRead = {
      glyphs,
      boxes: [],
      points: [
        { name: '0s', glyph: 0, box: 0 },
        { name: '0e', glyph: 14, box: 0 },
      ],
    }
    const ins = instrumentFromPlan({ ink: null, pages: [pg], plan, doc, made: { compiler: 'pdflatex', tree: '2025' } })
    expect(roles(ins)).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1])
  })
  it('gives a unit’s text the thin rules on its lines alone, no box behind its words (own.mjs lineRulesOf)', () => {
    const { doc, plan } = paper('A rule here.')
    const base = page('A rule here.', [
      ['0s', 0],
      ['0e', 12],
    ])
    const points = base.points.map((x) => (x.name === '0e' ? { ...x, box: 2 } : x))
    // (an underline 0.4 pt thick under "rule", and a coloured box 11 pt tall behind it)
    const pg: PageRead = { ...base, points, boxes: [10, 98, 30, 98.4, 10, 96, 30, 107], paths: [0, 1] }
    const ins = instrumentFromPlan({ ink: null, pages: [pg], plan, doc, made: { compiler: 'pdflatex', tree: '2025' } })
    expect([...(ins.boxes[0]?.role ?? [])]).toEqual([1, 0])
  })
  it('takes no label glyph from an included graphic set on the start’s line (its frame’s points)', () => {
    const { doc, plan } = paper('We see.')
    const pg = page('XYWe see.', [
      ['g1a', 0],
      ['g1b', 2],
      ['0s', 2],
      ['0e', 9],
    ])
    const ins = instrumentFromPlan({ ink: null, pages: [pg], plan, doc, made: { compiler: 'pdflatex', tree: '2025' } })
    expect(roles(ins).slice(0, 3)).toEqual([0, 0, 1])
  })
})
