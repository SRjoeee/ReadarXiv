// The reader host's one function that talks to the background (src/pdf-reader/host/translate.ts): units in, one result a unit
// out (the chain's, in the background), in calls of production's batches of plain source, one at a time, under one scope
// withdrawn when done; through the background's own transport and chain, the requests and round trips of a 3-page open
import { describe, expect, it } from 'vitest'
import { kindOfWhy, type Unit } from '@readarxiv/format'
import { chainOf, type FetchInit, type FetchReply, google, microsoft, type Translator, type UnitIn } from '@readarxiv/translate'
import { fakeClock, scriptedFetch } from '@readarxiv/translate/testing'
import { MockLanguageModelV4 } from 'ai/test'
import { DEFAULT_CONFIG, type Config } from '@/config/schema'
import { FIRST_BATCH as ENGINE_FIRST_BATCH, NEXT_BATCH as ENGINE_NEXT_BATCH } from '@/pdf-reader/engine/translate.mjs'
import { FIRST_BATCH, hostTranslate, NEXT_BATCH, WHY_OF } from '@/pdf-reader/host/translate'
import { llmTranslator } from '@/providers/llm'
import { CancelledScopeRegistry } from '@/providers/request/cancellation'
import { createLocalTransport, type TranslationTransport } from '@/providers/transport'

const unit = (id: string, content: Unit['content']): Unit => ({ id, kind: 'para', content }) as Unit
const status = (o: Record<string, unknown> = {}) => ({ providerId: 'microsoft', chosen: 'microsoft', available: true, maxBatchChars: 1000, maxBatchItems: 2, targetLanguage: 'deu', promptId: '', revision: 'r', engine: {}, chain: ['microsoft'], demotions: [], identity: 'id-ms', ...o })
const text = (u: { content: readonly { t: string; s?: string }[] }) => u.content.map(p => p.s ?? '').join('')

/** a transport that answers each unit with its text upper-cased (an accepted result, the service named), records the calls,
 *  and fails where told: a call that cannot run, or one unit refused */
function fake(o: { status?: Record<string, unknown>; fail?: (n: number) => string | null; refuse?: string; delayMs?: number; events?: string[] } = {}) {
  const asked: { units: { id: string; content: readonly { t: string; s?: string }[] }[]; target: string; scope?: string; context?: unknown }[] = []
  const cancelled: string[] = []
  const transport = {
    status: async () => status(o.status),
    cancel: async (scope: string) => { cancelled.push(scope); return 0 },
    translate: async (call: { units: { id: string; content: readonly { t: string; s?: string }[] }[]; target: string; scope?: string; context?: unknown }) => {
      asked.push(call)
      o.events?.push(`asked ${call.units.map(u => u.id).join(' ')}`)
      if (o.delayMs) await new Promise(r => setTimeout(r, o.delayMs))
      o.events?.push(`answered ${call.units.map(u => u.id).join(' ')}`)
      const kind = o.fail?.(asked.length)
      if (kind) return { ok: false, error: { kind, message: kind } }
      return { ok: true, cached: 0, results: call.units.map(u => (u.id === o.refuse ? { id: u.id, ok: false, why: { kind: 'refused' }, error: { kind: 'bad-request', message: 'no' } } : { id: u.id, ok: true, content: [{ t: 'text', s: text(u).toUpperCase() }], by: 'id-ms', engine: 'microsoft', kind: 'mt' })) }
    },
  } as unknown as TranslationTransport
  return { transport, asked, cancelled }
}
const all = async <T>(it: AsyncIterable<T>) => { const out: T[] = []; for await (const x of it) out.push(x); return out }
/** a 3-page open in the reader's order: 16 paragraphs a page of 346 characters of plain source, 16,608 in all */
const threePages = () => [1, 2, 3].flatMap(p => Array.from({ length: 16 }, (_, k) => unit(`p${p}-${k}`, [{ t: 'text', s: `Page ${p}, paragraph ${String(k).padStart(2, '0')}: ${'words a paper sets on its page, '.repeat(10)}end.` }])))

