// The reader gate's paragraph points (tests/replay/paras-gate.ts) over hand-made pages: a point stated at a group (SpanAt.opens)
// whose group the reply dropped is anchored in the lab by the sentence start of its first word, read from the unit's source; the
// gate reads the page as drawn: red where the paragraph runs on, green where it opens on TeX's line, a point with no anchor
// counted apart. The fixture is paras.test.ts's: content of our own, the stand-in metrics.
import type { OutPiece, Part, Placed, Row, Unit } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Page, Rows } from '../../src/types.ts'
import { newParasGate, parasGate } from '../replay/paras-gate.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const rules = rulesFor('de')
const id = 'c'.repeat(64)
const lineAt = (base: number, x1: number): Placed['lines'][number] => [
  1,
  0,
  72,
  x1,
  base,
  base + 7,
  base - 2,
  72,
  300,
  0,
  10,
]
const SOURCE = 'First paragraph ends here. Second paragraph starts here and runs on to its end.'
const SECOND = SOURCE.indexOf('Second')
const member = (o: Partial<Placed & { paras: [number, number][] }> = {}): Placed =>
  ({
    ord: 0,
    kind: 'para',
    text: id,
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [lineAt(700, 300), lineAt(688, 150), lineAt(676, 300), lineAt(664, 200)],
    room: { below: 20, next: 24 },
    words: [...SOURCE.matchAll(/\S+/g)].map((w) => [
      w.index,
      w.index < 6 ? 0 : w.index < SECOND ? 1 : w.index < SOURCE.indexOf('and') ? 2 : 3,
      72,
    ]),
    ...o,
  }) as Placed
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const FIRST_DE = 'Der erste Absatz endet hier. '
const SECOND_DE = 'Der zweite Absatz beginnt hier und läuft bis zu seinem Ende weiter.'
const plain: OutPiece[] = [{ t: 'text', s: FIRST_DE + SECOND_DE }]
const cuts = { src: [SECOND], tr: [FIRST_DE.length] }
const row = (content: OutPiece[], sentences?: { src: number[]; tr: number[] }): Row => ({
  id,
  ok: true,
  by: 'test',
  content,
  ...(sentences ? { sentences } : {}),
})
const rowsOf = (r: Row): Rows => ({ get: (k) => (k === r.id ? r : undefined), done: true })

describe('the reader gate’s paragraph points (tests/replay/paras-gate.ts): what the page draws at TeX’s line', () => {
  // (the run-in title's group the reply dropped and the reading put back at the unit's end: anchored by the sentence start of
  // its first word, read from the unit's source in the lab; laid opening on TeX's line only where the part states that word)
  const spans: Placed['spans'] = [['1', { cmd: 'textbf', opens: 2 }]]
  const dropped: OutPiece[] = [...plain, { t: 'span', id: '1', content: [] }]
  const unit: Unit = {
    id,
    kind: 'para',
    content: [
      { t: 'text', s: SOURCE.slice(0, SECOND) },
      { t: 'span', open: '\\textbf{', close: '}', content: [{ t: 'text', s: 'Second' }] },
      { t: 'text', s: SOURCE.slice(SECOND + 'Second'.length) },
    ],
  } as Unit
  const gate = (m: Placed) => {
    const g = newParasGate()
    const r = rowsOf(row(dropped, cuts))
    parasGate(g, 'test-de', 1, layPage(part(m), r, rules, metrics), part(m), r, new Map([[id, unit]]))
    return g
  }
  it('fails a point whose anchor the row carries and whose paragraph the page runs on', () => {
    const g = gate(member({ spans }))
    expect([...g.anchor]).toEqual([['sentence', 1]])
    expect(g.opened).toBe(0)
    expect(g.off.length).toBe(1)
  })
  it('passes it where the lay opens it on TeX’s line (the part states the first word: Placed.paras)', () => {
    const g = gate(member({ spans, paras: [[SECOND, 2]] }))
    expect(g.opened).toBe(1)
    expect(g.off).toEqual([])
  })
  it('counts apart a point the row gives no anchor (no sentences): it flows on, no fail', () => {
    const g = newParasGate()
    const m = member({ spans })
    const r = rowsOf(row(dropped))
    parasGate(g, 'test-de', 1, layPage(part(m), r, rules, metrics), part(m), r, new Map([[id, unit]]))
    expect([...g.anchor]).toEqual([['none: no sentences', 1]])
    expect(g.off).toEqual([])
  })
})

describe('the gate’s pass: the point’s first word starts a line of the member (the coordinator’s ruling of 2026-11-13)', () => {
  // (a page drawn by hand: the member laid at its own pitch, the second paragraph on a line of its own one point under TeX's
  // baseline; then the same paragraph run on after the first)
  const spans: Placed['spans'] = [['1', { cmd: 'textbf', opens: 2 }]]
  const held: OutPiece[] = [
    { t: 'text', s: FIRST_DE },
    { t: 'span', id: '1', content: [{ t: 'text', s: 'Der zweite' }] },
    { t: 'text', s: SECOND_DE.slice('Der zweite'.length) },
  ]
  const item = (s: string) => ({ s, x: 72, face: 'serif' as never, size: 10 })
  const pageOf = (lines: [number, string][]): Page => ({
    page: 1,
    wait: { rows: [], faces: [] },
    members: [
      {
        ord: 0,
        page: 1,
        state: 'laid',
        off: 1,
        lines: lines.map(([y, s]) => [y, 72, 72 + s.length * 5, [item(s)]]),
        lit: { left: [], right: [], own: [] },
      },
    ],
    links: [],
  })
  const gateOf = (page: Page) => {
    const g = newParasGate()
    const m = member({ spans })
    parasGate(g, 'test-de', 1, page, part(m), rowsOf(row(held, cuts)), new Map())
    return g
  }
  it('passes a paragraph that starts a line of its own at another baseline than TeX’s, counted apart from TeX’s line', () => {
    const g = gateOf(
      pageOf([
        [700, 'Der erste Absatz endet hier.'],
        [675, 'Der zweite Absatz beginnt hier und'],
        [663, 'läuft bis zu seinem Ende weiter.'],
      ]),
    )
    expect(g.opened).toBe(1)
    expect(g.onTexLine).toBe(0)
    expect(g.off).toEqual([])
  })
  it('counts it on TeX’s line where its line stands on TeX’s baseline', () => {
    const g = gateOf(
      pageOf([
        [700, 'Der erste Absatz endet hier.'],
        [676, 'Der zweite Absatz beginnt hier und'],
      ]),
    )
    expect([g.opened, g.onTexLine]).toEqual([1, 1])
  })
  it('fails it run on, its first word starting no line of the member', () => {
    const g = gateOf(
      pageOf([
        [700, 'Der erste Absatz endet hier. Der zweite'],
        [688, 'Absatz beginnt hier und läuft bis zu'],
      ]),
    )
    expect(g.opened).toBe(0)
    expect(g.off.length).toBe(1)
    expect([...g.offBy]).toEqual([['run on', 1]])
  })
})
