// The extension's run of a paper on the layer (session/run.ts; Stage 5 Task 9 B3-B6, R2-R4, and Review Focus 1 and 2): our
// server's every answer, the base checked and our copy shown where arXiv's bytes are not it, the objects through this machine's
// store first, the extension's own translation into rows, a retry. The side and the view are stand-ins recording what the run
// asks of them (the side's own rows are layer-side.test.ts's); the server is a fetch answering by address
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerStore } from '@/cache/layer-store'
import { CTAG5, writeCatalog } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import type { Row } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { POLL_SLOW_AFTER_MS, POLL_SLOW_MS, PREPARE_DEADLINE_MS, type RunEvent, type RunHost, startRun, WAIT_MIN } from '@/pdf-reader/session/run'
import { readFileSync } from 'node:fs'
import * as PL from '@cantoo/pdf-lib'
import { deltaOf } from '@/pdf-reader/engine/layout/delta.mjs'
import { startxrefOf } from '@/pdf-reader/engine/layout/tail.mjs'
import { cutSample, oursOf } from '../e2e/lib/layer-cut.mjs'
import { made, type Made, N, PAPER } from './helpers/format-paper'

const API = 'https://readarxiv.com'
const SEG = `${PAPER.id}v${PAPER.version}`
const ARXIV = `https://arxiv.org/pdf/${SEG}`
let m: Made, mOurs: Made
let catalog: Uint8Array<ArrayBuffer>
beforeEach(async () => {
  m ??= await made()
  mOurs ??= await made({ ours: true })
  catalog ??= (await writeCatalog({ head: m.readHead, units: m.chunks.map(c => ({ from: c.from, to: c.to, sha256: c.sha256, bytes: c.bytes.length })), parts: m.parts.map(p => ({ from: p.from, to: p.to, sha256: p.sha256, bytes: p.bytes.length })), end: { through: N } } as never)).bytes as Uint8Array<ArrayBuffer>
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
/** the layer API at API: the layer's route answers each look from `looks` in turn (the last one again), the prepare `prepare` */
/** a range of `file` as a server answers it: a 206 of the bytes asked, its length and `tag`; a 200 of the whole where no
 *  range is asked */
function ranges(file: Uint8Array, init: RequestInit, tag: string) {
  const m = /^bytes=(\d+)-(\d+)$/.exec((init.headers as Record<string, string> | undefined)?.range ?? '')
  if (!m) return new Response(file as BodyInit)
  const begin = Number(m[1]), end = Math.min(Number(m[2]) + 1, file.length)
  return new Response(file.slice(begin, end) as BodyInit, { status: 206, headers: { 'content-range': `bytes ${begin}-${end - 1}/${file.length}`, etag: tag } })
}
function server(looks: (() => Response)[], o: { prepare?: () => Response; original?: Uint8Array; base?: Uint8Array; objects?: Map<string, Uint8Array>; tag?: string; arxiv?: Uint8Array | 'whole' } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  let i = 0
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    if (url === ARXIV) return o.arxiv === 'whole' || !o.arxiv ? new Response((o.arxiv === 'whole' ? o.original : null) as BodyInit) : ranges(o.arxiv, init, '"sha256:arxiv-s"')
    if (url.endsWith('/prepare')) return (o.prepare ?? (() => json(202, { position: 1, stage: null, progress: 0, retryAfterMs: 0 })))()
    if (url.includes('/o/')) { const b = o.objects?.get(url.slice(-64)); return b ? new Response(b as BodyInit, { headers: o.tag ? { 'x-axt-base-etag': o.tag } : {} }) : new Response('', { status: 404 }) }
    // our base page (the layer route): by ranges, its own tag (the run is bound to its length alone)
    if (url.includes('/api/v1/base/')) return o.base ? ranges(o.base, init, '"base-tag"') : new Response('', { status: 404 })
    if (url.includes('/original/')) return o.original ? (o.tag ? ranges(o.original, init, o.tag) : new Response(o.original as BodyInit)) : new Response('', { status: 404 })
    return (looks[Math.min(i++, looks.length - 1)] as () => Response)()
  })
  return { f: f as unknown as typeof fetch, calls, layerLooks: () => calls.filter(c => c.url === `${API}/api/v1/layer/${SEG}/${CTAG5}`).length }
}
/** the side as the run drives it */
/** a PDF's SHA-256 (what a head's `orig` names) */
const hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
/** the head the side's index holds: by default a layer over our own compile (`source` ours), with the arXiv PDF its check ran over
 *  (`orig`: the default view's, the tab's own bytes); `base` and `orig` replace them (the head of a layer that draws nothing: arXiv's) */
