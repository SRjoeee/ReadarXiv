// A figure text set on its anchor by its ink, as every line the breaker sets is (a cell's, a paragraph's): a full-width mark's
// blank half at a line's edge is none of its ink (B.break leadOf, hangOf), so that a right-aligned label ending with a closing
// mark ends its ink where its original ends, as a right-aligned cell with the same text does. Before, S.figures set it by its
// advance: 1810.04805v2 p16's "Masked LM" in Chinese ended its ink 3.49 pt short of its original's end at 6.97 (the parity's ink reading,
// 9744efab3), and 31 more figure texts of the parity's pages stood off their original's middle by a quarter em.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Laid, Metrics, Rows } from '../../src/types.ts'

// (an ideograph or a full-width mark a whole em, any other character half of one)
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/u
const widthOf = (size: number, t: string) => [...t].reduce((a, c) => a + (CJK.test(c) ? size : size / 2), 0)
const metrics: Metrics = { ready: () => true, advance: (_f, size, t) => widthOf(size, t), ink: () => [0.7, 0.2, 0] }
const idOf = (n: number) => n.toString(16).padStart(64, '0')
const rowsOf = (by: Record<number, string>): Rows => {
  const m = new Map<string, Row>()
  for (const [n, s] of Object.entries(by))
    m.set(idOf(Number(n)), { id: idOf(Number(n)), ok: true, by: 'test', content: [{ t: 'text', s }] })
  return { get: (k) => m.get(k), done: true }
}
const part = (ms: Placed[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: ms.map((m) => [m]),
})
/** a right-aligned original "Masked LM" over 250-300 at 10 on baseline `y`, 50 pt of paper before it, 20 after */
const original = (ord: number, kind: Placed['kind'], y: number, o: Partial<Placed> = {}): Placed => ({
  ord,
  kind,
  text: idOf(ord + 1),
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'r',
  lines: [[1, 0, 250, 300, y, y + 7, y - 2, 72, 500, 0, 10]],
  room: { below: 0, next: 300, side: [200, 320] },
  ...o,
})
/** a laid line's ink along it: its first drawn character's box start and its last's end, an opening mark's first half and a
 *  closing mark's second none of it (the parity's inkedLine) */
const inkOf = (laid: Laid): [number, number] => {
  const boxes = laid.lines[0]![3].flatMap((it: Item) => {
    if (!('face' in it)) return []
    let x = it.x
    return [...it.s].flatMap((c, k) => {
      const x0 = it.dx ? it.x + it.dx[k]! : x
      x = x0 + widthOf(it.size, c)
      return /\s/u.test(c) ? [] : [{ c, x0, x1: x, size: it.size }]
    })
  })
  const a = boxes[0]!,
    z = boxes.at(-1)!
  return [a.x0 + (a.c === '\uff08' ? 0.5 * a.size : 0), z.x1 - (z.c === '\uff09' ? 0.5 * z.size : 0)]
}

describe('a figure text set by its ink, as a cell’s line is', () => {
  it('ends a right-aligned figure text’s ink where its original ends, as a right-aligned cell’s (1810.04805v2 p16 t476)', () => {
    const figure = original(0, 'figure', 400, { plain: 'Masked LM' })
    const cell = original(1, 'cell', 600)
    const page = layPage(part([figure, cell]), rowsOf({ 1: '（蒙面LM）', 2: '（蒙面LM）' }), rulesFor('zh'), metrics)
    const [f, c] = [0, 1].map((ord) => page.members.find((m) => m.ord === ord)!)
    expect([f!.state, c!.state]).toEqual(['laid', 'laid'])
    // (where each starts is its own: the cell's line sets the breaker's CJK-Latin autospace, a figure text none, as today's)
    expect(inkOf(f!)[1]).toBeCloseTo(300, 6)
    expect(inkOf(c!)[1]).toBeCloseTo(300, 6)
  })
  it('centres a centred figure text’s ink on its original’s middle, as a centred cell’s', () => {
    // ("time (s)" in Chinese, its closing mark's second half blank; by its advance its ink stood a quarter em left of the middle)
    const figure = original(0, 'figure', 400, { align: 'c', plain: 'Time (s)' })
    const cell = original(1, 'cell', 600, { align: 'c' })
    const page = layPage(part([figure, cell]), rowsOf({ 1: '时间（秒）', 2: '时间（秒）' }), rulesFor('zh'), metrics)
    for (const ord of [0, 1]) {
      const m = page.members.find((x) => x.ord === ord)!
      expect(m.state).toBe('laid')
      const [a, z] = inkOf(m)
      expect((a + z) / 2).toBeCloseTo(275, 6)
    }
  })
  it('ends a right-aligned figure text’s ink where its original ends in an alphabet’s target, its curly quote proportional', () => {
    // (Codex on #634, 4520557062: a Latin target's rules class curly quotes with the CJK marks (cjkQuotes), but its faces set
    // them in its Latin face, proportional, no blank half: hung as a full-width mark's, the label ended half an em, 5 pt at 10,
    // past its original's end)
    const figure = original(0, 'figure', 400, { plain: 'Masked LM' })
    const page = layPage(part([figure]), rowsOf({ 1: 'Maskiertes „LM”' }), rulesFor('de'), metrics)
    const f = page.members.find((m) => m.ord === 0)!
    expect(f.state).toBe('laid')
    expect(inkOf(f)[1]).toBeCloseTo(300, 6)
  })
})
