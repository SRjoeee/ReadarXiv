// A display of two rows and one number lit whole (docs/PDF-READER.md §17.1: a display is a block of its own, its equation numbers
// included; §18.58: a display no unit owns is one block, its number with it). The owner's report of 2026-11-13 on staging
// (2111.09276v1 zh, page 5, the left column): display (4), two rows and its number set at the right between them, lit on both
// panes as a band over the first row and a strip from under its right end to the number, the second row not lit. Its boxes here
// are the facts of that page's part as the lab holds them (the kept block's three lines on A, Laid.lit's one entry, the same on
// both panes; the paragraphs above and below give the page's leading), PDF units, no text. Over a stand-in of the panes (one
// upright page 612 × 792 at scale 1: a PDF unit a CSS px, y down) and of the composer (one laid Page), as highlight.test.ts.
import { describe, expect, it } from 'vitest'
import type { Composer } from '../src/compose/composer.ts'
import { createHighlight } from '../src/compose/highlight.ts'
import type { Box, Page } from '../src/compose/page.ts'
import type { Panes } from '../src/panes/panes.ts'
import type { Clock } from '../src/stack/clock.ts'

const H = 792
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
    pointAt: (_side: string, x: number, y: number) =>
      x >= 0 && x <= 612 && y >= 0 && y <= H ? { page: 1, x, y } : null,
    containerOf: () => document.body,
    frameOf: () => ({ turn: 0, w: 612, h: H, width: 612, height: H }),
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

/** the outlines of a band's path, each its corners in the page's CSS px (shapePath: an outline is `M` … `Z`, a corner the control
 *  point of its `Q`), the band's own offset added; a band of one row its box */
function outlinesOf(el: Element): [number, number][][] {
  const s = (el as HTMLElement).style
  const at = [parseFloat(s.left), parseFloat(s.top)] as const
  const d = el.querySelector('path')?.getAttribute('d')
  if (!d) {
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
    .filter((x) => x.trim())
    .map((x) =>
      [...x.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)].map(
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
/** a point of the page (PDF units, y up) in its CSS px */
const css = (x: number, y: number): [number, number] => [x, Math.round((H - y) * 100) / 100]

// (the paragraph before the display, its last two lines, and the one after it, its first two: the page's leading, 11.96 pt)
const before: Box[] = [
  [50.11, 590.25, 286.36, 599.22],
  [50.11, 578.29, 237.97, 587.27],
]
const after: Box[] = [
  [49.75, 487.76, 288.1, 496.84],
  [50.11, 475.8, 288.02, 484.78],
]
/** a page of the two paragraphs and the display, lit whole (no sentences: a kept block's one entry, the same on both panes) */
const pageOf = (display: Box[]): Page => ({
  page: 1,
  wait: { rows: [], faces: [] },
  links: [],
  members: [
    { ord: 68, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [before], right: [before], own: [] } },
    { ord: 69, page: 1, state: 'laid', off: 1, lines: [], lit: { left: [after], right: [after], own: [] } },
    { ord: 255, page: 1, state: 'kept', off: 0, lines: [], lit: { left: [display], right: [display], own: [] } },
  ],
})

// (the display's ink on A, read off arXiv's page: its first row's run, its fraction's denominator and its operators' limits under
// it (the lowest, "s ∈ S_t" under the sum, at 528.44); its second row; its number, at the right between the rows)
const ink = {
  'the first row': [css(90, 540.34 + 3), css(152, 528.44 + 2), css(171, 533.91 + 2)],
  'the second row': [css(62, 514.09 + 3), css(160, 514.09 + 3), css(262, 514.09 + 3)],
  'the number': [css(276.4, 529.51 + 3), css(282, 529.51 + 3)],
} as const

describe('a display of two rows and one number set between them, lit whole (the owner’s report on 2111.09276v1 p5)', () => {
  const cases: [string, Box[]][] = [
    [
      // (the part's lines as staging's engine states them: the first row; the second row with the number's "(" (its x1 278.06,
      // its top the number's); the number's "4)" from 278.06)
      'as the part states its lines',
      [
        [56.92, 527.38, 211.64, 553.72],
        [56.92, 511.17, 278.06, 536.25],
        [278.06, 527.75, 286.36, 536.25],
      ],
    ],
    [
      // (each row's ink and the number's whole: the second row to its last glyph, 267.94, its top 521.56; "(4)" from 274.75)
      'as its rows and its number stand on A',
      [
        [56.92, 527.38, 211.64, 553.72],
        [56.92, 511.17, 267.94, 521.56],
        [274.75, 527.75, 286.36, 536.25],
      ],
    ],
  ]
  for (const [name, display] of cases) {
    it(`paints every row of it and its number, on both panes (${name})`, () => {
      const { els, hl } = setUp(pageOf(display))
      hl.light({ id: 255, s: -1 })
      for (const side of ['left', 'right'] as const) {
        const outlines = [...els[side].querySelectorAll('.axt-hl')].flatMap(outlinesOf)
        for (const [what, points] of Object.entries(ink))
          for (const p of points)
            expect(
              outlines.some((o) => inside(p, o)),
              `${side}: ${what} at ${p.join(', ')} painted`,
            ).toBe(true)
      }
      hl.dispose()
      for (const el of Object.values(els)) el.remove()
    })
    it(`lights it where the pointer is on any row of it or on its number, on both panes (${name})`, () => {
      const { els, hl } = setUp(pageOf(display))
      for (const side of ['left', 'right'] as const)
        for (const [what, points] of Object.entries(ink))
          for (const p of points)
            expect(hl.at(side, ...p), `${side}: ${what} at ${p.join(', ')}`).toEqual({ id: 255, s: -1 })
      hl.dispose()
      for (const el of Object.values(els)) el.remove()
    })
  }
})
