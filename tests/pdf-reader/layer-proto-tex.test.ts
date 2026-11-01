import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { indexLayout, PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { makeLayout } from '@/pdf-reader/engine/layout/make.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'
import { arxivOf, marksOf, ph as phPiece, type Run, text as textPiece, unit as unitPiece, type World } from './helpers/make-world'

// The layout file as the layer's only source of a unit (layer-proto/tex.mjs): the per-unit reading with its parts from the
// file, for a unit the file locates whole (a unit it does not hold, or one with a visible piece it has no position for, is the
// original's). The drawing is measured by the layer gate (--engine-kind=proto --proto-tex); these are the parts' rules, on
// made-up pages.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
beforeAll(async () => {
  // layer2.mjs measures with a canvas made when it loads; the test environment's draws nothing (its context is null), and
  // these rules measure nothing but a laid line's ink (lineExtent: 0.7 of the size over its baseline, 0.2 under)
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
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

describe('whether the layout file locates a unit whole', () => {
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
  it('fails a unit the file does not hold, a drawn placeholder LOST or with no row', () => {
    const found = [1, 0, [1, 20, 100, 25, 107, 98]] as [number, number, number[]], sym = [3, 0, [1, 40, 100, 45, 107, 98]] as [number, number, number[]]
    expect(T.locatedWhole(null, unit, tr).why).toBe('unlocated')
    expect(T.locatedWhole(unitOf([line, [1, 10, 100, 110, 117, 108, 10, 0]], [found, sym]), unit, tr).ok).toBe(true)
    expect(T.locatedWhole(unitOf([line], [[1, 32, []], sym]), unit, tr).why).toBe('lost')
    // (one TeX set no ink for, EMPTY, is drawn as nothing: it needs no position)
    expect(T.locatedWhole(unitOf([line], [[1, PH_FLAG.EMPTY, []], sym]), unit, tr).ok).toBe(true)
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

describe('a displayed formula the file has no position for', () => {
  // a unit of text, a display, text: lines 0 and 1 its text, 2 and 3 the display's rows (held: no source word), 4 text
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const display = '\\begin{equation}x=1\\end{equation}'
  const u = { kind: 'para', src: 'a b c', pieces: [{ t: 'text', s: 'a b ' }, { t: 'ph', src: display }, { t: 'text', s: ' c' }] } as never
  const tr = [[0, 'a'], [1, 1], [0, 'c']]
  it('is not covered by the held lines that stand where it is: its unit is the original\'s', () => {
    const lost = { ...(unitOf([L(500), L(488), L(470), L(458), L(440)], [[1, PH_FLAG.LOST, []]]) as object), held: [2, 3] } as never
    expect(T.locatedWhole(lost, u, tr)).toEqual({ ok: false, why: 'lost' })
    const none = { ...(unitOf([L(500), L(488), L(470), L(458), L(440)], []) as object), held: [2, 3] } as never
    expect(T.locatedWhole(none, u, tr)).toEqual({ ok: false, why: 'no row' })
  })
  it('is found where its row holds segments, its rows among the held lines', () => {
    const found = { ...(unitOf([L(500), L(488), L(470), L(458), L(440)], [[1, 0, [1, 50, 470, 80, 477, 456]]]) as object), held: [2, 3] } as never
    expect(T.locatedWhole(found, u, tr)).toMatchObject({ ok: true })
  })
})

describe("the file's lines as v0's rectangles", () => {
  it('each across its ink, in an anchors band from its exact baseline, up to the pages shown', () => {
    const { rects, exact, lineOf } = T.texRects(unitOf([[1, 10, 200, 100, 109.5, 89, 10, 0], [1, 10, 150, 88, 95, 85, 10, 0], [2, 10, 200, 700, 707, 697, 10, 0]]), 1)
    expect(rects).toEqual([[1, 10, 97.85, 200, 106.83], [1, 10, 85.85, 150, 94.83]])
    const second = rects[1] as (typeof rects)[number]
    expect(exact.get(second)).toEqual({ baseline: 88, size: 10, top: 95, bottom: 85 })
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
    const segs = Float64Array.from([1, 19.5, 100, 40.5, 108, 97])
    const g = T.renderingOf(segs, uc(), false)
    expect(g?.chars.map(c => c.ch).join('')).toBe('Pq=k')
    // (its box, and the segments it holds: a formula broken over lines is cropped by them)
    expect(g?.box).toEqual({ x0: 19.5, x1: 40.5, top: 108, bottom: 97, baseline: 100, lines: 1, segs })
  })
  it('a display anywhere in its rows; none found is none, but for a display, whose rows the unit may not hold', () => {
    expect(T.renderingOf(Float64Array.from([1, 70, 100, 80, 108, 97]), uc(), false)).toBeNull()
    expect(T.renderingOf(Float64Array.from([1, 70, 100, 80, 108, 97]), uc(), true)?.chars).toEqual([])
  })
})

describe("the unit's reading with the file's renderings", () => {
  // "Each value ² is squared here": a superscript alone, raised 3.6 pt over the line's baseline
  const page = [...item('Each value', 10, 100, 10, 0), ...item('2', 62, 103.6, 7, 1), ...item('is squared here', 70, 100, 10, 2)]
  const unit = { kind: 'para', src: 'Each value is squared here', pieces: [{ t: 'text', s: '\u6BCF\u4E2A\u503C ' }, { t: 'ph', src: '$^{2}$' }, { t: 'text', s: ' \u5E73\u65B9' }] } as never
  it("crops a formula across its ink and on its line's baseline, so that its raise is kept, and within its glyphs' boxes", () => {
    const lu = unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]])
    const t = T.texRects(lu)
    const tex = L2.prepareUnit(unit, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never).get(1)
    expect(tex?.mode).toBe('crop')
    expect(tex?.baseline).toBe(100)
    expect(tex?.crop?.[0]).toBeCloseTo(61.4)
    expect(tex?.crop?.[3]).toBeCloseTo(107.8)
  })
  it("sets a crop by its segment's box and its line's baseline, never by its glyphs' origins (a radical's is its bar)", () => {
    // "scaled by √d": the text layer gives √ its origin at its bar, 7.7 pt over the line's baseline, and d on the line
    const pg = [...item('scaled by', 10, 100, 10, 0), { ...item('\u221A', 52, 107.7, 10, 1, math)[0] }, ...item('d', 58, 100, 10, 2, math), ...item(' here', 64, 100, 10, 3)]
    const u = { kind: 'para', src: 'scaled by here', pieces: [{ t: 'text', s: '\u7F29\u653E ' }, { t: 'ph', src: '$\\sqrt{d}$' }, { t: 'text', s: ' \u8FD9\u91CC' }] } as never
    const lu = unitOf([[1, 10, 90, 100, 108, 97, 10, 0]], [[1, 0, [1, 51.8, 100, 63.4, 108.6, 97.6]]])
    const t = T.texRects(lu)
    const r = L2.prepareUnit(u, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never).get(1)
    expect(r?.mode).toBe('crop')
    expect(r?.baseline).toBe(100)
    for (const [i, v] of [51.4, 97.3, 63.8, 108.9].entries()) expect(r?.crop?.[i]).toBeCloseTo(v, 6)
  })
  it("takes a gap's piece no placeholder took for the unit's text where the file knows each placeholder's ink", () => {
    // "Each value 2 old is squared here": three letters the alignment does not take (a hyphenated word's tail), beside
    // the superscript the file's segment holds
    const pg = [...item('Each value', 10, 100, 10, 0), ...item('2', 62, 103.6, 7, 1), ...item('old', 70, 100, 10, 2), ...item('is squared here', 88, 100, 10, 3)]
    const keys = pg.filter(c => /[old]/.test(c.ch) && c.item === 2).map(c => `1|${c.item}|${c.k}`)
    const lu = unitOf([[1, 10, 160, 100, 108, 97, 10, 0]], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]])
    const t = T.texRects(lu)
    const withFile = L2.prepareUnit(unit, t.rects as never, [pg.map(c => ({ ...c, page: 1 })) as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
    expect(withFile.inkKnown).toBe(true)
    expect(keys.map(k => withFile.cat.get(k))).toEqual(['acc', 'acc', 'acc'])
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

describe("each crop the layer draws cut from its placeholder's own ink", () => {
  const page = [...item('Each value', 10, 100, 10, 0), ...item('2', 62, 103.6, 7, 1), ...item('is squared here', 70, 100, 10, 2)]
  const unit = { kind: 'para', src: 'Each value is squared here', pieces: [{ t: 'text', s: '\u6BCF\u4E2A\u503C ' }, { t: 'ph', src: '$^{2}$' }, { t: 'text', s: ' \u5E73\u65B9' }] } as never
  const read = (lu: never) => {
    const t = T.texRects(lu)
    return L2.prepareUnit(unit, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
  }
  it("a crop takes the segment of its placeholder's row, and that segment's baseline", () => {
    const r = read(unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [1, 61.8, 100, 65.6, 107.5, 101]]]))
    expect(r.unproven).toBeUndefined()
    for (const [i, v] of [61.4, 100.7, 66, 107.8].entries()) expect(r.get(1)?.crop?.[i]).toBeCloseTo(v, 6)
    expect(r.get(1)?.baseline).toBe(100)
    expect((r.get(1)?.gap as { box?: unknown })?.box).toBeTruthy()
  })
  it("a rendering in its own brackets, the translation setting its own, keeps the segment's box clipped between them", () => {
    // "(x+y)" on the page, the source's own round brackets inside the translation's: its crop is the segment's ink
    // between the brackets, on the segment's baseline, never estimated from the text layer's characters
    const pg = [...item('see', 10, 100, 10, 0), ...item('(x+y)', 60, 100, 10, 1, math), ...item('here', 90, 100, 10, 2)]
    const u = { kind: 'para', src: 'see here', pieces: [{ t: 'text', s: '\u5F0F\uFF08' }, { t: 'ph', src: '$(x+y)$' }, { t: 'text', s: '\uFF09\u6240\u793A' }] } as never
    const lu = unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [1, 60, 100, 85, 108, 97]]])
    const t = T.texRects(lu)
    const r = L2.prepareUnit(u, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'crop', baseline: 100 })
    for (const [i, v] of [64.6, 96.7, 80.4, 108.3].entries()) expect(r.get(1)?.crop?.[i]).toBeCloseTo(v, 6)
    expect((r.get(1)?.gap as { box?: unknown; unbracketed?: boolean })).toMatchObject({ unbracketed: true, box: { x0: 65, x1: 80, top: 108, bottom: 97 } })
  })
  it('a crop of a segment no character of the unit stands in is the segment\'s own ink; a row LOST has none, and its unit is the original\'s', () => {
    const line = [1, 10, 145, 100, 108, 97, 10, 0]
    expect(read(unitOf([line], [[1, 32, []]])).unproven).toBe(1)
    const elsewhere = read(unitOf([line], [[1, 0, [1, 120, 100, 130, 107.5, 101]]]))
    expect(elsewhere.unproven).toBeUndefined()
    expect(elsewhere.get(1)).toMatchObject({ mode: 'crop', baseline: 100 })
  })
})

describe("a placeholder drawn from its row's segments, or the unit the original's (cropsOf)", () => {
  const page = [...item('as shown in', 10, 100, 10, 0), ...item('[12]', 70, 100, 10, 1), ...item('before', 95, 100, 10, 2)]
  const cite = { kind: 'para', src: 'as shown in before', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\cite{smith2019}' }, { t: 'text', s: ' \u6240\u793A' }] } as never
  const line = [1, 10, 125, 100, 108, 97, 10, 0]
  const read = (lu: never, unit = cite, pg: object[] = page) => {
    const t = T.texRects(lu)
    return L2.prepareUnit(unit, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1, 3, 4], { lines: t }) as never)
  }
  it("page text of a placeholder is drawn where its characters stand in its row's segments", () => {
    const r = read(unitOf([line], [[1, 0, [1, 70, 100, 90, 108, 97]]]))
    expect(r.get(1)?.mode).toBe('orig-text')
    expect(r.unproven).toBeUndefined()
  })
  it('and its segments\' own ink where they hold none of the unit\'s characters; its row LOST, the unit is the original\'s', () => {
    const elsewhere = read(unitOf([line], [[1, 0, [1, 200, 100, 220, 108, 97]]]))
    expect(elsewhere.unproven).toBeUndefined()
    expect(elsewhere.get(1)).toMatchObject({ mode: 'crop', page: 1, baseline: 100 })
    expect(read(unitOf([line], [[1, 32, []]])).unproven).toBe(1)
  })
  it("a rendering from its source (a citation with no row) is no drawing; TeX's own nothing and a text symbol are", () => {
    const none = { kind: 'para', src: 'as shown in before', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\cite{nobody}' }, { t: 'text', s: ' ' }, { t: 'ph', src: '\\%' }, { t: 'ph', src: '~' }] } as never
    const bare = [...item('as shown in', 10, 100, 10, 0), ...item('before', 95, 100, 10, 2)]
    const r = read(unitOf([line], []), none, bare)
    expect(r.get(1)?.mode).toBe('source')
    expect(r.unproven).toBe(1)
    const sym = { kind: 'para', src: 'as shown', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\%' }, { t: 'ph', src: '~' }] } as never
    expect(read(unitOf([line], []), sym, bare).unproven).toBeUndefined()
  })
})

describe('a display group and a piece outside the unit\'s lines (JOINED, OUTSIDE: LAYOUT 6)', () => {
  // a unit of text, two displays with nothing between them, text: lines 0 and 1 its text, 2 and 3 the displays' rows
  // (held), 4 text; the first display's segments hold the group's ink, the second is JOINED
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const lines = [L(500), L(488), L(470), L(458), L(440)]
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const D = '\\begin{equation}x=1\\end{equation}', E = '\\begin{equation}y=2\\end{equation}'
  const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph(D), text(' '), ph(E), text(' \u4E59')] } as never
  const tr = [[0, '\u7532 '], [1, 1], [0, ' '], [1, 3], [0, ' \u4E59']]
  const kOf = [-1, 1, -1, 3, -1]
  const fileUnit = (second: number, first = [1, 50, 470, 80, 477, 456]) => {
    const lu = unitOf(lines, [[1, 0, first], [3, second, []]]) as { ph: Map<number, { kind: string }> }
    for (const k of [1, 3]) { const row = lu.ph.get(k); if (row) row.kind = 'display' }
    return { ...lu, held: [2, 3] } as never
  }
  it('a JOINED display is located with its group, which a LOST one is not', () => {
    expect(T.locatedWhole(fileUnit(PH_FLAG.JOINED), u, tr).ok).toBe(true)
    // the control: the later display LOST, not JOINED. After a found display, one the maker did not JOIN has a point of its
    // own, so it is a group of its own, and with no position the unit is the original's
    expect(T.locatedWhole(fileUnit(PH_FLAG.LOST), u, tr).why).toBe('lost')
  })
  it('reads as its group: kept, the same region as the first, a break the text after them starts below', () => {
    const lu = fileUnit(PH_FLAG.JOINED)
    const t = T.texRects(lu)
    const page = [...item('a b', 10, 500, 10, 0), ...item('c', 10, 488, 10, 1), ...item('x=1', 60, 470, 10, 2, math), ...item('y=2', 60, 458, 10, 3, math), ...item('d', 10, 440, 10, 4)]
    const prep = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, kOf, { lines: t }) as never)
    expect(prep.unproven).toBeUndefined()
    const r1 = prep.get(1), r3 = prep.get(3)
    expect([r1?.mode, r3?.mode]).toEqual(['kept', 'kept'])
    expect(r3?.region).toBe(r1?.region)
    const blocks = L2.blocks2(t.rects as never, [[0, 0, 612, 792]], new Set(prep.keep), prep.lineInfo, prep.regionOf, prep.referenced)
    expect(blocks.map(b => [b.B, b.after])).toEqual([[[500, 488], 0], [[440], 1]])
  })
  it('a LOST piece outside the unit\'s lines is located, and drawn as nothing', () => {
    const head = { kind: 'para', src: 'a b c', pieces: [ph('\\url{http://x.org}'), text(' a b c')] } as never
    const lu = unitOf([L(500)], [[0, PH_FLAG.LOST | PH_FLAG.OUTSIDE, []]]) as never
    expect(T.locatedWhole(lu, head, [[1, 0], [0, ' a b c']]).ok).toBe(true)
    const t = T.texRects(lu)
    const prep = L2.prepareUnit(head, t.rects as never, [item('a b c', 60, 500, 10, 0) as never], new Map() as never, null, T.texParts(lu, [0, -1], { lines: t }) as never)
    expect(prep.get(0)).toMatchObject({ mode: 'none', text: '' })
    expect(prep.unproven).toBeUndefined()
  })
})

