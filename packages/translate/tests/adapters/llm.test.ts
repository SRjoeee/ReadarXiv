// The LLM translator over a host's fetch and spend port. Every reply is scripted here (German text written for these
// tests); every reservation is a fake's. Nothing is sent.
import { describe, expect, it } from 'vitest'
import { headersOf, type LlmEntry } from '../../src/adapters/llm-shapes.ts'
import { writeTyped } from '../../src/adapters/llm-wire.ts'
import {
  type Held,
  LLM_LIMITS,
  llm,
  llmIdentityOf,
  type LlmOptions,
  type Settlement,
  SPEND_DOWN_MS,
  SPEND_MS,
  type Spend,
  type Ticket,
} from '../../src/adapters/llm.ts'
import { ATTEMPTS, chainOf } from '../../src/chain.ts'
import type { Fetch, FetchInit, FetchReply, Result, Translator, UnitIn } from '../../src/contract.ts'
import type { ModelEntry } from '../../src/policy.ts'
import { producerIdentityOf } from '../../src/producers.ts'
import {
  echo as echoTranslator,
  NEVER,
  type Scripted,
  type ScriptedFetch,
  scriptedFetch,
} from '../../src/testing/fakes.ts'
import { fakeClock } from '../../src/testing/ports.ts'
import { translatorSuite } from '../../src/testing/suite.ts'
import { el, t, unit } from '../pieces.ts'
import { LLM_REPLIES, TAGS_UNITS } from './fixtures.ts'

const SECRET = 'sentinel-token-9f3c'
/** a pause the chain's last translator does not wait out (chain.ts patienceOf: ATTEMPTS tries of its callMs) */
const PAST_PATIENCE = ATTEMPTS * LLM_LIMITS.callMs + 1
const URL = 'https://llm.invalid/v1/messages'
const haiku: ModelEntry = {
  id: 'haiku-5-5',
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  shape: 'anthropic-messages',
  json: 'schema',
  reasoning: { thinking: { type: 'disabled' }, effort: 'low' },
  billing: { mode: 'paid', usdPerMTokIn: 0.1, usdPerMTokOut: 0.5 },
  checks: {},
}

/** a spend port that records every call: `answer` says what the n-th reserve gets */
interface FakeSpend extends Spend {
  reserves: { inTokens: number; maxTokens: number; hash: string }[]
  settles: { id: string; outcome: Settlement }[]
}
function fakeSpend(answer: (n: number) => 'ok' | Held | 'never' | 'throw' = () => 'ok'): FakeSpend {
  const reserves: FakeSpend['reserves'] = []
  const settles: FakeSpend['settles'] = []
  return {
    reserves,
    settles,
    async reserve(ask) {
      reserves.push(ask)
      const a = answer(reserves.length)
      if (a === 'never') return new Promise<never>(() => {})
      if (a === 'throw') throw new Error('the ledger is down')
      if (a === 'ok') {
        const ticket: Ticket = {
          ok: true,
          id: `r${reserves.length}`,
          headers: { 'x-key-alias': 'k1', 'x-run': SECRET },
        }
        return ticket
      }
      return a
    },
    async settle(id, outcome) {
      settles.push({ id, outcome })
    },
  }
}

/** the units a request carries, read from its body as the endpoint would */
const unitsOf = (init: FetchInit): { id: string; text: string }[] => {
  const b = JSON.parse(init.body) as { messages: { content: string }[] }
  return (JSON.parse(b.messages[0]?.content ?? '{}') as { units: { id: string; text: string }[] }).units
}
/** an Anthropic reply holding these units */
const reply = (units: readonly { id: string; text: string }[], stop = 'end_turn'): Scripted => ({
  status: 200,
  body: JSON.stringify({
    content: [{ type: 'text', text: JSON.stringify({ units }) }],
    usage: { input_tokens: 10, output_tokens: 5 },
    stop_reason: stop,
    model: 'claude-haiku-5-5',
  }),
})
const echo = (_url: string, init: FetchInit): Scripted => reply(unitsOf(init))

