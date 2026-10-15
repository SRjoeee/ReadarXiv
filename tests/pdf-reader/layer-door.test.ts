import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeParts, type ReadPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import type { Layer, LayerDocument, PageEvent } from '@/pdf-reader/engine/layer-proto/reader.mjs'
import { type DoorHarness, type DoorSetup, runDoorConformance } from './helpers/door-conformance'
import { type Made, made } from './helpers/format-paper'
import { cutSpec, docsOf, type PaperSpec, rowsOfIndex } from './helpers/parts-paper'

// The door (layer-proto/reader.mjs openLayer, BUNDLE 4; the door design §2, §3, §5 H2): the readiness suite every door runs
// (helpers/door-conformance.ts) on the real one over the format test's paper, its closures an in-order door's; then the same
// pages through three doors, the parts told between the pages asked, the warm open (every part at once) and BUNDLE 3's open of
// the paper made whole (mergeParts), each page's SVG markup and its drawing's operations equal; and the engine lane's Q1 held
// at the door: once a page is told `laying`, the run waits for no part before it is `ready`

/** every openProto call's run, and what the runs waited for told in one log with the pages' states */
const seen = vi.hoisted(() => {
  // a canvas context that draws nothing and reads a white page, made before layer2.mjs loads (it measures with a canvas
  // of its own made then): an em a CJK character, half one any other
  const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return (s: string) => { const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(t.font ?? ''))?.[1] ?? 10); return { width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? px : px / 2), 0), actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px } }
      if (k === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4).fill(255) })
      if (k === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) })
      if (k === 'canvas') return canvas
      return () => {}
    },
    set(t, k, v) { t[k] = v; return true },
  })
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  g.fetch = async () => ({ ok: false, json: async () => null })
  return { runs: [] as unknown[], log: [] as string[], starved: null as (() => void) | null }
})
vi.mock('@/pdf-reader/engine/layer-proto/run.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/run.mjs')>()
  return {
    ...actual,
    openProto: async (o: Parameters<typeof actual.openProto>[0]) => {
      const run = await actual.openProto({ ...o, onWait: (what: string) => { seen.log.push(`wait:${what}`); if (what === 'part') seen.starved?.() } } as never)
      seen.runs.push(run)
      return run
    },
  }
})
// (a unit whose translation is BOOM throws while it is laid, in its reading: DR6's case)
vi.mock('@/pdf-reader/engine/layer-proto/layer2.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')>()
  return { ...actual, prepareUnit: (unit: { pieces?: { s?: string }[] }, ...rest: unknown[]) => { if (unit?.pieces?.some(q => q.s === 'BOOM')) throw new Error('a unit that throws while laid'); return (actual.prepareUnit as (...a: unknown[]) => unknown)(unit, ...rest) } }
})
type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
afterEach(() => { seen.starved = null })

const faceSources = async (id: string) => [{ url: `/f/${id}.otf`, ranges: [0, 0x10ffff] }]
const hyphUrl = (lang: string) => `/hyph/${lang}.json`
const tick = () => new Promise(ok => setTimeout(ok, 0))

/** the format test's paper's text layer, from its left's rectangles */
const textOf = (M: Made) => ({ pages: 4, units: M.index.units.map((_, id) => ({ text: `unit ${id}`, lines: M.readParts.flatMap(p => p.left.filter(w => w[0] === id).flatMap(w => w[2].map(r => [r[0], r[1], r[3], r[2] + 2.15]))) })) })
/** an in-order door's closures on the small paper: a unit runs from page 1 onto page 2, so pages 1 and 2 are laid together and
 *  each later page after the pages before it (the door design B1) */
const inOrder = (p: number): readonly number[] => (p <= 2 ? [1, 2] : Array.from({ length: p }, (_, i) => i + 1))

/** until the door's states, the pages it told and the run's progress stand still for five macrotasks */
async function settleDown(layer: Layer, N: number) {
  const heard: number[] = []
  const off = layer.onPage(p => heard.push(p))
  const snapshot = () => {
    const run = seen.runs.at(-1) as Run | undefined
    let states = ''
    try { for (let p = 1; p <= N; p++) states += layer.pageState(p)[0] } catch { states = 'disposed' }
    return `${states}|${heard.length}|${run?.drawnTo}|${run?.order.length}|${run?.stats.length}`
  }
  let last = snapshot(), still = 0
  for (let i = 0; i < 400 && still < 5; i++) {
    await tick()
    const now = snapshot()
    still = now === last ? still + 1 : 0
    last = now
  }
  off()
}

