// The reader's LLM services as a translator of the chain (src/providers/llm.ts): its identity, the request it sends
// (structured output by index, the prompt library's prompt with the context), what it makes of a reply, and each failure
// as its remedy; the key goes to the service alone (#88 E3, E4)
import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { chainOf, Fault, type Result, type Translator, type UnitIn } from '@readarxiv/translate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { endpointIdentity, LLM_LIMITS, llmTranslator, withoutKey } from '@/providers/llm'
import type { Service } from '@/config/services'

const SVC: Service = { id: 'svc-abcd1234', kind: 'openai-compat', name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'k-0123456789', model: 'test/model', thinking: 'disabled' }
const codeOf = () => 'cmn'
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}
const modelReturning = (json: (prompt: string) => unknown, onCall?: (options: unknown) => void) =>
  new MockLanguageModelV4({
    doGenerate: async options => {
      onCall?.(options)
      return { content: [{ type: 'text', text: JSON.stringify(json(JSON.stringify(options))) }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
    },
  })
const modelThrowing = (error: unknown) => new MockLanguageModelV4({ doGenerate: async () => { throw error } })
const unit = (id: string, text: string): UnitIn => ({ id, content: [{ t: 'text', s: 'Let ' }, { t: 'el', id: 'a', kind: 'math' }, { t: 'text', s: text }] })
const all = async (it: AsyncIterable<readonly [number, string]>) => {
  const out: [number, string][] = []
  for await (const [i, s] of it) out.push([i, s])
  return out
}
const faultOf = async (t: Translator, wires = ['w']) => {
  try {
    await all(t.send(wires, { target: 'zh' }, new AbortController().signal))
    return null
  } catch (e) {
    return e instanceof Fault ? { remedy: e.remedy, code: e.code, message: e.message } : { other: String(e) }
  }
}
const apiError = (statusCode: number, message = 'refused', headers?: Record<string, string>) =>
  new APICallError({ message, url: 'u', requestBodyValues: {}, statusCode, responseBody: '', isRetryable: false, ...(headers ? { responseHeaders: headers } : {}) })

describe('the LLM translator', () => {
  it("its identity is the endpoint, the model, the prompt's version and key, and the thinking switch where it is sent; never the key", () => {
    const a = llmTranslator(SVC, { codeOf })
    expect(a.identity).toMatch(/^llm:[0-9a-f]{16}$/)
    expect(llmTranslator({ ...SVC, apiKey: 'other-key-000000' }, { codeOf }).identity).toBe(a.identity)
    expect(llmTranslator({ ...SVC, model: 'other/model' }, { codeOf }).identity).not.toBe(a.identity)
    expect(llmTranslator({ ...SVC, baseURL: 'https://openrouter.ai/api/v2' }, { codeOf }).identity).not.toBe(a.identity)
    // OpenRouter has a thinking adapter: on and off are two requests, two identities
    expect(llmTranslator({ ...SVC, thinking: 'enabled' }, { codeOf }).identity).not.toBe(a.identity)
    // a custom prompt is another identity
    const custom = { promptId: 'm', patterns: [{ id: 'm', name: 'm', systemPrompt: 'S', prompt: '{{input}}' }] }
    expect(llmTranslator(SVC, { codeOf, prompts: custom }).identity).not.toBe(a.identity)
    expect(a.identity).not.toContain(SVC.apiKey)
    expect(endpointIdentity('https://h/v1/?q=1#x')).toBe('https://h/v1')
  })
  it("today's request size and its re-ask; a local endpoint fewer in flight", () => {
    expect(llmTranslator(SVC, { codeOf }).limits).toEqual(LLM_LIMITS)
    expect(llmTranslator({ ...SVC, baseURL: 'http://127.0.0.1:11434/v1' }, { codeOf }).limits.inFlight).toBe(4)
    expect(LLM_LIMITS).toMatchObject({ chars: 1000, units: 4, reask: 1 })
  })
  it('a request: each wire a segment by its index, the context in the prompt, the glossary terms the texts use; the reply read by index', async () => {
    let sent = ''
    const model = modelReturning(() => ({ segments: [{ id: '1', text: 'Welt <x id="1"/>' }, { id: '0', text: 'Hallo <x id="1"/>' }, { id: '9', text: 'x' }] }), o => { sent = JSON.stringify(o) })
    const t = llmTranslator(SVC, { codeOf, model })
    const context = { title: 'Graphs', abstract: 'We study graphs.', section: 'Intro', glossary: [{ term: 'graph', translation: 'Graph-de' }, { term: 'tree', translation: 'Baum' }] }
    const got = await all(t.send([t.write(unit('u', ' be a graph.'), 'zh'), t.write(unit('v', ' be.'), 'zh')], { target: 'zh', context }, new AbortController().signal))
    expect(got).toEqual([[1, 'Welt <x id="1"/>'], [0, 'Hallo <x id="1"/>']])
    expect(sent).toContain('Paper title: Graphs')
    expect(sent).toContain('Current section: Intro')
    expect(sent).toContain('graph -> Graph-de')
    expect(sent).not.toContain('tree -> Baum')
    expect(sent).toContain('Input and Output Protocol')
    expect(sent).toContain('<x id')
  })
  it('through the chain: a reply that loses an element is asked alone once more, then the next translator answers', async () => {
    let calls = 0
    const model = modelReturning(() => {
      calls++
      return { segments: [{ id: '0', text: 'lost' }] }
    })
    const t = llmTranslator(SVC, { codeOf, model })
    const echo: Translator = { ...t, identity: 'echo:0', send: async function* (wires) { for (const [i, w] of wires.entries()) yield [i, w] as const } }
    const rs: Result[] = []
    for await (const r of chainOf().translate([unit('u', ' be.')], 'zh', { translators: [t, echo] })) rs.push(r)
    expect(rs[0]).toMatchObject({ ok: true, by: 'echo:0' })
    expect(calls).toBe(2)
  })
  it('no key: off at its first request, nothing sent', async () => {
    const doGenerate = vi.fn()
    const t = llmTranslator({ ...SVC, apiKey: '' }, { codeOf, model: new MockLanguageModelV4({ doGenerate }) })
    expect(await faultOf(t)).toMatchObject({ remedy: 'off', code: 'no-key' })
    expect(doGenerate).not.toHaveBeenCalled()
  })
  it("each failure as its remedy: a refused key off, a model the endpoint lacks off, a 429 cools with its Retry-After, a 400 halves, a 5xx again, a reply with no object again once", async () => {
    const statuses: number[] = []
    const run = (e: unknown) => faultOf(llmTranslator(SVC, { codeOf, model: modelThrowing(e), onStatus: s => statuses.push(s) }))
    expect(await run(apiError(401))).toMatchObject({ remedy: 'off', code: 'key-refused' })
    expect(await run(apiError(403))).toMatchObject({ remedy: 'off', code: 'key-refused' })
    expect(await run(apiError(404))).toMatchObject({ remedy: 'off', code: 'model' })
    expect(await run(apiError(429, 'slow', { 'retry-after': '7' }))).toMatchObject({ remedy: 'cool', code: 'rate' })
    expect(await run(apiError(400))).toMatchObject({ remedy: 'halve' })
    expect(await run(apiError(502))).toMatchObject({ remedy: 'again', code: 'network' })
    expect(await run(Object.assign(new Error('no object'), { name: 'AI_NoObjectGeneratedError' }))).toMatchObject({ remedy: 'again', code: 'malformed' })
    expect(await run(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toMatchObject({ remedy: 'abort' })
    expect(statuses).toEqual([401, 403, 404, 429, 400, 502])
  })
})

describe('the LLM translator: the key goes to the service alone (#88 E3, E4)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('every request the SDK sends refuses a redirect, and a refused one is a network failure for the chain', async () => {
    const inits: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => { inits.push(init); throw new TypeError('Failed to fetch') }))
    expect(await faultOf(llmTranslator({ ...SVC, apiKey: 'sk-live-0123456789' }, { codeOf }))).toMatchObject({ remedy: 'again', code: 'network' })
    expect(inits.length).toBeGreaterThan(0)
    for (const init of inits) {
      expect(init.redirect).toBe('error')
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-live-0123456789')
    }
  })
  it('an endpoint that echoes the key in its refusal: the fault carries the words, not the key', async () => {
    for (const apiKey of ['hunter2-not-a-known-shape', 'sk-or-v1-abcdef0123456789']) {
      const echoed = apiError(401, `Incorrect API key provided: ${apiKey}. You can find your key at …`)
      const f = await faultOf(llmTranslator({ ...SVC, apiKey }, { codeOf, model: modelThrowing(echoed) }))
      expect(f?.message).toContain('Incorrect API key provided')
      expect(f?.message).not.toContain(apiKey)
    }
  })
  it('withoutKey takes the key out wherever it stands, and leaves a key too short to tell from a word to the shapes', () => {
    expect(withoutKey('a key-of-the-reader then key-of-the-reader again', 'key-of-the-reader')).toBe('a … then … again')
    expect(withoutKey('Bearer abc.def', '')).toBe('Bearer …')
    expect(withoutKey('the word ok stays', 'ok')).toBe('the word ok stays')
  })
})
