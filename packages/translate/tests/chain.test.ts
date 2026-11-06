// The chain's rules, each a test through the interface with fakes (design-a §5, design-b §5.3). Each describe names the
// row of interfaces/translate/DECISION.md's table, or the contract's rule, it holds.
import { describe, expect, it } from 'vitest'
import { ACCEPT_DIGEST } from '../src/accept.ts'
import { ATTEMPTS, BREAKER, chainOf, identityOf, keyOf } from '../src/chain.ts'
import { Fault, type Note, type Result, type Translator, type UnitIn } from '../src/contract.ts'
import { sha256Hex } from '../src/sha256.ts'
import { microsoft } from '../src/adapters/microsoft.ts'
import { echo, fakeTranslator, mangler, scriptedFetch } from '../src/testing/fakes.ts'
import { countingGate, fakeClock, memoryStore } from '../src/testing/ports.ts'
import { el, span, t, unit } from './pieces.ts'

const all = async (it: AsyncIterable<Result>): Promise<Result[]> => {
  const out: Result[] = []
  for await (const r of it) out.push(r)
  return out
}
const byId = (rs: Result[], id: string) => rs.find((r) => r.id === id) as Result
const withMath = unit('m', [t('We fix '), el('x', 'math'), t(' here.')])
const plain = unit('p', [t('Plain words only.')])
const many = (n: number, prefix = 'u') =>
  Array.from({ length: n }, (_, i) => unit(`${prefix}${i}`, [t(`Sentence number ${prefix}${i} says words.`)]))
const tick = () =>
  new Promise<void>((r) =>
    (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, 0),
  )
const controller = () =>
  new (
    globalThis as unknown as { AbortController: new () => { signal: AbortSignalLike; abort(): void } }
  ).AbortController()
type AbortSignalLike = {
  aborted: boolean
  addEventListener(t: 'abort', f: () => void, o?: { once?: boolean }): void
  removeEventListener(t: 'abort', f: () => void): void
}

describe('DECISION "How much a host learns": one object from chainOf(ports), its translate, and identityOf', () => {
  it('a call gives exactly one result per unit, as each settles', async () => {
    const chain = chainOf({ clock: fakeClock() })
    const rs = await all(chain.translate([withMath, plain], 'zh-Hans', { translators: [echo()] }))
    expect(rs.map((r) => r.id).sort()).toEqual(['m', 'p'])
    expect(rs.every((r) => r.ok)).toBe(true)
  })
  it("refuses a caller's bug before any work: two units of one id, an id twice in a unit, an empty chain", async () => {
    const chain = chainOf({ clock: fakeClock() })
    const e = echo()
    await expect(all(chain.translate([plain, plain], 'ja', { translators: [e] }))).rejects.toThrow(TypeError)
    await expect(
      all(chain.translate([unit('d', [el('a'), t(' x '), el('a')])], 'ja', { translators: [e] })),
    ).rejects.toThrow(TypeError)
    await expect(all(chain.translate([plain], 'ja', { translators: [] }))).rejects.toThrow(TypeError)
    expect(e.calls).toEqual([])
  })
})

describe('the contract: one result per unit under every failure', () => {
  const failures: [string, Translator][] = [
    [
      'down for good',
      fakeTranslator({ identity: 'down:0', script: () => ({ fault: new Fault('again', 'network', 'down') }) }),
    ],
    [
      'cooling',
      fakeTranslator({
        identity: 'cool:0',
        script: () => ({ fault: new Fault('cool', 'rate', '429', { retryAfterMs: 1_000 }) }),
      }),
    ],
    ['off', fakeTranslator({ identity: 'off:0', script: () => ({ fault: new Fault('off', 'key-refused', '401') }) })],
    [
      'passing',
      fakeTranslator({ identity: 'pass:0', script: () => ({ fault: new Fault('pass', 'malformed', 'bad') }) }),
    ],
    [
      'halving',
      fakeTranslator({ identity: 'halve:0', script: () => ({ fault: new Fault('halve', 'overload', 'too big') }) }),
    ],
    ['hanging', fakeTranslator({ identity: 'hang:0', script: () => ({ hang: true }) })],
    ['short of units', fakeTranslator({ identity: 'short:0', script: () => ({ missing: [0, 2] }) })],
    ['mangling', mangler('drop-el')],
  ]
  for (const [name, bad] of failures) {
    it(`with a translator ${name}, alone and before an echo`, async () => {
      const units = [withMath, plain, ...many(3)]
      for (const translators of [[bad], [bad, echo()]]) {
        const rs = await all(chainOf({ clock: fakeClock() }).translate(units, 'zh-Hans', { translators }))
        expect(rs.map((r) => r.id).sort()).toEqual(units.map((u) => u.id).sort())
        if (translators.length === 2) expect(rs.every((r) => r.ok)).toBe(true)
      }
    })
  }
  it('with a store that throws, hangs or answers garbage: all misses', async () => {
    for (const store of [memoryStore({ fail: true }), memoryStore({ hang: true }), memoryStore({ garbage: true })]) {
      const rs = await all(
        chainOf({ store, clock: fakeClock() }).translate([withMath, plain], 'ja', { translators: [echo()] }),
      )
      expect(rs.filter((r) => r.ok).length).toBe(2)
    }
  })
  it('under abort: what settled stands, the rest come back aborted, and nothing is asked after', async () => {
    const clock = fakeClock()
    const slow = fakeTranslator({ identity: 'slow:0', clock, script: () => ({ delayMs: 5_000 }) })
    const ac = controller()
    const chain = chainOf({ clock })
    const got: Result[] = []
    const it = chain.translate([unit('n', [t('2024')]), plain, withMath], 'ja', {
      translators: [slow],
      signal: ac.signal,
    })
    for await (const r of it) {
      got.push(r)
      if (got.length === 1) ac.abort()
    }
    expect(byId(got, 'n')).toMatchObject({ ok: true, by: 'self' })
    expect(byId(got, 'p')).toEqual({ id: 'p', ok: false, why: { kind: 'aborted' } })
    expect(byId(got, 'm')).toEqual({ id: 'm', ok: false, why: { kind: 'aborted' } })
  })
  it('a unit with no letter is its own translation, and nothing is sent', async () => {
    const e = echo()
    const rs = await all(
      chainOf({ clock: fakeClock() }).translate([unit('n', [el('a'), t(' = 3.5 ')])], 'ja', { translators: [e] }),
    )
    expect(rs).toEqual([
      {
        id: 'n',
        ok: true,
        content: [
          { t: 'el', id: 'a' },
          { t: 'text', s: ' = 3.5 ' },
        ],
        by: 'self',
      },
    ])
    expect(e.calls).toEqual([])
  })
})

