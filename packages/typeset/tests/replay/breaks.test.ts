// U.breaks' maps replayed on the tap: every sampled reading (U.elements:in and :out, the U.breaks sample's and every other
// rule's that captured one), finishUnit's maps (breakMaps) over the breaks today's prepareUnit recorded, against its maps.
import { describe, expect, it } from 'vitest'
import { type Break, breakMaps, type MapsInput, type V0Piece } from '../../src/unit/breaks.ts'
import type { Rect } from '../../src/util.ts'
import { firstDifference, hasTap, roundsOf, sample } from './tap.ts'

type Char = { sep?: boolean; space?: boolean; page: number; rect: number[] }
type Res = {
  mode: string
  gap?: { chars: Char[]; held?: string[] } | null
  region?: number
  brk?: true
  room?: number
  brkAt?: number
}
type Prep = Map<number, Res> & {
  breaks: Map<number, Break>
  regionOf: Map<string, number>
  breakAt: Map<string, number>
  joinAt: Map<string, number>
  paraAt: Set<string> | null
  referenced: Set<number>
  openBreaks: Map<number, number> | null
  keep?: string[]
  lineInfo: Map<string, { j?: number }>
}
type Reading = { unit: { pieces: V0Piece[] }; rects: Rect[] }

/** finishUnit's input made from a recorded reading */
function mapsInput(i: Reading, prep: Prep): MapsInput {
  const kept = new Map<number, string[]>()
  for (const [k, r] of prep)
    if (r?.mode === 'kept' && r.gap)
      kept.set(k, [
        ...r.gap.chars.filter((c) => !c.sep && !c.space).map((c) => `${c.page}|${c.rect.join()}`),
        ...(r.gap.held ?? []),
      ])
  return {
    pieces: i.unit.pieces,
    rects: i.rects,
    lineInfo: prep.lineInfo,
    keep: prep.keep ?? [],
    kept,
    resolved: new Set(prep.keys()),
  }
}

describe.skipIf(!hasTap)('U.breaks: replayed on the tap', () => {
  it('makes today’s maps of today’s breaks on every sampled reading', { timeout: 120_000 }, () => {
    const differ: string[] = []
    const count = { all: 0, ofBreaks: 0, paired: 0, paragraph: 0, joined: 0, opened: 0, regions: 0 }
    const rules = ['U.breaks', 'U.elements', 'U.label', 'U.marks', 'U.rename', 'B.tokens']
    const seen = new Set<string>()
    for (const rule of rules)
      for (const e of sample(rule).entries)
        for (const [round, c] of roundsOf(e)) {
          const key = `${e.pair}|${e.ord}|${round}`
          const i = c['U.elements:in'] as Reading | undefined,
            prep = c['U.elements:out'] as Prep | undefined
          if (!i || !prep || seen.has(key)) continue
          seen.add(key)
          count.all++
          if (rule === 'U.breaks') count.ofBreaks++
          const got = breakMaps(prep.breaks, mapsInput(i, prep))
          if (got.breaks.size) count.paired++
          if ([...got.breaks.values()].some((b) => b.paragraph)) count.paragraph++
          if (got.joinAt.size) count.joined++
          if (got.openBreaks?.size) count.opened++
          if (got.regionOf.size) count.regions++
          const marks = new Map(
            [...prep]
              .map(([k, r]) => [k, { region: r.region, brk: r.brk, room: r.room, brkAt: r.brkAt }] as const)
              .filter(([, m]) => Object.values(m).some((v) => v !== undefined)),
          )
          const diff =
            firstDifference(got.regionOf, prep.regionOf, 'regionOf') ??
            firstDifference(got.breakAt, prep.breakAt, 'breakAt') ??
            firstDifference(got.joinAt, prep.joinAt, 'joinAt') ??
            firstDifference(got.paraAt, prep.paraAt, 'paraAt') ??
            firstDifference(got.referenced, prep.referenced, 'referenced') ??
            firstDifference(got.openBreaks, prep.openBreaks, 'openBreaks') ??
            firstDifference(got.marks, marks, 'marks')
          if (diff) differ.push(`${key}: ${diff}`)
        }
    expect(differ).toEqual([])
    expect(count.ofBreaks).toBe(15)
    expect(count.all).toBe(101)
    // (each branch the sample was drawn for is among them: forced breaks paired, a group's paragraph, a break inside a frame,
    // a group's open piece, kept regions)
    expect(count).toMatchObject({ paired: 9, paragraph: 3, joined: 3, opened: 3 })
    expect(count.regions).toBeGreaterThan(0)
  })
})
