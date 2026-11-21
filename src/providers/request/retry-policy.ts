// Ported from reference/read-frog/src/utils/request/retry-policy.ts@9b44f82 (GPL-3.0), 2026-09-03, modified: only what
// this project's strict type checking required; 2026-10-24: an error may carry its own retry cap (`maxRetries`), below
// the queue's (a malformed reply is sent once more, DESIGN §8.2).
// Request error classification and Retry-After parsing, and the rate-limit pause's base; the backoff policy the request
// queue drove went with the queue.
// Kept at this path for the website's Worker (readarxiv-web, @vendor/providers/request/retry-policy) until its cut-over; nothing in the extension imports it. See tests/contract/website-imports.test.ts.

export type RequestErrorKind =
  | "rate-limit"
  | "timeout"
  | "network"
  | "bad-request"
  | "access-denied"
  | "unknown"

export interface RequestErrorMeta {
  statusCode?: number
  responseHeaders?: Headers | Record<string, string>
  isRetryable?: boolean
  retryAfterMs?: number
  kind?: RequestErrorKind
  // At most this many retries for this error, under the queue's own cap
  maxRetries?: number
}

const REQUEST_ERROR_META = Symbol("requestErrorMeta")

// Base queue pause after a 429 with no Retry-After header. Doubles per
// consecutive rate-limit window; sized for the slowest common free tier
// (Gemini free RPM=15 → ≥4s spacing).
export const RATE_LIMIT_BASE_PAUSE_MS = 5_000

interface RetryAwareError {
  [REQUEST_ERROR_META]?: RequestErrorMeta
  requestErrorMeta?: RequestErrorMeta
  statusCode?: unknown
  status?: unknown
  response?: unknown
  responseHeaders?: unknown
  headers?: unknown
  isRetryable?: unknown
  retryAfterMs?: unknown
  kind?: unknown
  message?: unknown
}

const RATE_LIMIT_ERROR_RE = /\b429\b|too many requests|rate[ -]?limit/i
const TIMEOUT_ERROR_RE = /timed? out|timeout/i
const NETWORK_ERROR_RE = /network error|failed to fetch|fetch failed/i

export function attachRequestErrorMeta<T extends Error>(error: T, meta: RequestErrorMeta): T {
  Object.defineProperty(error, REQUEST_ERROR_META, {
    value: {
      ...getRequestErrorMeta(error),
      ...meta,
    },
    configurable: true,
  })
  return error
}

export function getRequestErrorMeta(error: unknown): RequestErrorMeta {
  const source = isObject(error) ? (error as RetryAwareError) : undefined
  const attachedMeta = source?.[REQUEST_ERROR_META] ?? source?.requestErrorMeta
  const response = isObject(source?.response) ? (source.response as RetryAwareError) : undefined

  const statusCode = normalizeStatusCode(
    attachedMeta?.statusCode ??
      source?.statusCode ??
      source?.status ??
      response?.statusCode ??
      response?.status,
  )
  const responseHeaders = normalizeHeaders(
    attachedMeta?.responseHeaders ??
      source?.responseHeaders ??
      source?.headers ??
      response?.responseHeaders ??
      response?.headers,
  )
  const retryAfterMs =
    normalizeNonNegativeNumber(attachedMeta?.retryAfterMs ?? source?.retryAfterMs) ??
    getRetryAfterMsFromHeaders(responseHeaders)
  const isRetryable = normalizeBoolean(attachedMeta?.isRetryable ?? source?.isRetryable)
  const maxRetries = normalizeNonNegativeNumber(attachedMeta?.maxRetries)
  const message = typeof source?.message === "string" ? source.message : ""
  const kind =
    normalizeKind(attachedMeta?.kind ?? source?.kind) ??
    inferRequestErrorKind({ statusCode, message })

  return removeUndefined({
    statusCode,
    responseHeaders,
    retryAfterMs,
    isRetryable,
    kind,
    maxRetries,
  })
}

function getHeaderValue(headers: unknown, key: string): string | undefined {
  if (!headers) {
    return undefined
  }

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(key) ?? headers.get(key.toLowerCase()) ?? undefined
  }

  const normalizedKey = key.toLowerCase()

  if (Array.isArray(headers)) {
    const entry = headers.find((header): header is [unknown, unknown] => {
      return (
        Array.isArray(header) &&
        header.length >= 2 &&
        String(header[0]).toLowerCase() === normalizedKey
      )
    })
    const value = entry?.[1]
    return typeof value === "string" ? value : undefined
  }

  if (isObject(headers)) {
    const entry = Object.entries(headers).find(
      ([headerKey]) => headerKey.toLowerCase() === normalizedKey,
    )
    const value = entry?.[1]
    return typeof value === "string" ? value : undefined
  }

  return undefined
}

function getRetryAfterMsFromHeaders(
  headers: RequestErrorMeta["responseHeaders"] | undefined,
  now = Date.now(),
): number | undefined {
  const retryAfterMs = getHeaderValue(headers, "retry-after-ms")
  if (retryAfterMs) {
    const parsed = Number.parseFloat(retryAfterMs)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed
    }
  }

  const retryAfter = getHeaderValue(headers, "retry-after")
  if (!retryAfter) {
    return undefined
  }

  const timeoutSeconds = Number.parseFloat(retryAfter)
  if (Number.isFinite(timeoutSeconds) && timeoutSeconds >= 0) {
    return timeoutSeconds * 1000
  }

  const parsedDateMs = Date.parse(retryAfter)
  if (!Number.isNaN(parsedDateMs)) {
    return Math.max(0, parsedDateMs - now)
  }

  return undefined
}

function normalizeHeaders(headers: unknown): RequestErrorMeta["responseHeaders"] | undefined {
  if (!headers) {
    return undefined
  }

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers
  }

  if (Array.isArray(headers)) {
    const normalized: Record<string, string> = {}
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue
      }
      const [key, value] = entry
      if (typeof key === "string" && typeof value === "string") {
        normalized[key] = value
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined
  }

  if (isObject(headers)) {
    const normalized: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") {
        normalized[key] = value
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined
  }

  return undefined
}

function inferRequestErrorKind({
  statusCode,
  message,
}: {
  statusCode?: number
  message: string
}): RequestErrorKind {
  if (statusCode === 429 || RATE_LIMIT_ERROR_RE.test(message)) {
    return "rate-limit"
  }

  if (statusCode === 408) {
    return "timeout"
  }

  if (statusCode === 409) {
    return "unknown"
  }

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return "bad-request"
  }

  if (TIMEOUT_ERROR_RE.test(message)) {
    return "timeout"
  }

  if (NETWORK_ERROR_RE.test(message)) {
    return "network"
  }

  return "unknown"
}

function normalizeKind(value: unknown): RequestErrorKind | undefined {
  return value === "rate-limit" ||
    value === "timeout" ||
    value === "network" ||
    value === "bad-request" ||
    value === "access-denied" ||
    value === "unknown"
    ? value
    : undefined
}

function normalizeStatusCode(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined
  }
  return value
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return value
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T
}
