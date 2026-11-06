// The laid units of a few pairs as the replays leave them (pass.ts: the chain from F2 to the fill leadings, then each page's
// fill), for D.text's and D.sentences' replays against today's own functions on the same layouts.
import type { PassUnit } from '../../src/shared/fill-pass.ts'
import { laysOf, passesOf } from './pass.ts'

export const PAIRS = ['2610.21377v1-zh', '1512.03385v1-ja.pack', '1706.03762v7-de.pack']
const cache = new Map<string, Map<number, PassUnit>>()
/** a pair's laid units, by ord, each at its final layout */
export function finalLays(pair: string): Map<number, PassUnit> {
  let lays = cache.get(pair)
  if (!lays) {
    lays = laysOf(pair).lays
    passesOf(pair, lays)
    cache.set(pair, lays)
  }
  return lays
}
/** each laid unit's pages, with the unit */
export function* unitPages(pair: string): Generator<[number, PassUnit, number]> {
  for (const [ord, p] of finalLays(pair))
    for (const pg of [...new Set(p.layout.lines.map((l) => l.page))].sort((a, b) => a - b)) yield [ord, p, pg]
}
