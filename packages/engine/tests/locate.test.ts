import { read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle, stateOf } from '../src/bundle/bundle.ts'
import type { Doc, DocTurned } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { eachBetweenPaired, locate } from '../src/locate/locate.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const text = (s: string) => ({ t: 'text' as const, s })
const r2 = (v: number) => Math.round(v * 100) / 100
const unitOf = (kind: string, s: string, more: Partial<InstrumentUnit> = {}): InstrumentUnit => {
  const content = [text(s)]
  return { id: unitId(kind, content), kind, content, ...more }
}

/** an instrument over B whose units own B's glyphs line by line: `own[p][line]` the unit of that line (-1 none) */
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][], roles: number[][] = []): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      // (docOf's glyph `n` is its line)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[p]?.[g.n] ?? -1
        O.role[j] = roles[p]?.[g.n] ?? ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}

const addOnOf = (located: ReturnType<typeof locate>, pages: number, refuse: number[] = []): AddOn => ({
  bytes: new Uint8Array([1, 2, 3]),
  pages: new Map(
    Array.from({ length: pages }, (_, i) => [
      i + 1,
      refuse.includes(i + 1) ? { ok: false, why: 'test' } : { ok: true },
    ]),
  ),
  groups: new Set(
    located.groups.flatMap((g, i) => (refuse.includes(i + 1) ? [] : g.glyphs.filter((x): x is string => x !== null))),
  ),
  ocgs: new Map(),
  lost: new Set(),
  stats: {} as AddOn['stats'],
})

describe('locate', () => {
  const pages: PageSpec[] = [{ lines: ['A first paragraph', 'that runs on'] }, { lines: ['a heading', 'second text'] }]
  const B = docOf(pages)
  const units = [
    unitOf('para', 'A first paragraph that runs on'),
    unitOf('heading', 'a heading'),
    unitOf('para', 'second text'),
  ]
  const ins = instrumentOf(B, units, [
    [0, 0],
    [1, 2],
  ])

  it('locates every unit whose glyphs all have partners, its lines read from A', () => {
    const A = docOf([
      {
        lines: [
          { text: 'A first paragraph', x: 80 },
          { text: 'that runs on', x: 80 },
        ],
      },
      pages[1]!,
    ])
    const L = locate(ins, A, align(B, A))
    expect(L.members.map((m) => m.located)).toEqual([true, true, true])
    expect(L.members[0]!.place).toBe('shifted')
    expect(L.members[1]!.place).toBe('same')
    expect(L.members[0]!.lines.map((l) => [l[0], l[2], l[4]])).toEqual([
      [1, 80, 700],
      [1, 80, 688],
    ])
    // (its groups, per member and page: what the wrap plans)
    expect(new Set(L.groups[0]!.glyphs)).toEqual(new Set(['0.1.t']))
    expect(new Set(L.groups[1]!.glyphs)).toEqual(new Set(['1.2.t', '2.2.t']))
  })
  it('leaves a unit not located where one of its glyphs has no partner, and says why', () => {
    const A = docOf([pages[0]!, { lines: ['a heading', 'second test'] }])
    const L = locate(ins, A, align(B, A))
    expect(L.members[2]).toMatchObject({ located: false, cause: 'content difference: char' })
    expect(L.members[0]!.located).toBe(true)
    expect(L.groups[1]!.glyphs.filter((g) => g?.startsWith('2.'))).toEqual([])
    expect(L.stats.unlocated).toEqual({ 'content difference: char': 1 })
    expect(L.born.size).toBe(0)
  })
  it('makes a unit of text B never printed, born on A', () => {
    const A = docOf([pages[0]!, pages[1]!, { lines: ['a supplement page', 'of its own'] }])
    const L = locate(ins, A, align(B, A))
    expect([...L.born.values()].map((b) => b.content)).toEqual([[text('a supplement page of its own')]])
    expect(L.members.at(-1)).toMatchObject({ kind: 'inkorphan', located: true, unit: -1 })
  })
  it('chains members that share a TeX line into one flow', () => {
    const B2 = docOf([{ lines: [{ text: 'Head.', x: 72 }, { text: 'Body runs on', x: 110, y: 700 }, 'and on'] }])
    const units2 = [unitOf('heading', 'Head.'), unitOf('para', 'Body runs on and on')]
    const L = locate(instrumentOf(B2, units2, [[0, 1, 1]]), B2, align(B2, B2))
    expect(L.flows).toEqual([[0, 1]])
    expect(L.members[1]!.join?.[0]).toBeCloseTo(110 - (72 + 5 * 6), 5)
  })
  it('chains a run-in head to its paragraph whose first line crosses the page middle, the head short at its left', () => {
    // (1706.03762v7 p10's "Acknowledgements We are grateful to …": a table's cells on both halves make the page read as two
    // columns, the head's line in the left half, its paragraph's first line over both; the columns as the names' binding
    // reads them, a line over both of either)
    const cells = ['WSJ only', 'semi', 'multi'].flatMap((t, k) => [
      { text: t, x: 120, y: 600 - 12 * k },
      { text: t, x: 400, y: 600 - 12 * k },
    ])
    const B2 = docOf([
      {
        lines: [
          { text: 'Acknowledgements', x: 108, y: 700 },
          { text: 'We are grateful to Nal Kalchbrenner and Stephan', x: 214, y: 700 },
          { text: 'Gouws for their fruitful comments and corrections and', x: 108, y: 688 },
          { text: 'inspiration.', x: 108, y: 676 },
          ...cells,
        ],
      },
    ])
    const units2 = [
      unitOf('heading', 'Acknowledgements'),
      unitOf(
        'para',
        'We are grateful to Nal Kalchbrenner and Stephan Gouws for their fruitful comments and corrections and inspiration.',
      ),
      ...cells.map((c, k) => unitOf('cell', `${c.text} ${k}`)),
    ]
    const own = [0, 1, 1, 1, ...cells.map((_, k) => 2 + k)]
    const L = locate(instrumentOf(B2, units2, [own]), B2, align(B2, B2))
    expect(L.members.slice(0, 2).map((m) => m.lines[0]![1])).toEqual([0, 2])
    expect(L.flows[0]).toEqual([0, 1])
    expect(L.members[1]!.join?.[0]).toBeCloseTo(214 - (108 + 16 * 6), 5)
  })
  it('keeps apart two members a tabular row sets side by side, one of them over the page middle (1706.03762v7 p1)', () => {
    // (the author block's three columns of names on one baseline, the middle one over the page's middle: no run-in head, two
    // boxes TeX set in one row, each its own flow)
    const cells = ['WSJ only', 'semi', 'multi'].flatMap((t, k) => [
      { text: t, x: 120, y: 600 - 12 * k },
      { text: t, x: 400, y: 600 - 12 * k },
    ])
    const B2 = docOf([
      {
        lines: [{ text: 'Ashish Vaswani', x: 120, y: 700 }, { text: 'Noam Shazeer', x: 280, y: 700 }, ...cells],
      },
    ])
    const units2 = [
      unitOf('author', 'Ashish Vaswani'),
      unitOf('author', 'Noam Shazeer'),
      ...cells.map((c, k) => unitOf('cell', `${c.text} ${k}`)),
    ]
    const L = locate(instrumentOf(B2, units2, [[0, 1, ...cells.map((_, k) => 2 + k)]]), B2, align(B2, B2))
    expect(L.members.slice(0, 2).map((m) => m.lines[0]![1])).toEqual([0, 2])
    expect(L.flows.slice(0, 2)).toEqual([[0], [1]])
  })
  it('states a shared row’s separation from the leader’s ink end, which S.rowStart lays the follower from (today’s file rows)', () => {
    // (2610.40645v1 p34: "Proof of Proposition 4.4." ends in a full stop whose ink ends 0.85 pt before its advance; the
    // follower is laid from the translation's ink end (S.share's ink), so the separation it keeps is from the original's ink
    // end: today's rows are their glyphs' ink (make.mjs rowsOf), its follower 4.49 pt after the head's drawn end, v2's 3.33)
    const B2 = docOf([
      { lines: [{ text: 'Head.', x: 72, y: 700 }, { text: 'Body runs on', x: 110, y: 700 }, 'and on'] },
    ])
    const stop = B2.pages[0]!.glyphs[4]!
    stop.ix0 = stop.x0 + 1
    stop.ix1 = stop.x1 - 0.85
    const units2 = [unitOf('heading', 'Head.'), unitOf('para', 'Body runs on and on')]
    const L = locate(instrumentOf(B2, units2, [[0, 1, 1]]), B2, align(B2, B2))
    expect(L.flows).toEqual([[0, 1]])
    expect(L.members[1]!.join).toEqual([r2(110 - (72 + 5 * 6 - 0.85))])
  })
  it('shares no line further apart than a shared line’s separation (today’s SHARED_SEP, 3 em): boxes set side by side', () => {
    // (1706.03762v7 p4: two minipages' titles on one baseline 97 pt apart; 2608.06701v1 p6: a run-in head and a paragraph
    // whose text starts 39.77 pt after it, its own label between, 4 em of its 9.96 pt; a running head's title and folio)
    const at = (x: number) => {
      const B2 = docOf([{ lines: [{ text: 'Head.', x: 72, y: 700 }, { text: 'Body runs on', x, y: 700 }, 'and on'] }])
      const units2 = [unitOf('heading', 'Head.'), unitOf('para', 'Body runs on and on')]
      return locate(instrumentOf(B2, units2, [[0, 1, 1]]), B2, align(B2, B2))
    }
    // (the head ends at 72 + 5 glyphs of 6 pt: 102)
    expect(at(102 + 30).flows).toEqual([[0, 1]])
    expect(at(102 + 30).members[1]!.join).toEqual([30])
    expect(at(102 + 31).flows).toEqual([[0], [1]])
    expect(at(102 + 31).members[1]!.join).toBeUndefined()
    // (the separation the bound reads is the one the join states, from the leader's ink end: today's rows are ink, 2307.16209v1's
    // contents entries 36.18-36.78 pt after their numbers' ink at 11.96 pt type, no shared line of today's)
    const B2 = docOf([
      { lines: [{ text: 'Head.', x: 72, y: 700 }, { text: 'Body runs on', x: 132, y: 700 }, 'and on'] },
    ])
    const stop = B2.pages[0]!.glyphs[4]!
    stop.ix1 = stop.x1 - 0.85
    const units2 = [unitOf('heading', 'Head.'), unitOf('para', 'Body runs on and on')]
    expect(locate(instrumentOf(B2, units2, [[0, 1, 1]]), B2, align(B2, B2)).flows).toEqual([[0], [1]])
  })
  it('chains a member on another’s line only within 3 em of its end (today’s rowLeadOf, SHARED_SEP)', () => {
    // (2609.36054v2 p1: the footer "page 1 of 14" set on the baseline of a footnote's last line, 38.85 pt (4.3 em at 8.97)
    // after its end: chained, it was laid on after the footnote's translation, 333.89 pt off its place. Today's rowLeadOf took a
    // unit's first row for another's continued only where it starts within SHARED_SEP, 3 em, of that one's end)
    const flowsAt = (x: number) => {
      const B2 = docOf([
        {
          lines: [
            { text: 'First ends.', x: 72, y: 700 },
            { text: 'page 1', x, y: 700 },
          ],
        },
      ])
      const units2 = [unitOf('para', 'First ends.'), unitOf('para', 'page 1')]
      return locate(instrumentOf(B2, units2, [[0, 1]]), B2, align(B2, B2)).flows
    }
    // ("First ends." ends at 138; 3 em at its size 10 is 30)
    expect(flowsAt(138 + 29)).toEqual([[0, 1]])
    expect(flowsAt(138 + 31)).toEqual([[0], [1]])
  })
  it('states a shared row kept where a character of the page stays on it between the two (today’s keptBetween)', () => {
    // (2608.25210v2 p17's notes made on A: "… Mao." ends one, "2024" (no unit's) stays, ". Be…" begins the next on the row; the
    // follower is not laid from the first's end, which today kept (S.rowStart not applied, its share kept). Nothing between: not)
    const lines = (between: boolean) => [
      { text: 'First ends.', x: 72, y: 700 },
      ...(between ? [{ text: '2024', x: 140, y: 700 }] : []),
      // (within 3 em of the first's end, as a row today's rowLeadOf continued: SHARED_SEP)
      { text: 'Next runs on', x: 166, y: 700 },
      { text: 'and on', x: 72, y: 688 },
    ]
    const units2 = [unitOf('para', 'First ends.'), unitOf('para', 'Next runs on and on')]
    const kept = docOf([{ lines: lines(true) }])
    const L = locate(instrumentOf(kept, units2, [[0, -1, 1, 1]]), kept, align(kept, kept))
    expect(L.flows).toEqual([[0, 1]])
    expect(L.members[1]!.join).toEqual([r2(166 - (72 + 11 * 6)), 1])
    const free = docOf([{ lines: lines(false) }])
    const F = locate(instrumentOf(free, units2, [[0, 1, 1]]), free, align(free, free))
    expect(F.members[1]!.join).toEqual([r2(166 - (72 + 11 * 6))])
  })
  it('states the line of its own a label stands on: a raised mark on the row it shares with the member before (Label.line)', () => {
    // (2608.06701v1 p5 t76: footnote 3's mark set raised before its text, on the row footnote 2 ends on: by El.ink's rule (the
    // line whose band its ink meets, the nearest by baseline) it stands on its first line, the shared row)
    const B2 = docOf([
      {
        lines: [
          { text: 'note two ends', y: 700 },
          { text: '3', x: 152, y: 702.8, size: 6 },
          { text: 'note three', x: 158, y: 700 },
          { text: 'runs on below', y: 688 },
          { text: 'x', x: 72, y: 640, size: 6 },
        ],
      },
    ])
    const units2 = [unitOf('footnote', 'note two ends'), unitOf('footnote', 'note three runs on below')]
    const L = locate(
      instrumentOf(B2, units2, [[0, 1, 1, 1, -1]], [[ROLE.text, ROLE.label, ROLE.text, ROLE.text, ROLE.text]]),
      B2,
      align(B2, B2),
    )
    const three = L.members[1]!
    expect(three.lines.map((l) => l[4])).toEqual([700, 688])
    expect(three.labelAt?.ink[5]).toBe(702.8)
    expect(three.labelAt?.line).toBe(0)
  })
  it('chains a footnote to the footnote before it on its row, a body paragraph between them in the stream (footmisc’s para)', () => {
    // (2608.06701v1 p5: footnote 1 is set inside paragraph 72, footnote 2 inside paragraph 74; footmisc's para sets the page's
    // footnotes as one paragraph in the footnote insert, the second on the first's row. B ships the body, then the notes)
    const lines = [
      { text: 'first paragraph', x: 72, y: 700 },
      { text: 'second paragraph', x: 72, y: 688 },
      { text: 'note one', x: 72, y: 100 },
      { text: 'note two', x: 132, y: 100 },
    ]
    const B2 = docOf([{ lines }])
    const units2 = [
      unitOf('para', 'first paragraph'),
      unitOf('footnote', 'note one'),
      unitOf('para', 'second paragraph'),
      unitOf('footnote', 'note two'),
    ]
    const ins2 = instrumentOf(B2, units2, [[0, 2, 1, 3]])
    const L = locate(ins2, B2, align(B2, B2))
    expect(L.flows).toEqual([[0], [1, 3], [2]])
    expect(L.members[3]!.join).toEqual([132 - (72 + 8 * 6)])
    // (footnotes each a paragraph of their own: the first's end between them, apart)
    ins2.tex = { paragraphEnds: [[15 + 16 + 8]] }
    expect(locate(ins2, B2, align(B2, B2)).flows).toEqual([[0], [1], [2], [3]])
  })
  it('chains a run-in head to its paragraph across a float and a footnote the stream sets between them', () => {
    // (2608.06701v1 p6: the head, then a table's caption and a footnote, each a paragraph of its own inside its insert, then the
    // head's paragraph on its row)
    const lines = [
      { text: 'Head.', x: 72, y: 700 },
      { text: 'Table 1: a caption', x: 72, y: 500 },
      { text: 'a note', x: 72, y: 80 },
      { text: 'Body runs on', x: 110, y: 700 },
      { text: 'and on', x: 72, y: 688 },
    ]
    const B2 = docOf([{ lines }])
    const units2 = [
      unitOf('heading', 'Head.'),
      unitOf('caption', 'Table 1: a caption'),
      unitOf('footnote', 'a note'),
      unitOf('para', 'Body runs on and on'),
    ]
    const ins2 = instrumentOf(B2, units2, [[0, 1, 2, 3, 3]])
    // (the caption's and the footnote's own paragraph ends, after their last glyphs)
    ins2.tex = { paragraphEnds: [[5 + 18, 5 + 18 + 6]] }
    const L = locate(ins2, B2, align(B2, B2))
    expect(L.flows).toEqual([[0, 3], [1], [2]])
    expect(L.members[3]!.join?.[0]).toBeCloseTo(110 - (72 + 5 * 6), 5)
    // (a paragraph end of the head's own, before the float: the head ends its paragraph, and the two are not one)
    ins2.tex = { paragraphEnds: [[5, 5 + 18, 5 + 18 + 6]] }
    expect(locate(ins2, B2, align(B2, B2)).flows).toEqual([[0], [1], [2], [3]])
  })
})

