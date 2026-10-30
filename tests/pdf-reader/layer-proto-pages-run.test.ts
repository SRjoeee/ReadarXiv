import { beforeAll, describe, expect, it } from 'vitest'
import { unitOf } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { build, bundleOf, installStubs, line, openRun, type Paper, rowsOf } from './helpers/order-paper'

// A unit over a page break, laid by the run (E3c): page 1 holds the share of the translation its source sets there, to the end
// of the line that holds it. The unit's source sets "Alpha beta" on page 1 and three lines on page 2; its translation (60
// characters) used to fill page 1's line and run on, its page 2 sentences drawn on page 1 (the sweep's invariant (i)).

beforeAll(() => { installStubs() })

const paper: Paper = {
  name: 'E3c a unit over a page break', pages: 2,
  specs: [{ id: 0, kind: 'para', lines: [line(1, 150, 'Alpha beta', 20, 280), line(2, 270, 'Alpha beta 20', 20, 280), line(2, 258, 'Alpha beta 21', 20, 280), line(2, 246, 'Alpha beta 22', 20, 280)], chars: 60, at: 0x4e00 + 64 }],
}
type Rec = [number, number, number, boolean, string, number, number, number]

describe('a unit over a page break, laid by the run', () => {
  it("holds on page 1 the share its source sets there, to the end of its line there, full, the rest on page 2", async () => {
    const run = await openRun(build(paper))
    await run.layFor(1)
    const rec = run.stats.find(x => x.id === 0) as unknown as { lines: Rec[]; trDrawn: number; clipped: boolean }
    expect(rec.clipped).toBe(false)
    const on1 = rec.lines.filter(l => l[0] === 1), on2 = rec.lines.filter(l => l[0] === 2)
    expect(on1.length).toBe(1)
    expect(on2.length).toBeGreaterThan(0)
    // (the source's page 1 is "Alpha beta", 10 of its 52 characters, about a fifth of the 60, which page 1's one line holds:
    // the line goes on to the measure, justified, never ended short there, as the source's own line before the break; the
    // line the cut ended at the share ended at 159.9, ragged, the measure running from 20 to 280)
    expect(on1[0]![4]).toBe('just')
    expect(on1[0]![7]).toBe(280)
  })
  it('lays the unit as it was where the cut would cost it its fit: a smaller size, or no state at all', async () => {
    // most of the source on page 2's one line: the share of the translation the cut leaves there is more than that line holds
    // (26 of the 60); without the cut, the fit's first state fits, its text grown to fill page 1's two lines and a part of
    // page 2's. With it, the fit shrinks the unit (to 0.975: page 2's line "... mu"), or no state fits and its further
    // steps run it past the break (flow: "... omicron pi rho sigma tau")
    for (const tail of ['eta theta iota kappa lambda mu', 'eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau']) {
      const paper: Paper = { name: 'E3c a cut that costs the fit', pages: 2, specs: [{ id: 0, kind: 'para', lines: [line(1, 270, 'Alpha beta'), line(1, 258, 'gamma delta'), line(1, 246, 'epsilon zeta'), line(2, 270, tail)], chars: 60, at: 0x4e00 + 64 }] }
      const run = await openRun(build(paper))
      await run.layFor(1)
      const rec = run.stats.find(x => x.id === 0) as unknown as { lines: Rec[]; tried: number; knob: string; fitScale: number; clipped: boolean }
      expect([rec.clipped, rec.tried, rec.knob, rec.fitScale]).toEqual([false, 1, 'grow', 1.1])
      expect(rec.lines.map(l => l[0])).toEqual([1, 1, 2])
    }
  })
  it("takes the row's sentences to the unit the layer lays, never written to a row", () => {
    const P = build(paper), bundle = bundleOf(P), [row] = rowsOf(bundle, P)
    const at = (sentences: unknown) => unitOf(bundle, [row![0], row![1], row![2], row![3], sentences] as never) as unknown as { sentences?: unknown }
    const u = at({ src: [11], tr: [12] })
    expect(u.sentences).toEqual({ src: [11], tr: [12] })
    expect(Object.keys(u)).not.toContain('sentences')
    // (none of no shape: a sentence start that is no whole number, a count that differs)
    expect(at({ src: [1.5], tr: [2] }).sentences).toBeUndefined()
    expect(at({ src: [1, 2], tr: [2] }).sentences).toBeUndefined()
    expect(at(null).sentences).toBeUndefined()
  })
})
