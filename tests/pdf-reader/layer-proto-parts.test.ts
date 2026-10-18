import { LAB_ON, LAB_PAPERS, labFiles } from './helpers/lab-data'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cutBundle, needFrontier } from '@/pdf-reader/engine/layer-proto/cut.mjs'
import { layoutFacade } from '@/pdf-reader/engine/layer-proto/facade.mjs'
import { type LayerIndex, mergeParts, type ReadPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { indexLayout, PH_KINDS } from '@/pdf-reader/engine/layout/file.mjs'
import { BUILTIN_RULES } from '@/pdf-reader/engine/rules/layout.mjs'
import { made } from './helpers/format-paper'
import { cutSpec, docsOf, everySplit, groupsOfIndex, leftPagesOfSpec, type PaperSpec, readCut, rowsOfIndex, splitAt, unitsOfRows, wholeOfSpec } from './helpers/parts-paper'

// The door's parts mode at the run (layer-proto/run.mjs openProto `parts`, grow, endParts, swap; the door design §0 to §4, §5
// H1): a paper cut into parts by the cutter at every split of its pages, its parts told to the run interleaved with the pages
// asked for, draws every page as the open over the whole paper (mergeParts) does, and as the warm door (every part at the
// open) does: each page's operations and SVG, the order its units are laid in, their records and why each unit left is left.
// Where a unit is laid with no further part to come for it (inputs), it waits for none (the engine lane's Q1, measured). The
// run in parts lets go of what it has laid as the reader's does (`free`, the 1b design §3), the open over the whole keeps
// everything: so each equality below also holds that letting go never changes a drawing (M2)

/** the calls the runs make of layer2's reading, laying, ink and drawing, by name (R2: a ready page is answered from its
 *  record alone) */
const calls = vi.hoisted(() => new Map<string, number>())
/** a fault a test sets: drawnRuns, which the units' records alone read, throws for the tokens it names */
const faults = vi.hoisted(() => ({ record: null as ((tokens: { s?: string }[]) => boolean) | null }))
vi.mock('@/pdf-reader/engine/layer-proto/layer2.mjs', async importOriginal => {
  const actual = await importOriginal<Record<string, (...a: unknown[]) => unknown>>()
  const counted = (name: string) => (...a: unknown[]) => { calls.set(name, (calls.get(name) ?? 0) + 1); return actual[name]!(...a) }
  const drawnRuns = (tokens: { s?: string }[]) => { if (faults.record?.(tokens)) throw new Error('a record that cannot be made'); return actual.drawnRuns!(tokens) }
  return { ...actual, drawnRuns, ...Object.fromEntries(['pageChars2', 'inkMapOf', 'prepareUnit', 'growCrop', 'tokensOf2', 'layoutUnit2', 'layoutAt', 'unitOps', 'removalOps', 'svgOfUnit', 'svgOfName'].map(n => [n, counted(n)])) }
})

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
  pages: run.rows.map((r, i) => (r ? { ops: JSON.stringify(r.ops), svg: run.svgOf(i + 1).innerHTML } : null)),
  order: run.order.slice(),
  stats: run.stats.map(({ ms: _, ...r }) => r),
  skipped: run.skipped.map(s => `${s.id}:${s.why}`).sort(),
})

