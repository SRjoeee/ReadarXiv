import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The layer's hybrid (layer-proto/tex.mjs): v0's per-unit reading with its parts from the layout file wherever the file
// locates the unit whole; and v0's fallback fixes of step 2 (layer2.mjs). The drawing is measured by the layer gate
// (--engine-kind=proto --proto-tex); these are the parts' rules, on made-up pages.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
beforeAll(async () => {
  // layer2.mjs measures with a canvas made when it loads; the test environment has none, and these rules measure nothing
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
})

const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false } as never
const math = { fam: 'math', bold: false, italic: true, caps: false, known: false } as never
/** a text item's characters, each half its size wide, from x on baseline yb */
const item = (text: string, x: number, yb: number, size: number, n: number, st = serif) => [...text].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item: n, ix: x, k, st }))
/** a unit in the layout file as indexLayout reads it: lines (page, x0, x1, baseline, top, bottom, size, font), one frame
 *  a page, its placeholders by k */
const unitOf = (lines: number[][], ph: [number, number, number[]][] = [], labels: number[] = []) => {
  const frames: number[] = []
  lines.forEach((l, j) => { const page = l[0] ?? 0; if (!j || page !== lines[j - 1]?.[0]) frames.push(page, 0, j, 0, -1, 0); frames[frames.length - 3] = (frames[frames.length - 3] ?? 0) + 1 })
  return { lines: Float64Array.from(lines.flat()), frames: Float64Array.from(frames), erase: lines.map(() => new Float64Array(0)), ph: new Map(ph.map(([k, flags, segs]) => [k, { kind: 'math', flags, segs: Float64Array.from(segs) }])), labels: Float64Array.from(labels) } as never
}

describe("the hybrid's test: whether the layout file locates a unit whole", () => {
  const unit = { kind: 'para', src: 'a b', pieces: [{ t: 'text', s: 'x ' }, { t: 'ph', src: '$x$' }, { t: 'ph', src: '\\vspace{1em}' }, { t: 'ph', src: '\\%' }] } as never
  const tr = [[0, 'x '], [1, 1], [1, 2], [1, 3]]
  const line = [1, 10, 100, 100, 107, 98, 10, 0]
  it('maps each translated piece to its source index by the units file, and refuses pieces that are not the same', () => {
    expect(T.kOfPieces(unit, tr)).toEqual([-1, 1, 2, 3])
    expect(T.kOfPieces(unit, tr.slice(1))).toBeNull()
    expect(T.kOfPieces(unit, [[1, 0], ...tr.slice(1)])).toBeNull()
  })
  it('passes a unit whose drawn placeholders are all found, its lines in any order (a display\'s rows the file lists late)', () => {
    const w = T.locatedWhole(unitOf([line], [[1, 0, [1, 20, 100, 25, 107, 98]], [2, 32, []], [3, 0, [1, 40, 100, 45, 107, 98]]]), unit, tr)
    expect(w).toEqual({ ok: true, why: null, kOf: [-1, 1, 2, 3] })
  })
  it('fails a unit the file does not hold, a drawn placeholder LOST, EMPTY or with no row', () => {
    const found = [1, 0, [1, 20, 100, 25, 107, 98]] as [number, number, number[]], sym = [3, 0, [1, 40, 100, 45, 107, 98]] as [number, number, number[]]
    expect(T.locatedWhole(null, unit, tr).why).toBe('unlocated')
    expect(T.locatedWhole(unitOf([line, [1, 10, 100, 110, 117, 108, 10, 0]], [found, sym]), unit, tr).ok).toBe(true)
    expect(T.locatedWhole(unitOf([line], [[1, 32, []], sym]), unit, tr).why).toBe('lost')
    expect(T.locatedWhole(unitOf([line], [[1, 16, []], sym]), unit, tr).why).toBe('empty')
    expect(T.locatedWhole(unitOf([line], [sym]), unit, tr).why).toBe('no row')
    // (a symbol with no row is not asked for: drawn as text, its glyph erased with its line)
    expect(T.locatedWhole(unitOf([line], [found]), unit, tr).ok).toBe(true)
  })
  it('asks a symbol drawn from its source as text to be found only when strict', () => {
    const u = unitOf([line], [[1, 0, [1, 20, 100, 25, 107, 98]], [3, 32, []]])
    expect(T.locatedWhole(u, unit, tr).ok).toBe(true)
    expect(T.locatedWhole(u, unit, tr, { symbols: 'strict' }).why).toBe('lost')
  })
})

