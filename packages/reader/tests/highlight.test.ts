// The highlight over a figure text the original sets turned (docs/PDF-READER.md §17; Laid.lit's `dir`): its boxes in its run's
// frame, painted as a band turned with its text about its own centre, and hit where it is painted. Over a stand-in of the panes
// (one upright page 600 × 800 at scale 1: a PDF unit a CSS px, y down) and of the composer (one laid Page).
import { describe, expect, it, vi } from 'vitest'
import type { Composer } from '../src/compose/composer.ts'
import { createHighlight, PAD } from '../src/compose/highlight.ts'
import type { Box, Page } from '../src/compose/page.ts'
import type { Panes } from '../src/panes/panes.ts'
import type { Clock } from '../src/stack/clock.ts'

const H = 800
const clock: Clock = { now: () => 0, later: () => 1, clear: () => {}, frame: () => 1, cancel: () => {} }

function setUp(page: Page) {
  const els = { left: document.createElement('div'), right: document.createElement('div') }
  for (const [side, el] of Object.entries(els)) {
    el.className = 'page'
    el.dataset.pageNumber = '1'
    el.dataset.side = side
    // (its box on the screen at the page's origin, 600 CSS px wide: a point of the screen is the page's own)
    Object.defineProperty(el, 'offsetWidth', { value: 600 })
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 600, height: H, right: 600, bottom: H, x: 0, y: 0 }) as DOMRect
    document.body.append(el)
  }
  const panes = {
    scale: 1,
    right: { pages: 1, on: () => () => {} },
    on: () => () => {},
    pageElement: (side: 'left' | 'right') => els[side],
    containerOf: () => document.body,
    frameOf: () => ({ turn: 0, w: 600, h: H, width: 600, height: H }),
    boxOf: (_side: string, _n: number, r: Box) => ({
      left: Math.min(r[0], r[2]),
      top: H - Math.max(r[1], r[3]),
      width: Math.abs(r[2] - r[0]),
      height: Math.abs(r[3] - r[1]),
    }),
  } as unknown as Panes
  const composer = {
    page: () => page,
    laid: () => page,
    muted: () => false,
    on: () => () => {},
  } as unknown as Composer
  return { els, hl: createHighlight({ panes, composer, clock, on: true }) }
}

describe('the highlight of a figure text set turned', () => {
  // (a y-axis title set a quarter turned, up the page: its run along (0, 1) from (150, 380), 20 long; its band across it 8, x 144
  // to 152 on the page. In its run's frame: s its y, t its −x)
  const box: Box = [380, -152, 400, -144]
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [
      {
        ord: 7,
        page: 1,
        state: 'laid',
        off: 1,
        lines: [[380, 150, 170, [{ s: 'Loss', x: 150, face: '400 100px "axt-x"', size: 8, dir: [0, 1] }]]],
        lit: { left: [[box]], right: [[box]], own: [], dir: [0, 1] },
      },
    ],
  }
  it('paints its band turned with its text about its own centre, padded beside along its run', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 7, s: -1 })
    const band = els.right.querySelector<HTMLElement>('.axt-hl')
    expect(band).not.toBeNull()
    // (its middle on the page at (148, 390): (148, 410) in CSS px; its run up the page, −90° in CSS's terms; 20 along it and
    // the pad either side, 8 across)
    expect(band!.style.transform).toBe(
      `translate(148px, 410px) rotate(-90deg) translate(${-(20 + 2 * PAD) / 2}px, -4px)`,
    )
    expect([band!.style.width, band!.style.height]).toEqual([`${20 + 2 * PAD}px`, '8px'])
    expect(els.left.querySelector('.axt-hl')).not.toBeNull()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('is hit where it is painted: over its turned band, not beside it', () => {
    const { els, hl } = setUp(page)
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(els.right)
    // (its band covers x 144-152 and, padded, y 397-423 on the screen)
    expect(hl.at('right', 148, 400)).toEqual({ id: 7, s: -1 })
    expect(hl.at('right', 150, 421)).toEqual({ id: 7, s: -1 })
    expect(hl.at('right', 160, 410)).toBeNull()
    expect(hl.at('right', 148, 380)).toBeNull()
    spy.mockRestore()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})

