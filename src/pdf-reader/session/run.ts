// The extension's run of a paper on the layer (Stage 5 Task 9; the shared reader view's contract §1.3 and §4.3): the reading
// view's one layer side, told what our server has of the paper's layer and fed the extension's own translation of its units.
//
// 1. The service that translates is asked first (the background's chain, translate.mjs openEngine): its target is the layer's
//    (a language the layer does not set is said so, and nothing is asked of our server), its failure the card's.
// 2. The layer is looked at (server.ts lookLayer): a catalog is told whole, with its end; each 202 is the paper's prepare under
//    way, its objects made so far told, asked again once its wait has passed (never sooner); a 404 `not-prepared` asks the
//    prepare, once a visit; another 404 is why there is none; a 429 waits its time and asks again; our server out of reach
//    (twice) opens a paper whose catalog this machine holds from it, else says the bilingual version cannot be had now.
// 3. The side fetches each object through this run: this machine's store first (layer-store.ts, every object checked against
//    its digest there), then our server, each object kept once read.
// 4. The base: arXiv's PDF the left shows, digested; bytes that are not the layer's base fetch our copy of them (the store
//    first), checked against the base's digest, shown on the left in their place, so that both panes and the layer are of one
//    document. No copy to be had is no layer: the original stays.
// 5. The composed document: arXiv's PDF (or our copy) followed by the tails told, opened by PDF.js with the side's options.
// 6. The rows: runRows over the index (the engine's one translation run without compiles), the units nearest the reading place
//    first (the page in view's closure, from the side's rowsFor), each batch's rows taken as they come, then the end. A retry
//    is again(), every row held taken again at once, and the run again: the background's cache answers what was translated.
//
// Only the paper's id and version reach our server (server.ts); nothing of a translation, a setting or a key does.
import { ABSTRACT_MAX_CHARS } from '@/core/extractor/context'
import type { ProviderErrorKind } from '@/providers/types'
import type { LayerStore } from '@/cache/layer-store'
import { readCatalog, type ReadCatalog, type Ref, type Row, runRows, toTranslate, unitOf } from '../engine/layer.mjs'
import { TARGETS } from '../engine/rules.mjs'
import { createLayerSide, type DocumentTask, type LayerSide, type LayerSideOptions, type ReaderView } from '../engine/view.mjs'
import { servedFaces } from './faces'
import type { Unavailable } from './events'
import { askPrepare, fetchObject, fetchOriginal, LayerUnreachable, lookLayer, type Paper, paperSegment, sha256Of } from './server'

/** what the run tells the reader's controller */
export type RunEvent =
  /** the paper's layer is being prepared: its place in the queue and how far it has come, each null while not known */
  | { type: 'preparing'; position: number | null; progress: number | null }
  /** the layer is coming: a catalog, or a prepare's first objects (any `unavailable` before it no longer holds) */
  | { type: 'layer' }
  /** the translation under way: the units with rows, of those the target translates, and those lost to the service */
  | { type: 'translating'; got: number; total: number; lost: number }
  /** the translation done for this attempt: `stopped`, why it stopped short (the service's error kind), or null */
  | { type: 'translated'; got: number; total: number; lost: number; stopped: ProviderErrorKind | null }
  /** no layer for now (`refused`, `unreachable`: passing; `retryAt` when our server named a time) or for this paper
   *  (`no-source`, `no-pdf`, `cannot-prepare`, `unknown-versions`), or for this language (`target`) */
  | { type: 'unavailable'; why: Unavailable; retryAt: number | null }
  /** the service cannot translate: its error kind */
  | { type: 'fail'; kind: ProviderErrorKind }
  /** the original shown is our copy, arXiv's bytes not being the layer's */
  | { type: 'original'; ours: boolean }

