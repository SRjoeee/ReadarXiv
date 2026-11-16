// A float's members and the notes (docs/PDF-READER.md §18.90; the display design's 2d after the owner's review of 2026-11-13,
// the coordinator's rulings of 2026-11-16): the page fill never spreads them (TeX builds a float's box and a note once, at its
// natural size: they stand at the script's pitch from their first line, the slack under them); and one order of the fit's knobs
// when a translation needs more height, whatever the part states of the gap under them: the tracking, the gap's free part (the
// shrink TeX's glue states there, Room.gap; none where none is stated), the leading closing to the block's own original pitch,
// the room down to the least (Room.sep), the size. A body member is laid as before, and so are the alphabets.
// Parts made by hand, a Chinese target (its pitch 1.3 of the original's, its fill on): lines at 10 pt on a pitch of 12 (p0), a
// measure of 228 pt (72-300), a character half a size wide (45 a line; 48 at the tracking's bound).
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import { floatOrder } from '../../src/unit/params.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: (_f, size) => [0.7 * size, 0.2 * size, 0],
}
const zh = rulesFor('zh')
const id = 'b'.repeat(64)
const line = (y: number): Placed['lines'][number] => [1, 0, 72, 300, y, y + 7, y - 2, 72, 300, 0, 10]
/** a member of three lines (700, 688, 676); its room `room`: by default the next ink 30 pt under its last line, its least
 *  separation 12 (18 pt of room down to it), TeX's text block bottom far under it */
const member = (o: Partial<Placed>): Placed => ({
  ord: 0,
  kind: 'caption',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [line(700), line(688), line(676)],
  room: { below: 0, next: 30, runs: [[2, 30, 200]], sep: 12 },
  ...o,
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] }, lineskip: [1, 0] },
  flows: [[m]],
})
const rowOf = (s: string): Rows => {
  const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s }] }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
/** n characters of Chinese text */
const han = (n: number) => '\u6c49'.repeat(n)
const lay = (m: Placed, n: number, rules = zh): Laid => layPage(part(m), rowOf(han(n)), rules, metrics).members[0]!
const ys = (l: Laid) => l.lines.map((x) => Math.round(x[0] * 1000) / 1000)
/** the gap TeX's \textfloatsep sets under a top float: 20 pt, 4 pt of it its shrink */
const floatGap: Placed['room']['gap'] = ['textfloatsep', 20, 4]

describe('a float’s member and a note are never spread by the page fill (§18.90, rule 4)', () => {
  it('a caption shorter than its original stands at its pitch from its first line, the slack under it', () => {
    // (two lines in a frame of three: at 1.3 of 12, 700 and 684.4; the fill spread them over the frame)
    const l = lay(member({ room: { below: 0, next: 30, runs: [[2, 30, 200]], sep: 12, gap: floatGap } }), 80)
    expect(ys(l)).toEqual([700, 684.4])
    expect(l.fit?.lead).toBe(1.3)
  })
  it('a note the same', () => {
    expect(ys(lay(member({ kind: 'footnote' }), 80))).toEqual([700, 684.4])
  })
  it('a body paragraph is spread by the fill as before', () => {
    const l = lay(member({ kind: 'para' }), 80)
    expect(l.lines).toHaveLength(2)
    expect(l.fit!.lead).toBeGreaterThan(1.3)
  })
})

