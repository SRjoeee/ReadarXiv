import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A unit whose text runs on past a kept display (layer2.mjs layoutUnit2; the M1 survey of 2608.16117, German page 10): where
// nothing fits in order at any state of the fit, the text runs on past the display at the most natural state at which it then
// fits, not at the last state the in-order walk reached (the floor's size, which bought nothing once the text runs past).
// Two blocks of one unit around a display: two lines above it, three below; words of eight letters, two to a line of 110 at
// the original's size, three from 0.875 of it down (a character half an em: three words and two spaces are 125 at the original's)

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

/** a block of lines `step` apart from `top` down, 110 wide, after `after` kept regions, in flow `flow` */
const block = (top: number, n: number, after: number, flow: number, step = 12) => {
  const B = Array.from({ length: n }, (_, k) => top - step * k)
  return { page: 1, rects: B.map(b => [1, 0, b - 2, 110, b + 8]), x0: 0, x1: 110, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: step, free: 0, indent: 0, after, flow, centred: false }
}
const word = { s: 'xxxxxxxx', cls: 'latin', w100: 400, st: {} }, space = { space: true, w100: 25 }
/** n words, a space between each two */
const words = (n: number) => Array.from({ length: n }, (_, i) => (i ? [space, word] : [word])).flat()
const display = { blockTo: 0, w100: 0 }
const P = { ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0 }
const lay = (before: number, after: number, params: Record<string, unknown> = P) => L2.layoutUnit2([...words(before), display, ...words(after)] as never, [block(500, 2, 0, 0), block(440, 3, 1, 1)] as never, 10, params as never)
const drawn = (l: ReturnType<typeof lay>) => l.lines.map(x => [x.baseline, x.items.filter(it => it.t.s).length])

describe('a unit that fits only by running on past a display', () => {
  it('runs on past it at the original size, where it fits at the original size: never at the floor the in-order walk reached', () => {
    // (eight words before the display: four lines at the original size, three at the floor, and two above it; one after)
    const l = lay(8, 1)
    expect(l.clipped).toBe(false)
    expect(l.spilled).toBe(true)
    expect([l.scale, l.state.lead]).toEqual([1, P.leadBase])
    expect(drawn(l)).toEqual([[500, 2], [488, 2], [440, 2], [428, 2], [416, 1]])
  })

  it('takes the largest state at which it fits so, where it fits only smaller', () => {
    // (twelve words before the display and one after: seven lines two a line, five three a line; three a line from 0.875 of
    // the original's size, the first such state of the fit's, over the floor's 0.8)
    const l = lay(12, 1)
    expect(l.clipped).toBe(false)
    expect(l.spilled).toBe(true)
    expect([l.scale, l.state.lead]).toEqual([0.875, P.leadBase])
    expect(drawn(l)).toEqual([[500, 3], [488, 3], [440, 3], [428, 3], [416, 1]])
  })

  it('is drawn as before where it fits at no state, running past or not: the last state, as far as it goes', () => {
    const l = lay(30, 1)
    expect(l.clipped).toBe(true)
    expect([l.scale, l.state.lead]).toEqual([P.floor, P.leadFloor])
    // (the in-order walk's own answer where the text fits in order: the display not run past)
    const inOrder = lay(4, 1)
    expect([inOrder.clipped, inOrder.spilled, inOrder.scale]).toEqual([false, false, 1])
  })
})
