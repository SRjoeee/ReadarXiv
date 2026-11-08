// Laid.lit by sentence (docs/PDF-READER.md §17.1, §17.2): a member whose row carries its sentences (Row.sentences, the row's
// starts in the unit's source projection and in its translation's) and whose part places its words on A (Placed.words) lights
// each sentence and its translation on both panes, one entry a sentence; a start not found, or no sentences, and it lights
// whole, one entry a pane. Over hand-made parts, as entry-lit-links.test.ts.
import type { OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

type Box = [number, number, number, number]
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const rules = rulesFor('de')
const id = 'b'.repeat(64)
// (the source "One two three. Four five six. Seven eight nine." over three lines of A; each word at its first glyph on A)
const SOURCE_WORDS: [number, number, number][] = [
  [0, 0, 72],
  [4, 0, 96],
  [8, 0, 120],
  [15, 0, 200],
  [20, 1, 72],
  [25, 1, 100],
  [30, 1, 150],
  [36, 2, 72],
  [42, 2, 110],
]
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
    [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
    [1, 0, 72, 200, 676, 683, 674, 72, 300, 0, 10],
  ],
  room: { below: 20, next: 24 },
  words: SOURCE_WORDS,
  ...o,
})
const part = (m: Placed, page = 1): Part => ({
  format: 1,
  page,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowsOf = (list: Row[]): Rows => {
  const by = new Map(list.map((r) => [r.id, r]))
  return { get: (k) => by.get(k), done: true }
}
const TR = 'Eins zwei drei. Vier fünf sechs. Sieben acht neun.'
const row = (sentences?: { src: number[]; tr: number[] }): Row => ({
  id,
  ok: true,
  by: 'test',
  content: [{ t: 'text', s: TR }] as OutPiece[],
  ...(sentences ? { sentences } : {}),
})
const SENTENCES = { src: [15, 30], tr: [TR.indexOf('Vier'), TR.indexOf('Sieben')] }
const laidOf = (m: Placed, r: Row, page = 1): Laid => {
  const p = layPage(part(m, page), rowsOf([r]), rules, metrics)
  const laid = p.members.find((x) => x.ord === m.ord)!
  expect(laid.state).toBe('laid')
  return laid
}
const extent = (bs: readonly Box[]) =>
  bs.length ? [Math.min(...bs.map((b) => b[0])), Math.max(...bs.map((b) => b[2]))] : null

describe('Laid.lit by sentence', () => {
  it('pairs a unit of three sentences sentence by sentence: three entries a pane, each sentence its own boxes', () => {
    const laid = laidOf(member(), row(SENTENCES))
    // (on A, each sentence from its first word's glyph to the next one's: the lines' boxes cut there)
    expect(laid.lit.left).toEqual([
      [[72, 698, 200, 707]],
      [
        [200, 698, 300, 707],
        [72, 686, 150, 695],
      ],
      [
        [150, 686, 300, 695],
        [72, 674, 200, 683],
      ],
    ])
    // (as drawn: three sentences, each its tokens' boxes on their laid lines, one after the other in the text's order, none over
    // another's, together the member's every laid line)
    expect(laid.lit.right).toHaveLength(3)
    for (const s of laid.lit.right) expect(s.length).toBeGreaterThan(0)
    const rows = laid.lines.map(([y]) => y)
    const lineOf = (b: Box) => rows.findIndex((y) => b[1] < y && y < b[3])
    const order = laid.lit.right.flatMap((s, k) => s.map((b) => [lineOf(b), b[0], k] as const))
    const sorted = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(sorted.map((x) => x[2])).toEqual([...sorted.map((x) => x[2])].sort((a, b) => a - b))
    for (let j = 0; j < rows.length; j++) {
      const on = laid.lit.right.map((s) => s.filter((b) => lineOf(b) === j))
      const spans = on.map(extent).filter((x): x is number[] => !!x)
      for (let k = 1; k < spans.length; k++) expect(spans[k]![0]!).toBeGreaterThanOrEqual(spans[k - 1]![1]! - 1e-6)
    }
    expect(new Set(order.map((x) => x[0]))).toEqual(new Set(rows.map((_, j) => j)))
    expect(laid.lit.own).toEqual([])
  })
  it('leaves no gap between two sentences on a row: each runs to the next one’s start, the last to the row’s end', () => {
    // (as today's shapes tile a row: the space after a full stop is the sentence's before it, so that a pointer over it lights
    // that sentence; on both panes. The coordinator's full parity, round 3: 23 rows of 21 pages with 2.9–10.3 pt between)
    const laid = laidOf(member(), row(SENTENCES))
    const whole = laidOf(member(), row()).lit.right[0]!
    for (const pane of ['left', 'right'] as const) {
      const all = laid.lit[pane].flatMap((boxes, s) => boxes.map((b) => ({ b, s })))
      const rows = new Map<number, { b: Box; s: number }[]>()
      for (const x of all) {
        const y = Math.round((x.b[1] + x.b[3]) / 2)
        const key = [...rows.keys()].find((k) => Math.abs(k - y) < 3) ?? y
        rows.set(key, [...(rows.get(key) ?? []), x])
      }
      for (const [, on] of rows) {
        on.sort((p, q) => p.b[0] - q.b[0])
        for (let k = 1; k < on.length; k++) expect(on[k]!.b[0]).toBeCloseTo(on[k - 1]!.b[2], 6)
      }
      // (the row's sentences together span what the unit lit whole spans there: the line's start to its end)
      if (pane === 'right')
        for (const line of whole) {
          const on = all.filter((x) => Math.min(x.b[3], line[3]) - Math.max(x.b[1], line[1]) > 0)
          expect(Math.min(...on.map((x) => x.b[0]))).toBeCloseTo(line[0], 6)
          expect(Math.max(...on.map((x) => x.b[2]))).toBeCloseTo(line[2], 6)
        }
    }
  })
  it('begins a sentence as drawn at the token that carries its first word, a bracket set against it with it', () => {
    // (today's words.mjs: a token's sentence is the word it carries; "(Vier" carries "Vier", the second sentence's first word;
    // set ragged, a run's characters stand at its x plus half the size each: the metrics' advance)
    const tr = 'Eins zwei drei. (Vier fünf sechs.) Sieben acht neun.'
    const r: Row = {
      id,
      ok: true,
      by: 'test',
      content: [{ t: 'text', s: tr }],
      sentences: { src: [15, 30], tr: [tr.indexOf('('), tr.indexOf('Sieben')] },
    }
    const laid = laidOf(member({ align: 'l' }), r)
    const it = laid.lines
      .flatMap(([, , , its]) => its)
      .find((x) => 's' in x && typeof x.s === 'string' && x.s.includes('(Vier')) as {
      s: string
      x: number
      size: number
    }
    expect(it).toBeDefined()
    const bracket = it.x + (it.size * [...it.s.slice(0, it.s.indexOf('(Vier'))].length) / 2
    expect(laid.lit.right[1]![0]![0]).toBeCloseTo(bracket, 6)
  })
  it('ends a sentence at a forced break: the text after it a sentence of its own on both panes', () => {
    // (1810.04805v2 p8: "… as BERT_BASE:" \\ \noindent "No NSP: …", one TeX paragraph, one sentence of Microsoft's across
    // the break; the owner hovering the item saw the paragraph before it lit with it. TeX ended the line by command: the item
    // is a block of its own on the page)
    const m = member({
      lines: [
        [1, 0, 72, 200, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
        [1, 0, 72, 200, 676, 683, 674, 72, 300, 0, 10],
      ],
      els: [['1', { kind: 'space', brk: 1, ends: [0, 0], ink: [] }]],
      words: [
        [0, 0, 72],
        [6, 0, 108],
        [12, 0, 144],
        [18, 1, 72],
        [23, 1, 100],
        [27, 1, 130],
        [30, 1, 150],
        [36, 2, 72],
        [41, 2, 100],
      ],
    })
    const before = 'Einleitung hier:',
      after = 'Punkt eins ist hier. Punkt zwei.'
    const r: Row = {
      id,
      ok: true,
      by: 'test',
      content: [
        { t: 'text', s: before },
        { t: 'el', id: '1' },
        { t: 'text', s: after },
      ],
      // (the translator's one start: the second "Item", "Punkt zwei"; none at the break)
      sentences: { src: [36], tr: [before.length + 1 + after.lastIndexOf('Punkt')] },
    }
    const laid = laidOf(m, r)
    expect(laid.lit.left).toEqual([[[72, 698, 200, 707]], [[72, 686, 300, 695]], [[72, 674, 200, 683]]])
    expect(laid.lit.right).toHaveLength(3)
    for (const sb of laid.lit.right) expect(sb.length).toBeGreaterThan(0)
    // (its row with no sentences of its own: the break alone cuts it, both panes alike)
    const alone = laidOf(m, { ...r, sentences: undefined } as Row)
    expect(alone.lit.left).toEqual([
      [[72, 698, 200, 707]],
      [
        [72, 686, 300, 695],
        [72, 674, 200, 683],
      ],
    ])
    expect(alone.lit.right).toHaveLength(2)
  })
  it('cuts a CJK translation, set with no spaces, at its sentences’ first characters', () => {
    const zh = '第一句话在这里。第二句话在这里。第三句话。'
    const r: Row = {
      id,
      ok: true,
      by: 'test',
      content: [{ t: 'text', s: zh }],
      sentences: { src: [15, 30], tr: [zh.indexOf('第二'), zh.indexOf('第三')] },
    }
    const p = layPage(part(member()), rowsOf([r]), rulesFor('zh'), metrics)
    const laid = p.members[0]!
    expect(laid.state).toBe('laid')
    expect(laid.lit.right).toHaveLength(3)
    const all = laid.lit.right.flat()
    for (const s of laid.lit.right) expect(s.length).toBeGreaterThan(0)
    // (the sentences' boxes do not overlap one another on a line)
    for (let a = 0; a < all.length; a++)
      for (let b = a + 1; b < all.length; b++) {
        const [p0, q0] = [all[a]!, all[b]!]
        const meetY = Math.min(p0[3], q0[3]) - Math.max(p0[1], q0[1]) > 1
        if (meetY) expect(Math.min(p0[2], q0[2]) - Math.max(p0[0], q0[0])).toBeLessThanOrEqual(1e-6)
      }
  })
  it('finds a start at its sentence’s second or third word where its first is not on A, else lights whole', () => {
    const without = (offsets: number[]) =>
      SOURCE_WORDS.map((w) => (offsets.includes(w[0]) ? [w[0], -1, 0] : w)) as typeof SOURCE_WORDS
    // ("Four" not found: the second sentence from "five", on the second line)
    const late = laidOf(member({ words: without([15]) }), row(SENTENCES))
    expect(late.lit.left).toHaveLength(3)
    expect(late.lit.left[0]).toEqual([[72, 698, 300, 707]])
    expect(late.lit.left[1]![0]).toEqual([72, 686, 150, 695])
    // ("Four", "five" and "six" not found: past its third word, the unit lights whole on both panes)
    const lost = laidOf(member({ words: without([15, 20, 25]) }), row(SENTENCES))
    expect(lost.lit.left).toHaveLength(1)
    expect(lost.lit.right).toHaveLength(1)
  })
  it('lights whole where the row has no sentences or the part places no words', () => {
    // (which kinds light by sentence is the prepare's alone: it marks Unit.sentences, so that a translator cuts them, and
    // states Placed.words, for running text; a heading, a cell or a figure's text gets neither, engine tests/locate.test.ts)
    for (const laid of [laidOf(member(), row()), laidOf(member({ words: undefined }), row(SENTENCES))]) {
      expect(laid.lit.left).toHaveLength(1)
      expect(laid.lit.right).toHaveLength(1)
    }
  })
  it('numbers a member’s sentences the same on every page it is on: an entry for each, empty where it has none there', () => {
    // (its first line on page 1, the next two on page 2: page 2 holds none of the first sentence on A)
    const lines: Placed['lines'] = [
      [1, 0, 72, 300, 100, 107, 98, 72, 300, 0, 10],
      [2, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      [2, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
    ]
    const m = member({ lines })
    const p2 = laidOf(m, row(SENTENCES), 2)
    expect(p2.lit.left).toHaveLength(3)
    expect(p2.lit.left[0]).toEqual([])
    expect(p2.lit.left[1]).toEqual([[72, 698, 150, 707]])
    const p1 = laidOf(m, row(SENTENCES), 1)
    expect(p1.lit.left).toHaveLength(3)
    expect(p1.lit.left[0]).toEqual([[72, 98, 200, 107]])
    expect(p1.lit.left[2]).toEqual([])
  })
})
