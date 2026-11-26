// The generation a reader is served, chosen at open under the present ranking: the complete generation of the best-ranked
// producer that has one. A generation of a producer the ranking does not hold is never served; a building or retired one
// waits or is past. So a change of ranking alone changes the answer, and translates nothing again.

import type { Generation, ProducerId } from './producers.ts'

/** the complete generation of the first ranked producer that has one; of a producer's several, the last (the caller gives
 *  them oldest first); null where no ranked producer has a complete generation */
export function select(o: { ranking: readonly ProducerId[]; generations: readonly Generation[] }): Generation | null {
  for (const producer of o.ranking) {
    const found = o.generations.findLast((g) => g.producer === producer && g.state === 'complete')
    if (found) return found
  }
  return null
}
