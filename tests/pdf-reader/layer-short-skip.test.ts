import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A line laid over a display TeX set under it with its short skip (layer2.mjs slotsAt; 2608.16117 page 23, unit 76 in German):
// TeX sets \abovedisplayshortskip, nothing but stretch, where the line before a display ends 2 em or more before the display's
// start (\predisplaysize), so the display may stand a point under that line's baseline. The original's line was short; the
// translation's laid there ran on over the display and its descenders into it. The line laid over a display nearer than its
// descent reaches ends 2 em before the display, as TeX's own test asks; the fit sets what no longer fits there.
// One block of two lines, 12 apart from 500 down, 300 wide; words of eight letters, a character half an em (40 at the original's
// size of 10), spaces of a quarter em: seven words fill the first line, the eleventh word's line ends at 167.5

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
})

type Display = { x0: number; x1: number; top: number; bottom: number }
/** the block, with the displays TeX set with its short skip on its page (run.mjs gives it tex.mjs shortSkipsOf's) */
const block = (shortSkips?: Display[]) => {
  const B = [500, 488]
  return { page: 1, rects: B.map(b => [1, 0, b - 2, 300, b + 8]), x0: 0, x1: 300, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, flow: 0, centred: false, ...(shortSkips ? { shortSkips } : {}) }
}
const word = { s: 'xxxxxxxx', cls: 'latin', w100: 400, st: {} }, space = { space: true, w100: 25 }
const words = (n: number) => Array.from({ length: n }, (_, i) => (i ? [space, word] : [word])).flat()
const P = { ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0 }
const lay = (displays?: Display[]) => L2.layoutUnit2(words(11) as never, [block(displays)] as never, 10, P as never)
/** each laid line: its baseline, where its text ends, its words */
const drawn = (l: ReturnType<typeof lay>) => l.lines.map(x => [x.baseline, Math.round((x.x0 + x.used) * 100) / 100, x.items.filter(it => it.t.s).length])

describe('a line over a display TeX set under it with its short skip', () => {
  it('ends 2 em before the display, the fit setting the rest: never over it', () => {
    // (a display from x 150 to 250 whose top is 1.1 under the last line's baseline, as TeX's short skip set it)
    const l = lay([{ x0: 150, x1: 250, top: 486.9, bottom: 460 }])
    expect(l.clipped).toBe(false)
    expect(l.lines.flatMap(x => x.items).filter(it => it.t.s).length).toBe(11)
    const last = l.lines.filter(x => x.baseline === 488)
    expect(last.length).toBe(1)
    expect(last[0]!.x0 + last[0]!.used).toBeLessThanOrEqual(150 - 2 * l.f + 1e-9)
    // (the line no longer holds the four words it did over the display: the fit took a smaller state for them)
    expect(l.scale < 1 || (l.state.trackLatin ?? 0) < 0).toBe(true)
  })

  it('is laid as with no display where the display stands further under it, or beside none of it', () => {
    const none = drawn(lay())
    expect(none.length).toBe(2)
    expect(none[1]).toEqual([488, 167.5, 4])
    // (TeX's \abovedisplayskip: the display's top 0.8 em under the baseline, out of the descent's reach)
    expect(drawn(lay([{ x0: 150, x1: 250, top: 480, bottom: 460 }]))).toEqual(none)
    // (a display right of where the line's slot ends, over the line before it, or a display's row on the line's own band)
    expect(drawn(lay([{ x0: 310, x1: 400, top: 487, bottom: 460 }]))).toEqual(none)
    expect(drawn(lay([{ x0: 150, x1: 250, top: 530, bottom: 503 }]))).toEqual(none)
    expect(drawn(lay([{ x0: 150, x1: 250, top: 495, bottom: 484 }]))).toEqual(none)
  })
})

