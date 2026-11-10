// D.sentences on hand-made inputs over real layouts, each held to today's own functions (words.mjs addUnitWords, layer2.mjs
// keptLines, engine 065c1d973) on the same case: the kept lines a region or a block places, the label, kept pieces, kept
// characters and displays the page keeps, the words and the pieces' places.
import { describe, expect, it } from 'vitest'
import type { Shown } from '../../../../packages/typeset/src/emit/groups.ts'
import { addUnitWords, type KeptLine, keptLines, newWords } from '../../../../packages/typeset/src/emit/sentences.ts'
import type { Rect } from '../../../../packages/typeset/src/util.ts'
import { finalLays } from '../../../../packages/typeset/tests/replay/emit-lays.ts'
import { firstDifference, hasDerived, hasTap, hasToday, todayFile } from '../../../../packages/typeset/tests/replay/tap.ts'
import { hasCache } from '../../../../packages/typeset/tests/replay/today.ts'

type W = Record<string, unknown> & { n: number }
const words = hasToday
  ? ((await import(todayFile('layer-proto/words.mjs'))) as { newWords(): W; addUnitWords(...a: unknown[]): void })
  : null
// (today's layer2.mjs measures with a canvas as it loads: one that measures nothing, as the tap's replay check gives it; keptLines
// measures nothing)
const g = globalThis as { OffscreenCanvas?: unknown }
g.OffscreenCanvas ??= class {
  getContext() {
    return { font: '', measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }) }
  }
}
const L2 = hasToday
  ? ((await import(todayFile('layer-proto/layer2.mjs'))) as { keptLines(...a: unknown[]): unknown })
  : null
const cols = (w: W) =>
  Object.fromEntries(
    ['l', 'r', 'y', 'h', 'top', 'bottom', 'word', 'at'].map((k) => [
      k,
      Array.from(w[k] as ArrayLike<number>).slice(0, w.n),
    ]),
  )

describe.skipIf(!L2)('D.sentences keptLines', () => {
  const rects: Rect[] = [
    [1, 72, 700, 300, 710],
    [1, 72, 688, 300, 698],
    [1, 100, 670, 280, 684],
    [2, 72, 700, 300, 710],
  ]
  const key = (r: Rect) => `${r[0]}|${r.slice(1).join()}`
  const cases = [
    { keep: [key(rects[2]!)], kept: [{ k: 3, region: 0 }], referenced: [0], regionOf: [[key(rects[2]!), 0]] },
    { keep: [key(rects[2]!), key(rects[1]!)], kept: [], referenced: [], regionOf: [] },
    { keep: [key(rects[2]!)], kept: [{ k: 3, region: 1 }], referenced: [], regionOf: [[key(rects[2]!), 1]] },
    { keep: [], kept: [], referenced: [], regionOf: [] },
  ]
  for (const [n, c] of cases.entries())
    it(`places the kept lines as today (case ${n})`, () => {
      const lineInfo = new Map([[key(rects[2]!), { baseline: 674, size: 10, top: 685, bottom: 669, file: true }]])
      const blocks = [{ rects: [rects[0]!, rects[1]!] }, { rects: [rects[3]!] }]
      const prep = new Map(c.kept.map((r) => [r.k, { mode: 'kept', region: r.region }])) as Map<number, unknown> &
        Record<string, unknown>
      Object.assign(prep, {
        keep: c.keep,
        referenced: new Set(c.referenced),
        regionOf: new Map(c.regionOf as [string, number][]),
        lineInfo,
      })
      for (const bs of [blocks, null]) {
        const theirs = L2!.keptLines(rects, prep, 1, bs)
        const mine = keptLines(
          {
            rects,
            keep: c.keep,
            kept: c.kept,
            referenced: new Set(c.referenced),
            regionOf: new Map(c.regionOf as [string, number][]),
            lineInfo,
            blocks: bs,
          },
          1,
        )
        expect(mine).toEqual(theirs)
      }
    })
})

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache || !words)(
  'D.sentences addUnitWords with what the page keeps',
  () => {
    it('sets kept lines, the label, kept pieces, characters and displays where today does', () => {
      const lays = finalLays('2610.21377v1-zh')
      const differ: string[] = []
      let n = 0
      for (const [ord, p] of [...lays].slice(0, 60)) {
        const line = p.layout.lines[0]
        if (!line) continue
        const pg = line.page,
          y = line.baseline
        const kept: KeptLine[] = [
          { x0: 80, x1: 200, baseline: y - 30, size: 9, top: y - 22, bottom: y - 32, region: 0, k: 2 },
          { x0: 80, x1: 200, baseline: y - 50, size: 9, top: y - 42, bottom: y - 52, block: 1 },
          {
            x0: 300,
            x1: 400,
            baseline: y - 70,
            size: 9,
            top: y - 62,
            bottom: y - 72,
            fileTop: y - 60,
            fileBottom: y - 74,
          },
        ]
        const shown: Shown[] = [
          { kind: 'label', box: [60, y - 2, 70, y + 7], base: y },
          { kind: 'piece', k: 1, box: [line.x0 + 5, y - 2, line.x0 + 20, y + 7], base: y },
          { kind: 'char', box: [line.x0 + 30, y - 2, line.x0 + 33, y + 7], base: y },
          { kind: 'display', k: 4, id: 536870912 + ord * 128, box: [290, y - 75, 410, y - 58], base: y - 70 },
          { kind: 'char', box: [300, y - 70, 305, y - 65], base: y - 70 },
        ]
        const pieceAt = Int32Array.from({ length: 12 }, (_, k) => k * 5)
        const wordOf = (at: number, end: number | undefined) => (at + (end ?? 0)) % 11
        const theirs = words!.newWords()
        words!.addUnitWords(theirs, p.layout, pg, ord, wordOf, structuredClone(kept), () => true, pieceAt, shown)
        const mine = newWords()
        addUnitWords(mine, p.layout, pg, ord, wordOf, structuredClone(kept), () => true, pieceAt, shown)
        n++
        const d =
          firstDifference(cols(mine as unknown as W), cols(theirs), `ord ${ord}`) ??
          firstDifference(mine.spans, theirs.spans, `ord ${ord} spans`)
        if (d) differ.push(d)
      }
      expect(differ).toEqual([])
      expect(n).toBe(60)
    })
  },
)
