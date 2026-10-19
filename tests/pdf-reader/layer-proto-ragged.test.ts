import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A line TeX's own break closes is set ragged (E3b, 2026-10-19): the part of a paragraph before a display ends with
// \parfillskip, and a forced break (`\\`) is \hfil\break, so the line each closes keeps its natural spacing, as the unit's
// last line does. The fit's unit-wide state (its tracking) still holds on it: only the justification goes. Before, the line
// before a display was justified to the column's edge, a CJK line's gaps spread up to cjkJust (2610.10069 page 4).

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const face = { id: 'serif', family: 'F', weight: 400, style: 'normal', size: 1 }
// a Latin word of n letters, 5 pt each at size 10; a space 2.5 pt
const word = (n: number) => ({ s: 'x'.repeat(n), cls: 'latin', w100: 50 * n, st: {}, face })
const space = { space: true, w100: 25 }
// a CJK character `w100` wide (10.1 pt at size 10: ten of them overrun a 100 pt line unless the fit tracks them in)
const han = (w100 = 101) => ({ s: '\u5b57', cls: 'cjk', w100, st: {}, face })
/** a block of lines 12 pt apart from `from`, 100 pt wide, at size 10, after `after` kept regions */
const block = (from: number, n: number, after: number) => {
  const B = Array.from({ length: n }, (_, k) => from - 12 * k)
  return { page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after, centred: false }
}
const P = (to: string) => ({ ...resolveRules(BUILTIN_RULES, to).params, borrow: 0, hyphen: 0, leadBase: 1, leadFloor: 1, lineskip: null })
/** n words of two letters with a space between: eight of them are 97.5 pt, a line of 100 justified by 0.36 pt a space */
const words = (n: number) => Array.from({ length: n }, (_, i) => (i ? [space, word(2)] : [word(2)])).flat()
/** each item's left edge but a space's, rounded to a hundredth */
const xs = (line: { items: { x: number; t: { space?: boolean } }[] }) => line.items.filter(it => !it.t.space).map(it => Math.round(it.x * 100) / 100)

describe('a line that TeX ends with a display or a forced break is set ragged', () => {
  it('sets the line before a display at its natural width, while a line the width ends stays justified', () => {
    // two lines before the display, the second ended by it; one line after it, below it
    const tokens = [...words(16), { blockTo: 0, w100: 0 }, ...words(2)]
    const l = L2.layoutUnit2(tokens as never, [block(500, 2, 0), block(300, 1, 1)] as never, 10, P('de') as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.mode)).toEqual(['just', 'last', 'last'])
    // the first line is spread to the edge; the second keeps its 2.5 pt spaces
    expect(l.lines[0]!.used).toBeCloseTo(100, 6)
    expect(xs(l.lines[1]!).slice(0, 3)).toEqual([0, 12.5, 25])
    expect(l.lines[1]!.used).toBeCloseTo(97.5, 6)
  })

  it('sets it so where the text runs on past the display (flowPast): the line the display breaks', () => {
    // one line's room before the display, three after it, the original's one line below it: the text after the display runs
    // on into the slots above it, the display breaking the line once (layer-proto-step3's case)
    const tokens = [...words(8), { blockTo: 0, w100: 0 }, ...words(24)]
    const l = L2.layoutUnit2(tokens as never, [block(500, 4, 0), block(300, 1, 1)] as never, 10, { ...P('de'), flowPast: true } as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.mode)).toEqual(['last', 'just', 'just', 'last'])
    expect(l.lines[0]!.used).toBeCloseTo(97.5, 6)
  })

  it('sets the line a forced break ends at its natural width', () => {
    const tokens = [...words(16), { newline: 0, room: 0, w100: 0 }, ...words(2)]
    const l = L2.layoutUnit2(tokens as never, [block(500, 3, 0)] as never, 10, P('de') as never)
    expect(l.clipped).toBe(false)
    expect(l.lines.map(x => x.mode)).toEqual(['just', 'last', 'last'])
    expect(l.lines[1]!.used).toBeCloseTo(97.5, 6)
  })

  it("keeps the fit's tracking on it: a CJK line before a display drops its justification, not the unit's letter spacing", () => {
    // ten characters of 10.1 pt overrun the 100 pt lines until the fit tracks them in by 0.01 em: the state holds for every
    // line, the one the display ends too; its nine characters stand 10 pt apart, not spread over the line's 10 pt of slack
    const tokens = [...Array.from({ length: 19 }, () => han()), { blockTo: 0, w100: 0 }, ...Array.from({ length: 10 }, () => han())]
    const l = L2.layoutUnit2(tokens as never, [block(500, 2, 0), block(300, 1, 1)] as never, 10, P('zh') as never)
    expect(l.clipped).toBe(false)
    expect(l.state.track).toBeCloseTo(-0.01, 9)
    expect(l.lines.map(x => x.items.length)).toEqual([10, 9, 10])
    expect(l.lines.map(x => x.mode)).toEqual(['just', 'last', 'last'])
    expect(xs(l.lines[1]!)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80])
  })
})
