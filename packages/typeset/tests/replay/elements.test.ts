// U.elements replayed on the tap: every sampled reading (U.elements:in and :out of every rule's sample), each placeholder's
// reading derived from the recorded inputs with today's code (lab/typeset/derive.mjs: lanes/L3/replay/U.elements.json.gz).
// Its resolutions, the lines kept and the unproven placeholder against prepareUnit's recorded answer. What the comparison
// leaves to other rules: a resolution's fields finishUnit sets after it (region, brk, room, brkAt: U.breaks; origAfter,
// heldAfter, heldMarks and a display's inPlace: U.marks' facts); a rendering is compared by what it carries (text, lines,
// nu, unbracketed, proof, box, held, its count of characters), its characters being the page's.
import { describe, expect, it } from 'vitest'
import { type ElementReading, elements, type Gap, type Res } from '../../src/unit/elements.ts'
import type { V0Piece } from '../../src/unit/breaks.ts'
import { derived, firstDifference, hasDerived, hasTap, roundsOf, sample } from './tap.ts'

type Case = {
  from: string
  readings: Record<string, ElementReading>
  macros0: [string, string][]
  held: string[]
  touched: string[]
  shown: number
}
type Char = { sep?: boolean; space?: boolean; page: number; rect: number[]; nu?: boolean }
type TodayGap = { text: string; chars: Char[]; unbracketed?: true; proof?: true; box?: unknown; held?: string[] }
type TodayRes = Omit<Res, 'gap'> & { gap?: TodayGap | null } & Record<string, unknown>
type Prep = Map<number, TodayRes> & { keep?: string[]; unproven?: number }

/** today's rendering as the port carries it */
const gapOf = (g: TodayGap): Gap => ({
  text: g.text,
  lines: g.chars.filter((c) => !c.sep && !c.space).map((c) => `${c.page}|${c.rect.join()}`),
  nu: g.chars.some((c) => c.nu),
  ...(g.unbracketed ? { unbracketed: true as const } : {}),
  ...(g.proof ? { proof: true as const } : {}),
  ...(g.box ? { box: g.box } : {}),
  ...(g.held ? { held: g.held } : {}),
  n: g.chars.length,
})
const LATER = ['region', 'brk', 'room', 'brkAt', 'origAfter', 'heldAfter', 'heldMarks']
/** a resolution without what the rules after U.elements set on it */
const own = (r: Record<string, unknown>, gap: Gap | null | undefined) => {
  const o: Record<string, unknown> = { ...r }
  for (const k of LATER) delete o[k]
  if (o.cls === 'display') delete o.inPlace
  if ('gap' in r) o.gap = gap ?? null
  return o
}

describe.skipIf(!hasTap || !hasDerived('U.elements') || !hasDerived('U.breaks'))(
  'U.elements: replayed on the tap',
  () => {
    it('resolves every placeholder as today did, on every sampled reading', () => {
      const facts = derived<{ cases: Record<string, Case> }>('U.elements').cases
      const classes = derived<{ cases: Record<string, { cls2: (string | null)[] }> }>('U.breaks').cases
      const differ: string[] = []
      const count = { all: 0, ofElements: 0, modes: new Map<string, number>(), unbracketed: 0, unproven: 0 }
      const seen = new Set<string>()
      for (const rule of ['U.elements', 'U.breaks', 'U.label', 'U.marks', 'U.rename', 'B.tokens'])
        for (const e of sample(rule).entries)
          for (const [round, c] of roundsOf(e)) {
            const key = `${e.pair}|${e.ord}|${round}`
            const i = c['U.elements:in'] as { unit: { pieces: V0Piece[] } } | undefined,
              prep = c['U.elements:out'] as Prep | undefined
            if (!i || !prep || seen.has(key)) continue
            seen.add(key)
            const f = facts[key],
              cls = classes[key]
            if (!f || !cls) {
              differ.push(`${key}: no derived facts`)
              continue
            }
            count.all++
            if (rule === 'U.elements') count.ofElements++
            const got = elements({
              pieces: i.unit.pieces,
              cls2: cls.cls2,
              readings: new Map(Object.entries(f.readings).map(([k, r]) => [Number(k), r])),
              held: f.held,
              macros: new Map(f.macros0),
              touched: f.touched,
              shown: f.shown,
            })
            const want = new Map([...prep].map(([k, r]) => [k, own(r, r.gap ? gapOf(r.gap) : r.gap)]))
            const mine = new Map([...got.resolutions].map(([k, r]) => [k, own(r, r.gap)]))
            for (const r of got.resolutions.values()) {
              count.modes.set(r.mode, (count.modes.get(r.mode) ?? 0) + 1)
              if (r.gap?.unbracketed) count.unbracketed++
            }
            if (got.unproven >= 0) count.unproven++
            const d =
              firstDifference(mine, want, 'resolutions') ??
              firstDifference(got.keep, prep.keep ?? [], 'keep') ??
              firstDifference(got.unproven, prep.unproven ?? -1, 'unproven')
            if (d) differ.push(`${key}: ${d}`)
          }
      expect(differ).toEqual([])
      expect(count.ofElements).toBe(63)
      expect(count.all).toBe(101)
      // (every mode the corpus draws a placeholder in is among them, and renderings without their own brackets; no 'source'
      // nor 'cite-map' on the corpus, nor an unproven placeholder: samples/branches.json)
      expect([...count.modes.keys()].sort()).toEqual(['crop', 'kept', 'none', 'orig-text', 'symbol'])
      expect(count.unbracketed).toBeGreaterThan(0)
    })
  },
)