describe('a displayed formula the held lines cover (D4 step 1)', () => {
  // a unit of text, a display, text: lines 0 and 1 its text, 2 and 3 the display's rows (held: no source word), 4 text
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const lines = [L(500), L(488), L(470), L(458), L(440)]
  const held = (lu: object, h: number[]) => ({ ...lu, held: h }) as never
  const display = '\\begin{equation}x=1\\end{equation}'
  const unit = (...p: object[]) => ({ kind: 'para', src: 'a b c', pieces: p }) as never
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const tr = [[0, 'a'], [1, 1], [0, 'c']]
  it('pairs each inner display group with a held run in order, and covers a LOST one with it', () => {
    const lu = held(unitOf(lines, [[1, 32, []]]), [2, 3])
    const u = unit(text('a b '), ph(display), text(' c'))
    expect([...T.displayCover(lu, u, [-1, 1, -1])]).toEqual([[1, [2, 3]]])
    expect(T.locatedWhole(lu, u, tr, { held: true }).ok).toBe(true)
    // (without the file's lines, as the hybrid's 'ph' reads a unit, nothing is held: LOST as before)
    expect(T.locatedWhole(lu, u, tr).why).toBe('lost')
  })
  it('covers no display at an edge of the unit, nor where runs and groups do not pair or a found display is off its run', () => {
    const tr2 = [[0, 'a'], [1, 1], [0, 'c'], [1, 3]]
    // a LOST display after the unit's last words: no text line after it
    expect(T.locatedWhole(held(unitOf(lines, [[1, 0, [1, 50, 470, 80, 477, 456]], [3, 32, []]]), [2, 3]), unit(text('a '), ph(display), text(' c '), ph(display)), tr2, { held: true }).why).toBe('lost')
    // two runs for one display (or a held line that is no display's)
    const two = held(unitOf(lines, [[1, 32, []]]), [1, 3])
    expect(T.displayCover(two, unit(text('a '), ph(display), text(' c')), [-1, 1, -1]).size).toBe(0)
    // a found display beside the LOST one, its segments on no held line: the pairing is not the file's
    const pieces = [text('a '), ph(display), text(' b '), ph(display), text(' c')], kOf = [-1, 1, -1, 3, -1]
    const off = held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 0, [1, 50, 500, 80, 507, 498]], [3, 32, []]]), [2, 4])
    expect(T.displayCover(off, unit(...pieces), kOf).size).toBe(0)
    const on = held(unitOf([L(500), L(488), L(470), L(458), L(440), L(428)], [[1, 0, [1, 50, 470, 80, 477, 468]], [3, 32, []]]), [2, 4])
    expect([...T.displayCover(on, unit(...pieces), kOf)]).toEqual([[1, [2]], [3, [4]]])
  })
  it("reads it as kept, a break: the text before it on the lines above it, the text after below, none on its rows", () => {
    const lu = held(unitOf(lines, [[1, 32, []]]), [2, 3])
    const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph(display), text(' \u4E59')] } as never
    const t = T.texRects(lu)
    const page = [...item('a b', 10, 500, 10, 0), ...item('c', 10, 488, 10, 1), ...item('x=1', 60, 470, 10, 2, math), ...item('(1)', 180, 458, 10, 3), ...item('d', 10, 440, 10, 4)]
    const prep = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    const r = prep.get(1)
    expect(r?.mode).toBe('kept')
    expect(prep.referenced.has(r?.region as number)).toBe(true)
    const blocks = L2.blocks2(t.rects as never, [[0, 0, 612, 792]], new Set(prep.keep), prep.lineInfo, prep.regionOf, prep.referenced)
    expect(blocks.map(b => [b.B, b.after])).toEqual([[[500, 488], 0], [[440], 1]])
    const word = (n: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {} })
    const P = { ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0 }
    const l = L2.layoutUnit2([word(30), { space: true, w100: 25 }, word(30), { blockTo: r?.region, w100: 0 }, word(30)] as never, blocks as never, 10, P as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => [x.baseline, x.items.filter(it => it.t.s).length])).toEqual([[500, 1], [488, 1], [440, 1]])
    // (refused whole where the text before it does not fit above it, as a unit is: never run on past it in order)
    expect(L2.layoutUnit2([word(30), { space: true, w100: 25 }, word(30), { space: true, w100: 25 }, word(30), { blockTo: r?.region, w100: 0 }, word(30)] as never, blocks as never, 10, { ...P, floor: 1, order: [] } as never).clipped).toBe(true)
  })
})

