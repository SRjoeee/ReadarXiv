import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenAICompatProvider, withoutKey } from '@/providers/openai-compat'
import { getRequestErrorMeta } from '@/providers/request/retry-policy'
import { ProviderError, type TranslateRequest } from '@/providers/types'

const cfg = { baseURL: 'https://openrouter.ai/api/v1', apiKey: 'k', model: 'test/model' }
const req: TranslateRequest = {
  segments: [{ id: 's1', text: 'Hello <x id="1"/>' }, { id: 's2', text: 'World' }],
  source: 'en',
  target: 'zh-CN',
  context: { sectionTitle: 'Intro' },
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}
const modelReturning = (json: unknown, onCall?: (options: unknown) => void) =>
  new MockLanguageModelV4({
    doGenerate: async (options) => {
      onCall?.(options)
      return { content: [{ type: 'text', text: JSON.stringify(json) }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
    },
  })
const modelThrowing = (error: unknown) => new MockLanguageModelV4({ doGenerate: async () => { throw error } })

const kindOf = async (p: Promise<unknown>) => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof ProviderError ? e.kind : `not-provider-error:${String(e)}`
  }
}

describe('openai-compat provider', () => {
  it('capability declaration', () => {
    const p = createOpenAICompatProvider(cfg)
    expect(p.id).toBe('openai-compat')
    expect(p.kind).toBe('llm')
    expect(p.wireFormats).toEqual(['tags'])
    expect(p.maxBatchChars).toBeGreaterThan(0)
    expect(p.maxBatchItems).toBeGreaterThan(0)
  })

  it('structured output: segments correspond one to one by id, with provider and model', async () => {
    let captured: unknown
    const model = modelReturning({ segments: [{ id: 's1', text: '你好 <x id="1"/>' }, { id: 's2', text: '世界' }] }, o => { captured = o })
    const result = await createOpenAICompatProvider(cfg, { model }).translate(req)
    expect(result).toEqual({ segments: [{ id: 's1', text: '你好 <x id="1"/>' }, { id: 's2', text: '世界' }], provider: 'openai-compat', model: 'test/model' })
    expect(JSON.stringify(captured)).toContain('<x id')
    expect(JSON.stringify(captured)).toContain('Intro')
  })

  it('a missing id or an extra id in the reply is invalid-response either way', async () => {
    const missing = modelReturning({ segments: [{ id: 's1', text: 'a' }] })
    expect(await kindOf(createOpenAICompatProvider(cfg, { model: missing }).translate(req))).toBe('invalid-response')
    const extra = modelReturning({ segments: [{ id: 's1', text: 'a' }, { id: 's2', text: 'b' }, { id: 's3', text: 'c' }] })
    expect(await kindOf(createOpenAICompatProvider(cfg, { model: extra }).translate(req))).toBe('invalid-response')
  })

  it('a reply no object can be parsed from is the model\'s way of answering, not a segment\'s: not isolatable, sent once more (DESIGN §8.2, issue #78)', async () => {
    const answering = (text: string) => new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }) })
    // prose where JSON was asked for, fenced JSON, an object of another shape, a schema mismatch inside the segments
    for (const text of ['Here is your translation: \u4f60\u597d \u4e16\u754c', '```json\n{"segments":[]}\n```', '{"translations":["a","b"]}', '{"segments":[{"id":"s1"}]}']) {
      const e = await createOpenAICompatProvider(cfg, { model: answering(text) }).translate(req).then(() => null, (error: unknown) => error)
      expect([text.slice(0, 16), (e as ProviderError)?.kind, (e as ProviderError)?.isolatable]).toEqual([text.slice(0, 16), 'invalid-response', false])
      expect(getRequestErrorMeta(e)).toMatchObject({ isRetryable: true, maxRetries: 1 })
    }
    // a parsed reply with the wrong ids stays isolatable: some segment most likely led the model astray
    const wrongIds = await createOpenAICompatProvider(cfg, { model: modelReturning({ segments: [{ id: 's1', text: 'a' }] }) }).translate(req).then(() => null, (error: unknown) => error)
    expect([(wrongIds as ProviderError).kind, (wrongIds as ProviderError).isolatable]).toEqual(['invalid-response', true])
  })

  it('no key: unavailable, and the model is not called', async () => {
    let calls = 0
    const model = modelReturning({ segments: [] }, () => { calls++ })
    const p = createOpenAICompatProvider({ ...cfg, apiKey: '' }, { model })
    expect(await p.isAvailable()).toBe(false)
    expect(await kindOf(p.translate(req))).toBe('no-key')
    expect(calls).toBe(0)
  })

  it('the AI SDK\'s APICallError maps to a ProviderError with retry metadata attached', async () => {
    const rateLimited = new APICallError({ message: 'Too Many Requests', url: 'u', requestBodyValues: {}, statusCode: 429, responseHeaders: { 'retry-after': '2' }, isRetryable: true })
    const p = createOpenAICompatProvider(cfg, { model: modelThrowing(rateLimited) })
    try {
      await p.translate(req)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError)
      expect((e as ProviderError).kind).toBe('rate-limit')
      expect(getRequestErrorMeta(e).statusCode).toBe(429)
    }
    const unauthorized = new APICallError({ message: 'Unauthorized', url: 'u', requestBodyValues: {}, statusCode: 401, isRetryable: false })
    expect(await kindOf(createOpenAICompatProvider(cfg, { model: modelThrowing(unauthorized) }).translate(req))).toBe('auth')
    expect(await kindOf(createOpenAICompatProvider(cfg, { model: modelThrowing(new TypeError('fetch failed')) }).translate(req))).toBe('network')
  })

  it('an HTTP failure is classified by status like every HTTP engine: a deterministic 4xx is not split, a 5xx is retried, not split', async () => {
    const failing = async (statusCode: number, isRetryable: boolean) => {
      const error = new APICallError({ message: `HTTP ${statusCode}`, url: 'u', requestBodyValues: {}, statusCode, isRetryable })
      return createOpenAICompatProvider(cfg, { model: modelThrowing(error) }).translate(req).then(() => undefined, (e: unknown) => e)
    }
    // A wrong model name, a request shape the endpoint rejects, an unprocessable body: the same answer however small
    // the batch, so the content side must not halve and resend it (DESIGN §8.2) and the chain takes over at once
    for (const status of [400, 404, 422]) {
      const e = await failing(status, false)
      expect(e, `HTTP ${status}`).toBeInstanceOf(ProviderError)
      expect((e as ProviderError).kind, `HTTP ${status}`).toBe('bad-request')
      expect((e as ProviderError).isolatable, `HTTP ${status}`).toBe(false)
      expect(getRequestErrorMeta(e).statusCode, `HTTP ${status}`).toBe(status)
    }
    // A server error is transient: the queue retries it by status, and no segment caused it
    for (const status of [500, 503]) {
      const e = await failing(status, true)
      expect((e as ProviderError).kind, `HTTP ${status}`).toBe('network')
      expect((e as ProviderError).isolatable, `HTTP ${status}`).toBe(false)
      expect(getRequestErrorMeta(e).isRetryable, `HTTP ${status}`).toBe(true)
    }
    expect(((await failing(403, false)) as ProviderError).kind).toBe('auth')
  })

  it('an already aborted signal is aborted outright', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        if (options.abortSignal?.aborted) throw new DOMException('aborted', 'AbortError')
        return { content: [{ type: 'text', text: '{"segments":[]}' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
      },
    })
    expect(await kindOf(createOpenAICompatProvider(cfg, { model }).translate({ ...req, signal: AbortSignal.abort() }))).toBe('aborted')
  })
})

