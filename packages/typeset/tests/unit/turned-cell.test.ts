// A unit the original sets turned (a header's \rotatebox{90}{…}, a sideways float's caption and cells: Part.frames,
// docs/PDF-READER.md §18.108) is laid in its frame by the ordinary lay, as the translated TeX would set its translation in the
// same box before turning it, and stated on the page through the frame's turn: each line from its origin on the page along
// the turn (its items' `dir`, their places along it), lit in the frame (Laid.lit `dir`), which the reader draws as a figure
// text's turned run. The page's own flows are laid as they were.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import type { TextItem } from '../../src/emit/display.ts'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const idOf = (n: number) => n.toString(16).padStart(64, '0')
/** a header cell "Recall" set a quarter turned, stated in its frame (the page's (x, y) at (y, -x)): its line from 400 to 430
 *  along its run at 8, its baseline -150 (x 150 on the page), 20 of room before and after along it */
const cellInFrame = (ord: number, o: Partial<Placed> = {}): Placed => ({
  ord,
  kind: 'cell',
  text: idOf(ord + 1),
  plain: 'Recall',
  lead: 10,
  style: { role: 'serif', size: 8, design: 'NimbusRomNo9L-Regu' },
  align: 'l',
  cell: [0, 1, 1, 1],
  lines: [[1, 0, 400, 430, -150, -144.4, -151.6, 400, 430, 0, 8]],
  room: { below: 0, side: [380, 450] },
  ...o,
})
/** a level paragraph of the page */
const para: Placed = {
  ord: 9,
  kind: 'para',
  text: idOf(10),
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'l',
  lines: [[1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10]],
  room: { below: 20, next: 24 },
}
const part = (flows: Placed[][], frames?: Part['frames']): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows,
  ...(frames ? { frames } : {}),
})
const rows = (by: Record<number, string>): Rows => {
  const m = new Map<string, Row>()
  for (const [o, s] of Object.entries(by))
    m.set(idOf(Number(o) + 1), { id: idOf(Number(o) + 1), ok: true, by: 'test', content: [{ t: 'text', s }] })
  return { get: (k) => m.get(k), done: true }
}

describe('a unit set turned, laid in its frame', () => {
  it('lays a turned header cell in its frame and states its line on the page along the turn', () => {
    const p = layPage(
      part([], [{ dir: [0, 1], flows: [[cellInFrame(0)]] }]),
      rows({ 0: 'Rappel' }),
      rulesFor('fr'),
      metrics(),
    )
    const [m] = p.members
    expect(m).toMatchObject({ ord: 0, state: 'laid', frame: [0, 1] })
    // (laid in the frame from 400 along its line, its baseline -150; on the page from (150, 400) up the turn: x0 its origin's
    // x, y its origin's y, x1 - x0 its length along it)
    const [y, x0, x1, items] = m!.lines[0]!
    expect([y, x0]).toEqual([400, 150])
    expect(x1 - x0).toBeCloseTo(24, 6)
    expect((items as TextItem[]).map((it) => [it.s.trim(), it.x, it.dir])).toEqual([['Rappel', 150, [0, 1]]])
    // (lit in the frame, the turned run's: along it from 400, across it about its baseline -150)
    expect(m!.lit.dir).toEqual([0, 1])
    expect(m!.lit.left[0]![0]![0]).toBeCloseTo(400, 6)
    expect(m!.off & 1).toBe(1)
  })
  it('lays a turned caption of several lines as a paragraph in its frame, its lines one under the other there', () => {
    // (a sideways float's caption: two lines of 120 along its run in the frame, 12 apart, justified)
    const cap: Placed = {
      ord: 3,
      kind: 'caption',
      text: idOf(4),
      lead: 12,
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      align: 'j',
      lines: [
        [5, 0, 100, 220, -300, -293, -302, 100, 220, 0, 10],
        [5, 0, 100, 160, -312, -305, -314, 100, 220, 0, 10],
      ],
      room: { below: 30 },
    }
    const text = 'Les étapes du deuxième passage de la série'
    const p = layPage(
      { ...part([], [{ dir: [0, 1], flows: [[cap]] }]), page: 5 },
      rows({ 3: text }),
      rulesFor('fr'),
      metrics(),
    )
    const [m] = p.members
    expect(m).toMatchObject({ state: 'laid', frame: [0, 1] })
    expect(m!.lines.length).toBeGreaterThan(1)
    // (each line's origin on the page: x the frame's -y, the line's baseline turned; y the frame's x, its start along the run)
    const ys = m!.lines.map(([y]) => y)
    const xs = m!.lines.map(([, x0]) => x0)
    expect(ys.every((y) => y >= 100 - 1e-6)).toBe(true)
    expect(xs[0]).toBeCloseTo(300, 0)
    expect(xs[1]! - xs[0]!).toBeGreaterThan(0)
    expect(m!.lines.flatMap(([, , , it]) => it).every((it) => 'dir' in it && it.dir?.[1] === 1)).toBe(true)
  })
  it('lays a whole sideways page: its frame’s cells and caption with their tie, the page’s level flows as they were', () => {
    const cells = [cellInFrame(0), cellInFrame(1, { lines: [[1, 0, 400, 430, -170, -164.4, -171.6, 400, 430, 0, 8]] })]
    const level = layPage(part([[para]]), rows({ 9: 'Un paragraphe.' }), rulesFor('fr'), metrics())
    const p = layPage(
      part([[para]], [{ dir: [0, 1], flows: cells.map((c) => [c]), ties: [{ rule: 'cells', cells: [[0], [1]] }] }]),
      rows({ 0: 'Rappel', 1: 'Exactitude', 9: 'Un paragraphe.' }),
      rulesFor('fr'),
      metrics(),
    )
    expect(p.members.find((m) => m.ord === 9)).toEqual(level.members.find((m) => m.ord === 9))
    const turned = p.members.filter((m) => m.frame)
    expect(turned.map((m) => [m.ord, m.state])).toEqual([
      [0, 'laid'],
      [1, 'laid'],
    ])
    expect(turned.map((m) => m.lines[0]![1])).toEqual([150, 170])
  })
  it('waits with its page where a frame’s row has not come', () => {
    const p = layPage(
      part([[para]], [{ dir: [0, 1], flows: [[cellInFrame(0)]] }]),
      { ...rows({ 9: 'Un paragraphe.' }), done: false },
      rulesFor('fr'),
      metrics(),
    )
    expect(p.wait.rows).toEqual([idOf(1)])
    expect(p.members.every((m) => m.state === 'waiting')).toBe(true)
  })
})
