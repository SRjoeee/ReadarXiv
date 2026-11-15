// The head of a reduced prepare (design-performance Q2): `reduced` where the instrument's `made` says its marked compile left
// the optional classes' points out (front.ts prepareFront), nothing where it does not; the bundle otherwise as it is.
import { read } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import { type Instrument, ownersOf, ROLE } from '../src/instrument.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const B = docOf([{ lines: ['A line of words'], points: [] }])
const instrument = (made: Instrument['made']): Instrument => ({
  ink: B,
  units: [],
  glyphs: B.pages.map((pg) => {
    const O = ownersOf(pg.glyphs.length)
    pg.glyphs.forEach((_, j) => {
      O.unit[j] = -1
      O.role[j] = ROLE.text
    })
    return O
  }),
  boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
  tex: {},
  made,
})
const headOf = (ins: Instrument) => {
  const L = locate(ins, B, align(B, B))
  const addOn: AddOn = { bytes: new Uint8Array([1, 2, 3]), pages: new Map([[1, { ok: true }]]) } as AddOn
  const x = [
    ...bundle({
      ins,
      located: L,
      addOn,
      original: new Uint8Array(10),
      paper: { id: '2501.00001', version: 1, pages: 1 },
      made: 'test',
    }),
  ].find((o) => o.kind === 'head')!
  return read('head', x.bytes, x.digest)
}

describe('the head of a reduced prepare', () => {
  it('states `reduced` where the instrument was made reduced, and nothing else of it', () => {
    const plain = headOf(instrument({ compiler: 'pdflatex', tree: '2025', front: 'today' }))
    expect(plain).not.toHaveProperty('reduced')
    const reduced = headOf(instrument({ compiler: 'pdflatex', tree: '2025', front: 'today', reduced: true }))
    expect(reduced.reduced).toBe(true)
    const { reduced: _, ...rest } = reduced
    expect(rest).toEqual(plain)
  })
})
