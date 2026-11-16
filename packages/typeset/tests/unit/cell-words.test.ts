// A merged table cell the lay fills is broken between words (docs/PDF-READER.md §18.75, the owner's decision of 2026-11-15:
// 「折行时不拆词」). A merged cell is a cell of several lines TeX ended every one of but its last at a forced break of its text
// (El.ends). Where the reply sets its break at its start or its end, the reading takes none, and the breaker fills the cell's
// lines itself, in its column's room or in their own: a line of it then ends only where the breaker lets it end and a word of
// the target's text ends there, by the platform's own word segmentation (Intl.Segmenter of the target's language). The size
// never gives way to whole words (the owner's answer of 2026-11-16, quoted in §18.75): at each size the fit tries, every
// state of it between words first; where none sets the cell so, the same states as before (a word cut where a line must end);
// the size steps down only where neither sets it. A reply that keeps its break, a paragraph cell (its lines TeX wrapped), body
// text, an element's edge and a platform with no segmenter: as before. The texts are this test's own.
import type { El, Part, Placed, Row } from '@readarxiv/format'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

/** every character half its size wide: n characters are 5n pt at the size 10 */
const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const idOf = (n: number) => n.toString(16).padStart(64, '0')
/** a merged cell of two lines at size 10 (baselines 700 and 688), centred in its column's room `column` (Room.column, its side
 *  reaching it), a forced break between its lines (El.ends: TeX ended its first line there) and the elements `els`; its leading
 *  read off the page (Placed.read 'lead'), as every real cell's */
const cell = (ord: number, column: [number, number], els: [string, El][] = []): Placed =>
  ({
    ord,
    kind: 'cell',
    text: idOf(ord + 1),
    lead: 12,
    read: ['style', 'lead'],
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'c',
    lines: [
      [1, 0, column[0] + 2, column[1] - 2, 700, 707, 698, 72, 500, 0, 10],
      [1, 0, column[0] + 1, column[1] - 1, 688, 695, 686, 72, 500, 0, 10],
    ],
    els: [['1', { kind: 'space', brk: 1, ends: [0, 0], ink: [] }], ...els],
    room: { below: 0, next: 300, side: [column[0] - 5, column[1] + 5], column },
  }) as Placed
/** the same member with its lines `x0..x1` each and no column room: each line laid in its own room */
const ownRooms = (m: Placed, [x0, x1]: [number, number], kind = m.kind): Placed => {
  const { column: _, ...room } = m.room as Placed['room'] & { column?: unknown }
  return {
    ...m,
    kind,
    room,
    lines: [
      [1, 0, x0, x1, 700, 707, 698, 72, 500, 0, 10],
      [1, 0, x0, x1, 688, 695, 686, 72, 500, 0, 10],
    ],
  } as Placed
}
type Content = Extract<Row, { ok: true }>['content']
/** a row: its pieces, a string a text, `{ el }` an element (the forced break '1') */
const rowsOf = (by: Record<number, (string | { el: string })[]>): Rows => {
  const m = new Map<string, Row>()
  for (const [o, ps] of Object.entries(by)) {
    const content: Content = ps.map((p) => (typeof p === 'string' ? { t: 'text', s: p } : { t: 'el', id: p.el }))
    m.set(idOf(Number(o) + 1), { id: idOf(Number(o) + 1), ok: true, by: 'test', content } as Row)
  }
  return { get: (k) => m.get(k), done: true }
}
const BRK = { el: '1' }
const part = (ms: Placed[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: ms.map((m) => [m]),
})
const layOf = (ms: Placed[], rows: Rows, lang: string) => layPage(part(ms), rows, rulesFor(lang), metrics()).members
/** each drawn line's text (a crop's its copy text) */
const textOf = (m: Laid) =>
  m.lines.map((l) =>
    l[3]
      .map((it) => (it as { s?: string }).s ?? '')
      .join('')
      .trim(),
  )
