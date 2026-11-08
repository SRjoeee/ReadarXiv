// The adapter's first stage on a hand-made member: its lines as blocks, the size and alignment it states, a single line's room
// to widen into from TeX's measure and Room.side (half its size off the ink beside it), the edges PINNED states, the shared
// rows of its flow; and what stops it.
import type { Placed } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { adapt, type AdaptInput } from '../../src/lay/adapt.ts'
import { rulesFor } from '../../src/rules-for.ts'

const line = (base: number, x1: number, flags = 0): Placed['lines'][number] => [
  1,
  0,
  72,
  x1,
  base,
  base + 7,
  base - 2,
  72,
  300,
  flags,
]
const member = (o: Partial<Placed> = {}): Placed =>
  ({
    ord: 3,
    kind: 'para',
    text: 'u',
    lead: 12,
    style: { role: 'serif', size: 10 },
    align: 'j',
    lines: [line(700, 300), line(688, 300), line(676, 200)],
    room: { below: 20, next: 24 },
    ...o,
  }) as Placed
const input = (m: Placed, o: Partial<AdaptInput> = {}): AdaptInput => ({
  m,
  before: null,
  after: null,
  afterOpen: false,
  R: rulesFor('fr').set,
  measure: { w100: () => 50, ink100: () => ({ a: 70, d: 20 }), inkRight100: () => null },
  patterns: {},
  view: () => [0, 0, 612, 792],
  rulesOf: () => undefined,
  lineskip: [1, 0],
  reading: {
    tokens: [],
    labelDrawn: null,
    lead: false,
    cjkSize: undefined,
    referenced: new Set(),
  },
  ...o,
})

describe('adapt: a member set from its part’s facts', () => {
  it('reads its lines as one block on their baselines, its size and edges', () => {
    const got = adapt(input(member({ lines: [line(700, 300, 2), line(688, 300), line(676, 200)] })))
    if (!('member' in got)) throw new Error(got.stop)
    const m = got.member
    expect(m.blocks).toHaveLength(1)
    expect(m.blocks[0]!.B).toEqual([700, 688, 676])
    expect(m.s).toBe(10)
    expect(m.pages).toEqual([1])
    expect(m.P.halfLead).toEqual({ head: false, foot: true, below: 24 })
  })
  it('widens a single line to its measure, or half its size off the ink beside it', () => {
    const one = (side: [number, number]) => {
      const got = adapt(input(member({ lines: [line(700, 150)], room: { below: 20, side } })))
      if (!('member' in got)) throw new Error(got.stop)
      return got.member.blocks[0]!.x1
    }
    expect(one([72, 300])).toBe(300)
    expect(one([72, 250])).toBe(245)
  })
  it('widens a centred line whose label, drawn anew, moved its rectangle’s start', () => {
    // (2608.04322v1 p5: "IV. Experiments", centred; the label's start begins the line, and the line is still its own)
    const head = member({
      kind: 'heading',
      align: 'c',
      lines: [[1, 0, 120, 200, 700, 707, 698, 72, 300, 0]],
      room: { below: 20, side: [72, 300] },
      label: {
        kind: 'head',
        ink: [1, 100, 698, 115, 707, 700],
        style: { role: 'serif', size: 10 },
        name: ['IV', [1, 100, 698, 112, 707, 700]],
        punct: ['.', [1, 112, 698, 115, 707, 700]],
      },
    })
    const got = adapt(input(head, { reading: { ...input(head).reading, labelDrawn: 'IV.' } }))
    if (!('member' in got)) throw new Error(got.stop)
    expect([got.member.blocks[0]!.x0, got.member.blocks[0]!.x1]).toEqual([72, 228])
  })
  it('carries a label with the whole of its ink, a bracket no part names too, and centres the line with it', () => {
    // (2608.16117v1-de p18 t52: a centred caption "(a) Spannungs-…", its label's ink from its "(" at 184.85, its name "a" from
    // 188.14: read from its parts alone, its crop began at the "a" and the "(" was drawn nowhere, its line centred 1.65 pt off
    // the original's midpoint (2610.21880v1 p4 t84, "(b)", 1.3 pt))
    const caption = member({
      kind: 'caption',
      align: 'c',
      lines: [[1, 0, 118, 200, 700, 707, 698, 72, 300, 0]],
      room: { below: 20 },
      label: {
        kind: 'float',
        ink: [1, 100, 698, 115, 707, 700],
        style: { role: 'serif', size: 10 },
        line: 0,
        name: ['a', [1, 104, 698, 110, 707, 700]],
        punct: [')', [1, 110, 698, 115, 707, 700]],
      },
    })
    const got = adapt(input(caption, { reading: { ...input(caption).reading, own: true } }))
    if (!('member' in got)) throw new Error(got.stop)
    const crop = (got.member.tokens[0] as unknown as { crop: { crop: number[] } }).crop.crop
    // (its ink from its "(" to its text's start, 0.4 either side as today's)
    expect(crop[0]).toBeCloseTo(99.6, 6)
    expect(crop[2]).toBeCloseTo(117.6, 6)
    // (the line it is centred on: the original's own midpoint, its label with it, 100 to 200, widened about it to its measure)
    const b = got.member.blocks[0]!
    expect((b.x0 + b.x1) / 2).toBe(150)
  })
  it('shares its last row with the member after it, and starts on the one before', () => {
    const after = member({ ord: 4, lines: [line(676, 300)], join: [4] })
    const got = adapt(input(member(), { after, afterOpen: true }))
    if (!('member' in got)) throw new Error(got.stop)
    expect(got.member.follower).toEqual({
      id: 4,
      open: true,
      row: { page: 1, baseline: 676 },
      first: { page: 1, x1: 300 },
    })
    expect(got.member.shareRow).toEqual({ page: 1, baseline: 676, size: 10 })
    const led = adapt(input(after, { before: member() }))
    if (!('member' in led)) throw new Error(led.stop)
    expect(led.member.rowStart?.row).toMatchObject({ id: 3, page: 1, baseline: 676, x1: 68 })
  })
  it('says what stops it: the prepare’s reason, a forced break where the reading hands no U.breaks maps (today’s tokens)', () => {
    expect(adapt(input(member({ why: 'unlocated' })))).toEqual({ stop: 'unlocated' })
    expect(adapt(input(member({ els: [['1', { kind: 'other', ink: [], ends: [0, 0] }]] })))).toEqual({
      stop: 'breaks (U.breaks not adapted)',
    })
  })
})

