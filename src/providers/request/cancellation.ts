// Ported from reference/read-frog/src/utils/request/cancellation.ts@9b44f82 (GPL-3.0), 2026-09-05, modified: 2026-09-12
// (DESIGN §8.5) CancelledScopeRegistry rewritten — no prefix marks, no expiry (its comment says why); 2026-11-07 (stage 4b)
// the ported error class removed, nothing calling it. CancelledScopeRegistry remembers cancelled scopes to close the window
// in which a call sits in no cancellable structure.
/**
 * The scopes ended for certain (DESIGN §8.5): the session router marks, every service that takes a scope reads, so a
 * call that was suspended on an await (the cache read, a chain build) when its scope was drained is refused when it
 * wakes instead of entering a queue with a dead scope that no future cancel will ever drain (#1881).
 *
 * Session ids are never reused, so remembering a scope can never wrongly reject a live request. Forgetting one can
 * revive a dead session whose call was still suspended — the ported registry's TTL and size cap did exactly that
 * under the local review's probe (a forCall held on a chain build while its tab closed, then 256 other drops) —
 * so nothing here expires: an entry is a few dozen bytes per ended session, and the worker's own life bounds the
 * set (it is recycled after thirty idle seconds).
 */
export class CancelledScopeRegistry {
  private readonly scopes = new Set<string>()

  markScope(scopeKey: string): void {
    this.scopes.add(scopeKey)
  }

  has(scopeKey: string): boolean {
    return this.scopes.has(scopeKey)
  }
}
