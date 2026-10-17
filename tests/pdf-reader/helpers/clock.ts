import { vi } from 'vitest'

// A run under fake timers brought to its end whatever the host's speed. Each turn gives the real event loop its own turn first
// (the real setImmediate, taken before any test fakes it), so that the run's real work — a digest of WebCrypto's thread pool, a
// PDF.js document's answer — goes on over as many turns as it takes; the fake clock is moved on only while a timer is pending, so
// a timer the run sets only once such work is done is waited for, never stepped past. It holds for timers whose own promises wait
// on no real work, as the reads' bounds (oplist.mjs within, the draw's race) do. A step moves the clock by `step` (the bound the
// run waits out, OPS_MS); the turns are bounded by `turns`, never by wall-clock time

/** the host's own setImmediate, whatever a test fakes later */
const realImmediate = globalThis.setImmediate

/** `run`'s value once it settles under fake timers, the clock moved `step` at a time only while a timer is pending */
export async function settleWithClock<T>(run: Promise<T>, step: number, turns = 100_000): Promise<T> {
  let done = false
  const out = run.finally(() => { done = true })
  for (let k = 0; !done; k++) {
    if (k >= turns) throw new Error(`the run did not settle within ${turns} turns`)
    await new Promise(r => realImmediate(r))
    if (!done && vi.getTimerCount() > 0) await vi.advanceTimersByTimeAsync(step)
  }
  return out
}