describe("the file's lines as v0's rectangles", () => {
  it('each across its ink, in an anchors band from its exact baseline, up to the pages shown', () => {
    const { rects, exact, lineOf } = T.texRects(unitOf([[1, 10, 200, 100, 109.5, 89, 10, 0], [1, 10, 150, 88, 95, 85, 10, 0], [2, 10, 200, 700, 707, 697, 10, 0]]), 1)
    expect(rects).toEqual([[1, 10, 97.85, 200, 106.83], [1, 10, 85.85, 150, 94.83]])
    const second = rects[1] as (typeof rects)[number]
    expect(exact.get(second)).toEqual({ baseline: 88, size: 10 })
    expect(lineOf.get(second)).toBe(1)
  })
  it("owns the page's characters by their baselines, scripts and all, within the line's ink", () => {
    const rects = [[1, 10, 97.85, 40, 106.83], [1, 10, 85.85, 40, 94.83]] as never as number[][]
    const exact = new Map([[rects[0], { baseline: 100, size: 10 }], [rects[1], { baseline: 88, size: 10 }]])
    const page = [...item('ab', 10, 100, 10, 0), ...item('2', 20, 103.6, 7, 1), ...item('cd', 10, 88, 10, 2), ...item('z', 60, 100, 10, 3)]
    const uc = L2.charsOfUnit2(rects as never, [page as never], new Map(), exact as never)
    const on = (r: number) => uc.filter(c => !c.sep && !c.space && (c as { rect: number[] }).rect[1] === rects[r]?.[2]).map(c => c.ch).join('')
    expect(on(0)).toBe('ab2')
    expect(on(1)).toBe('cd')
  })
})

describe("a placeholder's rendering by its segments", () => {
  const uc = (): never => {
    // the line above holds a space over the formula's last glyphs; the formula's big operator stands on that line in v0's
    // reading (its origin above its glyph)
    const above = item('q x', 30, 112, 10, 0).map(c => ({ ...c, page: 1, rect: [10, 109.85, 60, 118.83] }))
    const sum = { ...item('P', 20, 106.5, 10, 1, math)[0], page: 1, rect: [10, 109.85, 60, 118.83] }
    const sep = { ch: ' ', page: 1, x0: 60, x1: 60, yb: 109.85, size: 0, rect: [10, 109.85, 60, 118.83], sep: true }
    const f = item('q=k', 25, 100, 10, 2, math).map(c => ({ ...c, page: 1, rect: [10, 97.85, 60, 106.83] }))
    const after = item(' and', 40, 100, 10, 3).map(c => ({ ...c, page: 1, rect: [10, 97.85, 60, 106.83] }))
    return [...above.slice(0, 1), sum, ...above.slice(1), sep, ...f, ...after] as never
  }
  it("takes the unit's characters inside them on their line, and the breaks between them, never the line above's spaces", () => {
    const g = T.renderingOf(Float64Array.from([1, 19.5, 100, 40.5, 108, 97]), uc(), false)
    expect(g?.chars.map(c => c.ch).join('')).toBe('Pq=k')
    expect(g?.box).toEqual({ x0: 19.5, x1: 40.5, top: 108, bottom: 97, baseline: 100, lines: 1 })
  })
  it('a display anywhere in its rows; none found is none, but for a display, whose rows the unit may not hold', () => {
    expect(T.renderingOf(Float64Array.from([1, 70, 100, 80, 108, 97]), uc(), false)).toBeNull()
    expect(T.renderingOf(Float64Array.from([1, 70, 100, 80, 108, 97]), uc(), true)?.chars).toEqual([])
  })
})

