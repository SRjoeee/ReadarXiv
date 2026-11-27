// A link's hit area (compose/links.ts; link previews' §3.9 and the lead's look of 2026-11-28): on a narrow screen a link's area is
// widened (7 px above and below, 3 px at the sides) to be hit by a finger, but never over a neighbour's: between two links of a
// line each one's area ends at the midpoint between them, and between lines at the midpoint between their boxes. A tap on "1" of
// [1, 2, 3] opened [2]'s sheet: "2"'s widened area lay over "1". Each limit is stated in PDF units, CSS px at the page's scale
// (--total-scale-factor), and the sheet takes the smaller of it and the widening.
import { describe, expect, it } from 'vitest'
import { linkLayer } from '../../src/compose/links.ts'
import type { Page } from '../../src/compose/page.ts'
import { READER_CSS } from '../../src/styles.ts'

const viewport = { width: 612, height: 792, convertToViewportPoint: (x: number, y: number) => [x, 792 - y] } as never
const page = (boxes: [number, number, number, number][]): Page => ({
  page: 1,
  wait: { rows: [], faces: [] },
  members: [],
  links: boxes.map((b, i) => [b, { dest: `"cite.${i}"` }, 0, undefined, '5'] as Page['links'][number]),
})
const hooks = { open: () => {}, follow: () => {}, unnamed: () => 'link' }
const vars = (a: HTMLElement) =>
  ['l', 'r', 't', 'b'].map((k) => Number(/([\d.]+)px/.exec(a.style.getPropertyValue(`--axt-hit-${k}`))?.[1] ?? 'NaN'))

describe('a link’s hit area never reaches over a neighbour’s', () => {
  it('three numbers of a bracket a point apart: each area ends at the midpoint between them', () => {
    // ([1, 2, 3] at 9 pt: "1" 100-104.5, "2" 106.5-111, "3" 113-117.5; a line of its own, the next 12 pt under)
    const layer = linkLayer(
      page([
        [100, 698, 104.5, 707],
        [106.5, 698, 111, 707],
        [113, 698, 117.5, 707],
        [100, 686, 140, 695],
      ]),
      viewport,
      hooks,
    ) as HTMLElement
    const [one, two, three, below] = [...layer.querySelectorAll<HTMLElement>('a.axt-link')].sort(
      (a, b) => Number(a.dataset.axtAt) - Number(b.dataset.axtAt),
    )
    // (left, right, top, bottom limits, PDF units)
    expect(vars(one!)[1]).toBeCloseTo(1, 6)
    expect(vars(two!)[0]).toBeCloseTo(1, 6)
    expect(vars(two!)[1]).toBeCloseTo(1, 6)
    expect(vars(three!)[0]).toBeCloseTo(1, 6)
    // (between the lines: half their 3 pt gap)
    expect(vars(one!)[3]).toBeCloseTo(1.5, 6)
    expect(vars(below!)[2]).toBeCloseTo(1.5, 6)
    // (a side with no neighbour: the widening's own reach, stated as none)
    expect(Number.isNaN(vars(one!)[0])).toBe(true)
  })
  it('the sheet widens by the smaller of the reach and each limit, at the page’s scale', () => {
    expect(READER_CSS).toMatch(
      /\.axt-link > \.axt-link-box::before \{ content: ""; position: absolute; inset: calc\(-1 \* min\(7px, var\(--axt-hit-t, 7px\)\)\)/,
    )
  })
})