describe('adapt: a shared row’s own label (review of #606, finding 3)', () => {
  const before = member({ ord: 2, lines: [line(712, 300), line(700, 120)] })
  const follower = member({
    join: [4],
    lines: [[1, 0, 140, 300, 700, 707, 698, 72, 300, 0], line(688, 300)],
    label: {
      kind: 'mark',
      ink: [1, 128, 698, 134, 707, 703],
      style: { role: 'serif', size: 7 },
      num: ['1', [1, 128, 698, 134, 707, 703]],
    },
  })
  it('gives the flow its label’s crop on the row’s baseline where its tokens are its own, and none where today’s hold it', () => {
    const own = adapt(input(follower, { before, reading: { ...input(follower).reading, own: true } }))
    if (!('member' in own)) throw new Error(own.stop)
    const lab = own.member.rowStart?.label
    expect(lab).toBeDefined()
    const t = lab!.crop(700) as unknown as {
      crop: { crop: number[]; baseline: number }
      ownLabel: boolean
      glue: boolean
    }
    expect(t.ownLabel).toBe(true)
    expect(t.glue).toBe(false)
    expect(t.crop.baseline).toBe(700)
    expect(t.crop.crop[0]).toBeCloseTo(127.6, 5)
    const today = adapt(input(follower, { before }))
    if (!('member' in today)) throw new Error(today.stop)
    expect(today.member.rowStart?.label).toBeUndefined()
  })
  it('holds its label on the row where the part says it stands on its first line, raised or not (Label.line; L3)', () => {
    // (2608.06701v1 p5 t76: a footnote's mark "3" raised 2.81 pt over the row it shares with the footnote before; read as on the
    // row only within 0.05 pt of its baseline, it was none, and the follower stayed on its own line where today ran it on)
    const on = (label: Placed['label']) => {
      const got = adapt(input({ ...follower, join: [4, 1], label }, { before }))
      if (!('member' in got)) throw new Error(got.stop)
      return got.member.rowStart?.ownLabel ?? null
    }
    const label = follower.label!
    expect(on({ ...label, line: 0 })).toEqual([0, 1, 128, 703, 134, 707, 698])
    // (on its second line: not the row's)
    expect(on({ ...label, line: 1 })).toBeNull()
    // (a part made before states no line: its label's baseline the row's, as before)
    expect(on(label)).toBeNull()
    expect(on({ ...label, ink: [1, 128, 698, 134, 707, 700] })).not.toBeNull()
  })
})
