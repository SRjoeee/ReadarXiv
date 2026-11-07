// The reader host's one function that talks to the background (src/pdf-reader/host/translate.ts): units in, one result a unit
// out (the chain's, in the background), in calls the size of the chain's batches, under one scope withdrawn when done
import { describe, expect, it } from 'vitest'
import type { Unit } from '@readarxiv/format'
import { hostTranslate } from '@/pdf-reader/host/translate'
import type { TranslationTransport } from '@/providers/transport'

const unit = (id: string, content: Unit['content']): Unit => ({ id, kind: 'para', content }) as Unit
const status = (o: Record<string, unknown> = {}) => ({ providerId: 'microsoft', chosen: 'microsoft', available: true, maxBatchChars: 1000, maxBatchItems: 2, targetLanguage: 'deu', promptId: '', revision: 'r', engine: {}, chain: ['microsoft'], demotions: [], identity: 'id-ms', ...o })
const text = (u: { content: readonly { t: string; s?: string }[] }) => u.content.map(p => p.s ?? '').join('')

/** a transport that answers each unit with its text upper-cased (an accepted result, the service named), records the calls,
 *  and fails where told: a call that cannot run, or one unit refused */
function fake(o: { status?: Record<string, unknown>; fail?: (n: number) => string | null; refuse?: string } = {}) {
  const asked: { units: { id: string }[]; target: string; scope?: string; context?: unknown }[] = []
  const cancelled: string[] = []
  const transport = {
    status: async () => status(o.status),
    cancel: async (scope: string) => { cancelled.push(scope); return 0 },
    translate: async (call: { units: { id: string; content: readonly { t: string; s?: string }[] }[]; target: string; scope?: string; context?: unknown }) => {
      asked.push(call)
      const kind = o.fail?.(asked.length)
      if (kind) return { ok: false, error: { kind, message: kind } }
      return { ok: true, cached: 0, results: call.units.map(u => (u.id === o.refuse ? { id: u.id, ok: false, why: { kind: 'refused' }, error: { kind: 'bad-request', message: 'no' } } : { id: u.id, ok: true, content: [{ t: 'text', s: text(u).toUpperCase() }], by: 'id-ms', engine: 'microsoft', kind: 'mt' })) }
    },
  } as unknown as TranslationTransport
  return { transport, asked, cancelled }
}
const all = async <T>(it: AsyncIterable<T>) => { const out: T[] = []; for await (const x of it) out.push(x); return out }

describe('the reader host translate through the background', () => {
  it('sends the units in calls the chain plans, with the target and the paper\'s context, and yields one Result a unit, in order', async () => {
    const { transport, asked, cancelled } = fake()
    const t = hostTranslate({ transport, paper: '2600.00001v1' })
    const rows = await all(t([unit('u1', [{ t: 'text', s: 'one' }]), unit('u2', [{ t: 'text', s: 'two' }]), unit('u3', [{ t: 'text', s: 'three' }])], 'de', { signal: new AbortController().signal, context: { title: 'T', abstract: 'A' } }))
    expect(rows).toEqual([{ id: 'u1', ok: true, content: [{ t: 'text', s: 'ONE' }], by: 'id-ms' }, { id: 'u2', ok: true, content: [{ t: 'text', s: 'TWO' }], by: 'id-ms' }, { id: 'u3', ok: true, content: [{ t: 'text', s: 'THREE' }], by: 'id-ms' }])
    expect(asked.map(a => a.units.length)).toEqual([2, 1])
    expect(asked.every(a => a.target === 'deu')).toBe(true)
    expect(asked[0]!.context).toEqual({ paperTitle: 'T', abstract: 'A' })
    // the scope withdrawn once the units are given
    expect(cancelled).toContain(asked[0]!.scope)
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
  it('a call that cannot run stops the run: what came is given, the rest unavailable', async () => {
    const { transport } = fake({ fail: n => (n === 2 ? 'network' : null) })
    const rows = await all(hostTranslate({ transport, paper: 'p' })([unit('u1', [{ t: 'text', s: 'a' }]), unit('u2', [{ t: 'text', s: 'b' }]), unit('u3', [{ t: 'text', s: 'c' }])], 'de', { signal: new AbortController().signal }))
    expect(rows.map(r => r.ok)).toEqual([true, true, false])
    expect(rows[2]).toEqual({ id: 'u3', ok: false, why: { kind: 'unavailable' } })
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
