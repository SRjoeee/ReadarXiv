// openReader (interfaces/host DECISION: A's host, B's session): a reader in `root` for one paper, over a host that gives the
// network, where arXiv's bytes are read first, the preferences, and optionally the rows made here. Everything else is the
// reader's own and the same in both hosts: the byte store, PDF.js and its workers, the v2 client, the objects, composing, the
// highlight. A reader owns all it makes (no state outside a reader): its marks are on `root`, its sheets and faces in it, its
// timers on its clock; `close()` lets everything go and empties `root`.
//
// The session is the machine (session/machine.ts), run by the runtime; each resource's handler here makes the real thing: the
// original (its ranged source, its document, the panes), the link (the follow), the open, the layer's code (its chunk, imported
// after the left's first page or 1.5 s), the composed document (the add-on by ranges over the same store, its groups, composing
// switched on), the rows (the server's objects, or the host's translate), the timers. The first range of the original is asked
// before openReader returns.
import { type Head, type Part, read, type Row, type Unit, type Units } from '@readarxiv/format'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { composedSource } from './bytes/composed.ts'
import { openRanged } from './bytes/ranged.ts'
import { type Fetch, type OriginalSource, rangeSource } from './bytes/source.ts'
import { CHUNK, chunkStore } from './bytes/store.ts'
import type { Composer, RowsSource } from './compose/composer.ts'
import type { FaceTable } from './compose/faces.ts'
import type { Highlight } from './compose/highlight.ts'
import type { Lay } from './compose/page.ts'
import { createPanes, type Display, type Panes, type Side, type Zoom } from './panes/panes.ts'
import { type Kit, loadKit } from './pdfjs/kit.ts'
import { dirOf, follow, object, open, Refused, segOf } from './session/client.ts'
import {
  type Doc,
  type Effect,
  init,
  type LayerWhy,
  type OriginalWhy,
  type PaperRef,
  type Prefs,
  type Ref,
  type RowsWhy,
  type State,
  targetOf,
  wanted,
} from './session/machine.ts'
import { createRuntime, type Handlers, type Runtime } from './session/runtime.ts'
import { ownedClock } from './stack/clock.ts'
import { createScheduler } from './stack/scheduler.ts'
import { addSheets } from './styles.ts'

/** a translation result as the host's translate yields it (packages/translate's Result: format's Row) */
export type Result = Row

export interface PrefStore {
  read(): Promise<Prefs>
  write(patch: Partial<Prefs>): Promise<void>
  watch(listener: (p: Prefs) => void): () => void
}
export interface Host {
  fetch: Fetch
  original(ref: string): string
  prefs: PrefStore
  translate?(units: readonly Unit[], target: string, o: { signal: AbortSignal }): AsyncIterable<Result>
}
export const DEFAULTS: Prefs = { display: 'bilingual', target: 'zh-Hans', sync: true, highlight: { on: true } }

export type Command =
  | { do: 'set'; prefs: Partial<Prefs> }
  | { do: 'zoom'; to: Zoom }
  | { do: 'zoomBy'; factor: number }
  | { do: 'pinch'; side: Side; factor: number; at: [number, number] }
  | { do: 'page'; side: Side; page: number }
  | { do: 'unit'; id: number }
  | { do: 'lead'; side: Side }
  | { do: 'narrow'; on: boolean }
  | { do: 'retry' }

export interface ReaderState {
  paper: { id: string; version: number | null; title: string; html: string | null }
  prefs: Prefs
  settings: { s: 'reading' | 'landed' | 'unreadable'; refused: number }
  original:
    | { s: 'opening'; loaded: number }
    | { s: 'open'; pages: number; ours: boolean }
    | { s: 'failed'; why: OriginalWhy }
  layer:
    | { s: 'none' }
    | { s: 'preparing'; position: number | null; progress: number | null }
    | { s: 'ready'; laid: number; total: number; asOriginal: number }
    | { s: 'refused'; why: LayerWhy; retryAt: number | null }
  rows: { target: string; from: 'server' | 'here' } & (
    | { s: 'none' }
    | { s: 'arriving' | 'complete'; got: number; total: number; lost: number }
    | { s: 'failed'; why: RowsWhy; got: number; total: number; lost: number }
  )
  view: {
    display: Display
    sync: { on: boolean; available: boolean }
    scale: number
    zoom: Zoom | null
    narrow: boolean
    sides: Record<Side, { page: number; pages: number }>
  }
  crashed: boolean
}
export interface Reader {
  state(): ReaderState
  subscribe(listener: () => void): () => void
  do(c: Command): void
  probe(): Readonly<Record<string, number | string | boolean | null>>
  close(): void
}

