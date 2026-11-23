// A group's translation is drawn in what TeX set the group's own text in: its weight and its size. A unit of two of TeX's
// paragraphs, a kicker (a paper's macro, `\tagline{…}`, whose definition sets its argument `{\small\bfseries #1}`) and a title
// (`{\fontsize{30}{35}\selectfont\bfseries …}`), every glyph of it bold: the part states the unit's style bold at the title's
// size (Placed.style, the median of its glyphs) and the title's group by its `\bfseries`. The typesetter took the unit's bold off
// (B.tokens baseOf: half the row's characters under a bold declaration, the rest read as not bold) and drew the kicker regular,
// and drew every group at the member's one size, a group's stated size (SpanAt.style.size) never read (lay/read.ts rowPieces
// keeps its role, weight and slant). RED until both are drawn as TeX set them. Laid through layPage over hand-made parts, the
// run-in test's metric. Words of our own.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rolesFor } from '../../src/breaker/faces.ts'
import { layPage } from '../../src/lay/entry.ts'
import { figuresOf } from '../../src/lay/figures.ts'
import type { PaperReading } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, RuleParams, Rows } from '../../src/types.ts'

const CJK = /[⺀-鿿　-〿＀-￯]/u
const em = (size: number, t: string) =>
  [...t].reduce((s, ch) => s + size * (CJK.test(ch) ? 1 : /[ .,]/u.test(ch) ? 0.25 : 0.5), 0)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => em(size, t),
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, em(size, t)],
}
const id = 'f'.repeat(64)
type Content = Extract<Row, { ok: true }>['content']
/** the kicker on its line at 9.96 pt, the title under it at 29.89, on a measure from x 60 to 536; the kicker's group `3` stated
 *  as given, the title's `9` a bare group with its declarations (elements 10 to 12, setting nothing of their own) */
const unit = (kicker: NonNullable<Placed['spans']>[number][1]): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 14,
  style: { role: 'sans', size: 29.8879, bold: 1, design: 'NimbusSanL-Bold' },
  align: 'j',
  lines: [
    [1, 0, 60, 160, 771.4, 778.8, 771.2, 60, 536, 0, 9.96],
    [1, 0, 60, 314, 711.2, 733.3, 710.5, 60, 536, 0, 29.89],
  ],
  room: { below: 23, next: 34 },
  els: [
    ['10', { kind: 'zero', cmd: 'fontsize', ink: [] }],
    ['11', { kind: 'zero', cmd: 'selectfont', bare: 1, ink: [] }],
    ['12', { kind: 'zero', cmd: 'bfseries', bare: 1, ink: [] }],
  ],
  spans: [
    ['3', kicker],
    ['9', { opens: 1 }],
  ],
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusSanL-Bold', 100]] }, bases: 1 },
  flows: [[m]],
})
const content: Content = [
  { t: 'span', id: '3', content: [{ t: 'text', s: '现场笔记' }] },
  { t: 'text', s: ' ' },
  {
    t: 'span',
    id: '9',
    content: [
      { t: 'el', id: '10' },
      { t: 'el', id: '11' },
      { t: 'el', id: '12' },
      { t: 'text', s: '一个小标题' },
    ],
  },
]
const rows = (): Rows => {
  const r: Row = { id, ok: true, by: 'test', content }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
/** each drawn character of the member with its face's weight and the size it is drawn at */
const drawn = (m: Placed) => {
  const laid = layPage(part(m), rows(), rulesFor('zh'), metrics).members[0]!
  expect(laid.state).toBe('laid')
  return laid.lines.flatMap(([, , , items]) =>
    items.flatMap((it) =>
      'src' in it
        ? []
        : [...it.s].map((ch) => ({ ch, weight: Number(/(\d{3}) [\d.]+px/.exec(it.face)?.[1]), size: it.size })),
    ),
  )
}
const of = (cs: ReturnType<typeof drawn>, s: string) => cs.filter((c) => s.includes(c.ch))

describe('a group’s translation is drawn in the weight and at the size TeX set its own text in', () => {
  it('the kicker of a unit whose every glyph is bold is drawn bold, as the title is', () => {
    const cs = drawn(unit({ cmd: 'tagline' }))
    expect(of(cs, '一个小标题').every((c) => c.weight === 700)).toBe(true)
    expect(of(cs, '现场笔记').map((c) => c.weight)).toEqual([700, 700, 700, 700])
  })
  it('a group whose stated style holds its size is drawn at that size against the member’s', () => {
    const cs = drawn(unit({ cmd: 'tagline', style: { role: 'sans', size: 9.9626, bold: 1 } }))
    const title = of(cs, '一个小标题')[0]!.size
    const kicker = of(cs, '现场笔记')[0]!.size
    expect(Math.round((kicker / title) * 1000) / 1000).toBe(Math.round((9.9626 / 29.8879) * 1000) / 1000)
  })
  it('a group at its own size steps its characters and its tracking at that size, not the member’s', () => {
    // (the fit's tracking is in ems of the size a character is drawn at: the kicker's at its own, as the breaker measures it and
    // the drawing spaces it)
    const laid = layPage(
      part(unit({ cmd: 'tagline', style: { role: 'sans', size: 9.9626, bold: 1 } })),
      rows(),
      rulesFor('zh'),
      metrics,
    ).members[0]!
    const run = laid.lines.flatMap(([, , , items]) => items).find((it) => 'face' in it && it.s.startsWith('现'))! as {
      size: number
      dx?: number[]
    }
    const step = run.dx![1]! - run.dx![0]!
    expect(Math.round(step * 100) / 100).toBe(Math.round(run.size * (1 + laid.fit!.track) * 100) / 100)
  })
})

// A group's size is the size of everything measured inside it: its advance, its ems of explicit glue, its marks' blank halves
// and their hang, as TeX sets them at the group's size (reviews of #675: a smaller group's bracket at a line's start trimmed
// by half the member's em, its ink past the line's start; `\quad` inside it measured in the member's ems; a figure label's
// run of another size drawn at the label's). Words of our own.
/** a member on one line from x 60 to 536 at 10 pt, its group `3` stated at `size`, its elements `els` */
const sized = (size: number, els: NonNullable<Placed['els']> = [], align: Placed['align'] = 'l'): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align,
  lines: [[1, 0, 60, 536, 700, 707, 698, 60, 536, 0, 10]],
  room: { below: 23, next: 34 },
  els,
  spans: [['3', { cmd: 'small', style: { role: 'serif', size } }]],
})
/** the drawn items of the member's first line: their text, place and size */
const itemsOf = (m: Placed, c: Content, to: string) => {
  const r: Row = { id, ok: true, by: 'test', content: c }
  const laid = layPage(part(m), { get: (k) => (k === id ? r : undefined), done: true }, rulesFor(to), metrics)
    .members[0]!
  expect(laid.state).toBe('laid')
  const [, x0, , items] = laid.lines[0]!
  return {
    x0,
    items: items.flatMap((it) =>
      'src' in it ? [] : [{ s: (it as { s: string }).s, x: (it as { x: number }).x, size: it.size as number }],
    ),
  }
}

