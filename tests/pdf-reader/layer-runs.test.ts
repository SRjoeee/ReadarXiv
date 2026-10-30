import { beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// A unit split by its displays into runs, each laid at its own state (layer2.mjs layoutRuns, the per-block state of 2026-10-24):
// 2602.23285v2's unit 35 in Japanese, a paragraph of seven lines then two after each of two displays, was set at 0.85 of the
// original's size in all three because the run after the second display did not fit its two lines at any larger size, and the
// first run, with room, stood five tight lines over two empty ones. Words of eight letters, two to a line of 110 at the
// original's size, three from 0.875 of it (a character half an em: three words and two spaces are 125 at the original's)

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

/** a block of n lines `step` apart from `top` down, 110 wide, after `after` kept regions, in flow `flow`, its first line indented */
const block = (top: number, n: number, after: number, flow: number, indent = 0, step = 12) => {
  const B = Array.from({ length: n }, (_, k) => top - step * k)
  return { page: 1, rects: B.map(b => [1, 0, b - 2, 110, b + 8]), x0: 0, x1: 110, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: step, free: 0, indent, after, flow, centred: false }
}
const word = { s: 'xxxxxxxx', cls: 'latin', w100: 400, st: {} }, space = { space: true, w100: 25 }
/** n words, a space between each two */
const words = (n: number) => Array.from({ length: n }, (_, i) => (i ? [space, word] : [word])).flat()
const display = (k: number) => ({ blockTo: k, w100: 0 })
const P = { ...resolveRules(BUILTIN_RULES, 'de').params, borrow: 0 }
/** each line's block, baseline, scale and words set */
const drawn = (l: { lines: { block: number; baseline: number; seg?: { scale: number }; items: { t: { s?: string } }[] }[]; scale: number }) => l.lines.map(x => [x.block, x.baseline, x.seg?.scale ?? l.scale, x.items.filter(it => it.t.s).length])

describe('a unit laid in runs between its displays', () => {
  // (seven lines, then two after each of two displays; ten words before the first display, two after it, five after the second)
  const blocks = () => [block(500, 7, 0, 0), block(400, 2, 1, 1), block(350, 2, 2, 2)]
  const tokens = () => [...words(10), display(0), ...words(2), display(1), ...words(5)]

  it('a cramped last run shrinks alone: the first run with room keeps the original\'s size', () => {
    // (the unit as one: its last run of five words fits two lines only from 0.875, and so the whole unit is set there)
    const whole = L2.layoutUnit2(tokens() as never, blocks() as never, 10, P as never)
    expect([whole.clipped, whole.scale]).toEqual([false, 0.875])
    expect(drawn(whole as never).filter(l => l[0] === 0).map(l => l[3])).toEqual([3, 3, 3, 1])
    const laid = L2.layoutRuns(tokens() as never, blocks() as never, 10, P as never)
    expect(laid).not.toBeNull()
    expect(laid!.runs.map(r => [r.bi0, r.layout.scale, r.layout.lines.length])).toEqual([[0, 1, 5], [1, 1, 1], [2, 0.875, 2]])
    expect(drawn(laid!.layout as never)).toEqual([
      [0, 500, 1, 2], [0, 488, 1, 2], [0, 476, 1, 2], [0, 464, 1, 2], [0, 452, 1, 2],
      [1, 400, 1, 2],
      [2, 350, 0.875, 3], [2, 338, 0.875, 2],
    ])
    // (the cramped run as the unit's fit set it: the same lines)
    expect(drawn(laid!.layout as never).filter(l => l[0] === 2)).toEqual(drawn(whole as never).filter(l => l[0] === 2))
    // (each run's last line before a display ended there, ragged, as the unit's own walk ends it: TeX's \parfillskip)
    const ends = (l: { lines: { block: number; ends?: boolean }[] }) => l.lines.map(x => [x.block, !!x.ends])
    expect(ends(laid!.layout as never).filter(([b], j, a) => a[j + 1]?.[0] !== b)).toEqual([[0, true], [1, true], [2, false]])
    expect(ends(whole as never).filter(([b], j, a) => a[j + 1]?.[0] !== b)).toEqual([[0, true], [1, true], [2, false]])
  })

  it('a paragraph keeps one tracking: the roomy runs are laid from the tightest the cramped run needed', () => {
    // (a script that tracks: the walk tightens a run's tracking before it shrinks it, so the cramped run is set at the floor's)
    const Pt = { ...P, trackMin: -0.03 }
    const whole = L2.layoutUnit2(tokens() as never, blocks() as never, 10, Pt as never)
    expect([whole.scale, whole.state.trackLatin]).toEqual([0.925, -0.03])
    const laid = L2.layoutRuns(tokens() as never, blocks() as never, 10, Pt as never)
    expect(laid!.runs.map(r => [r.layout.scale, r.layout.state.trackLatin])).toEqual([[1, -0.03], [1, -0.03], [0.925, -0.03]])
    expect(laid!.runs.map(r => !!r.P.runTrack)).toEqual([true, true, false])
  })

  it('a cramped first run shrinks alone: the runs after it keep the original\'s size', () => {
    const b = [block(500, 2, 0, 0), block(450, 7, 1, 1)]
    const t = [...words(5), display(0), ...words(6)]
    expect(L2.layoutUnit2(t as never, b as never, 10, P as never).scale).toBe(0.875)
    const laid = L2.layoutRuns(t as never, b as never, 10, P as never)
    expect(drawn(laid!.layout as never)).toEqual([[0, 500, 0.875, 3], [0, 488, 0.875, 2], [1, 450, 1, 2], [1, 438, 1, 2], [1, 426, 1, 2]])
  })

  it('a unit of one run is not laid in runs: no display, or blocks of one run (a paragraph over a page break)', () => {
    expect(L2.layoutRuns(words(6) as never, [block(500, 4, 0, 0)] as never, 10, P as never)).toBeNull()
    expect(L2.runsOf(words(6) as never, [block(500, 2, 0, 0), block(300, 2, 0, 0)] as never)).toBeNull()
    // (and where a run with text has no slots of its own: the walk's own rules place it)
    expect(L2.runsOf([...words(2), display(0), ...words(2)] as never, [block(500, 2, 0, 0), block(400, 2, 0, 0)] as never)).toBeNull()
  })

  it('a forced break that opens another frame is no display: the unit stays one run (Codex review)', () => {
    const brk = (k: number) => ({ blockTo: k, w100: 0, brk: true })
    expect(L2.runsOf([...words(10), brk(0), ...words(5)] as never, [block(500, 7, 0, 0), block(350, 2, 1, 1)] as never)).toBeNull()
    expect(L2.layoutRuns([...words(10), brk(0), ...words(5)] as never, [block(500, 7, 0, 0), block(350, 2, 1, 1)] as never, 10, P as never)).toBeNull()
    // (a display after it still opens a run, the forced break's frames the run's before it)
    const runs = L2.runsOf([...words(4), brk(0), ...words(4), display(1), ...words(2)] as never, [block(500, 2, 0, 0), block(450, 2, 1, 1), block(400, 2, 2, 2)] as never)
    expect(runs?.map(r => [r.after, r.bi0, r.blocks.length])).toEqual([[0, 0, 2], [2, 2, 1]])
  })

  it('a run set larger that would carry text to a later page than the unit\'s fit is not laid in runs (Codex review)', () => {
    const whole = L2.layoutUnit2(tokens() as never, blocks() as never, 10, P as never)
    expect(L2.layoutRuns(tokens() as never, blocks() as never, 10, P as never, whole.lines as never)).not.toBeNull()
    // (the fit's lines read as all on an earlier page than the runs set them)
    const earlier = whole.lines.map(l => ({ ...l, page: 0 }))
    expect(L2.layoutRuns(tokens() as never, blocks() as never, 10, P as never, earlier as never)).toBeNull()
  })

  it('a run\'s first line is the unit\'s first line only in its first run: its indent there alone', () => {
    const b = [block(500, 3, 0, 0, 20), block(400, 3, 1, 1, 20)]
    const t = [...words(3), display(0), ...words(3)]
    const whole = L2.layoutUnit2(t as never, b as never, 10, P as never), laid = L2.layoutRuns(t as never, b as never, 10, P as never)
    // (both at the original's size: the runs' lines are the unit's own, its later run's first line not indented)
    expect(laid!.layout.lines.map(l => [l.block, l.x0, l.baseline, !!l.ends, l.used])).toEqual(whole.lines.map(l => [l.block, l.x0, l.baseline, !!l.ends, l.used]))
    expect(laid!.layout.lines.filter(l => l.block === 1)[0]!.x0).toBe(0)
    expect(laid!.layout.lines[0]!.x0).toBe(20)
  })

  it('a text-less region between two displays breaks with the run after it', () => {
    const runs = L2.runsOf([...words(2), display(0), display(1), ...words(2)] as never, [block(500, 2, 0, 0), block(400, 2, 2, 1)] as never)
    expect(runs?.map(r => [r.after, r.bi0, r.tokens.filter(t => (t as { blockTo?: number }).blockTo !== undefined).length])).toEqual([[0, 0, 0], [2, 1, 2]])
    // (and the first run ends its last line before them)
    expect((runs?.[0]?.tokens.at(-1) as { newline?: number } | undefined)?.newline).toBe(-1)
  })
})

describe('the page fill keeps a unit\'s text on the pages its fit set it', () => {
  // (2610.21884v1's unit 10 in Chinese: its last run, over pages 1 and 2, filled to a leading at which page 1's frame held one
  // line fewer, and a sentence the source sets on page 1 was drawn at the top of page 2)
  const fit = [{ from: 0, page: 1 }, { from: 5, page: 1 }, { from: 9, page: 2 }]
  it('a layout that sets a token on a later page than the fit is refused', () => {
    expect(L2.keepsPages(fit as never, fit as never)).toBe(true)
    expect(L2.keepsPages(fit as never, [{ from: 0, page: 1 }, { from: 5, page: 2 }, { from: 9, page: 2 }] as never)).toBe(false)
    // (a line opening inside a line the fit set on page 1)
    expect(L2.keepsPages(fit as never, [{ from: 0, page: 1 }, { from: 3, page: 1 }, { from: 7, page: 2 }] as never)).toBe(false)
  })
  it('one that sets it on the same page or an earlier one is kept (the page cuts keep text from the page before)', () => {
    expect(L2.keepsPages(fit as never, [{ from: 0, page: 1 }, { from: 4, page: 1 }, { from: 8, page: 1 }, { from: 9, page: 2 }] as never)).toBe(true)
    expect(L2.keepsPages(fit as never, [{ from: 0, page: 1 }, { from: 6, page: 1 }, { from: 9, page: 1 }] as never)).toBe(true)
  })
  it("a line after a page break of the source's may stand on the break's page: its text is that page's in the source", () => {
    // (the break token at 6, in the fit's second line, which ends where the breaker ends it: at a looser state sooner, and its
    // tail, tokens 7 and 8, goes on to page 2; the break at 9 or later sends nothing before it)
    const tokens = Array.from({ length: 12 }, (_, i) => (i === 6 ? { pageBreak: 2, w100: 0 } : { s: 'x', w100: 50 }))
    const looser = [{ from: 0, page: 1 }, { from: 4, page: 1 }, { from: 7, page: 2 }]
    expect(L2.keepsPages(fit as never, looser as never, tokens as never)).toBe(true)
    expect(L2.keepsPages(fit as never, looser as never)).toBe(false)
    // (a line before the break, on page 2, is still refused)
    expect(L2.keepsPages(fit as never, [{ from: 0, page: 1 }, { from: 3, page: 2 }, { from: 7, page: 2 }] as never, tokens as never)).toBe(false)
  })
})