describe('locate: a line’s measure is TeX’s text frame (Instrument.tex.frames), never a hull of the page’s ink', () => {
  // (a title page: too few paragraph lines for a column of them, and arXiv's stamp, ink no compile of the source sets, turned up
  // the left margin at x 24: today's hull of the page's members took it in, 2610.40645v1 p1 and 2610.10069v1 p1)
  const withFrames = (ins: Instrument, frames: NonNullable<Instrument['tex']['frames']>): Instrument => ({
    ...ins,
    tex: { ...ins.tex, frames },
  })
  const stamp = { text: 'arXiv:2610.00000v1', x: 24, y: 400 }
  it('measures a one-column page’s line by the text block and reads a name centred on the block’s middle', () => {
    const lines = [
      { text: 'Abstract', x: 282, y: 690 },
      { text: 'x'.repeat(78), x: 72, y: 650 },
      { text: 'a shorter last line.', x: 72, y: 638 },
    ]
    const B = docOf([{ lines }])
    const units = [unitOf('heading', 'Abstract'), unitOf('para', `${'x'.repeat(78)} a shorter last line.`)]
    const ins = withFrames(instrumentOf(B, units, [[0, 1, 1]]), [{ block: [72, 540], columns: [[72, 540]] }])
    const A = docOf([{ lines: [...lines, stamp] }])
    const L = locate(ins, A, align(B, A))
    expect(L.members[0]!.lines[0]!.slice(7, 9)).toEqual([72, 540])
    expect(L.members[0]!.align).toBe('c')
    // (TeX's, no longer read off A)
    expect(L.members[0]!.read).not.toContain('measure')
    expect(locate(instrumentOf(B, units, [[0, 1, 1]]), A, align(B, A)).members[0]!.read).toContain('measure')
    expect(L.members[1]!.lines.map((l) => l.slice(7, 9))).toEqual([
      [72, 540],
      [72, 540],
    ])
    // (A set 8 pt to the right of B, every partner moved alike: TeX's frame moved with them)
    const A8 = docOf([{ lines: [...lines.map((l) => ({ ...l, x: l.x + 8 })), stamp] }])
    const L8 = locate(ins, A8, align(B, A8))
    expect(L8.members[0]!.lines[0]!.slice(7, 9)).toEqual([80, 548])
    expect(L8.members[0]!.align).toBe('c')
    // (lines TeX set apart on A, each its own way, no shift most of the page's partners share (2610.19274v1 p67, a list of
    // figures: a median of 1.9 pt moved the frame that far): the frame where TeX put it)
    const three = [
      { text: 'Abstract', x: 282, y: 690 },
      { text: 'a'.repeat(30), x: 72, y: 650 },
      { text: 'b'.repeat(30), x: 72, y: 638 },
      { text: 'c'.repeat(30), x: 72, y: 626 },
    ]
    const B3 = docOf([{ lines: three }])
    const units3 = [
      unitOf('heading', 'Abstract'),
      unitOf('para', `${'a'.repeat(30)} ${'b'.repeat(30)} ${'c'.repeat(30)}`),
    ]
    const ins3 = withFrames(instrumentOf(B3, units3, [[0, 1, 1, 1]]), [{ block: [72, 540], columns: [[72, 540]] }])
    const A3 = docOf([{ lines: [three[0]!, three[1]!, { ...three[2]!, x: 75 }, { ...three[3]!, x: 77 }, stamp] }])
    expect(locate(ins3, A3, align(B3, A3)).members[0]!.lines[0]!.slice(7, 9)).toEqual([72, 540])
  })
  it('measures a two-column page’s line by its column, never past it into the gutter', () => {
    // (2610.22065v1 p1: the ACM reference format's line ends at its column's edge; its measure ran to the right column's end)
    const lines = [
      { text: 'L'.repeat(40), x: 54, y: 600 },
      { text: 'left last.', x: 54, y: 588 },
      { text: 'R'.repeat(40), x: 318, y: 600 },
      { text: 'right last.', x: 318, y: 588 },
    ]
    const B = docOf([{ lines }])
    const units = [unitOf('para', `${'L'.repeat(40)} left last.`), unitOf('para', `${'R'.repeat(40)} right last.`)]
    const frame = {
      block: [54, 558] as [number, number],
      columns: [
        [54, 294],
        [318, 558],
      ] as [number, number][],
    }
    const ins = withFrames(instrumentOf(B, units, [[0, 0, 1, 1]]), [frame])
    const A = docOf([{ lines: [...lines, stamp] }])
    const L = locate(ins, A, align(B, A))
    expect(L.members[0]!.lines.map((l) => l.slice(7, 9))).toEqual([
      [54, 294],
      [54, 294],
    ])
    expect(L.members[1]!.lines.map((l) => l.slice(7, 9))).toEqual([
      [318, 558],
      [318, 558],
    ])
  })
})

describe('locate: a line’s writing direction (LINE_FLAG.RTL)', () => {
  it('flags the lines of a unit whose paragraph runs right to left, its first strong letter’s (UAX #9 P2-P3)', () => {
    const B = docOf([{ lines: ['abc', 'def', '(1) xyz'] }])
    const units = [
      unitOf('para', 'שלום עולם'),
      {
        ...unitOf('para', 'x'),
        content: [
          { t: 'text' as const, s: '(1) ' },
          { t: 'text' as const, s: 'مرحبا' },
        ],
      },
      unitOf('para', '(1) xyz'),
    ]
    const L = locate(instrumentOf(B, units, [[0, 1, 2]]), B, align(B, B))
    expect(L.members.map((m) => m.lines.map((l) => l[9] & 8))).toEqual([[8], [8], [0]])
  })
})

