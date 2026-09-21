// The arithmetic of cutting a line out of a figure (DESIGN §15.3): no canvas here, the matrix is applied by hand
import { describe, expect, it } from 'vitest'
import { type Cut, cutOf, DETECT_SIDE_PX, detectScale, isTall, LINE_HEIGHT_PX, normalise, type PixelQuad, type Point, turned } from '@/core/ocr/geometry'

/** Where a point of the image lands in the cut */
const through = ({ matrix: [a, b, c, d, e, f] }: Cut, [x, y]: Point): Point => [a * x + c * y + e, b * x + d * y + f]
const close = (got: Point, want: Point) => {
  expect(got[0]).toBeCloseTo(want[0], 6)
  expect(got[1]).toBeCloseTo(want[1], 6)
}

describe('detectScale', () => {
  it('reduces a large figure to the detection side and never enlarges a small one', () => {
    expect(detectScale(9600, 3000)).toBeCloseTo(DETECT_SIDE_PX / 9600, 10)
    expect(detectScale(600, 1920)).toBeCloseTo(0.5, 10)
    expect(detectScale(377, 252)).toBe(1)
  })
})

describe('cutOf', () => {
  it('an upright line lands with its corners on the cut\'s, at the recogniser\'s height', () => {
    const quad: PixelQuad = [[100, 200], [340, 200], [340, 260], [100, 260]]
    const cut = cutOf(quad)
    expect([cut.width, cut.height]).toEqual([192, LINE_HEIGHT_PX])
    close(through(cut, quad[0]), [0, 0])
    close(through(cut, quad[1]), [192, 0])
    close(through(cut, quad[2]), [192, LINE_HEIGHT_PX])
    close(through(cut, quad[3]), [0, LINE_HEIGHT_PX])
  })

  it('a tilted line is laid along x: its own corners, not its bounding box\'s', () => {
    // A 200 × 40 line turned 30° about its first corner
    const [cos, sin] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]
    const at = (u: number, v: number): Point => [50 + u * cos - v * sin, 80 + u * sin + v * cos]
    const quad: PixelQuad = [at(0, 0), at(200, 0), at(200, 40), at(0, 40)]
    const cut = cutOf(quad)
    expect(cut.width).toBe(240)
    close(through(cut, quad[2]), [240, LINE_HEIGHT_PX])
    close(through(cut, at(100, 20)), [120, LINE_HEIGHT_PX / 2])
  })

  it('an axis label is read from the bottom up: the turned quad\'s cut lays the bottom of the label at the left', () => {
    const label: PixelQuad = [[20, 100], [50, 100], [50, 400], [20, 400]]
    expect(isTall(label)).toBe(true)
    const up = turned(label, 'up')
    expect(isTall(up)).toBe(false)
    const cut = cutOf(up)
    // 300 long and 30 across: 480 × 48
    expect([cut.width, cut.height]).toEqual([480, LINE_HEIGHT_PX])
    // The label's bottom-left corner is where the reading begins, its top-left where it ends
    close(through(cut, [20, 400]), [0, 0])
    close(through(cut, [20, 100]), [480, 0])
    close(through(cut, [50, 400]), [0, LINE_HEIGHT_PX])
  })

  it('and from the top down the other way round: the two readings of one label are half a turn apart', () => {
    const label: PixelQuad = [[20, 100], [50, 100], [50, 400], [20, 400]]
    const down = cutOf(turned(label, 'down'))
    close(through(down, [50, 100]), [0, 0])
    close(through(down, [50, 400]), [480, 0])
    const up = cutOf(turned(label, 'up'))
    const centre: Point = [35, 250]
    close(through(up, centre), [240, LINE_HEIGHT_PX / 2])
    close(through(down, centre), [240, LINE_HEIGHT_PX / 2])
    const [ux, uy] = through(up, [20, 100])
    close(through(down, [20, 100]), [480 - ux, LINE_HEIGHT_PX - uy])
  })

  it('a line that is not tall is left as it is: a square single letter is not an axis label', () => {
    expect(isTall([[0, 0], [40, 0], [40, 50], [0, 50]])).toBe(false)
    expect(isTall([[0, 0], [40, 0], [40, 61], [0, 61]])).toBe(true)
  })
})

describe('normalise', () => {
  it('gives the corners as fractions of the image, in the order they came', () => {
    expect(normalise(turned([[20, 100], [50, 100], [50, 400], [20, 400]], 'up'), 1000, 800))
      .toEqual([[0.02, 0.5], [0.02, 0.125], [0.05, 0.125], [0.05, 0.5]])
  })
})
