// Fake translators (an echo, manglers, scripted faults) and a scripted fetch: every reply a test sees is written here or
// recorded beside it, never fetched.
import { asOut } from '../accept.ts'
import type {
  Clock,
  Fault,
  Fetch,
  FetchInit,
  FetchReply,
  Lang,
  Limits,
  OutPiece,
  Piece,
  Sentences,
  Signal,
  Translator,
  UnitIn,
} from '../contract.ts'
import { sha256Hex } from '../sha256.ts'

export const FAKE_LIMITS: Limits = { chars: 2_000, units: 100, inFlight: 4, callMs: 10_000, reask: 0 }

/** What a fake endpoint does with the n-th request (from 1): answer it, fail it, answer late, or never */
export type Behaviour =
  /** yield the first `after` replies (default none), then throw */
  | { fault: Fault; after?: number }
  /** never answer, until the request's signal aborts */
  | { hang: true }
  /** answer after `ms` on the clock given to the fake */
  | { delayMs: number }
  /** answer every unit but these indices, then end */
  | { missing: readonly number[] }

export interface FakeOptions {
  identity: string
  limits?: Partial<Limits>
  context?: boolean
  supports?: (target: Lang) => boolean | Promise<boolean>
  /** the content the fake endpoint sends back for a unit's content (default: the unit's, an echo) */
  reply?: (content: OutPiece[], target: Lang) => OutPiece[]
  /** the sentences it sends back with a unit, where it does */
  sentences?: (content: OutPiece[]) => Sentences | undefined
  script?: (call: { n: number; wires: readonly string[]; target: Lang }) => Behaviour | undefined
  /** the clock a `delayMs` behaviour sleeps on */
  clock?: Clock
}

export interface FakeTranslator extends Translator {
  /** every request, in order: its wires */
  readonly calls: (readonly string[])[]
  /** how many times a unit's content was sent, in all requests */
  sent(unit: UnitIn): number
  /** set true, `read` refuses every raw: a reading turned strict */
  strict: boolean
}

const wireOf = (unit: UnitIn): string => JSON.stringify(unit.content)

/** A translator whose wire is the unit's content as JSON and whose raw reply is `{ content, sentences? }` */
export function fakeTranslator(o: FakeOptions): FakeTranslator {
  const calls: (readonly string[])[] = []
  const limits: Limits = { ...FAKE_LIMITS, ...o.limits }
  const fake: FakeTranslator = {
    identity: o.identity,
    digest: sha256Hex(`fake|${o.identity}`),
    context: o.context ?? false,
    limits,
    calls,
    strict: false,
    sent: (unit) => calls.reduce((n, ws) => n + ws.filter((w) => w === wireOf(unit)).length, 0),
    supports: async (target) => (o.supports ? await o.supports(target) : true),
    write: wireOf,
    async *send(wires, call, signal) {
      calls.push([...wires])
      const behaviour = o.script?.({ n: calls.length, wires, target: call.target })
      if (behaviour && 'hang' in behaviour) {
        await new Promise<void>((resolve) =>
          signal.aborted ? resolve() : signal.addEventListener('abort', () => resolve(), { once: true }),
        )
        return
      }
      if (behaviour && 'delayMs' in behaviour) {
        if (!o.clock) throw new Error('a delayed fake needs a clock')
        await o.clock.sleep(behaviour.delayMs, signal)
        if (signal.aborted) return
      }
      const missing = behaviour && 'missing' in behaviour ? new Set(behaviour.missing) : new Set<number>()
      const after = behaviour && 'fault' in behaviour ? (behaviour.after ?? 0) : wires.length
      for (let i = 0; i < wires.length; i++) {
        if (i >= after) break
        if (missing.has(i)) continue
        const content = asOut(JSON.parse(wires[i] as string) as Piece[])
        const out = o.reply ? o.reply(content, call.target) : content
        const sentences = o.sentences?.(out)
        yield [i, JSON.stringify(sentences ? { content: out, sentences } : { content: out })] as const
      }
      if (behaviour && 'fault' in behaviour) throw behaviour.fault
    },
    read(_unit, raw) {
      if (fake.strict) return null
      try {
        const r = JSON.parse(raw) as { content?: unknown; sentences?: Sentences }
        if (!Array.isArray(r.content)) return null
        return r.sentences
          ? { content: r.content as OutPiece[], sentences: r.sentences }
          : { content: r.content as OutPiece[] }
      } catch {
        return null
      }
    },
  }
  return fake
}

