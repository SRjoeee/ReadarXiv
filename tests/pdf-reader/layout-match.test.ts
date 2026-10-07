import { describe, expect, it } from 'vitest'
import { matcherOf } from '@/pdf-reader/engine/layout/match.mjs'

// The matcher's two guards (the 6b review's I3): a piece's own glyphs carried to arXiv's page and matched there, each
// next glyph at its matched neighbour's offset first, and a match whose offset jumps away from both its neighbours'
// rejected. arXiv's page as the maker's arrays (by baseline, rising); the carrier a function of our compile's positions

type G = { u: string; x: number; y: number; size?: number }
function page(gs: G[]) {
  const order = [...gs].sort((a, b) => a.y - b.y || a.x - b.x)
  return {
    n: order.length, x0: Float64Array.from(order, g => g.x), x1: Float64Array.from(order, g => g.x + 5), y: Float64Array.from(order, g => g.y),
    size: Float64Array.from(order, g => g.size ?? 10), u: order.map(g => g.u), taken: new Uint8Array(order.length), boxes: [] as number[][], boxTaken: new Uint8Array(0),
  }
}
const item = (u: string, x0: number, y = 700) => ({ page: 1, x0, y, size: 10, u })
const at = (P: ReturnType<typeof page>, x: number, y: number) => { for (let g = 0; g < P.n; g++) if (P.x0[g] === x && P.y[g] === y) return g; return -1 }

describe('matcherOf: the guards', () => {
  it('a next glyph is looked for at its matched neighbour\'s offset before its own carry, which may be another line\'s', () => {
    // b's own carry is a copy of its letter on the line below (a lone glyph's line paired with another): the neighbour's
    // offset finds its own
    const P = page([{ u: 'a', x: 100, y: 700 }, { u: 'b', x: 105, y: 700 }, { u: 'b', x: 106, y: 688 }])
    const carry = (_p: number, x: number, y: number) => (x === 105 ? { page: 1, x: 106, y: 688 } : { page: 1, x, y })
    const m = matcherOf({ ink: [null, P], carry })
    const got = m.match([item('a', 100), item('b', 105)], [], null, null)
    expect(got).toEqual({ glyphs: [[1, at(P, 100, 700)], [1, at(P, 105, 700)]], boxes: [] })
  })
  it('a match whose offset jumps away from both its matched neighbours\' is rejected: the piece is not found', () => {
    // y is not on arXiv's line; a y elsewhere, where its own carry puts it, would be taken off the run
    const P = page([{ u: 'x', x: 100, y: 700 }, { u: 'z', x: 110, y: 700 }, { u: 'y', x: 130, y: 650 }])
    const carry = (_p: number, x: number, y: number) => (x === 105 ? { page: 1, x: 130, y: 650 } : { page: 1, x, y })
    const m = matcherOf({ ink: [null, P], carry })
    expect(m.match([item('x', 100), item('y', 105), item('z', 110)], [], null, null)).toEqual({ why: "its glyphs not all matched on arXiv's page" })
    expect(m.stats.rejected).toBeGreaterThan(0)
  })
})