function headOf(over: { base?: object; orig?: { bytes: number; sha256: string; xref?: number } | null } = {}) {
  // (the engine's own head of a layer over our compile: its base, with the check it passed)
  const base = over.base ?? mOurs.index.head.base
  const orig = over.orig === undefined ? { bytes: 4, sha256: hex(new Uint8Array([1, 2, 3, 4])) } : over.orig
  return { ...m.index.head, base, orig }
}
function fakeSide(first: ReturnType<typeof headOf> | null = null) {
  const told: unknown[] = [], taken: Row[] = []
  let ended = 0, agains = 0, options: Record<string, unknown> | null = null, head = first
  const side = {
    tell: vi.fn((r: unknown) => { told.push(r) }), index: vi.fn(async () => ({ ...m.index, head: head ?? headOf() })), take: vi.fn((rows: Row[]) => { taken.push(...rows) }),
    end: vi.fn(() => { ended++ }), again: vi.fn(() => { agains++ }), rowsFor: vi.fn(() => [] as number[]), coverage: vi.fn(), probe: vi.fn(() => ({})), dispose: vi.fn(),
  }
  return { side, told, taken, setHead: (next: ReturnType<typeof headOf>) => { head = next }, ended: () => ended, agains: () => agains, options: () => options as never as { fetchObject(r: unknown, s: AbortSignal): Promise<Uint8Array>; bind(b: { bytes: number; sha256: string; xref: number }): Promise<boolean>; composed(t: Uint8Array | null, o: object): { promise: Promise<unknown> } }, make: vi.fn((_v: unknown, o: Record<string, unknown>) => { options = o; return side }) }
}
const echo = () => ({ lang: 'zh', format: 'markers', translate: vi.fn(async (texts: string[]) => texts.map(t => ({ text: t, by: 'test' }))), close: vi.fn() })
function view(original = new Uint8Array([1, 2, 3, 4]), loaded: Promise<void> = Promise.resolve()) {
  const data = original
  return {
    originalLoaded: vi.fn(() => loaded),
    originalData: vi.fn(() => Promise.resolve(data)),
    showOriginal: vi.fn(async (open: (o: object) => unknown) => { open({}); return 'opened' }),
    probe: vi.fn(() => ({ pages: N })),
  }
}
/** PDF.js as the ranged documents use it: each getDocument's parameters recorded */
function pdfjs() {
  const docs: Record<string, unknown>[] = []
  /** the ranges the documents were given: PDF.js's `onDataRange` */
  const given: [number, Uint8Array][] = []
  class PDFDataRangeTransport {
    constructor(readonly length: number, readonly initialData: Uint8Array) {}
    requestDataRange(_b: number, _e: number) {}
    onDataRange(b: number, c: Uint8Array) { given.push([b, c]) }
    abort() {}
  }
  const getDocument = vi.fn((p: Record<string, unknown>) => { docs.push(p); return { promise: Promise.resolve({ numPages: N }), destroy: async () => {}, onProgress: null } })
  return { lib: { getDocument, PDFDataRangeTransport } as never, docs, given }
}
function run(o: { head?: Parameters<typeof headOf>[0]; looks: (() => Response)[]; engine?: ReturnType<typeof echo> | (() => Promise<never>) | (() => Promise<ReturnType<typeof echo>>); store?: LayerStore | null; prepare?: () => Response; original?: Uint8Array; base?: Uint8Array; objects?: Map<string, Uint8Array>; view?: ReturnType<typeof view>; may?: () => boolean; unsent?: () => void; tag?: string; arxiv?: Uint8Array | 'whole'; ranged?: boolean; hidden?: RunHost['hidden'] }) {
  const s = server(o.looks, o), side = fakeSide(headOf(o.head)), v = o.view ?? view(), events: RunEvent[] = []
  const engine = o.engine ?? echo()
  const opened: Uint8Array[] = []
  const lib = pdfjs()
  const host: RunHost = {
    api: API, fetch: s.f, store: o.store ?? null,
    engine: typeof engine === 'function' ? engine : async () => engine,
    openPdf: (data: Uint8Array) => { opened.push(data); return { promise: Promise.resolve({ numPages: N }), destroy: async () => {}, onProgress: null } as never },
    ...(o.ranged ? { pdfjs: lib.lib } : {}),
    ...(o.hidden ? { hidden: o.hidden } : {}),
    readingPage: () => 1, mayPrepare: o.may ?? (() => true), ...(o.unsent ? { prepareUnsent: o.unsent } : {}), emit: e => events.push(e), faces: async () => null, createSide: side.make as never,
  }
  const r = startRun(v as never, PAPER, host)
  return { r, s, side, v, events, engine: engine as ReturnType<typeof echo>, opened, docs: lib.docs, given: lib.given, host, opts: o }
}
/** engines handed out in turn, each recorded; `hold`: the next one's promise waits for its release */
function engines() {
  const made: ReturnType<typeof echo>[] = []
  let held: ((e: ReturnType<typeof echo>) => void) | null = null, holdNext = false
  const next = vi.fn(() => {
    const e = echo()
    made.push(e)
    if (!holdNext) return Promise.resolve(e)
    holdNext = false
    return new Promise<ReturnType<typeof echo>>(r => { held = () => r(e) })
  })
  return { next, made, hold: () => { holdNext = true }, release: () => { held?.(made.at(-1) as never); held = null } }
}
const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise(res => setTimeout(res, 0)) }
const kinds = (events: RunEvent[]) => events.map(e => e.type)

