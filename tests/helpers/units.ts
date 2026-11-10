// What the page's tests read a request by and answer it with, now that a request carries the chain's units and its answer
// the chain's results (src/providers/transport.ts TranslateCall, UnitResult)
import { chainOf, type Fetch, google, microsoft, type Why } from '@readarxiv/translate'
import type { ErrorInfo, TranslateCall, UnitResult } from '@/providers/transport'
import type { ProviderErrorKind, ProviderKind } from '@/providers/types'

/** a call's units as the text they hold (a title's, a figure's labels: one text piece each) */
export const textsOf = (call: TranslateCall): { id: string; text: string }[] =>
  call.units.map(u => ({ id: u.id, text: u.content.map(p => (p.t === 'text' ? p.s : '')).join('') }))

/** an accepted result of one text */
export const textResult = (id: string, text: string, engine = 'mock', kind: ProviderKind = 'mt'): UnitResult => ({ id, ok: true, content: [{ t: 'text', s: text }], by: `${engine}:0`, engine, kind })

const WHY: Partial<Record<ProviderErrorKind, Why>> = {
  'invalid-response': { kind: 'refused' },
  'no-key': { kind: 'unconfigured', code: 'no-key' },
  auth: { kind: 'unconfigured', code: 'key-refused' },
  aborted: { kind: 'aborted' },
}
/** a unit's failure of `error`'s kind */
export const failedResult = (id: string, error: ErrorInfo): UnitResult => ({ id, ok: false, why: WHY[error.kind] ?? { kind: 'unavailable' }, error })

/** every unit of a call answered by `f` of its text */
export const answering = (call: TranslateCall, f: (text: string) => string = t => t, engine = 'mock', kind: ProviderKind = 'mt') => ({
  ok: true as const,
  results: textsOf(call).map(s => textResult(s.id, f(s.text), engine, kind)),
  cached: 0,
})

/**
 * A transport over a real chain (`@readarxiv/translate`) whose translator echoes what it is sent: Google's adapter on the
 * tags wire, Microsoft's on the markers wire, each over a fetch that answers every text with itself. The page's whole path
 * (the shim, the adapter's write and read, the acceptance rule, the shim back) with no network
 */
export function echoChain(format: 'tags' | 'markers' = 'tags'): (call: TranslateCall) => Promise<{ ok: true; results: UnitResult[]; cached: number }> {
  const fetch: Fetch = async (_url, init) => {
    const body = JSON.parse(init.body) as unknown
    const texts = format === 'markers' ? (body as string[]) : (body as [[string[]]])[0][0]
    const reply = format === 'markers' ? texts.map(text => ({ translations: [{ text }] })) : [texts]
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(reply) }
  }
  const translator = format === 'markers' ? microsoft({ fetch }) : google({ fetch })
  const chain = chainOf()
  return async call => {
    const results: UnitResult[] = []
    for await (const r of chain.translate(call.units, 'zh-Hans', { translators: [translator] })) results.push(r.ok ? { ...r, engine: 'mock', kind: 'mt' } : { ...r, error: { kind: 'unknown', message: r.why.kind } })
    return { ok: true, results, cached: 0 }
  }
}
