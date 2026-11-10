// The figure texts' reading of a page's paths (today/figure-text.mjs figureUnitsOf): a page's `shapes` are read while its own
// figure texts are, and never after, so that a reader may let them go page by page (`done`, locate's ink step: lane mem-back).
import { describe, expect, it } from 'vitest'
// @ts-ignore: today's JavaScript, typed where the package takes it (ink.ts)
import { containersOf, figureUnitsOf } from '../src/locate/today/figure-text.mjs'

/** a page of one word at (100, 100), 10 pt, in a figure, a stroke `at` across from it (its room on the line reads it) */
const page = (text: string, at: number) => {
  const glyphs = [...text].map((u, i) => ({
    u,
    n: 0,
    k: i,
    x0: 100 + 5 * i,
    x1: 105 + 5 * i,
    ix0: 100 + 5 * i,
    ix1: 105 + 5 * i,
    y: 100,
    top: 107,
    bottom: 98,
    size: 10,
    font: 'CMR10',
    fill: 0,
    form: true,
    fid: 1,
  }))
  const boxes = [at - 0.25, 90, at + 0.25, 115]
  const shapes = new Map([[0, { segs: Float32Array.from([at, 90, at, 115]), stroke: true, fill: false, hw: 0.25 }]])
  return {
    glyphs,
    turned: [],
    boxes,
    shapes,
    paths: [0],
    boxAt: glyphs.map(() => 1),
    view: [0, 0, 300, 300],
    figures: new Map([['1:0', [0, 0, 300, 300]]]),
    pictures: [],
    points: [],
  }
}

describe("figureUnitsOf reads a page's shapes with its own figure texts alone", () => {
  it("tells each page done in order, and reads the same with each page's shapes let go once it is", () => {
    const made = () => [page('label', 140), page('words', 131)]
    const kept = figureUnitsOf(made(), null)
    const pages = made()
    const done: number[] = []
    const taken = figureUnitsOf(pages, null, {
      done: (p: number) => {
        done.push(p)
        pages[p]!.shapes = new Map()
      },
    })
    expect(done).toEqual([0, 1])
    expect(taken).toEqual(kept)
    // (the shapes are read: a stroke nearer the word's end leaves less room after it)
    expect(kept.units[0].after).not.toBe(kept.units[1].after)
  })
})

describe('figureUnitsOf records a tone under part of a text for the relation reading (figure-lines.ts)', () => {
  /** "static method" at (100, 100), a fill painted before it under `from`..`to` along its line */
  const toned = (from: number, to: number) => {
    const p = page('static method', 0)
    const box = [from, 97, to, 109]
    p.boxes = box
    p.shapes = new Map([
      [
        0,
        {
          segs: Float32Array.from([from, 97, to, 97, to, 97, to, 109, to, 109, from, 109, from, 109, from, 97]),
          stroke: false,
          fill: true,
          hw: 0,
        },
      ],
    ])
    return p
  }
  it('keeps a highlight under a word of it a ground that crowds nothing, and records it (2608.06701v1 p1’s blue bars)', () => {
    // ("static" from 100 to 130, its fill 99 to 131.5: an edge of it inside the text's extent)
    const { units, met } = figureUnitsOf([toned(99, 131.5)], null)
    expect(units[0].why).toBeNull()
    expect(met.get(0)?.items).toEqual([expect.objectContaining({ b: 0, ground: true })])
  })
  it('records no fill the text stands on whole', () => {
    const { units, met } = figureUnitsOf([toned(95, 175)], null)
    expect(units[0].why).toBeNull()
    expect(met.get(0)).toBeUndefined()
  })
})

describe('figure-text: the closed paths that hold units alone (F3’s container step)', () => {
  // (a diamond round three lines, "Any", "signal", "detected?", and "yes" beside it: inside its box, outside it)
  const glyph = (u: string, x: number, y: number) => ({
    u,
    x0: x,
    x1: x + 5,
    ix0: x,
    ix1: x + 5,
    y,
    top: y + 7,
    bottom: y - 1,
    size: 10,
  })
  const word = (s: string, x: number, y: number) => [...s].map((u, i) => glyph(u, x + 5 * i, y))
  const lines = [word('Any', 92, 700), word('signal', 85, 686), word('detected', 80, 672), word('yes', 140, 665)]
  const glyphs = lines.flat()
  let at = 0
  const units = lines.slice(0, 3).map((l, k) => ({ k, gs: l.map(() => at++) }))
  const diamond = [100, 718, 160, 688, 160, 688, 100, 658, 100, 658, 40, 688, 40, 688, 100, 718]
  const pg = (extra: { b: number; segs: number[]; box: number[] }[] = []) => ({
    glyphs,
    boxes: [40, 658, 160, 718, ...extra.flatMap((e) => e.box)],
    shapes: new Map([
      [0, { segs: diamond, stroke: true, fill: false, hw: 0.5 }],
      ...extra.map((e) => [e.b, { segs: e.segs, stroke: true, fill: false, hw: 0.5 }] as [number, unknown]),
    ]),
  })
  it('holds the lines whose glyphs stand inside the path, by its interior, alone: "yes" in its box is outside it', () => {
    const stats = { boxed: 0, interior: 0 }
    expect(containersOf(pg(), units, 1, stats).map((h: { ks: number[]; b: number }) => [h.b, h.ks])).toEqual([
      [0, [0, 1, 2]],
    ])
    expect(stats.boxed).toBe(1)
  })
  it('holds no lines another glyph shares the path with; of two paths round the same lines, the inner one', () => {
    // ("yes" a unit of its own inside the diamond: not alone)
    const inside = [...units, { k: 3, gs: [] as number[] }]
    const g2 = [...glyphs, glyph('x', 98, 690)]
    expect(containersOf({ ...pg(), glyphs: g2 }, inside, 1).length).toBe(0)
    // (a frame round the diamond holding nothing else: the diamond, the inner path)
    const frame = {
      b: 1,
      segs: [30, 650, 170, 650, 170, 650, 170, 725, 170, 725, 30, 725, 30, 725, 30, 650],
      box: [30, 650, 170, 725],
    }
    const held = containersOf(pg([frame]), units, 1).map((h: { b: number }) => h.b)
    expect(held).toEqual([0])
    // (a stroke inside the diamond, a legend's sample: no node's label alone, 2608.06701v1 p6)
    const sample = { b: 1, segs: [70, 690, 78, 690], box: [70, 689.5, 78, 690.5] }
    expect(containersOf(pg([sample]), units, 1).length).toBe(0)
  })
})
