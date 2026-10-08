import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { trPiecesOf } from '@/pdf-reader/engine/layer/pieces.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// v0 fed its units as they arrive (layer-proto/run.mjs openProto's `expect`, take, end): over a paper of its own making,
// three pages of a PDF.js document's shape (its text layer, its views; nothing drawn), a layout file and v0's geometry,
// every unit's drawing read from its pages' rows (their operations and their SVG), as the gate's --parts reads them on
// the made fixtures

/** a canvas context that draws nothing and reads a white page */
const ctxStub = (canvas?: { width: number; height: number }) => new Proxy({} as Record<string | symbol, unknown>, {
  get(t, k) {
    if (k in t) return t[k]
    // (an em a CJK character, half one any other, at the context's font size)
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
  // no hyphenation patterns: none is needed for these lines
  g.fetch = async () => ({ ok: false, json: async () => null })
})
afterEach(() => { delete g.scheduler })

const H = 300, VIEW = [0, 0, 300, H]
const KINDS = ['para', 'heading', 'caption', 'footnote', 'cell', 'abstract', 'theorem', 'figure', 'author']
/** a unit of the paper: its lines (page, x0, x1, baseline; 10 pt), each with its part of the source; where they are read
 *  from (the layout file, or v0's geometry), and the record's row */
interface Spec { id: number; kind: string; lines: [number, number, number, number, string][]; from: 'file' | 'geometry'; state: string; tr?: string; group?: string; cite?: boolean }
const CJK = (n: number, from = 0x4e00) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + 7 * i)).join('')
const para = (id: number, page: number, b: number, src: string, extra: Partial<Spec> = {}): Spec => ({ id, kind: 'para', lines: [[page, 20, 280, b, src]], from: 'file', state: 'whole', tr: CJK(6, 0x4e00 + id), ...extra })
const cell = (id: number, x0: number, b: number, src: string, group: string, extra: Partial<Spec> = {}): Spec => ({ id, kind: 'cell', lines: [[2, x0, x0 + 60, b, src]], from: 'file', state: 'whole', tr: CJK(2, 0x5000 + id), group, ...extra })

/**
 * The paper: page 1 a paragraph, an author line, a paragraph v0's geometry holds, four units not translated (none, kept,
 * lost) and a paragraph running on to page 2; page 2 a table's header and two columns (one of them split: a cell whose
 * citation the file does not find, so that its column is kept whole) and a lost paragraph; page 3 eleven paragraphs and
 * one of the geometry's. The order the units are laid in, batches of 8 by the stream, depends on which are placed: an
 * order fixed before the rows are read (the five not placed on page 1 counted) puts page 1's last paragraph in the batch
 * before the table's and lays it on page 2 before the cells, the one-shot open after them
 */
const SPECS: Spec[] = [
  para(0, 1, 260, 'Alpha beta gamma'),
  { ...para(1, 1, 245, 'Ann Author'), kind: 'author' },
  { ...para(2, 1, 230, 'Delta epsilon'), from: 'geometry' },
  para(3, 1, 215, 'Kappa lambda', { state: 'none', tr: undefined }),
  para(4, 1, 200, 'Mu nu', { state: 'kept' }),
  para(5, 1, 185, 'Xi omicron', { state: 'lost', tr: undefined }),
  para(6, 1, 170, 'Pi rho', { state: 'none', tr: undefined }),
  { id: 7, kind: 'para', lines: [[1, 20, 280, 40, 'Zeta eta'], [2, 20, 280, 270, 'theta iota']], from: 'file', state: 'whole', tr: CJK(8, 0x4e30) },
  cell(8, 20, 240, 'Head', 'T:h'),
  cell(9, 20, 220, 'Row one', 'T:c0'),
  cell(10, 20, 200, 'Row two', 'T:c0'),
  cell(11, 100, 220, 'Cited', 'T:c1', { cite: true }),
  cell(12, 100, 200, 'Plain', 'T:c1'),
  para(13, 2, 140, 'Sigma tau', { state: 'lost', tr: undefined }),
  ...Array.from({ length: 11 }, (_, i) => para(14 + i, 3, 270 - 20 * i, `Word${String.fromCharCode(97 + i)} more${String.fromCharCode(97 + i)}`)),
  { ...para(25, 3, 40, 'Omega last'), from: 'geometry' },
]

