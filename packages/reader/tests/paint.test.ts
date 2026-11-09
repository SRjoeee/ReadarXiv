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
    expect(cropsOf(page, { x: 0.5, y: 0.5 }).map((c) => [c.piece, c.from])).toEqual([
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
})

type Box = [number, number, number, number]
const meet = (a: Box, b: Box): Box | null => {
  const x0 = Math.max(a[0], b[0]),
    y0 = Math.max(a[1], b[1]),
    x1 = Math.min(a[2], b[2]),
    y1 = Math.min(a[3], b[3])
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null
}
const inside = (a: Box, b: Box) =>
  a[0] >= b[0] - 1e-9 && a[1] >= b[1] - 1e-9 && a[2] <= b[2] + 1e-9 && a[3] <= b[3] + 1e-9
/** whether rectangles `rs` reach box `n` anywhere outside box `own` */
const reaches = (rs: Box[], n: Box, own: Box) =>
  rs.some((r) => {
    const m = meet(r, n)
    return !!m && !inside(m, own)
  })
/** whether rectangles `rs` cover box `b` whole (sampled) */
const covers = (rs: Box[], b: Box) => {
  for (let x = b[0] + 0.001; x < b[2]; x += (b[2] - b[0]) / 97)
    for (let y = b[1] + 0.001; y < b[3]; y += (b[3] - b[1]) / 31)
      if (!rs.some((r) => x >= r[0] - 1e-9 && x <= r[2] + 1e-9 && y >= r[1] - 1e-9 && y <= r[3] + 1e-9)) return false
  return true
}
const grow = ([x0, y0, x1, y1]: Box, d: number): Box => [x0 - d, y0 - d, x1 + d, y1 + d]
const close = (a: readonly number[] | undefined, b: readonly number[]) => {
  expect(a?.length).toBe(b.length)
  for (const [i, v] of b.entries()) expect(a![i]).toBeCloseTo(v, 9)
}

describe('a crop cut through its own ink and a device pixel round it, clear of every other piece’s (crop-edge)', () => {
  afterEach(() => vi.restoreAllMocks())
  // (2610.21312v1-zh p5 t58: line 1's formula and line 2's "det M = 1", their boxes 0.06 pt over each other; the crop of line
  // 1's drawn in place, its source the typesetter's: the box with its 0.4 / 0.3 margin)
  const O: Box = [73.2, 160.57, 278.69, 174.44],
    N: Box = [73.2, 153.6, 116.39, 160.63]
  const layout: [number, number, number, number, number, number] = [5, 72.8, 160.27, 279.09, 174.74, 165.97]
  const pageOf = (
    item: Partial<Extract<Item, { src: unknown }>>,
    inks: Page['inks'] = [
      [5, ...O, 165.97],
      [5, ...N, 153.71],
    ],
  ): Page => ({
    page: 5,
    wait: { rows: [], faces: [] },
    links: [],
    inks,
    members: [
      {
        ord: 58,
        page: 5,
        state: 'laid',
        off: 3,
        lit: { left: [], right: [], own: [] },
        lines: [[165.97, 73.2, 290, [{ s: 'tr', x: 72.8, src: layout, k: 1, piece: '1', ink: [O], ...item }]]],
      },
    ],
  })
  it('carries its own ink whole and a device pixel round it, and nothing of another’s ink or its edge (2.667 px a point)', () => {
    const px = 3 / 8
    const [c] = cropsOf(pageOf({}), { x: px, y: px })
    // (its source the device pixel round its ink, drawn in place)
    close(c!.src, grow(O, px))
    close(c!.at, grow(O, px))
    expect(covers(c!.clip!, O)).toBe(true)
    expect(reaches(c!.clip!, grow(N, px), O)).toBe(false)
    // (its ring kept where no other ink stands: under its subscripts, right of line 2's formula)
    expect(covers(c!.clip!, [N[2] + px + 0.01, O[1] - px, O[2] + px, O[1]])).toBe(true)
  })
  it('carries its own ink’s every edge pixel where a device pixel is wider than the typesetter’s margin (1.333 px a point)', () => {
    // (the typesetter's margin, 0.3 pt up and down, is under half a device pixel at a 1x screen's 100 %: round 5's probe over
    // the 22 pairs, 583 of the elements' ink pixels outside it)
    const px = 3 / 4
    const [c] = cropsOf(pageOf({}, [[5, ...O, 165.97]]), { x: px, y: px })
    close(c!.src, grow(O, px))
    expect(c!.clip).toBeUndefined()
  })
  it('takes no ring at an edge cut between two glyphs of its element (a URL broken), and cuts there', () => {
    const [c] = cropsOf(pageOf({ src: [5, 72.8, 160.27, 200, 174.74, 165.97], cut: 2 }, [[5, ...O, 165.97]]), {
      x: 0.5,
      y: 0.5,
    })
    close(c!.src, [O[0] - 0.5, O[1] - 0.5, 200, O[3] + 0.5])
  })
  it('leaves its element’s brackets behind where it draws the ink between them, its element’s whole box no neighbour', () => {
    // (2610.21312v1-zh p12 t200: "[784,256,256,10]" drawn inside the translation's own brackets; the page states the element's
    // whole box, which holds the crop's own, and its brackets apart)
    const box: Box = [163.74, 287.51, 237.35, 297.47],
      left: Box = [163.74, 287.51, 166.51, 297.47],
      right: Box = [234.59, 287.51, 237.35, 297.47],
      inner: Box = [166.51, 287.51, 234.59, 297.47]
    const page: Page = {
      page: 12,
      wait: { rows: [], faces: [] },
      links: [],
      inks: [
        [12, ...box, 290],
        [12, ...left, 290],
        [12, ...right, 290],
      ],
      members: [
        {
          ord: 200,
          page: 12,
          state: 'laid',
          off: 3,
          lit: { left: [], right: [], own: [] },
          lines: [
            [
              290,
              72,
              300,
              [{ s: '', x: 166.11, src: [12, 166.11, 287.21, 234.99, 297.77, 290], k: 1, piece: '2', ink: [inner] }],
            ],
          ],
        },
      ],
    }
    const px = 3 / 8
    const [c] = cropsOf(page, { x: px, y: px })
    expect(covers(c!.clip!, inner)).toBe(true)
    expect(reaches(c!.clip!, grow(left, px), inner)).toBe(false)
    expect(reaches(c!.clip!, grow(right, px), inner)).toBe(false)
    // (its ring kept over and under its ink: its element's box, which holds it, no neighbour's)
    expect(covers(c!.clip!, [left[2] + px, inner[3], right[0] - px, inner[3] + px])).toBe(true)
    expect(covers(c!.clip!, [left[2] + px, inner[1] - px, right[0] - px, inner[1]])).toBe(true)
  })
  it('is cut as the typesetter’s source where no ink of its own is stated', () => {
    const [c] = cropsOf(pageOf({ ink: undefined }), { x: 0.5, y: 0.5 })
    close(c!.src, layout.slice(1, 5))
    expect(c!.clip).toBeUndefined()
  })
  it('is drawn through its clip, at the device pixel of the render it is cut from', async () => {
    const page = pageOf({})
    // (a viewport at scale 2 and an output scale of 1: half a point a device pixel)
    const [c] = cropsOf(page, { x: 0.5, y: 0.5 })
    expect(c!.clip?.length).toBeGreaterThan(1)
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
    expect(calls).toEqual(['save', 'path', ...c!.clip!.map(dev), 'clip', 'draw', 'restore'])
  })
})
