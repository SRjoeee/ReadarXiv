// The figure texts' reading of a page's paths (today/figure-text.mjs figureUnitsOf): a page's `shapes` are read while its own
// figure texts are, and never after, so that a reader may let them go page by page (`done`, locate's ink step: lane mem-back).
import { describe, expect, it } from 'vitest'
// @ts-ignore: today's JavaScript, typed where the package takes it (ink.ts)
import { containersOf, figureUnitsOf } from '../src/locate/today/figure-text.mjs'
import { figureLinesOf } from '../src/locate/figure-lines.ts'

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

describe('figureUnitsOf reads one line over the faces of one family', () => {
  /** a page of one line whose glyphs are set in the fonts `font` gives each */
  const set = (text: string, font: (i: number) => string) => {
    const p = page(text, 290)
    for (const [i, g] of p.glyphs.entries()) g.font = font(i)
    return p
  }
  it('reads a bold word and its row one line where the names are one family without PDF.js’s style words (2608.06701v1 p2)', () => {
    const bold = set('Open the relevant', (i) => (i < 4 ? 'MUFUZY+Arial-BoldMT' : 'MUFUZY+ArialMT'))
    expect(figureUnitsOf([bold], null).units.map((u: { text: string }) => u.text)).toEqual(['Open the relevant'])
    const italic = set('an inner word', (i) =>
      i > 2 && i < 8 ? 'AAAAAI+TimesNewRomanPS-ItalicMT' : 'AAAAAC+TimesNewRomanPSMT',
    )
    expect(figureUnitsOf([italic], null).units.map((u: { text: string }) => u.text)).toEqual(['an inner word'])
    // (two families, a narrow face beside the regular one: apart)
    const narrow = set('Open the relevant', (i) => (i < 4 ? 'ArialNarrow-Bold' : 'ArialMT'))
    expect(figureUnitsOf([narrow], null).units.map((u: { text: string }) => u.text)).toEqual(['Open', 'the relevant'])
  })
})

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
  it('holds no lines another glyph shares the path with; of two paths round the same lines, the inner one: the outer holds a node', () => {
    // ("x" a unit's of its own inside the diamond, its other glyph outside it: not alone)
    const g2 = [...glyphs, glyph('x', 98, 690), glyph('y', 300, 690)]
    const inside = [...units, { k: 3, gs: [glyphs.length, glyphs.length + 1] }]
    expect(containersOf({ ...pg(), glyphs: g2 }, inside, 1).length).toBe(0)
    // (a glyph no unit holds inside it: handed over, the line reading tells whose it is (figure-lines.ts))
    expect(
      containersOf({ ...pg(), glyphs: g2 }, units, 1).map((h: { ks: number[]; others?: number[] }) => [h.ks, h.others]),
    ).toEqual([[[0, 1, 2], [glyphs.length]]])
    // (a frame round the diamond holding nothing else: the diamond, the inner path)
    const frame = {
      b: 1,
      segs: [30, 650, 170, 650, 170, 650, 170, 725, 170, 725, 30, 725, 30, 725, 30, 650],
      box: [30, 650, 170, 725],
    }
    const held = containersOf(pg([frame]), units, 1).map((h: { b: number }) => h.b)
    expect(held).toEqual([0])
    // (a stroke inside the diamond, a legend's sample or a rule under words: no reason, the lines held alone still (the node's
    // label rule reads a legend's rows apart, figure-lines.ts))
    const sample = { b: 1, segs: [70, 690, 78, 690], box: [70, 689.5, 78, 690.5] }
    expect(containersOf(pg([sample]), units, 1).map((h: { b: number }) => h.b)).toEqual([0])
  })
  it('holds lines a fill under words of one line stands among (a decoration), not lines a node of their own holds', () => {
    const rect = (b: number, x0: number, y0: number, x1: number, y1: number) => ({
      b,
      segs: [x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0],
      box: [x0, y0, x1, y1],
    })
    // (a chip under "signal", inside its line's band, one band's height over and under its baseline (2608.06701v1 p9's code
    // in a bubble, 0.96 of the size): the diamond holds its lines still)
    expect(containersOf(pg([rect(1, 83, 683, 117, 695)]), units, 1).map((h: { b: number }) => h.b)).toEqual([0])
    // (a node's box round "signal" with room over and under it, past the band (2608.06007v1 p8's nodes, 1.5 of the size and
    // more): its text its own, the diamond holds no lines alone)
    expect(containersOf(pg([rect(1, 83, 676, 117, 698)]), units, 1).map((h: { b: number }) => h.b)).toEqual([])
    // (a box round two of its lines: a node of its own however tight, which holds them; the diamond none)
    expect(containersOf(pg([rect(1, 78, 670, 122, 695)]), units, 1).map((h: { b: number }) => h.b)).toEqual([1])
  })
})