/** gives every unit back as it is */
export const echo = (identity = 'echo:0', o: Omit<FakeOptions, 'identity'> = {}): FakeTranslator =>
  fakeTranslator({ identity, ...o })

/** Ways a reply loses what acceptance holds to, one each: an element dropped, doubled, foreign or renamed; a `must` span
 *  dropped; a span that is not `must` dropped (accepted, unstyled); a control character; the text cut under the floor */
export type Mangling =
  | 'drop-el'
  | 'double-el'
  | 'foreign-el'
  | 'rename-el'
  | 'drop-must'
  | 'drop-span'
  | 'control'
  | 'cut'
const firstEl = (out: OutPiece[]): number => out.findIndex((p) => p.t === 'el')
const mapSpans = (out: OutPiece[], f: (p: Extract<OutPiece, { t: 'span' }>) => OutPiece[]): OutPiece[] =>
  out.flatMap((p) => (p.t === 'span' ? f({ ...p, content: mapSpans(p.content, f) }) : [p]))
export function mangle(how: Mangling, out: OutPiece[]): OutPiece[] {
  const k = firstEl(out)
  switch (how) {
    case 'drop-el':
      return k < 0 ? out : out.filter((_, i) => i !== k)
    case 'double-el':
      return k < 0 ? out : [...out, out[k] as OutPiece]
    case 'foreign-el':
      return k < 0 ? out : [...out, { t: 'el', id: 'foreign' }]
    case 'rename-el':
      return k < 0 ? out : out.map((p, i) => (i === k ? { t: 'el', id: `${(p as { id: string }).id}x` } : p))
    case 'drop-must':
    case 'drop-span':
      return mapSpans(out, (p) => p.content)
    case 'control':
      return [...out, { t: 'text', s: '\u0007' }]
    case 'cut':
      return out.map((p) => (p.t === 'text' ? { t: 'text', s: p.s.slice(0, Math.floor(p.s.length / 10)) } : p))
  }
}
/** a translator whose replies are mangled one way, its units' other content echoed */
export const mangler = (
  how: Mangling,
  identity = `mangle-${how}:0`,
  o: Omit<FakeOptions, 'identity' | 'reply'> = {},
): FakeTranslator => fakeTranslator({ identity, ...o, reply: (out) => mangle(how, out) })

// ---------------------------------------------------------------- a scripted fetch

export type Scripted =
  | { status: number; body: string; headers?: Record<string, string> }
  /** the network fails: fetch rejects */
  | { network: true }
  /** never answers until the request's signal aborts */
  | { hang: true }
export interface ScriptedFetch {
  readonly fetch: Fetch
  readonly requests: { url: string; init: FetchInit }[]
}
/** A fetch whose n-th request (from 1) is answered by `answer`; an aborted request rejects with an AbortError */
export function scriptedFetch(answer: (url: string, init: FetchInit, n: number) => Scripted): ScriptedFetch {
  const requests: { url: string; init: FetchInit }[] = []
  const abortError = () => Object.assign(new Error('the request was aborted'), { name: 'AbortError' })
  const fetch: Fetch = async (url, init) => {
    requests.push({ url, init })
    if (init.signal.aborted) throw abortError()
    const a = answer(url, init, requests.length)
    if ('network' in a) throw new TypeError('fetch failed')
    if ('hang' in a) {
      await new Promise<void>((resolve) => init.signal.addEventListener('abort', () => resolve(), { once: true }))
      throw abortError()
    }
    const headers = new Map(Object.entries(a.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    const reply: FetchReply = {
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
      text: async () => a.body,
    }
    return reply
  }
  return { fetch, requests }
}

/** an AbortSignal-shaped object that never aborts, for calling an adapter's send by hand */
export const NEVER: Signal = { aborted: false, addEventListener() {}, removeEventListener() {} }
