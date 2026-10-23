import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, LAYOUT_SCHEMA, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { withGroups } from './helpers/groups'

// v0 opened whole (layer-proto/run.mjs openProto) over a page of its own making: a PDF.js document's shape (its text
// layer, its views; nothing drawn), our groups' configuration (helpers/groups.ts), a layout file and a record. What the page's
// drawing is made of is then read from its rows' operations and the groups they hide, as the gate reads the copy's pixels

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

beforeAll(() => {
  const g = globalThis as Record<string, unknown>
  g.OffscreenCanvas = class { width = 8; height = 8; getContext() { return ctxStub(this) } }
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = function (this: HTMLCanvasElement) { return ctxStub(this) }
  g.FontFace = class { family: string; constructor(family: string) { this.family = family } load() { return Promise.resolve(this) } }
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add() {}, delete() {}, load: async () => [], check: () => true, ready: Promise.resolve() } })
  // no hyphenation patterns: none is needed for these lines
  g.fetch = async () => ({ ok: false, json: async () => null })
})

/** the units of a two-cell table as the door gives them: a bundle's cells (cell 1 a \\multirow of `span` rows where span > 1,
 *  both in column 0's group) made units of translated rows by rows.mjs unitOf, the rows' pieces text alone (no spanning
 *  command in them) */
async function rowUnits(srcs: string[], span: number) {
  const { unitOf } = await import('@/pdf-reader/engine/layer-proto/rows.mjs')
  // (span 2: a \\multirow cell — a column's group holds it with the cells under it, its box theirs too — whose translated row
  // keeps no piece of its \\multirow; a \\multicolumn's span is its group's own, groups.mjs groupOf)
  const bundle = { units: srcs.map((s, i) => ['cell', 0, null, { table: 0, row: i, col: 0, span: 1, head: false }, null, i === 1 && span > 1 ? [[2, 1, `\\multirow{${span}}{*}{`], [0, s], [3, 1, '}']] : [[0, s]]]) }
  return srcs.map((_, i) => unitOf(bundle as never, [i, ['\u6c49\u5b57'], 'whole'] as never))
}

/** a page of 300 x 300 PDF units, its text layer the given words (each [text, x, baseline, width], 10 pt) */
function docOf(words: [string, number, number, number][], groups = true) {
  const H = 300
  const viewportOf = (scale: number) => ({ width: 300 * scale, height: H * scale, scale, transform: [scale, 0, 0, -scale, 0, H * scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (H - y) * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, H - y / scale] })
  const items = words.map(([str, x, y, width]) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10, fontName: 'f1', dir: 'ltr', hasEOL: false }))
  const page = { view: [0, 0, 300, H], getViewport: ({ scale }: { scale: number }) => viewportOf(scale), getTextContent: async () => ({ items, styles: { f1: { fontFamily: 'serif', ascent: 0.7, descent: -0.2 } } }), render: () => ({ promise: Promise.resolve() }), commonObjs: { get: () => ({ name: 'Times-Roman' }) }, cleanup() {} }
  const doc = { numPages: 1, getPage: async () => page }
  return groups ? withGroups(doc) : doc
}

