// A producer is what made a translation: an ordered chain of free engines (`free:<name>`), or a language model's entry
// (`llm:<name>`). Its name is what a policy ranks it by; its identity is computed from its translators and never
// depends on ranking, price or keys. A generation is one producer's set of rows for a paper version and a target.

import { identityOf } from './chain.ts'
import type { Translator } from './contract.ts'

/** a producer's name in a policy: its kind, then a tail of lower-case letters, digits, `.`, `_` and `-` */
export type ProducerId = `free:${string}` | `llm:${string}`

const NAME = /^(free|llm):[a-z0-9][a-z0-9._-]*$/

/** the kind a producer's name states, or null for a string that is no producer's name */
export function producerKindOf(id: string): 'free' | 'llm' | null {
  const m = NAME.exec(id)
  return m ? (m[1] as 'free' | 'llm') : null
}

/** the 12 hex that key a producer's works and rows: the head of the chain's identity over its ordered translators
 *  (identityOf), so the chain's and the acceptance rule's digests are in it, and the order of the translators */
export async function producerIdentityOf(translators: readonly Translator[]): Promise<string> {
  return (await identityOf(translators)).slice(0, 12)
}

/** one producer's set of rows for a paper version and a target */
export interface Generation {
  /** the sha256 of the producer's rows object for the paper version and target */
  id: string
  producer: ProducerId
  /** the producer's identity, 12 hex */
  identity: string
  state: 'building' | 'complete' | 'retired'
  /** the share of units holding the producer's own rows; null while building */
  ownShare: number | null
  reason?: string
}