describe('figureUnitsOf reads no line under a text in a dot (F3, 2608.06701v1 p9)', () => {
  // (a word at (100, 100), 10 pt, in a picture, and the strokes given: a zero-length path under its middle 0.32 under its baseline,
  // half width 0.25, member 651's dot ("Thought: Let's carefully review the 'run' method logic", read as a stroke 0.06 under it,
  // every CJK translation's em box crowded by it, the line left the original's)
  const word = (strokes: number[][]) => {
    const glyphs = [...'jury'].map((u, i) => ({
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
    }))
    const boxes: number[] = []
    const shapes = new Map()
    for (const s of strokes) {
      shapes.set(boxes.length / 4, { segs: Float32Array.from(s), stroke: true, fill: false, hw: 0.25 })
      boxes.push(
        Math.min(s[0]!, s[2]!) - 0.25,
        Math.min(s[1]!, s[3]!) - 0.25,
        Math.max(s[0]!, s[2]!) + 0.25,
        Math.max(s[1]!, s[3]!) + 0.25,
      )
    }
    const pg = {
      glyphs,
      turned: [],
      boxes,
      shapes,
      pictures: [
        { name: 'zs', glyph: 0, box: 0 },
        { name: 'ze', glyph: glyphs.length, box: boxes.length / 4 },
      ],
      points: [],
    }
    return figureUnitsOf(
      [{ ...pg, view: [0, 0, 300, 300], figures: new Map([['0:0', [0, 0, 300, 300]]]) }] as never,
      null,
    ).units[0]! as { why: string | null; under: number | null }
  }
  it("reads none in a stroke shorter than its own width (member 651's: 0.014 long, 0.16 wide)", () => {
    const dot = (hw: number) => {
      const glyphs = [...'jury'].map((u, i) => ({
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
      }))
      const shapes = new Map([
        [0, { segs: Float32Array.from([110, 99.68, 110.01, 99.69]), stroke: true, fill: false, hw }],
      ])
      const pg = {
        glyphs,
        turned: [],
        boxes: [110 - hw, 99.68 - hw, 110.01 + hw, 99.69 + hw],
        shapes,
        pictures: [
          { name: 'zs', glyph: 0, box: 0 },
          { name: 'ze', glyph: glyphs.length, box: 1 },
        ],
        points: [],
      }
      return figureUnitsOf(
        [{ ...pg, view: [0, 0, 300, 300], figures: new Map([['0:0', [0, 0, 300, 300]]]) }] as never,
        null,
      ).units[0]! as { why: string | null; under: number | null }
    }
    expect([dot(0.08).why, dot(0.08).under]).toEqual([null, null])
  })
  it('reads a curve of short segments under it as a line under it, as before (a contour under a label, 2501.14787v1 p41)', () => {
    // (a gridline 0.17 em under the baseline drawn as 180 segments 1 long, each shorter than nothing but itself: a line)
    const glyphs = [...'jury'].map((u, i) => ({
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
    }))
    const segs: number[] = []
    for (let x = 60; x < 240; x += 0.4) segs.push(x, 98.3, x + 0.4, 98.3)
    const shapes = new Map([[0, { segs: Float32Array.from(segs), stroke: true, fill: false, hw: 0.25 }]])
    const pg = {
      glyphs,
      turned: [],
      boxes: [59.75, 98.05, 240.25, 98.55],
      shapes,
      pictures: [
        { name: 'zs', glyph: 0, box: 0 },
        { name: 'ze', glyph: glyphs.length, box: 1 },
      ],
      points: [],
    }
    const u = figureUnitsOf(
      [{ ...pg, view: [0, 0, 300, 300], figures: new Map([['0:0', [0, 0, 300, 300]]]) }] as never,
      null,
    ).units[0]! as { under: number | null }
    expect(u.under).toBeCloseTo(1.45, 4)
  })
  it('reads none in a dot under it, and a rule under it as before', () => {
    expect([word([[110, 99.68, 110, 99.68]]).why, word([[110, 99.68, 110, 99.68]]).under]).toEqual([null, null])
    // (the cell's rule 2.4 under the baseline stands past the text's band: none; a gridline inside it is its stroke under, as before)
    const dotAnd = (y: number) =>
      word([
        [110, 99.68, 110, 99.68],
        [60, y, 240, y],
      ]).under
    expect(dotAnd(97.6)).toBeNull()
    expect(dotAnd(98.3)).toBeCloseTo(1.45, 4)
  })
})

