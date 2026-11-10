// A figure's texts as its printed lines tell them (src/locate/figure-lines.ts, PDF-READER §18.23): F0's lines, a line of code,
// and the relation reading of a crowded text's ink (the owner's reformulation of 2026-11-10 of the no-touch rule).
import { describe, expect, it } from 'vitest'
import { figureLinesOf } from '../src/locate/figure-lines.ts'
import type { TodayFigures, TodayMet, TodayPage, TodayShape } from '../src/locate/today/today.types.ts'

type Glyph = {
  u: string
  font: string
  size: number
  x0: number
  x1: number
  y: number
  top: number
  bottom: number
  ix0: number
  ix1: number
  form: boolean
  fid: number
  blank: boolean
}
/** a line's glyphs from x at size 10 on baseline y, each its own advance (a proportional face: 5 to 7 pt; one of one pitch: 6;
 *  a space 3, a word's) */
function glyphsOf(text: string, x: number, y: number, font: string): Glyph[] {
  const out: Glyph[] = []
  for (const u of text) {
    const w = u === ' ' ? 3 : font.includes('Mono') ? 6 : 5 + (u.codePointAt(0)! % 3)
    out.push({
      u,
      font,
      size: 10,
      x0: x,
      x1: x + w,
      y,
      top: y + 7,
      bottom: y - 2,
      ix0: x,
      ix1: x + w,
      form: true,
      fid: 1,
      blank: u === ' ',
    })
    x += w
  }
  return out
}
/** a page of glyph lines, each line's runs (its glyphs' ranges) figure units by k; `boxes` [x0, y0, x1, y1] each */
function pageOf(parts: { text: string; font: string; run?: boolean; x?: number }[][], boxes: number[][] = []) {
  const glyphs: Glyph[] = []
  const units: TodayFigures['units'] = []
  const map = new Map<number, number>()
  parts.forEach((line, li) => {
    let x = 72
    const y = 700 - 14 * li
    for (const p of line) {
      const gs = glyphsOf(p.text, p.x ?? x, y, p.font)
      const k = units.length
      if (p.run !== false) {
        units.push({
          k,
          text: p.text.trim(),
          why: null,
          x: gs[0]!.x0,
          y,
          length: gs.at(-1)!.x1 - gs[0]!.x0,
          anchor: 'start',
          before: 20,
          after: 20,
          under: null,
        })
        gs.forEach((g, j) => {
          if (!g.blank) map.set(glyphs.length + j, k)
        })
      }
      glyphs.push(...gs)
      x = gs.at(-1)!.x1
    }
  })
  const page = { glyphs, boxes: boxes.flat(), paths: boxes.map(() => 0) } as unknown as TodayPage
  const fig: TodayFigures = { units, glyphs: [map], turned: [new Map()], met: new Map() }
  return { page, fig, glyphs }
}
const MONO = new Set(['LMMono10-Regular'])
const rect = (x0: number, y0: number, x1: number, y1: number, o: Partial<TodayShape> = {}): TodayShape => ({
  segs: [x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0],
  stroke: true,
  fill: false,
  hw: 0.2,
  ...o,
})
const boxMet = (b: number, shape: TodayShape): TodayMet => {
  const s = shape.segs as number[]
  const xs = s.filter((_, i) => i % 2 === 0),
    ys = s.filter((_, i) => i % 2 === 1)
  return { b, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], shape, kind: 0 }
}

