// B.break: a tie (the source's `~`, a space no line breaks at) runs its group on to the token after it, and that token may be a
// break of the unit's own, a page-break token (B.cuts withPageBreaks: set before the token a frame's text begins with), a kept
// region's (`blockTo`) or a forced one (`newline`). Such a token sets nothing of the text: the breaker reads it as a break and
// never lays it as an item of a line. Before, the tie's run-on took it into the word's group, the group was laid whole, and the
// break token stood on the line as an item with no face: the drawing's runs (D.display lineRuns) read its face and threw, and
// the reader showed the page as arXiv's. The case: a paragraph whose first frame's line holds its first word alone, a tie after
// it, and the next frame's text beginning at the tie's next token (a cut made where the fit's own line broke the tied group,
// longer than that line, at the tie: pageCutsOf's line start). Hand-made tokens and blocks: a character half an em, a space a
// quarter.
import { describe, expect, it } from 'vitest'
import type { Face, Token } from '../../src/breaker/tokens.ts'
import { lineRuns } from '../../src/emit/display.ts'
import type { FitBlock, FitParams, Layout } from '../../src/fit/types.ts'
import { layoutUnit2 } from '../../src/fit/walk.ts'
import { resolveRules } from '../../src/rules-for.ts'

const S = 10
/** a block of `n` lines `pitch` apart from baseline `top` down, `width` wide from x 72, on `page` */
const block = (page: number, top: number, n: number, width = 200, pitch = 12): FitBlock => {
  const B = Array.from({ length: n }, (_, k) => top - pitch * k)
  return {
    page,
    rects: B.map((b) => [page, 72, b - 2, 72 + width, b + 8]),
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
    after: 0,
    flow: page,
  } as unknown as FitBlock
}
const face: Face = { family: 'serif', weight: 400, style: 'normal', oblique: 0, stand: 'serif', caps: false, size: S }
const word = (s: string): Token => ({ s, cls: 'latin', w100: 50 * s.length, st: {}, face }) as unknown as Token
const space = { space: true, w100: 25 } as unknown as Token
/** the tie's space (unit/elements.ts Res.tie, breaker/tokens.ts) */
const tie = { space: true, tie: true, w100: 25 } as unknown as Token
const rules = resolveRules('de').params as unknown as FitParams
const P: FitParams = {
  ...rules,
  borrow: 0,
  hyphen: false,
  lineskip: null,
  measure: { w100: (s: string) => 50 * [...s].length, ink100: () => ({ a: 70, d: 20 }), inkRight100: () => null },
} as unknown as FitParams
const texts = (l: Layout) => l.lines.map((x) => x.items.map((it) => (it.t.space ? ' ' : (it.t.s ?? ''))).join(''))
const breaks: Record<string, Token> = {
  'a page break': { pageBreak: 2, frame: 1, w100: 0 } as unknown as Token,
  'a page break of the frames’ share': { pageBreak: 2, frame: 1, share: true, w100: 0 } as unknown as Token,
  'a kept region’s break': { blockTo: 0, w100: 0 } as unknown as Token,
  'a forced break': { newline: 0, w100: 0 } as unknown as Token,
}

describe('a tie before a break of the unit’s own lays no break token as an item', () => {
  for (const [name, brk] of Object.entries(breaks)) {
    it(`${name}: no line holds it, every line's runs are drawn, every word is set in order`, () => {
      // ("Table~3 and more": the break between the tie and "3", the first frame one line of 60 pt on page 1, the next three
      // lines of 200 pt on page 2)
      const tokens = [word('Table'), tie, brk, word('3'), space, word('and'), space, word('more')]
      const blocks = [block(1, 700, 1, 60), block(2, 700, 3)]
      const l = layoutUnit2(tokens, blocks, S, P)!
      expect(l).not.toBeNull()
      const items = l.lines.flatMap((x) => x.items)
      const breakTokens = items.filter(
        (it) => it.t.pageBreak !== undefined || it.t.blockTo !== undefined || it.t.newline !== undefined,
      )
      expect(breakTokens).toEqual([])
      expect(() => l.lines.map((x) => lineRuns(x, l))).not.toThrow()
      expect(texts(l).join(' ').replace(/\s+/g, ' ').trim()).toBe('Table 3 and more')
    })
  }
  it('keeps the tie where no break stands after it: the word and the token after the tie on one line', () => {
    const tokens = [word('Table'), tie, word('3'), space, word('and'), space, word('more')]
    const l = layoutUnit2(tokens, [block(1, 700, 3)], S, P)!
    expect(texts(l)[0]).toMatch(/^Table 3/)
  })
})