describe('Review Focus 1: our server\'s every answer', () => {
  it('a catalog: told whole, with its end; the layer coming', async () => {
    const a = run({ looks: [() => new Response(catalog)] })
    await settle()
    const told = a.side.told[0] as { units: unknown[]; head: unknown; parts: unknown[]; end: unknown }
    expect(told.parts.length).toBe(3)
    expect(told.end).toEqual({ through: N })
    expect(kinds(a.events)).toContain('layer')
    expect(a.s.layerLooks()).toBe(1)
  })

  it('preparing (B3): each 202\'s place and progress said, its objects told, asked again only once its wait has passed, never sooner', async () => {
    vi.useFakeTimers()
    const layer = { units: m.chunks.map(c => c.ref), head: m.head.ref, parts: [] }
    const a = run({ looks: [() => json(202, { position: 3, stage: 'source', progress: null, retryAfterMs: 4000 }), () => json(202, { position: null, stage: 'units', progress: 0.5, retryAfterMs: 0, layer }), () => new Response(catalog)] })
    await vi.advanceTimersByTimeAsync(0)
    expect(a.events.filter(e => e.type === 'preparing')).toEqual([{ type: 'preparing', position: 3, progress: null }])
    await vi.advanceTimersByTimeAsync(3999)
    expect(a.s.layerLooks()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(a.s.layerLooks()).toBe(2)
    expect(a.events.filter(e => e.type === 'preparing').at(-1)).toEqual({ type: 'preparing', position: null, progress: 0.5 })
    expect(a.side.told[0]).toEqual(layer)
    // a wait of 0 is a second at least
    await vi.advanceTimersByTimeAsync(WAIT_MIN - 1)
    expect(a.s.layerLooks()).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(a.s.layerLooks()).toBe(3)
    // the 202s' objects are the layer coming; only its catalog ends the prepare
    await vi.waitFor(() => expect(kinds(a.events)).toContain('prepared'))
    expect(kinds(a.events).filter(k => k === 'layer')).toHaveLength(2)
    expect(kinds(a.events).filter(k => k === 'prepared')).toHaveLength(1)
    expect(kinds(a.events).indexOf('prepared')).toBeGreaterThan(kinds(a.events).lastIndexOf('preparing'))
    // the reader's close lets the look go
    a.r.dispose()
  })

  it('a prepare that does not end: polled no sooner than our server asks, every few seconds once it has gone on a while, and given up at its deadline as not to be had now', async () => {
    vi.useFakeTimers()
    const a = run({ looks: [() => json(202, { position: null, stage: 'units', progress: 0.1, retryAfterMs: 0 })] })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(POLL_SLOW_AFTER_MS)
    const early = a.s.layerLooks()
    expect(early).toBeGreaterThanOrEqual(POLL_SLOW_AFTER_MS / WAIT_MIN - 2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(a.s.layerLooks() - early).toBeLessThanOrEqual(60_000 / POLL_SLOW_MS + 1)
    await vi.advanceTimersByTimeAsync(PREPARE_DEADLINE_MS)
    expect(a.events.at(-1)).toEqual({ type: 'unavailable', why: 'unreachable', retryAt: null })
    const done = a.s.layerLooks()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(a.s.layerLooks()).toBe(done)
    // asked again by the reader, it begins afresh
    a.r.retry()
    await vi.advanceTimersByTimeAsync(0)
    expect(a.s.layerLooks()).toBe(done + 1)
    a.r.dispose()
  })

  it('a hidden tab polls nothing until it is shown again, and its hidden time is no part of the deadline', async () => {
    vi.useFakeTimers()
    let hidden = true, show = () => {}
    const a = run({
      looks: [() => json(202, { position: null, stage: 'units', progress: 0.1, retryAfterMs: 0 })],
      hidden: { now: () => hidden, shown: () => new Promise<void>(r => { show = r }) },
    })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(PREPARE_DEADLINE_MS * 2)
    // the first look, then nothing while hidden
    expect(a.s.layerLooks()).toBe(1)
    expect(a.events.some(e => e.type === 'unavailable')).toBe(false)
    hidden = false
    show()
    await vi.advanceTimersByTimeAsync(WAIT_MIN * 3)
    expect(a.s.layerLooks()).toBeGreaterThanOrEqual(3)
    a.r.dispose()
  })

  it('a retry during a limit\'s wait asks nothing sooner: the look comes once the wait has passed', async () => {
    vi.useFakeTimers()
    const a = run({ looks: [() => json(429, { retryAfterMs: 30_000 }), () => new Response(catalog)] })
    await vi.advanceTimersByTimeAsync(0)
    expect(a.events.at(-1)).toMatchObject({ type: 'unavailable', why: 'refused' })
    a.r.retry()
    await vi.advanceTimersByTimeAsync(10_000)
    a.r.retry()
    await vi.advanceTimersByTimeAsync(19_000)
    expect(a.s.layerLooks()).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(a.s.layerLooks()).toBe(2)
    a.r.dispose()
  })

  it('none made yet: the prepare asked once a visit, then the layer looked at again; a prepare that ends with none is a paper that cannot be had', async () => {
    vi.useFakeTimers()
    const a = run({ looks: [() => json(404, { why: 'not-prepared' }), () => new Response(catalog)] })
    await vi.advanceTimersByTimeAsync(WAIT_MIN)
    // (the catalog's reader digests its bytes: a moment of its own)
    await vi.waitFor(() => expect(kinds(a.events)).toContain('layer'))
    expect(a.s.calls.filter(c => c.url.endsWith('/prepare')).length).toBe(1)
    expect(a.s.layerLooks()).toBe(2)
    const b = run({ looks: [() => json(404, { why: 'not-prepared' })], may: () => false })
    await vi.advanceTimersByTimeAsync(WAIT_MIN)
    expect(b.s.calls.filter(c => c.url.endsWith('/prepare')).length).toBe(0)
    expect(b.events.at(-1)).toEqual({ type: 'unavailable', why: 'cannot-prepare', retryAt: null })
  })

  it('a prepare that never reached our server (the network, a 5xx twice) gives the visit\'s one prepare back: a retry asks it again, never a paper that cannot be had (Codex on #390)', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let token = true, posts = 0, down = true, begun = false
    const a = run({
      // none made until a prepare is taken, then the prepare under way
      looks: [() => (begun ? json(202, { position: 1, stage: null, progress: 0.1, retryAfterMs: 1000 }) : json(404, { why: 'not-prepared' }))],
      prepare: () => { posts++; if (down) return new Response('', { status: 503 }); begun = true; return json(202, { position: 1, stage: null, progress: 0, retryAfterMs: 1000 }) },
      may: () => { const t = token; token = false; return t },
      unsent: () => { token = true },
    })
    await vi.advanceTimersByTimeAsync(WAIT_MIN * 3)
    expect(a.events.at(-1)).toEqual({ type: 'unavailable', why: 'unreachable', retryAt: null })
    expect(posts).toBe(2)
    down = false
    a.r.retry()
    await vi.advanceTimersByTimeAsync(WAIT_MIN * 3)
    expect(posts).toBe(3)
    expect(a.events.some(e => e.type === 'unavailable' && e.why === 'cannot-prepare')).toBe(false)
    expect(a.events.at(-1)?.type).toBe('preparing')
    a.r.dispose()
  })

  it('B4: none for the paper: why, and nothing asked again; a limit: its time said, asked again only once it has passed', async () => {
    vi.useFakeTimers()
    for (const why of ['no-source', 'no-pdf', 'cannot-prepare', 'unknown-versions']) {
      const a = run({ looks: [() => json(404, { why })] })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(a.events.at(-1), why).toEqual({ type: 'unavailable', why, retryAt: null })
      expect(a.s.layerLooks()).toBe(1)
      expect(a.s.calls.some(c => c.url.endsWith('/prepare'))).toBe(false)
    }
    const b = run({ looks: [() => json(429, { retryAfterMs: 30_000 }), () => new Response(catalog)] })
    await vi.advanceTimersByTimeAsync(0)
    const refused = b.events.find(e => e.type === 'unavailable') as Extract<RunEvent, { type: 'unavailable' }>
    expect(refused.why).toBe('refused')
    expect(refused.retryAt).toBeGreaterThan(Date.now() + 29_000)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(b.s.layerLooks()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(b.s.layerLooks()).toBe(2)
    await vi.waitFor(() => expect(kinds(b.events).slice(-2)).toEqual(['layer', 'prepared']))
  })

  it('unreachable (a 5xx twice, the network): the bilingual version not to be had now; a catalog this machine holds opens it all the same', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = run({ looks: [() => new Response('', { status: 503 })] })
    await vi.advanceTimersByTimeAsync(2000)
    expect(a.events.at(-1)).toEqual({ type: 'unavailable', why: 'unreachable', retryAt: null })
    const store = { catalog: vi.fn(async () => catalog), putCatalog: vi.fn(), object: vi.fn(async () => undefined), putObject: vi.fn(), opened: vi.fn(), usage: vi.fn(), clear: vi.fn() }
    const b = run({ looks: [() => { throw new TypeError('Failed to fetch') }], store })
    await vi.advanceTimersByTimeAsync(2000)
    await vi.waitFor(() => expect(b.side.told.length).toBe(1))
    expect(store.catalog).toHaveBeenCalledWith(SEG)
    expect((b.side.told[0] as { parts: unknown[] }).parts.length).toBe(3)
    expect(kinds(b.events)).not.toContain('unavailable')
  })

  it('a language the layer does not set: said, and nothing asked of our server; a service that cannot translate: its kind, and nothing asked either', async () => {
    const a = run({ looks: [() => new Response(catalog)], engine: { ...echo(), lang: 'ar' } })
    await settle()
    expect(a.events).toEqual([{ type: 'unavailable', why: 'target', retryAt: null }])
    expect(a.s.calls).toEqual([])
    const b = run({ looks: [() => new Response(catalog)], engine: () => Promise.reject(Object.assign(new Error('no key'), { kind: 'no-key' })) as never })
    await settle()
    expect(b.events).toEqual([{ type: 'fail', kind: 'no-key' }])
    expect(b.s.calls).toEqual([])
  })
})

describe('the base (design §3.2, §3.5): only a layer over our own compile draws, and its head\'s check is the proof', () => {
  /** our base page, and the arXiv PDF the head's check ran over (`orig`): other bytes, and the tab's own PDF is this one */
  const ours = Uint8Array.from({ length: 300 }, (_, i) => (i * 3) % 251)
  const arxiv = Uint8Array.from({ length: 320 }, (_, i) => (i * 5) % 251)
  const check = { pages: [N, N], boxes: 'equal', carried: 0.99 }
  const origRef = { bytes: arxiv.length, sha256: hex(arxiv) }
  /** the head's base as the side hands it to bind: `ours`, with the page-and-line check the box passed */
  const head = (over: Record<string, unknown> = {}) => ({ source: 'ours', bytes: ours.length, sha256: hex(ours), xref: 250, pages: N, tree: '2025', check, ...over })
  const baseAt = `${API}/api/v1/base/${SEG}/${hex(ours)}`
  const asked = (a: { s: { calls: { url: string; init: RequestInit }[] } }, url: string) => a.s.calls.filter(c => c.url === url).map(c => (c.init.headers as Record<string, string> | undefined)?.range ?? null)
  const bindOf = (a: ReturnType<typeof run>) => a.side.options().bind as unknown as (b: unknown) => Promise<boolean>
  /** a run on a layer over our base page, the tab showing `tab`'s bytes (the arXiv PDF `orig` names unless it says other) */
  const go = (o: { tab?: Uint8Array; loaded?: Promise<void>; head?: Parameters<typeof headOf>[0]; ranged?: boolean; store?: LayerStore | null; original?: Uint8Array | null } = {}) =>
    run({ looks: [() => new Response(catalog)], view: view((o.tab ?? arxiv) as Uint8Array<ArrayBuffer>, o.loaded ?? Promise.resolve()), base: ours, ...(o.original === null ? {} : { original: o.original ?? arxiv }), ranged: o.ranged ?? true, head: o.head ?? { orig: origRef }, ...(o.store !== undefined ? { store: o.store } : {}) })

  it('binds on the head\'s check: the tab\'s PDF is not compared at bind (no range of arXiv\'s, none of our copy of it), the left stays the tab\'s own, and the tab\'s bytes the head\'s orig leave the layer as it is', async () => {
    const a = go()
    await settle()
    expect(await bindOf(a)(head())).toBe(true)
    await settle()
    expect(a.s.calls.filter(c => c.url === ARXIV || c.url.includes('/original/'))).toEqual([])
    // proven in the background: the left's bytes read and hashed once all in, and found to be the PDF the check ran over
    expect(a.v.originalData).toHaveBeenCalledTimes(1)
    expect(a.v.showOriginal).not.toHaveBeenCalled()
    expect(a.events.some(e => e.type === 'original')).toBe(false)
    expect(a.side.agains()).toBe(0)
    expect(a.r.probe()).toMatchObject({ basis: 'ranged', ours: false })
  })

  it('the tab\'s PDF is not the one the check ran over (arXiv replaced its file, or the tab is another\'s): our copy of the orig, checked against its digest, is shown on the left, `original { ours }` is told then and only then, and the pages are laid again; the layer\'s document stays our base page', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = go({ tab: new Uint8Array(arxiv.length).fill(7) })
    await settle()
    expect(await bindOf(a)(head())).toBe(true)
    // (until the proof is in, nothing is said of the left)
    expect(a.events.some(e => e.type === 'original')).toBe(false)
    await settle()
    expect(a.s.calls.filter(c => c.url === `${API}/api/v1/original/${SEG}`)).toHaveLength(1)
    expect(a.v.showOriginal).toHaveBeenCalledTimes(1)
    expect([...(a.opened[0] ?? [])]).toEqual([...arxiv])
    expect(a.events.filter(e => e.type === 'original')).toEqual([{ type: 'original', ours: true }])
    expect(a.side.agains()).toBe(1)
    expect(a.r.probe()).toMatchObject({ basis: 'ranged', ours: true })
    await a.side.options().composed(null, {}).promise
    expect(asked(a, baseAt)).toEqual(['bytes=0-299'])
  })

  it('our copy of the orig from this machine\'s store is shown in the same way: nothing asked of our server for it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = { object: vi.fn(async (sha: string) => (sha === origRef.sha256 ? arxiv : undefined)), putObject: vi.fn(), catalog: vi.fn(), putCatalog: vi.fn(), opened: vi.fn() } as unknown as LayerStore
    const a = go({ tab: new Uint8Array(arxiv.length).fill(7), store })
    await settle()
    expect(await bindOf(a)(head())).toBe(true)
    await settle()
    expect(a.s.calls.filter(c => c.url.includes('/original/'))).toEqual([])
    expect(a.events).toContainEqual({ type: 'original', ours: true })
  })

  it('our copy of the orig not to be had (a 404, or other bytes than the head\'s orig names): the layer is let go and the bilingual version is not to be had now, the tab\'s PDF staying', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const [what, original] of [['a 404', null], ['other bytes', new Uint8Array(arxiv.length).fill(9)]] as const) {
      const a = go({ tab: new Uint8Array(arxiv.length).fill(7), original })
      await settle()
      expect(await bindOf(a)(head()), what).toBe(true)
      await settle()
      expect(a.v.showOriginal, what).not.toHaveBeenCalled()
      expect(a.events.some(e => e.type === 'original'), what).toBe(false)
      expect(a.side.side.dispose, what).toHaveBeenCalled()
      expect(a.events.at(-1), what).toEqual({ type: 'unavailable', why: 'unreachable', retryAt: null })
    }
  })

  it('the composed document is our base page by ranges at /api/v1/base/…, held to the base\'s length, the tails after its last byte', async () => {
    const a = go()
    await settle()
    expect(await bindOf(a)(head())).toBe(true)
    await a.side.options().composed(new Uint8Array([7, 7]), { x: 1 }).promise
    const doc = a.docs[0] as { range: { length: number; initialData: Uint8Array }; x: number }
    expect(doc.range.length).toBe(302)
    expect([...doc.range.initialData]).toEqual([...ours, 7, 7])
    expect(doc.x).toBe(1)
    expect(asked(a, baseAt)).toEqual(['bytes=0-299'])
    // no credentials, no referrer: the paper's id and version and the digest in the address, and a range
    for (const c of a.s.calls) expect([c.init.credentials, c.init.referrerPolicy], c.url).toEqual(['omit', 'no-referrer'])
    expect(a.opened).toEqual([])
  })

  it('a check that says otherwise is no layer: boxes that differ, page counts that differ, a check missing or malformed, no orig: bound false, the original staying, nothing asked', async () => {
    for (const [what, over, orig] of [
      ['boxes differ', { check: { ...check, boxes: 'differ' } }, origRef], ['boxes missing', { check: { pages: [N, N], carried: 0.99 } }, origRef],
      ['our pages are not arXiv\'s', { check: { ...check, pages: [N, N + 1] } }, origRef], ['pages not a pair', { check: { ...check, pages: [N] } }, origRef],
      ['no check', { check: undefined }, origRef], ['a check that is no object', { check: 'equal' }, origRef],
      ['no orig', {}, null], ['an orig that is no digest', {}, { bytes: 3, sha256: 'x' }],
    ] as const) {
      const a = go({ head: { orig } })
      await settle()
      expect(await bindOf(a)(head(over)), what).toBe(false)
      expect(a.s.calls.filter(c => c.url !== `${API}/api/v1/layer/${SEG}/${CTAG5}`), what).toEqual([])
      expect(a.v.showOriginal, what).not.toHaveBeenCalled()
      expect(a.v.originalData, what).not.toHaveBeenCalled()
    }
  })

  it('a base the address cannot be made of, or that cannot be read by ranges, is no layer: a digest that is none, a length that is none, no PDF.js for ranges', async () => {
    for (const [what, over] of [['a digest that is none', { sha256: 'not-a-digest' }], ['an upper-case digest', { sha256: 'AB'.repeat(32) }], ['no bytes', { bytes: 0 }], ['bytes a fraction', { bytes: 1.5 }]] as const) {
      const a = go()
      await settle()
      expect(await bindOf(a)(head(over)), what).toBe(false)
    }
    const none = go({ ranged: false })
    await settle()
    expect(await bindOf(none)(head())).toBe(false)
  })

  it('a head whose base is not ours draws nothing (layerDraws), whatever it says: arXiv\'s with a why (our compile was refused) or with none, one that names no source (every head of BUNDLE 7), a word nobody knows: bound false, nothing asked, the original staying', async () => {
    const arxivBase = { bytes: arxiv.length, sha256: hex(arxiv), xref: 250 }
    for (const [what, base] of [['no source', arxivBase], ['arxiv, no why', { ...arxivBase, source: 'arxiv' }], ['arxiv, why boxes', { ...arxivBase, source: 'arxiv', why: 'boxes' }], ['arxiv, why final', { ...arxivBase, source: 'arxiv', why: 'final' }], ['a source nobody knows', { ...arxivBase, source: 'theirs' }]] as const) {
      const a = go()
      await settle()
      expect(await bindOf(a)(base), what).toBe(false)
      expect(a.s.calls.filter(c => c.url !== `${API}/api/v1/layer/${SEG}/${CTAG5}`), what).toEqual([])
      expect(a.v.showOriginal, what).not.toHaveBeenCalled()
      expect(a.v.originalData, what).not.toHaveBeenCalled()
    }
  })

  it('a retry whose head names another orig than the one the left shows: the left is replaced by the newly named original BEFORE the layer is used (never the new layer over the old PDF); one that names the same orig fetches and replaces nothing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const arxivB = new Uint8Array(arxiv.length + 7).fill(3)
    const origB = { bytes: arxivB.length, sha256: hex(arxivB) }
    // the tab\'s PDF is other than head A\'s orig (our copy of A replaces it), or is A\'s own (proven the same)
    for (const [what, tab] of [['the tab differed from A: our copy of A is on the left', new Uint8Array(arxiv.length).fill(7)], ['the tab was A\'s own, proven', arxiv]] as const) {
      const a = go({ tab })
      await settle()
      expect(await bindOf(a)(head()), what).toBe(true)
      await settle(60)
      const shownA = a.v.showOriginal.mock.calls.length
      expect(shownA, what).toBe(tab === arxiv ? 0 : 1)
      const fetches = () => a.s.calls.filter(c => c.url === `${API}/api/v1/original/${SEG}`).length
      // a retry that gets the same head again: nothing to prove, nothing fetched, the left as it is
      a.side.side.probe.mockReturnValue({ state: 'refused' } as never)
      a.r.retry()
      await settle(60)
      const before = fetches()
      expect(await bindOf(a)(head()), what).toBe(true)
      await settle(60)
      expect([a.v.showOriginal.mock.calls.length, fetches()], what).toEqual([shownA, before])
      // a retry that gets a head naming B: the left is B\'s copy by the time bind answers
      a.side.side.probe.mockReturnValue({ state: 'refused' } as never)
      a.r.retry()
      await settle(60)
      a.opts.original = arxivB
      a.side.setHead(headOf({ orig: origB }))
      expect(await bindOf(a)(head()), what).toBe(true)
      expect(a.v.showOriginal.mock.calls.length, what).toBe(shownA + 1)
      expect([...(a.opened.at(-1) ?? [])], what).toEqual([...arxivB])
      expect(fetches(), what).toBe(before + 1)
      expect(a.events.at(-1), what).toEqual({ type: 'original', ours: true })
      // and B again: nothing more
      a.side.side.probe.mockReturnValue({ state: 'refused' } as never)
      a.r.retry()
      await settle(60)
      expect(await bindOf(a)(head()), what).toBe(true)
      await settle(60)
      expect([a.v.showOriginal.mock.calls.length, fetches()], what).toEqual([shownA + 1, before + 1])
    }
  })

  it('a retry whose head names an orig that cannot be had (our copy of it: a 404): no layer, never the new layer over the old PDF', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const arxivB = new Uint8Array(arxiv.length + 7).fill(3)
    const a = go({ tab: new Uint8Array(arxiv.length).fill(7) })
    await settle()
    expect(await bindOf(a)(head())).toBe(true)
    await settle(60)
    a.side.side.probe.mockReturnValue({ state: 'refused' } as never)
    a.r.retry()
    await settle(60)
    a.opts.original = undefined
    a.side.setHead(headOf({ orig: { bytes: arxivB.length, sha256: hex(arxivB) } }))
    expect(await bindOf(a)(head())).toBe(false)
    expect(a.v.showOriginal).toHaveBeenCalledTimes(1)
  })

  it('a head that cannot draw ends the look: a prepare under way is asked no more, and nothing said after the lasting word comes back as availability', async () => {
    vi.useFakeTimers()
    const arxivBase = { bytes: arxiv.length, sha256: hex(arxiv), xref: 250, source: 'arxiv', why: 'carry' }
    const preparing = () => json(202, { position: 1, stage: 'laying-out', progress: 0.5, retryAfterMs: 1000, layer: { units: [], head: null, parts: [] } })
    const a = run({ looks: [preparing, preparing, preparing, () => new Response(catalog)], head: { base: arxivBase, orig: null } })
    await vi.advanceTimersByTimeAsync(10_000)
    const at = a.events.findIndex(e => e.type === 'unavailable')
    expect(a.events[at]).toEqual({ type: 'unavailable', why: 'cannot-prepare', retryAt: null })
    // the look stopped at the terminal decision: not asked again, whatever the server\'s waits say
    expect(a.s.layerLooks()).toBeLessThanOrEqual(1)
    // and nothing the session says after it would make the host restore availability (`layer` is `coming`, `prepared` clears the wait)
    expect(a.events.slice(at + 1).filter(e => e.type === 'layer' || e.type === 'preparing' || e.type === 'prepared')).toEqual([])
    expect(a.r.probe()).toMatchObject({ state: 'unavailable' })
  })

  it('a head that draws nothing is decided at the head, before bind and before a unit goes to the user\'s service: nothing translated, the paper\'s lasting word told (`cannot-prepare`), once', async () => {
    const arxivBase = { bytes: arxiv.length, sha256: hex(arxiv), xref: 250 }
    for (const [what, base] of [['no source', arxivBase], ['arxiv, no why', { ...arxivBase, source: 'arxiv' }], ['arxiv, why carry', { ...arxivBase, source: 'arxiv', why: 'carry' }]] as const) {
      const a = run({ looks: [() => new Response(catalog)], head: { base, orig: null } })
      await settle()
      expect(a.engine.translate, what).not.toHaveBeenCalled()
      expect(a.side.side.take, what).not.toHaveBeenCalled()
      expect(kinds(a.events).filter(k => k === 'translating' || k === 'translated'), what).toEqual([])
      expect(a.events.filter(e => e.type === 'unavailable'), what).toEqual([{ type: 'unavailable', why: 'cannot-prepare', retryAt: null }])
    }
    // and a head of ours is translated as before
    const ok = run({ looks: [() => new Response(catalog)] })
    await settle()
    expect(ok.engine.translate).toHaveBeenCalled()
    expect(ok.events.some(e => e.type === 'unavailable')).toBe(false)
  })
})

