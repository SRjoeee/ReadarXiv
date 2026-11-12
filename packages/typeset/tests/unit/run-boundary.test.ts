// X.walk and B.break: the line before a run's boundary is a paragraph's last line (TeX's own law: where a display begins, TeX
// breaks "the paragraph so far" with \parfillskip appended, TeX §1145 `line_break(display_widow_penalty)` in init_math, so the
// line before a display is a last line and never ends in a discretionary hyphen). A unit's runs are the text between the kept
// regions TeX set between its partial paragraphs (a display, any region a slot's `after` counts); where a run fits its own slots
// at no state, the walk's last resort lays the text on past the region (walk.ts: in order nothing fits, the text runs past it),
// and the line before the region is still the run's last: it ends at a legal break that is no hyphenation point, ragged. Before,
// that line was an ordinary line end and the breaker hyphenated a Latin word there, the word's head before the display and its
// tail after it (2610.21106v1-zh p3's remark with Google's text, "Hes-" | display | "sian"). Hand-made tokens and blocks: a
// character half an em, a space a quarter.
import { describe, expect, it } from 'vitest'
import { hyphenationOf } from '../../src/breaker/hyph.ts'
import type { Token } from '../../src/breaker/tokens.ts'
import type { FitBlock, FitParams, Layout } from '../../src/fit/types.ts'
import { layoutUnit2 } from '../../src/fit/walk.ts'
import { resolveRules } from '../../src/rules-for.ts'

const S = 10
/** a block of `n` lines `pitch` apart from baseline `top` down, `width` wide from x 72, after `after` kept regions */
const block = (top: number, n: number, after: number, width = 200, pitch = 12): FitBlock => {
  const B = Array.from({ length: n }, (_, k) => top - pitch * k)
  return {
    page: 1,
    rects: B.map((b) => [1, 72, b - 2, 72 + width, b + 8]),
    x0: 72,
    x1: 72 + width,
    top: B[0]! + 8,
    bottom: B.at(-1)! - 2,
    h: 10,
    pitch,
    pitch0: pitch,
    B,
    exact: B.map(() => true),
    sizes: B.map(() => S),
    free: 0,
    indent: 0,
    centred: false,
    measures: null,
    after,
    flow: after,
  } as unknown as FitBlock
}
const word = (s: string): Token => ({ s, cls: 'latin', w100: 50 * s.length, st: {}, hyph: 'en' }) as unknown as Token
const space = { space: true, w100: 25 } as unknown as Token
const words = (...ws: string[]): Token[] => ws.flatMap((w, i) => (i ? [space, word(w)] : [word(w)]))
/** the kept region TeX set between the two runs (a display: its break, tokensOf2's `blockTo`) */
const region = { blockTo: 0, w100: 0 } as unknown as Token
const rules = resolveRules('de').params as unknown as FitParams
// ("abcdefgh" breaks after its fourth letter, the patterns' own exception)
const P: FitParams = {
  ...rules,
  borrow: 0,
  hyphen: true,
  lineskip: null,
  patterns: { en: hyphenationOf({ patterns: ['a1b'], exceptions: ['abcd-efgh'] }) },
  measure: { w100: (s: string) => 50 * [...s].length, ink100: () => ({ a: 70, d: 20 }), inkRight100: () => null },
} as unknown as FitParams
const texts = (l: Layout) =>
  l.lines.map((x) => [x.block, x.items.map((it) => (it.t.space ? ' ' : (it.t.s ?? ''))).join('')])

describe('the line before a run’s boundary is a last line', () => {
  // (the run before the region: one line of 60 pt (12 characters at 10 pt), where "abcde abcdefgh" (67.5 pt) does not stand
  // whole and "abcde abcd-" (52.5) does, and the run's text fits at no state down to the floor; the run after it: three lines
  // of 200 pt)
  const tokens = [...words('abcde', 'abcdefgh', 'cd', 'ef', 'gh', 'ij', 'kl', 'mn', 'op'), region, ...words('qr', 'st')]
  const blocks = [block(700, 1, 0, 60), block(640, 3, 1)]

  it('runs on past the region only as the last resort, every token set', () => {
    const l = layoutUnit2(tokens, blocks, S, P)!
    expect(l.clipped).toBe(false)
    expect(l.spilled).toBe(true)
  })

  it('ends that line at a legal break that is no hyphenation point: the word whole after the region', () => {
    const l = layoutUnit2(tokens, blocks, S, P)!
    const first = l.lines[0]!
    expect(first.block).toBe(0)
    expect(first.items.some((it) => (it.t as { hyphenated?: boolean }).hyphenated)).toBe(false)
    expect(texts(l)[0]).toEqual([0, 'abcde'])
    expect(texts(l)[1]![1]).toMatch(/^abcdefgh /)
  })

  it('sets that line as a last line is set: ragged, as the line before a region the text has reached', () => {
    const l = layoutUnit2(tokens, blocks, S, P)!
    expect(l.lines[0]!.ends).toBe(true)
  })

  it('still hyphenates a line inside a run, where the text goes on on the run’s own slots', () => {
    // (the same words with the run before the region two lines long: its first line may end in "abcd-", its second, the run's
    // last, may not)
    const two = [...words('abcde', 'abcdefgh', 'cd'), region, ...words('qr')]
    const l = layoutUnit2(two, [block(700, 2, 0, 60), block(640, 3, 1)], S, P)!
    expect(l.spilled).toBe(false)
    expect(texts(l).slice(0, 2)).toEqual([
      [0, 'abcde abcd-'],
      [0, 'efgh cd'],
    ])
  })
})
