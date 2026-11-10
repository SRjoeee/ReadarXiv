// The figure texts' reading of a page's paths (today/figure-text.mjs figureUnitsOf): a page's `shapes` are read while its own
// figure texts are, and never after, so that a reader may let them go page by page (`done`, locate's ink step: lane mem-back).
import { describe, expect, it } from 'vitest'
// @ts-ignore: today's JavaScript, typed where the package takes it (ink.ts)
import { figureUnitsOf } from '../src/locate/today/figure-text.mjs'

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
