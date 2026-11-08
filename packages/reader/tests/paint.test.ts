// The crops of a laid page (design §4.5 "Painting"): each element's ink cut from the crop render of the page it stands on and
// drawn where its item stands. A member laid across a page break may carry an element of one page onto a line of the other
// (triage-1 B: 2608.16117v1-de t11, its p3 element on p4's line): its pixels are its own page's, as today's crops were.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '../src/compose/page.ts'
import { cropsFor, cropsOf } from '../src/compose/paint.ts'

/** a viewport of a page `h` points high at `scale`, upright: PDF units to CSS px, y down */
const viewportOf = (h: number, scale: number) => ({
  width: 600 * scale,
  height: h * scale,
  scale,
  rotation: 0,
  viewBox: [0, 0, 600, h],
  convertToViewportPoint: (x: number, y: number) => [x * scale, (h - y) * scale],
})

describe("a laid page's crops", () => {
  afterEach(() => vi.restoreAllMocks())
  it('cuts each crop from the render of the page its ink stands on, this page or another of its member’s', async () => {
    const page: Page = {
      page: 4,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        {
          ord: 11,
          page: 4,
          state: 'laid',
          off: 1,
          lit: { left: [], right: [], own: [] },
          lines: [
            [
              700,
              72,
              300,
              [
                { s: 'x', x: 100, src: [3, 211.74, 67.57, 227.26, 80.13, 70.87], k: 1, piece: '14' },
                { s: 'y', x: 200, src: [4, 150, 698, 170, 707, 700], k: 1, piece: '15' },
              ],
            ],
          ],
        },
      ],
    }
    expect(cropsOf(page).map((c) => [c.piece, c.from])).toEqual([
      ['14', 3],
      ['15', 4],
    ])
    // (each render marks its canvas with the page it drew; each cut reads the canvas it is cut from)
    const drawn: [piece: string, from: string | undefined, sx: number, sy: number][] = []
    let next = 0
    const pieces = ['14', '15']
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          drawImage: (c: HTMLCanvasElement, sx: number, sy: number) =>
            drawn.push([pieces[next++]!, c.dataset.from, sx, sy]),
        }) as never,
    )
    const pdfPage = (n: number, h: number) => ({
      getViewport: ({ scale, rotation }: { scale: number; rotation: number }) => {
        expect(rotation).toBe(0)
        return viewportOf(h, scale)
      },
      render: ({ canvas }: { canvas: HTMLCanvasElement }) => {
        canvas.dataset.from = String(n)
        return { promise: Promise.resolve(), cancel: () => {} }
      },
    })
    const pages = new Map([
      [3, pdfPage(3, 800)],
      [4, pdfPage(4, 792)],
    ])
    const out = await cropsFor(
      page,
      async (n) => pages.get(n) as never,
      viewportOf(792, 2) as never,
      Promise.resolve({} as never),
      { sx: 1, sy: 1 },
    )
    expect(out).not.toBeNull()
    // (piece 14 from page 3's render, at page 3's own frame (800 points high); piece 15 from this page's)
    expect(drawn.map(([p, from]) => [p, from])).toEqual([
      ['14', '3'],
      ['15', '4'],
    ])
    expect(drawn[0]![3]).toBeCloseTo((800 - 80.13 - 0.6) * 2)
    expect(drawn[1]![3]).toBeCloseTo((792 - 707 - 0.6) * 2)
  })
})
