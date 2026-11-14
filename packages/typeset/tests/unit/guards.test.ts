// The other side of the typesetter's conditions that no paper of the lays and no test took (the rule ledger's one-outcome rows,
// design-reduction 3c and the removal rule of 2026-11-14): each fed here, on content of our own, the input that takes it, a
// valid one by the function's contract. A condition taken away turns its case red.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { familyOfFonts } from '../../src/breaker/font-names.ts'
import { breakPoints } from '../../src/breaker/hyph.ts'
import { glueOf } from '../../src/breaker/tokens.ts'
import { groupsOff } from '../../src/emit/groups.ts'
import { toLastLines } from '../../src/fit/last-lines.ts'
import type { FitBlock, FitParams, LaidLine, Layout } from '../../src/fit/types.ts'
import { adapt, type AdaptInput, rowLinesOf } from '../../src/lay/adapt.ts'
import { layPage } from '../../src/lay/entry.ts'
import { ledBy } from '../../src/lay/lead.ts'
import type { UnitLay } from '../../src/lay/page.ts'
import type { PaperReading } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import { overFollower } from '../../src/shared/over-follower.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const id = 'a'.repeat(64)
type Line = Placed['lines'][number]
/** a line of a member: page 1, column 0, x0 to x1 on baseline `base` at 10 pt, its measure 72 to 300 */
const line = (base: number, x0 = 72, x1 = 300, mx0 = 72): Line => [
  1,
  0,
  x0,
  x1,
  base,
  base + 7,
  base - 2,
  mx0,
  300,
  0,
  10,
]
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [line(700), line(688)],
  room: { below: 20, next: 24 },
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
  return { get: (k) => by.get(k), done: true }
}
const row = (s: string, of = id): Row => ({ id: of, ok: true, by: 'test', content: [{ t: 'text', s }] })
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}

describe('breaker/font-names: a name no table holds, its class guessed from its words (MATH_WORD)', () => {
  it('reads a math, symbol or dingbat face by its word, and leaves it out of the paper’s body family', () => {
    // (TeX Live's Libertinus Math through unicode-math, MathType's Euclid Symbol, a dingbat face: no row of DESIGNS holds them;
    // read as the serif `other`, each would outweigh the Times that sets the body)
    for (const name of ['LibertinusMath-Regular', 'EuclidSymbol', 'ITCZapfDingbats'])
      expect(familyOfFonts([name, 'NimbusRomNo9L-Regu'], [10, 5])).toBe('times')
  })
})

describe('breaker/tokens: explicit glue by TeX’s own definitions (KERNS, SKIPS)', () => {
  it('sets \\enspace as LaTeX’s kern of half an em and \\qquad as its skip of two, a line breaking at the skip alone', () => {
    // (latex.ltx: \def\enspace{\kern.5em }, \def\qquad{\hskip2em\relax})
    expect(glueOf('\\enspace')).toEqual({ em: 0.5, brk: false })
    expect(glueOf('\\qquad')).toEqual({ em: 2, brk: true })
  })
})

describe('emit/groups: a display’s hover id inside the displays’ range (NAME_ID_FROM)', () => {
  const display = { k: 0, display: true, ink: [[1, 72, 600, 300, 620, 605]], kept: false }
  const idOf = (ord: number) => {
    const s = groupsOff({ page: 1, ord, els: [display], label: null }).shown[0]
    return s?.kind === 'display' ? s.id : undefined
  }
  it('gives a member’s display no id past the range a unit may hold: it lights with its member', () => {
    // (a member's ord is any integer from 0, Placed.ord; the displays' ids run from 2^29, 2^7 a unit, under the cells' 2^30)
    expect(idOf(2 ** 22 - 1)).toBe(2 ** 30 - 2 ** 7)
    expect(idOf(2 ** 22)).toBeNull()
  })
})

