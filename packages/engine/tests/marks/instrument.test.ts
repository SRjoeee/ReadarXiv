import { describe, expect, it } from 'vitest'
import { ROLE } from '../../src/instrument.ts'
import { instrumentFromPlan, type PageRead, readAlign, WorkBound } from '../../src/marks/instrument.ts'
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
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
    const G = ins.glyphs[0]
    expect(G && [...G.role]).toEqual([4, 4, 4, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1])
    expect(G && [...G.unit].every((u) => u === 0)).toBe(true)
    expect(G?.piece[10]).toBe(1)
    expect(ins.units[0]?.id).toBe(doc.units[0]?.id)
    expect(ROLE.element).toBe(2)
  })
  it('owns a head macro’s glyphs from its point to the start, the label before it; states the span after an end empty', () => {
    // (1810.04805v2's `\\bert is simple`: "BERT" between p0.0a (\\axthpk's) and 0s, the piece's, "1. " before the point the
    // label; 2610.19159v1's `Tool Output\\trajectoryMark{}`: its span from the end point 1e to p1.2g, no glyph between)
    const tree = {
      main: 'main.tex',
      files: new Map([
        [
          'main.tex',
          enc.encode(
            '\\documentclass{article}\\newcommand\\bert{BERT}\\newcommand\\mark[1]{}\\begin{document}\n\\bert is simple.\n\n\\textbf{Tool Output\\mark{}}\n\\end{document}\n',
          ),
        ],
      ]),
    }
    const doc = readSource(tree, NO_DEFINITIONS)
    const { plan } = markSource(tree, doc)
    const pg = page('1. BERT is simple.Tool Output', [
      ['bs1', 0],
      ['p0.0a', 3],
      ['0s', 8],
      ['0e', 18],
      ['1s', 18],
      ['1e', 29],
      ['p1.2g', 29],
      ['be1', 29],
    ])
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
    const G = ins.glyphs[0]
    expect(G && [...G.role].slice(0, 9)).toEqual([4, 4, 4, 2, 2, 2, 2, 2, 1])
    expect(G?.piece[3]).toBe(0)
    expect(ins.places).toEqual(
      expect.arrayContaining([
        { unit: 0, piece: 'e0', page: 1, glyph: 3, end: false },
        { unit: 0, piece: 'e0', page: 1, glyph: 8, end: true },
        { unit: 1, piece: 'e1', page: 1, glyph: 29, end: false },
        { unit: 1, piece: 'e1', page: 1, glyph: 29, end: true },
      ]),
    )
    // (no glyph but a painted box between the end point and the point after the group: an image the macro set, no span stated)
    const icon = { ...pg, points: pg.points.map((x) => (x.name === 'p1.2g' ? { ...x, box: 1 } : x)) }
    const withIcon = instrumentFromPlan({
      ink: { pages: [] },
      pages: [icon],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
    expect(withIcon.places?.filter((x) => x.unit === 1 && x.piece === 'e1')).toEqual([])
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
      ink: { pages: [] },
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
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
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
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
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
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
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
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
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
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
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
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
    expect(roles(ins).slice(0, 3)).toEqual([0, 0, 1])
  })
  it('gives a unit the glyphs that set its unmarked lead text symbols, right before its start (own.mjs headSymbolsOf)', () => {
    const { doc, plan } = paper('\\#\\# Role here.')
    expect(plan.marks.some((m) => m.kind === 'open')).toBe(false)
    const pg = page('##Role here.', [
      ['0s', 2],
      ['0e', 12],
    ])
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
    expect(roles(ins).slice(0, 3)).toEqual([1, 1, 1])
  })
  it('gives a cell’s lead macro the glyphs that spell the text the probe showed it sets, right before its start (own.mjs MR 5b)', () => {
    // (1810.04805v2 p7's `\\bertbase (Single)`: a cell takes no head mark (a mark before \\multicolumn's \\omit is refused), so
    // TeX sets the macro's ink before the cell's start point; the number cell before it is no unit's, and its glyphs abut)
    const tree = {
      main: 'main.tex',
      files: new Map([
        [
          'main.tex',
          enc.encode(
            '\\documentclass{article}\\newcommand\\bertbase{BERT$_{\\textsc{base}}$}\\begin{document}\n' +
              '\\begin{tabular}{ll}\n85.1 & \\bertbase (Single) \\\\\n\\end{tabular}\n\\end{document}\n',
          ),
        ],
      ]),
    }
    const doc = readSource(tree, NO_DEFINITIONS)
    const { plan } = markSource(tree, doc)
    expect(doc.units[0]?.kind).toBe('cell')
    const pg = page('85.1BERTBASE(Single)', [
      ['t0s', 12],
      ['t0e', 20],
    ])
    const lay = (texts: Map<string, string>) =>
      instrumentFromPlan({
        ink: { pages: [] },
        pages: [pg],
        plan,
        doc,
        texts,
        made: { compiler: 'pdflatex', tree: '2025' },
      })
    const ins = lay(new Map([['\\bertbase', 'BERTBASE']]))
    expect(roles(ins)).toEqual([0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1])
    expect([...(ins.glyphs[0]?.piece ?? [])].slice(4, 12)).toEqual(Array(8).fill(0))
    // (a text the glyphs there do not spell: no unit's, as before)
    expect(roles(lay(new Map([['\\bertbase', 'BERTLARGE']]))).slice(0, 12)).toEqual(Array(12).fill(0))
  })
  it('ends a pathological paper in no layer and why (WorkBound), never in a hang: ranges each running to the page’s end', () => {
    // (400 paragraphs whose start points TeX set on one page of 40,000 glyphs and whose end points all stand at its end:
    // each text range is the rest of the page, 16 million glyphs visited against a bound of 2 million)
    const { doc, plan } = paper(Array.from({ length: 400 }, (_, i) => `Words ${i} here.`).join('\n\n'))
    const text = 'x'.repeat(40_000)
    const points: [string, number][] = [['bs1', 0]]
    for (let i = 0; i < 400; i++) points.push([`${i}s`, i])
    for (let i = 0; i < 400; i++) points.push([`${i}e`, 40_000])
    const t0 = performance.now()
    expect(() =>
      instrumentFromPlan({
        ink: { pages: [] },
        pages: [page(text, points)],
        plan,
        doc,
        made: { compiler: 'pdflatex', tree: '2025' },
        work: 2_000_000,
      }),
    ).toThrow(WorkBound)
    expect(performance.now() - t0).toBeLessThan(5_000)
    // (the same paper with each range its own: well under the bound)
    const fair: [string, number][] = [['bs1', 0]]
    for (let i = 0; i < 400; i++) fair.push([`${i}s`, i * 100], [`${i}e`, i * 100 + 90])
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [page(text, fair)],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
      work: 2_000_000,
    })
    expect(ins.glyphs[0]?.unit[150]).toBe(1)
  })
  it('owns nothing inside an \\includegraphics frame: the draft’s file name is no unit’s text', () => {
    const { doc, plan } = paper('We see here.')
    // "We see a.png here." with the frame's points around "a.png" (the draft prints the file's name in its frame)
    const pg = page('We see a.png here.', [
      ['bs1', 0],
      ['0s', 0],
      ['g1a', 7],
      ['g1b', 12],
      ['0e', 18],
    ])
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
    expect(roles(ins)).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1])
  })
  it('reads TeX’s sentence ends apart from the ownership (their points cut no reading)', () => {
    const { doc, plan } = paper('We see. Then more.')
    const pg = page('We see. Then more.', [
      ['bs1', 0],
      ['0s', 0],
      ['s0.0', 7],
      ['0e', 18],
    ])
    const ins = instrumentFromPlan({
      ink: { pages: [] },
      pages: [pg],
      plan,
      doc,
      made: { compiler: 'pdflatex', tree: '2025' },
    })
    expect(ins.tex.sentences).toEqual([{ unit: 0, page: 1, glyph: 7 }])
    expect(roles(ins).every((r) => r === 1)).toBe(true)
  })
})