describe("a piece past the pages shown, and fix 4 (the LOST round's review, 2026-10-15)", () => {
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const D = '\\begin{equation}x=1\\end{equation}'
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 }
  const drawn = (u: never, prep: never) => L2.tokensOf2(u, prep, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 0).filter(t => typeof t.s === 'string').map(t => t.s).join('')
  it('a found row whose segments all lie past the pages shown is drawn as its page text, never "?"', () => {
    const u = { kind: 'para', src: 'in Section here', pieces: [text('\u5728\u7B2C '), ph('\\ref{sec:x}'), text(' \u8282')] } as never
    const lu = unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], [[1, 0, [13, 181.41, 568.58, 196.87, 575.95, 568.43]]]) as { ph: Map<number, { text?: string }> }
    const row = lu.ph.get(1)
    if (row) row.text = 'C.1'
    const t = T.texRects(lu as never)
    const read = (shown: number) => L2.prepareUnit(u, t.rects as never, [item('in here', 10, 100, 10, 0) as never], new Map() as never, null, T.texParts(lu as never, [-1, 1, -1], { lines: t, shown }) as never)
    const r = read(12)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'source', text: 'C.1' })
    // with its page shown, not so: its characters are read there, and here none is: its ink is the segment's, a crop
    expect(read(13).get(1)).toMatchObject({ mode: 'crop', page: 13 })
  })
  it('a piece the file draws as nothing (OUTSIDE) is never handed a rendering of the page\'s text', () => {
    const head = { kind: 'para', src: 'alpha beta gamma', pieces: [ph(D), text(' alpha beta gamma')] } as never
    const lu = unitOf([L(500)], [[0, PH_FLAG.LOST | PH_FLAG.OUTSIDE, []]]) as { ph: Map<number, { kind: string }> }
    const row = lu.ph.get(0)
    if (row) row.kind = 'display'
    const t = T.texRects(lu as never)
    // a run of the line no source word takes, the display's own text: what a guess would hand it (kept, and the unit then
    // unproven)
    const prep = L2.prepareUnit(head, t.rects as never, [[...item('alpha beta gamma', 12, 500, 10, 0), ...item('x=1', 120, 500, 10, 9, math)] as never], new Map() as never, null, T.texParts(lu as never, [0, -1], { lines: t }) as never)
    expect(prep.get(0)).toMatchObject({ mode: 'none', inPlace: true })
    expect(prep.unproven).toBeUndefined()
  })
  it("fix 4: a mark that may not start a line opening the text after a display is dropped, unless the original's line opens with one", () => {
    const lines = [L(500), L(488), L(470), L(458), L(440)]
    const lu = { ...(unitOf(lines, [[1, 0, [1, 50, 470, 80, 477, 456]]]) as object), held: [2, 3] } as unknown as { ph: Map<number, { kind: string }> }
    const row = lu.ph.get(1)
    if (row) row.kind = 'display'
    const t = T.texRects(lu as never)
    const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph(D), text('\uFF0C\u4E59')] } as never
    const page = (after: string) => [...item('a b', 10, 500, 10, 0), ...item('c', 10, 488, 10, 1), ...item('x=1', 60, 470, 10, 2, math), ...item('(1)', 180, 458, 10, 3), ...item(after, 10, 440, 10, 4)]
    const prep = (after: string) => L2.prepareUnit(u, t.rects as never, [page(after) as never], new Map() as never, null, T.texParts(lu as never, [-1, 1, -1], { lines: t }) as never)
    expect(drawn(u, prep('where d') as never)).toBe('\u7532\u4E59')
    // the original's own line after the display opens with a comma: kept
    expect(drawn(u, prep(', where d') as never)).toBe('\u7532\uFF0C\u4E59')
  })
})

