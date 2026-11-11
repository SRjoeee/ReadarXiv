// The borrow past TeX's text block bottom (Choices.pastFoot, an experiment for the owner's test, default off; docs/PDF-READER.md
// §18.37): before each of the fit's shrink steps, a unit whose last line would stand under its block's bottom may be laid with
// that line up to `pastFoot` points under it, keeping only the depth its lines need; the page fill lays it no deeper, a unit the
// borrow does not buy goes down the fit's steps as without it, and a unit it keeps no larger has no line under the bottom. Off
// (absent or 0), every lay is today's.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
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
  ],
  // (TeX's text block bottom 11 pt under the last line, the next ink 200 pt down: a third line at the pitch of 12 stands 1 pt
  // under the bottom)
  room: { below: 0, next: 300, runs: [[1, 200, 11]], sep: 12 },
  ...o,
})
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
// (a translation three characters too long for two lines at 10 pt: today it shrinks one step, 9.75 pt, onto three lines; a
// longer one shrinks further)
const oneStep = `${'wort '.repeat(18)}xxx`
const rulesAt = (pastFoot?: number, fill = true) => {
  const r = rulesFor('de', pastFoot === undefined ? {} : { pastFoot })
  return fill ? r : { ...r, set: { ...r.set, adaptiveFill: false } as unknown as typeof r.set }
}
const lay = (m: Placed, pastFoot?: number, fill = true, text = oneStep) =>
  layPage(part([[m]]), rowsOf([row(text)]), rulesAt(pastFoot, fill), metrics).members[0]!

describe('the borrow past TeX’s text block bottom (Choices.pastFoot, §18.37)', () => {
  it('is off by default and at 0: the rules and every lay are today’s', () => {
    expect('pastFoot' in rulesFor('de').set).toBe(false)
    expect('pastFoot' in rulesFor('de', { pastFoot: 0 }).set).toBe(false)
    expect(rulesFor('de', { pastFoot: 1.5 }).set.pastFoot).toBe(1.5)
    for (const fill of [true, false]) expect(lay(member(), 0, fill)).toEqual(lay(member(), undefined, fill))
  })
  it('keeps the full size of a paragraph that shrinks one step today, its last line only as deep under the bottom as it needs', () => {
    expect(lay(member(), undefined, false).fit!.size).toBe(9.75)
    const on = lay(member(), 1.5, false)
    expect([on.state, on.fit?.size]).toEqual(['laid', 10])
    // (the bottom at 677: the third line at the pitch, 1 pt under it, the depth it needs, under the bound of 1.5)
    expect(on.lines.map(([y]) => y)).toEqual([700, 688, 676])
    // (the page's fill lays it again at its own size and leading, never deeper)
    const filled = lay(member(), 1.5, true)
    expect(filled.fit!.size).toBeGreaterThanOrEqual(10)
    expect(filled.lines.map(([y]) => y)).toEqual([700, 688, 676])
  })
  it('leaves a paragraph it cannot buy to the fit’s steps exactly as without it', () => {
    // (the third line needs 1 pt under the bottom: a bound of 0.5 buys nothing, at any size)
    for (const fill of [true, false]) expect(lay(member(), 0.5, fill)).toEqual(lay(member(), undefined, fill))
    // (and where the next ink stands TeX's separation under the last line, no room is there to borrow at any size)
    const inked = member({ room: { below: 0, next: 12, runs: [[1, 12, 11]], sep: 12 } })
    for (const fill of [true, false]) expect(lay(inked, 1.5, fill)).toEqual(lay(inked, undefined, fill))
  })
  it('borrows before a later step too: a paragraph the room cannot keep at full size shrinks less, its last line as deep as it needs', () => {
    // (2608.16117v1-de t99 p28: at its size the paragraph needs more than the line the room under it holds, so today it shrinks
    // to the size at which its own lines hold it, 10.46 for 11.96; with the borrow it stops at the first step down at which the
    // room's line holds the rest, 11.06, that line 1.05 pt under the bottom. Here today's 8 pt over its two lines, tightened;
    // with the borrow 9.5 pt, the third line 1 pt under the bottom at 677)
    const text = 'wort '.repeat(28).trim()
    for (const fill of [true, false]) {
      const [today, on] = [lay(member(), undefined, fill, text), lay(member(), 1.5, fill, text)]
      expect(today.fit!.size).toBe(8)
      expect(on.fit!.size).toBe(9.5)
      expect(on.lines.map(([y]) => y)).toEqual([700, 688, 676])
    }
  })
  it('sets a line under the bottom only for a paragraph it keeps larger: one it keeps at today’s size is today’s', () => {
    // (B's failure, the borrow offered to every state: units that fit today sank a point for nothing. Over translations of 15
    // to 45 words into two lines with one line of room 1 pt short, from fitting at full size to shrinking below the fit's
    // floor: each is set larger than today, or exactly as today)
    for (let n = 15; n <= 45; n++)
      for (const fill of [true, false]) {
        const text = 'wort '.repeat(n).trim()
        const [today, on] = [lay(member(), undefined, fill, text), lay(member(), 1.5, fill, text)]
        expect(on.fit!.size).toBeGreaterThanOrEqual(today.fit!.size)
        if (on.fit!.size === today.fit!.size) expect(on).toEqual(today)
        else expect(on.lines.every(([y]) => y >= 677 - 1.5 - 0.05)).toBe(true)
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
    const both = (pastFoot: number | undefined, fill: boolean) =>
      layPage(part([[member()], [right]]), rowsOf([row(oneStep), row('kurz', idB)]), rulesAt(pastFoot, fill), metrics)
        .members
    const [l0, r0] = both(undefined, false)
    const [l1, r1] = both(1.5, false)
    expect(r1).toEqual(r0)
    expect([l0?.fit?.size, l1?.fit?.size]).toEqual([9.75, 10])
    expect(l1?.lines.at(-1)?.[0]).toBe(676)
    // (with the page's fill on, the body may grow alike on both sides; the neighbour's lines stay where they were)
    const [, r2] = both(1.5, true)
    expect(r2?.lines.map(([y]) => y)).toEqual(both(undefined, true)[1]?.lines.map(([y]) => y))
  })
  it('moves no line of the next page: a paragraph over a page break takes the line it needs into the room under its first frame', () => {
    // (2602.23285v2-ja t90 p9/p10: the next page holds no room under its frame (the next paragraph TeX's separation under it);
    // today the paragraph shrinks two steps over its three lines, the borrow keeps its size with a line 1 pt under page 1's bottom)
    const over = member({
      lines: [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
        [2, 0, 72, 200, 700, 707, 698, 72, 300, 0, 10],
      ],
      room: {
        below: 0,
        next: 300,
        runs: [
          [1, 200, 11],
          [2, 12, 650],
        ],
        sep: 12,
      },
    })
    const text = 'wort '.repeat(28).trim()
    const at = (pastFoot: number | undefined, page: number) =>
      layPage({ ...part([[over]]), page }, rowsOf([row(text)]), rulesAt(pastFoot, false), metrics).members[0]!
    expect([at(undefined, 1).fit?.size, at(1.5, 1).fit?.size]).toEqual([9.5, 10])
    expect(at(1.5, 2).lines.map(([y]) => y)).toEqual(at(undefined, 2).lines.map(([y]) => y))
    expect(at(undefined, 1).lines.map(([y]) => y)).toEqual([700, 688])
    expect(at(1.5, 1).lines.map(([y]) => y)).toEqual([700, 688, 676])
  })
})
