// The service health record (the redesign's design, §4): the reader's services whose key the endpoint refused. Not
// configuration — a fact the extension observed, not a choice — so a configuration that cannot be read never takes it
// with it. Written by the background alone: marked when a request is answered 401, cleared by a connection that
// succeeds, a change of the service's key or address, or its deletion (background/health-guard.ts decides which); read
// by the background's chain, the popup and the settings page. It carries the id and when, nothing of the request, and
// never a key (hard rule 5)
import { storage } from 'wxt/utils/storage'

type Record_ = Record<string, { rejected: number }>
const item = storage.defineItem<Record_>('local:serviceHealth', { fallback: {} })

/**
 * Every mutation of the record made from this module instance, one after another: the background marks and clears
 * from more than one place (a chain's `onFailure`, a named call's success or its own refusal in handlers.ts, the
 * configuration watcher) without awaiting each other, and a read-then-write with no queue between two of them loses
 * whichever wrote second (Codex review). A mutation that fails does not break the queue for the one after it — its
 * own rejection is caught here and never reaches the next mutation's turn, only the caller that asked for it.
 *
 * A queue local to this module instance, and so one queue for every write: only the background writes the record
 */
let queue: Promise<void> = Promise.resolve()
function serialized<T>(mutate: () => Promise<T>): Promise<T> {
  const turn = queue.then(mutate, mutate)
  queue = turn.then(() => undefined, () => undefined)
  return turn
}

export async function rejectedServices(): Promise<Set<string>> {
  return new Set(Object.keys(await item.getValue()))
}

/**
 * `still`, when given, decides in the mark's own turn, so no other mutation lands between the check and the write. The
 * keeper's refusal reads the stored configuration there: a clear queued by a key change either runs first, and the
 * check sees the new key, or runs after, and sees this mark (background/health-guard.ts). It answering false marks
 * nothing; it rejecting rejects this mark only
 */
export async function markRejected(id: string, still?: () => Promise<boolean>): Promise<void> {
  return serialized(async () => {
    if (still && !(await still())) return
    const now = await item.getValue()
    if (now[id]) return
    await item.setValue({ ...now, [id]: { rejected: Date.now() } })
  })
}

/**
 * Clears, in one turn, the marks `pick` chooses from the ids marked at that turn, and says which were there to clear.
 * The choice is made inside the queue: made from a read outside it, a mark queued just before would be missed and
 * outlive the change that voids it (background/health-guard.ts). Choosing none writes nothing
 */
export async function clearRejectedAmong(pick: (marked: ReadonlySet<string>) => readonly string[]): Promise<string[]> {
  return serialized(async () => {
    const now = await item.getValue()
    const gone = [...new Set(pick(new Set(Object.keys(now))))].filter(id => now[id])
    if (gone.length === 0) return []
    await item.setValue(Object.fromEntries(Object.entries(now).filter(([id]) => !gone.includes(id))))
    return gone
  })
}

/** Says whether a mark was there to clear */
export async function clearRejected(id: string): Promise<boolean> {
  return (await clearRejectedAmong(() => [id])).length > 0
}

/**
 * Tells a watcher both the current ids and the ones just before, straight from WXT's own `(newValue, oldValue)` pair:
 * the background rebuilds the chain in force on any difference between them, added or removed, and needs no copy of
 * its own to compare against (Codex review, round 1). The popup (Task 12) subscribes the same way, to tell an
 * addition from a clearing
 */
export function watchRejected(callback: (ids: Set<string>, previous: Set<string>) => void): () => void {
  return item.watch((value, oldValue) => callback(new Set(Object.keys(value ?? {})), new Set(Object.keys(oldValue ?? {}))))
}
