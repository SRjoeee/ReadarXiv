// The reader's LLM services as a translator of the chain (src/providers/llm.ts): its identity, the request it sends
// (structured output by index, the prompt library's prompt with the context), what it makes of a reply, and each failure
// as its remedy; the key goes to the service alone (#88 E3, E4)
import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { chainOf, Fault, type FetchInit, type FetchReply, identityOf, keyOf, type Result, sha256Hex, type Store, type Translator, type UnitIn } from '@readarxiv/translate'
import { fakeClock, memoryStore } from '@readarxiv/translate/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { endpointIdentity, LLM_LIMITS, llmTranslator, withoutKey } from '@/providers/llm'
import { PROMPT_DIGEST } from '@/providers/prompt'
import { promptKey } from '@/providers/prompt-library'
import { CancelledScopeRegistry } from '@/providers/request/cancellation'
import { createLocalTransport } from '@/providers/transport'
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
  it("its identity is the endpoint, the model, the prompt's digest and key, and the thinking switch where it is sent; never the key", () => {
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
    // the query stays out: it may carry a credential under any name (#607's review, declined at endpointIdentity)
    expect(llmTranslator({ ...SVC, baseURL: `${SVC.baseURL}?code=made-up-0123` }, { codeOf }).identity).toBe(a.identity)
  })
  it("an answer stored under the identity the prompt's version made (PROMPT_VERSION '5', where its digest stands now) is never reached: the model is asked, the old entry neither read nor changed", async () => {
    // (the identity as llm.ts writes it, the prompt's part given: its digest now, the version before)
    const identityWith = (prompt: string) => `llm:${sha256Hex(JSON.stringify([endpointIdentity(SVC.baseURL), SVC.model, prompt, promptKey(), SVC.thinking])).slice(0, 16)}`
    let calls = 0
    const model = modelReturning(() => {
      calls++
      return { segments: [{ id: '0', text: 'Frisch <x id="1"/> neu.' }] }
    })
    const t = llmTranslator(SVC, { codeOf, model })
    expect(t.identity).toBe(identityWith(PROMPT_DIGEST))
    const before: Translator = { ...t, identity: identityWith('5') }
    expect(before.identity).not.toBe(t.identity)
    const u = unit('u', ' be.')
    const old = keyOf(before, 'zh', before.write(u, 'zh'))
    const stale = 'Alt <x id="1"/> veraltet.'
    const store = memoryStore()
    store.entries.set(old, stale)
    const rs: Result[] = []
    for await (const r of chainOf({ store }).translate([u], 'zh', { translators: [t] })) rs.push(r)
    expect(calls).toBe(1)
    expect(rs[0]).toMatchObject({ ok: true, by: t.identity })
    expect(JSON.stringify(rs[0])).toContain('Frisch')
    expect(JSON.stringify(rs[0])).not.toContain('veraltet')
    expect(store.reads.flat()).not.toContain(old)
    expect(store.entries.get(old)).toBe(stale)
    // (a page's row is keyed by the chain's identity over the translator's: another key as well)
    expect(await identityOf([t])).not.toBe(await identityOf([before]))
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
  it("a stored answer is keyed by the glossary entries its own wire uses: an entry it does not use leaves it in reach, its own term's change asks again (#637)", async () => {
    let calls = 0
    const model = modelReturning(() => { calls++; return { segments: [{ id: '0', text: 'Ein Satz.' }] } })
    const entries = new Map<string, string>()
    const store: Store = { read: async ks => ks.map(k => entries.get(k) ?? null), write: async es => { for (const [k, v] of es) entries.set(k, v) } }
    const chain = chainOf({ store })
    const llm = llmTranslator(SVC, { codeOf, model })
    const drain = async (it: AsyncIterable<Result>) => { for await (const _ of it); }
    const ask = (u: UnitIn, glossary: { term: string; translation: string }[]) => drain(chain.translate([u], 'de', { translators: [llm], context: { title: 'T', glossary } }))
    const none: UnitIn = { id: 'u', content: [{ t: 'text', s: 'A sentence without any term.' }] }
    const kernel = { term: 'kernel', translation: 'Kern' }
    await ask(none, [kernel])
    await ask(none, [kernel, { term: 'lattice', translation: 'Gitter' }])
    expect(calls).toBe(1)
    // the key of a unit that uses no entry is the key with no glossary at all
    await drain(chain.translate([none], 'de', { translators: [llm], context: { title: 'T' } }))
    expect(calls).toBe(1)
    const uses: UnitIn = { id: 'k', content: [{ t: 'text', s: 'The kernel of a map.' }] }
    await ask(uses, [kernel])
    await ask(uses, [kernel, { term: 'lattice', translation: 'Gitter' }])
    expect(calls).toBe(2)
    await ask(uses, [{ term: 'kernel', translation: 'Kernel' }])
    expect(calls).toBe(3)
  })
  it("a request's prompt holds the union of the entries each of its wires uses, in the table's order: no entry made of two wires' ends", async () => {
    let sent = ''
    const model = modelReturning(() => ({ segments: [{ id: '0', text: 'a' }, { id: '1', text: 'b' }] }), o => { sent = JSON.stringify(o) })
    const t = llmTranslator(SVC, { codeOf, model })
    const glossary = [{ term: 'tree', translation: 'Baum' }, { term: 'neural network', translation: 'NN' }, { term: 'graph', translation: 'Graph-de' }]
    await all(t.send(['A graph and a neural', 'network of a tree.'], { target: 'de', context: { glossary } }, new AbortController().signal))
    expect(sent).toContain('tree -> Baum\\ngraph -> Graph-de')
    expect(sent).not.toContain('neural network -> NN')
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
  it("each failure as its remedy: a refused key off, a model the endpoint lacks off, a 429 cools with its Retry-After, a 413 too large, a 400 passed whole, a 5xx again, a reply with no object again once", async () => {
    const statuses: number[] = []
    const run = (e: unknown) => faultOf(llmTranslator(SVC, { codeOf, model: modelThrowing(e), onStatus: s => statuses.push(s) }))
    expect(await run(apiError(401))).toMatchObject({ remedy: 'off', code: 'key-refused' })
    expect(await run(apiError(403))).toMatchObject({ remedy: 'off', code: 'key-refused' })
    expect(await run(apiError(404))).toMatchObject({ remedy: 'off', code: 'model' })
    expect(await run(apiError(429, 'slow', { 'retry-after': '7' }))).toMatchObject({ remedy: 'cool', code: 'rate' })
    expect(await run(apiError(413))).toMatchObject({ remedy: 'pass', code: 'too-large' })
    expect(await run(apiError(400))).toMatchObject({ remedy: 'pass', code: 'malformed' })
    expect(await run(apiError(502))).toMatchObject({ remedy: 'again', code: 'network' })
    expect(await run(Object.assign(new Error('no object'), { name: 'AI_NoObjectGeneratedError' }))).toMatchObject({ remedy: 'again', code: 'malformed' })
    expect(await run(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toMatchObject({ remedy: 'abort' })
    expect(statuses).toEqual([401, 403, 404, 429, 413, 400, 502])
  })
  it("a 429's Retry-After of an hour does not hold a call: one request, no sleep, the unit told the hour (#638: 7,200,000 ms)", async () => {
    const clock = fakeClock()
    let calls = 0
    const model = new MockLanguageModelV4({ doGenerate: async () => { calls++; throw apiError(429, 'slow', { 'retry-after': '3600' }) } })
    const rs: Result[] = []
    for await (const r of chainOf({ clock }).translate([{ id: 'u', content: [{ t: 'text', s: 'One sentence.' }] }], 'zh-Hans', { translators: [llmTranslator(SVC, { codeOf, model })] })) rs.push(r)
    expect(rs).toEqual([{ id: 'u', ok: false, why: { kind: 'unavailable', retryAfterMs: 3_600_000 } }])
    expect(calls).toBe(1)
    expect(clock.now()).toBe(0)
  })
  it('an endpoint that answers 400 to every request is asked once and the request handed on whole (#636: 7 requests, 11 alone)', async () => {
    const units = [0, 1, 2, 3].map(i => ({ id: `u${i}`, content: [{ t: 'text' as const, s: `Sentence number ${i} of a paragraph.` }] }))
    const drain = async (it: AsyncIterable<Result>) => { const out: Result[] = []; for await (const r of it) out.push(r); return out }
    let calls = 0
    const model = new MockLanguageModelV4({ doGenerate: async () => { calls++; throw apiError(400) } })
    const fallback: Translator = {
      identity: 'fallback:0', digest: 'd', context: false, limits: LLM_LIMITS, supports: async () => true,
      write: u => JSON.stringify(u.content), read: (_u, raw) => ({ content: JSON.parse(raw) }),
      async *send(wires) { for (const [i, w] of wires.entries()) yield [i, w] as const },
    }
    const rs = await drain(chainOf().translate(units, 'zh-Hans', { translators: [llmTranslator(SVC, { codeOf, model }), fallback] }))
    expect(calls).toBe(1)
    expect(rs.every(r => r.ok && r.by === 'fallback:0')).toBe(true)
    calls = 0
    const alone = await drain(chainOf().translate(units, 'zh-Hans', { translators: [llmTranslator(SVC, { codeOf, model })] }))
    expect(calls).toBe(1)
    expect(alone.map(r => (r.ok ? 'ok' : r.why.kind))).toEqual(['unavailable', 'unavailable', 'unavailable', 'unavailable'])
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
  it('withoutKey takes the key out at any length, as sent and URL-encoded, wherever it stands (hard rule 5)', () => {
    expect(withoutKey('a key-of-the-reader then key-of-the-reader again', 'key-of-the-reader')).toBe('a … then … again')
    expect(withoutKey('Bearer abc.def', '')).toBe('Bearer …')
    // a short key goes too, with the words that hold it: a message's words are worth less than the key
    expect(withoutKey('the word ok goes, and so does token', 'ok')).toBe('the word … goes, and so does t…en')
    expect(withoutKey('auth=a%2Bb%2Fc%20d, form a%2Bb%2Fc+d, bare a+b/c d', 'a+b/c d')).toBe('auth=…, form …, bare …')
  })
  it('an endpoint that echoes a key of any length, bare, as a bearer or URL-encoded: neither the fault nor a line the transport logs holds it', async () => {
    for (const apiKey of ['Q+7', 'gw/Long+Key=0123456789abcdef']) {
      const forms = [apiKey, encodeURIComponent(apiKey)]
      const echo = `Incorrect API key provided: ${apiKey}; sent Authorization: Bearer ${apiKey} from https://h/v1?auth=${encodeURIComponent(apiKey)}`
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: echo } }), { status: 401, headers: { 'content-type': 'application/json' } })))
      const service = { ...SVC, apiKey }
      // the fault, through the AI SDK's own reading of the endpoint's refusal
      const f = await faultOf(llmTranslator(service, { codeOf }))
      expect(f).toMatchObject({ remedy: 'off', code: 'key-refused', message: expect.stringContaining('Incorrect API key provided') })
      for (const form of forms) expect(f?.message).not.toContain(form)
      // the background's path: every line its transport gives the diagnostics log (`warn`, `note`) or the console
      const lines: string[] = []
      const spies = (['log', 'info', 'debug', 'warn', 'error'] as const).map(m => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')) }))
      const google = async (_url: string, init: FetchInit): Promise<FetchReply> => {
        const texts = (JSON.parse(init.body) as [[string[]]])[0][0]
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify([texts]) }
      }
      const t = await createLocalTransport({ ...DEFAULT_CONFIG, provider: service.id, services: [service] } as Config, {
        chain: chainOf(), probe: chainOf(), fetch: google, chromeApi: null, cancelled: new CancelledScopeRegistry(),
        warn: l => lines.push(l), note: l => lines.push(l), onFailure: info => lines.push(info.message),
      })
      const r = await t.translate({ units: [unit('u', ' be a graph.')], target: 'cmn' })
      const tested = await t.translate({ units: [unit('s', ' be a graph.')], target: 'cmn', providerId: service.id, candidate: service })
      for (const s of spies) s.mockRestore()
      lines.push(JSON.stringify(r), JSON.stringify(tested))
      expect(lines.some(l => l.includes('passed over'))).toBe(true)
      for (const form of forms) expect(lines.filter(l => l.includes(form))).toEqual([])
    }
  })
})
