// U.breaks replayed on the tap: every sampled reading (U.elements:in and :out, the U.breaks sample's and every other rule's
// that captured one), with the alignment's piece lines and the pieces' classes that lab/typeset/derive.mjs read with today's
// code (lanes/L3/replay/U.breaks.json.gz). Its answer against prepareUnit's recorded breaks and finishUnit's maps.
import { describe, expect, it } from 'vitest'
import { type BreaksInput, breaks, type LayoutUnit, type V0Piece } from '../../src/unit/breaks.ts'
import { type Rect, rectKey } from '../../src/util.ts'
import { derived, firstDifference, hasDerived, hasTap, roundsOf, sample } from './tap.ts'

type Derived = {
  cases: Record<string, { from: string; pieceLines: [number, [number, number]][] | null; cls2: (string | null)[] }>
}
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
  breaks: Map<number, unknown>
  regionOf: Map<string, number>
  breakAt: Map<string, number>
  joinAt: Map<string, number>
  paraAt: Set<string> | null
  referenced: Set<number>
  openBreaks: Map<number, number> | null
  keep?: string[]
  lineInfo: Map<string, { j?: number }>
}
type Reading = {
  unit: { pieces: V0Piece[]; source?: V0Piece[] }
  rects: Rect[]
  lu: LayoutUnit
  kOf: number[]
  lineskip: number[] | null
  lines: { rects: Rect[]; jOf: number[]; held?: Rect[] }
}

/** U.breaks' input made from a recorded reading and the derived facts */
export function breaksInput(i: Reading, prep: Prep, d: Derived['cases'][string]): BreaksInput {
  const kept = new Map<number, string[]>()
  for (const [k, r] of prep)
    if (r?.mode === 'kept' && r.gap)
      kept.set(k, [
        ...r.gap.chars.filter((c) => !c.sep && !c.space).map((c) => `${c.page}|${c.rect.join()}`),
        ...(r.gap.held ?? []),
      ])
  return {
    lu: i.lu,
    pieces: i.unit.pieces,
    cls2: d.cls2,
    kOf: i.kOf,
    lineskip: i.lineskip,
    source: Array.isArray(i.unit.source) ? i.unit.source : null,
    pieceLines: d.pieceLines ? new Map(d.pieceLines) : null,
    fileLines: { rects: i.lines.rects, j: i.lines.jOf },
    held: (i.lines.held ?? []).map(rectKey),
    rects: i.rects,
    lineInfo: prep.lineInfo,
    keep: prep.keep ?? [],
    kept,
    resolved: new Set(prep.keys()),
  }
}

describe.skipIf(!hasTap || !hasDerived('U.breaks'))('U.breaks: replayed on the tap', () => {
  it('equals today’s breaks and maps on every sampled reading', () => {
    const facts = derived<Derived>('U.breaks').cases
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
          const d = facts[key]
          if (!d) {
            differ.push(`${key}: no derived facts`)
            continue
          }
          count.all++
          if (rule === 'U.breaks') count.ofBreaks++
          const got = breaks(breaksInput(i, prep, d))
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
            firstDifference(got.breaks, prep.breaks, 'breaks') ??
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