describe('openai-compat provider: the thinking switch and batch capabilities', () => {
  it('puts the endpoint\'s thinking-off field into providerOptions', async () => {
    let captured: unknown
    const model = modelReturning({ segments: [{ id: 's1', text: 'a' }, { id: 's2', text: 'b' }] }, o => { captured = o })
    await createOpenAICompatProvider(cfg, { model }).translate(req)
    expect((captured as { providerOptions?: unknown }).providerOptions).toEqual({ 'openai-compat': { reasoning: { effort: 'none' } } })
  })

  it('batch capabilities follow the reference project\'s defaults: 1000 characters / 4 segments; no rate declared (the service default of 8/s, burst 20)', () => {
    const p = createOpenAICompatProvider(cfg)
    expect(p.maxBatchChars).toBe(1000)
    expect(p.maxBatchItems).toBe(4)
    expect(p.rateLimit).toBeUndefined()
  })

  it('a local endpoint lowers the rate: Ollama runs only 4 in parallel by default, and the rest queued server-side would hit the timeout', () => {
    expect(createOpenAICompatProvider({ ...cfg, baseURL: 'http://localhost:11434/v1' }).rateLimit).toEqual({ rate: 2, capacity: 4 })
    expect(createOpenAICompatProvider({ ...cfg, baseURL: 'http://127.0.0.1:1234/v1' }).rateLimit).toEqual({ rate: 2, capacity: 4 })
  })

  it('a no-key thrown outright also carries the “not retryable, drain the whole queue” metadata (the ported policy does not know this kind)', async () => {
    const err = await createOpenAICompatProvider({ ...cfg, apiKey: '' }).translate(req).catch((e: unknown) => e)
    expect((err as ProviderError).kind).toBe('no-key')
    expect(getRequestErrorMeta(err)).toMatchObject({ kind: 'access-denied', isRetryable: false })
  })

  it('exposes the prompt fingerprint to the cache key: default by default, a custom one varies with the text', () => {
    expect(createOpenAICompatProvider(cfg).promptKey).toBe('default')
    const custom = { promptId: 'm', patterns: [{ id: 'm', name: 'm', systemPrompt: 'S', prompt: '{{input}}' }] }
    expect(createOpenAICompatProvider(cfg, { prompts: custom }).promptKey).toMatch(/^custom:/)
  })

  it('the system prompt sent to the model carries the paper\'s title and abstract (prompt library + protocol block)', async () => {
    let sent = ''
    const model = modelReturning({ segments: [{ id: 's1', text: '你好 <x id="1"/>' }, { id: 's2', text: '世界' }] }, options => { sent = JSON.stringify(options) })
    const p = createOpenAICompatProvider(cfg, { model })
    await p.translate({ ...req, context: { paperTitle: 'Graphs', abstract: 'We study graphs.', sectionTitle: 'Intro' } })
    expect(sent).toContain('Paper title: Graphs')
    expect(sent).toContain('Abstract: We study graphs.')
    expect(sent).toContain('Current section: Intro')
    expect(sent).toContain('<document_metadata>')
    expect(sent).toContain('Input and Output Protocol')
  })
})