/** what lays a page until the typesetter's layPage is exported (lane L3): given by the caller (the harness, a fixture's lay),
 *  with the faces its pages name; a reader given none lays nothing and every page stays arXiv's */
export interface Engine {
  lay?: (parts: (n: number) => Promise<Part | null>, pages: number) => Promise<Lay> | Lay
  faces?: FaceTable
  /** what a page not laid is drawn from (way a: the original document; way b: the composed one) */
  unlaid?: 'original' | 'composed'
}

const PAPER = /^((?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7})|(?:\d{4}\.\d{4,5}))(?:v(\d+))?$/

export function openReader(
  root: HTMLElement,
  o: { host: Host; paper: string; visit?: Partial<Pick<Prefs, 'display' | 'target' | 'sync'>>; engine?: Engine },
): Reader {
  const m = PAPER.exec(o.paper)
  if (!m) throw new TypeError(`not an arXiv paper: ${o.paper}`)
  const paper: PaperRef = { id: m[1] as string, version: m[2] ? Number(m[2]) : null }
  const ref = `${paper.id}${paper.version ? `v${paper.version}` : ''}`
  const host = o.host
  const clock = ownedClock()
  const store = chunkStore()
  const scheduler = createScheduler()
  const listeners = new Set<() => void>()
  let closed = false
  /** when each first moment came, ms from the open (the probe's: the harness's order checks and timings) */
  const t0 = performance.now()
  const moments: Record<string, number> = {}
  const mark = (k: string) => {
    if (!(k in moments)) moments[k] = Math.round(performance.now() - t0)
  }
  // ---- the root: its marks, its sheets, its two panes
  root.classList.add('axt-reader')
  const left = document.createElement('div'),
    right = document.createElement('div')
  left.className = 'axt-pane left'
  right.className = 'axt-pane right'
  root.append(left, right)
  // ---- PDF.js, the panes, composing: made once the kit is in (the original's first range does not wait for it)
  const kitReady = loadKit()
  let kit: Kit | null = null,
    panes: Panes | null = null,
    composer: Composer | null = null,
    highlight: Highlight | null = null
  const ready = kitReady.then((k) => {
    kit = k
    addSheets(root, k.sheet)
    panes = createPanes({
      root,
      left,
      right,
      kit: k,
      scheduler,
      clock,
      pageName: (s, n) => `${s === 'left' ? 'Original' : 'Translation'}, page ${n}`,
      openExternal: (url) => openExternal(url),
    })
    panes.on('drawn', (e) => {
      if (e.side === 'left' && e.page === 1) {
        mark('leftDrawn')
        rt.input({ i: 'panes.drawn' })
      }
      if (e.side === 'right' && e.page === 1) mark('rightDrawn')
    })
    for (const k2 of ['page', 'scale', 'sync', 'display'] as const) panes.on(k2, () => tellSoon())
    return k
  })
  const openExternal = (url: string) => {
    if (!/^(https?|mailto):/.test(url)) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  // ---- the rows of the target followed, kept by unit id (content-addressed: no ticket)
  let rows = new Map<string, Row>()
  let rowsTarget = ''
  let rowsDone = false
  const rowsListeners = new Set<() => void>()
  const rowsSource = (): RowsSource => ({
    target: rowsTarget,
    get: (id) => rows.get(id),
    get done() {
      return rowsDone
    },
    on(f) {
      rowsListeners.add(f)
      return () => rowsListeners.delete(f)
    },
  })
  const rowsIn = (rs: Iterable<Row>) => {
    for (const r of rs) rows.set(r.id, r)
    for (const f of [...rowsListeners]) f()
  }
  // ---- the head, the parts, the units: objects by digest, read once
  let head: Head | null = null
  const objects = new Map<string, Promise<Uint8Array>>()
  const objectOf = (r: Ref) => {
    let p = objects.get(r.sha256)
    if (!p) {
      p = object(host.fetch, r)
      objects.set(r.sha256, p)
      p.catch(() => objects.delete(r.sha256))
    }
    return p
  }
  const catalogOf = (): Ref | null => (rt.state.layer.s === 'ready' ? rt.state.layer.catalog : null)
  /** an object whose length the head does not state (a part, by its digest alone): read whole, then held to its digest */
  const byDigest = (path: string, sha256: string): Promise<Uint8Array> => {
    let p = objects.get(sha256)
    if (!p) {
      p = (async () => {
        const r = await host.fetch(`/api/v2/o/${path}`)
        if (!r.ok) throw new Refused(r.status === 404 ? 'gone' : 'bad')
        const b = new Uint8Array(await r.arrayBuffer())
        const d = [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))]
          .map((x) => x.toString(16).padStart(2, '0'))
          .join('')
        if (d !== sha256) throw new Refused('bad')
        return b
      })()
      objects.set(sha256, p)
      p.catch(() => objects.delete(sha256))
    }
    return p
  }
  const partOf = async (n: number): Promise<Part | null> => {
    const c = catalogOf(),
      d = head?.parts[n - 1]
    if (!c || !head || !d) return null
    return read('part', await byDigest(`${dirOf(c)}/${d}`, d), d) as Part
  }
  // ---- the original's document, the composed one
  let original: { source: OriginalSource; doc: PDFDocumentProxy | null } | null = null
  let composed: { doc: PDFDocumentProxy; groups: import('./compose/groups.ts').Groups } | null = null
  /** the lay of the layer open: the engine's, made over its parts once its head is read; none lays nothing */
  const none: Lay = (part) => ({ page: part.page, wait: { rows: [], faces: [] }, members: [], links: [] })
  let current: Lay = none

  const handlers: Handlers = {
    original(spec, t, emit, signal) {
      const url = spec.pin
        ? `/api/v2/o/arxiv/${segOf(paper, paper.version ?? head?.paper.version ?? 1)}.pdf`
        : host.original(ref)
      let opened = false
      const source = rangeSource({
        fetch: host.fetch,
        url,
        own: url.startsWith('/'),
        store,
        signal,
        keepReading: () => opened,
        onProgress: (loaded) => emit({ i: 'original.progress', t, loaded }),
        refused: (e) =>
          emit(
            e.kind === 'digest'
              ? { i: 'original.mismatch', t }
              : { i: 'original.failed', t, why: e.kind === 'bytes' ? 'unreadable' : 'network' },
          ),
      })
      original = { source, doc: null }
      // (the first range out at once, before PDF.js is in: the open's first read takes it from the store)
      source.read(0, CHUNK).catch(() => {})
      let task: ReturnType<typeof openRanged> | null = null
      void ready.then(async (k) => {
        if (signal.aborted) return
        task = openRanged(k.lib as never, source, { options: k.options('original') })
        try {
          const doc = await task.promise
          if (signal.aborted) return
          opened = true
          if (original?.source === source) original.doc = doc
          if (head) void source.prove(head.original.chunks)
          mark('originalOpen')
          emit({ i: 'original.opened', t, pages: doc.numPages, bytes: source.bound?.total ?? 0 })
          await panes?.open(doc)
          composer?.setDocuments({ original: doc, composed: composed?.doc ?? null, groups: composed?.groups ?? null })
        } catch (e) {
          if (!signal.aborted)
            emit({
              i: 'original.failed',
              t,
              why: (e as Error)?.name === 'InvalidPDFException' ? 'unreadable' : 'network',
            })
        }
      })
      return async () => {
        source.abort()
        if (original?.source === source) original = null
        panes?.drop()
        await task?.destroy()
        kit?.release('original')
      }
    },
    link(spec, t, emit, signal) {
      follow({
        fetch: host.fetch,
        paper,
        target: spec.target,
        signal,
        now: () => Date.now(),
        onDoc: (doc) => emit({ i: 'paper', t, doc }),
      }).catch((e) => {
        if (signal.aborted) return
        emit({
          i: 'follow.lost',
          t,
          why: e instanceof Refused ? e.why : 'network',
          retryAt: e instanceof Refused ? e.retryAt : null,
        })
      })
      return undefined
    },
    open(spec, t, emit, signal) {
      open({ fetch: host.fetch, paper, target: spec.target, signal, now: () => Date.now() }).then(
        (a) => emit({ i: 'open.answered', t, doc: a.doc, ...(a.refused ? { refused: a.refused } : {}) }),
        (e) => {
          if (!signal.aborted) emit({ i: 'open.failed', t, why: String((e as Error)?.message ?? e) })
        },
      )
      return undefined
    },
    code(_spec, t, emit, signal) {
      // the layer's code: composing and the highlight, a chunk of its own (imported after the left's page 1, or 1.5 s)
      Promise.all([
        import('./compose/composer.ts'),
        import('./compose/faces.ts'),
        import('./compose/highlight.ts'),
        ready,
      ]).then(
        async ([C, F, H, k]) => {
          if (signal.aborted || !panes) return
          const faces = F.createFaces({ table: o.engine?.faces ?? {}, fetch: host.fetch, root })
          // (the lay itself is made once the head is read: the composed document's open)
          const lay: Lay = (part, rs) => current(part, rs)
          composer = C.createComposer({
            stack: panes.right,
            kit: k,
            faces,
            lay,
            unlaid: o.engine?.unlaid ?? 'original',
            lang: () => targetOf(rt.state),
            links: {
              open: openExternal,
              follow: (d, how) => void panes?.follow(d, how),
              unnamed: () => 'Link',
              textUnder: () => '',
            },
          })
          composer.on('laid', () => mark('firstLaid'))
          composer.on('laid', () =>
            rt.input({ i: 'panes.laid', laid: composer?.probe().laidPages as number, total: head?.paper.pages ?? 0 }),
          )
          highlight = H.createHighlight({ panes, composer, clock, on: true })
          composer.setDocuments({ original: original?.doc ?? null, composed: null, groups: null })
          mark('code')
          emit({ i: 'code.loaded', t })
        },
        () => emit({ i: 'code.failed', t }),
      )
      return () => {
        composer?.dispose()
        highlight?.dispose()
        composer = null
        highlight = null
      }
    },
    composed(spec, t, emit, signal) {
      const h = spec.head
      const c = catalogOf()
      if (!h.addOn || !c || !original) {
        emit({ i: 'composed.failed', t })
        return undefined
      }
      const addOn = rangeSource({
        fetch: host.fetch,
        url: `/api/v2/o/${dirOf(c)}/${h.addOn.digest}`,
        own: true,
        bound: { total: h.addOn.bytes, etag: null },
        signal,
      })
      const src = composedSource(original.source, h.original.bytes, addOn, h.addOn.bytes)
      let task: ReturnType<typeof openRanged> | null = null
      void ready.then(async (k) => {
        task = openRanged(k.lib as never, src, { options: k.options('composed') })
        try {
          const doc = await task.promise
          const { groupsOf } = await import('./compose/groups.ts')
          const groups = groupsOf(doc)
          await groups.ready
          current = o.engine?.lay ? await o.engine.lay(partOf, h.paper.pages) : none
          if (signal.aborted) return
          composed = { doc, groups }
          composer?.setDocuments({ original: original?.doc ?? null, composed: doc, groups })
          composer?.setLayer({ part: partOf, pages: h.paper.pages }, rowsSource())
          mark('composedOpen')
          emit({ i: 'composed.opened', t })
        } catch {
          if (!signal.aborted) emit({ i: 'composed.failed', t })
        }
      })
      return async () => {
        src.abort()
        composed = null
        composer?.setDocuments({ original: original?.doc ?? null, composed: null, groups: null })
        await task?.destroy()
        kit?.release('composed')
      }
    },
    rows(spec, t, emit, signal) {
      rows = new Map()
      rowsTarget = spec.target
      rowsDone = false
      composer?.setLayer(composed ? { part: partOf, pages: head?.paper.pages ?? 0 } : null, rowsSource())
      const total = () => [...rows.values()].length
      void (async () => {
        try {
          if (spec.from === 'here' && host.translate) {
            // the units read from the layer's units objects, translated here, in view order (the host's chain)
            const units: Unit[] = []
            for (const u of spec.units) units.push(...(read('units', await objectOf(u), u.sha256) as Units).units)
            let got = 0,
              lost = 0
            const batch: Row[] = []
            for await (const r of host.translate(units, spec.target, { signal })) {
              if (signal.aborted) return
              batch.push(r)
              got++
              if (!r.ok) lost++
              if (batch.length >= 16) {
                rowsIn(batch.splice(0))
                emit({ i: 'rows.batch', t, got, total: units.length, lost })
              }
            }
            rowsIn(batch)
            rowsDone = true
            rowsIn([])
            emit({ i: 'rows.end', t, got, total: units.length, lost })
            return
          }
          // the server's rows: every ref the documents name for the target, each once, until the target is done
          const read1 = new Set<string>()
          for (;;) {
            const d = rt.state.doc as Doc | null
            const tg = d?.targets[spec.target]
            for (const r of tg?.rows ?? []) {
              if (read1.has(r.sha256)) continue
              read1.add(r.sha256)
              const o2 = JSON.parse(new TextDecoder().decode(await objectOf(r))) as { rows?: Row[] }
              rowsIn(o2.rows ?? [])
              emit({ i: 'rows.batch', t, got: total(), total: tg?.total ?? 0, lost: 0 })
            }
            if (tg && tg.state !== 'running' && (tg.rows ?? []).every((r) => read1.has(r.sha256))) {
              rowsDone = true
              rowsIn([])
              emit(
                tg.state === 'failed'
                  ? { i: 'rows.failed', t, why: { kind: 'server' } }
                  : { i: 'rows.end', t, got: total(), total: tg.total, lost: 0 },
              )
              return
            }
            await new Promise<void>((resolve, reject) => {
              const off = rt.subscribe(() => {
                off()
                resolve()
              })
              signal.addEventListener(
                'abort',
                () => {
                  off()
                  reject(signal.reason)
                },
                { once: true },
              )
            })
          }
        } catch (e) {
          if (!signal.aborted)
            emit({
              i: 'rows.failed',
              t,
              why:
                (e as { why?: string })?.why === 'unconfigured'
                  ? { kind: 'unconfigured', code: 'no-key' }
                  : { kind: 'unavailable' },
            })
        }
      })()
      return undefined
    },
    timer(spec, t, emit) {
      const id = clock.later(() => emit({ i: 'time', t, now: Date.now() }), Math.max(0, spec.at - Date.now()))
      return () => clock.clear(id)
    },
  }
  const effect = (e: Effect) => {
    if (e.e === 'prefs.write') host.prefs.write(e.patch).catch(() => rt.input({ i: 'prefs.refused' }))
  }
  let crashed = false
  let told: ReaderState | null = null,
    tellFrame = 0
  const rt: Runtime = createRuntime({
    state: init({
      paper,
      here: !!host.translate,
      defaults: DEFAULTS,
      visit: o.visit,
      now: Date.now(),
      visible: document.visibilityState !== 'hidden',
      online: navigator.onLine !== false,
    }),
    handlers,
    effect,
    crash: (e) => {
      crashed = true
      console.error('[reader] the session crashed:', e)
      tellSoon()
    },
  })
  // ---- the objects wanted (the head), and the view following the state
  const fetching = new Set<string>()
  const onState = (s: State) => {
    for (const r of wanted(s)) {
      if (fetching.has(r.sha256)) continue
      fetching.add(r.sha256)
      objectOf(r).then(
        (b) => {
          head = read('head', b, r.sha256) as Head
          if (original?.doc) void original.source.prove(head.original.chunks)
          rt.input({ i: 'head', digest: r.sha256, head })
        },
        (e) =>
          rt.input({
            i: 'object.refused',
            digest: r.sha256,
            why: e instanceof Refused ? (e.why as 'gone' | 'bad' | 'network') : 'network',
          }),
      )
    }
    void ready.then(() => {
      panes?.setDisplay(s.visit.display ?? s.prefs.value.display)
      panes?.setSync(s.visit.sync ?? s.prefs.value.sync)
      composer?.setShown((s.visit.display ?? s.prefs.value.display) !== 'original')
    })
    tellSoon()
  }
  const unstate = rt.subscribe(onState)
  onState(rt.state)
  // ---- the preferences and the document's visibility
  host.prefs.read().then(
    (p) => rt.input({ i: 'prefs.read', value: p }),
    () => {},
  )
  const unwatch = host.prefs.watch((p) => rt.input({ i: 'prefs.landed', value: p }))
  const onVisible = () => rt.input({ i: 'env.visible', on: document.visibilityState !== 'hidden' })
  const onOnline = () => rt.input({ i: 'env.online', on: true }),
    onOffline = () => rt.input({ i: 'env.online', on: false })
  document.addEventListener('visibilitychange', onVisible)
  addEventListener('online', onOnline)
  addEventListener('offline', onOffline)
  // ---- what the host reads
  function tellSoon() {
    told = null
    if (tellFrame || closed) return
    tellFrame = clock.later(() => {
      tellFrame = 0
      for (const f of [...listeners]) f()
    }, 0)
  }
  function stateOf(): ReaderState {
    if (told) return told
    const s = rt.state
    const r = s.rows
    const rowsView = { target: r.target, from: s.here ? ('here' as const) : ('server' as const) }
    const p = panes as Panes | null
    told = {
      paper: { id: paper.id, version: paper.version ?? head?.paper.version ?? null, title: '', html: null },
      prefs: s.prefs.value,
      settings: { s: s.prefs.s, refused: s.prefs.refused },
      original:
        s.original.s === 'open'
          ? { s: 'open', pages: s.original.pages, ours: s.original.pin }
          : s.original.s === 'failed'
            ? { s: 'failed', why: s.original.why }
            : { s: 'opening', loaded: s.original.loaded },
      layer:
        s.layer.s === 'ready'
          ? { s: 'ready', laid: s.panes.laid, total: head?.paper.pages ?? 0, asOriginal: 0 }
          : s.layer.s === 'preparing'
            ? { s: 'preparing', position: s.layer.position, progress: s.layer.progress }
            : s.layer.s === 'refused'
              ? { s: 'refused', why: s.layer.why, retryAt: s.layer.retryAt }
              : { s: 'none' },
      rows:
        r.s === 'none'
          ? { ...rowsView, s: 'none' }
          : r.s === 'failed'
            ? { ...rowsView, s: 'failed', why: r.why, got: r.got, total: r.total, lost: r.lost }
            : { ...rowsView, s: r.s, got: r.got, total: r.total, lost: r.lost },
      view: {
        display: s.visit.display ?? s.prefs.value.display,
        sync: { on: s.visit.sync ?? s.prefs.value.sync, available: !!p?.doc },
        scale: p?.scale ?? 1,
        zoom: p?.zoom ?? null,
        narrow: root.hasAttribute('data-axt-narrow'),
        sides: {
          left: { page: p?.pageOf('left') ?? 0, pages: p?.right.pages ?? 0 },
          right: { page: p?.pageOf('right') ?? 0, pages: p?.right.pages ?? 0 },
        },
      },
      crashed,
    }
    return told
  }
  const held: Command[] = []
  const reader: Reader = {
    state: stateOf,
    subscribe(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    do(c) {
      if (closed) return
      if (c.do === 'set') {
        rt.input({ i: 'cmd.set', prefs: c.prefs })
        return
      }
      if (c.do === 'retry') {
        rt.input({ i: 'cmd.retry' })
        return
      }
      // (a command on the panes before they exist waits for them, in order; never dropped)
      if (!panes) {
        held.push(c)
        void ready.then(() => {
          const run = held.splice(0)
          for (const x of run) reader.do(x)
        })
        return
      }
      const p = panes
      if (c.do === 'zoom') p.zoomTo(c.to)
      else if (c.do === 'zoomBy') p.zoomBy(c.factor)
      else if (c.do === 'pinch') p.pinch(c.side, c.factor, c.at)
      else if (c.do === 'page') p.goToPage(c.side, c.page)
      else if (c.do === 'lead') p.lead(c.side)
      else if (c.do === 'narrow') p.setNarrow(c.on)
      else if (c.do === 'unit') {
        const l = composer?.member(c.id)?.lines[0]
        if (l) p.goToRect([l[0], l[2], l[6], l[3], l[5]])
      }
    },
    probe() {
      const s = rt.state
      return {
        original: s.original.s,
        layer: s.layer.s,
        rows: s.rows.s,
        live: rt.live.size,
        inputs: rt.counts.inputs,
        dropped: rt.counts.dropped,
        workers: kit?.workers ?? 0,
        storeBytes: store.bytes,
        clockDue: clock.due,
        laidPages: (composer?.probe().laidPages as number) ?? 0,
        lit: highlight?.lit?.id ?? null,
        crashed,
        ...Object.fromEntries(Object.entries(moments).map(([k, v]) => [`at.${k}`, v])),
      }
    },
    close() {
      if (closed) return
      closed = true
      unstate()
      unwatch()
      document.removeEventListener('visibilitychange', onVisible)
      removeEventListener('online', onOnline)
      removeEventListener('offline', onOffline)
      void rt.dispose().then(() => {
        panes?.dispose()
        scheduler.dispose()
        kit?.destroy()
        clock.dispose()
        root.replaceChildren()
        root.classList.remove('axt-reader')
        for (const a of ['data-axt-pdf-mode', 'data-axt-narrow', 'data-axt-swapped']) root.removeAttribute(a)
      })
      listeners.clear()
    },
  }
  return reader
}