describe("a table group withheld beside one drawn, the whole run (openProto): only the drawn group's ink is hidden", () => {
  // Codex's review of PR A, finding 1, and the re-review's I2: three cells, A over x 10-40 in its column's group, B beside
  // it from x 40.1 and C under B in the next column's. C's translation cannot be set in its cell, so its group is
  // withheld and B keeps the original's text. Read once at the page's first paint, the old fill counted B as drawn and
  // reached into its text; now the page hides A's group alone, whatever the order the paper holds the two groups in
  for (const first of ['A', 'B'] as const) {
    it(`hides A's group and neither withheld cell's, ${first === 'A' ? "A's group" : "B's group"} first in the paper`, async () => {
      const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
      const named: [string, string, number, number, number, string][] = [['A', 'Alpha', 10, 40, 100, 'T:c0'], ['B', 'Betas', 40.1, 70, 100, 'T:c1'], ['C', 'Gamma', 40.1, 70, 80, 'T:c1']]
      const order = first === 'A' ? named : [named[1]!, named[2]!, named[0]!]
      const cells = order.map(([name, src, x0, x1, b, group], id) => ({ id, name, src, x0, x1, b, group }))
      const layout = {
        schema: LAYOUT_SCHEMA, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['F1'],
        units: cells.map(c => [c.id, 4, 9, 0, 1]),
        lines: cells.map(c => [c.id, [1, c.x0, c.x1, c.b, c.b + 7, c.b - 2, 10, 0]]),
        frames: cells.map(c => [c.id, [1, 0, 0, 1, -1, 0]]),
        erase: cells.map(c => [c.id, [0, c.x0, c.b - 2, c.x1, c.b + 7]]),
        ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
      }
      const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
      const units = cells.map(c => ({ kind: 'cell', src: c.src, state: 'whole', group: c.group, pieces: [{ t: 'text', tr: true, s: c.name === 'C' ? '\u5f88'.repeat(400) : '\u6c49\u5b57' }] }))
      const doc = docOf(cells.map(c => [c.src, c.x0, c.b, c.x1 - c.x0]))
      const run = await openProto({
        doc, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false,
        geometry: { schema: 1, kinds: cells.map(() => 'cell'), left: { pages: [[0, 0, 300, 300]], units: [] } },
        units,
        tex: { index, pieces: new Map(cells.map(c => [c.id, [[0]]])), symbols: 'text', extents: 'v0' },
      } as never)
      await run.until(1)
      const idOf = (name: string) => cells.find(c => c.name === name)!.id
      // C could not be set, and its group with it; A is drawn by the file's rectangles
      expect(run.skipped.map((x: { id: number; why: string }) => `${x.id}:${x.why}`)).toEqual(expect.arrayContaining([`${idOf('C')}:unfit`, `${idOf('B')}:group: a cell unfit`]))
      expect(run.placed.map((p: { id: number }) => p.id)).toEqual([idOf('A')])
      // the page hides A's text group alone, and what it hid (device pixels at 1 a unit, y down) is A's line, short of B's text
      expect([...(run.rows[0] as unknown as { off: Set<string> }).off]).toEqual([`u${idOf('A')}`])
      const hidden = (run.rows[0]!.ops as unknown as { op: string; rects?: number[][] }[]).filter(o => o.op === 'hidden').flatMap(o => o.rects ?? [])
      expect(hidden.map(r => [r[0], r[0]! + r[2]!])).toEqual([[10, 40]])
      expect((run.rows[0]!.ops as unknown as { op: string }[]).some(o => o.op === 'paper' || o.op === 'erase')).toBe(false)
    })
  }
})

describe("a cell widened over the paper beside it, the whole run (openProto): held to a rule over the part it was widened onto", () => {
  it("lays the widened cell's line under the rule, its bands read again over the widened blocks", async () => {
    // the re-review of round 3, M4: cell X's rectangle over x 10-40 cannot hold its translation, so the fit widens it over
    // the paper to its right, to the text area's edge (cell Y's, x 200); a table's rule runs over x 60-120 just above X's
    // line. Its bands were read from the rectangle alone, which no rule is over: the widened line stood over the rule
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const cells = [{ id: 0, src: 'Delta', x0: 10, x1: 40, b: 100, tr: '\u6c49'.repeat(9) }, { id: 1, src: 'Omega', x0: 150, x1: 200, b: 60, tr: '\u6c49\u5b57' }]
    const layout = {
      schema: LAYOUT_SCHEMA, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['F1'],
      units: cells.map(c => [c.id, 4, 9, 0, 1]),
      lines: cells.map(c => [c.id, [1, c.x0, c.x1, c.b, c.b + 6.8, c.b - 2.14, 10, 0]]),
      frames: cells.map(c => [c.id, [1, 0, 0, 1, -1, 0]]),
      erase: cells.map(c => [c.id, [0, c.x0, c.b - 2.14, c.x1, c.b + 6.8]]),
      ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
    }
    const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
    const units = cells.map(c => ({ kind: 'cell', src: c.src, state: 'whole', pieces: [{ t: 'text', tr: true, s: c.tr }] }))
    const doc = docOf(cells.map(c => [c.src, c.x0, c.b, c.x1 - c.x0]))
    const run = await openProto({
      doc, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false,
      geometry: { schema: 1, kinds: cells.map(() => 'cell'), left: { pages: [[0, 0, 300, 300]], units: [] } },
      units,
      tex: { index, pieces: new Map(cells.map(c => [c.id, [[0]]])), symbols: 'text', extents: 'v0' },
      hiding: { rules: (page: number) => (page === 1 ? [60, 107.63, 120, 108.03] : undefined) },
    } as never)
    await run.until(1)
    const x = run.placed.find((p: { id: number }) => p.id === 0) as unknown as { layout: { knob: string; scale: number; lines: { baseline: number; x1: number }[] } }
    expect(x.layout.knob).toBe('widen')
    expect(x.layout.lines).toHaveLength(1)
    // its em box under the rule less the half point: a CJK em 0.88 of the size over the baseline
    const line = x.layout.lines[0]!
    expect(line.baseline + 0.88 * 10 * x.layout.scale).toBeLessThanOrEqual(107.63 - 0.5 + 1e-6)
  })
})

