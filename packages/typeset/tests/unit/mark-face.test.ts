// A translated character outside every group is drawn in the base it stands for: a letter in the unit's letters' base
// (Placed.style), a mark (punctuation, a separator, a symbol: @readarxiv/text isLetterOrDigit) in its marks' base
// (Placed.markFace), the two the engine reads off TeX's glyphs (docs/PDF-READER.md §18.114). An author line
// `\textbf{…}, \textbf{…}` whose reply drops the names' groups (2602.23285v2-ja p1, its stored reply: the names one plain run
// each, `、` between them) was drawn wholly in one base: its commas' (regular) or its letters' (bold). Laid through layPage over
// hand-made parts, the group style test's metric. Words of our own.
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
const id = 'e'.repeat(64)
type Content = Extract<Row, { ok: true }>['content']
/** an author line on one line at 9.96 pt from x 60 to 536, its letters' base bold, its names' groups `1` and `7` \textbf */
const unit = (markFace: Placed['markFace']): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 9.9626, bold: 1, design: 'NimbusRomNo9L-Medi' },
  ...(markFace ? { markFace } : {}),
  align: 'l',
  lines: [[1, 0, 60, 300, 700, 707, 698, 60, 536, 0, 9.96]],
  room: { below: 23, next: 34 },
  spans: [
    ['1', { cmd: 'textbf' }],
    ['7', { cmd: 'textbf' }],
  ],
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Medi', 100]] }, bases: 1 },
  flows: [[m]],
})
/** each drawn character of the member with its face's weight */
const drawn = (m: Placed, content: Content, to = 'ja') => {
  const r: Row = { id, ok: true, by: 'test', content }
  const rows: Rows = { get: (k) => (k === id ? r : undefined), done: true }
  const laid = layPage(part(m), rows, rulesFor(to), metrics).members[0]!
  expect(laid.state).toBe('laid')
  return laid.lines.flatMap(([, , , items]) =>
    items.flatMap((it) =>
      'src' in it ? [] : [...it.s].map((ch) => ({ ch, weight: Number(/(\d{3}) [\d.]+px/.exec(it.face)?.[1]) })),
    ),
  )
}
const weights = (cs: ReturnType<typeof drawn>, s: string) => cs.filter((c) => s.includes(c.ch)).map((c) => c.weight)

