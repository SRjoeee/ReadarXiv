// The text after a display found where TeX set an accented letter as two glyphs. TeX's \accent (OT1's \', and any letter a font
// has no precomposed glyph of) ships the accent's own glyph, a spacing accent such as U+00B4, before the letter: "An étale" is
// "A", "n", "´", "e", "t", … on B. A display has no closing point (TeX sets none on the empty list it resumes the paragraph
// with), so its opening point alone is read to the text after it (followsOf's `want`, the first WANT characters of that text,
// NFKC). Compared glyph by glyph in NFKC (stream.ts textStarts, charOf), the spacing accent is a combining mark alone and never
// the letter "é": the text after the display was not found, its reading LOST, its rows left in the text's range, and the
// paragraph stayed the original's (`unlocated: text past its source`). RED in phase 1 of lane past-src: no product code moved.
// The stream is written here as B ships it (each glyph 5 pt wide at 10 pt), in content of our own.
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { followsOf } from '../src/marks/marks.ts'
import { OWNED, OWNED_HOW, ownedOf, STREAM_COLUMNS, type StreamPage } from '../src/own/stream.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'

type Item = string | { at: string }
/** a page from items in stream order: a string is glyphs on the current line (each character one glyph, a space 3 pt, `\n` the
 *  next line 12 pt down), `{ at }` a point; `[…]` in a string is one glyph of those characters */
function pageOf(items: readonly Item[]): StreamPage {
  const glyphs: Glyph[] = [],
    points: { name: string; glyph: number; box: number }[] = [],
    boxAt: number[] = []
  let x = 72,
    y = 700
  for (const it of items) {
    if (typeof it !== 'string') {
      points.push({ name: it.at, glyph: glyphs.length, box: 0 })
      continue
    }
    for (const u of it) {
      if (u === ' ') x += 3
      else if (u === '\n') {
        x = 72
        y -= 12
      } else {
        glyphs.push({ u, x0: x, x1: x + 5, y, top: y + 7, bottom: y - 2, size: 10, font: 'F', ix0: x, ix1: x + 5 } as Glyph)
        boxAt.push(0)
        x += 5
      }
    }
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
/** unit 1: text, a display, the paragraph TeX resumes after it, whose first word holds an accented letter */
const UNITS = [
  unit('para', []),
  unit('para', [
    { t: 'text', s: 'We define ' },
    { t: 'ph', src: '\\[ a = b \\]' },
    // (a source unit's text is its file's bytes read latin1, as the source reader reads them: "é" its two UTF-8 bytes)
    { t: 'text', s: '\nAn Ã©tale module is one.' },
  ]),
]
/** the column's body as B ships the paragraph; `word` the first word after the display as TeX set its glyphs */
const STREAM = (word: string): Item[] => [
  { at: 'bs1' },
  { at: '1s' },
  'We define',
  { at: 'p1.1a' },
  '\na = b\n',
  word,
  ' module is one.',
  { at: '1e' },
  { at: 'be1' },
]
/** what the display owns: its glyphs, or its how */
function display(items: readonly Item[]): string | null {
  const page = pageOf(items)
  const follows = followsOf(UNITS as never, new Set(page.points.map((p) => p.name)))
  const e = ownedOf([page], { follows, erasure: true }).get('p1.1a')
  if (!e) return null
  return e.how < OWNED ? e.glyphs.map(([, g]) => page.glyphs.u[g]).join('') : (OWNED_HOW[e.how] as string)
}

describe('the text after a display, its first word set with an accent of its own glyph', () => {
  it('a precomposed glyph: the display owns its row (the control)', () => {
    expect(display(STREAM('An étale'))).toBe('a=b')
  })

  it("TeX's \\accent, the spacing accent's glyph before the letter: the display owns its row", () => {
    expect(display(STREAM('An ´etale'))).toBe('a=b')
  })
})
