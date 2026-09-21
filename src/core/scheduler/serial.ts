// Work that must run one after another: a read–compare–write of a store, where two runs started together would both
// read before either wrote, and the later write would drop the earlier change (Codex on #39 and #157).
//
// Two rules, each of them a defect once, held here so the callers do not each restate them:
//
// - **A run that fails does not stop the ones behind it** (`then(run, run)`): a refused write is its caller's to hear
//   of, not the next caller's.
// - **The chain itself never rejects**: what is kept for the next run to wait on is the settled tail, so a failure
//   nobody awaits is not an unhandled rejection, and `idle()` can be waited on without a catch.

export interface SerialQueue {
  /** Run after everything queued before it has settled. Resolves or rejects with the run's own outcome */
  <T>(run: () => Promise<T>): Promise<T>
  /** Settles, never rejecting, once everything queued **so far** has */
  idle(): Promise<void>
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve()
  const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
    const result = tail.then(run, run)
    tail = result.then(() => undefined, () => undefined)
    return result
  }
  return Object.assign(enqueue, { idle: () => tail })
}
