// Every timer and frame a reader asks for, through one clock it owns, so that a reader let go leaves none behind (no state
// outside a reader, design §4.5) and a test can run time by hand.

export interface Clock {
  now(): number
  later(f: () => void, ms: number): number
  clear(id: number): void
  frame(f: () => void): number
  cancel(id: number): void
}

const browserClock: Clock = {
  now: () => performance.now(),
  later: (f, ms) => setTimeout(f, ms) as unknown as number,
  clear: (id) => clearTimeout(id),
  frame: (f) => requestAnimationFrame(() => f()),
  cancel: (id) => cancelAnimationFrame(id),
}

export interface OwnedClock extends Clock {
  /** every timer and frame still due let go; nothing asked after runs */
  dispose(): void
  /** the timers and frames due (the probe's) */
  readonly due: number
}

/** a clock over `base` that keeps what it was asked for, and lets it all go at once */
export function ownedClock(base: Clock = browserClock): OwnedClock {
  const timers = new Set<number>(),
    frames = new Set<number>()
  let disposed = false
  return {
    now: () => base.now(),
    later(f, ms) {
      if (disposed) return 0
      const id: number = base.later(() => {
        timers.delete(id)
        if (!disposed) f()
      }, ms)
      timers.add(id)
      return id
    },
    clear(id) {
      if (id && timers.delete(id)) base.clear(id)
    },
    frame(f) {
      if (disposed) return 0
      const id: number = base.frame(() => {
        frames.delete(id)
        if (!disposed) f()
      })
      frames.add(id)
      return id
    },
    cancel(id) {
      if (id && frames.delete(id)) base.cancel(id)
    },
    dispose() {
      disposed = true
      for (const id of timers) base.clear(id)
      for (const id of frames) base.cancel(id)
      timers.clear()
      frames.clear()
    },
    get due() {
      return timers.size + frames.size
    },
  }
}
