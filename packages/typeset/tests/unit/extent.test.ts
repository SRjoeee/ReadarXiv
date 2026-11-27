// Laid.extent (link previews, docs/PDF-READER.md §20; the design's L12: on the right pane a crop is what the translation draws):
// the union of everything a laid member draws on its page as the painter draws it, each run's ink box (its face's ink over and
// under the baseline at its size, raised where it is raised, from its x to its last advance or its ink's right, whichever is
// further; slanted where oblique) and each crop's placed box (its source moved and scaled onto its line, as paint.ts places it);
// a turned line's along its direction. A member not laid, or laid with nothing on the page, has none. Parts made by hand.
import type { El, Link, OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { extentOf } from '../../src/lay/extent.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Laid, Metrics, Rows } from '../../src/types.ts'

// (half a size an advance, ink 0.7 of the size over and 0.2 under, its right at its advance)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, (size * [...t].length) / 2],
}
type Box = [number, number, number, number]
const inside = (a: Box, b: Box) =>
  a[0] >= b[0] - 1e-9 && a[1] >= b[1] - 1e-9 && a[2] <= b[2] + 1e-9 && a[3] <= b[3] + 1e-9
/** what the painter draws of an upright item, as this test reads it apart from the code (paint.ts svgOf and placeOf) */
const drawnBox = (it: Item, y: number): Box => {
  if ('src' in it) {
    const [, x0, y0, x1, y1, base] = it.src
    return [it.x, y + (y0 - base) * it.k, it.x + (x1 - x0) * it.k, y + (y1 - base) * it.k]
  }
  const n = [...it.s].length
  const last = it.dx?.length ? it.dx[it.dx.length - 1]! + metrics.advance(it.face, it.size, [...it.s].at(-1)!) : 0
  const w = it.dx?.length ? last + (it.track ?? 0) : metrics.advance(it.face, it.size, it.s) + (it.track ?? 0) * n
  const r = it.rise ?? 0
  return [it.x, y + r - 0.2 * it.size, it.x + w, y + r + 0.7 * it.size]
}
const laid = (lines: Laid['lines'], o: Partial<Laid> = {}): Laid => ({
  ord: 0,
  page: 1,
  state: 'laid',
  off: 1,
  lines,
  lit: { left: [], right: [], own: [] },
  ...o,
})
const run = (s: string, x: number, o: Partial<Extract<Item, { face: string }>> = {}): Item => ({
  s,
  x,
  face: '400 100px "axt-nimbus-roman"',
  size: 10,
  ...o,
})

describe('extentOf: the union of what a laid member draws on its page', () => {
  it('a run: from its x to its advance, its ink over and under the baseline', () => {
    expect(extentOf(laid([[700, 72, 112, [run('Wort', 72)]]]), metrics)).toEqual([72, 698, 92, 707])
  })
  it('a raised run stands raised; a run of its own places (dx) ends at its last character’s advance; tracking widens it', () => {
    const e = extentOf(
      laid([
        [700, 72, 200, [run('a', 72, { rise: 3.6 })]],
        [688, 72, 200, [run('abc', 72, { dx: [0, 10, 30] }), run('xy', 120, { track: 1 })]],
      ]),
      metrics,
    )!
    expect(e[3]).toBeCloseTo(700 + 3.6 + 7, 9)
    expect(e[2]).toBeCloseTo(120 + 10 + 2, 9)
    // (dx: its last character 30 from x, its own advance 5 after it)
    const one = extentOf(laid([[688, 72, 200, [run('abc', 72, { dx: [0, 10, 30] })]]]), metrics)!
    expect(one[2]).toBeCloseTo(72 + 35, 9)
  })
  it('a crop: its source moved and scaled onto its line, as the painter places it', () => {
    const crop: Item = { s: 'x²', x: 100, src: [1, 150, 698, 170, 712, 700], k: 0.9, piece: '5' }
    expect(extentOf(laid([[690, 72, 200, [crop]]]), metrics)).toEqual([
      100,
      690 - 2 * 0.9,
      100 + 20 * 0.9,
      690 + 12 * 0.9,
    ])
  })
  it('an oblique run reaches right by its slant over the baseline', () => {
    const [, , x1] = extentOf(laid([[700, 72, 112, [run('Wort', 72, { skew: 1 })]]]), metrics)!
    expect(x1).toBeGreaterThan(92)
    expect(x1).toBeCloseTo(92 + 7 * Math.tan((12 * Math.PI) / 180), 6)
  })
  it('a turned line (dir): its runs along it from the line’s origin, their ink across it', () => {
    // (a quarter turn up: along the page's y, ink across to the left (over) and right (under) of the baseline at x 300)
    const e = extentOf(laid([[100, 300, 320, [run('Wort', 300, { dir: [0, 1] })]]]), metrics)!
    expect(e[0]).toBeCloseTo(300 - 7, 9)
    expect(e[2]).toBeCloseTo(300 + 2, 9)
    expect(e[1]).toBeCloseTo(100, 9)
    expect(e[3]).toBeCloseTo(120, 9)
  })
  it('a member not laid, or laid with no line on the page, has none', () => {
    expect(extentOf(laid([[700, 72, 112, [run('Wort', 72)]]], { state: 'none' }), metrics)).toBeUndefined()
    expect(extentOf(laid([]), metrics)).toBeUndefined()
  })
})

