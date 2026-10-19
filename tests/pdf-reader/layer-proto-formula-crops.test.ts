import { beforeAll, describe, expect, it } from 'vitest'
import { fileSwap, unitRemoval } from '@/pdf-reader/engine/layer-proto/removal.mjs'
import { addUnitWords, newWords } from '@/pdf-reader/engine/layer-proto/words.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A formula is never drawn as its page text (E3b, 2026-10-19): page text sets every glyph on one baseline and loses its
// scripts (2610.10069 drew sigma^{-1}(s_t), a formula TeX broke over two lines, as "sigma -1 (s t)"). Where TeX broke it over
// lines it is its crops, one a line of its row's segments (`parts`), the line breaking only between them, at TeX's own break;
// on one line they stand side by side, a space apart. Page text stays for a citation, a reference, a text macro and a text
// piece (rules/text-piece.mjs). Every reader of a crop takes its parts: the drawer and the checker, the word table, the
// links, the removal's glyph sets.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
// (the checker imports layer2.mjs, which measures with the canvas it makes when it loads: imported after the canvas is set)
let checkAll: typeof import('@/pdf-reader/engine/layer-proto/check.mjs').checkAll
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
  checkAll = (await import('@/pdf-reader/engine/layer-proto/check.mjs')).checkAll
})

const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false } as never
const math = { fam: 'math', bold: false, italic: true, caps: false, known: false } as never
const mono = { fam: 'mono', bold: false, italic: false, caps: false, known: false } as never
/** a text item's characters, each half its size wide, from x on baseline yb */
const item = (text: string, x: number, yb: number, size: number, n: number, st = serif) => [...text].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item: n, ix: x, k, st }))
/** a unit in the layout file as indexLayout reads it: lines (page, x0, x1, baseline, top, bottom, size, font), one frame a
 *  page, its placeholders by k */
const unitOf = (lines: number[][], ph: [number, number, number[]][] = []) => {
  const frames: number[] = []
  lines.forEach((l, j) => { const page = l[0] ?? 0; if (!j || page !== lines[j - 1]?.[0]) frames.push(page, 0, j, 0, -1, 0); frames[frames.length - 3] = (frames[frames.length - 3] ?? 0) + 1 })
  return { lines: Float64Array.from(lines.flat()), frames: Float64Array.from(frames), erase: lines.map(() => new Float64Array(0)), ph: new Map(ph.map(([k, flags, segs]) => [k, { kind: 'math', flags, segs: Float64Array.from(segs) }])), labels: new Float64Array(0) } as never
}
const L = (y: number) => [1, 10, 200, y, y + 7, y - 2, 10, 0]
const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
const P = { ...resolveRules(BUILTIN_RULES, 'zh').params, autospace: 0, compressMax: -1, hyphen: 0, borrow: 0, leadBase: 1, leadFloor: 1, lineskip: null }

// $g(z')=\sum_n g_n$, which TeX broke after its "=": "g=" on the line at 500 (x 150-200), the sum and g_n on the next (x
// 10-40), the sum sign read by its code where `nu`
const u = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph("$g(z')=\\sum_n g_n$"), text(' \u4e59')] } as never
const SEGS = [1, 150, 500, 200, 507, 498, 1, 10, 488, 40, 495, 486]
const lu = unitOf([L(500), L(488)], [[1, 0, SEGS]])
const page = (sum: { nu?: boolean } = {}) => [...item('a b', 10, 500, 10, 0), ...item('g=', 150, 500, 10, 1, math), ...item('\u00cd', 10, 488, 10, 2, math).map(c => ({ ...c, ...sum })), ...item('gn', 20, 488, 10, 3, math), ...item('c d', 50, 488, 10, 4)]
/** the unit read as the hybrid reads one the file locates whole (texParts), or as a filed unit (the proof alone) */
const whole = (pg = page()) => { const t = T.texRects(lu); return L2.prepareUnit(u, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { use: 'lines', lines: t }) as never) }
const filed = (pg = page()) => L2.prepareUnit(u, T.texRects(lu).rects as never, [pg as never], new Map() as never, null, { proof: T.proofOf(lu, [-1, 1, -1]) } as never)
const round = (b: number[]) => b.map(v => Math.round(v * 100) / 100)
/** its two crops, each a segment's box with the antialias margin (cropOfBox), on the baseline of its own line */
const TWO = [{ page: 1, baseline: 500, crop: [149.6, 497.7, 200.4, 507.3] }, { page: 1, baseline: 488, crop: [9.6, 485.7, 40.4, 495.3] }]
const partsOf = (r: { parts?: { page: number; baseline: number; crop: number[] }[] } | undefined) => r?.parts?.map(q => ({ page: q.page, baseline: q.baseline, crop: round(q.crop) }))