describe('figure-lines: F0, a figure’s line of words and a run of one pitch', () => {
  it('makes "Project Page:" and its address one figure text, the address a code element, the icon before it none of it (2611.03178v1)', () => {
    const { page, fig } = pageOf([
      [
        { text: '\u{f0ac}', font: 'FontAwesome', run: false },
        { text: ' Project Page: ', font: 'LMSans10-Bold' },
        { text: 'coworkos-ai.github.io', font: 'LMMono10-Regular' },
      ],
    ])
    const [t, ...rest] = figureLinesOf([page], fig, () => false, MONO)
    expect(rest).toEqual([])
    expect(t!.ks).toEqual([0, 1])
    expect(t!.why).toBeNull()
    expect(t!.order.map((o) => o.t)).toEqual(['text', 'el'])
    expect(t!.els.map((e) => e.kind)).toEqual(['code'])
    // (the icon, a glyph no run holds before the line's first run, is neither its text nor claimed)
    expect(t!.claimed).toEqual([])
    expect((t!.order[0] as { glyphs: number[] }).glyphs[0]).toBeGreaterThan(0)
  })
  it('keeps a line whose every word stands between glyphs of one pitch whole, as code (2411.13093v4 p19)', () => {
    const { page, fig } = pageOf([
      [
        { text: '"ASR": "The number of the ', font: 'LMMono10-Regular' },
        { text: 'attractions', font: 'Georgia' },
        { text: '.",', font: 'LMMono10-Regular' },
      ],
    ])
    const [t] = figureLinesOf([page], fig, () => false, MONO)
    expect(t!.why).toBe('code')
    expect(t!.els).toEqual([])
    expect(t!.ks).toEqual([0, 1, 2])
  })
  it('reads no line where Rule 1 keeps nothing (no faces of one pitch given): today’s runs stand', () => {
    const { page, fig } = pageOf([
      [
        { text: 'Action: Write ', font: 'LMSans10-Bold' },
        { text: '/tmp/f.py', font: 'LMMono10-Regular' },
      ],
    ])
    expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
  })
  it('joins a chip to the words beside it across its ground, two boxed labels never', () => {
    // (a chip's fill holds its text with room round it: the gap from the word before to its text past the run gap, to its fill
    // within it; two labels each on a box of its own stay two)
    // ("I audited" ends at 123, "final.py" 130-178 on its fill 126-182, " which is" from 185: 7 pt to the text either side, a
    // word space to the fill)
    const chip = [126, 696, 182, 709]
    const { page, fig } = pageOf(
      [
        [
          { text: 'I audited', font: 'SFNS' },
          { text: 'final.py', font: 'LMMono10-Regular', x: 130 },
          { text: ' which is', font: 'SFNS', x: 182 },
        ],
      ],
      [chip],
    )
    const [t] = figureLinesOf([page], fig, () => false, MONO)
    expect(t!.ks).toEqual([0, 1, 2])
    expect(t!.order.map((o) => o.t)).toEqual(['text', 'el', 'text'])
    const two = pageOf(
      [
        [
          { text: 'MCP', font: 'SFNS' },
          { text: 'mcp.py', font: 'LMMono10-Regular', x: 120 },
        ],
      ],
      [
        [70, 696, 92, 709],
        [116, 696, 158, 709],
      ],
    )
    expect(figureLinesOf([two.page], two.fig, () => false, MONO)).toEqual([])
  })
})

