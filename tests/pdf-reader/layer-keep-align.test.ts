import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules, SCRIPTS } from '@/pdf-reader/engine/rules/layout.mjs'

// A unit TeX set flush left (\raggedright, flushleft, ragged2e's \RaggedRight, a class's ragged heading) or flush right
// (\raggedleft, flushright) keeps that alignment (lane B's B2, the maintainer's ruling of 2026-10-29, `keepAlign` on in every
// script). The layout file says so only where the marked original's log tells it (UNIT_FLAG.FLUSH_LEFT, FLUSH_RIGHT:
// layout-make.test.ts); run.mjs gives the unit's blocks `flush` where the rules keep it (P.keepAlign), and placeItems sets its
// lines by it.

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
/** a block of n lines 12 pt apart from 500, 100 pt wide (x 0 to 100), at size 10; `flush` as run.mjs sets it */
const block = (n: number, flush?: 'left' | 'right') => {
  const B = Array.from({ length: n }, (_, k) => 500 - 12 * k)
  return { page: 1, rects: B.map(b => [1, 0, b - 2, 100, b + 8]), x0: 0, x1: 100, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false, ...(flush ? { flush } : {}) }
}
const P = () => ({ ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0, hyphen: 0, order: [], lineskip: null })
/** n words of two letters with a space between: eight are 97.5 pt, a line of 100 justified by 0.36 pt a space */
const words = (n: number) => Array.from({ length: n }, (_, i) => (i ? [space, word(2)] : [word(2)])).flat()
const ends = (l: { lines: { x0: number; used: number }[] }) => l.lines.map(x => Math.round((x.x0 + x.used) * 100) / 100)
const starts = (l: { lines: { items: { x?: number }[] }[] }) => l.lines.map(x => Math.round((x.items[0]?.x ?? 0) * 100) / 100)

describe('a unit TeX set flush left or flush right', () => {
  it('justified as today where nothing says so: every line but the last to the right edge', () => {
    const l = L2.layoutUnit2(words(20) as never, [block(3)] as never, 10, P() as never)
    expect(l.lines.map(x => x.mode)).toEqual(['just', 'just', 'last'])
    expect(ends(l).slice(0, 2)).toEqual([100, 100])
  })
  it('flush left: every line at its natural spacing, ragged, none spread to the edge', () => {
    const l = L2.layoutUnit2(words(20) as never, [block(3, 'left')] as never, 10, P() as never)
    expect(l.lines.map(x => x.mode)).toEqual(['ragged', 'ragged', 'last'])
    expect(ends(l)).toEqual([97.5, 97.5, 47.5])
    expect(starts(l)).toEqual([0, 0, 0])
  })
  it('flush right: every line, its last too, ends at the right edge at its natural spacing', () => {
    const l = L2.layoutUnit2(words(20) as never, [block(3, 'right')] as never, 10, P() as never)
    expect(l.lines.map(x => x.mode)).toEqual(['right', 'right', 'right'])
    expect(starts(l)).toEqual([2.5, 2.5, 52.5])
    expect(ends(l)).toEqual([100, 100, 100])
  })
  it('breaks the same lines either way: the alignment moves no word to another line', () => {
    const at = (flush?: 'left' | 'right') => L2.layoutUnit2(words(20) as never, [block(3, flush)] as never, 10, P() as never).lines.map(x => x.items.length)
    expect(at('left')).toEqual(at())
    expect(at('right')).toEqual(at())
  })
})

describe('the rule in the rule set', () => {
  it('is on in every script of the built-in set (the ruling of 2026-10-29)', () => {
    for (const s of SCRIPTS) expect(BUILTIN_RULES.scripts[s].keepAlign, s).toBe(true)
    for (const t of ['zh', 'ja', 'ko', 'de', 'ru']) expect(resolveRules(BUILTIN_RULES, t).params.keepAlign, t).toBe(true)
  })
})