const make = (fetch: Fetch, o: Partial<LlmOptions> = {}) =>
  llm({ entry: haiku, url: URL, fetch, spend: fakeSpend(), ...o })

translatorSuite('llm', {
  make: (fetch) => make(fetch),
  target: 'zh-Hans',
  units: TAGS_UNITS,
  echo,
  replies: LLM_REPLIES,
  secret: SECRET,
  faults: [
    {
      name: "the provider's 401 twice: a key refused, asked again through the ledger, then a pause past the chain's patience",
      answer: {
        status: 401,
        body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'x' } }),
      },
      remedy: 'cool',
      code: 'rate',
      retryAfterMs: PAST_PATIENCE,
    },
    {
      name: 'a 429 twice',
      answer: { status: 429, body: '{"error":{"code":429,"message":"x"}}', headers: { 'retry-after': '30' } },
      remedy: 'cool',
      code: 'rate',
      retryAfterMs: PAST_PATIENCE,
    },
    {
      name: "documented: OpenRouter's moderation block (403): the content's, split",
      answer: {
        status: 403,
        body: JSON.stringify({ error: { code: 403, message: 'x', metadata: { reasons: ['r'], flagged_input: '…' } } }),
      },
      remedy: 'pass',
      code: 'too-large',
    },
    {
      name: 'a 403 that names nothing: unclear, asked once more',
      answer: { status: 403, body: '{"error":{"code":403,"message":"x"}}' },
      remedy: 'again',
      code: 'network',
    },
    {
      name: "documented: Anthropic's stop_reason refusal on a 200: the model's own refusal, split",
      answer: {
        status: 200,
        body: JSON.stringify({ content: [], usage: { input_tokens: 10, output_tokens: 0 }, stop_reason: 'refusal' }),
      },
      remedy: 'pass',
      code: 'too-large',
    },
    {
      name: "documented: OpenRouter's 200 holding only an error (502): classified by it, down",
      answer: { status: 200, body: '{"id":"gen-1","error":{"code":502,"message":"x"}}' },
      remedy: 'again',
      code: 'network',
    },
    {
      name: "the provider's 404: the model wrong",
      answer: {
        status: 404,
        body: JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'x' } }),
      },
      remedy: 'off',
      code: 'model',
    },
    {
      name: "the gateway's 2044: ours",
      answer: { status: 400, body: JSON.stringify({ success: false, error: [{ code: 2044, message: 'x' }] }) },
      remedy: 'off',
      code: 'no-key',
    },
    { name: '413', answer: { status: 413, body: '' }, remedy: 'pass', code: 'too-large' },
    { name: '529', answer: { status: 529, body: '' }, remedy: 'again', code: 'network' },
    { name: 'a 418: unclear', answer: { status: 418, body: '' }, remedy: 'again', code: 'network' },
    { name: 'the network', answer: { network: true }, remedy: 'again', code: 'network' },
    { name: 'not JSON', answer: { status: 200, body: 'nope' }, remedy: 'again', code: 'malformed' },
    {
      name: 'stopped at max_tokens',
      answer: reply([{ id: '0', text: 'Wir' }], 'max_tokens'),
      remedy: 'pass',
      code: 'too-large',
    },
  ],
})