/** a transport that is the background's: the chain with one real adapter, its endpoint giving each text back */
function realChain(translator: Translator) {
  const transport = {
    status: async () => status(),
    cancel: async () => 0,
    translate: async (call: { units: UnitIn[] }) => {
      const results = []
      for await (const r of chainOf().translate(call.units, 'zh-Hans', { translators: [translator] })) results.push(r)
      return { ok: true, cached: 0, results }
    },
  } as unknown as TranslationTransport
  return transport
}
const microsoftEcho = (_url: string, init: FetchInit) => ({ status: 200, body: JSON.stringify((JSON.parse(init.body) as string[]).map(text => ({ translations: [{ text, to: 'zh-Hans' }] }))) })
const googleEcho = (_url: string, init: FetchInit) => ({ status: 200, body: JSON.stringify([(JSON.parse(init.body) as [[string[]]])[0][0]]) })

describe('the reader host translate through the background', () => {
  it('sends the units in calls of plain source (the first FIRST_BATCH characters), with the target and the paper\'s context, and yields one Result a unit, in order', async () => {
    const { transport, asked, cancelled } = fake()
    const t = hostTranslate({ transport, paper: '2600.00001v1' })
    const rows = await all(t([unit('u1', [{ t: 'text', s: 'one' }]), unit('u2', [{ t: 'text', s: 'two' }]), unit('u3', [{ t: 'text', s: 'three' }])], 'de', { signal: new AbortController().signal, context: { title: 'T', abstract: 'A' } }))
    expect(rows).toEqual([{ id: 'u1', ok: true, content: [{ t: 'text', s: 'ONE' }], by: 'id-ms' }, { id: 'u2', ok: true, content: [{ t: 'text', s: 'TWO' }], by: 'id-ms' }, { id: 'u3', ok: true, content: [{ t: 'text', s: 'THREE' }], by: 'id-ms' }])
    expect(asked.map(a => a.units.length)).toEqual([3])
    expect(asked.every(a => a.target === 'deu')).toBe(true)
    expect(asked[0]!.context).toEqual({ paperTitle: 'T', abstract: 'A' })
    // the scope withdrawn once the units are given
    expect(cancelled).toContain(asked[0]!.scope)
  })
  it("a 3-page open goes as production's batches of plain source: the first call 2,500 characters, then 12,000 a call, one call at a time (10 calls in series before, production's 3)", async () => {
    const { transport, asked } = fake()
    const rows = await all(hostTranslate({ transport, paper: 'p' })(threePages(), 'de', { signal: new AbortController().signal }))
    expect(rows.length).toBe(48)
    expect(asked.map(a => a.units.length)).toEqual([7, 34, 7])
    const chars = asked.map(a => a.units.reduce((n, u) => n + text(u).length, 0))
    expect(chars[0]).toBeLessThanOrEqual(FIRST_BATCH)
    expect(chars[1]).toBeLessThanOrEqual(NEXT_BATCH)
    // the names production gives them, and its values (the PDF engine's own, mt.mjs)
    expect([FIRST_BATCH, NEXT_BATCH]).toEqual([ENGINE_FIRST_BATCH, ENGINE_NEXT_BATCH])
  })
  it('the units a reader is looking at are served first: page 1 opens the first call answered, and no unit of a farther page is answered before every unit of a nearer one was asked', async () => {
    const events: string[] = []
    const { transport } = fake({ delayMs: 5, events })
    await all(hostTranslate({ transport, paper: 'p' })(threePages(), 'de', { signal: new AbortController().signal }))
    const first = events.find(e => e.startsWith('answered '))
    expect(first?.split(' ').slice(1).every(id => id.startsWith('p1-'))).toBe(true)
    expect(first?.split(' ')[1]).toBe('p1-0')
    const asked = new Set<string>()
    for (const e of events) {
      const [what, ...ids] = e.split(' ')
      if (what === 'asked') for (const id of ids) asked.add(id)
      else for (const id of ids) {
        const page = Number(id.slice(1, id.indexOf('-')))
        for (let p = 1; p < page; p++) for (let k = 0; k < 16; k++) expect(asked.has(`p${p}-${k}`)).toBe(true)
      }
    }
  })
  it('a unit the chain refused is given as refused, the page\'s words about it left behind', async () => {
    const { transport } = fake({ refuse: 'u2' })
    const rows = await all(hostTranslate({ transport, paper: 'p' })([unit('u1', [{ t: 'text', s: 'a' }]), unit('u2', [{ t: 'text', s: 'b' }])], 'de', { signal: new AbortController().signal }))
    expect(rows[1]).toEqual({ id: 'u2', ok: false, why: { kind: 'refused' } })
  })
  it('a chain that cannot run: every unit unconfigured by its kind', async () => {
    const { transport } = fake({ status: { available: false, demotions: [{ id: 'microsoft', kind: 'no-key' }] } })
    const rows = await all(hostTranslate({ transport, paper: 'p' })([unit('u1', [{ t: 'text', s: 'a' }])], 'de', { signal: new AbortController().signal }))
    expect(rows).toEqual([{ id: 'u1', ok: false, why: { kind: 'unconfigured', code: 'no-key' } }])
  })
  it('a failure the transport names by its kind is the Why the chain would write: format\'s kindOfWhy reads it back to that kind (a refused key the key\'s, not a missing one)', async () => {
    const { transport } = fake({ status: { available: false, demotions: [{ id: 'microsoft', kind: 'auth' }] } })
    const rows = await all(hostTranslate({ transport, paper: 'p' })([unit('u1', [{ t: 'text', s: 'a' }])], 'de', { signal: new AbortController().signal }))
    expect(rows).toEqual([{ id: 'u1', ok: false, why: { kind: 'unconfigured', code: 'key-refused' } }])
    for (const kind of ['no-key', 'auth', 'bad-request', 'invalid-response', 'network'] as const) expect(kindOfWhy(WHY_OF[kind])).toBe(kind)
    // (no Why holds these: the network's, a translator out of reach; a call the transport cancelled is asked again)
    for (const kind of ['timeout', 'unknown', 'rate-limit', 'aborted'] as const) expect(kindOfWhy(WHY_OF[kind])).toBe('network')
  })
  it('a call that cannot run stops the run: what came is given, the rest unavailable', async () => {
    const { transport, asked } = fake({ fail: n => (n === 2 ? 'network' : null) })
    const long = (s: string) => [{ t: 'text', s: s.repeat(2_000) }] as Unit['content']
    const rows = await all(hostTranslate({ transport, paper: 'p' })([unit('u1', long('a')), unit('u2', long('b')), unit('u3', long('c'))], 'de', { signal: new AbortController().signal }))
    expect(asked.map(a => a.units.length)).toEqual([1, 2])
    expect(rows.map(r => r.ok)).toEqual([true, false, false])
    expect(rows[2]).toEqual({ id: 'u3', ok: false, why: { kind: 'unavailable' } })
  })
  it('a unit holding a nested unit (a footnote set in a paragraph) reaches the real adapters as their wire takes it, and is translated', async () => {
    const para = unit('a'.repeat(64), [{ t: 'text', s: 'A claim' }, { t: 'unit', id: 'n', unit: 'b'.repeat(64), pre: '\\footnote{', post: '}' }, { t: 'text', s: '. More words follow.' }])
    for (const [translator, f] of [[microsoft, scriptedFetch(microsoftEcho)], [google, scriptedFetch(googleEcho)]] as const) {
      const t = translator({ fetch: f.fetch })
      const rows = await all(hostTranslate({ transport: realChain(t), paper: 'p' })([para], 'de', { signal: new AbortController().signal }))
      // (answered by the translator itself, the nested unit's mark back as an element of the paragraph's: never unavailable
      // for a wire that could not be written, nor the runs floor's)
      expect(rows).toMatchObject([{ id: para.id, ok: true, by: t.identity }])
      const row = rows[0]!
      expect(row.ok && row.content.map(p => (p.t === 'text' ? p.s.trim() : p.t === 'el' ? `el:${p.id}` : p.t))).toEqual(['A claim', 'el:n', '. More words follow.'])
      expect(f.requests).toHaveLength(1)
    }
  })
  it('an abort withdraws the scope and asks no more', async () => {
    const ac = new AbortController()
    const { transport, asked, cancelled } = fake()
    const it = hostTranslate({ transport, paper: 'p' })([unit('u1', [{ t: 'text', s: 'a' }]), unit('u2', [{ t: 'text', s: 'b' }]), unit('u3', [{ t: 'text', s: 'c' }])], 'de', { signal: ac.signal })
    for await (const _ of it) ac.abort()
    expect(asked).toHaveLength(1)
    expect(cancelled.length).toBeGreaterThan(0)
  })
})

