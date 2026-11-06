// S.names and S.nameLed on synthetic names: the branches the corpus never takes (every name of the 123 pairs had a word, fit
// its room and was hidden by its group; no counter's name, no small capitals among the names drawn on their own).
import { describe, expect, it } from 'vitest'
import type { Face } from '../../src/breaker/tokens.ts'
import { nameLed } from '../../src/shared/name-led.ts'
import {
  counterOf,
  type NameInput,
  type NameRow,
  nameChars,
  nameInTarget,
  nameRoom,
  nameRuns,
  nameScriptRuns,
  nameStyleOf,
  type PageChar,
  setName,
} from '../../src/shared/names.ts'
import type { Metrics } from '../../src/types.ts'

const row = (o: Partial<NameRow> = {}): NameRow => ({
  occurrence: 1,
  key: 'abstract',
  page: 1,
  x0: 100,
  baseline: 500,
  x1: 140,
  top: 508,
  bottom: 498,
  size: 10,
  font: 0,
  centred: false,
  capitals: false,
  unit: -1,
  glue: 0,
  counter: 0,
  cx0: 72,
  cx1: 300,
  ...o,
})
const chars = (text: string, x0: number, w = 5, size = 10, st: PageChar['st'] = { fam: 'serif' }): PageChar[] =>
  [...text].map((ch, i) => ({ ch, x0: x0 + i * w, x1: x0 + (i + 1) * w, yb: 500, size, st }))
const face = (o: Partial<Face> = {}): Face =>
  ({
    family: '"axt-x"',
    weight: 400,
    style: 'normal',
    oblique: 0,
    stand: 'serif',
    caps: false,
    size: 1,
    id: 'x',
    ids: ['x'],
    ...o,
  }) as Face
const metrics = (ready: Metrics['ready'] = () => true, w = 50): Metrics => ({
  ready,
  advance: (_f, size, s) => ((w * size) / 100) * [...s].length,
  ink: () => [0, 0, 0],
})
const input = (o: Partial<NameInput> = {}): NameInput => {
  const nm = o.nm ?? row()
  const mine = o.mine ?? chars('Abstract', 100)
  return {
    nm,
    mine,
    room: () => ({ left: nm.cx0, right: nm.cx1 }),
    to: 'de',
    labels: { abstract: 'Zusammenfassung', ref: 'Literatur' },
    serif: 'times',
    P: { cjk: false, cjkQuotes: false, floorMin: 0.6 },
    faceOf: () => face(),
    ownSmallCaps: () => false,
    metrics: metrics(),
    shown: true,
    ...o,
  }
}

describe('S.names: the readings around a name', () => {
  it('takes the characters within its box on its baseline, its counter at its row’s end, its room to its neighbours', () => {
    const nm = row({ x1: 160, counter: 12 })
    const page = [...chars('Appendix', 100), ...chars('A', 152), ...chars('x', 60), ...chars('y', 200)]
    const mine = nameChars(nm, page)
    expect(mine.map((c) => c.ch).join('')).toBe('AppendixA')
    expect(counterOf(mine, nm).map((c) => c.ch)).toEqual(['A'])
    expect(nameRoom(nm, page, mine)).toEqual({ left: 72, right: 197.5 })
  })
  it('reads faked small capitals where the class changed its case, its size the other letters’', () => {
    const cs = [...chars('R', 0, 5, 12), ...chars('EFERENCES', 5, 5, 9.6)]
    expect(nameStyleOf(cs, row({ capitals: true }))).toEqual({ size: 12, small: true })
    expect(nameStyleOf(cs, row())).toEqual({ size: 9.6, small: false })
    expect(nameStyleOf([], row({ size: 7 }))).toEqual({ size: 7, small: false })
  })
})

describe('S.names: the word', () => {
  it('is the target’s, in capitals where the class changed its case; none where it is the original’s or missing', () => {
    expect(nameInTarget(row({ capitals: true }), 'ABSTRACT', { abstract: 'Zusammenfassung' }, 'de')).toBe(
      'ZUSAMMENFASSUNG',
    )
    expect(nameInTarget(row(), 'Zusammen fassung', { abstract: 'Zusammenfassung' }, 'de')).toBeNull()
    expect(nameInTarget(row(), 'Abstract', { abstract: '' }, 'de')).toBeNull()
  })
  it('draws small capitals of a face without its own as runs of one case, and each script in its face', () => {
    expect(nameRuns('Index', face({ caps: true }), 'de', () => false).runs).toEqual([
      { s: 'I', k: 1 },
      { s: 'NDEX', k: 0.8 },
    ])
    expect(nameRuns('Index', face({ caps: true }), 'de', () => true).runs).toEqual([{ s: 'Index', k: 1 }])
    const d = nameScriptRuns(
      '\u9644\u5f55A',
      (c) => face({ family: c }),
      'zh',
      true,
      () => false,
    )
    expect(d.runs.map((r) => [r.s, r.face.family])).toEqual([
      ['\u9644\u5f55', 'cjk'],
      ['A', 'latin'],
    ])
  })
})

