import { beforeAll, describe, expect, it } from 'vitest'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// Three readings of 2609.26457 (zh) where the layer drew something other than TeX set, each fixed by what the page's
// characters and the layout file's segments say, never by a name: a text macro that sets a raised script drawn as text on
// one baseline ("AIDE 2" for AIDE^2), a paragraph beside a wrapped figure laid at the width of its
// widest line (over the figure's caption), and a placeholder drawn from the file's ink for it.
// The layer gate measures the drawing; these are the rules, on made-up pages.

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
const fileLine = [1, 10, 230, 100, 108, 97, 10, 0]

describe('a text macro that sets a raised script is cropped from its ink, never set on one baseline (F4)', () => {
  // "compare against AIDE^2, a production agent": the macro's "AIDE" at the line's size, its superscript "2" at 0.73 of it
  // and 4.3 pt up (2609.26457's \aidesq{}, \ensuremath{\mathrm{AIDE}^{2}}), which page text on one baseline reads "AIDE 2"
  const page = (macro: ReturnType<typeof item>) => [...item('compare against', 10, 100, 10, 0), ...macro, ...item(', a production agent', 130, 100, 10, 3)]
  const sq = [...item('AIDE', 90, 100, 10, 1), ...item('2', 110, 104.3, 7.3, 2, math)]
  const human = [...item('AIDE', 90, 100, 10, 1), ...item('human', 110, 98, 7.3, 2, math)]
  const unit = (src: string) => ({ kind: 'para', src: 'compare against , a production agent', pieces: [text('\u4E0E '), ph(src), text('\uFF0C\u4E00\u4E2A\u751F\u4EA7\u4EE3\u7406')] }) as never
  const readFile = (src: string, lu: never, macro: ReturnType<typeof item>) => {
    const t = T.texRects(lu)
    return L2.prepareUnit(unit(src), t.rects as never, [page(macro) as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
  }
  const lu = unitOf([fileLine], [[1, 0, [1, 90, 100, 113.65, 109.3, 99.7]]])
  it("with the layout file: the crop is the segment's box on the segment's baseline, the superscript in it", () => {
    const r = readFile('\\aidesq{}', lu, sq)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'crop', baseline: 100, text: 'AIDE 2' })
    for (const [i, v] of [89.6, 99.4, 114.05, 109.6].entries()) expect(r.get(1)?.crop?.[i]).toBeCloseTo(v, 6)
    // (its characters the crop's, the "2" too: erased with the line and shown once, in the crop)
    expect(sq.every(c => r.cat.get(`1|${c.item}|${c.k}`) === 'acc')).toBe(true)
  })
  it('a raised letter (\\LaTeX\'s A) is cropped on its line\'s baseline', () => {
    const latex = [...item('L', 90, 100, 10, 1), ...item('A', 94, 102.1, 7.3, 2), ...item('TEX', 98, 100, 10, 4)]
    const r = readFile('\\mylatex{}', unitOf([fileLine], [[1, 0, [1, 90, 100, 113, 108, 99.7]]]), latex).get(1)
    expect(r?.mode).toBe('crop')
    expect(r?.baseline).toBe(100)
  })
  it('a lowered script (AIDE_human, BERT_BASE) or letter (\\TeX\'s E) reads as the same words: page text, which breaks', () => {
    const low = unitOf([fileLine], [[1, 0, [1, 90, 100, 128.25, 107.2, 96.4]]])
    expect(readFile('\\aidehuman{}', low, human).get(1)).toMatchObject({ mode: 'orig-text', text: 'AIDE human' })
    const tex = [...item('T', 90, 100, 10, 1), ...item('E', 95, 97.85, 10, 2), ...item('X', 100, 100, 10, 4)]
    expect(readFile('\\mytex{}', unitOf([fileLine], [[1, 0, [1, 90, 100, 105, 108, 97.5]]]), tex).get(1)?.mode).toBe('orig-text')
  })
  it("a macro of one size on one baseline stays the page's text, as one broken over two lines does", () => {
    expect(readFile('\\bert{}', unitOf([fileLine], [[1, 0, [1, 90, 100, 110, 108, 97]]]), item('BERT', 90, 100, 10, 1)).get(1)).toMatchObject({ mode: 'orig-text', text: 'BERT' })
    // (two lines of the file, the macro's "AIDE" at the end of the first and its "2" at the head of the second)
    const two = unitOf([[1, 10, 230, 100, 108, 97, 10, 0], [1, 10, 230, 88, 96, 85, 10, 0]], [[1, 0, [1, 80, 100, 100, 108, 97, 1, 10, 90.3, 17.3, 95, 88]]])
    const t = T.texRects(two)
    const pg = [...item('compare against AIDE', 10, 100, 10, 0), ...item('2', 10, 92.3, 7.3, 1, math), ...item(', a production agent', 30, 88, 10, 3)]
    expect(L2.prepareUnit(unit('\\aidesq{}'), t.rects as never, [pg as never], new Map() as never, null, T.texParts(two, [-1, 1, -1], { lines: t }) as never).get(1)?.mode).toBe('orig-text')
  })
  it('a formula and a macro with arguments are cropped as before', () => {
    expect(readFile('$\\mathrm{AIDE}_{\\mathrm{human}}$', unitOf([fileLine], [[1, 0, [1, 90, 100, 128.25, 107.2, 96.4]]]), human).get(1)?.mode).toBe('crop')
    expect(readFile('\\aidek{0}', unitOf([fileLine], [[1, 0, [1, 90, 100, 115, 108, 96]]]), [...item('AIDE', 90, 100, 10, 1), ...item('0', 110, 98, 7.3, 2, math)]).get(1)?.mode).toBe('crop')
  })
  it('scriptedOf: a character raised a tenth of an em over the main glyphs; never a lowered one, a smaller one, or one alone', () => {
    expect(L2.scriptedOf(sq as never)).toBe(true)
    expect(L2.scriptedOf(human as never)).toBe(false)
    expect(L2.scriptedOf(item('BERT', 90, 100, 10, 1) as never)).toBe(false)
    expect(L2.scriptedOf([...item('ab', 90, 100, 10, 1), ...item('c', 100, 100.5, 10, 2)] as never)).toBe(false)
    expect(L2.scriptedOf([...item('S', 90, 100, 10, 1), ...item('MALL', 95, 100, 8, 2)] as never)).toBe(false)
    expect(L2.scriptedOf(item('2', 110, 104, 7, 2) as never)).toBe(false)
  })
})

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
})

