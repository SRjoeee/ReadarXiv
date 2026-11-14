// The reader's one render scheduler (design §4.5; engine-view-host §15 root cause 2: today three renderers on the main thread
// with no common scheduler, contention managed by gates and timers): every drawing either pane makes, a page view's or a
// detail view's or a page's crop render, is a job here, and one runs at a time (PDF.js's own viewer draws one page at a time).
// A job is picked by its rank when it is picked, not when it was asked for: what is in view first, then what is near, each in
// the order its pane gives (the page in view first, then the pages after it). A job no longer wanted (rank null) is dropped
// at its turn. A job asked while it runs runs again after it: its owner asks it because what it draws changed meanwhile (a
// page view reset by a new scale while it drew, whose drawing PDF.js gives up; staging, 2026-11-14, a page in view left
// undrawn). While the pages ahead are held, only what is in view is drawn.

export interface Job {
  /** 0 in view, 1 near; null: no longer wanted */
  rank(): number | null
  /** its place among jobs of one rank, lowest first */
  order(): number
  run(): Promise<unknown>
}

export interface Scheduler {
  /** `job` drawn at its turn (asking again before it runs changes nothing; asked while it runs, it runs again after) */
  want(job: Job): void
  /** `job` not drawn, where it has not begun */
  forget(job: Job): void
  /** the pages ahead held (only rank 0 drawn) or let go */
  hold(on: boolean): void
  /** the job running, or null */
  readonly running: Job | null
  readonly queued: number
  /** jobs run since the scheduler began (the probe's) */
  readonly ran: number
  /** resolves once nothing runs and nothing wanted is queued */
  idle(): Promise<void>
  dispose(): void
}

export function createScheduler(o: { warn?: (what: string, e: unknown) => void } = {}): Scheduler {
  const queue = new Set<Job>()
  let running: Job | null = null,
    held = false,
    disposed = false,
    ran = 0
  let waiters: (() => void)[] = []
  const settled = () => {
    if (running) return
    for (const j of queue) if (j.rank() !== null && (!held || j.rank() === 0)) return
    const w = waiters
    waiters = []
    for (const f of w) f()
  }
  const pick = (): Job | null => {
    let best: Job | null = null,
      bestRank = Number.POSITIVE_INFINITY,
      bestOrder = Number.POSITIVE_INFINITY
    for (const j of [...queue]) {
      const r = j.rank()
      if (r === null) {
        queue.delete(j)
        continue
      }
      if (held && r > 0) continue
      const k = j.order()
      if (r < bestRank || (r === bestRank && k < bestOrder)) {
        best = j
        bestRank = r
        bestOrder = k
      }
    }
    return best
  }
  const pump = () => {
    if (running || disposed) return
    const j = pick()
    if (!j) {
      settled()
      return
    }
    queue.delete(j)
    running = j
    ran++
    let p: Promise<unknown>
    try {
      p = j.run()
    } catch (e) {
      p = Promise.reject(e)
    }
    p.catch((e) => {
      if (!/cancel/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`)) o.warn?.('a drawing', e)
    }).finally(() => {
      if (running === j) running = null
      pump()
    })
  }
  return {
    want(job) {
      if (disposed || queue.has(job)) return
      queue.add(job)
      // (in the task after: the jobs asked together are ranked together)
      queueMicrotask(pump)
    },
    forget(job) {
      queue.delete(job)
    },
    hold(on) {
      held = on
      if (!on) queueMicrotask(pump)
    },
    get running() {
      return running
    },
    get queued() {
      return queue.size
    },
    get ran() {
      return ran
    },
    idle: () =>
      new Promise<void>((resolve) => {
        waiters.push(resolve)
        queueMicrotask(settled)
      }),
    dispose() {
      disposed = true
      queue.clear()
      const w = waiters
      waiters = []
      for (const f of w) f()
    },
  }
}
