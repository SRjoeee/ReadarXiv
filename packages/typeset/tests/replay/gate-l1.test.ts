// The gate's runner on lane L1's parts (gate-l1.ts) on one pair: every member set or counted by what stops it, every page laid
// from its own part, a member on two pages laid alike from each page's part. Its numbers against the baseline are the corpus
// runner's (lab/typeset/gate-l1.mjs): here it is held to run whole.
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { tableMetrics } from '../../src/metrics/table.ts'
import { gatePair } from './gate.ts'
import type { OutPiece, Row, Unit } from '@readarxiv/format'
import { acceptedRows, cropLays, entryByToday, gateL1Pair, invariantsOf, todayMember, todayTies } from './gate-l1.ts'
import { type PageMember, tieCaps } from '../../src/lay/page.ts'
import type { FlowMember } from '../../src/lay/flow.ts'
import type { Metrics } from '../../src/types.ts'
import { hasL1 } from './l1.ts'
import { hasDerived, hasTap, readGz, TAP } from './tap.ts'
import { hasCache } from './today.ts'

describe.skipIf(!hasTap || !hasDerived('rules') || !hasCache || !hasL1)('the gate on L1’s parts', () => {
  it('lays every page of 1706.03762v7-de.pack from its own L1 part', { timeout: 120_000 }, () => {
    const g = gateL1Pair('1706.03762v7-de.pack')
    expect(g.threw).toEqual([])
    expect(g.selfDiffer).toEqual([])
    expect(g.units.length).toBeGreaterThan(50)
    expect(g.setting.size).toBeGreaterThanOrEqual(g.units.length)
  })
  it('holds I4 and the restated I5 on its lays, the reading from the part; I3 no worse than today’s on the pair', {
    timeout: 120_000,
  }, () => {
    // (measured by the tap's table of today's measures: a measure today never made throws, that flow's members 'error')
    const g = gateL1Pair('1512.03385v1-de.pack', {
      reading: 'part',
      metricsOf: (pair) => tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`)) as never),
    })
    expect(g.inputs.size).toBeGreaterThan(100)
    const today = gatePair('1512.03385v1-de.pack')
    // (I4: every element's crop drawn once; I5: a line past its slot only by its closing mark's blank half, or overfull)
    expect(g.inv.I4).toEqual([])
    expect(g.inv.I5).toEqual([])
    expect(g.inv.I3.length).toBeLessThanOrEqual(today.inv.I3.length)
    expect(g.selfDiffer).toEqual([])
  })
  it('lays each page under the reader’s default options and every option on, reading no row its page does not wait for', {
    timeout: 120_000,
  }, () => {
    // (the reads gate, docs/PDF-READER.md §19.15: the kinds the reader's default toggles leave, its names' and references', and
    // none; every row id each lay reads held against its page's wait set, no exemption)
    const leave = new Map([
      ['default', ['affiliation', 'author', 'inknames', 'inkreferences', 'reference', 'refnames']],
      ['every option on', []],
    ])
    const seen = new Map<string, number>()
    // (what is read does not hang on a width: every text measured half its size a character, so that no measure is missing)
    const metrics: Metrics = {
      ready: () => true,
      advance: (_f, size, t) => (size * [...t].length) / 2,
      ink: () => [0.7, 0.2, 0],
    }
    const g = gateL1Pair('1706.03762v7-de.pack', {
      reading: 'part',
      metricsOf: () => metrics,
      entry: true,
      leave,
      reads: (option, _pg, read) => seen.set(option, (seen.get(option) ?? 0) + read.size),
    })
    for (const option of leave.keys()) {
      const r = g.entry!.reads!.get(option)!
      expect([r.pages, r.outside, r.outsidePages]).toEqual([g.pages, 0, 0])
      expect(r.reads).toBe(seen.get(option))
      expect(r.reads).toBeGreaterThan(0)
    }
  })
})

describe("the entry's members compared with the runner's, by today's unit (round 8 B8)", () => {
  // (a member of the part no unit of today's joins (its unit's text moved: lane style-wire's escaped characters, no door row) is
  // one the runner never lays; keyed by its own part ord it took the place of the member of today's unit of that ord, 1512.03385
  // p7's moved cell at part ord 125 standing for today's heading t125, read as "none against laid": 97 of B8's 747)
  it("keys each joined member by its today's ord, and leaves out one no unit of today's joins", () => {
    const m = (ord: number) => ({ ord, state: ord === 125 ? 'none' : 'laid' })
    const unitOf = new Map([
      [121, { ord: 125 }],
      [122, { ord: 126 }],
    ])
    const by = entryByToday([m(121), m(122), m(125)], unitOf)
    expect([...by.keys()]).toEqual([125, 126])
    expect(by.get(125)).toEqual({ ord: 121, state: 'laid' })
  })
})

describe('a store’s rows read as the product’s chain reads them: a Result the acceptance rule refuses is no row', () => {
  const a = 'a'.repeat(64),
    b = 'b'.repeat(64),
    c = 'c'.repeat(64)
  const unit = (id: string): Unit => ({
    id,
    kind: 'para',
    content: [
      { t: 'text', s: 'See (' },
      { t: 'el', id: '1', kind: 'other', src: '\\ref{x}' },
    ],
  })
  const units = new Map([a, b, c].map((id) => [id, unit(id)]))
  const results = new Map<string, Row>([
    // (its element lost: the rule refuses it)
    [a, { id: a, ok: true, by: 't', content: [{ t: 'text', s: 'Siehe (' }] }],
    // (its element kept: given)
    [
      b,
      {
        id: b,
        ok: true,
        by: 't',
        content: [
          { t: 'text', s: 'Siehe (' },
          { t: 'el', id: '1' },
        ],
      },
    ],
    // (a failed Result: given as it is, the unit's reason kept)
    [c, { id: c, ok: false, why: { kind: 'refused' } }],
  ])
  // (the rule as the caller hands it: here an element lost refuses, as the translate package's does)
  const accept = (u: Unit, content: readonly OutPiece[]) =>
    u.content.filter((p) => p.t === 'el').length === content.filter((p) => p.t === 'el').length
  it('withholds an ok Result the rule refuses, and gives the rest as they are', () => {
    const got = acceptedRows(results, units, accept)
    expect([...got.keys()]).toEqual([b, c])
    expect(got.get(b)).toBe(results.get(b))
  })
  it('gives every Result where no rule is given', () => {
    expect(acceptedRows(results, units, undefined)).toBe(results)
  })
})

describe("the runner never mixes two numberings: a member no unit of today's joins has no ord of today's (lane hdr-lines)", () => {
  // (a part of our own, as 2608.25210v2-zh p9 stood on step 1's bundle of 2026-11-15: the part ties the run-in heading (part ord
  // 183, today's 192) with its paragraph (part ord 184), which joins no unit of today's; part ord 175 is today's 184. The runner
  // kept the paragraph's 184 among today's ords, there the ord of another unit laid on the page, and the tie capped that unit at
  // the heading's 0.975: 8.97 pt to 8.74, because S1's three units inserted earlier in the paper moved every ord after them)
  const unitOf = new Map([
    [175, { ord: 184 }],
    [183, { ord: 192 }],
  ])
  const handed = new Set([184, 192])
  /** an ord is counted from 0 (format's Placed.ord): one under it names no member */
  const noOrd = (o: number | undefined) => o !== undefined && o < 0
  it("leaves out of a size tie a member no unit of today's joins: the tie never reaches the unit that holds its part ord today", () => {
    const ties = todayTies([{ rule: 'size', ords: [183, 184] }], unitOf, handed)
    expect(ties).toEqual([{ rule: 'size', ords: [192] }])
    // (laid: the heading at 0.975, the other unit at its own size; the tie caps nothing of that unit)
    const sizes = ties.filter((t): t is { rule: 'size'; ords: number[] } => t.rule === 'size')
    const at = new Map([
      [184, 1],
      [192, 0.975],
    ])
    const cap = new Map<number, number>()
    tieCaps(sizes, at, at, new Map([...at.keys()].map((o) => [o, 9])), () => 0.6, cap)
    expect(cap.has(184)).toBe(false)
  })
  it("leaves out of a table's cells a member no unit of today's joins", () => {
    expect(todayTies([{ rule: 'cells', cells: [[183], [184]] }], unitOf, handed)).toEqual([
      { rule: 'cells', cells: [192], spanning: [192] },
    ])
  })
  it("names by no ord of today's the follower, the row and a RowLine member that join none, and the rest by theirs", () => {
    const line = (ords: number[]) => ({ ords, align: 'c', rows: [], left: 0, right: 100 })
    const of = (follower: number, row: number, ords: number[]) =>
      todayMember(
        {
          ord: 183,
          follower: { id: follower, open: false, row: { page: 9, baseline: 500 }, first: { page: 9, x1: 300 } },
          rowStart: { row: { id: row, page: 9, baseline: 480, x0: 50, x1: 200, size: 9 }, carried: false },
          line: line(ords),
        } as unknown as FlowMember,
        192,
        unitOf,
      )
    const joined = of(175, 175, [183, 175])
    expect([joined.ord, joined.follower?.id, joined.rowStart?.row.id, joined.line?.ords]).toEqual([
      192,
      184,
      184,
      [192, 184],
    ])
    const none = of(184, 184, [183, 184])
    expect(none.ord).toBe(192)
    expect(noOrd(none.follower?.id)).toBe(true)
    expect(noOrd(none.rowStart?.row.id)).toBe(true)
    expect(none.line?.ords[0]).toBe(192)
    expect(noOrd(none.line?.ords[1])).toBe(true)
  })
  it("hands pieceCrops each member by its unit's ord of today's, the ledger's unit whose crops' piece indices it reads", () => {
    // (keyed by its part ord, a member's crops took the piece indices of the ledger's unit of that number: on a bundle whose every
    // ord is 3 more, 4,664 of the Google store's dumped units read other elements' indices, their lay alike)
    const m = { ord: 184, tokens: [{ crop: { crop: [0, 0, 1, 1] } }] } as unknown as FlowMember
    expect([...cropLays(new Map([[175, m]])).keys()]).toEqual([184])
  })
})

describe('I5 reads what is drawn past a slot: a crop by its ink (round B13, the coordinator ruling (b))', () => {
  // (a line of a member, its slot 72-300 on page 1, its last item a crop: an end mark whose ink the part states [290, 700, 296,
  // 706] on page 1, cut with crops.ts cropOfBox's antialiased margin, 0.4 pt a side across and 0.3 up and down. TeX set its ink
  // flush to the measure's end; a crop set where TeX set its ink stands its margin past the slot, a padded box past it, no ink)
  const R = { floor: 0.8, floorMin: 0.6 } as never
  const fresh = () => ({ laid: 0, lines: 0, I3: [], I4: [], I5: [], I5by: new Map(), below: [] })
  const member = (ink: [number, number, number, number, number, number], cropX0: number) => {
    const crop = [ink[1] - 0.4, ink[2] - 0.3, ink[3] + 0.4, ink[4] + 0.3]
    const w = crop[2]! - crop[0]!
    const x = cropX0
    const mark = { crop: { mode: 'crop', page: 1, crop, baseline: 700, k: -2 }, cw: w }
    return {
      pm: {
        ord: 5,
        state: 'laid',
        lines: [],
        slots: [],
        lay: {
          P: {},
          tokens: [mark],
          layout: {
            f: 10,
            scale: 1,
            lines: [
              {
                page: 1,
                x0: 72,
                x1: 300,
                baseline: 700,
                used: x + w - 72,
                items: [
                  { t: { s: 'Proof.', w100: 100 }, x: 72, w: 30 },
                  { t: { space: true }, x: 102, w: 3 },
                  { t: mark, x, w },
                ],
              },
            ],
          },
        },
      } as unknown as PageMember,
      inks: [ink],
    }
  }
  it('a crop whose ink ends at the slot passes though its padded box stands 0.4 pt past it', () => {
    // (the ink 294-300 set where TeX set it: its crop 293.6-300.4)
    const { pm, inks } = member([1, 294, 700, 300, 706, 700], 293.6)
    const inv = fresh()
    invariantsOf(1, [pm], R, inv, () => inks)
    expect(inv.I5).toEqual([])
    // (read by its padded box, as before: 0.40 pt past)
    const before = fresh()
    invariantsOf(1, [pm], R, before)
    expect([...before.I5by.values()][0]!.max).toBeCloseTo(0.4, 6)
  })
  it('a crop whose ink itself ends past the slot still fails, by its ink', () => {
    // (the same mark set 1 pt further right: its ink 295-301, 1 pt past the slot's 300)
    const { pm, inks } = member([1, 294, 700, 300, 706, 700], 294.6)
    const inv = fresh()
    invariantsOf(1, [pm], R, inv, () => inks)
    expect(inv.I5by.size).toBe(1)
    expect([...inv.I5by.values()][0]!.max).toBeCloseTo(1, 6)
  })
  it('a crop the part states no ink for is read by its box, as before', () => {
    const { pm } = member([1, 294, 700, 300, 706, 700], 293.6)
    const inv = fresh()
    invariantsOf(1, [pm], R, inv, () => [])
    expect([...inv.I5by.values()][0]!.max).toBeCloseTo(0.4, 6)
  })
})

describe('I3 reads each line from its first item to its last glyph’s ink (lane google-lay)', () => {
  // (two members on one baseline of page 1, as a running head's two halves: each a line of one text item at size 7)
  const R = { floor: 0.8, floorMin: 0.6 } as never
  const fresh = () => ({ laid: 0, lines: 0, I3: [], I4: [], I5: [], I5by: new Map(), below: [] })
  const face = { family: 'serif', weight: 400, style: 'normal' }
  const member = (
    ord: number,
    x0: number,
    x1: number,
    items: { s: string; x: number; w: number }[],
    measure?: unknown,
  ) =>
    ({
      ord,
      state: 'laid',
      lines: [],
      slots: [],
      lay: {
        P: measure ? { measure } : {},
        tokens: [],
        layout: {
          f: 7,
          scale: 1,
          state: { track: 0, trackLatin: 0 },
          lines: [
            {
              page: 1,
              x0,
              x1,
              baseline: 700,
              used: items.at(-1)!.x + items.at(-1)!.w - x0,
              items: items.map((it) => ({ t: { s: it.s, face, cls: 'cjk' }, x: it.x, w: it.w })),
            },
          ],
        },
      },
    }) as unknown as PageMember
  it('reads a line set flush right from its text, not from its measure widened into the paper beside it', () => {
    // (2610.22065v1 p3: the left head's text ends at 336.6; the right head's measure, widened to the left head's ink, starts at
    // 334.8, its text at 391.9)
    const left = member(1, 53.58, 416.22, [{ s: 'left', x: 53.58, w: 283 }])
    const right = member(2, 334.815, 558.2, [{ s: 'right', x: 391.92, w: 166.28 }])
    const inv = fresh()
    invariantsOf(1, [left, right], R, inv)
    expect(inv.I3).toEqual([])
    // (and a real overlap is still one)
    const over = member(3, 334.815, 558.2, [{ s: 'right', x: 330, w: 228.2 }])
    const two = fresh()
    invariantsOf(1, [left, over], R, two)
    expect(two.I3).toEqual(['ords 1 and 3: their lines overlap on p1'])
  })
  it('reads a line from its measure’s start where the breaker hangs an opening mark before it', () => {
    // (2610.21884v1 p28: a line ends at 159.9; the next member's line, its measure from 164.86, begins with an opening bracket
    // hung half an em before it, its box from 158.88: its ink is not where its box begins)
    const before = member(1, 85.04, 207.38, [{ s: 'end', x: 85.04, w: 74.83 }])
    const hung = member(2, 164.86, 526.96, [
      { s: String.fromCodePoint(0xff08), x: 158.88, w: 5.98 },
      { s: 'text', x: 171.06, w: 300 },
    ])
    const inv = fresh()
    invariantsOf(1, [before, hung], R, inv)
    expect(inv.I3).toEqual([])
  })
  it('reads a closing mark’s ink right from the served faces where the lay’s measure has none, not its advance', () => {
    // (2610.37818v1 p19: a cell ending in an ideographic full stop, its ink 0.35 em into its em, the next cell 2 pt after its
    // advance's end: the tap's table holds no ink right of it)
    const none = { w100: () => 100, ink100: () => ({ a: 70, d: 20 }), inkRight100: () => null }
    const served = { w100: () => 100, ink100: () => ({ a: 70, d: 20 }), inkRight100: () => 35 }
    const cell = member(1, 156.32, 173.08, [{ s: String.fromCodePoint(0x3002), x: 169.6, w: 6.53 }], none)
    const next = member(2, 174.03, 189.97, [{ s: 'next', x: 174.03, w: 15.94 }], none)
    const by = fresh()
    invariantsOf(1, [cell, next], R, by)
    expect(by.I3).toEqual(['ords 1 and 2: their lines overlap on p1'])
    const inv = fresh()
    invariantsOf(1, [cell, next], R, inv, undefined, served as never)
    expect(inv.I3).toEqual([])
  })
})
