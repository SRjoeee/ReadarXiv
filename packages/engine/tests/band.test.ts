// A cell's clear band (Room.band) and the side of it no rule stands on (Room.bandOpen): the typesetter reads the band's two edges
// as the table's rules over and under the cell, so a side with no rule must say so, or the line's own top or bottom stated there
// caps the cell as a rule would (2602.23285v2 p7 t55, a cell under its table's top rule alone: about 0.9, where today's cellBands
// found no rule under it and capped nothing).
import { unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { locate } from '../src/locate/locate.ts'
import { docOf } from './helpers/doc.ts'

const cell = (s: string): InstrumentUnit => {
  const content = [{ t: 'text' as const, s }]
  return { id: unitId('cell', content), kind: 'cell', content, cell: { table: 0, row: 0, col: 0 } }
}
/** a one-cell page: "Model" on baseline 700 from x 72 (its glyphs' box 698 to 707), the given rules across x 60 to 300 */
function roomOf(rules: [y0: number, y1: number][]) {
  const B = docOf([
    { lines: [{ text: 'Model', x: 72, y: 700 }], boxes: rules.map(([y0, y1]) => [0, 0, 60, y0, 300, y1]) },
  ])
  const ins: Instrument = {
    ink: B,
    units: [cell('Model')],
    glyphs: B.pages.map((pg) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((_, j) => {
        O.unit[j] = 0
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
  return locate(ins, B, align(B, B)).members[0]!.room
}

describe('a cell’s band and the side of it no rule stands on', () => {
  it('states both rules and no open side where rules stand over and under the cell', () => {
    const r = roomOf([
      [712, 712.4],
      [695, 695.4],
    ])
    expect(r.band).toEqual([695.4, 712])
    expect(r.bandOpen).toBeUndefined()
  })
  it('states the side with no rule open: under (1), over (2); the band there its line’s own bottom or top, as before', () => {
    const over = roomOf([[712, 712.4]])
    expect(over.band).toEqual([698, 712])
    expect(over.bandOpen).toBe(1)
    const under = roomOf([[695, 695.4]])
    expect(under.band).toEqual([695.4, 707])
    expect(under.bandOpen).toBe(2)
    expect(roomOf([]).band).toBeUndefined()
  })
})
