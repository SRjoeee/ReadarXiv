// What is not text in a unit TeX set turned stays the original's ink, turned with it (docs/PDF-READER.md §18.113): an element
// (a formula, a `\ref`, a `\cite`) is stated as every element is, its ink a box per line of the unit's in the frame (its crop,
// cut from the original's turned ink, drawn through the turn), its glyphs travelling with it (`.e`); its label read as a level
// caption's (its name, number and punctuation: the structural-names rule draws it anew in the target's words), its glyphs its
// label's (`.l`); an element of no ink states which of three it is by the instrument's facts alone.
import { type Piece, read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import type { DocTurned } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, type PieceClass, ROLE } from '../src/instrument.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const text = (s: string): Piece => ({ t: 'text', s })
/** a run of a unit's turned text: its characters, their role and piece (an element's), their size and their drop below the
 *  line's baseline (a subscript's) */
type Run = { s: string; role?: number; piece?: number; size?: number; drop?: number }
/** a page with a level line and lines of runs set a quarter turned (0, 1): each line from (60 + 12 q, 400) up the page, 6 a
 *  glyph along it (its frame's x from 400, its baseline -60 - 12 q) */
const pageOf = (lines: Run[][]) => {
  const d = docOf([{ lines: ['Method 0.91'] }])
  const T: DocTurned[] = []
  const owner: [number, number][] = []
  lines.forEach((runs, q) => {
    let j = 0
    for (const r of runs)
      for (const u of [...r.s]) {
        const size = r.size ?? 10
        const [x, y] = [60 + 12 * q + (r.drop ?? 0), 400 + 6 * j]
        T.push({
          u,
          code: u.codePointAt(0) as number,
          base: 'CMR10',
          n: 1 + q,
          k: j,
          at: 11,
          box: -1,
          ox: x,
          oy: y,
          ex: x,
          ey: y + 6,
          ux: 0,
          uy: 1,
          size,
          ascent: 0.7,
          descent: -0.2,
          form: false,
        })
        owner.push([r.role ?? ROLE.text, r.piece ?? -1])
        j++
      }
  })
  d.pages[0]!.turned = T
  return { d, owner }
}
const runOf = (
  content: Piece[],
  lines: Run[][],
  more: Partial<InstrumentUnit> = {},
  extra: Partial<Instrument> = {},
  kind = 'cell',
) => {
  const level: InstrumentUnit = {
    id: unitId('cell', [text('Method 0.91')]),
    kind: 'cell',
    content: [text('Method 0.91')],
  }
  const unit: InstrumentUnit = { id: unitId(kind, content), kind, content, ...more }
  const B = pageOf(lines).d
  const A = pageOf(lines).d
  const { owner } = pageOf(lines)
  const ins: Instrument = {
    ink: B,
    units: [level, unit],
    glyphs: B.pages.map((pg) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((_, j) => {
        O.unit[j] = 0
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    turned: [
      {
        unit: new Int32Array(owner.length).fill(1),
        role: Uint8Array.from(owner.map(([r]) => r)),
        piece: Int32Array.from(owner.map(([, k]) => k)),
      },
    ],
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
    ...extra,
  }
  const L = locate(ins, A, align(B, A))
  const addOn: AddOn = {
    bytes: new Uint8Array([1, 2, 3]),
    pages: new Map([[1, { ok: true }]]),
    groups: new Set([...L.groups[0]!.glyphs, ...L.groups[0]!.turned].filter((g): g is string => g !== null)),
    ocgs: new Map(),
    lost: new Set(),
    stats: {} as AddOn['stats'],
  }
  const original = new Uint8Array(70000).map((_, i) => i & 255)
  const objs = [
    ...bundle({ ins, located: L, addOn, original, paper: { id: '2501.00001', version: 1, pages: 1 }, made: 't' }),
  ]
  const part = objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }> | undefined
  return { L, part: part ? read('part', part.bytes) : null, mem: L.members[1]! }
}
const E = ROLE.element

describe('an element inside a unit TeX set turned', () => {
  it('states a turned cell’s inline formula as an element: its ink a box on its line in the frame, its glyphs travelling', () => {
    // (2608.12502v1's header cells, \rotatebox{90}{\textbf{Before ($t_1$)}}: the formula's t and its subscript 1, dropped 2)
    const content: Piece[] = [text('Before ('), { t: 'el', id: '1', kind: 'math', src: '$t_1$' }, text(')')]
    const { mem, L, part } = runOf(
      content,
      [[{ s: 'Before (' }, { s: 't', role: E, piece: 1 }, { s: '1', role: E, piece: 1, size: 7, drop: 2 }, { s: ')' }]],
      { classes: [['1', { cls: 'other' } as PieceClass]] },
    )
    expect(mem).toMatchObject({ located: true, frame: [0, 1] })
    expect(mem.cause).toBeUndefined()
    // (its one line in the frame, from 400 to 466 along it, its baseline -60; the formula from 448 to 460, the subscript's band
    // under the line's: 62 - 2 + 0.2 * 7)
    expect(mem.lines.map((l) => [l[2], l[3], l[4]])).toEqual([[400, 466, -60]])
    const el = new Map(mem.elements).get('1')!
    expect(el.ink).toEqual([[1, 448, -63.4, 460, -53, -60]])
    // (its glyphs its element's group, the text's its text's)
    const groups = L.groups[0]!.turned
    expect(groups.slice(8, 10)).toEqual([`${mem.ord}.1.e`, `${mem.ord}.1.e`])
    expect(groups[0]).toBe(`${mem.ord}.1.t`)
    expect(part!.frames![0]!.flows.flat()[0]!.els).toEqual([
      ['1', expect.objectContaining({ kind: 'other', ink: el.ink })],
    ])
  })
  it('states a turned caption’s \\ref and \\cite as elements, each its crop’s ink on its line, the caption framed', () => {
    // (2610.38516v1's sideways captions "… (Sect. 4.2)."; 2608.18626v1's with a citation)
    const content: Piece[] = [
      text('Runs (Sect.'),
      { t: 'el', id: '1', kind: 'space', src: '~' },
      { t: 'el', id: '2', kind: 'ref', src: '\\ref{s}' },
      text(') of'),
      { t: 'el', id: '4', kind: 'cite', src: '\\cite{a}' },
      text('.'),
    ]
    const { mem } = runOf(
      content,
      [
        [{ s: 'Runs (Sect. ' }, { s: '4.2', role: E, piece: 2 }, { s: ') of' }],
        [{ s: '[7]', role: E, piece: 4 }, { s: '.' }],
      ],
      {
        classes: [
          ['1', { cls: 'space' } as PieceClass],
          ['2', { cls: 'num' } as PieceClass],
          ['4', { cls: 'cite' } as PieceClass],
        ],
      },
      {},
      'caption',
    )
    expect(mem).toMatchObject({ located: true, frame: [0, 1] })
    expect(mem.lines.map((l) => l[4])).toEqual([-60, -72])
    const els = new Map(mem.elements)
    expect(els.get('2')!.ink).toEqual([[1, 472, -62, 490, -53, -60]])
    expect(els.get('4')!.ink).toEqual([[1, 400, -74, 418, -65, -72]])
    // (the tie of no ink: a space's, no statement)
    expect(els.get('1')).toEqual({ kind: 'space', ink: [] })
  })
  it('states an element of no ink by the instrument’s facts alone: TeX set nothing (empty), else not found', () => {
    // (#668's statement: TeX's points prove it set nothing, El.text ''; neither proven nor outside, no statement, and the
    // typesetter leaves the unit the original's. B's level stream between its points, empty for any turned unit, proves nothing)
    const content: Piece[] = [text('Runs '), { t: 'el', id: '1', kind: 'ref', src: '\\ref{s}' }, text(' of')]
    const lines: Run[][] = [[{ s: 'Runs of' }]]
    const classes: InstrumentUnit['classes'] = [['1', { cls: 'num' } as PieceClass]]
    const proven = runOf(content, lines, { classes }, { empty: [{ unit: 1, piece: '1' }] }).mem
    expect(new Map(proven.elements).get('1')).toEqual({ kind: 'ref', ink: [], text: '' })
    const unproven = runOf(content, lines, { classes }).mem
    expect(new Map(unproven.elements).get('1')).toEqual({ kind: 'ref', ink: [] })
  })
  it('reads a turned caption’s label as a level caption’s: its name, number and punctuation, its glyphs its label’s', () => {
    // (2610.38776v1 p20's sideways "Figure 14:", left the original's: drawn anew in the target's words by the structural-names
    // rule, PDF-READER §19.11, as a level caption's is)
    const content: Piece[] = [text('Runs of the set')]
    const { mem, L, part } = runOf(
      content,
      [[{ s: 'Figure 14: ', role: ROLE.label }, { s: 'Runs of the set' }]],
      { float: 'figure' },
      {},
      'caption',
    )
    expect(mem).toMatchObject({ located: true, frame: [0, 1] })
    expect(mem.labelAt).toMatchObject({
      kind: 'float',
      ink: [1, 400, -62, 460, -53, -60],
      line: 0,
      name: ['Figure', [1, 400, -62, 436, -53, -60]],
      num: ['14', [1, 442, -62, 454, -53, -60]],
      punct: [':', [1, 454, -62, 460, -53, -60]],
    })
    expect(L.groups[0]!.turned.slice(0, 10).every((g) => g === `${mem.ord}.1.l`)).toBe(true)
    expect(part!.frames![0]!.flows.flat()[0]!.label).toMatchObject({ kind: 'float', float: 'figure', line: 0 })
  })
})
