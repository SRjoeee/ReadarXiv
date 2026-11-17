// A table cell of an m or a b column stands where TeX stands it in its row (Placed.stand, docs/PDF-READER.md §18.92): array.sty
// lowers an m cell's box by half its height past the strut's (\ar@align@mcell), so that the middle of its first and last
// baselines stands on the row's baseline, a one-line cell on it too; a b cell is a \vbox, its last line on it. The lay fills a
// cell's lines from its first baseline (B.slots), then stands the block of them as TeX would: an m cell's block with the middle of
// its first and last baselines on the middle of the original's first and last, a b cell's last line on the original's last; one
// rule, whatever the count of its lines and whatever pitch they were given, so that the same count at the same pitch is no move.
// A member whose lines stand in two cells (two blocks), and a cell of no such class, are laid as before.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { toStand } from '../../src/fit/stand.ts'
import type { FitBlock, LaidLine } from '../../src/fit/types.ts'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

// ---------------------------------------------------------------- the rule, on laid lines
/** a block of the original's baselines `B` (one block of a cell's lines) */
const blockOf = (B: number[]): FitBlock => ({ B, page: 1 }) as unknown as FitBlock
/** laid lines at `ys`, each in block `block` */
const laid = (ys: number[], block = 0): LaidLine[] =>
  ys.map((baseline) => ({ block, page: 1, x0: 100, x1: 160, baseline, target: null, items: [], from: 0 }))
const ys = (ls: LaidLine[]) => ls.map((l) => l.baseline)

describe('toStand: a cell’s laid lines stood as TeX stands its class in its row', () => {
  it('m: the middle of the laid first and last baselines on the original’s middle, at fewer, equal and more lines', () => {
    const B = [blockOf([700, 688])]
    const fewer = laid([700])
    toStand(fewer, B, 'm')
    expect(ys(fewer)).toEqual([694])
    // (the same count at the same pitch: no move at all, the lines on the original's own)
    const same = laid([700, 688])
    toStand(same, B, 'm')
    expect(ys(same)).toEqual([700, 688])
    // (the same count at another pitch, the page fill's or TeX's \lineskip rule's: the block's middle on the original's)
    const looser = laid([700, 685])
    toStand(looser, B, 'm')
    expect(ys(looser)).toEqual([701.5, 686.5])
    const more = laid([700, 690, 680, 670])
    toStand(more, B, 'm')
    expect(ys(more)).toEqual([709, 699, 689, 679])
  })
  it('b: the last laid line on the original’s last baseline, at fewer, equal and more lines', () => {
    const B = [blockOf([700, 688, 676])]
    const fewer = laid([700, 688])
    toStand(fewer, B, 'b')
    expect(ys(fewer)).toEqual([688, 676])
    const same = laid([700, 688, 676])
    toStand(same, B, 'b')
    expect(ys(same)).toEqual([700, 688, 676])
    const more = laid([700, 690, 680, 670])
    toStand(more, B, 'b')
    expect(ys(more)).toEqual([706, 696, 686, 676])
  })
  it('states the original’s line a moved line stands on (its target), none where it stands on none', () => {
    const B = [blockOf([700, 688, 676])]
    const two = laid([700, 688])
    toStand(two, B, 'm')
    expect(two.map((l) => [l.baseline, l.target])).toEqual([
      [694, null],
      [682, null],
    ])
    const one = laid([700])
    toStand(one, B, 'm')
    expect(one.map((l) => [l.baseline, l.target])).toEqual([[688, 1]])
  })
  it('leaves a member whose lines stand in two blocks (its unit run on into another cell), and a line of another block', () => {
    const two = laid([700])
    toStand(two, [blockOf([700, 688]), blockOf([676])], 'm')
    expect(ys(two)).toEqual([700])
    const other = laid([700], 1)
    toStand(other, [blockOf([700, 688])], 'm')
    expect(ys(other)).toEqual([700])
  })
})

// ---------------------------------------------------------------- the lay of a page
/** every character half its size wide: a text of n characters is 5n pt at the size 10 */
const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const idOf = (n: number) => n.toString(16).padStart(64, '0')
/** a centred cell of a paragraph column at size 10, its lines at `bases` 12 apart from 700, each 60 pt wide (100 to 160) in its
 *  side 95 to 165, or `xs` each line's own extent; its column's class `stand` where the part states one */
const cell = (ord: number, bases: number[], o: { stand?: 'm' | 'b'; xs?: [number, number][] } = {}): Placed =>
  ({
    ord,
    kind: 'cell',
    text: idOf(ord + 1),
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'c',
    ...(o.stand ? { stand: o.stand } : {}),
    lines: bases.map((y, k) => [1, 0, o.xs?.[k]?.[0] ?? 100, o.xs?.[k]?.[1] ?? 160, y, y + 7, y - 2, 72, 500, 0, 10]),
    room: { below: 0, next: 300, side: [95, 165] },
    cell: [ord, 0, 1, 0],
  }) as Placed