describe('locate: a single line’s alignment is its TeX line’s, the row it shares read whole', () => {
  it('reads a run-in theorem head justified whose fragment’s middle is the column’s, its label and text on its row', () => {
    // (2610.30034v1 p5: "Lemma 3 (Bellman-objective decomposition): Let …", the note's middle at the column's by the note's
    // length; between full justified lines its own extent's stack read it centred, and its translation was set from the
    // fragment's middle, 36 pt into the column. Its row, label to text, is a justified line)
    const note = 'n'.repeat(60)
    const lines = [
      { text: 'x'.repeat(78), x: 72, y: 700 },
      { text: 'Lemma 3 (', x: 72, y: 688 },
      { text: note, x: 126, y: 688 },
      { text: 'Let A be', x: 492, y: 688 },
      { text: 'y'.repeat(78), x: 72, y: 676 },
    ]
    const B = docOf([{ lines }])
    const units = [
      unitOf('para', 'x'.repeat(78)),
      unitOf('heading', note),
      unitOf('para', `Let A be ${'y'.repeat(78)}`),
    ]
    const ins = instrumentOf(B, units, [[0, 1, 1, 2, 2]], [[ROLE.text, ROLE.label, ROLE.text, ROLE.text, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    expect(L.members[1]!.labelAt?.ink[1]).toBe(72)
    expect(L.flows).toContainEqual([1, 2])
    expect(L.members[1]!.align).toBe('j')
  })
  it('keeps a line its block centres where it stands alone on its row', () => {
    // (an author block's name, place and e-mail, each centred under the one over it: 2303.11366v4 p1)
    const lines = [
      { text: 'Ada Lovelace', x: 270, y: 700 },
      { text: 'Institute of Technology', x: 237, y: 688 },
      { text: 'ada@example.org', x: 261, y: 676 },
    ]
    const B = docOf([{ lines }])
    const units = [
      unitOf('author', 'Ada Lovelace'),
      unitOf('author', 'Institute of Technology'),
      unitOf('author', 'ada@example.org'),
    ]
    const L = locate(instrumentOf(B, units, [[0, 1, 2]]), B, align(B, B))
    expect(L.members.map((m) => m.align)).toEqual(['c', 'c', 'c'])
  })
})

describe('locate: the glyphs of A with no partner on B inside a unit', () => {
  const B = docOf([{ lines: ['a paragraph whose word', 'continues on its last line'] }])
  const ins = instrumentOf(B, [unitOf('para', 'a paragraph whose word continues on its last line')], [[0, 0]])
  it('claims a line-end hyphen arXiv sets where our compile does not break the word', () => {
    const A = docOf([{ lines: ['a paragraph whose word con-', 'tinues on its last line'] }])
    const L = locate(ins, A, align(B, A))
    const hyphen = 'a paragraph whose word con'.length
    expect(L.members[0]).toMatchObject({ located: true })
    expect(L.members[0]!.text).toContain(hyphen)
    expect(L.groups[0]!.glyphs[hyphen]).toBe('0.1.t')
    expect(L.born.size).toBe(0)
  })
  it('leaves an included figure that only A draws between two lines of a unit to the figure, not to the unit', () => {
    // (a float set "here" inside a paragraph: TeX puts it after the current line, and where B is a draft, its figure's own
    // glyphs are A's alone)
    const A = docOf([
      {
        lines: [
          'a paragraph whose word',
          { text: 'Loss', y: 640, form: true },
          { text: 'continues on its last line', y: 600 },
        ],
      },
    ])
    const L = locate(ins, A, align(B, A))
    const fig = ['a paragraph whose word'.length, 'a paragraph whose word'.length + 3]
    expect(L.members[0]).toMatchObject({ located: true })
    expect(L.members[0]!.text).not.toContain(fig[0])
    expect(L.groups[0]!.glyphs[fig[0]!]).not.toBe('0.1.t')
    expect([...L.born.values()]).toEqual([{ kind: 'inkfigures', content: [text('Loss')] }])
  })
  it('leaves a unit the original’s where A sets text inside it that our compile does not', () => {
    const A = docOf([{ lines: ['a paragraph whose (X) word', 'continues on its last line'] }])
    const L = locate(ins, A, align(B, A))
    expect(L.members[0]).toMatchObject({ located: false, cause: 'content difference: aonly' })
    expect(L.groups[0]!.glyphs.every((g) => g === null || !g.startsWith('0.'))).toBe(true)
    // (its A-only glyphs stay A's ink inside it: no unit is born of them)
    expect(L.born.size).toBe(0)
  })
  it('reads a run of A-only glyphs once, not once for each glyph of it (PR #620 review: a scan quadratic in the run)', () => {
    // (each glyph of a run of k A-only glyphs looked for its paired neighbours by walking the run: k² reads of the mapping)
    // (30 lines of 50 inside it: a line of 1,500 would run off the page, whose glyphs no unit claims)
    const A = docOf([
      {
        lines: [
          'a paragraph whose',
          ...Array.from({ length: 30 }, () => 'x'.repeat(50)),
          'word continues on its last line',
        ],
      },
    ])
    const m = align(B, A)
    let reads = 0
    const counted = <T extends Int32Array>(arr: T): T =>
      new Proxy(arr, {
        get(t, p) {
          if (typeof p === 'string' && /^\d+$/.test(p)) reads++
          const v = Reflect.get(t, p, t)
          return typeof v === 'function' ? v.bind(t) : v
        },
      })
    const L = locate(ins, A, { ...m, aToB: counted(m.aToB), bToA: counted(m.bToA) })
    expect(L.members[0]).toMatchObject({ located: false, cause: expect.stringMatching(/^content difference: /) })
    const glyphs = A.pages[0]!.glyphs.length + B.pages[0]!.glyphs.length
    expect(reads).toBeLessThan(20 * glyphs)
  })
})

describe('a babel name’s counter', () => {
  it('states the counter TeX set after a name that leads no unit (Word.counter), its own text the word alone', () => {
    // (IEEEtran's "APPENDIX A" over its title: the wrap gives the counter the name's group (own.mjs); the part stated the name's
    // text "APPENDIX A" and no counter, so S.names drew "ANHANG" over both and the counter was erased)
    const B = docOf([
      {
        lines: ['APPENDIX A', 'Body text here'],
        points: [
          ['n1.appendix.s', 0],
          ['n1.appendix.e', 8],
        ],
      },
    ])
    const units = [unitOf('para', 'Body text here'), { ...unitOf('name', 'Appendix'), name: 'appendix' }]
    const ins = instrumentOf(B, units, [[1, 0]], [[ROLE.name, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const o = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 'test',
      }),
    ].find((x) => x.kind === 'part')!
    const name = read('part', o.bytes, o.digest)
      .flows.flat()
      .find((m) => m.kind === 'name')!
    expect(name.plain).toBe('APPENDIX')
    expect(name.text).toEqual({ name: 'appendix', counter: ['A', [1, 126, 698, 132, 707, 700]] })
  })
})

describe('a babel name that leads a unit (today’s RUN_IN, make.mjs leadAt)', () => {
  const partOf = (ins: Instrument, L: ReturnType<typeof locate>) => {
    const o = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 'test',
      }),
    ].find((x) => x.kind === 'part')!
    return read('part', o.bytes, o.digest)
  }
  it('states the paper’s title and its front matter on the part, from the source’s units', () => {
    // (2303.11366v4 p1's title, a heading-kind unit: the typesetter keeps it at its top, where a section heading set in
    // fewer lines stands on its last lines, X.lastLines)
    const B2 = docOf([{ lines: ['Reflexion: Language Agents', 'Noah Shinn', '1 Introduction'] }])
    const units2 = [
      { ...unitOf('heading', 'Reflexion: Language Agents'), title: true as const, front: true as const },
      { ...unitOf('author', 'Noah Shinn'), front: true as const },
      unitOf('heading', '1 Introduction'),
    ]
    const ins2 = instrumentOf(B2, units2, [[0, 1, 2]])
    const flat = partOf(ins2, locate(ins2, B2, align(B2, B2))).flows.flat()
    expect(flat.map((m) => [m.title ?? 0, m.front ?? 0])).toEqual([
      [1, 1],
      [0, 1],
      [0, 0],
    ])
  })
  it('states the unit a name TeX set right before on its line leads: the name bound, before it in its flow', () => {
    // (amsthm's "Proof." on its paragraph's first row: the name, the paragraph's label "." (the joint), its text; the part stated
    // no relation, so the entry read one off any member to the right on the baseline)
    const B = docOf([
      {
        lines: [
          { text: 'Proof', y: 700 },
          { text: '.', x: 102, y: 700 },
          { text: 'The claim holds', x: 112, y: 700 },
          { text: 'on the next line', y: 688 },
        ],
      },
    ])
    const units = [
      unitOf('theorem', '. The claim holds on the next line'),
      { ...unitOf('name', 'Proof'), name: 'proof' },
    ]
    const ins = instrumentOf(B, units, [[1, 0, 0, 0]], [[ROLE.name, ROLE.label, ROLE.text, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const name = L.members.find((m) => m.kind === 'name')!
    const para = L.members.find((m) => m.kind === 'theorem')!
    expect(L.flows.find((f) => f.includes(para.ord))).toEqual([name.ord, para.ord])
    const flow = partOf(ins, L).flows.find((f) => f.some((m) => m.ord === para.ord))!
    expect(flow.map((m) => [m.kind, m.bound ?? 0])).toEqual([
      ['name', 1],
      ['theorem', 0],
    ])
    // (TeX's separation from the name to its text, the joint standing between: kept)
    expect(flow[1]!.join).toEqual([10, 1])
    // (the name's glyphs its lead's, not ink beside its first line: no PINNED by them, its room beside not stopped at them)
    expect(flow[1]!.lines[0]![9] & 2).toBe(0)
    expect(flow[1]!.room.side?.[0] ?? 0).toBeLessThan(72.01)
  })
  it('binds a name that shares its line with another name, the other kept in its own flow (Devin on #624)', () => {
    // (two names on one line, "Appendix" and "Proof", the second leading its theorem: binding it spliced out the whole flow
    // it was in, and the first was in no flow of the part. Every member stands in one flow, once)
    const B = docOf([
      {
        lines: [
          { text: 'Appendix', y: 700 },
          { text: 'Proof', x: 126, y: 700 },
          { text: '.', x: 156, y: 700 },
          { text: 'The claim holds', x: 166, y: 700 },
          { text: 'on the next line', y: 688 },
        ],
      },
    ])
    const units = [
      { ...unitOf('name', 'Appendix'), name: 'appendix' },
      { ...unitOf('name', 'Proof'), name: 'proof' },
      unitOf('theorem', '. The claim holds on the next line'),
    ]
    const ins = instrumentOf(B, units, [[0, 1, 2, 2, 2]], [[ROLE.name, ROLE.name, ROLE.label, ROLE.text, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const proof = L.members.find((m) => m.kind === 'name' && m.name === 'proof')!
    const appendix = L.members.find((m) => m.kind === 'name' && m.name === 'appendix')!
    const para = L.members.find((m) => m.kind === 'theorem')!
    const all = L.flows.flat()
    expect(all.filter((o) => o === appendix.ord).length).toBe(1)
    expect(all.filter((o) => o === proof.ord).length).toBe(1)
    expect(all.length).toBe(new Set(all).size)
    const flow = L.flows.find((f) => f.includes(para.ord))!
    expect(flow.slice(flow.indexOf(proof.ord))).toEqual([proof.ord, para.ord])
    // (no size tie names a member twice, nor the bound name with the members it left)
    for (const t of L.ties) if (t.rule === 'size') expect(t.ords.length).toBe(new Set(t.ords).size)
    expect(
      partOf(ins, L)
        .flows.flat()
        .map((m) => m.ord)
        .sort(),
    ).toEqual(L.members.map((m) => m.ord).sort())
  })
  it('leads no unit across the columns: a name whose next glyph in the stream is its column’s next line', () => {
    // (Devin on #623: a left column's "Abstract" at 72-120 and the right column's paragraph on its baseline, 700: the entry took
    // the right column for the name's run-in follower and left the name the original's)
    const B = docOf([
      {
        lines: [
          { text: 'Abstract', y: 700 },
          { text: 'The abstract text', y: 688 },
          { text: 'A right column paragraph', x: 320, y: 700 },
        ],
      },
    ])
    const units = [
      unitOf('abstract', 'The abstract text'),
      unitOf('para', 'A right column paragraph'),
      { ...unitOf('name', 'Abstract'), name: 'abstract' },
    ]
    const ins = instrumentOf(B, units, [[2, 0, 1]], [[ROLE.name, ROLE.text, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const name = L.members.find((m) => m.kind === 'name')!
    expect(L.flows.find((f) => f.includes(name.ord))).toEqual([name.ord])
    expect(
      partOf(ins, L)
        .flows.flat()
        .find((m) => m.kind === 'name')!.bound,
    ).toBeUndefined()
  })
  it('leads no unit in the other column, even on the name’s baseline: a left column’s last line and the right column’s first', () => {
    // (local Codex on #624: a name at the left column's end, y 700, and the right column's first unit on that baseline, next in
    // TeX's stream; same page, same baseline, to the right: bound across the columns before)
    const B = docOf([
      {
        lines: [
          { text: 'Left one', y: 724 },
          { text: 'Left two', y: 712 },
          { text: 'Abstract', y: 700 },
          { text: 'Right one', x: 320, y: 700 },
          { text: 'Right two', x: 320, y: 688 },
          { text: 'Right three', x: 320, y: 676 },
        ],
      },
    ])
    const units = [
      unitOf('para', 'Left one Left two'),
      unitOf('para', 'Right one Right two Right three'),
      { ...unitOf('name', 'Abstract'), name: 'abstract' },
    ]
    const ins = instrumentOf(
      B,
      units,
      [[0, 0, 2, 1, 1, 1]],
      [[ROLE.text, ROLE.text, ROLE.name, ROLE.text, ROLE.text, ROLE.text]],
    )
    const L = locate(ins, B, align(B, B))
    const name = L.members.find((m) => m.kind === 'name')!
    expect(L.flows.find((f) => f.includes(name.ord))).toEqual([name.ord])
  })
})

describe('eachBetweenPaired', () => {
  // (the walk of a unit made on A's glyphs for those B never printed between two it did: each looked for its paired neighbours by
  // walking its run back and forth, k² reads in a run of k; the sixth owner's finding after PR #620's, the class of its finding 1)
  const naive = (paired: boolean[]) => {
    const out: [number, number, number][] = []
    for (let i = 0; i < paired.length; i++) {
      if (paired[i]) continue
      const pv = paired.lastIndexOf(true, i)
      const nx = paired.indexOf(true, i)
      if (pv >= 0 && nx >= 0) out.push([i, pv, nx])
    }
    return out
  }
  const walk = (paired: boolean[], lo = 0, hi = paired.length - 1) => {
    let reads = 0
    const out: [number, number, number][] = []
    eachBetweenPaired(
      lo,
      hi,
      (i) => {
        reads++
        return paired[i] === true
      },
      (i, pv, nx) => out.push([i, pv, nx]),
    )
    return { out, reads }
  }
  it('gives each unpaired index between two paired ones with the two, none before the first or after the last', () => {
    const p = [false, true, false, false, true, true, false, true, false]
    expect(walk(p).out).toEqual([
      [2, 1, 4],
      [3, 1, 4],
      [6, 5, 7],
    ])
    expect(walk([false, false]).out).toEqual([])
    expect(walk([]).out).toEqual([])
    let seed = 7
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    for (let t = 0; t < 200; t++) {
      const q = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => rnd() < 0.4)
      expect(walk(q).out).toEqual(naive(q))
    }
  })
  it('reads each index a bounded number of times: linear in a run of unpaired ones', () => {
    const k = 5000
    const p = [true, ...Array.from({ length: k }, () => false), true]
    const { out, reads } = walk(p)
    expect(out.length).toBe(k)
    expect(reads).toBeLessThan(3 * p.length)
  })
})

describe('a babel name’s text', () => {
  it('states a name’s own text on A (Placed.plain), so that S.names tells a target word the original’s already', () => {
    // (S.names leaves a name the original's where the target's word is its own text (today's nameInTarget over its characters);
    // the part stated its Word alone)
    const B = docOf([{ lines: ['Abstract', 'Body text here'] }])
    const units = [{ ...unitOf('name', 'Abstract'), name: 'abstract' }, unitOf('para', 'Body text here')]
    const ins = instrumentOf(B, units, [[0, 1]], [[ROLE.name, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    expect(L.members.find((m) => m.kind === 'name')).toMatchObject({ name: 'abstract', plain: 'Abstract' })
    const objects = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 'test',
      }),
    ]
    const o = objects.find((x) => x.kind === 'part')!
    const part = read('part', o.bytes, o.digest)
    expect(part.flows.flat().find((m) => m.kind === 'name')).toMatchObject({
      text: { name: 'abstract' },
      plain: 'Abstract',
    })
  })
})

describe('bundle', () => {
  const B = docOf([
    { lines: ['page one text', 'runs on'] },
    { lines: ['to page two', 'then more'] },
    { lines: ['page three'] },
  ])
  const units = [
    unitOf('para', 'page one text runs on to page two'),
    unitOf('para', 'then more'),
    unitOf('para', 'page three'),
  ]
  const ins = instrumentOf(B, units, [[0, 0], [0, 1], [2]])
  const L = locate(ins, B, align(B, B))
  const original = new Uint8Array(70000).map((_, i) => i & 255)
  const objects = [
    ...bundle({
      ins,
      located: L,
      addOn: addOnOf(L, 3),
      original,
      paper: { id: '2501.00001', version: 1, pages: 3 },
      made: 'test',
    }),
  ]

  it('writes units first, a part a page that lays, the add-on, and the head last, each read back by its digest', () => {
    expect(objects.map((o) => o.kind)).toEqual(['units', 'part', 'part', 'part', 'addon', 'head'])
    for (const o of objects)
      if (o.kind !== 'addon') expect(() => read(o.kind === 'units' ? 'units' : o.kind, o.bytes, o.digest)).not.toThrow()
    const head = objects.at(-1) as Extract<(typeof objects)[number], { kind: 'head' }>
    expect(head.head.parts.filter(Boolean)).toHaveLength(3)
    expect(head.head.original).toMatchObject({ bytes: 70000, chunk: 65536 })
    expect(head.head.original.chunks).toHaveLength(44)
  })
  it('gives a part the annotations of its members on their other pages, with their page (#626 review)', () => {
    // (unit 0 runs on from page 1 to page 2, an annotation over its text on page 2: page 1's part holds it with its page, so
    // that a translation whose \\href is drawn on page 1 takes its link there; page 2's holds it as its own)
    const link = { annotationType: 2, rect: [60, 694, 140, 706], url: 'https://example.org/' }
    const L2 = locate(ins, B, align(B, B), { annotations: [[], [link], []] })
    const parts = [
      ...bundle({
        ins,
        located: L2,
        addOn: addOnOf(L2, 3),
        original,
        paper: { id: '2501.00001', version: 1, pages: 3 },
        made: 'test',
      }),
    ].filter((o) => o.kind === 'part')
    const linksOf = (n: number) => {
      const o = parts.find((x) => x.page === n)!
      return read('part', o.bytes, o.digest).links ?? []
    }
    const own = L2.links.get(2)![0]!
    expect(own.owner?.[0]).toBe(L2.members.find((m) => m.unit === 0)!.ord)
    expect(linksOf(1)).toEqual([{ ...own, page: 2 }])
    expect(linksOf(2)).toEqual([own])
    expect(linksOf(3)).toEqual([])
  })
  it("states each link's border as PDF.js draws it on A (Link.border: /BS or /Border's width, /C's colour, its style)", () => {
    // (hyperref's boxes: a citation's green, a reference's red dashed, an address's cyan underlined; a link of width 0 (hidelinks,
    // colorlinks) and one of no colour (/C []) draw none, as PDF.js's annotation layer draws none for them)
    const rgb = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b])
    const at = (x: number) => [60 + 30 * x, 694, 80 + 30 * x, 706]
    const list = [
      {
        annotationType: 2,
        rect: at(0),
        dest: 'cite.a',
        borderStyle: { width: 1, style: 1 },
        borderColor: rgb(0, 255, 0),
      },
      {
        annotationType: 2,
        rect: at(1),
        dest: 'sec.1',
        borderStyle: { width: 1.5, style: 2 },
        borderColor: rgb(255, 0, 0),
      },
      {
        annotationType: 2,
        rect: at(2),
        url: 'https://example.org/',
        borderStyle: { width: 1, style: 5 },
        borderColor: rgb(0, 255, 255),
      },
      {
        annotationType: 2,
        rect: at(3),
        dest: 'cite.b',
        borderStyle: { width: 0, style: 1 },
        borderColor: rgb(0, 255, 0),
      },
      { annotationType: 2, rect: at(4), dest: 'cite.c', borderStyle: { width: 1, style: 1 }, borderColor: null },
    ]
    const L2 = locate(ins, B, align(B, B), { annotations: [[], list, []] })
    const parts = [
      ...bundle({
        ins,
        located: L2,
        addOn: addOnOf(L2, 3),
        original,
        paper: { id: '2501.00001', version: 1, pages: 3 },
        made: 'test',
      }),
    ].filter((o) => o.kind === 'part')
    const o = parts.find((x) => x.page === 2)!
    const links = read('part', o.bytes, o.digest).links ?? []
    expect(links.map((l) => l.border ?? null)).toEqual([
      [1, 0x00ff00],
      [1.5, 0xff0000, 'dashed'],
      [1, 0x00ffff, 'underline'],
      null,
      null,
    ])
  })
  it('states each link group’s target with its member in every part that holds it (SpanAt.to)', () => {
    // (unit 0 runs on from page 1 to page 2 with an \\href group: both pages' parts state the group's address, so that each pairs
    // the group's translation with its annotation, wherever either falls)
    const to = { url: 'https://example.org/' }
    const linked = [
      { ...units[0]!, spans: [['0', { cmd: 'href', to }]] as InstrumentUnit['spans'] },
      units[1]!,
      units[2]!,
    ]
    const I = instrumentOf(B, linked, [[0, 0], [0, 1], [2]])
    const L2 = locate(I, B, align(B, B))
    const parts = [
      ...bundle({
        ins: I,
        located: L2,
        addOn: addOnOf(L2, 3),
        original,
        paper: { id: '2501.00001', version: 1, pages: 3 },
        made: 'test',
      }),
    ].filter((o) => o.kind === 'part')
    const ord = L2.members.find((m) => m.unit === 0)!.ord
    for (const n of [1, 2]) {
      const o = parts.find((x) => x.page === n)!
      const m = read('part', o.bytes, o.digest)
        .flows.flat()
        .find((x) => x.ord === ord)!
      expect(m.spans).toEqual([['0', { cmd: 'href', to }]])
    }
  })
  it('holds in a part every flow its page reads: its own, and those of the page a running-on member begins on', () => {
    const parts = objects.filter((o) => o.kind === 'part') as Extract<(typeof objects)[number], { kind: 'part' }>[]
    // page 2: unit 0 runs on from page 1 (a), and page 1's flows (b) are its own; unit 1's (a)
    expect(parts.map((p) => [p.page, p.flows])).toEqual([
      [1, { a: 1, b: 0, c: 0 }],
      [2, { a: 2, b: 0, c: 0 }],
      [3, { a: 1, b: 0, c: 0 }],
    ])
    const p2 = read('part', parts[1]!.bytes)
    expect(p2.flows.flat().map((m) => m.ord)).toEqual([0, 1])
  })
  it('states why a member stays the original’s: not located, its page refused', () => {
    const refused = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 3, [3]),
        original,
        paper: { id: '2501.00001', version: 1, pages: 3 },
        made: 'test',
      }),
    ]
    const head = (refused.at(-1) as Extract<(typeof refused)[number], { kind: 'head' }>).head
    expect(head.refused).toEqual([[3, 'page']])
    expect(head.parts[2]).toBeNull()
  })
})

describe('locate: the room under a unit', () => {
  it('reads the next line under a unit across its last block, which spans both columns where its short last line does not', () => {
    // (a caption across the page whose last line keeps to the left column; under it the right column's text begins 14 pt
    // lower, the left column's 30 pt lower)
    const wide = 'w'.repeat(78)
    const B = docOf([
      {
        lines: [
          { text: wide, y: 700 },
          { text: wide, y: 688 },
          { text: 'short end', y: 676 },
          ...[662, 650, 638].map((y) => ({ text: 'right column text one', x: 320, y })),
          ...[646, 634, 622].map((y) => ({ text: 'left column text one', y })),
        ],
      },
    ])
    // (each unit's text its glyphs': a member claims no more letters than its source writes)
    const units = [
      unitOf('caption', `${wide} ${wide} short end`),
      unitOf('para', 'right column text one '.repeat(3)),
      unitOf('para', 'left column text one '.repeat(3)),
    ]
    const L = locate(instrumentOf(B, units, [[0, 0, 0, 1, 1, 1, 2, 2, 2]]), B, align(B, B))
    expect(L.members[0]!.lines.map((l) => l[1])).toEqual([2, 2, 0])
    expect(L.members[0]!.room.next).toBe(14)
    // (the room below is the whole block's, not its short last line's: a translation's lines span the block's measure, so a
    // line borrowed under it meets the right column's text 5 pt down, not the left column's 21 pt down: the checkpoint's free-11,
    // borrowed lines run into a display)
    expect(L.members[0]!.room.below).toBe(5)
  })
  it("reads no ink nothing of which is shown beside a unit or under it (the checkpoint's measure-9: a figure's clipped title)", () => {
    // (1706.03762v7 p13: "Attention Visualizations", and on its baseline's band to its right a figure's "Layer5", clipped out of
    // its form, nothing of it shown: Room.side stopped at it, the heading could not widen, and its translation was set at 70 %)
    const make = (unseen: boolean) => {
      const B = docOf([
        {
          lines: [
            { text: 'A heading', y: 700 },
            { text: 'Layer5', x: 140, y: 703, form: true },
            { text: 'hidden', x: 72, y: 690, form: true },
            { text: 'the body text', y: 650 },
          ],
        },
      ])
      if (unseen) for (const g of B.pages[0]!.glyphs) if (g.n === 1 || g.n === 2) g.unseen = true
      const units = [unitOf('heading', 'A heading'), unitOf('para', 'the body text')]
      return locate(instrumentOf(B, units, [[0, -1, -1, 1]]), B, align(B, B)).members[0]!.room
    }
    expect(make(false).side?.[1]).toBe(140)
    expect(make(false).below).toBe(1)
    expect(make(true).side?.[1]).not.toBe(140)
    expect(make(true).below).toBe(41)
  })
  it('states the room under each run of its text lines to the next ink and to TeX’s column foot, and its separation', () => {
    // (the owner's ruling of 2026-11-08, borrowing bounded by TeX's facts: a paragraph may take lines in the empty space under
    // a run of its lines (today's freeFor given every block, RUN:2193) never past TeX's text block bottom in its column, nor so
    // that the next ink under it stands nearer than TeX's paragraph separation, \baselineskip and \parskip. A paragraph running
    // on from page 1, a row of its own kept between its lines on page 2. Each run's end: [its line, the depth under its baseline
    // of the next ink's baseline (a glyph's; a box's top), the depth under it of TeX's text block bottom])
    const B = docOf([
      {
        lines: [
          { text: 'para one', y: 700 },
          { text: 'para two', y: 688 },
          { text: 'other unit', y: 600 },
        ],
        // (a rule across the column 47 pt under page 1's last line of the paragraph: a box, its top the next ink)
        boxes: [[16, 1, 72, 640, 300, 641]],
      },
      {
        lines: [
          { text: 'para three', y: 700 },
          { text: 'held row', x: 80, y: 688 },
          { text: 'para four', y: 676 },
          { text: 'last unit', y: 500 },
        ],
      },
    ])
    const units = [
      unitOf('para', 'para one para two para three para four'),
      unitOf('para', 'other unit'),
      unitOf('para', 'last unit'),
    ]
    const ins = instrumentOf(B, units, [
      [0, 0, 1],
      [0, -1, 0, 2],
    ])
    const framed: Instrument = {
      ...ins,
      tex: {
        frames: [
          { block: [72, 540], columns: [[72, 540]], foot: 580 },
          { block: [72, 540], columns: [[72, 540]], foot: 480 },
        ],
        skips: [{ unit: 0, baselineskip: 12, parskip: 3 }],
      },
    }
    const para = locate(framed, B, align(B, B)).members[0]!
    expect(para.lines.map((l) => [l[0], l[4], l[9] & 1])).toEqual([
      [1, 700, 0],
      [1, 688, 0],
      [2, 700, 0],
      [2, 688, 1],
      [2, 676, 0],
    ])
    // (page 1's run: the rule 47 pt down, page 1's foot 108; page 2's text over its kept row: the row's baseline 12 pt down; its
    // last line: the last unit's baseline 176 pt down, page 2's foot 196)
    expect(para.room.runs).toEqual([
      [1, 47, 108],
      [2, 12, 220],
      [4, 176, 196],
    ])
    expect(para.room.sep).toBe(15)
    // (its last line's room as before: 167 pt over the last unit)
    expect(para.room.below).toBe(167)
    // (no foot stated, no compile of the statements: no room under a run; no separation stated: none)
    const plain = locate(ins, B, align(B, B)).members[0]!
    expect(plain.room.runs).toBeUndefined()
    expect(plain.room.sep).toBeUndefined()
  })
  it('reads the room under a run of lines across their own extent, a single line’s to its column’s end', () => {
    // (2602.23285v2 p5 t32: a paragraph set beside a figure, its lines' ink ending at 315.84 of a column to 504, the figure's
    // strokes beside every line: a translation's lines are laid across its block's own lines (the typesetter's measure, their
    // hull), one borrowed under it at its last line's, so the figure is no ink under them; read to the column's end it was,
    // under each line, and cut the paragraph into a run a line. A run of one line is widened to its column (U.decor), and read
    // so: its row's tail beside a float, 2608.16117v1 p19 t59)
    const B = docOf([
      {
        lines: [
          { text: 'wrapped one', y: 700 },
          { text: 'wrapped two', y: 688 },
          { text: 'wrapped end', y: 676 },
          { text: 'the next paragraph across the column', y: 560 },
        ],
        // (the figure's strokes beside the paragraph, each just under a line's bottom, at x 320-480)
        boxes: [
          [11, 1, 320, 640, 480, 696],
          [22, 1, 320, 640, 480, 684],
          [33, 1, 320, 640, 480, 672],
        ],
      },
    ])
    const units = [
      unitOf('para', 'wrapped one wrapped two wrapped end'),
      unitOf('para', 'the next paragraph across the column'),
    ]
    const ins = instrumentOf(B, units, [[0, 0, 0, 1]])
    const framed: Instrument = {
      ...ins,
      tex: {
        frames: [{ block: [72, 540], columns: [[72, 540]], foot: 500 }],
        skips: [{ unit: 0, baselineskip: 12, parskip: 0 }],
      },
    }
    const para = locate(framed, B, align(B, B)).members[0]!
    expect(para.lines.map((l) => [l[2], l[3], l[8]])).toEqual([
      [72, 138, 540],
      [72, 138, 540],
      [72, 138, 540],
    ])
    // (one run, its last line 116 pt over the next paragraph's baseline, 176 over TeX's bottom)
    expect(para.room.runs).toEqual([[2, 116, 176]])
  })
  it("ties at one size the units of one TeX paragraph a float cut in two, on the row they share (the checkpoint's free-9)", () => {
    // (2608.16117v1 p19: "… 8(d))." and "The increasing-" on one line, a figure set after it, "decreasing trend …" below: one
    // paragraph of TeX's the front end cut at the figure into two units, each fitted alone, the one at its size, the other shrunk;
    // one size for both. A paragraph end between them, or no row shared: no tie)
    const units = [
      unitOf('para', 'first part of it'),
      unitOf('caption', 'Figure 1: a caption'),
      unitOf('para', 'second part here'),
    ]
    const sizeTies = (second: { x: number; y: number }, ends: (n: (k: number) => number) => number[]) => {
      const B = docOf([
        {
          lines: [
            { text: 'first part of it', y: 700 },
            { text: 'Figure 1: a caption', y: 650 },
            { text: 'second part here', ...second },
          ],
        },
      ])
      const n = (k: number) => B.pages[0]!.glyphs.filter((g) => g.n < k).length
      const ins = { ...instrumentOf(B, units, [[0, 1, 2]]), tex: { paragraphEnds: [ends(n)] } }
      return locate(ins, B, align(B, B)).ties.filter((t) => t.rule === 'size')
    }
    // (the caption's own paragraph ends inside it, the second part's at its end)
    expect(sizeTies({ x: 172, y: 700 }, (n) => [n(2), n(3)])).toEqual([{ rule: 'size', ords: [0, 2] }])
    expect(sizeTies({ x: 172, y: 700 }, (n) => [n(1), n(2), n(3)])).toEqual([])
    expect(sizeTies({ x: 72, y: 638 }, (n) => [n(2), n(3)])).toEqual([])
  })
  it("holds the glyphs an element of no piece and a label cut from the text by them as A's ink, not the unit's text", () => {
    // (2610.37818v1 p14, the checkpoint's measure-4: the instrument gave sub-caption (b)'s unit the glyphs of sub-caption (a), which
    // has no unit, "(a)" as its label and "Dark rim band" as an element of no piece (today's u<id>.p with no placeholder's points
    // round them); read as the unit's text, its line ran over (a) and its text group erased (a)'s English with nothing drawn
    // there, its label crop "(a)" drawn before "(b)". They stay A's ink where they stand, as today's reader kept them)
    const B = docOf([
      {
        lines: [
          { text: '(a)', x: 100, y: 700 },
          { text: 'Dark rim band', x: 120, y: 700 },
          { text: '(b) Rim and edge', x: 300, y: 700 },
          { text: 'Figure 8: a caption under them', y: 680 },
        ],
      },
    ])
    const units = [unitOf('para', '(b) Rim and edge'), unitOf('caption', 'Figure 8: a caption under them')]
    const L = locate(
      instrumentOf(B, units, [[0, 0, 0, 1]], [[ROLE.label, ROLE.element, ROLE.text, ROLE.text]]),
      B,
      align(B, B),
    )
    const sub = L.members[0]!
    expect(sub.located).toBe(true)
    expect(sub.lines.map((l) => l[2])).toEqual([300])
    expect(sub.labelAt).toBeUndefined()
  })
  it("holds no float's glyphs as a line of a paragraph TeX set the float inside (L1's second held-line fault)", () => {
    // (2610.10492v1 ord 21: a float set between two lines of a paragraph, its glyphs no unit's, read as the paragraph's held
    // lines, KEPT; B's float brackets say they are the float's. A line the source does not write in the body stays held)
    const lines = ['para line one', 'Figure stuff', 'para line two']
    const B = docOf([{ lines: lines.map((text, i) => ({ text, x: i === 1 ? 80 : 72 })) }])
    const n = (k: number) => B.pages[0]!.glyphs.filter((g) => g.n < k).length
    const units = [unitOf('para', 'para line one para line two')]
    const keptOf = (points: [string, number][]) => {
      const d = docOf([{ lines: lines.map((text, i) => ({ text, x: i === 1 ? 80 : 72 })), points }])
      return locate(instrumentOf(d, units, [[0, -1, 0]]), d, align(d, d)).members[0]!.lines.filter((l) => l[9] & 1)
        .length
    }
    expect(
      keptOf([
        ['bs1', 0],
        ['be1', n(3)],
      ]),
    ).toBe(1)
    expect(
      keptOf([
        ['bs1', 0],
        ['fs1', n(1)],
        ['fe1', n(2)],
        ['be1', n(3)],
      ]),
    ).toBe(0)
  })
})

describe('review of #605', () => {
  const original = new Uint8Array(70000).map((_, i) => i & 255)
  it('places a unit of turned glyphs alone (a figure’s y-axis title) on its page, in that page’s part', () => {
    const withTurned = () => {
      const d = docOf([{ lines: ['a caption under it'] }])
      d.pages[0]!.turned = [...'Loss'].map(
        (u, j): DocTurned => ({
          u,
          code: u.codePointAt(0) as number,
          base: 'CMR10',
          n: 1,
          k: j,
          at: 18,
          box: -1,
          ox: 60,
          oy: 400 + 6 * j,
          ex: 60,
          ey: 406 + 6 * j,
          ux: 0,
          uy: 1,
          size: 10,
          ascent: 0.7,
          descent: -0.2,
          form: false,
        }),
      )
      return d
    }
    const B = withTurned()
    const A = withTurned()
    const units = [
      unitOf('caption', 'a caption under it'),
      unitOf('inkfigures', 'Loss', { figure: { set: 0, dir: [0, 1] } }),
    ]
    const ins: Instrument = {
      ...instrumentOf(B, units, [[0]]),
      turned: [
        { unit: Int32Array.from([1, 1, 1, 1]), role: Uint8Array.from([1, 1, 1, 1]), piece: new Int32Array(4).fill(-1) },
      ],
    }
    const L = locate(ins, A, align(B, A))
    expect(L.members[1]).toMatchObject({ located: true, pages: [1] })
    expect(L.members[1]!.lines).toHaveLength(1)
    expect(L.groups[0]!.turned).toEqual(['1.1.t', '1.1.t', '1.1.t', '1.1.t'])
    const addOn = {
      ...addOnOf(L, 1),
      groups: new Set([...L.groups[0]!.glyphs, ...L.groups[0]!.turned].filter((g): g is string => g !== null)),
    }
    expect(stateOf(L.members[1]!, addOn)).toMatchObject({ drawn: true })
    const objs = [
      ...bundle({ ins, located: L, addOn, original, paper: { id: '2501.00001', version: 1, pages: 1 }, made: 't' }),
    ]
    const part = objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }>
    expect(
      read('part', part.bytes)
        .flows.flat()
        .map((x) => x.ord),
    ).toEqual([0, 1])
  })
  it('states a turned figure text’s run and its room along it (S.figures draws its translation at its angle)', () => {
    // (1706.03762v7 p13's attention words, each set a quarter turned: today's figure reading gives the run's first glyph's origin,
    // its box's length along its direction and its room before and after; the part states them, its line its box on the page)
    const withTurned = () => {
      const d = docOf([{ lines: ['a caption under it'] }])
      d.pages[0]!.turned = [...'Loss'].map(
        (u, j): DocTurned => ({
          u,
          code: u.codePointAt(0) as number,
          base: 'CMR10',
          n: 1,
          k: j,
          at: 18,
          box: -1,
          ox: 60,
          oy: 400 + 6 * j,
          ex: 60,
          ey: 406 + 6 * j,
          ux: 0,
          uy: 1,
          size: 10,
          ascent: 0.7,
          descent: -0.2,
          form: false,
        }),
      )
      return d
    }
    const B = withTurned()
    const A = withTurned()
    const figure = { set: 0, dir: [0, 1] as [number, number], x: 60, y: 400, length: 24, anchor: 'start' as const }
    const units = [
      unitOf('caption', 'a caption under it'),
      unitOf('inkfigures', 'Loss', { figure: { ...figure, before: 5, after: 30 }, align: 'l' }),
    ]
    const ins: Instrument = {
      ...instrumentOf(B, units, [[0]]),
      turned: [
        { unit: Int32Array.from([1, 1, 1, 1]), role: Uint8Array.from([1, 1, 1, 1]), piece: new Int32Array(4).fill(-1) },
      ],
    }
    const L = locate(ins, A, align(B, A))
    const fig = L.members[1]!
    expect(fig.dir).toEqual([0, 1])
    // (its run: the origin and length along (0, 1) and its room before and after along it. Room.side keeps its meaning, the side
    // of its box across the page, as for a turned text of a part made before: an older typesetter reads the same fields alike)
    expect(fig.run).toEqual([60, 400, 24, 5, 30])
    const plain = locate(
      { ...ins, units: [units[0]!, unitOf('inkfigures', 'Loss', { figure: { set: 0, dir: [0, 1] }, align: 'l' })] },
      A,
      align(B, A),
    ).members[1]!
    expect(plain.room).toEqual(fig.room)
    const addOn = {
      ...addOnOf(L, 1),
      groups: new Set([...L.groups[0]!.glyphs, ...L.groups[0]!.turned].filter((g): g is string => g !== null)),
    }
    const objs = [
      ...bundle({ ins, located: L, addOn, original, paper: { id: '2501.00001', version: 1, pages: 1 }, made: 't' }),
    ]
    const part = objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }>
    const placed = read('part', part.bytes).flows.flat()[1]!
    expect(placed).toMatchObject({ dir: [0, 1], run: [60, 400, 24, 5, 30], room: fig.room, align: 'l' })
    // (one today's reading tells no room of states no run: S.figures leaves such a turned text the original's)
    expect(plain.run).toBeUndefined()
  })
  it('says a figure text whose ink stays is unwrapped: no group of it, so no translation is laid over it (#631 review)', () => {
    // (today's figure reading leaves a crowded label's ink where it stands (ink.ts: `fixed`, no group made of it); the part states
    // why, as for a member whose group the wrap did not make. A kept block holds no text a translation could stand for: as before)
    const B = docOf([{ lines: ['a caption under it', 'Loss', 'kept as it is'] }])
    const units = [
      unitOf('caption', 'a caption under it'),
      unitOf('inkfigures', 'Loss', { figure: { set: 0 }, fixed: true }),
      unitOf('inkorphan', 'kept as it is', { kept: true, fixed: true }),
    ]
    const ins = instrumentOf(B, units, [[0, 1, 2]])
    const L = locate(ins, B, align(B, B))
    expect(L.members.map((m) => m.located)).toEqual([true, true, true])
    const addOn = addOnOf(L, 1)
    expect(stateOf(L.members[1]!, addOn)).toEqual({ why: 'unwrapped', drawn: false, fixed: 0 })
    expect(stateOf(L.members[2]!, addOn)).toEqual({ drawn: false, fixed: 0 })
    const objs = [
      ...bundle({ ins, located: L, addOn, original, paper: { id: '2501.00001', version: 1, pages: 1 }, made: 't' }),
    ]
    const part = objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }>
    const placed = read('part', part.bytes).flows.flat()
    expect(placed.find((x) => x.ord === 1)).toMatchObject({ kind: 'figure', why: 'unwrapped' })
    expect(placed.find((x) => x.ord === 2)?.why).toBeUndefined()
  })
  it('lays no member one of whose images the wrap could not group (planOf’s lost)', () => {
    const B = docOf([{ lines: ['a unit with an image'] }])
    const L = locate(instrumentOf(B, [unitOf('para', 'a unit with an image')], [[0]]), B, align(B, B))
    const addOn = addOnOf(L, 1)
    expect(stateOf(L.members[0]!, addOn)).toMatchObject({ drawn: true })
    expect(stateOf(L.members[0]!, { ...addOn, lost: new Set(['0.1.e']) })).toEqual({
      why: 'unwrapped',
      drawn: false,
      fixed: 0,
    })
  })
  it('says a unit that owns an image and no glyph has no text: it stays the original’s, its image A’s ink in no group', () => {
    const B = docOf([{ lines: ['a paragraph'], boxes: [[11, -3, 72, 600, 172, 680]] }])
    const units = [unitOf('para', 'a paragraph'), unitOf('cell', 'x')]
    const ins = instrumentOf(B, units, [[0]])
    ins.boxes[0]!.unit[0] = 1
    ins.boxes[0]!.role[0] = ROLE.element
    const L = locate(ins, B, align(B, B))
    expect(L.members[1]).toMatchObject({ located: false, cause: 'no text' })
    expect(L.groups[0]!.boxes).toEqual([null])
  })
  it('reads a cell’s band between the table’s rules, no unit’s ink: an underscore TeX draws as a rule on a baseline', () => {
    // (1512.03385v1 p5's "conv2_x": OT1's \_ is a \vrule, the cell's own box on its baseline, read as the rule over it; and
    // 2610.21924v1 p21: the cells' of the rows above and below. The CJK cell's band shut at a baseline, its size cut, 5.80 for
    // 6.46: the entry against the runner's)
    const B = docOf([
      {
        lines: [
          { text: 'conv2x', y: 700 },
          { text: 'conv3x', y: 690 },
        ],
        boxes: [
          [0, 0, 60, 720, 300, 720.26],
          [5, 0, 102, 700, 104.2, 700.26],
          [11, 0, 102, 690, 104.2, 690.26],
          [12, 0, 60, 680, 300, 680.26],
        ],
      },
    ])
    const cell = (s: string, row: number) => unitOf('cell', s, { cell: { table: 0, row, col: 0 } })
    const ins = instrumentOf(B, [cell('conv2x', 0), cell('conv3x', 1)], [[0, 1]])
    ins.boxes[0]!.unit[1] = 0
    ins.boxes[0]!.role[1] = ROLE.text
    ins.boxes[0]!.unit[2] = 1
    ins.boxes[0]!.role[2] = ROLE.text
    const L = locate(ins, B, align(B, B))
    expect(L.members[0]!.room.band).toEqual([680.26, 720])
    expect(L.members[1]!.room.band).toEqual([680.26, 720])
  })
  it('gives a cell of a table set across both columns its table’s room, not its text column’s', () => {
    // (2610.17024v1 p15's cell "GPT" of a table set across a two-column page: its line ends at 287, past the left column's
    // measure (286), the next cell's ink at 330. Measured as the left column, its room ended at its own end and it could not
    // widen, where today's widen ran on to the next cell; a table inside one column keeps its column's measure)
    const L40 = 'x'.repeat(40)
    const B = docOf([
      {
        lines: [
          { text: L40, x: 46, y: 700 },
          { text: L40, x: 46, y: 688 },
          { text: L40, x: 46, y: 676 },
          { text: L40, x: 310, y: 700 },
          { text: L40, x: 310, y: 688 },
          { text: L40, x: 310, y: 676 },
          { text: 'Model', x: 60, y: 400 },
          { text: 'GPT', x: 269, y: 400 },
          { text: 'next', x: 330, y: 400 },
          { text: 'last', x: 500, y: 400 },
        ],
      },
    ])
    const cell = (s: string, col: number) => unitOf('cell', s, { cell: { table: 0, row: 0, col } })
    const units = [
      unitOf('para', `${L40} ${L40} ${L40}`),
      unitOf('para', `${L40} ${L40} ${L40}`),
      cell('Model', 0),
      cell('GPT', 1),
      cell('next', 2),
      cell('last', 3),
    ]
    const L = locate(instrumentOf(B, units, [[0, 0, 0, 1, 1, 1, 2, 3, 4, 5]]), B, align(B, B))
    const gpt = L.members[3]!
    expect(gpt.lines.map((l) => [l[2], l[3], l[7], l[8]])).toEqual([[269, 287, 46, 524]])
    expect(gpt.room.side).toEqual([90, 330])
    // (the paragraphs' measures are their columns' as before)
    expect(L.members[0]!.lines[0]!.slice(7, 9)).toEqual([46, 286])
  })
  it('states each cell’s grid place and its own text in the part, what a table’s groups are decided by (S.table.groups)', () => {
    // (1706.03762v7 p9's Table 3: today's groups follow TeX's tabular, the header, each column, a \multicolumn row of its own,
    // and a column of names is told by its cells' own text against their rows; the tie's cells were sorted by row and column
    // and the place dropped, so the typesetter could tell no group)
    const B = docOf([
      {
        lines: [
          { text: 'Model', x: 72, y: 700 },
          { text: 'BLEU', x: 200, y: 700 },
          { text: 'ByteNet', x: 72, y: 688 },
          { text: '23.75', x: 200, y: 688 },
          { text: 'positional embedding', x: 72, y: 676 },
        ],
      },
    ])
    const bold = (s: string) => {
      const content = [{ t: 'span' as const, id: '0', style: 'bold', content: [text(s)] }, text(' ')]
      return { id: unitId('cell', content), kind: 'cell', content }
    }
    const units: InstrumentUnit[] = [
      { ...bold('Model'), cell: { table: 0, row: 0, col: 0, head: true } },
      { ...bold('BLEU'), cell: { table: 0, row: 0, col: 1, head: true } },
      unitOf('cell', 'ByteNet', { cell: { table: 0, row: 1, col: 0 } }),
      unitOf('cell', '23.75', { cell: { table: 0, row: 1, col: 1 } }),
      unitOf('cell', 'positional embedding', { cell: { table: 0, row: 2, col: 0, span: 2 } }),
    ]
    const L = locate(instrumentOf(B, units, [[0, 1, 2, 3, 4]]), B, align(B, B))
    const original = new Uint8Array(70000).map((_, i) => i & 255)
    const objs = [
      ...bundle({
        ins: instrumentOf(B, units, [[0, 1, 2, 3, 4]]),
        located: L,
        addOn: addOnOf(L, 1),
        original,
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 't',
      }),
    ]
    const part = read(
      'part',
      (objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }>).bytes,
    )
    const ms = part.flows.flat().sort((a, b) => a.ord - b.ord)
    expect(ms.map((m) => m.cell)).toEqual([
      [0, 0, 1, 1],
      [0, 1, 1, 1],
      [1, 0, 1, 0],
      [1, 1, 1, 0],
      [2, 0, 2, 0],
    ])
    // (its text pieces, a group's opened, as its source writes them)
    expect(ms.map((m) => m.plain)).toEqual(['Model ', 'BLEU ', 'ByteNet', '23.75', 'positional embedding'])
    expect(part.ties?.filter((t) => t.rule === 'cells')).toEqual([
      { rule: 'cells', cells: [[0], [1], [2], [3], [4]], head: 1 },
    ])
  })
  it('states a caption label’s float type, LaTeX’s \\@captype, and its number as its last word (TeX’s \\fnum@)', () => {
    // (the owner's ruling of 2026-11-08: a figure's and a table's label in the target's word by its float type, one form a
    // paper; 2610.11256v1's "Table A1:" was kept by the label rule's spelling of the number, its "Table 1" relabelled, and
    // IEEEtran's "TABLE I." had no number read, its name "TABLEI")
    const B = docOf([
      {
        lines: [
          { text: 'TABLE I.', x: 72, y: 700 },
          { text: 'The scores', x: 130, y: 700 },
          { text: 'Figure 2:', x: 72, y: 600 },
          { text: 'A figure', x: 130, y: 600 },
        ],
      },
    ])
    const units = [unitOf('caption', 'The scores', { float: 'table' }), unitOf('caption', 'A figure')]
    const ins = instrumentOf(B, units, [[0, 0, 1, 1]], [[ROLE.label, ROLE.text, ROLE.label, ROLE.text]])
    const L = locate(ins, B, align(B, B))
    const original = new Uint8Array(70000).map((_, i) => i & 255)
    const objs = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original,
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 't',
      }),
    ]
    const part = read(
      'part',
      (objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }>).bytes,
    )
    const [table, figure] = part.flows.flat().sort((a, b) => a.ord - b.ord)
    expect(table!.label).toMatchObject({
      kind: 'float',
      name: ['TABLE', expect.anything()],
      num: ['I', expect.anything()],
      float: 'table',
    })
    // (a caption whose source tells no type: none stated)
    expect(figure!.label).toMatchObject({
      kind: 'float',
      name: ['Figure', expect.anything()],
      num: ['2', expect.anything()],
    })
    expect(figure!.label!.float).toBeUndefined()
  })
  it('gives a link to the member that owns most of the glyphs under it, and within it to the element that does', () => {
    // (two members on one line: x 72-90 and 96-150; a link over x 89-151 holds one glyph of the first and the second's nine,
    // every one of the second's: a link round its whole text)
    const B = docOf([
      {
        lines: [
          { text: 'see', x: 72 },
          { text: 'Figure 12', x: 96, y: 700 },
        ],
      },
    ])
    const units = [unitOf('para', 'see'), unitOf('para', 'Figure 12')]
    const link = { annotationType: 2, rect: [89, 695, 151, 708], dest: 'figure.12' }
    const L = locate(instrumentOf(B, units, [[0, 1]]), B, align(B, B), { annotations: [[link]] })
    expect(L.links.get(1)).toEqual([
      { box: [89, 695, 151, 708], to: { dest: '"figure.12"' }, owner: [1, ''], text: 'Figure12', whole: 1 },
    ])
  })
  it('states the links of one target that hold, together, every glyph of their member on the page (today’s whole tier)', () => {
    // (2610.37668v1 p15: a contents entry's link round its title, whose last glyph's ink ends past the link's box: the
    // typesetter's test of each line's ink inside a box dropped every entry. By glyph point, as today's whole tier: the title's
    // two lines each under one annotation of the target, together every glyph; one glyph past them, none of them)
    const B = docOf([{ lines: [{ text: 'Hexel', x: 72, y: 700 }, { text: 'Model', x: 72, y: 688 }, 'next'] }])
    const units = [unitOf('inkcontents', 'Hexel Model'), unitOf('para', 'next')]
    const ins = instrumentOf(B, units, [[0, 0, 1]])
    // (glyphs 6 pt wide from 72: the five of a line from 72 to 102, their centres 75 to 99)
    const one = { annotationType: 2, rect: [71, 695, 101.5, 708], dest: 'appendix.A' }
    const two = { annotationType: 2, rect: [71, 683, 101.5, 696], dest: 'appendix.A' }
    const L = locate(ins, B, align(B, B), { annotations: [[one, two]] })
    expect(L.links.get(1)?.map((l) => [l.owner, l.whole])).toEqual([
      [[0, ''], 1],
      [[0, ''], 1],
    ])
    const short = { ...two, rect: [71, 683, 95, 696] }
    const M = locate(ins, B, align(B, B), { annotations: [[one, short]] })
    expect(M.links.get(1)?.map((l) => l.whole)).toEqual([undefined, undefined])
  })
  it('states a link whose glyphs are its member’s label’s, more than half of them (an endnote’s back-reference)', () => {
    // (2609.36054v2 p14: enotez sets each endnote's number before its text, a link back to its mark; the add-on wraps the label in
    // a group of its own, which stays on where the label is not drawn anew, so its link is the label's, not the text's)
    const B = docOf([
      {
        lines: [
          { text: '3', x: 56, y: 700 },
          { text: 'a note that', x: 72, y: 700 },
          { text: 'runs on', y: 688 },
        ],
      },
    ])
    const units = [unitOf('footnote', 'a note that runs on')]
    const back = { annotationType: 2, rect: [55, 695, 63, 708], dest: 'enz.3.backref' }
    const text = { annotationType: 2, rect: [71, 695, 85, 708], dest: 'x' }
    const L = locate(instrumentOf(B, units, [[0, 0, 0]], [[ROLE.label, ROLE.text, ROLE.text]]), B, align(B, B), {
      annotations: [[back, text]],
    })
    expect(L.links.get(1)).toEqual([
      { box: [55, 695, 63, 708], to: { dest: '"enz.3.backref"' }, owner: [0, ''], text: '3', label: 1 },
      { box: [71, 695, 85, 708], to: { dest: '"x"' }, owner: [0, ''], text: 'a' },
    ])
  })
  it('states the characters of the glyphs under a link, in their order (today’s annotation’s own, its g2)', () => {
    // (1810.04805v2 p1: "(Peters et al., 2018a; Radford et al., 2018)" holds five annotations of two targets, "Peters et al.",
    // "2018a", "Rad-", "ford et al.", "2018"; the typesetter finds each among the characters the citation is drawn as. A glyph
    // 6 pt wide from 72: the link over 90-180 holds the centres of "Peters et al." but its spaces; one over no glyph none)
    const B = docOf([{ lines: [{ text: 'see Peters et al.', x: 72 }] }])
    const units = [unitOf('para', 'see Peters et al.')]
    const link = { annotationType: 2, rect: [90, 695, 180, 708], dest: 'cite.p' }
    const none = { annotationType: 2, rect: [300, 695, 310, 708], dest: 'cite.q' }
    const L = locate(instrumentOf(B, units, [[0]]), B, align(B, B), { annotations: [[link, none]] })
    expect(L.links.get(1)?.map((l) => l.text)).toEqual(['Petersetal.', undefined])
  })
})

