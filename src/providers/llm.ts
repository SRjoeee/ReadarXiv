// The reader's own LLM services (OpenAI-compatible endpoints: OpenRouter, DeepSeek, Ollama…) as a translator of the
// chain (interfaces/translate/DECISION.md "Who builds translators": the extension's LLM service stays an adapter in the
// app). The wire is the package's tags wire (`tagsWire`, Google's and Chrome's codec); a request is one structured-output
// call through the AI SDK (generateText + Output.object, a zod schema of segments by id), the prompt the prompt library's
// with the protocol block appended (prompt.ts), each wire a segment named by its index. What a failure means is this
// adapter's to say (a Fault's remedy): only it knows that a 401 is a key refused and a 404 a model the endpoint lacks.
import { APICallError, generateText, type LanguageModel, Output } from 'ai'
import { z } from 'zod'
import { Fault, type Lang, type Limits, type PaperContext, sha256Hex, tagsWire, type Translator } from '@readarxiv/translate'
import { isLoopback, serviceRuns, type Service } from '@/config/services'
import { decodeText } from '@/core/protector/escape'
import { TAG_RE } from '@/core/protector/tokens'
import { redact } from '@/shared/diagnostics'
import { createGlossaryMatcher } from './glossary'
import { createModel } from './model'
import { buildPrompts, PROMPT_VERSION } from './prompt'
import { promptKey, type PromptsConfig } from './prompt-library'
import { thinkingBodyFields } from './thinking'
import type { TranslateContext } from './types'

const outputSchema = z.object({
  segments: z.array(z.object({ id: z.string(), text: z.string() })),
})

/**
 * A request's size: Read Frog's batching defaults (1,000 characters, 4 segments), which the extension has always sent; 8 in
 * flight (the service's old concurrency cap), 4 for a local endpoint (Ollama runs 4 in parallel by default, the rest queue on
 * the server and hit our time); a call's time is the old per-batch timeout at the cap (20 s + 15 ms a character); a unit
 * refused is asked alone once more (the 2026-11-06 probe: one solo re-ask fixed 48 of 57 refusals; the HTML page resent once)
 */
export const LLM_LIMITS: Limits = { chars: 1_000, units: 4, inFlight: 8, callMs: 35_000, reask: 1 }
const LOOPBACK_IN_FLIGHT = 4

/**
 * The endpoint's identity: origin + path, the trailing slash away. The path cannot be dropped (two gateway routes on one
 * host are two back ends; Azure's deployment is in it). **The query stays out, though it may choose a back end**: it may
 * carry a credential under any name (`key`, `api-key`, `token`, Azure Functions' `code`, a SAS `sig`, a gateway's own), so
 * the app can know of no parameter that it is not one, and an identity is persisted in every stored reply's and row's key,
 * which never holds a key, not even digested (hard rule 5). Two services that differ in the query alone (and not in the
 * model) share replies, as they did under the per-text cache (its `openai-compat:<origin + path>`). The hash is the
 * client's own. Never the key
 */
export function endpointIdentity(baseURL: string): string {
  try {
    const url = new URL(baseURL)
    return url.origin + url.pathname.replace(/\/+$/, '')
  } catch {
    return baseURL
  }
}

/** The endpoint's words with the key taken out (an endpoint may echo the key it was sent; #88 E4): the service's own key
 *  at any length, as it was sent (bare or after `Bearer`) and URL-encoded (a query, a form), wherever it stands, then
 *  every shape the log's redaction knows. A short key takes the words that hold it with it: no key enters a message at any
 *  length (hard rule 5; the contract's Fault holds no key), and a message's words are worth less than that */
export function withoutKey(message: string, apiKey: string): string {
  const key = apiKey.trim()
  if (!key) return redact(message)
  // the longest first: a form may hold a shorter one (`%2` is in `%252`)
  const forms = [...new Set([key, encodeURIComponent(key), new URLSearchParams([['', key]]).toString().slice(1)])].sort((a, b) => b.length - a.length)
  return redact(forms.reduce((m, form) => m.split(form).join('…'), message))
}

export interface LlmOptions {
  prompts?: PromptsConfig
  /** the language a target names, for the prompt (the configuration's code: `englishName` reads it) */
  codeOf: (target: Lang) => string
  /** a test's model in place of the endpoint's */
  model?: LanguageModel
  /** a test's fetch, under the AI SDK */
  fetch?: typeof fetch
  /** told the HTTP status of every request that failed with one (the connection test words a refused key by its 401) */
  onStatus?: (status: number) => void
}

/** a wire's words, for the glossary: the tags taken out, the escapes read */
const proseOf = (wire: string): string => decodeText(wire.replace(new RegExp(TAG_RE.source, 'g'), ' '))

