// run-slot.mjs's types: the one-run-at-a-time slot of the lab's v0 view
export interface Closable { close(): unknown }
export interface RunSlot<R extends Closable> {
  /** starts a run once the runs released before this call are gone; null where it was released before it began */
  start(open: () => Promise<R>): Promise<R | null>
  /** lets a run go: closed once it has started; later runs start after that */
  release(run: Promise<R | null> | null | undefined): void
}
export declare function createRunSlot<R extends Closable>(): RunSlot<R>
