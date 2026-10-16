import { beforeAll, describe, expect, it } from 'vitest'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// Two readings of 2609.26457 (zh) where the layer drew something other than TeX set, each fixed by what the page's lines
// and the layout file's segments say: a paragraph beside a wrapped figure laid at the width of its widest line (over the
// figure's caption), and a placeholder v0 found nowhere left unproven where the file holds its ink. The layer gate
// measures the drawing; these are the rules, on made-up pages.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
beforeAll(async () => {
  // a canvas that measures a character as half an em (layer2.mjs measures with one made when it loads)
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
})

const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false } as never
const math = { fam: 'math', bold: false, italic: false, caps: false, known: false } as never
/** a text item's characters, each half its size wide, from x on baseline yb */
const item = (text: string, x: number, yb: number, size: number, n: number, st = serif) => [...text].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item: n, ix: x, k, st }))
/** a unit in the layout file as indexLayout reads it: lines (page, x0, x1, baseline, top, bottom, size, font), one frame
 *  a page, its placeholders by k */
const unitOf = (lines: number[][], ph: [number, number, number[]][] = []) => {
  const frames: number[] = []
  lines.forEach((l, j) => { const page = l[0] ?? 0; if (!j || page !== lines[j - 1]?.[0]) frames.push(page, 0, j, 0, -1, 0); frames[frames.length - 3] = (frames[frames.length - 3] ?? 0) + 1 })
  return { lines: Float64Array.from(lines.flat()), frames: Float64Array.from(frames), erase: lines.map(() => new Float64Array(0)), ph: new Map(ph.map(([k, flags, segs]) => [k, { kind: 'math', flags, segs: Float64Array.from(segs) }])), labels: new Float64Array(0) } as never
}
const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
const rect = [1, 10, 97.85, 230, 106.83]
const fileLine = [1, 10, 230, 100, 108, 97, 10, 0]

describe("a paragraph's measure where TeX changed it: each slot its line's (F5)", () => {
  /** a paragraph of n lines at size 10, 13.5 apart from 700, its first line indented 15; `x1(i)` each line's end,
   *  `x0(i)` its start */
  const para = (n: number, x1: (i: number) => number, x0: (i: number) => number = i => (i === 0 ? 77 : 62)) => Array.from({ length: n }, (_, i) => [1, x0(i), 700 - 13.5 * i - 2.15, x1(i), 700 - 13.5 * i + 6.83])
  const views = [[0, 0, 612, 792]]
  const keyOf = (r: number[]) => `${r[0]}|${r.slice(1).join()}`
  const measures = (rects: number[][]) => {
    const [b, ...rest] = L2.blocksOf2(rects as never, views)
    expect(rest).toHaveLength(0)
    return b?.measures ? rects.map(r => b.measures?.get(keyOf(r))) : null
  }
  // 2609.26457 page 8, unit 43: seven lines beside a wrapped figure end at 283, the rest at 533, its last at 400
  const wrapped = para(20, i => (i < 7 ? 283 + (i % 2) * 0.4 : i === 19 ? 400 : 533))
  it('splits the lines beside a wrapped figure from those under it, each run its own edge', () => {
    const m = measures(wrapped)
    expect(m?.slice(0, 7).every(e => e?.[0] === 62 && e[1] === 283.4)).toBe(true)
    expect(m?.slice(7).every(e => e?.[0] === 62 && e[1] === 533)).toBe(true)
  })
  it('and the reverse: a measure narrowed after the first lines (a figure wrapped lower, \\hangindent)', () => {
    const m = measures(para(16, i => (i < 5 ? 533 : i === 15 ? 200 : 283)))
    expect(m?.slice(0, 5).every(e => e?.[1] === 533)).toBe(true)
    expect(m?.slice(5).every(e => e?.[1] === 283)).toBe(true)
  })
  it('on the left too, the first line indented beside its figure', () => {
    const m = measures(para(12, () => 533, i => (i === 0 ? 315 : i < 7 ? 300 : 62)))
    expect(m?.slice(0, 7).every(e => e?.[0] === 300)).toBe(true)
    expect(m?.slice(7).every(e => e?.[0] === 62)).toBe(true)
  })
  it("a widened measure's last line may end short of it: one long line and the last after the figure", () => {
    const m = measures(para(9, i => (i < 7 ? 283 : i === 7 ? 533 : 300)))
    expect(m?.[6]?.[1]).toBe(283)
    expect(m?.[7]?.[1]).toBe(533)
    expect(m?.[8]?.[1]).toBe(533)
  })
  it('no step where the edge does not stay: a ragged or broken line alone, a short line before the last, two columns', () => {
    expect(measures(para(10, i => (i === 5 ? 400 : i === 9 ? 300 : 533)))).toBeNull()
    expect(measures(para(8, i => (i === 6 ? 400 : i === 7 ? 300 : 533)))).toBeNull()
    expect(measures(para(10, i => 533 - (i % 3) * 3))).toBeNull()
    // two columns: a block each, neither stepped
    const cols = [...para(6, () => 300), ...para(6, () => 550, () => 312)]
    const blocks = L2.blocksOf2(cols as never, views)
    expect(blocks).toHaveLength(2)
    expect(blocks.map(b => b.measures ?? null)).toEqual([null, null])
  })
  const P = { ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0, hyphen: 0, lineskip: null, order: [], growTo: 1 }
  const face = { id: 'serif', family: 'F', weight: 400, style: 'normal', size: 1 }
  const words = (n: number) => Array.from({ length: n }, (_, i) => [...(i ? [{ space: true, w100: 25 }] : []), { s: 'xxxxxxx', cls: 'latin', w100: 350, st: {}, face }]).flat()
  it('lays each line in its own measure, on one grid across the change', () => {
    const blocks = L2.blocks2(wrapped as never, views, null, new Map())
    expect(blocks).toHaveLength(1)
    const l = L2.layoutUnit2(words(110) as never, blocks, 10, { ...P, leadBase: 1 } as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.slice(0, 7).map(x => x.x1)).toEqual(Array(7).fill(283.4))
    expect(l.lines.slice(7, 19).every(x => x.x1 === 533)).toBe(true)
    // (a looser leading: its slots one pitch apart through the change, the slot between a line of each measure the narrower)
    const loose = L2.layoutUnit2(words(60) as never, blocks, 10, { ...P, leadBase: 1.3 } as never)
    const gaps = loose.lines.slice(1).map((x, i) => (loose.lines[i]?.baseline ?? 0) - x.baseline)
    expect(new Set(gaps.map(g => g.toFixed(3))).size).toBe(1)
    const b7 = 700 - 13.5 * 7
    for (const x of loose.lines) expect(x.x1).toBe(x.baseline > b7 + 0.05 ? 283.4 : 533)
    expect(loose.lines.some(x => x.baseline > b7 + 0.05 && x.baseline < b7 + 13.5 - 0.05)).toBe(true)
  })
  it("erases a line beside the figure to its own measure's edge, not over the figure", () => {
    const blocks = L2.blocks2(wrapped as never, views, null, new Map())
    const px = (x: number, y: number): [number, number] => [x, 792 - y]
    const ops = L2.unitOps({ scale: 1, lines: [] } as never, blocks, 1, { px, k: 1, hasSource: () => true, pxOf: () => px })
    const right = ops.map(o => (o as { box: number[] }).box).map(b => (b[0] ?? 0) + (b[2] ?? 0))
    expect(right.slice(0, 7).every(x => x < 290)).toBe(true)
    expect(right.slice(7, 19).every(x => x > 530)).toBe(true)
  })
})

