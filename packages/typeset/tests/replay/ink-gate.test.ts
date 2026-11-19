// The reader gate's invariants on the lay the product makes (gate-l1.ts with `entryLaid`): I5 read by ink against the breaker's
// stated tolerance and each member's own size floor (invariantsOf by ink), and I3 by ink against everything that stays on the page
// (ink-gate.ts). Constructed members and pages: each gate red on a seeded fault, green where none is.
import type { Part, Placed } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { PageMember } from '../../src/lay/page.ts'
import type { Laid, Metrics, Page } from '../../src/types.ts'
import { invariantsOf, LINE_TOLERANCE, samePage } from './gate-l1.ts'
import { drawnInk, inkOverlaps, keptInk } from './ink-gate.ts'

describe('I5 on the entry’s lay: a line past its slot by its ink beyond the breaker’s tolerance, a member under its own floor', () => {
  const R = { floor: 0.8, floorMin: 0.6 } as never
  const fresh = () => ({
    laid: 0,
    lines: 0,
    I3: [],
    I4: [],
    I5: [] as string[],
    I5by: new Map(),
    below: [],
    I5floor: [] as string[],
    unread: 0,
  })
  const face = { family: 'serif', weight: 400, style: 'normal' }
  /** a member of one line on page 1, its slot 72-300, its last item a run whose ink ends `inkPast` pt past the slot's end and whose
   *  advance ends `advancePast` past it; `scale` its fit's, `P` its parameters */
  const member = (o: { inkPast: number; advancePast?: number; scale?: number; P?: object; punct?: string }) => {
    const w = 20
    const x = 300 - w + (o.advancePast ?? o.inkPast)
    // (the ink right a hundred px: the run's advance less the part of it past the ink, at size 10)
    const measure = {
      w100: () => 200,
      ink100: () => ({ a: 70, d: 20 }),
      inkRight100: () => ((w - ((o.advancePast ?? o.inkPast) - o.inkPast)) / 10) * 100,
    }
    return {
      ord: 7,
      state: 'laid',
      lines: [],
      slots: [],
      lay: {
        P: { measure, ...o.P },
        tokens: [],
        layout: {
          f: 10,
          scale: o.scale ?? 1,
          state: { track: 0, trackLatin: 0 },
          lines: [
            {
              page: 1,
              x0: 72,
              x1: 300,
              baseline: 700,
              used: x + w - 72,
              items: [{ t: { s: 'text', face, cls: 'latin', punct: o.punct }, x, w }],
            },
          ],
        },
      },
    } as unknown as PageMember
  }
  it('counts a line whose ink passes its slot by more than 0.01 pt, whatever its class; none within it', () => {
    expect(LINE_TOLERANCE).toBe(0.01)
    const over = fresh()
    invariantsOf(1, [member({ inkPast: 0.3 })], R, over, undefined, null, true)
    expect(over.I5).toEqual(['ord 7: a line 0.30 pt past its slot (overfull: no space to shrink, not squeezed)'])
    const within = fresh()
    invariantsOf(1, [member({ inkPast: 0.01 })], R, within, undefined, null, true)
    expect(within.I5).toEqual([])
    // (the restated form leaves the overfull line out, the invariant as said counts it)
    const restated = fresh()
    invariantsOf(1, [member({ inkPast: 0.3 })], R, restated)
    expect(restated.I5).toEqual([])
  })
  it('reads a closing mark’s blank half by its ink: its advance past the slot, its ink inside it, no line past', () => {
    const inv = fresh()
    invariantsOf(1, [member({ inkPast: 0, advancePast: 5, punct: 'close' })], R, inv, undefined, null, true)
    expect(inv.I5).toEqual([])
  })
  it('counts a member set under its own floor: the rule file’s, or 1 where U.params holds a head or foot line at its size', () => {
    const under = fresh()
    invariantsOf(1, [member({ inkPast: 0, scale: 0.55 })], R, under, undefined, null, true)
    expect(under.I5floor).toEqual(['ord 7: set at 0.55 under its floor 0.6'])
    const head = fresh()
    invariantsOf(1, [member({ inkPast: 0, scale: 0.9, P: { floorMin: 1 } })], R, head, undefined, null, true)
    expect(head.I5floor).toEqual(['ord 7: set at 0.9 under its floor 1'])
    const at = fresh()
    invariantsOf(1, [member({ inkPast: 0, scale: 0.6 })], R, at, undefined, null, true)
    expect(at.I5floor).toEqual([])
  })
})

