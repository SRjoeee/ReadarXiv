// The composed document's optional content (docs/PDF-READER.md §11.8 "One configuration a document", engine-view-host §16):
// PDF.js 6.3.289 builds a configuration per render it is not given one for, so the reader reads three, once a document, and every
// render passes one; a group the document does not hold leaves its unit the original's.
import { groupName } from '@readarxiv/format'
import { describe, expect, it, vi } from 'vitest'
import { groupsOf } from '../src/compose/groups.ts'

describe("the composed document's groups", () => {
  it("reads three configurations once, turns a committed page's groups off in `laid` alone, and tells a group it lacks", async () => {
    const made: Map<string, boolean>[] = []
    const names = [groupName(1, 1, 1), groupName(1, 1, 2), groupName(2, 1, 1)]
    const doc = {
      getOptionalContentConfig: vi.fn(async () => {
        const vis = new Map(names.map((_n, i) => [`g${i}`, true]))
        made.push(vis)
        return {
          [Symbol.iterator]: function* () {
            for (const [i, n] of names.entries()) yield [`g${i}`, { name: n }]
          },
          setVisibility: (id: string, on: boolean) => vis.set(id, on),
        }
      }),
    }
    const g = groupsOf(doc as never)
    await g.ready
    expect(doc.getOptionalContentConfig).toHaveBeenCalledTimes(3)
    expect(g.size).toBe(3)
    // (the crops configuration: every unit's text group off)
    expect([...(made[2] as Map<string, boolean>).values()]).toEqual([false, true, false])
    g.set({
      page: 1,
      wait: { rows: [], faces: [] },
      links: [],
      members: [{ ord: 1, page: 1, state: 'laid', off: 3, lines: [], lit: { left: [], right: [], own: [] } }],
    })
    await Promise.resolve()
    expect([...(made[1] as Map<string, boolean>).values()]).toEqual([false, false, true])
    expect([...(made[0] as Map<string, boolean>).values()]).toEqual([true, true, true])
    g.clear(1)
    await Promise.resolve()
    expect([...(made[1] as Map<string, boolean>).values()]).toEqual([true, true, true])
    expect(g.holds(1, 1, 3)).toBe(true)
    expect(g.holds(2, 1, 3)).toBe(false)
    expect(doc.getOptionalContentConfig).toHaveBeenCalledTimes(3)
  })
  it("turns a page's group back on when the page is laid again without it (a language switched, a row refused)", async () => {
    const made: Map<string, boolean>[] = []
    const names = [groupName(303, 35, 1), groupName(303, 35, 4), groupName(304, 35, 1)]
    const doc = {
      getOptionalContentConfig: async () => {
        const vis = new Map(names.map((_n, i) => [`g${i}`, true]))
        made.push(vis)
        return {
          [Symbol.iterator]: function* () {
            for (const [i, n] of names.entries()) yield [`g${i}`, { name: n }]
          },
          setVisibility: (id: string, on: boolean) => vis.set(id, on),
        }
      },
    }
    const g = groupsOf(doc as never)
    await g.ready
    const page = (...members: [number, number][]) => ({
      page: 35,
      wait: { rows: [], faces: [] },
      links: [],
      members: members.map(([ord, off]) => ({
        ord,
        page: 35,
        state: off ? ('laid' as const) : ('error' as const),
        off,
        lines: [],
        lit: { left: [], right: [], own: [] },
      })),
    })
    const laid = () => [...(made[1] as Map<string, boolean>).values()]
    // (unit 303's text and label off, 304's text off)
    g.set(page([303, 1 | 4], [304, 1]))
    await Promise.resolve()
    expect(laid()).toEqual([false, false, false])
    // (laid again, 303's label kept in the other language: its label back on, at once and on the next set alike)
    g.set(page([303, 1], [304, 1]))
    await Promise.resolve()
    expect(laid()).toEqual([false, true, false])
    // (304's row refused: its unit the original's, its text back on)
    g.set(page([303, 1], [304, 0]))
    await Promise.resolve()
    expect(laid()).toEqual([false, true, true])
    // (two sets before the configuration is read: the second's state, the first's groups back on)
    g.set(page([303, 1 | 4], [304, 1]))
    g.set(page([304, 1]))
    await Promise.resolve()
    expect(laid()).toEqual([true, true, false])
    // (the page unlaid: every group on)
    g.clear(35)
    await Promise.resolve()
    expect(laid()).toEqual([true, true, true])
  })
})