describe('llm: identity', () => {
  it('llm:<16 hex>, moved by every field that changes the text and by nothing else', () => {
    const id = llmIdentityOf(haiku)
    expect(id).toMatch(/^llm:[0-9a-f]{16}$/)
    const moved: Partial<LlmEntry>[] = [
      { model: 'claude-haiku-5-6' },
      { provider: 'openrouter' },
      { upstream: ['baidu'] },
      { shape: 'openai-chat' },
      { json: 'object' },
      { reasoning: { thinking: { type: 'disabled' }, effort: 'medium' } },
      { sampling: { temperature: 0.2 } },
    ]
    for (const m of moved) expect(llmIdentityOf({ ...haiku, ...m }), JSON.stringify(m)).not.toBe(id)
    const same: ModelEntry = {
      ...haiku,
      id: 'another',
      billing: { mode: 'free' },
      checks: { 'zh-CN': { at: '2026-11-27', ok: true, accepted: 40, of: 40, against: 'llm:0123456789abcdef|0' } },
      reasoning: { effort: 'low', thinking: { type: 'disabled' } },
    }
    expect(llmIdentityOf(same)).toBe(id)
    expect(make(scriptedFetch(echo).fetch).identity).toBe(id)
  })
  it("its producer's identity is 12 hex, not the free chain's", async () => {
    const p = await producerIdentityOf([make(scriptedFetch(echo).fetch)])
    expect(p).toMatch(/^[0-9a-f]{12}$/)
    expect(p).not.toBe('064ad25e3aad')
  })
  it('limits as the lead ruled; the host may set inFlight and callMs', () => {
    expect(LLM_LIMITS).toEqual({ chars: 3_000, units: 40, inFlight: 3, callMs: 60_000, reask: 1 })
    const tr = make(scriptedFetch(echo).fetch, { limits: { inFlight: 1, callMs: 30_000 } })
    expect(tr.limits).toEqual({ chars: 3_000, units: 40, inFlight: 1, callMs: 30_000, reask: 1 })
    expect(SPEND_MS).toBe(2_000)
  })
  it('the targets it names; its wire the typed tags; its replies depend on the context', async () => {
    const tr = make(scriptedFetch(echo).fetch)
    expect(await tr.supports('zh-Hans')).toBe(true)
    expect(await tr.supports('xx')).toBe(false)
    const u = TAGS_UNITS[1] as UnitIn
    expect(tr.write(u, 'zh-Hans')).toBe(writeTyped(u))
    expect(tr.context).toBe(true)
    expect(tr.wire).toBe('tags')
  })
})

