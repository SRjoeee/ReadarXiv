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
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

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
  paper: { faces: { fonts: [['NimbusSanL-Bold', 100]] } },
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