describe('fit/last-lines: a heading set in fewer lines than the original’s, moved onto its last ones', () => {
  const block = (B: number[]) => ({ B, centred: false }) as unknown as FitBlock
  const laid = (baseline: number, x0 = 72): LaidLine => ({
    block: 0,
    page: 1,
    x0,
    x1: 200,
    baseline,
    items: [],
    from: 0,
  })
  const slot = (baseline: number, x0 = 72) => ({ block: 0, baseline, x0, x1: 300, pitch: 12 })
  it('is never moved up: the next line of its column nearer under it than its size less the drop', () => {
    // (two lines of the original at 700 and 688, the heading laid in one at 700, set at 14 pt; the next line 1 pt under its
    // last baseline, as a negative skip after a heading sets it: its room-under correction, 13, outweighs its drop, 12)
    const one = [laid(700)]
    toLastLines(one, [block([700, 688])], 1, 14, () => [slot(700), slot(688)])
    expect(one[0]!.baseline).toBe(700)
    // (with room under it, it goes down onto the last baseline)
    const moved = [laid(700)]
    toLastLines(moved, [block([700, 688])], 20, 14, () => [slot(700), slot(688)])
    expect(moved[0]!.baseline).toBe(688)
  })
  it('stays where a line after the first would start elsewhere than on the row it lands on', () => {
    // (three lines of the original, the last one TeX set at another measure (a hanging indent's, from 90); the heading laid in
    // two at 700 and 688 from 72: its second line would land on the last row, which starts at 90)
    const two = [laid(700), laid(688)]
    toLastLines(two, [block([700, 688, 676])], 20, 10, () => [slot(700), slot(688), slot(676, 90)])
    expect(two.map((l) => l.baseline)).toEqual([700, 688])
    const even = [laid(700), laid(688)]
    toLastLines(even, [block([700, 688, 676])], 20, 10, () => [slot(700), slot(688), slot(676)])
    expect(even.map((l) => l.baseline)).toEqual([688, 676])
  })
})

describe('fit/walk: a state past TeX’s text block bottom stays one (depthOf, §18.37)', () => {
  it('keeps a past state that set its lines above the bottom past it, by the least depth', () => {
    // (a target's knob order is any order of the four knobs (data/rules/types.ts `order`): here the borrow comes in no knob
    // before the size. TeX's bottom 13 pt under the paragraph's last line, nothing near under it: the fit, borrowing nothing,
    // fails at full size on two lines; the state past the bottom borrows the room under them, and its third line stands 1 pt
    // above the bottom, at no depth under it. It stays a state past the bottom (the state it is laid at, as the cross-lay
    // check reads it), its depth the least, 0.01; the page states no depth past the bottom, none of its lines being there)
    const r = rulesFor('de')
    const set = { ...r.set, order: ['track', 'shrink'], adaptiveFill: false } as unknown as typeof r.set
    const rules = { ...r, set }
    const m = member({ room: { below: 0, next: 300, runs: [[1, 200, 13]], sep: 12 } })
    const lays: UnitLay[] = []
    const [laid] = layPage(part([[m]]), rowsOf([row(`${'wort '.repeat(18)}xxx`)]), rules, metrics, { lays }).members
    expect(laid!.state).toBe('laid')
    expect(laid!.lines.map(([y]) => y)).toEqual([700, 688, 676])
    expect(laid!.fit!.over).toBeUndefined()
    expect(lays.find((u) => u.ord === 0)!.at!.over).toBe(0.01)
  })
})