describe('llm: one request', () => {
  it("the request's headers are its shape's and the ticket's, nothing else; the body has no tools", async () => {
    const f = scriptedFetch(echo)
    const tr = make(f.fetch)
    for await (const _ of tr.send(['Wir <m1/>.'], { target: 'zh-Hans' }, NEVER)) {
      // drained
    }
    expect(f.requests).toHaveLength(1)
    expect(f.requests[0]?.url).toBe(URL)
    expect(f.requests[0]?.init.headers).toEqual({
      ...headersOf('anthropic-messages'),
      'x-key-alias': 'k1',
      'x-run': SECRET,
    })
    expect(JSON.parse(f.requests[0]?.init.body ?? '{}')).not.toHaveProperty('tools')
  })
  it("the reservation asks the body's bytes, its max_tokens and its hash; settled once with the usage", async () => {
    const spend = fakeSpend()
    const tr = make(scriptedFetch(echo).fetch, { spend })
    for await (const _ of tr.send(['aé'], { target: 'zh-Hans', context: { title: 'T' } }, NEVER)) {
      // drained
    }
    const body = JSON.parse(JSON.stringify(spend.reserves[0]))
    expect(body.maxTokens).toBe(256 + 2)
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(body.inTokens).toBeGreaterThan(100)
    expect(spend.settles).toEqual([
      { id: 'r1', outcome: { usage: { inTokens: 10, outTokens: 5, reasoningTokens: 0 }, upstream: null } },
    ])
  })
  it('a reply read by id: each asked id once, an id not asked dropped, the first of a duplicate kept', async () => {
    const f = scriptedFetch(() =>
      reply([
        { id: '1', text: 'B' },
        { id: '7', text: 'X' },
        { id: '0', text: 'A' },
        { id: '1', text: 'C' },
      ]),
    )
    const got: [number, string][] = []
    for await (const r of make(f.fetch).send(['a', 'b'], { target: 'zh-Hans' }, NEVER)) got.push([...r])
    expect(got.sort()).toEqual([
      [0, 'A'],
      [1, 'B'],
    ])
  })
  it('the reservation held: no request, a cool fault for the time it names', async () => {
    const f = scriptedFetch(echo)
    const spend = fakeSpend(() => ({ ok: false, retryAfterMs: 3_600_000 }))
    const err = await (async () => {
      for await (const _ of make(f.fetch, { spend }).send(['a'], { target: 'zh-Hans' }, NEVER)) {
        // nothing
      }
    })().catch((e) => e)
    expect(err).toMatchObject({ remedy: 'cool', code: 'rate', retryAfterMs: 3_600_000 })
    expect(f.requests).toHaveLength(0)
    expect(spend.settles).toHaveLength(0)
  })
  it('the spend port down: no request, a cool fault of SPEND_DOWN_MS', async () => {
    const f = scriptedFetch(echo)
    const spend = fakeSpend(() => 'throw')
    const err = await (async () => {
      for await (const _ of make(f.fetch, { spend }).send(['a'], { target: 'zh-Hans' }, NEVER)) {
        // nothing
      }
    })().catch((e) => e)
    expect(err).toMatchObject({ remedy: 'cool', code: 'rate', retryAfterMs: SPEND_DOWN_MS })
    expect(f.requests).toHaveLength(0)
  })
  it('a ticket that comes after the wait is given back unused: settled unsent', async () => {
    const clock = fakeClock({ auto: false })
    let grant: (t: Ticket) => void = () => {}
    const settles: { id: string; outcome: Settlement }[] = []
    const spend: Spend = {
      reserve: () => new Promise<Ticket>((r) => (grant = r)),
      settle: async (id, outcome) => {
        settles.push({ id, outcome })
      },
    }
    const f = scriptedFetch(echo)
    const p = (async () => {
      for await (const _ of make(f.fetch, { spend, clock }).send(['a'], { target: 'zh-Hans' }, NEVER)) {
        // nothing
      }
    })().catch((e) => e)
    await clock.advance(SPEND_MS)
    expect(await p).toMatchObject({ remedy: 'cool', retryAfterMs: SPEND_DOWN_MS })
    grant({ ok: true, id: 'late', headers: {} })
    await new Promise((r) => setTimeout(r, 0))
    expect(settles).toEqual([{ id: 'late', outcome: { unsent: true } }])
    expect(f.requests).toHaveLength(0)
  })
  it("a refusal is settled with its class; a fault's message holds the body's shape, never a value", async () => {
    const spend = fakeSpend()
    const body = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: `bad ${SECRET}` } })
    const err = await (async () => {
      for await (const _ of make(scriptedFetch(() => ({ status: 401, body })).fetch, { spend }).send(
        ['a'],
        { target: 'zh-Hans' },
        NEVER,
      )) {
        // nothing
      }
    })().catch((e) => e)
    expect(spend.settles[0]?.outcome).toMatchObject({ refusal: { class: 'key', who: 'provider', known: 'observed' } })
    expect(String(err.message)).toContain('error.type')
    expect(String(err.message)).not.toContain(SECRET)
  })
})

