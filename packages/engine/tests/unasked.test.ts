// A unit TeX never sets is not asked of a translator (G, PDF-READER §18.111). The ownership states a unit whose marks the marked
// original carries and of which TeX set no point `why: 'marks'` (own/own.ts); owning no glyph of B, the locate leaves it
// unlocated so (place.ts: `unlocated: marks`): nothing of it is on a page, and what TeX printed of it, where it printed any, is an
// ink unit's of its own, asked as that. The bundle's units, what the reader asks a translator for, held every unit of the
// instrument's but a babel name's word: the false branch of a conditional, the keywords a class never prints, a title thrown
// away were asked and their rows never shown. Now such a unit is left out of the units, unless another unit asked holds it (a
// nested unit's content names it); every other unit as before.
import { read, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import { bundle } from '../src/bundle/bundle.ts'
import type { Doc } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import type { AddOn } from '../src/wrap/wrap.ts'
import { docOf } from './helpers/doc.ts'
import { locate } from './helpers/locate.ts'

const text = (s: string) => ({ t: 'text' as const, s })
const unitOf = (kind: string, s: string, more: Partial<InstrumentUnit> = {}): InstrumentUnit => {
  const content = [text(s)]
  return { id: unitId(kind, content), kind, content, ...more }
}
function instrumentOf(B: Doc, units: InstrumentUnit[], own: number[][]): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((g, j) => {
        O.unit[j] = own[p]?.[g.n] ?? -1
        O.role[j] = ROLE.text
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}
/** the kinds and texts of the units the bundle asks a translator for */
function askedOf(units: InstrumentUnit[], own: number[][], lines: string[]) {
  const B = docOf([{ lines }])
  const ins = instrumentOf(B, units, own)
  const L = locate(ins, B, align(B, B))
  const addOn = {
    bytes: new Uint8Array([1, 2, 3]),
    pages: new Map([[1, { ok: true }]]),
    groups: new Set(L.groups.flatMap((g) => g.glyphs.filter((x): x is string => x !== null))),
    ocgs: new Map(),
    lost: new Set(),
    stats: {},
  } as unknown as AddOn
  const objects = [
    ...bundle({
      ins,
      located: L,
      addOn,
      original: new Uint8Array(10),
      paper: { id: '2501.00001', version: 1, pages: 1 },
      made: 'test',
    }),
  ]
  return {
    members: L.members.map((m) => [m.located, m.cause ?? null]),
    asked: objects
      .flatMap((x) => (x.kind === 'units' ? read('units', x.bytes, x.digest).units : []))
      .map((u) => u.kind),
  }
}

describe('a unit TeX never sets is not asked of a translator', () => {
  it('a unit of no glyph whose points TeX never set (why marks) is left out; its neighbours asked as before', () => {
    const units = [
      unitOf('heading', 'A Title'),
      unitOf('para', 'A paragraph of ours.'),
      unitOf('para', 'The branch of ours TeX never takes.', { why: 'marks' }),
      unitOf('para', 'Another paragraph.'),
    ]
    const got = askedOf(units, [[0, 1, 3]], ['A Title', 'A paragraph of ours.', 'Another paragraph.'])
    expect(got.members[2]).toEqual([false, 'marks'])
    expect(got.asked).toEqual(['heading', 'para', 'para'])
  })
  it('a unit of no glyph unlocated otherwise (no ink, no mark of its own asked) is asked as before', () => {
    const units = [unitOf('para', 'A paragraph of ours.'), unitOf('footnote', 'A note of ours set nowhere here.')]
    const got = askedOf(units, [[0]], ['A paragraph of ours.'])
    expect(got.members[1]![0]).toBe(false)
    expect(got.members[1]![1]).not.toBe('marks')
    expect(got.asked).toEqual(['para', 'footnote'])
  })
})
