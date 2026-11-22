// RED (lane turned, the fix not built): a source unit whose text TeX set turned is placed with its direction and its run, as a
// figure text set turned already is (locate/page-units.ts `mem.dir`, locate/facts-pass.ts its run): the typesetter lays a
// member along `dir` from its run (lay/figures.ts, lay/lit.ts), and a member stated with no direction is laid level over a
// box that stands upright on the page. Today the direction is a figure unit's alone (`unit.figure.dir`): a table's header
// cell set by \rotatebox{90}{…}, its turned glyphs its own, would be placed as level text.
import { read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import type { Doc, DocTurned } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const text = (s: string) => ({ t: 'text' as const, s })
const unitOf = (kind: string, s: string, more: Partial<InstrumentUnit> = {}): InstrumentUnit => {
  const content = [text(s)]
  return { id: unitId(kind, content), kind, content, ...more }
}
/** a page with a level line and a header cell's word set a quarter turned, up the page from (60, 400), 6 a glyph */
const withTurned = (): Doc => {
  const d = docOf([{ lines: ['Method 0.91'] }])
  d.pages[0]!.turned = [...'Recall'].map(
    (u, j): DocTurned => ({
      u,
      code: u.codePointAt(0) as number,
      base: 'CMR10',
      n: 1,
      k: j,
      at: 11,
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

describe('a table cell set turned (RED: the fix is not built)', () => {
  it('is placed with its direction and its run, and its part states them', () => {
    const B = withTurned()
    const A = withTurned()
    const units = [unitOf('cell', 'Method 0.91'), unitOf('cell', 'Recall')]
    // (the instrument's owners as the fix makes them: the turned glyphs the second cell's text, own/own.ts reading them)
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
      turned: [
        { unit: new Int32Array(6).fill(1), role: new Uint8Array(6).fill(ROLE.text), piece: new Int32Array(6).fill(-1) },
      ],
      tex: {},
      made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
    }
    const L = locate(ins, A, align(B, A))
    const cell = L.members[1]!
    expect(cell).toMatchObject({ located: true, kind: 'cell', pages: [1] })
    expect(cell.dir).toEqual([0, 1])
    // (its run: its first glyph's origin and its box's length along its direction)
    expect(cell.run?.slice(0, 3)).toEqual([60, 400, 36])
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
    const part = objs.find((o) => o.kind === 'part') as Extract<(typeof objs)[number], { kind: 'part' }>
    const placed = read('part', part.bytes)
      .flows.flat()
      .find((x) => x.ord === cell.ord)
    expect(placed).toMatchObject({ kind: 'cell', dir: [0, 1] })
  })
})
