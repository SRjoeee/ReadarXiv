// The chain (interfaces/translate/DECISION.md): one object a host makes once, `chainOf(ports)`, which owns the queue, the
// pacing, the cooldowns and the breaker of every translator it is handed; no module state. Carried from the server's chain
// (readarxiv-web worker/src/mt/chain.ts, gate.ts, global-gate.ts, egress-deps.ts, answers.ts) as the decision's table
// says, with the PDF engine's loop (mt.mjs translateUnits) merged in: write, key, store read, requests cut by limits and
// equal wires sent once, send, read, accept, fall through per unit, the re-ask, the runs floor.
import { ACCEPT_DIGEST, accept, asOut, hasLetter, validSentences } from './accept.ts'
import {
  type Chain,
  type Clock,
  Fault,
  type Lang,
  type Note,
  type OutPiece,
  type PaperContext,
  type Piece,
  type Ports,
  type Result,
  type Sentences,
  type Signal,
  type Store,
  type TranslateOptions,
  type Translator,
  type UnconfiguredCode,
  type UnitIn,
  type Why,
} from './contract.ts'
import { placeGroups, placeReferences, referencesOf, referenceText } from './groups.ts'
import { namedOf } from './names.ts'
import { runsOf } from './runs.ts'
import { sha256Hex } from './sha256.ts'

// ---------------------------------------------------------------- the fixed policy (design-a §1.5; chain.ts, global-gate.ts)

/** tries of a request a transient failure is worth, the first included (chain.ts `attempts`) */
export const ATTEMPTS = 3
/** the n-th wait: BACKOFF_MS × 3^(n−1) × (0.5 + random) (chain.ts backoffDelay) */
export const BACKOFF_MS = 500
/** a 429's cooldown at least (chain.ts MIN_COOL_MS), and when it names none (retry-policy's base pause) */
export const MIN_COOL_MS = 1_000
export const DEFAULT_COOL_MS = 5_000
/** how many times the chain's last translator waits a cooldown out before its unit is unavailable (chain.ts `waits < 2`) */
export const LAST_WAITS = 2
/** the breaker (global-gate.ts GATE_DEFAULTS): opens when OPEN_AT of at least MIN_OUTCOMES of the last WINDOW outcomes
 *  failed; skips its translator for BREAKER_MS, then lets one probe through; never skips the chain's last */
export const BREAKER = { window: 50, minOutcomes: 20, openAt: 0.5, coolMs: 5 * 60_000 } as const
/** a store read answers within this or is all misses; a write is given this long (answers.ts GET 2 s, PUT 5 s) */
export const STORE_READ_MS = 2_000
export const STORE_WRITE_MS = 5_000
/** buffered store writes go out at this many entries, and at the end of a call */
export const WRITE_EVERY = 200
/** a stored value at most (design-a §1.6) */
export const VALUE_MAX = 64 * 1024
/** `supports` answers within this or the translator is passed over (providers/index.ts PROBE_MS) */
export const SUPPORTS_MS = 2_000
/** a gate's answer within this, or the request goes through without it (global-gate.ts GLOBAL_CALL_MS: fails open) */
export const GATE_MS = 1_000
/** the store key's grammar; it rises only if the grammar changes */
export const KEY_VERSION = 't1'
/** the chain's own outcome rules (fall-through per unit, one re-ask where a translator asks it, the runs floor of stretches
 *  of two letters or more, every stretch given or none, `-whole` (d76d6b200: a stretch no translator gives leaves the unit the
 *  original's, never its English between translated stretches), a span that is no edge keeping its head in a copy of itself:
 *  runs.ts; an element set after the unit's text given to no translator, put back after the translation: tailOf; a group a
 *  reply did not bring back placed around its own text where the translation states it: groups.ts; a word tied to a reference
 *  that abbreviates the item's name sent to every translator as that name: names.ts; a phrase group a markers-wire translator's
 *  reply did not bring back placed where it states the group's reference translation, asked of it in the unit's batch:
 *  groups.ts placeReferences): a change to them is a change of every row */
export const CHAIN_RULES = 'chain/1|fall-through|reask|runs>=2-whole|runs-heads|after|groups|names|references'

// ---------------------------------------------------------------- the platform's timers and controllers, by structure

interface Controller {
  readonly signal: Signal
  abort(reason?: unknown): void
}
const platform = globalThis as unknown as {
  AbortController: new () => Controller
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (t: unknown) => void
  Date: { now(): number }
}
const controller = (): Controller => new platform.AbortController()

/** The real clock */
export function realClock(): Clock {
  return {
    now: () => platform.Date.now(),
    random: () => Math.random(),
    sleep: (ms, signal) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) return resolve()
        const done = () => {
          platform.clearTimeout(timer)
          signal.removeEventListener('abort', done)
          resolve()
        }
        const timer = platform.setTimeout(done, ms)
        signal.addEventListener('abort', done, { once: true })
      }),
  }
}

/** `p`'s value, or `fallback` once `ms` has passed on the clock or `p` rejects; the timer is cancelled either way */
async function within<T>(clock: Clock, p: Promise<T>, ms: number, fallback: T): Promise<T> {
  const c = controller()
  try {
    return await Promise.race([p.catch(() => fallback), clock.sleep(ms, c.signal).then(() => fallback)])
  } finally {
    c.abort()
  }
}

