// A unit the original sets turned (a header's \rotatebox{90}{…}, a sideways float's caption and cells: Part.frames,
// docs/PDF-READER.md §18.112) is laid in its frame by the ordinary lay, as the translated TeX would set its translation in the
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

describe('what is not text in a unit set turned, laid in its frame (docs/PDF-READER.md §18.112)', () => {
  /** 2608.12502v1's header cell "Before ($t_1$)" a quarter turned, in its frame: its formula from 448 to 460 on its line */
  const formula: [number, number, number, number, number, number] = [1, 448, -63.4, 460, -53, -60]
  const cell = cellInFrame(0, {
    plain: 'Before ()',
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    lines: [[1, 0, 400, 466, -60, -53, -63.4, 400, 466, 0, 10]],
    room: { below: 0, side: [380, 520] },
    els: [['1', { kind: 'other', ink: [formula], copy: 't1' }]],
  })
  const row: Row = {
    id: idOf(1),
    ok: true,
    by: 'test',
    content: [
      { t: 'text', s: 'Avant (' },
      { t: 'el', id: '1' },
      { t: 'text', s: ')' },
    ],
  }
  const one: Rows = { get: (k) => (k === row.id ? row : undefined), done: true }
  it('lays an element’s crop on its frame line as on a level one, its source and own ink in the frame, along the turn', () => {
    const p = layPage(part([], [{ dir: [0, 1], flows: [[cell]] }]), one, rulesFor('fr'), metrics())
    const [m] = p.members
    expect(m).toMatchObject({ state: 'laid', frame: [0, 1] })
    const crops = m!.lines.flatMap((l) => l[3]).filter((it) => 'src' in it)
    expect(crops).toHaveLength(1)
    // (its source the formula's box with the crop's margin, in the frame; its own ink the formula's box)
    const c = crops[0] as Extract<(typeof crops)[number], { src: unknown }>
    expect(c).toMatchObject({ dir: [0, 1], ink: [[448, -63.4, 460, -53]] })
    expect(c.src[0]).toBe(1)
    expect(c.src[5]).toBe(-60)
    expect(c.src[1]! <= 448 && c.src[2]! <= -63.4 && c.src[3]! >= 460 && c.src[4]! >= -53).toBe(true)
    // (its element's group off with its text's: its ink drawn again where the translation sets it)
    expect(m!.off & 3).toBe(3)
    // (the page's every piece's ink on the page: the formula's box turned onto it, (x, y) of the frame at (-y, x))
    expect(p.inks).toEqual([[1, 53, 448, 63.4, 460, 448]])
  })
  it('draws a turned caption’s label anew in the target’s word by its float’s type, on its frame line, along the turn', () => {
    // (2610.38776v1 p20's sideways "Figure 14:" before its text: the structural-names rule's, as a level caption's)
    const label: Placed['label'] = {
      kind: 'float',
      ink: [1, 400, -62, 460, -53, -60],
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      name: ['Figure', [1, 400, -62, 436, -53, -60]],
      num: ['14', [1, 442, -62, 454, -53, -60]],
      punct: [':', [1, 454, -62, 460, -53, -60]],
      line: 0,
      float: 'figure',
    }
    const cap: Placed = {
      ord: 0,
      kind: 'caption',
      text: idOf(1),
      lead: 12,
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      align: 'j',
      lines: [[1, 0, 466, 700, -60, -53, -62, 400, 700, 0, 10]],
      room: { below: 30 },
      label,
    }
    const p = layPage(
      part([], [{ dir: [0, 1], flows: [[cap]] }]),
      rows({ 0: 'Die Ergebnisse der Modelle.' }),
      rulesFor('de'),
      metrics(),
    )
    const [m] = p.members
    expect(m).toMatchObject({ state: 'laid', frame: [0, 1] })
    const items = m!.lines.flatMap((l) => l[3])
    expect(
      items
        .map((it) => ('face' in it ? it.s : ''))
        .join('')
        .startsWith('Abbildung 14:'),
    ).toBe(true)
    expect(items.every((it) => 'dir' in it && it.dir?.[1] === 1)).toBe(true)
    expect(m!.off & 4).toBe(4)
  })
})

describe('a link over what a unit set turned holds, laid in its frame (#673)', () => {
  /** a sideways caption whose reference "4.2" stands from 472 to 490 along its line, its baseline -60 (x 60 on the page) */
  const ref: [number, number, number, number, number, number] = [1, 472, -62, 490, -53, -60]
  const cap: Placed = {
    ord: 0,
    kind: 'caption',
    text: idOf(1),
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [[1, 0, 400, 502, -60, -53, -62, 400, 700, 0, 10]],
    room: { below: 30 },
    els: [['1', { kind: 'num', ink: [ref], copy: '4.2' }]],
  }
  const row: Row = {
    id: idOf(1),
    ok: true,
    by: 'test',
    content: [
      { t: 'text', s: 'Die Ergebnisse der langen Läufe (Abschnitt ' },
      { t: 'el', id: '1' },
      { t: 'text', s: ').' },
    ],
  }
  const one: Rows = { get: (k) => (k === row.id ? row : undefined), done: true }
  it('moves the link with the reference’s crop, onto the page through the frame’s turn', () => {
    // (the annotation on the page over the reference, (x, y) of the frame at (-y, x): x 52 to 63, y 471 to 491)
    const link = {
      box: [52, 471, 63, 491] as [number, number, number, number],
      to: { dest: '"sec.4.2"' },
      owner: [0, '1'] as [number, string],
    }
    const p = layPage({ ...part([], [{ dir: [0, 1], flows: [[cap]] }]), links: [link] }, one, rulesFor('de'), metrics())
    const [m] = p.members
    expect(m).toMatchObject({ state: 'laid', frame: [0, 1] })
    // (the crop where the translation sets it, on the page: its frame place turned by (0, 1))
    const [y, x0, , items] = m!.lines.find((l) => l[3].some((it) => 'src' in it))!
    const c = items.find((it) => 'src' in it) as Extract<(typeof items)[number], { src: unknown }>
    const fx = y + (c.x - x0),
      fy = -x0
    const along = [fx + (ref[1] - c.src[1]) * c.k, fx + (ref[3] - c.src[1]) * c.k]
    expect(p.links).toHaveLength(1)
    const [box, to, owner] = p.links[0]!
    expect([to, owner]).toEqual([{ dest: '"sec.4.2"' }, 0])
    // (on the page its y the crop's place along the frame, its x across it: no longer the annotation's box on A)
    expect(box).not.toEqual(link.box)
    expect(box[1]).toBeGreaterThanOrEqual(along[0]! - 1.5)
    expect(box[3]).toBeLessThanOrEqual(along[1]! + 1.5)
    expect(box[0]).toBeGreaterThanOrEqual(-(fy + (ref[4] - c.src[5]) * c.k) - 1.5)
  })
  it('keeps the link at its box on A where the caption stays the original’s', () => {
    const link = {
      box: [52, 471, 63, 491] as [number, number, number, number],
      to: { dest: '"sec.4.2"' },
      owner: [0, '1'] as [number, string],
    }
    const p = layPage(
      { ...part([], [{ dir: [0, 1], flows: [[cap]] }]), links: [link] },
      { get: () => undefined, done: true },
      rulesFor('de'),
      metrics(),
    )
    expect(p.links.map((l) => l[0])).toEqual([link.box])
  })
})
