// The crops of a laid page (design §4.5 "Painting"): each element's ink cut from the crop render of the page it stands on and
// drawn where its item stands. A member laid across a page break may carry an element of one page onto a line of the other
// (triage-1 B: 2608.16117v1-de t11, its p3 element on p4's line): its pixels are its own page's, as today's crops were.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Item, Page } from '../src/compose/page.ts'
import {
  askDetail,
  cropsAway,
  cropsBack,
  cropsBox,
  cropsFor,
  cropsOf,
  detailAway,
  detailBoxOf,
  detailCropsFor,
  holeOf,
} from '../src/compose/paint.ts'
import { type DetailArea, detailAreaOf } from '../src/stack/stack.ts'

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

describe('a far page holds one bitmap: its crops copied out of the page-sized canvas, and back in the task it returns', () => {
  // (design-performance-2026-11-13 Q7: a kept page's crops canvas let go, its crops' box kept in a canvas of its own; the
  // compositor only ever sees the page-sized canvas, so that a page back is the page that left)
  afterEach(() => vi.restoreAllMocks())
  it("the crops' box: the smallest rectangle of whole device pixels that holds where they are drawn, within the grid", () => {
    expect(
      cropsBox(
        [
          [10.4, 20.6, 30.2, 5.1],
          [50.5, 22, 3, 3],
        ],
        100,
        100,
      ),
    ).toEqual({ x: 10, y: 20, w: 44, h: 6 })
    // (a crop drawn past the grid's edge: the box within it; none drawn: an empty box)
    expect(cropsBox([[-2.5, 95.5, 10, 10]], 100, 100)).toEqual({ x: 0, y: 95, w: 8, h: 5 })
    expect(cropsBox([], 100, 100)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
  it("away: the page-sized bitmap let go, the crops' box copied one to one into a canvas off the document, the CPU's; back: drawn at its place one to one; no copy fits another grid", async () => {
    const crop = (x: number, y: number, piece: string): Item => ({
      s: piece,
      x,
      src: [5, x, y - 3, x + 50, y + 7, y],
      k: 1,
      piece,
    })
    const page: Page = {
      page: 5,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        {
          ord: 1,
          page: 5,
          state: 'laid',
          off: 3,
          lit: { left: [], right: [], own: [] },
          lines: [
            [600, 0, 600, [crop(100.3, 600, 'a')]],
            [580, 0, 600, [crop(240.7, 580, 'b')]],
          ],
        },
      ],
    }
    const draws: { to: HTMLCanvasElement; from: unknown; args: number[]; smooth: boolean; mode: string }[] = []
    const asked = new Map<HTMLCanvasElement, unknown>()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      ...a: unknown[]
    ) {
      const to = this
      if (!asked.has(to)) asked.set(to, a[1])
      return {
        globalCompositeOperation: 'source-over',
        imageSmoothingEnabled: true,
        drawImage(
          this: { imageSmoothingEnabled: boolean; globalCompositeOperation: string },
          from: unknown,
          ...args: number[]
        ) {
          draws.push({ to, from, args, smooth: this.imageSmoothingEnabled, mode: this.globalCompositeOperation })
        },
      } as never
    })
    const pdfPage = {
      getViewport: () => viewportOf(792, 2),
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    }
    const out = (await cropsFor(
      page,
      async () => pdfPage as never,
      viewportOf(792, 2) as never,
      Promise.resolve({} as never),
      {
        sx: 1.5,
        sy: 1.5,
      },
    )) as HTMLCanvasElement
    const over = document.createElement('div')
    over.append(out)
    const grid: [number, number] = [out.width, out.height]
    // (where the crops were drawn on the grid: their union, floored and ceiled)
    const placed = draws.filter((d) => d.to === out).map((d) => d.args.slice(4) as [number, number, number, number])
    expect(placed).toHaveLength(2)
    const x0 = Math.floor(Math.min(...placed.map((r) => r[0]))),
      y0 = Math.floor(Math.min(...placed.map((r) => r[1]))),
      x1 = Math.ceil(Math.max(...placed.map((r) => r[0] + r[2]))),
      y1 = Math.ceil(Math.max(...placed.map((r) => r[1] + r[3])))
    const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    draws.length = 0
    expect(cropsAway(over)).toBe(box.w * box.h)
    expect([out.width, out.height]).toEqual([0, 0])
    expect(out.dataset.axtAway).toBe(`${box.x},${box.y},${box.w},${box.h}`)
    expect(draws).toHaveLength(1)
    const copy = draws[0]?.to as HTMLCanvasElement
    expect([copy.isConnected, copy.width, copy.height, asked.get(copy)]).toEqual([
      false,
      box.w,
      box.h,
      { willReadFrequently: true },
    ])
    expect(draws[0]).toMatchObject({ from: out, args: [box.x, box.y, box.w, box.h, 0, 0, box.w, box.h], smooth: false })
    // (away again: nothing more let go or copied)
    expect(cropsAway(over)).toBe(box.w * box.h)
    expect(draws).toHaveLength(1)
    // (back on another grid, the scale moved while it was away: no copy fits, the canvas left as it is for a drawing anew)
    expect(cropsBack(over, [grid[0] + 3, grid[1]])).toBe(false)
    expect([out.width, out.height]).toEqual([0, 0])
    // (back on its grid: the page-sized canvas again, the copy drawn at its place, one to one, over nothing)
    draws.length = 0
    expect(cropsBack(over, grid)).toBe(true)
    expect([out.width, out.height]).toEqual(grid)
    expect(out.dataset.axtAway).toBeUndefined()
    expect(draws).toEqual([
      {
        to: out,
        from: copy,
        args: [0, 0, box.w, box.h, box.x, box.y, box.w, box.h],
        smooth: false,
        mode: 'source-over',
      },
    ])
    // (back again, and back where nothing went away: nothing to do)
    expect(cropsBack(over, grid)).toBe(true)
    expect(cropsBack(document.createElement('div'), grid)).toBe(true)
    expect(draws).toHaveLength(1)
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

describe('a crop of a line laid in a frame (a unit TeX set turned, docs/PDF-READER.md §18.113)', () => {
  // (2608.12502v1's header cell "Before ($t_1$)" a quarter turned: its formula from 448 to 460 along its line in the frame, its
  // baseline -60 there (x 60 on the page); the translation's line in the frame at baseline -150 (x 150), from 400 (y 400)
  // along the run, the formula's crop 48 along it)
  const formula: Box = [448, -63.4, 460, -53]
  const pageOf = (inks: Page['inks'] = []): Page => ({
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    inks,
    members: [
      {
        ord: 0,
        page: 1,
        state: 'laid',
        off: 3,
        lit: { left: [], right: [], own: [] },
        lines: [
          [
            400,
            150,
            200,
            [{ s: 't1', x: 198, src: [1, ...formula, -60], k: 1, piece: '1', ink: [formula], dir: [0, 1] }],
          ],
        ],
      },
    ],
  })
  it('cuts its source from the original’s turned ink on the page and draws it moved along the turn, its pixels unturned', () => {
    const px = 0.5
    const [c] = cropsOf(pageOf(), { x: px, y: px })
    // (the formula on the page, (x, y) of the frame at (-y, x): x 53 to 63.4, y 448 to 460; the device pixel round it)
    close(c!.src, grow([53, 448, 63.4, 460], px))
    // (drawn where the translation's turned line sets it: 90 across the turn, x + 90 on the page, its place along it the same)
    close(c!.at, grow([143, 448, 153.4, 460], px))
    expect(c!.clip).toBeUndefined()
  })
  // RECORDED, NOT BUILT (the review of #676, CodeRabbit; it fails until it is): a crop of a line laid in a frame whose edge is cut
  // between two of its piece's glyphs (a URL broken across lines, `cut`) takes its own ink whole, its cut edges not applied in
  // its frame before the turn. Reached by nothing today: a framed element states no break points (turned-frames.ts
  // frameElements writes no El.breaks), so the typesetter never cuts one; over the lab's 245 papers 0 framed elements do.
  it.fails('cuts a framed crop’s own ink at its cut edge in its frame before the turn (a broken URL’s head)', () => {
    // (its piece's ink in the frame from 440 to 480, the head's source from 448 to 460, its right edge cut there)
    const page = pageOf()
    const item = page.members[0]!.lines[0]![3][0] as Extract<
      Page['members'][number]['lines'][number][3][number],
      { src: unknown }
    >
    Object.assign(item, { ink: [[440, -63.4, 480, -53]], cut: 2 })
    const [c] = cropsOf(page, { x: 0.5, y: 0.5 })
    // (on the page the frame's x is the page's y: nothing of the head's source past 460, the cut, where its piece's ink goes on)
    expect(c!.src[3]).toBeLessThanOrEqual(460)
  })
  it('is cut clear of another piece’s ink on the page as a level crop is', () => {
    // (a rule of the original's table 0.6 right of the formula on the page; the clip stated where the crop is drawn)
    const [c] = cropsOf(pageOf([[1, 64, 440, 70, 470, 440]]), { x: 0.5, y: 0.5 })
    expect(covers(c!.clip!, [143, 448, 153.4, 460])).toBe(true)
    expect(reaches(c!.clip!, [153.5, 440, 160, 470], [143, 448, 153.4, 460])).toBe(false)
  })
})

describe("crops past PDF.js's canvas cap, cut at its detail canvas's resolution (#crops-sharp: 2611.18114v1 p26 at 600 %)", () => {
  afterEach(() => vi.restoreAllMocks())
  // (a formula drawn at 100 pt across, 702 up; the page at 600 %: 6 CSS px a point)
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [
      {
        ord: 3,
        page: 1,
        state: 'laid',
        off: 2,
        lit: { left: [], right: [], own: [] },
        lines: [[702, 72, 300, [{ s: 'x', x: 100, src: [1, 100, 700, 120, 710, 702], k: 1, piece: '1' }]]],
      },
    ],
  }
  const vp = viewportOf(792, 6)
  /** the page's render, recorded: its canvas's pixels and the transform it was drawn with */
  const recorded = () => {
    const renders: { px: [number, number]; transform: number[] | undefined }[] = []
    const draws: number[][] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          drawImage: (_c: unknown, ...a: number[]) => draws.push(a),
          save() {},
          restore() {},
          beginPath() {},
          rect() {},
          clip() {},
        }) as never,
    )
    const pdfPage = {
      getViewport: () => vp,
      render: ({ canvas, transform }: { canvas: HTMLCanvasElement; transform?: number[] }) => {
        renders.push({ px: [canvas.width, canvas.height], transform })
        return { promise: Promise.resolve(), cancel: () => {} }
      },
    }
    return { renders, draws, pageOf: async () => pdfPage as never }
  }
  it("cuts the crops in view at the detail canvas's own pixels a CSS px, stood where it stands, its sources rendered so", async () => {
    // (the detail canvas: 800 x 600 CSS px of the frame at 2 device px each, as PDF.js draws it at a device's ratio of 2; the
    // page's own canvas past the cap at 0.379)
    const area: DetailArea = { left: 500, top: 400, width: 800, height: 600, px: [1600, 1200] }
    const r = recorded()
    const out = await detailCropsFor(page, r.pageOf, vp as never, Promise.resolve({} as never), area)
    expect(out).not.toBeNull()
    // (its canvas on the detail's grid, 2 device px a CSS px, over the box of the crops' places alone, within the area)
    const box = detailBoxOf(out!)!
    expect([out!.width / box.width, out!.height / box.height]).toEqual([2, 2])
    expect(box.left >= area.left && box.top >= area.top).toBe(true)
    expect(box.left + box.width <= area.left + area.width && box.top + box.height <= area.top + area.height).toBe(true)
    expect(out!.width * out!.height).toBeLessThan((area.px[0] * area.px[1]) / 50)
    // (the crop's place, 100 to 120 pt across and 702 down to the line's foot at 6 CSS px a point, is in the box)
    expect(box.left).toBeLessThanOrEqual(600)
    expect(box.left + box.width).toBeGreaterThanOrEqual(720)
    expect([out!.style.left, out!.style.top, out!.style.width, out!.style.height]).toEqual(
      [
        [box.left, 3600],
        [box.top, 4752],
        [box.width, 3600],
        [box.height, 4752],
      ].map(([v, of]) => `${(v! * 100) / of!}%`),
    )
    // (its source rendered at the detail's 2 a CSS px, the region of its source alone, not the page whole)
    expect(r.renders).toHaveLength(1)
    expect(r.renders[0]!.transform?.slice(0, 4)).toEqual([2, 0, 0, 2])
    expect(r.renders[0]!.px[0] * r.renders[0]!.px[1]).toBeLessThan(area.px[0] * area.px[1])
    // (drawn at its place in the box: 100 pt across is 600 CSS px, from the box's left)
    expect(r.draws[0]![4]).toBeCloseTo((600 - box.left) * 2, 0)
  })
  it('makes none where no crop stands in the area', async () => {
    const r = recorded()
    const far: DetailArea = { left: 2000, top: 3000, width: 800, height: 600, px: [1600, 1200] }
    expect(await detailCropsFor(page, r.pageOf, vp as never, Promise.resolve({} as never), far)).toBeNull()
    expect(r.renders).toHaveLength(0)
  })
  it("reads the detail canvas's area off it, as PDF.js stands it (shares of the frame) and its pixels", () => {
    const canvas = {
      width: 1600,
      height: 1200,
      style: { left: '13.8889%', top: '8.4175%', width: '22.2222%', height: '12.6263%' },
    }
    const a = detailAreaOf(canvas, { width: 3600, height: 4752 })!
    expect([a.left, a.top, a.width, a.height].map((v) => Math.round(v))).toEqual([500, 400, 800, 600])
    expect(a.px).toEqual([1600, 1200])
    expect(detailAreaOf({ ...canvas, style: { ...canvas.style, left: '' } }, { width: 3600, height: 4752 })).toBeNull()
  })
  it("cuts the page's own crops away under the area, so that none is drawn twice", () => {
    const hole = holeOf({ left: 900, top: 1188, width: 1800, height: 2376, px: [1, 1] }, { width: 3600, height: 4752 })
    expect(hole).toBe(
      'polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 25% 25%, 75% 25%, 75% 75%, 25% 75%, 25% 25%)',
    )
  })
  it('drops a cut that finishes after the crops were let go or a later cut was asked (a zoom back while one was cut)', () => {
    const over = document.createElement('div')
    const base = document.createElement('canvas')
    base.className = 'axt-crops'
    base.style.clipPath = 'polygon(evenodd, 0% 0%)'
    over.append(base)
    const first = askDetail(over)
    expect(first()).toBe(true)
    // (let go while it was cut: the zoom back under the cap)
    detailAway(over)
    expect(first()).toBe(false)
    expect(base.style.clipPath).toBe('')
    // (a later cut asked: the earlier one's result is no longer its overlay's)
    const second = askDetail(over)
    const third = askDetail(over)
    expect(second()).toBe(false)
    expect(third()).toBe(true)
    // (each overlay its own)
    expect(askDetail(document.createElement('div'))()).toBe(true)
    expect(third()).toBe(true)
  })
})