describe('the element classes the part states', () => {
  it('states a text macro’s text from the unit’s glyphs between its two points, where none of them is the element’s', () => {
    // (1810.04805v2's \bert, set as "BERT": the instrument gives its glyphs to the unit's text, the element none, so the reading
    // drew nothing where today's draws the rendering it finds by it among the unit's characters; its two points on B (the
    // marked compile's p<unit>.<piece>a and b) say which they are)
    const B = docOf([{ lines: ['BERT is a model'] }])
    const content = [{ t: 'el' as const, id: '0', kind: 'other', src: '\\bert' }, text(' is a model')]
    const units: InstrumentUnit[] = [
      { id: unitId('para', content), kind: 'para', content, classes: [['0', { cls: 'umacro' }]] },
    ]
    const ins = {
      ...instrumentOf(B, units, [[0]]),
      places: [
        { unit: 0, piece: '0', page: 1, glyph: 0, end: false },
        { unit: 0, piece: '0', page: 1, glyph: 4, end: true },
      ],
    }
    const L = locate(ins, B, align(B, B))
    const mem = L.members.find((m) => m.unit === 0)!
    expect(mem.elements).toEqual([['0', { kind: 'other', ink: [], text: 'BERT', style: { role: 'serif', size: 10 } }]])
  })

  it('states a paper macro’s span empty where its two places hold no glyph, or where TeX said it sets none', () => {
    // (2610.19159v1's `Tool Output\trajectoryMark{}`: after the unit's end point, its point after the group it stands in, no glyph
    // between: TeX set none for it, El.text ''. A span with one side unstated says nothing; nor does a macro whose two places
    // hold a glyph that is not its own)
    const B = docOf([{ lines: ['Tool Output'] }])
    const content = [
      text('Tool Output'),
      { t: 'el' as const, id: '1', kind: 'macro', src: '\\trajectoryMark{}' },
      { t: 'el' as const, id: '2', kind: 'macro', src: '\\x' },
      { t: 'el' as const, id: '3', kind: 'macro', src: '\\y' },
      { t: 'el' as const, id: '4', kind: 'macro', src: '\\z' },
    ]
    const units: InstrumentUnit[] = [
      { id: unitId('para', content), kind: 'para', content, classes: [['1', { cls: 'umacro' }]] },
    ]
    const ins = {
      ...instrumentOf(B, units, [[0]]),
      places: [
        { unit: 0, piece: '1', page: 1, glyph: 10, end: false },
        { unit: 0, piece: '1', page: 1, glyph: 10, end: true },
        { unit: 0, piece: '2', page: 1, glyph: 10, end: false },
        { unit: 0, piece: '3', page: 1, glyph: 4, end: false },
        { unit: 0, piece: '3', page: 1, glyph: 6, end: true },
      ],
      empty: [{ unit: 0, piece: '4' }],
    }
    const L = locate(ins, B, align(B, B))
    const els = new Map(L.members.find((m) => m.unit === 0)!.elements)
    expect(els.get('1')).toMatchObject({ ink: [], text: '' })
    expect(els.get('2')!.text).toBeUndefined()
    expect(els.get('3')!.text).not.toBe('')
    expect(els.get('4')).toMatchObject({ ink: [], text: '' })
  })

  it('states which of three an element of no ink is: TeX set nothing, it stands outside the unit, or it was not found', () => {
    // (lave.md §2, math.md §4: an El of no ink meant "TeX set none", "not found" and "outside the unit" alike. TeX set nothing for
    // any piece whose span the instrument states empty, whatever its class: El.text '' (2402.10294v1's `\url` in `\urldef\tempurl`,
    // a visible class's); a piece TeX set before its unit's start point is outside the unit's text: El.keep, its ink never erased
    // (`outside`); with neither, El.ink [] alone says its ink was not found)
    const B = docOf([{ lines: ['Adobe Premiere Pro.'] }])
    const content = [
      { t: 'el' as const, id: '0', kind: 'other', src: '2023' },
      text('Adobe Premiere Pro.'),
      { t: 'el' as const, id: '2', kind: 'url', src: '\\url{https://www.adobe.com/}' },
      { t: 'el' as const, id: '3', kind: 'cite', src: '\\cite{a}' },
      { t: 'el' as const, id: '4', kind: 'other', src: '$x$' },
    ]
    const units: InstrumentUnit[] = [
      {
        id: unitId('reference', content),
        kind: 'reference',
        content,
        classes: [
          ['0', { cls: 'other', literal: true }],
          ['2', { cls: 'other' }],
          ['3', { cls: 'cite' }],
          ['4', { cls: 'other' }],
        ],
      },
    ]
    const ins = {
      ...instrumentOf(B, units, [[0]]),
      places: [
        { unit: 0, piece: '3', page: 1, glyph: 16, end: false },
        { unit: 0, piece: '3', page: 1, glyph: 16, end: true },
      ],
      empty: [{ unit: 0, piece: '2' }],
      outside: [{ unit: 0, piece: '0' }],
    }
    const L = locate(ins, B, align(B, B))
    const els = new Map(L.members.find((m) => m.unit === 0)!.elements)
    expect(els.get('0')).toMatchObject({ ink: [], keep: 1 })
    expect(els.get('0')!.text).toBeUndefined()
    expect(els.get('2')).toMatchObject({ ink: [], text: '' })
    expect(els.get('3')).toMatchObject({ ink: [], text: '' })
    expect(els.get('4')!.text).toBeUndefined()
    expect(els.get('4')!.keep).toBeUndefined()
  })

  it('writes each element with its source’s class, copy text, a symbol’s drawing and a footnote’s mark (the instrument’s)', () => {
    const B = docOf([{ lines: ['see the result'] }])
    const content = [text('see '), { t: 'el' as const, id: '1', kind: 'cite', src: '\\cite{a}' }, text(' the result')]
    const units: InstrumentUnit[] = [
      {
        id: unitId('para', content),
        kind: 'para',
        content,
        classes: [['1', { cls: 'cite', copy: '[·]', sym: ['†', true], mark: true, unknown: true, literal: true }]],
      },
    ]
    const ins = instrumentOf(B, units, [[0]])
    const L = locate(ins, B, align(B, B))
    // (the element as locate made it, with the instrument's kind: the class replaces it in the part alone)
    const mem = L.members.find((m) => m.unit === 0)!
    mem.elements = [['1', { kind: 'cite', ink: [[1, 30, 700, 40, 708, 701]] }]]
    const objects = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 't',
      }),
    ]
    const part = objects.find((o) => o.kind === 'part') as Extract<(typeof objects)[number], { kind: 'part' }>
    const els = read('part', part.bytes).flows.flat()[0]!.els
    expect(els).toEqual([
      [
        '1',
        {
          kind: 'cite',
          unknown: 1,
          copy: '[·]',
          sym: ['†', 1],
          mark: 1,
          literal: 1,
          ink: [[1, 30, 700, 40, 708, 701]],
        },
      ],
    ])
  })
})