describe("a unit the page fill lays anew, the whole run (openProto): its record's counts are the drawn layout's", () => {
  it("counts the lines TeX's rule opens in the layout drawn, not in the fit's before the fill", async () => {
    // a paragraph of four lines 12 apart, its translation two; the paper's \lineskip 5 and \lineskiplimit 2.5. The fit
    // sets the two at 10 pt on the original's pitch, clear by 3 (2 deep, 7 high), over the limit: no line opens. The
    // page's fill grows them to 11 pt, clear by 2.1, under it: the second line drawn opens by 2.2 + 7.7 + 5 - 12
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const ys = [200, 188, 176, 164]
    const words = ['Alpha beta gamma', 'delta epsilon zeta', 'theta iota kappa', 'lambda mu nu']
    const layout = {
      schema: LAYOUT_SCHEMA, lineskip: [5, 2.5], layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['F1'],
      units: [[0, 0, 9, 0, 1]],
      lines: [[0, ys.flatMap(b => [1, 10, 110, b, b + 7, b - 2, 10, 0])]],
      frames: [[0, [1, 0, 0, 4, -1, 0]]],
      erase: [[0, ys.flatMap((b, i) => [i, 10, b - 2, 110, b + 7])]],
      ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
    }
    const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
    const doc = docOf(words.map((w, i) => [w, 10, ys[i]!, 5 * w.length]))
    const run = await openProto({
      doc, target: 'de', pages: 1, scale: 1, dpr: 1, copy: false,
      geometry: { schema: 1, kinds: ['para'], left: { pages: [[0, 0, 300, 300]], units: [] } },
      units: [{ kind: 'para', src: words.join(' '), state: 'whole', pieces: [{ t: 'text', tr: true, s: 'Eins zwei drei vier fuenf' }] }],
      tex: { index, pieces: new Map([[0, [[0]]]]), symbols: 'text', extents: 'v0' },
    } as never)
    await run.until(1)
    const p = run.placed.find((x: { id: number }) => x.id === 0) as unknown as { layout: { opened: number; unopened: number; scale: number; lines: { baseline: number }[] } }
    const rec = run.stats.find((r: { id: number }) => r.id === 0) as { opened: number; unopened: number; fill?: unknown }
    // filled at the page's size, its second line opened as it is drawn, and the record counts it
    expect(rec.fill).toBeDefined()
    expect(p.layout.scale).toBeCloseTo(1.1, 6)
    expect(p.layout.lines.map(l => l.baseline)).toEqual([200, 185.1])
    expect([p.layout.opened, p.layout.unopened]).toEqual([1, 0])
    expect([rec.opened, rec.unopened]).toEqual([1, 0])
  })
})

