// The key a model request is sent with (DESIGN §8, a host's LLM translator): pure, over the policy's keys and what the
// host's ledger knows now. Keys of one quota group share its allowance, so room is the group's, never the key's.
import type { KeyEntry } from './policy.ts'

export interface PickState {
  /** quota groups with room for the request now */
  roomy: ReadonlySet<string>
  /** aliases the ledger disabled (a key unusable), by alias */
  off: ReadonlySet<string>
}

/** the first enabled key, by `order` then alias, whose group has room and which is not off; null where none */
export function pick(keys: readonly KeyEntry[], state: PickState): string | null {
  let best: KeyEntry | null = null
  for (const k of keys) {
    if (!k.enabled || state.off.has(k.alias) || !state.roomy.has(k.group)) continue
    if (best === null || k.order < best.order || (k.order === best.order && k.alias < best.alias)) best = k
  }
  return best?.alias ?? null
}
