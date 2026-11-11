// What a keyless HTTP endpoint's failure is, as a remedy (design-b §1.2): only the adapter knows whether a 403 is a key
// refused or a free endpoint's passing refusal (ext-providers-config §6: a keyless engine's 403 was wrongly treated as
// permanent). Measured amplifications avoided (§16): a 4xx is never retried on the backoff (a 400 bound to fail, retried
// and split, made dozens of requests); a malformed reply is the endpoint's, asked once more and never split (4 → 40); a 400
// that names no size is never split either (#636: 100 units were 199 requests).
import { Fault, type FetchReply, type Signal } from '../contract.ts'

/** a Retry-After header in milliseconds: seconds, or an HTTP date */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const s = Number(value)
  if (Number.isFinite(s) && s >= 0) return Math.round(s * 1000)
  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}

/** a reply that is not 2xx, as its remedy. `cap`: the words of the endpoint's own 400 for a request over its stated cap,
 *  where it states one */
export async function faultOfReply(
  name: string,
  reply: FetchReply,
  o: { keyed?: boolean; cap?: RegExp } = {},
): Promise<Fault> {
  const keyed = o.keyed === true
  const detail = (await reply.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
  const what = `${name}: ${reply.status}${detail ? ` ${detail}` : ''}`
  const s = reply.status
  if (s === 429) {
    const ms = retryAfterMs(reply.headers.get('retry-after'))
    return new Fault('cool', 'rate', what, ms === undefined ? {} : { retryAfterMs: ms })
  }
  if (s === 401 || s === 403)
    return keyed ? new Fault('off', s === 401 ? 'no-key' : 'key-refused', what) : new Fault('again', 'network', what)
  if (s === 408) return new Fault('again', 'timeout', what)
  // a request the endpoint says is too large: a 413 by its definition, a 400 only in the words of the endpoint's stated cap;
  // any other 400 is the request's shape (a parameter, a key refused), the same at any size: handed on whole (#636)
  if (s === 413 || (s === 400 && o.cap?.test(detail))) return new Fault('pass', 'too-large', what)
  if (s === 400) return new Fault('pass', 'malformed', what)
  if (s >= 500) return new Fault('again', s === 503 ? 'overload' : 'network', what)
  return new Fault('pass', 'malformed', what)
}

/** a fetch or a read that threw: the request's own abort, a Fault already named, else the network */
export function faultOfThrow(name: string, e: unknown, signal: Signal): Fault {
  if (e instanceof Fault) return e
  if (signal.aborted || (e as { name?: unknown })?.name === 'AbortError')
    return new Fault('abort', 'aborted', `${name}: aborted`)
  return new Fault('again', 'network', `${name}: ${String((e as Error)?.message ?? e)}`)
}

/** JSON, or null where it is none */
export function readJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
