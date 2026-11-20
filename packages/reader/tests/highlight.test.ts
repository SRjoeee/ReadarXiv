// The highlight over a figure text the original sets turned (docs/PDF-READER.md §17; Laid.lit's `dir`): its boxes in its run's
// frame, painted as a band turned with its text about its own centre, and hit where it is painted. Over a stand-in of the panes
// (one upright page 600 × 800 at scale 1: a PDF unit a CSS px, y down) and of the composer (one laid Page).
import { describe, expect, it } from 'vitest'
import type { Composer } from '../src/compose/composer.ts'
import { createHighlight, PAD, type Pads, padsOf, paintRows } from '../src/compose/highlight.ts'
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
    document.body.append(el)
  }
  const panes = {
    scale: 1,
    right: { pages: 1, on: () => () => {} },
    on: () => () => {},
    pageElement: (side: 'left' | 'right') => els[side],
    // (each pane's page at the screen's origin, 600 CSS px wide: a point of the screen is the page's own)
    pointAt: (_side: string, x: number, y: number) =>
      x >= 0 && x <= 600 && y >= 0 && y <= H ? { page: 1, x, y } : null,
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
  it('paints a turned figure text\u2019s band unpadded where Laid.lit states its band alone', () => {
    const banded: Page = { ...page, members: [{ ...page.members[0]!, lit: { ...page.members[0]!.lit, band: true } }] }
    const { els, hl } = setUp(banded)
    hl.light({ id: 7, s: -1 })
    const band = els.right.querySelector<HTMLElement>('.axt-hl')!
    expect([band.style.width, band.style.height]).toEqual(['20px', '8px'])
    expect(band.style.transform).toBe('translate(148px, 410px) rotate(-90deg) translate(-10px, -4px)')
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('is hit where it is painted: over its turned band, not beside it', () => {
    const { els, hl } = setUp(page)
    // (its band covers x 144-152 and, padded, y 397-423 on the screen)
    expect(hl.at('right', 148, 400)).toEqual({ id: 7, s: -1 })
    expect(hl.at('right', 150, 421)).toEqual({ id: 7, s: -1 })
    expect(hl.at('right', 160, 410)).toBeNull()
    expect(hl.at('right', 148, 380)).toBeNull()
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
    const third = hl.at('right', 200, 800 - 680)
    expect(third).toEqual({ id: 3, s: 2 })
    hl.light(third)
    expect(shape('right').getAttribute('class')).not.toContain('axt-hl-shape')
    expect(shape('left').style.left).toBe(`${72 - PAD}px`)
    expect(shape('left').getAttribute('class')).toContain('axt-hl-shape')
    // (lit whole: every sentence's shape)
    hl.light({ id: 3, s: -1 })
    expect(hl.bands()).toEqual({ left: 3, right: 3 })
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
    const t = hl.at('left', 100, H - 690)
    expect(t).toEqual({ id: 3, s: 1 })
    hl.light(t)
    for (const side of ['left', 'right'] as const) {
      const outlines = painted(els, side)
      expect(outlines).toHaveLength(2)
      expect(outlines.some((o) => inside(middleOf(D), o))).toBe(false)
    }
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('lights the display alone where the pointer is over it, and never with its member lit whole', () => {
    const { els, hl } = setUp(page)
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

describe('the highlight of a figure text is its own line band', () => {
  // (2610.21313v1-zh p3 t179, the fresh rows' sheet: a 4.67 pt label "SAMA" of a stack of cards 2.33 pt apart, padded by the page's
  // half leading (2.71 pt, its body text's) and 3 px beside: its shape held the middle of the card behind's label. A figure text's
  // shape is its line band alone (Laid.lit's `band`), on both panes; a body member's keeps the page's pad. Here a body member's
  // two rows 12 pt apart (gaps of 3: half leading 1.5) and a figure text's band of 5 on its own)
  const body: Box[][] = [
    [
      [72, 700, 300, 709],
      [72, 688, 300, 697],
    ],
  ]
  const label: Box = [400, 600, 420, 605]
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [
      { ord: 3, page: 1, state: 'laid', off: 1, lines: [], lit: { left: body, right: body, own: [] } },
      {
        ord: 9,
        page: 1,
        state: 'laid',
        off: 1,
        lines: [],
        lit: { left: [[label]], right: [[label]], own: [], band: true },
      },
    ],
  }
  const box = (el: HTMLElement) => [el.style.left, el.style.top, el.style.width, el.style.height]
  it('paints a figure text on its band alone, on both panes, and hits it there alone', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 9, s: -1 })
    for (const side of ['left', 'right'] as const) {
      const shapes = [...els[side].querySelectorAll<HTMLElement>('.axt-hl')]
      expect(shapes.map(box)).toEqual([['400px', `${H - 605}px`, '20px', '5px']])
    }
    expect(hl.at('right', 410, H - 602)).toEqual({ id: 9, s: -1 })
    // (a point beside it by the pad, or over it by the page's half leading, is none of it)
    expect(hl.at('right', 421.5, H - 602)).toBeNull()
    expect(hl.at('right', 410, H - 606)).toBeNull()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('keeps a body member’s shape padded as before: the pad beside, half the page’s leading over and under', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 3, s: -1 })
    const shape = els.right.querySelector<HTMLElement>('.axt-hl')!
    expect([shape.style.left, shape.style.top]).toEqual([`${72 - PAD}px`, `${H - 709 - 1.5}px`])
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})

describe('the half leading is read between a member’s rows, whatever sentence each row is of', () => {
  // (a paragraph lit by sentence whose every sentence holds one row on each pane, rows 18 pt apart with 6 pt between them, and
  // a heading of one row under it: the page's leading is the 6 pt between the paragraph's rows, so every shape on the page is
  // padded 3 over and under. Read inside each sentence alone, the page held no gap and padded nothing: a heading's shape stood
  // on its glyphs' em box, flush with their ink, on a pane whose sentences are each one row, while the left padded them)
  const para: Box[][] = [[[72, 700, 300, 712]], [[72, 682, 300, 694]], [[72, 664, 200, 676]]]
  const head: Box = [72, 630, 150, 644]
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [
      { ord: 4, page: 1, state: 'laid', off: 1, lines: [], lit: { left: para, right: para, own: [] } },
      { ord: 5, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [[head]], right: [[head]], own: [] } },
    ],
  }
  it('pads a heading of one row by half the space between the paragraph’s rows, on both panes', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 5, s: -1 })
    for (const side of ['left', 'right'] as const) {
      const shape = els[side].querySelector<HTMLElement>('.axt-hl')!
      expect([shape.style.top, shape.style.height]).toEqual([`${H - 644 - 3}px`, `${14 + 2 * 3}px`])
    }
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('pads a member of two rows or more by half its own leading where the page’s is another (as before where they agree)', () => {
    // (the paragraph's own rows 6 pt apart: its half leading 3, the page's; a shape of it padded 3 over and under, as before)
    const { els, hl } = setUp(page)
    hl.light({ id: 4, s: 0 })
    const shape = els.left.querySelector<HTMLElement>('.axt-hl')!
    expect([shape.style.top, shape.style.height]).toEqual([`${H - 712 - 3}px`, `${12 + 2 * 3}px`])
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('reads no gap between two sentences that share a row (their boxes on one band) (the page’s, for a member of one row)', () => {
    // (the paragraph's second and third sentences on one row: the gaps are still the 6 pt between its rows)
    const shared: Box[][] = [[[72, 700, 300, 712]], [[72, 682, 150, 694]], [[150, 682, 300, 694]]]
    const one: Page = {
      ...page,
      members: [{ ...page.members[0]!, lit: { left: shared, right: shared, own: [] } }, page.members[1]!],
    }
    const { els, hl } = setUp(one)
    hl.light({ id: 5, s: -1 })
    const shape = els.right.querySelector<HTMLElement>('.axt-hl')!
    expect(shape.style.top).toBe(`${H - 644 - 3}px`)
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})

describe('a member’s rows are padded by its own leading, never past half the room to the next block', () => {
  // (2610.19274v1-zh p34: a double-spaced body, its rows 18 pt apart, makes the page's half leading 9 (the lower quartile of
  // every member's gaps); a caption set single-spaced, rows 5.5 pt apart, was padded 9 under its last row, over the top half of
  // the table's header labels set 2 pt under it. Here: the body's five rows, the caption's two, a header cell 2 pt under it)
  const body: Box[][] = [
    [
      [72, 760, 540, 770],
      [72, 732, 540, 742],
      [72, 704, 540, 714],
      [72, 676, 540, 686],
      [72, 648, 540, 658],
    ],
  ]
  const caption: Box[][] = [
    [
      [72, 600, 540, 609],
      [72, 585.5, 300, 594.5],
    ],
  ]
  const cell: Box = [80, 576, 120, 583.5]
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [
      { ord: 1, page: 1, state: 'laid', off: 1, lines: [], lit: { left: body, right: body, own: [] } },
      { ord: 2, page: 1, state: 'laid', off: 1, lines: [], lit: { left: caption, right: caption, own: [] } },
      { ord: 3, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [[cell]], right: [[cell]], own: [] } },
    ],
  }
  const edges = (el: Element) => {
    const s = (el as HTMLElement).style
    const top = Number.parseFloat(s.top),
      h = Number.parseFloat(s.height)
    return { top: H - top, foot: H - (top + h) }
  }
  it('keeps a single-spaced caption’s shape off the block 2 pt under it on a double-spaced page, on both panes', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 2, s: -1 })
    for (const side of ['left', 'right'] as const) {
      const shape = els[side].querySelector('.axt-hl')!
      const { top, foot } = edges(shape)
      // (over its first row by half its own leading, 2.75; under its last by half the room to the cell, 1: never the page's 9)
      expect(top).toBeCloseTo(609 + 2.75, 6)
      expect(foot).toBeCloseTo(585.5 - 1, 6)
      expect(foot).toBeGreaterThan((cell[1] + cell[3]) / 2)
    }
    // (hit where it is painted: a point a pad under its foot is the cell's or none, never the caption's)
    expect(hl.at('left', 100, H - 584)).not.toEqual({ id: 2, s: -1 })
    expect(hl.at('left', 100, H - 590)).toEqual({ id: 2, s: -1 })
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('reads no leading of a member’s own across its display: two rows its display parts have no gap, the page’s pads them', () => {
    // (a paragraph of two tall rows, inline formulas, its display between them: 36 pt between the rows is no space between lines;
    // read as one, half of it would pad the paragraph 18 pt over its first row)
    const rows: Box[][] = [
      [
        [72, 500, 300, 524],
        [72, 440, 300, 464],
      ],
    ]
    const display: Box = [100, 468, 280, 496]
    const withDisplay: Page = {
      ...page,
      members: [
        page.members[0]!,
        {
          ord: 6,
          page: 1,
          state: 'laid',
          off: 1,
          lines: [],
          lit: { left: rows, right: rows, own: [['3', [display]]] },
        },
      ],
    }
    const { els, hl } = setUp(withDisplay)
    hl.light({ id: 6, s: -1 })
    const shape = els.left.querySelector('.axt-hl')!
    expect(edges(shape).top).toBeCloseTo(524 + 9, 6)
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('pads the double-spaced body by half its own leading, 9, where nothing stands nearer', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 1, s: -1 })
    const shape = els.right.querySelector('.axt-hl')!
    const { top, foot } = edges(shape)
    expect(top).toBeCloseTo(770 + 9, 6)
    expect(foot).toBeCloseTo(648 - 9, 6)
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})

describe('two rows of a shape whose pads differ meet in the gap between their own boxes, never inside one', () => {
  // (a row's pads are its member's own, cut on one side by a block that stands near it (padsOf): two rows one over the other
  // may carry different pads. Met at the middle of their padded edges, the upper row's foot was raised into its own box where
  // the gap between the two is narrower than the lower one's pad: boxes 1 apart, the upper one unpadded under, the lower one
  // padded 5 over: met at 22, two points over the upper box's foot at 20, that strip of it neither painted nor hit)
  const upper: Box = [50, 20, 150, 30]
  const lower: Box = [0, 9, 50, 19]
  const padsBy =
    (u: readonly [number, number], l: readonly [number, number]): Pads =>
    (b) =>
      b[1] >= 20 ? u : l
  it('meets two rows padded alike at the middle of the gap between their boxes, as before', () => {
    const [a, b] = paintRows([lower, upper], padsBy([5, 5], [5, 5]))
    expect([a!.box[1], b!.box[3]]).toEqual([19.5, 19.5])
  })
  it('meets two rows padded otherwise inside the gap: each covers its own box whole, neither past its own pad', () => {
    const [a, b] = paintRows([lower, upper], padsBy([0, 5], [5, 5]))
    // (the middle of their padded edges, 22, held to the gap 19-20: the upper row's foot its box's own, unpadded as its pads say,
    // the lower row's head 1 over its box, inside its pad of 5; the two touching)
    expect(a!.box[1]).toBe(20)
    expect(b!.box[3]).toBe(20)
    expect(b!.box[1]).toBe(4)
    expect(a!.box[3]).toBe(35)
  })
  it('meets two bands of a shape padded otherwise at one point inside the gap between them (boxes on one band)', () => {
    // (a row and a short box beside it on its band, 22-28, and a row 1 under it: the bands' union cut at every head and foot;
    // the band over the gap, 20-22, unpadded under, the row under it padded 5 over: they meet at the gap's top, 20, where
    // the lower one's head stood at the gap's middle, 19.5, a strip between the two in no row)
    const boxes: Box[] = [
      [0, 20, 100, 30],
      [100, 22, 120, 28],
      [0, 9, 100, 19],
    ]
    const rows = paintRows(boxes, padsBy([0, 5], [5, 5]))
    const over = rows.find((r) => r.own[1] === 20)!,
      under = rows.find((r) => r.own[3] === 19)!
    expect([over.box[1], under.box[3]]).toEqual([20, 20])
  })
  // (on a pane: a member's six rows, the first two 1 apart, the rest 10 (its own half leading 5), and another member's box
  // standing on the first row's foot beside the second row (so the first row is unpadded under it), the page 800 high)
  const rows: Box[] = [
    [50, 620, 150, 630],
    [0, 609, 50, 619],
    [0, 589, 300, 599],
    [0, 569, 300, 579],
    [0, 549, 300, 559],
    [0, 529, 300, 539],
  ]
  const near: Box = [100, 610, 150, 620]
  const pane: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [
      { ord: 1, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [rows], right: [rows], own: [] } },
      { ord: 2, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [[near]], right: [[near]], own: [] } },
    ],
  }
  /** the corners of each outline a shape's band paints, in the page's CSS px (shapePath: each outline `M` … `Z`, a corner the
   *  control point of its `Q`) */
  const outlinesOf = (el: Element): [number, number][][] => {
    const s = (el as HTMLElement).style
    const d = el.querySelector('path')?.getAttribute('d') ?? ''
    return d
      .split('Z')
      .filter((x) => x.trim())
      .map((x) =>
        [...x.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)].map(
          (m) => [Number(m[1]) + parseFloat(s.left), Number(m[2]) + parseFloat(s.top)] as [number, number],
        ),
      )
  }
  const inside = ([x, y]: [number, number], poly: [number, number][]) => {
    let n = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!,
        [xj, yj] = poly[j]!
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n
    }
    return n
  }
  it('paints and hits the first row’s box whole on both panes, its foot over the other member’s box', () => {
    const { els, hl } = setUp(pane)
    // (a point of the first row's box half a point over its foot: in its lower strip)
    const p: [number, number] = [120, H - 620.5]
    hl.light({ id: 1, s: -1 })
    for (const side of ['left', 'right'] as const) {
      const outlines = [...els[side].querySelectorAll('.axt-hl')].flatMap(outlinesOf)
      expect(
        outlines.some((o) => inside(p, o)),
        `${side}: painted`,
      ).toBe(true)
      expect(hl.at(side, ...p), `${side}: hit`).toEqual({ id: 1, s: -1 })
    }
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})