/** the record's row of a unit: its translation's pieces, each non-text one with its k (E6's row) */
function rowOf(s: Spec, tr = s.tr) {
  const pieces = tr === undefined ? undefined : s.cite ? [{ t: 'text', tr: true, s: tr }, { t: 'ph', src: '\\cite{a}', k: 0 }] : [{ t: 'text', tr: true, s: tr }]
  return { kind: s.kind, src: s.lines.map(l => l[4]).join(' '), state: s.state, ...(s.group ? { group: s.group } : {}), ...(pieces ? { pieces } : {}) }
}
type Row = ReturnType<typeof rowOf>

function paper(specs = SPECS) {
  const pages = [1, 2, 3]
  const items = pages.map(p => specs.flatMap(s => s.lines.filter(l => l[0] === p).map(([, x0, x1, b, text]) => ({ str: text, transform: [10, 0, 0, 10, x0, b], width: x1 - x0, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))))
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const pageOf = (n: number) => ({ view: VIEW, getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items: items[n - 1], styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {} })
  const asked: number[] = []
  const doc = { numPages: 3, asked, getPage: async (n: number) => { asked.push(n); return pageOf(n) } }
  const file = specs.filter(s => s.from === 'file')
  const layout = {
    schema: 1, layout: '3', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 3 }, left: '', views: pages.flatMap(() => VIEW), fonts: ['F1'],
    units: file.map(s => [s.id, KINDS.indexOf(s.kind), 9, 0, s.cite ? 2 : 1]),
    lines: file.map(s => [s.id, s.lines.flatMap(([p, x0, x1, b]) => [p, x0, x1, b, b + 7, b - 2, 10, 0])]),
    frames: file.map(s => [s.id, s.lines.flatMap(([p], j) => [p, 0, j, 1, j ? 0 : -1, 0])]),
    erase: file.map(s => [s.id, s.lines.flatMap(([, x0, x1, b], j) => [j, x0, b - 2, x1, b + 7])]),
    ph: [], labels: [], headings: [], pageText: [], held: [],
  }
  const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
  const geometry = {
    schema: 1, kinds: specs.map(s => s.kind), left: { pages: pages.map(() => VIEW), units: specs.filter(s => s.from === 'geometry').map(s => [s.id, s.id, s.lines.map(([p, x0, x1, b]) => [p, x0, b - 2.15, x1, b + 6.83])]) },
  }
  const rows = new Map<number, Row>(specs.map(s => [s.id, rowOf(s)]))
  return { doc, index, geometry, rows }
}

type Run = Awaited<ReturnType<typeof import('@/pdf-reader/engine/layer-proto/run.mjs').openProto>>
/** each unit's table group, as the paper's bundle gives it (the open's `groups`) */
const groupsOf = () => new Map(SPECS.filter(s => s.group).map(s => [s.id, s.group!]))
/** v0 over the paper: every unit at once (today's call), or none, the record's ids expected (taken later); `groups`,
 *  each unit's table group given at open */
