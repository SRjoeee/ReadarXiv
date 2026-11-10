// The background's transport over the one chain (src/providers/transport.ts, stage 4b): a configuration's translators on
// the background's chain, the rows a page opened again reads, what the popup is told of the engine that answers, the
// connection test, and the session router's contract (cancel, retire). Engines are the package's own adapters over a
// scripted fetch: Microsoft's endpoint, Google's, and the reader's LLM service as a fake on the tags wire
import { chainOf, Fault, type FetchInit, type FetchReply, type Store, tagsWire, type Translator, type UnitIn } from '@readarxiv/translate'
import { describe, expect, it } from 'vitest'
import type { KeyValues } from '@/cache/translate-store'
import { CHAIN_CONFIG_FIELDS, VOLATILE_CONFIG_FIELDS, chainConfigChanged, chainRevision } from '@/config/revision'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { unitOfWire } from '@/core/protector/units'
import { CancelledScopeRegistry } from '@/providers/request/cancellation'
import { createLocalTransport, type LocalTransportDeps, type TranslateResponse } from '@/providers/transport'
import { llmTranslator } from '@/providers/llm'
import { MockLanguageModelV4 } from 'ai/test'

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } }
const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-x', model: 'x/y', thinking: 'disabled' as const }

/** a map behind both stores' ports */
const memory = (): Store & KeyValues & { entries: Map<string, string> } => {
  const entries = new Map<string, string>()
  return { entries, read: async keys => keys.map(k => entries.get(k) ?? null), write: async es => { for (const [k, v] of es) entries.set(k, v) } }
}
const reply = (status: number, body: unknown): FetchReply => ({ ok: status < 300, status, headers: { get: () => null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })

/**
 * The endpoints, scripted: Microsoft answers each text with `ms(text)` (its markers wire), Google echoes (its tags wire);
 * every request counted by host
 */
function endpoints(o: { ms?: (text: string) => string | null; msStatus?: () => number; google?: (text: string) => string } = {}) {
  const sent = { microsoft: 0, google: 0 }
  const fetch = async (url: string, init: FetchInit): Promise<FetchReply> => {
    if (url.includes('microsoft')) {
      sent.microsoft++
      const status = o.msStatus?.() ?? 200
      if (status !== 200) return reply(status, 'down')
      return reply(200, (JSON.parse(init.body) as string[]).map(t => ({ translations: [{ text: o.ms ? o.ms(t) : t }] })))
    }
    sent.google++
    const texts = (JSON.parse(init.body) as [[string[]]])[0][0]
    return reply(200, [texts.map(t => (o.google ? o.google(t) : t))])
  }
  return { fetch, sent }
}

const unit = (id: string, text = ' is a graph.'): UnitIn => ({ id, content: [{ t: 'text', s: 'Let ' }, { t: 'el', id: 'x1', kind: 'display' }, { t: 'text', s: text }] })
const plain = (id: string, s: string): UnitIn => ({ id, content: [{ t: 'text', s }] })

function harness(config: Partial<Config> = {}, extra: Partial<LocalTransportDeps> = {}, stores = { answers: memory(), rows: memory() }) {
  const e = endpoints()
  const deps: LocalTransportDeps = {
    chain: chainOf({ store: stores.answers }),
    probe: chainOf(),
    rows: stores.rows,
    fetch: e.fetch,
    chromeApi: null,
    cancelled: new CancelledScopeRegistry(),
    ...extra,
  }
  return { deps, stores, sent: e.sent, make: () => createLocalTransport({ ...DEFAULT_CONFIG, ...config } as Config, deps) }
}
const ids = (r: TranslateResponse) => (r.ok ? r.results.map(x => (x.ok ? `${x.id}:${x.engine}` : `${x.id}:${x.error.kind}`)) : [`error:${r.error.kind}`])

describe('the transport: a call', () => {
  it('one result per unit in the units\' order, each with the service that answered; a unit with no letter is its own', async () => {
    const h = harness()
    const t = await h.make()
    const r = await t.translate({ units: [unit('a'), plain('b', '42'), plain('c', 'Plain words.')], target: 'cmn' })
    expect(ids(r)).toEqual(['a:microsoft', 'b:undefined', 'c:microsoft'])
    expect(r.ok && r.results[0]).toMatchObject({ ok: true, kind: 'mt', by: expect.stringMatching(/^microsoft:/) })
    expect(h.sent).toEqual({ microsoft: 1, google: 0 })
  })
  it("a unit the first translator refuses goes to the next, for that unit alone; the popup's status names no hand-over for a refusal", async () => {
    const e = endpoints({ ms: t => (t.includes('@a#') ? 'lost the marker' : t) })
    const h = harness({}, { fetch: e.fetch })
    const t = await h.make()
    const r = await t.translate({ units: [unit('a'), plain('c', 'Plain words.')], target: 'cmn' })
    expect(ids(r)).toEqual(['a:google-web', 'c:microsoft'])
    const s = await t.status()
    expect(s.engine.id).toBe('google-web')
    expect(s.demotions).toEqual([])
  })
  it('an endpoint that is down hands over for the popup: the status names the engine that answers and why the first was put aside', async () => {
    const e = endpoints({ msStatus: () => 503 })
    const h = harness({}, { fetch: e.fetch })
    const t = await h.make()
    const r = await t.translate({ units: [unit('a')], target: 'cmn' })
    expect(ids(r)).toEqual(['a:google-web'])
    const s = await t.status()
    expect(s.engine).toEqual({ id: 'google-web', demoted: { id: 'microsoft', kind: 'network', message: expect.any(String) } })
    expect(s.demotions).toEqual([{ id: 'microsoft', kind: 'network' }])
  })
})

describe('the rows: a page opened again (stage 4b deliverable 4)', () => {
  it('opening again reads rows and sends nothing: a unit Microsoft accepted, and one it refused that Google answered, are not asked again', async () => {
    const stores = { answers: memory(), rows: memory() }
    const first = endpoints({ ms: t => (t.includes('@a#') ? 'lost the marker' : t) })
    const a = harness({}, { fetch: first.fetch }, stores)
    const units = [unit('a'), plain('c', 'Plain words.')]
    expect(ids(await (await a.make()).translate({ units, target: 'cmn' }))).toEqual(['a:google-web', 'c:microsoft'])
    expect(first.sent).toEqual({ microsoft: 1, google: 1 })
    // the worker started again: a new chain, the stores as the disk kept them
    const again = endpoints({ ms: t => (t.includes('@a#') ? 'lost the marker' : t) })
    const b = harness({}, { fetch: again.fetch }, stores)
    const r = await (await b.make()).translate({ units, target: 'cmn' })
    expect(ids(r)).toEqual(['a:google-web', 'c:microsoft'])
    expect(r.ok && r.cached).toBe(2)
    expect(again.sent).toEqual({ microsoft: 0, google: 0 })
  })
  it('without the rows, the refused unit would be asked of Microsoft again on every open (why the host keeps them)', async () => {
    const stores = { answers: memory(), rows: memory() }
    const ms = (t: string) => (t.includes('@a#') ? 'lost the marker' : t)
    await (await harness({}, { fetch: endpoints({ ms }).fetch }, stores).make()).translate({ units: [unit('a')], target: 'cmn' })
    const again = endpoints({ ms })
    await (await harness({}, { fetch: again.fetch, rows: undefined }, stores).make()).translate({ units: [unit('a')], target: 'cmn' })
    expect(again.sent).toEqual({ microsoft: 1, google: 0 })
  })
  it('an answer of the second translator while the first could not be reached is no row: the next open asks the first again', async () => {
    const stores = { answers: memory(), rows: memory() }
    await (await harness({}, { fetch: endpoints({ msStatus: () => 503 }).fetch }, stores).make()).translate({ units: [unit('a')], target: 'cmn' })
    expect(stores.rows.entries.size).toBe(0)
    const again = endpoints()
    const r = await (await harness({}, { fetch: again.fetch }, stores).make()).translate({ units: [unit('a')], target: 'cmn' })
    expect(ids(r)).toEqual(['a:microsoft'])
    expect(again.sent.microsoft).toBe(1)
  })
  it('a row the store answers as garbage is a miss: the unit is asked as if none were kept', async () => {
    const stores = { answers: memory(), rows: memory() }
    await (await harness({}, {}, stores).make()).translate({ units: [unit('a')], target: 'cmn' })
    for (const k of stores.rows.entries.keys()) stores.rows.entries.set(k, '{"not": "a row"')
    const again = endpoints()
    const r = await (await harness({}, { fetch: again.fetch, chain: chainOf() }, stores).make()).translate({ units: [unit('a')], target: 'cmn' })
    expect(ids(r)).toEqual(['a:microsoft'])
    expect(again.sent.microsoft).toBe(1)
  })
  it("a row is keyed by the glossary entries its unit's wire uses: an entry added that it does not use reads it again, its own term's change asks again (#637)", async () => {
    let asked: string[] = []
    const model = new MockLanguageModelV4({
      doGenerate: async o => {
        const segments = [...JSON.stringify(o.prompt).matchAll(/\\"id\\":\\"(\d+)\\"/g)].map(m => ({ id: m[1] as string, text: 'Satz.' }))
        asked.push(...segments.map(x => x.id))
        return { content: [{ type: 'text', text: JSON.stringify({ segments }) }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
      },
    })
    const stores = { answers: memory(), rows: memory() }
    // no store of answers: only the rows keep a unit from being asked again
    const h = harness({ provider: SVC.id, services: [SVC] }, { chain: chainOf(), llm: s => llmTranslator(s, { codeOf: () => 'deu', model }) }, stores)
    const units = [plain('k', 'The kernel of a map.'), plain('n', 'A sentence without any term.')]
    const kernel = { term: 'kernel', translation: 'Kern' }
    const ask = async (glossary: { term: string; translation: string }[]) => {
      asked = []
      const r = await (await h.make()).translate({ units, target: 'deu', context: { paperTitle: 'T', glossary } })
      return { r, asked: asked.length }
    }
    expect((await ask([kernel])).asked).toBe(2)
    const added = await ask([kernel, { term: 'lattice', translation: 'Gitter' }])
    expect(added.asked).toBe(0)
    expect(added.r.ok && added.r.cached).toBe(2)
    const changed = await ask([{ term: 'kernel', translation: 'Kernel' }, { term: 'lattice', translation: 'Gitter' }])
    expect(changed.asked).toBe(1)
    expect(changed.r.ok && changed.r.cached).toBe(1)
  })
  it('a row is the chain\'s: another chain of translators, another target, or another unit reads none', async () => {
    const stores = { answers: memory(), rows: memory() }
    await (await harness({}, {}, stores).make()).translate({ units: [unit('a')], target: 'cmn' })
    expect(stores.rows.entries.size).toBe(1)
    const [key] = [...stores.rows.entries.keys()]
    expect(key).toMatch(/^r1\|[0-9a-f]{32}\|zh\|[0-9a-f]{64}\|-$/)
    const other = await harness({ provider: 'google-web' }, {}, stores).make()
    const g = await other.translate({ units: [unit('a')], target: 'cmn' })
    expect(g.ok && g.cached).toBe(0)
  })
})

describe('the connection test', () => {
  const fakeLlm = (send: Translator['send']) => (service: typeof SVC, _c: Config, onStatus?: (s: number) => void): Translator => ({
    identity: `llm:${service.id}`, digest: tagsWire.digest, context: true, limits: { chars: 1000, units: 4, inFlight: 4, callMs: 1000, reask: 0 },
    supports: async () => true, write: tagsWire.write, read: tagsWire.read,
    send: async function* (wires, call, signal) {
      onStatus?.(401)
      yield* send(wires, call, signal)
    },
  })
  it('a named service is asked alone, off the chain, nothing stored: a refused key comes back as auth with its 401', async () => {
    const stores = { answers: memory(), rows: memory() }
    const refuses = fakeLlm(() => ({ [Symbol.asyncIterator]: () => ({ next: async () => { throw new Fault('off', 'key-refused', 'llm: 401 refused') } }) }))
    const h = harness({ services: [SVC] }, { llm: refuses as never }, stores)
    const t = await h.make()
    const r = await t.translate({ units: [plain('sample', 'Let x be a graph.')], target: 'cmn', providerId: SVC.id, candidate: SVC })
    expect(r.ok && r.results[0]).toMatchObject({ ok: false, error: { kind: 'auth', status: 401 } })
    expect(stores.answers.entries.size + stores.rows.entries.size).toBe(0)
    expect(h.sent).toEqual({ microsoft: 0, google: 0 })
  })
  it("the sample's placeholders are the endpoint's to keep: one that drops them fails as a malformed translation, though the runs floor could rebuild them (§6.3)", async () => {
    // the settings page's sample (options/connect.ts), as the page sends it
    const sample = unitOfWire('sample', 'Let <x id="1"/> be a <t id="2">connected</t> graph; see <x id="3"/>.', 'tags').unit
    const replies = (f: (wire: string) => string): Translator['send'] => async function* (wires) { for (const [i, w] of wires.entries()) yield [i, f(w)] as const }
    const strips = await harness({ services: [SVC] }, { llm: fakeLlm(replies(w => w.replace(/<[^>]*>/g, ''))) as never }).make()
    expect(ids(await strips.translate({ units: [sample], target: 'cmn', providerId: SVC.id, candidate: SVC }))).toEqual(['sample:invalid-response'])
    const keeps = await harness({ services: [SVC] }, { llm: fakeLlm(replies(w => w)) as never }).make()
    expect(ids(await keeps.translate({ units: [sample], target: 'cmn', providerId: SVC.id, candidate: SVC }))).toEqual([`sample:${SVC.id}`])
  })
  it('a candidate that is not the service named is refused; an engine not on the chain is said so', async () => {
    const t = await harness().make()
    expect(await t.translate({ units: [], target: 'cmn', providerId: 'svc-other000', candidate: SVC })).toMatchObject({ ok: false, error: { kind: 'unknown' } })
    expect(await t.translate({ units: [], target: 'cmn', providerId: 'svc-nothere0' })).toMatchObject({ ok: false, error: { message: expect.stringContaining('not on the current chain') } })
  })
})

describe("the session router's contract", () => {
  it('a scope the router marked dead is refused before anything is asked; cancel withdraws a call in flight', async () => {
    const cancelled = new CancelledScopeRegistry()
    let release: () => void = () => {}
    const slow = async (url: string, init: FetchInit) => {
      await new Promise<void>(r => { release = r })
      if (init.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return endpoints().fetch(url, init)
    }
    const h = harness({}, { cancelled, fetch: slow })
    const t = await h.make()
    cancelled.markScope('dead')
    expect(await t.translate({ units: [unit('a')], target: 'cmn', scope: 'dead' })).toMatchObject({ ok: false, error: { kind: 'aborted' } })
    const pending = t.translate({ units: [unit('b')], target: 'cmn', scope: 'live' })
    await new Promise(r => setTimeout(r, 10))
    expect(t.busy?.()).toBe(true)
    expect(await t.cancel('live')).toBe(1)
    release()
    const r = await pending
    expect(ids(r)).toEqual(['b:aborted'])
    expect(t.busy?.()).toBe(false)
  })
  it('retire(): every call withdrawn and every later one refused, scoped or not', async () => {
    const t = await harness().make()
    t.retire?.()
    expect(t.isRetired?.()).toBe(true)
    expect(await t.translate({ units: [unit('a')], target: 'cmn' })).toMatchObject({ ok: false, error: { kind: 'aborted' } })
  })
  it("a service the health record marks refused is asked nothing: off at once, the fallback answers, the status says why", async () => {
    let asked = 0
    const llm = (service: typeof SVC): Translator => ({
      identity: `llm:${service.id}`, digest: tagsWire.digest, context: true, limits: { chars: 1000, units: 4, inFlight: 4, callMs: 1000, reask: 0 },
      supports: async () => true, write: tagsWire.write, read: tagsWire.read,
      send: async function* (wires) { asked++; for (const [i, w] of wires.entries()) yield [i, w] as const },
    })
    const h = harness({ provider: SVC.id, services: [SVC] }, { llm: llm as never, rejected: new Set([SVC.id]) })
    const t = await h.make()
    expect(ids(await t.translate({ units: [unit('a')], target: 'cmn' }))).toEqual(['a:google-web'])
    expect(asked).toBe(0)
    const s = await t.status()
    expect(s.available).toBe(false)
    expect(s.fallback).toEqual({ id: 'google-web' })
    expect(s.demotions).toContainEqual({ id: SVC.id, kind: 'auth', status: 401 })
    expect(s.engine).toMatchObject({ id: 'google-web', demoted: { id: SVC.id, kind: 'auth' } })
  })
  it('the seeded hand-over names the refused service from the first status, before any call has met it (the popup\'s note)', async () => {
    const h = harness({ provider: SVC.id, services: [SVC] }, { rejected: new Set([SVC.id]) })
    const s = await (await h.make()).status()
    expect(s.engine.id).toBe('google-web')
    expect(s.engine.demoted).toMatchObject({ id: SVC.id, kind: 'auth' })
  })
})

describe('the status', () => {
  it("the chosen service's request size, the session's wire, the chain's identity; the engines that serve the target now", async () => {
    const t = await harness().make()
    const s = await t.status()
    expect(s).toMatchObject({ providerId: 'microsoft', chosen: 'microsoft', available: true, renderPath: 'markers', maxBatchChars: 2000, maxBatchItems: 100, chain: ['microsoft', 'google-web'], demotions: [], engine: { id: 'microsoft' } })
    expect(s.identity).toMatch(/^[0-9a-f]{32}$/)
    const llm = await harness({ provider: SVC.id, services: [{ ...SVC, apiKey: '' }] }).make()
    expect(await llm.status()).toMatchObject({ providerId: SVC.id, available: false, fallback: { id: 'google-web' }, renderPath: 'tags', maxBatchChars: 1000, maxBatchItems: 4, model: 'x/y' })
  })
})

describe('chainConfigChanged: which configuration changes rebuild the chain', () => {
  it('every configuration field is classified explicitly, and the two tables together cover Config exactly', () => {
    expect([...CHAIN_CONFIG_FIELDS, ...VOLATILE_CONFIG_FIELDS].sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort())
  })

  it('switching the display mode, style, preload or glossary does not rebuild: the page is often translating then, and a rebuild would clear the token buckets and the demotion records', () => {
    const base = DEFAULT_CONFIG
    expect(chainConfigChanged(base, { ...base, mode: 'side' })).toBe(false)
    expect(chainConfigChanged(base, { ...base, appearance: { ...base.appearance, activeStyle: 'green' } })).toBe(false)
    expect(chainConfigChanged(base, { ...base, preload: 'whole' })).toBe(false)
    expect(chainConfigChanged(base, { ...base, glossary: [{ term: 'token', translation: '词元' }] })).toBe(false)
    // The image translation switch (§15) only opens or closes a display gate; flipping it mid-translation must not clear the queue
    expect(chainConfigChanged(base, { ...base, image: { enabled: false } })).toBe(false)
  })

  it('a changed engine, endpoint, model, key, target language, prompt or fallback switch rebuilds', () => {
    const base = DEFAULT_CONFIG
    const cases: Config[] = [
      { ...base, provider: 'google-web' },
      { ...base, services: [SVC] },
      { ...base, provider: SVC.id, services: [{ ...SVC, baseURL: 'https://other.example/v1' }] },
      { ...base, provider: SVC.id, services: [{ ...SVC, model: 'other-model' }] },
      { ...base, provider: SVC.id, services: [{ ...SVC, apiKey: 'sk-new' }] },
      { ...base, provider: SVC.id, services: [{ ...SVC, thinking: 'enabled' }] },
      { ...base, targetLanguage: 'jpn' },
      { ...base, prompts: { ...base.prompts, promptId: 'other' } },
      { ...base, prompts: { ...base.prompts, patterns: [{ id: 'p', name: 'p', systemPrompt: 's', prompt: 'u' }] } },
      { ...base, fallback: { enabled: false } },
    ]
    for (const next of cases) expect([next, chainConfigChanged(base, next)]).toEqual([next, true])
  })

  it('a new object with equal values is no change: storage gives a freshly parsed result on every watch', () => {
    expect(chainConfigChanged(DEFAULT_CONFIG, structuredClone(DEFAULT_CONFIG))).toBe(false)
  })
})

describe('chainRevision: the identity of the settings a chain is built from', () => {
  const base: Config = { ...DEFAULT_CONFIG, provider: SVC.id, services: [SVC] }

  it('is the same for the same chain settings — across builds, and whatever order the fields come back in', async () => {
    const a = await chainRevision(base)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    // A worker restart rebuilds the chain from the same settings: that is not a change the page is behind
    expect(await chainRevision({ ...base })).toBe(a)
    const reordered = { ...base, services: [{ thinking: SVC.thinking, model: SVC.model, apiKey: SVC.apiKey, baseURL: SVC.baseURL, name: SVC.name, kind: SVC.kind, id: SVC.id }] } as Config
    expect(await chainRevision(reordered)).toBe(a)
  })

  it('changes with every chain field — the key, the model, the prompt, the target, the fallback, the service — and with none of the volatile ones', async () => {
    const a = await chainRevision(base)
    const changes: Partial<Config>[] = [
      { services: [{ ...SVC, apiKey: 'sk-y' }] },
      { services: [{ ...SVC, model: 'x/z' }] },
      { prompts: { ...base.prompts, promptId: 'other' } },
      { targetLanguage: 'jpn' as Config['targetLanguage'] },
      { fallback: { ...base.fallback, enabled: !base.fallback.enabled } },
      { provider: 'microsoft' },
    ]
    for (const change of changes) expect(await chainRevision({ ...base, ...change }), Object.keys(change).join()).not.toBe(a)
    for (const field of VOLATILE_CONFIG_FIELDS) {
      expect(await chainRevision({ ...base, [field]: { changed: true } } as unknown as Config), field).toBe(a)
    }
  })
})