// A base of ours held as a delta over arXiv's PDF (BUNDLE 8, `base.kind` 'delta'): the composed document is the ORIGINAL's bytes read by
// ranges from our server's copy (/api/v1/original, held to the head's orig length and the first answer's tag), then the delta object
// (a bundle object, fetched by its digest) and the parts' tails in memory; no /api/v1/base. The stand-in PDF of the cutter is the original.
describe('the layer over a delta (the delta route): one byte source, the original\'s', async () => {
  // (the repository's sample paper, read by path: the cutter's own default address is a file URL this environment's URL is not)
  const dir = `${import.meta.dirname}/../fixtures/pdf/sample-1/`
  const files = { pdf: new Uint8Array(readFileSync(`${dir}sample-1.pdf`)), bundle: new Uint8Array(readFileSync(`${dir}bundle.json`)) }
  const cut = await cutSample({ pdf: files.pdf.slice(), bundle: files.bundle.slice() }, { base: 'delta' })
  const original = files.pdf, delta = cut.delta as NonNullable<typeof cut.delta>
  const O = original.length, TAGO = '"orig-tag"'
  const baseOf = (over: Record<string, unknown> = {}) => ({ ...cut.index.head.base, ...over })
  const deltaHead = (over: { base?: object; orig?: { bytes: number; sha256: string; xref?: number } | null } = {}) => ({ base: baseOf(), orig: cut.index.head.orig as { bytes: number; sha256: string; xref?: number }, ...over })
  const objects = (bytes: Uint8Array = delta.data) => new Map([[delta.sha256, bytes]])
  const go = (o: { tab?: Uint8Array; head?: Parameters<typeof headOf>[0]; bytes?: Uint8Array; store?: LayerStore | null; ranged?: boolean } = {}) =>
    run({ looks: [() => new Response(catalog)], view: view((o.tab ?? original) as Uint8Array<ArrayBuffer>), original, tag: TAGO, objects: objects(o.bytes), ranged: o.ranged ?? true, head: o.head ?? deltaHead(), ...(o.store !== undefined ? { store: o.store } : {}) })
  const bindOf = (a: ReturnType<typeof run>) => a.side.options().bind as unknown as (b: unknown) => Promise<boolean>
  const origPath = `${API}/api/v1/original/${SEG}`
  const asked = (a: ReturnType<typeof run>, url: string) => a.s.calls.filter(c => c.url === url).map(c => (c.init.headers as Record<string, string> | undefined)?.range ?? null)
  const baseCalls = (a: ReturnType<typeof run>) => a.s.calls.filter(c => c.url.includes('/api/v1/base/'))

  it('binds: the delta object is fetched by its digest, held to checkDelta, and the composed document is the original by ranges (bound by the head\'s orig length) then the delta then the tails; /api/v1/base is never asked', async () => {
    const a = go()
    await settle()
    expect(await bindOf(a)(cut.index.head.base)).toBe(true)
    expect(a.s.calls.filter(c => c.url.endsWith(`/o/${delta.sha256}`))).toHaveLength(1)
    const tail = Uint8Array.from([9, 8, 7, 6, 5])
    await a.side.options().composed(tail, { x: 1 }).promise
    const doc = a.docs[0] as { range: { length: number; initialData: Uint8Array; requestDataRange(b: number, e: number): void } }
    // one document: the original's O bytes, the delta's D, the tails'
    expect(doc.range.length).toBe(O + delta.bytes + tail.length)
    expect([...doc.range.initialData]).toEqual([...original.slice(0, doc.range.initialData.length)])
    expect(asked(a, origPath)[0]).toBe(`bytes=0-${Math.min(65_535, O - 1)}`)
    // the seam at O: a range across it is the original's last bytes, then the delta's first
    doc.range.requestDataRange(O - 4, O + 8)
    doc.range.requestDataRange(O + delta.bytes - 3, O + delta.bytes + 3)
    await settle()
    const seam = a.given.find(g => g[0] === O - 4)?.[1], tails = a.given.find(g => g[0] === O + delta.bytes - 3)?.[1]
    expect([...(seam ?? [])]).toEqual([...original.slice(O - 4), ...delta.data.slice(0, 8)])
    expect([...(tails ?? [])]).toEqual([...delta.data.slice(delta.bytes - 3), ...tail.slice(0, 3)])
    // nothing of the original beyond its own length is asked, and no base of ours
    for (const r of asked(a, origPath)) expect(Number(/^bytes=\d+-(\d+)$/.exec(r ?? '')?.[1]), String(r)).toBeLessThan(O)
    expect(baseCalls(a)).toEqual([])
    expect(a.r.probe()).toMatchObject({ basis: 'ranged', ours: false })
    for (const c of a.s.calls) expect([c.init.credentials, c.init.referrerPolicy], c.url).toEqual(['omit', 'no-referrer'])
  })

  it('a delta that is not the head\'s (other bytes of its length, a length, a section that does not parse) or past the bound is no layer: the original staying, nothing composed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flipped = delta.data.slice()
    flipped[flipped.length >> 1] = (flipped[flipped.length >> 1] ?? 0) ^ 0xff
    for (const [what, bytes] of [['other bytes', flipped], ['a shorter delta', delta.data.slice(0, delta.bytes - 1)]] as const) {
      const a = go({ bytes })
      await settle()
      expect(await bindOf(a)(cut.index.head.base), what).toBe(false)
      expect(a.docs, what).toEqual([])
      expect(a.v.showOriginal, what).not.toHaveBeenCalled()
    }
    // a delta the server does not hold (404)
    const gone = go({ head: deltaHead() })
    gone.opts.objects?.clear()
    await settle()
    expect(await bindOf(gone)(cut.index.head.base)).toBe(false)
    // a head naming a delta past DELTA_MAX_BYTES: not even asked
    const big = go({ head: deltaHead({ base: baseOf({ bytes: 24 * 2 ** 20 + 1 }) }) })
    await settle()
    expect(await bindOf(big)(baseOf({ bytes: 24 * 2 ** 20 + 1 }))).toBe(false)
    expect(big.s.calls.filter(c => c.url.includes('/o/'))).toEqual([])
    // no PDF.js to read the original by ranges, or a head with no orig startxref: no layer
    const none = go({ ranged: false })
    await settle()
    expect(await bindOf(none)(cut.index.head.base)).toBe(false)
    const noXref = go({ head: deltaHead({ orig: { bytes: O, sha256: (cut.index.head.orig as { sha256: string }).sha256 } }) })
    await settle()
    expect(await bindOf(noXref)(cut.index.head.base)).toBe(false)
  })

  it('the tab\'s PDF is not the head\'s orig: our copy of the orig is shown on the left, `original { ours }` told then, the pages laid again (the composed document is the original\'s own bytes, so the proof applies as it did before our base)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = go({ tab: new Uint8Array(O).fill(7) })
    await settle()
    expect(await bindOf(a)(cut.index.head.base)).toBe(true)
    expect(a.events.some(e => e.type === 'original')).toBe(false)
    await settle(60)
    expect(a.v.showOriginal).toHaveBeenCalledTimes(1)
    expect([...(a.opened[0] ?? [])]).toEqual([...original])
    expect(a.events.filter(e => e.type === 'original')).toEqual([{ type: 'original', ours: true }])
    expect(a.side.agains()).toBe(1)
    // the tab\'s own PDF, proven the orig: nothing fetched whole, the left as it is
    const same = go()
    await settle()
    expect(await bindOf(same)(cut.index.head.base)).toBe(true)
    await settle(60)
    expect(same.v.showOriginal).not.toHaveBeenCalled()
    expect(same.s.calls.filter(c => c.url === origPath && !(c.init.headers as Record<string, string> | undefined)?.range)).toEqual([])
    expect(same.r.probe()).toMatchObject({ ours: false })
  })

  it('a retry whose head is a delta over another orig shows that original before the layer is used (the leftShows rule of a full base holds for a delta)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // another arXiv PDF: the same pages with a comment after the last %%EOF (its offsets, so its delta, are not the first's)
    const other = Uint8Array.from([...original, ...new TextEncoder().encode('\n% a later version\n')])
    const made = await deltaOf(other, await oursOf(original), { PL })
    if ('refused' in made) throw new Error(made.why)
    const head2 = deltaHead({ base: baseOf({ bytes: made.delta.length, sha256: made.sha256, xref: made.xref }), orig: { bytes: other.length, sha256: hex(other), xref: startxrefOf(other) ?? undefined } })
    const a = go({ tab: new Uint8Array(O).fill(7) })
    a.opts.objects?.set(made.sha256, made.delta)
    await settle()
    expect(await bindOf(a)(cut.index.head.base)).toBe(true)
    await settle(60)
    expect(a.v.showOriginal).toHaveBeenCalledTimes(1)
    a.side.side.probe.mockReturnValue({ state: 'refused' } as never)
    a.r.retry()
    await settle(60)
    a.opts.original = other
    a.side.setHead(headOf(head2) as never)
    expect(await bindOf(a)(head2.base)).toBe(true)
    expect(a.v.showOriginal).toHaveBeenCalledTimes(2)
    expect([...(a.opened.at(-1) ?? [])]).toEqual([...other])
  })

  it('a head of several toplevel sources (check pages [M, N], M < N) binds: the pages past M are the original\'s, nothing of ours there; a full base of the same check does not', async () => {
    const N0 = (cut.index.head.base as { pages: number }).pages
    const check = { ...(cut.index.head.base as { check: object }).check, pages: [2, N0] }
    const a = go({ head: deltaHead({ base: baseOf({ check }) }) })
    await settle()
    expect(await bindOf(a)(baseOf({ check }))).toBe(true)
    // a base of ours that is whole (no delta) keeps the equal count
    const full = go({ head: { base: { ...mOurs.index.head.base, check: { ...(mOurs.index.head.base as { check: object }).check, pages: [2, N] } } }, ranged: true })
    await settle()
    expect(await bindOf(full)({ ...mOurs.index.head.base, check: { ...(mOurs.index.head.base as { check: object }).check, pages: [2, N] } })).toBe(false)
  })

  it('a kind \'full\' head is as before: the base page at /api/v1/base, the original not asked for the composed document', async () => {
    const ours = Uint8Array.from({ length: 300 }, (_, i) => (i * 3) % 251)
    const a = run({ looks: [() => new Response(catalog)], view: view(new Uint8Array(4) as Uint8Array<ArrayBuffer>), base: ours, ranged: true, head: {} })
    await settle()
    const base = { ...mOurs.index.head.base, bytes: ours.length, sha256: hex(ours) }
    expect(await bindOf(a)(base)).toBe(true)
    await a.side.options().composed(null, {}).promise
    expect(baseCalls(a)).toHaveLength(1)
  })
})

