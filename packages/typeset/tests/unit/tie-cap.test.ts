// A size tie across a page break (lay/page.ts tieCaps): a page's lay runs the fill passes of its own page and of the first page
// of every member on it, so a unit is laid alike by every lay that draws it only if what decides it is decided by the passes up
// to its own first page (I6 across the pages' lays, cross-lay.ts). A tie caps a member from the scales those passes leave its
// tie-mates at: one begun on its first page or before as laid and filled, one begun after it as its own lay set it, never as a
// later page's fill set it, which runs in some of the lays that draw the member and not in others (the coordinator's ruling of
// 2026-11-12, lane google-lay: 2610.21098v1 ord 12, one paragraph of TeX's cut at its list's items, its first member begun on
// page 1 and its last items on page 2, page 2's fill evening the last item a size step: page 2's lay capped the first member
// there, page 1's did not, and its two pages were drawn at two sizes).
import { describe, expect, it } from 'vitest'
import { tieCaps } from '../../src/lay/page.ts'

/** the caps one round sets over one tie: each member's scale as laid and filled, as its own lay set it, and its first page, by
 *  ord; the floor 0.6 */
const capsOf = (fits: Record<number, number>, unfilled: Record<number, number>, firsts: Record<number, number>) => {
  const cap = new Map<number, number>()
  const ords = Object.keys(fits).map(Number)
  const byOrd = (r: Record<number, number>) => new Map(Object.entries(r).map(([k, v]) => [Number(k), v]))
  tieCaps([{ rule: 'size', ords }], byOrd(fits), byOrd(unfilled), byOrd(firsts), () => 0.6, cap)
  return Object.fromEntries(cap)
}

describe('a size tie caps a member from the scales the passes up to its own first page leave its tie-mates at', () => {
  it('leaves a member begun on an earlier page at its size where a later page’s fill shrank a tie-mate', () => {
    // (a begins on page 1, b on page 2, both laid at their size; page 2's fill set b a step smaller, 0.95: a lay of page 1
    // never runs page 2's pass)
    expect(capsOf({ 0: 1, 1: 0.95 }, { 0: 1, 1: 1 }, { 0: 1, 1: 2 })).toEqual({})
  })
  it('caps a member begun on an earlier page at the size a later tie-mate’s own lay sets it at', () => {
    // (page 1's fill grew a a step, 1.05; b's own lay sets it at its size, in every lay that lays it: a is held there, one
    // paragraph at one size)
    expect(capsOf({ 0: 1.05, 1: 1 }, { 0: 1, 1: 1 }, { 0: 1, 1: 2 })).toEqual({ 0: 1 })
  })
  it('caps a member begun on a later page at the size of one begun before it, as laid and filled', () => {
    // (a laid at 0.95 on page 1, by its fit or page 1's fill; b, one paragraph with a, is set at a's size)
    expect(capsOf({ 0: 0.95, 1: 1 }, { 0: 1, 1: 1 }, { 0: 1, 1: 2 })).toEqual({ 1: 0.95 })
  })
  it('caps members begun on one page at the least of them, as before', () => {
    expect(capsOf({ 0: 1, 1: 0.9, 2: 1 }, { 0: 1, 1: 1, 2: 1 }, { 0: 2, 1: 2, 2: 2 })).toEqual({ 0: 0.9, 2: 0.9 })
  })
  it('never caps under the floor', () => {
    expect(capsOf({ 0: 1, 1: 0.5 }, { 0: 1, 1: 0.5 }, { 0: 1, 1: 1 })).toEqual({ 0: 0.6 })
  })
})