describe('the contract: fall-through is per unit', () => {
  it('in a mixed request only the mangled unit reaches translator 2 (design-a §2.4)', async () => {
    const m = mangler('drop-el')
    const e = echo()
    const rs = await all(
      chainOf({ clock: fakeClock() }).translate([withMath, plain], 'zh-Hans', { translators: [m, e] }),
    )
    expect(byId(rs, 'm')).toMatchObject({ ok: true, by: 'echo:0' })
    expect(byId(rs, 'p')).toMatchObject({ ok: true, by: m.identity })
    expect(e.sent(withMath)).toBe(1)
    expect(e.sent(plain)).toBe(0)
  })
  it('each mangling refuses only the unit it mangles; a dropped span that is not `must` is accepted unstyled (DECISION "Styled spans")', async () => {
    const styled = unit('s', [
      t('A '),
      span('b', 'bold', [t('bold')]),
      t(' word '),
      span('l', 'link', [t('here')], true),
      t('.'),
    ])
    for (const how of ['drop-el', 'double-el', 'foreign-el', 'rename-el', 'control', 'cut'] as const) {
      const long = unit('long', [t('w'.repeat(240)), el('x')])
      const rs = await all(
        chainOf({ clock: fakeClock() }).translate([withMath, long, plain], 'ja', {
          translators: [mangler(how), echo()],
        }),
      )
      const refusedOnes = rs.filter((r) => r.ok && r.by === 'echo:0').map((r) => r.id)
      // (cut: the formula's unit keeps no letter at a tenth of its words, the long one falls under the floor)
      expect(refusedOnes, how).toEqual(how === 'control' ? ['m', 'long', 'p'] : ['m', 'long'])
    }
    const lost = await all(
      chainOf({ clock: fakeClock() }).translate([styled], 'ja', { translators: [mangler('drop-span'), echo()] }),
    )
    // the link is `must`: dropped with the bold, the reply is refused
    expect(lost[0]).toMatchObject({ ok: true, by: 'echo:0' })
    const loose = unit('s2', [t('A '), span('b', 'bold', [t('bold')]), t(' word.')])
    const kept = await all(
      chainOf({ clock: fakeClock() }).translate([loose], 'ja', { translators: [mangler('drop-span'), echo()] }),
    )
    expect(kept[0]).toEqual({
      id: 's2',
      ok: true,
      by: 'mangle-drop-span:0',
      content: [
        { t: 'text', s: 'A ' },
        { t: 'text', s: 'bold' },
        { t: 'text', s: ' word.' },
      ],
    })
  })
})

describe('the contract: the re-ask (limits.reask)', () => {
  it('reask 1 asks a refused unit alone once more, then falls through; reask 0 never does', async () => {
    let n = 0
    const flaky = (reask: 0 | 1) =>
      fakeTranslator({
        identity: `flaky${reask}:0`,
        limits: { reask },
        reply: (out) => (n++ === 0 ? out.filter((p) => p.t !== 'el') : out),
      })
    n = 0
    const once = flaky(1)
    const rs = await all(chainOf({ clock: fakeClock() }).translate([withMath], 'ja', { translators: [once, echo()] }))
    expect(rs[0]).toMatchObject({ ok: true, by: once.identity })
    expect(once.calls.map((c) => c.length)).toEqual([1, 1])
    n = 0
    const never = flaky(0)
    const rs0 = await all(chainOf({ clock: fakeClock() }).translate([withMath], 'ja', { translators: [never, echo()] }))
    expect(rs0[0]).toMatchObject({ ok: true, by: 'echo:0' })
    expect(never.calls.length).toBe(1)
    const always = mangler('drop-el', 'always:0', { limits: { reask: 1 } })
    const rs2 = await all(
      chainOf({ clock: fakeClock() }).translate([withMath], 'ja', { translators: [always, echo()] }),
    )
    expect(rs2[0]).toMatchObject({ ok: true, by: 'echo:0' })
    expect(always.calls.length).toBe(2)
  })
})

