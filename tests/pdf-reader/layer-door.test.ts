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
  return { runs: [] as unknown[], log: [] as string[], starved: null as (() => void) | null, drawOfs: [] as ((page: number) => Promise<unknown>)[], opened: [] as Record<string, unknown>[] }
})
vi.mock('@/pdf-reader/engine/layer-proto/run.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/pdf-reader/engine/layer-proto/run.mjs')>()
  return {
    ...actual,
    openProto: async (o: Parameters<typeof actual.openProto>[0]) => {
      seen.opened.push(o as unknown as Record<string, unknown>)
      const given = (o as unknown as { drawOf?: (page: number) => Promise<unknown> }).drawOf
      if (given) seen.drawOfs.push(given)
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
/** the door's closures on the small paper (Need(p), need.mjs closureOf; layer-need.test.ts holds them): a unit runs from page 1
 *  onto page 2, so page 1's closure draws page 2 and decides its cell, and page 2's lays page 1 with it; pages 3 and 4 are each
 *  laid alone, after page 1 (whose drawing sets the paper's designs). The pages laid with each (page 1's makes page 2 ready too:
 *  the only unit to draw there is the paragraph from page 1, the table's head being no unit to translate), and the last page
 *  whose part each reads */
const READY_WITH = [[1, 2], [1, 2], [3], [4]], NEED = [2, 2, 3, 4]

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
  const layer = await openLayer({ index: M.index, doc: docFor(0), parts, target: 'zh', faceSources, hyphUrl, leftPart: s.leftPart, onRetired: s.onRetired })
  const rows = rowsOfIndex(M.index)
  let given = false
  return {
    layer, docFor, closure: p => READY_WITH[p - 1]!, need: p => NEED[p - 1]!,
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

interface Seen { pages: string[]; links: string[]; texts: string[]; ops: string[]; log: string[] }
/** a door's pages asked one at a time, 1 to N, each awaited: their SVG markup, the run's operations, and the log of what the
 *  run waited for and what the door told */
async function askEvery(layer: Layer, N: number, feed: (p: number) => Promise<void> = async () => {}): Promise<Seen> {
  const pages: string[] = [], links: string[] = [], texts: string[] = []
  layer.onPage((p, state: PageEvent) => seen.log.push(`${state}:${p}`))
  for (let p = 1; p <= N; p++) {
    let done = false
    const page = layer.pageOf(p, { lang: 'zh' }).finally(() => { done = true })
    await feed(p)
    while (!done) await tick()
    const laid = await page
    pages.push(laid.svg.outerHTML)
    links.push(JSON.stringify(laid.links))
  }
  // (each page's text layer, once every page is ready: pure of the order the pages were asked and laid in)
  for (let p = 1; p <= N; p++) texts.push(JSON.stringify(await layer.textOf(p)))
  const run = seen.runs.at(-1) as Run
  return { pages, links, texts, ops: run.rows.map(r => JSON.stringify(r?.ops ?? null)), log: seen.log.slice() }
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
      const open = (parts: readonly ReadPart[]) => openLayer({ index: c.index, doc: docFor(0), parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
      // BUNDLE 3's open of the whole
      seen.log.length = 0
      const whole = await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(0), target: 'zh', faceSources, hyphUrl })
      whole.take(rows)
      const want = await askEvery(whole, N)
      // (the pages carry links: each page's margin link at least, in place)
      expect(want.links.every(l => JSON.parse(l).length > 0), `${ends}: links`).toBe(true)
      // (each page's text layer: the drawn units' lines translated, each with its unit's id, in the composed page's text order; the
      // units left the original's (the table's cells withheld) kept as the page gives them; no erased text of the original; unit 1,
      // a line on page 1 and one on page 2 in the source, laid in one line, split between them by its height: on both)
      const layers = want.texts.map(t => JSON.parse(t) as { items: { str: string; from: string; unit?: number }[] })
      expect(layers.map(l => l.items.map(i => `${i.from[0]}${i.unit ?? ''}`)), `${ends}: texts`).toEqual([['t0', 't1'], ['t1', 't3', 'k', 't8'], ['t2', 'k', 't6', 't7']])
      expect(layers.map(l => l.items.filter(i => i.from === 'kept').map(i => i.str)), `${ends}: kept`).toEqual([[], ['Upper'], ['Lower']])
      whole.dispose()
      // warm
      seen.log.length = 0
      const warm = await open(c.parts)
      warm.take(rows)
      const hot = await askEvery(warm, N)
      warm.dispose()
      expect({ pages: hot.pages, links: hot.links, texts: hot.texts, ops: hot.ops }, `${ends}: warm`).toEqual({ pages: want.pages, links: want.links, texts: want.texts, ops: want.ops })
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
        expect({ pages: cold.pages, links: cold.links, texts: cold.texts, ops: cold.ops }, `${ends}: ${feed}`).toEqual({ pages: want.pages, links: want.links, texts: want.texts, ops: want.ops })
        expect(q1Of(cold.log), `${ends}: ${feed}`).toEqual([])
        expect(cold.log.filter(e => e === 'wait:part').length > 0 || feed === 'eager').toBe(true)
      }
    }
  })

  it('draws a paper told in parts as BUNDLE 3\'s open of it whole, at every cut', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    for (const ends of [[1], [1, 2], []]) {
      const c = await cutSpec(SPEC, ends)
      const docFor = docsOf(SPEC) as unknown as (r: number) => LayerDocument
      const rows = rowsOfIndex(c.index)
      seen.log.length = 0
      const whole = await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(0), target: 'zh', faceSources, hyphUrl })
      whole.take(rows)
      const want = await askEvery(whole, SPEC.pages)
      whole.end()
      const wantLeft = (seen.runs.at(-1) as Run).skipped.map(x => `${x.id}:${x.why}`).sort()
      whole.dispose()
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
      expect({ pages: cold.pages, links: cold.links, ops: cold.ops }, `${ends}`).toEqual({ pages: want.pages, links: want.links, ops: want.ops })
      expect(left, `${ends}`).toEqual(wantLeft)
      expect(q1Of(cold.log)).toEqual([])
    }
  })

  it('lays, with the rows still coming, no more than the asked page\'s closure, in either open (B1; the 1b-D design\'s X2)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(CASCADE, [1, 2, 3, 4, 5])
    const rows = rowsOfIndex(c.index)
    for (const how of ['bundle 3', 'warm', 'parts told after the ask'] as const) {
      const doc = docsOf(CASCADE)(0)
      const layer = how === 'bundle 3'
        ? await openLayer({ bundle: mergeParts(c.index, c.parts), doc: doc as never, target: 'zh', faceSources, hyphUrl })
        : await openLayer({ index: c.index, doc: doc as never, parts: how === 'warm' ? c.parts : [], target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
      try {
        // (every row in, and end() not called: the web's state while the translation streams)
        layer.take(rows)
        const laying: number[] = []
        layer.onPage((p, state) => { if (state === 'laying') laying.push(p) })
        const one = layer.pageOf(1, { lang: 'zh' })
        if (how === 'parts told after the ask') for (const part of c.parts) layer.addPart(part)
        await one
        await settleDown(layer, CASCADE.pages)
        const run = seen.runs.at(-1) as Run
        // (page 1's closure: page 1's two paragraphs laid, the one running on to page 2 among them, so page 2 drawn; page 2 is
        // not ready, its own paragraph and the one running on to page 3 not laid: it waits for its own closure, told nothing)
        expect(run.closure(1).draw, how).toEqual([1, 2])
        expect(run.closure(1).ready, how).toEqual([1])
        expect([...new Set(doc.reads)].sort((a, b) => a - b), how).toEqual([1, 2])
        expect(run.order, how).toEqual([0, 1])
        expect([1, 2, 3, 4, 5, 6].map(p => layer.pageState(p)), how).toEqual(['ready', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting'])
        expect(laying, how).toEqual([1])
      } finally { layer.dispose() }
    }
  })

  /** the six-page paper's rows (the cut's, the same on every cut of it) */
  let cascadeRows: ReturnType<typeof rowsOfIndex> = []
  /** the six-page paper's door, every part told and every row taken (`rows` false: none; `end`: and ended), its document reads
   *  counted */
  async function cascadeDoor({ end = true, rows = true } = {}) {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(CASCADE, [1, 2, 3, 4, 5])
    cascadeRows = rowsOfIndex(c.index)
    const doc = docsOf(CASCADE)(0)
    const layer = await openLayer({ index: c.index, doc: doc as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    if (rows) layer.take(cascadeRows)
    if (end) layer.end()
    const told: string[] = []
    layer.onPage((p, state) => told.push(`${state}:${p}`))
    return { layer, doc, told, run: seen.runs.at(-1) as Run }
  }
  /** each page of the six-page paper asked in order, 1 to 6: its markup */
  async function cascadeInOrder() {
    const { layer } = await cascadeDoor()
    const out: string[] = []
    for (let p = 1; p <= CASCADE.pages; p++) out.push((await layer.pageOf(p, { lang: 'zh' })).svg.outerHTML)
    layer.dispose()
    return out
  }

  it('A1: an ask aborted before the drive turns to it commits nothing: never told, nothing of its closure drawn', async () => {
    const { layer, doc, told, run } = await cascadeDoor()
    try {
      // (page 3 taken at once; page 5 asked and aborted in the same task, before the drive could turn to it)
      const three = layer.pageOf(3, { lang: 'zh' })
      expect(layer.pageState(3)).toBe('laying')
      const ctl = new AbortController()
      const five = layer.pageOf(5, { lang: 'zh', signal: ctl.signal }).then(() => 'value', (e: Error) => e.name)
      expect(layer.pageState(5)).toBe('waiting')
      ctl.abort()
      expect(await five).toBe('AbortError')
      await three
      await settleDown(layer, CASCADE.pages)
      // (page 3's closure: pages 2 and 3's paragraphs, those running on to pages 3 and 4: pages 1 to 4 drawn, never 5 or 6)
      expect(run.closure(3).draw).toEqual([1, 2, 3, 4])
      expect([...new Set(doc.reads)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
      expect(told.filter(e => e.endsWith(':5'))).toEqual([])
      expect(layer.pageState(5)).toBe('waiting')
    } finally { layer.dispose() }
  })

  it('A2, A3: the newest ask overtakes at the next unit; a page told laying and aborted is laid anyway, resumed after it; both as asked in order', async () => {
    const want = await cascadeInOrder()
    const g = globalThis as { scheduler?: unknown }
    // (a clock that runs 10 ms at every read: every unit's work a slice, so the run gives way, scheduler.yield, before each)
    const was = performance.now.bind(performance)
    let clock = 0
    performance.now = () => (clock += 10)
    const { layer, told, run } = await cascadeDoor()
    // (between two units the run gives way: the first time after a unit of page 3's closure is laid, page 5 is asked and page
    // 3's ask aborted; the next unit laid is page 5's closure's, none more of page 3's)
    const ctl = new AbortController()
    let five: Promise<string> | null = null, asked = -1
    g.scheduler = { yield: () => { if (!five && run.order.length >= 1) { asked = run.order.length; five = layer.pageOf(5, { lang: 'zh' }).then(p => p.svg.outerHTML); ctl.abort() } return new Promise(ok => setTimeout(ok, 0)) } }
    try {
      const three = layer.pageOf(3, { lang: 'zh', signal: ctl.signal }).then(() => 'value', (e: Error) => e.name)
      expect(await three).toBe('AbortError')
      for (let i = 0; i < 200 && !five; i++) await tick()
      const fifth = await five!
      await settleDown(layer, CASCADE.pages)
      // (page 3 told laying before page 5, page 5 ready before page 3: overtaken mid-closure, page 3 resumed and finished though
      // its ask was aborted, a state never going back)
      expect(told.indexOf('laying:3')).toBeLessThan(told.indexOf('laying:5'))
      expect(told.indexOf('ready:5')).toBeLessThan(told.indexOf('ready:3'))
      expect(run.idsOf(run.closure(5).lay)).toContain(run.order[asked])
      expect(run.idsOf(run.closure(3).lay).filter(id => !run.idsOf(run.closure(5).lay).includes(id))).not.toContain(run.order[asked])
      expect(layer.pageState(3)).toBe('ready')
      const strip = (svg: string) => svg.replace(' lang="zh"', '')
      expect(strip(fifth)).toBe(strip(want[4]!))
      expect(strip((await layer.pageOf(3, { lang: 'zh' })).svg.outerHTML)).toBe(strip(want[2]!))
      expect(run.ready(4)).toBe(true)
    } finally { delete g.scheduler; performance.now = was; layer.dispose() }
  })

  it('a newer ask overtakes before the next page of a closure is drawn, not after all of them', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(CASCADE, [1, 2, 3, 4, 5])
    let release = () => {}, holding = true
    const held = new Promise<void>(ok => { release = ok })
    let layer: Awaited<ReturnType<typeof openLayer>> | null = null
    let six: Promise<unknown> | null = null
    // (page 3's closure draws pages 1 to 4; while page 2 is read, page 6 is asked)
    const doc = docsOf(CASCADE, { hold: n => { if (n === 2 && holding) { holding = false; six = layer!.pageOf(6, { lang: 'zh' }); return held } return null } })(0)
    layer = await openLayer({ index: c.index, doc: doc as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    try {
      layer.take(rowsOfIndex(c.index))
      layer.end()
      const three = layer.pageOf(3, { lang: 'zh' })
      for (let i = 0; i < 200 && !six; i++) await tick()
      release()
      await six
      await three
      // (page 6's closure, pages 5 and 6, read before page 3's own pages 3 and 4)
      expect(doc.reads.indexOf(6)).toBeLessThan(doc.reads.indexOf(3))
      expect(doc.reads.slice(0, 2)).toEqual([1, 2])
    } finally { layer.dispose() }
  })

  it('takes a page by its newest surviving ask: an aborted newer ask of a page gives it back its older turn', async () => {
    const { layer, told } = await cascadeDoor({ end: false, rows: false })
    try {
      // (asks of pages 2, 4, then 2 again, which is aborted: page 4 is the newest ask, and laid first once the rows come)
      const two = layer.pageOf(2, { lang: 'zh' })
      const four = layer.pageOf(4, { lang: 'zh' })
      const ctl = new AbortController()
      const again = layer.pageOf(2, { lang: 'zh', signal: ctl.signal }).then(() => 'value', (e: Error) => e.name)
      ctl.abort()
      expect(await again).toBe('AbortError')
      layer.take(cascadeRows)
      await Promise.all([two, four])
      expect(told.indexOf('laying:4')).toBeLessThan(told.indexOf('laying:2'))
    } finally { layer.dispose() }
  })

  it('a page told laying waits behind one newer ask at most: a reader who keeps scrolling starves none', async () => {
    const want = await cascadeInOrder()
    const g = globalThis as { scheduler?: unknown }
    const was = performance.now.bind(performance)
    let clock = 0
    performance.now = () => (clock += 10)
    const { layer, told, run } = await cascadeDoor()
    // (page 2 taken; at the run's first yield after a unit of it is laid page 4 is asked (it overtakes page 2), at the first one
    // after a unit of page 4's closure page 6 (it waits: page 2 has waited behind page 4 already))
    const asked: Promise<string>[] = []
    g.scheduler = {
      yield: () => {
        if (asked.length === 0 && run.order.length >= 1) asked.push(layer.pageOf(4, { lang: 'zh' }).then(p => p.svg.outerHTML))
        else if (asked.length === 1 && run.order.length >= 3) asked.push(layer.pageOf(6, { lang: 'zh' }).then(p => p.svg.outerHTML))
        return new Promise(ok => setTimeout(ok, 0))
      },
    }
    try {
      const two = await layer.pageOf(2, { lang: 'zh' })
      for (let i = 0; i < 400 && asked.length < 2; i++) await tick()
      const [four, six] = await Promise.all(asked)
      await settleDown(layer, CASCADE.pages)
      const at = (e: string) => told.indexOf(e)
      expect(at('laying:4')).toBeGreaterThan(at('laying:2'))
      // (page 4 ready first, then page 2, and page 6 taken only then)
      expect(at('ready:4')).toBeLessThan(at('ready:2'))
      expect(at('ready:2')).toBeLessThan(at('laying:6'))
      const strip = (svg: string) => svg.replace(' lang="zh"', '')
      expect([strip(two.svg.outerHTML), strip(four!), strip(six!)]).toEqual([strip(want[1]!), strip(want[3]!), strip(want[5]!)])
    } finally { delete g.scheduler; performance.now = was; layer.dispose() }
  })

  it('F2: a page asked that fails rejects its asks, and the next page asked is laid', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(SPEC)
    const doc = docsOf(SPEC, { fail: () => [2] })(0)
    const layer = await openLayer({ index: c.index, doc: doc as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    try {
      layer.take(rowsOfIndex(c.index))
      layer.end()
      const two = layer.pageOf(2, { lang: 'zh' }).then(() => 'value', (e: Error) => e.message)
      const three = layer.pageOf(3, { lang: 'zh' }).then(p => p.svg.outerHTML, (e: Error) => e.message)
      expect(await two).toMatch(/page 2 failed/)
      expect(await three).toMatch(/^<svg/)
      await settleDown(layer, SPEC.pages)
      // (page 1, told laying with page 2, laid all the same: its paragraph running on to page 2 the original's, why page)
      expect([1, 2, 3].map(p => layer.pageState(p))).toEqual(['ready', 'failed', 'ready'])
      const run = seen.runs.at(-1) as Run
      expect(run.skipped.filter(x => x.id === 1).map(x => x.why)).toEqual(['page'])
      // (page 2's own units are not laid: the drive turned from it as it failed)
      expect(run.order).not.toContain(8)
    } finally { layer.dispose() }
  })

  it('F4: a page of a closure no part covers once the parts end fails, and the page asked is laid without it', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const M = await made({ ours: true })
    const docFor = docsOf(textOf(M)) as unknown as (r: number) => LayerDocument
    // (page 1's closure draws page 2, a paragraph running on to it: only the first part, page 1, is ever told)
    const layer = await openLayer({ index: M.index, doc: docFor(0), parts: M.readParts.slice(0, 1), target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    try {
      layer.take(rowsOfIndex(M.index))
      layer.end()
      const one = layer.pageOf(1, { lang: 'zh' }).then(p => p.svg.outerHTML, (e: Error) => e.message)
      await settleDown(layer, 4)
      expect(layer.pageState(1)).toBe('waiting')
      layer.endParts()
      expect(await one).toMatch(/^<svg/)
      expect([1, 2, 3, 4].map(p => layer.pageState(p))).toEqual(['ready', 'failed', 'failed', 'failed'])
      const run = seen.runs.at(-1) as Run
      expect(run.skipped.filter(x => x.id === 2).map(x => x.why)).toEqual(['page'])
    } finally { layer.dispose() }
  })

  it('P2: a part told while a closure waits grows it; the page is laid by the grown closure, as opened warm, told laying only then', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(CASCADE, [1, 2, 3, 4, 5])
    const rows = rowsOfIndex(c.index)
    const warm = await openLayer({ index: c.index, doc: docsOf(CASCADE)(0) as never, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    warm.take(rows)
    const want = (await warm.pageOf(2, { lang: 'zh' })).svg.outerHTML
    warm.dispose()
    const doc = docsOf(CASCADE)(0)
    const layer = await openLayer({ index: c.index, doc: doc as never, parts: c.parts.slice(0, 1), target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
    try {
      layer.take(rows)
      const log: string[] = []
      layer.onPage((p, state) => log.push(`${state}:${p}`))
      const run = seen.runs.at(-1) as Run
      const two = layer.pageOf(2, { lang: 'zh' })
      // (over the first part alone, page 2's closure is its paragraph from page 1: the part of page 2 tells its own paragraph
      // and the one running on to page 3, which the closure then reads)
      await settleDown(layer, CASCADE.pages)
      expect(layer.pageState(2)).toBe('waiting')
      const before = run.closure(2)
      log.push('part:2')
      layer.addPart(c.parts[1]!)
      await settleDown(layer, CASCADE.pages)
      const grown = run.closure(2)
      expect(grown.lay.length).toBeGreaterThan(before.lay.length)
      expect(grown.draw).toContain(3)
      expect(layer.pageState(2)).toBe('waiting')
      // (page 3's part tells its units, whose lines reach page 4: the closure's bound, page 4's part still to come)
      layer.addPart(c.parts[2]!)
      await settleDown(layer, CASCADE.pages)
      expect([layer.pageState(2), run.closure(2).bound]).toEqual(['waiting', 4])
      log.push('part:4')
      layer.addPart(c.parts[3]!)
      expect((await two).svg.outerHTML).toBe(want)
      // (told laying only once the closure's parts were all in)
      expect(log.indexOf('laying:2')).toBeGreaterThan(log.indexOf('part:4'))
      expect(doc.reads.filter(n => n === 2).length).toBe(1)
    } finally { layer.dispose() }
  })

  it('names the rows a page still waits for (rowsFor): its closure\'s, none once it is ready', async () => {
    const { layer, run } = await cascadeDoor({ end: false })
    try {
      // (every row taken: nothing waited for; a page laid has none)
      expect([1, 2, 3, 4, 5, 6].map(p => layer.rowsFor(p))).toEqual([[], [], [], [], [], []])
      await layer.pageOf(2, { lang: 'zh' })
      expect(layer.rowsFor(2)).toEqual([])
      expect(run.rowsFor(6)).toEqual([])
    } finally { layer.dispose() }
    expect(() => layer.rowsFor(1)).toThrow()
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
    layer.addPart(M.readParts[0]!)
    await tick()
    c.abort()
    // (at once, not when the transport answers)
    expect(await Promise.race([asked, (async () => { for (let i = 0; i < 20; i++) await tick(); return 'still pending' })()])).toBe('AbortError')
    // (the fetch goes on for whoever asks next, and is kept)
    release((M.lefts[1] as { bytes: Uint8Array }).bytes)
    expect((await layer.leftPageOf(1)).page).toBe(1)
    layer.dispose()
  })

  it('reads a part with no layout as BUNDLE 3 reads a bundle with none: it draws nothing, every unit the original\'s (the layer draws only from the file)', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    // (a paragraph with a citation, located by the original's side alone: with no layout file the layer has no position for it)
    const spec: PaperSpec = { pages: 3, units: [...SPEC.units, { ...para('Cited here', 2, 150, { stream: 40, file: false }), cite: true }] }
    const cited = spec.units.length - 1
    for (const ends of [[1], []]) {
      const c = await cutSpec(spec, ends, { layout: false })
      expect(c.parts.every(p => p.layout === null && p.rules === null)).toBe(true)
      const docFor = docsOf(spec) as unknown as (r: number) => LayerDocument
      const rows = rowsOfIndex(c.index)
      seen.log.length = 0
      const whole = await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docFor(0), target: 'zh', faceSources, hyphUrl })
      whole.take(rows)
      whole.end()
      const want = await askEvery(whole, spec.pages)
      const wantLeft = (seen.runs.at(-1) as Run).skipped.map(x => `${x.id}:${x.why}`).sort()
      whole.dispose()
      expect(wantLeft).toContain(`${cited}:unanchored`)
      expect((seen.runs.at(-1) as Run).placed).toEqual([])
      seen.log.length = 0
      const door = await openLayer({ index: c.index, doc: docFor(0), parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
      door.take(rows)
      door.end()
      door.endParts()
      const got = await askEvery(door, spec.pages)
      const left = (seen.runs.at(-1) as Run).skipped.map(x => `${x.id}:${x.why}`).sort()
      door.dispose()
      expect({ pages: got.pages, links: got.links, ops: got.ops }, `${ends}`).toEqual({ pages: want.pages, links: want.links, ops: want.ops })
      expect(left, `${ends}`).toEqual(wantLeft)
    }
  })

  // (the two opens of one paper agree: the parts' (the door's) and the whole's (BUNDLE 3's, mergeParts))
  it.each(['parts', 'whole'] as const)('draws nothing of a part whose layout is refused ({ refused, why }), nor of a head whose base is arXiv\'s though its parts carry layouts: the %s open', async open => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const placedOf = async (o: Parameters<typeof cutSpec>[2]) => {
      const c = await cutSpec(SPEC, [1], o)
      const doc = (docsOf(SPEC) as unknown as (r: number) => LayerDocument)(0)
      const layer = open === 'parts'
        ? await openLayer({ index: c.index, doc, parts: c.parts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: () => {} })
        : await openLayer({ bundle: mergeParts(c.index, c.parts), doc, target: 'zh', faceSources, hyphUrl })
      layer.take(rowsOfIndex(c.index))
      layer.end()
      layer.endParts()
      await askEvery(layer, SPEC.pages)
      const run = seen.runs.at(-1) as Run
      const out = { placed: run.placed.length, refusals: c.parts.map(p => p.noLayout?.refused ?? null), layouts: c.parts.map(p => p.layout !== null), base: c.index.head.base.source }
      layer.dispose()
      return out
    }
    // (the control: our base and the parts' layouts: the layer draws)
    const drawn = await placedOf({})
    expect(drawn.placed).toBeGreaterThan(0)
    expect([drawn.base, drawn.layouts.every(Boolean)]).toEqual(['ours', true])
    // a layout refused, as the maker records why (the final pass moved a mark): the part holds no layout, the layer no unit
    const refused = await placedOf({ layout: false, noLayout: { refused: 'final', why: 'the final pass moved a mark' } })
    expect(refused.refusals.every(r => r === 'final')).toBe(true)
    expect([refused.placed, refused.layouts.some(Boolean)]).toEqual([0, false])
    // arXiv's base (a paper whose compile was no base page, or a head of 7), its parts' layouts told: the layer draws none
    const arxiv = await placedOf({ source: 'arxiv' })
    expect([arxiv.base, arxiv.layouts.every(Boolean)]).toEqual(['arxiv', true])
    expect(arxiv.placed).toBe(0)
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
    // (page 2's closure drawn, its rows but that one decided, nothing laid: no unit is laid before every row its closure reads is in)
    expect(run.order).toEqual([])
    expect(run.rowsFor(2)).toEqual([missing])
    expect(layer.rowsFor(2)).toEqual([missing])
    ctl.abort()
    expect(await two).toBe('AbortError')
    await settleDown(layer, SPEC.pages)
    // (the row comes after the abort: nobody asks for page 2, so it is not laid)
    layer.take(rows.filter(r => r[0] === missing))
    await settleDown(layer, SPEC.pages)
    expect(run.order).toEqual([])
    expect(layer.rowsFor(2)).toEqual([])
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
    // (page 1 laid first; then page 3's closure, page 1 and page 3, whose drawing throws a memory error: the run cannot go on)
    await layer.pageOf(1, { lang: 'zh' })
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
    // (the reader's run keeps no unit's record and no audit: their count alone, which the error leaves out)
    expect([run.stats, run.audit]).toEqual([[], []])
    expect(layer.stats().drawn).toBe(run.order.length - run.skipped.filter(s => run.order.includes(s.id)).length)
    expect(pages[1]!.svg.querySelector('[data-u="8"]')).toBeNull()
    expect(pages[1]!.svg.querySelector('[data-u="1"]')).not.toBeNull()
    layer.dispose()
  })

  it('draws the format test\'s paper (a part with no layout) told in parts as opened warm, over its one document', async () => {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const M = await made()
    const docFor = docsOf(textOf(M)) as unknown as (r: number) => LayerDocument
    const rows = rowsOfIndex(M.index)
    seen.log.length = 0
    const retiredWarm: LayerDocument[] = []
    const warm = await openLayer({ index: M.index, doc: docFor(0), parts: M.readParts, target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: d => retiredWarm.push(d) })
    warm.take(rows)
    const want = await askEvery(warm, 4)
    warm.dispose()
    expect(retiredWarm).toEqual([docFor(0)])
    seen.log.length = 0
    const retired: LayerDocument[] = []
    const door = await openLayer({ index: M.index, doc: docFor(0), target: 'zh', faceSources, hyphUrl, leftPart: async () => new Uint8Array(), onRetired: d => retired.push(d) })
    door.take(rows)
    let next = 0
    seen.starved = () => { if (next < M.readParts.length) { const part = M.readParts[next++]!; door.addPart(part) } }
    const cold = await askEvery(door, 4)
    seen.starved = null
    expect(cold.pages).toEqual(want.pages)
    expect(cold.ops).toEqual(want.ops)
    expect(q1Of(cold.log)).toEqual([])
    door.dispose()
    expect(retired).toEqual([docFor(0)])
  })
})

// ---------------------------------------------------------------- the draw hand-off (E-C): the run's `drawOf`
describe('the door: the draw of a left part, handed to the run', () => {
  const DRAW = { fonts: [['CMR10', 'serif', 0, ['a', 'b']]], items: [['hello', 10, 0, 10, 72, 700, 30, 10, 0, 0], ['', 10, 0, 10, 102, 700, 0, 10, -1, -1]], links: [] }
  async function drawDoor(o: { draws?: Record<number, unknown>; parts?: number; leftPart?: (page: number, M: Made) => Promise<Uint8Array>; drawsHeld?: number; doc?: (base: LayerDocument) => LayerDocument } = {}) {
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const M = await made({ draws: o.draws ?? { 1: DRAW, 2: DRAW } })
    const docFor = docsOf(textOf(M)) as unknown as (r: number) => LayerDocument
    const fetched: number[] = []
    const leftPart = async (page: number) => { fetched.push(page); return o.leftPart ? o.leftPart(page, M) : (M.lefts[page] as { bytes: Uint8Array }).bytes }
    const before = seen.drawOfs.length
    const parts = M.readParts.slice(0, o.parts ?? 0)
    const doc = docFor(0)
    const layer = await openLayer({ index: M.index, doc: o.doc ? o.doc(doc) : doc, parts, target: 'zh', faceSources, hyphUrl, leftPart, onRetired: () => {}, ...(o.drawsHeld !== undefined ? { drawsHeld: o.drawsHeld } : {}) } as never)
    const drawOf = seen.drawOfs[before]
    return { layer, M, docFor, fetched, drawOf }
  }

  it('gives the run a drawOf for BUNDLE 4 and 5 parts, and none for BUNDLE 3\'s bundle', async () => {
    const { layer, drawOf } = await drawDoor()
    expect(drawOf).toBeTypeOf('function')
    layer.dispose()
    const { openLayer } = await import('@/pdf-reader/engine/layer-proto/reader.mjs')
    const c = await cutSpec(CASCADE, [1, 2, 3, 4, 5])
    const n = seen.opened.length
    const whole = await openLayer({ bundle: mergeParts(c.index, c.parts), doc: docsOf(CASCADE)(0) as never, target: 'zh', faceSources, hyphUrl })
    expect(seen.opened[n]).not.toHaveProperty('drawOf')
    whole.dispose()
  })

  it('waits until a part covers the page, never resolving null for a page not covered yet, then hands the decoded draw over once', async () => {
    const { layer, M, docFor, fetched, drawOf } = await drawDoor()
    const asked = (drawOf as (p: number) => Promise<unknown>)(1)
    let settled: unknown = 'pending'
    asked.then(v => { settled = v })
    for (let i = 0; i < 10; i++) await tick()
    expect(settled).toBe('pending')
    expect(fetched).toEqual([])
    layer.addPart(M.readParts[0]!)
    expect(await asked).toEqual(DRAW)
    expect(fetched).toEqual([1])
    // (handed once: the door keeps no draw after it)
    expect(await (drawOf as (p: number) => Promise<unknown>)(1)).toBeNull()
    expect(fetched).toEqual([1])
    layer.dispose()
  })

  it('keeps the draw out of the view\'s page, whichever of the two asks first, and fetches a left part once', async () => {
    const a = await drawDoor({ parts: 3 })
    const lp = await a.layer.leftPageOf(1)
    expect(lp.page).toBe(1)
    expect(lp.draw).toBeNull()
    expect(await (a.drawOf as (p: number) => Promise<unknown>)(1)).toEqual(DRAW)
    expect((await a.layer.leftPageOf(1)).draw).toBeNull()
    expect(a.fetched).toEqual([1])
    a.layer.dispose()
    const b = await drawDoor({ parts: 3 })
    expect(await (b.drawOf as (p: number) => Promise<unknown>)(2)).toEqual(DRAW)
    expect((await b.layer.leftPageOf(2)).draw).toBeNull()
    expect(b.fetched).toEqual([2])
    b.layer.dispose()
  })

  it('resolves null where there is no draw to give: a page written with none, a refused left part, parts that end without covering the page, dispose', async () => {
    const none = await drawDoor({ parts: 3 })
    expect(await (none.drawOf as (p: number) => Promise<unknown>)(3)).toBeNull()
    none.layer.dispose()
    // (a left part that does not arrive, or does not read: the run reads the page itself; the view's ask rejects as ever)
    const bad = await drawDoor({ parts: 3, leftPart: async () => new TextEncoder().encode('{"not":"a left part"}') })
    expect(await (bad.drawOf as (p: number) => Promise<unknown>)(1)).toBeNull()
    await expect(bad.layer.leftPageOf(1)).rejects.toThrow()
    bad.layer.dispose()
    const ended = await drawDoor({ parts: 1 })
    const pending = (ended.drawOf as (p: number) => Promise<unknown>)(4)
    ended.layer.endParts()
    expect(await pending).toBeNull()
    expect(ended.fetched).toEqual([])
    ended.layer.dispose()
    const gone = await drawDoor()
    const waiting = (gone.drawOf as (p: number) => Promise<unknown>)(1)
    gone.layer.dispose()
    expect(await waiting).toBeNull()
    expect(await (gone.drawOf as (p: number) => Promise<unknown>)(1)).toBeNull()
  })

  it('holds the draws the run has not taken within `drawsHeld` bytes, the oldest let go first (the run reads such a page itself)', async () => {
    const all = { 1: DRAW, 2: DRAW, 3: DRAW, 4: DRAW }
    const one = await drawDoor({ draws: all, parts: 4 })
    await one.layer.leftPageOf(1)
    const size = (one.M.lefts[1] as { bytes: Uint8Array }).bytes.length
    expect(one.layer.stats().draws).toEqual({ held: 1, bytes: size })
    one.layer.dispose()
    expect(one.layer.stats().draws).toEqual({ held: 0, bytes: 0 })
    // (room for two: the view reads pages 1 to 4, the run has asked for none)
    const d = await drawDoor({ draws: all, parts: 4, drawsHeld: 2 * size + 1 })
    for (const p of [1, 2, 3, 4]) await d.layer.leftPageOf(p)
    expect(d.layer.stats().draws.held).toBe(2)
    expect(await (d.drawOf as (p: number) => Promise<unknown>)(1)).toBeNull()
    expect(await (d.drawOf as (p: number) => Promise<unknown>)(2)).toBeNull()
    expect(await (d.drawOf as (p: number) => Promise<unknown>)(3)).toEqual(DRAW)
    expect(await (d.drawOf as (p: number) => Promise<unknown>)(4)).toEqual(DRAW)
    expect(d.layer.stats().draws).toEqual({ held: 0, bytes: 0 })
    d.layer.dispose()
    // (a draw whose own left part passes the bound is not held at all, nor any where the bound is 0: the run reads those pages)
    for (const held of [size - 1, 0]) {
      const small = await drawDoor({ draws: all, parts: 4, drawsHeld: held })
      await small.layer.leftPageOf(1)
      expect(small.layer.stats().draws, `drawsHeld ${held}`).toEqual({ held: 0, bytes: 0 })
      expect(await (small.drawOf as (p: number) => Promise<unknown>)(1)).toBeNull()
      small.layer.dispose()
    }
  })

  it('keeps no draw a left part brings once the layer is let go while reading it, nor after the run dies (drawOf null then)', async () => {
    // (dispose while the left part is read: its bytes come, then the layer goes during readLeftPart's digest)
    const late = await drawDoor({ parts: 3 })
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation((async (a: AlgorithmIdentifier, b: BufferSource) => { late.layer.dispose(); return digest(a, b) }) as never)
    await late.layer.leftPageOf(1).catch(() => {})
    for (let i = 0; i < 20; i++) await tick()
    spy.mockRestore()
    expect(late.fetched).toEqual([1])
    expect(late.layer.stats().draws).toEqual({ held: 0, bytes: 0 })
    // (a run that dies: every draw let go, and a draw asked of a dead layer is null at once)
    const fatal = new RangeError('Array buffer allocation failed')
    const dies = await drawDoor({ parts: 4, draws: { 1: DRAW, 2: DRAW, 3: DRAW, 4: DRAW }, doc: base => ({ ...base, getPage: (n: number) => (n === 3 ? Promise.reject(fatal) : base.getPage(n)) }) as never })
    await dies.layer.leftPageOf(1)
    expect(dies.layer.stats().draws.held).toBe(1)
    dies.layer.take(rowsOfIndex(dies.M.index))
    dies.layer.end()
    await dies.layer.pageOf(3, { lang: 'zh' }).catch(() => {})
    expect(dies.layer.stats().draws).toEqual({ held: 0, bytes: 0 })
    expect(await (dies.drawOf as (p: number) => Promise<unknown>)(2)).toBeNull()
    dies.layer.dispose()
  })

  it('refuses a page number outside the paper without fetching', async () => {
    const d = await drawDoor({ parts: 3 })
    for (const p of [0, 5, 1.5, Number.NaN]) expect(await (d.drawOf as (p: number) => Promise<unknown>)(p)).toBeNull()
    expect(d.fetched).toEqual([])
    d.layer.dispose()
  })
})