async function open(P: ReturnType<typeof paper>, how: 'whole' | 'parts', { groups = null as Map<number, string> | null } = {}) {
  const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
  const units: unknown[] = []
  if (how === 'whole') for (const [id, r] of P.rows) units[id] = r
  const pieces = new Map<number, unknown[]>()
  // (the units file's pieces: the translated units')
  if (how === 'whole') for (const [id, r] of P.rows) { const tr = r.pieces && r.state === 'whole' ? trPiecesOf(r.pieces, (p: unknown) => (p as { k: number }).k) : null; if (tr) pieces.set(id, tr) }
  return openProto({
    doc: P.doc, target: 'zh', pages: 3, scale: 1, dpr: 1, copy: false, geometry: P.geometry, units,
    ...(how === 'parts' ? { expect: [...P.rows.keys()] } : {}),
    ...(groups ? { groups } : {}),
    tex: { index: P.index, pieces, use: 'lines', texOnly: true, symbols: 'text', extents: 'v0' },
  } as never) as Promise<Run>
}
/** what a run drew: each page's operations and SVG, the order its units were laid in, their records and why each unit
 *  left was left */
const drawing = (run: Run) => ({
  pages: run.rows.map(r => ({ ops: JSON.stringify(r.ops), svg: r.svg.innerHTML })),
  order: run.order.slice(),
  stats: run.stats.map(({ ms: _, ...r }) => r),
  skipped: run.skipped.map(s => `${s.id}:${s.why}`).sort(),
})
const tick = () => new Promise(ok => setTimeout(ok, 0))
const partsOf = <T,>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(n * i, n * i + n))

describe('the paper of these tests, opened whole (today\'s call)', () => {
  it('draws its translated units, leaves the author, the split column and the units not translated, and lays them by its batches', async () => {
    const run = await open(paper(), 'whole')
    await run.until(3)
    const d = drawing(run)
    // (the author line is the file's alone, which places no author: unanchored, as a cell whose citation it does not find)
    expect(d.skipped).toEqual(['11:unanchored', '12:group: a cell not drawn', '1:unanchored'])
    expect(new Set(d.order)).toEqual(new Set([0, 2, 7, 8, 9, 10, ...Array.from({ length: 11 }, (_, i) => 14 + i), 25]))
    // (page 2's group: the cells first, then the paragraph from page 1, whose second page is waited on after them)
    expect(d.order.slice(2, 6)).toEqual([8, 9, 10, 7])
    expect(d.stats.map(r => r.id).sort((a, b) => a - b)).toEqual([...d.order].sort((a, b) => a - b))
    for (const p of d.pages) expect(p.svg).not.toBe('')
    // and every page is complete at once: nothing is expected that is not there
    for (const p of [1, 2, 3]) expect(run.complete(p)).toBe(true)
    expect(run.late()).toEqual([])
  })
})

/** a run's parts taken one a macrotask, as rows arrive, then end() */
async function feed(run: Run, P: ReturnType<typeof paper>, parts: number[][], { end = true } = {}) {
  for (const part of parts) { await tick(); run.take(rowsOf(P, part)) }
  if (end) { await tick(); run.end() }
}
const rowsOf = (P: ReturnType<typeof paper>, ids: number[]) => new Map(ids.map(id => [id, P.rows.get(id)!]))
const ticks = async (n = 5) => { for (let i = 0; i < n; i++) await tick() }
/** a fixed shuffle (a linear congruential generator's), so that a failure is the same each run */
function shuffled<T>(list: T[], seed = 7) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) % 2 ** 31; const j = seed % (i + 1); [out[i], out[j]] = [out[j]!, out[i]!] }
  return out
}
async function wholeDrawing(specs = SPECS) {
  const run = await open(paper(specs), 'whole')
  await run.until(3)
  return { run, want: drawing(run) }
}