// ---------------------------------------------------------------- identities and keys

/** a context's digest, for the key of a translator whose replies depend on it */
const contextDigest = (context: PaperContext | undefined): string => {
  if (!context) return '-'
  const parts: unknown[] = [context.title ?? null, context.abstract ?? null, context.terms ?? null]
  // (a section or a glossary only where given: a context without them keys as it did before they existed)
  if (context.section !== undefined || context.glossary !== undefined)
    parts.push(context.section ?? null, context.glossary?.map((g) => [g.term, g.translation]) ?? null)
  return sha256Hex(JSON.stringify(parts))
}
/** the store key (design-a §1.6): `t1|<translator identity>|<target>|<sha256 of the wire>|<context digest, or ->` */
export const keyOf = (t: Translator, target: Lang, wire: string, context?: PaperContext): string =>
  `${KEY_VERSION}|${t.identity}|${target}|${sha256Hex(wire)}|${t.context ? contextDigest(context) : '-'}`

/** What a row is keyed by besides unit id and target (DECISION: translators' identities and their behaviour digests plus
 *  the acceptance rule's digest, and the chain's own rules): it moves only when an outcome could */
export async function identityOf(translators: readonly Translator[]): Promise<string> {
  const parts = translators.map((t) => [t.identity, t.digest, t.limits.reask])
  return sha256Hex(JSON.stringify([CHAIN_RULES, ACCEPT_DIGEST, parts])).slice(0, 32)
}

// ---------------------------------------------------------------- the lanes: one per translator identity
// A lane's pacing (requests in flight, the cooldown, the breaker) is its identity's: one endpoint, one budget. Its entries
// are a translator object's: two objects of one identity (a host's key replaced while a page still translates; an
// identity never holds a key) share no request, no batch and no `off`, so each object's units go by its own `send`

/** what a request brings back for one waiter */
type Answer =
  | { raw: string }
  /** a lone unit the translator said its request could not take (`halve` down to one) */
  | { refused: true }
  | { unavailable: true; retryAfterMs?: number; cooling?: boolean }
  | { off: UnconfiguredCode }
  | { aborted: true }

interface Waiter {
  seq: number
  index: number
  last: boolean
  note: ((n: Note) => void) | undefined
  resolve(a: Answer): void
}
interface Entry {
  key: string
  wire: string
  group: string
  translator: Translator
  target: Lang
  context: PaperContext | undefined
  alone: boolean
  waiters: Set<Waiter>
  state: 'queued' | 'flight'
  request: Controller | null
}
interface Lane {
  identity: string
  inFlight: number
  queue: Entry[]
  byKey: Map<string, Entry>
  coolUntil: number
  breaker: { outcomes: boolean[]; state: 'closed' | 'open' | 'half'; until: number }
  pumping: boolean
}

const before = (a: Waiter, b: { seq: number; index: number }) => a.seq > b.seq || (a.seq === b.seq && a.index < b.index)
/** an entry's priority: its most urgent waiter's (the latest call first, then array order) */
const prioOf = (e: Entry) => {
  let best: { seq: number; index: number } = { seq: -1, index: Number.POSITIVE_INFINITY }
  for (const w of e.waiters) if (before(w, best)) best = { seq: w.seq, index: w.index }
  return best
}
const urgent = (a: Entry, b: Entry) => {
  const x = prioOf(a)
  const y = prioOf(b)
  return x.seq !== y.seq ? y.seq - x.seq : x.index - y.index
}

const UNCONFIGURED: Partial<Record<Fault['code'], UnconfiguredCode>> = {
  'no-key': 'no-key',
  'key-refused': 'key-refused',
  model: 'no-model',
  'needs-gesture': 'needs-gesture',
  unsupported: 'no-language',
}
/** the failures that are the endpoint's health, which the breaker counts (chain.ts ENGINE_FAILURES) */
const HEALTH = new Set<Fault['code']>(['network', 'timeout', 'overload'])

