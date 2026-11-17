// The reader host's one function that talks to the background (src/pdf-reader/host/translate.ts): units in, one result a unit
// out (the chain's, in the background), in calls of production's batches of plain source, one at a time, under one scope
// withdrawn when done; through the background's own transport and chain, the requests and round trips of a 3-page open
import { describe, expect, it } from 'vitest'
import type { Unit } from '@readarxiv/format'
import { FIRST_BATCH as ENGINE_FIRST_BATCH, NEXT_BATCH as ENGINE_NEXT_BATCH } from '@/pdf-reader/engine/translate.mjs'
import { FIRST_BATCH, hostTranslate, NEXT_BATCH } from '@/pdf-reader/host/translate'
import type { TranslationTransport } from '@/providers/transport'

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

describe('the reader host translate through the background', () => {
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
})

/**
 * The 3-page open through the background's own transport and chain, an endpoint that answers in rounds: every request out is
 * held until nothing more moves (each step a turn of the event loop, never a time), then all of them are answered together,
 * one round trip. The chain's clock is a fake that never advances (no request time, no backoff), so the counts are the
 * same however loaded the machine
 */