describe('the contract: the runs floor', () => {
  it('with every translator refusing, the stretches go through the chain and the elements stay in source order', async () => {
    const u = unit('r', [
      t('First words here '),
      el('a'),
      t(' then more words '),
      span('l', 'link', [t('linked text')], true),
      t(' x.'),
    ])
    // a translator that refuses anything holding an element, and answers text alone in capitals
    const upper = fakeTranslator({
      identity: 'upper:0',
      reply: (out) =>
        out.some((p) => p.t !== 'text')
          ? []
          : out.map((p) => (p.t === 'text' ? { t: 'text', s: p.s.toUpperCase() } : p)),
    })
    const rs = await all(chainOf({ clock: fakeClock() }).translate([u], 'ja', { translators: [upper] }))
    expect(rs[0]).toEqual({
      id: 'r',
      ok: true,
      by: 'runs:upper:0',
      content: [
        { t: 'text', s: 'FIRST WORDS HERE ' },
        { t: 'el', id: 'a' },
        { t: 'text', s: ' THEN MORE WORDS ' },
        { t: 'span', id: 'l', content: [{ t: 'text', s: 'LINKED TEXT' }] },
        { t: 'text', s: ' x.' },
      ],
    })
  })
  it('`runs:mixed` when its stretches came from two translators; refused when none came back', async () => {
    const u = unit('r', [t('alpha words '), el('a'), t(' omega words')])
    const onlyAlpha = fakeTranslator({
      identity: 'alpha:0',
      reply: (out) => (out.length === 1 && out[0]?.t === 'text' && out[0].s.startsWith('alpha') ? out : []),
    })
    const onlyOmega = fakeTranslator({
      identity: 'omega:0',
      reply: (out) => (out.length === 1 && out[0]?.t === 'text' && out[0].s.startsWith('omega') ? out : []),
    })
    const rs = await all(chainOf({ clock: fakeClock() }).translate([u], 'ja', { translators: [onlyAlpha, onlyOmega] }))
    expect(rs[0]).toMatchObject({ ok: true, by: 'runs:mixed' })
    const nothing = fakeTranslator({ identity: 'nothing:0', reply: () => [] })
    const rs2 = await all(chainOf({ clock: fakeClock() }).translate([u], 'ja', { translators: [nothing] }))
    expect(rs2[0]).toEqual({ id: 'r', ok: false, why: { kind: 'refused' } })
  })
})