describe('a placeholder v0 finds nowhere, read from the file where it holds its ink (F6)', () => {
  // "The agent a^out is driven": v0's alignment takes "a" and "out" for the source's words and finds no rendering
  const page = [...item('The agent', 10, 100, 10, 0), ...item('a', 60, 100, 10, 1, math), ...item('out', 65, 103.6, 7.3, 2, math), ...item('is driven', 90, 100, 10, 3)]
  const unit = { kind: 'para', src: 'The agent a out is driven', pieces: [text('\u5916\u5FAA\u73AF\u4EE3\u7406 '), ph('$a^{\\mathrm{out}}$'), text(' \u7531')] } as never
  const read = (lu: never | null, shown = Infinity) => L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never, null, { proof: T.proofOf(lu, [-1, 1, -1], shown) } as never)
  it("v0 alone draws it from its source, which no proof holds", () => {
    expect(L2.prepareUnit(unit, [rect.slice()] as never, [page as never], new Map() as never).get(1)?.mode).toBe('source')
    expect(read(null).unproven).toBe(1)
  })
  it("crops it at its row's segment, on the segment's baseline, the unit drawn", () => {
    const r = read(unitOf([fileLine], [[1, 0, [1, 59.6, 100, 76.2, 109.2, 99.6]]]))
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'crop', baseline: 100, k: 1, src: '$a^{\\mathrm{out}}$' })
    for (const [i, v] of [59.2, 99.3, 76.6, 109.5].entries()) expect(r.get(1)?.crop?.[i]).toBeCloseTo(v, 6)
    // (its characters are the crop's: erased with the line, shown by the crop)
    expect(page.filter(c => c.item === 1 || c.item === 2).every(c => r.cat.get(`1|${c.item}|${c.k}`) === 'acc')).toBe(true)
  })
  it('never where the file has no ink for it: its row LOST, its segment holding none of the unit, a segment on a page not shown', () => {
    expect(read(unitOf([fileLine], [[1, PH_FLAG.LOST, []]])).unproven).toBe(1)
    expect(read(unitOf([fileLine], [[1, 0, [1, 150, 100, 170, 108, 97]]])).unproven).toBe(1)
    expect(read(unitOf([fileLine], [[1, 0, [1, 59.6, 100, 76.2, 109.2, 99.6, 2, 10, 600, 30, 608, 598]]]), 1).unproven).toBe(1)
  })
  it("a reference read as its page text in its segment, its own brackets left out where the translation sets its own", () => {
    const pg = [...item('see equation', 10, 100, 10, 0), ...item('(1)', 80, 100, 10, 1), ...item('here', 100, 100, 10, 2)]
    const eq = { kind: 'para', src: 'see equation 1 here', pieces: [text('\u89C1\u5F0F\uFF08'), ph('\\eqref{eq:x}'), text('\uFF09')] } as never
    const r = L2.prepareUnit(eq, [rect.slice()] as never, [pg as never], new Map() as never, null, { proof: T.proofOf(unitOf([fileLine], [[1, 0, [1, 80, 100, 95, 108, 97]]]), [-1, 1, -1]) } as never)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'orig-text', text: '1' })
    expect(r.get(1)?.gap).toMatchObject({ unbracketed: true })
  })
})