describe('openai-compat provider: the key goes to the service alone (#88 E3, E4)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('every request the SDK sends refuses a redirect, and a refused one is a network failure for the chain', async () => {
    const inits: RequestInit[] = []
    // a refused redirect is how Chrome answers `redirect: 'error'` meeting a 3xx: a TypeError
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => { inits.push(init); throw new TypeError('Failed to fetch') }))
    expect(await kindOf(createOpenAICompatProvider({ ...cfg, apiKey: 'sk-live-0123456789' }).translate(req))).toBe('network')
    expect(inits.length).toBeGreaterThan(0)
    for (const init of inits) {
      expect(init.redirect).toBe('error')
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-live-0123456789')
    }
  })

  it('an endpoint that echoes the key in its refusal: the error carries the words, not the key, in whatever shape the key is', async () => {
    for (const apiKey of ['hunter2-not-a-known-shape', 'sk-or-v1-abcdef0123456789']) {
      const echoed = new APICallError({ message: `Incorrect API key provided: ${apiKey}. You can find your key at …`, url: 'u', requestBodyValues: {}, statusCode: 401, responseBody: `{"error":{"message":"Incorrect API key provided: ${apiKey}"}}`, isRetryable: false })
      const e = await createOpenAICompatProvider({ ...cfg, apiKey }, { model: modelThrowing(echoed) }).translate(req).then(() => undefined, (x: unknown) => x)
      expect(e).toBeInstanceOf(ProviderError)
      expect((e as ProviderError).kind).toBe('auth')
      expect((e as ProviderError).message).toContain('Incorrect API key provided')
      expect((e as ProviderError).message).not.toContain(apiKey)
      // nor in what goes with it: the SDK's error, with the reply's body, is not kept as the cause
      expect(JSON.stringify((e as ProviderError).cause ?? null)).not.toContain(apiKey)
    }
  })

  it('withoutKey takes the key out wherever it stands, and leaves a key too short to tell from a word to the shapes', () => {
    expect(withoutKey('a key-of-the-reader then key-of-the-reader again', 'key-of-the-reader')).toBe('a … then … again')
    expect(withoutKey('Bearer abc.def', '')).toBe('Bearer …')
    expect(withoutKey('the word ok stays', 'ok')).toBe('the word ok stays')
  })
})