describe('the highlight by sentence', () => {
  // (a member of three sentences, lit by sentence on both panes (Laid.lit: one entry a sentence): on the left its lines on A cut at
  // its starts, on the right its laid lines' tokens)
  const left: Box[][] = [
    [[72, 698, 200, 707]],
    [
      [200, 698, 300, 707],
      [72, 686, 150, 695],
    ],
    [
      [150, 686, 300, 695],
      [72, 674, 200, 683],
    ],
  ]
  const right: Box[][] = [
    [[80, 690, 150, 700]],
    [
      [150, 690, 300, 700],
      [80, 676, 120, 686],
    ],
    [[120, 676, 280, 686]],
  ]
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [{ ord: 3, page: 1, state: 'laid', off: 1, lines: [], lit: { left, right, own: [] } }],
  }
  it('lights the sentence under the pointer and its translation, and only it, on both panes', () => {
    const { els, hl } = setUp(page)
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(els.left)
    // (a point of the second sentence's second row on A, x 100, y 690 up: 110 down)
    const t = hl.at('left', 100, 110)
    expect(t).toEqual({ id: 3, s: 1 })
    hl.light(t)
    expect(hl.bands()).toEqual({ left: 1, right: 1 })
    // (the second sentence's rows on each pane, one shape of two rows: from x 72 on the left, 80 on the right, less the pad)
    const shape = (side: 'left' | 'right') => els[side].querySelector<HTMLElement>('.axt-hl')!
    expect(shape('left').getAttribute('class')).toContain('axt-hl-shape')
    expect(shape('left').style.left).toBe(`${72 - PAD}px`)
    expect(shape('right').getAttribute('class')).toContain('axt-hl-shape')
    expect(shape('right').style.left).toBe(`${80 - PAD}px`)
    // (its translation's third sentence from the right: one row there, two on A)
    spy.mockReturnValue(els.right)
    const third = hl.at('right', 200, 800 - 680)
    expect(third).toEqual({ id: 3, s: 2 })
    hl.light(third)
    expect(shape('right').getAttribute('class')).not.toContain('axt-hl-shape')
    expect(shape('left').style.left).toBe(`${72 - PAD}px`)
    expect(shape('left').getAttribute('class')).toContain('axt-hl-shape')
    // (lit whole: every sentence's shape)
    hl.light({ id: 3, s: -1 })
    expect(hl.bands()).toEqual({ left: 3, right: 3 })
    spy.mockRestore()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('paints nothing on a page that holds none of the sentence lit (its kept ink on another page, lit alone)', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 3, s: 3 })
    expect(hl.bands()).toEqual({ left: 0, right: 0 })
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})

/** the outlines of a band's path, each its corners in the page's CSS px (shapePath: an outline is `M` … `Z`, a corner the control
 *  point of its `Q`), the band's own offset added */
function outlinesOf(el: Element | null): [number, number][][] {
  if (!el) return []
  const at = [parseFloat((el as HTMLElement).style.left), parseFloat((el as HTMLElement).style.top)] as const
  const d = el.querySelector('path')?.getAttribute('d')
  if (!d) {
    const s = (el as HTMLElement).style
    const [x0, y0, w, h] = [parseFloat(s.left), parseFloat(s.top), parseFloat(s.width), parseFloat(s.height)]
    return [
      [
        [x0, y0],
        [x0 + w, y0],
        [x0 + w, y0 + h],
        [x0, y0 + h],
      ],
    ]
  }
  return d
    .split('Z')
    .filter((s) => s.trim())
    .map((s) =>
      [...s.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)].map(
        (m) => [Number(m[1]) + at[0], Number(m[2]) + at[1]] as [number, number],
      ),
    )
}
/** whether a point stands inside a polygon (its corners), by the even-odd rule */
function inside([x, y]: [number, number], poly: [number, number][]): boolean {
  let n = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!,
      [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n
  }
  return n
}
/** the page's CSS px of a box's middle (y down) */
const middleOf = (b: Box): [number, number] => [(b[0] + b[2]) / 2, H - (b[1] + b[3]) / 2]
const painted = (els: Record<'left' | 'right', HTMLElement>, side: 'left' | 'right') =>
  [...els[side].querySelectorAll('.axt-hl')].flatMap(outlinesOf)