/**
 * The 3-page open through the background's own transport and chain, an endpoint that answers in rounds: every request out is
 * held until nothing more moves (each step a turn of the event loop, never a time), then all of them are answered together,
 * one round trip. The chain's clock is a fake that never advances (no request time, no backoff), so the counts are the
 * same however loaded the machine
 */
describe('the reader host through the background\'s transport and chain: requests and round trips of a 3-page open', () => {
  const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-x', model: 'x/y', thinking: 'disabled' as const }
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } }
  const turn = () => new Promise<void>(r => setTimeout(r, 0))

  async function open(llm: boolean) {
    const held: (() => void)[] = []
    let requests = 0
    const answer = <T>(make: () => T): Promise<T> => {
      requests++
      return new Promise<T>(resolve => held.push(() => resolve(make())))
    }
    const fetch = async (_url: string, init: FetchInit): Promise<FetchReply> => {
      const texts = JSON.parse(init.body) as string[]
      return answer(() => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(texts.map(text => ({ translations: [{ text }] }))) }))
    }
    const model = new MockLanguageModelV4({
      doGenerate: async o => {
        const ids = [...JSON.stringify(o.prompt).matchAll(/\\"id\\":\\"(\d+)\\"/g)].map(m => m[1] as string)
        return answer(() => ({ content: [{ type: 'text' as const, text: JSON.stringify({ segments: ids.map(id => ({ id, text: 'Ein Satz aus Wörtern. '.repeat(8) })) }) }], finishReason: { unified: 'stop' as const, raw: undefined }, usage, warnings: [] }))
      },
    })
    const config = { ...DEFAULT_CONFIG, ...(llm ? { provider: SVC.id, services: [SVC] } : {}) } as Config
    const chain = chainOf({ clock: fakeClock({ auto: false }) })
    const local = await createLocalTransport(config, { chain, probe: chain, fetch, chromeApi: null, cancelled: new CancelledScopeRegistry(), ...(llm ? { llm: (s: typeof SVC) => llmTranslator(s, { codeOf: () => 'deu', model }) } : {}) } as never)
    // the host's calls as they are asked and answered, by their units' ids
    const events: string[] = []
    const transport: TranslationTransport = {
      ...local,
      translate: async call => {
        events.push(`asked ${call.units.map(u => u.id).join(' ')}`)
        const r = await local.translate(call)
        events.push(`answered ${call.units.map(u => u.id).join(' ')}`)
        return r
      },
    }
    let done = false
    let ok = 0
    const run = (async () => {
      for await (const r of hostTranslate({ transport, paper: 'p' })(threePages(), 'de', { signal: new AbortController().signal })) if (r.ok) ok++
      done = true
    })()
    const rounds: number[] = []
    while (!done) {
      // (until nothing moves: no request asked and no call answered for 50 turns in a row)
      for (let still = 0, seen = -1; still < 50; still++) {
        const now = requests + events.length
        if (now !== seen) {
          seen = now
          still = 0
        }
        await turn()
        if (done) break
      }
      if (done) break
      if (!held.length) throw new Error('the open stalled with no request out')
      rounds.push(held.length)
      for (const go of held.splice(0)) go()
    }
    await run
    return { ok, requests, rounds, events }
  }

  const ordered = (events: string[]) => {
    const first = events.find(e => e.startsWith('answered '))?.split(' ').slice(1) ?? []
    expect(first[0]).toBe('p1-0')
    expect(first.every(id => id.startsWith('p1-'))).toBe(true)
    const asked = new Set<string>()
    for (const e of events) {
      const [what, ...ids] = e.split(' ')
      if (what === 'asked') for (const id of ids) asked.add(id)
      else for (const id of ids) for (let p = 1; p < Number(id.slice(1, id.indexOf('-'))); p++) for (let k = 0; k < 16; k++) expect(asked.has(`p${p}-${k}`)).toBe(true)
    }
  }

  it('Microsoft: 11 requests in 3 round trips (10 in 10 when the host sent chain-sized calls one after another), several in flight within a call, the nearest served first', async () => {
    const r = await open(false)
    expect(r.ok).toBe(48)
    expect(r.requests).toBe(11)
    expect(r.rounds).toEqual([2, 7, 2])
    ordered(r.events)
  })
  it('an LLM: 25 requests in 5 round trips (24 in 24 before), at most 8 in flight, the nearest served first', async () => {
    const r = await open(true)
    expect(r.ok).toBe(48)
    expect(r.requests).toBe(25)
    expect(r.rounds).toEqual([4, 8, 8, 1, 4])
    ordered(r.events)
  })
})
