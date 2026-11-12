// The ownership of A's glyphs (locate/ownership.ts), the module alone: made from three arrays, no document. A member takes ink
// and the table and its lists are written together; a reading phase asks who owns a glyph; after the freeze a write throws;
// the check states every glyph whose lists and table disagree, and a fixed member's glyph in a group.
import { describe, expect, it } from 'vitest'
import { ownershipOf } from '../src/locate/ownership.ts'
import type { Located, Member } from '../src/locate/work.ts'

/** a member of unit `unit` holding nothing yet (place.ts `empty`'s shape) */
const memberOf = (ord: number, unit: number, fixed = false): Member => ({
  ord,
  unit,
  id: `u${unit}`,
  kind: 'paragraph',
  located: true,
  fixed,
  kept: false,
  figure: false,
  text: [],
  label: [],
  els: new Map(),
  textBoxes: [],
  elBoxes: new Map(),
  elBoxesB: new Map(),
  turned: [],
  lines: [],
  elements: [],
  style: { role: 'serif', size: 10 },
  align: 'j',
  lead: 12,
  room: { below: 0 },
  pages: [],
  bFirst: -1,
  bLast: -1,
  read: [],
  lineGlyphs: [],
})
/** the wrap's groups of A's pages of `sizes` glyphs, none grouped but `grouped` (global indexes) */
const groupsOf = (sizes: number[], grouped: number[] = []): Located['groups'] => {
  let o = 0
  return sizes.map((n) => {
    const glyphs = new Array<string | null>(n).fill(null)
    for (const a of grouped) if (a >= o && a < o + n) glyphs[a - o] = 'g'
    o += n
    return { glyphs, boxes: [], turned: [] }
  })
}
/** six glyphs of A; glyph a's partner on B is glyph a of B (5 has none); B's glyphs 0-1 are unit 0's, 2-3 unit 1's, 4 none */
const six = () => ownershipOf({ size: 6, aToB: [0, 1, 2, 3, 4, -1], unitB: [0, 0, 1, 1, -1] })

describe('ownership: a member takes ink', () => {
  it('writes the table and appends to the lists in the order given, an element new to the member after its others', () => {
    const own = six()
    const mem = memberOf(0, 0)
    own.take(mem, { els: new Map([['7', [5]]]) })
    own.take(mem, { text: [1, 0], label: [2], els: new Map([['3', [4]]]), textBoxes: [[1, 2]], turned: [[1, 0]] })
    expect(mem.text).toEqual([1, 0])
    expect(mem.label).toEqual([2])
    expect([...mem.els]).toEqual([
      ['7', [5]],
      ['3', [4]],
    ])
    expect(mem.textBoxes).toEqual([[1, 2]])
    expect(mem.turned).toEqual([[1, 0]])
    expect([0, 1, 2, 3, 4, 5].map(own.member)).toEqual([0, 0, 0, -1, 0, 0])
    expect([0, 1, 2, 3, 4, 5].map(own.free)).toEqual([false, false, false, true, false, false])
  })
  it('copies what it is given: the caller keeps its own lists', () => {
    const own = six()
    const mem = memberOf(0, 0)
    const text = [0, 1]
    own.take(mem, { text })
    text.push(5)
    expect(mem.text).toEqual([0, 1])
  })
  it("refuses nothing: a glyph taken twice is the later taker's, and both list it", () => {
    const own = six()
    const a = memberOf(0, 0)
    const b = memberOf(1, 1)
    own.take(a, { text: [0, 1] })
    own.take(b, { text: [1] })
    expect(own.member(1)).toBe(1)
    expect(a.text).toEqual([0, 1])
    expect(b.text).toEqual([1])
  })
  it('appends boxes and their partners on B to an element of the member', () => {
    const own = six()
    const mem = memberOf(0, 0)
    own.take(mem, { elBoxes: new Map([['2', [[1, 0]]]]), elBoxesB: new Map([['2', [[0, 3]]]]) })
    own.take(mem, { elBoxes: new Map([['2', [[1, 1]]]]), elBoxesB: new Map([['2', [[0, 4]]]]) })
    expect(mem.elBoxes.get('2')).toEqual([
      [1, 0],
      [1, 1],
    ])
    expect(mem.elBoxesB.get('2')).toEqual([
      [0, 3],
      [0, 4],
    ])
    expect(own.free(0)).toBe(true)
  })
})

describe('ownership: the readings', () => {
  it('tells a held glyph from a free one, and from a member', () => {
    const own = six()
    own.hold(5)
    expect(own.member(5)).toBe(-1)
    expect(own.free(5)).toBe(false)
    expect(own.taken(5)).toBe(true)
  })
  it('a glyph is taken where a member owns it, a unit holds it, or its partner is a unit not released', () => {
    const own = six()
    // (glyphs 0-3: partners of units 0 and 1; 4: a partner of no unit; 5: no partner)
    expect([0, 1, 2, 3, 4, 5].map(own.taken)).toEqual([true, true, true, true, false, false])
    own.release(1)
    expect([0, 1, 2, 3, 4, 5].map(own.taken)).toEqual([true, true, false, false, false, false])
    own.take(memberOf(0, 1), { text: [3] })
    expect(own.taken(3)).toBe(true)
  })
  it("a glyph's unit is its member's, else its partner's, else none", () => {
    const own = six()
    own.take(memberOf(0, 7), { text: [0] })
    expect([0, 1, 2, 3, 4, 5].map(own.unit)).toEqual([7, 0, 1, 1, -1, -1])
  })
  it('its readings are closures, safe to hand on alone', () => {
    const own = six()
    const { taken, unit } = own
    expect(taken(0)).toBe(true)
    expect(unit(2)).toBe(1)
  })
})

