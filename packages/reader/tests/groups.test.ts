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
})