describe('v0 fed its units as they arrive (take, end)', () => {
  it("rows given in parts, the delta rule's sizes, draw every page as one openProto over all of them does", async () => {
    // (the made fixtures' parts, by the delta rule, are the gate's --parts; here any sizes and any order, the pages
    // asked for while the rows still come)
    const { run: whole, want } = await wholeDrawing()
    const ids = [...paper().rows.keys()]
    const onPage = (p: number) => SPECS.filter(s => s.lines[0]![0] === p).map(s => s.id)
    const ways: Record<string, number[][]> = {
      'one part': [ids], 'a row a part': partsOf(ids, 1), 'three a part': partsOf(ids, 3), 'the last first': partsOf(ids.slice().reverse(), 1),
      'shuffled, two a part': partsOf(shuffled(ids), 2), 'page 3, then 2, then 1': [onPage(3), onPage(2), onPage(1)],
    }
    for (const [way, parts] of Object.entries(ways)) for (const groups of [null, groupsOf()]) {
      const P = paper(), as = `${way}${groups ? ', each unit\'s group given' : ''}`
      const run = await open(P, 'parts', { groups })
      const fed = feed(run, P, parts)
      for (const p of [1, 2, 3]) await run.until(p)
      await fed
      expect(drawing(run), as).toEqual(want)
      expect(run.placed.map(p => p.id), as).toEqual(whole.placed.map(p => p.id))
      expect(run.sources, as).toEqual(whole.sources)
      expect(run.late(), as).toEqual([])
    }
  })

  it('a page waits for its expected units; end() completes it; none and lost complete their places and draw nothing', async () => {
    // (no table: a table group's cells wait for every unit, whose rows decide whether the group is drawn)
    const specs = SPECS.filter(s => !s.group)
    const { run: whole, want } = await wholeDrawing(specs)
    const untranslated = [3, 4, 5, 6, 13]
    expect(want.stats.filter(r => untranslated.includes(r.id))).toEqual([])
    expect(whole.audit.filter(a => untranslated.includes(a.unit))).toEqual([])
    const rest = specs.map(s => s.id).filter(id => id !== 5 && id !== 13)
    const P = paper(specs)
    const run = await open(P, 'parts')
    expect(run.take(rowsOf(P, rest)).complete).toEqual([])
    // page 1 is done once page 2 is (its last paragraph runs on to it), and page 2's lost paragraph is not in
    expect([1, 2, 3].map(p => run.complete(p))).toEqual([false, false, false])
    let done = false
    const laid = run.until(1).then(() => { done = true })
    await ticks()
    expect(done).toBe(false)
    expect(run.order).toEqual([])
    expect(run.take(rowsOf(P, [13])).complete).toEqual([])
    await ticks()
    expect(done).toBe(false)
    // page 1's lost paragraph in: every page complete, each laid as the one-shot open lays it, the lost units nowhere
    expect(run.take(rowsOf(P, [5])).complete).toEqual([1, 2, 3])
    await laid
    await run.until(3)
    expect(drawing(run)).toEqual(want)
    // never sent: end() completes the page with what it holds, a lost unit's place as a missing one's
    const P2 = paper(specs)
    const ended = await open(P2, 'parts')
    ended.take(rowsOf(P2, rest))
    const laid2 = ended.until(3)
    await ticks()
    expect(ended.order).toEqual([])
    ended.end()
    expect([1, 2, 3].map(p => ended.complete(p))).toEqual([true, true, true])
    await laid2
    expect(drawing(ended)).toEqual(want)
  })

  it('until(p) never lays page p before p − 1', async () => {
    // (each unit's table group given: a page is laid once its own units have come)
    const { want } = await wholeDrawing()
    const P = paper()
    const run = await open(P, 'parts', { groups: groupsOf() })
    const onPage = (p: number) => SPECS.filter(s => s.lines[0]![0] === p).map(s => s.id)
    const laid = run.until(3)
    await ticks()
    // page 1 drawn, its units awaited
    expect(P.doc.asked).toEqual([1])
    expect(run.order).toEqual([])
    // page 1's rows: its units laid while the later rows are missing, page 2 drawn and its units awaited
    run.take(rowsOf(P, onPage(1)))
    await ticks()
    expect(run.order).toEqual(want.order.slice(0, 2))
    expect(P.doc.asked).toEqual([1, 2])
    // page 3's rows: nothing more while page 2's are missing
    run.take(rowsOf(P, onPage(3)))
    await ticks()
    expect(run.order).toEqual(want.order.slice(0, 2))
    expect(P.doc.asked).toEqual([1, 2])
    // page 2's: page 2 laid, then page 3
    run.take(rowsOf(P, onPage(2)))
    await laid
    expect(P.doc.asked).toEqual([1, 2, 3])
    expect(drawing(run)).toEqual(want)
  })

  it('draws the pages whose units have come while a later page\'s rows are still missing', async () => {
    const { want } = await wholeDrawing()
    const early = SPECS.filter(s => s.lines[0]![0] <= 2).map(s => s.id)
    // each unit's table group given: the table on page 2 is read once its own cells are in
    const P = paper()
    const run = await open(P, 'parts', { groups: groupsOf() })
    expect(run.take(rowsOf(P, early)).complete).toEqual([1, 2])
    expect([1, 2, 3].map(p => run.complete(p))).toEqual([true, true, false])
    await run.until(2)
    expect(run.order).toEqual(want.order.slice(0, 6))
    expect(drawing(run).pages.slice(0, 2)).toEqual(want.pages.slice(0, 2))
    expect(run.complete(3)).toBe(false)
    // a paper without tables: no group to read
    const flat = SPECS.filter(s => !s.group)
    const { want: wantFlat } = await wholeDrawing(flat)
    const F = paper(flat)
    const plain = await open(F, 'parts')
    plain.take(rowsOf(F, flat.filter(s => s.lines[0]![0] <= 2).map(s => s.id)))
    expect([1, 2, 3].map(p => plain.complete(p))).toEqual([true, true, false])
    await plain.until(2)
    expect(drawing(plain).pages.slice(0, 2)).toEqual(wantFlat.pages.slice(0, 2))
    // without the groups, a table cell waits for every row: page 2 is not complete, nor page 1, done after it
    const Q = paper()
    const slow = await open(Q, 'parts')
    slow.take(rowsOf(Q, early))
    expect([1, 2].map(p => slow.complete(p))).toEqual([false, false])
  })

  it("one unit a task: no task holds two units' lays", async () => {
    // (scheduler.yield, which v0 yields by, spied on: each gives the event loop a turn)
    const at: number[] = []
    let run: Run | null = null
    g.scheduler = { yield: () => { at.push(run ? run.order.length : -1); return new Promise(ok => setTimeout(ok, 0)) } }
    run = await open(paper(), 'whole')
    await run.until(3)
    // between the i-th unit's lay and the next one's, a yield
    for (let i = 0; i < run.order.length; i++) expect(at, `before unit ${i + 1}`).toContain(i)
    // and the drawing is the same with and without the yields (one that gives no other task a turn)
    g.scheduler = { yield: () => Promise.resolve() }
    const { want } = await wholeDrawing()
    expect(drawing(run)).toEqual(want)
  })

  it('lets no page go before it is drawn and its units laid', async () => {
    // (page 1 holds no unit: its doneAt is the page itself from the open on, and no release lets it go undrawn)
    const specs = SPECS.filter(s => s.lines[0]![0] !== 1)
    const P = paper(specs)
    const run = await open(P, 'parts')
    expect(run.doneAt(1)).toBe(1)
    run.release(1)
    expect(run.rows[0]!.released).toBeUndefined()
  })

  it('a row after its page was laid is counted late and draws nothing', async () => {
    const { want } = await wholeDrawing()
    const P = paper()
    const run = await open(P, 'parts')
    const other = (id: number) => ({ ...P.rows.get(id)!, pieces: [{ t: 'text', tr: true, s: CJK(4, 0x6000) }] })
    // a row sent again before anything it decides is laid wins
    run.take(new Map([...rowsOf(P, [...P.rows.keys()]), [0, other(0)]]))
    run.take(rowsOf(P, [0]))
    expect(run.late()).toEqual([])
    await run.until(1)
    const first = drawing(run).pages[0]
    expect(first).toEqual(want.pages[0])
    // once laid, a row for its page changes nothing
    run.take(new Map([[0, other(0)]]))
    expect(run.late()).toEqual([0])
    await run.until(3)
    expect(drawing(run).pages[0]).toEqual(first)
    // nor one after end(), or for a unit no row was expected of
    run.end()
    run.take(new Map([[24, other(24)], [99, other(24)]]))
    expect(run.late()).toEqual([0, 24, 99])
    expect(drawing(run)).toEqual(want)
  })
})