describe('llm: through the chain', () => {
  const units: UnitIn[] = [
    unit('u0', [t('We study the problem.')]),
    unit('u1', [t('It is hard.')]),
    unit('u2', [t('Let '), el('m', 'math'), t(' be given.')]),
    unit('u3', [t('Then we stop.')]),
  ]
  const run = async (
    tr: ReturnType<typeof llm>,
    clock: ReturnType<typeof fakeClock>,
    these: readonly UnitIn[] = units,
  ): Promise<Result[]> => {
    const out: Result[] = []
    for await (const r of chainOf({ clock }).translate(these, 'zh-Hans', { translators: [tr] })) out.push(r)
    return out.sort((a, b) => a.id.localeCompare(b.id))
  }

  it('a batch half accepted: the readable kept, a tag lost asked alone once, a unit missing asked again; every reservation settled once', async () => {
    const clock = fakeClock()
    const spend = fakeSpend()
    const f = scriptedFetch((_url, init, n) => {
      const asked = unitsOf(init)
      if (n === 1)
        return reply([
          { id: '0', text: 'Wir untersuchen das Problem.' },
          { id: '1', text: 'Es ist schwer.' },
          { id: '2', text: 'Sei gegeben.' },
        ])
      return reply(asked.map((u) => ({ id: u.id, text: u.text.replace('Let', 'Sei') })))
    })
    const tr = make(f.fetch, { spend, clock })
    const out = await run(tr, clock)
    expect(f.requests[0] && unitsOf(f.requests[0].init)).toHaveLength(4)
    expect(out.map((r) => [r.id, r.ok, r.ok && r.by])).toEqual([
      ['u0', true, tr.identity],
      ['u1', true, tr.identity],
      ['u2', true, tr.identity],
      ['u3', true, tr.identity],
    ])
    const later = f.requests.slice(1).map((r) => unitsOf(r.init).map((u) => u.text))
    expect(later).toContainEqual(['Let <m1/> be given.'])
    expect(later).toContainEqual(['Then we stop.'])
    expect(f.requests).toHaveLength(3)
    expect(spend.reserves).toHaveLength(3)
    expect(spend.settles).toHaveLength(3)
    expect(new Set(spend.settles.map((s) => s.id)).size).toBe(3)
  })

  it('no answer from the spend port, no request', async () => {
    const clock = fakeClock()
    const f = scriptedFetch(echo)
    const tr = make(f.fetch, { spend: fakeSpend(() => 'never'), clock })
    const out = await run(tr, clock)
    expect(f.requests).toHaveLength(0)
    for (const r of out) expect(r).toEqual({ id: r.id, ok: false, why: { kind: 'unavailable', retryAfterMs: 60_000 } })
  })

  it('a request with no answer is sent at most twice', async () => {
    const clock = fakeClock()
    const spend = fakeSpend()
    const f = scriptedFetch(() => ({ network: true }))
    const out = await run(make(f.fetch, { spend, clock }), clock)
    expect(f.requests).toHaveLength(2)
    expect(spend.reserves).toHaveLength(2)
    expect(spend.settles.map((s) => s.outcome)).toEqual([{ unknown: true }, { unknown: true }])
    for (const r of out) expect(r).toEqual({ id: r.id, ok: false, why: { kind: 'unavailable' } })
  })

  it("a timeout is the adapter's, not the chain's", async () => {
    const clock = fakeClock()
    const aborted: number[] = []
    const inner = scriptedFetch(() => ({ hang: true }))
    const fetch: Fetch = (url, init) => {
      init.signal.addEventListener('abort', () => aborted.push(clock.now()), { once: true })
      return inner.fetch(url, init)
    }
    const spend = fakeSpend()
    const out = await run(make(fetch, { spend, clock, limits: { callMs: 10_000 } }), clock)
    expect(inner.requests).toHaveLength(2)
    expect(aborted[0]).toBe(5_000)
    expect(spend.settles.map((s) => s.outcome)).toEqual([{ unknown: true }, { unknown: true }])
    for (const r of out) expect(r.ok).toBe(false)
  })

  const chained = async (
    translators: Translator[],
    clock: ReturnType<typeof fakeClock>,
    these: readonly UnitIn[] = units,
  ): Promise<Result[]> => {
    const out: Result[] = []
    for await (const r of chainOf({ clock }).translate(these, 'zh-Hans', { translators })) out.push(r)
    return out.sort((a, b) => a.id.localeCompare(b.id))
  }
  const keyRefused: Scripted = {
    status: 401,
    body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'x' } }),
  }
  const modelRefusal: Scripted = {
    status: 200,
    body: JSON.stringify({
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: null },
    }),
  }
  const sizes = (f: ScriptedFetch) => f.requests.map((r) => unitsOf(r.init).length)

  it('observed 401 then 200: the refused batch is asked again whole at once, through the ledger', async () => {
    const clock = fakeClock()
    const spend = fakeSpend()
    const f = scriptedFetch((url, init, n) => (n === 1 ? keyRefused : echo(url, init)))
    const tr = make(f.fetch, { spend, clock })
    const out = await run(tr, clock)
    expect(sizes(f)).toEqual([4, 4])
    expect(spend.reserves).toHaveLength(2)
    expect(spend.settles.map((s) => s.id)).toEqual(['r1', 'r2'])
    expect(spend.settles[0]?.outcome).toMatchObject({ refusal: { class: 'key' } })
    expect(spend.settles[1]?.outcome).toMatchObject({ usage: { inTokens: 10 } })
    expect(out.map((r) => r.ok && r.by)).toEqual([tr.identity, tr.identity, tr.identity, tr.identity])
  })

  it('observed 401 twice: two requests of the whole batch, none of one unit; the units unavailable past the patience', async () => {
    const clock = fakeClock()
    const spend = fakeSpend()
    const f = scriptedFetch(() => keyRefused)
    const out = await run(make(f.fetch, { spend, clock }), clock)
    expect(sizes(f)).toEqual([4, 4])
    expect(spend.reserves).toHaveLength(2)
    expect(spend.settles).toHaveLength(2)
    for (const r of out)
      expect(r).toEqual({ id: r.id, ok: false, why: { kind: 'unavailable', retryAfterMs: PAST_PATIENCE } })
  })

  it('a refusal, then Held on the second reserve: one request, the units unavailable', async () => {
    const clock = fakeClock()
    const spend = fakeSpend((n) => (n === 1 ? 'ok' : { ok: false, retryAfterMs: 1_000 }))
    const f = scriptedFetch(() => keyRefused)
    const out = await run(make(f.fetch, { spend, clock }), clock)
    expect(sizes(f)).toEqual([4])
    expect(spend.reserves).toHaveLength(2)
    expect(spend.settles).toHaveLength(1)
    for (const r of out) expect(r).toMatchObject({ ok: false, why: { kind: 'unavailable' } })
  })

  it('a key refused once is asked again with the batch whole before the next translator is asked', async () => {
    const clock = fakeClock()
    const f = scriptedFetch((url, init, n) => (n === 1 ? keyRefused : echo(url, init)))
    const tr = make(f.fetch, { clock })
    const next = echoTranslator('echo:0')
    const out = await chained([tr, next], clock)
    expect(sizes(f)).toEqual([4, 4])
    expect(next.calls).toHaveLength(0)
    expect(out.every((r) => r.ok && r.by === tr.identity)).toBe(true)
  })

  it("documented: a model's refusal is split like a request too large; the lone unit it refuses goes to the next translator, no body sent twice", async () => {
    const clock = fakeClock()
    const spend = fakeSpend()
    const f = scriptedFetch(() => modelRefusal)
    const next = echoTranslator('echo:0')
    const out = await chained([make(f.fetch, { spend, clock }), next], clock)
    expect(sizes(f)).toEqual([4, 2, 1, 1, 2, 1, 1])
    expect(new Set(f.requests.map((r) => r.init.body)).size).toBe(f.requests.length)
    expect(spend.settles.every((s) => 'usage' in s.outcome)).toBe(true)
    expect(out.every((r) => r.ok && r.by === 'echo:0')).toBe(true)
  })

  it("a model's refusal with no translator after it: the unit refused; the chain's runs floor asks the model again", async () => {
    // (the chain unchanged: a lone unit refused is `refused` for this translator, and with no translator left the runs
    // floor asks every translator of the chain for the unit's stretches, this model too: a unit of text alone is its one
    // stretch, so the same body is sent again; the host's fallback keeps the free row)
    const clock = fakeClock()
    const spend = fakeSpend()
    const f = scriptedFetch(() => modelRefusal)
    const plain = await chained([make(f.fetch, { spend, clock })], clock, units.slice(0, 1))
    expect(plain).toEqual([{ id: 'u0', ok: false, why: { kind: 'refused' } }])
    expect(f.requests.map((r) => unitsOf(r.init).map((u) => u.text))).toEqual([
      ['We study the problem.'],
      ['We study the problem.'],
    ])
    const g = scriptedFetch(() => modelRefusal)
    const marked = await chained([make(g.fetch, { clock })], clock, units.slice(2, 3))
    expect(marked).toEqual([{ id: 'u2', ok: false, why: { kind: 'refused' } }])
    expect(g.requests.map((r) => unitsOf(r.init).map((u) => u.text))).toEqual([
      ['Let <m1/> be given.'],
      ['Let', 'be given.'],
      ['Let'],
      ['be given.'],
    ])
  })

  it("documented: OpenRouter's 200 holding only an error is classified by it, not read as an unreadable reply", async () => {
    const flagged: Scripted = {
      status: 200,
      body: JSON.stringify({
        id: 'gen-1',
        error: { code: 403, message: 'x', metadata: { error_type: 'content_policy_violation' } },
      }),
    }
    const spend = fakeSpend()
    const err = await (async () => {
      for await (const _ of make(scriptedFetch(() => flagged).fetch, { spend }).send(
        ['a'],
        { target: 'zh-Hans' },
        NEVER,
      )) {
        // nothing
      }
    })().catch((e) => e)
    expect(err).toMatchObject({ remedy: 'pass', code: 'too-large' })
    expect(spend.settles[0]?.outcome).toMatchObject({ refusal: { class: 'content', who: 'provider' } })
  })
})

