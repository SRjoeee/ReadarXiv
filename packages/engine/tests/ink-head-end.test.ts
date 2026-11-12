import { describe, expect, it } from 'vitest'
import { inkUnitsOf, ledgerOf } from '../src/locate/today/today.types.ts'

// A paragraph end carried from B onto A (locate/ink.ts carry) is a unit's own only where it stood right after that unit's last
// glyph in the list TeX set: on B. On A, an end is put before the partner of B's next glyph; where A's page breaks elsewhere than
// B's, a paragraph's end at the foot of B's page lands right after the next A page's running head (2610.30854v1 p8: the
// Conclusion's last paragraph, after its unit's end mark; p9: a reference entry, after its element's point), and the head read
// it as its own: justified, where the page sets it flush right. And A's points list is not in glyph order: the points carried
// from the B page before come first, the page's own after them

type G = Record<string, unknown>
/** a run's glyphs, 5 pt a character, on a baseline */
function run(text: string, x: number, y: number): G[] {
  const out: G[] = []
  for (const ch of text) {
    if (ch !== ' ')
      out.push({
        u: ch,
        x0: x,
        x1: x + 5,
        ix0: x,
        ix1: x + 5,
        y,
        top: y + 7,
        bottom: y - 2,
        size: 10,
        font: 'CMR10',
        fill: 0,
      })
    x += 5
  }
  return out
}
/** an A page: a running head on the right, then a body; the points carried from B's page before (`carried`, at the body's first
 *  glyph, listed first) and the page's own (its column, its body's start); one paragraph end at the body's first glyph, stated
 *  after the carried points listed before `before` of them, carried from B page `bPage` (its next glyph's position there); each
 *  A glyph's position right after its partner on B (`afterB`: the head's on B page 2, the body's after it) */
function headPage(carried: string[], before: number, bPage: number) {
  const head = run('Zhejiang University', 436, 810)
  const body = run('Body words of the paper', 100, 700)
  const glyphs = [...head, ...body]
  const own = [...head.map(() => null), ...body.map(() => 'u1')]
  const at = head.length
  const points = [
    ...carried.map((name) => ({ name, glyph: at, box: 0 })),
    { name: 'c1-2', glyph: 0, box: 0 },
    { name: 'bs1', glyph: at, box: 0 },
  ]
  const afterB = new Int32Array(2 * glyphs.length).fill(-1)
  glyphs.forEach((_, g) => {
    afterB[2 * g] = 2
    afterB[2 * g + 1] = g + 1
  })
  const paraEnds = [{ name: 'qe1j', glyph: at, box: 0, point: before, para: 0, b: [bPage, 4963] }]
  return { page: { glyphs, boxes: [], points, paras: [], paraEnds, afterB, view: [0, 0, 612, 792] }, own }
}
const flagsOf = (p: ReturnType<typeof headPage>) => {
  const ledger = ledgerOf([p.page] as never, { glyphs: [p.own] }, { units: [] })
  return (
    inkUnitsOf([p.page] as never, ledger, { units: [], from: 0 }) as unknown as {
      kind: string
      rows: { unit: number[] }
    }[]
  )
    .filter((u) => u.kind === 'inkheads')
    .map((u) => u.rows.unit[3])
}

describe("a running head's paragraph end is its own only where TeX set it right after the head's last glyph, on B", () => {
  it("reads no body paragraph's end carried from B's page before as the head's: a unit's end mark or an element's point between (2610.30854v1 p8, p9)", () => {
    // (p8: the Conclusion's unit end mark `185e` and the next unit's start, the end between them; p9: a reference entry's
    // element point `p388.11b`, the end after it)
    expect(flagsOf(headPage(['185e', '186s'], 1, 1))).toEqual([0])
    expect(flagsOf(headPage(['p388.11b', '389s'], 1, 1))).toEqual([0])
  })
  it('still reads an end that TeX set right after the head on B: its own paragraph', () => {
    // (the same end stated on B's own page right after the head's last glyph: the head's position after it there)
    const own = headPage([], 0, 2)
    own.page.paraEnds[0]!.b = [2, own.page.paraEnds[0]!.glyph]
    expect(flagsOf(own)).toEqual([32])
  })
})
