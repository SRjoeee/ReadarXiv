// The extension's run of a paper on the layer (session/run.ts; Stage 5 Task 9 B3-B6, R2-R4, and Review Focus 1 and 2): our
// server's every answer, the base checked and our copy shown where arXiv's bytes are not it, the objects through this machine's
// store first, the extension's own translation into rows, a retry. The side and the view are stand-ins recording what the run
// asks of them (the side's own rows are layer-side.test.ts's); the server is a fetch answering by address
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerStore } from '@/cache/layer-store'
import { CTAG5, writeCatalog } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import type { Row } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { ENDS_AFTER_MS, POLL_SLOW_AFTER_MS, POLL_SLOW_MS, PREPARE_DEADLINE_MS, type RunEvent, type RunHost, startRun, WAIT_MIN } from '@/pdf-reader/session/run'
import { sha256Of } from '@/pdf-reader/session/server'
import { made, type Made, N, PAPER } from './helpers/format-paper'

const API = 'https://readarxiv.com'
const SEG = `${PAPER.id}v${PAPER.version}`
const ARXIV = `https://arxiv.org/pdf/${SEG}`
const TAG = '"5bf5251f12d575b58ced19bb84971986"'
let m: Made
let catalog: Uint8Array<ArrayBuffer>
beforeEach(async () => {
  m ??= await made()
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
function server(looks: (() => Response)[], o: { prepare?: () => Response; original?: Uint8Array; objects?: Map<string, Uint8Array>; tag?: string; arxiv?: Uint8Array | 'whole' } = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  let i = 0
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    if (url === ARXIV) return o.arxiv === 'whole' || !o.arxiv ? new Response((o.arxiv === 'whole' ? o.original : null) as BodyInit) : ranges(o.arxiv, init, '"sha256:arxiv-s"')
    if (url.endsWith('/prepare')) return (o.prepare ?? (() => json(202, { position: 1, stage: null, progress: 0, retryAfterMs: 0 })))()
    if (url.includes('/o/')) { const b = o.objects?.get(url.slice(-64)); return b ? new Response(b as BodyInit, { headers: o.tag ? { 'x-axt-base-etag': o.tag } : {} }) : new Response('', { status: 404 }) }
    if (url.includes('/original/')) return o.original ? (o.tag ? ranges(o.original, init, o.tag) : new Response(o.original as BodyInit)) : new Response('', { status: 404 })
    return (looks[Math.min(i++, looks.length - 1)] as () => Response)()
  })
  return { f: f as unknown as typeof fetch, calls, layerLooks: () => calls.filter(c => c.url === `${API}/api/v1/layer/${SEG}/${CTAG5}`).length }
}
/** the side as the run drives it */
function fakeSide() {
  const told: unknown[] = [], taken: Row[] = []
  let ended = 0, agains = 0, options: Record<string, unknown> | null = null
  const side = {
    tell: vi.fn((r: unknown) => { told.push(r) }), index: vi.fn(async () => m.index), take: vi.fn((rows: Row[]) => { taken.push(...rows) }),
    end: vi.fn(() => { ended++ }), again: vi.fn(() => { agains++ }), rowsFor: vi.fn(() => [] as number[]), coverage: vi.fn(), probe: vi.fn(() => ({})), dispose: vi.fn(),
  }
  return { side, told, taken, ended: () => ended, agains: () => agains, options: () => options as never as { fetchObject(r: unknown, s: AbortSignal): Promise<Uint8Array>; bind(b: { bytes: number; sha256: string; xref: number }): Promise<boolean>; composed(t: Uint8Array | null, o: object): { promise: Promise<unknown> } }, make: vi.fn((_v: unknown, o: Record<string, unknown>) => { options = o; return side }) }
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
  class PDFDataRangeTransport {
    constructor(readonly length: number, readonly initialData: Uint8Array) {}
    requestDataRange(_b: number, _e: number) {}
    onDataRange(_b: number, _c: Uint8Array) {}
    abort() {}
  }
  const getDocument = vi.fn((p: Record<string, unknown>) => { docs.push(p); return { promise: Promise.resolve({ numPages: N }), destroy: async () => {}, onProgress: null } })
  return { lib: { getDocument, PDFDataRangeTransport } as never, docs }
}
function run(o: { looks: (() => Response)[]; engine?: ReturnType<typeof echo> | (() => Promise<never>) | (() => Promise<ReturnType<typeof echo>>); store?: LayerStore | null; prepare?: () => Response; original?: Uint8Array; objects?: Map<string, Uint8Array>; view?: ReturnType<typeof view>; may?: () => boolean; unsent?: () => void; tag?: string; arxiv?: Uint8Array | 'whole'; ranged?: boolean; hidden?: RunHost['hidden'] }) {
  const s = server(o.looks, o), side = fakeSide(), v = o.view ?? view(), events: RunEvent[] = []
  const engine = o.engine ?? echo()
  const opened: Uint8Array[] = []
  const lib = pdfjs()
  const host: RunHost = {
    api: API, fetch: s.f, store: o.store ?? null,
    engine: typeof engine === 'function' ? engine : async () => engine,
    openPdf: (data: Uint8Array) => { opened.push(data); return { promise: Promise.resolve({ numPages: N }), destroy: async () => {}, onProgress: null } as never },
    ...(o.ranged ? { pdfjs: lib.lib, originalUrl: ARXIV } : {}),
    ...(o.hidden ? { hidden: o.hidden } : {}),
    readingPage: () => 1, mayPrepare: o.may ?? (() => true), ...(o.unsent ? { prepareUnsent: o.unsent } : {}), emit: e => events.push(e), faces: async () => null, createSide: side.make as never,
  }
  const r = startRun(v as never, PAPER, host)
  return { r, s, side, v, events, engine: engine as ReturnType<typeof echo>, opened, docs: lib.docs, host }
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

describe('Review Focus 2 (B5): the base', () => {
  it('arXiv\'s bytes that are the base bind it; other bytes fetch our copy, checked, shown on the left in their place; our copy not to be had is no layer', async () => {
    const ours = new Uint8Array([5, 6, 7, 8, 9])
    const base = { bytes: ours.length, sha256: await sha256Of(ours), xref: 1 }
    const same = run({ looks: [() => new Response(catalog)], view: view(ours) })
    await settle()
    expect(await same.side.options().bind(base)).toBe(true)
    expect(same.v.showOriginal).not.toHaveBeenCalled()
    const other = run({ looks: [() => new Response(catalog)], original: ours })
    await settle()
    expect(await other.side.options().bind(base)).toBe(true)
    expect(other.v.showOriginal).toHaveBeenCalledTimes(1)
    expect([...(other.opened[0] ?? [])]).toEqual([...ours])
    expect(other.events).toContainEqual({ type: 'original', ours: true })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const none = run({ looks: [() => new Response(catalog)], original: new Uint8Array([5, 6, 7, 8, 0]) })
    await settle()
    expect(await none.side.options().bind(base)).toBe(false)
    expect(none.v.showOriginal).not.toHaveBeenCalled()
  })

  it('the composed document: the original\'s bytes followed by the tails told, opened with the side\'s options', async () => {
    const a = run({ looks: [() => new Response(catalog)], view: view(new Uint8Array([1, 2])) })
    await settle()
    await a.side.options().composed(new Uint8Array([3, 4]), { x: 1 }).promise
    expect([...(a.opened[0] ?? [])]).toEqual([1, 2, 3, 4])
  })
})

describe('the bind: arXiv\'s whole file not waited for (DESIGN §16)', () => {
  /** our copy of 300 bytes, its startxref at 250; the catalog's answer naming its tag */
  const ours = Uint8Array.from({ length: 300 }, (_, i) => i % 251)
  const base = async () => ({ bytes: ours.length, sha256: await sha256Of(ours), xref: 250 })
  const tagged = () => new Response(catalog, { headers: { 'x-axt-base-etag': TAG } })
  const never = new Promise<void>(() => {})
  const rangesAsked = (a: { s: { calls: { url: string; init: RequestInit }[] } }, url: string) => a.s.calls.filter(c => c.url === url).map(c => (c.init.headers as Record<string, string> | undefined)?.range ?? null)

  it('ends alike before the left\'s bytes are in: bound at once, the composed document over our copy by ranges, held to the base\'s length and the catalog\'s tag', async () => {
    const a = run({ looks: [tagged], view: view(ours, never), original: ours, tag: TAG, arxiv: ours.slice(), ranged: true })
    await settle()
    expect(await a.side.options().bind(await base())).toBe(true)
    // one range of each end: arXiv's last cross-reference section, and our copy's
    expect(rangesAsked(a, ARXIV)).toEqual(['bytes=250-299'])
    expect(rangesAsked(a, `${API}/api/v1/original/${SEG}`)).toEqual(['bytes=250-299'])
    expect(a.v.showOriginal).not.toHaveBeenCalled()
    await a.side.options().composed(new Uint8Array([7, 7]), { x: 1 }).promise
    const doc = a.docs[0] as { range: { length: number; initialData: Uint8Array }; x: number; disableStream: boolean }
    expect(doc.range.length).toBe(302)
    expect([...doc.range.initialData]).toEqual([...ours, 7, 7])
    expect(doc.x).toBe(1)
    expect(a.opened).toEqual([])
    expect(a.r.probe()).toMatchObject({ basis: 'ranged', bound: true, ours: false })
    // every request to our server and to arXiv carries no credentials and no referrer, and none but a range
    for (const c of a.s.calls) expect([c.init.credentials, c.init.referrerPolicy], c.url).toEqual(['omit', 'no-referrer'])
  })

  it('the proof, once the left\'s bytes are in: the same, later documents read them; other, our copy on the left and the pages laid again', async () => {
    let done = () => {}
    const loaded = new Promise<void>(r => { done = r })
    const a = run({ looks: [tagged], view: view(ours, loaded), original: ours, tag: TAG, arxiv: ours.slice(), ranged: true })
    await settle()
    expect(await a.side.options().bind(await base())).toBe(true)
    done()
    await settle()
    expect(a.r.probe()).toMatchObject({ basis: 'left' })
    await a.side.options().composed(null, {}).promise
    expect(a.opened).toHaveLength(1)
    // arXiv's bytes other than the base, though they end as it does
    let late = () => {}
    const later = new Promise<void>(r => { late = r })
    const other = ours.slice()
    other[3] = 0
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const b = run({ looks: [tagged], view: view(other, later), original: ours, tag: TAG, arxiv: other, ranged: true })
    await settle()
    expect(await b.side.options().bind(await base())).toBe(true)
    late()
    await settle()
    expect(b.v.showOriginal).toHaveBeenCalledTimes(1)
    expect(b.events).toContainEqual({ type: 'original', ours: true })
    expect(b.side.agains()).toBe(1)
    expect(b.r.probe()).toMatchObject({ basis: 'ranged', ours: true })
  })

  it('arXiv\'s end other (another length, or other bytes): our copy on the left by ranges at once, its document read for as long as it is shown', async () => {
    const longer = new Uint8Array(ours.length + 9)
    longer.set(ours)
    const a = run({ looks: [tagged], view: view(longer, never), original: ours, tag: TAG, arxiv: longer, ranged: true })
    await settle()
    expect(await a.side.options().bind(await base())).toBe(true)
    expect(a.v.showOriginal).toHaveBeenCalledTimes(1)
    expect(a.events).toContainEqual({ type: 'original', ours: true })
    await settle()
    const left = a.docs[0] as { range: { length: number }; disableAutoFetch: boolean }
    expect([left.range.length, left.disableAutoFetch]).toEqual([300, true])
  })

  it('our copy shown on the left by ranges outlives a retry: its pages still read after the run begins again (Codex on #390)', async () => {
    const longer = new Uint8Array(ours.length + 9)
    longer.set(ours)
    const a = run({ looks: [tagged], view: view(longer, never), original: ours, tag: TAG, arxiv: longer, ranged: true })
    await settle()
    expect(await a.side.options().bind(await base())).toBe(true)
    await settle()
    const left = a.docs[0] as { range: { requestDataRange(b: number, e: number): void } }
    // a retry that begins the run again (its side refused): the left's document, still shown, reads on
    a.side.side.probe.mockReturnValue({ state: 'refused' } as never)
    a.r.retry()
    await settle()
    const asked = rangesAsked(a, `${API}/api/v1/original/${SEG}`).length
    left.range.requestDataRange(100, 200)
    await settle()
    expect(rangesAsked(a, `${API}/api/v1/original/${SEG}`)).toHaveLength(asked + 1)
    expect(rangesAsked(a, `${API}/api/v1/original/${SEG}`).at(-1)).toBe('bytes=100-199')
  })

  it('an end that cannot be read (arXiv answers no range): the proof decides, as before; a catalog that names no tag, or a left whose bytes are in: the proof alone, no range asked', async () => {
    const slow = new Promise<void>(r => setTimeout(r, ENDS_AFTER_MS * 3))
    const a = run({ looks: [tagged], view: view(ours, slow), original: ours, tag: TAG, arxiv: 'whole', ranged: true })
    await settle()
    expect(await a.side.options().bind(await base())).toBe(true)
    expect(a.s.calls.some(c => c.url === ARXIV)).toBe(true)
    expect(a.r.probe()).toMatchObject({ basis: 'left' })
    const quick = run({ looks: [tagged], view: view(ours), original: ours, tag: TAG, arxiv: ours.slice(), ranged: true })
    await settle()
    expect(await quick.side.options().bind(await base())).toBe(true)
    expect(quick.s.calls.some(c => c.url === ARXIV || c.url.includes('/original/'))).toBe(false)
    const b = run({ looks: [() => new Response(catalog)], view: view(ours), original: ours, arxiv: ours.slice(), ranged: true })
    await settle()
    expect(await b.side.options().bind(await base())).toBe(true)
    expect(b.s.calls.some(c => c.url === ARXIV || c.url.includes('/original/'))).toBe(false)
    expect(b.r.probe()).toMatchObject({ basis: 'left', bound: false })
  })

  it('the layer\'s objects are of one original: an object whose answer names another tag than the catalog\'s is refused', async () => {
    const part = new Uint8Array(10).fill(3)
    const a = run({ looks: [tagged], objects: new Map([['c'.repeat(64), part]]), tag: '"another"' })
    await settle()
    await expect(a.side.options().fetchObject({ kind: 'part', sha256: 'c'.repeat(64), bytes: 10 }, new AbortController().signal)).rejects.toThrow(/bound to the original/)
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
