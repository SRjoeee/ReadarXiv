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
