// The LLM translator: a language model asked over a host's transport. The engine names no gateway, holds no key and
// counts no money: the host gives the request's URL, a `Fetch` it wraps with its own headers and token, and a `Spend` port
// it answers from its ledger. Every request is reserved before it is sent and settled once after; no answer from the
// port is no request. The request shapes are llm-shapes.ts's, the wire llm-wire.ts's, a refusal read by refusals.ts.
//
// Requests multiply where layers retry. A request that is sent and gets no answer is sent at most twice: each such fault
// carries `tries: 2`, and this adapter's own timer ends the wait before the chain's (`callMs`), whether or not the host's
// transport heeds the abort, so the chain's own timeout (3 tries) never decides. A refusal the ledger acts on (slow,
// spent, a key) is asked again, the batch whole, once the ledger has taken its settlement (within SPEND_MS), through the
// ledger, which picks another key or holds it: at most two requests a `send`, never one a unit. A second such refusal, the
// ledger's hold, or a settlement not taken in time is a pause past the chain's patience, so the units come back
// unavailable and the host asks them again in whole batches.
//
// The identity names who answers, not the route: the entry's `provider`, `upstream`, `shape` and `model` are hashed, the
// URL is not. The URL is the host's (its account and its gateway's names, which no identity of this repository holds, and
// a route's rename must not ask every row again); a deployment that answers otherwise under the same model name is
// another `provider`, a custom provider's name, never the same name pointed elsewhere.
import { ATTEMPTS, realClock } from '../chain.ts'
import {
  Fault,
  type Clock,
  type Fetch,
  type FetchReply,
  type Limits,
  type Signal,
  type Translator,
} from '../contract.ts'
import { bodyShapeOf, type Refusal, refusalOf } from '../refusals.ts'
import { sha256Hex } from '../sha256.ts'
import {
  bodyOf,
  CONTEXT_RULE,
  headersOf,
  type LlmEntry,
  LLM_TARGETS,
  maxTokensOf,
  PROMPT_DIGEST,
  replyOf,
  systemOf,
  type Usage,
} from './llm-shapes.ts'
import { LLM_WIRE_DIGEST, readTyped, writeTyped } from './llm-wire.ts'

/** what a request may spend, the host's (its ledger): asked before every request, told after */
export interface Spend {
  reserve(ask: { inTokens: number; maxTokens: number; hash: string }, signal: Signal): Promise<Ticket | Held>
  settle(id: string, outcome: Settlement): Promise<void>
}
/** yes: the reservation's id, and the headers the host wants on this request (the key's alias) */
export type Ticket = { ok: true; id: string; headers: Readonly<Record<string, string>> }
/** no: ask again after this long */
export type Held = { ok: false; retryAfterMs: number }
/** what a reservation is settled with: the reported usage, the refusal, no answer (`unknown`: it may have reached the
 *  model), or nothing sent (`unsent`: a ticket granted after this adapter stopped waiting for it, which no request used) */
export type Settlement =
  | { usage: Usage; upstream: string | null }
  | { refusal: Refusal }
  | { unknown: true }
  | { unsent: true }
export interface LlmOptions {
  entry: LlmEntry
  /** the request's URL, whole: the host's (the engine names no gateway) */
  url: string
  fetch: Fetch
  spend: Spend
  limits?: Partial<Pick<Limits, 'inFlight' | 'callMs'>>
  /** the clock this adapter's own timers run on (the spend port's wait, the request's): the platform's by default */
  clock?: Clock
}

/** starting values from the 11-06 LLM probe ("about 2,500–4,000 characters a request, three or four in flight"); `chars`
 *  and `units` are in the identity, `inFlight` and `callMs` the host's */