/** The context the prompt reads: the paper's, its section, and the glossary's terms the request's texts use */
function contextOf(context: PaperContext | undefined, wires: readonly string[]): TranslateContext | undefined {
  if (!context) return undefined
  const glossary = context.glossary?.length ? createGlossaryMatcher(context.glossary).match(wires.map(proseOf).join('\n')) : []
  const out: TranslateContext = {
    ...(context.title ? { paperTitle: context.title } : {}),
    ...(context.abstract ? { abstract: context.abstract } : {}),
    ...(context.section ? { sectionTitle: context.section } : {}),
    ...(glossary.length ? { glossary } : {}),
  }
  return Object.keys(out).length ? out : undefined
}

/** A failure of the call, as its remedy */
function faultOf(e: unknown, apiKey: string, onStatus?: (status: number) => void): Fault {
  if (e instanceof Fault) return e
  const name = (e as { name?: unknown })?.name
  if (name === 'AbortError') return new Fault('abort', 'aborted', 'llm: aborted')
  if (APICallError.isInstance(e)) {
    const s = e.statusCode
    const what = `llm: ${s ?? 'no status'} ${withoutKey(e.message, apiKey)}`
    if (s !== undefined) onStatus?.(s)
    if (s === undefined) return new Fault('again', 'network', what)
    if (s === 429) {
      const after = Number(e.responseHeaders?.['retry-after'])
      return new Fault('cool', 'rate', what, Number.isFinite(after) && after >= 0 ? { retryAfterMs: after * 1000 } : {})
    }
    if (s === 401 || s === 403) return new Fault('off', 'key-refused', what)
    // a model the endpoint does not have: nothing changes until the configuration does
    if (s === 404) return new Fault('off', 'model', what)
    if (s === 408) return new Fault('again', 'timeout', what)
    if (s === 400 || s === 413) return new Fault('halve', 'malformed', what)
    if (s >= 500) return new Fault('again', s === 503 ? 'overload' : 'network', what)
    return new Fault('pass', 'malformed', what)
  }
  // no object came out of the reply: the model's way of answering, asked once more (DESIGN §8.2)
  if (typeof name === 'string' && /NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse/.test(name))
    return new Fault('again', 'malformed', `llm: ${withoutKey((e as Error).message, apiKey)}`, { tries: 2 })
  // a refused redirect (model.ts noRedirects) and a network down are both a TypeError of fetch
  return new Fault('again', 'network', `llm: ${withoutKey(e instanceof Error ? e.message : String(e), apiKey)}`)
}

/** One of the reader's services as a translator */
export function llmTranslator(service: Service, o: LlmOptions): Translator {
  // the thinking switch changes the request only where an endpoint has an adapter (thinking.ts): elsewhere on and off are
  // one request and one identity
  const adapted = JSON.stringify(thinkingBodyFields(service.baseURL, 'enabled')) !== JSON.stringify(thinkingBodyFields(service.baseURL, 'disabled'))
  const identity = `llm:${sha256Hex(JSON.stringify([endpointIdentity(service.baseURL), service.model, PROMPT_VERSION, promptKey(o.prompts), adapted ? service.thinking : null])).slice(0, 16)}`
  const limits: Limits = { ...LLM_LIMITS, ...(isLoopback(service.baseURL) ? { inFlight: LOOPBACK_IN_FLIGHT } : {}) }
  return {
    identity,
    digest: tagsWire.digest,
    context: true,
    limits,
    // any language the model writes; a service without its key is off at its first request, before anything is sent
    supports: async () => true,
    write: tagsWire.write,
    read: tagsWire.read,
    async *send(wires, call, signal) {
      if (!serviceRuns(service)) throw new Fault('off', 'no-key', 'llm: no API key configured')
      const model = o.model ?? createModel(service, o.fetch)
      const extraBody = thinkingBodyFields(service.baseURL, service.thinking ?? 'disabled')
      const context = contextOf(call.context, wires)
      const { system, prompt } = buildPrompts(
        {
          segments: wires.map((text, i) => ({ id: String(i), text })),
          source: 'en',
          target: o.codeOf(call.target),
          ...(context ? { context } : {}),
        },
        o.prompts,
      )
      let segments: { id: string; text: string }[]
      try {
        const result = await generateText({
          model,
          output: Output.object({ schema: outputSchema }),
          system,
          prompt,
          temperature: 0.2,
          maxRetries: 0,
          abortSignal: signal as AbortSignal,
          providerOptions: Object.keys(extraBody).length ? { 'openai-compat': extraBody as never } : undefined,
        })
        segments = result.output.segments
      } catch (e) {
        throw faultOf(e, service.apiKey, o.onStatus)
      }
      // each wire's text by its index; an id twice, out of range or not ours is no answer (the chain asks again for the rest)
      const seen = new Set<number>()
      for (const s of segments) {
        const i = /^\d+$/.test(s.id) ? Number(s.id) : -1
        if (i < 0 || i >= wires.length || seen.has(i) || typeof s.text !== 'string') continue
        seen.add(i)
        yield [i, s.text] as const
      }
    },
  }
}
