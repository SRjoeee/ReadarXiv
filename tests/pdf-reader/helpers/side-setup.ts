// The layer side's tests' setup (layer-side.test.ts with the fake door, layer-side-door.test.ts with the real one): the reading
// view over its PDF.js stand-ins and a clock moved by hand (reader-fakes.ts), the original's four pages shown, and its layer side
// over a door and the format test's small paper (format-paper.ts) served by digest; what the side asked of each door recorded
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import type { Ref } from '@/pdf-reader/engine/layer-proto/format.mjs'
import type { Layer, LayerDocument, LinkRecord, OpenLayerOptions } from '@/pdf-reader/engine/layer-proto/reader.mjs'
import type { Row } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { createLayerSide, type LayerSide, type LayerSideOptions, type TellRef } from '@/pdf-reader/engine/view/layer-side.mjs'
import { createReaderView, type DocumentTask, internalsOf, type ReaderHost, type ReaderView, type ViewEvent, type ViewPrefs } from '@/pdf-reader/engine/view/reader-view.mjs'
import { createFakeDoor, type FakeDoor, type FakeDoorOptions } from './fake-door'
import { made, type Made, N } from './format-paper'
import { drawPanes, FakeIO, FakeRO, fakeDoc, fakeKit, fakeTask, type FakeTask, flush, installLayout, type ManualClock, manualClock, resetFakes } from './reader-fakes'
import { withGroups } from './groups'

