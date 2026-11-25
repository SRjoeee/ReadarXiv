// @vitest-environment node
// The ownership's work is bounded (own/own.ts OWN_WORK): past it a unit is not owned and is drawn as the original
// (`unhidden: 'marks'`), the bounded fallback. The head's box scan (boxesFrom, and the frame test it makes for each box, which
// reads every box of the page) counts toward that work and stops where it passes the bound, so a head with many painted boxes
// takes the fallback rather than stalling the prepare, and no ink it inspected only in part is claimed (#679's review). So does
// every scan the head's box reading makes: each placed form's test against the other lines of its column (onLine, otherLines).
// Content of our own: a page as a stream of points, glyphs and boxes, the units the ownership reads.
import { describe, expect, it } from 'vitest'
import { OWN_WORK, ownOf } from '../src/own/own.ts'

/** a unit whose label "1" stands before its start, with `n` small painted boxes before the start on its line: each its own
 *  placed form where `forms`, and `others` glyphs on another line of the column, above the unit's line within its extent */
function page(n: number, { forms = false, others = 0 } = {}) {
  const glyphs: {
    n: number
    k: number
    u: string
    x0: number
    x1: number
    y: number
    size: number
    top: number
    bottom: number
  }[] = []
  const points: { name: string; glyph: number; box: number }[] = []
  const boxes: number[] = []
  const paths: number[] = []
  const run = (s: string, x: number, y: number, size: number) => {
    const w = 0.5 * size
    for (const u of s) {
      glyphs.push({
        n: glyphs.length,
        k: 0,
        u,
        x0: x,
        x1: x + w,
        y,
        size,
        top: y + 0.68 * size,
        bottom: y - 0.02 * size,
      })
      x += w
    }
  }
  const y = 600
  run('1', 190, y, 10)
  // (the boxes: each 0.01 pt wide, side by side between the label and the start, across the baseline)
  for (let b = 0; b < n; b++) {
    const x = 195 + (4 * b) / n
    boxes.push(x, y - 1, x + 0.0001, y + 2)
    paths.push(b)
  }
  points.push({ name: '0s', glyph: glyphs.length, box: boxes.length / 4 })
  run('AnnLee', 200, y, 10)
  points.push({ name: '0e', glyph: glyphs.length, box: boxes.length / 4 })
  for (let k = 0; k < others; k++) run('x', 200 + (25 * k) / others, y + 20, 10)
  const boxAt = glyphs.map(() => 0)
  const form = forms ? { forms: boxes.filter((_, j) => j % 4 === 0).map((_, b) => b + 1) } : {}
  return { glyphs, points, boxes, paths, boxAt, ...form, view: [0, 0, 612, 792] as const }
}
const units = [{ kind: 'author', src: 'Ann Lee' }]

describe('the head box scan within the ownership work bound', () => {
  it('the control: a few boxes before the start go with the label', () => {
    const pages = [page(3)]
    const r = ownOf(pages, { units })
    expect(r.units.get(0)?.unhidden).toBeNull()
    expect(r.boxes[0]!.every((o) => o === 'u0.l')).toBe(true)
  })
  it('past the bound the unit takes the fallback and no box is claimed', () => {
    // (the frame test reads every box for each box: n * n comparisons, past OWN_WORK)
    const n = Math.ceil(Math.sqrt(OWN_WORK)) + 100
    const pages = [page(n)]
    const r = ownOf(pages, { units })
    expect(r.units.get(0)?.unhidden).toBe('marks')
    expect(r.boxes[0]!.every((o) => o === null)).toBe(true)
  })
  it('the control: a few placed forms before the start, another line above, go with the label', () => {
    const pages = [page(3, { forms: true, others: 3 })]
    const r = ownOf(pages, { units })
    expect(r.units.get(0)?.unhidden).toBeNull()
    expect(r.boxes[0]!.every((o) => o === 'u0.l')).toBe(true)
  })
  it('past the bound by the placements tested against the other lines, the fallback and no box claimed', () => {
    // (each placement's line test reads every glyph of the other line: n * n comparisons, past OWN_WORK; no frame test)
    const n = Math.ceil(Math.sqrt(OWN_WORK)) + 100
    const pages = [page(n, { forms: true, others: n })]
    const r = ownOf(pages, { units })
    expect(r.units.get(0)?.unhidden).toBe('marks')
    expect(r.boxes[0]!.every((o) => o === null)).toBe(true)
  })
})
