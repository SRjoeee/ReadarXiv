// S.table.read on synthetic groups: the branches the corpus never takes (a group read from its rows alone, a member awaited
// and never come) and the kept cell's conditions.
import { describe, expect, it } from 'vitest'
import { type GroupMember, keptCell, tableRead } from '../../src/shared/table-read.ts'

const m = (id: number, o: Partial<GroupMember> = {}): GroupMember => ({
  id,
  translated: true,
  cand: true,
  awaitedMissing: false,
  placed: true,
  skip: null,
  spans: false,
  ...o,
})

describe('S.table.read', () => {
  it('splits a group the open gave whose member never came, but not one read from its rows alone', () => {
    const g = [m(1), m(2, { translated: false, awaitedMissing: true, placed: null, spans: null })]
    expect(tableRead(g, true)).toEqual({ cells: [1], split: true, kept: [false, null] })
    expect(tableRead(g, false)).toEqual({ cells: [1], split: false, kept: [false, null] })
  })
  it('keeps a cell the wrap cannot hide as the original’s, unless it spans or fails the spell check', () => {
    const unhidden = { placed: false, skip: { code: 'unhidden', why: 'unhidden: marks' } }
    expect(keptCell(m(1, unhidden))).toBe(true)
    expect(keptCell(m(1, { ...unhidden, spans: true }))).toBe(false)
    expect(keptCell(m(1, { ...unhidden, skip: { code: 'unhidden', why: 'unhidden: spell' } }))).toBe(false)
    expect(tableRead([m(1), m(2, unhidden)], true)).toEqual({ cells: [1], split: false, kept: [false, true] })
    expect(tableRead([m(1, { placed: false, skip: { code: 'lost', why: 'lost' } })], true).split).toBe(true)
    expect(tableRead([m(1, unhidden)], true)).toEqual({ cells: null, split: false, kept: [true] })
  })
})
