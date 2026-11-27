// A model request's refusal, classified (DESIGN §8, a host's LLM translator): read from the pair (who answered, its code),
// never from the HTTP status alone, since one status is several classes (a 400 is a key, our fault or the request's,
// by who said it and with which code; a 403 a key or the text's content). A host's ledger acts on the class; nothing
// unclear is read as "spent for the day", and no answer about one text disables a key. Pure: no I/O, no clock but the
// `now` given.
//
// How each row is known (`known`): "observed" rows were seen on the staging AI Gateway with Anthropic (2026-11-27);
// "documented" rows are read in documentation only, each named by its page below; "neither" is the fallback of a row
// nobody states.

/** what a host does next with a refused request: wait (`slow`), stop spending until the cap moves (`spent`), stop the key
 *  (`key`), stop the entry (`request`), fix its own setup (`ours`), try again (`down`, `unclear`); `size`: the request is
 *  larger than the model takes, and `content`: the model, or a filter in front of it, declined the text (each split by the
 *  chain, never the key's nor the spend's) */
export type RefusalClass = 'slow' | 'spent' | 'key' | 'request' | 'ours' | 'down' | 'unclear' | 'size' | 'content'
export interface Refusal {
  class: RefusalClass
  /** who answered, read from the body's shape: the gateway's `{ success, error: [{ code, message }] }`, a provider's
   *  `{ error: { … } }` */
  who: 'gateway' | 'provider' | 'none'
  code: string | null
  retryAfterMs: number | null
  /** how this row of the table is known: seen on the staging gateway, or read in documentation only */
  known: 'observed' | 'documented' | 'neither'
}

/** the pause of a 429 that names no retry-after, the gateway's or a provider's: a rate limit waits it out, and a spend
 *  cap raised recovers by itself at its end (`spent` is kept for an answer that says so) */
export const DEFAULT_PAUSE_MS = 15 * 60_000

/** a code a refusal may carry: a short name or number, never a sentence of the body */
const CODE = /^[A-Za-z0-9_.-]{1,64}$/
const codeOf = (v: unknown): string | null => {
  const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v : null
  return s !== null && CODE.test(s) ? s : null
}

const json = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** a Retry-After header in milliseconds: seconds, or an HTTP date read against `now` */
function retryAfterOf(value: string | null, now: number): number | null {
  if (value === null || value.trim() === '') return null
  const s = Number(value)
  if (Number.isFinite(s) && s >= 0) return Math.round(s * 1000)
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}

interface Said {
  who: Refusal['who']
  code: string | null
  /** Anthropic's `error.details.error_code`, or OpenRouter's typed code `error.metadata.error_type` */
  detail: string | null
  /** OpenRouter's moderation metadata (`reasons`, `flagged_input`): the input was flagged */
  flagged: boolean
}
const NONE: Said = { who: 'none', code: null, detail: null, flagged: false }

/** who answered, and the code it names: the gateway's first error's `code`; a provider's `error.type` (Anthropic) or
 *  `error.code` (OpenRouter, the HTTP status again) */
function whoOf(body: string): Said {
  const b = json(body)
  if (!isObject(b)) return NONE
  if (b.success === false && Array.isArray(b.error)) {
    const first = b.error[0]
    return { ...NONE, who: 'gateway', code: isObject(first) ? codeOf(first.code) : null }
  }
  if (isObject(b.error)) {
    const e = b.error
    const m = isObject(e.metadata) ? e.metadata : {}
    const detail = (isObject(e.details) ? codeOf(e.details.error_code) : null) ?? codeOf(m.error_type)
    const flagged = Array.isArray(m.reasons) || 'flagged_input' in m
    return { who: 'provider', code: codeOf(e.type) ?? codeOf(e.code), detail, flagged }
  }
  return NONE
}

const DOWN = new Set([408, 500, 502, 503, 504, 529])