describe('a display lit alone is padded as a block of its own: its member’s rows around it stop its pads halfway', () => {
  // (a member's three rows, 110-130, 60-80 and 20-40, and its display at 95-105 between the first two: its own half leading 10,
  // read between its rows (none across its display). The rows' pads stop halfway to the display, a block of its own; the
  // display's, painted and hit alone, must stop halfway to the rows: padded by the leading alone, it was painted 85-115, five
  // points over the paragraph's first row, and a point on that row's foot lit the display)
  const rows: Box[] = [
    [72, 110, 300, 130],
    [72, 60, 300, 80],
    [72, 20, 300, 40],
  ]
  const display: Box = [100, 95, 250, 105]
  const pane = [{ ord: 1, per: [rows], own: [['3', [display]]] as [string, Box[]][] }]
  it('stops the display’s pads halfway to its own member’s rows, as the rows’ stop halfway to it', () => {
    const pads = padsOf(pane, 1, 1)
    expect(pads(display)).toEqual([7.5, 2.5])
    expect(pads(rows[0]!)).toEqual([2.5, 10])
    expect(pads(rows[1]!)).toEqual([10, 7.5])
  })
  it('pads a display with no row of its member near it by the member’s own leading, as before', () => {
    const far: Box = [100, 110, 250, 120]
    const apart = [
      { ord: 1, per: [[[72, 150, 300, 170], ...rows.slice(1)] as Box[]], own: [['3', [far]]] as [string, Box[]][] },
    ]
    expect(padsOf(apart, 1, 1)(far)).toEqual([10, 10])
  })
  it('paints the display lit alone off its paragraph’s rows and lights the row, not the display, on the row’s foot', () => {
    const page: Page = {
      page: 1,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        { ord: 1, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [rows], right: [rows], own: pane[0]!.own } },
      ],
    }
    const { els, hl } = setUp(page)
    hl.light({ id: 1, s: -5 })
    for (const side of ['left', 'right'] as const) {
      const shape = els[side].querySelector<HTMLElement>('.axt-hl')!
      const top = H - Number.parseFloat(shape.style.top),
        foot = top - Number.parseFloat(shape.style.height)
      expect([top, foot], side).toEqual([107.5, 87.5])
      // (a point on the paragraph's first row, a point over its foot: the member's, not its display's)
      expect(hl.at(side, 200, H - 111), side).toEqual({ id: 1, s: -1 })
      expect(hl.at(side, 200, H - 100), side).toEqual({ id: 1, s: -5 })
    }
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})