// (Intl.Segmenter('zh') on 提高训练速度: 提高 | 训练 | 速度; on 增加样本数量: 增加 | 样本 | 数量; ('ja') on 平均推論時間: 平均 |
// 推論 | 時間; ('ru') on Ошибка разбиения: Ошибка | разбиения; ('de') on Fehlerwahrscheinlichkeit: one word)
const TEXT = '提高训练速度'
/** a column room of 25 pt: five characters a line at the size 10 */
const NARROW: [number, number] = [100, 125]

describe('a merged cell the lay fills: its lines end between words of the target, by the platform’s segmentation', () => {
  it("Chinese: today's fill ends its first line inside 速度; the rule ends it between 训练 and 速度, at the same size", () => {
    const [m] = layOf([cell(0, NARROW)], rowsOf({ 0: [TEXT, BRK] }), 'zh')
    expect(m!.state).toBe('laid')
    expect(textOf(m!)).toEqual(['提高训练', '速度'])
    expect(m!.fit!.size).toBeCloseTo(10, 5)
  })
  it('Japanese: the line ends between 推論 and 時間, not inside 時間', () => {
    const [m] = layOf([cell(1, NARROW)], rowsOf({ 1: ['平均推論時間', BRK] }), 'ja')
    expect(textOf(m!)).toEqual(['平均推論', '時間'])
    expect(m!.fit!.size).toBeCloseTo(10, 5)
  })
  it('a language written with spaces: no hyphenation point inside a word, the word whole on the next line', () => {
    // (Russian, hyphenated by Khmelev's syllable rules: today "раз-" ends the first line; the rule leaves the word whole)
    const [m] = layOf([cell(2, [100, 160])], rowsOf({ 2: ['Ошибка разбиения', BRK] }), 'ru')
    expect(textOf(m!)).toEqual(['Ошибка', 'разбиения'])
    expect(m!.fit!.size).toBeCloseTo(10, 5)
  })
  it('a break at the text’s start: filled by the same rule', () => {
    const [m] = layOf([cell(3, NARROW)], rowsOf({ 3: [BRK, TEXT] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训练', '速度'])
  })
  it("a merged cell whose part states no column room, laid in its lines' own rooms: filled by the same rule", () => {
    // (each line its own 25 pt, as TeX set it: the column's box not stated)
    const [m] = layOf([ownRooms(cell(4, NARROW), NARROW)], rowsOf({ 4: [TEXT, BRK] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训练', '速度'])
    expect(m!.fit!.size).toBeCloseTo(10, 5)
  })
})

describe('the size never gives way to whole words (the owner’s answer of 2026-11-16): at each size, a break between words first, then as before', () => {
  it('a break between words fits at the first size only at a closer tracking: kept, at that size (the size’s states first)', () => {
    // (a cell of three lines whose reply sets both its breaks at its end, in 28.5 pt: at the leading 1.3 two lines of the three,
    // five characters a line with no tracking, six at its least, -0.03 em. 提高 | 训练 | 一帆风顺 | 速度 ends no word at five, so
    // the state with no tracking sets it only as before, 提高训练一 | 帆风顺速度; between words it fits at -0.03 em. Every state of
    // the size is tried between words before any is laid as before: a state at a time would lay it as before)
    const c = cell(12, [100, 128.5])
    const three = {
      ...c,
      lines: [...c.lines, [1, 0, 101, 127.5, 676, 683, 674, 72, 500, 0, 10]],
      els: [...c.els!, ['3', { kind: 'space', brk: 1, ends: [1, 0], ink: [] }]],
    } as Placed
    const [m] = layOf([three], rowsOf({ 12: ['提高训练一帆风顺速度', BRK, { el: '3' }] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训练', '一帆风顺速度'])
    expect(m!.fit!.size).toBeCloseTo(10, 5)
    expect(m!.fit!.track).toBeCloseTo(-0.03, 5)
  })
  it('a room of 16 pt, three characters a line at 10, where 提高训练 | 速度 needs four: at the size 10, laid as before', () => {
    // (before round 4a: 提高训 | 练速度 at the size 10, 训练 parted; round 4a's rule took it to 0.85 for its words whole, four
    // characters at the tracking's least, -0.03 em, 15.98 pt. A break inside a word fits at the size 10: the size stays)
    const [m] = layOf([cell(5, [100, 116])], rowsOf({ 5: [TEXT, BRK] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训', '练速度'])
    expect(m!.fit!.size).toBeCloseTo(10, 5)
  })
  it('nothing fits at the first size: the size steps, and at the next a break between words is tried first', () => {
    // (26 pt, eleven characters on two lines: five a line from the size 10 to 0.925, six at 0.9 with the tracking at its
    // least; as before 预算内恢复提 | 高训练速度, between words 预算 | 内 | 恢复 | 提高 | 训练 | 速度 ends at five)
    const [m] = layOf([cell(13, [100, 126])], rowsOf({ 13: ['预算内恢复提高训练速度', BRK] }), 'zh')
    expect(textOf(m!)).toEqual(['预算内恢复', '提高训练速度'])
    expect(m!.fit!.size).toBeCloseTo(9, 5)
  })
  it('nothing fits at the first size, and at the next only a break inside a word: laid at that size, as before', () => {
    // (the same room: 提高 | 训练 | 研究生 | 样本 | 数量 ends no word at five or six characters, so at 0.9 it is laid as before,
    // 提高训练研究 | 生样本数量; round 4a's rule went on down, past the floor, to seven characters a line)
    const [m] = layOf([cell(14, [100, 126])], rowsOf({ 14: ['提高训练研究生样本数量', BRK] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训练研究', '生样本数量'])
    expect(m!.fit!.size).toBeCloseTo(9, 5)
  })
  it('a word no size sets on a line of its room, not even below the floor: laid as before, cut, never left the original', () => {
    // (24 letters in a room of 12 at the size 10, and 20 at 0.6: no word ends inside it; today's cut by its characters)
    const [m] = layOf([cell(6, [100, 160])], rowsOf({ 6: ['Fehlerwahrscheinlichkeit', BRK] }), 'de')
    expect(m!.state).toBe('laid')
    expect(textOf(m!)).toEqual(['Fehlerwahrsc', 'heinlichkeit'])
    expect(m!.fit!.size).toBeCloseTo(10, 5)
  })
})

describe('the other side: laid as before', () => {
  it('a reply that keeps its break between its lines: the break where it states it', () => {
    const [m] = layOf([cell(7, NARROW)], rowsOf({ 7: ['提高训', BRK, '练速度'] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训', '练速度'])
  })
  it('a paragraph cell, its lines TeX wrapped (no forced break ended its first): filled as before', () => {
    const wrapped = { ...cell(8, NARROW), els: [['1', { kind: 'space', brk: 1, ink: [] }]] } as Placed
    const [m] = layOf([wrapped], rowsOf({ 8: [TEXT, BRK] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训练速', '度'])
  })
  it('a paragraph of the body whose reply sets its forced break at its end: filled as before', () => {
    const [m] = layOf([ownRooms(cell(9, NARROW), NARROW, 'para')], rowsOf({ 9: [TEXT, BRK] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训练速', '度'])
  })
  it("an element inside the text: the text after it segmented alone, the element's edge a break as before", () => {
    // (a formula's crop, its copy text x, as wide as two characters, after 增加: today 增加 x 样 | 本数量; under the rule 样本 |
    // 数量 whole, the first line ending at the crop's edge)
    const f: [string, El] = ['2', { kind: 'other', ink: [[1, 110, 698, 119.5, 707, 700]], copy: 'x' } as El]
    const [m] = layOf([cell(10, NARROW, [f])], rowsOf({ 10: ['增加', { el: '2' }, '样本数量', BRK] }), 'zh')
    expect(textOf(m!)).toEqual(['增加x', '样本数量'])
  })
})

describe('a platform with no Intl.Segmenter (runtime feature detection): filled as before', () => {
  afterEach(() => vi.unstubAllGlobals())
  it("today's fill: the first line ends inside 速度", () => {
    // (the platform's Intl with no Segmenter: its other members, Intl.Locale among them, read through it)
    vi.stubGlobal('Intl', Object.assign(Object.create(Intl), { Segmenter: undefined }))
    const [m] = layOf([cell(11, NARROW)], rowsOf({ 11: [TEXT, BRK] }), 'zh')
    expect(textOf(m!)).toEqual(['提高训练速', '度'])
  })
})