describe('a run let go while it waits (dispose)', () => {
  // (the faces every run shares are the module's, fonts.mjs setRoleFaces: a newer layer sets its own once this one is let
  // go, and nothing of this one may write or read them after)
  const fonts = () => document.fonts as unknown as { load: (font: string, text?: string) => Promise<unknown> }
  it("while a unit's faces load: that unit is neither recorded nor painted, nor counted, once they have loaded", async () => {
    const P = paper()
    // (unit 0's translation holds a character no other text asks a face for: its own load is held)
    P.rows.set(0, { ...P.rows.get(0)!, pieces: [{ t: 'text', tr: true, s: `\u9f98${CJK(5)}` }] })
    const was = fonts().load
    let hit = () => {}, go = () => {}
    const asked = new Promise<void>(ok => { hit = ok }), held = new Promise(ok => { go = () => ok([]) })
    fonts().load = async (_font, text) => { if (text?.includes('\u9f98')) { hit(); await held } return [] }
    try {
      const run = await open(P, 'whole')
      const under = run.until(3)
      await asked
      run.dispose()
      go()
      await under
      expect(run.order).toEqual([0])
      expect(run.stats).toEqual([])
      expect(run.skipped.filter(x => x.id === 0)).toEqual([])
      expect(run.rows.every(r => r.ops.length === 0 && r.svg.innerHTML === '')).toBe(true)
    } finally { fonts().load = was }
  })
  it("while its first page is drawn: a newer layer's roles stand once the page is", async () => {
    const { roleFaces, setRoleFaces } = await import('@/pdf-reader/engine/layer-proto/fonts.mjs')
    const P = paper(), getPage = P.doc.getPage
    let go = () => {}
    const held = new Promise<void>(ok => { go = ok })
    P.doc.getPage = async (n: number) => { await held; return getPage(n) }
    const run = await open(P, 'whole')
    const under = run.until(1)
    await tick()
    run.dispose()
    // (the newer layer's, set at its open)
    setRoleFaces('ja', 'times', resolveRules(BUILTIN_RULES, 'ja').cjkFaces)
    const newer = roleFaces()
    go()
    await under
    await tick()
    expect(roleFaces()).toBe(newer)
    expect(run.order).toEqual([])
  })
})

