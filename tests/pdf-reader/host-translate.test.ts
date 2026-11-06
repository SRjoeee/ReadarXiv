import { describe, expect, it } from 'vitest'
import type { Unit } from '@readarxiv/format'
import { hostTranslate, outOf, runsOf } from '@/pdf-reader/host/translate'
import type { TranslationTransport } from '@/providers/transport'

const unit = (id: string, content: Unit['content']): Unit => ({ id, kind: 'para', content }) as Unit
const status = (o: Record<string, unknown> = {}) => ({ providerId: 'microsoft', chosen: 'microsoft', available: true, maxBatchChars: 1000, maxBatchItems: 2, renderPath: 'markers', targetLanguage: 'deu', promptId: '', revision: 'r', engine: {}, chain: ['microsoft'], demotions: [], identity: 'id-ms', ...o })

/** a transport that answers each segment with its text upper-cased, records what it was asked, and fails where told */
function fake(o: { status?: Record<string, unknown>; fail?: (n: number) => string | null } = {}) {
  const asked: { segments: { id: string; text: string }[]; renderPath: string; scope: string; context?: unknown }[] = []
  const cancelled: string[] = []
  const transport = {
    status: async () => status(o.status),
    cancel: async (scope: string) => { cancelled.push(scope); return 0 },
    translate: async (call: { request: { segments: { id: string; text: string }[]; context?: unknown }; cache: { renderPath: string }; scope: string }) => {
      asked.push({ segments: call.request.segments, renderPath: call.cache.renderPath, scope: call.scope, context: call.request.context })
      const kind = o.fail?.(asked.length)
      if (kind) return { ok: false, error: { kind, message: kind, isolatable: false } }
      return { ok: true, result: { segments: call.request.segments.map(s => ({ id: s.id, text: s.text.toUpperCase(), identity: 'id-ms' })), provider: 'microsoft', kind: 'mt' }, cached: 0 }
    },
  } as unknown as TranslationTransport
  return { transport, asked, cancelled }
}
const all = async <T>(it: AsyncIterable<T>) => { const out: T[] = []; for await (const x of it) out.push(x); return out }

describe('the reader host translate through the background', () => {
  it('sends a unit as its runs, the elements and spans kept, and reads it back in place', () => {
    const texts: string[] = []
    const shape = runsOf([{ t: 'text', s: 'We count ' }, { t: 'el', id: 'e1', kind: 'math', src: '$x$' }, { t: 'text', s: ' paths ' }, { t: 'span', id: 's1', style: 'it', content: [{ t: 'text', s: 'here' }] }] as Unit['content'], texts)
    expect(texts).toEqual(['We count ', ' paths ', 'here'])
    expect(outOf(shape, ['A', 'B', 'C'])).toEqual([{ t: 'text', s: 'A' }, { t: 'el', id: 'e1' }, { t: 'text', s: 'B' }, { t: 'span', id: 's1', content: [{ t: 'text', s: 'C' }] }])
  })
  it('yields one Result a unit, in order, by the identity that answered, in batches the chain plans', async () => {
    const { transport, asked, cancelled } = fake()
    const t = hostTranslate({ transport, paper: '2600.00001v1' })
    const rows = await all(t([unit('u1', [{ t: 'text', s: 'one' }]), unit('u2', [{ t: 'text', s: 'two' }]), unit('u3', [{ t: 'text', s: 'three' }])], 'de', { signal: new AbortController().signal, context: { paperTitle: 'T' } }))
    expect(rows).toEqual([{ id: 'u1', ok: true, content: [{ t: 'text', s: 'ONE' }], by: 'id-ms' }, { id: 'u2', ok: true, content: [{ t: 'text', s: 'TWO' }], by: 'id-ms' }, { id: 'u3', ok: true, content: [{ t: 'text', s: 'THREE' }], by: 'id-ms' }])
    expect(asked.map(a => a.segments.length)).toEqual([2, 1])
    expect(asked.every(a => a.renderPath === 'runs' && a.context !== undefined)).toBe(true)
    // the scope withdrawn once the units are given
    expect(cancelled).toContain(asked[0]!.scope)
  })
  it('a chain that cannot run: every unit unconfigured by its kind', async () => {
    const { transport } = fake({ status: { available: false, demotions: [{ id: 'microsoft', kind: 'no-key' }] } })
    const rows = await all(hostTranslate({ transport, paper: 'p' })([unit('u1', [{ t: 'text', s: 'a' }])], 'de', { signal: new AbortController().signal }))
    expect(rows).toEqual([{ id: 'u1', ok: false, why: { kind: 'unconfigured', code: 'no-key' } }])
  })
  it('a failure of the service stops the run: what came is given, the rest unavailable', async () => {
    const { transport } = fake({ fail: n => (n === 2 ? 'network' : null) })
    const rows = await all(hostTranslate({ transport, paper: 'p' })([unit('u1', [{ t: 'text', s: 'a' }]), unit('u2', [{ t: 'text', s: 'b' }]), unit('u3', [{ t: 'text', s: 'c' }])], 'de', { signal: new AbortController().signal }))
    expect(rows.map(r => r.ok)).toEqual([true, true, false])
    expect(rows[2]).toEqual({ id: 'u3', ok: false, why: { kind: 'unavailable' } })
  })
  it('an abort withdraws the scope and asks no more', async () => {
    const ac = new AbortController()
    const { transport, asked, cancelled } = fake()
    const it = hostTranslate({ transport, paper: 'p' })([unit('u1', [{ t: 'text', s: 'a' }]), unit('u2', [{ t: 'text', s: 'b' }]), unit('u3', [{ t: 'text', s: 'c' }])], 'de', { signal: ac.signal })
    const out: unknown[] = []
    for await (const r of it) { out.push(r); ac.abort() }
    expect(asked).toHaveLength(1)
    expect(cancelled.length).toBeGreaterThan(0)
  })
})