export const LLM_LIMITS: Limits = Object.freeze({ chars: 3_000, units: 40, inFlight: 3, callMs: 60_000, reask: 1 })
/** a reserve not answered within this is no answer: no request */
export const SPEND_MS = 2_000
/** where the spend port did not answer: the wait before it is asked again */
export const SPEND_DOWN_MS = 60_000
/** this adapter's own timer ends a request this long before the chain's `callMs` would (at most half of it) */
const AHEAD_MS = 5_000
/** requests a `send` makes at most: one, and one more, the batch whole, after a refusal the ledger now knows */
const REQUESTS = 2

/** a value as JSON with its objects' keys sorted: two entries that differ only in a key's order are one */
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : typeof v === 'object' && v !== null
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
        )
      : v

/** `llm:<16 hex>` of what can change the text: who answers (provider, upstream, shape, model) and how it is asked (json,
 *  reasoning, sampling), the prompt's, the wire's and the context rule's versions, the batching and the output limit's
 *  rule; never the URL (the host's route), a key, a price or a check */
export function llmIdentityOf(entry: LlmEntry): string {
  const fields = [
    entry.provider,
    entry.model,
    entry.upstream ?? null,
    entry.shape,
    entry.json,
    entry.reasoning ?? null,
    entry.sampling ?? null,
    PROMPT_DIGEST,
    LLM_WIRE_DIGEST,
    CONTEXT_RULE,
    LLM_LIMITS.chars,
    LLM_LIMITS.units,
    ['max_tokens', maxTokensOf(0), maxTokensOf(Number.MAX_SAFE_INTEGER)],
  ]
  return `llm:${sha256Hex(JSON.stringify(canonical(fields))).slice(0, 16)}`
}

/** a string's UTF-8 length: a bound of a byte-level tokenizer's count (a bound, not a count: a reservation is settled to
 *  the reported usage) */
function utf8Length(s: string): number {
  let n = 0
  for (const c of s) {
    const cp = c.codePointAt(0) as number
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
  }
  return n
}

interface Controller {
  readonly signal: Signal
  abort(reason?: unknown): void
}
const controller = (): Controller =>
  new (globalThis as unknown as { AbortController: new () => Controller }).AbortController()

/** a promise that settles when the signal aborts, and the way to stop listening */
const whenAborted = (signal: Signal): { done: Promise<void>; off: () => void } => {
  let off = () => {}
  const done = new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const go = () => resolve()
    signal.addEventListener('abort', go, { once: true })
    off = () => signal.removeEventListener('abort', go)
  })
  return { done, off }
}

const isTicket = (v: unknown): v is Ticket =>
  typeof v === 'object' &&
  v !== null &&
  (v as Ticket).ok === true &&
  typeof (v as Ticket).id === 'string' &&
  typeof (v as Ticket).headers === 'object' &&
  (v as Ticket).headers !== null
const isHeld = (v: unknown): v is Held => typeof v === 'object' && v !== null && (v as Held).ok === false

/** a promise raced against a signal: its value, or null once the signal aborts. A transport that does not heed the abort
 *  is left behind: its late value or failure is taken by the race and changes nothing */
const until = async <T>(p: Promise<T>, signal: Signal): Promise<{ v: T } | null> => {
  const aborted = whenAborted(signal)
  try {
    return await Promise.race([p.then((v) => ({ v })), aborted.done.then(() => null)])
  } finally {
    aborted.off()
  }
}

/** a 2xx body that holds only an error object, and the status it names (OpenRouter's errors page: a request not streamed
 *  that fails after the reply's headers is a 200 whose body holds `error` and no choices, its `code` the HTTP status);
 *  null for any other body */
