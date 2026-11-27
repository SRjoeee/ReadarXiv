// The jump stack (session/jumps.ts): every jump one entry, every way back one jump (the capsule, a traversal, scrolling back to
// the place left), over a host's history stood in for by an array (the browser's joint history as a host's pushState and
// back make it), and with no host at all.
import { describe, expect, it } from 'vitest'
import {
  createJumps,
  type Entry,
  type HostHistory,
  type Light,
  type Place,
  type Traversal,
} from '../src/session/jumps.ts'

/** a host's history: its entries (each the reader's state, or none), the current one's index, a traversal told as popstate */
function fakeHistory(start: Entry | null = null) {
  const entries: (Entry | null)[] = [start]
  let at = 0
  const listeners = new Set<(e: Entry | null) => void>()
  const go = (d: number) => {
    const to = at + d
    if (to < 0 || to >= entries.length) return
    at = to
    for (const f of [...listeners]) f(entries[at] ?? null)
  }
  const h: HostHistory & {
    entries: (Entry | null)[]
    readonly at: number
    forward(): void
    marks: number
    pushes: number
  } = {
    entries,
    get at() {
      return at
    },
    marks: 0,
    pushes: 0,
    mark(e) {
      h.marks++
      entries[at] = e
    },
    push(e) {
      h.pushes++
      entries.length = at + 1
      entries.push(e)
      at++
    },
    back: () => go(-1),
    forward: () => go(1),
    listen(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    current: () => entries[at] ?? null,
  }
  return h
}
const place = (page: number, at = 0.25): Place => ({ page, at, side: 'right' })
const lit = (id: number, s = 0): Light => ({ lit: { id, s } })
const box = (page: number): Light => ({ page, box: [10, 20, 30, 40] })

describe('the jump stack over a host’s history', () => {
  it('a first jump marks the current entry with the place left, then pushes the target; depth 1', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    j.jump({ place: place(1), light: lit(3) }, { place: place(7), light: box(7) })
    expect(j.depth).toBe(1)
    expect(h.marks).toBe(1)
    expect(h.pushes).toBe(1)
    expect(h.entries[0]).toMatchObject({ v: 1, n: 0, left: { place: place(1), light: lit(3) } })
    expect(h.entries[1]).toEqual({ v: 1, n: 1, place: place(7), light: box(7) })
    expect(h.at).toBe(1)
  })

  it('back goes one jump and lights the place left', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    const told: Traversal[] = []
    j.on((e) => told.push(e))
    j.jump({ place: place(1), light: lit(3) }, { place: place(7), light: box(7) })
    j.back()
    expect(told).toEqual([{ go: place(1), light: lit(3), silent: false }])
    expect(j.depth).toBe(0)
  })

  it('three jumps, three backs, depth 0; forward lands with the target’s light', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    const told: Traversal[] = []
    j.on((e) => told.push(e))
    j.jump({ place: place(1), light: lit(1) }, { place: place(4), light: box(4) })
    j.jump({ place: place(4, 0.5), light: lit(2) }, { place: place(8), light: box(8) })
    j.jump({ place: place(8, 0.6), light: null }, { place: place(2), light: null })
    expect(j.depth).toBe(3)
    j.back()
    j.back()
    j.back()
    expect(j.depth).toBe(0)
    expect(told.map((t) => t.go.page)).toEqual([8, 4, 1])
    expect(told.map((t) => t.light)).toEqual([null, lit(2), lit(1)])
    h.forward()
    expect(told.at(-1)).toEqual({ go: place(4), light: box(4), silent: false })
    expect(j.depth).toBe(1)
  })

  it('a spend never goes back past the entry the reader marked first', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    j.scrolled(false)
    j.scrolled(true)
    expect(h.at).toBe(0)
    j.jump({ place: place(1), light: null }, { place: place(5), light: null })
    j.scrolled(false)
    j.scrolled(true)
    expect(h.at).toBe(0)
    // (at the first entry, no more scroll spends anything: the browser's entry before the reader's is the host's)
    j.scrolled(false)
    j.scrolled(true)
    expect(h.at).toBe(0)
    expect(j.depth).toBe(0)
  })

  it('scrolling back to the place left spends the jump silently: one back, the traversal told silent, depth one less', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    const told: Traversal[] = []
    j.on((e) => told.push(e))
    j.jump({ place: place(1), light: lit(1) }, { place: place(5), light: null })
    j.jump({ place: place(5), light: lit(9) }, { place: place(9), light: null })
    expect(j.left).toEqual({ place: place(5), light: lit(9) })
    j.scrolled(false)
    j.scrolled(true)
    expect(h.at).toBe(1)
    expect(told).toEqual([{ go: place(5), light: null, silent: true }])
    expect(j.depth).toBe(1)
    // (forward again lands on the target, lit)
    h.forward()
    expect(told.at(-1)).toEqual({ go: place(9), light: null, silent: false })
  })

  it('a place never left out of view is not spent', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    j.jump({ place: place(1), light: null }, { place: place(1, 0.4), light: null })
    j.scrolled(true)
    j.scrolled(true)
    expect(j.depth).toBe(1)
    expect(h.at).toBe(1)
  })

  it('a reload keeps the depth: the current entry holds n 2', () => {
    const h = fakeHistory({ v: 1, n: 2, place: place(9), light: null })
    const j = createJumps({ history: h })
    expect(j.depth).toBe(2)
  })

  it('a traversal onto an entry of none of the reader’s state reads as its first: depth 0, nothing told', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    const told: Traversal[] = []
    j.on((e) => told.push(e))
    j.jump({ place: place(1), light: null }, { place: place(5), light: null })
    h.entries[0] = null
    h.back()
    expect(j.depth).toBe(0)
    expect(told).toEqual([])
  })

  it('a jump after going back drops the entries after it, as the browser does', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    j.jump({ place: place(1), light: null }, { place: place(5), light: null })
    j.jump({ place: place(5), light: null }, { place: place(9), light: null })
    j.back()
    j.jump({ place: place(5, 0.7), light: null }, { place: place(3), light: null })
    expect(j.depth).toBe(2)
    expect(h.entries).toHaveLength(3)
    expect(h.entries[2]).toMatchObject({ n: 2, place: place(3) })
  })

  it('the depth is told at each change', () => {
    const h = fakeHistory()
    const j = createJumps({ history: h })
    const depths: number[] = []
    j.onDepth((d) => depths.push(d))
    j.jump({ place: place(1), light: null }, { place: place(5), light: null })
    j.back()
    expect(depths).toEqual([1, 0])
  })
})

describe('the jump stack with no host', () => {
  it('is the reader’s alone: the capsule and the spend work, nothing is pushed', () => {
    const j = createJumps({})
    const told: Traversal[] = []
    j.on((e) => told.push(e))
    j.jump({ place: place(1), light: lit(1) }, { place: place(5), light: null })
    j.jump({ place: place(5), light: lit(2) }, { place: place(9), light: null })
    expect(j.depth).toBe(2)
    j.back()
    expect(told.at(-1)).toEqual({ go: place(5), light: lit(2), silent: false })
    j.scrolled(false)
    j.scrolled(true)
    expect(told.at(-1)).toEqual({ go: place(1), light: null, silent: true })
    expect(j.depth).toBe(0)
  })
})
