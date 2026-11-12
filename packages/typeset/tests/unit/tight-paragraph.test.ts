// A paragraph tighter than its page (docs/PDF-READER.md §18.57; the owner's guidance of 2026-11-12, the coordinator's ruling
// under it): a body unit one of whose frames of two lines or more stands under its page's band floor (the target less the band)
// is laid again, in the page's fill, at its fitted state with the fit's own knobs in the fit's own order: its tracking to the
// fit's bound, the room TeX left under its blocks, then one step of the fit's sizes under the original's size, never two. It is
// kept at the first that brings every such frame into the band, no frame gaining a line and no line leaving the pages its fit set
// it on; else it stays as it was. Its vote is never changed: the page's target and its neighbours are laid as before.
import type { Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

// (a CJK character half the size wide: 45 a line of 228 pt at 10 pt, 46 at -0.01 em, 48 at -0.03, 49 at 9.75 pt and -0.03)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const zh = rulesFor('zh')
const ids = ['b', 'c', 'd'].map((c) => c.repeat(64))
const lineAt = (y: number): Placed['lines'][number] => [1, 0, 72, 300, y, y + 7, y - 2, 72, 300, 0, 10]
const ys = (y0: number, n: number) => Array.from({ length: n }, (_, i) => lineAt(y0 - 12 * i))
const row = (id: string, n: number): Row => ({
  id,
  ok: true,
  by: 'test',
  content: [{ t: 'text', s: '\u6587'.repeat(n) }],
})
/** three paragraphs down one column at a pitch of 12, `n` lines each, 5 pt of skip between them (the middle one's `room` its own
 *  where given, its gap under it that room's more), their translations `chars` characters long */
const page = (n: number[], chars: number[], room?: Placed['room'], gap = 0) => {
  let y = 700
  const flow = n.map((k, i): Placed => {
    const last = i === n.length - 1
    const m: Placed = {
      ord: i,
      kind: 'para',
      text: ids[i]!,
      lead: 12,
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      align: 'j',
      lines: ys(y, k),
      room: i === 1 && room ? room : { below: last ? 200 : 17, next: last ? 212 : 17 },
    }
    y -= 12 * k + 5 + (i === 1 ? gap : 0)
    return m
  })
  const by = new Map(chars.map((c, i) => [ids[i]!, row(ids[i]!, c)]))
  const rows: Rows = { get: (k) => by.get(k), done: true }
  const part = { format: 1, page: 1, paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } }, flows: [flow] }
  return layPage(part as never, rows, zh, metrics).members.map((m) => ({
    lead: m.fit!.lead,
    size: m.fit!.size,
    track: m.fit!.track,
    lines: m.lines.map(([y]) => y),
  }))
}

describe('a paragraph tighter than its page takes the fit’s own knobs, one size step at most (§18.57)', () => {
  it('takes the fit’s tracking to its bound where that frees a line: in the page’s band, its neighbours as before', () => {
    // (the neighbours take 2 lines of 4: 1.667, the page's target, its band floor 1.617. The middle one, 140 characters in a
    // block of 6, fits at the fit's first leading on 4 lines with no tracking, and fills to 1.5, under the floor; at -0.03 em it
    // takes 3 lines and spreads to the band)
    const [a, m, b] = page([4, 6, 4], [60, 140, 60])
    expect(m!.lines.length).toBe(3)
    expect(m!.lead).toBeGreaterThanOrEqual(1.617)
    expect(m!.size).toBe(10)
    expect(m!.track).toBeLessThan(0)
    expect([a!.lead, a!.lines.length, b!.lead, b!.lines.length]).toEqual([1.667, 2, 1.667, 2])
  })
  it('takes the room TeX left under it where tracking alone does not: its lines down into the room, the next ink kept', () => {
    // (the neighbours at 1.667, the band floor 1.617. 250 characters in a block of 8 fit at the fit's first leading on 6 lines,
    // borrowing nothing, and fill to 1.33 (6 at -0.03 em too, and at a step smaller). TeX left 28 pt under the block (its run
    // ending at its 8th line: the next ink 45 pt under it, TeX's separation 17): there it spreads to the band)
    const room = { below: 45, next: 45, runs: [[7, 45, 300]], sep: 17 } as unknown as Placed['room']
    const [a, m, b] = page([4, 8, 4], [60, 250, 60], room, 28)
    expect(m!.lines.length).toBe(6)
    expect(m!.lead).toBeGreaterThanOrEqual(1.617)
    // (every body unit of the page now short of its frame in the band, the page's one size grows as its rule has it, the evened
    // unit with it: 2610.21924v1-zh p3 and four pages more of the corpus)
    expect([m!.size, a!.size, b!.size]).toEqual([10.25, 10.25, 10.25])
    // (its last line into the room under its block's last baseline, 563, no lower than the room's bound, 535)
    expect(m!.lines.at(-1)!).toBeLessThan(563)
    expect(m!.lines.at(-1)!).toBeGreaterThanOrEqual(535 - 0.05)
    expect([a!.lead, a!.lines.length, b!.lead, b!.lines[0]]).toEqual([1.667, 2, 1.667, 518])
  })
  it('takes one size step where tracking and the room do not: a line freed, in the band, its neighbours as before', () => {
    // (291 characters: 7 lines at -0.03 em, 1.14; at 9.75 pt, one step of 0.025, 6 lines, 1.33: the page's band)
    const [a, m, b] = page([4, 8, 4], [100, 291, 100])
    expect([m!.size, m!.lines.length]).toEqual([9.75, 6])
    expect(m!.lead).toBeGreaterThanOrEqual(1.283)
    expect([a!.lead, a!.lines.length, b!.lead, b!.lines.length]).toEqual([1.33, 3, 1.38, 3])
  })
  it('stays as it was where no knob frees a line: never two size steps', () => {
    // (330 characters: 7 lines at 9.75 pt too (49 a line); two steps would free one, the bound is one)
    const [, m] = page([4, 8, 4], [100, 330, 100])
    expect([m!.size, m!.lines.length, m!.lead]).toEqual([10, 7, 1.14])
  })
  it('does not step again a paragraph its fit set a step smaller already', () => {
    // (390 characters: the fit sets them at 9.75 pt on all 8 lines; the next step, 9.5, is past the bound)
    const [, m] = page([4, 8, 4], [100, 390, 100])
    expect([m!.size, m!.lines.length, m!.lead]).toEqual([9.75, 8, 1])
  })
})

