import { describe, expect, it } from 'vitest'
import { inkUnitsOf } from '../src/locate/ink-units.ts'

// A unit read off the ink keeps the forced line ends TeX set inside it (locate/ink-units.ts rule 3b): B's point `kb<n>` (marks.ts
// BREAKS_TEX), carried onto A, between two of the unit's lines is a break placeholder there. A unit's lines stand on one page but
// a biblatex entry's (rule 1: every line of the entry its unit, over a page's break too): there TeX's point after the last line
// of the first page is carried after that page's last glyph. Each glyph 5 pt at 10 pt

type G = Record<string, unknown>
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
/** pages of lines ([text, y]) of one biblatex entry, the references' class, at x 100; `breaks` each page's carried points */
function entry(pages: [string, number][][], breaks: number[][]) {
  const lines: Record<string, unknown>[] = []
  const out = pages.map((ls, p) => {
    const glyphs: G[] = []
    for (const [text, y] of ls) {
      const g = run(text, 100, y)
      lines.push({
        page: p + 1,
        cls: 'references',
        gs: g.map((_, i) => glyphs.length + i),
        region: 0,
        zone: 'references',
        para: null,
        opens: false,
        entry: 1,
        entryFrom: p === 0 && lines.length === 0 ? 0 : null,
        listed: undefined,
        y,
        size: 10,
        x0: 100,
        x1: 100 + 5 * text.length,
        letters: text.replace(/ /g, '').length,
      })
      glyphs.push(...g)
    }
    return {
      glyphs,
      points: [],
      paras: [],
      paraEnds: [],
      breaks: (breaks[p] ?? []).map((glyph, k) => ({ name: `kb${k + 1}`, glyph, box: 0 })),
      view: [0, 0, 612, 792],
    }
  })
  return inkUnitsOf(out as never, { lines } as never)
}
const shape = (u: { pieces: { t: string; s?: string; kind?: string }[] }) =>
  u.pieces.map((p) => (p.t === 'text' ? p.s : p.kind === 'break' ? '|' : `<${p.t}>`)).join('')

describe('a forced break inside a unit read off the ink', () => {
  it('between two lines of one page: a break placeholder at TeX’s point', () => {
    const [u] = entry(
      [
        [
          ['Ann Lee. A Title.', 700],
          ['In: Proc. 2025.', 688],
        ],
      ],
      [['Ann Lee. A Title.'.replace(/ /g, '').length]],
    )
    expect(shape(u!)).toBe('Ann Lee. A Title.| In: Proc. 2025.')
    expect(u!.glyphs.breaks).toEqual([[1, [1, 'AnnLee.ATitle.'.length - 1]]])
  })
  it('after the last line of a page, the next line on the next page: TeX’s point after that page’s last glyph', () => {
    const one = 'Ann Lee. A Title.'.replace(/ /g, '').length
    const [u] = entry([[['Ann Lee. A Title.', 100]], [['In: Proc. 2025.', 700]]], [[one]])
    expect(shape(u!)).toBe('Ann Lee. A Title.| In: Proc. 2025.')
    expect(u!.glyphs.breaks).toEqual([[1, [1, one - 1]]])
  })
  it('no point, no break: a line TeX wrapped there, however short', () => {
    const [u] = entry([[['Ann Lee. A Title.', 100]], [['In: Proc. 2025.', 700]]], [[]])
    expect(shape(u!)).toBe('Ann Lee. A Title. In: Proc. 2025.')
  })
})