describe('DECISION "Faults": each remedy, on a fake clock', () => {
  it('again: three tries with backoff 500 ms × 3^(n−1) × (0.5 + random), then the next translator', async () => {
    const clock = fakeClock()
    const down = fakeTranslator({
      identity: 'down:0',
      script: () => ({ fault: new Fault('again', 'network', 'reset') }),
    })
    const rs = await all(chainOf({ clock }).translate([plain], 'ja', { translators: [down, echo()] }))
    expect(rs[0]).toMatchObject({ ok: true, by: 'echo:0' })
    expect(down.calls.length).toBe(ATTEMPTS)
    expect(clock.sleeps.filter((ms) => ms === 500 || ms === 1_500)).toEqual([500, 1_500])
  })
  it('again with `tries`: a malformed reply is asked once more, then passed on', async () => {
    const bad = fakeTranslator({
      identity: 'bad:0',
      script: () => ({ fault: new Fault('again', 'malformed', 'not JSON', { tries: 2 }) }),
    })
    const rs = await all(chainOf({ clock: fakeClock() }).translate([plain], 'ja', { translators: [bad] }))
    expect(rs[0]).toEqual({ id: 'p', ok: false, why: { kind: 'unavailable' } })
    expect(bad.calls.length).toBe(2)
  })
  it('again: a request past callMs is cut and tried again as a timeout', async () => {
    const clock = fakeClock()
    const hang = fakeTranslator({
      identity: 'hang:0',
      limits: { callMs: 1_000 },
      script: ({ n }) => (n === 1 ? { hang: true } : undefined),
    })
    const rs = await all(chainOf({ clock }).translate([plain], 'ja', { translators: [hang] }))
    expect(rs[0]).toMatchObject({ ok: true, by: 'hang:0' })
    expect(hang.calls.length).toBe(2)
  })
  it('cool: the request moves on at once, and later calls pass the cooling translator by', async () => {
    const clock = fakeClock()
    const rate = fakeTranslator({
      identity: 'rate:0',
      script: ({ n }) => (n === 1 ? { fault: new Fault('cool', 'rate', '429', { retryAfterMs: 30_000 }) } : undefined),
    })
    const chain = chainOf({ clock })
    const e = echo()
    const first = await all(chain.translate([plain], 'ja', { translators: [rate, e] }))
    expect(first[0]).toMatchObject({ ok: true, by: 'echo:0' })
    const notes: Note[] = []
    const second = await all(chain.translate([withMath], 'ja', { translators: [rate, e], note: (n) => notes.push(n) }))
    expect(second[0]).toMatchObject({ ok: true, by: 'echo:0' })
    expect(rate.calls.length).toBe(1)
    expect(notes).toContainEqual({
      kind: 'passed',
      by: 'rate:0',
      id: 'm',
      why: { kind: 'unavailable', retryAfterMs: 30_000 },
    })
    // a second chain shares nothing (DECISION "Where pacing state lives")
    const fresh = await all(chainOf({ clock }).translate([withMath], 'ja', { translators: [rate, e] }))
    expect(fresh[0]).toMatchObject({ ok: true, by: 'rate:0' })
  })
  it("cool: the chain's last translator waits a cooldown out, twice at most", async () => {
    const clock = fakeClock()
    const rate = fakeTranslator({
      identity: 'rate:0',
      script: ({ n }) => (n === 1 ? { fault: new Fault('cool', 'rate', '429', { retryAfterMs: 2_000 }) } : undefined),
    })
    const rs = await all(chainOf({ clock }).translate([plain], 'ja', { translators: [rate] }))
    expect(rs[0]).toMatchObject({ ok: true, by: 'rate:0' })
    const always = fakeTranslator({
      identity: 'always:0',
      script: () => ({ fault: new Fault('cool', 'rate', '429', { retryAfterMs: 2_000 }) }),
    })
    const rs2 = await all(chainOf({ clock }).translate([plain], 'ja', { translators: [always] }))
    expect(rs2[0]).toEqual({ id: 'p', ok: false, why: { kind: 'unavailable', retryAfterMs: 2_000 } })
    expect(always.calls.length).toBe(3)
  })
  it('halve: a request is halved down to the unit at fault, which this translator refuses', async () => {
    const units = many(8)
    const bad = units[5] as UnitIn
    const picky = fakeTranslator({
      identity: 'picky:0',
      script: ({ wires }) =>
        wires.includes(JSON.stringify(bad.content))
          ? { fault: new Fault('halve', 'overload', 'too large') }
          : undefined,
    })
    const rs = await all(chainOf({ clock: fakeClock() }).translate(units, 'ja', { translators: [picky, echo()] }))
    expect(rs.filter((r) => r.ok && r.by === 'picky:0').length).toBe(7)
    expect(byId(rs, bad.id)).toMatchObject({ ok: true, by: 'echo:0' })
    // 8 → its halves; the first half answers, the second is halved again, down to the unit at fault alone
    expect(picky.calls.map((c) => c.length)).toEqual([8, 4, 4, 2, 1, 1, 2])
  })
  it('pass: the next translator; off: unconfigured only when every translator is off', async () => {
    const pass = fakeTranslator({
      identity: 'pass:0',
      script: () => ({ fault: new Fault('pass', 'malformed', 'odd') }),
    })
    const r1 = await all(chainOf({ clock: fakeClock() }).translate([plain], 'ja', { translators: [pass, echo()] }))
    expect(r1[0]).toMatchObject({ ok: true, by: 'echo:0' })
    const offA = fakeTranslator({ identity: 'offa:0', script: () => ({ fault: new Fault('off', 'no-key', 'no key') }) })
    const chain = chainOf({ clock: fakeClock() })
    const r2 = await all(chain.translate([plain], 'ja', { translators: [offA] }))
    expect(r2[0]).toEqual({ id: 'p', ok: false, why: { kind: 'unconfigured', code: 'no-key' } })
    // off for its object: the next call asks it nothing; a new object (a changed configuration) is asked again
    const r3 = await all(chain.translate([withMath], 'ja', { translators: [offA, echo()] }))
    expect(r3[0]).toMatchObject({ ok: true, by: 'echo:0' })
    expect(offA.calls.length).toBe(1)
    const unsupported = fakeTranslator({ identity: 'nolang:0', supports: () => false })
    const r4 = await all(chain.translate([plain], 'xx', { translators: [unsupported] }))
    expect(r4[0]).toEqual({ id: 'p', ok: false, why: { kind: 'unconfigured', code: 'no-language' } })
  })
  it('a `supports` that never answers is bounded: the translator is passed over (hard rule 3)', async () => {
    const mute = fakeTranslator({ identity: 'mute:0', supports: () => new Promise<boolean>(() => {}) })
    const rs = await all(chainOf({ clock: fakeClock() }).translate([plain], 'ja', { translators: [mute, echo()] }))
    expect(rs[0]).toMatchObject({ ok: true, by: 'echo:0' })
  })
  it('the breaker opens at 50 % of 20 outcomes, skips its translator for 5 minutes, probes once, and never skips the last', async () => {
    const clock = fakeClock()
    let healthy = false
    const flaky = fakeTranslator({
      identity: 'flaky:0',
      limits: { units: 1 },
      script: () => (healthy ? undefined : { fault: new Fault('again', 'network', 'reset') }),
    })
    const chain = chainOf({ clock })
    const e = echo()
    await all(chain.translate(many(7, 'a'), 'ja', { translators: [flaky, e] }))
    // 7 units × 3 tries = 21 failed outcomes: open
    expect(flaky.calls.length).toBe(21)
    await all(chain.translate(many(3, 'b'), 'ja', { translators: [flaky, e] }))
    expect(flaky.calls.length).toBe(21)
    // the last translator is asked all the same
    const asLast = await all(chain.translate(many(1, 'c'), 'ja', { translators: [flaky] }))
    expect(asLast[0]).toMatchObject({ ok: false, why: { kind: 'unavailable' } })
    expect(flaky.calls.length).toBe(24)
    await clock.advance(BREAKER.coolMs)
    healthy = true
    const probe = await all(chain.translate(many(2, 'd'), 'ja', { translators: [flaky, e] }))
    expect(probe.every((r) => r.ok && r.by === 'flaky:0')).toBe(true)
  })
})

