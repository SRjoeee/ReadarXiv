// A run-in heading and the paragraph it opens are ONE TeX paragraph (\@sect's own test: an after-skip of zero or less sets the
// title in the paragraph's first line, Room.gap `runin`), so TeX sets every line of it at one leading. Where the title fills
// TeX's line, the paragraph's text starts on TeX's next line and the two are two units: the title's one line stays on TeX's
// baseline, and the text's translation, spread by the page's fill, opens one TeX pitch under it and goes on at its own wider
// leading (docs/PDF-READER.md §18.11, "A paragraph's leading is the whole paragraph's"; the head pass reads the unit over it
// as a paragraph of its own, and "a paragraph of one line has no leading at all"). Red until the gap under a run-in title's
// line follows the leading of the paragraph it opens. Content of our own.
import type { Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

// (a CJK character half the size wide: 45 a line of 228 pt at 10 pt)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const zh = rulesFor('zh')
const st = { role: 'serif' as const, size: 10, design: 'NimbusRomNo9L-Regu' }
const bold = { ...st, bold: 1 as const, design: 'NimbusRomNo9L-Medi' }
const ids = ['h', 'p', 'q'].map((c) => c.repeat(64))
const row = (id: string, n: number): Row => ({
  id,
  ok: true,
  by: 'test',
  content: [{ t: 'text', s: String.fromCodePoint(0x6587).repeat(n) }],
})
const at = (y: number, x0 = 72, x1 = 300): Placed['lines'][number] => [1, 0, x0, x1, y, y + 7, y - 2, 72, 300, 0, 10]

/** a heading whose title fills TeX's line at 700 (its gap under it `gap`), the paragraph under it on TeX's next lines at a
 *  pitch of 12, nine of them, its translation `chars` characters long (six lines of 45: spread by the fill); a third paragraph
 *  under it, four lines, as long as its own */
const page = (gap: NonNullable<Placed['room']>['gap'], chars = 260, skip = 0) => {
  const P = 12
  const flow: Placed[] = [
    {
      ord: 0,
      kind: 'heading',
      text: ids[0]!,
      lead: P,
      style: bold,
      align: 'j',
      lines: [at(700, 72, 300)],
      room: { below: 3, next: P, gap, side: [72, 300] },
    },
    {
      ord: 1,
      kind: 'para',
      text: ids[1]!,
      lead: P,
      style: st,
      align: 'j',
      lines: Array.from({ length: 9 }, (_, j) => at(700 - skip - P * (j + 1))),
      room: { below: 5, next: P, gap: ['parskip', 0, 0] },
    },
    {
      ord: 2,
      kind: 'para',
      text: ids[2]!,
      lead: P,
      style: st,
      align: 'j',
      lines: Array.from({ length: 4 }, (_, j) => at(700 - skip - P * (j + 10), j === 0 ? 84 : 72)),
      room: { below: 200, next: 212 },
    },
  ]
  const by = new Map([row(ids[0]!, 14), row(ids[1]!, chars), row(ids[2]!, 170)].map((r) => [r.id, r]))
  const rows: Rows = { get: (k) => by.get(k), done: true }
  const part = { format: 1, page: 1, paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } }, flows: [flow] }
  const [h, p] = layPage(part as never, rows, zh, metrics).members
  const ys = p!.lines.map(([y]) => y)
  return { head: h!.lines.at(-1)![0], first: ys[0]!, own: ys[0]! - ys[1]!, lines: ys.length }
}

describe('a run-in title alone on its line and its text: one TeX paragraph, one leading (§18.11)', () => {
  it('keeps the title on TeX’s baseline and spreads its text past TeX’s pitch (the case’s premise)', () => {
    const m = page(['runin', 10, 0])
    expect(m.head).toBe(700)
    expect(m.lines).toBe(6)
    expect(m.own).toBeGreaterThan(12 * 1.2)
  })
  it('sets the text’s first line under the title at the text’s own leading, not at TeX’s pitch', () => {
    // (at the line: the title at 700, the text's first line at 688, TeX's pitch, its next lines its own wider leading)
    const m = page(['runin', 10, 0])
    expect(m.head - m.first).toBeCloseTo(m.own, 1)
  })
  it('leaves a heading set on lines of its own as TeX set it: its after-skip is a gap of its own, not its text’s leading', () => {
    // (the control: an after-skip over zero, Room.gap `afterskip`: the heading is a paragraph of its own, B′ keeps the text's
    // first line on TeX's baseline)
    const m = page(['afterskip', 0, 0])
    expect(m.first).toBe(688)
  })
  it('leaves the text where TeX set something between it and the title (a skip past its pitch): the title ended its own paragraph', () => {
    // (a list's or a theorem's skip of 8 pt between: the text's first line 20 pt under the title, not TeX's next line)
    const m = page(['runin', 10, 0], 260, 8)
    expect(m.first).toBe(680)
  })
})
