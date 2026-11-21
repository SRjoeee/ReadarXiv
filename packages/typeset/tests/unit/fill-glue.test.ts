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
const runs = (m: Laid, j = 0) =>
  (m.lines[j]![3] as { s?: string; x: number; size?: number }[])
    .filter((r) => r.s)
    .map((r) => ({
      s: r.s!.trim(),
      x0: r.x,
      x1: r.x + (r.size ?? 10) * 0.5 * [...r.s!.trimEnd()].length,
      f: r.size ?? 10,
    }))
const near = (a: number, b: number) => Math.abs(a - b) < 0.01
/** TeX's \break (\penalty-\@M) as the part states it: a forced break (El.brk) whose source is that command alone (El.cmd,
 *  El.bare), TeX's first line ending there (El.ends); LaTeX's `\\`, stated a forced break with no command */
const BREAK = {
  kind: 'zero' as const,
  ink: [],
  cmd: 'break',
  bare: 1 as const,
  brk: 1 as const,
  ends: [0, 0] as [number, number],
}
const NEWLINE = { kind: 'space' as const, ink: [], brk: 1 as const, ends: [0, 0] as [number, number] }
/** a member of two lines at size 10 from 72 to 372 (baselines 700 and 688), its kind and alignment, its elements */
const twoLines = (kind: string, align: Placed['align'], els: Placed['els']): Placed => ({
  ...member(0, kind, align, els),
  lines: [
    [1, 0, 72, 372, 700, 707, 698, 72, 372, 0, 10],
    [1, 0, 72, 372, 688, 695, 686, 72, 372, 0, 10],
  ],
})

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

// The glue standing at a line's end (TeX's line_break: a break at glue takes that glue, a break at a penalty discards nothing
// before it). TeX's \break is a penalty: the \hfill before it stays on the line and takes its room. LaTeX's `\\` and \newline
// take the glue before them away first (latex.ltx's \@gnewline and \@centercr: `\unskip`), and \par its last glue, as a break
// the line chose at the glue does: those are discarded as before. What TeX sets, compiled (\showbox, our own text):
// `A \hfil B \hfill\break C` "glue set 178.75fill" (B after A at its spacing), with `\\` "glue set 89.37fil" (B mid-room).
describe('the infinite glue before a forced break: TeX’s \\break keeps it, LaTeX’s `\\\\` takes it away', () => {
  const abc = (brk: typeof BREAK | typeof NEWLINE, align: Placed['align'], fil = true) => {
    const els: NonNullable<Placed['els']> = [
      ['2', HFILL],
      ['3', brk],
    ]
    if (fil) els.unshift(['1', HFIL])
    return layOf(
      [twoLines('para', align, els)],
      rowsOf({
        0: [
          { t: 'text', s: 'links ' },
          ...(fil ? [{ t: 'el' as const, id: '1' }] : []),
          { t: 'text', s: ' Mitte ' },
          { t: 'el', id: '2' },
          { t: 'el', id: '3' },
          { t: 'text', s: ' rechts' },
        ],
      }),
    )[0]!
  }
  // (each run's extent at its drawn size; a space half of it: "links " is the first run and the space after it)
  const sp = (r: ReturnType<typeof runs>) => r[0]!.f / 2
  it('`A \\hfil B \\hfill\\break C`: the \\hfill of the higher order takes the room, B set after A at its natural spacing', () => {
    const m = abc(BREAK, 'j')
    const r = runs(m)
    expect(r.map((x) => x.s)).toEqual(['links', 'Mitte'])
    expect(near(r[0]!.x0, 72)).toBe(true)
    expect(near(r[1]!.x0, r[0]!.x1 + sp(r))).toBe(true)
    expect(near(runs(m, 1)[0]!.x0, 72)).toBe(true)
  })
  it('`A \\hfil B \\hfill\\\\ C`: \\\\ took the \\hfill away and set its own \\hfil, B mid-room as before', () => {
    const r = runs(abc(NEWLINE, 'j'))
    expect(r.map((x) => x.s)).toEqual(['links', 'Mitte'])
    const gap = r[1]!.x0 - (r[0]!.x1 + sp(r))
    expect(gap > 100).toBe(true)
    expect(near(gap, 372 - r[1]!.x1)).toBe(true)
  })
  it('a centred line ending `\\hfill\\break`: set flush left, the fill winning over \\centering’s own fil glue', () => {
    const m = abc(BREAK, 'c', false)
    const r = runs(m)
    expect(near(r[0]!.x0, 72)).toBe(true)
    expect(near(r[1]!.x0, r[0]!.x1 + sp(r))).toBe(true)
    // (the line after it centred)
    const n = runs(m, 1)
    expect(near(n[0]!.x0 - 72, 372 - n[0]!.x1)).toBe(true)
  })
  it('a centred line ending `\\hfill\\\\`: \\@centercr’s \\unskip took it away, the line centred as before', () => {
    const r = runs(abc(NEWLINE, 'c', false))
    expect(r[0]!.x0 > 72 + 100).toBe(true)
    expect(near(r[0]!.x0 - 72, 372 - r.at(-1)!.x1)).toBe(true)
  })
  it('a flush right line ending `\\hfill\\break`: set flush left; with `\\\\` flush right as before', () => {
    expect(near(runs(abc(BREAK, 'r', false))[0]!.x0, 72)).toBe(true)
    expect(near(runs(abc(NEWLINE, 'r', false)).at(-1)!.x1, 372)).toBe(true)
  })
  it('the unit’s last line ending `\\hfill` (\\par takes it): discarded, the centred line centred as before', () => {
    const [m] = layOf(
      [member(0, 'para', 'c', [['1', HFILL]])],
      rowsOf({
        0: [
          { t: 'text', s: 'links Mitte ' },
          { t: 'el', id: '1' },
        ],
      }),
    )
    const r = runs(m!)
    expect(r[0]!.x0 > 72 + 100).toBe(true)
    expect(near(r[0]!.x0 - 72, 372 - r.at(-1)!.x1)).toBe(true)
  })
  it('a break the line chose at an `\\hfill`: the glue discarded there, the centred line centred as before', () => {
    // (the word after the glue, 250 pt, fits no line with "aaaa bbbb cccc" before it: the line breaks at the glue)
    const long = 'x'.repeat(50)
    const [m] = layOf(
      [twoLines('para', 'c', [['1', HFILL]])],
      rowsOf({
        0: [
          { t: 'text', s: 'aaaa bbbb cccc ' },
          { t: 'el', id: '1' },
          { t: 'text', s: ` ${long}` },
        ],
      }),
    )
    const r = runs(m!)
    expect(r.map((x) => x.s).join(' ')).toBe('aaaa bbbb cccc')
    expect(r[0]!.x0 > 72 + 50).toBe(true)
    expect(near(r[0]!.x0 - 72, 372 - r.at(-1)!.x1)).toBe(true)
    expect(runs(m!, 1)[0]!.s).toBe(long)
  })
})