describe('I3 by ink on the page as the reader draws it: a laid unit’s ink against all that stays', () => {
  // (a page 1 of three members: 1 laid, a run at 100-200 on 700; 2 left the original's, its line 60-90 on 700 (fonts' box
  // 698-708); 3 laid, its run where the test puts it. The served faces' ink: ascent 7, descent 2, right the run's length x 5)
  const metrics: Metrics = {
    ready: () => true,
    advance: (_f, _s, t) => t.length * 5,
    ink: (_f, _s, t) => [7, 2, t.length * 5],
  }
  const line = (x0: number, x1: number, y = 700, flags = 0) =>
    [1, 0, x0, x1, y, y + 8, y - 2, x0, x1, flags, 10] as Placed['lines'][number]
  const placed = (ord: number, lines: Placed['lines'], more: Partial<Placed> = {}) =>
    ({
      ord,
      kind: 'para',
      text: 'a'.repeat(64),
      lead: 12,
      style: { role: 'serif', size: 10 },
      align: 'j',
      lines,
      room: { below: 0 },
      ...more,
    }) as Placed
  const part = (members: Placed[]): Part =>
    ({ format: 1, page: 1, paper: { faces: { fonts: [] } }, flows: [members] }) as Part
  const run = (x: number, s: string, y = 700) =>
    [y, x, x + s.length * 5, [{ s, x, face: 'f', size: 10 }]] as Laid['lines'][number]
  const laid = (ord: number, lines: Laid['lines'], off = 1): Laid => ({
    ord,
    page: 1,
    state: 'laid',
    off,
    lines,
    lit: { left: [], right: [], own: [] },
  })
  const left = (ord: number): Laid => ({
    ord,
    page: 1,
    state: 'none',
    off: 0,
    lines: [],
    lit: { left: [], right: [], own: [] },
  })
  const page = (members: Laid[]): Page => ({ page: 1, wait: { rows: [], faces: [] }, members, links: [] })
  it('none where each laid run stands clear of the ink that stays and of every other', () => {
    const p = part([placed(1, [line(100, 200)]), placed(2, [line(60, 90)])])
    expect(inkOverlaps(page([laid(1, [run(100, 'x'.repeat(20))]), left(2)]), p, metrics).overlaps).toEqual([])
  })
  it('a laid run over a line left the original’s, over another laid run, over its own element kept where it stands', () => {
    // (seeded: member 1's translation drawn from 80, over member 2's original line 60-90)
    const p = part([
      placed(1, [line(100, 200)], { els: [['e1', { kind: 'other', ink: [[1, 150, 699, 160, 707, 700]] }]] }),
      placed(2, [line(60, 90)]),
      placed(3, [line(100, 200, 680)]),
    ])
    const got = inkOverlaps(
      page([laid(1, [run(80, 'x'.repeat(24))]), left(2), laid(3, [run(170, 'y'.repeat(20), 692)])]),
      p,
      metrics,
    ).overlaps
    expect(got.map((o) => [o.ord, o.with, o.kind, o.own ?? false])).toEqual([
      [1, 3, 'drawn', false],
      [1, 1, 'element', false],
      [1, 2, 'text', false],
    ])
    // (its element's group off where it is drawn otherwise: its ink erased, nothing left there)
    const off = inkOverlaps(page([laid(1, [run(100, 'x'.repeat(20))], 3), left(2)]), p, metrics).overlaps
    expect(off).toEqual([])
  })
  it('a crop is never held against the ink it is cut from, and is held against another’s', () => {
    const el = {
      kind: 'other',
      ink: [[1, 150, 699, 160, 707, 700] as [number, number, number, number, number, number]],
    }
    const p = part([placed(1, [line(100, 200)], { els: [['e1', el]] }), placed(2, [line(60, 90)])])
    const crop = (x: number) =>
      [700, 100, 210, [{ s: '', x, src: [1, 150, 699, 160, 707, 700], k: 1, piece: 'e1' }]] as Laid['lines'][number]
    // (drawn where it stands, its group on: the same ink)
    expect(inkOverlaps(page([laid(1, [crop(150)], 1), left(2)]), p, metrics).overlaps).toEqual([])
    // (drawn over member 2's line)
    expect(
      inkOverlaps(page([laid(1, [crop(70)], 3), left(2)]), p, metrics).overlaps.map((o) => [o.with, o.kind]),
    ).toEqual([[2, 'text']])
  })
  it('counts apart an overlap with ink the unit’s own original met already, and reads a stay, a label and a KEPT line', () => {
    // (a figure's image beside member 2's line, stated as its stay [110, 690, 300, 760]; member 1, a figure text inside it on A
    // and drawn there, met it already: the page's own setting. Member 3's drawn run reaches it from outside: held)
    const p = part([
      placed(1, [line(150, 170, 720)], { kind: 'figure' }),
      placed(2, [line(60, 100)], { room: { below: 0, stays: [[0, 110, 690, 300, 760]] } }),
      placed(3, [line(320, 400, 730)], {
        label: { kind: 'number', ink: [1, 300, 728, 316, 736, 730], style: { role: 'serif', size: 10 } } as never,
      }),
      placed(4, [line(320, 400, 650, 1)]),
    ])
    const got = inkOverlaps(
      page([
        laid(1, [run(150, 'abcd', 720)]),
        left(2),
        laid(3, [run(290, 'z'.repeat(8), 730)], 1),
        laid(4, [run(330, 'w'.repeat(8), 652)]),
      ]),
      p,
      metrics,
    ).overlaps
    expect(got.map((o) => [o.ord, o.with, o.kind, o.own ?? false])).toEqual([
      [1, 2, 'stays', true],
      [3, 2, 'stays', false],
      [3, 3, 'label', false],
      [4, 4, 'text', false],
    ])
  })
  it('reads the ink that stays as the Page turns groups off, and the drawn runs by their measured ink, a turned one by its corners', () => {
    const p = part([
      placed(1, [line(100, 200)], {
        label: { kind: 'number', ink: [1, 90, 698, 98, 706, 700], style: { role: 'serif', size: 10 } } as never,
      }),
    ])
    expect(keptInk(p, page([laid(1, [], 1)])).map((k) => k.kind)).toEqual(['label'])
    expect(keptInk(p, page([laid(1, [], 5)]))).toEqual([])
    expect(keptInk(p, page([left(1)])).map((k) => k.kind)).toEqual(['text', 'label'])
    // (a run set up the page from (100, 600), its ink 30 long, ascent 7 to the left of it and descent 2 to the right)
    const d = drawnInk(
      page([laid(1, [run(100, 'abc'), [600, 100, 130, [{ s: 'turned', x: 100, face: 'f', size: 10, dir: [0, 1] }]]])]),
      metrics,
    )
    expect(d.boxes).toEqual([
      { ord: 1, box: [100, 698, 115, 707] },
      { ord: 1, box: [93, 600, 102, 630] },
    ])
    expect(d.turned).toBe(1)
  })
})

describe('I6’s purity: a page laid twice by the entry gives the same display list', () => {
  it('holds two Pages alike whole, and names one whose second lay moved a run by a hundredth of a point', () => {
    const page = (x: number): Page => ({
      page: 1,
      wait: { rows: [], faces: [] },
      members: [
        {
          ord: 1,
          page: 1,
          state: 'laid',
          off: 1,
          lines: [[700, 72, 300, [{ s: 'a', x, face: 'f', size: 10 }]]],
          lit: { left: [], right: [], own: [] },
        },
      ],
      links: [],
    })
    expect(samePage(page(72), page(72))).toBe(true)
    expect(samePage(page(72), page(72.01))).toBe(false)
  })
})
