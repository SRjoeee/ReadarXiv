// The page sessions whose work is withdrawn (DESIGN §4.5, §8.5). The background's session router marks a session's scope
// dead when its tab closes, its page is restored or the tab reports another session; every translation service and the
// figure recogniser read the mark, refusing a request of a dead scope after its cache read and before its cache write.
// A mark is written before anything is awaited and never expires, so a call suspended on a cache read wakes to a scope
// already dead, and a chain built after the drop reads the same answer. A scope is matched whole: a mark says nothing of
// another scope whose key begins the same way.
export class CancelledScopeRegistry {
  private readonly scopes = new Set<string>()

  /** The scope is dead from now on */
  markScope(scopeKey: string): void {
    this.scopes.add(scopeKey)
  }

  /** Whether the scope was marked dead */
  has(scopeKey: string): boolean {
    return this.scopes.has(scopeKey)
  }
}