describe("v0's reading with the file's renderings", () => {
  // "Each value ² is squared here": a superscript alone, raised 3.6 pt over the line's baseline
  const page = [...item('Each value', 10, 100, 10, 0), ...item('2', 62, 103.6, 7, 1), ...item('is squared here', 70, 100, 10, 2)]
  const unit = { kind: 'para', src: 'Each value is squared here', pieces: [{ t: 'text', s: '\u6BCF\u4E2A\u503C ' }, { t: 'ph', src: '$^{2}$' }, { t: 'text', s: ' \u5E73\u65B9' }] } as never
  const rect = [1, 10, 97.85, 145, 106.83]
  it("crops a formula across its ink and on its line's baseline, so that its raise is kept, and within its glyphs' boxes", () => {
    const lu = unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]])
    const parts = T.texParts(lu, [-1, 1, -1], { use: 'ph' })
    const tex = L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never, null, parts as never).get(1)
    expect(tex?.mode).toBe('crop')
    expect(tex?.baseline).toBe(100)
    expect(tex?.crop?.[0]).toBeCloseTo(61.4)
    expect(tex?.crop?.[3]).toBeCloseTo(107.8)
    // v0's own (step 3): on its line's measured baseline too, a crop all script having no glyph of the line's size; by its
    // characters' own baseline, as before, the superscript was set on the line's and lost its raise
    const v0 = L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never).get(1)
    expect(v0?.mode).toBe('crop')
    expect(v0?.baseline).toBe(100)
  })
  it("sets a crop by its segment's box and its line's baseline, never by its glyphs' origins (a radical's is its bar)", () => {
    // "scaled by √d": the text layer gives √ its origin at its bar, 7.7 pt over the line's baseline, and d on the line
    const pg = [...item('scaled by', 10, 100, 10, 0), { ...item('\u221A', 52, 107.7, 10, 1, math)[0] }, ...item('d', 58, 100, 10, 2, math), ...item(' here', 64, 100, 10, 3)]
    const u = { kind: 'para', src: 'scaled by here', pieces: [{ t: 'text', s: '\u7F29\u653E ' }, { t: 'ph', src: '$\\sqrt{d}$' }, { t: 'text', s: ' \u8FD9\u91CC' }] } as never
    const lu = unitOf([[1, 10, 90, 100, 108, 97, 10, 0]], [[1, 0, [1, 51.8, 100, 63.4, 108.6, 97.6]]])
    const r = L2.prepareUnit(u, [rect.slice()] as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'ph' }) as never).get(1)
    expect(r?.mode).toBe('crop')
    expect(r?.baseline).toBe(100)
    for (const [i, v] of [51.4, 97.3, 63.8, 108.9].entries()) expect(r?.crop?.[i]).toBeCloseTo(v, 6)
  })
  it("grows a crop v0 reads over the ink it touches, and one cut from the file's segment never", () => {
    const toDev = (x: number, y: number): [number, number] => [x * 2, (200 - y) * 2]
    const ink = { w: 100, h: 100, ink: new Uint8Array(100 * 100).fill(1), factor: 4 }
    // another formula's subscript just over the crop's top
    const above = [{ ...item('i', 22, 109.4, 7, 9, math)[0] }]
    const grow = (box: boolean) => {
      const r = { crop: [20, 98, 30, 108], gap: { chars: [], ...(box ? { box: { x0: 20, x1: 30, baseline: 100, lines: 1 } } : {}) } }
      L2.growCrop(r as never, ink, toDev, 2, above as never)
      return r.crop[3]
    }
    expect(grow(false)).toBeGreaterThan(108)
    expect(grow(true)).toBe(108)
  })
})

describe("each crop the hybrid draws cut from its placeholder's own ink", () => {
  const page = [...item('Each value', 10, 100, 10, 0), ...item('2', 62, 103.6, 7, 1), ...item('is squared here', 70, 100, 10, 2)]
  const unit = { kind: 'para', src: 'Each value is squared here', pieces: [{ t: 'text', s: '\u6BCF\u4E2A\u503C ' }, { t: 'ph', src: '$^{2}$' }, { t: 'text', s: ' \u5E73\u65B9' }] } as never
  const rect = [1, 10, 97.85, 145, 106.83]
  const read = (lu: never | null, kOf: number[] | null) => L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never, null, { crops: T.cropsOf(lu, kOf) } as never)
  it("v0's crop takes the segment of its placeholder's row that it meets, and that segment's baseline", () => {
    const r = read(unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]]), [-1, 1, -1])
    expect(r.unproven).toBeUndefined()
    for (const [i, v] of [61.4, 100.7, 66, 107.8].entries()) expect(r.get(1)?.crop?.[i]).toBeCloseTo(v, 6)
    expect(r.get(1)?.baseline).toBe(100)
    expect((r.get(1)?.gap as { box?: unknown })?.box).toBeTruthy()
  })
  it('a crop no segment proves: its row LOST, its segment elsewhere, its unit not in the file, its pieces not the file\'s', () => {
    const line = [1, 10, 145, 100, 108, 97, 10, 0]
    expect(read(unitOf([line], [[1, 32, []]]), [-1, 1, -1]).unproven).toBe(1)
    expect(read(unitOf([line], [[1, 0, [1, 120, 100, 130, 107.5, 101]]]), [-1, 1, -1]).unproven).toBe(1)
    expect(read(null, null).unproven).toBe(1)
    expect(read(unitOf([line], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]]), null).unproven).toBe(1)
  })
})

