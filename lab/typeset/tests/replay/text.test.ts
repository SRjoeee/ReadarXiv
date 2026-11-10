// D.text's segments replayed against today's own segsOfUnit (textlayer.mjs, engine 065c1d973) on every laid unit's every page of
// three pairs, at its final layout: each line's text segments and crops, every field.
import { describe, expect, it } from 'vitest'
import { segsOfUnit } from '../../../../packages/typeset/src/emit/text.ts'
import { finalLays, PAIRS, unitPages } from '../../../../packages/typeset/tests/replay/emit-lays.ts'
import { firstDifference, hasDerived, hasTap, hasToday, todayFile } from '../../../../packages/typeset/tests/replay/tap.ts'
import { hasCache } from '../../../../packages/typeset/tests/replay/today.ts'

type Today = { segsOfUnit(L: unknown, page: number): unknown[] }
const today = hasToday ? ((await import(todayFile('layer-proto/textlayer.mjs'))) as Today) : null

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache || !today)(
  'D.text: segsOfUnit replayed against today’s',
  () => {
    it('cuts each unit’s lines into today’s segments on each of its pages', () => {
      const differ: string[] = []
      let n = 0,
        segs = 0,
        crops = 0
      for (const pair of PAIRS) {
        finalLays(pair)
        for (const [ord, p, pg] of unitPages(pair)) {
          const theirs = today!.segsOfUnit(p.layout, pg)
          const mine = segsOfUnit(p.layout, pg)
          n++
          segs += mine.length
          crops += mine.filter((s) => 'crop' in s).length
          const d = firstDifference(mine, theirs, `${pair} ord ${ord} p${pg}`)
          if (d) differ.push(d)
        }
      }
      expect(differ.slice(0, 5)).toEqual([])
      console.log(`D.text: ${n} unit pages, ${segs} segments, ${crops} crops`)
      expect(n).toBe(916)
      expect(crops).toBeGreaterThan(100)
    })
  },
)