describe('a paragraph TeX opened inside a unit (C13, C15: SpanAt.opens, El.opens)', () => {
  // (2608.25210v2 p3 unit 57: an item's text, then `\mypython{\small …}`, a frame TeX set as a paragraph of its own; TeX's
  // paragraph end (its qe point) between "sentences." and the frame's first word, no point of the group's own and none of
  // `\small`'s, which sets no ink: the group is found where the unit's text meets the end)
  const partOf = (ins: Instrument, B: Doc) => {
    const L = locate(ins, B, align(B, B))
    const objects = [
      ...bundle({
        ins,
        located: L,
        addOn: addOnOf(L, 1),
        original: new Uint8Array(10),
        paper: { id: '2501.00001', version: 1, pages: 1 },
        made: 't',
      }),
    ]
    const part = objects.find((o) => o.kind === 'part') as Extract<(typeof objects)[number], { kind: 'part' }>
    return read('part', part.bytes).flows.flat()[0]!
  }
  // (each glyph's owner by line, and an element's glyphs by their index on the page: [glyph, piece])
  const owned = (B: Doc, units: InstrumentUnit[], els: [number, number][], ends: number[]): Instrument => {
    const ins = instrumentOf(B, units, [[0, 0, 0]])
    for (const [g, piece] of els) {
      ins.glyphs[0]!.role[g] = ROLE.element
      ins.glyphs[0]!.piece[g] = piece
    }
    return { ...ins, tex: { paragraphEnds: [ends] } }
  }
  it('states the group whose open the unit’s text meets at TeX’s paragraph end, its first line there', () => {
    const B = docOf([{ lines: ['An item ends with sentences.', 'llm equal two: Determine', 'whether the two agree'] }])
    const content = [
      text('An item ends with sentences. '),
      {
        t: 'span' as const,
        id: '1',
        style: 'other',
        open: '\\mypython{',
        close: '}',
        content: [
          text('\n'),
          { t: 'el' as const, id: '2', kind: 'other', src: '\\small' },
          text(' llm equal two: Determine whether the two agree'),
        ],
      },
    ]
    const units: InstrumentUnit[] = [
      {
        id: unitId('para', content),
        kind: 'para',
        content,
        classes: [['2', { cls: 'zero', cmd: 'small', bare: true }]],
        spans: [['1', { cmd: 'mypython' }]],
      },
    ]
    const m = partOf(owned(B, units, [], [28]), B)
    expect(m.spans).toEqual([['1', { cmd: 'mypython', opens: 1 }]])
    expect(m.els?.find(([id]) => id === '2')?.[1].opens).toBeUndefined()
    // (an end the unit's text does not meet at the group's open, inside the group's text before "Determine": no group stated)
    expect(partOf(owned(B, units, [], [43]), B).spans).toEqual([['1', { cmd: 'mypython' }]])
  })
  it('states no group that closes before the text TeX’s paragraph begins with (today’s: the group holds that text)', () => {
    // (2610.20716v1's centred title, `…Bound Dark\texorpdfstring{\\}{} theory and …`: TeX's \\ in a centred block ends the
    // paragraph inside the group, and the text after the end stands after the group's close)
    const B = docOf([{ lines: ['The unified Bound Dark', 'theory and constraints'] }])
    const content = [
      text('The unified Bound Dark'),
      {
        t: 'span' as const,
        id: '1',
        style: 'other',
        open: '\\texorpdfstring{',
        close: '}',
        content: [{ t: 'el' as const, id: '2', kind: 'other', src: '\\\\' }],
      },
      text('\ntheory and constraints'),
    ]
    const units: InstrumentUnit[] = [
      { id: unitId('heading', content), kind: 'heading', content, classes: [['2', { cls: 'space', brk: true }]] },
    ]
    expect(partOf(owned(B, units, [], [22]), B).spans?.some(([, x]) => x.opens !== undefined) ?? false).toBe(false)
  })
  it('states the element whose first glyph opens TeX’s paragraph, and none whose own glyphs the end falls inside', () => {
    const B = docOf([{ lines: ['A first paragraph ends.', 'X and the second one', 'runs on'] }])
    const content = [
      text('A first paragraph ends. '),
      { t: 'el' as const, id: '3', kind: 'other', src: '\\figmark' },
      text(' and the second one runs on'),
    ]
    const units: InstrumentUnit[] = [
      { id: unitId('para', content), kind: 'para', content, classes: [['3', { cls: 'other' }]] },
    ]
    const at = partOf(owned(B, units, [[23, 3]], [23]), B)
    expect(at.els?.find(([id]) => id === '3')?.[1].opens).toBe(1)
    // (the element's ink from "ends." on: the paragraph TeX ended inside it opened at none of the unit's pieces)
    const inside = partOf(
      owned(
        B,
        units,
        [17, 18, 19, 20, 21, 22, 23].map((g) => [g, 3] as [number, number]),
        [23],
      ),
      B,
    )
    expect(inside.els?.find(([id]) => id === '3')?.[1].opens).toBeUndefined()
  })
})

