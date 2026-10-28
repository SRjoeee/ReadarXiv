// The AI SDK model factory. v1 has the one openai-compatible line (OpenRouter / DeepSeek / Ollama shared); Read Frog's
// providers/model.ts covers 20 vendors, and adapting it was more work than writing 20 lines, so it was not ported.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { ThinkingMode } from './thinking'

export interface OpenAICompatConfig {
  /** The reader's service id (svc-…); absent in tests and for the legacy single endpoint */
  id?: string
  /** What the reader named the service; the engine's display name */
  name?: string
  baseURL: string
  apiKey: string
  model: string
  /** disabled by default, see thinking.ts */
  thinking?: ThinkingMode
}

/**
 * The SDK's fetch with redirects refused: every request carries the reader's key, and a redirect would take it to an address the
 * reader never gave (PRIVACY.md: the key goes to the service it belongs to; #88 E3). A refused redirect is a TypeError, which
 * the provider takes for a `network` failure, handed to the chain like any other. Read at the call, so a test's stub is the one used
 */
export const noRedirects: typeof fetch = (input, init) => globalThis.fetch(input, { ...init, redirect: 'error' })

export function createModel(config: OpenAICompatConfig): LanguageModel {
  // supportsStructuredOutputs: the zod schema goes to the endpoint as response_format: json_schema (DeepSeek / Gemini /
  // GPT models on OpenRouter all support it); a model that does not falls back to the output shape spelled out in the prompt
  const provider = createOpenAICompatible({ name: 'openai-compat', baseURL: config.baseURL, apiKey: config.apiKey, supportsStructuredOutputs: true, fetch: noRedirects })
  return provider(config.model)
}