describe('the contract: the store', () => {
  it("a second identical call sends nothing; its results equal the first's", async () => {
    const store = memoryStore()
    const e = echo()
    const chain = chainOf({ store, clock: fakeClock() })
    const units = [withMath, plain]
    const a = await all(chain.translate(units, 'ja', { translators: [e] }))
    const sent = e.calls.length
    const b = await all(chainOf({ store, clock: fakeClock() }).translate(units, 'ja', { translators: [e] }))
    expect(e.calls.length).toBe(sent)
    expect([...b].sort((x, y) => x.id.localeCompare(y.id))).toEqual([...a].sort((x, y) => x.id.localeCompare(y.id)))
    expect(store.reads.length).toBe(2)
    expect(store.writes.length).toBe(1)
  })
  it('a reply once accepted and now refused is asked again, without sending first', async () => {
    const store = memoryStore()
    const e = echo()
    await all(chainOf({ store, clock: fakeClock() }).translate([plain], 'ja', { translators: [e] }))
    e.strict = true
    const rs = await all(
      chainOf({ store, clock: fakeClock() }).translate([plain], 'ja', { translators: [e, echo('echo:1')] }),
    )
    expect(rs[0]).toMatchObject({ ok: true, by: 'echo:1' })
    expect(e.calls.length).toBe(2)
  })
  it('only accepted replies are stored, at most 64 KiB each', async () => {
    const store = memoryStore()
    await all(
      chainOf({ store, clock: fakeClock() }).translate([withMath, plain], 'ja', {
        translators: [mangler('drop-el'), echo()],
      }),
    )
    expect([...store.entries.keys()].filter((k) => k.includes('mangle-drop-el:0')).length).toBe(1)
    expect([...store.entries.keys()].filter((k) => k.includes('echo:0')).length).toBe(1)
  })
  it('the key moves with the target, the identity, the wire bytes, and the context only for a translator that reads it', () => {
    const e = echo()
    const c = fakeTranslator({ identity: 'ctx:0', context: true })
    const base = keyOf(e, 'ja', 'w')
    expect(keyOf(e, 'ko', 'w')).not.toBe(base)
    expect(keyOf(echo('echo:9'), 'ja', 'w')).not.toBe(base)
    expect(keyOf(e, 'ja', 'w2')).not.toBe(base)
    expect(keyOf(e, 'ja', 'w', { title: 'A' })).toBe(base)
    expect(keyOf(c, 'ja', 'w', { title: 'A' })).not.toBe(keyOf(c, 'ja', 'w', { title: 'B' }))
    expect(base.startsWith('t1|echo:0|ja|')).toBe(true)
  })
  it("a section and a glossary key a context translator's entries, and a context without them keys as before", () => {
    const c = fakeTranslator({ identity: 'ctx:0', context: true })
    const was = keyOf(c, 'ja', 'w', { title: 'A' })
    // (the digest of [title, abstract, terms] as it was before the two fields existed)
    expect(was.split('|')[4]).toBe(sha256Hex(JSON.stringify(['A', null, null])))
    expect(keyOf(c, 'ja', 'w', { title: 'A', section: 'Intro' })).not.toBe(was)
    expect(keyOf(c, 'ja', 'w', { title: 'A', glossary: [{ term: 'x', translation: 'y' }] })).not.toBe(was)
    expect(keyOf(c, 'ja', 'w', { title: 'A', glossary: [{ term: 'x', translation: 'y' }] })).not.toBe(
      keyOf(c, 'ja', 'w', { title: 'A', glossary: [{ term: 'x', translation: 'z' }] }),
    )
    expect(keyOf(echo(), 'ja', 'w', { title: 'A', section: 'Intro' })).toBe(keyOf(echo(), 'ja', 'w'))
  })
})

