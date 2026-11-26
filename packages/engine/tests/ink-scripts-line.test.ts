import { describe, expect, it } from 'vitest'
import { inkUnitsOf } from '../src/locate/ink-units.ts'
import { texLinesOf } from '../src/locate/ledger.ts'

// A script is a glyph TeX set smaller than its line's text and off its baseline (locate/ink-units.ts scriptsOf, rule 4). The line
// is TeX's: a ledger line is the part of it no unit owns (locate/ledger.ts), and the text size read over that part alone is the
// scripts' own wherever they outnumber its letters, so that none is found. Here a line of TeX's at 10 pt holds text a unit owns
// around a part no unit owns. Each glyph 5 pt wide; a script 7 pt, raised 3.6 pt (or lowered 2 pt)

type G = Record<string, unknown>
/** a run of glyphs from x on baseline y at a size, one glyph a character, a space a step */
function run(text: string, x: number, y: number, size = 10): G[] {
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
        top: y + 0.7 * size,
        bottom: y - 0.2 * size,
        size,
        font: 'CMR10',
        fill: 0,
      })
    x += 5
  }
  return out
}
/** one page of one line of TeX's at baseline 700 from x 100: its parts in order, each [text, owned, shift, size]; the parts no
 *  unit owns one orphan ledger line, stated with the range of TeX's line (`tex`) or without it (a ledger of before) */
function line(parts: [string, boolean, number?, number?][], withTex = true) {
  const glyphs: G[] = []
  const free: number[] = []
  let x = 100
  for (const [text, owned, dy = 0, size = 10] of parts) {
    const g = run(text, x, 700 + dy, size)
    if (!owned) free.push(...g.map((_, i) => glyphs.length + i))
    glyphs.push(...g)
    x += 5 * text.length + 5
  }
  const first = free[0] ?? 0
  const L = {
    page: 1,
    cls: 'orphan',
    gs: free,
    region: 1,
    zone: null,
    para: null,
    opens: false,
    entry: null,
    entryFrom: null,
    listed: undefined,
    y: (glyphs[first]?.y as number) ?? 700,
    size: Math.max(...free.map((g) => glyphs[g]!.size as number)),
    x0: glyphs[first]?.x0 as number,
    x1: glyphs[free.at(-1) ?? 0]?.x1 as number,
    letters: free.filter((g) => /\p{L}/u.test(glyphs[g]!.u as string)).length,
    ...(withTex ? { tex: [0, glyphs.length - 1] } : {}),
  }
  const page = { glyphs, points: [], paras: [], paraEnds: [], breaks: [], view: [0, 0, 612, 792] }
  return inkUnitsOf([page] as never, { lines: free.length ? [L] : [] } as never)
}
const shape = (u: { pieces: { t: string; s?: string; src?: string }[] } | undefined) =>
  u?.pieces.map((p) => (p.t === 'text' ? p.s : `<${p.src ?? p.t}>`)).join('')

describe('a script read against TeX’s line, not against the part of it no unit owns', () => {
  it('marks raised and small outnumbering the word after them: the marks a raised script, the word the text', () => {
    const [u] = line([
      ['Ann Lee,', true],
      ['1,2,3', false, 3.6, 7],
      ['and', false],
      ['Bo Ray', true],
    ])
    expect(shape(u)).toBe('<$^{1,2,3}$> and')
  })
  it('a lowered run outnumbering the word after it: a lowered script', () => {
    const [u] = line([
      ['Ann Lee,', true],
      ['i,j,k', false, -2, 7],
      ['and', false],
      ['Bo Ray', true],
    ])
    expect(shape(u)).toBe('<$_{i,j,k}$> and')
  })
  it('a part of no script between owned words: its text, as before', () => {
    const [u] = line([
      ['Ann Lee,', true],
      ['and so on', false],
      ['Bo Ray', true],
    ])
    expect(shape(u)).toBe('and so on')
  })
  it('a part that is all scripts: no unit, as before (no text word)', () => {
    expect(
      line([
        ['Ann Lee', true],
        ['1,2', false, 3.6, 7],
        ['Bo Ray', true],
      ]),
    ).toEqual([])
  })
  it('a whole line no unit owns: its own text size, as before', () => {
    const [u] = line([
      ['Some text', false],
      ['1', false, 3.6, 7],
      ['here', false],
    ])
    expect(shape(u)).toBe('Some text <$^{1}$> here')
  })
  it('a ledger of before, its line stated with no range: the part read alone, as before', () => {
    const [u] = line(
      [
        ['Ann Lee,', true],
        ['1,2,3', false, 3.6, 7],
        ['and', false],
        ['Bo Ray', true],
      ],
      false,
    )
    expect(shape(u)).toBe('1,2,3 and')
  })
})

describe('TeX’s line each glyph stands in (ledger.ts texLinesOf): the walk’s own law over every glyph, owned or not', () => {
  const at = (n: number) => ({
    region: new Array(n).fill(1),
    zones: new Array(n).fill(null),
    entries: new Array(n).fill(null),
  })
  it('one line through raised scripts and back to the baseline', () => {
    const G = [...run('Ann,', 100, 700), ...run('1,2', 125, 703.6, 7), ...run('and Bo', 145, 700)]
    const { from, to } = texLinesOf(G as never, at(G.length))
    expect(new Set(from)).toEqual(new Set([0]))
    expect(new Set(to)).toEqual(new Set([G.length - 1]))
  })
  it('two lines: the next one a line below, and a region apart', () => {
    const G = [...run('Ann Lee', 100, 700), ...run('Bo Ray', 100, 688), ...run('Cy', 200, 688)]
    const k = at(G.length)
    k.region[G.length - 1] = 2
    k.region[G.length - 2] = 2
    const { from, to } = texLinesOf(G as never, k)
    expect([from[0], to[0], from[6], to[6], from[11], to[11]]).toEqual([0, 5, 6, 10, 11, 12])
  })
})
