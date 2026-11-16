// U.breaks (unit/breaks.ts statedBreaks): a forced break is the element the part states one (El.brk), ending the line TeX
// states (El.ends), whatever source its piece carries: an address of three lines, each ended by `\hfill\break\indent` (amsart's
// way of breaking an address, LaTeX's \break: `\penalty-\@M`), as the engine states it since BREAKS_TEX points \break.
import type { El, Part, Placed } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rowPieces } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'
import { clsOf, statedBreaks, type V0Piece } from '../../src/unit/breaks.ts'

const id = 'b'.repeat(64)
const line = (base: number, x1: number): Placed['lines'][number] => [
  1,
  0,
  130,
  x1,
  base,
  base + 7,
  base - 2,
  118,
  477,
  0,
  10,
]
/** the address: its three lines as TeX set them, each a pitch of 10 under the one before */
const lines = [line(700, 190), line(690, 260), line(680, 250)]
/** its elements as the part states them: \hfill (sets nothing on the line TeX ends after it), \break (a forced break: the line
 *  it ends, its room after it none), \indent */
const els: [string, El][] = [
  ['1', { kind: 'zero', ink: [], cmd: 'hfill', bare: 1 }],
  ['2', { kind: 'space', ink: [], cmd: 'break', bare: 1, brk: 1, ends: [0, 0] }],
  ['3', { kind: 'zero', ink: [], cmd: 'indent', bare: 1 }],
  ['5', { kind: 'zero', ink: [], cmd: 'hfill', bare: 1, same: '1' }],
  ['6', { kind: 'space', ink: [], cmd: 'break', bare: 1, brk: 1, ends: [1, 0], same: '2' }],
  ['7', { kind: 'zero', ink: [], cmd: 'indent', bare: 1, same: '3' }],
]
const member: Placed = {
  ord: 0,
  kind: 'author',
  text: id,
  lead: 10,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines,
  room: { below: 20, next: 24 },
  els,
}
const texts = ['Ada Quill ', 'Institute of Lighthouses ', '12 Harbour Road, Saltmarsh']
/** the unit's pieces with their sources, as its own content holds them (lay/read.ts sourcePieces) */
const sourced: V0Piece[] = [
  { t: 'text', s: texts[0]!, k: 0 },
  { t: 'ph', src: '\\hfill', k: 1 },
  { t: 'ph', src: '\\break', k: 2 },
  { t: 'ph', src: '\\indent', k: 3 },
  { t: 'text', s: texts[1]!, k: 4 },
  { t: 'ph', src: '\\hfill', k: 5 },
  { t: 'ph', src: '\\break', k: 6 },
  { t: 'ph', src: '\\indent', k: 7 },
  { t: 'text', s: texts[2]!, k: 8 },
]
const facts = { lines, els: new Map(els), spans: new Map(), pitch: 10 }

describe('a forced break is what the part states of its element (El.brk, El.ends), not a source', () => {
  it('pairs each \\break of an address with the line TeX ended at it, the source the unit holds', () => {
    const got = statedBreaks(facts, sourced, clsOf(sourced, facts.els))
    expect([...got]).toEqual([
      [2, { next: 1, room: 0, pitch: 10 }],
      [6, { next: 2, room: 0, pitch: 10 }],
    ])
  })
  it('pairs the same over the pieces the lay makes of a row (rowPieces: each source made of what the part states)', () => {
    const content = [
      { t: 'text' as const, s: texts[0]! },
      ...['1', '2', '3'].map((k) => ({ t: 'el' as const, id: k })),
      { t: 'text' as const, s: texts[1]! },
      ...['5', '6', '7'].map((k) => ({ t: 'el' as const, id: k })),
      { t: 'text' as const, s: texts[2]! },
    ]
    const pieces = rowPieces(member, content)
    expect([...statedBreaks(facts, pieces, clsOf(pieces, facts.els)).keys()]).toEqual([2, 6])
  })
  it('lays the address with each line where TeX set it: its start on the part’s line, its baseline TeX’s', () => {
    const part: Part = {
      format: 1,
      page: 1,
      paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
      flows: [[member]],
    }
    const row = {
      id,
      ok: true as const,
      by: 'test',
      content: [
        { t: 'text' as const, s: texts[0]! },
        ...['1', '2', '3'].map((k) => ({ t: 'el' as const, id: k })),
        { t: 'text' as const, s: texts[1]! },
        ...['5', '6', '7'].map((k) => ({ t: 'el' as const, id: k })),
        { t: 'text' as const, s: texts[2]! },
      ],
    }
    const rows: Rows = { get: (k) => (k === id ? row : undefined), done: true }
    const metrics: Metrics = {
      ready: () => true,
      advance: (_f, size, t) => (size * [...t].length) / 2,
      ink: () => [0.7, 0.2, 0],
    }
    const laid = layPage(part, rows, rulesFor('de'), metrics).members[0]!
    expect(laid.state).toBe('laid')
    const text = (items: (typeof laid.lines)[number][3]) =>
      items
        .map((it) => ('src' in it ? '' : it.s))
        .join('')
        .trim()
    expect(laid.lines.map(([y, x0, , items]) => [y, x0, text(items)])).toEqual([
      [700, 130, 'Ada Quill'],
      [690, 130, 'Institute of Lighthouses'],
      [680, 130, '12 Harbour Road, Saltmarsh'],
    ])
  })
})