describe('a placeholder read from the file where it holds its ink (F6)', () => {
  // "The agent a^out is driven": the alignment takes "a" and "out" for the source's words, the file's segment holds them
  const page = [...item('The agent', 10, 100, 10, 0), ...item('a', 60, 100, 10, 1, math), ...item('out', 65, 103.6, 7.3, 2, math), ...item('is driven', 90, 100, 10, 3)]
  const unit = { kind: 'para', src: 'The agent a out is driven', pieces: [text('\u5916\u5FAA\u73AF\u4EE3\u7406 '), ph('$a^{\\mathrm{out}}$'), text(' \u7531')] } as never
  const read = (lu: never, shown = Infinity) => {
    const t = T.texRects(lu)
    return L2.prepareUnit(unit, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t, shown }) as never)
  }
  it("crops it at its row's segment, on the segment's baseline, the unit drawn", () => {
    const r = read(unitOf([fileLine], [[1, 0, [1, 59.6, 100, 76.2, 109.2, 99.6]]]))
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'crop', baseline: 100, k: 1, src: '$a^{\\mathrm{out}}$' })
    for (const [i, v] of [59.2, 99.3, 76.6, 109.5].entries()) expect(r.get(1)?.crop?.[i]).toBeCloseTo(v, 6)
    // (its characters are the crop's: erased with the line, shown by the crop)
    expect(page.filter(c => c.item === 1 || c.item === 2).every(c => r.cat.get(`1|${c.item}|${c.k}`) === 'acc')).toBe(true)
  })
  it('never where the file has no ink for it: its row LOST (the unit is the original\'s); a segment holding none of the unit is its own ink', () => {
    expect(read(unitOf([fileLine], [[1, PH_FLAG.LOST, []]])).unproven).toBe(1)
    const elsewhere = read(unitOf([fileLine], [[1, 0, [1, 150, 100, 170, 108, 97]]]))
    expect(elsewhere.unproven).toBeUndefined()
    expect(elsewhere.get(1)).toMatchObject({ mode: 'crop', baseline: 100 })
  })
  it("a reference read as its page text in its segment, its own brackets left out where the translation sets its own", () => {
    const pg = [...item('see equation', 10, 100, 10, 0), ...item('(1)', 80, 100, 10, 1), ...item('here', 100, 100, 10, 2)]
    const eq = { kind: 'para', src: 'see equation 1 here', pieces: [text('\u89C1\u5F0F\uFF08'), ph('\\eqref{eq:x}'), text('\uFF09')] } as never
    const lu = unitOf([fileLine], [[1, 0, [1, 80, 100, 95, 108, 97]]]), t = T.texRects(lu)
    const r = L2.prepareUnit(eq, t.rects as never, [pg as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never)
    expect(r.unproven).toBeUndefined()
    expect(r.get(1)).toMatchObject({ mode: 'orig-text', text: '1' })
    expect(r.get(1)?.gap).toMatchObject({ unbracketed: true })
  })
})