describe("the contract: a host's note says, per unit, why each translator before the answer gave none", () => {
  it('a refusal, an unavailable translator, one off and one that does not serve the target are each told with the id', async () => {
    const clock = fakeClock()
    const off = fakeTranslator({
      identity: 'off:0',
      script: () => ({ fault: new Fault('off', 'no-key', 'no key') }),
    })
    const unserved = fakeTranslator({ identity: 'unserved:0', supports: () => false })
    const notes: Note[] = []
    const chain = chainOf({ clock })
    const translators = [off, unserved, mangler('drop-el', 'mangle:0'), echo()]
    const rs = await all(chain.translate([withMath], 'ja', { translators, note: (n) => notes.push(n) }))
    expect(rs[0]).toMatchObject({ ok: true, by: 'echo:0' })
    const passed = notes.filter((n) => n.kind === 'passed')
    expect(passed).toContainEqual({
      kind: 'passed',
      by: 'off:0',
      id: 'm',
      why: { kind: 'unconfigured', code: 'no-key' },
    })
    expect(passed).toContainEqual({
      kind: 'passed',
      by: 'unserved:0',
      id: 'm',
      why: { kind: 'unconfigured', code: 'no-language' },
    })
    expect(passed).toContainEqual({ kind: 'passed', by: 'mangle:0', id: 'm', why: { kind: 'refused' } })
    // the next call: the translator off for its object is told as off before anything is asked
    const later: Note[] = []
    await all(chain.translate([plain], 'ja', { translators, note: (n) => later.push(n) }))
    expect(later).toContainEqual({
      kind: 'passed',
      by: 'off:0',
      id: 'p',
      why: { kind: 'unconfigured', code: 'no-key' },
    })
  })
  it("the runs floor's stretches are told by the unit's id and the stretch's", async () => {
    const notes: Note[] = []
    const rs = await all(
      chainOf({ clock: fakeClock() }).translate([withMath], 'ja', {
        translators: [mangler('drop-el', 'mangle:0')],
        note: (n) => notes.push(n),
      }),
    )
    expect(rs[0]).toMatchObject({ ok: true, by: 'runs:mangle:0' })
    const ids = notes.flatMap((n) => (n.kind === 'passed' ? [n.id] : []))
    expect(ids).toContain('m')
    expect(ids.every((id) => id === 'm' || id.startsWith('m~'))).toBe(true)
  })
})

describe('the contract: equal content sent once', () => {
  it('two units of equal content and different ids make one send', async () => {
    const e = echo()
    const twin = unit('twin', plain.content as never)
    const rs = await all(chainOf({ clock: fakeClock() }).translate([plain, twin], 'ja', { translators: [e] }))
    expect(rs.length).toBe(2)
    expect(e.sent(plain)).toBe(1)
  })
  it('equal content across concurrent calls is sent once; aborting one caller keeps the unit for the other', async () => {
    const clock = fakeClock()
    const slow = fakeTranslator({ identity: 'slow:0', clock, script: () => ({ delayMs: 1_000 }) })
    const chain = chainOf({ clock })
    const ac = controller()
    const a = all(chain.translate([plain], 'ja', { translators: [slow], signal: ac.signal }))
    const b = all(chain.translate([unit('p2', plain.content as never)], 'ja', { translators: [slow] }))
    await Promise.resolve()
    ac.abort()
    const [ra, rb] = await Promise.all([a, b])
    expect(ra[0]).toEqual({ id: 'p', ok: false, why: { kind: 'aborted' } })
    expect(rb[0]).toMatchObject({ ok: true, by: 'slow:0' })
    expect(slow.sent(plain)).toBe(1)
  })
})

describe('DECISION "Priority": array order within a call, the latest call first across calls', () => {
  it('the later call is served first', async () => {
    const clock = fakeClock({ auto: false })
    const slow = fakeTranslator({
      identity: 'slow:0',
      clock,
      limits: { inFlight: 1, units: 1 },
      script: () => ({ delayMs: 100 }),
    })
    const chain = chainOf({ clock })
    let done = false
    const early = all(chain.translate(many(3, 'early'), 'ja', { translators: [slow] }))
    while (slow.calls.length < 1) await tick()
    const late = all(chain.translate(many(2, 'late'), 'ja', { translators: [slow] }))
    const both = Promise.all([early, late]).then(() => (done = true))
    for (let n = 0; !done && n < 50; n++) {
      await tick()
      await clock.advance(100)
    }
    await both
    const order = slow.calls.map((c) => (JSON.parse(c[0] as string) as { s: string }[])[0]?.s.split(' ')[2])
    expect(order).toEqual(['early0', 'late0', 'late1', 'early1', 'early2'])
  })
})

