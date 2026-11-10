// D.sentences replayed against today's own addUnitWords (words.mjs, engine 065c1d973) on every laid unit's every page of three
// pairs, at its final layout (the chain's and the fill's): the page's table, column by column (float32 as today's), its spans.
import { describe, expect, it } from 'vitest'
import { addUnitWords, newWords } from '../../../../packages/typeset/src/emit/sentences.ts'
import { finalLays, PAIRS, unitPages } from '../../../../packages/typeset/tests/replay/emit-lays.ts'
import { firstDifference, hasDerived, hasTap, hasToday, todayFile } from '../../../../packages/typeset/tests/replay/tap.ts'
import { hasCache } from '../../../../packages/typeset/tests/replay/today.ts'

type W = Record<string, unknown> & { n: number }
type Today = { newWords(): W; addUnitWords(...a: unknown[]): void }
const today = hasToday ? ((await import(todayFile('layer-proto/words.mjs'))) as Today) : null
const cols = (w: W) =>
  Object.fromEntries(
    ['l', 'r', 'y', 'h', 'top', 'bottom', 'word', 'at'].map((k) => [
      k,
      Array.from((w[k] as ArrayLike<number>) ?? []).slice(0, w.n),
    ]),
  )

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache || !today)(
  'D.sentences: replayed against today’s addUnitWords',
  () => {
    it('builds each unit’s table on each of its pages as today’s does', () => {
      const differ: string[] = []
      let n = 0,
        tokens = 0
      for (const pair of PAIRS) {
        finalLays(pair)
        for (const [ord, p, pg] of unitPages(pair)) {
          const theirs = today!.newWords()
          today!.addUnitWords(theirs, p.layout, pg, ord, null)
          const mine = newWords()
          addUnitWords(mine, p.layout, pg, ord, null)
          n++
          tokens += mine.n
          const d =
            firstDifference(cols(mine as unknown as W), cols(theirs), `${pair} ord ${ord} p${pg}`) ??
            firstDifference(mine.spans, theirs.spans, `${pair} ord ${ord} p${pg} spans`)
          if (d) differ.push(d)
        }
      }
      expect(differ.slice(0, 5)).toEqual([])
      console.log(`D.sentences: ${n} unit pages, ${tokens} tokens`)
      expect(n).toBe(916)
    })
  },
)