describe('ownership: ink that changes role', () => {
  it("a member's text glyphs and nested elements become one element, ascending, its boxes with it; no owner changes", () => {
    const own = six()
    const mem = memberOf(0, 0)
    own.take(mem, {
      text: [0, 1, 4],
      els: new Map([
        ['5', [3]],
        ['6', [2]],
      ]),
      elBoxes: new Map([['5', [[1, 7]]]]),
      elBoxesB: new Map([['5', [[0, 9]]]]),
    })
    const el = own.asElement(mem, '9', [1, 4], ['5'])
    expect(el).toEqual([1, 3, 4])
    expect(mem.text).toEqual([0])
    expect([...mem.els]).toEqual([
      ['6', [2]],
      ['9', [1, 3, 4]],
    ])
    expect([...mem.elBoxes]).toEqual([['9', [[1, 7]]]])
    expect([...mem.elBoxesB]).toEqual([['9', [[0, 9]]]])
    expect([0, 1, 2, 3, 4].map(own.member)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('ownership: the freeze', () => {
  it('every write throws after it, and the face it returns reads on', () => {
    const own = six()
    const mem = memberOf(0, 0)
    own.take(mem, { text: [0] })
    const owned = own.freeze()
    const thrown = 'locate: ownership written after its freeze'
    expect(() => own.take(mem, { text: [1] })).toThrow(thrown)
    expect(() => own.takeAsStated(mem, { text: [1] }, [1])).toThrow(thrown)
    expect(() => own.hold(1)).toThrow(thrown)
    expect(() => own.release(0)).toThrow(thrown)
    expect(() => own.asElement(mem, '1', [0], [])).toThrow(thrown)
    expect(mem.text).toEqual([0])
    expect(owned.member(0)).toBe(0)
    expect(Object.keys(owned).sort()).toEqual(['check', 'free', 'member', 'taken', 'unit'])
  })
})

describe('ownership: the check', () => {
  it('finds nothing where every owned glyph is listed once by its owner', () => {
    const own = six()
    const a = memberOf(0, 0)
    const b = memberOf(1, 1)
    own.take(a, { text: [0], label: [1], els: new Map([['2', [2]]]) })
    own.take(b, { text: [3, 4] })
    own.hold(5)
    expect(own.check([a, b], groupsOf([3, 3], [0, 1, 2, 3, 4]))).toEqual([])
  })
  it('names a glyph listed twice, listed and not owned, and owned and not listed, with its page and index', () => {
    const own = six()
    const a = memberOf(0, 0)
    const b = memberOf(1, 1)
    own.take(a, { text: [0, 1] })
    // (glyph 1 taken again: b owns it, a lists it; and b lists glyph 3 in two roles)
    own.take(b, { text: [1, 3], label: [3] })
    // (glyph 4 owned by a, which lists it nowhere: a write past the module's, which the read-only lists refuse elsewhere)
    own.take(a, { text: [4] })
    ;(a.text as number[]).pop()
    expect(own.check([a, b], groupsOf([3, 3]))).toEqual([
      { kind: 'listed, not owned', page: 1, glyph: 1, member: 0, role: 'text', owner: 1 },
      { kind: 'listed twice', page: 1, glyph: 1, member: 1, role: 'text', owner: 1 },
      { kind: 'listed twice', page: 2, glyph: 0, member: 1, role: 'label', owner: 1 },
      { kind: 'owned, not listed', page: 2, glyph: 1, member: 0, role: '', owner: 0 },
    ])
  })
  it("names a fixed member's glyph in a group, owned or listed", () => {
    const own = six()
    const kept = memberOf(0, 0, true)
    own.take(kept, { text: [0, 1] })
    expect(own.check([kept], groupsOf([2, 4], [1]))).toEqual([
      { kind: 'fixed, in a group', page: 1, glyph: 1, member: 0, role: 'text', owner: 0 },
    ])
  })
  it("a page of no glyphs is passed over in a glyph's page", () => {
    const own = six()
    const mem = memberOf(0, 0)
    own.take(mem, { text: [2] })
    ;(mem.text as number[]).length = 0
    expect(own.check([mem], groupsOf([2, 0, 4]))).toEqual([
      { kind: 'owned, not listed', page: 3, glyph: 0, member: 0, role: '', owner: 0 },
    ])
  })
  it('a glyph a takeAsStated left on one side alone is carried, its owner the claim', () => {
    const own = six()
    const mem = memberOf(0, 0)
    // (a figure text made of a printed line: its element's glyphs 1 and 2 listed, claimed none; glyph 3 claimed, listed nowhere)
    own.takeAsStated(mem, { text: [0], els: new Map([['0', [1, 2]]]) }, [0, 3])
    expect([0, 1, 2, 3].map(own.member)).toEqual([0, -1, -1, 0])
    expect(own.check([mem], groupsOf([6]))).toEqual([
      { kind: 'listed, not owned', page: 1, glyph: 1, member: 0, role: '0', owner: -1, carried: true },
      { kind: 'listed, not owned', page: 1, glyph: 2, member: 0, role: '0', owner: -1, carried: true },
      { kind: 'owned, not listed', page: 1, glyph: 3, member: 0, role: '', owner: 0, carried: true },
    ])
  })
})