describe('the objects: this machine\'s store first, then our server, each kept once read', () => {
  it('a stored object is taken as it is (its digest the store\'s to check); one not stored is fetched and kept', async () => {
    const kept = new Uint8Array(10).fill(1), fresh = new Uint8Array(10).fill(2)
    const store = { object: vi.fn(async (sha: string) => (sha === 'a'.repeat(64) ? kept : undefined)), putObject: vi.fn(async () => {}), catalog: vi.fn(), putCatalog: vi.fn(async () => {}), opened: vi.fn(async () => {}), usage: vi.fn(), clear: vi.fn() }
    const a = run({ looks: [() => new Response(catalog)], store, objects: new Map([['b'.repeat(64), fresh]]) })
    await settle()
    const signal = new AbortController().signal
    expect(await a.side.options().fetchObject({ kind: 'part', sha256: 'a'.repeat(64), bytes: 10 }, signal)).toBe(kept)
    expect(a.s.calls.some(c => c.url.endsWith('a'.repeat(64)))).toBe(false)
    expect([...(await a.side.options().fetchObject({ kind: 'part', sha256: 'b'.repeat(64), bytes: 10 }, signal))]).toEqual([...fresh])
    expect(store.putObject).toHaveBeenCalledWith(SEG, 'b'.repeat(64), fresh)
    // a stored object of another length than its ref's is no answer for it
    store.object.mockImplementationOnce(async () => new Uint8Array(3))
    await expect(a.side.options().fetchObject({ kind: 'part', sha256: 'a'.repeat(64), bytes: 10 }, signal)).rejects.toThrow(/404/)
  })
})