describe('the highlight never fills a display nor bridges two rows across another block (docs/PDF-READER.md §17.3, §17.9)', () => {
  // (the owner's report of 2026-11-09 on staging, 2602.23285v2 p15: a sentence going on past display (11) lit one shape over the
  // display across the column on both panes; today lights two bars, one a text line, and the display not at all. Today's runs are
  // cut where another block's line stands between two of a unit's rows, its own display included (highlight.mjs interrupted);
  // each run one outline)
  const D: Box = [150, 656, 300, 680]
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [
      {
        ord: 3,
        page: 1,
        state: 'laid',
        off: 1,
        lines: [],
        lit: {
          // (two sentences: the second from the middle of its first row to the line after the display, which stands between
          // its two rows, a block of its own)
          left: [
            [
              [72, 710, 300, 719],
              [72, 698, 300, 707],
            ],
            [
              [72, 686, 200, 695],
              [72, 640, 280, 649],
            ],
          ],
          right: [
            [
              [80, 710, 290, 720],
              [80, 698, 290, 708],
            ],
            [
              [80, 686, 180, 696],
              [80, 640, 270, 650],
            ],
          ],
          own: [['3', [D]]],
        },
      },
    ],
  }
  it('lights a sentence across its display as a bar on each of its rows, the display unlit, on both panes', () => {
    const { els, hl } = setUp(page)
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(els.left)
    const t = hl.at('left', 100, H - 690)
    expect(t).toEqual({ id: 3, s: 1 })
    hl.light(t)
    for (const side of ['left', 'right'] as const) {
      const outlines = painted(els, side)
      expect(outlines).toHaveLength(2)
      expect(outlines.some((o) => inside(middleOf(D), o))).toBe(false)
    }
    spy.mockRestore()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('lights the display alone where the pointer is over it, and never with its member lit whole', () => {
    const { els, hl } = setUp(page)
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(els.right)
    const t = hl.at('right', ...middleOf(D))
    expect(t).toEqual({ id: 3, s: -2 - 3 })
    hl.light(t)
    expect(hl.bands()).toEqual({ left: 1, right: 1 })
    for (const side of ['left', 'right'] as const)
      expect(painted(els, side).some((o) => inside(middleOf(D), o))).toBe(true)
    hl.light({ id: 3, s: -1 })
    expect(hl.bands()).toEqual({ left: 2, right: 2 })
    for (const side of ['left', 'right'] as const)
      expect(painted(els, side).some((o) => inside(middleOf(D), o))).toBe(false)
    spy.mockRestore()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('lights a member lit whole around its two displays as its text alone, each display a block of its own (no shape nested)', () => {
    // (the owner's report of 2026-11-09 on staging, 2609.33403v1 §4.2: a paragraph of one sentence to its translator, two displays
    // in it, lit as one region over both, the displays' own shape drawn inside it)
    const D1: Box = [150, 668, 300, 692],
      D2: Box = [150, 622, 300, 646]
    const rows: Box[] = [
      [72, 710, 300, 719],
      [72, 698, 200, 707],
      [72, 652, 300, 661],
      [72, 606, 250, 615],
    ]
    const whole: Page = {
      ...page,
      members: [
        {
          ord: 5,
          page: 1,
          state: 'laid',
          off: 1,
          lines: [],
          lit: {
            left: [rows],
            right: [rows],
            own: [
              ['1', [D1]],
              ['2', [D2]],
            ],
          },
        },
      ],
    }
    const { els, hl } = setUp(whole)
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(els.left)
    const t = hl.at('left', 100, H - 714)
    expect(t).toEqual({ id: 5, s: -1 })
    hl.light(t)
    expect(hl.bands()).toEqual({ left: 1, right: 1 })
    for (const side of ['left', 'right'] as const) {
      const outlines = painted(els, side)
      // (its first two rows one outline; the row between the displays and the row after the second each one of its own)
      expect(outlines).toHaveLength(3)
      for (const d of [D1, D2]) expect(outlines.some((o) => inside(middleOf(d), o))).toBe(false)
    }
    for (const [j, d] of [D1, D2].entries()) {
      const over = hl.at('left', ...middleOf(d))
      expect(over).toEqual({ id: 5, s: -2 - (1 + j) })
      hl.light(over)
      expect(hl.bands()).toEqual({ left: 1, right: 1 })
      expect(painted(els, 'left')).toHaveLength(1)
      expect(painted(els, 'left').some((o) => inside(middleOf(d), o))).toBe(true)
      expect(painted(els, 'left').some((o) => inside(middleOf(j ? D1 : D2), o))).toBe(false)
    }
    spy.mockRestore()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('cuts a shape where another member’s row stands between two of its rows (a float set inside a paragraph)', () => {
    const caption: Box = [72, 650, 300, 659]
    const two: Page = {
      ...page,
      members: [
        {
          ord: 7,
          page: 1,
          state: 'laid',
          off: 1,
          lines: [],
          lit: {
            left: [
              [
                [72, 710, 300, 719],
                [72, 698, 300, 707],
                [72, 600, 300, 609],
              ],
            ],
            right: [
              [
                [72, 710, 300, 719],
                [72, 698, 300, 707],
                [72, 600, 300, 609],
              ],
            ],
            own: [],
          },
        },
        { ord: 8, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [[caption]], right: [[caption]], own: [] } },
      ],
    }
    const { els, hl } = setUp(two)
    hl.light({ id: 7, s: -1 })
    for (const side of ['left', 'right'] as const) {
      const outlines = painted(els, side)
      expect(outlines).toHaveLength(2)
      expect(outlines.some((o) => inside(middleOf(caption), o))).toBe(false)
    }
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('keeps one outline over a gap between two rows that nothing stands in (a unit’s own room, as today’s runs)', () => {
    const rows: Box[] = [
      [72, 710, 300, 719],
      [72, 698, 300, 707],
      [72, 660, 300, 669],
    ]
    const gap: Page = {
      ...page,
      members: [{ ord: 9, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [rows], right: [rows], own: [] } }],
    }
    const { els, hl } = setUp(gap)
    hl.light({ id: 9, s: -1 })
    for (const side of ['left', 'right'] as const) expect(painted(els, side)).toHaveLength(1)
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('never joins two short rows across a display that stands beside them in their column (no strip down the column’s edge)', () => {
    // (the owner's report of 2026-11-10 on staging, 2610.17024v1 p9: a sentence whose translation ends a line short (two
    // characters) before display (43) and goes on short (two) after it, then display (44): the two short rows, both left of the
    // displays' ink, were one outline, a strip down the column's left over (43)'s row; on arXiv's page the rows, longer, were
    // cut. Today's runs are cut where a block stands between two rows in the column, whatever the rows' width)
    const D43: Box = [150, 656, 300, 680],
      D44: Box = [110, 612, 300, 622]
    const rows: Box[] = [
      [80, 710, 300, 719],
      [72, 698, 100, 707],
      [72, 630, 100, 639],
      [72, 590, 300, 599],
    ]
    const strip: Page = {
      ...page,
      members: [
        {
          ord: 11,
          page: 1,
          state: 'laid',
          off: 1,
          lines: [],
          lit: {
            left: [rows],
            right: [rows],
            own: [
              ['43', [D43]],
              ['44', [D44]],
            ],
          },
        },
      ],
    }
    const { els, hl } = setUp(strip)
    hl.light({ id: 11, s: -1 })
    for (const side of ['left', 'right'] as const) {
      const outlines = painted(els, side)
      // (its first two rows one outline, the row between the displays one, the row after the second one)
      expect(outlines).toHaveLength(3)
      // (nothing painted on either display's row, beside it in the column under the short rows: x 86)
      for (const d of [D43, D44]) {
        expect(outlines.some((o) => inside(middleOf(d), o))).toBe(false)
        expect(outlines.some((o) => inside([86, middleOf(d)[1]], o))).toBe(false)
      }
    }
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})
