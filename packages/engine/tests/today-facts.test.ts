// The facts the typesetter consumes, stated by today's definitions (lane L7, the converge lane): a line's size and baseline as
// today's maker reads them, a unit's size as today's reader reads it (its text glyphs' sizes along the line), a line pinned as
// today's edgesOf reads it alone, and its measure as today's columnOf reads its column. Each on ink made by hand.
import { type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { DocGlyph } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { fakedCaps, unitSize } from '../src/locate/facts.ts'
import { cutLines, lineSize } from '../src/locate/lines.ts'
import { locate } from '../src/locate/locate.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const g = (u: string, x: number, y: number, size = 10, o: Partial<DocGlyph> = {}): DocGlyph => ({
  u,
  code: u.codePointAt(0) ?? 0,
  font: 'NimbusRomNo9L-Regu',
  base: 'NimbusRomNo9L-Regu',
  x0: x,
  x1: x + 0.5 * size,
  y,
  top: y + 0.7 * size,
  bottom: y - 0.2 * size,
  size,
  ix0: x,
  ix1: x + 0.5 * size,
  n: 0,
  k: 0,
  form: false,
  blank: !/\S/.test(u),
  fill: 0,
  ...o,
})
const text = (s: string): Piece => ({ t: 'text', s })
function instrument(
  B: ReturnType<typeof docOf>,
  units: InstrumentUnit[],
  own: (p: number, j: number) => [number, number, number],
): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((_, j) => {
        const [u, role, piece] = own(p, j)
        O.unit[j] = u
        O.role[j] = role
        O.piece[j] = piece
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
const para = (s: string): InstrumentUnit => ({ id: unitId('para', [text(s)]), kind: 'para', content: [text(s)] })

describe('a line’s size and baseline, today’s maker’s (MAKE:382-410)', () => {
  it('is the median size of its main glyphs: a large sign among its words is none of them', () => {
    const words = [...'words of the line'].map((u, i) => g(u, 72 + 5 * i, 700, 10))
    expect(lineSize([...words, g('∑', 160, 698, 20)])).toBe(10)
    // (the main glyphs set less than a quarter of its characters: all of them count)
    const small = [...'xyzuv'].map((u, i) => g(u, 72 + 4 * i, 700, 7))
    expect(lineSize([...small, g('∑', 100, 698, 14)])).toBe(7)
  })
  it('stands on the baseline most of its body glyphs share, its scripts aside', () => {
    // (five script glyphs on one baseline outvote four of the line's words on another by count, not by body)
    const body = [...'abcd'].map((u, i) => g(u, 72 + 5 * i, 700, 10))
    const scripts = [...'12345'].map((u, i) => g(u, 95 + 3 * i, 703.5, 6))
    const all = [...body, ...scripts]
    const [line] = cutLines(
      all.map((_, i) => i),
      (i) => ({ page: 1, g: all[i]! }),
    )
    expect(line!.base).toBe(700)
  })
  it('reads its next glyph against its body’s baseline, not its first glyph’s: a line that opens with a script', () => {
    // (2610.21765v1 p9: a line opening with 1/√2π's numerator, 3.8 pt over the baseline; its last formula's fraction, the
    // numerator 3.8 pt over and the denominator 3.5 pt under, back left: one line, never two)
    const gs = [
      g('1', 61, 696.48, 7),
      g('2', 62, 688.08, 7),
      ...[...'D(x,y)='].map((u, i) => g(u, 75 + 5 * i, 692.64, 10)),
      ...[...'1-x'].map((u, i) => g(u, 120 + 4 * i, 696.48, 7)),
      ...[...'1-y'].map((u, i) => g(u, 120 + 4 * i, 689.16, 7)),
    ]
    const lines = cutLines(
      gs.map((_, i) => i),
      (i) => ({ page: 1, g: gs[i]! }),
    )
    expect(lines.map((l) => [l.base, l.x0])).toEqual([[692.64, 61]])
  })
  it('keeps a big delimiter on its line, its origin at its top: its ink crosses the baseline', () => {
    // (2610.21026v1 p20: a 10 pt line, then \left( with its origin 17 pt over the baseline and its ink from 12 pt under to it,
    // then the formula's numerator and the rest on the baseline: one line; the next line's first glyph, back left and a
    // baselineskip under, a line of its own though a tall glyph of it crossed this baseline)
    const big = g('(', 120, 683.92, 10, { bottom: 654.44, top: 684.32 })
    const gs = [
      ...[...'text'].map((u, i) => g(u, 72 + 5 * i, 666.89, 10)),
      big,
      ...[...'ab'].map((u, i) => g(u, 128 + 5 * i, 674.56, 7)),
      ...[...'=x'].map((u, i) => g(u, 140 + 5 * i, 666.89, 10)),
      g('(', 72, 671.89, 10, { bottom: 642.44, top: 672.32 }),
      ...[...'next'].map((u, i) => g(u, 80 + 5 * i, 654.89, 10)),
    ]
    const lines = cutLines(
      gs.map((_, i) => i),
      (i) => ({ page: 1, g: gs[i]! }),
    )
    expect(lines.map((l) => [l.base, l.x0, l.gs.length])).toEqual([
      [666.89, 72, 9],
      [654.89, 72, 5],
    ])
  })
})

describe('a unit’s size, today’s reader’s (L2:765 originalStyle, L2:188 pageChars2)', () => {
  it('is the median of its text glyphs’ sizes along the line, its math fonts aside', () => {
    // (a line pdfTeX expanded 1.7 %: its glyphs 9.96 pt up the line, 10.13 along it, as PDF.js's text items give them)
    const wide = [...'expanded'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96, { along: 10.13 }))
    const plain = [...'line'].map((u, i) => g(u, 72 + 5 * i, 688, 9.96))
    const math = [...'xyzw'].map((u, i) => g(u, 120 + 5 * i, 688, 7, { base: 'CMMI7' }))
    expect(unitSize([...wide, ...plain, ...math])).toBe(10.13)
    expect(unitSize(math)).toBeUndefined()
    // (faked small capitals aside: IEEEtran's "Experiments" as "E" at 9.96 and "XPERIMENTS" at 7.97 is set at 9.96, its share
    // 0.8; an ink unit's, whose source is its own text, by its capitals' sizes alone)
    const head = [g('E', 72, 700, 9.96), ...[...'XPERIMENTS'].map((u, i) => g(u, 80 + 5 * i, 700, 7.97))]
    const caps = fakedCaps(head, 'Experiments')
    expect(caps.small.size).toBe(10)
    expect(caps.ratio).toBe(0.8)
    expect(unitSize(head.filter((x) => !caps.small.has(x)))).toBe(9.96)
    expect(fakedCaps(head, null, true).ratio).toBe(0.8)
    expect(
      fakedCaps(
        [...'Experiments'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96)),
        'Experiments',
      ).small.size,
    ).toBe(0)
    // (as the page states it: pdfTeX's 10 pt is 9.9626 bp, which every width the lay sets is scaled by; no 1/100 grid)
    expect(unitSize([...'ten'].map((u, i) => g(u, 72 + 5 * i, 700, 9.9626)))).toBe(9.9626)
  })
})

