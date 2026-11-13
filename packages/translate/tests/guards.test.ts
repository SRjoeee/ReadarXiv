// The chain's two bounds that no case of chain-cases.ts reached, each fed the input that passes it and held to what it does
// (the coordinator's ruling of 2026-11-14 on the rule ledger: a bound no input takes is untested code; lab/rules' recording
// found neither taking its other side): one call storing more replies than WRITE_EVERY, and a gate that turns the last
// translator away naming no wait at all.
import { describe, expect, it } from 'vitest'
import { chainOf, GATE_MS, WRITE_EVERY } from '../src/chain.ts'
import type { Result } from '../src/contract.ts'
import { echo } from '../src/testing/fakes.ts'
import { fakeClock, memoryStore } from '../src/testing/ports.ts'
import { t, unit } from './pieces.ts'

const all = async (it: AsyncIterable<Result>): Promise<Result[]> => {
  const out: Result[] = []
  for await (const r of it) out.push(r)
  return out
}
const many = (n: number) => Array.from({ length: n }, (_, i) => unit(`u${i}`, [t(`Sentence number ${i} says words.`)]))

describe("the chain's buffered store writes (WRITE_EVERY)", () => {
  it('a call storing more replies than the bound writes them in batches of the bound as they come, the rest at its end', async () => {
    const store = memoryStore()
    const rs = await all(
      chainOf({ clock: fakeClock(), store }).translate(many(WRITE_EVERY + 50), 'ja', { translators: [echo()] }),
    )
    expect(rs.filter((r) => r.ok)).toHaveLength(WRITE_EVERY + 50)
    expect(store.writes.map((w) => w.length)).toEqual([WRITE_EVERY, 50])
  })
})

describe("a gate's refusal of the last translator (the chain's least wait before asking again)", () => {
  it('a refusal naming 0 ms is waited 50 ms out before the gate is asked again, never asked again at once', async () => {
    const clock = fakeClock()
    let asked = 0
    const gate = {
      acquire: async () => (asked++ === 0 ? { ok: false as const, retryInMs: 0 } : { ok: true as const, lease: 'l' }),
      release: async () => {},
    }
    const e = echo()
    const rs = await all(
      chainOf({ clock, gate }).translate([unit('p', [t('Plain words only.')])], 'ja', { translators: [e] }),
    )
    expect(rs[0]).toMatchObject({ id: 'p', ok: true })
    // (the first ask's own time-out, the least wait, the second ask's time-out: the gate asked again 50 ms on)
    const first = clock.sleeps.indexOf(GATE_MS)
    expect([asked, e.calls.length, clock.sleeps.slice(first, first + 3)]).toEqual([2, 1, [GATE_MS, 50, GATE_MS]])
  })
})