describe('a formula TeX broke over lines is its crops, one a line, never its page text', () => {
  it('in a unit the file locates whole, its glyphs mapped or not', () => {
    for (const pg of [page(), page({ nu: true })]) {
      const r = whole(pg)
      expect(r.unproven).toBeUndefined()
      expect(r.get(1)).toMatchObject({ mode: 'crop', page: 1, baseline: 500 })
      expect(partsOf(r.get(1))).toEqual(TWO)
      // (cut from its segments, never grown over the ink beside it)
      expect(L2.cropGrows(r.get(1) as never)).toBe(false)
    }
  })
  it("in a unit filed but not located whole, v0's page text standing in its segments", () => {
    for (const pg of [page(), page({ nu: true })]) {
      const r = filed(pg)
      expect(r.unproven).toBeUndefined()
      expect(partsOf(r.get(1))).toEqual(TWO)
    }
    // (and where v0's reading holds a character outside them, no proof: as before)
    // (its "g" read 10 before its segment's start)
    expect(filed(page().map(c => (c.item === 1 && c.ch === 'g' ? { ...c, x0: 140, x1: 145 } : c))).unproven).toBe(1)
  })
  it('read from its segments where v0 found no rendering (resolutionFrom: the rendering its row gives)', () => {
    const uc = page().map(c => ({ ...c, page: 1, rect: [1, 10, c.yb - 2, 200, c.yb + 8] }))
    const g = T.renderingOf(Float64Array.from(SEGS) as never, uc as never, false)
    const r = L2.resolutionFrom({ k: 1, src: "$g(z')=\\sum_n g_n$", cls: 'other' } as never, { ...g, proof: true } as never, u)
    expect(r).toMatchObject({ mode: 'crop', page: 1, baseline: 500 })
    expect(partsOf(r)).toEqual(TWO)
    // (each part's extent over and under its baseline its own segment's, never the rendering's box over both lines, which
    // would open the line under it by a line's depth: lineExtent)
    expect(L2.cropPartsOf(r).map(q => L2.lineExtent({ items: [{ t: { crop: q } }] } as never, 10, 1))).toMatchObject([{ a: 7, d: 2 }, { a: 7, d: 2 }])
  })
  it("without its own brackets where the translation sets its own: the first part cut after its opening one, the last before its closing one", () => {
    // "\uff08(x+" on the line at 500, "y)\uff09" on the next: the brackets' ink left out of the crops
    const ub = { kind: 'para', src: 'see (x+y)', pieces: [text('\u89c1\uff08'), ph('$(x+y)$'), text('\uff09')] } as never
    const segs = [1, 150, 500, 165, 507, 498, 1, 10, 488, 20, 495, 486]
    const uc = [...item('see', 10, 500, 10, 0), ...item('(x+', 150, 500, 10, 1, math), ...item('y)', 10, 488, 10, 2, math)].map(c => ({ ...c, page: 1, rect: [1, 10, c.yb - 2, 200, c.yb + 8] }))
    const g = T.renderingOf(Float64Array.from(segs) as never, uc as never, false)
    const r = L2.resolutionFrom({ k: 1, src: '$(x+y)$', cls: 'other' } as never, { ...g, proof: true } as never, ub)
    expect(partsOf(r)).toEqual([{ page: 1, baseline: 500, crop: [154.6, 497.7, 165.4, 507.3] }, { page: 1, baseline: 488, crop: [9.6, 485.7, 15.4, 495.3] }])
  })
  it('one line of segments (a tall operator, its rows two segments that meet) is one crop of their union', () => {
    const one = unitOf([L(500), L(488)], [[1, 0, [1, 150, 500, 200, 507, 498, 1, 160, 496, 190, 503, 494]]])
    const t = T.texRects(one)
    const pg1 = [...item('a b', 10, 500, 10, 0), ...item('g=', 150, 500, 10, 1, math), ...item('\u00cd', 170, 496, 10, 2, math), ...item('c d', 10, 488, 10, 4)]
    const r = L2.prepareUnit(u, t.rects as never, [pg1 as never], new Map() as never, null, T.texParts(one, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    expect(r.get(1)).toMatchObject({ mode: 'crop', page: 1, baseline: 500 })
    expect(r.get(1)?.parts).toBeUndefined()
  })
  it('a text piece TeX broke over lines stays its page text, which reflows', () => {
    const tt = { kind: 'para', src: 'a b c d', pieces: [text('\u7532 '), ph('\\texttt{ab cd}'), text(' \u4e59')] } as never
    const lt = unitOf([L(500), L(488)], [[1, 0, [1, 150, 500, 160, 507, 498, 1, 10, 488, 20, 495, 486]]])
    const t = T.texRects(lt)
    const pg = [...item('a b', 10, 500, 10, 0), ...item('ab', 150, 500, 10, 1, mono), ...item('cd', 10, 488, 10, 2, mono), ...item('c d', 50, 488, 10, 4)]
    const r = L2.prepareUnit(tt, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lt, [-1, 1, -1], { use: 'lines', lines: t }) as never)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'orig-text', text: 'ab cd' })
  })
})

