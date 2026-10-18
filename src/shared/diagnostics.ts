// The diagnostics log (issue #156): what the extension records about a session for a reader to attach to an issue —
// the `[axt]` lines, request failures, hand-overs — and what it must never record: an API key, page text. This file
// is the shape and the redaction; the ring buffer lives in the background (entrypoints/background/diagnostics.ts)

export type DiagnosticSource = 'background' | 'content' | 'popup' | 'options'

export interface DiagnosticEntry {
  /** Epoch milliseconds */
  t: number
  src: DiagnosticSource
  line: string
}

/** What the settings page downloads: the buffer plus what a reader cannot be expected to know about their own setup */
export interface DiagnosticsExport {
  exportedAt: string
  extension: { version: string; buildRef: string }
  browser: string
  platform: string
  entries: DiagnosticEntry[]
}

/** A line's length cap: a provider's error may quote a response body, and a whole one has no diagnostic value */
export const LINE_MAX = 500

/**
 * A failure as the log may hold it: the kind, the HTTP status when there was one, and the message's length — never
 * the message. Any message an endpoint had a hand in can carry the paper's words or a key in a shape no regex knows:
 * a 401 body echoing the request, a 500 page, a model's raw output quoted by `invalid-response` (Codex on #214,
 * reproduced through the real SDK for an auth error; Devin on the response-quoting kinds). The console keeps the
 * full text for whoever is looking at it; the log is what a reader hands to strangers
 */
export function failureLine(kind: string, message: string, status?: number): string {
  return `${kind}${status !== undefined ? ` (HTTP ${status})` : ''} — message withheld (${message.length} chars)`
}

/**
 * The same rule where the page holds the reason (the failure widget's `data-axt-reason`, readable by the page's own
 * scripts and by other extensions' content scripts), in the `kind: detail` shape `parseFatal` reads. **One policy for a
 * failure's words, whichever way they leave the extension: an error's message, which an endpoint or a model had a hand
 * in, stays in the console of whoever is looking; the log and the page hold the kind, the HTTP status when there was
 * one, and the message's length** (issue #237; DESIGN §4.6, §7.6). A reason the extension itself wrote — a placeholder
 * that did not match, a block the page changed under — is its own words and is kept as it is
 */
export function failureReason(kind: string, message: string, status?: number): string {
  return `${kind}: ${status !== undefined ? `HTTP ${status}, ` : ''}message withheld (${message.length} chars)`
}

// ── The records (issue #237): what a reader's export shows of the requests and the router, and of nothing else ──
// Each is one line of numbers, fixed words and a kind: no page text, no paper, no address, no key. `RECORD_SHAPES` is
// the whole grammar, and a test holds every producer to it. The unit of a batch is one call to the translate service
// (what the page asked in one go, DESIGN §8.2), and `calls` is how many requests to an engine carried its segments —
// the queue's retries, the per-item fallback, the batch retries all counted — so the export shows the amplification
// directly: 8 segments that cost 15 calls were once found by measurement after the fact

/** A session's id as a record writes it: eight characters tell two sessions of one export apart and lead nowhere else */
export const scopeTag = (scope: string | undefined): string => (scope === undefined ? '-' : scope.slice(0, 8))

/** `batch <session> segments=<n> cached=<n> calls=<n> done=<n> outcome=ok|failed:<kind>` — the service's call, once it has settled */
export function batchLine(r: { scope?: string; segments: number; cached: number; calls: number; done: number; failed?: string }): string {
  return `batch ${scopeTag(r.scope)} segments=${r.segments} cached=${r.cached} calls=${r.calls} done=${r.done} outcome=${r.failed === undefined ? 'ok' : `failed:${r.failed}`}`
}

/** `split <session> segments=<n> into=<a>+<b>` — the page halved a batch that failed because of one of its segments */
export function splitLine(scope: string | undefined, segments: number, [a, b]: readonly [number, number]): string {
  return `split ${scopeTag(scope)} segments=${segments} into=${a}+${b}`
}

/** `chain <session> tried=<n> served-by=<engine>|- outcome=ok|failed:<kind>` — a call that had to go past its first engine, as it ended */
export function chainLine(r: { scope?: string; tried: number; servedBy?: string; failed?: string }): string {
  return `chain ${scopeTag(r.scope)} tried=${r.tried} served-by=${r.servedBy ?? '-'} outcome=${r.failed === undefined ? 'ok' : `failed:${r.failed}`}`
}

/** `session <session> tab=<id>|- <event>` — a decision of the session router (background/sessions.ts) */
export function sessionLine(scope: string | undefined, tabId: number | undefined, event: string): string {
  return `session ${scopeTag(scope)} tab=${tabId ?? '-'} ${event}`
}

/** Every shape a record may take; the kinds are the providers' fixed words, the events the router's, and nothing in them is free text */
const KIND = '[a-z-]+'
const SESSION = '(?:\\S{1,8}|-)'
export const RECORD_SHAPES: readonly RegExp[] = [
  new RegExp(`^batch ${SESSION} segments=\\d+ cached=\\d+ calls=\\d+ done=\\d+ outcome=(?:ok|failed:${KIND})$`),
  new RegExp(`^split ${SESSION} segments=\\d+ into=\\d+\\+\\d+$`),
  new RegExp(`^chain ${SESSION} tried=\\d+ served-by=[\\w.:-]+ outcome=(?:ok|failed:${KIND})$`),
  new RegExp(`^session ${SESSION} tab=(?:\\d+|-) (?:grace armed|grace re-armed round=\\d+|probe (?:same|other|unknown)|kept|dropped \\((?:ended|tab closed|left|unconfirmed|superseded)\\) cancelled=\\d+|rebound \\(pack\\))$`),
  /^sessions rebound all \(service deleted\) cancelled=\d+ moved=\d+$/,
]

/** What comes back from storage is not trusted either: the shape checked, every line redacted and capped again (Devin on #214) */
export function normalizeEntries(stored: unknown): DiagnosticEntry[] {
  if (!Array.isArray(stored)) return []
  const out: DiagnosticEntry[] = []
  for (const raw of stored) {
    if (typeof raw !== 'object' || raw === null) continue
    const { t, src, line } = raw as { t?: unknown; src?: unknown; line?: unknown }
    if (typeof t !== 'number' || typeof line !== 'string') continue
    if (src !== 'background' && src !== 'content' && src !== 'popup' && src !== 'options') continue
    out.push({ t, src, line: redact(line) })
  }
  return out
}

/**
 * A key never enters the log (CLAUDE.md hard rule 5), and a line is not trusted to be free of one: an endpoint may echo a
 * request header in an error, a reader may paste a URL with a key into a service's base URL. The shapes: OpenAI-style
 * `sk-…`, Google's `AIza…`, a bearer token, a `key=` / `token=` query parameter
 */
export function redact(line: string): string {
  // The bearer and the query parameter first: their values may themselves be `sk-…` keys, and blanked first those would leave a half
  const clean = line
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer …')
    .replace(/([?&](?:api[_-]?key|key|token|access_token)=)[^&\s"']+/gi, '$1…')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, 'sk-…')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, 'AIza…')
  return clean.length > LINE_MAX ? `${clean.slice(0, LINE_MAX)}…` : clean
}
