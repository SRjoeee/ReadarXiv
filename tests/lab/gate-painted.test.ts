// @vitest-environment node
// I11 of the reader gate (lab/typeset/painted.mjs, the coordinator's ruling of 2026-11-13): every box of every shape the reader
// paints of a laid page, on both panes, held inside what the reader's own rows and outlines paint. Boxes alone, no text: display
// (4) of 2111.09276v1 p5 as the part states it (a kept block's three lines, the second row's holding the number's "("), and the
// outlines the painter drew of it before (its second row and its number outside them).
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { holds, paintedOf } from '../../lab/typeset/painted.mjs'

type Box = [number, number, number, number]
const display: Box[] = [
  [56.92, 527.38, 211.64, 553.72],
  [56.92, 511.17, 278.06, 536.25],
  [278.06, 527.75, 286.36, 536.25],
]
const paragraph: Box[] = [
  [50.11, 590.25, 286.36, 599.22],
  [50.11, 578.29, 237.97, 587.27],
]
const member = (ord: number, boxes: Box[]) => ({
  ord,
  page: 5,
  state: 'laid',
  off: 1,
  lines: [],
  lit: { left: [boxes], right: [boxes], own: [] },
})

describe('I11, every lit box painted whole on both panes (lab/typeset/painted.mjs)', () => {
  it('holds a box inside the union of outlines, exactly, and not one an outline leaves out', () => {
    // (the outlines, y down, the painter drew of display (4) before: its first row and a strip under it to the number; a sliver
    // under "4)")
    const before: [number, number][][] = [
      [
        [53.92, -555.1],
        [214.64, -555.1],
        [214.64, -531.81],
        [281.06, -531.81],
        [281.06, -523.71],
        [53.92, -523.71],
      ],
      [
        [275.06, -526.37],
        [289.36, -526.37],
        [289.36, -523.71],
        [275.06, -523.71],
      ],
    ]
    const yDown = (b: Box): Box => [b[0], -b[3], b[2], -b[1]]
    // (its first row inside them, the strip under it; its second row's line and its number's "4)" not)
    expect(holds(before, yDown(display[0]!))).toBe(true)
    expect(holds(before, yDown(display[1]!))).toBe(false)
    expect(holds(before, yDown(display[2]!))).toBe(false)
  })
  it('finds every box of the display painted whole on both panes, the paragraph’s too', () => {
    const r = paintedOf({ page: 5, members: [member(68, paragraph), member(255, display)] })
    expect(r.cut).toEqual([])
    expect(r.boxes).toBe(2 * (display.length + paragraph.length))
    expect(r.shapes).toBe(4)
  })
})
