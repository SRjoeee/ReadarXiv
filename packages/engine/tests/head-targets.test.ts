// The head's targets (docs/PDF-READER.md §20): each landing locate makes stated once a paper in the head, sorted by destination;
// none where nothing lands; every other object of the bundle as it was.
import { type Head, read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { type BundleObject, bundle } from '../src/bundle/bundle.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import type { DestPoint } from '../src/locate/dests.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const B = docOf([
  {
    lines: [
      { text: 'Smith J. A paper.', y: 700 },
      { text: 'Jones K. Another.', y: 676 },
      { text: 'Some theorem text.', y: 640 },
    ],
  },
])
const unitOf = (kind: string, s: string, entry?: true): InstrumentUnit => {
  const content = [{ t: 'text' as const, s }]
  return { id: unitId(kind, content), kind, content, ...(entry ? { entry } : {}) }
}
const units = [
  unitOf('reference', 'Smith J. A paper.', true),
  unitOf('reference', 'Jones K. Another.', true),
  unitOf('theorem', 'Some theorem text.'),
]
const ins: Instrument = {
  ink: B,
  units,
  glyphs: B.pages.map((pg) => {
    const O = ownersOf(pg.glyphs.length)
    pg.glyphs.forEach((g, j) => {
      O.unit[j] = g.n
      O.role[j] = ROLE.text
    })
    return O
  }),
  boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
  tex: {},
  made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
}
function objectsOf(dests?: Map<string, DestPoint | null>): BundleObject[] {
  const L = locate(ins, B, align(B, B), dests ? { dests } : {})
  const addOn = {
    bytes: new Uint8Array([1, 2, 3]),
    pages: new Map([[1, { ok: true }]]),
    groups: new Map(L.members.map((m) => [`${m.ord}.1.t`, []])),
  } as unknown as AddOn
  return [
    ...bundle({
      ins,
      located: L,
      addOn,
      original: new Uint8Array(10),
      paper: { id: '2501.00001', version: 1, pages: 1 },
      made: 'test',
    }),
  ]
}
const headOf = (xs: BundleObject[]): Head => {
  const x = xs.find((o) => o.kind === 'head')!
  return read('head', x.bytes, x.digest)
}

describe('the head’s targets', () => {
  const dests = new Map<string, DestPoint | null>([
    ['"cite.jones"', { page: 1, x: 72, y: 690 }],
    ['"cite.smith"', { page: 1, x: 72, y: 712 }],
    ['"thm.1"', { page: 1, x: 72, y: 652 }],
    ['"gone"', null],
  ])
  it('states each landing as a Target, sorted by destination; one landing on nothing covered is absent', () => {
    const head = headOf(objectsOf(dests))
    expect(head.targets).toEqual([
      ['"cite.jones"', 'reference', 1, 1, [72, 674, 174, 683]],
      ['"cite.smith"', 'reference', 1, 0, [72, 698, 174, 707]],
    ])
  })
  it('a destination past the format’s 2,048 characters is left out, the head written and every other landing kept', () => {
    const long = `"${'x'.repeat(2047)}"`
    const head = headOf(objectsOf(new Map([...dests, [long, { page: 1, x: 72, y: 712 }]])))
    expect(head.targets?.map((t) => t[0])).toEqual(['"cite.jones"', '"cite.smith"'])
  })
  it('a head of a paper with no landing has no targets field: its bytes the same as a head made with no destination', () => {
    const none = objectsOf(new Map([['"thm.1"', { page: 1, x: 72, y: 652 }]]))
    const head = none.find((o) => o.kind === 'head')!
    expect(headOf(none)).not.toHaveProperty('targets')
    expect(head.bytes).toEqual(objectsOf().find((o) => o.kind === 'head')!.bytes)
  })
  it('the parts, the units and the add-on are byte for byte the same with targets or none: only the head moves', () => {
    const strip = (xs: BundleObject[]) => xs.filter((o) => o.kind !== 'head').map((o) => [o.kind, o.digest])
    expect(strip(objectsOf(dests))).toEqual(strip(objectsOf()))
    const { targets: _, ...rest } = headOf(objectsOf(dests))
    expect(rest).toEqual(headOf(objectsOf()))
  })
})
