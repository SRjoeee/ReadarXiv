// What the extension's pages and its LLM services share of translation's vocabulary (DESIGN §8): the failure kinds a
// reader is told in words (the locale packs and `ui/strings.ts` key on them), and the request an LLM's prompt is built
// from (prompt.ts). The request code, the pacing and the fallback are `@readarxiv/translate`'s (stage 4b).

export interface TranslateSegment {
  id: string
  text: string
}

export interface TranslateContext {
  paperTitle?: string
  /** The paper's abstract (truncated), with every request: a paper brings its abstract, no extra LLM call to make one */
  abstract?: string
  sectionTitle?: string
  glossary?: { term: string; translation: string }[]
}

/** What an LLM's prompt is built from: its segments, the target (ISO 639-3, named in English for the model) and the context */
export interface TranslateRequest {
  segments: TranslateSegment[]
  /** Fixed in v1 */
  source: 'en'
  target: string
  context?: TranslateContext
}

/** What answered a unit: one of the reader's LLM services, a machine translation engine, the browser's own */
export type ProviderKind = 'llm' | 'mt' | 'builtin'

export const PROVIDER_ERROR_KINDS = ['no-key', 'network', 'rate-limit', 'auth', 'bad-request', 'invalid-response', 'timeout', 'aborted', 'unknown'] as const
export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number]

/** The name of a status's timeout error (background/provider-status.ts): a page that can only quote an error's message knows it for a timeout by it and words it itself */
export const REQUEST_TIMEOUT_ERROR_NAME = 'RequestTimeoutError'

/**
 * The kinds that continuing can only repeat: a missing or rejected key. The one definition (DESIGN §4.3) behind both
 * pipelines' halt and the page's restart-on-hand-over decision. A new key rebuilds the transport (`chainConfigChanged`),
 * which is what clears them
 */
export const PERMANENT_ERROR_KINDS: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>(['no-key', 'auth'])

export function isPermanentErrorKind(kind: string): kind is 'no-key' | 'auth' {
  return PERMANENT_ERROR_KINDS.has(kind as ProviderErrorKind)
}