describe('figure-text: a glyph no run holds inside a closed path is the line reading’s to place (F3’s container step, §18.36)', () => {
  // (a frame round three rows set flush left in ArialMT at 80, 10 pt, 14 apart, the last row's full stop set in a face of one
  // pitch: the figure reading cuts it from its word at the face change, and a run that spells no word is no unit; 2608.06701v1
  // p1's plan box, its item 4's "behavior." whose stop is set on a chip of its own)
  const MONO = 'Consolas'
  const rowsOf = (rows: string[], stop: boolean) => {
    const glyphs: Record<string, unknown>[] = []
    rows.forEach((text, li) => {
      let x = 80
      const y = 700 - 14 * li
      const set = (u: string, font: string) => {
        const w = u === ' ' ? 3 : font === MONO ? 6 : 5 + (u.codePointAt(0)! % 3)
        glyphs.push({
          u,
          n: glyphs.length,
          k: glyphs.length,
          x0: x,
          x1: x + w,
          ix0: x,
          ix1: x + w,
          y,
          top: y + 7,
          bottom: y - 2,
          size: 10,
          font,
          fill: 0,
          form: true,
          fid: 1,
          blank: u === ' ',
        })
        x += w
      }
      for (const u of text) set(u, 'ArialMT')
      if (stop && li === rows.length - 1) set('.', MONO)
    })
    return glyphs as { u: string; x1: number }[]
  }
  const ROWS = ['Run the checks to make', 'sure the outputs are', 'kept as they were']
  const framed = (glyphs: { x1: number }[]) => {
    const x1 = Math.max(...glyphs.map((g) => g.x1)) + 5
    const segs = [75, 662, x1, 662, x1, 662, x1, 712, x1, 712, 75, 712, 75, 712, 75, 662]
    return {
      glyphs,
      turned: [],
      boxes: [75, 662, x1, 712],
      shapes: new Map([[0, { segs: Float32Array.from(segs), stroke: true, fill: false, hw: 0.2 }]]),
      paths: [0],
      boxAt: glyphs.map(() => 1),
      view: [0, 0, 600, 800],
      figures: new Map([['1:0', [0, 0, 600, 800]]]),
      pictures: [],
      points: [],
    }
  }
  it('hands the path a glyph no unit holds inside it, for the line reading to place, and refuses one a unit outside it holds', () => {
    const glyphs = rowsOf(ROWS, true)
    const stop = glyphs.length - 1
    // (the rows' units, their glyphs but the spaces; the stop no unit's)
    let at = 0
    const units = ROWS.map((text, k) => {
      const gs = [...text].flatMap((u) => (u === ' ' ? (at++, []) : [at++]))
      return { k, gs }
    })
    const pg = framed(glyphs)
    expect(
      containersOf(pg, units, 1).map((h: { b: number; ks: number[]; others?: number[] }) => [h.b, h.ks, h.others]),
    ).toEqual([[0, [0, 1, 2], [stop]]])
    // (a path every glyph inside of which is its units': nothing handed over, the hold as before)
    const plain = framed(rowsOf(ROWS, false))
    expect(containersOf(plain, units, 1).map((h: { others?: number[] }) => 'others' in h)).toEqual([false])
    // (the stop a unit's of its own, which the path does not hold whole (its other glyph past the frame): another text inside it,
    // no hold, as before)
    const across = { ...pg, glyphs: [...glyphs, { ...glyphs[stop]!, x0: 900, x1: 906, ix0: 900, ix1: 906 }] }
    expect(containersOf(across, [...units, { k: 3, gs: [stop, glyphs.length] }], 1)).toEqual([])
  })
  it('makes the rows one text where the line reading sets the stop on the path’s last row', () => {
    const pg = framed(rowsOf(ROWS, true))
    const fixed = new Set([MONO])
    const fig = figureUnitsOf([pg] as never, null, { fixed })
    // (the stop no unit: its run spells no word)
    expect(fig.units.map((u: { text: string }) => u.text)).toEqual(ROWS)
    const texts = figureLinesOf([pg] as never, fig, () => false, fixed)
    expect(texts.map((t) => [t.ks, t.para?.by])).toEqual([[[0, 1, 2], 'container']])
    expect(texts[0]!.claimed).toEqual([pg.glyphs.length - 1])
  })
})
