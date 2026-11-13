// The ownership of A's glyphs (locate/ownership.ts). The module alone, made from three arrays, no document: a member takes ink
// and the table and its lists are written together; a reading phase asks who owns a glyph; after the freeze a write throws;
// the check states every glyph whose lists and table disagree, and a fixed member's glyph in a group. Then locate over pages
// made by hand (each glyph 6 pt wide at 10 pt, no paper's text): its check finds nothing, and on a figure's line holding an
// element exactly that element's glyphs, carried (the seed of that fault's test). The package's other locate cases are
// checked through tests/helpers/locate.ts, which requires the check to find nothing but the carried.
import { type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { Doc, DocGlyph } from '../src/doc.ts'
import type { PageInk } from '../src/ink.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import { locate } from '../src/locate/locate.ts'
import { ownershipOf } from '../src/locate/ownership.ts'
import type { Located, Member } from '../src/locate/work.ts'
import { docOf } from './helpers/doc.ts'

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

const text = (s: string) => ({ t: 'text' as const, s })
const unitOf = (kind: string, content: Piece[], more: Partial<InstrumentUnit> = {}): InstrumentUnit => ({
  id: unitId(kind, content),
  kind,
  content,
  ...more,
})
/** an instrument over B, each glyph's [unit, role, piece] by `ownerOf` (docOf's glyph `n` is its line) */
const instrumentOf = (
  B: Doc,
  units: InstrumentUnit[],
  ownerOf: (p: number, g: DocGlyph, j: number) => [unit: number, role: number, piece: number],
): Instrument => ({
  ink: B,
  units,
  glyphs: B.pages.map((pg, p) => {
    const O = ownersOf(pg.glyphs.length)
    pg.glyphs.forEach((g, j) => {
      const [u, r, k] = ownerOf(p, g, j)
      O.unit[j] = u
      O.role[j] = r
      O.piece[j] = k
    })
    return O
  }),
  boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
  tex: {},
  made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
})
/** A's pages as pageInk would give them (read.ts `raw`): its glyphs, boxes and their kinds */
const rawOf = (doc: Doc): PageInk[] =>
  doc.pages.map(
    (pg) =>
      ({
        glyphs: pg.glyphs.map((g) => ({ ...g })),
        boxes: pg.boxes,
        paths: pg.kinds,
        boxAt: pg.boxAt,
        points: [],
        paras: [],
        paraEnds: [],
        regions: [],
        turned: [],
        pictures: [],
        shapes: new Map(),
        figures: new Map(),
        unseen: new Set(),
        cut: new Map(),
        capped: false,
        timedOut: false,
        degraded: false,
        mergedAt: null,
        rotated: false,
      }) as unknown as PageInk,
  )

describe('ownership: what locate states', () => {
  it('finds nothing where a unit has a label and an element, a block is kept and a unit is born on A', () => {
    // (B's one page: a heading with its number, a paragraph holding a formula, a kept block; A's page 2 is B's none: born)
    const lines = ['1 Intro', 'see x2 here', 'kept words']
    const B = docOf([{ lines }])
    const A = docOf([{ lines }, { lines: ['a page of its own'] }])
    const units = [
      unitOf('heading', [text('Intro')]),
      unitOf('para', [text('see '), { t: 'el', id: '1', kind: 'math', src: '$x_2$' }, text(' here')]),
      unitOf('para', [text('kept words')], { kept: true, fixed: true }),
    ]
    const ins = instrumentOf(B, units, (_, g) => {
      if (g.n === 0) return [0, g.u === '1' ? ROLE.label : ROLE.text, -1]
      if (g.n === 1)
        return [1, g.u === 'x' || g.u === '2' ? ROLE.element : ROLE.text, g.u === 'x' || g.u === '2' ? 1 : -1]
      return [2, ROLE.text, -1]
    })
    const L = locate(ins, A, align(B, A))
    expect(L.members.map((m) => [m.kind, m.located, m.fixed, m.label.length, [...m.els.keys()]])).toEqual([
      ['heading', true, false, 1, []],
      ['para', true, false, 0, ['1']],
      ['para', true, true, 0, []],
      ['inkorphan', true, false, 0, []],
    ])
    expect(L.disagreements).toEqual([])
  })

  it("states a figure's line holding an element as carried: the element's glyphs listed, owned by none (F0, ink.ts)", () => {
    // (the case of ink.test.ts's F0 title and its path: TeX's line in a picture, its path in a face of one pitch an element of
    // the one figure text. ink.ts states the element's glyphs in `els` and claims none of them (its `ph` empty): each of them is
    // listed and free, carried by `takeAsStated` until that fault's fix, and nothing else is found)
    const line = 'Action: Write /tmp/f_a.py (scope cut)'
    const at = 'a paragraph whose word'.length
    const path = [line.indexOf('/'), line.indexOf('py') + 2] as const
    const docWith = (marks: boolean): Doc => {
      const d = docOf([
        { lines: ['a paragraph whose word', { text: line, y: 640 }, { text: 'continues on its last line', y: 600 }] },
      ])
      const pg = d.pages[0]!
      pg.glyphs.slice(at, at + line.length).forEach((g, j) => {
        const f = j >= path[0] && j < path[1] ? 'LMMono10-Regular' : 'LMSans10-Bold'
        Object.assign(g, { font: `ABCDEF+${f}`, base: f })
      })
      for (const g of pg.glyphs)
        if (!g.font.endsWith('Mono10-Regular') && !g.blank)
          g.x1 = g.x0 + (0.55 + (g.u.codePointAt(0)! % 3) * 0.05) * g.size
      if (marks)
        pg.marks = {
          paras: [],
          paraEnds: [],
          regions: [],
          pictures: [
            { name: 'zs', glyph: at, box: 0 },
            { name: 'ze', glyph: at + line.length, box: 0 },
          ],
        }
      return d
    }
    const B = docWith(true)
    const A = docWith(false)
    const ins = instrumentOf(
      B,
      [unitOf('para', [text('a paragraph whose word continues on its last line')])],
      (_, g) => [g.n === 1 ? -1 : 0, ROLE.text, -1],
    )
    const L = locate(ins, A, align(B, A), { pages: rawOf(A) })
    const fig = L.members.find((m) => m.figure && m.unit >= 0)!
    expect(fig.els.get('1')).toHaveLength(path[1] - path[0])
    expect(L.disagreements).toEqual(
      Array.from({ length: path[1] - path[0] }, (_, j) => ({
        kind: 'listed, not owned',
        page: 1,
        glyph: at + path[0] + j,
        member: fig.ord,
        role: '1',
        owner: -1,
        carried: true,
      })),
    )
  })
})