/** a reply that is not 2xx, or no reply (`status: null`: the network, a timeout), as its class */
export function refusalOf(o: { status: number | null; body: string; retryAfter: string | null; now: number }): Refusal {
  const { who, code, detail, flagged } = o.status === null ? NONE : whoOf(o.body)
  const after = retryAfterOf(o.retryAfter, o.now)
  const row = (c: RefusalClass, known: Refusal['known'], retryAfterMs = after): Refusal => ({
    class: c,
    who,
    code,
    retryAfterMs,
    known,
  })
  const s = o.status
  if (s === null) return row('down', 'neither')
  // a 429 from anyone, the gateway's own included (AI Gateway's Rate Limiting and Spend Limits pages: "429 … until the
  // window resets"; Anthropic's and OpenRouter's errors pages): slow down, for its retry-after or the default pause. A
  // body that names a spend limit reached (Anthropic's errors page: a tier spend-cap 429, `enforced_spend_limit_reached`,
  // no retry-after) says so, and is spent
  if (s === 429) {
    if (who === 'provider' && detail === 'enforced_spend_limit_reached') return row('spent', 'documented')
    return row('slow', 'documented', after ?? DEFAULT_PAUSE_MS)
  }
  // a size, whoever said it (RFC 9110 §15.5.14; Anthropic's errors page: 413 request_too_large)
  if (s === 413) return row('size', 'documented')
  if (who === 'gateway') {
    // observed 2026-11-27: 2040 an alias the gateway has not stored (no request reaches the provider); 2044 a request sent
    // with no alias where no default key is stored. AI Gateway's troubleshooting page: 2009 unauthorized, 2049 a request
    // the gateway's authentication refuses (the Run token's)
    if (s === 400 && code === '2040') return row('key', 'observed')
    if (s === 400 && code === '2044') return row('ours', 'observed')
    if (s === 401 && code === '2009') return row('key', 'documented')
    if (s === 403 && code === '2049') return row('ours', 'documented')
    if (DOWN.has(s)) return row('down', 'documented')
    if (s >= 500) return row('down', 'neither')
    return row('unclear', 'neither')
  }
  if (who === 'provider') {
    // observed 2026-11-27: a wrong stored key is the provider's own 401 (authentication_error), passed through; a model
    // the provider does not have its 404 (not_found_error)
    if (s === 401) return row('key', code === 'authentication_error' ? 'observed' : 'documented')
    if (s === 404) return row('request', code === 'not_found_error' ? 'observed' : 'documented')
    // Anthropic's errors page: 402 billing_error; OpenRouter's errors page: 402 "insufficient credits"
    if (s === 402) return row('spent', 'documented')
    // a 403 is the key's only where the body names an authentication or permission error (Anthropic's errors page:
    // permission_error; OpenRouter's errors page, its typed codes: permission_denied); the text's where it names its
    // content (OpenRouter's: the moderation metadata `reasons` and `flagged_input`, the typed codes
    // content_policy_violation and refusal), so one flagged text never disables a key; any other 403 is unclear
    if (s === 403) {
      if (flagged || detail === 'content_policy_violation' || detail === 'refusal') return row('content', 'documented')
      if (code === 'permission_error' || code === 'authentication_error' || detail === 'permission_denied')
        return row('key', 'documented')
      return row('unclear', 'neither')
    }
    // Anthropic's errors page: 400 invalid_request_error, a spend limit reached among its causes (read as the request's:
    // the entry marked failing stops spending)
    if (s === 400) return row('request', 'documented')
  }
  // the errors pages: 408 a timeout, 500 api_error, 502 and 503 the upstream down, 504 timeout_error, 529 overloaded_error
  if (DOWN.has(s)) return row('down', 'documented')
  if (s >= 500) return row('down', 'neither')
  return row('unclear', 'neither')
}

/** a key a shape may name: an identifier, never a value written as a key */
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/

/** a body's key names only (`error,error.message,error.type,request_id,type`), for a log line: never a value */
export function bodyShapeOf(body: string): string {
  const b = json(body)
  if (b === undefined) return '(not json)'
  const out = new Set<string>()
  const walk = (v: unknown, path: string, depth: number) => {
    if (depth > 4 || out.size > 40) return
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 4)) walk(x, `${path}[]`, depth + 1)
      return
    }
    if (!isObject(v)) return
    for (const k of Object.keys(v)) {
      const name = NAME.test(k) ? k : '?'
      const p = path ? `${path}.${name}` : name
      out.add(p)
      if (name !== '?') walk(v[k], p, depth + 1)
    }
  }
  walk(b, '', 0)
  return [...out].sort().join(',')
}
