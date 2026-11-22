// A group the paper sets in small capitals (`\textsc{…}`), laid in a face whose file has OpenType's `smcp` feature: the face draws
// the piece's small capitals where it has one for every lower-case letter of the piece, and the layer draws them itself (the
// face's capitals at the share of the size, runs of one case, no small capitals asked of the face) where it has none for one of
// them. A face's feature covers some letters alone: Linux Libertine's substitutes Latin letters and not Greek ones, CMU Sans'
// and CMU Mono's Greek letters and not Latin ones; a letter the face has none for, asked of it, was drawn in lower case (the
// class synthesizes none) and measured in the canvas's synthesized small capitals. Parts made by hand, words of our own: one
// paragraph line at 10 pt, the group first, a German row.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Metrics, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
/** a target's rules with no page fill: the line as the fit lays it */
const still = (to: string) => {
  const rules = rulesFor(to)
  return { ...rules, set: { ...rules.set, adaptiveFill: false } as unknown as typeof rules.set }
}
const id = 'c'.repeat(64)
/** a paragraph of one line in `design`, its first group set by `\textsc` */
const member = (design: string, role: 'serif' | 'sans' | 'mono'): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role, size: 10, design },
  align: 'l',
  lines: [[1, 0, 72, 520, 700, 707, 698, 72, 520, 0, 10]],
  room: { below: 0, next: 300, runs: [[1, 520, 30]], sep: 12 },
  spans: [['1', { cmd: 'textsc' }]],
})
const part = (m: Placed, fonts: string[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: fonts.map((f) => [f, 100] as [string, number]) } },
  flows: [[m]],
})
const rowOf = (name: string): Rows => {
  const r: Row = {
    id,
    ok: true,
    by: 'test',
    content: [
      { t: 'span', id: '1', content: [{ t: 'text', s: name }] },
      { t: 'text', s: ' steht hier' },
    ],
  }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
type Run = Item & { face: string; size: number }
/** the runs the group is laid in: each item of the line before the text after it */
const runsOf = (design: string, role: 'serif' | 'sans' | 'mono', name: string, fonts = [design], to = 'de') => {
  const laid = layPage(part(member(design, role), fonts), rowOf(name), still(to), metrics).members[0]!
  expect(laid.state).toBe('laid')
  const items = laid.lines.flatMap(([, , , its]) => its).filter((it): it is Run => 'face' in it)
  const end = items.findIndex((it) => it.s.includes('steht'))
  return items
    .slice(0, end)
    .map((it) => ({ s: it.s.trim(), caps: it.face.startsWith('small-caps '), share: it.size / 10 }))
}

describe("a piece in small capitals is the face's own where it has one for every lower-case letter, else the layer's", () => {
  it("Libertine's Latin: the face's own, one run, a mixed-case name whole (its kerning kept)", () => {
    expect(runsOf('LinLibertineT', 'serif', 'MixedCaseName')).toEqual([{ s: 'MixedCaseName', caps: true, share: 1 }])
  })
  it("Libertine's Greek, which its feature does not substitute: the layer's, the face's capitals at the share", () => {
    expect(runsOf('LinLibertineT', 'serif', 'Αβγ')).toEqual([
      { s: 'Α', caps: false, share: 1 },
      { s: 'ΒΓ', caps: false, share: 0.8 },
    ])
  })
  it('a piece of Latin with one Greek letter: one rule for the piece, the layer draws it all', () => {
    expect(runsOf('LinLibertineT', 'serif', 'Abcδ')).toEqual([
      { s: 'A', caps: false, share: 1 },
      { s: 'BCΔ', caps: false, share: 0.8 },
    ])
  })
  // (a Cyrillic target sets Computer Modern's sans and typewriter text in CMU Sans and CMU Mono, Latin Modern's having no
  // Cyrillic letter: their feature substitutes Greek letters alone, none of the Latin or Cyrillic ones)
  const CM = ['CMR10', 'CMSS10', 'CMTT10']
  it("CMU Sans' and CMU Mono's Latin and Cyrillic, which their feature does not substitute: the layer's", () => {
    for (const [design, role] of [
      ['CMSS10', 'sans'],
      ['CMTT10', 'mono'],
    ] as const) {
      expect(runsOf(design, role, 'Abc', CM, 'ru')).toEqual([
        { s: 'A', caps: false, share: 1 },
        { s: 'BC', caps: false, share: 0.8 },
      ])
      expect(runsOf(design, role, 'Абв', CM, 'ru')).toEqual([
        { s: 'А', caps: false, share: 1 },
        { s: 'БВ', caps: false, share: 0.8 },
      ])
    }
  })
  it("CMU Sans' Greek, which its feature substitutes: the face's own", () => {
    expect(runsOf('CMSS10', 'sans', 'Αβγ', CM, 'ru')).toEqual([{ s: 'Αβγ', caps: true, share: 1 }])
  })
  it('a piece with no lower-case letter is the face it is set in, as before', () => {
    expect(runsOf('LinLibertineT', 'serif', 'ΑΒΓ')).toEqual([{ s: 'ΑΒΓ', caps: true, share: 1 }])
  })
})
