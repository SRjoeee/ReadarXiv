// A display whose next mark in its own region is another unit's start: a note TeX shipped into the body between the display
// and the text after it. A display has no closing mark (TeX resumes the paragraph on an empty list), so its opening point alone
// reads to the text after it; where a class sets a column's footnotes inside the body it brackets (REVTeX's ltxgrid does), the
// note's whole unit, its label and its marks, stands between them in the same region. The reading stopped at the note's start
// with the text after it not found there, the display was LOST, its glyphs and the note's label were read as its paragraph's
// text, the locate counted more letters than the source writes (`text past its source`) and the whole paragraph stayed the
// original's. The display's ink is what its region holds from its point to that unit's start, the glyphs on the start's line
// before it (the note's label) left out, where that unit's marks close right before the text after it. The marked compile's
// stream as B ships it is written here (each glyph 5 pt wide at 10 pt), in content of our own.
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { followsOf } from '../src/marks/marks.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'
import { OWNED, OWNED_HOW, ownedOf, STREAM_COLUMNS, type StreamPage } from '../src/own/stream.ts'

type Item = string | { at: string }
/** a page from items in stream order: a string is glyphs on the current line (a space 3 pt, `\n` the next line 12 pt down,
 *  `\f` a line 200 pt down: a column's foot), `{ at }` a point */
function pageOf(items: readonly Item[]): StreamPage {
  const glyphs: Glyph[] = [],
    points: { name: string; glyph: number; box: number }[] = [],
    boxAt: number[] = []
  let x = 72,
    y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const u of it) {
        if (u === ' ') x += 3
        else if (u === '\n' || u === '\f') {
          x = 72
          y -= u === '\n' ? 12 : 200
        } else {
          glyphs.push({ u, x0: x, x1: x + 5, y, top: y + 7, bottom: y - 2, size: 10, font: 'F', ix0: x, ix1: x + 5 } as Glyph)
          boxAt.push(0)
          x += 5
        }
      }
    } else points.push({ name: it.at, glyph: glyphs.length, box: 0 })
  }
  return {
    glyphs: packGlyphs(glyphs, { columns: STREAM_COLUMNS }),
    boxes: [],
    points,
    boxAt: Int32Array.from(boxAt),
    view: [0, 0, 612, 792],
  } as StreamPage
}
const unit = (kind: string, pieces: SourceUnit<null>['pieces']): SourceUnit<null> => ({
  file: null,
  kind,
  start: 0,
  end: 0,
  pieces,
})
/** unit 1: text, a display (or two), the text after it; unit 0 or 2: the note TeX ships between them */
const para = (displays: number) =>
  unit('para', [
    { t: 'text', s: 'We have ' },
    ...Array.from({ length: displays }, (_, i) => [
      { t: 'ph' as const, src: `\\begin{equation} a = b${i} \\end{equation}` },
      { t: 'text' as const, s: '\n' },
    ]).flat(),
    { t: 'text', s: 'where it holds.' },
  ])
const NOTE = unit('footnote', [{ t: 'text', s: 'A note of ours.' }])
/** the body as B ships it: the paragraph's start, its line, the display's opening point and its rows, then the note's label
 *  and the note at the column's foot (`note`: its unit's id), then the text after the display at the next column's head */
const STREAM = (o: { note: number; displays?: number; closes?: boolean; region?: 'body' | 'other' }): Item[] => {
  const d = o.displays ?? 1
  const rows: Item[] = []
  for (let i = 0; i < d; i++) {
    if (i === 0) rows.push({ at: 'p1.1a' })
    rows.push(`\na=b${i}(${i + 1})`)
  }
  const note: Item[] = [`\f${o.note}`, { at: `${o.note}s` }, 'Anoteofours.', ...(o.closes === false ? [] : [{ at: `${o.note}e` }])]
  return [
    { at: 'bs1' },
    { at: '1s' },
    'Wehave',
    ...rows,
    ...(o.region === 'other' ? [{ at: 'be1' }, { at: 'fs1' }, ...note, { at: 'fe1' }, { at: 'bs2' }] : note),
    '\nwhereitholds.',
    { at: '1e' },
    { at: o.region === 'other' ? 'be2' : 'be1' },
  ]
}
/** what the display owns, as the marking and the stream read it: its glyphs, or its how */
function display(o: Parameters<typeof STREAM>[0]): string | null {
  const units = o.note === 0 ? [NOTE, para(o.displays ?? 1)] : [unit('para', []), para(o.displays ?? 1), NOTE]
  const page = pageOf(STREAM(o))
  const follows = followsOf(units as never, new Set(page.points.map((p) => p.name)))
  const e = ownedOf([page], { follows, erasure: true }).get('p1.1a')
  if (!e) return null
  return e.how < OWNED ? e.glyphs.map(([, g]) => page.glyphs.u[g]).join('') : (OWNED_HOW[e.how] as string)
}

describe("a display before a note TeX ships into its own body region, the text after it past the note's marks", () => {
  it("owns its rows to the note's start, the note's label left out: a note set later in the source", () => {
    expect(display({ note: 2 })).toBe('a=b0(1)')
  })

  it("the same where the note's unit is an earlier one (its unit ends before the paragraph's in the source)", () => {
    expect(display({ note: 0 })).toBe('a=b0(1)')
  })

  it("two displays, the later with no point of its own: the first owns both, up to the note's start", () => {
    expect(display({ note: 2, displays: 2 })).toBe('a=b0(1)a=b1(2)')
  })

  it("a note shipped into another region (a float's): read as before, past the other region's marks", () => {
    expect(display({ note: 2, region: 'other' })).toBe('a=b0(1)')
  })

  it("the other side: the note's marks do not close before the text after it: nothing is owned", () => {
    expect(display({ note: 2, closes: false })).toBe('open, the text after it not found')
  })
})