describe('figure-lines: the relation reading of a crowded figure text’s ink (the owner’s reformulation of 2026-11-10)', () => {
  const crowd = (fig: TodayFigures, k: number, items: TodayMet[]) => {
    fig.units[k]!.why = 'crowded'
    fig.met.set(k, { items, under: null })
  }
  it('frees a text whose frame holds a stretch of its words: the stretch an element carrying its frame (a citation’s border, 2609.19644v1 p58)', () => {
    const { page, fig } = pageOf([[{ text: 'as shown in Garza et al.', font: 'NimbusRomNo9L' }]])
    // (the frame round "Garza et al.": glyphs 12 to 23)
    const g = page.glyphs as Glyph[]
    const frame = rect(g[12]!.x0 - 0.5, 696, g[23]!.x1 + 0.5, 709)
    crowd(fig, 0, [boxMet(0, frame)])
    const [t] = figureLinesOf([page], fig, () => false, null)
    expect(t!.why).toBeNull()
    expect(t!.els).toEqual([
      { kind: 'cite', glyphs: Array.from({ length: 12 }, (_, i) => 12 + i).filter((i) => !g[i]!.blank), boxes: [0] },
    ])
    expect(t!.order.map((o) => o.t)).toEqual(['text', 'el'])
  })
  it('frees a text a closed shape holds whole: its room the shape’s inside, its edges over and under its baseline', () => {
    const { page, fig } = pageOf([[{ text: 'CTJA module', font: 'DejaVuSans' }]])
    const box = rect(66, 694, 140, 712)
    crowd(fig, 0, [boxMet(0, box)])
    const [t] = figureLinesOf([page], fig, () => false, null)
    expect(t!.why).toBeNull()
    expect(t!.container!.over).toBeCloseTo(712 - 0.2 - 700, 6)
    expect(t!.container!.under).toBeCloseTo(700 - (694 + 0.2), 6)
  })
  it('reads a diamond’s room at the text’s ends, where its slanted sides come nearest', () => {
    const { page, fig } = pageOf([[{ text: 'detected?', font: 'DejaVuSans' }]])
    const g = page.glyphs as Glyph[]
    const [x0, x1] = [g[0]!.x0, g.at(-1)!.x1]
    const mid = (x0 + x1) / 2
    const diamond: TodayShape = {
      segs: [mid - 40, 701, mid, 721, mid, 721, mid + 40, 701, mid + 40, 701, mid, 681, mid, 681, mid - 40, 701],
      stroke: true,
      fill: true,
      hw: 0,
    }
    crowd(fig, 0, [boxMet(0, diamond)])
    const [t] = figureLinesOf([page], fig, () => false, null)
    // (the top sides at the text's ends: 721 - 20 * (half the text's width) / 40 over the line's 701 apex)
    const over = 721 - (20 * (x1 - x0)) / 2 / 40 - 700
    expect(t!.container!.over).toBeCloseTo(over, 6)
  })
  it('hides a doubled copy with the text it doubles, and keeps a text crossed by unrelated ink crowded', () => {
    const { page, fig } = pageOf([[{ text: 'import', font: 'Courier' }], [{ text: 'Loss', font: 'DejaVuSans' }]])
    const glyphs = page.glyphs as Glyph[]
    // (a copy of "i" over the first, 0.5 pt up; and a curve through "Loss")
    glyphs.push({ ...glyphs[0]!, y: glyphs[0]!.y + 0.5, top: glyphs[0]!.top + 0.5, bottom: glyphs[0]!.bottom + 0.5 })
    crowd(fig, 0, [{ g: glyphs.length - 1 }])
    const curve: TodayShape = { segs: [60, 684, 120, 690], stroke: true, fill: false, hw: 0.5 }
    crowd(fig, 1, [boxMet(0, curve)])
    const texts = figureLinesOf([page], fig, () => true, null)
    expect(texts.map((t) => [t.ks, t.why, t.copies.length])).toEqual([[[0], null, 1]])
  })
  it('gives a rule inside a code element’s extent to the element, an underline of a stretch of words its element', () => {
    const { page, fig } = pageOf([
      [
        { text: 'see ', font: 'SFNS' },
        { text: 'mm_and', font: 'LMMono10-Regular' },
        { text: ' and more words', font: 'SFNS' },
      ],
    ])
    const g = page.glyphs as Glyph[]
    const under: TodayShape = { segs: [g[4]!.x0 + 13, 699, g[4]!.x0 + 17, 699], stroke: true, fill: false, hw: 0.3 }
    const line: TodayShape = { segs: [g[11]!.x0, 697, g[13]!.x1, 697], stroke: true, fill: false, hw: 0.3 }
    crowd(fig, 0, [])
    crowd(fig, 2, [boxMet(0, under), boxMet(1, line)])
    const [t] = figureLinesOf([page], fig, () => false, MONO)
    expect(t!.why).toBeNull()
    expect(t!.els[0]).toMatchObject({ kind: 'code', boxes: [0] })
    expect(t!.els[1]).toMatchObject({ kind: 'cite', boxes: [1] })
  })
})
