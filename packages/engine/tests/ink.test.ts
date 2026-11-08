// The units no source unit is, made by locate on arXiv's page by today's rule (src/locate/ink.ts): ink units, kept blocks and
// figure texts from A's glyphs no source unit owns, B's marks carried onto A.
import { read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import type { Doc } from '../src/doc.ts'
import type { PageInk } from '../src/ink.types.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { carry, spansOf } from '../src/locate/ink.ts'
import { locate } from '../src/locate/locate.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const text = (s: string) => ({ t: 'text' as const, s })
const unitOf = (kind: string, s: string): InstrumentUnit => {
  const content = [text(s)]
  return { id: unitId(kind, content), kind, content }
}
/** an instrument over B whose units own B's glyphs line by line (`own[p][line]`, -1 none) */
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][]): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[p]?.[g.n] ?? -1
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
/** A's pages as pageInk would give them (read.ts `raw`): its glyphs, boxes and their kinds */
const rawOf = (doc: Doc): PageInk[] =>
  doc.pages.map(
    (pg) =>
      ({
        glyphs: pg.glyphs.map((g) => ({ ...g })),
        boxes: pg.boxes,
        paths: pg.kinds,
        boxAt: pg.boxAt,
        points: [],
        paras: [],
        paraEnds: [],
        regions: [],
        turned: [],
        pictures: [],
        shapes: new Map(),
        figures: new Map(),
        unseen: new Set(),
        cut: new Map(),
        capped: false,
        timedOut: false,
        degraded: false,
        mergedAt: null,
        rotated: false,
      }) as unknown as PageInk,
  )
/** B and A of one page spec: B with the marks' points, A (arXiv's) with none */
function pair(spec: PageSpec): { B: Doc; A: Doc } {
  const { points: _, ...plain } = spec
  return { B: docOf([spec]), A: docOf([plain]) }
}