// ---------------------------------------------------------------- through layPage
const rules = rulesFor('de')
const id = 'a'.repeat(64)
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [
    [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
    [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
  ],
  room: { below: 20, next: 24 },
  ...o,
})
const part = (ms: Placed[], links?: Link[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [ms],
  ...(links ? { links } : {}),
})
const rowsOf = (list: Row[], done = false): Rows => {
  const by = new Map(list.map((r) => [r.id, r]))
  return { get: (k) => by.get(k), done }
}
const row = (content: OutPiece[], rid = id): Row => ({ id: rid, ok: true, by: 'test', content })
const cite: [string, El] = ['5', { kind: 'cite', ink: [[1, 150, 698, 170, 707, 700]] }]

describe('layPage states each laid member’s extent', () => {
  it('every item a laid member draws lies inside its extent, and the extent is their union', () => {
    const p = layPage(
      part([member({ els: [cite] })]),
      rowsOf([
        row([
          { t: 'text', s: 'Ein Satz mit ' },
          { t: 'el', id: '5' },
          { t: 'text', s: ' darin, der weiter und weiter läuft, bis die Zeile bricht und noch eine kommt.' },
        ]),
      ]),
      rules,
      metrics,
    )
    const [m] = p.members
    expect(m!.state).toBe('laid')
    expect(m!.lines.some(([, , , items]) => items.some((it) => 'src' in it))).toBe(true)
    const e = m!.extent!
    expect(e).toBeDefined()
    const boxes = m!.lines.flatMap(([y, , , items]) =>
      items.filter((it) => !('s' in it && /^\s*$/.test(it.s) && !('src' in it))).map((it) => drawnBox(it, y)),
    )
    for (const b of boxes) expect(inside(b, e)).toBe(true)
    // (each edge is some item's)
    expect(Math.min(...boxes.map((b) => b[0]))).toBeCloseTo(e[0], 9)
    expect(Math.min(...boxes.map((b) => b[1]))).toBeCloseTo(e[1], 9)
    expect(Math.max(...boxes.map((b) => b[2]))).toBeCloseTo(e[2], 9)
    expect(Math.max(...boxes.map((b) => b[3]))).toBeCloseTo(e[3], 9)
  })
  it('a member not laid has no extent (its rows ended without its own; a page that waits)', () => {
    expect(layPage(part([member()]), rowsOf([], true), rules, metrics).members[0]!.extent).toBeUndefined()
    expect(layPage(part([member()]), rowsOf([]), rules, metrics).members[0]!.extent).toBeUndefined()
  })
})