export function chainOf(ports: Ports = {}): Chain {
  const clock = ports.clock ?? realClock()
  const lanes = new Map<string, Lane>()
  /** translators off for their configuration, by object: a changed configuration makes new objects */
  const offs = new WeakMap<Translator, UnconfiguredCode>()
  /** each translator object's number, in its lane's entry keys: equal wires of one object are asked once, of two never together */
  const objects = new WeakMap<Translator, number>()
  let made = 0
  const objectOf = (t: Translator): number => {
    let n = objects.get(t)
    if (n === undefined) {
      n = ++made
      objects.set(t, n)
    }
    return n
  }
  const supported = new WeakMap<Translator, Map<Lang, Promise<boolean>>>()
  let calls = 0

  const laneOf = (t: Translator): Lane => {
    let lane = lanes.get(t.identity)
    if (!lane) {
      lane = {
        identity: t.identity,
        inFlight: 0,
        queue: [],
        byKey: new Map(),
        coolUntil: 0,
        breaker: { outcomes: [], state: 'closed', until: 0 },
        pumping: false,
      }
      lanes.set(t.identity, lane)
    }
    return lane
  }
  const supports = (t: Translator, target: Lang): Promise<boolean> => {
    let byTarget = supported.get(t)
    if (!byTarget) {
      byTarget = new Map()
      supported.set(t, byTarget)
    }
    let p = byTarget.get(target)
    if (!p) {
      p = within(
        clock,
        Promise.resolve().then(() => t.supports(target)),
        SUPPORTS_MS,
        false,
      ).then((ok) => ok === true)
      byTarget.set(target, p)
      // only a yes is kept: a no may be a language pack not here yet or a probe that timed out, asked again next call
      const asked = p
      const held = byTarget
      void asked.then((ok) => {
        if (!ok && held.get(target) === asked) held.delete(target)
      })
    }
    return p
  }

  // ---- the breaker, per identity, in memory (global-gate.ts GlobalGateCore's rule)
  const record = (lane: Lane, ok: boolean | null) => {
    const b = lane.breaker
    if (ok === null || b.state === 'open') return
    if (b.state === 'half') {
      lane.breaker = ok
        ? { outcomes: [], state: 'closed', until: 0 }
        : { outcomes: [], state: 'open', until: clock.now() + BREAKER.coolMs }
      return
    }
    const outcomes = [...b.outcomes, ok].slice(-BREAKER.window)
    const failed = outcomes.filter((o) => !o).length
    lane.breaker =
      outcomes.length >= BREAKER.minOutcomes && failed / outcomes.length >= BREAKER.openAt
        ? { outcomes: [], state: 'open', until: clock.now() + BREAKER.coolMs }
        : { ...b, outcomes }
  }
  /** whether a unit that has a translator after this one passes it over: its breaker open */
  const shut = (lane: Lane): boolean => {
    const b = lane.breaker
    if (b.state !== 'open') return false
    if (b.until > clock.now()) return true
    lane.breaker = { ...b, state: 'half' }
    return false
  }
  const coolingMs = (lane: Lane): number => Math.max(0, lane.coolUntil - clock.now())

  // ---- asking a lane: an entry per key, shared by every waiter; requests cut from the queue, the most urgent first
  const ask = (
    t: Translator,
    target: Lang,
    context: PaperContext | undefined,
    key: string,
    wire: string,
    alone: boolean,
    w: Omit<Waiter, 'resolve'>,
    signal: Signal,
  ): Promise<Answer> =>
    new Promise<Answer>((resolve) => {
      if (signal.aborted) return resolve({ aborted: true })
      const lane = laneOf(t)
      const k = `${objectOf(t)}|${alone ? `${key}|again` : key}`
      let e = lane.byKey.get(k)
      if (!e) {
        e = {
          key: k,
          wire,
          group: `${target}|${t.context ? contextDigest(context) : '-'}`,
          translator: t,
          target,
          context,
          alone,
          waiters: new Set(),
          state: 'queued',
          request: null,
        }
        lane.byKey.set(k, e)
        lane.queue.push(e)
      }
      const entry = e
      const waiter: Waiter = { ...w, resolve }
      entry.waiters.add(waiter)
      const onAbort = () => leave(lane, entry, waiter)
      signal.addEventListener('abort', onAbort, { once: true })
      waiter.resolve = (a) => {
        signal.removeEventListener('abort', onAbort)
        resolve(a)
      }
      schedule(lane)
    })
  /** a waiter gone: its entry dropped from the queue when no one else waits, its request cut when none of it is waited for */
  const leave = (lane: Lane, e: Entry, w: Waiter) => {
    if (!e.waiters.delete(w)) return
    w.resolve({ aborted: true })
    if (e.waiters.size) return
    if (e.state === 'queued') {
      lane.queue.splice(lane.queue.indexOf(e), 1)
      lane.byKey.delete(e.key)
    } else if (e.request && [...lane.byKey.values()].every((x) => x.request !== e.request || x.waiters.size === 0))
      e.request.abort()
  }
  const answer = (lane: Lane, e: Entry, a: Answer) => {
    if (lane.byKey.get(e.key) === e) lane.byKey.delete(e.key)
    const i = lane.queue.indexOf(e)
    if (i >= 0) lane.queue.splice(i, 1)
    const ws = [...e.waiters]
    e.waiters.clear()
    for (const w of ws) w.resolve(a)
  }
  const schedule = (lane: Lane) => {
    if (lane.pumping) return
    lane.pumping = true
    // (after the asks of this turn: they go out together)
    void Promise.resolve().then(() => {
      lane.pumping = false
      pump(lane)
    })
  }
  const pump = (lane: Lane) => {
    while (lane.queue.length) {
      const first = lane.queue.slice().sort(urgent)[0] as Entry
      const limits = first.translator.limits
      if (lane.inFlight >= Math.max(1, limits.inFlight)) return
      if (lane.breaker.state === 'half' && lane.inFlight >= 1) return
      const cool = coolingMs(lane)
      if (cool > 0) {
        // a cooling translator turns its queue away; the chain's last one is waited out by its units
        for (const e of [...lane.queue]) answer(lane, e, { unavailable: true, retryAfterMs: cool, cooling: true })
        return
      }
      const request: Entry[] = [first]
      if (!first.alone && first.wire.length <= limits.chars) {
        let chars = first.wire.length
        const peers = lane.queue.filter(
          (x) => x !== first && x.translator === first.translator && x.group === first.group && !x.alone,
        )
        for (const e of peers.sort(urgent)) {
          if (request.length >= limits.units) break
          if (chars + e.wire.length > limits.chars) continue
          request.push(e)
          chars += e.wire.length
        }
      }
      for (const e of request) {
        lane.queue.splice(lane.queue.indexOf(e), 1)
        e.state = 'flight'
      }
      lane.inFlight++
      void run(lane, request).finally(() => {
        lane.inFlight--
        // a request cut because no one waits for it any more ends inside a host's withdrawal of its calls, which may run
        // microtasks before its next call is withdrawn (a router awaiting between scopes; Chromium runs them inside the
        // abort of a fetch): the slot goes on after the current task, so that it starts nothing of a call being withdrawn
        if (request[0]?.request?.signal.aborted) platform.setTimeout(() => pump(lane), 0)
        else pump(lane)
      })
    }
  }

  /** one request and its retries, in its slot: each entry answered exactly once */
  const run = async (lane: Lane, entries: Entry[]): Promise<void> => {
    const t = (entries[0] as Entry).translator
    // aborted once no entry of the request is waited for (leave): the attempt in flight is cut, a backoff ends
    const gone = controller()
    for (const e of entries) e.request = gone
    let attempt = 1
    let todo = entries
    let gateWaits = 0
    const drop = (e: Entry) => {
      if (lane.byKey.get(e.key) === e) lane.byKey.delete(e.key)
    }
    for (;;) {
      for (const e of todo) if (!e.waiters.size) drop(e)
      todo = todo.filter((e) => e.waiters.size > 0)
      if (!todo.length || gone.signal.aborted) return
      const req = controller()
      const cut = () => req.abort()
      gone.signal.addEventListener('abort', cut, { once: true })
      const last = todo.some((e) => [...e.waiters].some((w) => w.last))
      // the gate across realms: a refusal turns the request away (the last translator waits for it a little), one that
      // fails or does not answer in time lets it through (fails open)
      let lease: string | null = null
      if (ports.gate) {
        const gate = ports.gate
        const asked = Promise.resolve().then(() => gate.acquire(t.identity, req.signal, last))
        const g = await within(clock, asked, GATE_MS, null)
        // a lease granted after the chain stopped waiting is held by nobody: given back as it arrives
        if (g === null)
          void asked.then((late) => (late.ok ? gate.release(late.lease, 'none') : undefined)).catch(() => {})
        if (g && !g.ok) {
          gone.signal.removeEventListener('abort', cut)
          if (last && gateWaits < LAST_WAITS) {
            gateWaits++
            await clock.sleep(Math.max(50, g.retryInMs ?? 250), gone.signal)
            continue
          }
          for (const e of todo)
            answer(lane, e, g.retryInMs ? { unavailable: true, retryAfterMs: g.retryInMs } : { unavailable: true })
          return
        }
        if (g?.ok) lease = g.lease
      }
      const told = new Set<(n: Note) => void>()
      for (const e of todo) for (const w of e.waiters) if (w.note) told.add(w.note)
      const chars = todo.reduce((n, e) => n + e.wire.length, 0)
      for (const note of told) safely(() => note({ kind: 'sent', by: t.identity, chars, units: todo.length }))
      // the request's own limit, on the clock
      const timer = controller()
      let timedOut = false
      void clock.sleep(t.limits.callMs, timer.signal).then(() => {
        if (timer.signal.aborted) return
        timedOut = true
        req.abort()
      })
      const delivered = new Set<number>()
      let fault: Fault | null = null
      const timeout = () => new Fault('again', 'timeout', `${t.identity}: no answer within ${t.limits.callMs} ms`)
      try {
        const first = todo[0] as Entry
        const call: { target: Lang; context?: PaperContext } = { target: first.target }
        if (t.context && first.context) call.context = first.context
        // the replies are waited for no longer than the request's signal lives: a `send` that ignores its signal
        // (hard rule 3) is left where it hangs, and its late replies and errors go nowhere
        const replies = t
          .send(
            todo.map((e) => e.wire),
            call,
            req.signal,
          )
          [Symbol.asyncIterator]()
        let stop: () => void = () => {}
        const stopped = new Promise<null>((resolve) => {
          stop = () => resolve(null)
        })
        req.signal.addEventListener('abort', stop, { once: true })
        try {
          for (;;) {
            const next = replies.next()
            const step = await Promise.race([next, stopped])
            if (step === null) {
              next.catch(() => {})
              void Promise.resolve()
                .then(() => replies.return?.(undefined))
                .catch(() => {})
              break
            }
            if (step.done || timedOut || gone.signal.aborted) break
            const [i, raw] = step.value
            const e = todo[i]
            if (!e || delivered.has(i) || typeof raw !== 'string') continue
            delivered.add(i)
            answer(lane, e, { raw })
          }
        } finally {
          req.signal.removeEventListener('abort', stop)
        }
        if (timedOut) fault = timeout()
        else if (gone.signal.aborted) fault = new Fault('abort', 'aborted', 'the request was aborted')
      } catch (err) {
        fault = timedOut
          ? timeout()
          : gone.signal.aborted
            ? new Fault('abort', 'aborted', 'the request was aborted')
            : err instanceof Fault
              ? err
              : new Fault('again', 'network', `${t.identity}: ${String((err as Error)?.message ?? err)}`)
      } finally {
        timer.abort()
        gone.signal.removeEventListener('abort', cut)
      }
      const rest = todo.filter((_, i) => !delivered.has(i))
      // a request that ended with units unanswered: the reply was short of them, asked once more (design-a: `reply`)
      if (!fault && rest.length)
        fault = new Fault('again', 'malformed', `${t.identity}: ${rest.length} of ${todo.length} units unanswered`, {
          tries: 2,
        })
      const health =
        !fault || delivered.size > 0 ? true : fault.remedy === 'again' && HEALTH.has(fault.code) ? false : null
      record(lane, health)
      const coolMs = fault?.remedy === 'cool' ? Math.max(fault.retryAfterMs ?? DEFAULT_COOL_MS, MIN_COOL_MS) : undefined
      if (lease !== null && ports.gate) {
        const gate = ports.gate
        const held = lease
        void Promise.resolve()
          .then(() => gate.release(held, health === true ? 'ok' : health === false ? 'failed' : 'none', coolMs))
          .catch(() => {})
      }
      if (!fault || !rest.length) return
      todo = rest
      switch (fault.remedy) {
        case 'again': {
          if (attempt >= (fault.tries ?? ATTEMPTS)) {
            for (const e of todo) answer(lane, e, { unavailable: true })
            return
          }
          const delay = Math.round(BACKOFF_MS * 3 ** (attempt - 1) * (0.5 + clock.random()))
          attempt++
          await clock.sleep(delay, gone.signal)
          continue
        }
        case 'cool': {
          lane.coolUntil = Math.max(lane.coolUntil, clock.now() + (coolMs as number))
          for (const e of todo) answer(lane, e, { unavailable: true, retryAfterMs: coolMs as number, cooling: true })
          return
        }
        case 'halve': {
          if (todo.length === 1) {
            answer(lane, todo[0] as Entry, { refused: true })
            return
          }
          const h = todo.length >> 1
          await run(lane, todo.slice(0, h))
          await run(lane, todo.slice(h))
          return
        }
        case 'off': {
          const code = UNCONFIGURED[fault.code] ?? 'key-refused'
          offs.set(t, code)
          for (const e of todo) answer(lane, e, { off: code })
          for (const e of [...lane.queue]) if (e.translator === t) answer(lane, e, { off: code })
          return
        }
        case 'pass': {
          const code = UNCONFIGURED[fault.code]
          for (const e of todo)
            answer(lane, e, fault.code === 'unsupported' && code ? { off: code } : { unavailable: true })
          return
        }
        case 'abort': {
          for (const e of todo) answer(lane, e, { aborted: true })
          return
        }
      }
    }
  }

  return {
    translate(units, target, o) {
      return translateCall(units, target, o)
    },
  }

  async function* translateCall(units: readonly UnitIn[], target: Lang, o: TranslateOptions): AsyncGenerator<Result> {
    checkCall(units, o.translators)
    const seq = ++calls
    // the call's own signal: the caller's, and the iterator's end before every unit settled (a host that stops reading lets
    // its work go as an abort does: no request is kept for it, no timer outlives it)
    const given = o.signal ?? NEVER
    const own = controller()
    const forward = () => own.abort()
    given.addEventListener('abort', forward, { once: true })
    if (given.aborted) own.abort()
    const signal = own.signal
    const results: Result[] = []
    const settled = new Set<number>()
    let wake: (() => void) | null = null
    const emit = (i: number, r: Result) => {
      if (settled.has(i)) return
      settled.add(i)
      results.push(r)
      wake?.()
    }
    const note = (n: Note) => safely(() => o.note?.(n))
    const reader = readerOf(ports.store, clock)
    const writes: [string, string][] = []
    const flushes: Promise<void>[] = []
    const write = (key: string, raw: string) => {
      if (!ports.store || raw.length > VALUE_MAX) return
      writes.push([key, raw])
      if (writes.length >= WRITE_EVERY) flushes.push(flush(ports.store, writes.splice(0), clock))
    }
    const onAbort = () => {
      for (const [i, u] of units.entries()) emit(i, { id: u.id, ok: false, why: { kind: 'aborted' } })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      if (signal.aborted) onAbort()
      // the translators that serve the target, off ones out
      const served: Translator[] = []
      const offCodes: UnconfiguredCode[] = []
      const skipped: { by: string; code: UnconfiguredCode }[] = []
      for (const t of o.translators) {
        const off = offs.get(t)
        const code = off ?? ((await supports(t, target)) ? null : 'no-language')
        if (code === null) served.push(t)
        else {
          offCodes.push(code)
          skipped.push({ by: t.identity, code })
        }
      }
      const work = units.map((u, i) =>
        settle(u, i, {
          target,
          context: o.context,
          served,
          offCodes,
          skipped,
          seq,
          signal,
          note,
          reader,
          write,
          emit,
          runs: true,
        }),
      )
      const all = Promise.all(work).then(() => {
        wake?.()
      })
      while (settled.size < units.length || results.length) {
        if (results.length) {
          yield results.shift() as Result
          continue
        }
        await Promise.race([new Promise<void>((r) => (wake = r)), all])
        wake = null
      }
    } finally {
      given.removeEventListener('abort', forward)
      if (settled.size < units.length) own.abort()
      signal.removeEventListener('abort', onAbort)
      if (ports.store && writes.length) flushes.push(flush(ports.store, writes.splice(0), clock))
      await Promise.all(flushes)
    }
  }

  interface Call {
    target: Lang
    context: PaperContext | undefined
    served: readonly Translator[]
    offCodes: readonly UnconfiguredCode[]
    /** the call's translators that do not serve the target or are off, told to the host as passed for every unit */
    skipped: readonly { by: string; code: UnconfiguredCode }[]
    seq: number
    signal: Signal
    note: (n: Note) => void
    reader: (keys: readonly string[]) => Promise<(string | null)[]>
    write: (key: string, raw: string) => void
    emit: (i: number, r: Result) => void
    runs: boolean
  }

  /** one unit through the chain: exactly one emit. Every translator is sent it with each word tied to a reference that
   *  abbreviates the item's name written as that name (names.ts), its row's sentences given back in the unit's projection */
  async function settle(u: UnitIn, i: number, c: Call): Promise<void> {
    let r: Result
    try {
      const named = namedOf(u)
      r = named ? named.back(await outcomeOf(named.unit, i, c)) : await outcomeOf(u, i, c)
    } catch {
      // (a fault of the chain's own: the unit is told unavailable, never a throw to the host, hard rule 3)
      r = { id: u.id, ok: false, why: { kind: 'unavailable' } }
    }
    c.emit(i, r)
  }

  async function outcomeOf(u: UnitIn, i: number, c: Call): Promise<Result> {
    if (!hasLetter(u)) return { id: u.id, ok: true, content: asOut(u.content), by: 'self' }
    // (what TeX sets after the unit's text: every translator asked for the unit without it, put back after the translation)
    const tail = tailOf(u)
    if (tail) {
      const r = await outcomeOf(tail.unit, i, c)
      return r.ok ? { ...r, content: [...r.content, ...tail.after] } : r
    }
    for (const s of c.skipped)
      c.note({ kind: 'passed', by: s.by, id: u.id, why: { kind: 'unconfigured', code: s.code } })
    if (!c.served.length)
      return { id: u.id, ok: false, why: { kind: 'unconfigured', code: c.offCodes[0] ?? 'no-language' } }
    // every translator's wire and key, and a markers-wire translator's references' (groups.ts referencesOf), read from the
    // store at once
    const wires = c.served.map((t) => {
      try {
        const wire = t.write(u, c.target)
        return { wire, key: keyOf(t, c.target, wire, c.context) }
      } catch {
        return null
      }
    })
    const groups = c.served.some((t) => t.wire === 'markers') ? referencesOf(u) : []
    const refWires = c.served.map((t) =>
      t.wire !== 'markers'
        ? []
        : groups.flatMap((g) => {
            try {
              const wire = t.write(g.unit, c.target)
              return [{ g, wire, key: keyOf(t, c.target, wire, c.context) }]
            } catch {
              return []
            }
          }),
    )
    const keys = [...wires.flatMap((w) => (w ? [w.key] : [])), ...refWires.flat().map((r) => r.key)]
    const stored = await c.reader(keys)
    const hit = new Map<string, string>()
    keys.forEach((k, j) => {
      const v = stored[j]
      if (typeof v === 'string') hit.set(k, v)
    })
    let refused = false
    let unavailable: number | null = null
    let off: UnconfiguredCode | null = null
    for (let k = 0; k < c.served.length; k++) {
      if (c.signal.aborted) return aborted(u)
      const t = c.served[k] as Translator
      const last = k === c.served.length - 1
      const wk = wires[k]
      const passed = (why: Why) => c.note({ kind: 'passed', by: t.identity, id: u.id, why })
      if (!wk) {
        refused = true
        passed({ kind: 'refused' })
        continue
      }
      const offNow = offs.get(t)
      if (offNow) {
        off ??= offNow
        passed({ kind: 'unconfigured', code: offNow })
        continue
      }
      const w = { seq: c.seq, index: i, last, note: c.note }
      // the references of its phrase groups (a markers-wire translator's alone): each stored, else asked in the unit's batch
      // (started right before the unit is asked, in the same turn), read as any reply is; one that fails places nothing. The
      // unit's reply is stored as it came, whatever they give
      const refs = refWires[k] ?? []
      let asked: Map<string, Promise<string | null>> | null = null
      const refText = (r: (typeof refs)[number], raw: string): string | null => {
        try {
          return referenceText(r.g.unit, t.read(r.g.unit, raw))
        } catch {
          return null
        }
      }
      const startRefs = () => {
        if (asked) return asked
        asked = new Map()
        for (const r of refs) {
          const got = hit.get(r.key)
          asked.set(
            r.g.id,
            got !== undefined
              ? Promise.resolve(refText(r, got))
              : ask(t, c.target, c.context, r.key, r.wire, false, w, c.signal).then((a) => {
                  const s = 'raw' in a ? refText(r, a.raw) : null
                  if (s !== null && 'raw' in a) c.write(r.key, a.raw)
                  return s
                }),
          )
        }
        return asked
      }
      /** the reply's content with each phrase group it did not bring back placed by its reference (groups.ts) */
      const placed = async (content: OutPiece[]): Promise<OutPiece[]> => {
        const ids = new Set(spanIdsOf(content))
        const missing = refs.filter((r) => !ids.has(r.g.id))
        if (!missing.length) return content
        try {
          const all = startRefs()
          const texts = new Map<string, string>()
          for (const r of missing) {
            const s = await all.get(r.g.id)
            if (s) texts.set(r.g.id, s)
          }
          return placeReferences(u, content, texts, c.target)
        } catch {
          return content
        }
      }
      // a stored reply, judged again as a fresh one is
      const raw = hit.get(wk.key)
      if (raw !== undefined) {
        const r = judge(u, t, raw)
        if (r)
          return {
            id: u.id,
            ok: true,
            content: await placed(r.content),
            by: t.identity,
            ...(r.sentences ? { sentences: r.sentences } : {}),
          }
      }
      const lane = laneOf(t)
      if (!last && shut(lane)) {
        unavailable = Math.max(unavailable ?? 0, 0)
        passed({ kind: 'unavailable' })
        continue
      }
      if (!last && coolingMs(lane) > 0) {
        const ms = coolingMs(lane)
        unavailable = Math.max(unavailable ?? 0, ms)
        passed({ kind: 'unavailable', retryAfterMs: ms })
        continue
      }
      let a: Answer = { unavailable: true }
      // (the chain's last translator waits a cooldown out, LAST_WAITS times at most; any other has been passed over above)
      for (let waits = 0; ; ) {
        const ms = coolingMs(lane)
        if (last && ms > 0) {
          if (waits >= LAST_WAITS) {
            a = { unavailable: true, retryAfterMs: ms, cooling: true }
            break
          }
          waits++
          await clock.sleep(ms, c.signal)
          if (c.signal.aborted) return aborted(u)
        }
        const pending = ask(t, c.target, c.context, wk.key, wk.wire, false, w, c.signal)
        // (the references go out in the unit's request: asked in this turn, after it)
        if (refs.length) startRefs()
        a = await pending
        if (!(last && 'cooling' in a && a.cooling) || waits >= LAST_WAITS) break
      }
      if ('aborted' in a) return aborted(u)
      if ('raw' in a) {
        const r = judge(u, t, a.raw)
        if (r) {
          c.write(wk.key, a.raw)
          return {
            id: u.id,
            ok: true,
            content: await placed(r.content),
            by: t.identity,
            ...(r.sentences ? { sentences: r.sentences } : {}),
          }
        }
        // the re-ask: once, alone, by the same translator
        if (t.limits.reask === 1) {
          const again = await ask(t, c.target, c.context, wk.key, wk.wire, true, w, c.signal)
          if ('aborted' in again) return aborted(u)
          if ('raw' in again) {
            const r2 = judge(u, t, again.raw)
            if (r2) {
              c.write(wk.key, again.raw)
              return {
                id: u.id,
                ok: true,
                content: await placed(r2.content),
                by: t.identity,
                ...(r2.sentences ? { sentences: r2.sentences } : {}),
              }
            }
          }
        }
        refused = true
        passed({ kind: 'refused' })
        continue
      }
      if ('refused' in a) {
        refused = true
        passed({ kind: 'refused' })
        continue
      }
      if ('off' in a) {
        off ??= a.off
        passed({ kind: 'unconfigured', code: a.off })
        continue
      }
      unavailable = Math.max(unavailable ?? 0, a.retryAfterMs ?? 0)
      passed(a.retryAfterMs ? { kind: 'unavailable', retryAfterMs: a.retryAfterMs } : { kind: 'unavailable' })
    }
    if (refused && c.runs) {
      const floor = await runsFloor(u, i, c)
      if (floor) return floor
    }
    if (unavailable !== null)
      return {
        id: u.id,
        ok: false,
        why: unavailable > 0 ? { kind: 'unavailable', retryAfterMs: unavailable } : { kind: 'unavailable' },
      }
    if (refused) return { id: u.id, ok: false, why: { kind: 'refused' } }
    return { id: u.id, ok: false, why: { kind: 'unconfigured', code: off ?? c.offCodes[0] ?? 'no-language' } }
  }

  /** the runs floor: each stretch through the whole chain as a unit of its own; null when it gives nothing to show, or not
   *  every stretch */
  async function runsFloor(u: UnitIn, i: number, c: Call): Promise<Result | null> {
    const { parts, join } = runsOf(u)
    const asked = parts.map((p, k) => (p.send ? k : -1)).filter((k) => k >= 0)
    if (!asked.length) return null
    const outs = await Promise.all(
      asked.map((k) => {
        const part = parts[k] as (typeof parts)[number]
        const unit: UnitIn = { id: `${u.id}~${k}`, content: [{ t: 'text', s: part.text }] }
        return outcomeOf(unit, i, { ...c, runs: false })
      }),
    )
    if (outs.some((r) => !r.ok && r.why.kind === 'aborted')) return aborted(u)
    if (outs.some((r) => !r.ok && r.why.kind === 'unavailable')) {
      const ms = Math.max(
        0,
        ...outs.map((r) => (!r.ok && r.why.kind === 'unavailable' ? (r.why.retryAfterMs ?? 0) : 0)),
      )
      return { id: u.id, ok: false, why: ms > 0 ? { kind: 'unavailable', retryAfterMs: ms } : { kind: 'unavailable' } }
    }
    // (every stretch asked or none: a stretch every translator refused would keep its English between translated ones, a unit
    // half translated, drawn as a translation (PDF-READER §18.21: translating or keeping is fine, garbling never);
    // refused, the unit stays the original's)
    if (outs.some((r) => !r.ok)) return null
    const tr: (string | null)[] = parts.map(() => null)
    const by = new Set<string>()
    outs.forEach((r, j) => {
      if (!r.ok) return
      tr[asked[j] as number] = r.content.map((p) => (p.t === 'text' ? p.s : '')).join('')
      by.add(r.by)
    })
    if (!by.size) return null
    const joined = join(tr)
    if (!accept(u, joined).ok) return null
    const content = placeGroups(u, joined)
    return { id: u.id, ok: true, content, by: by.size === 1 ? `runs:${[...by][0]}` : 'runs:mixed' }
  }

  /** a raw reply read and accepted, its sentences kept only where they reconstruct; null where refused */
  function judge(u: UnitIn, t: Translator, raw: string): { content: OutPiece[]; sentences?: Sentences } | null {
    let r: ReturnType<Translator['read']>
    try {
      r = t.read(u, raw)
    } catch {
      return null
    }
    if (!r || !Array.isArray(r.content) || !accept(u, r.content).ok) return null
    // (a group the reply did not bring back, around its own text where the translation states it; its projection the same)
    const content = placeGroups(u, r.content)
    return r.sentences && u.sentences && validSentences(u, content, r.sentences)
      ? { content, sentences: r.sentences }
      : { content }
  }
}

