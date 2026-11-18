import { describe, expect, it } from 'vitest'
import { EDGE, INDENT, inkUnitsOf } from '../src/locate/ink-units.ts'

// Lines no unit holds, one of TeX's paragraphs (its `para`, its point on its first line: `opens`), each the one before's next only
// where it starts an indent from the paragraph's first line (locate/ink-units.ts EDGE, INDENT): a hanging line is; a line at the
// first's edge is the next item of a list (a bibliography whose entries are one paragraph, an \itemsep wider than a block's
// leading), and one further across than any indent starts no line of it. Lines 2.5 of their size apart, past a block's leading
// (BLOCK_DY) and within a paragraph's (PARA_DY), so that the indent alone tells them; each glyph 5 pt at 10 pt

type G = Record<string, unknown>
/** a line's glyphs from x, 5 pt a character, on a baseline */
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
/** one page of lines ([text, x, y]), each a ledger line of no unit's (`orphan`) in paragraph `para`, the first opening it */
function page(lines: [string, number, number][], para = 1) {
  const glyphs: G[] = []
  const ledgerLines = lines.map(([text, x, y], k) => {
    const g = run(text, x, y)
    const gs = g.map((_, i) => glyphs.length + i)
    glyphs.push(...g)
    return {
      page: 1,
      cls: 'orphan',
      gs,
      region: 0,
      zone: null,
      para,
      opens: k === 0,
      entry: null,
      entryFrom: null,
      listed: undefined,
      y,
      size: 10,
      x0: x,
      x1: x + 5 * text.length,
      letters: text.replace(/ /g, '').length,
    }
  })
  return {
    pages: [{ glyphs, points: [], paras: [], paraEnds: [], view: [0, 0, 612, 792] }],
    ledger: { lines: ledgerLines },
  }
}
/** the units made, each its lines' baselines (its text glyphs' own) */
const unitsOf = (p: ReturnType<typeof page>) =>
  (
    inkUnitsOf(p.pages as never, p.ledger as never, { units: [], from: 0 }) as unknown as {
      glyphs: { text: [number, number][] }
    }[]
  ).map((u) => [...new Set(u.glyphs.text.map(([, g]) => p.pages[0]!.glyphs[g]!.y as number))])

describe("a paragraph's next line by its indent from the paragraph's first (EDGE, INDENT)", () => {
  it("joins a hanging line, and starts a unit at a line at the first line's edge: the next item of a list", () => {
    // (the hanging line 2 sizes in, past EDGE, within INDENT; the next item at the edge)
    expect(2).toBeGreaterThan(EDGE)
    const p = page([
      ['First entry of the list', 72, 700],
      ['and its hanging line', 92, 675],
      ['Second entry of the list', 72, 650],
    ])
    expect(unitsOf(p)).toEqual([[700, 675], [650]])
  })
  it('starts a unit at a line further across than any indent from the first', () => {
    expect(8).toBeGreaterThan(INDENT)
    const p = page([
      ['A heading set centred over its list', 72, 700],
      ['the first entry under it', 152, 675],
    ])
    expect(unitsOf(p)).toEqual([[700], [675]])
  })
})
