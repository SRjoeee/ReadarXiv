// What a target of a paper is to be translated by next, under the present policy and the generations it has: the fast
// producer where it has none, then each upgrade producer, in order, that ranks above what a reader is served and has none.
// Nothing is asked of a model while the policy pauses them; a free chain is still asked.
//
// A producer "has one" where any generation of it for the paper's version and target is building, complete or retired.
// A retired generation is one judged bad for that paper version and target: it is never served (`select`), and its
// producer is never planned for them again, since the same producer would make the same set. Only another producer
// identity (a new model entry, so another producer) translates them anew.

import { type Policy, targetPolicyOf } from './policy.ts'
import type { Generation, ProducerId } from './producers.ts'
import { select } from './select.ts'

/** one translation to start: a producer's generation, the paper's first (`fast`) or a better one (`upgrade`) */
export interface Step {
  producer: ProducerId
  why: 'fast' | 'upgrade'
}

/** the steps a target of a paper is owed, fast first: none for a producer that has a generation in any state (building,
 *  complete, or retired: judged bad for this paper version and target, and so never made again by the same producer) */
export function plan(o: { policy: Policy; target: string; generations: readonly Generation[] }): readonly Step[] {
  const t = targetPolicyOf(o.policy, o.target)
  const underway = (producer: ProducerId) => o.generations.some((g) => g.producer === producer)
  const steps: Step[] = []
  if (!underway(t.fast)) steps.push({ producer: t.fast, why: 'fast' })
  if (o.policy.pauseLlm) return steps
  const served = select({ ranking: t.ranking, generations: o.generations })
  const bar = served ? t.ranking.indexOf(served.producer) : t.ranking.length
  for (const producer of t.upgrade) {
    const rank = t.ranking.indexOf(producer)
    if (rank !== -1 && rank < bar && !underway(producer)) steps.push({ producer, why: 'upgrade' })
  }
  return steps
}