describe('one order for a float’s member and a note: the free part, the leading, then the room down to the least (§18.90)', () => {
  it('needing more height: the gap’s free shrink, then the leading closes, no room to the least taken, its size kept', () => {
    // (three lines: at 1.3 the third at 668.8, under the frame's 676 and the free part's 672; at 1.15, 672.4: inside it)
    const l = lay(member({ room: { below: 0, next: 30, runs: [[2, 30, 200]], sep: 12, gap: floatGap } }), 130)
    expect(l.fit?.size).toBe(10)
    expect(l.fit?.lead).toBe(1.15)
    expect(ys(l)).toEqual([700, 686.2, 672.4])
  })
  it('a gap that states no shrink: no free part; the leading closes to the original pitch before any room is taken', () => {
    // (the same text, a gap of no shrink: at 1.0 the original's lines; the room down to the least (18) left)
    const l = lay(
      member({ room: { below: 0, next: 30, runs: [[2, 30, 200]], sep: 12, gap: ['belowcaptionskip', 7, 0] } }),
      130,
    )
    expect([l.fit?.size, l.fit?.lead, l.fit?.borrowed]).toEqual([10, 1, 0])
    expect(ys(l)).toEqual([700, 688, 676])
  })
  it('a part that states no gap under it: the same order, no free part', () => {
    const l = lay(member({}), 130)
    expect([l.fit?.size, l.fit?.lead, l.fit?.borrowed]).toEqual([10, 1, 0])
  })
  it('a note the same', () => {
    const l = lay(member({ kind: 'footnote' }), 130)
    expect([l.fit?.size, l.fit?.lead, l.fit?.borrowed]).toEqual([10, 1, 0])
  })
  it('a line more than its original at the original pitch: the room down to the least, at its size', () => {
    // (four lines need 36 under the first baseline: the frame 24, the free part 4 too little; the room down to the least, 18,
    // holds the fourth at 664)
    const l = lay(member({ room: { below: 0, next: 30, runs: [[2, 30, 200]], sep: 12, gap: floatGap } }), 170)
    expect(l.fit?.size).toBe(10)
    expect(l.fit?.lead).toBe(1)
    expect(l.fit!.borrowed).toBeGreaterThan(0)
    expect(ys(l)).toEqual([700, 688, 676, 664])
  })
  it('the free part never past the least: a gap whose shrink is more than the room down to the least gives that room', () => {
    // (the next ink 14 under the last line, the least 12: 2 pt of room; the shrink 4 stated. At 1.3 the free part holds no line;
    // the leading closes to 1.05, its third line at 674.8 under the frame's 676 by 1.2, inside the 2)
    const l = lay(member({ room: { below: 0, next: 14, runs: [[2, 14, 200]], sep: 12, gap: floatGap } }), 130)
    expect([l.fit?.size, l.fit?.lead]).toEqual([10, 1.05])
    expect(ys(l).at(-1)).toBeGreaterThanOrEqual(674 - 1e-6)
  })
  it('no least stated: the free part alone, never past TeX’s text block bottom', () => {
    // (no sep: no room down to a least; the free part 4 bounded by the bottom 3 pt under the last line: at 1.1 the third line at
    // 673.6, where 1.15 asks 3.6; with the bottom far under it, the whole 4 at 1.15)
    const l = lay(member({ room: { below: 0, next: 30, runs: [[2, 30, 3]], gap: floatGap } }), 130)
    expect(l.fit?.lead).toBe(1.1)
    expect(ys(l).at(-1)).toBeGreaterThanOrEqual(673 - 1e-6)
    const free = lay(member({ room: { below: 0, next: 30, runs: [[2, 30, 200]], gap: floatGap } }), 130)
    expect(free.fit?.lead).toBe(1.15)
  })
})

describe('the body’s order and the alphabets’ are as before (§18.90)', () => {
  it('a body paragraph takes the room before its leading closes', () => {
    const l = lay(
      member({ kind: 'para', room: { below: 0, next: 30, runs: [[2, 30, 200]], sep: 12, gap: floatGap } }),
      130,
    )
    expect(l.fit!.borrowed).toBeGreaterThan(0)
    expect(l.fit?.lead).toBeGreaterThanOrEqual(1.3)
  })
  it('a Spanish caption: the room before the size, the size before the leading, as the script orders them', () => {
    // (Latin: 45 characters of two half-size letters... a caption of 4 lines' text in 3: the room holds the fourth at the
    // original pitch, as before)
    const es = rulesFor('es')
    const text = 'x'.repeat(170)
    const m = member({ room: { below: 0, next: 30, runs: [[2, 30, 200]], sep: 12, gap: floatGap } })
    const l = layPage(part(m), rowOf(text), es, metrics).members[0]!
    expect([l.fit?.size, l.fit?.lead]).toEqual([10, 1])
    expect(l.fit!.borrowed).toBeGreaterThan(0)
  })
})

describe('the class’s order, from the script’s (U.params floatOrder)', () => {
  it('the room knob two knobs: its free part where the room was, the rest directly before the size', () => {
    expect(floatOrder(['track', 'borrow', 'lead', 'shrink'])).toEqual(['track', 'free', 'lead', 'borrow', 'shrink'])
  })
  it('an order with the room directly before the size already keeps its order (the alphabets’)', () => {
    expect(floatOrder(['track', 'borrow', 'shrink', 'lead'])).toEqual(['track', 'free', 'borrow', 'shrink', 'lead'])
  })
  it('an order with no room knob is as it is', () => {
    expect(floatOrder(['track', 'lead', 'shrink'])).toEqual(['track', 'lead', 'shrink'])
  })
})