describe('a group’s size is the size of everything measured inside it', () => {
  it('a smaller group’s opening bracket at a line’s start loses its own blank half, not the member’s: its ink in the line', () => {
    // (a 5 pt group in 10 pt text: its bracket's blank half 2.5 pt; trimmed by 5, its ink stood 2.5 pt before the line's start)
    const { x0, items } = itemsOf(
      sized(5),
      [
        { t: 'span', id: '3', content: [{ t: 'text', s: '（文字）' }] },
        { t: 'text', s: '正文的字。' },
      ],
      'zh',
    )
    const open = items.find((it) => it.s.startsWith('（'))!
    expect(open.size).toBeCloseTo(items.find((it) => it.s.startsWith('正'))!.size / 2, 6)
    expect(open.x).toBeCloseTo(x0 - 0.5 * open.size, 6)
  })
  it('an em of explicit glue inside a group is an em of the group’s size; a length in points the same at every size', () => {
    const quad: NonNullable<Placed['els']>[number][1] = { kind: 'zero', cmd: 'hspace', glue: [1, 'em', 1], ink: [] }
    const pt: NonNullable<Placed['els']>[number][1] = { kind: 'zero', cmd: 'hspace', glue: [6, 'bp', 1], ink: [] }
    const gap = (size: number, el: NonNullable<Placed['els']>[number][1]) => {
      const { items } = itemsOf(
        sized(size, [['5', el]]),
        [
          {
            t: 'span',
            id: '3',
            content: [
              { t: 'text', s: 'A' },
              { t: 'el', id: '5' },
              { t: 'text', s: 'B' },
            ],
          },
        ],
        'de',
      )
      const a = items.find((it) => it.s.trim() === 'A')!
      const b = items.find((it) => it.s.trim() === 'B')!
      return { em: (b.x - a.x - em(a.size, 'A')) / a.size, pt: b.x - a.x - em(a.size, 'A') }
    }
    // (a 20 pt group in 10 pt text: its \hspace{1em} 20 pt, an em of its own)
    expect(gap(20, quad).em).toBeCloseTo(1, 6)
    expect(gap(5, quad).em).toBeCloseTo(1, 6)
    expect(gap(20, pt).pt).toBeCloseTo(gap(10, pt).pt, 6)
  })
  it('a figure label’s run of another size is measured and drawn at its own size, on the label’s baseline', () => {
    // (a plot's label at 12 pt, its bold suffix `{\scriptsize\bfseries (b)}` at 7: drawn at the label's size, it took the room
    // of a 12 pt run)
    const label: Placed = {
      ord: 7,
      kind: 'figure',
      text: 'u7',
      plain: 'Gain (b)',
      lines: [[1, 0, 100, 160, 200, 208, 198, 100, 160]],
      style: { role: 'serif', size: 12, design: 'NimbusRomNo9L-Regu' },
      spans: [['s1', { style: { role: 'serif', size: 7, bold: 1 } }]],
      room: { side: [60, 400] },
      align: 'l',
    } as unknown as Placed
    const row = {
      ok: true,
      content: [
        { t: 'text', s: 'Gewinn ' },
        { t: 'span', id: 's1', content: [{ t: 'text', s: '(fett)' }] },
      ],
    } as unknown as Row
    const R = { cjkQuotes: false, floorMin: 0.6, centredPunct: false, compressMax: 2 } as RuleParams
    const runs = (bases: boolean) => {
      const paper = {
        designs: { serif: 'times', sans: 'helvetica', mono: 'courier' },
        roles: rolesFor('de', 'times', null),
        bases,
      } as unknown as PaperReading
      const got = figuresOf({ page: 1, ties: [] } as unknown as Part, [label], { get: () => row } as unknown as Rows, {
        paper,
        R,
        metrics,
      })
      const items = (got.laid.get(7)?.[0]?.[3] ?? []) as { s: string; x: number; size: number }[]
      return { main: items.find((it) => it.s.startsWith('Gewinn'))!, bold: items.find((it) => it.s.includes('fett'))! }
    }
    const { main, bold } = runs(true)
    expect(bold.size / main.size).toBeCloseTo(7 / 12, 6)
    // (the bold run after the label's, by the label's advance at its size)
    expect(bold.x - main.x).toBeCloseTo(em(main.size, main.s), 6)
    // (a part made before, its runs' sizes a median of several where they stood at several: drawn at the label's, as before)
    const old = runs(false)
    expect(old.bold.size).toBe(old.main.size)
  })
  it('a part made before states no base: its style the face of its glyphs whole, the groups read out of it as before', () => {
    // (a unit wholly inside \emph: a part made before states its style italic, its glyphs'; the typesetter's count takes the
    // \emph out, and its translation is drawn italic. A part of today states the base upright, which the \emph turns)
    const emph = (style: Placed['style'], bases: boolean) => {
      const m: Placed = {
        ...sized(10),
        style,
        spans: [['3', { cmd: 'emph' }]],
      }
      const r: Row = {
        id,
        ok: true,
        by: 'test',
        content: [{ t: 'span', id: '3', content: [{ t: 'text', s: 'Ein Satz' }] }],
      }
      const pt = part(m)
      const laid = layPage(
        bases ? pt : { ...pt, paper: { faces: pt.paper.faces } },
        { get: (k) => (k === id ? r : undefined), done: true },
        rulesFor('de'),
        metrics,
      ).members[0]!
      expect(laid.state).toBe('laid')
      return laid.lines.flatMap(([, , , items]) =>
        items.flatMap((it) => ('src' in it ? [] : [/^italic /.test((it as { face: string }).face)])),
      )
    }
    const italic = { role: 'serif' as const, size: 10, slant: 1 as const, design: 'NimbusRomNo9L-ReguItal' }
    const upright = { role: 'serif' as const, size: 10, design: 'NimbusRomNo9L-ReguItal' }
    expect(emph(italic, false).every(Boolean)).toBe(true)
    expect(emph(upright, true).every(Boolean)).toBe(true)
  })
  it('a part made before: its stated sizes drawn as before, at the member’s (a size there the most of several glyphs’)', () => {
    // (before PIPELINE 119 a group's stated face carried its glyphs' most common size, of several too, and an element's style its
    // glyphs' most common: the typesetter read none of them. Read now, 2609.19644v1's ink small capitals "PREDOPT" (P and O at
    // 2.51, the rest at 2.01) were drawn with P and O at 2.01, smaller than printed)
    const sizesOf = (bases: boolean) => {
      const m = sized(5)
      const r: Row = {
        id,
        ok: true,
        by: 'test',
        content: [
          { t: 'span', id: '3', content: [{ t: 'text', s: 'klein' }] },
          { t: 'text', s: ' und gross' },
        ],
      }
      const pt = part(m)
      const laid = layPage(
        bases ? pt : { ...pt, paper: { faces: pt.paper.faces } },
        { get: (k) => (k === id ? r : undefined), done: true },
        rulesFor('de'),
        metrics,
      ).members[0]!
      expect(laid.state).toBe('laid')
      return laid.lines.flatMap(([, , , items]) => items.flatMap((it) => ('src' in it ? [] : [it.size as number])))
    }
    expect(new Set(sizesOf(false)).size).toBe(1)
    expect(new Set(sizesOf(true)).size).toBe(2)
  })
})
