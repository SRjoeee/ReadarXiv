// A block's slots end under its foot by the loop's break, a pitch under the last; the bound (breaker/slots.ts slotsAt: 400
// slots a block) ends them where the pitch is 0 and no slot ever falls under the foot: a block of one line at a size of 0 (a
// member's size is any number the format states, @readarxiv/format Style.size), its pitch 1.2 of its size
import { describe, expect, it } from 'vitest'
import { slotsAt } from '../../src/breaker/slots.ts'

/** a block of one line on the baseline 700, 228 pt wide, at the original's pitch */
const block = { page: 1, x0: 72, x1: 300, indent: 0, B: [700], pitch0: null, centred: false, free: 0, after: 0 }
const state = { lead: 1, track: 0, trackLatin: 0, compress: 0, borrow: 0, scale: 1 }

describe('the slots a block holds end at its foot, or at the bound where the pitch is 0', () => {
  it('holds one slot at its size, and 400 on its one baseline at a size of 0', () => {
    expect(slotsAt([block] as never, state as never, {} as never, 10).map((sl) => sl.baseline)).toEqual([700])
    const none = slotsAt([block] as never, state as never, {} as never, 0)
    expect(none).toHaveLength(400)
    expect(new Set(none.map((sl) => sl.baseline))).toEqual(new Set([700]))
  })
})
