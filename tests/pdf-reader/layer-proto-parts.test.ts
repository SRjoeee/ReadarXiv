import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { layoutFacade } from '@/pdf-reader/engine/layer-proto/facade.mjs'
import { type LayerIndex, mergeParts, type ReadPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { indexLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { made } from './helpers/format-paper'
import { cutSpec, docsOf, everySplit, groupsOfIndex, type PaperSpec, rowsOfIndex, unitsOfRows } from './helpers/parts-paper'

// The door's parts mode at the run (layer-proto/run.mjs openProto `parts`, grow, endParts, swap; the door design §0 to §4, §5
// H1): a paper cut into parts by the cutter at every split of its pages, its parts told to the run interleaved with the pages
// asked for, draws every page as the open over the whole paper (mergeParts) does, and as the warm door (every part at the
// open) does: each page's operations and SVG, the order its units are laid in, their records and why each unit left is left.
// Where a unit is laid with no further part to come for it (inputs), it waits for none (the engine lane's Q1, measured)

/** a canvas context that draws nothing and reads a white page */
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
beforeAll(() => {
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  g.fetch = async () => ({ ok: false, json: async () => null })
})
afterEach(() => { delete g.scheduler })

// ---------------------------------------------------------------- the papers
const para = (text: string, page: number, b: number, o: Partial<PaperSpec['units'][number]> = {}) => ({ kind: 'para', text, lines: [[page, 20, 280, b]] as [number, number, number, number][], file: true, stream: null, ...o })
const cell = (text: string, row: number, col: number, page: number, x0: number, b: number, o: Partial<PaperSpec['units'][number]> = {}) => ({ kind: 'cell', text, lines: [[page, x0, x0 + 60, b]] as [number, number, number, number][], file: true, stream: null, cell: { table: 0, row, col, span: 1, head: row === 0 }, ...o })

/** the take test's paper: page 1 paragraphs of the file, the left and both, an author, a paragraph running on to page 2; page 2 a
 *  table's header and two columns (one with a citation the file does not find, so its column is the original's) and a
 *  paragraph; page 3 eleven paragraphs and one of the left alone */
const TAKE: PaperSpec = {
  pages: 3,
  units: [
    para('Alpha beta gamma', 1, 260, { stream: 0 }),
    { ...para('Ann Author', 1, 245, { stream: 4, file: false }), kind: 'author' },
    para('Delta epsilon', 1, 230, { stream: 6, file: false }),
    para('Kappa lambda', 1, 215),
    para('Mu nu', 1, 200),
    { ...para('Zeta eta theta iota', 1, 40, { stream: 12 }), lines: [[1, 20, 280, 40], [2, 20, 280, 270]] },
    cell('Head', 0, 0, 2, 20, 240),
    cell('Row one', 1, 0, 2, 20, 220),
    cell('Row two', 2, 0, 2, 20, 200),
    cell('Cited', 1, 1, 2, 100, 220, { cite: true }),
    cell('Plain', 2, 1, 2, 100, 200),
    para('Sigma tau', 2, 140, { stream: 30 }),
    ...Array.from({ length: 11 }, (_, i) => para(`Word${String.fromCharCode(97 + i)} more${String.fromCharCode(97 + i)}`, 3, 270 - 20 * i, i % 3 === 0 ? { stream: 41 + i } : {})),
    para('Omega last', 3, 40, { stream: 60, file: false }),
  ],
}
/** a float told late (its caption of a small id set on page 3, so the file's cells after it come after it in the stream) and
 *  a table's column across a page break (its cells on pages 2 and 3: the group is told whole by one part) */
const FLOAT: PaperSpec = {
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
  ],
}

// ---------------------------------------------------------------- the runs
type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
const HYBRID = { use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' } as const
const LABELS = { captions: { figure: 'target', table: 'target' } }
interface Paper { N: number; index: LayerIndex; parts: ReadPart[]; docFor: ReturnType<typeof docsOf> }
const tick = () => new Promise(ok => setTimeout(ok, 0))
const ticks = async (n = 3) => { for (let i = 0; i < n; i++) await tick() }
/** what a run drew: each page's operations and SVG, the order its units were laid in, their records and why each unit left
 *  was left */
const drawing = (run: Run) => ({
  pages: run.rows.map(r => (r ? { ops: JSON.stringify(r.ops), svg: r.svg.innerHTML } : null)),
  order: run.order.slice(),
  stats: run.stats.map(({ ms: _, ...r }) => r),
  skipped: run.skipped.map(s => `${s.id}:${s.why}`).sort(),
})

/** the open over the whole paper: mergeParts' geometry, layout and manifest, every row, then end() */
async function wholeRun(P: Paper) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const merged = mergeParts(P.index, P.parts)
  const doc = P.docFor(P.parts.at(-1)!.chain.r)
  const run = await openProto({
    doc, geometry: { schema: 1, kinds: merged.left.kinds, left: { pages: merged.left.pages, units: merged.left.units } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
    target: 'zh', pages: P.N, scale: 1, dpr: 1, copy: false, labels: LABELS as never,
    tex: { ...HYBRID, index: indexLayout(merged.layout!), pieces: new Map() }, removal: { mode: 'draw', doc, manifest: merged.addon!.manifest },
  })
  run.take(unitsOfRows(P.index, rowsOfIndex(P.index)) as never)
  run.end()
  await run.until(P.N)
  return run
}

/** `feed`: each later part a few macrotasks after the last ('eager'), or once the run waits for a part ('starved': every part
 *  arrives when the drive has stopped for it, at a page's drawing or at the end of the stream so far) */
interface PartsOptions { before: number; ended: 'open' | 'last'; feed?: 'eager' | 'starved'; rows?: 'open' | 'parts'; onRetired?: (d: unknown) => void }
/** the run in parts: `before` parts told at the open, the rest as `feed` says while the pages are asked for one at a time; the
 *  rows all taken at the open (`rows` 'open'), ended there or after the last part, or each part's units' rows taken right after
 *  it ('parts', readiness alone: the rest, and end(), after the last part). Each page asked whose inputs are in is laid with no
 *  wait at all (Q1) */
async function partsRun(P: Paper, o: PartsOptions) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const facade = layoutFacade(P.index.head)
  const doc = P.docFor(0)
  let waits = 0, starved: (() => void) | null = null
  const run = await openProto({
    parts: true, doc, geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
    target: 'zh', pages: P.N, scale: 1, dpr: 1, copy: false, labels: LABELS as never,
    tex: { ...HYBRID, index: facade.index, pieces: new Map() }, removal: { mode: 'draw', doc, manifest: { schema: 1, removal: REMOVAL, pages: P.N, sets: {}, page: {} } as never },
    onRetired: o.onRetired ?? null, onWait: (what: string) => { waits++; if (what === 'part') starved?.() },
  } as never)
  const all = unitsOfRows(P.index, rowsOfIndex(P.index))
  const byParts = o.rows === 'parts'
  if (!byParts) { run.take(all as never); if (o.ended === 'open') run.end() }
  const grow = (i: number) => {
    const part = P.parts[i]!
    facade.add(part)
    run.grow(part)
    if (part.addon?.tail) run.swap(P.docFor(part.chain.r))
    if (byParts) { const ids = [...part.left.map(w => w[0]), ...part.fileOnly.map(e => e[0])]; run.take(new Map([...all].filter(([id]) => ids.includes(id))) as never) }
  }
  for (let i = 0; i < o.before; i++) grow(i)
  const q1: string[] = []
  const asking = (async () => {
    for (let p = 1; p <= P.N; p++) {
      const sure = run.inputs(p), was = waits
      await run.until(p)
      if (sure && waits !== was) q1.push(`page ${p}: laid with its inputs in, it waited`)
    }
  })()
  for (let i = o.before; i < P.parts.length; i++) {
    if (o.feed === 'starved') await new Promise<void>(ok => { starved = () => { starved = null; ok() } })
    else await ticks(3)
    grow(i)
  }
  run.endParts()
  if (byParts) { run.take(all as never); run.end() }
  await asking
  if (o.ended === 'last' && !byParts) run.end()
  return { run, q1 }
}

async function takePaper(spec: PaperSpec, ends?: number[]): Promise<Paper & { honoured: boolean }> {
  const c = await cutSpec(spec, ends)
  // (the parts' last pages: those asked, and the paper's last)
  const asked = ends ? [...ends, spec.pages].join() : null
  return { N: spec.pages, index: c.index, parts: c.parts, docFor: docsOf(spec), honoured: asked === null || c.parts.map(p => p.pages[1]).join() === asked }
}

describe('the run in parts draws every page as the open over the whole paper does', () => {
  for (const [name, spec] of [['the take test\'s paper', TAKE], ['a float told late and a column across a page break', FLOAT]] as const) {
    it(`${name}: at every split, every interleaving, rows ended at the open or after the last part`, async () => {
      let compared = 0
      for (const ends of everySplit(spec.pages)) {
        const P = await takePaper(spec, ends)
        // (the cutter cuts where its target hook says: every split of the pages is one)
        expect(P.honoured, ends.join()).toBe(true)
        const want = drawing(await wholeRun(P))
        // (a drawing worth comparing: units laid on every page, a table's column the original's, a unit left the original's)
        expect(want.order.length).toBeGreaterThan(5)
        expect(want.pages.every(p => p !== null && p.svg !== '')).toBe(true)
        for (let before = 0; before <= P.parts.length; before++) {
          for (const [ended, feed] of [['open', 'eager'], ['last', 'eager'], ['open', 'starved'], ['last', 'starved']] as const) {
            const as = `parts ending ${ends.join(',') || 'at N'}, ${before} at the open, ${feed}, rows ended ${ended === 'open' ? 'at the open' : 'after the last part'}`
            const { run, q1 } = await partsRun(P, { before, ended, feed })
            expect(drawing(run), as).toEqual(want)
            expect(q1, as).toEqual([])
            expect(run.late(), as).toEqual([])
            compared++
          }
        }
      }
      expect(compared).toBeGreaterThan(0)
    })
  }

  it('a paper whose parts carry tails, and a part with no layout: every interleaving draws as the warm door', async () => {
    const M = await made()
    // (the format test's paper: the text layer from the left's rectangles)
    const units = M.index.units.map((_, id) => ({ text: `unit ${id}`, lines: M.readParts.flatMap(p => p.left.filter(w => w[0] === id).flatMap(w => w[2].map(r => [r[0], r[1], r[3], r[2] + 2.15]))) }))
    const P: Paper = { N: 4, index: M.index, parts: M.readParts, docFor: docsOf({ pages: 4, units }) }
    const warm = await partsRun(P, { before: P.parts.length, ended: 'open' })
    const want = drawing(warm.run)
    expect(want.order.length).toBeGreaterThan(2)
    for (let before = 0; before < P.parts.length; before++) for (const [ended, feed] of [['open', 'eager'], ['last', 'eager'], ['open', 'starved'], ['last', 'starved']] as const) {
      const { run, q1 } = await partsRun(P, { before, ended, feed })
      expect(drawing(run), `${before} at the open, ${feed}, rows ended ${ended}`).toEqual(want)
      expect(q1).toEqual([])
    }
  })
})

describe('the run in parts: waits, failures and documents', () => {
  it('with each part\'s rows taken after it, lays every page with no wait once its inputs are in (Q1, readiness alone)', async () => {
    for (const spec of [TAKE, FLOAT]) for (const ends of everySplit(spec.pages)) {
      const P = await takePaper(spec, ends)
      expect(P.honoured, ends.join()).toBe(true)
      for (let before = 0; before <= P.parts.length; before++) for (const feed of ['eager', 'starved'] as const) {
        const { run, q1 } = await partsRun(P, { before, ended: 'last', feed, rows: 'parts' })
        expect(q1, `${ends.join(',')}, ${before}, ${feed}`).toEqual([])
        expect(run.drawnTo).toBe(spec.pages)
      }
    }
  })

  it('waits for the part that covers a page, and draws nothing of it before', async () => {
    const P = await takePaper(TAKE)
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const facade = layoutFacade(P.index.head)
    const doc = P.docFor(0) as ReturnType<Paper['docFor']>
    const waits: string[] = []
    const run = await openProto({
      parts: true, doc, geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
      target: 'zh', pages: P.N, scale: 1, dpr: 1, copy: false, labels: LABELS as never, tex: { ...HYBRID, index: facade.index, pieces: new Map() },
      removal: { mode: 'draw', doc, manifest: { schema: 1, removal: REMOVAL, pages: P.N, sets: {}, page: {} } as never }, onWait: (w: string) => waits.push(w),
    } as never)
    run.take(unitsOfRows(P.index, rowsOfIndex(P.index)) as never)
    expect(run.rows.every(r => r === null)).toBe(true)
    expect([run.through, run.inputs(1), run.failed(1)]).toEqual([0, false, false])
    const one = run.until(1)
    await ticks()
    expect(waits).toEqual(['part'])
    expect([run.drawnTo, doc.reads.length]).toEqual([0, 0])
    facade.add(P.parts[0]!)
    run.grow(P.parts[0]!)
    expect(run.rows[0]).not.toBeNull()
    for (let i = 0; i < 100 && run.drawnTo < 1; i++) await tick()
    await ticks()
    // (page 1 drawn, its units laid; the unit running on to page 2 waits for the part that covers page 2)
    expect(run.drawnTo).toBe(1)
    expect(run.doneAt(1)).toBe(2)
    for (const part of P.parts.slice(1)) { facade.add(part); run.grow(part) }
    await one
    expect(run.drawnTo).toBe(2)
    run.dispose()
  })

  it('steps over a page whose drawing throws: its units the original\'s on all their pages, why page; the others drawn', async () => {
    const P = await takePaper(TAKE)
    const fail = [2]
    const Q = { ...P, docFor: docsOf(TAKE, { fail: () => fail }) }
    const { run } = await partsRun(Q, { before: Q.parts.length, ended: 'open' })
    expect(run.failed(2)).toBe(true)
    expect(run.drawnTo).toBe(3)
    const skipped = new Map(run.skipped.map(s => [s.id, s.why]))
    // (every unit on page 2, the paragraph from page 1 among them, and the table's cells: none laid, each left and why)
    for (const id of [5, 6, 7, 8, 9, 10, 11]) { expect(skipped.has(id), `unit ${id}`).toBe(true); expect(run.order).not.toContain(id) }
    expect([skipped.get(5), skipped.get(11), skipped.get(9)]).toEqual(['page', 'page', 'unanchored'])
    expect(run.order).toContain(0)
    expect(run.order.some(id => id > 11)).toBe(true)
    expect(run.rows[1]!.ops).toEqual([])
    expect(run.rows[2]!.svg.innerHTML).not.toBe('')
    run.dispose()
  })

  it('fails the pages no part covers once the parts end, and completes the pages before them', async () => {
    const P = await takePaper(TAKE)
    const { run } = await partsRun({ ...P, parts: P.parts.slice(0, 1) }, { before: 1, ended: 'open' })
    expect([run.through, run.partsEnded, run.failed(1), run.failed(2), run.failed(3)]).toEqual([1, true, false, true, true])
    expect(run.drawnTo).toBe(3)
    // (page 1 done after page 2, stepped over: the paragraph running on to it the original's)
    expect(run.doneAt(1)).toBeLessThanOrEqual(run.drawnTo)
    expect(run.skipped.find(s => s.id === 5)?.why).toBe('page')
    expect(run.order).toEqual(expect.arrayContaining([0, 3, 4]))
    // (page 2's view came with the first part, which reaches it; page 3's never came)
    expect([run.rows[1] !== null, run.rows[2]]).toEqual([true, null])
    run.dispose()
  })

  it('swaps documents at a part with a tail, telling each superseded one once its reads end, and the last at dispose', async () => {
    const M = await made()
    const units = M.index.units.map((_, id) => ({ text: `unit ${id}`, lines: M.readParts.flatMap(p => p.left.filter(w => w[0] === id).flatMap(w => w[2].map(r => [r[0], r[1], r[3], r[2] + 2.15]))) }))
    let release = () => {}
    const held = new Promise<void>(ok => { release = ok })
    let holding = true
    const docFor = docsOf({ pages: 4, units }, { hold: n => (n === 1 && holding ? held : null) })
    const P: Paper = { N: 4, index: M.index, parts: M.readParts, docFor }
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const facade = layoutFacade(P.index.head)
    const retired: unknown[] = []
    const run = await openProto({
      parts: true, doc: docFor(0), geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
      target: 'zh', pages: 4, scale: 1, dpr: 1, copy: false, labels: LABELS as never, tex: { ...HYBRID, index: facade.index, pieces: new Map() },
      removal: { mode: 'draw', doc: docFor(0), manifest: { schema: 1, removal: REMOVAL, pages: 4, sets: {}, page: {} } as never }, onRetired: (d: unknown) => retired.push(d),
    } as never)
    run.take(unitsOfRows(P.index, rowsOfIndex(P.index)) as never)
    run.end()
    const grow = (i: number) => { const part = P.parts[i]!; facade.add(part); run.grow(part); if (part.addon?.tail) run.swap(docFor(part.chain.r)) }
    // (the first part's tail: its document read from now on, the one the run was opened with read by nothing, told at once)
    grow(0)
    expect(retired).toEqual([docFor(0)])
    // (page 1 read from it, held: the swap to the next part's waits for that read to end)
    const one = run.until(1)
    await ticks()
    expect(docFor(1).reads).toEqual([1])
    grow(1)
    expect(retired).toEqual([docFor(0)])
    holding = false
    release()
    for (let i = 0; i < 20 && retired.length < 2; i++) await tick()
    expect(retired).toEqual([docFor(0), docFor(1)])
    // (the third part has no tail: no swap)
    grow(2)
    await one
    run.endParts()
    await run.until(4)
    expect(docFor(2).reads.length).toBeGreaterThan(0)
    expect(docFor(0).reads).toEqual([])
    expect(retired).toEqual([docFor(0), docFor(1)])
    run.dispose()
    expect(retired).toEqual([docFor(0), docFor(1), docFor(2)])
    run.dispose()
    expect(retired.length).toBe(3)
  })
})

describe('the layout facade', () => {
  it('answers, once every part is in, every unit and name as the whole paper\'s layout file does', async () => {
    for (const spec of [TAKE, FLOAT]) {
      const P = await takePaper(spec, [1, 2])
      const facade = layoutFacade(P.index.head)
      const merged = mergeParts(P.index, P.parts)
      const whole = indexLayout(merged.layout!)
      const index = facade.index
      expect(index.unit(0)).toBeNull()
      for (const part of P.parts) facade.add(part)
      expect(facade.index).toBe(index)
      for (let id = 0; id < spec.units.length; id++) expect(index.unit(id), `unit ${id}`).toEqual(whole.unit(id))
      for (let p = 1; p <= spec.pages; p++) { expect(index.onPage(p)).toEqual(whole.onPage(p)); expect(index.names(p)).toEqual(whole.names(p)) }
      expect(index.file.lineskip).toEqual(P.index.head.lineskip)
    }
  })

  it('is read for no font: a font\'s index may change from one part to the next, and no drawing module reads one', () => {
    // (a line's font is its rows' eighth value, a name's its tenth; index.font the table's: none is read by the drawing)
    const dirs = ['src/pdf-reader/engine/layer-proto', 'src/pdf-reader/engine/layer'].map(d => resolve(d))
    const skip = new Set(['format.mjs', 'cut.mjs', 'facade.mjs'])
    for (const dir of dirs) for (const f of readdirSync(dir).filter(n => n.endsWith('.mjs') && !skip.has(n))) {
      const text = readFileSync(join(dir, f), 'utf8')
      expect(text, f).not.toMatch(/\bindex\.font\(|\bnm\.font\b|\.font\(\s*\w+\s*\)/)
      expect(text, f).not.toMatch(/lines\[[^\]]*\+\s*7\]/)
    }
  })
})

// ---------------------------------------------------------------- H4: the local papers (AXT_LAB, the lab's root: lab/pdf)
// The bookkeeping at scale without a browser: each paper made whole as the cutter's real-paper test makes it (its units from its
// source, the layout file the gate's maker made, the geometry v0 is given), cut at the doubling, a page a part and a seeded
// schedule, and run in parts, each part told when the run waits for it, against the open over the paper made whole again; the
// text layer stands in (each unit's lines its text, no ink), the translation is the engine's own rows of a stand-in
const LAB = process.env.AXT_LAB
describe.skipIf(!LAB)('H4: the local papers in parts, as the open over each made whole', () => {
  const PAPERS: [string, string][] = [['1512.03385v1', 'zh'], ['1706.03762v7', 'zh'], ['1810.04805v2', 'zh'], ['2307.16209v1', 'de'], ['2608.04322v1', 'zh']]
  const FIXTURES = 'out/layer-gate/fixtures/f343494cf544323e', GEOMETRY = 'out/layer-gate/cut-p10/geometry'
  // (a part of 1 to 4 pages, drawn from the seed and the page it begins at, mixed as the gate's --door-parts=seed:<s> mixes them)
  const mix32 = (x: number) => { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0 }
  const seeded = (seed: number) => (a: number, N: number) => Math.min(N, a + (mix32(Math.imul(seed, 0x9e3779b1) ^ a) % 4))
  for (const [name, target] of PAPERS) {
    it(name, async () => {
      const { existsSync } = await import('node:fs')
      const { openPaper } = await import('@/pdf-reader/engine/pipeline/live.mjs')
      const { unpackSource } = await import('@/pdf-reader/engine/source/tar.mjs')
      const { bundleUnitsOf } = await import('@/pdf-reader/engine/layer-proto/units.mjs')
      const { parseLayout } = await import('@/pdf-reader/engine/layout/file.mjs')
      const { cutBundle } = await import('@/pdf-reader/engine/layer-proto/cut.mjs')
      const { readCut } = await import('./helpers/parts-paper')
      const root = LAB as string
      const layoutFile = join(root, FIXTURES, `${name}-zh`, 'layout.json'), geometryFile = join(root, GEOMETRY, `${name}-${target}-geometry.json`), sourceFile = join(root, 'data/layout', name, 'source.gz')
      for (const f of [layoutFile, geometryFile, sourceFile]) if (!existsSync(f)) throw new Error(`missing ${f}`)
      const id = name.replace(/v\d+$/, ''), version = Number(name.slice(id.length + 1))
      const source = await unpackSource(new Uint8Array(readFileSync(sourceFile)))
      if (!('files' in source)) throw new Error(`${name}: the source is a PDF`)
      const units = bundleUnitsOf(openPaper(source.files))
      const layout = parseLayout(new Uint8Array(readFileSync(layoutFile)))
      const geometry = JSON.parse(readFileSync(geometryFile, 'utf8')) as { left: { pages: [number, number, number, number][]; units: [number, number, number[][]][] } }
      const N = layout.paper.pages
      const whole = {
        paper: { id, version, pages: N }, base: { bytes: 1_000_000, sha256: 'a'.repeat(64), xref: 999_000 }, versions: { image: '1' }, units,
        left: { kinds: units.map(u => u[0]), pages: geometry.left.pages, units: [...geometry.left.units].sort((a, b) => a[0] - b[0]) }, layout,
        addon: { manifest: { schema: 1, removal: REMOVAL, pages: N, sets: {}, page: Object.fromEntries(Array.from({ length: N }, (_, i) => [i + 1, { ok: true }])), appended: 0, stats: {} } },
      }
      // (the text layer: each unit's left rectangles and layout lines, its id its text)
      const lines = new Map<number, number[][]>()
      for (const [uid, , rects] of whole.left.units) for (const r of rects) (lines.get(uid) ?? lines.set(uid, []).get(uid)!).push([r[0]!, r[1]!, r[3]!, r[2]! + 2.15])
      for (const [uid, rows] of layout.lines) for (let j = 0; j < rows.length; j += 8) (lines.get(uid) ?? lines.set(uid, []).get(uid)!).push([rows[j]!, rows[j + 1]!, rows[j + 2]!, rows[j + 3]!])
      const docFor = docsOf({ pages: N, units: units.map((_, uid) => ({ text: `unit ${uid}`, lines: lines.get(uid) ?? [] })) })
      for (const [schedule, to] of [['the doubling', undefined], ['a page a part', (a: number) => a], ['seeded', seeded(7)]] as const) {
        const cut = await cutBundle(whole as never, { leftPages: () => null, ...(to ? { target: to } : {}) })
        const { index, parts } = await readCut(cut)
        const P: Paper = { N, index, parts, docFor }
        // (a part that ships no layout draws its units as with no file: the warm door is its reference, not the whole)
        const want = drawing(parts.some(p => p.layout === null) ? (await partsRun(P, { before: parts.length, ended: 'open' })).run : await wholeRun(P))
        const { run, q1 } = await partsRun(P, { before: 0, ended: 'open', feed: 'starved' })
        expect(drawing(run), `${name}, ${schedule}, ${parts.length} parts`).toEqual(want)
        expect(q1, `${name}, ${schedule}`).toEqual([])
        run.dispose()
      }
    }, 600_000)
  }
})
