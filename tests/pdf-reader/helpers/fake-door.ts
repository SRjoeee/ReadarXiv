import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import type { LaidPage, Layer, LayerDocument, LeftPage, OpenLayerOptions, PageEvent, PageState, TextLayerData } from '@/pdf-reader/engine/layer-proto/reader.mjs'
import { type ReadPart, readLeftPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import type { Row } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { BUILTIN_RULES, RULES_SCHEMA } from '@/pdf-reader/engine/rules/layout.mjs'

// A door with the real signatures (layer-proto/reader.d.mts) and the readiness protocol's honest semantics, for the web lane's view
// tests and for the conformance suite (door-conformance.ts). It lays nothing: a page is "laid" when the composed document
// answers its page, and its SVG is a stand-in of the right size. What it keeps exactly is the protocol: when a page waits, lays,
// is ready or failed, what is told and when, what a pageOf does on each state, the refusals of addPart, the document swap and
// what onRetired hears, and the left pages' fetch once, wait and cache.
//
// Time is the test's: with `laying: 'manual'` (the default) a page asked and covered is `laying` at once and becomes ready or
// failed when the test calls `advance()`; with 'auto' it does so in the next tasks. A page fails when its composed page
// rejects (`doc.getPage(page)`) or when the test says `fail(page)`. `rows: 'gate'` makes a covered page wait for the rows
// of the units its parts tell (take, end) as the real door does; 'free' (the default) asks for none.
// Decisions the engine lane may amend (reader view contract E1, E2): an aborted ask drops a page that is still waiting from the
// targets and leaves one already laying to be laid; a page nobody asked, and no asked page's closure holds, stays waiting;
// the closure of an asked page is the page itself unless `closure` says more.

export interface FakeDoorOptions {
  laying?: 'manual' | 'auto'
  rows?: 'free' | 'gate'
  /** the pages laid with an asked page (default: the page alone) */
  closure?: (page: number) => readonly number[]
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const SCALE = 2.5
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' })
const tick = () => new Promise<void>(r => setTimeout(r, 0))

interface Waiter { resolve(p: LaidPage): void; reject(e: unknown): void; lang: string; signal: AbortSignal | undefined; onAbort: (() => void) | null }
interface LeftWaiter { resolve(): void; reject(e: unknown): void }
/** a left page's fetch: its promise, the askers it has, whether it still awaits its covering part (and how to stop awaiting) */
interface LeftEntry { promise: Promise<LeftPage>; askers: number; waiting: boolean; drop: (() => void) | null }

class FakeLayer implements Layer {
  private disposed = false
  private partsEnded = false
  private rowsEnded = false
  private readonly N: number
  private readonly parts: ReadPart[] = []
  private readonly told = new Set<string>()
  private through = 0
  private last: string | null = null
  private doc: LayerDocument
  private readonly state: PageState[]
  private readonly events = new Set<string>()
  private readonly asked = new Set<number>()
  private readonly waiters = new Map<number, Waiter[]>()
  private readonly leftWaiters = new Map<number, LeftWaiter[]>()
  private readonly leftCache = new Map<number, LeftEntry>()
  private readonly listeners = new Set<(page: number, state: PageEvent) => void>()
  private readonly queue: number[] = []
  private readonly taken = new Set<number>()
  private draining: Promise<void> | null = null
  /** the reads in flight on each document, and the documents superseded (or disposed with) that wait for their last read */
  private readonly reads = new Map<LayerDocument, number>()
  private readonly retiring = new Set<LayerDocument>()
  /** rejected at dispose: what waits on the host's transport races it */
  private readonly gone: Promise<never>
  private goneNow!: (e: unknown) => void
  /** as the real door: the head says the parts may carry draws */
  readonly drawsComing: boolean

  constructor(private readonly o: OpenLayerOptions, private readonly fake: { opts: FakeDoorOptions; failing: Set<number>; released(): void }) {
    this.N = o.index.head.paper.pages
    this.drawsComing = o.index.head.draw === 1
    this.gone = new Promise<never>((_, reject) => { this.goneNow = reject })
    this.gone.catch(() => {})
    this.doc = o.doc
    this.state = new Array(this.N + 1).fill('waiting')
    for (const part of o.parts ?? []) {
      this.order(part)
      this.take1(part)
    }
    if (o.doc.numPages !== this.N) throw new BundleRefusal(`the document has ${o.doc.numPages} pages, not ${this.N}`, { kind: 'part', path: 'doc' })
  }

  // ---------------------------------------------------------------- parts
  private order(part: ReadPart): void {
    if (part.head !== this.o.index.sha256) throw new BundleRefusal('not a part of the index\'s head', { kind: 'part', path: 'head' })
    if (part.pages[0] !== this.through + 1) throw new BundleRefusal(`not beginning at page ${this.through + 1}`, { kind: 'part', path: 'pages' })
    if (part.prev !== this.last) throw new BundleRefusal('not following the digest of the last part', { kind: 'part', path: 'prev' })
  }
  private take1(part: ReadPart): void {
    this.parts.push(part)
    this.told.add(part.sha256)
    this.through = part.pages[1]
    this.last = part.sha256
  }

  addPart(part: ReadPart): void {
    if (this.disposed) return
    if (this.told.has(part.sha256)) return
    if (this.partsEnded) throw new BundleRefusal('the parts have ended', { kind: 'part', path: '' })
    this.order(part)
    this.take1(part)
    for (const [page, list] of [...this.leftWaiters]) if (page <= this.through) { this.leftWaiters.delete(page); for (const w of list) w.resolve() }
    this.promote()
  }

  endParts(): void {
    if (this.disposed || this.partsEnded) return
    this.partsEnded = true
    for (let p = this.through + 1; p <= this.N; p++) {
      this.asked.delete(p)
      if (this.state[p] === 'waiting') this.settle(p, 'failed', new Error(`page ${p} is covered by no part`))
    }
    for (const [page, list] of [...this.leftWaiters]) if (page > this.through) { this.leftWaiters.delete(page); for (const w of list) w.reject(new Error(`page ${page} is covered by no part`)) }
  }

  /** a document no longer wanted: told to the host once no task reads it */
  private retire(doc: LayerDocument): void {
    if (this.reads.get(doc)) this.retiring.add(doc)
    else this.o.onRetired(doc)
  }
  private async read(doc: LayerDocument, page: number): Promise<void> {
    this.reads.set(doc, (this.reads.get(doc) ?? 0) + 1)
    try { await doc.getPage(page) } finally {
      const left = (this.reads.get(doc) as number) - 1
      if (left > 0) this.reads.set(doc, left)
      else {
        this.reads.delete(doc)
        if (this.retiring.delete(doc)) this.o.onRetired(doc)
      }
    }
  }

  // ---------------------------------------------------------------- rows
  take(rows: readonly Row[]): { complete: number[] } {
    if (this.disposed) return { complete: [] }
    const before = this.gated()
    for (const r of rows) this.taken.add(r[0])
    const complete = before.filter(p => !this.gated().includes(p))
    this.promote()
    return { complete }
  }
  end(): void {
    if (this.disposed) return
    this.rowsEnded = true
    this.promote()
  }
  /** the covered pages that wait for rows */
  private gated(): number[] {
    const out: number[] = []
    for (let p = 1; p <= this.through; p++) if (!this.rowsIn(p)) out.push(p)
    return out
  }
  private rowsIn(page: number): boolean {
    if (this.fake.opts.rows !== 'gate' || this.rowsEnded) return true
    for (const part of this.parts) {
      if (part.pages[0] > page) break
      for (const id of [...part.left.map(w => w[0]), ...part.fileOnly.map(e => e[0])]) if (!this.taken.has(id)) return false
    }
    return true
  }

  // ---------------------------------------------------------------- states
  private check(): void {
    if (this.disposed) throw new Error('the layer is disposed')
  }
  private range(page: number): void {
    if (!Number.isInteger(page) || page < 1 || page > this.N) throw new RangeError(`not a page 1 to ${this.N}`)
  }
  pageState(page: number): PageState {
    this.check()
    this.range(page)
    return this.state[page] as PageState
  }
  /** the fake's own rule: in gate mode, the units of the parts through the page whose rows are not taken (none ended) */
  rowsFor(page: number): number[] {
    this.check()
    this.range(page)
    if (this.fake.opts.rows !== 'gate' || this.rowsEnded || this.state[page] === 'ready') return []
    const out: number[] = []
    for (const part of this.parts) {
      if (part.pages[0] > page) break
      for (const id of [...part.left.map(w => w[0]), ...part.fileOnly.map(e => e[0])]) if (!this.taken.has(id)) out.push(id)
    }
    return out.sort((a, b) => a - b)
  }
  onPage(listener: (page: number, state: PageEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private tell(page: number, ev: PageEvent): void {
    const key = `${page}:${ev}`
    if (this.events.has(key)) return
    this.events.add(key)
    for (const l of [...this.listeners]) {
      try { l(page, ev) } catch { /* a listener's own error is its own */ }
    }
  }
  /** a waiting page that is covered, has its rows and is asked or in an asked page's closure begins to lay */
  private promote(): void {
    if (this.disposed) return
    const closure = this.fake.opts.closure ?? ((p: number) => [p])
    for (const g of [...this.asked].sort((a, b) => a - b)) {
      // (the closure is laid together: not one of its pages begins while a part or the rows of any of them is missing)
      const members = closure(g).filter(c => c >= 1 && c <= this.N)
      if (members.some(c => c > this.through || !this.rowsIn(c))) continue
      for (const c of members) {
        if (this.state[c] !== 'waiting') continue
        this.state[c] = 'laying'
        this.tell(c, 'laying')
        this.queue.push(c)
      }
    }
    if (this.queue.length && this.fake.opts.laying === 'auto') queueMicrotask(() => { void this.drain() })
  }
  private settle(page: number, to: 'ready' | 'failed', why?: unknown): void {
    this.state[page] = to
    this.tell(page, to)
    const list = this.waiters.get(page) ?? []
    this.waiters.delete(page)
    for (const w of list) {
      this.clear(w)
      if (to === 'ready') w.resolve(this.fresh(page, w.lang))
      else w.reject(why ?? new Error(`page ${page} failed`))
    }
  }
  private clear(w: Waiter): void {
    if (w.signal && w.onAbort) w.signal.removeEventListener('abort', w.onAbort)
  }
  /** lays what is queued; the page is laid when its composed page answers */
  drain(): Promise<void> {
    if (this.draining) return this.draining
    const run = (async () => {
      while (this.queue.length && !this.disposed) {
        const page = this.queue.shift() as number
        let failed = false, failure: unknown = null
        try {
          if (this.fake.failing.has(page)) throw new Error(`page ${page}: the test made it fail`)
          await this.read(this.doc, page)
        } catch (e) { failed = true; failure = e }
        if (this.disposed) return
        // (a read can reject with any value, a falsy one among them)
        if (failed) this.settle(page, 'failed', failure ?? new Error(`page ${page} cannot be read`))
        else this.settle(page, 'ready')
      }
    })()
    this.draining = run
    // (cleared after the assignment above, never inside the run: an empty queue ends it before anything is assigned)
    void run.finally(() => { if (this.draining === run) this.draining = null })
    return run
  }

  private viewOf(page: number): [number, number, number, number] {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const part = this.parts[i] as ReadPart
      if (part.pages[0] <= page && page <= part.reach) {
        const o = 4 * (page - part.pages[0])
        return [part.views[o] as number, part.views[o + 1] as number, part.views[o + 2] as number, part.views[o + 3] as number]
      }
    }
    return [0, 0, 612, 792]
  }
  private fresh(page: number, lang: string): LaidPage {
    const [x0, y0, x1, y1] = this.viewOf(page)
    const w = SCALE * (x1 - x0), h = SCALE * (y1 - y0)
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
    svg.setAttribute('lang', lang)
    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    const text = document.createElementNS(SVG_NS, 'text')
    text.textContent = `page ${page}`
    svg.append(text)
    return { svg, w, h, words: { tokens: { n: 0, l: new Float32Array(0), r: new Float32Array(0), y: new Float32Array(0), h: new Float32Array(0), top: new Float32Array(0), bottom: new Float32Array(0) }, word: new Int32Array(0), at: new Int32Array(0), spans: [], original: [] }, links: [] }
  }

  pageOf(page: number, o: { lang: string; signal?: AbortSignal }): Promise<LaidPage> {
    this.check()
    this.range(page)
    if (typeof o?.lang !== 'string') throw new TypeError('lang: a language')
    const signal = o.signal
    if (signal?.aborted) return Promise.reject(abortError())
    const st = this.state[page]
    if (st === 'failed') return Promise.reject(new Error(`page ${page} failed`))
    if (st === 'ready') return Promise.resolve().then(() => this.fresh(page, o.lang))
    return new Promise<LaidPage>((resolve, reject) => {
      const w: Waiter = { resolve, reject, lang: o.lang, signal, onAbort: null }
      if (signal) {
        w.onAbort = () => {
          const list = (this.waiters.get(page) ?? []).filter(x => x !== w)
          if (list.length) this.waiters.set(page, list)
          else { this.waiters.delete(page); this.asked.delete(page) }
          reject(abortError())
        }
        signal.addEventListener('abort', w.onAbort, { once: true })
      }
      this.waiters.set(page, [...(this.waiters.get(page) ?? []), w])
      this.asked.add(page)
      this.promote()
    })
  }

  // ---------------------------------------------------------------- the left
  leftPageOf(page: number, o: { signal?: AbortSignal } = {}): Promise<LeftPage> {
    this.check()
    this.range(page)
    const signal = o.signal
    if (signal?.aborted) return Promise.reject(abortError())
    let entry = this.leftCache.get(page)
    if (!entry) {
      const made: LeftEntry = { promise: null as never, askers: 0, waiting: false, drop: null }
      made.promise = this.fetchLeft(page, made).catch(e => { if (this.leftCache.get(page) === made) this.leftCache.delete(page); throw e })
      this.leftCache.set(page, made)
      entry = made
    }
    const asked = entry
    asked.askers++
    if (!signal) return asked.promise
    return new Promise<LeftPage>((resolve, reject) => {
      const onAbort = () => {
        asked.askers--
        reject(abortError())
        // (the last asker gone while the part covering the page is awaited: the wait is dropped and nothing is fetched)
        if (asked.askers === 0 && asked.waiting) asked.drop?.()
      }
      signal.addEventListener('abort', onAbort, { once: true })
      asked.promise.then(v => { signal.removeEventListener('abort', onAbort); resolve(v) }, e => { signal.removeEventListener('abort', onAbort); reject(e) })
    })
  }
  private async fetchLeft(page: number, entry: LeftEntry): Promise<LeftPage> {
    if (page > this.through) {
      if (this.partsEnded) throw new Error(`page ${page} is covered by no part`)
      entry.waiting = true
      await new Promise<void>((resolve, reject) => {
        const w: LeftWaiter = { resolve, reject }
        this.leftWaiters.set(page, [...(this.leftWaiters.get(page) ?? []), w])
        entry.drop = () => {
          const rest = (this.leftWaiters.get(page) ?? []).filter(x => x !== w)
          if (rest.length) this.leftWaiters.set(page, rest)
          else this.leftWaiters.delete(page)
          reject(abortError())
        }
      })
      entry.waiting = false
    }
    if (this.disposed) throw new Error('the layer is disposed')
    const part = this.parts.find(q => q.pages[0] <= page && page <= q.pages[1]) as ReadPart
    const ref = part.leftParts.find(r => r.page === page) as ReadPart['leftParts'][number]
    // (the transport may never answer: disposal ends the wait)
    const bytes = await Promise.race([this.o.leftPart(page, ref), this.gone])
    if (this.disposed) throw new Error('the layer is disposed')
    const streams = new Map<number, number>()
    for (const q of this.parts) for (const w of q.left) streams.set(w[0], w[1])
    return readLeftPart(bytes, { ref, streamOf: id => streams.get(id) })
  }

  // ---------------------------------------------------------------- the rest
  /** the holds the host asked, each its promise: kept, never waited on (the fake lays when the test says, `advance`) */
  readonly holds: PromiseLike<unknown>[] = []
  hold(promise: PromiseLike<unknown>): void {
    if (this.disposed) return
    this.holds.push(promise)
  }
  /** as the real door: render A of the composed document's page (its render told, with the host's annotation mode), on a canvas of
   *  the size asked */
  copyOf(page: number, o: { k: number; width: number; height: number; context?: CanvasRenderingContext2DSettings | null; annotationMode?: number; signal?: AbortSignal | null }): Promise<HTMLCanvasElement> {
    this.check()
    this.range(page)
    if (this.state[page] !== 'ready') return Promise.reject(new Error(`page ${page} is not laid`))
    return (async () => {
      const pg = await this.doc.getPage(page) as { render?: (p: object) => { promise: Promise<unknown> } }
      const canvas = document.createElement('canvas')
      canvas.width = o.width
      canvas.height = o.height
      await pg.render?.({ canvas, canvasContext: canvas.getContext('2d', o.context ?? undefined), viewport: null, ...(o.annotationMode === undefined ? {} : { annotationMode: o.annotationMode }) }).promise
      this.check()
      return canvas
    })()
  }
  /** a ready page's text layer: its number kept (the page's first line) and one translated line, as the real door's are shaped */
  textOf(page: number): Promise<TextLayerData> {
    this.check()
    this.range(page)
    if (this.state[page] !== 'ready') return Promise.reject(new Error(`page ${page} is not laid`))
    const [x0, y0, x1, y1] = this.viewOf(page)
    const top = y1 - 72
    // (answered in a microtask, as the real door's: a dispose in between rejects it)
    return Promise.resolve().then(() => {
      this.check()
      return this.textData(page, x0, x1, y0, y1, top)
    })
  }
  private textData(page: number, x0: number, x1: number, y0: number, y1: number, top: number): TextLayerData {
    return ({
      items: [
        { str: `${page}`, x: x0 + 72, y: top - 2, w: 6, h: 10, base: top, dir: 'ltr', fontSize: 10, from: 'kept' },
        { str: `page ${page}`, x: x0 + 90, y: top - 2.2, w: 60, h: 9.7, base: top, dir: 'ltr', fontSize: 10, from: 'translated', unit: 0, eol: true },
      ],
      page: { w: x1 - x0, h: y1 - y0 },
      stats: { kept: 1, moved: 0, translated: 1, dropped: 0, work: 0, merged: 0 },
    })
  }
  unitAt(page: number, x: number, y: number): number | null {
    if (!Number.isInteger(page) || page < 1 || page > this.through) return null
    let best: { id: number; area: number } | null = null
    for (const part of this.parts) {
      for (const [id, , rects] of part.left) {
        for (const [p, x0, y0, x1, y1] of rects) {
          if (p !== page || x < (x0 as number) || x > (x1 as number) || y < (y0 as number) || y > (y1 as number)) continue
          const area = ((x1 as number) - (x0 as number)) * ((y1 as number) - (y0 as number))
          if (best === null || area < best.area || (area === best.area && id < best.id)) best = { id, area }
        }
      }
    }
    return best === null ? null : best.id
  }
  stats() {
    const ready: number[] = []
    for (let p = 1; p <= this.N; p++) if (this.state[p] === 'ready') ready.push(p)
    return {
      units: this.o.index.units.filter(u => u !== null).length, drawn: ready.length, pages: ready, slowestTaskMs: 0, pageMs: {}, dropped: 0, droppedRows: [],
      links: { total: 0, inPlace: 0, moved: 0, dropped: { unmatched: 0, ambiguous: 0, unplaced: 0 }, unsupported: 0, unread: 0 },
      rules: { schema: RULES_SCHEMA, version: (this.o.rules ?? BUILTIN_RULES).version },
      parts: { through: this.through, told: this.parts.length },
      // (the fake holds no draw for a run)
      draws: { held: 0, bytes: 0 },
    }
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gone = new Error('the layer is disposed')
    for (const [, list] of [...this.waiters]) for (const w of list) { this.clear(w); w.reject(gone) }
    this.waiters.clear()
    for (const [, list] of [...this.leftWaiters]) for (const w of list) w.reject(gone)
    this.leftWaiters.clear()
    this.listeners.clear()
    this.queue.length = 0
    this.fake.released()
    this.goneNow(gone)
    this.retire(this.doc)
  }
}

export interface FakeDoor {
  /** openLayer's signature (reader.d.mts); one open layer at a time */
  openLayer(o: OpenLayerOptions): Promise<Layer>
  /** lets the layer lay what is queued (manual mode), then lets the tasks that answer run */
  advance(): Promise<void>
  /** the next layings of `page` fail, as a composed page that cannot be read */
  fail(page: number): void
  /** the layer open now, if any */
  readonly layer: Layer | null
}

export function createFakeDoor(opts: FakeDoorOptions = {}): FakeDoor {
  let live: FakeLayer | null = null
  const failing = new Set<number>()
  return {
    async openLayer(o) {
      if (live) throw new Error('a layer is open: dispose it first')
      for (const key of ['leftPart', 'onRetired'] as const) if (typeof o[key] !== 'function') throw new TypeError(`${key}: a function`)
      if (o.index?.kind !== 'index' || typeof o.doc?.getPage !== 'function') throw new TypeError('index and doc: the index and the composed document')
      const layer = new FakeLayer(o, { opts, failing, released: () => { live = null } })
      live = layer
      return layer
    },
    async advance() {
      if (live) await live.drain()
      await tick()
    },
    fail(page) { failing.add(page) },
    get layer() { return live },
  }
}