/** the open over the whole paper: mergeParts' geometry, layout and manifest, every row, then end() */
async function wholeRun(P: Paper, o: { records?: boolean; rules?: unknown } = {}) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const merged = mergeParts(P.index, P.parts)
  const doc = P.docFor(P.parts.at(-1)!.chain.r)
  const run = await openProto({
    doc, geometry: { schema: 1, kinds: merged.left.kinds, left: { pages: merged.left.pages, units: merged.left.units } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
    target: 'zh', pages: P.N, scale: 1, dpr: 1, copy: false, proof: true, labels: LABELS as never, ...(o as object),
    // (BUNDLE 3's door: the text removal where the bundle has an add-on, v0's own drawing where it has none)
    tex: { ...HYBRID, index: indexLayout(merged.layout!), pieces: new Map() }, removal: merged.addon ? { mode: 'draw', doc, manifest: merged.addon.manifest } : null,
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
 *  wait at all (Q1). It lets go of what it laid as the reader's run does (`free`), its records kept for the comparison (the
 *  gate's shelf); `records: false` (the reader's), their count alone. `onPage(run, p)`: after each page asked is laid */
async function partsRun(P: Paper, o: PartsOptions & { records?: boolean; rules?: unknown; onPage?: (run: Run, p: number, grown: number) => void }) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const facade = layoutFacade(P.index.head)
  const doc = P.docFor(0)
  let waits = 0, starved: (() => void) | null = null
  const run = await openProto({
    parts: true, proof: true, doc, geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
    target: 'zh', pages: P.N, scale: 1, dpr: 1, copy: false, free: true, records: o.records ?? true, labels: LABELS as never, ...(o.rules ? { rules: o.rules } : {}),
    tex: { ...HYBRID, index: facade.index, pieces: new Map() }, removal: { mode: 'draw', doc, manifest: { schema: 1, removal: REMOVAL, pages: P.N, sets: {}, page: {} } as never },
    onRetired: o.onRetired ?? null, onWait: (what: string) => { waits++; if (what === 'part') starved?.() },
  } as never)
  const all = unitsOfRows(P.index, rowsOfIndex(P.index))
  const byParts = o.rows === 'parts'
  if (!byParts) { run.take(all as never); if (o.ended === 'open') run.end() }
  let grown = 0
  const grow = (i: number) => {
    grown++
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
      o.onPage?.(run, p, grown)
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

async function takePaper(spec: PaperSpec, ends?: number[], o: { addon?: boolean; extend?: boolean } = {}): Promise<Paper & { honoured: boolean }> {
  const c = await cutSpec(spec, ends, o)
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

  it('a paper with no add-on (M20): its parts carry none, and draw as the open over the whole with none, table groups drawn', async () => {
    for (const [name, spec] of [['the take test\'s paper', TAKE], ['a float told late and a column across a page break', FLOAT]] as const) {
      for (const ends of everySplit(spec.pages)) {
        const P = await takePaper(spec, ends, { addon: false })
        expect(P.parts.every(p => p.addon === null), `${name} ${ends}`).toBe(true)
        const want = drawing(await wholeRun(P))
        // (no group withheld for a page the text removal has no word of: the whole with no add-on draws them)
        expect(want.skipped.filter(s => s.includes('its page not removed'))).toEqual([])
        if (spec === TAKE) expect(want.order).toEqual(expect.arrayContaining([6, 7, 8]))
        for (let before = 0; before <= P.parts.length; before += P.parts.length) for (const feed of ['eager', 'starved'] as const) {
          const { run, q1 } = await partsRun(P, { before, ended: 'open', feed })
          expect(drawing(run), `${name}, ends ${ends}, ${before} at the open, ${feed}`).toEqual(want)
          expect(q1).toEqual([])
        }
      }
    }
  })

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
    // (the doubling schedule alone: its first part is page 1)
    const P = await takePaper(TAKE, undefined, { extend: false })
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const facade = layoutFacade(P.index.head)
    const doc = P.docFor(0) as ReturnType<Paper['docFor']>
    const waits: string[] = []
    const run = await openProto({
      parts: true, proof: true, doc, geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
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
    for (let i = 0; i < 100 && waits.length < 2; i++) await tick()
    // (page 1 drawn; its closure reads page 2, which a unit runs on to, and waits for the part that covers it: nothing laid, page 2
    // not drawn)
    expect(doc.reads).toEqual([1])
    expect(waits).toEqual(['part', 'part'])
    expect([run.drawnTo, run.order.length, run.doneAt(1)]).toEqual([0, 0, Infinity])
    for (const part of P.parts.slice(1)) { facade.add(part); run.grow(part) }
    await one
    expect(run.ready(1)).toBe(true)
    run.dispose()
  })

  /** v0 in parts over a paper, every part told and the rows ended: `doc` its composed document, `target` its language, `copy` v0's own
   *  copy kept */
  const openWarm = async (P: Paper, doc: unknown, o: { target?: string; copy?: boolean } = {}) => {
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const facade = layoutFacade(P.index.head)
    const target = o.target ?? 'zh'
    const run = await openProto({
      parts: true, proof: true, doc, geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: toTranslate(P.index, target), groups: groupsOfIndex(P.index),
      target, pages: P.N, scale: 1, dpr: 1, copy: o.copy ?? false, labels: LABELS as never, tex: { ...HYBRID, index: facade.index, pieces: new Map() },
      removal: { mode: 'draw', doc, manifest: { schema: 1, removal: REMOVAL, pages: P.N, sets: {}, page: {} } as never },
    } as never)
    run.take(unitsOfRows(P.index, rowsOfIndex(P.index)) as never)
    run.end()
    for (const part of P.parts) { facade.add(part); run.grow(part); if (part.addon?.tail) run.swap(P.docFor(part.chain.r)) }
    return run
  }

  it('lays no unit before the hyphenation patterns are in (m2: no line break that hangs on a fetch\'s timing)', async () => {
    // (German: its patterns are fetched by no other test of this file, and a realm fetches a language's once)
    const P = await takePaper(TAKE)
    const was = g.fetch
    try {
      let release = () => {}, loaded = false
      const held = new Promise<void>(ok => { release = ok })
      g.fetch = async (url: string) => { if (String(url).includes('/hyph/de')) { await held; loaded = true } return { ok: false, json: async () => null } }
      const run = await openWarm(P, docsOf(TAKE)(0), { target: 'de' })
      const laid = run.until(3)
      await ticks(20)
      expect(run.order, 'the patterns not in').toEqual([])
      release()
      await laid
      expect(loaded).toBe(true)
      expect(run.order.length).toBeGreaterThan(0)
      run.dispose()
    } finally { g.fetch = was }
  })

  it('ends the run where page 1 cannot be drawn: the paper\'s designs, family and patterns are read from it, so no later page is drawn (I1)', async () => {
    const P = await takePaper(TAKE)
    const doc = docsOf(TAKE, { fail: () => [1] })(0)
    const run = await openWarm(P, doc)
    const laid = await run.until(3).then(() => 'laid', (e: Error) => e.message)
    expect(laid).toMatch(/page 1 cannot be read/)
    expect(doc.reads).toEqual([1])
    expect([run.drawnTo, run.order, run.stats]).toEqual([0, [], []])
    run.dispose()
  })

  it('ends the run where a page\'s fonts were exported with no map to read (I2: a document not opened with PDF_OPTIONS)', async () => {
    const P = await takePaper(TAKE)
    const base = docsOf(TAKE)(0)
    // (page 2's text in a font of its own, exported with no ToUnicode map: the document was opened without fontExtraProperties)
    const doc = {
      numPages: base.numPages, reads: [] as number[],
      async getPage(n: number) {
        doc.reads.push(n)
        const pg = (await base.getPage(n)) as { getTextContent(): Promise<{ items: { fontName: string }[]; styles: Record<string, unknown> }> }
        return {
          ...pg,
          getTextContent: async () => { const tc = await pg.getTextContent(); return { items: tc.items.map(it => ({ ...it, fontName: `f${n}` })), styles: { [`f${n}`]: tc.styles.f1 } } },
          commonObjs: { get: (name: string) => ({ name: 'Times-Roman', isType3Font: false, ...(name === 'f2' ? {} : { toUnicode: { _map: [] } }) }) },
        }
      },
    }
    const run = await openWarm(P, doc)
    const laid = await run.until(3).then(() => 'laid', (e: Error) => e.message)
    expect(laid).toMatch(/PDF_OPTIONS/)
    // (page 2 read with page 1, its closure, before any unit is laid)
    expect(doc.reads).toEqual([1, 2])
    expect([run.drawnTo, run.order]).toEqual([0, []])
    run.dispose()
  })

  it('refuses parts with no proof: a part with no layout is read through the proof that nothing proves (#352)', async () => {
    const P = await takePaper(TAKE)
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const doc = docsOf(TAKE)(0)
    await expect(openProto({
      parts: true, doc, geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: [], groups: groupsOfIndex(P.index),
      target: 'zh', pages: P.N, scale: 1, copy: false, tex: { ...HYBRID, index: layoutFacade(P.index.head).index, pieces: new Map() },
      removal: { mode: 'draw', doc, manifest: { schema: 1, removal: REMOVAL, pages: P.N, sets: {}, page: {} } as never },
    } as never)).rejects.toThrow(TypeError)
  })

  it('reads no document for a copy once the run is let go (M10: a retired document is not read)', async () => {
    const P = await takePaper(TAKE)
    const base = docsOf(TAKE)(0)
    let release = () => {}
    let holding = false
    const held = new Promise<void>(ok => { release = ok })
    const doc = { numPages: base.numPages, reads: [] as number[], async getPage(n: number) { doc.reads.push(n); if (holding) await held; return base.getPage(n) } }
    const run = await openWarm(P, doc)
    await run.until(2)
    // (page 2's drawing as if it cut from pages 1 and 3: two other pages to read for its copy)
    run.rows[1]!.ops.push({ op: 'crop', page: 1, plane: 'O' } as never, { op: 'crop', page: 3, plane: 'O' } as never)
    const reads = doc.reads.length
    holding = true
    const canvas = document.createElement('canvas')
    canvas.width = 10
    canvas.height = 10
    const copying = run.drawCopy(2, canvas.getContext('2d')!, canvas, 1).then(() => 'drawn', (e: Error) => e.message)
    await ticks()
    run.dispose()
    release()
    await copying
    // (the first read under way when it was let go ends; the second is never made)
    expect(doc.reads.slice(reads)).toEqual([1])
  })

  it('keeps no source of a page that failed after its original was drawn (Minor 5: no crop cut from it)', async () => {
    const M = await made()
    const units = M.index.units.map((_, id) => ({ text: `unit ${id}`, lines: M.readParts.flatMap(p => p.left.filter(w => w[0] === id).flatMap(w => w[2].map(r => [r[0], r[1], r[3], r[2] + 2.15]))) }))
    const plain = docsOf({ pages: 4, units })
    // (page 3's removed page, the add-on's sixth page, cannot be read: page 3 fails after its original is drawn)
    const docFor = (r: number) => { const d = plain(r); return { numPages: d.numPages, reads: d.reads, getPage: (n: number) => (n === 6 ? Promise.reject(new Error('page 6 cannot be read')) : d.getPage(n)) } }
    const P: Paper = { N: 4, index: M.index, parts: M.readParts, docFor: docFor as never }
    const run = await openWarm(P, docFor(0), { copy: true })
    await run.until(4)
    expect(run.failed(3)).toBe(true)
    expect(run.rows[2]!.base).toBe(false)
    expect(run.rows[1]!.base).toBe(true)
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
    expect(run.svgOf(3).innerHTML).not.toBe('')
    run.dispose()
  })

  it('fails the pages no part covers once the parts end, and completes the pages before them', async () => {
    const P = await takePaper(TAKE, undefined, { extend: false })
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
      parts: true, proof: true, doc: docFor(0), geometry: { schema: 1, kinds: P.index.kinds.map(k => k ?? ''), left: { pages: [], units: [] } } as never, units: [], expect: toTranslate(P.index, 'zh'), groups: groupsOfIndex(P.index),
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

// ---------------------------------------------------------------- the kept record and what the run holds (the 1b design §1, §3)
/** the element today's paint built before the 1b design §1: an SVG of the row's size, each string of the page's markup
 *  inserted in turn as it was painted */
function paintedOf(run: Run, p: number) {
  const r = run.rows[p - 1]!
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'tl')
  svg.setAttribute('width', String(r.w))
  svg.setAttribute('height', String(r.h))
  svg.setAttribute('xml:space', 'preserve')
  for (const s of r.markup) svg.insertAdjacentHTML('beforeend', s)
  return svg
}
const NOTHING = { state: [], units: [], reads: 0 }
/** the fields a unit holds for its lay, its passes and its paint alone, those it still holds */
const heavyOf = (u: object) => ['prep', 'tokens', 'layout', 'blocks', 'local', 'lead', 'P', 'clear'].filter(k => (u as Record<string, unknown>)[k] !== undefined)

/** three pages, the unit of page 3 citing what stands on page 1: its placeholder's segment there (a crop's page it has no line
 *  on), which the run holds for it until it is laid. (Its rendering reads its own lines alone, renderingOf over its characters:
 *  the citation is left unproven here, and no drawing reads page 1 for it; the hold is the 1b design's §3, for every page a
 *  unit's crops may be cut from) */
const CROSS: PaperSpec = { pages: 3, units: [para('First page', 1, 260, { stream: 0 }), para('Second page', 2, 260, { stream: 10 }), { ...para('Third page cites the first', 3, 260, { stream: 20 }), cite: true }] }
async function crossPaper(ends: number[]): Promise<Paper> {
  const whole = wholeOfSpec(CROSS)
  // (the citation's ink on page 1: unit 2's piece 1, one segment [page, x0, baseline, x1, top, bottom])
  ;(whole.layout!.ph as unknown as number[][]).push([2, 1, PH_KINDS.indexOf('cite'), 0, 1, 40, 200, 80, 207, 198])
  const { index, parts } = await readCut(await cutBundle(whole as never, { leftPages: leftPagesOfSpec(CROSS), target: splitAt(ends) } as never))
  return { N: CROSS.pages, index, parts, docFor: docsOf(CROSS) }
}

describe('the kept record and what the run holds (the 1b design §1, §3)', () => {
  it("R1: makes each page's SVG of its kept markup as today's paint built its element, anew each call: every page of H1's papers, both opens", async () => {
    let elements = 0
    for (const spec of [TAKE, FLOAT]) for (const ends of everySplit(spec.pages)) {
      const P = await takePaper(spec, ends)
      for (const run of [await wholeRun(P), (await partsRun(P, { before: 0, ended: 'open', feed: 'starved' })).run]) for (let p = 1; p <= P.N; p++) {
        const a = run.svgOf(p), b = run.svgOf(p)
        expect(a.outerHTML, `${ends} page ${p}`).toBe(paintedOf(run, p).outerHTML)
        // (a new element each call, of equal markup: I3; the run holds no element of the page: I1)
        expect(a).not.toBe(b)
        expect(b.outerHTML).toBe(a.outerHTML)
        expect([...a.attributes].map(x => x.name)).toEqual(['class', 'width', 'height', 'xml:space'])
        expect(Object.keys(run.rows[p - 1]!)).not.toContain('svg')
        elements += a.querySelectorAll('*').length
      }
    }
    expect(elements).toBeGreaterThan(100)
  })

  it('M1: lets go of a page once it is done and no unit still to be laid reads it, and of a unit once it is painted for good', async () => {
    for (const spec of [TAKE, FLOAT]) for (const ends of everySplit(spec.pages)) {
      const P = await takePaper(spec, ends)
      const wrong: string[] = []
      const { run } = await partsRun(P, {
        before: 0, ended: 'open', feed: 'starved',
        onPage: (r, p) => {
          for (let q = 1; q <= r.drawnTo; q++) {
            const h = r.held(q)
            // (done and read by no unit still to be laid: nothing of it held, though a cell of a table group running on to a
            // page not laid yet keeps its own state until its group is read whole; drawn and not done: its state held)
            if (r.doneAt(q) <= r.drawnTo && !h.reads) { if (h.state.length) wrong.push(`asked ${p}: page ${q} holds ${h.state}`) }
            else if (!r.failed(q) && !h.state.includes('chars')) wrong.push(`asked ${p}: page ${q} not done, its characters let go`)
          }
        },
      })
      expect(wrong, `${ends}`).toEqual([])
      for (let q = 1; q <= P.N; q++) expect(run.held(q), `${ends} page ${q}`).toEqual(NOTHING)
      // (every unit painted, or left the original's, holds nothing of its own; the gate's shelf keeps it as laid)
      expect(run.held()).toEqual({ free: true, records: true, shelf: true })
      for (const u of run.placed) {
        expect(heavyOf(u), `${ends} unit ${u.id}`).toEqual([])
        if (!u.refused) expect(heavyOf(run.full(u)), `${ends} unit ${u.id}`).toEqual(expect.arrayContaining(['prep', 'tokens', 'layout', 'blocks']))
      }
    }
  })

  it('M1: holds a page that is done for a unit still to be laid that may cut from it, and lets it go once that unit is laid', async () => {
    // (one part: a part holds no placeholder's segment on a page before its own, format.mjs partShape, so a unit's hold comes
    // with its part, before any page it reads is laid; told at the open or once the run waits for it)
    for (const before of [0, 1]) {
      const P = await crossPaper([])
      const want = drawing(await wholeRun(P))
      const at: ReturnType<Run['held']>[] = []
      const ends = `${before} at the open`
      const { run } = await partsRun(P, { before, ended: 'open', feed: 'starved', onPage: (r, p) => { at[p] = r.held(1) } })
      // (page 1 done once laid, its own unit painted; held for unit 2 until page 3's drawing lays it, then let go)
      expect(run.doneAt(1), `${ends}`).toBe(1)
      for (const p of [1, 2]) {
        expect(at[p]!.reads, `${ends}: asked ${p}`).toBe(1)
        expect(at[p]!.state, `${ends}: asked ${p}`).toEqual(expect.arrayContaining(['chars', 'ink', 'items']))
      }
      expect(at[3], `${ends}`).toEqual(NOTHING)
      expect(drawing(run), `${ends}`).toEqual(want)
    }
  })

  it('R2: answers a ready page from its record alone: no page read, no reading, laying, ink or face; and keeps no record but the count', async () => {
    const P = await takePaper(TAKE, [1])
    const { run } = await partsRun(P, { before: P.parts.length, ended: 'open', records: false })
    const fonts = document.fonts as unknown as { load: (...a: unknown[]) => Promise<unknown> }
    const load = fonts.load, Face = g.FontFace as new (...a: unknown[]) => object
    let loads = 0, faces = 0
    fonts.load = (...a) => { loads++; return load(...a) }
    g.FontFace = class extends (Face as new (...a: unknown[]) => object) { constructor(...a: unknown[]) { super(...a); faces++ } }
    try {
      const reads = P.docFor(0).reads.length, before = [...calls]
      for (let p = 1; p <= P.N; p++) for (let i = 0; i < 2; i++) expect(run.svgOf(p).childElementCount).toBeGreaterThan(0)
      expect([P.docFor(0).reads.length, loads, faces]).toEqual([reads, 0, 0])
      expect([...calls]).toEqual(before)
    } finally { fonts.load = load; g.FontFace = Face }
    // (the reader's run: no unit's record and no audit, the units drawn counted as the gate's run records them)
    expect([run.stats, run.audit, run.held()]).toEqual([[], [], { free: true, records: false, shelf: false }])
    const recorded = (await partsRun(P, { before: P.parts.length, ended: 'open' })).run
    expect(run.drawn).toBe(recorded.stats.length)
    expect(recorded.drawn).toBe(recorded.stats.length)
    for (let p = 1; p <= P.N; p++) expect(run.svgOf(p).outerHTML).toBe(recorded.svgOf(p).outerHTML)
  })
})

describe('the run that lets go, with no page pass, and a record that throws', () => {
  it('lets go as it paints, where the rules set no page pass (no fill, no even pass, the leftover at the foot)', async () => {
    // (the built-in set with no page fill for Chinese: every unit painted as it is laid, a table's cells with their group)
    const rules = structuredClone(BUILTIN_RULES) as unknown as { scripts: Record<string, { adaptiveFill: unknown; even: number; leftover: string }> }
    rules.scripts.Hans!.adaptiveFill = null
    for (const spec of [TAKE, FLOAT]) for (const ends of everySplit(spec.pages)) {
      const P = await takePaper(spec, ends)
      const whole = await wholeRun(P, { rules })
      expect([whole.P.adaptiveFill, whole.P.even, whole.P.leftover]).toEqual([null, 0, 'foot'])
      const want = drawing(whole)
      expect(want.order.length).toBeGreaterThan(5)
      const { run } = await partsRun(P, { before: 0, ended: 'open', feed: 'starved', rules })
      expect(drawing(run), `${ends}`).toEqual(want)
      for (let q = 1; q <= P.N; q++) expect(run.held(q), `${ends} page ${q}`).toEqual(NOTHING)
      for (const u of run.placed) expect(heavyOf(u), `${ends} unit ${u.id}`).toEqual([])
    }
  })

  it("draws a unit whose record throws as a run with no records draws it: the record is the error's, the drawing the same", async () => {
    const P = await takePaper(TAKE, [1])
    const want = drawing(await wholeRun(P))
    // (unit 0's translation, the rows' CJK from U+4E00: its record cannot be made)
    faults.record = tokens => tokens.some(t => t.s?.includes('\u4e00'))
    try {
      for (const run of [await wholeRun(P), (await partsRun(P, { before: 0, ended: 'open', feed: 'starved' })).run]) {
        const got = drawing(run)
        expect(got.pages).toEqual(want.pages)
        expect(got.order).toEqual(want.order)
        expect(got.skipped).toEqual(want.skipped)
        expect(run.skipped.some(x => x.id === 0)).toBe(false)
        // (the error alone, by unit; every record a whole one)
        expect(run.recordErrors).toEqual([{ id: 0, error: 'a record that cannot be made' }])
        expect(run.stats.map(r => r.id)).toEqual(want.stats.map(r => r.id).filter(id => id !== 0))
        expect(run.stats.every(r => typeof r.knob === 'string' && typeof r.fitScale === 'number')).toBe(true)
        expect(run.drawn).toBe(want.stats.length)
      }
      const bare = await wholeRun(P, { records: false })
      expect(drawing(bare).pages).toEqual(want.pages)
      expect([bare.stats, bare.drawn]).toEqual([[], want.stats.length])
    } finally { faults.record = null }
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

// ---------------------------------------------------------------- the schedule extended over the need bound (D2)
describe('the cut extended over the need bound: a page is laid by the parts that cover its bound, and no more', () => {
  /** a unit drawn on pages p and p + 1, lines and rectangles on both */
  const crossing = (text: string, p: number, stream: number, b = 150) => ({ ...para(text, p, b, { stream }), lines: [[p, 20, 280, b], [p + 1, 20, 280, 270]] as [number, number, number, number][] })
  const CHAIN: PaperSpec = {
    pages: 6,
    units: [crossing('One runs on', 1, 0), crossing('Two runs on', 2, 10), crossing('Three runs on', 3, 20), para('Four', 4, 250, { stream: 30 }), para('Five', 5, 250, { stream: 40 }), para('Six', 6, 250, { stream: 50 })],
  }
  const cut = async (spec: PaperSpec, extend: boolean) => {
    const { needBound } = await import('@/pdf-reader/engine/layer-proto/need.mjs')
    const whole = wholeOfSpec(spec)
    let seen: readonly unknown[] = []
    const c = await cutBundle(whole, { leftPages: leftPagesOfSpec(spec), extend, frontier: (K: readonly unknown[], N: number) => { seen = K; return needFrontier(K as never, N) } } as never)
    const { index, parts } = await readCut(c)
    const P: Paper = { N: spec.pages, index, parts, docFor: docsOf(spec) }
    return { P, NB: needBound(seen as never, spec.pages), ends: parts.map(p => p.pages[1]) }
  }

  for (const [name, spec] of [['the take test\'s paper', TAKE], ['a float told late and a column across a page break', FLOAT], ['units running on, chained', CHAIN]] as const) {
    it(`${name}: each page is laid once the parts covering its bound are in, and the extended cut covers more bounds in the part that holds them`, async () => {
      const ready: Record<string, number> = {}
      for (const extend of [false, true]) {
        const { P, NB, ends } = await cut(spec, extend)
        const idxOf = (page: number) => ends.findIndex(e => e >= page)
        const grownAt: number[] = []
        await partsRun(P, { before: 0, ended: 'open', feed: 'starved', onPage: (_run, p, grown) => { grownAt[p] = grown } })
        let most = 0, readyInOwn = 0
        for (let p = 1; p <= P.N; p++) {
          most = Math.max(most, idxOf(NB[p]!) + 1)
          // (the door waits for no part beyond the one covering the bound of this page or of one asked before it)
          expect(grownAt[p], `${extend ? 'extended' : 'plain'}, page ${p} (bound ${NB[p]}, parts ending ${ends})`).toBeLessThanOrEqual(most)
          if (NB[p]! <= ends[idxOf(p)]!) {
            readyInOwn++
            // a page whose bound its own part covers is laid by that part and those before it
            expect(grownAt[p], `${extend ? 'extended' : 'plain'}, page ${p}`).toBeLessThanOrEqual(Math.max(idxOf(p) + 1, grownAt[p - 1] ?? 0))
          }
        }
        ready[String(extend)] = readyInOwn
      }
      expect(ready.true!).toBeGreaterThanOrEqual(ready.false!)
      if (spec === CHAIN) expect(ready.true!).toBeGreaterThan(ready.false!)
    }, 120_000)
  }
})

// ---------------------------------------------------------------- H4: the local papers (AXT_LAB and AXT_PACK, helpers/lab-data.ts)
// The bookkeeping at scale without a browser: each paper made whole as the cutter's real-paper test makes it (its units from its
// source, the layout file the gate's maker made, the geometry v0 is given), cut at the doubling, a page a part and a seeded
// schedule, and run in parts, each part told when the run waits for it, against the open over the paper made whole again; the
// text layer stands in (each unit's lines its text, no ink), the translation is the engine's own rows of a stand-in
describe.skipIf(!LAB_ON)('H4: the local papers in parts, as the open over each made whole', () => {
  // (a part of 1 to 4 pages, drawn from the seed and the page it begins at, mixed as the gate's --door-parts=seed:<s> mixes them)
  const mix32 = (x: number) => { x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return (x ^ (x >>> 16)) >>> 0 }
  const seeded = (seed: number) => (a: number, N: number) => Math.min(N, a + (mix32(Math.imul(seed, 0x9e3779b1) ^ a) % 4))
  for (const [name, target] of LAB_PAPERS) {
    it(name, async () => {
      const { existsSync } = await import('node:fs')
      const { openPaper } = await import('@/pdf-reader/engine/pipeline/live.mjs')
      const { unpackSource } = await import('@/pdf-reader/engine/source/tar.mjs')
      const { bundleUnitsOf } = await import('@/pdf-reader/engine/layer-proto/units.mjs')
      const { parseLayout } = await import('@/pdf-reader/engine/layout/file.mjs')
      const { cutBundle } = await import('@/pdf-reader/engine/layer-proto/cut.mjs')
      const { readCut } = await import('./helpers/parts-paper')
      const { layoutFile, geometryFile, sourceFile } = labFiles(name, target)
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
        // (a drawing worth comparing: units laid and drawn on the pages, as many parts as the schedule asks)
        expect(want.order.length, name).toBeGreaterThan(20)
        expect(want.pages.filter(p => p?.svg).length, name).toBeGreaterThan(N / 2)
        if (to) expect(parts.length, name).toBeGreaterThan(N / 4)
        const { run, q1 } = await partsRun(P, { before: 0, ended: 'open', feed: 'starved' })
        expect(drawing(run), `${name}, ${schedule}, ${parts.length} parts`).toEqual(want)
        expect(q1, `${name}, ${schedule}`).toEqual([])
        run.dispose()
      }
    }, 600_000)
  }
})