/** the hooks every side test file runs: the layout model, the observers, a console that keeps the warnings, the views disposed */
export function installSideFakes() {
  let restoreLayout: () => void
  beforeAll(() => { restoreLayout = installLayout() })
  afterAll(() => restoreLayout())
  beforeEach(() => {
    resetFakes()
    FakeIO.live.clear(); FakeRO.live.clear()
    vi.stubGlobal('IntersectionObserver', FakeIO)
    vi.stubGlobal('ResizeObserver', FakeRO)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    for (const v of views.splice(0)) v.dispose()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
}
const views: ReaderView[] = []

const papers = new Map<string, Made>()
/** the format test's small paper, written and read back once. Its head is the engine's head of a layer over our own compile (the layer
 *  draws only over one, BUNDLE 8); `ours = false`: its head over arXiv's PDF, which draws nothing (the fallback); `delta`: ours held
 *  as a delta over arXiv's PDF, replacing those page ranges */
export async function M(ours = true, delta?: [number, number][]): Promise<Made> {
  const key = delta ? `delta ${JSON.stringify(delta)}` : ours ? 'ours' : 'arxiv'
  let made_ = papers.get(key)
  if (!made_) {
    made_ = await made(delta ? { ours: true, delta } : ours ? { ours: true } : {})
    papers.set(key, made_)
  }
  return made_
}
export const macrotask = () => new Promise(r => setTimeout(r, 0))
export const jobRef = (m: Made, i: number): TellRef => ({ ...(m.parts[i]!.ref as Ref), prev: i ? m.parts[i - 1]!.sha256 : null })
export const ALL = async (ours = true, delta?: [number, number][]) => { const m = await M(ours, delta); return { head: m.head.ref, units: m.chunks.map(c => c.ref), parts: [0, 1, 2].map(i => jobRef(m, i)), end: { through: N } } }
/** a row of each unit: its text as one translated piece; `sentences` where given */
export const rowOf = (id: number, text = `t${id}`, sentences: Row[4] = null): Row => [id, [text], 'whole', 'test', sentences]
/** the units with lines on page n, rising */
export const unitsOn = (m: Made, n: number) => [...new Set(m.readParts.flatMap(p => p.left.filter(w => w[2].some(r => r[0] === n)).map(w => w[0])))].sort((a, b) => a - b)

export interface Setup {
  view: ReaderView; side: LayerSide; door: FakeDoor; clock: ManualClock; events: ViewEvent[]; panes: { left: HTMLElement; right: HTMLElement }
  fetched: string[]; refuse: Set<string>; objects: Map<string, Uint8Array>
  /** digests whose fetch waits until its signal aborts; each fetch's signal, by digest (the last) */
  hold: Set<string>; signals: Map<string, AbortSignal>
  composed: { tail: Uint8Array | null; options: Record<string, unknown>; task: FakeTask }[]
  destroyed: string[]; warned: () => string[]; opens: number; highlight(on: boolean): void
  /** each door opened: the door, the rows it took, its ends, the copies it was asked (page, the ask, k) and each copy's size
   *  (page, width, height) */
  doors: { layer: Layer; taken: Row[]; ended: number; copies: [number, unknown, number][]; sized: [number, number, number][]; classes: unknown; options?: OpenLayerOptions }[]
  /** the door the side holds now (the last opened, while it lives) */
  layer(): Layer | null
  real: boolean
  /** the original's loading task, as the view was given it (null with none) */
  original: FakeTask | null
  /** the addresses the host was asked to open (its links.openExternal) */
  opened: string[]
}
export interface Options {
  /** the paper's head the engine's head of a layer over our own compile (format-paper.ts made({ ours: true })) */
  ours?: boolean
  /** ours held as a delta over arXiv's PDF, replacing these page ranges (format-paper.ts made({ delta })) */
  delta?: [number, number][]
  door?: FakeDoorOptions
  /** the host's base check, given the head's base as the side read it */
  bind?: (base: Record<string, unknown>) => Promise<boolean>
  composedFails?: boolean
  noOriginal?: boolean
  extra?: { bytes: Uint8Array; sha256: string }[]
  /** the real door, its composed documents made by `docFor(r)` (N + r pages) */
  real?: { openLayer: (o: OpenLayerOptions) => Promise<Layer>; docFor(r: number): LayerDocument }
  faceSources?: LayerSideOptions['faceSources']
  /** another paper's objects served (its pages `pages`), in place of the format test's */
  paper?: { objects: readonly { bytes: Uint8Array; sha256: string }[]; pages: number }
  /** pages whose first copy the door fails to draw; or which copies fail: the door's index (0 the first opened), the page, the
   *  page's copies drawn by that door before */
  copyFails?: readonly number[] | ((door: number, page: number, before: number) => boolean)
  /** the composed opens (0 the first) that fail */
  composedFailAt?: readonly number[]
  /** the door refuses to open, as openLayer refuses a document of another page count; or the opens (0 the first) that do */
  openFails?: boolean
  openFailAt?: readonly number[]
  /** each open held until this settles (an open under way, for what lands meanwhile) */
  openHold?: Promise<void>
  /** the host's getDocument options (the kit's assets) in place of the fakes' */
  assets?: Record<string, unknown>
  /** the fake door's links of a laid page (the door's own gives none); `n` the page, `door` its index (0 the first opened) */
  links?: (n: number, door: number) => LinkRecord[]
  /** the host's PDF.js text layer builder (its pdf_viewer's TextLayerBuilder: the fakes' FakeTextLayerBuilder), none by default */
  textBuilder?: unknown
  /** the side's bounds (LayerSideOptions): the drawings' pixels kept off the view, the pages laid ahead */
  keepPixels?: number
  ahead?: number
  /** the reader's toggles (LayerSideOptions `classes`), none by default: the door's defaults */
  classes?: Partial<Record<'heads' | 'tables' | 'figures' | 'references' | 'names', boolean>>
  /** a host that translates the units itself, told of an index grown by a late chunk (LayerSideOptions `onIndex`) */
  onIndex?: (index: unknown) => void
}
/** the view over the original (its four pages), its layer side over the door and the paper's objects served by digest */
export async function setup(o: Options = {}): Promise<Setup> {
  const m = await M(o.ours, o.delta)
  const panes = drawPanes()
  const events: ViewEvent[] = []
  const clock = manualClock()
  let look: ViewPrefs = { swapped: false, dimPages: false, theme: 'light', highlight: true }
  const lookers = new Set<(p: ViewPrefs) => void>()
  const opened: string[] = []
  const kit = fakeKit()
  if (o.textBuilder) kit.viewer = { ...kit.viewer, TextLayerBuilder: o.textBuilder } as typeof kit.viewer
  const host: ReaderHost = {
    panes, pdfjs: { ...kit, ...(o.assets ? { assets: o.assets } : {}), lib: { AnnotationMode: { DISABLE: 0, ENABLE: 1, ENABLE_FORMS: 2 }, OPS: {} } }, clock, scrollEnd: 'native',
    words: { pageName: (s, n) => `${s} ${n}`, sideName: s => s },
    prefs: { get: () => look, subscribe: l => { lookers.add(l); return () => { lookers.delete(l) } } }, links: { openExternal: u => { opened.push(u) } }, emit: e => events.push(e),
  }
  const view = createReaderView(host)
  views.push(view)
  let original: FakeTask | null = null
  if (!o.noOriginal) {
    const task = fakeTask()
    original = task
    const answer = view.showOriginal(() => task as unknown as DocumentTask)
    task.resolve(fakeDoc(o.paper?.pages ?? N))
    expect(await answer).toBe('opened')
  }
  const objects = new Map<string, Uint8Array>()
  for (const w of o.paper?.objects ?? [...m.chunks, m.head, ...m.parts, ...Object.values(m.lefts), ...(o.extra ?? [])]) objects.set(w.sha256, w.bytes)
  const fetched: string[] = [], refuse = new Set<string>(), destroyed: string[] = []
  const hold = new Set<string>(), signals = new Map<string, AbortSignal>()
  const fetchObject = async (ref: Ref, signal: AbortSignal) => {
    fetched.push(ref.sha256)
    signals.set(ref.sha256, signal)
    if (hold.has(ref.sha256)) await new Promise<void>((_, no) => signal.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }))
    await macrotask()
    if (refuse.has(ref.sha256)) throw new Error('refused by the test')
    const b = objects.get(ref.sha256)
    if (!b) throw new Error('no such object')
    return b
  }
  const composed: Setup['composed'] = []
  const door = createFakeDoor({ laying: 'manual', ...o.door })
  let opens = 0, live: Layer | null = null
  const doors: Setup['doors'] = []
  const side = createLayerSide(view, {
    paper: { id: '2608.04322', version: 1 }, target: 'zh', faceSources: o.faceSources ?? (async () => null), hyphUrl: () => '',
    ...(o.keepPixels === undefined ? {} : { keepPixels: o.keepPixels }), ...(o.ahead === undefined ? {} : { ahead: o.ahead }), ...(o.classes === undefined ? {} : { classes: o.classes }), ...(o.onIndex ? { onIndex: o.onIndex } : {}),
    fetchObject, bind: (o.bind ?? (async () => true)) as never,
    composed: (tail, options) => {
      const task = fakeTask(destroyed, `composed ${composed.length}`)
      composed.push({ tail, options, task })
      if (o.composedFails || o.composedFailAt?.includes(composed.length - 1)) task.reject(new Error('no composed document'))
      else task.resolve((o.real ? o.real.docFor(0) : drawable(fakeDoc(o.paper?.pages ?? N))) as never)
      return task as unknown as DocumentTask
    },
    openLayer: (async (oo: OpenLayerOptions) => {
      opens++
      if (o.openHold) await o.openHold
      if (o.openFails || o.openFailAt?.includes(opens - 1)) throw new BundleRefusal('the document has 9 pages, not 4', { kind: 'part', path: 'doc' })
      const layer = o.real ? await o.real.openLayer(oo) : await door.openLayer(oo)
      live = layer
      const seen: Setup['doors'][number] = { layer, taken: [], ended: 0, copies: [], sized: [], classes: (oo as { classes?: unknown }).classes ?? null, options: oo }
      doors.push(seen)
      const take = layer.take.bind(layer), end = layer.end.bind(layer), copyOf = layer.copyOf.bind(layer), dispose = layer.dispose.bind(layer)
      layer.take = r => { seen.taken.push(...r); return take(r) }
      layer.end = () => { seen.ended++; end() }
      const which = doors.length - 1, list = Array.isArray(o.copyFails) ? new Set(o.copyFails) : null
      const fails = typeof o.copyFails === 'function' ? o.copyFails : (d: number, n: number, before: number) => d === 0 && before === 0 && !!list?.has(n)
      layer.copyOf = (n, oo) => {
        const before = seen.copies.filter(c => c[0] === n).length
        seen.copies.push([n, oo, oo.k])
        seen.sized.push([n, oo.width, oo.height])
        if (fails(which, n, before)) return Promise.reject(new Error(`the copy of page ${n} failed (the test's)`))
        return copyOf(n, oo)
      }
      layer.dispose = () => { if (live === layer) live = null; dispose() }
      // the fake lays no unit: every unit with lines on a page is shown there as the original's, as the real door's words say
      if (!o.real) {
        const pageOf = layer.pageOf.bind(layer)
        layer.pageOf = (n, oo2) => pageOf(n, oo2).then(laid => ({ ...laid, words: { ...laid.words, original: unitsOn(m, n) }, ...(o.links ? { links: o.links(n, which) } : {}) }))
      }
      return layer
    }) as never,
  })
  return {
    view, side, door, clock, events, panes, fetched, refuse, objects, composed, destroyed, hold, signals,
    warned: () => (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => String(c[0])),
    get opens() { return opens },
    doors,
    layer: () => live,
    real: !!o.real,
    original,
    opened,
    highlight(on) { look = { ...look, highlight: on }; for (const l of lookers) l(look) },
  }
}
/** a document whose pages draw (on a canvas, nothing: a page's copy drawn from the composed document) */
export const renders: { page: number; annotationMode: unknown }[] = []
export function drawable(d: ReturnType<typeof fakeDoc>) {
  withGroups(d)
  const get = d.getPage.bind(d)
  d.getPage = async (n: number) => Object.assign(await get(n), { render: (p: { annotationMode?: unknown }) => { renders.push({ page: n, annotationMode: p.annotationMode }); return { promise: Promise.resolve() } } })
  return d
}
/** the side's tasks run: the door laying what is queued (the fake's; `lay` false: nothing laid), the feed's digests, the view's
 *  frames and its 0 ms tasks */
export async function settle(s: Setup, n = 30, lay = true) {
  for (let i = 0; i < n; i++) { await macrotask(); if (lay && !s.real && s.door.layer) await s.door.advance(); await s.clock.advance(17) }
}
export const places = (s: Setup) => [...s.panes.right.querySelectorAll<HTMLElement>(':scope > .pdfViewer > .page')]
export const nearOn = async (s: Setup, pages: number[], on = true) => { FakeIO.tell(pages.map(n => places(s)[n - 1] as HTMLElement), on); await flush(10) }
export const content = (s: Setup, n: number) => internalsOf(s.view).places.contentOf(n)
export const layerOf = (s: Setup, n: number) => places(s)[n - 1]?.querySelector('.axt-layer') as HTMLElement | null
