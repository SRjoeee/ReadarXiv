// A figure's texts as its printed lines tell them (src/locate/figure-lines.ts, PDF-READER §18.26): F0's lines, a line of code,
// and the relation reading of a crowded text's ink (the owner's reformulation of 2026-11-10 of the no-touch rule).
import { describe, expect, it } from 'vitest'
import type { DocGlyph } from '../src/doc.ts'
import { pageGlyphsOf } from '../src/glyph.ts'
import { copyRunsOf, figureLinesOf, setApart } from '../src/locate/figure-lines.ts'
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
 *  a space 3, a word's, or `space` where a justified line stretches it) */
function glyphsOf(text: string, x: number, y: number, font: string, size = 10, space = 3, gaps = false): Glyph[] {
  const out: Glyph[] = []
  for (const u of text) {
    const w = ((u === ' ' ? space : font.includes('Mono') ? 6 : 5 + (u.codePointAt(0)! % 3)) * size) / 10
    if (gaps && u === ' ') {
      x += w
      continue
    }
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
  parts: {
    text: string
    font: string
    run?: boolean
    x?: number
    size?: number
    dy?: number
    space?: number
    gaps?: boolean
  }[][],
  boxes: number[][] = [],
) {
  const glyphs: Glyph[] = []
  const units: TodayFigures['units'] = []
  const map = new Map<number, number>()
  parts.forEach((line, li) => {
    let x = 72
    const y = 700 - 14 * li
    for (const p of line) {
      const gs = glyphsOf(p.text, p.x ?? x, y + (p.dy ?? 0), p.font, p.size, p.space, p.gaps)
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
    // (the marker is ink that is no text: the word laid, no element of its letter (step 2))
    expect([t?.why, t?.els]).toEqual([null, []])
  })
  it('makes no element of a mark a box holds inside a number: a decoration holds a word, a letter or a digit in it (2610.42112v1)', () => {
    const { page, fig } = pageOf([[{ text: '3.61 pp', font: 'DejaVuSans' }]])
    const g = page.glyphs as Glyph[]
    crowd(fig, 0, [boxMet(0, rect(g[1]!.x0 - 0.3, 697, g[1]!.x1 + 0.3, 708))])
    // (the box is ink that is no text: the number laid whole, no element of its mark (step 2))
    expect(figureLinesOf([page], fig, () => false, null).map((t) => [t.why, t.els])).toEqual([[null, []]])
  })
  // (2608.06701v1 p2's node "Any / signal / detected?" in a diamond, its branch label "yes" beside it: inside the diamond's box,
  // outside the diamond)
  const diamond = (cx: number, cy: number, w: number, h: number): TodayShape => ({
    segs: [cx, cy + h, cx + w, cy, cx + w, cy, cx, cy - h, cx, cy - h, cx - w, cy, cx - w, cy, cx, cy + h],
    stroke: true,
    fill: false,
    hw: 0.5,
  })
  const node = () =>
    pageOf([
      [{ text: 'Any', font: 'TimesNewRomanPSMT', x: 90 }],
      [{ text: 'signal', font: 'TimesNewRomanPSMT', x: 82.5 }],
      [
        { text: 'detected?', font: 'TimesNewRomanPSMT', x: 71.5 },
        { text: 'yes', font: 'TimesNewRomanPSMT', x: 140, dy: -7 },
      ],
    ])
  it('makes the lines a closed path holds alone one text: a node’s label, its lines centred, its room the path’s (F3)', () => {
    const { page, fig } = node()
    fig.holds = [{ p: 1, b: 0, ks: [0, 1, 2], shape: diamond(100, 688, 60, 30) }]
    const texts = figureLinesOf([page], fig, () => false, null)
    const t = texts.find((x) => x.ks.includes(0))
    expect(t!.ks).toEqual([0, 1, 2])
    expect(t!.order.map((o) => (o.t === 'br' ? o.end : o.t))).toEqual(['text', 'space', 'text', 'space', 'text'])
    expect(t!.para).toEqual({ justified: false, by: 'container', align: 'c' })
    expect(t!.why).toBeNull()
    expect(t!.container).not.toBeNull()
    expect(texts.some((x) => x.ks.includes(3))).toBe(false)
  })
  it('joins a node’s word broken with no hyphen where the paper writes it whole elsewhere: "test_password|_lookup.py" (2608.06701v1 p9)', () => {
    const gapped = (text: string, x: number) => [{ text, font: 'TimesNewRomanPSMT', gaps: true, x }]
    const end = (elsewhere: boolean) => {
      const { page, fig } = pageOf([
        gapped('test_password', 79.5),
        gapped('_lookup.py', 91),
        [],
        [],
        elsewhere ? gapped('run test_password_lookup.py now', 300) : [],
      ])
      const p = { ...page, glyphs: pageGlyphsOf(page.glyphs as unknown as DocGlyph[]) } as unknown as TodayPage
      fig.holds = [{ p: 1, b: 0, ks: [0, 1], shape: rect(70, 680, 170, 712) }]
      const t = figureLinesOf([p], fig, () => false, null).find((x) => x.ks.includes(0))
      return t?.order.find((o) => o.t === 'br')
    }
    expect(end(true)).toEqual({ t: 'br', end: 'join' })
    expect(end(false)).toEqual({ t: 'br', end: 'space' })
  })
  it('joins a path’s lines as a node’s label alone: centred, in one face, no item among them (its rows, a title, a list apart)', () => {
    const T = 'TimesNewRomanPSMT'
    const holds = (parts: Parameters<typeof pageOf>[0]) => {
      const { page, fig } = pageOf(parts)
      fig.holds = [{ p: 1, b: 0, ks: parts.map((_, k) => k), shape: rect(60, 600, 200, 712) }]
      return figureLinesOf([page], fig, () => false, null).filter((t) => t.ks.length > 1)
    }
    // (rows set flush left over an image, a value over a value: 2610.37668v1's PSNR / LPIPS / FPS)
    expect(holds([[{ text: 'PSNR 17.03 dB', font: T, x: 72 }], [{ text: 'LPIPS 0.481', font: T, x: 72 }]])).toEqual([])
    // (a title over a subtitle in another face, centred: two texts)
    expect(
      holds([
        [{ text: 'Subtask B', font: 'TimesNewRomanPS-BoldMT', x: 100 }],
        [{ text: 'dependent', font: T, x: 100 }],
      ]),
    ).toEqual([])
    // (a list in a node: its items' own)
    expect(holds([[{ text: '- identify', font: T, x: 100 }], [{ text: '- place', font: T, x: 106 }]])).toEqual([])
  })
  it('joins no two lines a path holds on one baseline: two labels side by side (2608.06701v1 p8’s "Prefix Phase", "Full Phase")', () => {
    const { page, fig } = pageOf([
      [
        { text: 'Prefix Phase', font: 'TimesNewRomanPSMT', x: 72 },
        { text: 'Full Phase', font: 'TimesNewRomanPSMT', x: 200 },
      ],
    ])
    fig.holds = [{ p: 1, b: 0, ks: [0, 1], shape: rect(60, 690, 280, 712) }]
    expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
  })
  // (a row's width as glyphsOf sets it at size 10: x where a row of these parts stands centred on cx, its parts `gap` apart)
  const widthOf = (t: string) => [...t].reduce((w, u) => w + (u === ' ' ? 3 : 5 + (u.codePointAt(0)! % 3)), 0)
  const centred = (cx: number, font: string, texts: string[], gap = 0) => {
    let x = cx - (texts.reduce((w, t) => w + widthOf(t), 0) + gap * (texts.length - 1)) / 2
    return texts.map((text) => {
      const part = { text, font, x }
      x += widthOf(text) + gap
      return part
    })
  }
  it('reads the runs a path holds on one baseline one line: a row its words stand wide apart in, a node’s label still', () => {
    const T = 'TimesNewRomanPSMT'
    const { page, fig } = pageOf([
      centred(130, T, ['Locate the actual']),
      centred(130, T, ['validate', 'record'], 12),
      centred(130, T, ['checks']),
    ])
    fig.holds = [{ p: 1, b: 0, ks: [0, 1, 2, 3], shape: rect(60, 660, 200, 712) }]
    const [t] = figureLinesOf([page], fig, () => false, null).filter((x) => x.ks.length > 1)
    expect(t!.ks).toEqual([0, 1, 2, 3])
    expect(t!.para).toEqual({ justified: false, by: 'container', align: 'c' })
    expect(t!.order.filter((o) => o.t === 'br')).toHaveLength(2)
  })
  it('reads a row whose bold words outnumber its others in the face of its family (2608.06701v1 p2’s "… to inspect the")', () => {
    const R = 'MUFUZY+ArialMT',
      B = 'MUFUZY+Arial-BoldMT'
    const { page, fig } = pageOf([
      centred(130, R, ['Open the relevant']),
      [...centred(130, R, ['to', 'inspect', 'it'], 3)].map((q, i) => (i === 1 ? { ...q, font: B } : q)),
      centred(130, R, ['validation checks']),
    ])
    fig.holds = [{ p: 1, b: 0, ks: [0, 1, 2, 3, 4], shape: rect(60, 660, 200, 712) }]
    const [t] = figureLinesOf([page], fig, () => false, null).filter((x) => x.ks.length > 1)
    expect(t?.ks).toEqual([0, 1, 2, 3, 4])
  })
  it('joins no legend a frame holds: its entries each led by a sample of its own, whatever their lengths (1512.03385v1 p5)', () => {
    // (two entries of one length, their centres one: "plain-18" over "plain-81" (glyphsOf's widths by character), a line sample
    // before each; the frame round them holds them alone, its samples a stroke within one line's band each)
    const T = 'TimesNewRomanPSMT'
    const { page, fig } = pageOf(
      [[{ text: 'plain-18', font: T, x: 100 }], [{ text: 'plain-81', font: T, x: 100 }]],
      [
        [80, 702, 95, 703],
        [80, 688, 95, 689],
      ],
    )
    fig.holds = [{ p: 1, b: 9, ks: [0, 1], shape: rect(75, 680, 160, 712) }]
    expect(figureLinesOf([page], fig, () => false, null).filter((t) => t.ks.length > 1)).toEqual([])
    // (its samples after its entries, or a marker before each past a leader's reach, a frame's side beside both: each row's own ink
    // beside its words is a legend's still, 1512.03385v1 p1 and p5, 2610.21085v1 p31, 2010.11929v2 p7)
    const beside = (boxes: number[][]) => {
      const { page: pg, fig: f } = pageOf(
        [[{ text: 'plain-18', font: T, x: 100 }], [{ text: 'plain-81', font: T, x: 100 }]],
        boxes,
      )
      f.holds = [{ p: 1, b: 9, ks: [0, 1], shape: rect(75, 680, 180, 712) }]
      return figureLinesOf([pg], f, () => false, null).filter((t) => t.ks.length > 1)
    }
    expect(
      beside([
        [150, 702, 170, 703],
        [150, 688, 170, 689],
      ]),
    ).toEqual([])
    expect(
      beside([
        [78, 700, 82, 704],
        [78, 686, 82, 690],
        [90, 680, 90.5, 712],
      ]),
    ).toEqual([])
  })
  it('joins a node’s label its neighbours’ edges lead, and no rows of one length: they show no centring (2609.26457v1 p6)', () => {
    const T = 'TimesNewRomanPSMT'
    const node = (rows: Parameters<typeof pageOf>[0], boxes: number[][], x0: number) => {
      const { page, fig } = pageOf(rows, boxes)
      fig.holds = [{ p: 1, b: 9, ks: rows.map((_, k) => k), shape: rect(x0, 680, 190, 712) }]
      return figureLinesOf([page], fig, () => false, null).filter((t) => t.ks.length > 1)
    }
    // ("patches an error" over "crashed an error", centred, their left edges a point apart; the edges of the nodes beside it end
    // right before each row, outside its path: no legend's samples, the node's label one text)
    const two = [centred(135, T, ['patches an error']), centred(135, T, ['crashed an error'])]
    expect(node(two, [], 88.5)).toHaveLength(1)
    expect(
      node(
        two,
        [
          [70, 699, 87, 700],
          [70, 685, 87, 686],
        ],
        88.5,
      ),
    ).toHaveLength(1)
    // (two rows of one length, their edges one: centred or flush, no fact says which (1512.03385v1 p1's "56-layer" over
    // "20-layer", two curves' labels))
    expect(node([[{ text: '56-layer', font: T, x: 100 }], [{ text: '65-layer', font: T, x: 100 }]], [], 75)).toEqual([])
  })
  it('reads a closed path’s inside by its interior: a glyph inside its box and outside it crowds nothing (2608.06701v1 p2)', () => {
    // (one line in the diamond, "yes" beside it: in the diamond's box, outside the diamond)
    const { page, fig } = pageOf([
      [
        { text: 'detected?', font: 'TimesNewRomanPSMT', x: 71.5 },
        { text: 'yes', font: 'TimesNewRomanPSMT', x: 140, dy: -22 },
      ],
    ])
    fig.units[0]!.why = 'crowded'
    fig.met.set(0, { items: [boxMet(0, diamond(100, 700, 60, 30))], under: null })
    const [t] = figureLinesOf([page], fig, () => false, null).filter((x) => x.ks.includes(0))
    expect(t!.why).toBeNull()
    expect(t!.container).not.toBeNull()
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
    // ("D. It is hidden": a box under each word, as tall as the word's own ink and a point round it, a word space between boxes;
    // the option before it under it, as Figure 9 lists them)
    const { page, fig } = pageOf([
      [{ text: 'D. It is hidden', font: 'Georgia' }],
      [{ text: 'C. It is shown', font: 'Georgia' }],
    ])
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
    // (an item, F3: its marker "D." its label; the tone under the label and under every word of its text is its ground, no
    // word an element)
    const texts = figureLinesOf([page], fig, () => false, null)
    expect(texts.map((x) => x.label.map((j) => g[j]!.u).join(''))).toEqual(['D.', 'C.'])
    expect([texts[0]!.els, texts[0]!.why]).toEqual([[], null])
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
  it('hides a doubled copy with the text it doubles, and lays a text a curve crosses (step 2)', () => {
    const { page, fig } = pageOf([[{ text: 'import', font: 'Courier' }], [{ text: 'Loss', font: 'DejaVuSans' }]])
    const glyphs = page.glyphs as Glyph[]
    // (a copy of "i" over the first, 0.5 pt up; and a curve through "Loss")
    glyphs.push({ ...glyphs[0]!, y: glyphs[0]!.y + 0.5, top: glyphs[0]!.top + 0.5, bottom: glyphs[0]!.bottom + 0.5 })
    crowd(fig, 0, [{ g: glyphs.length - 1 }])
    const curve: TodayShape = { segs: [60, 684, 120, 690], stroke: true, fill: false, hw: 0.5 }
    crowd(fig, 1, [boxMet(0, curve)])
    const texts = figureLinesOf([page], fig, () => true, null)
    expect(texts.map((t) => [t.ks, t.why, t.copies.length])).toEqual([
      [[0], null, 1],
      [[1], null, 0],
    ])
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

describe('figure-lines: a path’s flush rows joined where the sentence goes on (option 3, the coordinator’s ruling of 2026-11-11)', () => {
  const T = 'ArialMT'
  /** a box round flush-left rows, `pad` to the right of its widest row, 5 to the left of them all */
  const box = (rows: string[], pad: number) => {
    const { page, fig } = pageOf(rows.map((text) => [{ text, font: T, x: 80 }]))
    const g = page.glyphs as Glyph[]
    const x1 = Math.max(...g.map((x) => x.x1)) + pad
    fig.holds = [{ p: 1, b: 9, ks: rows.map((_, k) => k), shape: rect(75, 700 - 14 * rows.length, x1, 712) }]
    return figureLinesOf([page], fig, () => false, null)
      .filter((t) => t.ks.length > 1)
      .map((t) => [t.ks, t.para?.align])
  }
  it('joins a bubble whose every break is forced and whose next row goes on in lower case (2608.06701v1 p2)', () => {
    expect(box(['Update the core', 'import validation', 'logic to accept', 'override validation'], 5)).toEqual([
      [[0, 1, 2, 3], 'l'],
    ])
    // (the first letter after a row's leading punctuation: "… to inspect the" goes on from the row above; the box 4 right of its
    // widest row, "…" unable to stand after "load")
    expect(box(['Open the relevant', 'portion, and load', '\u2026 to inspect the', 'validation checks'], 4)).toEqual([
      [[0, 1, 2, 3], 'l'],
    ])
  })
  it('joins no rows a capital, a digit or a symbol begins, and no break the box does not force', () => {
    // (a value over a value, 2610.37668v1's overlays: each row a statement of its own)
    expect(box(['PSNR 29.49 dB', 'LPIPS 0.1086', 'FPS 69.7'], 5)).toEqual([])
    // (a list of short statements, a sentence of two rows among them, 2611.03178v1 p21)
    expect(
      box(
        [
          'Review: long traces dominate',
          'Generate new tasks and traces;',
          'repair failed traces.',
          'Continue SFT from R2.',
        ],
        5,
      ),
    ).toEqual([[[1, 2], 'l']])
    // (rows in a box wide enough for the next row's first word: no break forced, rows)
    expect(box(['Update the core', 'import validation'], 80)).toEqual([])
  })
})

describe('figure-lines: step 2, ink that is no text never keeps a figure text (the owner’s ruling; G2, 2026-11-11)', () => {
  const crowd = (fig: TodayFigures, k: number, items: TodayMet[]) => {
    fig.units[k]!.why = 'crowded'
    fig.met.set(k, { items, under: null })
  }
  const T = 'DejaVuSans'
  it('lays a label an arrow or a plot line crosses, in its place (2610.21924v1 p5, 2610.21312v1 p3)', () => {
    const { page, fig } = pageOf([[{ text: 'Computational Cost', font: T, x: 100 }]])
    const arrow: TodayShape = { segs: [130, 680, 130, 720], stroke: true, fill: false, hw: 0.5 }
    const curve: TodayShape = { segs: [90, 690, 200, 708], stroke: true, fill: false, hw: 0.75 }
    crowd(fig, 0, [boxMet(0, arrow), boxMet(1, curve)])
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null)
    expect(rest).toEqual([])
    expect([t!.ks, t!.why]).toEqual([[0], null])
    expect(t!.container).toBeNull()
  })
  it('lays a legend entry beside its sample and a node label beside its icon', () => {
    const { page, fig } = pageOf([
      [{ text: 'Training (nominal)', font: T, x: 100 }],
      [{ text: 'Video Databases', font: T, x: 100 }],
    ])
    const sample: TodayShape = { segs: [80, 703, 95, 703], stroke: true, fill: false, hw: 0.5 }
    const icon = rect(84, 682, 96, 694, { fill: true, stroke: false })
    crowd(fig, 0, [boxMet(0, sample)])
    crowd(fig, 1, [boxMet(1, icon)])
    const texts = figureLinesOf([page], fig, () => false, null)
    expect(texts.map((t) => [t.ks, t.why])).toEqual([
      [[0], null],
      [[1], null],
    ])
  })
  it('frees turned labels their axis or a tick label crowds (the line reading reads level lines)', () => {
    const { page, fig } = pageOf([[{ text: 'Accuracy', font: T, x: 100 }], [{ text: 'Loss', font: T, x: 100 }]])
    // (both set turned a quarter: a y axis's title, its glyphs the page's turned ones; the first crowded by the axis line, the
    // second by a tick label's glyph)
    for (const u of fig.units) Object.assign(u, { ux: 0, uy: 1 })
    fig.turned = [fig.glyphs[0]!]
    fig.glyphs = [new Map()]
    const axis: TodayShape = { segs: [96, 600, 96, 720], stroke: true, fill: false, hw: 0.4 }
    crowd(fig, 0, [boxMet(0, axis)])
    crowd(fig, 1, [{ g: 0 }])
    const turned = fig.units.map((u) => u.why)
    figureLinesOf([page], fig, () => false, null)
    expect([turned, fig.units.map((u) => u.why)]).toEqual([
      ['crowded', 'crowded'],
      [null, null],
    ])
  })
  it('lays two rows of one label each in its place, though each row’s band holds the other’s glyphs (2610.42112v1 p22)', () => {
    // ("LongBench v2" over "(thinking)", 9 pt apart at size 10: each row's room meets the other's glyphs; neither is the other's
    // double, and the translation of each stands where that row stands)
    const { page, fig } = pageOf([
      [{ text: 'LongBench v2', font: T, x: 100 }],
      [{ text: '(thinking)', font: T, x: 104, dy: 5 }],
    ])
    const glyphs = page.glyphs as Glyph[]
    crowd(fig, 0, [{ g: glyphs.findIndex((g) => g.u === '(') }])
    crowd(fig, 1, [{ g: glyphs.findIndex((g) => g.u === 'L') }])
    expect(figureLinesOf([page], fig, () => false, null).map((t) => [t.ks, t.why])).toEqual([
      [[0], null],
      [[1], null],
    ])
  })
  it('draws an exact overprint once: the copy hidden with its text, no unit kept (2610.22214v1’s legend)', () => {
    // (a legend's entry drawn twice on itself: each unit's room meets every glyph of the other, each the other's twin; the first
    // text holds the second's glyphs as its copies, and ink.ts gives a run wholly its copies no text of its own: one translation)
    const { page, fig } = pageOf([
      [{ text: 'Grouping range:', font: T, x: 100 }],
      [{ text: 'Grouping range:', font: T, x: 100, dy: 14 }],
    ])
    const g = page.glyphs as Glyph[]
    const n = g.length / 2
    const first = [...Array(n).keys()].filter((i) => !g[i]!.blank),
      second = first.map((i) => i + n)
    fig.units[1]!.y = fig.units[0]!.y
    crowd(
      fig,
      0,
      second.map((i) => ({ g: i })),
    )
    crowd(
      fig,
      1,
      first.map((i) => ({ g: i })),
    )
    const texts = figureLinesOf([page], fig, () => false, null)
    expect(texts.map((t) => [t.ks, t.why])).toEqual([
      [[0], null],
      [[1], null],
    ])
    expect(texts[0]!.copies.sort((a, b) => a - b)).toEqual(second)
    // (the second run, its space a glyph of its run as today's reading maps it and no copy (no ink to pair), wholly the first
    // text's copies: no text of its own in ink.ts, one translation drawn)
    g.forEach((x, i) => {
      if (x.blank) fig.glyphs[0]!.set(i, i < n ? 0 : 1)
    })
    expect(copyRunsOf(texts[0]!, fig, [page])).toEqual([1])
    // (drawn once: no unit marked kept for being drawn twice)
    expect(fig.units.map((u) => u.double)).toEqual([undefined, undefined])
  })
  it('keeps an overprint the reading did not make one text, and a run whose every glyph is set twice (2610.21924v1 p5)', () => {
    // (two units of "CONDITIONAL RESCUE" on one another, neither's room meeting the other's glyphs: no copy recorded, two
    // translations would be drawn over each other; both kept)
    const { page, fig } = pageOf([
      [{ text: 'RESCUE', font: T, x: 100 }],
      [{ text: 'RESCUE', font: T, x: 100.16, dy: 14 }],
    ])
    fig.units[1]!.y = fig.units[0]!.y
    figureLinesOf([page], fig, () => false, null)
    expect(fig.units.map((u) => u.why)).toEqual(['crowded', 'crowded'])
    // (each marked kept for being drawn twice: the made unit's `double`, the dump's `keptBy: 'double'`, the differential's (q))
    expect(fig.units.map((u) => u.double)).toEqual([true, true])
    // (one run whose glyphs are each set twice, a hair apart: its text "SSEEAARRCCHH", no text to send)
    const twice = pageOf([[{ text: 'SEARCH', font: T, x: 100 }]])
    const g = twice.page.glyphs as Glyph[]
    const n = g.length
    for (let i = 0; i < n; i++)
      g.push({ ...g[i]!, x0: g[i]!.x0 + 0.2, x1: g[i]!.x1 + 0.2, ix0: g[i]!.ix0 + 0.2, ix1: g[i]!.ix1 + 0.2 })
    for (let i = n; i < 2 * n; i++) twice.fig.glyphs[0]!.set(i, 0)
    figureLinesOf([twice.page], twice.fig, () => false, null)
    expect(twice.fig.units.map((u) => u.why)).toEqual(['crowded'])
    expect(twice.fig.units.map((u) => u.double)).toEqual([true])
  })
  it('reads each page’s units by that page’s glyphs: a long label on one page, a short one on the next (2610.21924v1)', () => {
    // (the overprint test sorted every unit's glyphs by the last page's glyph array, and a unit of an earlier page whose glyphs
    // that page has not crashed the paper)
    const one = pageOf([[{ text: 'a long label of many glyphs here', font: T, x: 100 }]])
    const two = pageOf([[{ text: 'ab', font: T, x: 100 }]])
    const u2 = { ...two.fig.units[0]!, k: 1 }
    const fig: TodayFigures = {
      units: [{ ...one.fig.units[0]!, page: 1 } as never, { ...u2, page: 2 } as never],
      glyphs: [one.fig.glyphs[0]!, new Map([...two.fig.glyphs[0]!].map(([g]) => [g, 1]))],
      turned: [new Map(), new Map()],
      met: new Map(),
    }
    expect(() => figureLinesOf([one.page, two.page], fig, () => false, null)).not.toThrow()
  })
  it('reads no double in one token on two lines a pitch under its size apart: their ink does not overlap (2609.19644v1 p38)', () => {
    // ("import" at the head of two lines of code 10 pt apart at size 10.5: the same string within the size, two lines)
    const { page, fig } = pageOf([
      [{ text: 'import', font: T, x: 100, size: 10.5 }],
      [{ text: 'import', font: T, x: 100, size: 10.5, dy: 4 }],
    ])
    Object.assign(fig.units[0]!, { size: 10.5 })
    Object.assign(fig.units[1]!, { size: 10.5 })
    figureLinesOf([page], fig, () => false, null)
    expect(fig.units.map((u) => u.why)).toEqual([null, null])
  })
  it('keeps a text drawn twice: a copy of its string a little off it, or a pale copy under it (2610.21313v1)', () => {
    // (two copies of one label 0.7 of the size apart, each the other's ink: both kept, never two translations over each other)
    const twice = (dx: number, dy: number, fill?: number) => {
      const { page, fig } = pageOf([
        [{ text: 'SAMA', font: T, x: 100 }],
        [{ text: 'SAMA', font: T, x: 100 + dx, dy: 14 + dy }],
      ])
      const g = page.glyphs as Glyph[]
      if (fill !== undefined) for (const x of g.slice(4)) Object.assign(x, { fill })
      fig.units[1]!.y = fig.units[0]!.y! + dy
      crowd(fig, 0, [{ g: 4 }])
      crowd(fig, 1, [{ g: 0 }])
      return figureLinesOf([page], fig, () => false, null).filter((t) => !t.why)
    }
    expect(twice(7, 3.5)).toEqual([])
    // ("Psum Buffer" under a pale copy of itself, 2.4 pt up and across: within half its size, but another fill, no overprint)
    expect(twice(2.4, 2.4, 0xcccccc)).toEqual([])
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
  it('keeps a label’s words text where its face sets no letter inside a formula: "jury, α = 8", the face’s only line (2610.21085v1)', () => {
    // (a face is a formula's own only where a letter of it stands in a formula's cluster, no word space from a formula's glyph:
    // a label's face beside a formula is the label's, though the document sets no other word in it)
    const { page, fig } = pageOf([
      [
        { text: 'jury, ', font: 'Helvetica' },
        { text: 'α', font: 'CMMI10', run: false },
        { text: ' = 8', font: 'Helvetica' },
      ],
    ])
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null)
    expect(rest).toEqual([])
    expect(t!.why).toBeNull()
    expect(t!.order.map((o) => o.t)).toEqual(['text', 'el'])
    const G = page.glyphs as Glyph[]
    expect(t!.els[0]!.glyphs.map((g) => G[g]!.u).join('')).toBe('α=8')
  })
  it('takes a phrase in a formula’s own face that touches a formula into it: "log det" between two formulas (2609.19644v1 p37)', () => {
    // ("Tr(" abuts the math italic x: KaTeX_Main sets letters inside a formula's cluster; "log det" a word space from the formulas
    // either side, every letter of it in that face: the formula's, the line a formula whole)
    const { page, fig } = pageOf([
      [
        { text: 'Tr(', font: 'KaTeX_Main-Regular' },
        { text: 'x', font: 'KaTeX_Math-Italic', run: false },
        { text: ') log det ', font: 'KaTeX_Main-Regular' },
        { text: 'y', font: 'KaTeX_Math-Italic', run: false },
      ],
    ])
    const [t] = figureLinesOf([page], fig, () => false, null)
    expect(t!.why).toBe('formula')
  })
  it('reads a number’s sign and ASCII marks in a text face as no formula: "−1.04", "<task-root>/"', () => {
    for (const text of ['gain −1.04 on it', 'open <task-root>/ now']) {
      const { page, fig } = pageOf([[{ text, font: 'Helvetica' }]])
      expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
    }
  })
  it('reads a sum with its limits as one formula of its line, its lower limit spanning the gap past the run gap (2609.19644v1 p60)', () => {
    // ("analogue sub-bands are y_knn^band = Σ_{i=1}^k w_i y_i^band, and the …": the main line's math glyphs no run holds, its
    // scripts runs of their own, the sum's lower limit "i=1" under the baseline the only ink across the 8 pt from "k" to "w")
    const T = 'NimbusRomNo9L-Regu'
    const { page, fig } = pageOf([
      [
        { text: 'analogue sub-bands are', font: T },
        { text: 'y', font: 'CMMI10', run: false, x: 150 },
        { text: 'band', font: T, size: 7, dy: 2.8, x: 154.5 },
        { text: '=', font: 'CMR10', run: false, x: 175 },
        { text: 'P', font: 'CMEX10', run: false, x: 182, dy: 5.7 },
        { text: 'k', font: 'CMMI7', size: 7, run: false, x: 190, dy: 3.8 },
        { text: 'i', font: 'CMMI7', size: 7, run: false, x: 190, dy: -2.3 },
        { text: '=1', font: 'CMR7', size: 7, run: false, x: 192, dy: -2.3 },
        { text: 'w', font: 'CMMI10', run: false, x: 203 },
        { text: 'y', font: 'CMMI10', run: false, x: 210 },
        { text: 'band', font: T, size: 7, dy: 2.8, x: 214.5 },
        { text: ', and the rest', font: T, x: 232 },
      ],
    ])
    const G = page.glyphs as Glyph[]
    const texts = figureLinesOf([page], fig, () => false, null, new Set([T]))
    expect(texts).toHaveLength(1)
    const [t] = texts
    expect(t!.ks).toEqual([0, 1, 2, 3])
    const inEls = new Set(t!.els.flatMap((e) => e.glyphs))
    const limit = G.flatMap((g, i) => (g.y < 699 && /[i=1]/.test(g.u) ? [i] : []))
    expect(limit).toHaveLength(3)
    expect(limit.every((g) => inEls.has(g))).toBe(true)
  })
  it('keeps a line its scripts join at its own size and baseline: a display whose superscript runs outnumber its text (2609.19644v1 p59)', () => {
    // ("ŷ^final = ŷ^base + β · scale_q · (g_low(x)": the superscripts "final" and "base" and the subscript "low" runs of their
    // own, "scale" a run of the body face, every math glyph no run's; the subscript q right after "scale", on the subscripts'
    // baseline: the runs outnumber the text's, and a line voted by its runs alone stood on a script's baseline)
    const T = 'NimbusRomNo9L-Regu'
    const { page, fig } = pageOf([
      [
        { text: 'y', font: 'CMMI10', run: false, x: 196 },
        { text: 'final', font: T, size: 7, dy: 4.05, x: 202.9 },
        { text: '=', font: 'CMR10', run: false, x: 225 },
        { text: 'y', font: 'CMMI10', run: false, x: 232 },
        { text: 'base', font: T, size: 7, dy: 4.05, x: 237 },
        { text: '+', font: 'CMR10', run: false, x: 258 },
        { text: 'β', font: 'CMMI10', run: false, x: 265 },
        { text: '·', font: 'CMSY10', run: false, x: 272 },
        { text: 'scale', font: T, x: 278 },
        { text: 'q', font: 'CMMI7', size: 7, run: false, x: 307, dy: -1.57 },
        { text: '·', font: 'CMSY10', run: false, x: 314.8 },
        { text: '(', font: 'CMR10', run: false, x: 320 },
        { text: 'g', font: 'CMMI10', run: false, x: 326 },
        { text: 'low', font: T, size: 7, dy: -1.57, x: 332 },
        { text: '(', font: 'CMR10', run: false, x: 345 },
        { text: 'x', font: 'CMMI10', run: false, x: 349 },
        { text: ')', font: 'CMR10', run: false, x: 355 },
      ],
    ])
    const G = page.glyphs as Glyph[]
    const texts = figureLinesOf([page], fig, () => false, null, new Set([T]))
    expect(texts).toHaveLength(1)
    const [t] = texts
    expect(t!.why).toBe('formula')
    const all = new Set(t!.order.flatMap((o) => (o.t === 'text' ? o.glyphs : o.t === 'el' ? t!.els[o.i]!.glyphs : [])))
    expect(G.every((g, i) => g.blank || all.has(i))).toBe(true)
  })
  it('keeps a text the original’s where ink no line holds stands under its formula: the element would move, that ink stay', () => {
    // (a sum set with its limits under it, 0.7 of the size below the baseline: past half the size, no line takes them; the
    // words before it translated would carry the sum away from its limits)
    const T = 'NimbusRomNo9L-Regu'
    const { page, fig } = pageOf([
      [
        { text: 'the weights are', font: T },
        { text: 'P', font: 'CMEX10', run: false, x: 160, dy: 3 },
        { text: 'i=1', font: 'CMMI7', size: 7, run: false, x: 159, dy: -7 },
        { text: 'w', font: 'CMMI10', run: false, x: 168 },
        { text: 'for each band', font: T, x: 178 },
      ],
    ])
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null, new Set([T]))
    expect(rest).toEqual([])
    expect(t!.els.map((e) => e.kind)).toEqual(['math'])
    expect(t!.why).toBe('crowded')
  })
  it('reads ink no line took standing on another line’s baseline as that line’s, never its formula’s (2609.19644v1 p11)', () => {
    // (a table's group header over its rows: the number cells no unit, ink no line takes, stand on the row's baseline under the
    // header's formula)
    const T = 'NimbusRomNo9L-Regu'
    const table = pageOf([
      [
        { text: 'train loss ', font: T },
        { text: 'y', font: 'CMMI10', run: false },
        { text: ' lower is better', font: T },
      ],
      [
        { text: 'Epoch 0', font: T },
        { text: '0.3844', font: 'CMR10', run: false, x: 134 },
      ],
    ])
    const head = figureLinesOf([table.page], table.fig, () => false, null, new Set([T])).find((t) => t.ks.includes(0))
    expect(head!.els.map((e) => e.kind)).toEqual(['math'])
    expect(head!.why).toBeNull()
  })
  it('reads a caption’s last mark past its line’s run gap as that line’s, never the formula under it (2609.19644v1 p11)', () => {
    // (a caption's last "(" 16 past its line's end, past the run gap: ink no line takes, over the next line's formula "d", the
    // caption 11 over it at size 10 as 19644's 2.5 at 2.26)
    const T = 'NimbusRomNo9L-Regu'
    const caption = pageOf([
      [
        { text: 'Figure 5: QP scaling', font: T, dy: -3 },
        { text: '(', font: 'CMR10', run: false, x: 196, dy: -3 },
      ],
      [
        { text: 'time ', font: T, x: 170 },
        { text: 'd', font: 'CMMI10', run: false, x: 198 },
        { text: ' rises', font: T, x: 204 },
      ],
    ])
    const line = figureLinesOf([caption.page], caption.fig, () => false, null, new Set([T])).find((t) =>
      t.ks.includes(1),
    )
    expect(line!.els.map((e) => e.kind)).toEqual(['math'])
    expect(line!.why).toBeNull()
  })
  it('reads a mark set between two words, no space either side and no math face, as the words’: "Near−monopoly" (2610.11256v1 p17)', () => {
    // (a plot's labels set with the minus sign for their hyphen: each one text, translated; between two letters of a formula
    // it is the formula's: "x−y" kept)
    for (const text of ['Near−monopoly', 'Over−priced', 'input→output']) {
      const { page, fig } = pageOf([[{ text, font: 'Helvetica' }]])
      expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
    }
    const { page, fig } = pageOf([[{ text: 'x−y', font: 'Helvetica' }]])
    expect(figureLinesOf([page], fig, () => false, null).map((t) => t.why)).toEqual(['formula'])
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

describe('figure-lines: F3, a figure’s paragraph is one text; an item’s marker its label (the owner’s ruling of 2026-11-10)', () => {
  const body = (text: string) => [{ text, font: 'NimbusRomNo9L-Regu' }]
  /** a justified block's lines: each but the last set from 72 to `right`, its word spaces stretched alike (TeX's); the last as set */
  const justified = (lines: string[], right = 260) =>
    lines.map((text, i) => {
      if (i === lines.length - 1) return body(text)
      const letters = [...text].filter((u) => u !== ' ').reduce((w, u) => w + 5 + (u.codePointAt(0)! % 3), 0)
      return [{ text, font: 'NimbusRomNo9L-Regu', space: (right - 72 - letters) / (text.split(' ').length - 1) }]
    })
  it('joins a justified block into one text, a space at each line’s end; leaves three ragged lines as they were', () => {
    const { page, fig } = pageOf(
      justified(['the quick brown fox jumps over the', 'lazy dogs while Garza et al. run', 'away from it']),
    )
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null)
    expect(rest).toEqual([])
    expect(t!.ks).toEqual([0, 1, 2])
    expect(t!.order.map((o) => (o.t === 'br' ? o.end : o.t))).toEqual(['text', 'space', 'text', 'space', 'text'])
    expect(t!.why).toBeNull()
    expect(t!.para).toEqual({ justified: true, by: 'strong' })
    const ragged = pageOf([
      body('the quick brown fox jumps over'),
      body('lazy dogs while the others run'),
      body('away from it'),
    ])
    expect(figureLinesOf([ragged.page], ragged.fig, () => false, null)).toEqual([])
  })
  it('joins two lines at TeX’s hyphen, and leaves two ragged lines alone as they were', () => {
    const hyphen = pageOf([body('all of the foun-'), body('dation models')])
    const [t] = figureLinesOf([hyphen.page], hyphen.fig, () => false, null)
    expect(t!.ks).toEqual([0, 1])
    expect(t!.order.map((o) => (o.t === 'br' ? o.end : o.t))).toEqual(['text', 'drop', 'text'])
    const two = pageOf([body('the quick brown fox jumps over'), body('lazy dogs')])
    expect(figureLinesOf([two.page], two.fig, () => false, null)).toEqual([])
  })
  it('reads a line’s end off a page’s own glyphs, their coordinates in its array: TeX’s break dropped (2609.19644v1 p60 "con-|text")', () => {
    // (a page read from a PDF holds its glyphs' coordinates in one array, read by getters: a spread of a glyph copies none of them;
    // and TeX sets no glyph for a word space, a gap alone: the word's start is a gap, and a number earlier on the line is no part of it)
    const gapped = (text: string) => [{ text, font: 'NimbusRomNo9L-Regu', gaps: true }]
    const hyphen = pageOf([gapped('in 2024 the foun-'), gapped('dation models')])
    const page = {
      ...hyphen.page,
      glyphs: pageGlyphsOf(hyphen.page.glyphs as unknown as DocGlyph[]),
    } as unknown as TodayPage
    const [t] = figureLinesOf([page], hyphen.fig, () => false, null)
    expect(t!.ks).toEqual([0, 1])
    expect(t!.order.map((o) => (o.t === 'br' ? o.end : o.t))).toEqual(['text', 'drop', 'text'])
  })
  it('keeps a line-end hyphen the paper writes in the word elsewhere, in any case: a compound, never TeX’s break (2609.19644v1, 2610.21098v1)', () => {
    // (a figure's paragraph "per-|timestep" whose paper writes "per-timestep" on another line; a plot's two-line label
    // "Success-|superior" whose paper writes "success-superior": the source tells the word, as a body unit's does)
    const gapped = (text: string, x?: number) => [{ text, font: 'NimbusRomNo9L-Regu', gaps: true, ...(x ? { x } : {}) }]
    const end = (lines: { text: string; font: string; gaps: boolean; x?: number }[][]) => {
      const { page, fig } = pageOf(lines)
      const p = { ...page, glyphs: pageGlyphsOf(page.glyphs as unknown as DocGlyph[]) } as unknown as TodayPage
      const t = figureLinesOf([p], fig, () => false, null).find((x) => x.ks.includes(0))
      return t?.order.find((o) => o.t === 'br')
    }
    expect(
      end([gapped('in 2024 the per-'), gapped('timestep gate'), [], [], gapped('a per-timestep scale', 300)]),
    ).toEqual({
      t: 'br',
      end: 'join',
    })
    expect(
      end([gapped('in 2024 a Success-'), gapped('superior repair'), [], [], gapped('is success-superior', 300)]),
    ).toEqual({
      t: 'br',
      end: 'join',
    })
    // (written nowhere else: TeX's rules, its break)
    expect(end([gapped('in 2024 the per-'), gapped('timestep gate')])).toEqual({ t: 'br', end: 'drop' })
    // (a digit beside the hyphen: TeX hyphenates letters alone, the author's hyphen, joined: 2609.19644v1's "128-|bit")
    expect(end([gapped('in 2024 a 128-'), gapped('bit vector')])).toEqual({ t: 'br', end: 'join' })
  })
  it('makes an item’s marker its label, never its text: "A. 12:30 PM in the car", an item of a list (2411.13093v4 p19)', () => {
    // (each marker with the next item's, one under the other at one left edge: a list)
    for (const [marker, next] of [
      ['A.', 'B.'],
      ['c)', 'd)'],
      ['(b)', '(c)'],
      ['1.', '2.'],
      ['-', '-'],
    ]) {
      const { page, fig } = pageOf([body(`${marker} 12:30 PM in the car`), body(`${next} 1:30 PM in the canteen`)])
      const [t, u, ...rest] = figureLinesOf([page], fig, () => false, null)
      expect(rest).toEqual([])
      const G = page.glyphs as Glyph[]
      expect(t!.label.map((g) => G[g]!.u).join('')).toBe(marker)
      expect(u!.label.map((g) => G[g]!.u).join('')).toBe(next)
      expect(t!.order).toHaveLength(1)
      const text = t!.order[0] as { t: 'text'; glyphs: number[] }
      expect(text.glyphs.map((g) => G[g]!.u).join('')).toBe('12:30PMinthecar')
    }
    // (no marker: a word, an abbreviation, a number with its unit, a marker alone)
    for (const text of ['An option in the car', 'e.g. in the car', '12.5 km from here', 'A.']) {
      const { page, fig } = pageOf([body(text)])
      expect(figureLinesOf([page], fig, () => false, null)).toEqual([])
    }
  })
  it('reads options set as a grid as a list: the next marker one apart on one baseline or at one left edge (2411.13093v4 p19)', () => {
    // (A. B. / C. D.: two options a row, A over C and B over D, at two left edges)
    const { page, fig } = pageOf([
      [
        { text: 'A. 12:30 PM in the car.', font: 'NimbusRomNo9L-Regu' },
        { text: 'B. 12:30 PM in the canteen.', font: 'NimbusRomNo9L-Regu', x: 260 },
      ],
      [
        { text: 'C. 12:30 PM in the classroom.', font: 'NimbusRomNo9L-Regu' },
        { text: 'D. 12:00 PM in the classroom.', font: 'NimbusRomNo9L-Regu', x: 260 },
      ],
    ])
    const G = page.glyphs as Glyph[]
    const texts = figureLinesOf([page], fig, () => false, null)
    expect(texts.map((t) => t.label.map((g) => G[g]!.u).join('')).sort()).toEqual(['A.', 'B.', 'C.', 'D.'])
    for (const t of texts)
      expect(t.order.every((o) => o.t !== 'text' || !/^[A-D]\./u.test(o.glyphs.map((g) => G[g]!.u).join('')))).toBe(
        true,
      )
  })
  it('reads the enumerators LaTeX’s list counters print: roman numerals, a number of any length, letters, bullets and dashes', () => {
    // (\roman and \Roman's "ii." and "IV)", "(iii)"; \arabic's past 999; "i." an \alph's or a \roman's, either list)
    for (const [marker, next] of [
      ['ii.', 'iii.'],
      ['IV)', 'V)'],
      ['(iii)', '(iv)'],
      ['1000.', '1001.'],
      ['i.', 'ii.'],
      ['i.', 'j.'],
      ['•', '•'],
    ]) {
      const { page, fig } = pageOf([body(`${marker} the first item here`), body(`${next} the second item here`)])
      const G = page.glyphs as Glyph[]
      expect(figureLinesOf([page], fig, () => false, null).map((t) => t.label.map((g) => G[g]!.u).join(''))).toEqual([
        marker,
        next,
      ])
    }
  })
  it('reads no label where no list stands: an initial opening a reference’s line, a bracket’s end (2609.19644v1 pp. 66, 70)', () => {
    // ("S. Smith and P. Li. A title" alone; "64) and the rest" with no "63)" or "65)"; "A." and "C." are no list)
    for (const lines of [
      ['S. Smith and P. Li. A title'],
      ['64) and the rest of it'],
      ['A. the first one', 'C. the third one'],
    ]) {
      const { page, fig } = pageOf(lines.map(body))
      expect(figureLinesOf([page], fig, () => false, null).flatMap((t) => t.label)).toEqual([])
    }
  })
  it('begins an item at each marker: an item of two lines one text with its label, the next item its own', () => {
    const { page, fig } = pageOf([
      body('A. all of the foun-'),
      [{ text: 'dation models', font: 'NimbusRomNo9L-Regu', x: 84 }],
      body('B. the second option'),
    ])
    const texts = figureLinesOf([page], fig, () => false, null)
    const G = page.glyphs as Glyph[]
    expect(texts.map((t) => [t.ks, t.label.map((g) => G[g]!.u).join('')])).toEqual([
      [[0, 1], 'A.'],
      [[2], 'B.'],
    ])
  })
  it('reads two fragments of a justified line across its stretched space as one line of its paragraph; a gutter under a title never', () => {
    // (a justified block: its second line set in two runs 8 pt apart, past the run gap, the line over it with ink across that
    // gap: one line, the paragraph whole)
    const just = pageOf([
      justified(['a quick brown fox jumps over', 'x'], 249)[0]!,
      [
        { text: 'lazy dogs while.', font: 'NimbusRomNo9L-Regu' },
        { text: 'The others run', font: 'NimbusRomNo9L-Regu', x: 170 },
      ],
      body('away from it'),
    ])
    const [t, ...rest] = figureLinesOf([just.page], just.fig, () => false, null)
    expect(rest).toEqual([])
    expect(t!.ks).toEqual([0, 1, 2, 3])
    // (a title over two columns: the row under the first has the gutter too: two columns, each its own paragraph)
    const cols = pageOf([
      body('a title set over both of the columns here'),
      [
        { text: 'the left col-', font: 'NimbusRomNo9L-Regu' },
        { text: 'the right col-', font: 'NimbusRomNo9L-Regu', x: 190 },
      ],
      [
        { text: 'umn goes on', font: 'NimbusRomNo9L-Regu' },
        { text: 'umn goes on', font: 'NimbusRomNo9L-Regu', x: 190 },
      ],
    ])
    expect(figureLinesOf([cols.page], cols.fig, () => false, null).map((x) => x.ks)).toEqual([
      [1, 3],
      [2, 4],
    ])
  })
  it('frees a paragraph’s line its own lines crowd, and makes a framed stretch of one an element (2609.19644v1 p58)', () => {
    const { page, fig } = pageOf(
      justified(['the quick brown fox jumps over the', 'lazy dogs while Garza et al. run', 'away from it']),
    )
    const G = page.glyphs as Glyph[]
    // (the second line's band meets a glyph of the first: its own paragraph's; and a frame round "Garza et al.")
    const at = G.findIndex((g) => g.u === 'G')
    const dot = G.findIndex((g, i) => i > at && g.u === '.')
    const frame = rect(G[at]!.x0 - 1, 683, G[dot]!.x1 + 1, 695)
    fig.units[1]!.why = 'crowded'
    fig.met.set(1, { items: [{ g: 2 }, boxMet(0, frame)], under: null })
    const [t] = figureLinesOf([page], fig, () => false, null)
    expect(t!.ks).toEqual([0, 1, 2])
    expect(t!.why).toBeNull()
    expect(t!.els.map((e) => [e.kind, e.boxes])).toEqual([['cite', [0]]])
  })
  it('makes a framed citation an element where its brackets’ and commas’ ink crosses the frame (2609.19644v1 p58)', () => {
    // (Preview's link frame round "(Garza et al.," is tight on the words: the bracket's ink 0.7 pt left of it, the comma's
    // 0.4 pt right; the letters' ink inside)
    const { page, fig } = pageOf(
      justified(['a quick brown fox jumps over the', 'lazy dogs (Garza et al., 2021) run', 'away from it']),
    )
    const G = page.glyphs as Glyph[]
    const a = G.findIndex((g) => g.u === '(')
    const c = G.findIndex((g, i) => g.u === ',' && i > a)
    const frame = rect(G[a]!.x0 + 0.7, 683, G[c]!.x1 - 0.4, 695)
    fig.units[1]!.why = 'crowded'
    fig.met.set(1, { items: [boxMet(0, frame)], under: null })
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null)
    expect(rest).toEqual([])
    expect(t!.ks).toEqual([0, 1, 2])
    expect(t!.why).toBeNull()
    expect(t!.els.map((e) => [e.kind, e.glyphs.map((g) => G[g]!.u).join('')])).toEqual([['cite', '(Garzaetal.,']])
  })
  it('reads a frame its paragraph’s runs each met once: its box on its element once', () => {
    const { page, fig } = pageOf(
      justified(['the quick brown fox jumps over the', 'lazy dogs while Garza et al. run', 'away from it']),
    )
    const G = page.glyphs as Glyph[]
    const at = G.findIndex((g) => g.u === 'G')
    const dot = G.findIndex((g, i) => i > at && g.u === '.')
    const frame = rect(G[at]!.x0 - 1, 683, G[dot]!.x1 + 1, 695)
    for (const k of [0, 1, 2]) {
      fig.units[k]!.why = 'crowded'
      fig.met.set(k, { items: [boxMet(0, frame)], under: null })
    }
    const [t, ...rest] = figureLinesOf([page], fig, () => false, null)
    expect(rest).toEqual([])
    expect(t!.ks).toEqual([0, 1, 2])
    expect(t!.why).toBeNull()
    expect(t!.els.map((e) => [e.kind, e.boxes])).toEqual([['cite', [0]]])
  })
  it('gives a frame on another line its own element, never one an element of this line spans across (2609.19644v1 p58)', () => {
    // (two citations on two lines of a paragraph, one frame under the other: each line's frame its own citation's)
    const T = 'NimbusRomNo9L-Regu'
    const { page, fig } = pageOf([
      [
        { text: 'the quick', font: T, x: 72 },
        { text: 'Garza et al.', font: T, x: 128 },
        { text: 'jumps over the foun-', font: T, x: 199 },
      ],
      [
        { text: 'dation of a', font: T, x: 76 },
        { text: 'Woo', font: T, x: 137 },
        { text: 'while run', font: T, x: 155 },
      ],
    ])
    // (the second line's frame, round "Woo", inside the first line's citation's extent across)
    fig.units[1]!.why = 'crowded'
    fig.met.set(1, { items: [boxMet(0, rect(127, 697, 197, 709))], under: null })
    fig.units[4]!.why = 'crowded'
    fig.met.set(4, { items: [boxMet(1, rect(136, 683, 153, 695))], under: null })
    const [t] = figureLinesOf([page], fig, () => false, null)
    expect(t!.ks).toEqual([0, 1, 2, 3, 4, 5])
    expect(t!.why).toBeNull()
    expect(t!.els.map((e) => [e.kind, e.boxes])).toEqual([
      ['cite', [0]],
      ['cite', [1]],
    ])
    // (lines so close that the second line's frame reaches into the first one's band: its middle on its own line, its own
    // citation's still, 2609.19644v1 p3)
    fig.met.set(4, { items: [boxMet(1, rect(136, 683, 153, 699))], under: null })
    const [u] = figureLinesOf([page], fig, () => false, null)
    expect(u!.els.map((e) => [e.kind, e.boxes])).toEqual([
      ['cite', [0]],
      ['cite', [1]],
    ])
  })
  it('reads a paragraph’s line break as a word’s end: a framed stretch ending one line or starting the next is an element', () => {
    const { page, fig } = pageOf(
      justified(['the quick brown fox jumps over the', 'lazy dogs while the others run', 'away from it']),
    )
    const G = page.glyphs as Glyph[]
    // (a frame round "the", the first line's last word, and one round "lazy", the second line's first)
    const first = G.flatMap((g, i) => (g.y === 700 && !g.blank ? [i] : [])).slice(-3)
    const second = G.flatMap((g, i) => (g.y === 686 && !g.blank ? [i] : [])).slice(0, 4)
    const end = rect(G[first[0]!]!.x0 - 1, 697, G[first[2]!]!.x1 + 1, 709)
    const start = rect(G[second[0]!]!.x0 - 1, 683, G[second[3]!]!.x1 + 1, 695)
    fig.units[0]!.why = 'crowded'
    fig.units[1]!.why = 'crowded'
    fig.met.set(0, { items: [boxMet(0, end)], under: null })
    fig.met.set(1, { items: [boxMet(1, start)], under: null })
    const [t] = figureLinesOf([page], fig, () => false, null)
    expect(t!.ks).toEqual([0, 1, 2])
    expect(t!.why).toBeNull()
    expect(t!.els.map((e) => [e.kind, e.boxes, e.glyphs.map((g) => G[g]!.u).join('')])).toEqual([
      ['cite', [0], 'the'],
      ['cite', [1], 'lazy'],
    ])
  })
})

describe("F3's `script`: a figure text the engine cannot draw as it was set is the original's (2026-11-11)", () => {
  // (glyphs of one text in its order: [character, font, size, x0, x1, baseline], their ink 0.7 of the size up and 0.2 down)
  const gl = (spec: [string, string, number, number, number, number][]) =>
    spec.map(([u, font, size, x0, x1, y]) => ({
      u,
      font,
      size,
      x0,
      x1,
      y,
      top: y + 0.7 * size,
      bottom: y - 0.2 * size,
      ix0: x0,
      ix1: x1,
    }))
  const text = (n: number) => ({ order: [{ t: 'text' as const, glyphs: [...Array(n).keys()] }], els: [] })
  it("keeps 2610.22214v1 p4's a_mn x_n = b_m: its subscripts smaller and off the row's baseline (ink-units.mjs scriptsOf)", () => {
    const G = gl([
      ['a', 'CMMI10', 6, 100, 103, 650],
      ['m', 'CMMI7', 4.2, 103, 106, 648.5],
      ['n', 'CMMI7', 4.2, 106, 108, 648.5],
      ['x', 'CMMI10', 6, 110, 113, 650],
      ['n', 'CMMI7', 4.2, 113, 115, 648.5],
      ['b', 'CMMI10', 6, 120, 123, 650],
      ['m', 'CMMI7', 4.2, 123, 126, 648.5],
    ])
    expect(setApart(text(7), G as never)).toBe(true)
    // (a row of one size on one baseline holds none)
    expect(setApart(text(1), G as never)).toBe(false)
  })
  it('keeps a superscript inside the text (cm³), never a note mark after a word (a raised ∗, a number at the end)', () => {
    const word = (mark: string, then: boolean) =>
      gl([
        ['c', 'Arial', 6, 100, 103, 650],
        ['m', 'Arial', 6, 103, 107, 650],
        [mark, 'Arial', 4.2, 107, 109, 652.5],
        ...(then
          ? ([
              ['k', 'Arial', 6, 112, 115, 650],
              ['m', 'Arial', 6, 115, 119, 650],
            ] as [string, string, number, number, number, number][])
          : []),
      ])
    expect(setApart(text(5), word('3', true) as never)).toBe(true)
    expect(setApart(text(3), word('1', false) as never)).toBe(false)
    expect(setApart(text(5), word('∗', true) as never)).toBe(false)
  })
  it("keeps 2610.20947v1 p3's μ̂: a formula's hat over its μ (two fonts, no text accent), its element's glyphs read too", () => {
    const G = gl([
      ['ˆ', 'CMR10', 6.5, 233.5, 236, 195.35],
      ['μ', 'CMMI10', 6.5, 232.5, 237.7, 195.08],
      ['a', 'Times', 6.5, 240, 243, 195.08],
      ['l', 'Times', 6.5, 243, 245, 195.08],
    ])
    // (the hat's ink over the μ's: its bottom at 199.0, the μ's top at its x-height)
    G[0]!.bottom = 199.0
    G[1]!.top = 197.9
    const t = {
      order: [
        { t: 'el' as const, i: 0 },
        { t: 'text' as const, glyphs: [2, 3] },
      ],
      els: [{ kind: 'math' as const, glyphs: [0, 1], boxes: [] }],
    }
    expect(setApart(t, G as never)).toBe(true)
  })
  it('keeps no code quote beside a letter: its ink beside the letter\'s, not over it (2608.06701v1 p1\'s "`rg`")', () => {
    // (a backtick after a g, the g's advance past the quote's middle: the quote's ink stands beside the g's, past its ink's end)
    const G = gl([
      ['r', 'Arial', 6, 100, 102.6, 650],
      ['g', 'Arial', 6, 102.6, 107.5, 650],
      ['`', 'Arial', 6, 105.8, 108, 650],
    ])
    G[1]!.ix1 = 105.7
    G[2]!.ix0 = 106.3
    G[2]!.bottom = 654.5
    G[1]!.top = 653.2
    expect(setApart(text(3), G as never)).toBe(false)
  })
  it('keeps no text accent TeX set over its letter (Física: the accent joins its letter, accents.mjs accentOver)', () => {
    // (OT1's acute set over a dotless i in one font, its advance centred on the letter's: the reading's one character)
    const G = gl([
      ['F', 'CMR10', 10, 100, 106, 600],
      ['´', 'CMR10', 10, 106.2, 110.8, 600],
      ['ı', 'CMR10', 10, 106, 111, 600],
      ['s', 'CMR10', 10, 111, 115, 600],
    ])
    G[1]!.bottom = 606.5
    expect(setApart(text(4), G as never)).toBe(false)
  })
  it("leaves a text translated where a neighbour's smaller text stands in its band: its own glyphs alone (2602.23285v2 p9)", () => {
    // ("Ours (Continuous modeling)" and a view's smaller caption under it, two units: the text's own glyphs one size, one baseline)
    const { page, fig } = pageOf([
      [
        { text: 'Ours (Continuous modeling)', font: 'DejaVuSans', size: 8 },
        { text: 'view: T', font: 'DejaVuSans', size: 5, dy: -2, x: 110 },
      ],
    ])
    const texts = figureLinesOf([page], fig, () => false, null)
    expect(fig.units.map((u) => u.script)).toEqual([undefined, undefined])
    expect(texts.every((t) => t.why !== 'script')).toBe(true)
  })
})
