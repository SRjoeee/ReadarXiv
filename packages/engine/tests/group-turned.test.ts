// A unit whose text TeX set turned reads its base face off its glyphs as a level one does (locate/group-style.ts through
// geometry.ts, docs/PDF-READER.md §18.114): its glyphs are the turned reading's (Member.turned), not its level text's, and the
// group style's reading ran on its level glyphs alone, so a turned caption wholly in `\emph` kept the face most of its glyphs
// hold, italic, and the typesetter's \emph turned its text upright (2610.19282v1 p11 and p15, the captions of two sideways
// figures, `\emph{{\bf …} for fixed …}`, CMTI10 on arXiv's page). Words of our own.
import { type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc, DocTurned } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const text = (s: string): Piece => ({ t: 'text', s })
/** a page with a level line and the words set a quarter turned, from (60, 400) along it, 6 a glyph, one word a line, each
 *  glyph in the font `fontOf` names by its line and its place in it */
const withTurned = (words: string[], fontOf: (line: number, j: number) => string): Doc => {
  const d = docOf([{ lines: ['Method 0.91'] }])
  const T: DocTurned[] = []
  words.forEach((w, li) => {
    const [x, y] = [60 + 12 * li, 400]
    for (const [j, u] of [...w].entries())
      T.push({
        u,
        code: u.codePointAt(0) as number,
        base: fontOf(li, j),
        n: 1 + li,
        k: j,
        at: 11,
        box: -1,
        ox: x,
        oy: y + 6 * j,
        ex: x,
        ey: y + 6 * (j + 1),
        ux: 0,
        uy: 1,
        size: 10,
        ascent: 0.7,
        descent: -0.2,
        form: false,
      })
  })
  d.pages[0]!.turned = T
  return d
}
const located = (
  units: InstrumentUnit[],
  words: string[],
  fontOf: (line: number, j: number) => string,
  pieceOf: (line: number) => number = () => -1,
) => {
  const B = withTurned(words, fontOf)
  const A = withTurned(words, fontOf)
  const n = B.pages[0]!.turned!.length
  // (each turned glyph the unit's text, or an element's where `pieceOf` names its piece by its line)
  const lineOf = words.flatMap((w, li) => [...w].map(() => li))
  const piece = Int32Array.from(lineOf, (li) => pieceOf(li))
  const role = Uint8Array.from(lineOf, (li) => (pieceOf(li) >= 0 ? ROLE.element : ROLE.text))
  const ins: Instrument = {
    ink: B,
    units,
    glyphs: B.pages.map((pg) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((_, j) => {
        O.unit[j] = 0
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    turned: [{ unit: new Int32Array(n).fill(1), role, piece }],
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
  return locate(ins, A, align(B, A))
}

describe('a unit TeX set turned reads its base face off its turned glyphs', () => {
  it('a caption wholly in \\emph, a bold lead in it: its base upright, the \\emph turned back, as a level one’s', () => {
    const content: Piece[] = [
      {
        t: 'span',
        id: '0',
        style: 'italic',
        open: '\\emph{',
        close: '}',
        content: [
          { t: 'span', id: '1', style: 'bold', open: '{\\bf', close: '}', content: [text('Runs')] },
          text(' of the set'),
        ],
      },
    ]
    const caption: InstrumentUnit = {
      id: unitId('caption', content),
      kind: 'caption',
      content,
      spans: [
        ['0', { cmd: 'emph' }],
        ['1', { cmd: 'bf' }],
      ],
    }
    const para: InstrumentUnit = {
      id: unitId('para', [text('Method 0.91')]),
      kind: 'para',
      content: [text('Method 0.91')],
    }
    // ("Runs" in TeX's bold italic, the rest in its italic: every glyph italic, the caption's own face upright under \emph)
    const L = located([para, caption], ['Runs', 'of', 'the', 'set'], (li) => (li === 0 ? 'CMBXTI10' : 'CMTI10'))
    const cap = L.members[1]!
    expect(cap.frame).toEqual([0, 1])
    expect(cap.style.slant).toBeUndefined()
    expect(cap.style.bold).toBeUndefined()
  })
  it('a symbol it draws as text where it stands, set turned: its turned glyph tells the marks’ weight, as a level one’s', () => {
    // (a sideways table's head `\\textbf{Mean tokens} $\\downarrow$`: the arrow cmsy's, regular, its glyph the element's turned
    // glyph (Member.turnedEls); read off the level elements' glyphs alone, it had none, and the marks' base was the letters', bold)
    const content: Piece[] = [
      { t: 'span', id: '0', style: 'bold', open: '\\textbf{', close: '}', content: [text('Mean tokens')] },
      text(' '),
      { t: 'el', id: '2', kind: 'math', src: '$\\downarrow$' },
    ]
    const head: InstrumentUnit = {
      id: unitId('cell', content),
      kind: 'cell',
      content,
      spans: [['0', { cmd: 'textbf' }]],
      classes: [['2', { cls: 'symbol', sym: ['↓'] }]],
    }
    const para: InstrumentUnit = {
      id: unitId('para', [text('Method 0.91')]),
      kind: 'para',
      content: [text('Method 0.91')],
    }
    const L = located(
      [para, head],
      ['Mean', 'tokens', '↓'],
      (li) => (li === 2 ? 'CMSY10' : 'CMBX10'),
      (li) => (li === 2 ? 2 : -1),
    )
    const cell = L.members[1]!
    expect(cell.frame).toEqual([0, 1])
    expect(cell.style.bold).toBe(1)
    expect(cell.markFace).toEqual({})
  })
})