/** the ids of a content's spans, at any depth, that hold text */
function spanIdsOf(ps: readonly OutPiece[], out: string[] = []): string[] {
  for (const p of ps)
    if (p.t === 'span') {
      if (p.content.some((q) => q.t === 'text' && /\S/.test(q.s)) || p.content.some((q) => q.t === 'span'))
        out.push(p.id)
      spanIdsOf(p.content, out)
    }
  return out
}

/** a unit's elements TeX sets after its text (`after`: the PDF's backref list after a bibliography entry), wherever its
 *  groups hold them: the unit without them, which is what every translator is asked for, and what goes after its translation,
 *  each with the white space it states before it. Null for a unit with none. A translator never sees them: on the markers
 *  wire such a list was a marker Microsoft's Chinese read as a page number, writing the character for "page" before it
 *  (2610.37668v1, 5 of 41 entries; today's wire, mt.mjs listOf, TRANSLATE_VERSION 7) */
function tailOf(u: UnitIn): { unit: UnitIn; after: OutPiece[] } | null {
  const after: OutPiece[] = []
  const keep = (ps: readonly Piece[]): Piece[] =>
    ps.flatMap((p): Piece[] => {
      if (p.t === 'el' && p.after !== undefined) {
        if (p.after) after.push({ t: 'text', s: p.after })
        after.push({ t: 'el', id: p.id })
        return []
      }
      return p.t === 'span' ? [{ ...p, content: keep(p.content) }] : [p]
    })
  const content = keep(u.content)
  return after.length ? { unit: { ...u, content }, after } : null
}