async function makeRealDoor(s: DoorSetup): Promise<DoorHarness> {
  const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
  const M = s.paper
  const docFor = docsOf(textOf(M), { fail: () => s.failPages ?? [], hold: n => s.hold?.(n) ?? null }) as unknown as (r: number) => LayerDocument
  const parts = M.readParts.slice(0, s.parts)
  const layer = await openLayer({ index: M.index, doc: docFor(parts.at(-1)?.chain.r ?? 0), parts, target: 'zh', faceSources, hyphUrl, leftPart: s.leftPart, onRetired: s.onRetired })
  const rows = rowsOfIndex(M.index)
  let given = false
  return {
    layer, docFor, closure: inOrder,
    supplyRows: () => { if (!given) { given = true; layer.take(rows) } },
    advance: () => settleDown(layer, 4),
  }
}

describe('the door', () => {
  runDoorConformance(makeRealDoor)
})

// ---------------------------------------------------------------- the same pages through three doors
const para = (text: string, page: number, b: number, o: Partial<PaperSpec['units'][number]> = {}) => ({ kind: 'para', text, lines: [[page, 20, 280, b]] as [number, number, number, number][], file: true, stream: null, ...o })
const cell = (text: string, row: number, col: number, page: number, x0: number, b: number) => ({ kind: 'cell', text, lines: [[page, x0, x0 + 60, b]] as [number, number, number, number][], file: true, stream: null, cell: { table: 0, row, col, span: 1, head: row === 0 } })
/** three pages: a paragraph running on to page 2, a table's column across pages 2 and 3, a caption of a small id set late */
const SPEC: PaperSpec = {
  pages: 3,
  units: [
    para('First paragraph', 1, 260, { stream: 0 }),
    { ...para('Running on to the next page', 1, 40, { stream: 5 }), lines: [[1, 20, 280, 40], [2, 20, 280, 270]] },
    { ...para('Figure one a caption', 3, 100, { stream: 100 }), kind: 'caption' },
    cell('Head', 0, 0, 2, 20, 200),
    cell('Upper', 1, 0, 2, 20, 180),
    cell('Lower', 2, 0, 3, 20, 250),
    para('Third page', 3, 220, { stream: 60 }),
    para('Third page again', 3, 200, { stream: 70 }),
    para('A paragraph of page 2', 2, 120, { stream: 30 }),
  ],
}

/** six pages, each with a paragraph of its own and one that runs on to the next page (the ordinary two-column page break) */
const CASCADE: PaperSpec = {
  pages: 6,
  units: Array.from({ length: 6 }, (_, i) => [
    para(`Own paragraph of page ${i + 1}`, i + 1, 260, { stream: 20 * i }),
    ...(i < 5 ? [{ ...para(`Running from page ${i + 1} on to page ${i + 2}`, i + 1, 40, { stream: 20 * i + 10 }), lines: [[i + 1, 20, 280, 40], [i + 2, 20, 280, 270]] as [number, number, number, number][] }] : []),
  ]).flat(),
}

interface Seen { pages: string[]; ops: string[]; log: string[] }
/** a door's pages asked one at a time, 1 to N, each awaited: their SVG markup, the run's operations, and the log of what the
 *  run waited for and what the door told */
async function askEvery(layer: Layer, N: number, feed: (p: number) => Promise<void> = async () => {}): Promise<Seen> {
  const pages: string[] = []
  layer.onPage((p, state: PageEvent) => seen.log.push(`${state}:${p}`))
  for (let p = 1; p <= N; p++) {
    let done = false
    const page = layer.pageOf(p, { lang: 'zh' }).finally(() => { done = true })
    await feed(p)
    while (!done) await tick()
    pages.push((await page).svg.outerHTML)
  }
  const run = seen.runs.at(-1) as Run
  return { pages, ops: run.rows.map(r => JSON.stringify(r?.ops ?? null)), log: seen.log.slice() }
}
/** Q1 at the door: between a page's `laying` and its `ready` the run waited for no part */
function q1Of(log: readonly string[]): string[] {
  const out: string[] = [], laying = new Set<string>()
  for (const e of log) {
    const [what, p] = e.split(':')
    if (what === 'laying') laying.add(p!)
    else if (what === 'ready' || what === 'failed') laying.delete(p!)
    else if (e === 'wait:part' && laying.size) out.push(`waited for a part with ${[...laying].join(', ')} laying`)
  }
  return out
}

