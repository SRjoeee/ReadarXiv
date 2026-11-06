// The reader's rows made here (its Host's `translate`, interfaces/host design-a §1.1) through the background, with today's
// messages (shared/transport.ts): `axt:provider-status` binds a scope to the chain built from the settings as stored,
// `axt:translate` translates segments in it, `axt:cancel-scope` withdraws it (on the reader's abort, and when the page goes:
// an extension page is no tab the background watches). Each unit goes as its runs, every stretch of text between two
// opaque pieces on its own (the wire every engine takes, cache key `renderPath: 'runs'`), and comes back as one Result.
// Lane L6's stage 4b puts the one chain behind this seam: the exact messages are stated in lanes/L4-reader.md (5a.5).
import type { Row as Result, Unit } from '@readarxiv/format'
import type { TranslationTransport } from '@/providers/transport'
import { isPermanentErrorKind } from '@/providers/types'

type Piece = Unit['content'][number]
type Out = Extract<Result, { ok: true }>['content'][number]

/** a unit's runs: each text stretch's index in `texts`, and the unit's pieces with each stretch replaced by its index */
type Shape = { t: 'run'; i: number } | { t: 'el'; id: string } | { t: 'span'; id: string; content: Shape[] } | { t: 'text'; s: string }
export function runsOf(pieces: readonly Piece[], texts: string[]): Shape[] {
  const out: Shape[] = []
  let run = ''
  const flush = () => {
    if (!run) return
    // a stretch of spaces alone is no text to translate: it stays as it is
    if (/^\s*$/.test(run)) out.push({ t: 'text', s: run })
    else out.push({ t: 'run', i: texts.push(run) - 1 })
    run = ''
  }
  for (const p of pieces) {
    if (p.t === 'text') run += p.s
    else if (p.t === 'unit') run += `${p.pre}${p.post}`
    else if (p.t === 'el') {
      flush()
      out.push({ t: 'el', id: p.id })
    } else {
      flush()
      out.push({ t: 'span', id: p.id, content: runsOf(p.content, texts) })
    }
  }
  flush()
  return out
}
export function outOf(shape: readonly Shape[], tr: readonly string[]): Out[] {
  return shape.map(s => (s.t === 'run' ? { t: 'text', s: tr[s.i] ?? '' } : s.t === 'span' ? { t: 'span', id: s.id, content: outOf(s.content, tr) } : s.t === 'el' ? { t: 'el', id: s.id } : { t: 'text', s: s.s }))
}

/** the chain's error kinds a reader fixes in the settings: the rows unconfigured, with the kind as its code */
const KEYS = new Set(['no-key', 'auth'])
const failed = (id: string, kind: string): Result => (KEYS.has(kind) ? { id, ok: false, why: { kind: 'unconfigured', code: kind } } : isPermanentErrorKind(kind as never) ? { id, ok: false, why: { kind: 'refused' } } : { id, ok: false, why: { kind: 'unavailable' } })

export function hostTranslate(o: { transport: TranslationTransport; paper: string }) {
  return async function* translate(units: readonly Unit[], _target: string, x: { signal: AbortSignal; context?: { paperTitle?: string; abstract?: string } }): AsyncIterable<Result> {
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
      const texts: string[] = []
      const shapes = units.map(u => ({ u, shape: runsOf(u.content, texts) }))
      const tr: (string | null)[] = texts.map(() => null)
      let by = status.identity
      let stopped: string | null = null
      // batches as the chain plans them, in the units' order (the reader asks in view order)
      const batches: number[][] = []
      let cur: number[] = [], n = 0
      texts.forEach((t, i) => {
        if (cur.length && (n + t.length > status.maxBatchChars || cur.length >= status.maxBatchItems)) { batches.push(cur); cur = []; n = 0 }
        cur.push(i)
        n += t.length
      })
      if (cur.length) batches.push(cur)
      const context = x.context && Object.keys(x.context).length ? { context: x.context } : {}
      let next = 0
      const done = (k: number) => shapes[k]!.shape.length === 0 || collect(shapes[k]!.shape).every(i => tr[i] !== null)
      for (const batch of batches) {
        if (x.signal.aborted || stopped) break
        const res = await transport.translate({ request: { segments: batch.map(i => ({ id: String(i), text: texts[i]! })), source: 'en', target: status.targetLanguage, ...context }, cache: { paper: o.paper, renderPath: 'runs', source: 'pdf' }, scope })
        for (const s of res.ok ? res.result.segments : (res.partial ?? [])) {
          tr[Number(s.id)] = s.text
          if (s.identity) by = s.identity
        }
        if (!res.ok) stopped = res.error.kind
        // a unit is given once every run of it is in, in the units' order
        while (next < shapes.length && done(next)) {
          const { u, shape } = shapes[next]!
          yield { id: u.id, ok: true, content: outOf(shape, tr.map(t => t ?? '')), by }
          next++
        }
      }
      for (; next < shapes.length; next++) yield failed(shapes[next]!.u.id, stopped ?? 'aborted')
    } finally {
      removeEventListener('pagehide', withdraw)
      x.signal.removeEventListener('abort', withdraw)
      void transport.cancel(scope)
    }
  }
}
const collect = (shape: readonly Shape[]): number[] => shape.flatMap(s => (s.t === 'run' ? [s.i] : s.t === 'span' ? collect(s.content) : []))