describe("a table group with a cell whose row never came, each unit's group given", () => {
  it("keeps the group the original's where the cell was expected (end() before its row)", async () => {
    // (cell 9 of T:c0 expected and never sent: cell 10, its group-mate, is the original's too, as if neither were
    // translated)
    const P = paper()
    const run = await open(P, 'parts', { groups: groupsOf() })
    run.take(rowsOf(P, [...P.rows.keys()].filter(id => id !== 9)))
    run.end()
    await run.until(3)
    const d = drawing(run)
    expect(d.skipped).toContain('10:group: a cell not drawn')
    expect(d.order).not.toContain(10)
    const N = paper()
    for (const u of [9, 10]) N.rows.set(u, { ...N.rows.get(u)!, state: 'none', pieces: undefined })
    const plain = await open(N, 'whole', { groups: groupsOf() })
    await plain.until(3)
    const want = drawing(plain)
    expect({ pages: d.pages, order: d.order, stats: d.stats }).toEqual({ pages: want.pages, order: want.order, stats: want.stats })
  })
  it('draws the group where the cell was never expected (kept as a name), as one open over the same rows does', async () => {
    const P = paper()
    P.rows.delete(9)
    const run = await open(P, 'parts', { groups: groupsOf() })
    run.take(rowsOf(P, [...P.rows.keys()]))
    await run.until(3)
    const d = drawing(run)
    expect(d.order).toContain(10)
    const W = paper()
    W.rows.delete(9)
    const whole = await open(W, 'whole', { groups: groupsOf() })
    await whole.until(3)
    expect(d).toEqual(drawing(whole))
  })
})