describe('lay/adapt rowLinesOf: the members TeX set on one line, run on as one paragraph', () => {
  const name = (o: Partial<Placed>) => member({ kind: 'author', align: 'c', room: { below: 20 }, ...o })
  it('runs a member on from the one before only where its first line is on the row that one ends (onRow)', () => {
    // (Placed.join states the member opens on the line the one before it ends; a member before it in the flow that ends on
    // another line, 3 pt off, is no row of it)
    const a = name({ ord: 0, lines: [line(700, 200, 260)] })
    const on = name({ ord: 1, text: 'b'.repeat(64), join: [5], lines: [line(700, 265, 330)] })
    expect([...rowLinesOf([[a, on]]).keys()]).toEqual([0, 1])
    const off = { ...on, lines: [line(703, 265, 330)] }
    expect(rowLinesOf([[a, off]]).size).toBe(0)
  })
  it('starts a row at a member’s label that stands on its first line, a label that states no line read by its baseline', () => {
    // (Label.line is absent where the label stands on none of its member's lines; one that does is read by its ink's baseline)
    const label = (base: number) =>
      ({
        kind: 'mark',
        ink: [1, 190, base - 2, 196, base + 7, base],
        style: { role: 'serif', size: 10 },
        text: id,
      }) as unknown as Placed['label']
    const b = name({ ord: 1, text: 'b'.repeat(64), join: [5], lines: [line(700, 265, 330)] })
    const rowsOf2 = (lb: Placed['label']) =>
      rowLinesOf([[name({ ord: 0, label: lb, lines: [line(700, 200, 260)] }), b]]).get(0)!.rows
    expect(rowsOf2(label(700))[0]!.x0).toBe(190)
    expect(rowsOf2(label(712))[0]!.x0).toBe(200)
  })
})

describe('lay/flow: the members TeX centred over several lines, each laid on from where the one before ended (layLine)', () => {
  it('opens a member on the baseline the line before it there was laid at, where that is not TeX’s', () => {
    // (two names of one centred paragraph, TeX's lines 5 pt and 15 pt apart (a \\[-5pt] after the first): laid at TeX's pitch,
    // 10, the first name's second line stands a pitch under its first, never closer than 0.7 of it (B.slots), 5 pt off TeX's
    // second line; the second name, opening on that line, opens on the baseline the first name's line was laid at)
    const l = (base: number, x0: number, x1: number): Line => [1, 0, x0, x1, base, base + 7, base - 2, 72, 540, 0, 10]
    const name = (o: Partial<Placed>) =>
      member({ kind: 'author', align: 'c', room: { below: 20, side: [72, 540] }, ...o })
    const a = name({ ord: 0, lines: [l(700, 100, 500), l(695, 200, 300)] })
    const b = name({ ord: 1, text: 'b'.repeat(64), join: [5], lines: [l(695, 305, 400), l(680, 250, 350)] })
    const rows = rowsOf([row('wort '.repeat(24).trim()), row('kurz', 'b'.repeat(64))])
    const [la, lb] = layPage(part([[a, b]]), rows, rulesFor('de'), metrics).members
    expect([la!.state, lb!.state]).toEqual(['laid', 'laid'])
    expect(la!.lines.map(([y]) => y)).toEqual([700, 690])
    expect(lb!.lines[0]![0]).toBe(690)
  })
})

describe('lay/adapt: a label drawn anew, hung beside its text only where TeX hung it (the label at the measure’s start)', () => {
  /** a caption of three lines from 95.61, its label "Figure 1." from `lx` drawn anew, its measure from `mx` */
  const caption = (lx: number, mx: number): Placed => ({
    ...member({ kind: 'caption', lines: [95.61, 95.61, 95.61].map((x, j) => line(700 - 12 * j, x, 300, mx)) }),
    label: {
      kind: 'float',
      float: 'figure',
      ink: [1, lx, 698, 91.67, 707, 700],
      style: { role: 'serif', size: 10 },
      line: 0,
      name: ['Figure', [1, lx, 698, lx + 32, 707, 700]],
      num: ['1', [1, 82.18, 698, 88.52, 707, 700]],
      punct: ['.', [1, 88.52, 698, 91.67, 707, 700]],
    },
  })
  const input = (m: Placed): AdaptInput => ({
    m,
    before: null,
    after: null,
    afterOpen: false,
    R: rulesFor('de').set,
    measure: { w100: () => 50, ink100: () => ({ a: 70, d: 20 }), inkRight100: () => null },
    patterns: {},
    rulesOf: () => undefined,
    lineskip: [1, 0],
    reading: { tokens: [], labelDrawn: 'Abbildung 1.', lead: false, cjkSize: undefined, referenced: new Set() },
  })
  const firstBlock = (m: Placed) => {
    const got = adapt(input(m))
    if (!('member' in got)) throw new Error(got.stop)
    return got.member.blocks[0]!
  }
  it('hangs the text where the label stands at the measure’s start; widens the first line to a label set inside it', () => {
    expect(firstBlock(caption(47, 47)).hang).toBe(47)
    // (the label 7 pt into the measure: TeX's hang sets a label at the measure's start, so this one is no hang; its first
    // line begins at the label)
    const inside = firstBlock(caption(47, 40))
    expect(inside.hang).toBeUndefined()
    expect(inside.rects[0]![1]).toBe(47)
  })
})