// A paragraph at a column's foot (the second rule of §18.57, the owner's look of 2026-11-12: 2602.23285v2-zh p15's two foot lines
// at TeX's pitch among paragraphs spread to 1.46): where none of the fit's knobs above brings it into the band, it may take the room
// past TeX's text block bottom, the next ink kept at TeX's separation and never deeper than a line of its own pitch, and only as
// deep as the band's floor needs.
describe('a paragraph tighter than its page at a column’s foot takes the room past TeX’s bottom it needs, a line at most (§18.57)', () => {
  /** two paragraphs of 4 lines spread to 1.667, then one of `n` lines at the column's foot: TeX's text block bottom on its last
   *  line, the next ink `ink` pt under it */
  const foot = (n: number, chars: number, ink = 200) => {
    const room = (k: number, i: number) =>
      ({ below: ink, next: ink, runs: [[k - 1, ink, 0]], sep: 12 }) as unknown as Placed['room']
    const flow: Placed[] = [4, 4, n].map((k, i) => ({
      ord: i,
      kind: 'para',
      text: ids[i]!,
      lead: 12,
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      align: 'j',
      lines: ys(700 - 53 * i, k),
      room: i === 2 ? room(k, i) : { below: 17, next: 17 },
    }))
    const by = new Map([60, 60, chars].map((c, i) => [ids[i]!, row(ids[i]!, c)]))
    const rows: Rows = { get: (k) => by.get(k), done: true }
    const part = { format: 1, page: 1, paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } }, flows: [flow] }
    return layPage(part as never, rows, zh, metrics).members.map((m) => ({
      lead: m.fit!.lead,
      size: m.fit!.size,
      lines: m.lines.map(([y]) => y),
    }))
  }
  it('spreads its two lines to the band’s floor, the second as far under the bottom as that needs, a line at most', () => {
    // (two lines of 45 characters at TeX's pitch, 1.0, among two paragraphs at 1.667: the band floor 1.617. No tracking, room or
    // size step frees a line of two full ones; past the bottom its second line stands 0.617 of a pitch under it, 7.4 pt)
    const [a, b, m] = foot(2, 90)
    expect(m!.lines.length).toBe(2)
    expect(m!.lead).toBeCloseTo(1.617, 3)
    expect(m!.size).toBe(10)
    const bottom = 594 - 12
    expect(bottom - m!.lines[1]!).toBeCloseTo(0.617 * 12, 1)
    expect(bottom - m!.lines[1]!).toBeLessThanOrEqual(12)
    expect([a!.lead, b!.lead]).toEqual([1.667, 1.667])
  })
  it('stays as it was where the next ink stands TeX’s separation under the bottom, or a line past it is not enough', () => {
    // (the next ink at the bottom's separation: no room under it)
    expect(foot(2, 90, 12)[2]!.lead).toBe(1)
    // (three full lines at the foot: the floor needs 14.8 pt past the bottom, more than a line of 12)
    expect(foot(3, 135)[2]!.lead).toBe(1)
  })
})