describe('a translated character outside every group is drawn in the base it stands for, a letter’s or a mark’s', () => {
  it('a reply of plain runs (the names’ groups dropped): the names bold, the separators regular', () => {
    const plain: Content = [{ t: 'text', s: '松原靖子、孫智明' }]
    const cs = drawn(unit({}), plain)
    expect(weights(cs, '松原靖子孫智明')).toEqual([700, 700, 700, 700, 700, 700, 700])
    expect(weights(cs, '、')).toEqual([400])
    // (a Latin reply likewise: the comma glued to the name before it, regular)
    const latin = drawn(unit({}), [{ t: 'text', s: 'Yasuko Matsubara, Jimeng Sun' }], 'de')
    expect(weights(latin, ',')).toEqual([400])
    expect(weights(latin, 'YasukoMtbrJimengSu').every((w) => w === 700)).toBe(true)
  })
  it('a reply that keeps the groups: the names bold by their \\textbf, the separator between them regular', () => {
    const kept: Content = [
      { t: 'span', id: '1', content: [{ t: 'text', s: '松原靖子' }] },
      { t: 'text', s: '、' },
      { t: 'span', id: '7', content: [{ t: 'text', s: '孫智明' }] },
    ]
    const cs = drawn(unit({}), kept)
    expect(weights(cs, '松原靖子孫智明').every((w) => w === 700)).toBe(true)
    expect(weights(cs, '、')).toEqual([400])
  })
  it('a mark inside a group is drawn in what the group sets over the marks’ base: a parenthesis in \\textbf outside its \\textit', () => {
    // (2609.19644v1 p5's cell `\\textbf{\\textit{Refining Ideas (§3.3})`: its letters bold italic, its closing parenthesis
    // XCharter-Bold, upright: the marks' base bold upright, `\\textbf` setting the weight alone)
    const cell: Placed = {
      ...unit({ bold: 1 }),
      style: { role: 'serif', size: 9.9626, bold: 1, slant: 1, design: 'XCharter-BoldItalic' },
      spans: [
        ['1', { cmd: 'textbf' }],
        ['7', { cmd: 'textit' }],
      ],
    }
    const content: Content = [
      {
        t: 'span',
        id: '1',
        content: [
          { t: 'span', id: '7', content: [{ t: 'text', s: 'Ideen verfeinern (' }] },
          { t: 'text', s: ')' },
        ],
      },
    ]
    const cs = drawn(cell, content, 'de')
    expect(weights(cs, ')')).toEqual([700])
    const items = layPage(
      part(cell),
      { get: () => ({ id, ok: true, by: 'test', content }), done: true },
      rulesFor('de'),
      metrics,
    )
      .members[0]!.lines.flatMap(([, , , its]) => its)
      .filter((it) => 'face' in it && (it as { s: string }).s.includes(')')) as { face: string; s: string }[]
    // (the closing parenthesis its own item, upright; the opening one inside \textit italic)
    expect(items.map((it) => [it.s.trim(), /^italic /.test(it.face)])).toEqual([[')', false]])
  })
  it('the colon after a bold word stays regular; with no marks’ base stated, a mark is drawn as a letter is', () => {
    const colon: Content = [
      { t: 'span', id: '1', content: [{ t: 'text', s: '当' }] },
      { t: 'text', s: '：' },
    ]
    expect(weights(drawn(unit({}), colon), '：')).toEqual([400])
    expect(weights(drawn(unit(undefined), colon), '：')).toEqual([700])
  })
  it('a word’s hyphen or slash keeps its break point where the marks are drawn apart: a line ends `alpha-`, the next opens `beta`', () => {
    // (the marks set apart from the letters before the hyphen's break was found: `alpha`, `-` and `beta` glued, the break taken
    // before the hyphen, a line opening `-beta`. A narrow measure of 34 pt: `alpha-` fits, `alpha-beta` does not)
    const narrow = (markFace: Placed['markFace']): Placed => ({
      ...unit(markFace),
      style: { role: 'serif', size: 9.9626, design: 'NimbusRomNo9L-Regu' },
      spans: [],
      lines: [0, 1, 2, 3].map(
        (k) => [1, 0, 60, 94, 700 - 12 * k, 707 - 12 * k, 698 - 12 * k, 60, 94, 0, 9.96] as Placed['lines'][number],
      ),
    })
    const linesOf = (markFace: Placed['markFace'], s: string) => {
      const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s }] }
      const laid = layPage(
        part(narrow(markFace)),
        { get: (k) => (k === id ? r : undefined), done: true },
        rulesFor('de'),
        metrics,
      ).members[0]!
      expect(laid.state).toBe('laid')
      return laid.lines.map(([, , , items]) =>
        items
          .map((it) => ('s' in it ? (it as { s: string }).s : ''))
          .join('')
          .trim(),
      )
    }
    const before = linesOf(undefined, 'alpha-beta gamma')
    expect(before[0]).toBe('alpha-')
    expect(linesOf({ bold: 1 }, 'alpha-beta gamma')).toEqual(before)
    // (a slash likewise: `input/output` breaks after its slash)
    expect(linesOf({ bold: 1 }, 'input/output')).toEqual(linesOf(undefined, 'input/output'))
  })
})

describe('a mark set apart from its word in the marks’ base: the review of round 2 into main (#676)', () => {
  it('never opens a line with a mark set apart from its word in the marks’ base: the word’s last character goes with it', () => {
    // (a word alone as wide as the line, its comma glued after it in the marks' base: the emergency break laid the word and
    // opened the next line with the comma, which a token holding both, cut by characters, never does; the review of #676)
    const narrow = (w: number): Placed => ({
      ...unit({}),
      lines: [0, 1, 2].map(
        (q) =>
          [1, 0, 60, 60 + w, 700 - 12 * q, 707 - 12 * q, 698 - 12 * q, 60, 60 + w, 0, 9.96] as Placed['lines'][number],
      ),
      room: { below: 0, next: 12 },
    })
    for (const [w, s] of [
      [50, 'ABCDEFGHIJ, klm nop'],
      [52, 'A1B2C3D4E5, klm'],
      [46, 'ABCDEFGHIJ; KLMNOPQRST.'],
    ] as const) {
      const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s }] }
      const rows: Rows = { get: (k) => (k === id ? r : undefined), done: true }
      const laid = layPage(part(narrow(w)), rows, rulesFor('de'), metrics).members[0]!
      const opens = laid.lines.map(
        ([, , , items]) =>
          items
            .map((it) => ('src' in it ? '' : it.s))
            .join('')
            .trimStart()[0],
      )
      expect(
        opens.filter((c) => c !== undefined && /[,;.]/.test(c)),
        `${w} ${s}`,
      ).toEqual([])
    }
  })
})