describe('lay/lead: a name bound to the member after it, the joint TeX set between them (jointOf)', () => {
  it('takes the member’s label for the joint only where it stands on the name’s line', () => {
    // (amsthm's "Proof." bound to its text; the text's own label after the name: on the name's baseline it is the joint, drawn
    // anew with the name; a label raised 3 pt over it (Label.ink: a raised mark on its own baseline) is no joint)
    const name = member({ kind: 'name', lines: [line(700, 72, 100)] })
    const led = (base: number) =>
      member({
        ord: 1,
        text: 'b'.repeat(64),
        lines: [line(700, 112, 300)],
        label: {
          kind: 'number',
          ink: [1, 102, base - 2, 110, base + 7, base],
          style: { role: 'serif', size: 10 },
          num: ['1', [1, 102, base - 2, 110, base + 7, base]],
        },
      })
    const word = { text: 'Beweis', st: {} }
    const designs = { serif: 'times', sans: 'helvetica', mono: 'courier' } as PaperReading['designs']
    expect(ledBy(name, led(700), word, designs)!.lead.drawn).toBe('Beweis1')
    expect(ledBy(name, led(703), word, designs)!.lead.drawn).toBe('Beweis')
  })
})

describe('shared/over-follower: a unit run on over its follower’s first line only from that line (overFollower)', () => {
  it('runs nothing on where its last block’s one line is not the shared row', () => {
    const block = (B0: number) =>
      ({
        page: 1,
        rects: [[1, 72, B0 - 2, 200, B0 + 7]],
        B: [B0],
        centred: false,
        x0: 72,
        x1: 200,
      }) as unknown as FitBlock
    const layout = { lines: [], clipped: true, scale: 1 } as unknown as Layout
    const cut = () => ({ layout: { ...layout, clipped: false } as Layout, tokens: [] })
    const at = (B0: number) =>
      overFollower(
        {
          kind: 'para',
          follower: { id: 5, open: true, row: { page: 1, baseline: 700 }, first: { page: 1, x1: 400 } },
          kept: false,
          pages: [1],
          layout,
          tokens: [],
          blocks: [block(B0)],
          s: 10,
          P: {} as FitParams,
        },
        cut,
      )
    expect(at(700)?.id).toBe(5)
    // (its last line 12 pt over the follower's shared row: not that row)
    expect(at(712)).toBeNull()
  })
})

describe('breaker/hyph: Russian by Khmelev’s syllable rules (russian)', () => {
  it('breaks no word of three letters or fewer, and leaves no one letter before a break', () => {
    expect(breakPoints('дом', 'ru', null, undefined)).toEqual([])
    // (аэропорт: its two first vowels' rule, g-gl, offers a break after the first letter, which the fewest two refuse)
    const points = breakPoints('аэропорт', 'ru', null, undefined)
    expect(points.length).toBeGreaterThan(0)
    expect(points.every((i) => i >= 2 && i <= 6)).toBe(true)
  })
})
