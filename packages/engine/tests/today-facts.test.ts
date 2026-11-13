// The facts the typesetter consumes, stated by today's definitions (lane L7, the converge lane): a line's size and baseline as
// today's maker reads them, a unit's size as today's reader reads it (its text glyphs' sizes, up the line), a line pinned as
// today's edgesOf reads it alone, and its measure as today's columnOf reads its column. Each on ink made by hand.
import { type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { DocGlyph } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { fakedCaps, unitSize } from '../src/locate/facts.ts'
import { cutLines, lineSize } from '../src/locate/lines.ts'
import { locate } from './helpers/locate.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

/** a glyph; a space the font's, whose outline is empty: no extent across or up from its origin (ink.mjs's reading) */
const g = (u: string, x: number, y: number, size = 10, o: Partial<DocGlyph> = {}): DocGlyph => ({
  u,
  code: u.codePointAt(0) ?? 0,
  font: 'NimbusRomNo9L-Regu',
  base: 'NimbusRomNo9L-Regu',
  x0: x,
  x1: x + 0.5 * size,
  y,
  top: u === ' ' ? y : y + 0.7 * size,
  bottom: u === ' ' ? y : y - 0.2 * size,
  size,
  ix0: x,
  ix1: u === ' ' ? x : x + 0.5 * size,
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
  it('starts a line where an indented continuation stands beside a tall formula: ink overlap alone shares no line', () => {
    // (cloud Codex on fa6e1c089: 10 pt text from x 72 on baseline 700 with an inline formula whose ink reaches down to 680, then
    // an item's second line from x 85 on baseline 688, indented: back left, not to the line's start, its ink inside the
    // formula's but under the line's text: one line read for two, the member a row short)
    const gs = [
      ...[...'item text'].map((u, i) => g(u, 72 + 5 * i, 700, 10)),
      g('∑', 125, 690, 10, { bottom: 680, top: 708 }),
      ...[...'more'].map((u, i) => g(u, 140 + 5 * i, 700, 10)),
      ...[...'continued'].map((u, i) => g(u, 85 + 5 * i, 688, 10)),
    ]
    const lines = cutLines(
      gs.map((_, i) => i),
      (i) => ({ page: 1, g: gs[i]! }),
    )
    expect(lines.map((l) => [l.base, l.x0])).toEqual([
      [700, 72],
      [688, 85],
    ])
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
  it('starts a line back at its start where a glyph’s ink stands wholly off the line’s text, whatever its origin', () => {
    // (2610.21504v1 p4: a formula broken after its "=" at a row's end (baseline 109.26), the next row opening with a summation
    // sign whose origin TeX's math extension sets at its top, 104.78, within half a size of the row above, its ink 94.82 to
    // 104.78, all under that row's text; then the row's text on 97.31, 12 pt under: two lines, the unit's and its formula's
    // alike, not one across both rows, which one crop then took a whole line for)
    const sum = g('∑', 72, 104.78, 10, { bottom: 94.82, top: 104.78 })
    const row = [...'text r='].map((u, i) => g(u, 72 + 5 * i, 109.26, 10))
    const next = [...'rj(s,a). Each'].map((u, i) => g(u, 82 + 5 * i, 97.31, 10))
    const cut = (gs: DocGlyph[]) =>
      cutLines(
        gs.map((_, i) => i),
        (i) => ({ page: 1, g: gs[i]! }),
      ).map((l) => [l.base, l.x0, l.gs.length])
    expect(cut([...row, sum, ...next])).toEqual([
      [109.26, 72, 6],
      [97.31, 72, 13],
    ])
    // (the formula's own glyphs: its end on the row, its start back at the column's start)
    expect(cut([...row.slice(5), sum, ...next.slice(0, 2)])).toEqual([
      [109.26, 97, 2],
      [97.31, 72, 3],
    ])
  })
})

describe('a unit’s size, today’s reader’s (L2:765 originalStyle, L2:188 pageChars2)', () => {
  it('is the median of its text glyphs’ sizes up the line, the size TeX was asked for, its math fonts aside', () => {
    // (pdfTeX's font expansion scales a justified line's glyphs along it alone, to justify it: 2610.40645v1 p12 t80, three
    // lines 2 % wide, 11.127 along and 10.909 up (\normalsize, 10.95 pt), read 11.13 along, where TeX set every glyph at 10.91.
    // A paragraph of lines expanded 1.7 % and shrunk 2 %, set at 9.96)
    const wide = [...'expanded'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96, { along: 10.13 }))
    const narrow = [...'shrunk'].map((u, i) => g(u, 72 + 5 * i, 676, 9.96, { along: 9.76 }))
    const plain = [...'line'].map((u, i) => g(u, 72 + 5 * i, 688, 9.96))
    const math = [...'xyzw'].map((u, i) => g(u, 120 + 5 * i, 688, 7, { base: 'CMMI7' }))
    expect(unitSize([...wide, ...plain, ...math])).toBe(9.96)
    expect(unitSize([...wide, ...narrow])).toBe(9.96)
    expect(unitSize(math)).toBeUndefined()
    // (faked small capitals aside: IEEEtran's "Experiments" as "E" at 9.96 and "XPERIMENTS" at 7.97 is set at 9.96, its share
    // 0.8; an ink unit's, whose source is its own text, by its capitals' sizes alone)
    const head = [g('E', 72, 700, 9.96), ...[...'XPERIMENTS'].map((u, i) => g(u, 80 + 5 * i, 700, 7.97))]
    const caps = fakedCaps(head, 'Experiments')
    expect(caps.small.size).toBe(10)
    expect(caps.ratio).toBe(0.8)
    expect(unitSize(head.filter((x) => !caps.small.has(x)))).toBe(9.96)
    expect(fakedCaps(head, null, true).ratio).toBe(0.8)
    // (in the text's capitals only where the source's lowercase letters are set as capitals at their full size: a
    // \MakeTextUppercase heading; faked small capitals are no case change)
    expect(caps.upper).toBeUndefined()
    expect(
      fakedCaps(
        [...'EXPERIMENTS'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96)),
        'Experiments',
      ).upper,
    ).toBe(true)
    expect(
      fakedCaps(
        [...'Experiments'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96)),
        'Experiments',
      ).small.size,
    ).toBe(0)
    // (in the text's capitals where every letter of the source is lowercase and set as a capital, REVTeX's
    // "RELATED WORK" of `related work`: no letter of the source's own case gives a size to tell a small capital by, and drawn
    // at the unit's size, theirs, the target's capitals look as the page's do; no capital is drawn larger than it stands)
    const allChanged = [...'RELATEDWORK'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96))
    expect(fakedCaps(allChanged, 'related work')).toMatchObject({ upper: true })
    expect(fakedCaps(allChanged, 'related work').small.size).toBe(0)
    // (an ink unit, its source the page's own text: in the text's capitals where every letter of it that can tell is a capital,
    // a running head's "ABSTRACT"; its faked small capitals no case change, "R" at 12 and "EFERENCES" at 9.6)
    const abstract = [...'ABSTRACT'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96))
    expect(fakedCaps(abstract, 'ABSTRACT', true)).toMatchObject({ upper: true })
    const refs = [g('R', 72, 700, 12), ...[...'EFERENCES'].map((u, i) => g(u, 80 + 5 * i, 700, 9.6))]
    expect(fakedCaps(refs, 'REFERENCES', true)).toMatchObject({ ratio: 0.8 })
    expect(fakedCaps(refs, 'REFERENCES', true).upper).toBeUndefined()
    expect(
      fakedCaps(
        [...'Abstract'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96)),
        'Abstract',
        true,
      ).upper,
    ).toBeUndefined()
    // (a lowercase letter among them: set in its own case, which the translator reads and keeps, a figure's "BERT (Ours)")
    expect(
      fakedCaps(
        [...'BERT(Ours)'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96)),
        null,
      ).upper,
    ).toBeUndefined()
    expect(
      fakedCaps(
        [...'MMLU'].map((u, i) => g(u, 72 + 5 * i, 700, 9.96)),
        null,
      ).upper,
    ).toBe(true)
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
  // (each unit's text its glyphs': a member claims no more letters than its source writes)
  const text0 = (n: number) => (pages[0]!.lines[n] as { text: string }).text
  const a = para(`${text0(0)} ${text0(1)} ${text0(2)}`)
  const d = para(text0(3))
  const e = para(`${text0(4)} ${text0(5)}`)
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
      id: unitId('caption', [text(`T9. ${'c'.repeat(37)}`)]),
      kind: 'caption',
      content: [text(`T9. ${'c'.repeat(37)}`)],
    }
    // (glyph j: each column's lines a paragraph of its own, then the caption's label and words)
    const own = (_: number, j: number): [number, number, number] =>
      j < 120 ? [Math.floor(j / 20) % 2, ROLE.text, -1] : j < 123 ? [2, ROLE.label, -1] : [2, ROLE.text, -1]
    const L = locate(
      instrument(B2, [para(`${left} ${left} ${left}`), para(`${right} ${right} ${right}`), cap], own),
      B2,
      align(B2, B2),
    )
    expect(L.members[2]!.lines[0]!.slice(7, 9)).toEqual([72, 472])
  })
})

