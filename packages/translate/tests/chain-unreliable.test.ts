// Hard rule 3 at the chain's own seams: a translator, a gate or a probe that does not keep its side of the contract
// costs its own answer and nothing else. Each case is a port that misbehaves in a way its type allows.
import { describe, expect, it } from 'vitest'
import { chainOf } from '../src/chain.ts'
import type { Gate, Result, Translator } from '../src/contract.ts'
import { echo, fakeTranslator, NEVER } from '../src/testing/fakes.ts'
import { countingGate, fakeClock } from '../src/testing/ports.ts'
import { el, t, unit } from './pieces.ts'

const all = async (it: AsyncIterable<Result>): Promise<Result[]> => {
  const out: Result[] = []
  for await (const r of it) out.push(r)
  return out
}
const tick = () =>
  new Promise<void>((r) =>
    (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, 0),
  )
const plain = unit('p', [t('Plain words only.')])
const withMath = unit('m', [t('We fix '), el('x', 'math'), t(' here.')])

describe('hard rule 3: a port that breaks its contract costs its own answer only', () => {
  it('a `send` that never settles, even after its signal aborts, is left at the request limit and the unit falls through', async () => {
    const deaf: Translator = {
      ...echo('deaf:0'),
      // an endpoint (the built-in translator, by assumption) that ignores the signal it was given
      async *send() {
        await new Promise<never>(() => {})
      },
    }
    const rs = await all(chainOf({ clock: fakeClock() }).translate([plain], 'ja', { translators: [deaf, echo()] }))
    expect(rs[0]).toMatchObject({ id: 'p', ok: true, by: 'echo:0' })
  })

  it('a lease the gate grants after the chain stopped waiting for it is given back', async () => {
    const clock = fakeClock()
    const inner = countingGate()
    const slow: Gate = {
      async acquire(by, signal, last) {
        await clock.sleep(1_500, NEVER)
        return inner.acquire(by, signal, last)
      },
      release: (lease, outcome, coolMs) => inner.release(lease, outcome, coolMs),
    }
    const rs = await all(chainOf({ clock, gate: slow }).translate([plain], 'ja', { translators: [echo()] }))
    expect(rs[0]).toMatchObject({ ok: true })
    for (let i = 0; i < 5; i++) await tick()
    expect(inner.out.get('echo:0')).toBe(0)
    expect(inner.released.map((r) => r.outcome)).toEqual(['none'])
  })

  it('a translator that does not support a target yet is asked again on a later call (a language pack that arrived)', async () => {
    let ready = false
    const late = fakeTranslator({ identity: 'late:0', supports: () => ready })
    const chain = chainOf({ clock: fakeClock() })
    const first = await all(chain.translate([plain], 'ja', { translators: [late, echo()] }))
    expect(first[0]).toMatchObject({ ok: true, by: 'echo:0' })
    ready = true
    const second = await all(chain.translate([withMath], 'ja', { translators: [late, echo()] }))
    expect(second[0]).toMatchObject({ ok: true, by: 'late:0' })
  })
})
