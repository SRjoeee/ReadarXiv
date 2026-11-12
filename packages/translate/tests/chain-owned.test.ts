// Every request a call starts is settled or cancelled before the call ends, and what it got in time is stored (the review of
// round B11, Codex, P2 at chain.ts's reference path). A phrase group's reference (groups.ts referencesOf) is asked of a
// markers-wire translator in the unit's batch, before the unit's reply is known; where the reply brings the group back, or is
// refused and the unit goes on to the next translator, no one waits for it. Before, such a request outlived the call: the
// host's abort no longer reached it, and its answer, written after the call's last flush, was never stored. Synthetic text,
// scripted translators, a clock that never moves on its own (no request is cut by its time).
import { describe, expect, it } from 'vitest'
import { chainOf, keyOf } from '../src/chain.ts'
import type { OutPiece, Result, Signal, Translator, UnitIn } from '../src/contract.ts'
import { echo } from '../src/testing/fakes.ts'
import { fakeClock, memoryStore } from '../src/testing/ports.ts'
import { span, t, unit } from './pieces.ts'

const tick = () =>
  new Promise<void>((r) =>
    (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(r, 0),
  )
const settle = async () => {
  for (let k = 0; k < 5; k++) await tick()
}

// (a phrase group of two words and more, not `must`: its reference is asked of a markers-wire translator)
const u = unit('u', [t('We use '), span('1', 'italic', [t('the key method')]), t(' here.')])
const v = unit('v', [t('Another unit follows.')])
const refWire = JSON.stringify([{ t: 'text', s: 'the key method' }])
const uBack: OutPiece[] = [
  { t: 'text', s: '我们在这里使用' },
  { t: 'span', id: '1', content: [{ t: 'text', s: '关键方法' }] },
  { t: 'text', s: '。' },
]
const replyOf = (wire: string): OutPiece[] =>
  wire === refWire
    ? [{ t: 'text', s: '关键方法' }]
    : wire.includes('"span"')
      ? uBack
      : [{ t: 'text', s: '另一个单元随后。' }]

/** a markers-wire translator whose wire is the unit's pieces as JSON, one wire a request: each wire answered by `reply`; one
 *  `held` names answered only once released (or its request cut). Each request kept with its signal and whether it answered */
function scripted(o: { reply?: (wire: string) => OutPiece[]; held?: readonly string[] } = {}) {
  const gates = new Map<string, { open: Promise<void>; release: () => void }>()
  for (const w of o.held ?? []) {
    let release!: () => void
    const open = new Promise<void>((r) => (release = r))
    gates.set(w, { open, release })
  }
  const requests: { wire: string; signal: Signal; done: boolean }[] = []
  const tr: Translator = {
    identity: 'probe:refs',
    digest: 'd',
    context: false,
    wire: 'markers',
    limits: { chars: 10_000, units: 1, inFlight: 8, callMs: 10_000, reask: 0 },
    supports: async () => true,
    write: (x: UnitIn) => JSON.stringify(x.content),
    read: (_x, raw) => ({ content: JSON.parse(raw) as OutPiece[] }),
    async *send(wires, _call, signal) {
      for (const [i, wire] of wires.entries()) {
        const rq = { wire, signal, done: false }
        requests.push(rq)
        const gate = gates.get(wire)
        if (gate)
          await Promise.race([
            gate.open,
            new Promise<void>((r) => signal.addEventListener('abort', () => r(), { once: true })),
          ])
        if (signal.aborted) return
        rq.done = true
        yield [i, JSON.stringify((o.reply ?? replyOf)(wire))] as const
      }
    },
  }
  const release = (wire: string) => gates.get(wire)?.release()
  const of = (wire: string) => requests.find((r) => r.wire === wire)
  return { tr, requests, release, of }
}
const keysWritten = (store: ReturnType<typeof memoryStore>) => store.writes.flat().map(([k]) => k)

describe('a call owns every request it starts', () => {
  it('a reference no one waits for (the reply brought its group back) does not outlive the call', async () => {
    const p = scripted({ held: [refWire] })
    const store = memoryStore()
    const host = new AbortController()
    const rs: Result[] = []
    for await (const r of chainOf({ store, clock: fakeClock({ auto: false }) }).translate([u], 'zh-Hans', {
      translators: [p.tr],
      signal: host.signal as unknown as Signal,
    }))
      rs.push(r)
    // the unit is translated, its group brought back by the reply: the reference was never needed
    expect(rs).toEqual([{ id: 'u', ok: true, content: uBack, by: 'probe:refs' }])
    // the iterator has ended: the reference's request is cancelled, not left running out of the host's reach
    const ref = p.of(refWire)
    expect(ref?.done).toBe(false)
    expect(ref?.signal.aborted).toBe(true)
    // the host leaves and the held answer is let go after: nothing more is asked, written or answered
    host.abort()
    p.release(refWire)
    await settle()
    expect(ref?.done).toBe(false)
    expect(store.writes).toHaveLength(1)
    expect(keysWritten(store)).toEqual([keyOf(p.tr, 'zh-Hans', JSON.stringify(u.content))])
  })

  it('a reference that answered while the call still ran is stored with the call’s writes', async () => {
    // (the call waits for the second unit; the first unit's reference, which no one awaits, answers before it)
    const vWire = JSON.stringify(v.content)
    const p = scripted({ held: [refWire, vWire] })
    const store = memoryStore()
    const call = chainOf({ store, clock: fakeClock({ auto: false }) }).translate([u, v], 'zh-Hans', {
      translators: [p.tr],
    })
    const rs: Result[] = []
    const consumed = (async () => {
      for await (const r of call) rs.push(r)
    })()
    await settle()
    p.release(refWire)
    await settle()
    p.release(vWire)
    await consumed
    expect(rs.map((r) => [r.id, r.ok])).toEqual([
      ['u', true],
      ['v', true],
    ])
    expect(p.of(refWire)?.done).toBe(true)
    expect(keysWritten(store).sort()).toEqual(
      [
        keyOf(p.tr, 'zh-Hans', JSON.stringify(u.content)),
        keyOf(p.tr, 'zh-Hans', vWire),
        keyOf(p.tr, 'zh-Hans', refWire),
      ].sort(),
    )
  })

  it('a reference asked of a translator whose reply is refused does not outlive the call when the next one answers', async () => {
    // (the markers-wire translator gives no letter back: refused, the unit goes on to the next; its reference was asked)
    const p = scripted({
      held: [refWire],
      reply: (w) => (w === refWire ? [{ t: 'text', s: 'x' }] : [{ t: 'text', s: '…' }]),
    })
    const store = memoryStore()
    const rs: Result[] = []
    for await (const r of chainOf({ store, clock: fakeClock({ auto: false }) }).translate([u], 'zh-Hans', {
      translators: [p.tr, echo('echo:next')],
    }))
      rs.push(r)
    expect(rs.map((r) => [r.id, r.ok, r.ok ? r.by : null])).toEqual([['u', true, 'echo:next']])
    expect(p.of(refWire)?.signal.aborted).toBe(true)
    p.release(refWire)
    await settle()
    expect(p.of(refWire)?.done).toBe(false)
    expect(keysWritten(store)).not.toContain(keyOf(p.tr, 'zh-Hans', refWire))
  })

  it('a host that stops reading before the end leaves no request of the call running', async () => {
    const vWire = JSON.stringify(v.content)
    const p = scripted({ held: [refWire, vWire] })
    const call = chainOf({ clock: fakeClock({ auto: false }) }).translate([u, v], 'zh-Hans', { translators: [p.tr] })
    for await (const r of call) {
      expect(r.id).toBe('u')
      break
    }
    expect(p.requests.length).toBeGreaterThanOrEqual(3)
    for (const rq of p.requests) expect(rq.done || rq.signal.aborted).toBe(true)
  })
})
