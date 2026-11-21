// TeX's statement of the displays it set at a unit's pieces (instrument/instrument.ts texDisplaysOf, PDF-READER §18.95), read off
// B's pages as the instrument holds them: a piece's opening mark `p<u>.<k>a` among a page's points, a display's region (its
// `dps<n>`/`dpe<n>` points, pageInk's `regions`), and each glyph's owner. A display is the piece's where its region begins at the
// piece's mark and holds its ink by the one test (ink.ts inDisplay: at least half its glyphs inside a display, not in its text
// mode), or where a piece with no mark of its own has its ink so; never a piece's whose mark stands there with no ink of it (a
// paper's `\iffalse` macro the display after its `\fi` starts at), nor one a glyph stands between. Then the content and the
// classes as the statement has them (stateDisplays): the kind, the class and the stop a display's source sets at its end
import type { Piece } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { ownersOf, type PieceClass, ROLE } from '../src/instrument.ts'
import { stateDisplays, texDisplaysOf } from '../src/instrument/instrument.ts'
import { displayStop } from '../src/instrument/mt.ts'

/** a page of `n` glyphs: its points ([name, glyph]), its regions, and each glyph's owner ([unit, piece] for an element's, null for
 *  the unit's text or none) */
function page(
  n: number,
  points: [string, number][],
  regions: { kind: string; from: number; to: number }[],
  own: ([number, number] | null)[],
) {
  const O = ownersOf(n)
  own.forEach((x, j) => {
    if (!x) return
    O.unit[j] = x[0]
    O.role[j] = ROLE.element
    O.piece[j] = x[1]
  })
  return { pg: { points: points.map(([name, glyph]) => ({ name, glyph, box: 0 })), regions }, O }
}
const statedOf = (...ps: ReturnType<typeof page>[]) =>
  Object.fromEntries(
    [
      ...texDisplaysOf(
        ps.map((p) => p.pg),
        ps.map((p) => p.O),
      ),
    ].map(([u, ids]) => [u, [...ids].sort()]),
  )

describe('texDisplaysOf: the displays TeX set at the pieces', () => {
  it("states a paper's macro a display where TeX's display starts at its mark and holds its ink", () => {
    // (unit 3: text, then piece 1 (`\be … \ee`) at glyph 4: its region 4-10, its glyphs 4-9 and the number (1) at 10-12 outside)
    const p = page(
      14,
      [
        ['3s', 0],
        ['p3.1a', 4],
        ['3e', 14],
      ],
      [{ kind: 'display', from: 4, to: 10 }],
      [null, null, null, null, [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], [3, 1], null],
    )
    expect(statedOf(p)).toEqual({ 3: ['1'] })
  })
  it('counts the glyphs TeX set in a display’s text mode outside it, and a piece mostly so is none', () => {
    const own: [number, number][] = Array.from({ length: 6 }, () => [0, 2])
    const p = page(
      6,
      [['p0.2a', 0]],
      [
        { kind: 'display', from: 0, to: 6 },
        { kind: 'dtext', from: 0, to: 4 },
      ],
      own,
    )
    expect(statedOf(p)).toEqual({})
    const q = page(
      6,
      [['p0.2a', 0]],
      [
        { kind: 'display', from: 0, to: 6 },
        { kind: 'dtext', from: 0, to: 3 },
      ],
      own,
    )
    expect(statedOf(q)).toEqual({ 0: ['2'] })
  })
  it('never states a piece whose mark the display starts at with no glyph of it (a paper’s \\iffalse before a \\fi)', () => {
    // (piece 5 sets nothing; piece 9, the display after the `\fi`, has no mark of its own and owns the display's glyphs)
    const p = page(
      6,
      [['p1.5a', 0]],
      [{ kind: 'display', from: 0, to: 6 }],
      [
        [1, 9],
        [1, 9],
        [1, 9],
        [1, 9],
        [1, 9],
        [1, 9],
      ],
    )
    expect(statedOf(p)).toEqual({ 1: ['9'] })
  })
  it('never states a piece whose mark a glyph stands after before the display starts, nor one whose ink lies outside every display', () => {
    const p = page(
      8,
      [
        ['p2.1a', 0],
        ['p2.3a', 4],
      ],
      [{ kind: 'display', from: 1, to: 4 }],
      [
        [2, 1],
        [2, 1],
        [2, 1],
        [2, 1],
        [2, 3],
        [2, 3],
        [2, 3],
        [2, 3],
      ],
    )
    expect(statedOf(p)).toEqual({})
  })
  it('states a piece with no mark of its own where its ink lies in a display (the piece after another display)', () => {
    const p = page(
      8,
      [['p4.1a', 0]],
      [
        { kind: 'display', from: 0, to: 4 },
        { kind: 'display', from: 4, to: 8 },
      ],
      [
        [4, 1],
        [4, 1],
        [4, 1],
        [4, 1],
        [4, 2],
        [4, 2],
        [4, 2],
        [4, 2],
      ],
    )
    expect(statedOf(p)).toEqual({ 4: ['1', '2'] })
  })
  it('reads a display broken over two pages as one ink', () => {
    const a = page(4, [['p6.1a', 2]], [{ kind: 'display', from: 2, to: 4 }], [null, null, [6, 1], [6, 1]])
    const b = page(4, [['7s', 4]], [{ kind: 'display', from: 0, to: 2 }], [[6, 1], [6, 1], [6, 1], null])
    expect(statedOf(a, b)).toEqual({ 6: ['1'] })
  })
})