describe("a unit whose ink cannot be hidden, the whole run (openProto): shown as the original, never drawn", () => {
  // docs/route/ocg-erasure.md §4.2: a unit the file could not wrap (no group of its own: an unwrapped page, a paper the wrap
  // refused) or lists as unhidden (its own reason: marks, across, spell, page, bounds) keeps the original's ink and is not drawn;
  // there is no other way of taking a unit's ink away
  const open = async ({ groups = true, hiding = null as unknown, group = null as string | null, span = 1, fromRows = false }) => {
    const { openProto } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const cells = [{ id: 0, src: 'Alpha', x0: 10, x1: 40, b: 100 }, { id: 1, src: 'Betas', x0: 60, x1: 90, b: 100 }]
    const layout = {
      schema: LAYOUT_SCHEMA, lineskip: null, layout: '5', pdfjs: '6.3.289', paper: { id: '2610.00001', version: 1, pages: 1 }, left: '', views: [0, 0, 300, 300], fonts: ['F1'],
      units: cells.map(c => [c.id, 4, 9, 0, 1]),
      lines: cells.map(c => [c.id, [1, c.x0, c.x1, c.b, c.b + 7, c.b - 2, 10, 0]]),
      frames: cells.map(c => [c.id, [1, 0, 0, 1, -1, 0]]),
      erase: cells.map(c => [c.id, [0, c.x0, c.b - 2, c.x1, c.b + 7]]),
      ph: [], labels: [], headings: [], pageText: [], held: [], names: [],
    }
    const index = indexLayout(parseLayout(new TextEncoder().encode(JSON.stringify(layout))))
    const doc = docOf(cells.map(c => [c.src, c.x0, c.b, c.x1 - c.x0]), groups)
    const run = await openProto({
      doc, target: 'zh', pages: 1, scale: 1, dpr: 1, copy: false,
      geometry: { schema: 1, kinds: cells.map(() => 'cell'), left: { pages: [[0, 0, 300, 300]], units: [] } },
      units: fromRows ? await rowUnits(cells.map(c => c.src), span) : cells.map(c => ({ kind: 'cell', src: c.src, state: 'whole', ...(group ? { group, cell: { table: 'T', col: c.id, span: c.id === 1 ? span : 1 } } : {}), pieces: [{ t: 'text', tr: true, s: '\u6c49\u5b57' }] })),
      tex: { index, pieces: new Map(cells.map(c => [c.id, [[0]]])), symbols: 'text', extents: 'v0' },
      ...(hiding ? { hiding } : {}),
    } as never)
    await run.until(1)
    const ops = run.rows[0]!.ops as unknown as { op: string }[]
    return { placed: run.placed.map((p: { id: number }) => p.id), skipped: run.skipped.map((x: { id: number; why: string }) => `${x.id}:${x.why}`), kinds: [...new Set(ops.map(o => o.op))].sort(), off: [...(run.rows[0] as unknown as { off: Set<string> }).off].sort() }
  }
  it('draws each unit whose groups the page holds, and leaves as the original one the file lists unhidden or a page of no group', async () => {
    expect(await open({})).toEqual({ placed: [0, 1], skipped: [], kinds: ['hidden'], off: ['u0', 'u1'] })
    expect(await open({ hiding: { unhidden: (id: number) => (id === 1 ? 'spell' : null) } })).toEqual({ placed: [0], skipped: ['1:unhidden: spell'], kinds: ['hidden'], off: ['u0'] })
    expect(await open({ groups: false })).toEqual({ placed: [], skipped: ['0:unhidden: no group', '1:unhidden: no group'], kinds: [], off: [] })
  })
  // (the coordinator's ruling of 2026-10-24, coverage first: a table with one English cell beats an English table)
  it('draws the rest of a table group one of whose cells cannot be hidden, that cell the original\'s (2610.21098v1 p13)', async () => {
    const hiding = { unhidden: (id: number) => (id === 1 ? 'marks' : null) }
    expect(await open({ hiding, group: 'T:c0' })).toEqual({ placed: [0], skipped: ['1:unhidden: marks'], kinds: ['hidden'], off: ['u0'] })
  })
  it('keeps a group whole the original\'s where the cell that cannot be hidden spans columns: its geometry the others\' too', async () => {
    const hiding = { unhidden: (id: number) => (id === 1 ? 'marks' : null) }
    const r = await open({ hiding, group: 'T:c0', span: 2 })
    expect(r.placed).toEqual([])
    expect(r.skipped.sort()).toEqual(['0:group: a cell not drawn', '1:unhidden: marks'])
  })
  it('keeps a group whole where the spanning cell\'s \\multirow is the bundle\'s alone, its translated row naming none (unitOf to openProto; Devin on #456)', async () => {
    const hiding = { unhidden: (id: number) => (id === 1 ? 'marks' : null) }
    const r = await open({ hiding, fromRows: true, span: 2 })
    expect(r.placed).toEqual([])
    expect(r.skipped.sort()).toEqual(['0:group: a cell not drawn', '1:unhidden: marks'])
    // (the same cells of span 1: the other drawn)
    expect((await open({ hiding, fromRows: true, span: 1 })).placed).toEqual([0])
  })
  it('keeps a group whole the original\'s where the cell fails the spell check (its range may hold a sibling\'s ink) or sets a \\multirow', async () => {
    const spell = await open({ hiding: { unhidden: (id: number) => (id === 1 ? 'spell' : null) }, group: 'T:c0' })
    expect(spell.placed).toEqual([])
    expect(spell.skipped.sort()).toEqual(['0:group: a cell not drawn', '1:unhidden: spell'])
    const { cellSpans } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    expect([cellSpans({ cell: { span: 2 } }), cellSpans({ pieces: [{ t: 'open', src: '\\multirow{2}{*}{' }] }), cellSpans({ cell: { span: 1 }, pieces: [{ t: 'text', s: 'a' }] }), cellSpans({ pieces: [{ t: 'ph', src: '\\multirowx' }] })]).toEqual([true, true, false, false])
  })
})
