// The borrow past TeX's text block bottom (docs/PDF-READER.md §18.37, the owner's ruling of 2026-11-12): before each of the
// fit's shrink steps, a unit whose last line would stand under its block's bottom may be laid with that line up to PAST_FOOT
// (1.5 pt) under it, keeping only the depth its lines need; the page fill lays it no deeper. A unit it does not buy goes down
// the fit's steps as where no room is past the bottom (its twin `bounded`: the next ink TeX's separation under the bottom, the
// same room down to it), and a unit it keeps no larger has no line under the bottom. The rule as it is laid by default; the
// reader's switch that turns it off is the reader's one test (packages/reader/tests/typeset-engine.test.ts).
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { PAST_FOOT } from '../../src/fit/walk.ts'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const id = 'a'.repeat(64)
const idB = 'b'.repeat(64)
/** a paragraph of two lines at 10 pt and a pitch of 12, TeX's text block bottom `foot` pt under its last line (677 at 11), the
 *  next ink `ink` pt under it (200: none near) */
const member = (o: Partial<Placed> = {}, foot = 11, ink = 200): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
    [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
  ],
  room: { below: 0, next: 300, runs: [[1, ink, foot]], sep: 12 },
  ...o,
})
/** its twin with no room past the bottom: the next ink TeX's separation under it */
const bounded = (o: Partial<Placed> = {}, foot = 11) => member(o, foot, foot + 12)
const part = (flows: Placed[][]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows,
})
const rowsOf = (list: Row[]): Rows => {
  const by = new Map(list.map((r) => [r.id, r]))
  return { get: (k) => by.get(k), done: false }
}
const row = (s: string, of = id): Row => ({ id: of, ok: true, by: 'test', content: [{ t: 'text', s }] })
// (a translation three characters too long for two lines at 10 pt: where no room is under them it shrinks one step, 9.75 pt,
// onto its two lines; a longer one shrinks further)
const oneStep = `${'wort '.repeat(18)}xxx`
const rulesAt = (fill = true) => {
  const r = rulesFor('de')
  return fill ? r : { ...r, set: { ...r.set, adaptiveFill: false } as unknown as typeof r.set }
}
const lay = (m: Placed, fill = true, text = oneStep) =>
  layPage(part([[m]]), rowsOf([row(text)]), rulesAt(fill), metrics).members[0]!
const shape = (m: ReturnType<typeof lay>) => ({ state: m.state, fit: m.fit, lines: m.lines })