/** the service the run translates with, as translate.mjs openEngine gives it */
export interface RunEngine {
  lang: string
  format: string
  /** its scope withdrawn: no batch goes out after it (translate.mjs openEngine's close) */
  close?(): unknown
  translate(texts: string[], context?: { paperTitle?: string; abstract?: string }, cuts?: (number[] | undefined)[]): Promise<({ text: string; by: string | null } | null)[]>
}
export interface RunHost {
  /** our server's origin (the build's READER_API) */
  api: string
  fetch?: typeof fetch
  store: LayerStore | null
  /** the service that translates for this paper; rejects with an error of a `kind` where it cannot */
  engine(): Promise<RunEngine>
  /** a PDF.js document over bytes, with the options given (the extension's PDF.js) */
  openPdf(data: Uint8Array, options: Readonly<Record<string, unknown>>): DocumentTask
  /** the page the reader is reading (the pane read), for the order of the batches; null before any */
  readingPage(): number | null
  /** whether the prepare may be asked: true once a visit */
  mayPrepare(): boolean
  emit(e: RunEvent): void
  /** the faces' sources (servedFaces over `api` by default) */
  faces?: LayerSideOptions['faceSources']
  createSide?: typeof createLayerSide
}
export interface Run {
  /** the run again in place: the translation's missing rows, or the whole run where it found no layer */
  retry(): void
  dispose(): void
  readonly side: LayerSide | null
  probe(): Readonly<Record<string, number | string | boolean | null>>
}

/** a 202's or a 429's wait, never sooner than our server asks: at least a second, at most ten minutes */
export const WAIT_MIN = 1000, WAIT_MAX = 600_000
const waitOf = (ms: number) => Math.min(WAIT_MAX, Math.max(WAIT_MIN, Number.isFinite(ms) ? ms : WAIT_MIN))
const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError'
const kindOf = (e: unknown): ProviderErrorKind => ((e as { kind?: ProviderErrorKind })?.kind ?? 'unknown')

/** the paper's title and abstract for an LLM's prompt, as the HTML page sends them (src/core/extractor/context.ts's cut) */
export function contextOf(index: Parameters<typeof unitOf>[0]): { paperTitle?: string; abstract?: string } {
  let title: string | undefined
  const abstract: string[] = []
  for (let id = 0; id < index.units.length; id++) {
    if (!index.units[id]) continue
    const u = unitOf(index, [id, [], 'none', null, null]) as { kind: string; src: string; title?: boolean } | null
    if (!u) continue
    if (u.title && title === undefined) title = u.src
    if (u.kind === 'abstract') abstract.push(u.src)
  }
  const a = abstract.join(' ')
  const clip = (s: string) => (s.length <= ABSTRACT_MAX_CHARS ? s : `${s.slice(0, ABSTRACT_MAX_CHARS).replace(/\s+\S*$/, '')}...`)
  return { ...(title ? { paperTitle: title } : {}), ...(a ? { abstract: clip(a) } : {}) }
}

