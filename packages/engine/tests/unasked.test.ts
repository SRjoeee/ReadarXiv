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
function askedOf(
  units: InstrumentUnit[],
  own: number[][],
  lines: string[],
  located: ((u: InstrumentUnit, i: number) => InstrumentUnit) | null = null,
) {
  const B = docOf([{ lines }])
  const ins = instrumentOf(B, units, own)
  const L0 = locate(ins, B, align(B, B))
  const L = located ? { ...L0, units: (L0.units ?? units).map(located) } : L0
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
  const asked = objects.flatMap((x) => (x.kind === 'units' ? read('units', x.bytes, x.digest).units : []))
  return {
    members: L.members.map((m) => [m.located, m.cause ?? null]),
    asked: asked.map((u) => u.kind),
    askedIds: asked.map((u) => u.id),
    // (the texts the parts' members name: a unit's id, its own or the one it echoes)
    texts: objects
      .flatMap((x) => (x.kind === 'part' ? read('part', x.bytes, x.digest).flows.flat() : []))
      .map((m) => (m as { text?: unknown }).text)
      .filter((t): t is string => typeof t === 'string'),
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
  it('a name the left-out unit writes is still the block’s: the variant of a unit asked that holds it is asked as before', () => {
    // (2608.14557v1: its authors' units TeX never set, their names drawn from the ink units of the block TeX printed; the names
    // the reader translates with the block, §19.15, are read from the authors' units, and a unit asked that holds one has its
    // form with the name, kind `named`)
    const units = [
      unitOf('author', 'Ann Lee', { why: 'marks' }),
      unitOf('affiliation', 'Ann Lee'),
      unitOf('para', 'We thank Ann Lee for the data.'),
    ]
    const got = askedOf(units, [[1, 2]], ['Ann Lee', 'We thank Ann Lee for the data.'])
    expect(got.members[0]).toEqual([false, 'marks'])
    expect(got.asked).toEqual(['affiliation', 'para', 'named'])
  })
  it('a heading and an abstract TeX never set are asked as before: the reader’s contents list the one, every translation’s context is the other', () => {
    // (packages/reader session/contents.ts listedOf: every unit of kind heading after the front, its title its row, its page the
    // original's outline where no part places it — a heading TeX set whose marks a class took off owns no glyph and is listed so;
    // session/rows.ts contextOf: the units of kind abstract, the context a translator is given with every batch)
    const units = [
      unitOf('para', 'A paragraph of ours.'),
      unitOf('heading', 'A Heading of Ours', { why: 'marks' }),
      unitOf('abstract', 'The abstract of ours.', { why: 'marks' }),
    ]
    const got = askedOf(units, [[0]], ['A paragraph of ours.'])
    expect(got.members[1]).toEqual([false, 'marks'])
    expect(got.members[2]).toEqual([false, 'marks'])
    expect(got.asked).toEqual(['para', 'heading', 'abstract'])
  })
  it('a name of the paper’s TeX never set on a page is asked as before: every theorem head of that name reads its row', () => {
    // (a unit of kind `name` with no babel name: the paper's own name of a theorem's kind, \newtheorem{lemma}{Lemma}, which no
    // page waits on and each head of its kind reads, packages/typeset lay/entry.ts, PDF-READER §19.14)
    const units = [unitOf('para', 'A paragraph of ours.'), unitOf('name', 'Lemma', { why: 'marks' })]
    const got = askedOf(units, [[0]], ['A paragraph of ours.'])
    expect(got.members[1]).toEqual([false, 'marks'])
    expect(got.asked).toEqual(['para', 'name'])
  })
  it('a unit a part’s member names is asked as before: a unit an ink unit echoes, whose row that member is drawn with', () => {
    // (locate/ink-units.ts's echo: the printed text of a unit TeX set without its points, read off the page as an ink unit whose
    // letters are the unit's, names that unit as its member's text, bundle.ts placedOf; written here as the located units' echo
    // of the paragraph whose member is placed: 68 members of 5 papers over the corpus' main and holdout parts, chain m2)
    const units = [
      unitOf('para', 'A caption TeX set without its points.'),
      unitOf('caption', 'A caption TeX set without its points.', { why: 'marks' }),
    ]
    const got = askedOf(units, [[0]], ['A caption TeX set without its points.'], (u, i) =>
      i === 0 ? { ...u, echo: 1 } : u,
    )
    expect(got.members[1]).toEqual([false, 'marks'])
    expect(got.texts).toEqual([units[1]!.id])
    expect(got.askedIds).toContain(units[1]!.id)
  })
  it('a unit of no glyph unlocated otherwise (no ink, no mark of its own asked) is asked as before', () => {
    const units = [unitOf('para', 'A paragraph of ours.'), unitOf('footnote', 'A note of ours set nowhere here.')]
    const got = askedOf(units, [[0]], ['A paragraph of ours.'])
    expect(got.members[1]![0]).toBe(false)
    expect(got.members[1]![1]).not.toBe('marks')
    expect(got.asked).toEqual(['para', 'footnote'])
  })
})