describe('the borrow past TeX’s text block bottom (§18.37)', () => {
  it('keeps the full size of a paragraph that would shrink one step, its last line only as deep under the bottom as it needs', () => {
    expect(PAST_FOOT).toBe(1.5)
    expect([lay(bounded(), false).fit!.size, lay(bounded(), false).lines.map(([y]) => y)]).toEqual([9.75, [700, 688]])
    const on = lay(member(), false)
    expect([on.state, on.fit?.size]).toEqual(['laid', 10])
    // (the bottom at 677: the third line at the pitch, 1 pt under it, the depth it needs, under the bound of 1.5)
    expect(on.lines.map(([y]) => y)).toEqual([700, 688, 676])
    // (the page's fill lays it again at its own size and leading, never deeper: the page's one paragraph grown to 1.1)
    const filled = lay(member(), true)
    expect(filled.fit!.size).toBe(11)
    expect(filled.lines.map(([y]) => y)).toEqual([700, 688, 676])
  })
  it('takes PAST_FOOT under the bottom and no more; nothing where the next ink stands TeX’s separation under its last line', () => {
    // (the bottom 10.6 pt under the last line: the third line needs 1.4 pt past it, and is laid there at full size)
    expect(lay(member({}, 10.6), false).fit!.size).toBe(10)
    // (10.4 pt: it needs 1.6, more than the bound, and the paragraph shrinks as its twin with no room past the bottom does)
    for (const fill of [true, false])
      expect(shape(lay(member({}, 10.4), fill))).toEqual(shape(lay(bounded({}, 10.4), fill)))
    // (the next ink TeX's separation under the last line: no room under it at all, at any size)
    const inked = member({}, 11, 12)
    for (const fill of [true, false]) {
      const m = lay(inked, fill)
      expect(m.fit!.size).toBeLessThan(10)
      expect(m.lines.every(([y]) => y >= 688)).toBe(true)
    }
  })
  it('borrows before a later step too: a paragraph the room cannot keep at full size shrinks less, its last line as deep as it needs', () => {
    // (2608.16117v1-de t99 p28: at its size the paragraph needs more than the line the room under it holds, so with no room past
    // the bottom it shrinks to the size at which its own lines hold it, 10.46 for 11.96; with the borrow it stops at the first
    // step down at which the room's line holds the rest, 11.06, that line 1.05 pt under the bottom. Here 8 pt over its two lines
    // with no room past the bottom; with it 9.5 pt, the third line 1 pt under the bottom at 677)
    const text = 'wort '.repeat(28).trim()
    for (const fill of [true, false]) {
      expect(lay(bounded(), fill, text).fit!.size).toBe(8)
      const on = lay(member(), fill, text)
      expect(on.fit!.size).toBe(9.5)
      expect(on.lines.map(([y]) => y)).toEqual([700, 688, 676])
    }
  })
  it('sets a line under the bottom only for a paragraph it keeps larger: one it keeps no larger is laid as with no room there', () => {
    // (the borrow offered to every state, round 5's B: units that fit without it sank a point for nothing. Over translations of
    // 15 to 45 words into two lines with one line of room 1 pt short, from fitting at full size to shrinking below the fit's
    // floor: each is set larger than its twin with no room past the bottom, or exactly as it)
    for (let n = 15; n <= 45; n++)
      for (const fill of [true, false]) {
        const text = 'wort '.repeat(n).trim()
        const [base, on] = [lay(bounded(), fill, text), lay(member(), fill, text)]
        expect(on.fit!.size).toBeGreaterThanOrEqual(base.fit!.size)
        if (on.fit!.size === base.fit!.size) expect(shape(on)).toEqual(shape(base))
        else expect(on.lines.every(([y]) => y >= 677 - PAST_FOOT - 0.05)).toBe(true)
      }
  })
  it('moves nothing of a neighbour in the other column: its last line stays on TeX’s bottom', () => {
    const right = member({
      ord: 1,
      text: idB,
      lines: [
        [1, 1, 320, 548, 700, 707, 698, 320, 548, 0, 10],
        [1, 1, 320, 548, 688, 695, 686, 320, 548, 0, 10],
      ],
    })
    const both = (left: Placed, fill: boolean) =>
      layPage(part([[left], [right]]), rowsOf([row(oneStep), row('kurz', idB)]), rulesAt(fill), metrics).members
    const [l0, r0] = both(bounded(), false)
    const [l1, r1] = both(member(), false)
    expect(r1).toEqual(r0)
    expect([l0?.fit?.size, l1?.fit?.size]).toEqual([9.75, 10])
    expect(l1?.lines.at(-1)?.[0]).toBe(676)
    // (with the page's fill on, the body may grow alike on both sides; the neighbour's lines stay where they were)
    expect(both(member(), true)[1]?.lines.map(([y]) => y)).toEqual(both(bounded(), true)[1]?.lines.map(([y]) => y))
  })
  it('moves no line of the next page: a paragraph over a page break takes the line it needs into the room under its first frame', () => {
    // (2602.23285v2-ja t90 p9/p10: the next page holds no room under its frame (the next paragraph TeX's separation under it);
    // with no room past page 1's bottom the paragraph shrinks two steps over its three lines, the borrow keeps its size with a
    // line 1 pt under page 1's bottom)
    const over = (ink: number) =>
      member({
        lines: [
          [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
          [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
          [2, 0, 72, 200, 700, 707, 698, 72, 300, 0, 10],
        ],
        room: {
          below: 0,
          next: 300,
          runs: [
            [1, ink, 11],
            [2, 12, 650],
          ],
          sep: 12,
        },
      })
    const text = 'wort '.repeat(28).trim()
    const at = (m: Placed, page: number) =>
      layPage({ ...part([[m]]), page }, rowsOf([row(text)]), rulesAt(false), metrics).members[0]!
    expect([at(over(23), 1).fit?.size, at(over(200), 1).fit?.size]).toEqual([9.5, 10])
    expect(at(over(200), 2).lines.map(([y]) => y)).toEqual(at(over(23), 2).lines.map(([y]) => y))
    expect(at(over(23), 1).lines.map(([y]) => y)).toEqual([700, 688])
    expect(at(over(200), 1).lines.map(([y]) => y)).toEqual([700, 688, 676])
  })
})