/** the run of `paper` over `view`, started at once; the view's original is the host's to show (at the open, always) */
export function startRun(view: ReaderView, paper: Paper, host: RunHost): Run {
  const seg = paperSegment(paper), f = host.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const ac = new AbortController()
  /** each beginning's own: a retry of a run that found no layer begins again, and what the one before still does is let go */
  let gen = 0, begun = new AbortController()
  let disposed = false, side: LayerSide | null = null, engine: RunEngine | null = null, target: string | null = null
  /** the rows of the visit, latest per unit; the attempt's abort; how far the translation is */
  const rows = new Map<number, Row>()
  let attempt: AbortController | null = null, total = 0, lost = 0, looks = 0, prepares = 0, ours = false
  /** where the run is: its service and its look at the layer (`state`), and its translation of the layer's units (`rowsState`) */
  let state: 'engine' | 'looking' | 'open' | 'unavailable' | 'failed' = 'engine'
  let rowsState: 'idle' | 'translating' | 'translated' | 'failed' = 'idle'
  const emit = (e: RunEvent) => { if (!disposed) host.emit(e) }
  const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(Object.assign(new Error('the run is let go'), { name: 'AbortError' }))
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('the run is let go'), { name: 'AbortError' })) }, { once: true })
  })
  const unavailable = (why: Unavailable, retryAt: number | null = null) => {
    state = 'unavailable'
    emit({ type: 'unavailable', why, retryAt })
  }

  // ---------------------------------------------------------------- the side's transport
  const options = (): Pick<LayerSideOptions, 'fetchObject' | 'bind' | 'composed'> => ({
    async fetchObject(ref: Ref, signal: AbortSignal) {
      const kept = await host.store?.object(ref.sha256)
      if (kept && kept.length === ref.bytes) return kept
      const bytes = await fetchObject(host.api, paper, ref, { fetch: f, signal })
      void host.store?.putObject(seg, ref.sha256, bytes)
      return bytes
    },
    async bind(base) {
      const data = await view.originalData()
      if (data && data.length === base.bytes && (await sha256Of(data)) === base.sha256) return true
      // arXiv's bytes are not the layer's: our copy of them, this machine's first, checked against the base's digest, shown
      // on the left in their place
      let copy: Uint8Array | undefined = await host.store?.object(base.sha256)
      if (copy?.length !== base.bytes) {
        try {
          copy = await fetchOriginal(host.api, paper, base, { fetch: f, signal: begun.signal })
        } catch (e) {
          if (!isAbort(e)) console.warn('[reader] our copy of the original:', (e as Error)?.message ?? e)
          return false
        }
        void host.store?.putObject(seg, base.sha256, copy)
      }
      if (disposed) return false
      const bytes = copy
      const shown = await view.showOriginal(o => host.openPdf(bytes.slice(), o))
      if (shown !== 'opened') return false
      ours = true
      emit({ type: 'original', ours: true })
      return true
    },
    composed(tail, o) {
      let inner: DocumentTask | null = null, gone = false
      const promise = (async () => {
        const source = await view.originalData()
        if (!source) throw new Error('no original to compose the layer\'s document over')
        if (gone) throw new Error('the composed document was let go')
        const data = new Uint8Array(source.length + (tail?.length ?? 0))
        data.set(source)
        if (tail) data.set(tail, source.length)
        inner = host.openPdf(data, o)
        return inner.promise
      })()
      return { promise, onProgress: null, destroy: async () => { gone = true; await inner?.destroy() } } as unknown as DocumentTask
    },
  })

  // ---------------------------------------------------------------- the look at the layer
  /** a catalog told whole to the side, with its end */
  const tellCatalog = (c: ReadCatalog) => side?.tell({ units: c.units, head: c.head, parts: c.parts, end: c.end })
  async function look(my: number, signal: AbortSignal) {
    state = 'looking'
    const gone = () => disposed || my !== gen || !side
    for (;;) {
      if (gone()) return
      looks++
      let a: Awaited<ReturnType<typeof lookLayer>>
      try {
        a = await lookLayer(host.api, paper, { fetch: f, signal })
      } catch (e) {
        if (gone() || isAbort(e)) return
        // our server out of reach: a catalog this machine holds of the paper opens it on the layer (decision 7)
        const kept = await host.store?.catalog(seg)
        const catalog = kept ? await readCatalog(kept, { paper }).catch(() => null) : null
        if (catalog && !gone()) { state = 'open'; emit({ type: 'layer' }); tellCatalog(catalog); return }
        console.warn('[reader] the layer is not to be had now:', (e as Error)?.message ?? e)
        return unavailable('unreachable')
      }
      if (gone()) return
      switch (a.kind) {
        case 'catalog':
          void host.store?.putCatalog(seg, a.bytes)
          void host.store?.opened(seg)
          state = 'open'
          emit({ type: 'layer' })
          tellCatalog(a.catalog)
          return
        case 'preparing':
          emit({ type: 'preparing', position: a.preparing.position, progress: a.preparing.progress })
          if (a.preparing.layer) { emit({ type: 'layer' }); side?.tell(a.preparing.layer) }
          try { await sleep(waitOf(a.preparing.retryAfterMs), signal) } catch { return }
          continue
        case 'refused':
          unavailable('refused', Date.now() + a.retryAfterMs)
          try { await sleep(waitOf(a.retryAfterMs), signal) } catch { return }
          state = 'looking'
          continue
        case 'none':
          if (a.why !== 'not-prepared') return unavailable(a.why)
          // none made yet: the prepare asked, once a visit; a prepare that ended with none is a paper that cannot be had
          if (!host.mayPrepare()) return unavailable('cannot-prepare')
          prepares++
          try {
            const p = await askPrepare(host.api, paper, { fetch: f, signal })
            if (gone()) return
            if (p.kind === 'none') return unavailable(p.why === 'not-prepared' ? 'cannot-prepare' : p.why)
            if (p.kind === 'refused') { unavailable('refused', Date.now() + p.retryAfterMs); await sleep(waitOf(p.retryAfterMs), signal); state = 'looking'; continue }
            if (p.kind === 'preparing') { emit({ type: 'preparing', position: p.preparing.position, progress: p.preparing.progress }); await sleep(waitOf(p.preparing.retryAfterMs), signal) }
          } catch (e) {
            if (gone() || isAbort(e)) return
            if (e instanceof LayerUnreachable) return unavailable('unreachable')
            throw e
          }
          continue
      }
    }
  }

  // ---------------------------------------------------------------- the translation
  /** how far each unit is from the reading place: the units the page in view waits for first, then ahead before behind */
  let near = { page: -1, ids: new Set<number>(), anchor: 0 }
  const rank = (id: number) => {
    const p = host.readingPage() ?? 1
    if (near.page !== p && side) {
      const ids = new Set([...side.rowsFor(p), ...side.rowsFor(p + 1)])
      const pages = view.probe().pages as number || 1
      near = { page: p, ids, anchor: ids.size ? Math.min(...ids) : Math.floor(((p - 1) / pages) * (lastIndex?.units.length ?? 0)) }
    }
    if (near.ids.has(id)) return 0
    const d = id - near.anchor
    return d >= 0 ? 1 + d : 1 - 2 * d
  }
  let lastIndex: Parameters<typeof unitOf>[0] | null = null
  const counts = () => {
    let got = 0, gone = 0
    for (const r of rows.values()) { if (r[2] === 'lost') gone++; else got++ }
    return { got, lost: gone }
  }
  async function translate() {
    const s = side
    if (!s) return
    const index = await s.index()
    if (disposed || !index || !engine || !target || s !== side) return
    lastIndex = index
    const a = new AbortController()
    attempt?.abort()
    attempt = a
    total = toTranslate(index, target).length
    rowsState = 'translating'
    const context = contextOf(index)
    const e = engine
    emit({ type: 'translating', got: counts().got, total, lost: 0 })
    let result: Awaited<ReturnType<typeof runRows>>
    try {
      result = await runRows(index, {
        lang: target,
        send: (texts, cuts) => e.translate(texts, context, cuts),
        format: e.format as 'markers' | 'tags' | 'runs',
        rank,
        onRows(batch) {
          if (a.signal.aborted || disposed || s !== side) return
          for (const r of batch) rows.set(r[0], r)
          s.take(batch)
          const c = counts()
          emit({ type: 'translating', got: c.got, total, lost: c.lost })
        },
        signal: a.signal,
      })
    } catch (err) {
      if (a.signal.aborted || disposed) return
      // a failure that is no error of the service's: the scope let go, and a retry opens the service again
      rowsState = 'failed'
      void engine?.close?.()
      engine = null
      return emit({ type: 'fail', kind: kindOf(err) })
    }
    if (a.signal.aborted || disposed || s !== side) return
    s.end()
    lost = result.lost
    rowsState = result.stopped && result.stopped !== 'aborted' ? 'failed' : 'translated'
    const c = counts()
    emit({ type: 'translated', got: c.got, total, lost: result.lost, stopped: result.stopped && result.stopped !== 'aborted' ? (result.stopped as ProviderErrorKind) : null })
  }

  // ---------------------------------------------------------------- the run
  async function begin() {
    const my = ++gen
    begun.abort()
    begun = new AbortController()
    const signal = begun.signal
    ac.signal.addEventListener('abort', () => begun.abort(), { once: true })
    state = 'engine'
    try {
      engine = await host.engine()
    } catch (e) {
      if (disposed || my !== gen) return
      state = 'failed'
      return emit({ type: 'fail', kind: kindOf(e) })
    }
    if (disposed || my !== gen) return
    target = engine.lang
    if (!(TARGETS as readonly string[]).includes(target)) return unavailable('target')
    const make = host.createSide ?? createLayerSide
    side = make(view, {
      paper, target, faceSources: host.faces ?? servedFaces(host.api, f), hyphUrl: lang => `${host.api}/hyph/${lang}.json`, ...options(),
    })
    void translate()
    await look(my, signal)
  }
  void begin().catch(e => { if (!disposed && !isAbort(e)) { console.error('[reader] the run:', e); state = 'failed'; emit({ type: 'fail', kind: 'unknown' }) } })

  return {
    get side() { return side },
    retry() {
      if (disposed) return
      // a run that found no layer, or no service: begun again
      if (!side || !engine || state === 'unavailable') {
        void engine?.close?.()
        side?.dispose()
        side = null
        engine = null
        void begin().catch(() => {})
        return
      }
      // the translation again: the door opened again over the latest document, every row held taken at once
      side.again()
      if (rows.size) side.take([...rows.values()])
      void translate()
    },
    dispose() {
      if (disposed) return
      disposed = true
      ac.abort()
      attempt?.abort()
      side?.dispose()
      side = null
      void engine?.close?.()
    },
    probe: () => ({ state, rowsState, target, looks, prepares, rows: rows.size, total, lost, ours }),
  }
}
