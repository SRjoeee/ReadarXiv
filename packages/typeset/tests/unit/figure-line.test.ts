// A figure text that holds an element (F0, PDF-READER §18.26: "Project Page:" and its address, a title and its path) states no
// own text (Placed.plain) and is laid by the paragraph path: its translation on its line, its element drawn as a crop of its ink
// right after it, its element group off, no hole where the original's longer label stood (2611.03178v1 p1). A figure text a
// closed shape holds whole (the owner's reformulation of 2026-11-10: its container) is laid inside it: S.figures keeps its
// translation's ink under the shape's edge over its baseline (Room.over), its set shrunk to it, else the original's.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Metrics, Rows } from '../../src/types.ts'

// (an ideograph or a full-width mark a whole em, any other character half of one; ink 0.7 over the baseline and 0.2 under)
const CJK = /[　-〿一-鿿＀-￯]/u
const widthOf = (size: number, t: string) => [...t].reduce((a, c) => a + (CJK.test(c) ? size : size / 2), 0)
const metrics: Metrics = { ready: () => true, advance: (_f, size, t) => widthOf(size, t), ink: () => [70, 20, 0] }
const idOf = (n: number) => n.toString(16).padStart(64, '0')
const rows = (list: Row[]): Rows => {
  const m = new Map(list.map((r) => [r.id, r]))
  return { get: (k) => m.get(k), done: true }
}
const part = (ms: Placed[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['LMSans10-Bold', 100]] } },
  flows: ms.map((m) => [m]),
})

describe('a figure text with an element, laid as a paragraph of one line (F0)', () => {
  // ("Project Page: " at 10 from 100 to 172, its address 175-300 a code element; the free line from 90 to 360)
  const label: Placed = {
    ord: 0,
    kind: 'figure',
    text: idOf(1),
    lead: 12,
    style: { role: 'sans', size: 10, bold: 1, design: 'LMSans10-Bold' },
    align: 'l',
    lines: [[1, 0, 100, 300, 400, 407.5, 397.5, 100, 300, 0, 10]],
    els: [['1', { kind: 'other', literal: 1, copy: 'coworkos-ai.github.io', ink: [[1, 175, 397.5, 300, 407.5, 400]] }]],
    room: { below: 4, side: [90, 360] },
  }
  const row: Row = {
    id: idOf(1),
    ok: true,
    by: 'test',
    content: [
      { t: 'text', s: '项目页面：' },
      { t: 'el', id: '1' },
    ],
  }
  it('draws its translation and its element’s crop right after it, its text and element groups off', () => {
    const page = layPage(part([label]), rows([row]), rulesFor('zh'), metrics)
    const m = page.members.find((x) => x.ord === 0)!
    expect(m.state).toBe('laid')
    expect(m.off & 3).toBe(3)
    const items = m.lines.flatMap((l) => l[3] as Item[])
    const text = items.filter((it) => 'face' in it)
    const crop = items.find((it) => 'src' in it) as Extract<Item, { src: unknown }> | undefined
    expect(text.map((it) => it.s).join('')).toContain('项目页面')
    expect(crop?.piece).toBe('1')
    // (the crop from where the translation ends, a full-width colon's blank half at most between: no hole where the original's
    // longer label stood)
    const end = Math.max(...text.map((it) => it.x + widthOf((it as { size: number }).size, it.s)))
    expect(crop!.x).toBeGreaterThanOrEqual(end - 5 - 1e-6)
    expect(crop!.x - end).toBeLessThan(5)
    expect(crop!.x).toBeLessThan(175 - 10)
  })
})

describe('a figure text with an element, its runs in their own fills (F0, 2610.19159v1 p53)', () => {
  // ("Agent Action: Write" dark, its path in typewriter, "(Self-directed scope reduction)" red and the most of its glyphs: the
  // member's own fill the tag's, the title a group whose style states its fill; the paragraph path draws each in its own)
  const title: Placed = {
    ord: 0,
    kind: 'figure',
    text: idOf(2),
    lead: 12,
    style: { role: 'serif', size: 10, bold: 1, fill: 0xa73a3a },
    align: 'l',
    lines: [[1, 0, 100, 400, 400, 407.5, 397.5, 90, 500, 0, 10]],
    spans: [['0', { style: { role: 'serif', size: 10, bold: 1, fill: 0x243447 } }]],
    els: [['2', { kind: 'other', literal: 1, copy: 'a.py', ink: [[1, 190, 397.5, 220, 407.5, 400]] }]],
    room: { below: 4, side: [90, 500] },
  }
  const row: Row = {
    id: idOf(2),
    ok: true,
    by: 'test',
    content: [
      { t: 'span', id: '0', content: [{ t: 'text', s: '操作：写入' }] },
      { t: 'text', s: ' ' },
      { t: 'el', id: '2' },
      { t: 'text', s: '（缩减范围）' },
    ],
  }
  it('draws its group in the fill the group’s style states, the rest in its own', () => {
    const page = layPage(part([title]), rows([row]), rulesFor('zh'), metrics)
    const m = page.members.find((x) => x.ord === 0)!
    expect(m.state).toBe('laid')
    const text = m.lines
      .flatMap((l) => l[3] as Item[])
      .filter((it): it is Extract<Item, { face: unknown }> => 'face' in it)
    const fillOf = (s: string) => text.find((it) => it.s.includes(s))?.fill
    expect(fillOf('写入')).toBe(0x243447)
    expect(fillOf('缩减')).toBe(0xa73a3a)
  })
})