function errorStatusOf(text: string, status: number): number | null {
  let b: unknown
  try {
    b = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return null
  const body = b as Record<string, unknown>
  if (typeof body.error !== 'object' || body.error === null || 'choices' in body || 'content' in body) return null
  const code = (body.error as Record<string, unknown>).code
  return typeof code === 'number' && Number.isInteger(code) && code >= 400 && code <= 599 ? code : status
}

export function llm(o: LlmOptions): Translator {
  const clock = o.clock ?? realClock()
  const limits: Limits = { ...LLM_LIMITS, ...o.limits }
  const shape = o.entry.shape
  const identity = llmIdentityOf(o.entry)
  /** a pause the chain's last translator does not wait out (chain.ts patienceOf: ATTEMPTS tries of its `callMs`), so its
   *  units come back unavailable rather than asked again one at a time */
  const pastPatience = ATTEMPTS * limits.callMs + 1
  /** settled once; resolves true once the ledger has taken it, false where it failed (never rejects). Waited on only before
   *  a refused batch is asked again: the ledger answers that reserve from what it knows, the refusal too */
  const settler = (id: string) => {
    let done = false
    return (outcome: Settlement): Promise<boolean> => {
      if (done) return Promise.resolve(false)
      done = true
      return Promise.resolve()
        .then(() => o.spend.settle(id, outcome))
        .then(
          () => true,
          () => false,
        )
    }
  }
  /** a settlement's end within SPEND_MS, or before the signal aborts: true only where the ledger took it */
  async function taken(settled: Promise<boolean>, signal: Signal): Promise<boolean> {
    const wait = controller()
    const aborted = whenAborted(signal)
    const got = await Promise.race([
      settled,
      clock.sleep(SPEND_MS, wait.signal).then(() => false),
      aborted.done.then(() => false),
    ])
    wait.abort()
    aborted.off()
    return got
  }

  /** the spend port's answer within SPEND_MS: a ticket, or a Fault (held: a pause past the chain's patience; no answer: no
   *  request) */
  async function reserve(ask: { inTokens: number; maxTokens: number; hash: string }, signal: Signal): Promise<Ticket> {
    const asked = Promise.resolve().then(() => o.spend.reserve(ask, signal))
    const wait = controller()
    const aborted = whenAborted(signal)
    const got = await Promise.race([
      asked.then(
        (v) => ({ v }),
        () => ({ failed: true as const }),
      ),
      clock.sleep(SPEND_MS, wait.signal).then(() => ({ late: true as const })),
      aborted.done.then(() => ({ late: true as const })),
    ])
    wait.abort()
    aborted.off()
    if ('v' in got && isTicket(got.v)) return got.v
    if ('v' in got && isHeld(got.v)) {
      const ms = got.v.retryAfterMs
      throw new Fault('cool', 'rate', 'llm: the ledger holds the request', {
        retryAfterMs: Math.max(Number.isFinite(ms) && ms >= 0 ? ms : SPEND_DOWN_MS, pastPatience),
      })
    }
    // (a ticket that comes after the wait is held by nobody: given back unsent as it arrives)
    if ('late' in got)
      void asked.then((v) => (isTicket(v) ? settler(v.id)({ unsent: true }) : undefined)).catch(() => {})
    if (signal.aborted) throw new Fault('abort', 'aborted', 'llm: aborted')
    throw new Fault('cool', 'rate', 'llm: no answer from the ledger', { retryAfterMs: SPEND_DOWN_MS })
  }

  return {
    identity,
    digest: LLM_WIRE_DIGEST,
    context: true,
    wire: 'tags',
    limits,
    supports: async (target) => Object.hasOwn(LLM_TARGETS, target),
    write: (unit) => writeTyped(unit),
    read: readTyped,
    async *send(wires, call, signal) {
      let system: string
      try {
        const c = call.context
        system = systemOf(call.target, c ? { title: c.title, abstract: c.abstract } : undefined)
      } catch {
        throw new Fault('pass', 'unsupported', `llm: no prompt for ${call.target}`)
      }
      const maxTokens = maxTokensOf(wires.reduce((n, w) => n + w.length, 0))
      const body = bodyOf(o.entry, { system, units: wires.map((text, i) => ({ id: String(i), text })), maxTokens })
      const ask = { inTokens: utf8Length(body), maxTokens, hash: sha256Hex(body) }
      // the request's own signal: the call's, or this adapter's timer, before the chain's
      const own = controller()
      const forward = () => own.abort()
      signal.addEventListener('abort', forward, { once: true })
      if (signal.aborted) own.abort()
      const timer = controller()
      let timedOut = false
      void clock.sleep(limits.callMs - Math.min(AHEAD_MS, limits.callMs / 2), timer.signal).then(() => {
        if (timer.signal.aborted) return
        timedOut = true
        own.abort()
      })
      /** the fault of a wait the signal ended: the call's abort, or this adapter's timer */
      const ended = (what: string): Fault =>
        signal.aborted
          ? new Fault('abort', 'aborted', 'llm: aborted')
          : new Fault('again', 'timeout', `llm: ${what} within ${limits.callMs} ms`, { tries: 2 })
      try {
        for (let sent = 1; ; sent++) {
          let ticket: Ticket
          try {
            ticket = await reserve(ask, own.signal)
          } catch (e) {
            if (signal.aborted || timedOut) throw ended('no answer from the ledger')
            throw e
          }
          const settle = settler(ticket.id)
          let reply: FetchReply
          let text: string
          try {
            const got = await until(
              o.fetch(o.url, {
                method: 'POST',
                headers: { ...headersOf(shape), ...ticket.headers },
                body,
                signal: own.signal,
              }),
              own.signal,
            )
            const read = got && (await until(got.v.text(), own.signal))
            if (!got || !read) throw ended('no answer')
            reply = got.v
            text = read.v
          } catch (e) {
            // (it may have reached the model: its reservation is kept whole until its window ends)
            settle({ unknown: true })
            if (e instanceof Fault) throw e
            if (signal.aborted || timedOut) throw ended('no answer')
            throw new Fault('again', 'network', 'llm: the request failed', { tries: 2 })
          }
          const status = reply.ok ? errorStatusOf(text, reply.status) : reply.status
          if (status !== null) {
            const refusal = refusalOf({
              status,
              body: text,
              retryAfter: reply.headers.get('retry-after'),
              now: clock.now(),
            })
            const settled = settle({ refusal })
            const what = `llm: ${reply.status}${status !== reply.status ? ` (${status})` : ''} ${refusal.class} (${refusal.who}${refusal.code ? ` ${refusal.code}` : ''}) ${bodyShapeOf(text)}`
            switch (refusal.class) {
              case 'slow':
              case 'spent':
              case 'key': {
                // (asked again, the batch whole, once the ledger has taken the refusal: it gives another key or holds.
                // A ledger that has not taken it within SPEND_MS would answer the refused key again: no request)
                if (sent < REQUESTS) {
                  const known = await taken(settled, own.signal)
                  if (signal.aborted || timedOut) throw ended('no answer from the ledger')
                  if (known) continue
                }
                throw new Fault('cool', 'rate', what, {
                  retryAfterMs: Math.max(refusal.retryAfterMs ?? 0, pastPatience),
                })
              }
              case 'request':
                throw new Fault('off', 'model', what)
              case 'ours':
                throw new Fault('off', 'no-key', what)
              case 'size':
              case 'content':
                throw new Fault('pass', 'too-large', what)
              default:
                throw new Fault('again', 'network', what, { tries: 2 })
            }
          }
          const r = replyOf(shape, text)
          settle(r.usage ? { usage: r.usage, upstream: r.upstream } : { unknown: true })
          if (r.stop === 'length') throw new Fault('pass', 'too-large', 'llm: the reply stopped at its token limit')
          // (the model declined the text: split like a request too large, so a lone unit so refused is passed on)
          if (r.stop === 'refusal') throw new Fault('pass', 'too-large', 'llm: the model refused the text')
          if (!r.units)
            throw new Fault('again', 'malformed', `llm: no units in the reply ${bodyShapeOf(text)}`, { tries: 2 })
          for (let i = 0; i < wires.length; i++) {
            const said = r.units.get(String(i))
            if (said !== undefined) yield [i, said] as const
          }
          return
        }
      } finally {
        timer.abort()
        signal.removeEventListener('abort', forward)
      }
    },
  }
}