const rowsOf = (by: Record<number, string>): Rows => {
  const m = new Map<string, Row>()
  for (const [o, s] of Object.entries(by))
    m.set(idOf(Number(o) + 1), { id: idOf(Number(o) + 1), ok: true, by: 'test', content: [{ t: 'text', s }] } as Row)
  return { get: (k) => m.get(k), done: true }
}
const part = (ms: Placed[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: ms.map((m) => [m]),
})
const layOf = (m: Placed, row: string) =>
  layPage(part([m]), rowsOf({ [m.ord]: row }), rulesFor('de'), metrics()).members[0]!
const plain = (m: Placed): Placed => {
  const { stand: _, ...rest } = m
  return rest as Placed
}
/** a translation of one line (10 characters, 50 pt), of two (19 characters a line) */
const ONE = 'x'.repeat(10)
const TWO = `${'x'.repeat(9)} ${'y'.repeat(9)}`

describe('a cell of an m or a b column laid in its row (§18.92)', () => {
  it('m: a translation set in fewer lines stands with its middle on the original’s, where it stood on its first line', () => {
    const m = cell(0, [700, 688], { stand: 'm' })
    const was = layOf(plain(m), ONE)
    expect(was.state).toBe('laid')
    expect(was.lines.map((l) => l[0])).toEqual([700])
    expect(layOf(m, ONE).lines.map((l) => l[0])).toEqual([694])
    // (three lines laid in two at the original's pitch: their middle on the original's middle line)
    expect(layOf(cell(1, [700, 688, 676], { stand: 'm' }), TWO).lines.map((l) => l[0])).toEqual([694, 682])
  })
  it('m: the same count at the same pitch drawn exactly as before', () => {
    const m = cell(2, [700, 688], { stand: 'm' })
    const same = layOf(m, TWO)
    expect(same.lines.map((l) => l[0])).toEqual([700, 688])
    expect(same).toEqual(layOf(plain(m), TWO))
  })
  it('b: a translation set in fewer lines stands on the original’s last line', () => {
    expect(layOf(cell(3, [700, 688], { stand: 'b' }), ONE).lines.map((l) => l[0])).toEqual([688])
    expect(layOf(cell(4, [700, 688, 676], { stand: 'b' }), TWO).lines.map((l) => l[0])).toEqual([688, 676])
  })
  it('a cell of no class stated (p, or no template of LaTeX’s) stands on its first line as before', () => {
    expect(layOf(cell(5, [700, 688]), ONE).lines.map((l) => l[0])).toEqual([700])
  })
  it('a CJK cell between two rules: the line stood off the original’s stays in its band, the same count settled as before', () => {
    // (rules 2 under its last line's bottom and 1 over its first line's top, Room.band: its first line, at its CJK em box, cleared
    // down from the rule over it where it stands on its own baseline, S.settle; a line the stand moved onto none stays where the
    // rule stands it, inside the band)
    const zh = (ord: number, stand?: 'm') =>
      ({
        ...cell(ord, [700, 688], stand ? { stand } : {}),
        room: { below: 0, next: 300, side: [95, 165], band: [684, 708] },
      }) as Placed
    const lay = (m: Placed, row: string) =>
      layPage(part([m]), rowsOf({ [m.ord]: row }), rulesFor('zh'), metrics()).members[0]!
    const one = lay(zh(7, 'm'), '中文'.repeat(3))
    expect(one.lines.map((l) => l[0])).toEqual([694])
    const f = one.fit!.size
    expect(694 + 0.88 * f).toBeLessThanOrEqual(708 - 0.5)
    expect(694 - 0.12 * f).toBeGreaterThanOrEqual(684 + 0.5)
    const two = '中文'.repeat(10)
    const plainTwo = lay(zh(8), two)
    expect(plainTwo.lines.length).toBe(2)
    expect(plainTwo.lines[0]![0]).toBeLessThan(700)
    expect(lay(zh(8, 'm'), two)).toEqual(plainTwo)
  })
  it('a member whose lines stand in two cells (two blocks: its unit run on past the row’s end into the next) is laid as before', () => {
    // (its last line in the next row's first cell, to the left of its own column: a block of its own)
    const m = cell(6, [700, 688, 676], {
      stand: 'm',
      xs: [
        [100, 160],
        [100, 160],
        [20, 60],
      ],
    })
    const was = layOf(plain(m), ONE)
    expect(was.lines.map((l) => l[0])).toEqual([700])
    expect(layOf(m, ONE)).toEqual(was)
  })
})