describe('the contract: limits', () => {
  it('no request exceeds chars, units or inFlight; a unit over chars goes alone', async () => {
    const clock = fakeClock()
    let live = 0
    let peak = 0
    const fake = fakeTranslator({
      identity: 'lim:0',
      clock,
      limits: { chars: 300, units: 3, inFlight: 2 },
      script: () => ({ delayMs: 10 }),
    })
    const send = fake.send.bind(fake)
    fake.send = async function* (wires, call, signal) {
      live++
      peak = Math.max(peak, live)
      try {
        yield* send(wires, call, signal)
      } finally {
        live--
      }
    }
    const big = unit('big', [t('x'.repeat(400))])
    const gate = countingGate()
    await all(chainOf({ clock, gate }).translate([...many(10), big], 'ja', { translators: [fake] }))
    for (const c of fake.calls) {
      expect(c.length).toBeLessThanOrEqual(3)
      if (c.length > 1) expect(c.reduce((n, w) => n + w.length, 0)).toBeLessThanOrEqual(300)
    }
    expect(fake.calls.filter((c) => c.some((w) => w.length > 300))).toEqual([[JSON.stringify(big.content)]])
    expect(peak).toBeLessThanOrEqual(2)
    expect(gate.peak.get('lim:0')).toBeLessThanOrEqual(2)
    expect(gate.released.every((r) => r.outcome === 'ok')).toBe(true)
  })
  it('a gate that throws lets the request through (it fails open)', async () => {
    const rs = await all(
      chainOf({ clock: fakeClock(), gate: countingGate({ fail: true }) }).translate([plain], 'ja', {
        translators: [echo()],
      }),
    )
    expect(rs[0]).toMatchObject({ ok: true })
  })
})

describe('the contract: streams', () => {
  it('the units of a stream cut midway are kept, and the rest are asked again', async () => {
    const units = many(4)
    const cut = fakeTranslator({
      identity: 'cut:0',
      script: ({ n }) => (n === 1 ? { fault: new Fault('again', 'network', 'reset'), after: 2 } : undefined),
    })
    const rs = await all(chainOf({ clock: fakeClock() }).translate(units, 'ja', { translators: [cut] }))
    expect(rs.every((r) => r.ok && r.by === 'cut:0')).toBe(true)
    expect(cut.calls.map((c) => c.length)).toEqual([4, 2])
  })
  it('the first result arrives before the stream ends', async () => {
    const clock = fakeClock()
    let ended = false
    const streaming: Translator = {
      ...echo('stream:0'),
      async *send(wires) {
        for (const [i, w] of wires.entries()) {
          yield [i, JSON.stringify({ content: JSON.parse(w) })] as const
          await clock.sleep(1_000, { aborted: false, addEventListener() {}, removeEventListener() {} })
        }
        ended = true
      },
    }
    const it = chainOf({ clock })
      .translate(many(3), 'ja', { translators: [streaming] })
      [Symbol.asyncIterator]()
    const first = await it.next()
    expect(first.value).toMatchObject({ ok: true })
    expect(ended).toBe(false)
    let n = 1
    while (!(await it.next()).done) n++
    expect(n).toBe(3)
  })
})

describe('the contract: sentences that reconstruct are kept, others dropped while the translation stays', () => {
  it('keeps valid ones for a unit that lights by sentence, drops invalid ones', async () => {
    const u = unit('s', [t('One. Two.')], true)
    const good = fakeTranslator({ identity: 'good:0', sentences: () => ({ src: [5], tr: [5] }) })
    const bad = fakeTranslator({ identity: 'bad:0', sentences: () => ({ src: [5, 2], tr: [5, 2] }) })
    expect((await all(chainOf({ clock: fakeClock() }).translate([u], 'ja', { translators: [good] })))[0]).toMatchObject(
      { ok: true, sentences: { src: [5], tr: [5] } },
    )
    const r = (await all(chainOf({ clock: fakeClock() }).translate([u], 'ja', { translators: [bad] })))[0]
    expect(r).toMatchObject({ ok: true, by: 'bad:0' })
    expect(r && 'sentences' in r).toBe(false)
  })
})