describe('S.names: the decision', () => {
  it('draws the word at its left edge, or centred about the original’s middle, shrunk into its room', () => {
    const got = setName(input())
    expect(got.rec).toMatchObject({ drawn: true, text: 'Zusammenfassung', size: 10, x: 100, w: 75 })
    const c = setName(input({ nm: row({ centred: true }), room: () => ({ left: 90, right: 150 }) }))
    // (its room 2 min(120 - 90, 150 - 120) = 60 for 75: k 0.8, its width 60 about 120)
    expect(c.rec).toMatchObject({ drawn: true, size: 8, x: 90, w: 60 })
  })
  it('sets its counter after the word, and hands a name that leads a unit to it', () => {
    const nm = row({ key: 'appendix', x1: 160, counter: 12 })
    const got = setName(
      input({ nm, mine: [...chars('Appendix', 100), ...chars('B', 152)], labels: { appendix: 'Anhang' } }),
    )
    expect(got.rec.text).toBe('Anhang B')
    const led = setName(input({ nm: row({ unit: 7 }) }))
    expect(led.rec).toMatchObject({ drawn: false, why: 'inline: its unit not drawn', text: 'Zusammenfassung', unit: 7 })
    expect(led.lead?.text).toBe('Zusammenfassung')
  })
  it('leaves the original’s: unread, no word, the same, unfit, not hidden, no served face; waits for a face', () => {
    expect(setName(input({ mine: [] })).rec.why).toBe('unread')
    expect(setName(input({ labels: {} })).rec.why).toBe('no word')
    expect(setName(input({ mine: chars('Zusammenfassung', 100) })).rec.why).toBe('same')
    expect(setName(input({ room: () => ({ left: 72, right: 120 }) })).rec).toMatchObject({
      why: 'unfit',
      w: 75,
      room: 20,
    })
    expect(setName(input({ shown: false })).rec.why).toBe('unhidden')
    expect(setName(input({ metrics: metrics(() => 'never') })).rec.why).toBe('served')
    expect(setName(input({ metrics: metrics(() => false) })).wait).toEqual([['400 100px "axt-x"', 'Zusamenfg']])
  })
  it('sets faked small capitals as small capitals, a CJK target’s at CJK_CAPS_SIZE', () => {
    const mine = [...chars('R', 100, 5, 12), ...chars('EFERENCES', 105, 4, 9.6)]
    const got = setName(input({ nm: row({ key: 'ref', capitals: true }), mine, P: { cjk: true, floorMin: 0.6 } }))
    expect(got.rec).toMatchObject({ drawn: true, text: 'Literatur', size: 12 })
  })
})

describe('S.nameLed', () => {
  const rec = {
    ...setName(input({ nm: row({ x1: 140 }) })).rec,
  }
  const block = { page: 1, B: [500], x0: 145, indent: 0, sizes: [10] }
  it('starts the line after a drawn name that leads no unit on it, the original’s separation kept', () => {
    expect(nameLed(block, [rec])).toBe(100 + 75 + 5)
  })
  it('takes none: centred, off its baseline or page, before the name, too far, outside its column, or not drawn', () => {
    expect(nameLed({ ...block, centred: true }, [rec])).toBeNull()
    expect(nameLed({ ...block, B: [503] }, [rec])).toBeNull()
    expect(nameLed({ ...block, page: 2 }, [rec])).toBeNull()
    expect(nameLed({ ...block, x0: 120 }, [rec])).toBeNull()
    expect(nameLed({ ...block, x0: 171 }, [rec])).toBeNull()
    expect(nameLed(block, [{ ...rec, column: [150, 300] }])).toBeNull()
    expect(nameLed(block, [{ ...rec, drawn: false }])).toBeNull()
    expect(nameLed(block, [{ ...rec, unit: 3 }])).toBeNull()
    expect(nameLed(undefined, [rec])).toBeNull()
  })
})