describe('locate: the units no source unit is, made on A by today’s rule', () => {
  it('makes a running head an ink unit of today’s id, its glyphs its own group', () => {
    // (the head shipped before the page's first mark, outside the column's body: today's ledger's `heads`)
    const { B, A } = pair({
      lines: ['Running Title', 'Body text here'],
      points: [
        ['bs1', 13],
        ['be1', 27],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Running Title')]
    expect(L.units.at(-1)).toEqual({ id: unitId('inkheads', content), kind: 'inkheads', content })
    const head = L.members.find((m) => m.kind === 'inkheads')!
    expect(head).toMatchObject({ located: true, unit: 1, place: 'same', fixed: false })
    expect(head.text).toEqual([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12])
    expect(L.groups[0]!.glyphs[0]).toBe(`${head.ord}.1.t`)
    expect(L.born.size).toBe(0)
    expect(L.stats.made).toMatchObject({ ink: 1, kept: 0, figures: 0 })
  })
  it('sets a running head in capitals in the text’s capitals, its source its own case (PR #620 review: "ABSTRACT" lost upper)', () => {
    const { B, A } = pair({
      lines: ['RUNNING TITLE', 'Body text here'],
      points: [
        ['bs1', 13],
        ['be1', 27],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.members.find((m) => m.kind === 'inkheads')!.style).toMatchObject({ upper: 1 })
    expect(L.members.find((m) => m.kind === 'para')!.style.upper).toBeUndefined()
  })

  it('makes a contents line an ink unit of its title alone, justified as today’s file sets a list', () => {
    // (the list's babel name ends before it: the contents' zone; its number, leaders and page number the original's ink)
    const { B, A } = pair({
      lines: ['1 Introduction . . . 3', 'Body text'],
      points: [
        ['bs1', 0],
        ['n0.contents.e', 0],
        ['be1', 31],
      ],
    })
    const ins = instrumentOf(B, [unitOf('para', 'Body text')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Introduction')]
    expect(L.units[1]).toEqual({ id: unitId('inkcontents', content), kind: 'inkcontents', content, align: 'j' })
    const entry = L.members.find((m) => m.kind === 'inkcontents')!
    expect(entry.text).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    // (what it leaves, the number, the leaders and the page number, is a kept block's or no unit's: never the entry's group)
    expect(L.groups[0]!.glyphs[0]).not.toBe(`${entry.ord}.1.t`)
    expect(L.groups[0]!.glyphs[21]).not.toBe(`${entry.ord}.1.t`)
  })

  it('states an ink unit’s placeholders after its first in that one’s ink: TeX’s nothing of their own, El.text empty', () => {
    // (no points tell an ink unit's placeholders apart: their glyphs are its first's (inkOf); one of no ink of its own read as not
    // found would leave every such line the original's (2307.16209v1's contents lines, three-state El, lave.md §2))
    const spec = { lines: ['Body text here', 'and then x plus y equals z for all of them'] }
    const B = docOf([
      {
        ...spec,
        points: [
          ['bs1', 0],
          ['0s', 0],
          ['0e', 12],
          ['be1', 46],
        ],
      },
    ])
    const A = docOf([spec])
    for (const D of [A, B])
      for (const g of D.pages[0]!.glyphs)
        if (g.n === 1 && /^[xyz]$/.test(g.u)) {
          g.font = 'ABCDEF+CMMI10'
          g.base = 'CMMI10'
        }
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[0]])
    const classesOf = (p: readonly { t: string }[]) =>
      p.flatMap((x, k) => (x.t === 'ph' ? [[String(k), { cls: 'other' }]] : []))
    const L = locate(ins, A, align(B, A), { pages: rawOf(A), classesOf: classesOf as never })
    const els = new Map(L.members.find((m) => m.kind === 'inkorphan')!.elements)
    expect(els.get('1')!.ink).toHaveLength(1)
    expect(els.get('1')!.text).toBeUndefined()
    expect(els.get('3')).toMatchObject({ ink: [], text: '' })
    expect(els.get('5')).toMatchObject({ ink: [], text: '' })
  })

  it('makes a figure’s text inside its form a figure text, where only A draws it', () => {
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'Loss', y: 640, form: true },
          { text: 'continues on its last line', y: 600 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const content = [text('Loss')]
    expect(L.units[1]).toMatchObject({
      id: unitId('inkfigures', content),
      kind: 'inkfigures',
      content,
      figure: { set: 0 },
    })
    const fig = L.members[1]!
    expect(fig).toMatchObject({ located: true, figure: true, fixed: false })
    // (where a translation of it may stand, as today's figure reading tells it, stated for S.figures: its origin and box along
    // its run, its anchor as its alignment, its room before and after as its side, its own text)
    const f = L.units[1]!.figure!
    expect(f.anchor).toBe('centre')
    expect(L.units[1]!.align).toBe('c')
    expect(f.y).toBe(640)
    expect([f.x, f.length, f.before, f.after].every((v) => typeof v === 'number' && Number.isFinite(v))).toBe(true)
    expect(fig.align).toBe('c')
    expect(fig.plain).toBe('Loss')
    const r2 = (v: number) => Math.round(v * 100) / 100
    expect(fig.room.side).toEqual([r2(f.x! - f.before!), r2(f.x! + f.length! + f.after!)])
    const at = 'a paragraph whose word'.length
    expect(fig.text).toEqual([at, at + 1, at + 2, at + 3])
    expect(L.figureGroups.has(`${fig.ord}.1.t`)).toBe(true)
    // (today's rule makes it: no unit is born of it)
    expect(L.born.size).toBe(0)
    expect(L.members[0]).toMatchObject({ located: true })
  })

  it('states a figure text’s style runs: a lead-in its glyphs set in its family’s bold a group, `must`, its style its glyphs’', () => {
    // (2608.25210v2 p2's "Data Extraction Task: Extract all …": the lead-in in HelveticaNeue-Bold, the rest in HelveticaNeue, one
    // run of today's figure reading (a family's faces); read as one style, the majority's, it was regular, the lead-in's weight
    // lost, with no run of the figure text's to carry it through a translation)
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'Task: list all the names', y: 640, form: true, font: 'ABCDEF+Helvetica' },
          { text: 'continues on its last line', y: 600 },
        ],
      },
    ])
    const at = 'a paragraph whose word'.length
    for (const g of A.pages[0]!.glyphs.slice(at, at + 4))
      Object.assign(g, { font: 'ABCDEF+Helvetica-Bold', base: 'Helvetica-Bold' })
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    // (the group the translator is given, a run-in label at the figure text's head before its colon: `must` by the run-in rule,
    // so that the markers wire brings its style back; no source, so neither `open` nor `close`)
    const content = [
      { t: 'span', id: '0', style: 'bold', must: 1, content: [text('Task')] },
      text(': list all the names'),
    ]
    expect(L.units[1]!.content).toEqual(content)
    expect(L.units[1]!.id).toBe(unitId('inkfigures', content as never))
    const fig = L.members[1]!
    // (its own style the majority's, regular; the run's its own glyphs', stated for the part's span)
    expect(fig.style).toMatchObject({ role: 'sans', design: 'Helvetica' })
    expect(fig.style.bold).toBeUndefined()
    expect(fig.spanStyles).toEqual([['0', { role: 'sans', size: 10, bold: 1, design: 'Helvetica-Bold' }]])
    expect(fig.plain).toBe('Task: list all the names')
    // (the part states the run's style as its span's: SpanAt.style)
    const addOn = {
      bytes: new Uint8Array([1, 2, 3]),
      pages: new Map([[1, { ok: true }]]),
      groups: new Set(L.groups[0]!.glyphs.filter((g): g is string => g !== null)),
      ocgs: new Map(),
      lost: new Set(),
      stats: {},
    } as unknown as AddOn
    const part = [
      ...bundle({
        ins,
        located: L,
        addOn,
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 'test',
      }),
    ].find((x) => x.kind === 'part')!
    const placed = read('part', part.bytes, part.digest)
      .flows.flat()
      .find((m) => m.kind === 'figure')!
    expect(placed.spans).toEqual([['0', { style: { role: 'sans', size: 10, bold: 1, design: 'Helvetica-Bold' } }]])
    expect(placed.plain).toBe('Task: list all the names')
  })

  it('makes no group of a figure text set in one face, and a group of each run its glyphs set apart from its own style', () => {
    const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
    const figureOf = (fonts: string[]) => {
      const A = docOf([
        {
          lines: [
            'a paragraph whose word',
            { text: 'Ab cd ef', y: 640, form: true, font: 'ABCDEF+Helvetica' },
            { text: 'continues on its last line', y: 600 },
          ],
        },
      ])
      const at = 'a paragraph whose word'.length
      A.pages[0]!.glyphs.slice(at, at + 8).forEach((g, j) => {
        const f = fonts[j] || 'Helvetica'
        Object.assign(g, { font: `ABCDEF+${f}`, base: f })
      })
      const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
      return { content: L.units[1]!.content, member: L.members[1]! }
    }
    // (one face: one text, today's unit and id)
    expect(figureOf([]).content).toEqual([text('Ab cd ef')])
    // (an oblique word inside it, a space either side its own style's: its group the word alone, `italic`, inside a sentence no
    // label, never `must`)
    const mid = figureOf(['', '', '', 'Helvetica-Oblique', 'Helvetica-Oblique'])
    expect(mid.content).toEqual([
      text('Ab '),
      { t: 'span', id: '1', style: 'italic', content: [text('cd')] },
      text(' ef'),
    ])
    expect(mid.member.spanStyles).toEqual([['1', expect.objectContaining({ slant: 1, design: 'Helvetica-Oblique' })]])
    // (most of it bold: its own style bold, its group the run set regular, `medium` (LaTeX's \textmd))
    const bold = 'Helvetica-Bold'
    const most = figureOf([bold, bold, bold, bold, bold, bold, 'Helvetica', 'Helvetica'])
    expect(most.member.style.bold).toBe(1)
    expect(most.content).toEqual([text('Ab cd '), { t: 'span', id: '1', style: 'medium', content: [text('ef')] }])
    expect(most.member.spanStyles).toEqual([['1', expect.not.objectContaining({ bold: 1 })]])
    // (as many glyphs either way: its own style the one its style's vote takes (styleOf, the first to the most), the other the
    // group's: the text outside its groups always in its own style)
    // ("Ab c" bold, "d ef" regular: three letters each, the bold first to three)
    const tie = figureOf([bold, bold, '', bold])
    expect(tie.member.style.bold).toBe(1)
    expect(tie.content).toEqual([text('Ab c'), { t: 'span', id: '1', style: 'medium', content: [text('d ef')] }])
  })

  it('echoes a heading a contents line repeats: the heading’s pieces, its index the echo', () => {
    const { B, A } = pair({
      lines: ['1 Method . . . 2', { text: 'Method', y: 600 }],
      points: [
        ['bs1', 0],
        ['n0.contents.e', 0],
        ['0s', 16],
        ['be1', 22],
      ],
    })
    const heading = unitOf('heading', 'Method')
    const ins = instrumentOf(B, [heading], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.units[1]).toMatchObject({ id: unitId('inkcontents', heading.content), content: heading.content, echo: 0 })
    // (its groups' commands and link targets the heading's, read from the source as the heading's are; no fill of the log's)
    const linked: InstrumentUnit = {
      ...heading,
      spans: [['0', { cmd: 'href', colour: 0xff, to: { url: 'https://example.org/' } }]],
    }
    const E = locate(instrumentOf(B, [linked], [[-1, 0]]), A, align(B, A), { pages: rawOf(A) })
    expect(E.units[1]!.spans).toEqual([['0', { cmd: 'href', to: { url: 'https://example.org/' } }]])
  })
  it('states an ink unit’s link groups’ targets from their opens, as the adapter states a source unit’s (linkTargetOf)', () => {
    expect(
      spansOf([
        { t: 'open', src: '\\href{https://example.org/a\\_b}{' },
        { t: 'text', s: 'x' },
        { t: 'close', src: '}' },
        { t: 'open', src: '\\hyperlink{intro}{' },
        { t: 'close', src: '}' },
        { t: 'open', src: '\\emph{' },
      ]),
    ).toEqual([
      ['0', { cmd: 'href', to: { url: 'https://example.org/a_b' } }],
      ['3', { cmd: 'hyperlink', to: { dest: '"intro"' } }],
      ['5', { cmd: 'emph' }],
    ])
  })

  it('leaves a unit made on A the original’s where A sets text inside it our compile does not: a content difference', () => {
    // (2610.21084v1's e-mail block: arXiv's page sets the initials our compile does not; the unit made on A is A's text, and it
    // stays the original's, as a source unit whose glyphs differ does: the coordinator's call of 2026-11-07)
    const B = docOf([
      {
        lines: ['Running Title', 'Body text here'],
        points: [
          ['bs1', 13],
          ['be1', 27],
        ],
      },
    ])
    const A = docOf([{ lines: ['Running XY Title', 'Body text here'] }])
    const ins = instrumentOf(B, [unitOf('para', 'Body text here')], [[-1, 0]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const head = L.members.find((m) => m.kind === 'inkheads')!
    expect(L.units[head.unit]!.id).toBe(unitId('inkheads', [text('Running XY Title')]))
    expect(head).toMatchObject({ located: false, cause: 'content difference: aonly' })
    // (its glyphs A's ink, in no group; no unit born of the initials)
    expect(L.groups[0]!.glyphs.slice(0, 16).every((g) => g === null)).toBe(true)
    expect(L.born.size).toBe(0)
  })

  it('flows a source unit on from the unit made on A that TeX set before it on its first line (a theorem head no unit owns)', () => {
    // (2608.25210v2 p4: amsthm's head "Definition 2. Minimal Provenance." no source unit owns, made on A an orphan, and the
    // theorem's text after it on the row: one flow, the theorem's join its separation from the head, as for two source units)
    const { B, A } = pair({
      lines: [
        'Body text here',
        { text: 'Definition 2.', x: 72, y: 688 },
        { text: 'A thing is so', x: 155, y: 688 },
        { text: 'and runs on', y: 676 },
      ],
      points: [
        ['bs1', 0],
        ['be1', 14 + 13 + 13 + 11],
      ],
    })
    const ins = instrumentOf(
      B,
      [unitOf('para', 'Body text here'), unitOf('theorem', 'A thing is so and runs on')],
      [[0, -1, 1, 1]],
    )
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const head = L.members.find((m) => m.kind === 'inkorphan')!
    expect(L.units[head.unit]!.content).toEqual([text('Definition 2.')])
    const thm = L.members[1]!
    expect(L.flows.find((f) => f.includes(thm.ord))).toEqual([head.ord, thm.ord])
    expect(thm.join).toEqual([155 - (72 + 13 * 6)])
    // (the flows in the members' order, each at its first member's: the source units' as before, the head's with its theorem's)
    expect(L.flows).toEqual([[0], [head.ord, thm.ord]])
  })
  it('flows no unit made on A into the next where a paragraph end of TeX’s stands between them, nor one on another row', () => {
    const spec = (y: number) => ({
      lines: [
        'Body text here',
        { text: 'Definition 2.', x: 72, y: 688 },
        { text: 'A thing is so', x: 155, y },
        { text: 'and runs on', y: y - 12 },
      ],
      points: [
        ['bs1', 0],
        ['be1', 14 + 13 + 13 + 11],
      ] as [string, number][],
    })
    const own = [[0, -1, 1, 1]]
    const units2 = [unitOf('para', 'Body text here'), unitOf('theorem', 'A thing is so and runs on')]
    const below = pair(spec(676))
    const L = locate(instrumentOf(below.B, units2, own), below.A, align(below.B, below.A), { pages: rawOf(below.A) })
    expect(L.members[1]!.join).toBeUndefined()
    expect(L.flows.find((f) => f.includes(1))).toEqual([1])
    const row = pair(spec(688))
    const ins2 = instrumentOf(row.B, units2, own)
    ins2.tex = { paragraphEnds: [[14 + 13]] }
    const E = locate(ins2, row.A, align(row.B, row.A), { pages: rawOf(row.A) })
    expect(E.members[1]!.join).toBeUndefined()
    expect(E.flows.find((f) => f.includes(1))).toEqual([1])
  })

  it('reads a glyph as an included figure’s where its partner on B is one, A’s form flattened', () => {
    const B = docOf([{ lines: ['a paragraph', { text: 'Loss', y: 640, form: true }] }])
    const A = docOf([{ lines: ['a paragraph', { text: 'Loss', y: 640 }] }])
    const ins = instrumentOf(B, [unitOf('para', 'a paragraph')], [[0, -1]])
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    expect(L.units[1]).toMatchObject({ kind: 'inkfigures', content: [text('Loss')] })
  })
})

describe('carry: B’s marks onto A’s stream', () => {
  it('stands a point before its glyph’s partner on A, A’s own glyphs before it counted', () => {
    const B = docOf([{ lines: ['abc def'], points: [['q1', 4]] }])
    const A = docOf([{ lines: ['xyz abc def'] }])
    B.pages[0]!.marks = { paras: [{ name: 'q1', glyph: 4, box: 0 }], paraEnds: [], regions: [], pictures: [] }
    const m = align(B, A)
    const pageA = new Int32Array(A.pages[0]!.glyphs.length).fill(1)
    const [c] = carry(B, A, m, pageA)
    expect(c!.points).toEqual([{ name: 'q1', glyph: 8, box: 0 }])
    expect(c!.paras).toEqual([{ name: 'q1', glyph: 8, box: 0 }])
  })

  it('keeps a picture’s end after the label it sets turned, its points at one glyph count (the label’s boxes its glyphs’)', () => {
    // (2610.21880v1 p5: a TikZ picture after the page's last level glyph holds an axis line and a y-axis title set turned; the
    // picture's two points stand at one glyph count, so its box count alone says which side of them the title stands. A turned
    // glyph's own box has no box partner on A, the alignment pairing the glyph instead: its partner's box is its box's)
    const docWith = (points: boolean): Doc => {
      const d = docOf([
        {
          lines: ['a caption'],
          boxes: [[9, 0, 50, 380, 52, 440]],
          ...(points
            ? {
                points: [
                  ['zs', 9],
                  ['ze', 9],
                ],
              }
            : {}),
        },
      ])
      const pg = d.pages[0]!
      for (let j = 0; j < 4; j++) {
        pg.boxes.push(40, 400 + 6 * j, 47, 406 + 6 * j)
        pg.kinds.push(-4)
      }
      pg.turned = [...'Loss'].map((u, j) => ({
        u,
        code: u.codePointAt(0) as number,
        base: 'CMR10',
        n: 1,
        k: j,
        at: 9,
        box: 1 + j,
        ox: 45,
        oy: 400 + 6 * j,
        ex: 45,
        ey: 406 + 6 * j,
        ux: 0,
        uy: 1,
        size: 10,
        ascent: 0.7,
        descent: -0.2,
        form: false,
      }))
      // (the picture opens before its axis and closes after its title: zs at no box yet, ze after the title's four)
      if (points)
        pg.marks = {
          paras: [],
          paraEnds: [],
          regions: [],
          pictures: [
            { name: 'zs', glyph: 9, box: 0 },
            { name: 'ze', glyph: 9, box: 5 },
          ],
        }
      return d
    }
    const B = docWith(true)
    const A = docWith(false)
    const m = align(B, A)
    const pageA = new Int32Array(A.pages[0]!.glyphs.length).fill(1)
    const [c] = carry(B, A, m, pageA)
    expect(c!.pictures).toEqual([
      { name: 'zs', glyph: 9, box: 0 },
      { name: 'ze', glyph: 9, box: 5 },
    ])
  })
})