describe('stateDisplays: the content and the classes as the statement has them', () => {
  const content = (): Piece[] => [
    { t: 'text', s: 'The sum is ' },
    { t: 'el', id: '1', kind: 'macro', src: '\\be w = a + b. \\end{equation}' },
    { t: 'text', s: ' Then ' },
    { t: 'span', id: '3', style: 'bold', content: [{ t: 'el', id: '4', kind: 'macro', src: '\\al{x &= y,}' }] },
    { t: 'el', id: '6', kind: 'macro', src: '\\kw' },
  ]
  const pieces = [
    { t: 'text', s: 'The sum is ' },
    { t: 'ph', src: '\\be w = a + b. \\end{equation}' },
    { t: 'text', s: ' Then ' },
    { t: 'open', id: 1, src: '\\textbf{' },
    { t: 'ph', src: '\\al{x &= y,}' },
    { t: 'close', id: 1, src: '}' },
    { t: 'ph', src: '\\kw' },
  ] as never
  it('states each element TeX set a display at `display`, in its kind and its class, its stop read as a display’s', () => {
    const c = content()
    const classes = new Map<string, PieceClass>([
      ['1', { cls: 'other', copy: 'w = a + b.' }],
      ['4', { cls: 'other', unknown: true }],
      ['6', { cls: 'macro', text: 'keyword' }],
    ])
    stateDisplays(c, new Set(['1', '4']), pieces, classes)
    expect(c[1]).toEqual({ t: 'el', id: '1', kind: 'display', src: '\\be w = a + b. \\end{equation}', stop: '.' })
    expect((c[3] as { content: Piece[] }).content[0]).toEqual({
      t: 'el',
      id: '4',
      kind: 'display',
      src: '\\al{x &= y,}',
    })
    expect(c[4]).toEqual({ t: 'el', id: '6', kind: 'macro', src: '\\kw' })
    expect(classes.get('1')).toEqual({ cls: 'display', copy: 'w = a + b.' })
    expect(classes.get('4')).toEqual({ cls: 'display' })
    expect(classes.get('6')).toEqual({ cls: 'macro', text: 'keyword' })
  })
  it('reads the stop of a source TeX set a display for as a spelled display’s, and none of one it did not', () => {
    expect(displayStop('\\be w = a + b. \\end{equation}', true)).toBe('.')
    expect(displayStop('\\be w = a + b. \\end{equation}')).toBe(null)
    expect(displayStop('\\begin{equation} w = a + b, \\end{equation}')).toBe(',')
    expect(displayStop('\\begin{equation} w = a + b, \\end{equation}', false)).toBe(null)
  })
})