const aborted = (u: UnitIn): Result => ({ id: u.id, ok: false, why: { kind: 'aborted' } })
const NEVER: Signal = { aborted: false, addEventListener() {}, removeEventListener() {} }
const safely = (f: () => void) => {
  try {
    f()
  } catch {
    // a host's note that throws changes nothing of the chain's
  }
}

/** a caller's bug, refused before any work: an empty chain, two units of one id, an element or span id twice in a unit */
function checkCall(units: readonly UnitIn[], translators: readonly Translator[]) {
  if (!translators.length) throw new TypeError('translate: no translator')
  const ids = new Set<string>()
  for (const u of units) {
    if (ids.has(u.id)) throw new TypeError(`translate: two units of id ${u.id}`)
    ids.add(u.id)
    const local = new Set<string>()
    const walk = (ps: readonly Piece[]) => {
      for (const p of ps) {
        if (p.t === 'text') continue
        if (local.has(p.id)) throw new TypeError(`translate: the id ${p.id} twice in unit ${u.id}`)
        local.add(p.id)
        if (p.t === 'span') walk(p.content)
      }
    }
    walk(u.content)
  }
}

/** The store read in bulk: the keys asked in one turn go in one read, bounded, and a store that fails, hangs or answers
 *  what is no string list is all misses */
function readerOf(store: Store | undefined, clock: Clock): (keys: readonly string[]) => Promise<(string | null)[]> {
  if (!store) return async (keys) => keys.map(() => null)
  let pending: { keys: string[]; done: Promise<Map<string, string | null>> } | null = null
  return async (keys) => {
    if (!keys.length) return []
    if (!pending) {
      const batch: string[] = []
      const done = Promise.resolve().then(async () => {
        pending = null
        const unique = [...new Set(batch)]
        const got = await within(clock, store.read(unique), STORE_READ_MS, null)
        const m = new Map<string, string | null>()
        unique.forEach((k, j) => {
          const v = Array.isArray(got) ? got[j] : null
          m.set(k, typeof v === 'string' ? v : null)
        })
        return m
      })
      pending = { keys: batch, done }
    }
    const p = pending
    p.keys.push(...keys)
    const m = await p.done
    return keys.map((k) => m.get(k) ?? null)
  }
}
/** a write that never throws and is given STORE_WRITE_MS */
const flush = (store: Store, entries: [string, string][], clock: Clock): Promise<void> =>
  within(
    clock,
    store.write(entries).then(() => undefined),
    STORE_WRITE_MS,
    undefined,
  )
