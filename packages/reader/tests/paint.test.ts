// The crops of a laid page (design §4.5 "Painting"): each element's ink cut from the crop render of the page it stands on and
// drawn where its item stands. A member laid across a page break may carry an element of one page onto a line of the other
// (triage-1 B: 2608.16117v1-de t11, its p3 element on p4's line): its pixels are its own page's, as today's crops were.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Item, Page } from '../src/compose/page.ts'
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
    // (each cut as the typesetter states its source: its ink with the antialiased margin round it, nothing more)
    expect(drawn[0]![3]).toBeCloseTo((800 - 80.13) * 2)
    expect(drawn[1]![3]).toBeCloseTo((792 - 707) * 2)
  })
  it('darkens each crop into the crops’ canvas, so that one drawn after another never covers its ink with its paper', async () => {
    // (two formulas on consecutive drawn lines whose sources' margins overlap where they are drawn, 0.55 pt: 2610.21504v1-zh p5
    // t81; drawn over, the later one's paper took the earlier one's descenders' tips)
    const crop = (x: number, y: number, piece: string): Item => ({
      s: piece,
      x,
      src: [5, x, y - 3, x + 150, y + 7, y],
      k: 1,
      piece,
    })
    const page: Page = {
      page: 5,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        {
          ord: 81,
          page: 5,
          state: 'laid',
          off: 3,
          lit: { left: [], right: [], own: [] },
          lines: [
            [600, 72, 300, [crop(72, 600, '28')]],
            [590.45, 72, 300, [crop(72, 590.45, '30')]],
          ],
        },
      ],
    }
    const modes: string[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      return {
        globalCompositeOperation: 'source-over',
        drawImage(this: { globalCompositeOperation: string }) {
          modes.push(this.globalCompositeOperation)
        },
      } as never
    })
    const pdfPage = {
      getViewport: () => viewportOf(792, 2),
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    }
    await cropsFor(page, async () => pdfPage as never, viewportOf(792, 2) as never, Promise.resolve({} as never), {
      sx: 1,
      sy: 1,
    })
    expect(modes).toEqual(['darken', 'darken'])
  })
  it('draws a crop through the rectangles it states, so that another piece’s ink in its rectangle stays behind', async () => {
    // (2610.21312v1-zh p5 t58: line 1's formula, its source reaching 0.3 pt under its ink into line 2's glyph tops, drawn in
    // place; its clip its own ink's box and the rest of its source clear of line 2's)
    const src: [number, number, number, number, number, number] = [5, 72.8, 160.27, 279.09, 174.74, 165.97]
    const clip: [number, number, number, number][] = [
      [73.2, 160.57, 278.69, 174.44],
      [116.39, 160.27, 279.09, 174.74],
      [72.8, 160.63, 116.39, 174.74],
    ]
    const page: Page = {
      page: 5,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        {
          ord: 58,
          page: 5,
          state: 'laid',
          off: 3,
          lit: { left: [], right: [], own: [] },
          lines: [[165.97, 73.2, 290, [{ s: 'tr', x: 72.8, src, k: 1, piece: '0', clip }]]],
        },
      ],
    }
    const [c] = cropsOf(page)
    const near = (a: readonly number[] | undefined, b: readonly number[]) => {
      expect(a?.length).toBe(b.length)
      for (const [i, v] of b.entries()) expect(a![i]).toBeCloseTo(v, 9)
    }
    near(c!.src, [72.8, 160.27, 279.09, 174.74])
    // (drawn in place: its line's baseline its source's, at its source's x)
    near(c!.at, [72.8, 160.27, 279.09, 174.74])
    expect(c!.clip?.length).toBe(clip.length)
    for (const [i, r] of clip.entries()) near(c!.clip![i], r)
    const calls: string[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          save: () => calls.push('save'),
          restore: () => calls.push('restore'),
          beginPath: () => calls.push('path'),
          rect: (x: number, y: number, w: number, h: number) =>
            calls.push(`rect ${[x, y, w, h].map((v) => Math.round(v * 100) / 100).join(' ')}`),
          clip: () => calls.push('clip'),
          drawImage: () => calls.push('draw'),
        }) as never,
    )
    const pdfPage = {
      getViewport: () => viewportOf(792, 2),
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    }
    await cropsFor(page, async () => pdfPage as never, viewportOf(792, 2) as never, Promise.resolve({} as never), {
      sx: 1,
      sy: 1,
    })
    // (the clip's rectangles where the crop is drawn, device px of this page's frame: y down from its top)
    const dev = ([x0, y0, x1, y1]: [number, number, number, number]) =>
      `rect ${[x0 * 2, (792 - y1) * 2, (x1 - x0) * 2, (y1 - y0) * 2].map((v) => Math.round(v * 100) / 100).join(' ')}`
    expect(calls).toEqual(['save', 'path', ...clip.map(dev), 'clip', 'draw', 'restore'])
  })
})
