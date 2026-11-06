// The session's runtime (design-b §1.6): the state held, inputs applied one at a time in arrival order (an input given while one
// is applied waits its turn), an input whose ticket is not live dropped before `step` and counted (routing: the region code holds
// no guard), and after every step the resources diffed: a ticket new is acquired by its slot's handler, a ticket gone released
// (its signal aborted, its release run), dependents first. An acquisition that resolves after its ticket went is let go at once
// by the handler's own signal. The live tickets equal `resources(state)`'s keys after every step (checked: I1 of design-b).
import { type Effect, type Input, resources, type Spec, type State, step, type Ticket, ticketOf } from './machine.ts'

export type Emit = (x: Input) => void
/** a slot's handler: the resource acquired for `spec` under ticket `t`; results told by `emit`; `signal` aborted at its release.
 *  Its return, where it gives one, runs at the release (after the abort) */
export type Handler<S extends Spec = Spec> = (
  spec: S,
  t: Ticket,
  emit: Emit,
  signal: AbortSignal,
) => (() => void | Promise<void>) | undefined
export type Handlers = { [K in Spec['slot']]: Handler<Extract<Spec, { slot: K }>> }

/** the order resources are let go in: what depends on another first (the composed document before the original's source) */
const ORDER: Spec['slot'][] = ['rows', 'composed', 'code', 'open', 'link', 'html', 'original', 'timer']

export interface Runtime {
  readonly state: State
  input(x: Input): void
  subscribe(f: (s: State) => void): () => void
  /** the live tickets and their slots */
  readonly live: ReadonlyMap<Ticket, Spec['slot']>
  readonly counts: { inputs: number; dropped: number; acquired: number; released: number }
  /** every resource released; resolves when their releases have run */
  dispose(): Promise<void>
}

export function createRuntime(o: {
  state: State
  handlers: Handlers
  effect(e: Effect): void
  /** a throw of step itself: a bug; the state is kept as it was */
  crash(e: unknown): void
  check?: boolean
  /** the time an input is applied at (the machine's clock: every timer is minted from it); Date.now by default */
  now?: () => number
}): Runtime {
  let state = o.state
  const live = new Map<Ticket, { slot: Spec['slot']; ac: AbortController; release?: () => void | Promise<void> }>()
  const counts = { inputs: 0, dropped: 0, acquired: 0, released: 0 }
  const listeners = new Set<(s: State) => void>()
  const queue: Input[] = []
  let applying = false
  const pending: Promise<unknown>[] = []
  const emitFor =
    (t: Ticket): Emit =>
    (x) => {
      // (an input of a let-go resource: dropped at its routing like any stale one)
      if (!live.has(t) && ticketOf(x) === t) {
        counts.dropped++
        return
      }
      rt.input(x)
    }
  function diff() {
    const want = resources(state)
    const gone = [...live.keys()].filter((t) => !want.has(t))
    gone.sort(
      (a, b) =>
        ORDER.indexOf((live.get(a) as { slot: Spec['slot'] }).slot) -
        ORDER.indexOf((live.get(b) as { slot: Spec['slot'] }).slot),
    )
    for (const t of gone) {
      const r = live.get(t) as { slot: Spec['slot']; ac: AbortController; release?: () => void | Promise<void> }
      live.delete(t)
      r.ac.abort(new Error('released'))
      counts.released++
      try {
        const p = r.release?.()
        if (p) pending.push(p.catch(() => {}))
      } catch {
        /* a release's own throw */
      }
    }
    for (const [t, spec] of want) {
      if (live.has(t)) continue
      const ac = new AbortController()
      const r: { slot: Spec['slot']; ac: AbortController; release?: () => void | Promise<void> } = {
        slot: spec.slot,
        ac,
      }
      live.set(t, r)
      counts.acquired++
      try {
        r.release = (o.handlers[spec.slot] as Handler)(spec, t, emitFor(t), ac.signal) ?? undefined
      } catch (e) {
        o.crash(e)
      }
    }
    if (o.check) {
      const keys = [...want.keys()].sort().join(),
        have = [...live.keys()].sort().join()
      if (keys !== have) o.crash(new Error(`live tickets ${have} are not the resources ${keys}`))
    }
  }
  function drain() {
    if (applying) return
    applying = true
    try {
      while (queue.length) {
        const x = queue.shift() as Input
        const t = ticketOf(x)
        if (t !== null && !live.has(t)) {
          counts.dropped++
          continue
        }
        counts.inputs++
        let out: ReturnType<typeof step>
        try {
          out = step(state, x, (o.now ?? Date.now)())
        } catch (e) {
          o.crash(e)
          continue
        }
        const changed = out.state !== state
        state = out.state
        diff()
        for (const e of out.effects) {
          try {
            o.effect(e)
          } catch {
            /* an effect's own throw */
          }
        }
        if (changed) for (const f of [...listeners]) f(state)
      }
    } finally {
      applying = false
    }
  }
  const rt: Runtime = {
    get state() {
      return state
    },
    get live() {
      return new Map([...live].map(([t, r]) => [t, r.slot]))
    },
    counts,
    input(x) {
      queue.push(x)
      drain()
    },
    subscribe(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    async dispose() {
      rt.input({ i: 'close' })
      await Promise.all(pending)
      listeners.clear()
    },
  }
  // the first state's resources: the original's first, before openReader returns
  diff()
  return rt
}