describe('B6, R2-R4: the translation into rows', () => {
  it('every unit the target translates as a row, taken as the batches come, then the end; the counts told', async () => {
    const a = run({ looks: [() => new Response(catalog)] })
    await settle(60)
    const total = toTranslate(m.index, 'zh').length
    expect(new Set(a.side.taken.map(r => r[0])).size).toBe(total)
    expect(a.side.ended()).toBe(1)
    expect(a.events.find(e => e.type === 'translated')).toEqual({ type: 'translated', got: total, total, lost: 0, stopped: null })
    // nothing of the translation reached our server: its requests are the layer's alone
    expect(a.s.calls.every(c => c.url.startsWith(`${API}/api/v1/`) && c.init.body === undefined)).toBe(true)
    expect(a.engine.translate).toHaveBeenCalled()
  })

  it('a service that fails midway: the run stops with its kind, the rows so far taken, the end told (the pages complete with what they hold)', async () => {
    const engine = echo()
    let calls = 0
    engine.translate.mockImplementation(async (texts: string[]) => { if (calls++) throw Object.assign(new Error('down'), { kind: 'network' }); return texts.map(t => ({ text: t, by: 'test' })) })
    const a = run({ looks: [() => new Response(catalog)], engine })
    await settle(60)
    const last = a.events.find(e => e.type === 'translated') as Extract<RunEvent, { type: 'translated' }>
    expect(last.stopped).toBe('network')
    expect(a.side.ended()).toBe(1)
  })

  it('R4: a retry opens the door again, takes every row held at once, and runs again; the service\'s scope withdrawn at the end (R2)', async () => {
    const a = run({ looks: [() => new Response(catalog)] })
    await settle(60)
    const before = a.side.taken.length
    a.r.retry()
    expect(a.side.agains()).toBe(1)
    expect(a.side.taken.length).toBe(before * 2)
    await settle(60)
    expect(a.side.ended()).toBe(2)
    a.r.dispose()
    expect(a.engine.close).toHaveBeenCalled()
    expect(a.side.side.dispose).toHaveBeenCalled()
  })

  it('a retry over a side that refused its layer (its base, an object) begins the run again: a new side, its look and its bind; a refused side takes no again() (Devin on #390)', async () => {
    const a = run({ looks: [() => new Response(catalog)] })
    await settle(60)
    a.side.side.probe.mockReturnValue({ state: 'refused', why: 'base' } as never)
    a.r.retry()
    await settle(60)
    expect(a.side.agains()).toBe(0)
    expect(a.side.make).toHaveBeenCalledTimes(2)
    expect(a.s.layerLooks()).toBe(2)
  })

  it('a retry after the service stopped short opens the service again, its scope bound to the chain the settings make now; the old one closed (Codex on #390, P1)', async () => {
    // the first engine stops short (a refused key): the run keeps its side and its engine
    const e0 = echo(), e1 = echo()
    e0.translate.mockImplementation(async () => { throw Object.assign(new Error('auth'), { kind: 'auth' }) })
    let opens = 0
    const next = vi.fn(async () => (opens++ ? e1 : e0))
    const a = run({ looks: [() => new Response(catalog)], engine: next })
    await settle(60)
    expect(a.r.probe().rowsState).toBe('failed')
    expect(e0.close).not.toHaveBeenCalled()
    // the key set in the settings: the landing's retry
    a.r.retry()
    await settle(60)
    expect(next).toHaveBeenCalledTimes(2)
    expect(e0.close).toHaveBeenCalled()
    expect(e1.translate).toHaveBeenCalled()
    expect(a.r.probe().rowsState).toBe('translated')
    // the side kept (its layer is the paper's whatever the service), its door opened again with the rows held
    expect(a.side.make).toHaveBeenCalledTimes(1)
    expect(a.side.agains()).toBe(1)
  })

  it('an engine that comes after its beginning was let go is closed, never kept: a retry while the service opens (Devin, Codex on #390)', async () => {
    const pool = engines()
    pool.hold()
    const a = run({ looks: [() => new Response(catalog)], engine: pool.next })
    await settle(1)
    // the first beginning waits on its service; a retry begins again meanwhile
    a.r.retry()
    await settle(60)
    pool.release()
    await settle(60)
    expect(pool.made).toHaveLength(2)
    expect(pool.made[0]?.close).toHaveBeenCalled()
    expect(pool.made[1]?.close).not.toHaveBeenCalled()
    a.r.dispose()
    expect(pool.made[1]?.close).toHaveBeenCalled()
  })

  it('each beginning hears its own base tag: a retry that finds the layer bound to another original reads its objects (Devin on #390)', async () => {
    const part = new Uint8Array(10).fill(3)
    const a = run({ looks: [() => new Response(catalog, { headers: { 'x-axt-base-etag': '"A"' } }), () => new Response('', { status: 503 }), () => new Response(catalog, { headers: { 'x-axt-base-etag': '"B"' } })], objects: new Map([['c'.repeat(64), part]]), tag: '"B"' })
    await settle(60)
    expect(a.r.probe().bound).toBe(true)
    // the next beginning (a side that refused, asked again): its look a 503 twice, then the catalog bound to B
    a.side.side.probe.mockReturnValue({ state: 'refused' } as never)
    a.r.retry()
    // (its look: a 503, asked again a second later, the catalog bound to B)
    await new Promise(r => setTimeout(r, 1200))
    await settle(60)
    expect(a.s.layerLooks()).toBe(3)
    await expect(a.side.options().fetchObject({ kind: 'part', sha256: 'c'.repeat(64), bytes: 10 }, new AbortController().signal)).resolves.toEqual(part)
  })

  it('a paper opened on the catalog this machine holds (our server out of reach) is the last its store lets go (Codex on #390)', async () => {
    vi.useFakeTimers()
    const store = { catalog: vi.fn(async () => catalog), putCatalog: vi.fn(), object: vi.fn(async () => undefined), putObject: vi.fn(), opened: vi.fn(async () => {}), usage: vi.fn(), clear: vi.fn() }
    const b = run({ looks: [() => { throw new TypeError('Failed to fetch') }], store })
    await vi.advanceTimersByTimeAsync(2000)
    await vi.waitFor(() => expect(b.side.told.length).toBe(1))
    expect(store.opened).toHaveBeenCalledWith(SEG)
  })

  it('a retry of a run that found no layer begins it again: the look, and the prepare where the visit has not asked it', async () => {
    vi.useFakeTimers()
    const a = run({ looks: [() => json(404, { why: 'no-source' }), () => new Response(catalog)] })
    await vi.advanceTimersByTimeAsync(0)
    expect(a.events.at(-1)).toMatchObject({ type: 'unavailable', why: 'no-source' })
    a.r.retry()
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(kinds(a.events)).toContain('layer'))
    expect(a.s.layerLooks()).toBe(2)
    expect(a.side.make).toHaveBeenCalledTimes(2)
  })
})
