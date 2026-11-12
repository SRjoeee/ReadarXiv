// The gate's runner on lane L1's parts (gate-l1.ts) on one pair: every member set or counted by what stops it, every page laid
// from its own part, a member on two pages laid alike from each page's part. Its numbers against the baseline are the corpus
// runner's (lab/typeset/gate-l1.mjs): here it is held to run whole.
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tableMetrics } from '../../src/metrics/table.ts'
import { gatePair } from './gate.ts'
import { entryByToday, gateL1Pair, invariantsOf } from './gate-l1.ts'
import type { PageMember } from '../../src/lay/page.ts'
import { hasL1 } from './l1.ts'
import { hasDerived, hasTap, readGz, TAP } from './tap.ts'
import { hasCache } from './today.ts'

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache || !hasL1)('the gate on L1’s parts', () => {
  it('lays every page of 1706.03762v7-de.pack from its own L1 part', { timeout: 120_000 }, () => {
    const g = gateL1Pair('1706.03762v7-de.pack')
    expect(g.threw).toEqual([])
    expect(g.selfDiffer).toEqual([])
    expect(g.units.length).toBeGreaterThan(50)
    expect(g.setting.size).toBeGreaterThanOrEqual(g.units.length)
  })
  it('holds I4 and the restated I5 on its lays, the reading from the part; I3 no worse than today’s on the pair', {
    timeout: 120_000,
  }, () => {
    // (measured by the tap's table of today's measures: a measure today never made throws, that flow's members 'error')
    const g = gateL1Pair('1512.03385v1-de.pack', {
      reading: 'part',
      metricsOf: (pair) => tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`)) as never),
    })
    expect(g.inputs.size).toBeGreaterThan(100)
    const today = gatePair('1512.03385v1-de.pack')
    // (I4: every element's crop drawn once; I5: a line past its slot only by its closing mark's blank half, or overfull)
    expect(g.inv.I4).toEqual([])
    expect(g.inv.I5).toEqual([])
    expect(g.inv.I3.length).toBeLessThanOrEqual(today.inv.I3.length)
    expect(g.selfDiffer).toEqual([])
  })
})

describe("the entry's members compared with the runner's, by today's unit (round 8 B8)", () => {
  // (a member of the part no unit of today's joins (its unit's text moved: lane style-wire's escaped characters, no door row) is
  // one the runner never lays; keyed by its own part ord it took the place of the member of today's unit of that ord, 1512.03385
  // p7's moved cell at part ord 125 standing for today's heading t125, read as "none against laid": 97 of B8's 747)
  it("keys each joined member by its today's ord, and leaves out one no unit of today's joins", () => {
    const m = (ord: number) => ({ ord, state: ord === 125 ? 'none' : 'laid' })
    const unitOf = new Map([
      [121, { ord: 125 }],
      [122, { ord: 126 }],
    ])
    const by = entryByToday([m(121), m(122), m(125)], unitOf)
    expect([...by.keys()]).toEqual([125, 126])
    expect(by.get(125)).toEqual({ ord: 121, state: 'laid' })
  })
})

describe('I5 reads what is drawn past a slot: a crop by its ink (round B13, the coordinator ruling (b))', () => {
  // (a line of a member, its slot 72-300 on page 1, its last item a crop: an end mark whose ink the part states [290, 700, 296,
  // 706] on page 1, cut with crops.ts cropOfBox's antialiased margin, 0.4 pt a side across and 0.3 up and down. TeX set its ink
  // flush to the measure's end; a crop set where TeX set its ink stands its margin past the slot, a padded box past it, no ink)
  const R = { floor: 0.8, floorMin: 0.6 } as never
  const fresh = () => ({ laid: 0, lines: 0, I3: [], I4: [], I5: [], I5by: new Map(), below: [] })
  const member = (ink: [number, number, number, number, number, number], cropX0: number) => {
    const crop = [ink[1] - 0.4, ink[2] - 0.3, ink[3] + 0.4, ink[4] + 0.3]
    const w = crop[2]! - crop[0]!
    const x = cropX0
    const mark = { crop: { mode: 'crop', page: 1, crop, baseline: 700, k: -2 }, cw: w }
    return {
      pm: {
        ord: 5,
        state: 'laid',
        lines: [],
        slots: [],
        lay: {
          P: {},
          tokens: [mark],
          layout: {
            f: 10,
            scale: 1,
            lines: [
              {
                page: 1,
                x0: 72,
                x1: 300,
                baseline: 700,
                used: x + w - 72,
                items: [
                  { t: { s: 'Proof.', w100: 100 }, x: 72, w: 30 },
                  { t: { space: true }, x: 102, w: 3 },
                  { t: mark, x, w },
                ],
              },
            ],
          },
        },
      } as unknown as PageMember,
      inks: [ink],
    }
  }
  it('a crop whose ink ends at the slot passes though its padded box stands 0.4 pt past it', () => {
    // (the ink 294-300 set where TeX set it: its crop 293.6-300.4)
    const { pm, inks } = member([1, 294, 700, 300, 706, 700], 293.6)
    const inv = fresh()
    invariantsOf(1, [pm], R, inv, () => inks)
    expect(inv.I5).toEqual([])
    // (read by its padded box, as before: 0.40 pt past)
    const before = fresh()
    invariantsOf(1, [pm], R, before)
    expect([...before.I5by.values()][0]!.max).toBeCloseTo(0.4, 6)
  })
  it('a crop whose ink itself ends past the slot still fails, by its ink', () => {
    // (the same mark set 1 pt further right: its ink 295-301, 1 pt past the slot's 300)
    const { pm, inks } = member([1, 294, 700, 300, 706, 700], 294.6)
    const inv = fresh()
    invariantsOf(1, [pm], R, inv, () => inks)
    expect(inv.I5by.size).toBe(1)
    expect([...inv.I5by.values()][0]!.max).toBeCloseTo(1, 6)
  })
  it('a crop the part states no ink for is read by its box, as before', () => {
    const { pm } = member([1, 294, 700, 300, 706, 700], 293.6)
    const inv = fresh()
    invariantsOf(1, [pm], R, inv, () => [])
    expect([...inv.I5by.values()][0]!.max).toBeCloseTo(0.4, 6)
  })
})
