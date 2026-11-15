// A trail's and an end mark's crop has an extent the breaker reads (docs/PDF-READER.md §18.79; the display design's F42): lay/adapt.ts
// builds each crop's segment box on the crop's own baseline, and B.break's lineExtent (cropExtent) reads its extent over and under
// that baseline, so TeX's \lineskip rule opens a pair of lines whose boxes come nearer than \lineskiplimit, a tall mark's too. Before,
// the box stated no baseline: the extent was NaN, the line had none, and the rule never opened its pair. Parts made by hand: a
// paragraph of two lines at 10 pt, pitch 12, on a 228 pt measure (72-300), its text's ink 7 over and 2 under the baseline; the mark
// on its last line reaches 11 over that line's baseline (taller than its line), so its top stands 1 pt under the line above's
// baseline, past that line's 2 pt of descent: TeX sets the pair \lineskip (1 pt) apart, foot to top, 2 + 11 + 1 = 14, the second
// line 2 lower.
import type { El, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { lineExtent } from '../../src/breaker/break.ts'
import { adapt, type AdaptInput } from '../../src/lay/adapt.ts'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

// (the host's metrics in PDF units at the size asked: half a size an advance, ink 0.7 of the size over and 0.2 under)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: (_f, size) => [0.7 * size, 0.2 * size, 0],
}
const rules = rulesFor('de')
// (no page fill: the lines as the fit lays them)
const still: typeof rules = { ...rules, set: { ...rules.set, adaptiveFill: false } as unknown as typeof rules.set }
const id = 'a'.repeat(64)
/** a tall end mark at the measure's end on the last line (baseline 688): 11 over it */
const TALL: [number, number, number, number, number, number] = [1, 293, 688, 300, 699, 688]
/** a tall trail right after the last glyph (a class's raised mark): 11 over the line's baseline */
const TRAIL: [number, number, number, number, number, number] = [1, 201, 690, 205, 699, 688]
const endMark: [string, El] = ['~$', { kind: 'other', copy: '', ink: [TALL], trail: 1, end: 1 }]
const trail: [string, El] = ['~', { kind: 'other', copy: '*', ink: [TRAIL], trail: 1 }]
const member = (els: [string, El][], o: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind: 'theorem',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
    [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
  ],
  room: { below: 0, next: 300, runs: [[1, 200, 30]], sep: 12 },
  els,
  ...o,
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  // (TeX's \lineskip 1 pt, \lineskiplimit 0, the standard classes')
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] }, lineskip: [1, 0] },
  flows: [[m]],
})
const rowOf = (content: (Row & { ok: true })['content']): Rows => {
  const r: Row = { id, ok: true, by: 'test', content }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
const words = (n: number) => 'wort '.repeat(n).trim()
const lay = (m: Placed, content: (Row & { ok: true })['content']): Laid =>
  layPage(part(m), rowOf(content), still, metrics).members[0]!
const measure = { w100: () => 50, ink100: () => ({ a: 70, d: 20 }), inkRight100: () => null }
const input = (m: Placed): AdaptInput => ({
  m,
  before: null,
  after: null,
  afterOpen: false,
  R: rules.set,
  measure,
  patterns: {},
  rulesOf: () => undefined,
  lineskip: [1, 0],
  reading: {
    tokens: [{ s: 'wort', face: 'serif', w100: 200 }] as never,
    labelDrawn: null,
    lead: false,
    cjkSize: undefined,
    referenced: new Set(),
    own: true,
  } as never,
})
/** the crop adapt builds for the member's trail (k -1) or end mark (k -2), from its tokens */
const cropOf = (m: Placed, k: number) => {
  const got = adapt(input(m))
  if (!('member' in got)) throw new Error(got.stop)
  const t = (got.member.tokens as unknown as { crop?: { k?: number } }[]).find((x) => x.crop?.k === k)
  if (!t) throw new Error(`no crop ${k}`)
  return t
}

describe('B.break: a trail mark’s and an end mark’s crop has an extent (§18.79)', () => {
  it('B.break reads the extent of the crops lay/adapt.ts builds for an end mark and a trail, a mark taller than its line', () => {
    for (const [m, k] of [
      [member([endMark]), -2],
      [member([trail], { kind: 'author' }), -1],
    ] as const) {
      const t = cropOf(m, k)
      const e = lineExtent({ items: [{ t: { s: 'wort', face: 'serif' } }, { t }] } as never, 10, 1, measure as never)
      expect(Number.isFinite(e.a)).toBe(true)
      expect(Number.isFinite(e.d)).toBe(true)
      // (the mark's 11 over the baseline, not the text's 7)
      expect(e.a).toBeCloseTo(11, 6)
    }
  })
  it('opens the pair of lines an end mark taller than its line comes too near, as TeX’s \\lineskip rule does', () => {
    const laid = lay(member([endMark]), [{ t: 'text', s: words(13) }])
    expect(laid.lines.length).toBe(2)
    // (the first line at 700; the second at 700 - (2 + 11 + 1) = 686, not its slot's 688)
    expect(laid.lines[0]![0]).toBeCloseTo(700, 6)
    expect(laid.lines[1]![0]).toBeCloseTo(686, 6)
  })
  it('opens the pair a trail taller than its line comes too near', () => {
    const laid = lay(member([trail], { kind: 'author' }), [{ t: 'text', s: words(13) }])
    expect(laid.lines.length).toBe(2)
    expect(laid.lines[1]![0]).toBeCloseTo(686, 6)
  })
  it('opens nothing where the mark stays inside the line’s room (the control: green at the base too)', () => {
    const low: [string, El] = ['~$', { kind: 'other', copy: '', ink: [[1, 293, 688, 300, 695, 688]], trail: 1, end: 1 }]
    const laid = lay(member([low]), [{ t: 'text', s: words(13) }])
    expect(laid.lines[1]![0]).toBeCloseTo(688, 6)
  })
})