describe('llm: a transport that ignores the abort', () => {
  const one = [unit('u0', [t('We study the problem.')])]
  const never = <T>() => new Promise<T>(() => {})
  const drive = async (fetch: Fetch, spend: FakeSpend) => {
    const clock = fakeClock()
    const out: Result[] = []
    for await (const r of chainOf({ clock }).translate(one, 'zh-Hans', {
      translators: [make(fetch, { spend, clock })],
    }))
      out.push(r)
    return out
  }
  it("a fetch that never settles: the adapter's own timer ends it, settled unknown once a request, sent twice", async () => {
    const spend = fakeSpend()
    let calls = 0
    const out = await drive(() => {
      calls++
      return never()
    }, spend)
    expect(calls).toBe(2)
    expect(spend.reserves).toHaveLength(2)
    expect(spend.settles.map((s) => s.outcome)).toEqual([{ unknown: true }, { unknown: true }])
    expect(out).toEqual([{ id: 'u0', ok: false, why: { kind: 'unavailable' } }])
  })
  it('a body read that never settles: the same', async () => {
    const spend = fakeSpend()
    let calls = 0
    const out = await drive(async () => {
      calls++
      return { ok: true, status: 200, headers: { get: () => null }, text: () => never<string>() }
    }, spend)
    expect(calls).toBe(2)
    expect(spend.settles.map((s) => s.outcome)).toEqual([{ unknown: true }, { unknown: true }])
    expect(out).toEqual([{ id: 'u0', ok: false, why: { kind: 'unavailable' } }])
  })
  for (const how of ['answers', 'fails'] as const)
    it(`its fault is again/timeout worth two tries; the abandoned transport ${how} late and changes nothing`, async () => {
      const clock = fakeClock({ auto: false })
      const spend = fakeSpend()
      let finish: (() => void) | undefined
      const fetch: Fetch = () =>
        new Promise<FetchReply>((resolve, reject) => {
          const body = reply([{ id: '0', text: 'x' }])
          finish = () =>
            how === 'answers' && 'body' in body
              ? resolve({ ok: true, status: 200, headers: { get: () => null }, text: async () => body.body })
              : reject(new Error('late'))
        })
      const p = (async () => {
        for await (const _ of make(fetch, { spend, clock, limits: { callMs: 10_000 } }).send(
          ['a'],
          { target: 'zh-Hans' },
          NEVER,
        )) {
          // nothing
        }
      })().catch((e) => e)
      await new Promise((r) => setTimeout(r, 0))
      await clock.advance(5_000)
      expect(await p).toMatchObject({ remedy: 'again', code: 'timeout', tries: 2 })
      finish?.()
      await new Promise((r) => setTimeout(r, 0))
      expect(spend.settles).toEqual([{ id: 'r1', outcome: { unknown: true } }])
    })
})

describe('llm: the identity names who answers, not the route', () => {
  it("one entry under two URLs is one identity; another provider or upstream is another (the URL is the host's route)", () => {
    const a = make(scriptedFetch(echo).fetch).identity
    const b = llm({
      entry: haiku,
      url: 'https://elsewhere.invalid/route/v1/messages',
      fetch: scriptedFetch(echo).fetch,
      spend: fakeSpend(),
    }).identity
    expect(b).toBe(a)
    expect(llmIdentityOf({ ...haiku, provider: 'anthropic-eu' })).not.toBe(a)
    expect(llmIdentityOf({ ...haiku, upstream: ['bedrock'] })).not.toBe(a)
  })
})