describe("the displays TeX set with its short skip (tex.mjs shortSkipsOf), which run.mjs gives each block on its page", () => {
  // (2608.16117 page 23, unit 76: its line 14 ends at 106.4 at 11.96 pt, the matrix under it from 220.4, its top 1.16 under the
  // line's baseline. A unit's lines in the file: page, x0, x1, baseline, top, bottom, size, font; a placeholder's segments:
  // page, x0, baseline, x1, top, bottom)
  const row = (kind: string, flags: number, segs: number[]) => ({ kind, flags, segs: Float64Array.from(segs) })
  const unitOf = (lines: number[][], ph: [number, ReturnType<typeof row>][], held: number[] = []) => ({ lines: Float64Array.from(lines.flat()), ph: new Map(ph), held }) as never
  const line = (x1: number, base = 263.34, page = 23) => [page, 79.37, x1, base, base + 8.6, base - 2.6, 11.96, 0]
  const matrix = [23, 220.4, 240.2, 391.9, 262.18, 219.2]
  const seg = { page: 23, x0: 220.4, base: 240.2, x1: 391.9, top: 262.18, bottom: 219.2 }
  it('a display under a line of the unit that ends 2 em before it, in reach of its descent: its segment, with that line', () => {
    expect(T.shortSkipsOf(unitOf([line(532.9, 277.79), line(106.36)], [[31, row('display', 0, matrix)]]))).toEqual([{ ...seg, line: 1 }])
  })
  it('none under a line that runs on over it (TeX set no short skip there), nor out of its reach, nor on another page', () => {
    expect(T.shortSkipsOf(unitOf([line(532.9)], [[31, row('display', 0, matrix)]]))).toEqual([])
    // (a line ending 1.5 em before it: TeX's test asks 2)
    expect(T.shortSkipsOf(unitOf([line(220.4 - 1.5 * 11.96)], [[31, row('display', 0, matrix)]]))).toEqual([])
    // (the display 0.5 em under the line, its \abovedisplayskip's room)
    expect(T.shortSkipsOf(unitOf([line(106.36, 262.18 + 0.5 * 11.96)], [[31, row('display', 0, matrix)]]))).toEqual([])
    expect(T.shortSkipsOf(unitOf([line(106.36, 263.34, 22)], [[31, row('display', 0, matrix)]]))).toEqual([])
  })
  it('none for a display LOST or EMPTY, a row of another kind, or under a line the unit holds (a display\'s own row)', () => {
    expect(T.shortSkipsOf(unitOf([line(106.36)], [[31, row('display', 32, [])], [32, row('display', 16, [])], [33, row('math', 0, matrix)]]))).toEqual([])
    expect(T.shortSkipsOf(unitOf([line(532.9, 290), line(106.36)], [[31, row('display', 0, matrix)]], [1]))).toEqual([])
  })
})

describe("a display TeX set with its short skip is the block's of the line set short before it (layer2.mjs shortSkipsTo)", () => {
  // (two columns of one page: the left column's last line ends at 120, the right column's line over a display runs on over it to
  // 550; the display, from 330 in the right column, 0.8 under both baselines. TeX's short skip is the right line's to give, and
  // that line runs over the display: none. The left line, short of the display's start though it is, stands over no part of
  // it and makes no short skip of the right column's: the right block's line is laid over the display as the original's is)
  const row = (kind: string, flags: number, segs: number[]) => ({ kind, flags, segs: Float64Array.from(segs) })
  const lines = [[3, 50, 120, 400, 408, 397.5, 10, 0], [3, 310, 550, 400, 408, 397.5, 10, 0]]
  const lu = { lines: Float64Array.from(lines.flat()), ph: new Map([[5, row('display', 0, [3, 330, 385, 520, 399.2, 372])]]), held: [] } as never
  const blockOf = (x0: number, x1: number, j: number) => ({ page: 3, rects: [[3, x0, 397.85, lines[j]![2]!, 406.83]], x0, x1, B: [400], exact: [true], sizes: [10], pitch0: null, free: 0, indent: 0, after: 0, flow: j, centred: false, j })
  const info = new Map(lines.map((l, j) => [`3|${l[1]},397.85,${l[2]},406.83`, { baseline: 400, size: 10, exact: true, file: true, j }]))
  it('a left column\'s short line gives the right column\'s display to its own block alone, which no slot of it meets', () => {
    const skips = T.shortSkipsOf(lu)
    expect(skips.map(d => [d.x0, d.line])).toEqual([[330, 0]])
    const left = blockOf(50, 290, 0), right = blockOf(310, 550, 1)
    L2.shortSkipsTo([left, right] as never, skips, info as never)
    expect([(left as { shortSkips?: unknown[] }).shortSkips?.length, (right as { shortSkips?: unknown[] }).shortSkips]).toEqual([1, undefined])
    // (the right column's line laid over the display, as with no display at all: five words, 40 each, to 520)
    const layRight = (b: object) => L2.layoutUnit2(words(5) as never, [b] as never, 10, P as never).lines.map(x => [x.baseline, Math.round((x.x0 + x.used) * 100) / 100])
    expect(layRight(right)).toEqual([[400, 520]])
    expect(layRight(blockOf(310, 550, 1))).toEqual([[400, 520]])
  })
})
