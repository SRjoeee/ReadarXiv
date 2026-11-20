// The page's one size (docs/PDF-READER.md §18.11, "A page's body grows"): the page fill grows a page's body paragraphs to one
// larger size only where every one of them has room by itself, short of its own frame at its fit. A paragraph that was helped to
// its room, by the page's evening (§18.57: the fit's knobs, TeX's room under it among them) or by a fit that borrowed room under
// its lines, is no room of the page's: the page keeps the original's size, as production's page fill keeps it (the coordinator's
// ruling of 2026-11-20 on round c4's parity class "body grown above the original").
// And the head pass (§18.11, "A paragraph's leading is the whole paragraph's"): a paragraph under a widow line starts lower by
// what the gap lacks only within its own lines; where its first block holds one line (a double-spaced paragraph, each line its
// own block) there is no room, and it stays as TeX set it.
import type { Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

// (a CJK character half the size wide: 45 a line of 228 pt at 10 pt, 46 at -0.01 em, 48 at -0.03)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const zh = rulesFor('zh')
const st = { role: 'serif' as const, size: 10, design: 'NimbusRomNo9L-Regu' }
const ids = ['b', 'c', 'd', 'e'].map((c) => c.repeat(64))
const row = (id: string, n: number): Row => ({ id, ok: true, by: 'test', content: [{ t: 'text', s: '\u6587'.repeat(n) }] })
const at = (y: number, x0 = 72, x1 = 300): Placed['lines'][number] => [1, 0, x0, x1, y, y + 7, y - 2, x0, x1, 0, 10]
const lay = (flow: Placed[], chars: number[]) => {
  const by = new Map(chars.map((c, i) => [ids[i]!, row(ids[i]!, c)]))
  const rows: Rows = { get: (k) => by.get(k), done: true }
  const part = { format: 1, page: 1, paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } }, flows: [flow] }
  return layPage(part as never, rows, zh, metrics).members.map((m) => ({
    size: m.fit!.size,
    borrowed: m.fit!.borrowed,
    evened: m.evened,
    lines: m.lines.map(([y, x0]) => [y, x0] as const),
  }))
}
/** three paragraphs down one column at a pitch of `P` (12 by default), `n` lines each, 5 pt of skip between them; the middle
 *  one's `room` its own where given (its gap under it that room's more), their translations `chars` characters long */
const column = (n: number[], chars: number[], room?: Placed['room'], gap = 0, P = 12) => {
  let y = 700
  const flow = n.map((k, i): Placed => {
    const last = i === n.length - 1
    const m: Placed = {
      ord: i,
      kind: 'para',
      text: ids[i]!,
      lead: P,
      style: st,
      align: 'j',
      lines: Array.from({ length: k }, (_, j) => at(y - P * j)),
      room: i === 1 && room ? room : { below: last ? 200 : 17, next: last ? 212 : 17 },
    }
    y -= P * k + 5 + (i === 1 ? gap : 0)
    return m
  })
  return lay(flow, chars)
}

describe("the page's one size grows only where every body paragraph has room by itself (§18.11)", () => {
  it('grows a page whose paragraphs all fall short of their frames at their fits, as before', () => {
    // (three paragraphs of four lines, two lines of translation each: every one short of its frame by itself)
    const sizes = column([4, 4, 4], [60, 60, 60]).map((m) => m.size)
    expect(sizes[0]).toBeGreaterThan(10)
    expect(new Set(sizes).size).toBe(1)
  })
  it('keeps the original size on a page holding a paragraph the evening brought into the band by TeX’s room under it', () => {
    // (the middle paragraph, 250 characters in a block of 8, fits on 6 lines and fills to 1.33 under the band's floor 1.617; the
    // evening lays it into the 28 pt TeX left under it: helped to its room, it is no room of the page's)
    const room = { below: 45, next: 45, runs: [[7, 45, 300]], sep: 17 } as unknown as Placed['room']
    const [a, m, b] = column([4, 8, 4], [60, 250, 60], room, 28)
    expect(m!.evened?.by).toContain('room')
    expect([a!.size, m!.size, b!.size]).toEqual([10, 10, 10])
  })
  it('keeps the original size on a page holding a paragraph whose fit borrowed a line of the room under it', () => {
    // (at a pitch of 15, the fill's top 1.333: the middle paragraph, 82 characters in a block of 2, sets its two lines only on a
    // state that borrows a line of the 43 pt TeX left under it; spread there it reaches its fill's top, short of nothing, and
    // the evening does not touch it. Its neighbours, three lines of four, have room by themselves)
    const room = { below: 60, next: 60, runs: [[1, 60, 300]], sep: 17 } as unknown as Placed['room']
    const [a, m, b] = column([4, 2, 4], [120, 82, 120], room, 40, 15)
    expect([m!.borrowed, m!.evened, m!.lines.length]).toEqual([1, undefined, 2])
    expect([a!.size, m!.size, b!.size]).toEqual([10, 10, 10])
  })
})

describe('the head pass moves a first line only within its own lines (§18.11)', () => {
  /** a paragraph over a column break, its last line alone at the second column's top (TeX's widow, 700); under it a paragraph
   *  double-spaced at a pitch of 24, each line its own block, its first line indented 15 pt, `chars` characters long */
  const widow = (chars: number) => {
    const flow: Placed[] = [
      {
        ord: 0,
        kind: 'para',
        text: ids[0]!,
        lead: 12,
        style: st,
        align: 'j',
        lines: Array.from({ length: 4 }, (_, j) => at(700 - 12 * j)),
        room: { below: 17, next: 17 },
      },
      {
        ord: 1,
        kind: 'para',
        text: ids[1]!,
        lead: 12,
        style: st,
        align: 'j',
        lines: [...Array.from({ length: 4 }, (_, j) => at(647 - 12 * j)), at(700, 320, 548)],
        room: { below: 24, next: 24 },
      },
      {
        ord: 2,
        kind: 'para',
        text: ids[2]!,
        lead: 24,
        style: st,
        align: 'j',
        lines: Array.from({ length: 5 }, (_, j) => at(676 - 24 * j, j === 0 ? 335 : 320, 548)),
        room: { below: 200, next: 212 },
      },
    ]
    return lay(flow, [60, 165, chars])[2]!
  }
  it('keeps the first line of a paragraph whose first block holds one line on TeX’s baseline, at its indent', () => {
    // (the paragraph over it, spread past its pitch in its frame before, ends on a line alone at the column's top: the gap under
    // it lacks room, but the paragraph under it has no room within its first block of one line; it stays as TeX set it)
    const m = widow(120)
    expect(m.lines[0]).toEqual([676, 335])
  })
})