describe('the state units share, which a unit the file locates teaches as v0 does', () => {
  it("a citation found by its segments is learnt for the paper: a unit laid after it draws the same key's citation not found", () => {
    const page = [...item('as shown in', 10, 100, 10, 0), ...item('[12]', 70, 100, 10, 1), ...item('before', 95, 100, 10, 2)]
    const unit = { kind: 'para', src: 'as shown in before', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\cite{smith2019}' }, { t: 'text', s: ' \u6240\u793A' }] } as never
    const lu = unitOf([[1, 10, 125, 100, 108, 97, 10, 0]], [[1, 0, [1, 70, 100, 90, 108, 97]]])
    const citeMap = new Map() as never as Map<string, string>
    const r = L2.prepareUnit(unit, [[1, 10, 97.85, 125, 106.83]] as never, [page as never], citeMap as never, null, T.texParts(lu, [-1, 1, -1], { use: 'ph' }) as never).get(1)
    expect(r?.mode).toBe('orig-text')
    expect(r?.text).toBe('[12]')
    expect(citeMap.get('smith2019')).toBe('12')
    // a later unit whose citation of the same key is nowhere found draws it from what was learnt
    const later = { kind: 'para', src: 'again', pieces: [{ t: 'text', s: '\u518D ' }, { t: 'ph', src: '\\cite{smith2019}' }] } as never
    const again = L2.prepareUnit(later, [[1, 10, 85.85, 60, 94.83]] as never, [item('again', 10, 88, 10, 3) as never], citeMap as never).get(1)
    expect(again).toMatchObject({ mode: 'cite-map', text: '[12]' })
  })
})

describe("the file's baselines in v0's blocks", () => {
  it('an evenly set block of file baselines takes its mean gap, which their rounding to a hundredth does not move', () => {
    const rects = [0, 1, 2, 3].map(i => [1, 10, 97.85 - 11.955 * i, 200, 106.83 - 11.955 * i])
    const B = [100, 88.05, 76.09, 64.14]
    const info = new Map(rects.map((r, i) => [`${r[0]}|${r.slice(1).join()}`, { baseline: B[i], size: 10, exact: true, file: true }]))
    expect(L2.blocks2(rects as never, [[0, 0, 612, 792]], null, info as never)[0]?.pitch0).toBeCloseTo((100 - 64.14) / 3, 6)
  })
})

describe('the erase of a line of several boxes', () => {
  it('erases each, the last to its block\'s edge where the line is not the block\'s last', () => {
    const blocks = [{ page: 1, x1: 300, rects: [[1, 10, 98, 200, 107], [1, 10, 86, 150, 95]] }]
    const extents = new Map([['1,10,98,200,107', [[10, 98, 60, 107], [80, 98, 200, 107]]]])
    const ops = L2.unitOps({ lines: [], scale: 1 } as never, blocks as never, 1, { px: (x: number, y: number) => [x, -y], k: 1, hasSource: () => false, pxOf: () => (x: number, y: number) => [x, -y], extents: extents as never })
    const boxes = ops.filter(o => o.op === 'erase').map(o => (o as { box: number[] }).box)
    expect(boxes.length).toBe(3)
    const [first, second] = boxes as [number[], number[]]
    expect(first[0]).toBeCloseTo(9.7)
    expect((first[0] ?? 0) + (first[2] ?? 0)).toBeCloseTo(61.8)
    expect((second[0] ?? 0) + (second[2] ?? 0)).toBeCloseTo(301.8)
  })
})
