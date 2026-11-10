// A figure's texts as its printed lines tell them (src/locate/figure-lines.ts, PDF-READER §18.25): F0's lines, a line of code,
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
function glyphsOf(text: string, x: number, y: number, font: string, size = 10): Glyph[] {
  const out: Glyph[] = []
  for (const u of text) {
    const w = ((u === ' ' ? 3 : font.includes('Mono') ? 6 : 5 + (u.codePointAt(0)! % 3)) * size) / 10
    out.push({
      u,
      font,
      size,
      x0: x,
      x1: x + w,
      y,
      top: y + 0.7 * size,
      bottom: y - 0.2 * size,
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
function pageOf(
  parts: { text: string; font: string; run?: boolean; x?: number; size?: number; dy?: number }[][],
  boxes: number[][] = [],
) {
  const glyphs: Glyph[] = []
  const units: TodayFigures['units'] = []
  const map = new Map<number, number>()
  parts.forEach((line, li) => {
    let x = 72
    const y = 700 - 14 * li
    for (const p of line) {
      const gs = glyphsOf(p.text, p.x ?? x, y + (p.dy ?? 0), p.font, p.size)
      const k = units.length
      if (p.run !== false) {
        units.push({
          k,
          text: p.text.trim(),
          why: null,
          x: gs[0]!.x0,
          y: y + (p.dy ?? 0),
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
  it('keeps a bracket abutting the line’s first run its text, and makes no element of a mark of one pitch alone (2610.22197v1, 2608.06701v1)', () => {
    // ("(lin2; feed only)": the bracket no run holds, set against "lin2": the text's, never an icon's; "behavior." its period in
    // the face of one pitch: no element of it)
    const { page, fig } = pageOf([
      [
        { text: '(', font: 'DejaVuSans', run: false },
        { text: 'lin2', font: 'LMMono10-Regular' },
        { text: '; feed only)', font: 'DejaVuSans' },
      ],
      [
        { text: 'consistent with behavior', font: 'DejaVuSans' },
        { text: '.', font: 'LMMono10-Regular', run: false },
      ],
    ])
    const texts = figureLinesOf([page], fig, () => false, MONO)
    expect(texts).toHaveLength(1)
    const [t] = texts
    expect(t!.order.map((o) => o.t)).toEqual(['text', 'el', 'text'])
    expect(t!.claimed).toEqual([0])
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
    // (a label on a badge of its own beside a title (2610.19159v1's "Step 284" by "Agent Action: Write"): no chip, no bridge; the
    // title and its path one text, the badge's label its own)
    const badge = pageOf(
      [
        [
          { text: 'Step 284', font: 'SFNS' },
          { text: 'Action: Write ', font: 'SFNS', x: 132 },
          { text: 'a.py', font: 'LMMono10-Regular' },
        ],
      ],
      [[70, 696, 128, 709]],
    )
    const [b] = figureLinesOf([badge.page], badge.fig, () => false, MONO)
    expect(b!.ks).toEqual([1, 2])
    // (the same row on a band the whole line stands on, its badge on it (2610.19159v1 p53): the band holds the badge's label as
    // well as the path, no chip's fill; the label 7 pt from the title stays its own)
    const band = pageOf(
      [
        [
          { text: 'Step 284', font: 'SFNS' },
          { text: 'Agent Action: Write ', font: 'SFNS', x: 129 },
          { text: 'a.py', font: 'LMMono10-Regular' },
        ],
      ],
      [
        [70, 696, 400, 709],
        [70, 696, 124, 709],
      ],
    )
    const banded = figureLinesOf([band.page], band.fig, () => false, MONO)
    expect(banded.map((t) => t.ks)).toEqual([[1, 2]])
  })
  it('joins no runs in no face of one pitch: a bold label and its colon, a doubled copy, a script, F3’s or as they were (f0e)', () => {
    // (2608.06701v1 p1's "Thought" and ": The user…" abut; so do 2610.21924v1's doubled "PARAMETER" (each glyph twice, 0.4 pt
    // apart) and 2610.20507v1's "log" and its "10": F0 joins a run of one pitch to its line alone)
    const label = pageOf([
      [
        { text: 'Thought', font: 'Arial-BoldMT' },
        { text: ': The user wants to implement the', font: 'ArialMT' },
      ],
    ])
    expect(figureLinesOf([label.page], label.fig, () => false, MONO)).toEqual([])
    const twice = pageOf([
      [
        { text: 'PARAMETER', font: 'Copperplate' },
        { text: 'PARAMETER', font: 'Copperplate', x: 72.4 },
      ],
    ])
    expect(figureLinesOf([twice.page], twice.fig, () => false, MONO)).toEqual([])
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
  it('makes no element of a letter a plot’s marker sits on: a decoration holds whole words, their ink inside it (2610.21085v1 p21)', () => {
    // (a marker over the "j" of "jury": its box holds the letter's ink centre, not its ink, and the stretch is no word; read as one
    // it split the word's show in a Type 3 face and the page's wrap went without its figures, every figure text the original's)
    const { page, fig } = pageOf([[{ text: 'jury', font: 'DejaVuSans' }]])
    const g = page.glyphs as Glyph[]
    const cx = (g[0]!.x0 + g[0]!.x1) / 2
    crowd(fig, 0, [boxMet(0, rect(cx - 1.5, 700, cx + 1.5, 703, { fill: true, stroke: false }))])
    const [t] = figureLinesOf([page], fig, () => false, null)
    expect(t).toBeUndefined()
  })
  it('makes no element of a mark a box holds inside a number: a decoration holds a word, a letter or a digit in it (2610.42112v1)', () => {
    const { page, fig } = pageOf([[{ text: '3.61 pp', font: 'DejaVuSans' }]])
    const g = page.glyphs as Glyph[]
    crowd(fig, 0, [boxMet(0, rect(g[1]!.x0 - 0.3, 697, g[1]!.x1 + 0.3, 708))])
    expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
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
  it('reads a fill drawn word by word as one fill: a highlight under the whole text its room, no word an element (2610.40576v1 p17)', () => {
    const { page, fig } = pageOf([[{ text: 'So row 2, col3 must be 2.', font: 'DejaVuSans' }]])
    const g = page.glyphs as Glyph[]
    // (a piece under each word, abutting its neighbour's in the space between, on one band: the highlight a package sets word
    // by word, a point beyond the text's ends)
    const pieces: TodayShape[] = []
    let from = g[0]!.x0 - 1
    for (let i = 0; i <= g.length; i++)
      if (i === g.length || g[i]!.blank) {
        const to = i === g.length ? g.at(-1)!.x1 + 1 : (g[i]!.x0 + g[i]!.x1) / 2
        pieces.push(rect(from, 697, to, 709, { stroke: false, fill: true, hw: 0 }))
        from = to
      }
    crowd(
      fig,
      0,
      pieces.map((s, i) => boxMet(i, s)),
    )
    const [t] = figureLinesOf([page], fig, () => false, null)
    expect(t!.why).toBeNull()
    expect(t!.els).toEqual([])
    expect(t!.container!.over).toBeCloseTo(709 - 700, 6)
    // (a piece under one word alone, its neighbour's fill a word space away: that word's decoration still)
    const one = pageOf([[{ text: 'see the final.py now', font: 'DejaVuSans' }]])
    const h = one.page.glyphs as Glyph[]
    crowd(one.fig, 0, [boxMet(0, rect(h[8]!.x0 - 1, 697, h[15]!.x1 + 1, 709, { stroke: false, fill: true, hw: 0 }))])
    const [u] = figureLinesOf([one.page], one.fig, () => false, null)
    expect(u!.els.map((e) => e.kind)).toEqual(['cite'])
  })
  it('makes a stretch a tone under it holds whole an element carrying the tone, in a text nothing crowds (2608.06701v1 p1)', () => {
    // ("`host_label` static method in `CallbackBase`": a blue bar under each name, its backticks outside it, painted before it)
    const { page, fig } = pageOf([[{ text: '`host_label` static method in `CallbackBase`', font: 'ArialMT' }]])
    const g = page.glyphs as Glyph[]
    const bar = (a: number, b: number): TodayMet => ({
      ...boxMet(0, rect(g[a]!.x0 - 0.5, 697, g[b]!.x1 + 0.5, 709, { stroke: false, fill: true, hw: 0 })),
      ground: true,
    })
    const first = bar(1, 10)
    const second = { ...bar(31, 42), b: 1 }
    fig.met.set(0, { items: [first, second], under: null })
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null)
    expect(rest).toEqual([])
    expect(t!.why).toBeNull()
    expect(t!.els.map((e) => [e.kind, e.boxes, e.glyphs.length])).toEqual([
      ['cite', [0], 10],
      ['cite', [1], 12],
    ])
    // (a tone whose edge cuts a word, a plot's region under a label's end: a ground still, nothing of the text's)
    const cut = pageOf([[{ text: 'Accuracy rises', font: 'ArialMT' }]])
    const h = cut.page.glyphs as Glyph[]
    cut.fig.met.set(0, {
      items: [
        {
          ...boxMet(0, rect(h[3]!.x0, 697, h.at(-1)!.x1 + 5, 709, { stroke: false, fill: true, hw: 0 })),
          ground: true,
        },
      ],
      under: null,
    })
    expect(figureLinesOf([cut.page], cut.fig, () => false, null)).toEqual([])
  })
  it('reads tone pieces under consecutive stretches as one tone, a word space between them or not, their heights the words’ (2411.13093v4 p19)', () => {
    // ("D. It is hidden": a box under each word, as tall as the word's own ink and a point round it, a word space between boxes)
    const { page, fig } = pageOf([[{ text: 'D. It is hidden', font: 'Georgia' }]])
    const g = page.glyphs as Glyph[]
    const words: [number, number][] = [
      [0, 1],
      [3, 4],
      [6, 7],
      [9, 14],
    ]
    fig.met.set(0, {
      items: words.map(([a, b], i) => ({
        ...boxMet(
          i,
          rect(g[a]!.x0 - 1, 697 - (i === 3 ? 1 : 0), g[b]!.x1 + 1, 708, { stroke: false, fill: true, hw: 0 }),
        ),
        ground: true,
      })),
      under: null,
    })
    expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
  })
  it('makes no element of a stretch a plot’s shading holds, a tone taller than the line (2610.21547v1 p14 "bound m = 1")', () => {
    const { page, fig } = pageOf([[{ text: 'bound m = 1', font: 'Times' }]])
    const g = page.glyphs as Glyph[]
    // (the shaded column from the axis to the plot's top, under "m = 1")
    fig.met.set(0, {
      items: [
        {
          ...boxMet(0, rect(g[6]!.x0 - 2, 560, g.at(-1)!.x1 + 4, 760, { stroke: false, fill: true, hw: 0 })),
          ground: true,
        },
      ],
      under: null,
    })
    expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
  })
  it('leaves a run kept whole for its pitch as it was, a tone under a stretch of it (2608.06701v1 p1’s path line)', () => {
    const { page, fig } = pageOf([[{ text: 'lib/callback.py is', font: 'LMMono10-Regular' }]])
    const g = page.glyphs as Glyph[]
    fig.met.set(0, {
      items: [
        {
          ...boxMet(0, rect(g[0]!.x0 - 1, 697, g[14]!.x1 + 1, 709, { stroke: false, fill: true, hw: 0 })),
          ground: true,
        },
      ],
      under: null,
    })
    expect(figureLinesOf([page], fig, () => false, MONO)).toEqual([])
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

describe('figure-lines: F1, a formula in a figure is an element, never sent (the owner’s ruling of 2026-11-10)', () => {
  it('keeps a line that is a formula whole, its upright face one the document sets no word of apart from a formula (2609.19644v1 p37)', () => {
    // ("P" in KaTeX's math italic, no run of today's; "Mah" its subscript in KaTeX_Main, smaller and lower; " = 0.5" after it)
    const { page, fig } = pageOf([
      [
        { text: 'P', font: 'KaTeX_Math-Italic', run: false },
        { text: 'Mah', font: 'KaTeX_Main-Regular', size: 7, dy: -1.5 },
        { text: ' = 0.5', font: 'KaTeX_Main-Regular' },
      ],
    ])
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null)
    expect(rest).toEqual([])
    expect(t!.ks).toEqual([0, 1])
    expect(t!.why).toBe('formula')
  })
  it('makes each formula of a line with words an element `math`: "x and y" in the body face, a letter in a math face', () => {
    const { page, fig } = pageOf([
      [
        { text: 'x', font: 'CMMI10', run: false },
        { text: ' and ', font: 'CMR10' },
        { text: 'y', font: 'CMMI10', run: false },
      ],
    ])
    // (CMR10 the face the paper's source units set their text in: no formula's own face)
    const [t] = figureLinesOf([page], fig, () => false, null, new Set(['CMR10']))
    expect(t!.why).toBeNull()
    expect(t!.order.map((o) => o.t)).toEqual(['el', 'text', 'el'])
    expect(t!.els.map((e) => e.kind)).toEqual(['math', 'math'])
  })
  it('takes a script word that touches its base into the formula, an operator and a number a word space after it too', () => {
    // ("x" math italic, "base" its \\text subscript in the roman face, then " = 3 for the loss")
    const { page, fig } = pageOf([
      [
        { text: 'x', font: 'CMMI10', run: false },
        { text: 'base', font: 'CMR7', size: 7, dy: -1.5 },
        { text: ' = 3 for the loss', font: 'CMR10' },
      ],
    ])
    const [t] = figureLinesOf([page], fig, () => false, null, new Set(['CMR10']))
    expect(t!.ks).toEqual([0, 1])
    expect(t!.els).toHaveLength(1)
    const G = page.glyphs as Glyph[]
    expect(t!.els[0]!.glyphs.map((g) => G[g]!.u).join('')).toBe('xbase=3')
  })
  it('reads a number’s sign and ASCII marks in a text face as no formula: "−1.04", "<task-root>/"', () => {
    for (const text of ['gain −1.04 on it', 'open <task-root>/ now']) {
      const { page, fig } = pageOf([[{ text, font: 'Helvetica' }]])
      expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
    }
  })
  it('reads an upright face the document sets a word of apart from any formula as text: its words translated', () => {
    // (KaTeX_Main also sets a label of its own, no formula on its line: a text face; "arg min" a word before the formula)
    const { page, fig } = pageOf([
      [
        { text: 'arg min ', font: 'KaTeX_Main-Regular' },
        { text: 'x', font: 'KaTeX_Math-Italic', run: false },
      ],
      [{ text: 'Legend', font: 'KaTeX_Main-Regular' }],
    ])
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null)
    expect(rest).toEqual([])
    expect(t!.why).toBeNull()
    expect(t!.order.map((o) => o.t)).toEqual(['text', 'el'])
  })
})
