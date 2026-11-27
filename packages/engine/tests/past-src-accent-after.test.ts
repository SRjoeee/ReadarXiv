// The text after a display found where TeX set an accented letter as two glyphs. TeX's \accent (OT1's \', and any letter a font
// has no precomposed glyph of) ships the accent's own glyph, a spacing accent such as U+00B4, before the letter: "An étale" is
// "A", "n", "´", "e", "t", … on B. A display has no closing point (TeX sets none on the empty list it resumes the paragraph
// with), so its opening point alone is read to the text after it (followsOf's `want`, the first WANT characters of that text).
// Compared glyph by glyph in NFKC (stream.ts textStarts, charOf), the spacing accent was a combining mark alone and never the
// letter "é": the text after the display was not found, its reading LOST, its rows left in the text's range, and the paragraph
// stayed the original's (`unlocated: text past its source`). Both sides are compared as Unicode decomposes them (NFKD), a mark
// set as a glyph of its own standing with its letter. The stream is written here as B ships it (each glyph 5 pt wide at 10 pt),
// in content of our own.
import { describe, expect, it } from 'vitest'
import { type Glyph, packGlyphs } from '../src/ink.ts'
import { followsOf } from '../src/marks/marks.ts'
import { OWNED, OWNED_HOW, ownedOf, STREAM_COLUMNS, type StreamPage } from '../src/own/stream.ts'
import type { SourceUnit } from '../src/source/latex-front.ts'

type Item = string | { at: string }
/** a page from items in stream order: a string is glyphs on the current line (each character one glyph, a space 3 pt, `\n` the
 *  next line 12 pt down), `{ at }` a point */
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
        glyphs.push({
          u,
          x0: x,
          x1: x + 5,
          y,
          top: y + 7,
          bottom: y - 2,
          size: 10,
          font: 'F',
          ix0: x,
          ix1: x + 5,
        } as Glyph)
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
/** a source unit's text: its file's bytes read latin1, as the source reader reads them ("é" its two UTF-8 bytes) */
const bytes = (t: string) => String.fromCharCode(...new TextEncoder().encode(t))
const E_ACUTE = 'é'
const ACUTE = '´'
/** unit 1: text, a display, the paragraph TeX resumes after it, whose first word is `first` (the source's) */
const UNITS = (first: string) => [
  unit('para', []),
  unit('para', [
    { t: 'text', s: 'We define ' },
    { t: 'ph', src: '\\[ a = b \\]' },
    { t: 'text', s: bytes(`\n${first} module is one.`) },
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
/** what the display owns, the source's first word after it `first`: its glyphs, or its how */
function display(word: string, first = `An ${E_ACUTE}tale`): string | null {
  const page = pageOf(STREAM(word))
  const follows = followsOf(UNITS(first) as never, new Set(page.points.map((p) => p.name)))
  const e = ownedOf([page], { follows, erasure: true }).get('p1.1a')
  if (!e) return null
  return e.how < OWNED ? e.glyphs.map(([, g]) => page.glyphs.u[g]).join('') : (OWNED_HOW[e.how] as string)
}
const NOT_FOUND = 'open, the text after it not found'

describe('the text after a display, its first word set with an accent of its own glyph', () => {
  it('a precomposed glyph: the display owns its row', () => {
    expect(display(`An ${E_ACUTE}tale`)).toBe('a=b')
  })

  it("TeX's \\accent, the spacing accent's glyph before the letter: the display owns its row", () => {
    expect(display(`An ${ACUTE}etale`)).toBe('a=b')
  })

  it('a mark set after its letter (a cedilla a font composes under it): the display owns its row', () => {
    expect(display('A fac¸ade', 'A façade')).toBe('a=b')
  })

  it('no accent on either side: compared as before', () => {
    expect(display('As we see', 'As we see')).toBe('a=b')
    expect(display('As we sea', 'As we see')).toBe(NOT_FOUND)
  })

  it('another letter under the same accent is no match, nor the letter under another accent', () => {
    expect(display(`An ${ACUTE}atale`)).toBe(NOT_FOUND)
    expect(display('An átale')).toBe(NOT_FOUND)
    expect(display('An `etale')).toBe(NOT_FOUND)
    expect(display('An ètale')).toBe(NOT_FOUND)
  })
})