describe("DECISION \"A row's identity\": translators' identities and behaviour digests plus the acceptance rule's digest", () => {
  it('moves with an identity, a digest, the re-ask, and their order; not with anything else', async () => {
    const a = echo('a:0')
    const b = echo('b:0')
    const base = await identityOf([a, b])
    expect(await identityOf([a, b])).toBe(base)
    expect(await identityOf([b, a])).not.toBe(base)
    expect(await identityOf([{ ...a, digest: 'other' }, b])).not.toBe(base)
    expect(await identityOf([{ ...a, limits: { ...a.limits, reask: 1 } }, b])).not.toBe(base)
    expect(await identityOf([{ ...a, limits: { ...a.limits, inFlight: 99 } }, b])).toBe(base)
    expect(base).toMatch(/^[0-9a-f]{32}$/)
    expect(ACCEPT_DIGEST).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('the contract: no secret in any key, identity, result, note or error', () => {
  it('a marker key passed to an adapter reaches none of them', async () => {
    const SECRET = 'sk-SECRET-0123456789'
    const store = memoryStore()
    const notes: Note[] = []
    const keyed = fakeTranslator({
      identity: 'llm:0123456789abcdef',
      script: ({ n }) => (n === 1 ? { fault: new Fault('again', 'network', 'reset (key redacted)') } : undefined),
    })
    const rs = await all(
      chainOf({ store, clock: fakeClock() }).translate([withMath, plain], 'ja', {
        translators: [keyed],
        note: (n) => notes.push(n),
      }),
    )
    const seen = JSON.stringify([rs, notes, [...store.entries.keys()], await identityOf([keyed]), keyed.identity])
    expect(seen).not.toContain(SECRET)
  })
})

describe('DECISION "Policy": fixed inside; the caller bounds a call with its signal', () => {
  it('a hanging translator holds a call only as long as the caller lets it', async () => {
    const clock = fakeClock()
    const hang = fakeTranslator({ identity: 'hang:0', limits: { callMs: 60_000 }, script: () => ({ hang: true }) })
    const ac = controller()
    const p = all(chainOf({ clock }).translate([plain], 'ja', { translators: [hang], signal: ac.signal }))
    await clock.advance(1_000)
    ac.abort()
    expect((await p)[0]).toEqual({ id: 'p', ok: false, why: { kind: 'aborted' } })
  })
})

describe('DECISION "Where pacing state lives": an object the host makes once (chainOf), no module state', () => {
  it('one chain shares its cooldowns across calls; another chain shares nothing', async () => {
    const clock = fakeClock()
    const rate = fakeTranslator({
      identity: 'rate:1',
      script: ({ n }) => (n === 1 ? { fault: new Fault('cool', 'rate', '429', { retryAfterMs: 60_000 }) } : undefined),
    })
    const one = chainOf({ clock })
    await all(one.translate([plain], 'ja', { translators: [rate, echo()] }))
    await all(one.translate([withMath], 'ja', { translators: [rate, echo()] }))
    expect(rate.calls.length).toBe(1)
    const other = await all(chainOf({ clock }).translate([withMath], 'ja', { translators: [rate, echo()] }))
    expect(other[0]).toMatchObject({ ok: true, by: 'rate:1' })
  })
})

describe('DECISION "Who builds translators": the host passes Translator objects; the package builds the free engines over the fetch it is given', () => {
  it('microsoft({ fetch }) asks through that fetch alone, through the chain', async () => {
    const f = scriptedFetch((_url, init) => ({
      status: 200,
      body: JSON.stringify((JSON.parse(init.body) as string[]).map((text) => ({ translations: [{ text }] }))),
    }))
    const rs = await all(
      chainOf({ clock: fakeClock() }).translate([withMath, plain], 'zh-Hans', {
        translators: [microsoft({ fetch: f.fetch })],
      }),
    )
    expect(rs.every((r) => r.ok && r.by.startsWith('microsoft:'))).toBe(true)
    expect(f.requests.length).toBe(1)
    expect(f.requests[0]?.url.startsWith('https://edge.microsoft.com/translate/translatetext?')).toBe(true)
  })
})

describe('DECISION "Rows": the package yields results; the host stores rows and skips units it has', () => {
  it('results are plain data a host can write as rows, by unit id; the package keeps none', async () => {
    const store = memoryStore()
    const rs = await all(
      chainOf({ store, clock: fakeClock() }).translate([withMath, plain], 'ja', { translators: [echo()] }),
    )
    expect(JSON.parse(JSON.stringify(rs))).toEqual(rs)
    expect(rs.map((r) => r.id).sort()).toEqual(['m', 'p'])
    // what the store holds is raw replies by key, never a row by unit id
    expect(
      [...store.entries.keys()].every((k) => k.startsWith('t1|') && !k.includes('|m|') && !k.includes('|p|')),
    ).toBe(true)
    // a host that has the row for one unit asks only for the other
    const e = echo()
    await all(chainOf({ clock: fakeClock() }).translate([plain], 'ja', { translators: [e] }))
    expect(e.calls).toEqual([[JSON.stringify(plain.content)]])
  })
})

describe('the contract: an iterator a host leaves early lets its work go', () => {
  it('a request waited for by no one else is cut when the host stops reading', async () => {
    const clock = fakeClock()
    let cut = false
    const hang = fakeTranslator({
      identity: 'hang:9',
      limits: { callMs: 600_000, units: 1 },
      script: () => ({ hang: true }),
    })
    const send = hang.send.bind(hang)
    hang.send = async function* (wires, call, signal) {
      signal.addEventListener('abort', () => (cut = true), { once: true })
      yield* send(wires, call, signal)
    }
    const it = chainOf({ clock })
      .translate([unit('n', [t('2024')]), plain], 'ja', { translators: [hang] })
      [Symbol.asyncIterator]()
    expect((await it.next()).value).toMatchObject({ id: 'n', by: 'self' })
    await it.return?.(undefined)
    await tick()
    expect(cut).toBe(true)
  })
})
