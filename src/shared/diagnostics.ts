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
 * A key never enters the log (CLAUDE.md rule 7), and a line is not trusted to be free of one: an endpoint may echo a
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
