// The service health record (the redesign's design, §4): the reader's services whose key the endpoint refused. Not
// configuration — a fact the extension observed, not a choice — so a configuration that cannot be read never takes it
// with it. Written by the background when a request ends in `auth`, cleared by a connection that succeeds, a key
// update or the service's deletion; read by the background's chain, the popup and the settings page. It carries the id
// and when, nothing of the request, and never a key (hard rule 5)
import { storage } from 'wxt/utils/storage'

type Record_ = Record<string, { rejected: number }>
const item = storage.defineItem<Record_>('local:serviceHealth', { fallback: {} })

/**
 * Every mutation of the record made from this module instance, one after another: the background marks and clears
 * from more than one place (a chain's `onFailure`, a named call's success or its own `auth` failure in
 * handlers.ts) without awaiting each other, and a read-then-write with no queue between two of them loses whichever
 * wrote second (Codex review). A mutation that fails does not break the queue for the one after it — its own
 * rejection is caught here and never reaches the next mutation's turn, only the caller that asked for it.
 *
 * A queue local to this module instance: the settings page runs in another context with a queue of its own, so its
 * delete-time `clearRejected` is not serialised against the background's writes. Losing that race is harmless — a
 * deleted id has nothing left to protect (ServiceDrawer.tsx's `remove`)
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

export async function markRejected(id: string): Promise<void> {
  return serialized(async () => {
    const now = await item.getValue()
    if (now[id]) return
    await item.setValue({ ...now, [id]: { rejected: Date.now() } })
  })
}

/** Says whether a mark was there to clear */
export async function clearRejected(id: string): Promise<boolean> {
  return serialized(async () => {
    const now = await item.getValue()
    if (!now[id]) return false
    const { [id]: _gone, ...rest } = now
    await item.setValue(rest)
    return true
  })
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
