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