describe('the door: three opens, the same pages', () => {
  it('draws every page alike told in parts between the pages asked, opened warm, and opened as BUNDLE 3 over the whole paper', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    for (const ends of [[1], [2], [1, 2], []]) {
      const c = await cutSpec(SPEC, ends)
      const N = SPEC.pages
      const docFor = docsOf(SPEC) as unknown as (r: number) => LayerDocument
      const rows = rowsOfIndex(c.index)
      const open = (parts: readonly ReadPart[]) => openLayer({ index: c.index, doc: docFor(parts.at(-1)?.chain.r ?? 0), parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
      // BUNDLE 3's open of the whole
      seen.log.length = 0
      const whole = await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(c.parts.at(-1)!.chain.r), target: 'zh', faceSources, hyphUrl })
      whole.take(rows)
      const want = await askEvery(whole, N)
      whole.dispose()
      // warm
      seen.log.length = 0
      const warm = await open(c.parts)
      warm.take(rows)
      const hot = await askEvery(warm, N)
      warm.dispose()
      expect({ pages: hot.pages, ops: hot.ops }, `${ends}: warm`).toEqual({ pages: want.pages, ops: want.ops })
      // in parts: told when the run waits for one (each page asked first), so that every part comes late
      for (const feed of ['starved', 'eager'] as const) {
        seen.log.length = 0
        const door = await open([])
        door.take(rows)
        let next = 0
        const add = () => { if (next < c.parts.length) door.addPart(c.parts[next++]!) }
        if (feed === 'starved') seen.starved = add
        const cold = await askEvery(door, N, async p => { if (feed === 'eager') while (next < c.parts.length && c.parts[next]!.pages[0] <= p + 1) add() })
        seen.starved = null
        door.dispose()
        expect({ pages: cold.pages, ops: cold.ops }, `${ends}: ${feed}`).toEqual({ pages: want.pages, ops: want.ops })
        expect(q1Of(cold.log), `${ends}: ${feed}`).toEqual([])
        expect(cold.log.filter(e => e === 'wait:part').length > 0 || feed === 'eager').toBe(true)
      }
    }
  })

  it('draws a paper with no add-on (M20) told in parts as BUNDLE 3\'s open of it with none, its table groups not withheld', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    for (const ends of [[1], [1, 2], []]) {
      const c = await cutSpec(SPEC, ends, { addon: false })
      expect(c.parts.every(p => p.addon === null)).toBe(true)
      const docFor = docsOf(SPEC) as unknown as (r: number) => LayerDocument
      const rows = rowsOfIndex(c.index)
      seen.log.length = 0
      const whole = await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(0), target: 'zh', faceSources, hyphUrl })
      whole.take(rows)
      const want = await askEvery(whole, SPEC.pages)
      whole.end()
      const wantLeft = (seen.runs.at(-1) as Run).skipped.map(x => `${x.id}:${x.why}`).sort()
      whole.dispose()
      expect(wantLeft.filter(x => x.includes('its page not removed'))).toEqual([])
      seen.log.length = 0
      const door = await openLayer({ index: c.index, doc: docFor(0), target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
      door.take(rows)
      let next = 0
      seen.starved = () => { if (next < c.parts.length) door.addPart(c.parts[next++]!) }
      const cold = await askEvery(door, SPEC.pages)
      seen.starved = null
      while (next < c.parts.length) door.addPart(c.parts[next++]!)
      door.end()
      door.endParts()
      const left = (seen.runs.at(-1) as Run).skipped.map(x => `${x.id}:${x.why}`).sort()
      door.dispose()
      expect({ pages: cold.pages, ops: cold.ops }, `${ends}`).toEqual({ pages: want.pages, ops: want.ops })
      expect(left, `${ends}`).toEqual(wantLeft)
      expect(q1Of(cold.log)).toEqual([])
    }
  })

  it('lays, with the rows still coming, no more than the asked page\'s closure and the page that finishes it, in either open (B1)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(CASCADE, [1, 2, 3, 4, 5])
    const docFor = docsOf(CASCADE) as unknown as (r: number) => LayerDocument
    const rows = rowsOfIndex(c.index)
    for (const how of ['bundle 3', 'warm', 'parts told after the ask'] as const) {
      const layer = how === 'bundle 3'
        ? await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(0), target: 'zh', faceSources, hyphUrl })
        : await openLayer({ index: c.index, doc: docFor(0), parts: how === 'warm' ? c.parts : [], target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
      // (every row in, and end() not called: the web's state while the translation streams)
      layer.take(rows)
      const laying: number[] = []
      layer.onPage((p, state) => { if (state === 'laying') laying.push(p) })
      const one = layer.pageOf(1, { lang: 'zh' })
      if (how === 'parts told after the ask') for (const part of c.parts) layer.addPart(part)
      await one
      await settleDown(layer, CASCADE.pages)
      const run = seen.runs.at(-1) as Run
      // (page 1's closure is pages 1 and 2; the drive goes on to the page that finishes page 2, and lays no further)
      expect(run.drawnTo, how).toBeLessThanOrEqual(3)
      expect([1, 2, 3, 4, 5, 6].map(p => layer.pageState(p)), how).toEqual(['ready', 'ready', 'waiting', 'waiting', 'waiting', 'waiting'])
      expect(laying, how).toEqual([1, 2])
      layer.dispose()
    }
  })

  it('rejects with an AbortError a leftPageOf aborted after its covering part came, while its fetch is under way (m1)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const M = await made()
    const docFor = docsOf(textOf(M)) as unknown as (r: number) => LayerDocument
    let release = (_: Uint8Array) => {}
    const transport = new Promise<Uint8Array>(ok => { release = ok })
    const layer = await openLayer({ index: M.index, doc: docFor(0), target: 'zh', faceSources, hyphUrl, leftPart: () => transport, onRetired: () => {} })
    const c = new AbortController()
    const asked = layer.leftPageOf(1, { signal: c.signal }).then(() => 'value', (e: Error) => e.name)
    layer.addPart(M.readParts[0]!, { doc: docFor(1) })
    await tick()
    c.abort()
    // (at once, not when the transport answers)
    expect(await Promise.race([asked, (async () => { for (let i = 0; i < 20; i++) await tick(); return 'still pending' })()])).toBe('AbortError')
    // (the fetch goes on for whoever asks next, and is kept)
    release((M.lefts[1] as { bytes: Uint8Array }).bytes)
    expect((await layer.leftPageOf(1)).page).toBe(1)
    layer.dispose()
  })

  it('reads a part with no layout as BUNDLE 3 reads a bundle with none: through the proof that nothing proves (#352\'s fail-closed rule)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    // (a paragraph with a citation, located by the original's side alone: with no layout file nothing proves its rendering)
    const spec: PaperSpec = { pages: 3, units: [...SPEC.units, { ...para('Cited here', 2, 150, { stream: 40, file: false }), cite: true }] }
    const cited = spec.units.length - 1
    for (const ends of [[1], []]) {
      const c = await cutSpec(spec, ends, { layout: false })
      expect(c.parts.every(p => p.layout === null && p.addon === null)).toBe(true)
      const docFor = docsOf(spec) as unknown as (r: number) => LayerDocument
      const rows = rowsOfIndex(c.index)
      seen.log.length = 0
      const whole = await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(0), target: 'zh', faceSources, hyphUrl })
      whole.take(rows)
      whole.end()
      const want = await askEvery(whole, spec.pages)
      const wantLeft = (seen.runs.at(-1) as Run).skipped.map(x => `${x.id}:${x.why}`).sort()
      whole.dispose()
      expect(wantLeft).toContain(`${cited}:unproven`)
      seen.log.length = 0
      const door = await openLayer({ index: c.index, doc: docFor(0), parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
      door.take(rows)
      door.end()
      door.endParts()
      const got = await askEvery(door, spec.pages)
      const left = (seen.runs.at(-1) as Run).skipped.map(x => `${x.id}:${x.why}`).sort()
      door.dispose()
      expect({ pages: got.pages, ops: got.ops }, `${ends}`).toEqual({ pages: want.pages, ops: want.ops })
      expect(left, `${ends}`).toEqual(wantLeft)
    }
  })

  it('ends an aborted ask\'s wait for rows after its page is drawn: the page is not laid, nothing is told of it (PR #359)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(SPEC)
    const docs = docsOf(SPEC)
    const doc = docs(0)
    // (every row but page 2's own paragraph's: page 1 lays, page 2 is drawn and waits for that row)
    const missing = 8
    const rows = rowsOfIndex(c.index)
    const layer = await openLayer({ index: c.index, doc: doc as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    layer.take(rows.filter(r => r[0] !== missing))
    const told: string[] = []
    layer.onPage((p, state) => told.push(`${state}:${p}`))
    const ctl = new AbortController()
    const two = layer.pageOf(2, { lang: 'zh', signal: ctl.signal }).then(() => 'value', (e: Error) => e.name)
    for (let i = 0; i < 200 && !doc.reads.includes(2); i++) await tick()
    await settleDown(layer, SPEC.pages)
    expect(doc.reads).toContain(2)
    const run = seen.runs.at(-1) as Run
    expect(run.drawnTo).toBe(1)
    ctl.abort()
    expect(await two).toBe('AbortError')
    await settleDown(layer, SPEC.pages)
    // (the row comes after the abort: nobody asks for page 2, so it is not laid)
    layer.take(rows.filter(r => r[0] === missing))
    await settleDown(layer, SPEC.pages)
    expect(run.drawnTo).toBe(1)
    expect(layer.pageState(2)).toBe('waiting')
    expect(told.filter(e => e.endsWith(':2'))).toEqual([])
    // (asked again, it is laid from where it was: its page drawn once)
    const again = await layer.pageOf(2, { lang: 'zh' })
    expect(again.svg).toBeTruthy()
    expect(doc.reads.filter(n => n === 2).length).toBe(1)
    layer.dispose()
  })

  it('becomes terminal on a fatal drawing error: the asked page rejects, every page not ready is told failed once, later asks reject at once (PR #359)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(SPEC)
    const base = docsOf(SPEC)(0)
    const fatal = Object.assign(new RangeError('Array buffer allocation failed'), {})
    const doc = { numPages: base.numPages, getPage: (n: number) => (n === 3 ? Promise.reject(fatal) : base.getPage(n)) }
    const layer = await openLayer({ index: c.index, doc: doc as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: () => new Promise<Uint8Array>(() => {}), onRetired: () => {} })
    layer.take(rowsOfIndex(c.index))
    layer.end()
    const told: string[] = []
    layer.onPage((p, state) => told.push(`${state}:${p}`))
    const pending = layer.leftPageOf(3)
    pending.catch(() => {})
    // (page 3's drawing throws a memory error: pages 1 and 2 are laid on the way, page 1 ready; the run cannot go on)
    const three = await layer.pageOf(3, { lang: 'zh' }).then(() => 'value', (e: unknown) => e)
    expect(three).toBe(fatal)
    const states = [1, 2, 3].map(p => layer.pageState(p))
    expect(states[0]).toBe('ready')
    expect(states[2]).toBe('failed')
    const failedOnce = states.flatMap((st, i) => (st === 'failed' ? [`failed:${i + 1}`] : []))
    expect(told.filter(e => e.startsWith('failed:'))).toEqual(failedOnce)
    // (later asks answer at once, and nothing is told twice)
    const late = <T,>(p: Promise<T>) => Promise.race([p.then(() => 'value', (e: unknown) => e), (async () => { for (let i = 0; i < 20; i++) await tick(); return 'still pending' })()])
    expect(await late(layer.pageOf(3, { lang: 'zh' }))).toBe(fatal)
    expect(await late(layer.leftPageOf(2))).toBe(fatal)
    expect(await late(pending)).toBe(fatal)
    expect((await layer.pageOf(1, { lang: 'zh' })).svg).toBeTruthy()
    layer.addPart(c.parts[0]!)
    layer.endParts()
    await settleDown(layer, SPEC.pages)
    expect(told.filter(e => e.startsWith('failed:'))).toEqual(failedOnce)
    layer.dispose()
  })

  it('is terminal where page 1 cannot be drawn: every page told failed once, no later page drawn (I1)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(SPEC)
    const doc = docsOf(SPEC, { fail: () => [1] })(0)
    const layer = await openLayer({ index: c.index, doc: doc as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    try {
      layer.take(rowsOfIndex(c.index))
      layer.end()
      const told: string[] = []
      layer.onPage((p, state) => told.push(`${state}:${p}`))
      const two = await layer.pageOf(2, { lang: 'zh' }).then(() => 'value', (e: Error) => e.message)
      expect(two).toMatch(/page 1 cannot be read/)
      expect([1, 2, 3].map(p => layer.pageState(p))).toEqual(['failed', 'failed', 'failed'])
      // (the pages told laying on the way are told failed after, each page's failed once)
      expect(told.filter(e => e.startsWith('failed:'))).toEqual(['failed:1', 'failed:2', 'failed:3'])
      expect(told.filter(e => !e.startsWith('failed:') && !e.startsWith('laying:'))).toEqual([])
      expect(doc.reads).toEqual([1])
      expect((seen.runs.at(-1) as Run).stats).toEqual([])
    } finally { layer.dispose() }
  })

  it('rejects a ready page\'s ask when dispose comes in the same task (PR #359)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(SPEC)
    const layer = await openLayer({ index: c.index, doc: docsOf(SPEC)(0) as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    layer.take(rowsOfIndex(c.index))
    await layer.pageOf(1, { lang: 'zh' })
    expect(layer.pageState(1)).toBe('ready')
    const p = layer.pageOf(1, { lang: 'zh' }).then(() => 'value', (e: Error) => e.message)
    layer.dispose()
    expect(await p).toMatch(/let go/)
  })

  it('rejects a ready page\'s ask with an AbortError when its signal aborts in the same task (PR #359)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(SPEC)
    const layer = await openLayer({ index: c.index, doc: docsOf(SPEC)(0) as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    try {
      layer.take(rowsOfIndex(c.index))
      await layer.pageOf(1, { lang: 'zh' })
      expect(layer.pageState(1)).toBe('ready')
      const ctl = new AbortController()
      const p = layer.pageOf(1, { lang: 'zh', signal: ctl.signal }).then(() => 'value', (e: Error) => e.name)
      ctl.abort()
      expect(await p).toBe('AbortError')
      // (an ask not aborted still answers)
      expect((await layer.pageOf(1, { lang: 'zh', signal: new AbortController().signal })).svg).toBeTruthy()
    } finally { layer.dispose() }
  })

  it('leaves a unit that throws while it is laid the original\'s, why error, and completes its page (DR6)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(SPEC)
    const docFor = docsOf(SPEC) as unknown as (r: number) => LayerDocument
    // (unit 8, page 2's own paragraph, throws; unit 1 runs on to page 2 and is drawn there)
    const rows = rowsOfIndex(c.index).map(r => (r[0] === 8 ? ([8, ['BOOM'], 'whole', 'test', null] as typeof r) : r))
    const layer = await openLayer({ index: c.index, doc: docFor(0), parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    layer.take(rows)
    const states: string[] = []
    layer.onPage((p, state) => states.push(`${state}:${p}`))
    const pages = []
    for (let p = 1; p <= SPEC.pages; p++) pages.push(await layer.pageOf(p, { lang: 'zh' }))
    expect([1, 2, 3].map(p => layer.pageState(p))).toEqual(['ready', 'ready', 'ready'])
    expect(states).not.toContain('failed:2')
    const run = seen.runs.at(-1) as Run
    expect(run.skipped.filter(s => s.id === 8).map(s => s.why)).toEqual(['error'])
    expect(run.stats.some(r => r.id === 8)).toBe(false)
    expect(pages[1]!.svg.querySelector('[data-u="8"]')).toBeNull()
    expect(pages[1]!.svg.querySelector('[data-u="1"]')).not.toBeNull()
    layer.dispose()
  })

  it('draws the format test\'s paper (tails, a part with no layout) told in parts as opened warm, swapping its documents', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const M = await made()
    const docFor = docsOf(textOf(M)) as unknown as (r: number) => LayerDocument
    const rows = rowsOfIndex(M.index)
    seen.log.length = 0
    const retiredWarm: LayerDocument[] = []
    const warm = await openLayer({ index: M.index, doc: docFor(M.readParts.at(-1)!.chain.r), parts: M.readParts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: d => retiredWarm.push(d) })
    warm.take(rows)
    const want = await askEvery(warm, 4)
    warm.dispose()
    expect(retiredWarm).toEqual([docFor(2)])
    seen.log.length = 0
    const retired: LayerDocument[] = []
    const door = await openLayer({ index: M.index, doc: docFor(0), target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: d => retired.push(d) })
    door.take(rows)
    let next = 0
    seen.starved = () => { if (next < M.readParts.length) { const part = M.readParts[next++]!; door.addPart(part, part.addon?.tail ? { doc: docFor(part.chain.r) } : undefined) } }
    const cold = await askEvery(door, 4)
    seen.starved = null
    expect(cold.pages).toEqual(want.pages)
    expect(cold.ops).toEqual(want.ops)
    expect(q1Of(cold.log)).toEqual([])
    door.dispose()
    expect(retired).toEqual([docFor(0), docFor(1), docFor(2)])
  })
})
