// A unit's end mark (docs/PDF-READER.md §18.52; the coordinator's ruling of 2026-11-12): what TeX pushed to the end of the unit's
// last line after its text belongs to the end of the unit, claimed as its element of no piece (El.end, El.trail) in its
// travelling group, no stay of any member's. Decided by what TeX set: the ink after the unit's end point in B's stream, up to
// the next unit's ink or mark, on its last line, after its last glyph, its box's right edge at the line's measure end. Pages
// made by hand: each glyph 6 pt wide at 10 pt, a page's lines from x 72; no paper's text.
import { type El, type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { END, locate } from './helpers/locate.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const T = ROLE.text
const E = ROLE.element
/** a unit of `kind` over `content`, its elements' classes `classes` */
const unitOf = (kind: string, content: Piece[], classes?: InstrumentUnit['classes']): InstrumentUnit => ({
  id: unitId(kind, content),
  kind,
  content,
  ...(classes ? { classes } : {}),
})
const text = (s: string) => ({ t: 'text' as const, s })
/** an instrument whose B lines each give their glyphs one owner, `lines[line]` its [unit, role, piece] (-1 none), its boxes none */
const ownedBy = (B: Doc, units: InstrumentUnit[], lines: [number, number, number][]): Instrument => ({
  ink: B,
  units,
  glyphs: B.pages.map((pg) => {
    const O = ownersOf(pg.glyphs.length)
    pg.glyphs.forEach((g, j) => {
      const [u, role, piece] = lines[g.n] ?? [-1, T, -1]
      O.unit[j] = u
      O.role[j] = role
      O.piece[j] = piece
    })
    return O
  }),
  boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
  tex: {},
  made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
})
/** B made by hand, its points stated where TeX shipped them: each [name, glyph, boxes before it] */
const docWith = (page: PageSpec, points: [string, number, number][]): Doc => {
  const B = docOf([page])
  B.pages[0]!.points = points.map(([name, glyph, box]) => ({ name, glyph, box }))
  return B
}
/** amsthm's `\openbox` as TeX ships it: four rules, its right edge at `x1`, on the baseline `y` (7 pt square), after glyph `at` */
const openbox = (at: number, x1: number, y: number): NonNullable<PageSpec['boxes']> => [
  [at, 0, x1 - 7, y, x1 - 6.6, y + 7],
  [at, 0, x1 - 7, y + 6.6, x1, y + 7],
  [at, 0, x1 - 7, y, x1, y + 0.4],
  [at, 0, x1 - 0.4, y, x1, y + 7],
]
const L40 = 'x'.repeat(40)
const proof = unitOf('theorem', [text(`${L40} yyyy.`)])
const next = unitOf('heading', [text('Next')])

describe('a unit’s end mark is the unit’s, wherever its translation ends (El.end)', () => {
  it('claims amsthm’s QED box TeX pushed to the end of a proof’s last line, in the unit’s travelling group, no stay', () => {
    // (2610.40645v1 p12 t80: `\end{proof}` sets `\qed` after the unit's end point, `\hfill\quad\openbox`, four rules of no
    // unit's at the measure's end (312, the page's text area here). Left there (Room.stays, in no group), a translation a line
    // longer stood it beside a line mid-paragraph)
    const B = docWith(
      {
        lines: [
          { text: L40, y: 700 },
          { text: 'yyyy.', y: 688 },
          { text: 'Next', y: 664 },
        ],
        boxes: openbox(45, 312, 688),
      },
      [
        ['0s', 0, 0],
        ['0e', 45, 0],
        ['h1s', 45, 4],
        ['1e', 49, 4],
      ],
    )
    const L = locate(
      ownedBy(
        B,
        [proof, next],
        [
          [0, T, -1],
          [0, T, -1],
          [1, T, -1],
        ],
      ),
      B,
      align(B, B),
    )
    const p = L.members[0]!
    expect(p.elements).toEqual([
      [END, { kind: 'other', copy: '', ink: [[1, 305, 688, 312, 695, 688]], trail: 1, end: 1 } satisfies El],
    ])
    expect(p.room.stays).toBeUndefined()
    expect(L.groups[0]!.boxes).toEqual(['0.1.e', '0.1.e', '0.1.e', '0.1.e'])
    // (the unit after it untouched)
    expect(L.members[1]!.elements).toEqual([])
  })

  it('claims a mark an author redefined, glyphs as rules, by where TeX pushed it, never by its shape (\\qedsymbol "QED")', () => {
    const B = docWith(
      {
        lines: [
          { text: L40, y: 700 },
          { text: 'yyyy.', y: 688 },
          { text: 'QED', x: 312 - 18, y: 688 },
          { text: 'Next', y: 664 },
        ],
      },
      [
        ['0e', 45, 0],
        ['h1s', 48, 0],
      ],
    )
    const L = locate(
      ownedBy(
        B,
        [proof, next],
        [
          [0, T, -1],
          [0, T, -1],
          [-1, T, -1],
          [1, T, -1],
        ],
      ),
      B,
      align(B, B),
    )
    const p = L.members[0]!
    expect(p.elements).toEqual([
      [END, { kind: 'other', copy: 'QED', ink: [[1, 294, 686, 312, 695, 688]], trail: 1, end: 1 }],
    ])
    expect(p.room.stays).toBeUndefined()
    expect(L.groups[0]!.glyphs.slice(45, 48)).toEqual(['0.1.e', '0.1.e', '0.1.e'])
    // (its glyphs are no line of the unit's: the last line ends at the text's end)
    expect(p.lines.at(-1)![3]).toBe(102)
  })

  it('leaves a run that free ink of no unit follows on another line before the next unit’s: the paragraph goes on', () => {
    // (2610.11256v1's apacite references: each unit holds its authors alone, its year and title no unit's, after them on its line
    // at the measure's end and on the next; read as the line's run, the year and the title's first words were claimed and moved.
    // And the next heading's number no unit owns, on the next line (2610.16663v1 p55 t277): its box left a stay, as before)
    const B = docWith(
      {
        lines: [
          { text: L40, y: 700 },
          { text: 'yyyy.', y: 688 },
          { text: '(2024).', x: 312 - 42, y: 688 },
          { text: 'Title', y: 676 },
          { text: 'Next', y: 652 },
        ],
      },
      [
        ['0e', 45, 0],
        ['h1s', 57, 0],
      ],
    )
    const L = locate(
      ownedBy(
        B,
        [proof, next],
        [
          [0, T, -1],
          [0, T, -1],
          [-1, T, -1],
          [-1, T, -1],
          [1, T, -1],
        ],
      ),
      B,
      align(B, B),
    )
    expect(L.members[0]!.elements).toEqual([])
    expect(L.members[0]!.room.stays).toEqual([[1, 270, 686, 312, 695]])
  })

  it('takes the mark off every member of a row it shares: a proof’s head and its text on one line, the mark the text’s', () => {
    // (2610.40645v1 p19 t145/t146: "Proof of Proposition 2.4." a heading member, the proof's one line of text after it on the row,
    // the QED box at the row's end stated a stay of both)
    const head = unitOf('heading', [text('Head.')])
    const body = unitOf('theorem', [text('body.')])
    const B = docWith(
      {
        lines: [
          { text: L40, y: 700 },
          { text: 'Head.', y: 688 },
          { text: 'body.', x: 108, y: 688 },
          { text: 'Next', y: 664 },
        ],
        boxes: openbox(50, 312, 688),
      },
      [
        ['h1s', 40, 0],
        ['1e', 45, 0],
        ['2s', 45, 0],
        ['2e', 50, 0],
        ['h3s', 50, 4],
      ],
    )
    const L = locate(
      ownedBy(
        B,
        [unitOf('para', [text(L40)]), head, body, next],
        [
          [0, T, -1],
          [1, T, -1],
          [2, T, -1],
          [3, T, -1],
        ],
      ),
      B,
      align(B, B),
    )
    const [, h, t] = L.members
    expect(h!.elements).toEqual([])
    expect(t!.elements.map(([id, e]) => [id, e.end])).toEqual([[END, 1]])
    expect([h!.room.stays, t!.room.stays]).toEqual([undefined, undefined])
  })

  it('leaves a mark TeX set after a space, not pushed to the measure’s end, where it stands (2608.25210v2’s example)', () => {
    // (its class ends the environment `{$\square$\smallskip}`: the mark after the text's space, 59 pt short of the measure end)
    const B = docWith(
      {
        lines: [
          { text: L40, y: 700 },
          { text: 'yyyy.', y: 688 },
          { text: '#', x: 102 + 3, y: 688 },
          { text: 'Next', y: 664 },
        ],
      },
      [
        ['0e', 45, 0],
        ['h1s', 46, 0],
      ],
    )
    const L = locate(
      ownedBy(
        B,
        [proof, next],
        [
          [0, T, -1],
          [0, T, -1],
          [-1, T, -1],
          [1, T, -1],
        ],
      ),
      B,
      align(B, B),
    )
    const p = L.members[0]!
    expect(p.elements).toEqual([])
    expect(p.room.stays).toEqual([[1, 105, 686, 111, 695]])
    expect(L.groups[0]!.glyphs[45]).toBeNull()
  })

  it('leaves a mark TeX set on a line of its own under the text where it stands (amsthm after a display or a list)', () => {
    const B = docWith(
      {
        lines: [
          { text: L40, y: 700 },
          { text: 'yyyy.', y: 688 },
          { text: 'Next', y: 652 },
        ],
        boxes: openbox(45, 312, 676),
      },
      [
        ['0e', 45, 0],
        ['h1s', 45, 4],
      ],
    )
    const L = locate(
      ownedBy(
        B,
        [proof, next],
        [
          [0, T, -1],
          [0, T, -1],
          [1, T, -1],
        ],
      ),
      B,
      align(B, B),
    )
    expect(L.members[0]!.elements).toEqual([])
    expect(L.groups[0]!.boxes).toEqual([null, null, null, null])
  })

  it('states no element of the unit an end mark: the year a reference ends with on a full last line, the author’s `\\qed`', () => {
    // (the unit's last element at its last line's measure end after a word's space is no fact of a push: 2608.06007v1's
    // references, their year field ending a full line; the author's `\qed` (2610.21176v1 p13 t102), its `\hfill` in its
    // setting, reads the same. Both stay where the translation sets them, as before)
    const ref = unitOf(
      'reference',
      [text(`${L40} ${'z'.repeat(36)} `), { t: 'el', id: '1', kind: 'other', src: '2015.' }],
      [['1', { cls: 'other' }]],
    )
    const B = docWith(
      {
        lines: [
          { text: L40, y: 700 },
          { text: 'z'.repeat(36), y: 688 },
          { text: '20.', x: 72 + 36 * 6 + 6, y: 688 },
          { text: 'Next', y: 664 },
        ],
      },
      [
        ['0e', 79, 0],
        ['h1s', 79, 0],
      ],
    )
    const L = locate(
      ownedBy(
        B,
        [ref, next],
        [
          [0, T, -1],
          [0, T, -1],
          [0, E, 1],
          [1, T, -1],
        ],
      ),
      B,
      align(B, B),
    )
    const el = new Map(L.members[0]!.elements).get('1')!
    // (its line's measure the page's text area's right edge, 312: the year flush to it, a word's space after the text)
    expect([el.ink, L.members[0]!.lines.at(-1)![8]]).toEqual([[[1, 294, 686, 312, 695, 688]], 312])
    expect(el.end).toBeUndefined()
    expect(L.members[0]!.elements.map(([id]) => id)).toEqual(['1'])
  })

  it('leaves a mark inside a display (`\\qedhere` in `\\[ \\]`) its display’s: the display stays where TeX set it, the mark with it', () => {
    const para = unitOf(
      'para',
      [text(`${L40} we have `), { t: 'el', id: '1', kind: 'display', src: '\\[x=a \\qedhere\\]' }],
      [['1', { cls: 'display' }]],
    )
    const B = docWith(
      {
        lines: [
          { text: L40, y: 700 },
          { text: 'we have', y: 688 },
          { text: 'x=a', x: 180, y: 668 },
          { text: '#', x: 306, y: 668 },
          { text: 'Next', y: 644 },
        ],
      },
      [
        ['0e', 51, 0],
        ['h1s', 51, 0],
      ],
    )
    const L = locate(
      ownedBy(
        B,
        [para, next],
        [
          [0, T, -1],
          [0, T, -1],
          [0, E, 1],
          [0, E, 1],
          [1, T, -1],
        ],
      ),
      B,
      align(B, B),
    )
    const el = new Map(L.members[0]!.elements).get('1')!
    expect(el.end).toBeUndefined()
    expect(el.keep).toBe(1)
    expect(L.members[0]!.elements.map(([id]) => id)).toEqual(['1'])
  })
})
