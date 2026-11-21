// Test adapters of the ports: a manual clock, a memory store (and stores that fail), a counting gate.
import type { Clock, Gate, Signal, Store } from '../contract.ts'

type Timer = { at: number; seq: number; resolve: () => void; signal: Signal; onAbort: () => void }
/** the host's own timer, used only to let the work in flight settle before the next fake timer fires */
const realTimeout = (globalThis as unknown as { setTimeout: (fn: () => void, ms: number) => unknown }).setTimeout

export interface FakeClock extends Clock {
  /** every sleep asked, in order, by its length */
  readonly sleeps: number[]
  /** timers waiting */
  readonly pending: number
  /** moves time on by `ms`, firing the timers due in order */
  advance(ms: number): Promise<void>
}

/**
 * A clock whose time moves only when every piece of work in flight waits on it: each fake timer fires on a turn of the
 * host's event loop of its own, the earliest first, so that what a fired timer starts runs before the next one fires.
 * Backoffs, cooldowns, timeouts and the breaker's five minutes are tested without waiting. `auto: false` leaves the time
 * to `advance`. `random` is fixed (0.5: a backoff of exactly its base) unless given
 */
export function fakeClock(o: { start?: number; auto?: boolean; random?: () => number } = {}): FakeClock {
  let now = o.start ?? 0
  let seq = 0
  let stepping = false
  const timers: Timer[] = []
  const sleeps: number[] = []
  const fire = (t: Timer) => {
    timers.splice(timers.indexOf(t), 1)
    t.signal.removeEventListener('abort', t.onAbort)
    t.resolve()
  }
  const earliest = () =>
    timers.reduce<Timer | undefined>(
      (a, b) => (!a || b.at < a.at || (b.at === a.at && b.seq < a.seq) ? b : a),
      undefined,
    )
  const step = () => {
    const t = earliest()
    if (!t) {
      stepping = false
      return
    }
    now = Math.max(now, t.at)
    fire(t)
    realTimeout(step, 0)
  }
  return {
    now: () => now,
    random: o.random ?? (() => 0.5),
    sleeps,
    get pending() {
      return timers.length
    },
    sleep(ms, signal) {
      sleeps.push(ms)
      return new Promise<void>((resolve) => {
        if (signal.aborted) return resolve()
        const t: Timer = { at: now + Math.max(0, ms), seq: seq++, resolve, signal, onAbort: () => fire(t) }
        timers.push(t)
        signal.addEventListener('abort', t.onAbort, { once: true })
        if (o.auto !== false && !stepping) {
          stepping = true
          realTimeout(step, 0)
        }
      })
    },
    async advance(ms) {
      const until = now + ms
      for (let t = earliest(); t && t.at <= until; t = earliest()) {
        now = t.at
        fire(t)
        await new Promise<void>((r) => realTimeout(r, 0))
      }
      now = until
    },
  }
}

export interface MemoryStore extends Store {
  readonly entries: Map<string, string>
  /** the keys of every read call, and the entries of every write call */
  readonly reads: (readonly string[])[]
  readonly writes: (readonly (readonly [string, string])[])[]
}
/** A store in memory. `fail`: every read and write throws; `hang`: never answers; `garbage`: reads answer what no reply is */
export function memoryStore(o: { fail?: boolean; hang?: boolean; garbage?: boolean } = {}): MemoryStore {
  const entries = new Map<string, string>()
  const reads: (readonly string[])[] = []
  const writes: (readonly (readonly [string, string])[])[] = []
  const never = new Promise<never>(() => {})
  return {
    entries,
    reads,
    writes,
    async read(keys) {
      reads.push([...keys])
      if (o.fail) throw new Error('the store is down')
      if (o.hang) return never
      if (o.garbage) return keys.map(() => '\u0000not a reply') as (string | null)[]
      return keys.map((k) => entries.get(k) ?? null)
    },
    async write(list) {
      writes.push(list.map(([k, v]) => [k, v] as const))
      if (o.fail) throw new Error('the store is down')
      if (o.hang) return never
      for (const [k, v] of list) entries.set(k, v)
    },
  }
}

export interface CountingGate extends Gate {
  /** leases out now, by translator identity */
  readonly out: Map<string, number>
  /** the most ever out at once, by identity */
  readonly peak: Map<string, number>
  readonly released: { lease: string; outcome: 'ok' | 'failed' | 'none'; coolMs?: number }[]
}
/** A gate that grants up to `cap` leases per identity at once and counts them; `refuse` turns every ask away */
export function countingGate(o: { cap?: number; refuse?: boolean; fail?: boolean } = {}): CountingGate {
  const out = new Map<string, number>()
  const peak = new Map<string, number>()
  const byLease = new Map<string, string>()
  const released: CountingGate['released'] = []
  let n = 0
  return {
    out,
    peak,
    released,
    async acquire(by) {
      if (o.fail) throw new Error('the gate is down')
      if (o.refuse || (out.get(by) ?? 0) >= (o.cap ?? Number.POSITIVE_INFINITY)) return { ok: false, retryInMs: 1_000 }
      const lease = `${by}#${++n}`
      byLease.set(lease, by)
      out.set(by, (out.get(by) ?? 0) + 1)
      peak.set(by, Math.max(peak.get(by) ?? 0, out.get(by) ?? 0))
      return { ok: true, lease }
    },
    async release(lease, outcome, coolMs) {
      released.push(coolMs === undefined ? { lease, outcome } : { lease, outcome, coolMs })
      const by = byLease.get(lease)
      if (by === undefined) return
      byLease.delete(lease)
      out.set(by, (out.get(by) ?? 1) - 1)
    },
  }
}