describe("its crops in the line: TeX's break between them, a space apart where they stand on one", () => {
  const tokens = () => L2.tokensOf2(u, whole() as never, 'zh', BASE as never, DESIGNS as never, P as never, null, (s: string) => (s === ' ' ? 25 : 0))
  it('one crop token a part, a space between them; only the first carries the formula\'s copy text', () => {
    type CropTok = { crop?: { crop: number[]; baseline: number; text: string; part?: number }; space?: boolean; cw: number; glue?: boolean }
    const t = (tokens() as unknown as CropTok[]).filter(x => x.crop || x.space)
    expect(t.map(x => (x.crop ? `crop${x.crop.part}` : 'space'))).toEqual(['space', 'crop0', 'space', 'crop1', 'space'])
    const [a, b] = t.filter(x => x.crop)
    expect(round(a!.crop!.crop)).toEqual(TWO[0]!.crop)
    expect(round(b!.crop!.crop)).toEqual(TWO[1]!.crop)
    expect([a!.crop!.baseline, b!.crop!.baseline]).toEqual([500, 488])
    expect([a!.cw, b!.cw].map(w => Math.round(w * 100) / 100)).toEqual([50.8, 30.8])
    expect([a!.crop!.text, b!.crop!.text]).toEqual(["g(z')=\u03a3\u2099 g\u2099", ''])
    expect([a!.glue, b!.glue]).toEqual([false, false])
  })
  it('breaks the line between them where the two do not fit, and sets them side by side where they do', () => {
    const block = (width: number) => ({ page: 1, rects: [[1, 0, 498, width, 508], [1, 0, 486, width, 496]], x0: 0, x1: width, B: [500, 488], exact: [true, true], sizes: [10, 10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false })
    const crops = (l: ReturnType<typeof L2.layoutUnit2>) => l.lines.map(line => line.items.filter(it => it.t.crop).map(it => it.t.crop?.part))
    expect(crops(L2.layoutUnit2(tokens(), [block(60)] as never, 10, P as never))).toEqual([[0], [1]])
    expect(crops(L2.layoutUnit2(tokens(), [block(200)] as never, 10, P as never))).toEqual([[0, 1]])
  })
})

describe('every reader of a crop takes its parts', () => {
  const block = { page: 1, rects: [[1, 0, 498, 60, 508], [1, 0, 486, 60, 496]], x0: 0, x1: 60, B: [500, 488], exact: [true, true], sizes: [10, 10], pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
  const laid = () => {
    const prep = whole()
    const tokens = L2.tokensOf2(u, prep as never, 'zh', BASE as never, DESIGNS as never, P as never, null, (s: string) => (s === ' ' ? 25 : 0))
    return { prep, tokens, layout: L2.layoutUnit2(tokens, [block] as never, 10, P as never) }
  }
  const id = (x: number, y: number) => [x, y]
  it('the drawer cuts each part once, the svg copies the formula once, and the checker counts one showing, nothing lost', () => {
    const { prep, tokens, layout } = laid()
    const audit: { what: string; k?: number; part?: number; src?: number[] }[] = []
    L2.unitOps(layout as never, [], 1, { px: id, k: 1, hasSource: () => true, pxOf: () => id, audit: audit as never, id: 7 } as never)
    const crops = audit.filter(a => a.what === 'crop')
    expect(crops.map(a => [a.k, a.part, round(a.src!)])).toEqual([[1, 0, TWO[0]!.crop], [1, 1, TWO[1]!.crop]])
    const svg = L2.svgOfUnit(layout as never, 1, id as never, 1, 7)
    expect(svg.split("g(z')").length - 1).toBe(1)
    const check = (a: typeof audit) => {
      const placed = [{ id: 7, prep, tokens, unit: u, layout, pages: [1] }]
      // (the page as the crops show it: its first line's part "g=zz", so that the drawn order the checker reads, each crop as
      // the characters it shows, would hold a part twice where it took one part's for the other's)
      const chars2 = [[...page(), ...item('zz', 170, 500, 10, 9, math)].map(c => ({ ...c, page: 1 }))]
      return checkAll({ N: 1, placed: placed as never, rows: [], pxOf: () => id, toPdf: () => [0, 0], chars2: chars2 as never, audit: a as never, cols: () => [], cellRects: () => [] } as never)
    }
    const ok = check(audit)
    expect(ok.b.list.duplicated).toEqual([])
    expect(ok.b.list.missing).toEqual([])
    // (and in its drawn order, each part the characters it shows: no run drawn twice)
    expect(ok.c.list).toEqual([])
    // a part drawn twice is a crop drawn twice; a part not drawn is a crop not drawn
    expect(check([...audit, crops[1]!]).b.list.duplicated.map(d => d.why)).toContain('crop drawn 2 times')
    expect(check(audit.filter(a => a !== crops[1])).b.list.missing.map(d => d.why)).toEqual(['crop not drawn (clipped)'])
  })
  it("the word table: each part a token at its own drawn box", () => {
    const { layout } = laid()
    const W = newWords()
    addUnitWords(W, layout as never, 1, 7, null as never)
    expect(W.n).toBe(4)
    const crops = [...Array(W.n).keys()].filter(i => W.word[i] === -1 && W.r[i]! - W.l[i]! > 30)
    expect(crops.map(i => [Math.round(W.l[i]! * 100) / 100, Math.round(W.y[i]!)])).toEqual([[2.5, 500], [0, 488]])
  })
  it("the removal: a part on another page than the first is that page's crop, its glyphs and its clip", () => {
    // its second line the next page's first: the part there cut from page 2
    const two = unitOf([L(500), [2, 10, 200, 700, 707, 698, 10, 0]], [[1, 0, [1, 150, 500, 200, 507, 498, 2, 10, 700, 40, 707, 698]]]) as { ph: Map<number, unknown> }
    const r = { mode: 'crop', k: 1, page: 1, crop: [149.6, 497.7, 200.4, 507.3], baseline: 500, parts: [{ page: 1, crop: [149.6, 497.7, 200.4, 507.3], baseline: 500 }, { page: 2, crop: [9.6, 697.7, 40.4, 707.3], baseline: 700 }] }
    const prep = Object.assign(new Map([[1, r]]), { keep: [], uc: [], cat: new Map(), label: null }) as never
    const sw = fileSwap({ page: 2, lu: two as never, kOf: [-1, 1, -1], lines: { rects: [], lineOf: new Map(), jOf: [] } as never, prep })
    expect(sw.clips.get(1)?.own).toEqual([[10, 698, 40, 707]])
    const glyph = { u: 'x', x0: 12, x1: 17, y: 700, top: 707, bottom: 698, size: 10, font: 'F', ix0: 12, ix1: 17, n: 0, k: 0 }
    const ink = { glyphs: [glyph], boxes: [], paths: [], shows: 1 }
    const own = { owner: Int32Array.from([3]), ph: Int32Array.from([1]), paths: new Map(), linePaths: new Map() }
    const rm = unitRemoval({ id: 3, page: 2, prep, tex: { lu: two as never, kOf: [-1, 1, -1] }, own: own as never, charMap: new Map(), unmapped: [], ink: ink as never, claimed: new Map(), fileDrawn: new Set([3]) } as never)
    expect(rm.crops).toEqual([{ k: 1, glyphs: [0], paths: [] }])
  })
  it('the crop loop grows no part: each is a segment of the file, its ink TeX set', () => {
    const r = whole().get(1)
    expect(L2.cropGrows(r as never)).toBe(false)
    for (const q of L2.cropPartsOf(r as never)) expect(L2.cropGrows(q as never)).toBe(false)
  })
})