describe('rows that parse but are no unit of this paper (take)', () => {
  // (the web's rows pass parseAnswersDelta's shapes; one that does not fit the paper's own files is left the original's,
  // its why in v0's skipped list, and the rest of the paper is drawn as ever: as one open over the same rows draws it,
  // and as if that unit were not translated; a table cell with every cell of its group, a translated cell that cannot
  // be drawn: ruling P28)
  const hostile: [string, number, (P: ReturnType<typeof paper>) => Row, string, boolean?][] = [
    ["a piece's k past its unit's pieces in the layout file", 0, P => ({ ...P.rows.get(0)!, pieces: [{ t: 'text', tr: true, s: CJK(3) }, { t: 'ph', src: '\\cite{a}', k: 5 }] }), "row: a k not its source's"],
    ['an id neither the geometry nor the layout file holds', 30, () => ({ kind: 'para', src: 'Nowhere', state: 'whole', pieces: [{ t: 'text', tr: true, s: CJK(3) }] }), 'unanchored'],
    ['a kind the layout file does not give its id', 14, P => ({ ...P.rows.get(14)!, kind: 'cell' }), 'row: another kind'],
    ['a table group the open was not given for its id', 9, P => ({ ...P.rows.get(9)!, group: 'T:c1' }), 'row: another group', true],
    ["a cell's kind the layout file does not give its id", 9, P => ({ ...P.rows.get(9)!, kind: 'para' }), 'row: another kind'],
    ["a cell's kind the layout file does not give its id, each unit's group given", 9, P => ({ ...P.rows.get(9)!, kind: 'para' }), 'row: another kind', true],
    ['pieces that are not a list', 15, P => ({ ...P.rows.get(15)!, pieces: 'pieces' }) as unknown as Row, "row: not a unit's shape"],
    ['a piece that is not a piece', 16, P => ({ ...P.rows.get(16)!, pieces: [null] }) as unknown as Row, "row: not a unit's shape"],
  ]
  for (const [what, id, rowOfIt, why, given = false] of hostile) {
    it(`skips a row with ${what}, and draws the rest`, async () => {
      const W = paper()
      W.rows.set(id, rowOfIt(W))
      const groups = given ? groupsOf() : null
      const whole = await open(W, 'whole', { groups })
      await whole.until(3)
      const P = paper()
      P.rows.set(id, rowOfIt(P))
      const run = await open(P, 'parts', { groups })
      const fed = feed(run, P, partsOf([...P.rows.keys()], 1))
      for (const p of [1, 2, 3]) await run.until(p)
      await fed
      const d = drawing(run)
      expect(d).toEqual(drawing(whole))
      expect(d.skipped).toContain(`${id}:${why}`)
      expect(d.order).not.toContain(id)
      // (a cell's group-mates left with it)
      const mates = SPECS.filter(s => s.group && s.group === SPECS[id]?.group && s.id !== id).map(s => s.id)
      for (const m of mates) expect(d.skipped).toContain(`${m}:group: a cell not drawn`)
      // the unit not translated, and its group with it: the same pages, the same order
      const N = paper()
      for (const u of [id, ...mates]) if (N.rows.has(u)) N.rows.set(u, { ...N.rows.get(u)!, state: 'none', pieces: undefined })
      const plain = await open(N, 'whole', { groups })
      await plain.until(3)
      const want = drawing(plain)
      expect({ pages: d.pages, order: d.order, stats: d.stats }).toEqual({ pages: want.pages, order: want.order, stats: want.stats })
    })
  }
})
