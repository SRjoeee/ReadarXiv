// A figure text that holds an element (F0, PDF-READER §18.23: "Project Page:" and its address, a title and its path) states no
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