describe('a figure text laid inside the closed shape that holds it (the owner’s reformulation of 2026-11-10)', () => {
  // ("Module" at 10 over 100-136 on baseline 400, a box round it whose top edge stands 6 over the baseline: a CJK translation's
  // ink, 7 over at its size, must shrink to 6/7 of it)
  const boxed = (over?: number): Placed => ({
    ord: 0,
    kind: 'figure',
    text: idOf(1),
    lead: 12,
    style: { role: 'sans', size: 10 },
    align: 'c',
    plain: 'Module',
    lines: [[1, 0, 100, 136, 400, 407, 398, 100, 136, 0, 10]],
    room: { below: 0, side: [90, 146], ...(over !== undefined ? { over } : {}) },
  })
  const row: Row = { id: idOf(1), ok: true, by: 'test', content: [{ t: 'text', s: '模块' }] }
  const sizeOf = (p: Placed) => {
    const m = layPage(part([p]), rows([row]), rulesFor('zh'), metrics).members[0]!
    return m.state === 'laid' ? (m.lines[0]![3][0] as { size: number }).size : m.state
  }
  it('lays it at its size where the shape leaves room, shrunk to the shape’s edge where it does not', () => {
    expect(sizeOf(boxed())).toBe(10)
    expect(sizeOf(boxed(6))).toBeCloseTo((10 * 6) / 7, 6)
  })
  it('leaves it the original’s where the shape’s edge would shrink it past the floor', () => {
    expect(sizeOf(boxed(1))).toBe('unfit')
  })
})

describe('a figure’s paragraph and an item with its label, laid by the paragraph path (F3)', () => {
  // (three lines of prose at 10 on a pitch of 12, the block 100 to 300, justified, its last line short; its room 30 under it)
  const para: Placed = {
    ord: 0,
    kind: 'figure',
    text: idOf(3),
    lead: 12,
    read: ['style', 'lead'],
    style: { role: 'serif', size: 10 },
    align: 'j',
    lines: [
      [1, 0, 100, 300, 424, 431, 422, 100, 300, 0, 10],
      [1, 0, 100, 300, 412, 419, 410, 100, 300, 0, 10],
      [1, 0, 100, 180, 400, 407, 398, 100, 300, 0, 10],
    ],
    room: { below: 30, side: [100, 300] },
  }
  it('lays a paragraph’s translation in lines inside its block, its text group off', () => {
    const row: Row = {
      id: idOf(3),
      ok: true,
      by: 'test',
      content: [{ t: 'text', s: '这是一段图中的文字，它的翻译按段落排在原来的行里，不超出原来的块。' }],
    }
    const page = layPage(part([para]), rows([row]), rulesFor('zh'), metrics)
    const m = page.members.find((x) => x.ord === 0)!
    expect(m.state).toBe('laid')
    expect(m.off & 1).toBe(1)
    expect(m.lines.length).toBeGreaterThan(1)
    for (const l of m.lines)
      for (const it of l[3] as Item[]) {
        expect(it.x).toBeGreaterThanOrEqual(100 - 1e-6)
        if ('face' in it) expect(it.x + widthOf(it.size, it.s)).toBeLessThanOrEqual(300 + 1e-6)
      }
  })
  it('lays an item after its label, the label the original’s ink: its group never turned off', () => {
    // ("A." 100 to 109, its text from 113)
    const item: Placed = {
      ord: 0,
      kind: 'figure',
      text: idOf(4),
      lead: 12,
      style: { role: 'serif', size: 10 },
      align: 'l',
      lines: [[1, 0, 113, 230, 400, 407, 398, 100, 300, 0, 10]],
      label: { kind: 'number', ink: [1, 100, 398, 109, 407, 400], style: { role: 'serif', size: 10 }, line: 0 },
      room: { below: 10, side: [100, 300] },
    }
    const row: Row = { id: idOf(4), ok: true, by: 'test', content: [{ t: 'text', s: '中午12:30在车上' }] }
    const page = layPage(part([item]), rows([row]), rulesFor('zh'), metrics)
    const m = page.members.find((x) => x.ord === 0)!
    expect(m.state).toBe('laid')
    expect(m.off & 4).toBe(0)
    const text = m.lines.flatMap((l) => l[3] as Item[]).filter((it) => 'face' in it)
    expect(text.map((it) => it.s).join('')).toContain('中午')
    expect(Math.min(...text.map((it) => it.x))).toBeGreaterThanOrEqual(113 - 1e-6)
  })
})