describe('an element’s ink is what TeX set for it', () => {
  /** an instrument whose B lines each give their glyphs one owner, `lines[p][line]` its [unit, role, piece] (piece -1 none), and
   *  each box `boxes[p][box]` one */
  const ownedBy = (
    B: Doc,
    units: InstrumentUnit[],
    lines: [number, number, number][][],
    boxes: [number, number, number][][] = [],
  ): Instrument => ({
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        const [u, role, piece] = lines[p]?.[g.n] ?? [-1, 0, -1]
        O.unit[j] = u
        O.role[j] = role
        O.piece[j] = piece
      })
      return O
    }),
    boxes: B.pages.map((pg, p) => {
      const O = ownersOf(pg.kinds.length)
      pg.kinds.forEach((_, x) => {
        const [u, role, piece] = boxes[p]?.[x] ?? [-1, 0, -1]
        O.unit[x] = u
        O.role[x] = role
        O.piece[x] = piece
      })
      return O
    }),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  })
  const el = (id: string, src: string) => ({ t: 'el' as const, id, kind: 'math', src })
  const paraOf = (content: InstrumentUnit['content'], classes: InstrumentUnit['classes']): InstrumentUnit => ({
    id: unitId('para', content),
    kind: 'para',
    content,
    classes,
  })
  const T = ROLE.text
  const E = ROLE.element
  const elementOf = (L: ReturnType<typeof locate>, id = '1') =>
    new Map(L.members.find((x) => x.unit === 0)!.elements).get(id)!

  it('states one box for an overline’s rule and its nucleus on their line: the rule TeX set over the glyph (math.md R1)', () => {
    // (2610.10069v1 p10's `$\vH=\overline{\vH}$`: TeX sets \overline's rule 3θ over its nucleus, 1.03 to 1.24 pt over the glyphs'
    // ink in the parts; joined to the element's glyphs only within 0.5 pt, it was an ink of its own on its own baseline, which the
    // typesetter read as a formula broken over lines and set after it: "H = H ▁")
    const B = docOf([
      {
        lines: [
          { text: 'so ', x: 72, y: 700 },
          { text: 'H=H', x: 90, y: 700 },
          { text: ' agree', x: 108, y: 700 },
        ],
        boxes: [[5, 0, 102, 708.2, 108, 708.6]],
      },
    ])
    const content = [text('so '), el('1', '$\\vH=\\overline{\\vH}$'), text(' agree')]
    const ins = ownedBy(
      B,
      [paraOf(content, [['1', { cls: 'other' }]])],
      [
        [
          [0, T, -1],
          [0, E, 1],
          [0, T, -1],
        ],
      ],
      [[[0, E, 1]]],
    )
    expect(elementOf(locate(ins, B, align(B, B))).ink).toEqual([[1, 90, 698, 108, 708.6, 700]])
  })

  it('states one box for an inline fraction on its line, its denominator back under its numerator (math.md R1)', () => {
    // (2608.06701v1 p8's 2×|LCS(X,Y)| / (|X|+|Y|): cut alone, the element's glyphs made two lines, the denominator one of its own
    // where it runs back left under the numerator, each on the unit line they stand on; the typesetter set the two crops side by
    // side. The unit's own lines keep them one line of TeX's)
    const B = docOf([
      {
        lines: [
          { text: 'as ', x: 72, y: 700 },
          { text: '2L', x: 90, y: 704, size: 7 },
          { text: 'X+Y', x: 88.5, y: 696, size: 7 },
          { text: ' with', x: 110, y: 700 },
        ],
        boxes: [[5, 0, 88.5, 700.9, 101.5, 701.3]],
      },
    ])
    const content = [text('as '), el('1', '$\\frac{2L}{X+Y}$'), text(' with')]
    const ins = ownedBy(
      B,
      [paraOf(content, [['1', { cls: 'other' }]])],
      [
        [
          [0, T, -1],
          [0, E, 1],
          [0, E, 1],
          [0, T, -1],
        ],
      ],
      [[[0, E, 1]]],
    )
    expect(elementOf(locate(ins, B, align(B, B))).ink).toEqual([[1, 88.5, 694.6, 101.5, 708.9, 700]])
  })

  it('states a box a line for a formula TeX broke over two lines, a rule with the glyph TeX shipped it beside (math.md R1)', () => {
    // (each rule with its neighbour in B's stream, the one of its two neighbours nearer it where they stand on two lines: an
    // overline over the second line's nucleus, shipped right before it and after the first line's last glyph)
    const B = docOf([
      {
        lines: [
          { text: 'see ', x: 72, y: 700 },
          { text: 'a+', x: 96, y: 700 },
          { text: 'b', x: 72, y: 688 },
          { text: ' is', x: 78, y: 688 },
        ],
        boxes: [[6, 0, 72, 696.2, 78, 696.6]],
      },
    ])
    const content = [text('see '), el('1', '$a+\\overline{b}$'), text(' is')]
    const ins = ownedBy(
      B,
      [paraOf(content, [['1', { cls: 'other' }]])],
      [
        [
          [0, T, -1],
          [0, E, 1],
          [0, E, 1],
          [0, T, -1],
        ],
      ],
      [[[0, E, 1]]],
    )
    expect(elementOf(locate(ins, B, align(B, B))).ink).toEqual([
      [1, 96, 698, 108, 707, 700],
      [1, 72, 686, 78, 696.6, 688],
    ])
  })

  it('reads one line of TeX’s where a tall fraction’s denominator runs back under the line: its two cuts on one baseline (math.md R1)', () => {
    // (2610.21026v1 p5 m61: a display-style fraction in a paragraph line, its denominator wholly under the line's band, back
    // left of the numerator's end; the cut began a line there, the rest of the line's words on it, so the unit had two lines
    // on one baseline, overlapping, and the fraction two boxes, set side by side. TeX never sets two lines of a paragraph on
    // one baseline across each other: one line (today's maker: two rows on one baseline that meet are one line of TeX's))
    const B = docOf([
      {
        lines: [
          { text: 'we write as ', x: 72, y: 700 },
          { text: '2L', x: 150, y: 707 },
          { text: 'X+Y', x: 149, y: 690 },
          { text: ' with more', x: 170, y: 700 },
          { text: 'next line', x: 72, y: 676 },
        ],
      },
    ])
    const content = [text('we write as '), el('1', '$\\dfrac{2L}{X+Y}$'), text(' with more next line')]
    const ins = ownedBy(
      B,
      [paraOf(content, [['1', { cls: 'other' }]])],
      [
        [
          [0, T, -1],
          [0, E, 1],
          [0, E, 1],
          [0, T, -1],
          [0, T, -1],
        ],
      ],
    )
    const L = locate(ins, B, align(B, B))
    const mem = L.members.find((x) => x.unit === 0)!
    expect(mem.lines.map((l) => [l[2], l[3], l[4]])).toEqual([
      [72, 230, 700],
      [72, 126, 676],
    ])
    expect(elementOf(L).ink).toEqual([[1, 149, 688, 167, 714, 700]])
  })

  it('states no text of an element whose glyphs on a line stand on two baselines: a script is no plain text (math.md R4)', () => {
    // (2609.20976v1 p2's `\kmsMpc`, "km s⁻¹ Mpc⁻¹": its text "km s−1 Mpc−1" dropped the scripts' raise and size, drawn as body
    // text; without a text the typesetter crops its ink, as today's reader does a raised script's (layer2.mjs scriptedOf). Its
    // copy text stays its glyphs')
    const B = docOf([
      {
        lines: [
          { text: 'H0 is ', x: 72, y: 700 },
          { text: 'km s', x: 108, y: 700 },
          { text: '−1', x: 132, y: 703.6, size: 7 },
          { text: ' Mpc', x: 140.4, y: 700 },
          { text: '−1', x: 164.4, y: 703.6, size: 7 },
          { text: ' e.g.', x: 172.8, y: 700 },
          { text: ' now', x: 196.8, y: 700 },
        ],
      },
    ])
    const content = [text('H0 is '), el('1', '\\kmsMpc'), el('2', '\\eg'), text(' now')]
    const ins = ownedBy(
      B,
      [
        paraOf(content, [
          ['1', { cls: 'umacro', unknown: true }],
          ['2', { cls: 'macro' }],
        ]),
      ],
      [
        [
          [0, T, -1],
          [0, E, 1],
          [0, E, 1],
          [0, E, 1],
          [0, E, 1],
          [0, E, 2],
          [0, T, -1],
        ],
      ],
    )
    const L = locate(ins, B, align(B, B))
    const km = elementOf(L)
    expect(km.text).toBeUndefined()
    expect(km.copy).toBe('km s−1 Mpc−1')
    expect(km.ink).toHaveLength(1)
    expect(elementOf(L, '2').text).toBe('e.g.')
  })

  it('leaves a unit the original’s where an element TeX set ink for has none: not found is not "TeX set none" (math.md R3)', () => {
    // (a formula whose two points hold glyphs the ownership gave the unit's text, none its own: read as "TeX set no ink", it was
    // drawn as nothing and its glyphs erased with the text, as 2608.25210v2 p7's Algorithm 1 lost its 21 lines. Today's file
    // states such a piece LOST, its unit unproven; EMPTY only where both its points hold nothing between them, or TeX said it
    // sets none: a paper's macro the instrument states empty, a formula whose points stand at one glyph)
    const B = docOf([{ lines: [{ text: 'Return P if x', x: 72, y: 700 }] }, { lines: [{ text: 'Return P', y: 700 }] }])
    const content = [text('Return '), el('1', '$P$'), text(' if '), el('3', '$x$')]
    const content2 = [text('Return P'), el('1', '\\papertext{x}'), el('2', '$\\phantom{}$')]
    const units = [
      paraOf(content, [
        ['1', { cls: 'other' }],
        ['3', { cls: 'other' }],
      ]),
      {
        ...paraOf(content2, [
          ['1', { cls: 'umacro', unknown: true }],
          ['2', { cls: 'other' }],
        ]),
      },
    ]
    const ins: Instrument = {
      ...ownedBy(B, units, [[[0, T, -1]], [[1, T, -1]]]),
      places: [
        { unit: 0, piece: '1', page: 1, glyph: 7, end: false },
        { unit: 0, piece: '1', page: 1, glyph: 8, end: true },
        { unit: 0, piece: '3', page: 1, glyph: 12, end: false },
        { unit: 0, piece: '3', page: 1, glyph: 13, end: true },
        { unit: 1, piece: '2', page: 2, glyph: 8, end: false },
        { unit: 1, piece: '2', page: 2, glyph: 8, end: true },
      ],
      empty: [{ unit: 1, piece: '1' }],
    }
    const L = locate(ins, B, align(B, B))
    expect(L.members[0]).toMatchObject({ located: false, cause: 'element not found' })
    expect(L.members[1]).toMatchObject({ located: true })
  })

  it('leaves a unit the original’s whose text holds more letters than its source writes: another piece’s ink (math.md R3)', () => {
    // (2608.25210v2 p7's Algorithm 1 again, its formulas and keywords marked by no point: 200 letters claimed as its text where its
    // text pieces write 6 ("Return"); its text group would erase them and no translation draws them. TeX sets a text's letters as
    // written, a ligature's one glyph for its two, an accent and its letter one: no more letters, ever)
    const B = docOf([
      { lines: [{ text: 'Return rank(T) if x', y: 700 }] },
      { lines: [{ text: 'the ﬁrst élan ˇc', y: 700 }] },
    ])
    const units = [
      paraOf(
        [text('Return '), el('1', '$\\mathrm{rank}(T)$'), text(' if '), el('3', '$x$')],
        [
          ['1', { cls: 'other' }],
          ['3', { cls: 'other' }],
        ],
      ),
      paraOf([text('the first élan č')], []),
    ]
    const L = locate(ownedBy(B, units, [[[0, T, -1]], [[1, T, -1]]]), B, align(B, B))
    expect(L.members[0]).toMatchObject({ located: false, cause: 'text past its source' })
    expect(L.members[1]).toMatchObject({ located: true })
  })
})

