// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type NeedEntry, needsOf } from '@/pdf-reader/engine/layer-proto/need.mjs'

// needsOf (what laying a paper's pages reads of its units' rows) lives in a leaf the door and the cutter both import. These tests
// hold it to a restatement written from its documentation, on random K, and hold run.mjs to using it

function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 } }

type Entry = NeedEntry & { rects: unknown }
function randomK(seed: number): { K: Entry[]; N: number } {
  const r = rng(seed), N = 1 + Math.floor(r() * 12), K: Entry[] = []
  for (let i = 0, n = Math.floor(r() * 30); i < n; i++) {
    const fileOnly = r() < 0.25
    const lists: number[][] = []
    for (let l = 0, m = r() < 0.1 ? 0 : 1 + (r() < 0.2 ? 1 : 0); l < m; l++) {
      const first = 1 + Math.floor(r() * N), span = r() < 0.7 ? 0 : Math.floor(r() * 3)
      lists.push(Array.from({ length: Math.min(span, N - first) + 1 }, (_, k) => first + k))
    }
    const reach = new Set(lists.flat())
    if (r() < 0.3) reach.add(1 + Math.floor(r() * N))
    K.push({ lists, reach, rects: fileOnly ? null : [] })
  }
  return { K, N }
}

/** lay[g], from the documentation: the units that may be on a page up to g (and so every one before them in the stream), and the units only the file holds on the pages the lines of those read */
function layOf(K: Entry[], N: number, fileOnly: (c: Entry) => boolean): number[] {
  const fileOn = new Map<number, number>()
  K.forEach((c, i) => { if (fileOnly(c) && c.lists.length) for (const x of c.reach) fileOn.set(x, i) })
  const lay: number[] = []
  for (let g = 0; g <= N; g++) {
    let v = -1
    K.forEach((c, i) => {
      if (!c.lists.length) return
      if (Math.min(...c.lists.flat()) <= g) v = Math.max(v, i)
      if (Math.min(...c.lists.map(l => Math.max(...l))) <= g) for (const x of c.reach) v = Math.max(v, fileOn.get(x) ?? -1)
    })
    lay.push(v)
  }
  return lay
}

describe('needsOf', () => {
  it('gives lay as the documentation reads, on 300 random papers', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { K, N } = randomK(seed)
      for (const passes of [false, true]) {
        const got = needsOf(K, N, passes, c => !c.rects)
        expect(got.lay, `seed ${seed}`).toEqual(layOf(K, N, c => !c.rects))
        expect(got.lay.length).toBe(N + 1)
        for (let g = 1; g <= N; g++) expect(got.lay[g]).toBeGreaterThanOrEqual(got.lay[g - 1] as number)
        for (let p = 0; p <= N; p++) {
          expect(got.complete[p]).toBeGreaterThanOrEqual(got.done[p] as number)
          expect(got.complete[p]).toBeGreaterThanOrEqual(got.lay[p] as number)
        }
      }
    }
  })

  it('needs nothing of a paper with no unit', () => {
    expect(needsOf([], 3, true, () => false)).toEqual({ lay: [-1, -1, -1, -1], done: [-1, -1, -1, -1], complete: [-1, -1, -1, -1] })
  })

  it('is the one run.mjs uses: imported from need.mjs, defined nowhere else', () => {
    const run = readFileSync('src/pdf-reader/engine/layer-proto/run.mjs', 'utf8')
    expect(run).toContain("import { needsOf } from './need.mjs'")
    expect(run).not.toMatch(/function needsOf/)
    expect(run).toMatch(/needsOf\(K, N, PASSES,/)
  })
})