// The infinite glue before a unit's first item (TeX's: the glue at a paragraph's or a cell's start, before what it sets first)
// is that item's, whatever its kind: a text, a formula drawn as its crop from the original's ink, a script. Given only to a
// token of text, a cell `\hfill $x$ text` set its glue on the text after the formula, which the placement reads on a line's
// first item alone: the formula stood at the cell's left edge, the text after it.
describe('the infinite glue before a unit’s first item is that item’s, whatever its kind', () => {
  /** a formula drawn as its crop: its ink on A, 20 pt wide on the line's baseline */
  const MATH = {
    kind: 'math' as const,
    ink: [[1, 150, 700, 170, 707, 698]] as [number, number, number, number, number, number][],
  }
  /** each drawn item of a member's line: a crop (`#`) or a run's text, and its extent */
  const itemsOf = (m: Laid, j = 0) =>
    (m.lines[j]![3] as { s?: string; x: number; w?: number; src?: number[]; size?: number }[])
      .filter((it) => it.src || it.s?.trim())
      .map((it) =>
        it.src
          ? { s: '#', x0: it.x, x1: it.x + it.w! }
          : { s: it.s!.trim(), x0: it.x, x1: it.x + (it.size ?? 10) * 0.5 * [...it.s!.trimEnd()].length },
      )
  it('`\\hfill`, a formula, text: the formula and the text after it set at the line’s right end', () => {
    const [m] = layOf(
      [
        member(0, 'cell', 'l', [
          ['1', HFILL],
          ['2', MATH],
        ]),
      ],
      rowsOf({
        0: [
          { t: 'el', id: '1' },
          { t: 'el', id: '2' },
          { t: 'text', s: ' Token' },
        ],
      }),
    )
    const [crop, text] = itemsOf(m!)
    expect([crop!.s, text!.s]).toEqual(['#', 'Token'])
    expect(near(text!.x1, 372)).toBe(true)
    // (the formula right before the text, a space between them, far from the cell's left edge)
    expect(crop!.x0 > 72 + 200).toBe(true)
    expect(text!.x0 - crop!.x1 > 0 && text!.x0 - crop!.x1 < 10).toBe(true)
  })
  it('`\\hfill` and text: the text at the line’s right end, as before', () => {
    const [m] = layOf(
      [member(0, 'cell', 'l', [['1', HFILL]])],
      rowsOf({
        0: [
          { t: 'el', id: '1' },
          { t: 'text', s: ' rechts' },
        ],
      }),
    )
    const r = runs(m!)
    expect(r.map((x) => x.s)).toEqual(['rechts'])
    expect(near(r[0]!.x1, 372)).toBe(true)
  })
  it('a formula first, no glue: set at the line’s start, the text after it, as before', () => {
    const [m] = layOf(
      [member(0, 'cell', 'l', [['2', MATH]])],
      rowsOf({
        0: [
          { t: 'el', id: '2' },
          { t: 'text', s: ' rechts' },
        ],
      }),
    )
    const [crop, text] = itemsOf(m!)
    expect([crop!.s, text!.s]).toEqual(['#', 'rechts'])
    expect(crop!.x0 < 72 + 1).toBe(true)
    expect(text!.x1 < 372 - 100).toBe(true)
  })
})