describe('a member’s style read off all of its glyphs, as TeX set them', () => {
  it('reads a figure text set turned off its turned glyphs: their weight, design, fill and size (an axis title in bold)', () => {
    // (2608.04322v1 p8's y-axis title "Refusal Rate (XSTest)", set a quarter turned in TimesNewRomanPS-BoldMT: its glyphs are the
    // member's turned ones, none upright, and it read as the default serif at its first glyph's size)
    const withTurned = () => {
      const d = docOf([{ lines: ['a caption under it'] }])
      d.pages[0]!.turned = [...'Rate'].map(
        (u, j): DocTurned => ({
          u,
          code: u.codePointAt(0) as number,
          base: 'TimesNewRomanPS-BoldMT',
          n: 1,
          k: j,
          at: 18,
          box: -1,
          ox: 60,
          oy: 400 + 6 * j,
          ex: 60,
          ey: 406 + 6 * j,
          ux: 0,
          uy: 1,
          size: j ? 5.11 : 6,
          ascent: 0.7,
          descent: -0.2,
          form: false,
          fill: 0x1f77b4,
        }),
      )
      return d
    }
    const B = withTurned()
    const A = withTurned()
    const units = [
      unitOf('caption', 'a caption under it'),
      unitOf('inkfigures', 'Rate', { figure: { set: 0, dir: [0, 1] } }),
    ]
    const ins: Instrument = {
      ...instrumentOf(B, units, [[0]]),
      turned: [
        { unit: Int32Array.from([1, 1, 1, 1]), role: Uint8Array.from([1, 1, 1, 1]), piece: new Int32Array(4).fill(-1) },
      ],
    }
    const fig = locate(ins, A, align(B, A)).members[1]!
    expect(fig.style).toMatchObject({
      role: 'serif',
      bold: 1,
      design: 'TimesNewRomanPS-BoldMT',
      fill: 0x1f77b4,
      size: 5.11,
    })
    // (its size the median of its glyphs', as an upright text's: no size read off its band)
    expect(fig.read).not.toContain('size:lines')
  })

  it('sets a babel name in faked small capitals at its capitals’ size: its key is no text of it (IEEE’s REFERENCES)', () => {
    // (2610.21880v1 p5: \refname set as IEEEtran's faked small capitals, "R" at 9.96 and "EFERENCES" at 7.97; the name's source is
    // babel's key `ref`, not the text TeX printed for it, and the name read as capitals at the small capitals' 7.97)
    const B = docOf([
      {
        lines: ['REFERENCES', 'Body text here'],
        points: [
          ['n1.ref.s', 0],
          ['n1.ref.e', 10],
        ],
      },
    ])
    B.pages[0]!.glyphs.forEach((x, j) => {
      if (j < 10) x.size = j ? 7.97 : 9.96
    })
    const units = [unitOf('para', 'Body text here'), { ...unitOf('name', 'ref'), name: 'ref' }]
    const ins = instrumentOf(B, units, [[1, 0]], [[ROLE.name, ROLE.text]])
    const name = locate(ins, B, align(B, B)).members.find((m) => m.name === 'ref')!
    expect(name.style).toMatchObject({ size: 9.96, sc: 0.8, caps: 1 })
    expect(name.style.upper).toBeUndefined()
    // (true capitals keep their size, and are in the text's capitals: no glyph smaller than the others)
    const C = docOf([
      {
        lines: ['ABSTRACT', 'Body text here'],
        points: [
          ['n1.abstract.s', 0],
          ['n1.abstract.e', 8],
        ],
      },
    ])
    C.pages[0]!.glyphs.forEach((x, j) => {
      if (j < 8) x.size = 9.96
    })
    const caps = locate(
      instrumentOf(
        C,
        [unitOf('para', 'Body text here'), { ...unitOf('name', 'abstract'), name: 'abstract' }],
        [[1, 0]],
        [[ROLE.name, ROLE.text]],
      ),
      C,
      align(C, C),
    ).members.find((m) => m.name === 'abstract')!
    expect(caps.style).toMatchObject({ size: 9.96, upper: 1 })
    expect(caps.style.sc).toBeUndefined()
  })
})

