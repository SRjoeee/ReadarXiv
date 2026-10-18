// lab/pdf/layer-lab/run-slot.mjs
// One v0 run at a time. The engine keeps the font roles (fonts.mjs setRoleFaces: the target's faces and the rule set's CJK
// faces) for the whole page, not for a run, and a run sets them as it starts and again from its first page; so a run
// started while another is still starting, or not yet disposed, can have the roles of the one it replaced, and measure and
// draw with its faces and its rules' CJK family. The lab starts every run through this slot: a run starts only after every
// run released before it has finished starting (or failed to) and been closed, and one released before it began to start
// never starts.

/**
 * A slot for runs that are promises of an object with `close()` (a promise, since a run takes a while to start).
 */
export function createRunSlot() {
  /** settled once every run released so far is closed, or has failed to start */
  let gone = Promise.resolve()
  const released = new WeakSet()
  return {
    /** starts a run when the runs released before this call are gone: `open()` makes it. The promise of the run, or of null where
     *  it was released before `open` was called */
    start(open) {
      const run = gone.then(() => (released.has(run) ? null : open()))
      return run
    },
    /** lets a run go: closed once it has started (at once if it has), or, if it failed to start, nothing to close. Later runs
     *  start after that. Releasing a run again, or none, does nothing */
    release(run) {
      if (!run || released.has(run)) return
      released.add(run)
      gone = gone.then(() => run).then(started => started?.close(), () => {}).catch(() => {})
    },
  }
}
