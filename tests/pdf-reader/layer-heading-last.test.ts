import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A heading its translation sets in fewer lines than the original's goes on the original's last lines (layer2.mjs laidOut,
// P.lastLines, which run.mjs sets for a unit of kind heading): the room it frees falls above it, not between it and the text it
// heads (the owner, 2026-10-19: 1810.04805's "C.2 Ablation for Different Masking Procedures", two lines, its Chinese one, left a
// blank line before its paragraph). A body paragraph keeps its first lines. Words of eight letters, a character half an em at
// 10 pt: two words and a space to a line of 110

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

/** a block of `n` lines `step` apart from `top` down, 110 wide */
const block = (top: number, n: number, step = 12) => {
  const B = Array.from({ length: n }, (_, k) => top - step * k)
  return { page: 1, rects: B.map(b => [1, 0, b - 2, 110, b + 8]), x0: 0, x1: 110, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: step, free: 0, indent: 0, after: 0, flow: 0, centred: false }
}
const word = { s: 'xxxxxxxx', cls: 'latin', w100: 400, st: {} }, space = { space: true, w100: 25 }
/** n words, a space between each two */
const words = (n: number) => Array.from({ length: n }, (_, i) => (i ? [space, word] : [word])).flat()
const P = { ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0 }
const lay = (n: number, blocks: ReturnType<typeof block>[], params: Record<string, unknown>) => L2.layoutUnit2(words(n) as never, blocks as never, 10, { ...P, ...params } as never)
/** each line's baseline and its target (the original's line it stands on) */
const placed = (l: ReturnType<typeof lay>) => l.lines.map(x => [x.baseline, x.target])

describe('a heading set in fewer lines than its original goes on the original\'s last lines', () => {
  it('two lines, its translation one: on the second (1810.04805 C.2)', () => {
    expect(placed(lay(2, [block(500, 2)], { lastLines: true }))).toEqual([[488, 1]])
  })

  it('three lines, its translation two: on the second and the third, the room above them', () => {
    expect(placed(lay(4, [block(500, 3)], { lastLines: true }))).toEqual([[488, 1], [476, 2]])
  })

  it('as many lines as the original\'s: where they were', () => {
    expect(placed(lay(4, [block(500, 2)], { lastLines: true }))).toEqual([[500, 0], [488, 1]])
  })

  it('never nearer the next line of its column than its size: where the original\'s room under its last line is less, as far down as that room allows', () => {
    // (the next line 6 under the original's last baseline, the heading set at 10: its baseline 4 over the last)
    expect(placed(lay(2, [block(500, 2)], { lastLines: true, halfLead: { head: true, foot: true, below: 6 } }))).toEqual([[492, null]])
    // (room enough: on it)
    expect(placed(lay(2, [block(500, 2)], { lastLines: true, halfLead: { head: true, foot: true, below: 18 } }))).toEqual([[488, 1]])
  })

  it('a body paragraph, or a heading over two blocks (a column or a page apart), keeps its first lines', () => {
    expect(placed(lay(2, [block(500, 2)], {}))).toEqual([[500, 0]])
    expect(placed(lay(2, [block(500, 1), block(300, 1)], { lastLines: true }))).toEqual([[500, 0]])
  })

  it('the page fill\'s lay at a state places it so too', () => {
    const l = lay(2, [block(500, 2)], { lastLines: true })
    const at = L2.layoutAt(words(2) as never, [block(500, 2)] as never, 10, { ...P, lastLines: true } as never, l.state)
    expect(placed(at)).toEqual([[488, 1]])
  })
})