describe('a line pinned and its measure, as today’s reader reads them (RUN:1557-1650)', () => {
  // (a page of three paragraphs: the first of three lines, the third a line TeX set 1 pt overfull; then a one-line paragraph
  // whose line the next unit's text continues, x 140 on)
  const pages: PageSpec[] = [
    {
      lines: [
        { text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', y: 700 },
        { text: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', y: 688 },
        { text: 'ccccccccccccccccccccccccccccccccccccccccccccc', y: 676 },
        { text: 'dddddddddddd', y: 652 },
        { text: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', x: 150, y: 652 },
        { text: 'ffffffffffff', y: 640 },
      ],
    },
  ]
  const B = docOf(pages)
  const a = para('a b c')
  const d = para('d')
  const e = para('e')
  // (glyph j of the page: the first three lines unit 0's, the fourth's twelve unit 1's, the rest unit 2's)
  const own = (_: number, j: number): [number, number, number] =>
    j < 44 + 44 + 45 ? [0, ROLE.text, -1] : j < 44 + 44 + 45 + 12 ? [1, ROLE.text, -1] : [2, ROLE.text, -1]
  const at = locate(instrument(B, [a, d, e], own), B, align(B, B))
  const [m0, m1] = at.members
  it('reads the column of a line from the page’s paragraph lines: the end two lines share, not the overfull one past it', () => {
    // (lines of 44 glyphs end at 72 + 44 × 6 = 336, the overfull one at 342: less than its size past the shared end)
    expect(m1!.lines[0]!.slice(7, 9)).toEqual([72, 336])
  })
  it('pins a line whose baseline holds another unit’s text within its block, and none other', () => {
    expect(m0!.lines.map((l) => l[9] & 2)).toEqual([0, 0, 0])
    expect(m1!.lines[0]![9] & 2).toBe(0)
    // (the one-line paragraph's baseline holds the next unit's text, outside its own block's span: alone; the next unit's
    // first line holds the paragraph's text before it, within its block's span (its second line starts at the column): pinned)
    const m2 = at.members[2]!
    expect(m2.lines.map((l) => l[9] & 2)).toEqual([2, 0])
  })
  it('reads a labelled line’s column from its label’s start, as today’s block begins at the label drawn anew', () => {
    // (two columns of three paragraph lines, 72-192 and 320-440; a caption across them, its label at 150 and its words from
    // 250: the words' middle stands in the right column, the block's in neither, so its column is the page's text area)
    const left = 'l'.repeat(20),
      right = 'r'.repeat(20)
    const B2 = docOf([
      {
        lines: [
          ...[700, 688, 676].flatMap((y) => [
            { text: left, x: 72, y },
            { text: right, x: 320, y },
          ]),
          { text: 'T9.', x: 150, y: 600 },
          { text: 'c'.repeat(37), x: 250, y: 600 },
        ],
      },
    ])
    const cap: InstrumentUnit = {
      id: unitId('caption', [text('T9. c')]),
      kind: 'caption',
      content: [text('T9. c')],
    }
    // (glyph j: each column's lines a paragraph of its own, then the caption's label and words)
    const own = (_: number, j: number): [number, number, number] =>
      j < 120 ? [Math.floor(j / 20) % 2, ROLE.text, -1] : j < 123 ? [2, ROLE.label, -1] : [2, ROLE.text, -1]
    const L = locate(instrument(B2, [para(left), para(right), cap], own), B2, align(B2, B2))
    expect(L.members[2]!.lines[0]!.slice(7, 9)).toEqual([72, 472])
  })
})
