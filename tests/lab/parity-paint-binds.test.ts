// The parity's model of the highlight's paint (lab/typeset/parity/paint.mjs paintedEntries, read by verdict.mjs's highlight
// fill) bound to the painter (packages/reader compose/highlight.ts createHighlight, its drawn outlines): on shapes of every kind of
// row, the region the model states (its rows and the rooms between them) is the region the painter draws (its outlines' corners
// before they are rounded), at the parity's drawing scale (96/72 CSS px a point: the pad 3 CSS px, 2.25 pt). So a change of one
// fails here until the other follows (the owner's report of 2026-11-13 on 2111.09276v1 p5: the model had copied the painter's
// meet step, which cut two boxes of one band). Boxes alone, no text.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { litColumn, PAINT_RADIUS, paintedEntries, paintedShape } from '../../lab/typeset/parity/paint.mjs'
import type { Composer } from '../../packages/reader/src/compose/composer.ts'
import { createHighlight, halfLeadingOf, RADIUS } from '../../packages/reader/src/compose/highlight.ts'
import type { Box, Page } from '../../packages/reader/src/compose/page.ts'
import type { Panes } from '../../packages/reader/src/panes/panes.ts'
import type { Clock } from '../../packages/reader/src/stack/clock.ts'

const H = 800
/** CSS px a point: the parity's drawing scale (render.mjs SCALE) */
const K = 96 / 72
const clock: Clock = { now: () => 0, later: () => 1, clear: () => {}, frame: () => 1, cancel: () => {} }
type Lit = Page['members'][number]['lit']

function setUp(page: Page) {
  const els = { left: document.createElement('div'), right: document.createElement('div') }
  for (const [side, el] of Object.entries(els)) {
    el.className = 'page'
    el.dataset.side = side
    document.body.append(el)
  }
  const panes = {
    scale: 1,
    right: { pages: 1, on: () => () => {} },
    on: () => () => {},
    pageElement: (side: 'left' | 'right') => els[side],
    pointAt: () => null,
    containerOf: () => document.body,
    frameOf: () => ({ turn: 0, w: 612 * K, h: H * K, width: 612 * K, height: H * K }),
    boxOf: (_side: string, _n: number, r: Box) => ({
      left: Math.min(r[0], r[2]) * K,
      top: (H - Math.max(r[1], r[3])) * K,
      width: Math.abs(r[2] - r[0]) * K,
      height: Math.abs(r[3] - r[1]) * K,
    }),
  } as unknown as Panes
  const composer = { page: () => page, laid: () => page, muted: () => false, on: () => () => {} } as unknown as Composer
  return { els, hl: createHighlight({ panes, composer, clock, on: true }) }
}
/** the painter's outlines on a pane, each its corners (the `Q` control points) in PDF units, y up */
function drawn(el: HTMLElement): [number, number][][] {
  return [...el.querySelectorAll<HTMLElement>('.axt-hl')].flatMap((x) => {
    const s = x.style
    const at = [parseFloat(s.left), parseFloat(s.top)] as const
    const d = x.querySelector('path')?.getAttribute('d')
    const back = (cx: number, cy: number): [number, number] => [(cx + at[0]) / K, H - (cy + at[1]) / K]
    if (!d) {
      const [w, h] = [parseFloat(s.width), parseFloat(s.height)]
      return [[back(0, 0), back(w, 0), back(w, h), back(0, h)]]
    }
    return d
      .split('Z')
      .filter((o) => o.trim())
      .map((o) => [...o.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)].map((m) => back(Number(m[1]), Number(m[2]))))
  })
}
function inPoly([x, y]: [number, number], poly: [number, number][]): boolean {
  let n = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!,
      [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n
  }
  return n
}
/** the points of a grid over the shape where the model's region and the painter's differ, but within the drawing's rounding
 *  (its path's 0.01 CSS px) of one of the model's edges */
function differ(model: number[][], polys: [number, number][][]): [number, number][] {
  const xs = model.flatMap((r) => [r[0]!, r[2]!]),
    ys = model.flatMap((r) => [r[1]!, r[3]!])
  const out: [number, number][] = []
  const near = (x: number, y: number) =>
    model.some((r) => Math.min(...[r[0]!, r[2]!].map((e) => Math.abs(e - x)), ...[r[1]!, r[3]!].map((e) => Math.abs(e - y))) < 0.02)
  for (let x = Math.min(...xs) - 2; x <= Math.max(...xs) + 2; x += 0.37)
    for (let y = Math.min(...ys) - 2; y <= Math.max(...ys) + 2; y += 0.37) {
      const a = model.some((r) => x > r[0]! && x < r[2]! && y > r[1]! && y < r[3]!)
      const b = polys.some((p) => inPoly([x, y], p))
      if (a !== b && !near(x, y)) out.push([x, y])
    }
  return out
}

