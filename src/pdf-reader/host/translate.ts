// The reader's rows made here (its Host's `translate`, interfaces/host design-a §1.1) through the background: the one function of
// the extension's reader host that knows the messages (shared/transport.ts; their shapes, lanes/L4-reader.md 5a.5b).
// `axt:provider-status` binds a scope to the chain built from the settings as stored; `axt:translate` takes a call's units and
// answers one result a unit, the chain's (packages/translate: the translators, their fall-through and acceptance, the rows and
// the store are the background's); `axt:cancel-scope` withdraws the scope, on the reader's abort and when the page goes (an
// extension page is no tab the background watches). A unit goes as a translator is given it (packages/translate unitInOf: what
// the wires read of it, a nested unit its mark), never format's unit itself, whose nested unit no wire can write.
import type { Row as Result, Unit } from '@readarxiv/format'
import { type UnitIn, unitInOf } from '@readarxiv/translate'
import type { TranslationTransport } from '@/providers/transport'
import { isPermanentErrorKind } from '@/providers/types'

/** the chain's error kinds a reader fixes in the settings: the rows unconfigured, with the kind as its code */
const KEYS = new Set(['no-key', 'auth'])
const failed = (id: string, kind: string): Result => (KEYS.has(kind) ? { id, ok: false, why: { kind: 'unconfigured', code: kind } } : isPermanentErrorKind(kind as never) ? { id, ok: false, why: { kind: 'refused' } } : { id, ok: false, why: { kind: 'unavailable' } })

/**
 * The characters of plain source a call holds at most, as production's reader batches a paper (its names and values, the PDF
 * engine's mt.mjs FIRST_BATCH and NEXT_BATCH, layer-proto/rows.mjs runRows): the first small, so that it comes back soon,
 * then larger. A call goes once the one before it has answered, in the reader's order (the page in view, then outward):
 * one call is out at a time, so the order calls are issued in is the order the nearest are served in, and the chain cuts
 * each into its translators' requests in array order, as many in flight as each allows (production's queue: 8 for
 * Microsoft and an LLM). In chain-sized calls one after another a 3-page open was 10 requests in series where production
 * takes about 3 round trips
 */
export const FIRST_BATCH = 2500
export const NEXT_BATCH = 12000

/** a unit's plain source, by whose length a call is planned: its text, an element a space, white space collapsed (mt.mjs
 *  plainSource) */
const plainOf = (pieces: UnitIn['content']): string => pieces.map(p => (p.t === 'text' ? p.s : p.t === 'span' ? plainOf(p.content) : ' ')).join('')
const plainLength = (pieces: UnitIn['content']): number => plainOf(pieces).replace(/\s+/g, ' ').trim().length

export function hostTranslate(o: { transport: TranslationTransport; paper: string }) {
  return async function* translate(units: readonly Unit[], _target: string, x: { signal: AbortSignal; context?: { title?: string; abstract?: string } }): AsyncIterable<Result> {
    const { transport } = o
    const scope = `axt-pdf-${crypto.randomUUID()}`
    const withdraw = () => void transport.cancel(scope)
    addEventListener('pagehide', withdraw, { once: true })
    x.signal.addEventListener('abort', withdraw, { once: true })
    try {
      const status = await transport.status(scope, { fresh: true })
      if (!status.available && !status.fallback) {
        const kind = status.demotions?.find(d => d.id === status.providerId)?.kind ?? 'no-key'
        for (const u of units) yield failed(u.id, kind)
        return
      }
      // calls of FIRST_BATCH then NEXT_BATCH characters, in the reader's order (the nearest first), a unit never split and a
      // call never empty (mt.mjs batchOf): each call's results are given as it answers; a later call of the reader's (a new
      // reading place's) the chain puts first
      const calls: UnitIn[][] = []
      let cur: UnitIn[] = [], n = 0
      for (const u of units.map(unitInOf)) {
        const len = plainLength(u.content)
        if (cur.length && n + len > (calls.length ? NEXT_BATCH : FIRST_BATCH)) { calls.push(cur); cur = []; n = 0 }
        cur.push(u)
        n += len
      }
      if (cur.length) calls.push(cur)
      const context = x.context && (x.context.title || x.context.abstract) ? { context: { ...(x.context.title ? { paperTitle: x.context.title } : {}), ...(x.context.abstract ? { abstract: x.context.abstract } : {}) } } : {}
      let stopped: string | null = null
      let next = 0
      for (const call of calls) {
        if (x.signal.aborted || stopped) break
        const res = await transport.translate({ units: call, target: status.targetLanguage, ...context, scope })
        if (!res.ok) { stopped = res.error.kind; break }
        for (const r of res.results) {
          // the reader's Result: the chain's, without the page's words about who answered or why it failed
          if (r.ok) { const { engine: _e, kind: _k, ...row } = r; yield row as Result }
          else { const { error: _x, ...row } = r; yield row as Result }
        }
        next += call.length
      }
      for (const u of units.slice(next)) yield failed(u.id, stopped ?? 'aborted')
    } finally {
      removeEventListener('pagehide', withdraw)
      x.signal.removeEventListener('abort', withdraw)
      void transport.cancel(scope)
    }
  }
}