describe('the alignment of a line of the page’s head or foot', () => {
  it('reads a head or foot line that ends at its measure’s end and starts within it set flush right (TeX’s \\hfil before it)', () => {
    // (2609.36054v2's foot, "page 13 of 14" at the text block's right edge, read justified: its translation was laid from the
    // original's start and shrunk to 0.825 of its size; a head or foot line is a box of the text's width, the place TeX's \hfil
    // left it in that box its alignment. A paragraph's single line indented and full is no such line: it stays justified)
    const body = 'w'.repeat(70)
    const B = docOf([
      {
        lines: [
          { text: 'A running title', y: 760 },
          { text: body, y: 700 },
          { text: body, y: 688 },
          { text: body, y: 676 },
          { text: body, y: 664 },
          { text: 'w'.repeat(65), x: 102, y: 640 },
          { text: 'page 2 of 9', x: 426, y: 60 },
        ],
      },
    ])
    const units = [
      unitOf('inkheads', 'A running title'),
      unitOf('para', 'the body'),
      unitOf('para', 'one full line'),
      unitOf('inkheads', 'page 2 of 9'),
    ]
    const L = locate(instrumentOf(B, units, [[0, 1, 1, 1, 1, 2, 3]]), B, align(B, B))
    const at = (u: number) => L.members.find((m) => m.unit === u)!
    expect(at(3).lines[0]!.slice(2, 4)).toEqual([426, 492])
    expect([at(0).align, at(1).align, at(2).align, at(3).align]).toEqual(['j', 'j', 'j', 'r'])
  })
})

describe('the places on A where a sentence may begin (Placed.words, Unit.sentences)', () => {
  const partsOf = (ins: Instrument, L: ReturnType<typeof locate>, pages: number) => [
    ...bundle({
      ins,
      located: L,
      addOn: addOnOf(L, pages),
      original: new Uint8Array(10),
      paper: { id: '2501.00001', version: 1, pages },
      made: 'test',
    }),
  ]
  it('states each word of a running unit’s projection at its first glyph on A, its line and x; a heading none', () => {
    const B = docOf([{ lines: ['One two three. Four', 'five six. Seven eight.', 'A heading'] }])
    const units = [unitOf('para', 'One two three. Four five six. Seven eight.'), unitOf('heading', 'A heading')]
    const ins = instrumentOf(B, units, [[0, 0, 1]])
    const L = locate(ins, B, align(B, B))
    // (6 pt a glyph from x 72: "Four" the 16th glyph of the first line, "Seven" the 11th of the second)
    expect(L.members[0]!.words).toEqual([
      [0, 0, 72],
      [4, 0, 96],
      [8, 0, 120],
      [15, 0, 162],
      [20, 1, 72],
      [25, 1, 102],
      [30, 1, 132],
      [36, 1, 168],
    ])
    expect(L.members[1]!.words).toBeUndefined()
    // (the part states them; the units say which a translator cuts into sentences)
    const objects = partsOf(ins, L, 1)
    const part = read('part', (objects.find((o) => o.kind === 'part') as { bytes: Uint8Array }).bytes)
    const placed = part.flows.flat()
    expect(placed.find((m) => m.kind === 'para')!.words).toEqual(L.members[0]!.words)
    expect(placed.find((m) => m.kind === 'heading')!.words).toBeUndefined()
    const us = read('units', (objects.find((o) => o.kind === 'units') as { bytes: Uint8Array }).bytes).units
    expect(us.find((u) => u.kind === 'para')!.sentences).toBe(true)
    expect(us.find((u) => u.kind === 'heading')!.sentences).toBeUndefined()
  })
  it('states a member’s words in the parts of the pages it has ink on, not in one that carries it for another page', () => {
    // (page 2's part carries page 1's flows, its second paragraph's first line being there: the first paragraph lights on page 1
    // alone, the second on both)
    const B = docOf([{ lines: ['First para here.', 'Second one runs'] }, { lines: ['on to page two.'] }])
    const units = [unitOf('para', 'First para here.'), unitOf('para', 'Second one runs on to page two.')]
    const ins = instrumentOf(B, units, [[0, 1], [1]])
    const L = locate(ins, B, align(B, B))
    const parts = partsOf(ins, L, 2)
      .filter((o) => o.kind === 'part')
      .map((o) => read('part', (o as { bytes: Uint8Array }).bytes))
    const wordsIn = (p: number) => parts[p - 1]!.flows.flat().map((m) => [m.ord, m.words?.length ?? 0])
    expect(wordsIn(1)).toEqual([
      [0, 3],
      [1, 7],
    ])
    expect(wordsIn(2)).toEqual([
      [0, 0],
      [1, 7],
    ])
  })
  it('places a word at the opening bracket or quote set against it, as the page’s text runs it in one token', () => {
    // (today's left side starts a sentence at the text layer's token of its first word: "(See" begins at its "(")
    const B = docOf([{ lines: ['One. (See two.) “Three.”'] }])
    const L = locate(instrumentOf(B, [unitOf('para', 'One. (See two.) “Three.”')], [[0]]), B, align(B, B))
    expect(L.members[0]!.words).toEqual([
      [0, 0, 72],
      [6, 0, 72 + 5 * 6],
      [10, 0, 72 + 10 * 6],
      [17, 0, 72 + 16 * 6],
    ])
  })
  it('places a word where its letters are the page’s in order, a macro’s text beside it none of its; one TeX never set at -1', () => {
    // (a text macro set as "BERT" before the unit's own "-based": the word "based" at its own "b", never at BERT's; and "two",
    // which the compile never printed, not placed)
    const B = docOf([{ lines: ['BERT-based models. They', 'work. One three.'] }])
    const content = [
      { t: 'el' as const, id: '0', kind: 'macro', src: '\\bert' },
      text('-based models. They work. One two three.'),
    ]
    // (its class as the front states a text macro whose glyphs are the unit's text: the probe's text, which the unit's letter
    // count reads, rc-ink's conservation: without it "BERT" is 4 letters no piece writes and the unit stays the original's)
    const u: InstrumentUnit = {
      id: unitId('para', content),
      kind: 'para',
      content,
      classes: [['0', { cls: 'macro', text: 'BERT' }]],
    }
    const L = locate(instrumentOf(B, [u], [[0, 0]]), B, align(B, B))
    const words = L.members[0]!.words!
    // (a word's offset in the projection: the macro one character, then the text)
    const off = (w: string) => 1 + '-based models. They work. One two three.'.indexOf(w)
    const at = (w: string) => words.find((x) => x[0] === off(w))
    expect(words.map((x) => x[0])).toEqual(['based', 'models', 'They', 'work', 'One', 'two', 'three'].map(off))
    expect(at('based')).toEqual([off('based'), 0, 72 + 5 * 6])
    expect(at('They')).toEqual([off('They'), 0, 72 + 19 * 6])
    expect(at('work')).toEqual([off('work'), 1, 72])
    expect(at('two')).toEqual([off('two'), -1, 0])
    expect(at('three')).toEqual([off('three'), 1, 72 + 10 * 6])
  })
})