/** a page of one member with these Laid.lit entries, the same on both panes, and another's boxes (a block that may stand between) */
const pageOf = (per: Box[][], own: [string, Box[]][] = [], other: Box[] = []): Page => ({
  page: 1,
  wait: { rows: [], faces: [] },
  links: [],
  members: [
    { ord: 1, page: 1, state: 'laid', off: 1, lines: [], lit: { left: per, right: per, own } },
    ...(other.length
      ? [{ ord: 2, page: 1, state: 'laid' as const, off: 1, lines: [], lit: { left: [other], right: [other], own: [] } }]
      : []),
  ],
})

describe('the parity’s paint model is the painter’s paint (lab/typeset/parity/paint.mjs, compose/highlight.ts)', () => {
  const cases: [string, Page, { s: number }[]][] = [
    [
      // (2111.09276v1 p5 display (4) as the part states it: a kept block's three lines, the second row's with its number's "(")
      'two boxes on one band: a kept display, its second row and its number',
      pageOf([
        [
          [56.92, 527.38, 211.64, 553.72],
          [56.92, 511.17, 278.06, 536.25],
          [278.06, 527.75, 286.36, 536.25],
        ],
      ]),
      [{ s: -1 }],
    ],
    [
      // (a unit's display of two rows, its number set at the right on the second's band, lit alone: Laid.lit's `own`; and its
      // paragraph's line before it)
      'a display with its number',
      pageOf(
        [[[72, 640, 300, 649]]],
        [
          [
            '3',
            [
              [110, 612, 240, 624],
              [130, 590, 300, 609],
            ],
          ],
        ],
      ),
      [{ s: -5 }, { s: -1 }],
    ],
    [
      // (a sentence whose runs stand either side of another sentence's element on its first line, then a line of its own)
      'an island',
      pageOf([
        [
          [72, 698, 180, 707],
          [220, 698, 300, 707],
          [72, 686, 300, 695],
        ],
        [[180, 698, 220, 707]],
      ]),
      [{ s: 0 }, { s: 1 }],
    ],
    [
      // (a reference run on into the next column, its lines on the bands of the first column's)
      'a shape across the column gap',
      pageOf([
        [
          [58.61, 419.75, 299.08, 428.72],
          [335.33, 420.26, 562.1, 428.41],
          [72.32, 409.8, 299.09, 417.95],
          [335.33, 409.69, 562.09, 417.85],
        ],
      ]),
      [{ s: -1 }],
    ],
    [
      // (a paragraph's lines one over the other, a short last one; another member's line between two of them)
      'rows one over the other, cut by another block',
      pageOf(
        [
          [
            [72, 710, 300, 719],
            [72, 698, 300, 707],
            [72, 640, 200, 649],
          ],
        ],
        [],
        [[72, 670, 300, 679]],
      ),
      [{ s: -1 }],
    ],
  ]
  for (const [name, page, lits] of cases)
    it(`paints the same region: ${name}`, () => {
      const { els, hl } = setUp(page)
      const m = page.members[0]!
      for (const { s } of lits)
        for (const side of ['left', 'right'] as const) {
          hl.light({ id: m.ord, s })
          const lit: Lit = m.lit
          const others = page.members.flatMap((x) => [...x.lit[side].flat(), ...x.lit.own.flatMap(([, b]) => b)])
          const lead = halfLeadingOf(page.members.map((x) => x.lit[side]))
          const display = lit.own.find(([k]) => k === String(-2 - s))?.[1]
          const entries: number[][][] =
            s === -1
              ? paintedEntries(lit, side, others, 3 / K, lead)
              : s >= 0
                ? [paintedEntries(lit, side, others, 3 / K, lead)[s]]
                : [paintedShape(display, others, 3 / K, lead, litColumn(lit, side))]
          // (each entry its own shape: the painter's shapes of the lit state, the model's of the same entries)
          const model = entries.flat()
          expect(differ(model, drawn(els[side])), `${name}, s ${s}, ${side}`).toEqual([])
        }
      hl.dispose()
      for (const el of Object.values(els)) el.remove()
    })
  it('reads the painter’s corners at its radius', () => expect(PAINT_RADIUS).toBeCloseTo(RADIUS / K))
})
