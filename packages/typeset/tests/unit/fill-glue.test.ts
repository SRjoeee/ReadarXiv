// TeX's infinite glue (latex.ltx's \hfill, \hskip 0pt plus 1fill; \hfil, plus 1fil): the line's free room, all of it, at its place,
// so that what follows it stands at the line's right end, two of one order sharing the room alike (tex.web §656: the glue of the
// highest order with stretch takes all of it). Read as no glue, 2610.40576v1 p17's `Teacher segment \hfill tokens 0--4,096` was
// drawn as one run, the right part set against the heading. A line without it is laid as before.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Laid, Metrics, Rows } from '../../src/types.ts'

/** every character half its size wide: a text of n characters is 5n pt at the size 10 */
const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const idOf = (n: number) => n.toString(16).padStart(64, '0')
const HFILL = { kind: 'zero' as const, ink: [], cmd: 'hfill', bare: 1 as const }
const HFIL = { kind: 'zero' as const, ink: [], cmd: 'hfil', bare: 1 as const }
/** a member of one line at size 10 from 72 to 372 (baseline 700), its kind and alignment, its elements */
const member = (ord: number, kind: string, align: Placed['align'], els: Placed['els'] = []): Placed =>
  ({
    ord,
    kind,
    text: idOf(ord + 1),
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align,
    lines: [[1, 0, 72, 372, 700, 707, 698, 72, 372, 0, 10]],
    els,
    room: { below: 0, next: 300, side: [72, 372] },
  }) as Placed
const rowsOf = (by: Record<number, Extract<Row, { ok: true }>['content']>): Rows => {
  const m = new Map<string, Row>()
  for (const [o, content] of Object.entries(by))
    m.set(idOf(Number(o) + 1), { id: idOf(Number(o) + 1), ok: true, by: 'test', content } as Row)
  return { get: (k) => m.get(k), done: true }
}
const part = (ms: Placed[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: ms.map((m) => [m]),
})
const layOf = (ms: Placed[], rows: Rows) => layPage(part(ms), rows, rulesFor('de'), metrics()).members
/** each run of a member's first drawn line: its text and its extent at the size it is drawn at */
const runs = (m: Laid) =>
  (m.lines[0]![3] as { s?: string; x: number; size?: number }[])
    .filter((r) => r.s)
    .map((r) => ({ s: r.s!.trim(), x0: r.x, x1: r.x + (r.size ?? 10) * 0.5 * [...r.s!.trimEnd()].length }))
const near = (a: number, b: number) => Math.abs(a - b) < 0.01

describe('TeX’s infinite glue sets what follows it at the line’s right end', () => {
  it('`A \\hfill B` in a cell: A at the start, B ending at the right end', () => {
    const [m] = layOf(
      [member(0, 'cell', 'l', [['1', HFILL]])],
      rowsOf({
        0: [
          { t: 'text', s: 'Lehrerteil ' },
          { t: 'el', id: '1' },
          { t: 'text', s: ' Token 0-4096' },
        ],
      }),
    )
    const r = runs(m!)
    expect(near(r[0]!.x0, 72)).toBe(true)
    expect(r.at(-1)!.s.endsWith('0-4096')).toBe(true)
    expect(near(r.at(-1)!.x1, 372)).toBe(true)
  })
  it('two of them share the room alike: the middle text centred between the outer two', () => {
    const [m] = layOf(
      [
        member(0, 'cell', 'l', [
          ['1', HFILL],
          ['2', HFILL],
        ]),
      ],
      rowsOf({
        0: [
          { t: 'text', s: 'links ' },
          { t: 'el', id: '1' },
          { t: 'text', s: ' Mitte ' },
          { t: 'el', id: '2' },
          { t: 'text', s: ' rechts' },
        ],
      }),
    )
    const r = runs(m!)
    const mid = r.find((x) => x.s === 'Mitte')!
    expect(near(mid.x0 - r[0]!.x1, r.at(-1)!.x0 - mid.x1)).toBe(true)
    expect(near(r.at(-1)!.x1, 372)).toBe(true)
  })
  it('a fil glue shares the room with a centred line’s own two (\\centering’s), a fill glue takes it all', () => {
    const at = (el: typeof HFIL) => {
      const [m] = layOf(
        [member(0, 'cell', 'c', [['1', el]])],
        rowsOf({
          0: [
            { t: 'text', s: 'links ' },
            { t: 'el', id: '1' },
            { t: 'text', s: ' rechts' },
          ],
        }),
      )
      return runs(m!)
    }
    // (the text 60 pt of a 300 pt line: 240 of room, a third of it on each side and between under \hfil, all between under \hfill)
    const fil = at(HFIL)
    expect(near(fil[0]!.x0 - 72, 80)).toBe(true)
    expect(near(372 - fil.at(-1)!.x1, 80)).toBe(true)
    const fill = at(HFILL)
    expect(near(fill[0]!.x0, 72)).toBe(true)
    expect(near(fill.at(-1)!.x1, 372)).toBe(true)
  })
  it('drawn as laid where no space stands beside it: the text after it a run of its own at its place, not glued to the word before', () => {
    // (a reply may set the glue's placeholder between two words with no space: the word after it is drawn where the line sets it)
    const [m] = layOf(
      [member(0, 'cell', 'l', [['1', HFILL]])],
      rowsOf({
        0: [
          { t: 'text', s: 'links' },
          { t: 'el', id: '1' },
          { t: 'text', s: 'rechts' },
        ],
      }),
    )
    const r = runs(m!)
    expect(r.map((x) => x.s)).toEqual(['links', 'rechts'])
    expect(near(r[0]!.x0, 72)).toBe(true)
    expect(near(r[1]!.x1, 372)).toBe(true)
  })
  it('a heading without it is laid as before, at its natural spacing', () => {
    const [m] = layOf([member(0, 'heading', 'l')], rowsOf({ 0: [{ t: 'text', s: 'Lehrerteil Token' }] }))
    const r = runs(m!)
    expect(near(r[0]!.x0, 72)).toBe(true)
    expect(r.at(-1)!.x1 < 372 - 100).toBe(true)
  })
})