describe('a unit set in small capitals, today’s vote (L2:933 capsVote, L2:1094)', () => {
  // (today drew a unit's Latin translation in small capitals where most of its letters that can tell are: a faked small
  // capital votes for, a letter its source writes lowercase set as itself against, the rest (digits, the source's own
  // capitals) nothing, a tie against; Style.sc alone, the share, is stated wherever one faked small capital stands)
  const word = (s: string, x: number, size: number) => [...s].map((u, i) => g(u, x + 5 * i, 700, size))
  it('states it of a heading whose lowercase letters are faked small capitals', () => {
    const head = [g('E', 72, 700, 9.96), ...word('XPERIMENTS', 80, 7.97)]
    expect(fakedCaps(head, 'Experiments')).toMatchObject({ ratio: 0.8, caps: true })
  })
  it('states none of a paragraph with one word in them, its share stated', () => {
    const mixed = [
      ...word('We use the', 72, 9.96),
      g('A', 130, 700, 9.96),
      ...word('CME', 136, 7.97),
      ...word('tool', 160, 9.96),
    ]
    const caps = fakedCaps(mixed, 'We use the \\textsc{Acme} tool')
    expect(caps.ratio).toBe(0.8)
    expect(caps.caps).toBeUndefined()
  })
  it('states it of an ink unit whose capitals are faked small ones (its source its own text)', () => {
    const refs = [g('R', 72, 700, 12), ...word('EFERENCES', 80, 9.6)]
    expect(fakedCaps(refs, 'REFERENCES', true)).toMatchObject({ ratio: 0.8, caps: true })
  })
})