describe("page text no Unicode stands for, and a held line's own mark (the LOST round's images, 2026-10-15)", () => {
  const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 }
  const drawn = (u: never, prep: never) => L2.tokensOf2(u, prep, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 0).filter(t => typeof t.s === 'string').map(t => t.s).join('')
  it("reads the characters a font's own map gives its glyphs, and marks a character it maps none to", () => {
    const set = L2.mappedOf({ _map: ['a', undefined, '\uFB01', '\u{1D454}'] })
    // (each as written and as the text layer normalises it: the ligature's letters, the math italic's g)
    expect([...(set ?? [])].sort()).toEqual(['a', 'f', 'g', 'i', '\uFB01', '\u{1D454}'].sort())
    expect(L2.mappedOf({ firstChar: 0, lastChar: 255 })).toBeNull()
    expect(L2.mappedOf(undefined)).toBeNull()
    const f8 = new Set(['g', '='])
    expect(['g', ' ', '=', '\u00CD'].map(ch => L2.unmapped(ch, f8))).toEqual([false, false, false, true])
    // a font with no map to read: only a character no Unicode stands for (private use, replacement, control)
    expect(['a', '\uE001', '\uFFFD', '\u0001', ' '].map(ch => L2.unmapped(ch, null))).toEqual([false, true, true, true, false])
  })
  it("reads each font's map from the pinned PDF.js opened with PDF_OPTIONS (its private `_map`), and refuses a font exported without it", async () => {
    // the CC0 sample paper's page 1, its fonts as PDF.js's commonObjs holds them once the page's operators are read
    const { PDF_OPTIONS } = await import('@/pdf-reader/engine/layer-proto/run.mjs')
    const data = new Uint8Array(readFileSync(join(process.cwd(), 'tests/fixtures/pdf/sample-1/sample-1.pdf')))
    const fontsOf = async (options: object) => {
      const task = getDocument({ data: data.slice(), verbosity: 0, ...options })
      try {
        const page = await (await task.promise).getPage(1)
        const ops = await page.getOperatorList()
        const names = new Set<string>()
        ops.fnArray.forEach((fn, i) => { if (fn === OPS.setFont) names.add(String((ops.argsArray[i] as unknown[])[0])) })
        return [...names].map(n => page.commonObjs.get(n) as { name: string; isType3Font: boolean })
      } finally {
        await task.destroy()
      }
    }
    const fonts = await fontsOf(PDF_OPTIONS)
    expect(fonts.length).toBeGreaterThan(3)
    for (const f of fonts) {
      expect(f.isType3Font).toBe(false)
      expect(L2.fontMappedOf(f)?.size, f.name).toBeGreaterThan(0)
    }
    // (CMR10's map gives its letters, CMMI10's the math italic's)
    expect(L2.fontMappedOf(fonts.find(f => /CMR10$/.test(f.name)))?.has('a')).toBe(true)
    // the same document opened without the font's extra properties: no map exported, which is refused, not read as none
    const bare = await fontsOf({ ...PDF_OPTIONS, fontExtraProperties: false })
    expect(bare.length).toBe(fonts.length)
    for (const f of bare) expect(() => L2.fontMappedOf(f)).toThrow(/PDF_OPTIONS/)
    // a Type3 font, an error PDF.js resolved in a font's place, none: no map to read
    expect(L2.fontMappedOf({ isType3Font: true })).toBeNull()
    expect(L2.fontMappedOf('Error: a font that did not load')).toBeNull()
    expect(L2.fontMappedOf(null)).toBeNull()
  })
  it('page text of a placeholder with a character no Unicode stands for is no proof: a unit the file locates whole crops it', () => {
    // a formula TeX broke over two lines, its sum sign read by its code where `nu`: drawn as its crops, one a line, mapped or
    // not (E3b: never as its page text; layer-proto-formula-crops.test.ts)
    const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph("$g(z')=\\sum_n g_n$"), text(' \u4E59')] } as never
    const lu = unitOf([L(500), L(488)], [[1, 0, [1, 150, 500, 200, 507, 498, 1, 10, 488, 40, 495, 486]]]) as never
    const t = T.texRects(lu)
    const page = (sum: { nu?: boolean }) => [...item('a b', 10, 500, 10, 0), ...item('g=', 150, 500, 10, 1, math), ...item('\u00CD', 10, 488, 10, 2, math).map(c => ({ ...c, ...sum })), ...item('gn', 20, 488, 10, 3, math), ...item('c d', 50, 488, 10, 4)]
    const read = (sum: { nu?: boolean }) => L2.prepareUnit(u, t.rects as never, [page(sum) as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
    for (const sum of [{}, { nu: true }]) {
      expect(read(sum).get(1)).toMatchObject({ mode: 'crop', page: 1, baseline: 500 })
      expect(read(sum).get(1)?.parts?.map(q => q.baseline)).toEqual([500, 488])
      expect(read(sum).unproven).toBeUndefined()
    }
    // on one line (its segments meet across: a formula with a tall operator, its rows as two segments), a crop of their
    // union on the baseline inside it: its ink is TeX's, only its page text cannot be drawn
    const one = unitOf([L(500), L(488)], [[1, 0, [1, 150, 500, 200, 507, 498, 1, 160, 496, 190, 503, 494]]]) as never
    const t1 = T.texRects(one)
    const pg1 = [...item('a b', 10, 500, 10, 0), ...item('g=', 150, 500, 10, 1, math), ...item('\u00CD', 170, 496, 10, 2, math).map(c => ({ ...c, nu: true })), ...item('c d', 10, 488, 10, 4)]
    const r = L2.prepareUnit(u, t1.rects as never, [pg1 as never], new Map() as never, null, T.texParts(one, [-1, 1, -1], { lines: t1 }) as never)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'crop', page: 1, baseline: 500 })
    for (const [n, v] of [149.6, 493.7, 200.4, 507.3].entries()) expect(r.get(1)?.crop?.[n]).toBeCloseTo(v, 6)
    // (cut from its segments, never grown over the ink beside it)
    expect(L2.cropGrows(r.get(1) as never)).toBe(false)
  })
  it("a \\qed box of rules, no character in its segments, is a crop of its ink", () => {
    // 2610.21176's proofs: the box's top rule a segment on the line above, its body on its own line's baseline
    const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph('\\qed')] } as never
    const lu = unitOf([L(500), L(488)], [[1, 0, [1, 180, 500, 186, 495.4, 495, 1, 180, 488, 186, 495.6, 488]]]) as never
    const t = T.texRects(lu)
    const pg = [...item('a b', 10, 500, 10, 0), ...item('c d', 10, 488, 10, 1)]
    const r = L2.prepareUnit(u, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1], { lines: t }) as never)
    expect(r.unproven).toBeUndefined()
    // (one crop: its segments meet across, the rule and the box one ink, on the baseline inside it)
    expect(r.get(1)).toMatchObject({ mode: 'crop', page: 1, baseline: 488 })
    for (const [n, v] of [179.6, 487.7, 186.4, 495.9].entries()) expect(r.get(1)?.crop?.[n]).toBeCloseTo(v, 6)
  })
  it("a mark after a placeholder kept on its held line, where that line shows the original's own, is not drawn again", () => {
    // footnote 1 of 1512.03385: "… and \url{…}." with the URL's line kept (held), its full stop with it
    const u = { kind: 'footnote', src: 'a b', pieces: [text('\u7532 '), ph('\\url{http://x.org/y}'), text('\u3002')] } as never
    const lu = { ...(unitOf([L(500), L(488)], [[1, 0, [1, 10, 488, 80, 495, 486]]]) as object), held: [1] } as never
    const t = T.texRects(lu)
    const prep = (line: string) => L2.prepareUnit(u, t.rects as never, [[...item('a b', 10, 500, 10, 0), ...item(line, 10, 488, 10, 1)] as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
    const shown = prep('http://x.org/y.')
    expect(shown.get(1)).toMatchObject({ mode: 'kept', heldAfter: '.' })
    expect(drawn(u, shown as never)).toBe('\u7532')
    // the held line shows no mark after it: the translation's is drawn
    expect(drawn(u, prep('http://x.org/y') as never)).toBe('\u7532\u3002')
    // as many dropped as the held line shows: one, so the translation's closing quote after its full stop is drawn
    const quoted = { ...(u as object), pieces: [text('\u7532 '), ph('\\url{http://x.org/y}'), text('\u3002\u300D')] } as never
    const one = L2.prepareUnit(quoted, t.rects as never, [[...item('a b', 10, 500, 10, 0), ...item('http://x.org/y.', 10, 488, 10, 1)] as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
    expect(one.get(1)).toMatchObject({ heldAfter: '.', heldMarks: ['.'] })
    expect(drawn(quoted, one as never)).toBe('\u7532\u300D')
    // two the held line shows (".)"): both of the translation's
    const two = L2.prepareUnit(quoted, t.rects as never, [[...item('a b', 10, 500, 10, 0), ...item('http://x.org/y.)', 10, 488, 10, 1)] as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
    expect(two.get(1)).toMatchObject({ heldMarks: ['.', ')'] })
    expect(drawn(quoted, two as never)).toBe('\u7532')
    // a mark is matched, not counted: the line shows only a full stop, the translation opens with ")" and then its full stop
    const paren = { ...(u as object), pieces: [text('\u7532 '), ph('\\url{http://x.org/y}'), text(')\u3002')] } as never
    const dot = L2.prepareUnit(paren, t.rects as never, [[...item('a b', 10, 500, 10, 0), ...item('http://x.org/y.', 10, 488, 10, 1)] as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
    expect(drawn(paren, dot as never)).toBe('\u7532)')
  })
  it('droppedHeld drops each leading mark once for the one of the line it stands for, and keeps the others in order', () => {
    expect(L2.markKind('\u3002')).toBe(L2.markKind('.'))
    expect(L2.markKind('\u300D')).toBe(L2.markKind(')'))
    expect(L2.markKind('\u3002')).not.toBe(L2.markKind(','))
    expect(L2.droppedHeld(')\u3002abc', ['.'])).toBe(')abc')
    expect(L2.droppedHeld('\u3002\u3002abc', ['.'])).toBe('\u3002abc')
    expect(L2.droppedHeld('\u3002\u300Dabc', ['.', ')'])).toBe('abc')
    expect(L2.droppedHeld('abc\u3002', ['.'])).toBe('abc\u3002')
    expect(L2.droppedHeld(' \u3001\u3002 abc', ['.'])).toBe(' \u3001 abc')
  })
})

describe("a formula of no letter or digit is no text symbol: found as any formula is (the controller's ruling of 2026-10-15)", () => {
  // the review's three probes, each drawn from its source as a symbol before ("Σ_α^β", "∫_(-∞)^∞", "α/β")
  const PROBES = ['$\\sum_{\\alpha}^{\\beta}$', '$\\int_{-\\infty}^{\\infty}$', '$\\frac{\\alpha}{\\beta}$']
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  it('a text symbol is one grapheme drawn with none of the marks of a formula\'s structure; the probes are formulas', () => {
    expect(PROBES.map(s => L2.phClass2(s).cls)).toEqual(['symbol', 'symbol', 'symbol'])
    expect(PROBES.map(s => [L2.textSymbol(s), L2.phClassProven(s).cls])).toEqual([[false, 'other'], [false, 'other'], [false, 'other']])
    // (a text source's one grapheme is that character, \\_ the maker's TEXT symbol too)
    expect(['\\%', '\\_', '$\\times$', '$^\\dagger$', '$\\alpha$', '$\\leq$'].map(s => [L2.textSymbol(s), L2.phClassProven(s).cls])).toEqual(Array(6).fill([true, 'symbol']))
    expect(['$\\alpha\\beta$', '$^{\\dagger\\ddagger}$', '$\\nabla_\\theta$', '$/$'].map(L2.textSymbol)).toEqual([false, false, false, false])
    // (any other class as it was)
    expect(['$x_i$', '\\cite{a}', '~'].map(s => L2.phClassProven(s).cls)).toEqual(['other', 'cite', 'space'])
  })
  const line = [1, 10, 145, 100, 108, 97, 10, 0]
  const page = [...item('as shown', 10, 100, 10, 0), ...item('\u03A3\u03B1\u03B2', 60, 100, 10, 1, math), ...item('here', 90, 100, 10, 2)]
  for (const src of PROBES) {
    const unit = { kind: 'para', src: 'as shown here', pieces: [text('\u5982 '), ph(src), text(' \u6240\u793A')] } as never
    it(`${src}: drawn only where the file holds its ink, else its unit the original's`, () => {
      const tr = [[0, '\u5982 '], [1, 1], [0, ' \u6240\u793A']], kOf = [-1, 1, -1]
      const found = unitOf([line], [[1, 0, [1, 60, 100, 75, 108, 97]]]), lost = unitOf([line], [[1, PH_FLAG.LOST, []]])
      // the file locates the unit whole only where it finds the formula (it is asked for, as any formula is)
      expect(T.locatedWhole(found, unit, tr).ok).toBe(true)
      expect(T.locatedWhole(lost, unit, tr).why).toBe('lost')
      // then its rendering is the segment's own ink: a crop cut from it
      const t = T.texRects(found)
      const whole = L2.prepareUnit(unit, t.rects as never, [page as never], new Map() as never, null, T.texParts(found, kOf, { lines: t }) as never)
      expect(whole.unproven).toBeUndefined()
      expect(whole.get(1)).toMatchObject({ mode: 'crop', crop: [59.6, 96.7, 75.4, 108.3], baseline: 100 })
      // the row LOST: the file holds no ink for it, and the unit stays the original's (it is no source's text to draw)
      const tl = T.texRects(lost)
      expect(L2.prepareUnit(unit, tl.rects as never, [page as never], new Map() as never, null, T.texParts(lost, kOf, { lines: tl }) as never).unproven).toBe(1)
    })
  }
  it('a text symbol stays exempt: drawn from its source, asked for by no file', () => {
    for (const [src, drawn] of [['$\\times$', '\u00D7'], ['\\_', '_']] as const) {
      const unit = { kind: 'para', src: 'as shown here', pieces: [text('\u5982 '), ph(src), text(' \u6240\u793A')] } as never
      // (its row LOST: the unit still located whole, the symbol's glyph its line's)
      const lu = unitOf([line], [[1, PH_FLAG.LOST, []]])
      expect(T.locatedWhole(lu, unit, [[0, '\u5982 '], [1, 1], [0, ' \u6240\u793A']]).ok, src).toBe(true)
      const t = T.texRects(lu)
      const r = L2.prepareUnit(unit, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
      expect(r.unproven, src).toBeUndefined()
      expect(r.get(1), src).toMatchObject({ mode: 'symbol', text: drawn })
    }
  })
})

describe("the state a unit's own pieces share, which a rendering found by its segments teaches", () => {
  it("a citation found by its segments is learnt by its key", () => {
    const page = [...item('as shown in', 10, 100, 10, 0), ...item('[12]', 70, 100, 10, 1), ...item('before', 95, 100, 10, 2)]
    const unit = { kind: 'para', src: 'as shown in before', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src: '\\cite{smith2019}' }, { t: 'text', s: ' \u6240\u793A' }] } as never
    const lu = unitOf([[1, 10, 125, 100, 108, 97, 10, 0]], [[1, 0, [1, 70, 100, 90, 108, 97]]])
    const citeMap = new Map() as never as Map<string, string>
    const t = T.texRects(lu)
    const r = L2.prepareUnit(unit, t.rects as never, [page as never], citeMap as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never).get(1)
    expect(r?.mode).toBe('orig-text')
    expect(r?.text).toBe('[12]')
    expect(citeMap.get('smith2019')).toBe('12')
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


describe("TeX's own lines, kept and broken (the 2608.16117 survey's fixes 2 and 3, 2026-10-15)", () => {
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const key = (r: number[]) => `${r[0]}|${r.slice(1).join()}`
  it('fix 2: a unit on the file\'s lines keeps its held lines alone, its author-year citation line its own text', () => {
    // "delta (Kim Lee Park Choi Han 2016)": seven words, one the source's, the rest the citation's rendering. A rule that
    // kept a line with four words or more, under a fifth of them the source's, took it for another unit's
    const lines = [[1, 10, 200, 500, 507, 498, 10, 0], [1, 10, 200, 488, 495, 486, 10, 0], [1, 10, 200, 476, 483, 474, 10, 0]]
    const lu = unitOf(lines, [[1, 0, [1, 40, 488, 180, 495, 486]]]) as { ph: Map<number, { kind: string }> }
    const row = lu.ph.get(1)
    if (row) row.kind = 'cite'
    const u = { kind: 'para', src: 'alpha beta gamma delta epsilon zeta eta', pieces: [text('\u7532\u4E59\u4E19\u4E01 '), ph('\\citep{kim,lee,park,choi,han}'), text(' \u620A\u5DF1\u5E9A')] } as never
    const page = [...item('alpha beta gamma', 10, 500, 10, 0), ...item('delta (Kim Lee Park Choi Han 2016)', 10, 488, 10, 1), ...item('epsilon zeta eta', 10, 476, 10, 2)]
    const t = T.texRects(lu as never)
    const citeLine = key(t.rects[1] as number[])
    const tex = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu as never, [-1, 1, -1], { lines: t }) as never)
    expect(tex.keep ?? []).not.toContain(citeLine)
    expect(tex.get(1)?.mode).not.toBe('kept')
  })

  // a paragraph, `\\ \\`, a paragraph: lines 0 and 1 the first (1 ended short at the forced break), the blank line, 2 and 3
  // the second; and `\\ \\` after the unit's last words, which ends no line of it
  const L = (y: number, x1 = 200) => [1, 10, x1, y, y + 7, y - 2, 10, 0]
  const lines = [L(500), L(488, 90), L(464), L(452, 120)]
  const BR = '\\\\'
  const unit = (...p: object[]) => ({ kind: 'para', src: 'a b c d', pieces: p }) as never
  const u = unit(text('\u7532'), ph(BR), ph(BR), text(' \u4E59'), ph(BR), ph(BR), text('\n'))
  it("fix 3: pairs each forced break between two visible pieces with a line TeX ended short, in order, never one at an edge", () => {
    // (with TeX's room after it, in the unit's pitches: the gap to the next line, 24, over the pitch, 12, less one, the
    // empty line the second `\\` sets)
    expect([...T.forcedBreaks(unitOf(lines) as never, u)]).toEqual([[1, { next: 2, room: 1, pitch: 12 }], [2, { next: 2, room: 1, pitch: 12 }]])
    // a break before a display ends no line of the text: the display does
    const D = '\\begin{equation}x=1\\end{equation}'
    expect(T.forcedBreaks(unitOf(lines) as never, unit(text('\u7532'), ph(BR), ph(D), text(' \u4E59'))).size).toBe(0)
  })
  it('pairs nothing where the breaks and the short lines are not as many, nor where a found piece stands across its break', () => {
    // no line ended short (the break at a line's end), and two for one break (a ragged unit)
    expect(T.forcedBreaks(unitOf([L(500), L(488), L(464), L(452, 120)]) as never, u).size).toBe(0)
    expect(T.forcedBreaks(unitOf([L(500, 150), L(488, 90), L(464), L(452, 120)]) as never, u).size).toBe(0)
    // a citation the translation sets after the break, whose segments the file puts on line 0, before it
    const cited = unit(text('\u7532'), ph(BR), text(' \u4E59'), ph('\\cite{x}'), text('\u4E19'))
    const kOf = [-1, -1, -1, 3, -1]
    expect(T.forcedBreaks(unitOf(lines, [[3, 0, [1, 60, 500, 80, 507, 498]]]) as never, cited, kOf).size).toBe(0)
    expect([...T.forcedBreaks(unitOf(lines, [[3, 0, [1, 60, 464, 80, 471, 462]]]) as never, cited, kOf)]).toEqual([[1, { next: 2, room: 1, pitch: 12 }]])
  })
  it('pairs nothing in a unit in two columns of one page, nor at a short line that is a display\'s row (#367 review)', () => {
    // two columns of page 1: the left one's line 1 ends short, as the break's line would
    const two = { ...(unitOf([L(500), L(488, 90), [1, 320, 520, 500, 507, 498, 10, 0], [1, 320, 520, 488, 495, 486, 10, 0]]) as object), frames: Float64Array.from([1, 0, 0, 2, -1, 0, 1, 1, 2, 2, 500, 0]) }
    const one = unit(text('\u7532'), ph(BR), text(' \u4E59'))
    expect([...T.forcedBreaks(unitOf([L(500), L(488, 90), L(464), L(452)]) as never, one)]).toEqual([[1, { next: 2, room: 1, pitch: 12 }]])
    expect(T.forcedBreaks(two as never, one).size).toBe(0)
    // a display's row the file does not hold, short of the measure: no line a forced break ends
    const row = unitOf([L(500), L(488, 90), L(464), L(452, 120)], [[7, 0, [1, 40, 488, 90, 495, 486]]]) as { ph: Map<number, { kind: string }> }
    const d = row.ph.get(7)
    if (d) d.kind = 'display'
    expect(T.forcedBreaks(row as never, one).size).toBe(0)
  })
  // the unit laid on the file's lines (a line of 190 pt holds 38 characters at size 10): its parts, its blocks, its tokens,
  // and its layout at its fit or at one state (`at`)
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0, borrow: 0 }
  const laid = (rows: number[][], pieces: object[], lineskip: [number, number] | null = null) => {
    const lu = unitOf(rows)
    const t = T.texRects(lu)
    const pages = Math.max(...rows.map(r => r[0] ?? 1))
    // (each line's page text one letter of the source's at its start)
    const charsByPage = Array.from({ length: pages }, (_, p) => rows.flatMap((r, j) => (r[0] === p + 1 ? item(String.fromCharCode(97 + j), 10, r[3] ?? 0, 10, j) : [])))
    const u = { kind: 'para', src: rows.map((_, j) => String.fromCharCode(97 + j)).join(' '), pieces } as never
    const prep = L2.prepareUnit(u, t.rects as never, charsByPage as never, new Map() as never, null, T.texParts(lu, pieces.map(() => -1), { lines: t, lineskip }) as never)
    const blocks = L2.blocks2(t.rects as never, Array.from({ length: pages }, () => [0, 0, 612, 792]), prep.keep?.length ? new Set(prep.keep) : null, prep.lineInfo, prep.regionOf, prep.referenced, null, prep.breakAt, prep.joinAt)
    const tokens = L2.tokensOf2(u, prep, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 50)
    const lines = (l: { lines: { page: number; baseline: number; items: { t: { s?: string } }[] }[] }) => l.lines.filter(x => x.items.some(it => it.t.s)).map(x => [x.page, Math.round(x.baseline * 100) / 100, x.items.map(it => it.t.s ?? '').join('')])
    const at = (lead: number) => L2.layoutAt(tokens, blocks as never, 10, P as never, { lead, track: 0, trackLatin: 0, compress: 0, borrow: 0, scale: 1, knob: 'none' } as never)
    return { prep, blocks, tokens, lines, at, fit: () => L2.layoutUnit2(tokens, blocks as never, 10, P as never) }
  }
  /** n CJK characters from `from` */
  const cjk = (n: number, from: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(from + i)).join('')
  const A = cjk(1, 0x7532), Bc = cjk(1, 0x4e59)

  it("breaks the text there, in one frame: the laid line ends, and TeX's room after the break is one empty line of the drawing's, its grid unbroken", () => {
    // `\\ \\` after line 1 (ended short), the original's empty line, four lines of the second paragraph: a frame whose
    // second paragraph's translation leaves its slots to spare
    const rows = [L(500), L(488, 90), L(464), L(452), L(440), L(428, 120)]
    const z = laid(rows, [text(A), ph(BR), ph(BR), text(` ${Bc}`), ph(BR), ph(BR), text('\n')])
    expect(z.prep.get(1)).toMatchObject({ mode: 'none', brk: true, room: 1 })
    // (no region of its own: the break is no kept place the text jumps to; the edge break a space, as before)
    expect(z.prep.get(1)?.region).toBeUndefined()
    expect(z.prep.breakAt?.size).toBe(0)
    expect(z.prep.get(4)?.brk).toBeUndefined()
    // the rows on both sides of the gap one block: the file's own baselines, its pitch the paragraph's, its foot kept
    expect(z.blocks.map(b => [b.B, b.after, b.pitch0])).toEqual([[[500, 488, 464, 452, 440, 428], 0, 12]])
    expect(z.tokens.map(x => ((x as { newline?: number }).newline !== undefined ? '/' : x.blockTo !== undefined ? '|' : x.space ? '_' : x.s)).join('')).toBe(`${A}/_${Bc}`)
    // at the script's leading (1.3, a pitch of 15.6): the second paragraph two lines under the first's last, the room the
    // translation does not use at the unit's end, no band before a line pinned to TeX's (464)
    const l = z.fit()
    expect(l.clipped).toBe(false)
    expect(z.lines(l)).toEqual([[1, 500, A], [1, 468.8, Bc]])
    // on the original's own pitch: the same, one empty line; and where the first paragraph takes the original's two lines,
    // the second starts on TeX's own line after the break
    expect(z.lines(z.at(1))).toEqual([[1, 500, A], [1, 476, Bc]])
    const two = laid(rows, [text(cjk(39, 0x4e00)), ph(BR), ph(BR), text(` ${Bc}`)])
    expect(two.lines(two.at(1)).map(x => x[1])).toEqual([500, 488, 464])
  })

  it('a lone `\\\\` leaves no room: the text after it on the next line', () => {
    const rows = [L(500), L(488, 90), L(476), L(464), L(452, 120)]
    const z = laid(rows, [text(A), ph(BR), text(` ${Bc}`)])
    expect([...T.forcedBreaks(unitOf(rows) as never, { kind: 'para', src: '', pieces: [text(A), ph(BR), text(` ${Bc}`)] } as never)]).toEqual([[1, { next: 2, room: 0, pitch: 12 }]])
    expect(z.lines(z.fit())).toEqual([[1, 500, A], [1, 484.4, Bc]])
  })

  it("a lone `\\\\` before a tall line: the gap TeX's \\lineskip opened is no room of the break's (#383 review)", () => {
    // line 2 is tall (14 over its baseline): TeX set it the short line's depth, its height and \lineskip (1) under it, 17
    // where the pitch is 12 (the file's boxes, as blocks2 reads a tall line's opening)
    const rows = [L(500), L(488, 90), [1, 10, 200, 471, 485, 469, 10, 0], L(459), L(447, 120)]
    const one = { kind: 'para', src: '', pieces: [text(A), ph(BR), text(` ${Bc}`)] } as never
    expect([...T.forcedBreaks(unitOf(rows) as never, one, null, [1, 0])]).toEqual([[1, { next: 2, room: 0, pitch: 12 }]])
    // with no values for TeX's rule, all of the gap beyond the pitch
    expect([...T.forcedBreaks(unitOf(rows) as never, one)]).toEqual([[1, { next: 2, room: 0.417, pitch: 12 }]])
  })

  it("a break's room is measured by its own frame's pitch, and a frame with no pitch of its own keeps the pin (#383 review)", () => {
    const P2 = (y: number, x1 = 200) => [2, 10, x1, y, y + 7, y - 2, 10, 0]
    const two = { kind: 'para', src: '', pieces: [text(A), ph(BR), ph(BR), text(` ${Bc}`)] } as never
    // page 1's frame at a pitch of 12, `\\ \\` after its line 1; page 2's at 20: the break's empty line is one of 12, room 1
    // (pooled with page 2's gaps, the pitch read 20 and the room 0.2)
    expect([...T.forcedBreaks(unitOf([L(500), L(488, 90), L(464), P2(500), P2(480), P2(460), P2(440, 120)]) as never, two)]).toEqual([[1, { next: 2, room: 1, pitch: 12 }], [2, { next: 2, room: 1, pitch: 12 }]])
    // page 1's frame no more than the break's two lines: nothing measures its pitch, and the text after it starts on TeX's line
    expect([...T.forcedBreaks(unitOf([L(500, 90), L(476), P2(500), P2(488), P2(476, 120)]) as never, two)]).toEqual([[1, { next: 1, room: null, pitch: null }], [2, { next: 1, room: null, pitch: null }]])
  })

  it("the grid closes a break's gap to one pitch, a tall next line's opening with it: the room alone is left (#383 review)", () => {
    // `\vspace{0.5em}\\` before a tall line (14 over its baseline): TeX's distance with no break 17 (2 + 14 + \lineskip 1), and
    // the glue's 6: the next line 23 under the short one, room 0.5 at the frame's pitch of 12
    const rows = [L(500), L(488, 90), [1, 10, 200, 465, 479, 463, 10, 0], L(453), L(441, 120)]
    const z = laid(rows, [text(cjk(39, 0x4e00)), ph('\\vspace{0.5em}'), ph(BR), text(` ${Bc}`)], [1, 0])
    expect(z.prep.get(2)).toMatchObject({ brk: true, room: 0.5 })
    expect(z.blocks.map(b => b.G)).toEqual([[500, 488, 476, 464, 452]])
    // on the original's pitch: the translation's next line, no taller than the text, half a pitch under its grid line
    expect(z.lines(z.at(1)).map(x => x[1])).toEqual([500, 488, 470])
  })

  it("`\\vspace{0.3cm}\\\\`: TeX's room is the glue it set, 0.63 of a pitch, kept at the drawing's pitch", () => {
    // 0.3 cm, 8.54 pt, at a pitch of 13.6: line 2 is 1.63 pitches under line 1 (here 12 \u00D7 1.63 = 19.56)
    const rows = [L(500), L(488, 90), L(468.44), L(456.44), L(444.44, 120)]
    const pieces = [text(A), ph('\\vspace{0.3cm}'), ph(BR), text(` ${Bc}`)]
    expect([...T.forcedBreaks(unitOf(rows) as never, { kind: 'para', src: '', pieces } as never)]).toEqual([[2, { next: 2, room: 0.63, pitch: 12 }]])
    const z = laid(rows, pieces)
    const got = z.lines(z.fit())
    expect(got.map(x => x[2])).toEqual([A, Bc])
    // (1.63 drawn pitches of 15.6 under the first line)
    expect(got[1]?.[1]).toBeCloseTo(500 - 1.63 * 15.6, 2)
  })

  it("a break whose next line opens another frame keeps the pin: the text after it starts on that frame's line TeX set", () => {
    // line 2, page 1's last, ends short; the text after the break is on page 2's first (TeX drops glue at a frame's head)
    const P2 = (y: number, x1 = 200) => [2, 10, x1, y, y + 7, y - 2, 10, 0]
    const rows = [L(500), L(488), L(476, 90), P2(500), P2(488, 120)]
    const pieces = [text(A), ph(BR), text(` ${Bc}`)]
    expect([...T.forcedBreaks(unitOf(rows) as never, { kind: 'para', src: '', pieces } as never)]).toEqual([[1, { next: 3, room: null, pitch: null }]])
    const z = laid(rows, pieces)
    expect(z.prep.get(1)).toMatchObject({ brk: true })
    expect(z.prep.get(1)?.region).toBeDefined()
    expect(z.prep.joinAt?.size).toBe(0)
    expect(z.lines(z.fit())).toEqual([[1, 500, A], [2, 500, Bc]])
  })

  it("2608.16117's unit 8: three paragraphs, `\\\\ \\\\` in two frames, one leading for the unit and its unused room at its end", () => {
    // TeX: S1 on page 1's four lines and page 2's first two (the second ended short), the empty line, S2 on six lines and
    // page 3's first two (ended short), the empty line, S3 on three
    const at = (page: number) => (y: number, x1 = 200) => [page, 10, x1, y, y + 7, y - 2, 10, 0]
    const [p1, p2, p3] = [at(1), at(2), at(3)]
    const rows = [p1(500), p1(488), p1(476), p1(464), p2(500), p2(488, 90), p2(464), p2(452), p2(440), p2(428), p2(416), p2(404), p3(500), p3(488, 90), p3(464), p3(452), p3(440, 120)]
    // the translation: S1 four lines of 40 characters, S2 six, S3 three; with the two empty lines, fifteen slots
    const [S1, S2, S3] = [cjk(150, 0x4e00), cjk(220, 0x5000), cjk(100, 0x5200)]
    const z = laid(rows, [text(S1), ph(BR), ph(BR), text(S2), ph(BR), ph(BR), text(S3)])
    expect(z.blocks.map(b => [b.page, b.B.length])).toEqual([[1, 4], [2, 8], [3, 5]])
    const l = z.fit()
    expect(l.clipped).toBe(false)
    // one leading, 1.25 (a pitch of 15): every line on its frame's grid from its first line, an empty slot after each break
    expect(l.state.lead).toBe(1.25)
    const got = z.lines(l)
    const of = (s: string) => (x: (string | number)[]) => s.includes(String(x[2]).slice(0, 1))
    expect(got.filter(of(S1)).map(x => [x[0], x[1]])).toEqual([[1, 500], [1, 485], [1, 470], [2, 500]])
    expect(got.filter(of(S2)).map(x => [x[0], x[1]])).toEqual([[2, 470], [2, 455], [2, 440], [2, 425], [2, 410], [3, 500]])
    // S3 two lines under S2's last, not at TeX's line after the break (464) under a band of S2's unused room
    expect(got.filter(of(S3)).map(x => [x[0], x[1]])).toEqual([[3, 470], [3, 455], [3, 440]])
  })
})

describe("a cell whose citation wrapped onto the cell's next line, made by the maker (2609.26457 Table 3)", () => {
  it('is located whole, its text area both lines: its table group is not withheld for it', async () => {
    // the citation after the cell's last word (the end mark before it), its second line no word of the cell's source
    const runs: Run[] = [{ s: 'decaying exploration', x: 72, y: 700 }, { s: '(Sutton and', x: 177, y: 700 }, { s: 'Barto, 2018)', x: 72, y: 688 }]
    const w: World = {
      pages: [{ runs, points: { 'p0.1b': [2, 12] } }],
      marks: [['t0s', 1, 72, 700], ['t0e', 1, 177, 700], ['p0.1a', 1, 177, 700], ['p0.1b', 1, 132, 688]],
      units: [unitPiece('cell', [textPiece(' decaying exploration '), phPiece('\\citep{sutton}'), textPiece(' ')])],
    }
    const out = await makeLayout({ units: w.units, marks: await marksOf(w), arxiv: arxivOf(w.pages), OPS, paper: { id: '2609.26457', version: 1 }, left: '', pdfjs: '6.3.289' })
    if (!('file' in out)) throw new Error('refused')
    const lu = indexLayout(out.file).unit(0)
    const cell = { kind: 'cell', pieces: w.units[0]?.pieces } as never
    expect(T.locatedWhole(lu, cell, [[0, ' exploration decroissante '], [1, 1], [0, ' ']])).toMatchObject({ ok: true, kOf: [-1, 1, -1] })
    expect(T.texRects(lu as never).rects.map(r => [r[0], r[1], r[3]])).toEqual([[1, 72, 232], [1, 72, 132]])
  })
})

describe('a piece TeX set no ink for never refuses its unit (EMPTY, the no-ink round, 2026-10-19)', () => {
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const L = (y: number) => [1, 10, 200, y, y + 8, y - 3, 10, 0]
  const rowsOf = (rows: [number, number, string][]) => {
    const lu = unitOf([L(100)], rows.map(([k, f]) => [k, f, []])) as unknown as { ph: Map<number, { kind: string }>; erase: Float64Array[] }
    for (const [k, , kind] of rows) { const row = lu.ph.get(k); if (row) row.kind = kind }
    lu.erase = [Float64Array.from([10, 97, 200, 108])]
    return lu as never
  }
  // 2610.19159's step headers: a role box holding an index and "Tool Output", then \trajectoryMark{} with an empty argument,
  // which sets nothing (the maker's tail row EMPTY: no glyph beside the unit's end mark)
  const pieces = [{ t: 'open', id: 1, src: '\\trajectoryRole[trajectoryoutput]{' }, { t: 'open', id: 2, src: '\\trajectoryIndex{' }, text('Step 2149'), { t: 'close', id: 2, src: '}' }, ph('\\enspace'), text(' Tool Output'), ph('\\trajectoryMark{}'), { t: 'close', id: 1, src: '}{}' }]
  const u = { kind: 'para', src: 'Step 2149 Tool Output', pieces } as never
  const tr = [[2, 0, 0], [2, 1, 0], [0, '\u6B65\u9AA4 2149'], [3, 3], [1, 4], [0, ' \u5DE5\u5177\u8F93\u51FA'], [1, 6], [3, 7]]
  it("an EMPTY row passes: its ink is ruled off the unit's lines", () => {
    const lu = rowsOf([[6, PH_FLAG.EMPTY, 'macro']])
    expect(T.locatedWhole(lu, u, tr)).toMatchObject({ ok: true })
    // (a LOST row, as the maker writes an open ownership that owned nothing, its ink not known: refused as before)
    expect(T.locatedWhole(rowsOf([[6, PH_FLAG.LOST, 'macro']]), u, tr).why).toBe('lost')
  })
  it('the piece is drawn as nothing, and the unit is drawn, not left English', () => {
    const lu = rowsOf([[6, PH_FLAG.EMPTY, 'macro']])
    const t = T.texRects(lu)
    const prep = L2.prepareUnit(u, t.rects as never, [item('Step 2149 Tool Output', 12, 100, 10, 0) as never], new Map() as never, null, T.texParts(lu, [-1, -1, -1, -1, 4, -1, 6, -1], { lines: t }) as never)
    expect(prep.unproven).toBeUndefined()
    expect(prep.get(6)).toMatchObject({ mode: 'none', text: '', proof: true, empty: true })
  })
  it('a text symbol, a space or a piece that sets nothing is drawn by its class whatever its row says', () => {
    const lu = rowsOf([[1, PH_FLAG.EMPTY, 'macro'], [2, PH_FLAG.EMPTY, 'macro'], [3, PH_FLAG.EMPTY, 'macro']])
    const sym = { kind: 'para', src: 'a b', pieces: [text('a '), ph('\\%'), ph('\\enspace'), ph('\\includegraphics{f.pdf}'), text(' b')] } as never
    const t = T.texRects(lu)
    const prep = L2.prepareUnit(sym, t.rects as never, [item('a % b', 12, 100, 10, 0) as never], new Map() as never, null, T.texParts(lu, [-1, 1, 2, 3, -1], { lines: t }) as never)
    expect([1, 2, 3].map(k => [prep.get(k)?.mode, prep.get(k)?.text, (prep.get(k) as { empty?: boolean } | undefined)?.empty])).toEqual([['symbol', '%', undefined], ['none', ' ', undefined], ['none', '', undefined]])
  })
})

describe("a placeholder's text drawn in its glyphs' fill, the file's (PR-C: 2608.16117's blue citations)", () => {
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 }
  // "as shown by Vinayak and Kumar (2026) here": a natbib \citet in hyperref's colorlinks blue, found by its segments
  const page = [...item('as shown by', 10, 100, 10, 0), ...item('Vinayak and Kumar (2026)', 70, 100, 10, 1), ...item('here', 200, 100, 10, 2)]
  const u = { kind: 'para', src: 'as shown by here', pieces: [text('\u5982 '), ph('\\citet{vinayak}'), text(' \u6240\u793A')] } as never
  const fileOf = (fill: number | null) => {
    const lu = unitOf([[1, 10, 230, 100, 108, 97, 10, 0]], [[1, 0, [1, 69.5, 100, 190.5, 108, 97]]]) as unknown as { ph: Map<number, { kind: string; fill: number | null }> }
    const row = lu.ph.get(1)
    if (row) { row.kind = 'cite'; row.fill = fill }
    return lu as never
  }
  const read = (lu: never) => {
    const t = T.texRects(lu)
    return L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
  }
  const colourOf = (prep: never) => L2.tokensOf2(u, prep, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 0).filter(t => typeof t.s === 'string' && (t as { k?: number }).k === 1 && /\S/.test(t.s)).map(t => (t.st as { color?: string }).color ?? null)
  it("is drawn in its row's fill exactly where the file gives one colour, and in its run's where the fill is mixed or black", () => {
    const blue = read(fileOf(0x0000ff))
    expect(blue.get(1)?.mode).toBe('orig-text')
    expect(new Set(colourOf(blue as never))).toEqual(new Set(['#0000ff']))
    expect(new Set(colourOf(read(fileOf(-1)) as never))).toEqual(new Set([null]))
    expect(new Set(colourOf(read(fileOf(null)) as never))).toEqual(new Set([null]))
  })
  it('and the drawing writes that fill as it is', () => {
    const tokens = L2.tokensOf2(u, read(fileOf(0x0000ff)) as never, 'zh', BASE as never, DESIGNS as never, P as never, null, undefined, true)
    const block = { page: 1, rects: [[1, 10, 97.85, 300, 106.83]], x0: 10, x1: 300, B: [100], exact: [true], sizes: [10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
    const L = L2.layoutUnit2(tokens, [block] as never, 10, P as never)
    const svg = L2.svgOfUnit(L as never, 1, (x: number, y: number) => [x, 792 - y], 1, 0)
    expect(svg).toContain('fill="#0000ff"')
  })
})

describe("a colour run drawn in the fill TeX set it in, the layout file's `colours` row (PR-C)", () => {
  const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
  const open = (src: string, id = 1) => ({ t: 'open', id, src }), close = (id = 1) => ({ t: 'close', id, src: '}' })
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 }
  // "see blue words [12] and then red ones": a \textcolor run holding a citation, then a \color switch
  const page = [...item('see blue words', 10, 100, 10, 0), ...item('[12]', 90, 100, 10, 1), ...item('and then red ones', 120, 100, 10, 2)]
  const u = { kind: 'para', src: 'see blue words and then red ones', pieces: [text('\u89C1 '), open('\\textcolor{blue!60!black}{'), text('\u84DD\u5B57 '), ph('\\cite{k}'), close(), text(' \u7136\u540E '), ph('\\color{red}'), text(' \u7EA2\u5B57')] } as never
  const kOf = [-1, 1, -1, 3, 4, -1, 6, -1]
  const fileOf = (colours: [number, number][], citeFill: number | null) => {
    const lu = unitOf([[1, 10, 230, 100, 108, 97, 10, 0]], [[3, 0, [1, 89.5, 100, 110.5, 108, 97]]]) as unknown as { ph: Map<number, { kind: string; fill: number | null }>; colours: Map<number, number> }
    const row = lu.ph.get(3)
    if (row) { row.kind = 'cite'; row.fill = citeFill }
    lu.colours = new Map(colours)
    return lu as never
  }
  const coloursOf = (lu: never) => {
    const t = T.texRects(lu)
    const prep = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, kOf, { lines: t }) as never)
    const tokens = L2.tokensOf2(u, prep as never, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 0).filter(t => typeof t.s === 'string' && /\S/.test(t.s))
    return tokens.map(t => [t.s, (t.st as { color?: string }).color ?? null])
  }
  it('each run in its row\'s fill exactly; the citation in it in the run\'s, which wins over its own fill; the switch to its group\'s end', () => {
    const got = coloursOf(fileOf([[1, 0x000099], [6, 0xff0000]], 0x0000ff))
    // (in order: see, blue words, the citation, and then, red words)
    expect(got.map(([s]) => s).join('')).toBe('\u89C1\u84DD\u5B57[12]\u7136\u540E\u7EA2\u5B57')
    const at = (from: number, to: number) => { let n = 0; return got.filter(([s]) => { const i = n; n += (s as string).length; return i >= from && i < to }).map(([, c]) => c) }
    expect(at(0, 1).every(c => c === null)).toBe(true)
    expect(at(1, 7).every(c => c === '#000099')).toBe(true)
    expect(at(7, 9).every(c => c === null)).toBe(true)
    expect(at(9, 11).every(c => c === '#ff0000')).toBe(true)
  })
  it('a colour piece with no row draws in the colour around it, never a guess from its name; a citation outside any run its own fill', () => {
    const got = coloursOf(fileOf([], 0x0000ff))
    expect(got.filter(([s]) => /[\u84DD\u7EA2]/.test(s as string)).map(([, c]) => c).every(c => c === null)).toBe(true)
    // (no run's colour around it: the citation's own fill)
    expect(got.filter(([s]) => /\d/.test(s as string)).map(([, c]) => c).every(c => c === '#0000ff')).toBe(true)
  })
  it('a black row inside a coloured run is black, written as such', () => {
    const black = { kind: 'para', src: 'x', pieces: [open('\\textcolor{red}{'), text('\u7EA2 '), ph('\\color{black}'), text(' \u9ED1'), close()] } as never
    const lu = fileOf([[0, 0xff0000], [2, 0]], null)
    const t = T.texRects(lu)
    const prep = L2.prepareUnit(black, t.rects as never, [item('red black', 10, 100, 10, 0) as never], new Map() as never, null, T.texParts(lu, [0, -1, 2, -1, 4], { lines: t }) as never)
    const tokens = L2.tokensOf2(black, prep as never, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 0).filter(t => typeof t.s === 'string' && /\S/.test(t.s))
    expect(tokens.map(t => (t.st as { color?: string }).color)).toEqual(['#ff0000', '#000000'])
  })
  // (#407: a colour name no row tells is no guess: the colour around it)
  const named = { kind: 'para', src: 'x', pieces: [open('\\textcolor{red}{'), text('\u7EA2 '), close(), text(' \u800C '), ph('\\color{cyan}'), text(' \u9752 '), ph('\\color{ForestGreen}'), text(' \u7EFF')] } as never
  const namedColours = (parts: unknown, rects: unknown = []) => {
    const prep = L2.prepareUnit(named, rects as never, [item('red and cyan green', 10, 100, 10, 0) as never], new Map() as never, null, parts as never)
    return L2.tokensOf2(named, prep as never, 'zh', BASE as never, DESIGNS as never, P as never, null, () => 0).filter(t => typeof t.s === 'string' && /\S/.test(t.s)).map(t => (t.st as { color?: string }).color ?? null)
  }
  it('a layout that holds the unit and no row for a piece: the colour around it; a row: the row, over the name', () => {
    const lu = fileOf([], null), t = T.texRects(lu)
    expect(namedColours(T.texParts(lu, [0, -1, -1, -1, 4, -1, 6, -1], { lines: t }), t.rects)).toEqual([null, null, null, null])
    const rows = fileOf([[0, 0x123456], [4, 0x00ffff]], null), t2 = T.texRects(rows)
    expect(namedColours(T.texParts(rows, [0, -1, -1, -1, 4, -1, 6, -1], { lines: t2 }), t2.rects)).toEqual(['#123456', null, '#00ffff', '#00ffff'])
  })
})

describe("LaTeX's text symbols: one table for the maker and the layer (rules/text-symbols.mjs)", () => {
  it('the layer reads the five 2610.19159 left English as their characters: text symbols, drawn as they are', async () => {
    const five = { '\\textquotesingle{}': "'", '\\textquotedbl{}': '"', '\\textbackslash{}': '\\', '\\textasciicircum{}': '^', '\\textbar{}': '|' }
    for (const [src, ch] of Object.entries(five)) {
      expect(L2.texToText2(src), src).toBe(ch)
      expect([L2.phClass2(src).cls, L2.phClassProven(src).cls, L2.textSymbol(src)], src).toEqual(['symbol', 'symbol', true])
      const unit = { kind: 'para', src: 'as shown here', pieces: [{ t: 'text', s: '\u5982 ' }, { t: 'ph', src }, { t: 'text', s: ' \u6240\u793A' }] } as never
      const lu = unitOf([[1, 10, 145, 100, 108, 97, 10, 0]], []), t = T.texRects(lu)
      const r = L2.prepareUnit(unit, t.rects as never, [item('as shown here', 10, 100, 10, 0) as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
      // (the caret too: no superscript's mark to take off)
      expect(r.unproven, src).toBeUndefined()
      expect(r.get(1), src).toMatchObject({ mode: 'symbol', text: ch, sup: false })
    }
  })
  it("every symbol is its character to both; the layer's tables of commands inside a source agree where they know one", async () => {
    const S = await import('@/pdf-reader/engine/rules/text-symbols.mjs')
    const M = await import('@/pdf-reader/engine/layout/marks.mjs')
    const L1 = await import('@/pdf-reader/engine/layer-proto/layer1.mjs')
    // (the maker's own: the one table, its symbolText too)
    expect(M.TEXT_SYMBOLS).toBe(S.TEXT_SYMBOLS)
    expect(M.symbolText).toBe(S.symbolText)
    for (const [cmd, ch] of Object.entries(S.TEXT_SYMBOLS)) {
      expect([S.symbolText(cmd), S.symbolText(`${cmd}{}`), L2.texToText2(cmd), L2.texToText2(`${cmd}{}`)], cmd).toEqual([ch, ch, ch, ch])
      expect([ch, ''], cmd).toContain(L1.texToText(cmd))
      expect([ch, ''], cmd).toContain(L2.texToText2(`$${cmd}$`))
    }
    expect([S.symbolText('\\textbar{}x'), S.symbolText('\\ours'), S.symbolText(undefined)]).toEqual([null, null, null])
  })
})

describe("the class's own marks after a unit's text: a theorem's note (2610.21084's \"Definition 4.5 (Latent transition error).\")", () => {
  // the note's unit, "Latent transition error"; its line in the file holds amsthm's ")." after the source's last word, its
  // label "Definition 4.5 (" before it
  const L = [1, 50, 101, 500, 507, 498, 10, 0]
  const lu = unitOf([L], [], [0, 1, 10, 500, 48, 507, 498])
  const bold = { fam: 'serif', bold: true, italic: false, caps: false, known: true } as never
  const page = [...item('Def (', 10, 500, 10, 0, bold), ...item('Latent transition error', 50, 500, 4, 1), ...item(')', 96, 500, 4, 2), ...item('.', 98, 500, 4, 3, bold)]
  const unit = (s: string, src = 'Latent transition error') => ({ kind: 'para', src, pieces: [{ t: 'text', tr: true, s }] }) as never
  const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0 }
  const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
  const drawn = (u: never) => {
    const t = T.texRects(lu)
    const prep = L2.prepareUnit(u, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1], { lines: t }) as never)
    return L2.tokensOf2(u, prep as never, 'zh', BASE as never, { serif: 'times', sans: 'helvetica', mono: 'courier' } as never, P as never, null, () => 0).filter(x => typeof x.s === 'string')
  }
  it('are drawn after the translation, each in its own style', () => {
    const tokens = drawn(unit('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee'))
    expect(tokens.map(x => x.s).join('')).toBe('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee).')
    expect(tokens.slice(-2).map(x => !!(x.st as { bold?: boolean }).bold)).toEqual([false, true])
  })
  it("in place of the translation's own marks of the same kind at its end, never twice", () => {
    expect(drawn(unit('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\u3002')).map(x => x.s).join('')).toBe('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee).')
    expect(drawn(unit('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\uff09\u3002')).map(x => x.s).join('')).toBe('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee).')
    // as many of a kind as the class's own marks hold: the translation's closing quote before its bracket stays, its
    // opening quote's pair (")" and a closing quote are one kind, markKind's)
    expect(drawn(unit('\u6240\u8c13\u7684\u201c\u8d2a\u5fc3\u89c4\u5219\u201d\uff09\u3002')).map(x => x.s).join('')).toBe('\u6240\u8c13\u7684\u201c\u8d2a\u5fc3\u89c4\u5219\u201d).')
  })
  it("none in a math font: a formula's delimiter beside a cell is its formula's ink (1512.03385's Table 1)", () => {
    const pg = [...item('Def (', 10, 500, 10, 0, bold), ...item('Latent transition error', 50, 500, 4, 1), ...item(']', 96, 500, 4, 2, math)]
    const t = T.texRects(lu)
    const prep = L2.prepareUnit(unit('\u6f5c\u5728'), t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1], { lines: t }) as never)
    expect(prep.tail).toBeNull()
  })
  it("none where the line's marks are the source's own end marks: they are its translation's", () => {
    const own = [...item('Def (', 10, 500, 10, 0, bold), ...item('Latent transition error.', 50, 500, 4, 1)]
    const t = T.texRects(lu)
    const u = unit('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\u3002', 'Latent transition error.')
    const prep = L2.prepareUnit(u, t.rects as never, [own as never], new Map() as never, null, T.texParts(lu, [-1], { lines: t }) as never)
    expect(prep.tail).toBeNull()
  })
  it("after the source's own end marks, which stay the translation's: amsthm's \").\" after a note that ends in its own stop", () => {
    // "Definition 4.5 (Latent transition error.).": the note writes its ".", amsthm sets ")." after it; the translation's
    // "\u3002" is the note's own and stays, the class's ")." follow it
    const lu3 = unitOf([[1, 50, 111, 500, 507, 498, 10, 0]], [], [0, 1, 10, 500, 48, 507, 498])
    const pg = [...item('Def (', 10, 500, 10, 0, bold), ...item('Latent transition error.', 50, 500, 4, 1), ...item(')', 98, 500, 4, 2), ...item('.', 100, 500, 4, 3, bold)]
    const t = T.texRects(lu3)
    const u = unit('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\u3002', 'Latent transition error.')
    const prep = L2.prepareUnit(u, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu3, [-1], { lines: t }) as never)
    expect((prep.tail as { ch: string }[] | null)?.map(c => c.ch)).toEqual([')', '.'])
    const text = L2.tokensOf2(u, prep as never, 'zh', BASE as never, { serif: 'times', sans: 'helvetica', mono: 'courier' } as never, P as never, null, () => 0).filter(x => typeof x.s === 'string').map(x => x.s).join('')
    expect(text).toBe('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\u3002).')
  })
  it("after the source's own end marks: a reference's stop its style sets after the entry's \"(2025)\" (Devin on #541)", () => {
    // the entry's source ends in ")", which its translation writes; the style's "." after the end mark is the class's own,
    // the unit's ink since REMOVAL 18 (own.mjs MR 4c): drawn after the translation, where it was hidden and drawn nowhere
    const L2line = [1, 50, 111, 500, 507, 498, 10, 0]
    const lu2 = unitOf([L2line])
    const draw = (u: never, pg: unknown[]) => {
      const t = T.texRects(lu2)
      const prep = L2.prepareUnit(u, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu2, [-1], { lines: t }) as never)
      return L2.tokensOf2(u, prep as never, 'zh', BASE as never, { serif: 'times', sans: 'helvetica', mono: 'courier' } as never, P as never, null, () => 0).filter(x => typeof x.s === 'string').map(x => x.s).join('')
    }
    const entry = (tr: string) => unit(tr, 'Latent transition error (LTE)')
    const stop = [...item('Latent transition error (LTE)', 50, 500, 4, 1), ...item('.', 108, 500, 4, 2)]
    expect(draw(entry('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\uff08LTE\uff09'), stop)).toBe('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\uff08LTE\uff09.')
    // (the translation's own stop at its end is replaced, never twice)
    expect(draw(entry('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\uff08LTE\uff09\u3002'), stop)).toBe('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\uff08LTE\uff09.')
    // (no mark past the source's own: none drawn, the translation's bracket its own)
    const none = item('Latent transition error (LTE)', 50, 500, 4, 1)
    expect(draw(entry('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\uff08LTE\uff09'), none)).toBe('\u6f5c\u5728\u8f6c\u79fb\u8bef\u5dee\uff08LTE\uff09')
  })
  it("reads the source's end marks as TeX prints them, after its last letter, digit or placeholder", () => {
    const text = (s: string) => ({ t: 'text', s }), ph = { t: 'ph', src: '$x$' }
    const of = (pieces: unknown[], src = '') => { const u = { src }; Object.defineProperty(u, 'source', { value: pieces }); return L2.sourceEndMarks(u as never) }
    expect(of([text('Phys. Rev. Lett. , ('), ph, text(')')])).toEqual([')'])
    expect(of([text("the ``greedy rule''.")])).toEqual(['\u201d', '.'])
    expect(of([text('as in \\cite x\\@.')])).toEqual(['.'])
    expect(of([text('a value~\\%).')])).toEqual(['%', ')', '.'])
    expect(of([text('see '), { t: 'open', id: 1, src: '\\emph{' }, text('this'), { t: 'close', id: 1, src: '}' }, text(' ')])).toEqual([])
    expect(of([text('Theorem.'), ph])).toEqual([])
    expect(of([text('a'), { t: 'open', id: 1, src: '\\textbf{' }, text('b).'), { t: 'close', id: 1, src: '}' }])).toEqual([')', '.'])
    // (a unit read without its source pieces: its source text)
    expect(L2.sourceEndMarks({ src: 'Latent transition error.' } as never)).toEqual(['.'])
    expect(L2.sourceEndMarks({ src: 'Latent transition error' } as never)).toEqual([])
  })
})
