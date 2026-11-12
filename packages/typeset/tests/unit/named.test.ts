// One person, one translation (docs/PDF-READER.md §19.15): where the names toggle shows the block, a unit that names a person of
// the block elsewhere is laid with the block's translation of the name, cut from the block member's row between the elements
// that bound it there; with the toggle off, or where that row cannot be cut exactly, the unit's own row as it came. The replies
// are shaped as each wire reads them back: Microsoft's markers (the elements where they stood), the tags wire Google and Chrome's
// built-in translator answer (an element moved across a name, a group wrapped round an element, one dropped or doubled).
import type { OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { cutRow, namedRows } from '../../src/lay/named.ts'
import { waitOf } from '../../src/lay/wait.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const E = 'e'.repeat(64) // a unit naming the person elsewhere (a footnote)
const V = 'f'.repeat(64) // its variant
const B = 'b'.repeat(64) // the block's names line
const S = 'c'.repeat(64) // a unit that is a name, whole
const T = (s: string): OutPiece => ({ t: 'text', s })
const EL = (id: string): OutPiece => ({ t: 'el', id })
const ok = (id: string, content: OutPiece[], sentences?: { src: number[]; tr: number[] }): Row => ({
  id,
  ok: true,
  by: 'microsoft:test',
  content,
  ...(sentences ? { sentences } : {}),
})
const rowsOf = (list: Row[], done = false): Rows => {
  const by = new Map(list.map((r) => [r.id, r]))
  return { get: (k) => by.get(k), done }
}
const SHOWN = new Set<string>()
const OFF = new Set(['affiliation', 'author', 'inknames'])
// (2610.22065v1's names line: "Wenshuai Yao[1], Wenyong Zhou[3],", its marks the cuts, every stretch but the last lettered)
const paper = (named: NonNullable<Part['paper']['named']>, extra: NonNullable<Part['paper']['splits']> = []) => ({
  paper: {
    faces: { fonts: [] },
    named,
    persons: [[B, 'inknames', 1]] as NonNullable<Part['paper']['persons']>,
    splits: [[B, ['1', '3'], [], [0, 1]], ...extra] as NonNullable<Part['paper']['splits']>,
  },
})
// ("Corresponding author: Wenyong Zhou. Thanks." and its variant "Corresponding author: [n0]. Thanks.")
const variantPart = paper([[E, V, [['n0', 0, 12, 22]]]])
const rowE = ok(E, [T('通讯作者：文永周。谢谢。')], { src: [36], tr: [9] })
const rowV = ok(V, [T('通讯作者：'), EL('n0'), T('。谢谢。')], { src: [25], tr: [7] })
const block = ok(B, [T('姚文帅'), EL('1'), T('，周文勇'), EL('3'), T('，')])

describe('a unit naming a person of the block, in a variant (its names elements)', () => {
  it('is laid with the block’s translation of the name, its sentences where they were in the unit and as drawn', () => {
    const got = namedRows(variantPart, rowsOf([rowE, rowV, block]), SHOWN).get(E)
    expect(got).toEqual({
      id: E,
      ok: true,
      by: 'microsoft:test',
      content: [T('通讯作者：周文勇。谢谢。')],
      // (the second sentence: at 25 in the variant, its name one character; 36 in the unit, the name's 12. As drawn: 7 with
      // the element one character, 9 with the name's three)
      sentences: { src: [36], tr: [9] },
    })
  })
  it('is the unit’s own row, the same row, with the names toggle off', () => {
    expect(namedRows(variantPart, rowsOf([rowE, rowV, block]), OFF).get(E)).toBe(rowE)
  })
  it('is the unit’s own row where the variant’s row failed, or where every row is in and the variant’s or the block’s is not', () => {
    const refused: Row = { id: V, ok: false, why: { kind: 'refused' } }
    expect(namedRows(variantPart, rowsOf([rowE, refused, block]), SHOWN).get(E)).toBe(rowE)
    expect(namedRows(variantPart, rowsOf([rowE, block], true), SHOWN).get(E)).toBe(rowE)
    expect(namedRows(variantPart, rowsOf([rowE, rowV], true), SHOWN).get(E)).toBe(rowE)
  })
  it('passes every other unit’s row through as it is', () => {
    const other = ok('a'.repeat(64), [T('x')])
    expect(namedRows(variantPart, rowsOf([other]), SHOWN).get(other.id)).toBe(other)
  })
  it('keeps the name inside the group the variant’s row holds it in', () => {
    const v = ok(V, [{ t: 'span', id: '1', content: [EL('n0')] }, T('，等。')])
    const got = namedRows(variantPart, rowsOf([rowE, v, block]), SHOWN).get(E)
    expect(got?.ok && got.content).toEqual([{ t: 'span', id: '1', content: [T('周文勇')] }, T('，等。')])
  })
})

describe('the block’s translation of a name, as each wire returns its elements', () => {
  const resolved = (b: Row) => {
    const got = namedRows(variantPart, rowsOf([rowE, rowV, b]), SHOWN).get(E)
    return got === rowE ? null : got?.ok ? (got.content[0] as { s: string }).s : undefined
  }
  it('cuts Microsoft’s markers where they stood (2610.22065v1’s names line)', () => {
    expect(resolved(block)).toBe('通讯作者：周文勇。谢谢。')
  })
  // (each reply below is the tags wire's own reading, packages/translate tests/names-wire.test.ts)
  it('cuts through a group the tags wire moved an element into (the group of the name before it)', () => {
    const b = ok(B, [{ t: 'span', id: '0', content: [T('姚文帅'), EL('1')] }, T('，周文勇'), EL('3'), T('，')])
    expect(resolved(b)).toBe('通讯作者：周文勇。谢谢。')
  })
  it('cuts nothing where the tags wire moved the elements before the names: the unit’s own row, never a neighbour’s name', () => {
    const moved = ok(B, [EL('1'), T('姚文帅，'), EL('3'), T('周文勇，')])
    expect(resolved(moved)).toBeNull()
  })
  it('cuts nothing where an element came back dropped, doubled or out of order', () => {
    expect(resolved(ok(B, [T('姚文帅'), T('，周文勇'), EL('3'), T('，')]))).toBeNull()
    expect(resolved(ok(B, [T('姚文帅'), EL('1'), T('，'), EL('1'), T('周文勇'), EL('3'), T('，')]))).toBeNull()
    expect(resolved(ok(B, [T('姚文帅'), EL('3'), T('，周文勇'), EL('1'), T('，')]))).toBeNull()
  })
  it('cuts nothing from a stretch that came back with no letter, or from the block’s failed row', () => {
    expect(resolved(ok(B, [T('姚文帅'), EL('1'), T('，'), EL('3'), T('，')]))).toBeNull()
    expect(resolved({ id: B, ok: false, why: { kind: 'unavailable' } })).toBeNull()
  })
  it('reads a tie as a space, as the block draws it, and an element that sets nothing as nothing', () => {
    expect(
      cutRow([T('Junbo'), EL('2'), T('Zhang'), EL('1'), T(', X'), EL('7'), T(' Y')], [B, ['1'], ['2'], [0, 1]]),
    ).toEqual(['Junbo Zhang', ', X Y'])
  })
})

describe('a unit that is a name, whole, in its own row (2604.14228v3’s “Zhiqiang Shen (”)', () => {
  const part = {
    paper: {
      faces: { fonts: [] },
      named: [[S, '', [[0, 0]]]] as NonNullable<Part['paper']['named']>,
      persons: [[B, 'author', 0]] as NonNullable<Part['paper']['persons']>,
      splits: [
        [B, [], [], [0]],
        [S, [], [], [0]],
      ] as NonNullable<Part['paper']['splits']>,
    },
  }
  const own = ok(S, [T('沈志强（')], { src: [], tr: [] })
  const anchor = ok(B, [{ t: 'span', id: '0', content: [T('申志强')] }])
  it('is its own row with the name’s letters the block’s, the translator’s bracket kept', () => {
    expect(namedRows(part, rowsOf([own, anchor]), SHOWN).get(S)).toEqual({ ...own, content: [T('申志强（')] })
  })
  it('keeps its own translation of the name where the block’s cannot be cut, and with the toggle off', () => {
    expect(namedRows(part, rowsOf([own, { id: B, ok: false, why: { kind: 'refused' } }]), SHOWN).get(S)).toBe(own)
    expect(namedRows(part, rowsOf([own, anchor]), new Set(['author'])).get(S)).toBe(own)
  })
  it('keeps its own translation of one name and takes the block’s of another (each name alone)', () => {
    const two = {
      paper: {
        ...part.paper,
        named: [
          [
            S,
            '',
            [
              [0, 0],
              [1, 1],
            ],
          ],
        ] as NonNullable<Part['paper']['named']>,
        persons: [
          [B, 'author', 0],
          ['d'.repeat(64), 'author', 0],
        ] as NonNullable<Part['paper']['persons']>,
        splits: [
          [B, [], [], [0]],
          ['d'.repeat(64), [], [], [0]],
          [S, ['5'], [], [0, 1]],
        ] as NonNullable<Part['paper']['splits']>,
      },
    }
    const own2 = ok(S, [T('沈志强'), EL('5'), T('，李四')])
    const got = namedRows(
      two,
      rowsOf([own2, anchor, { id: 'd'.repeat(64), ok: false, why: { kind: 'refused' } }]),
      SHOWN,
    )
    expect(got.get(S)).toEqual({ ...own2, content: [T('申志强'), EL('5'), T('，李四')] })
  })
})

describe('what a page holding such a unit waits for', () => {
  const placed = (kind: string, text: string): Placed => ({
    ord: 0,
    kind,
    text,
    lead: 12,
    style: { role: 'serif', size: 10 },
    align: 'j',
    lines: [[1, 0, 72, 300, 700, 707, 698, 72, 300, 0]],
    room: { below: 0 },
  })
  const part = (kind: string): Pick<Part, 'flows' | 'paper'> => ({ ...variantPart, flows: [[placed(kind, E)]] })
  it('waits for the variant’s row and the block’s with the names shown, while rows may come', () => {
    expect(waitOf(part('footnote'), rowsOf([rowE]), SHOWN)).toEqual([V, B])
    expect(waitOf(part('footnote'), rowsOf([rowE, rowV, block]), SHOWN)).toEqual([])
  })
  it('waits for the unit’s own row alone with the names toggle off, and for nothing once every row is in', () => {
    expect(waitOf(part('footnote'), rowsOf([]), OFF)).toEqual([E])
    expect(waitOf(part('footnote'), rowsOf([], true), SHOWN)).toEqual([])
  })
  it('waits for nothing of a member of a kind left the original’s (a self-citation with the references off)', () => {
    expect(waitOf(part('reference'), rowsOf([]), new Set(['reference']))).toEqual([])
  })
  // (the law the composer keeps a commit by, docs/PDF-READER.md §15: a page laid once nothing it waits for is missing is final
  // until the toggles change, so a lay may read as still to come only a row its page waits for; 2611.03953v2-zh p1, staging
  // round B14: the correspondence footnote's variant late, the names off, the footnote committed as the original's, and drawn
  // with its own row after the names were turned on and off again)
  it('reads the unit’s own row with the names toggle off whatever the variant’s, as it waits for nothing more', () => {
    for (const given of [[rowE], [rowE, rowV], [rowE, block]]) {
      expect(waitOf(part('footnote'), rowsOf(given), OFF)).toEqual([])
      expect(namedRows(variantPart, rowsOf(given), OFF).get(E)).toBe(rowE)
    }
  })
  it('reads, while rows may come, no row its page does not wait for, the names shown or not', () => {
    for (const leave of [SHOWN, OFF]) {
      const read = new Set<string>()
      const given = rowsOf([rowE])
      const recorded: Rows = {
        get: (k) => {
          read.add(k)
          return given.get(k)
        },
        done: false,
      }
      namedRows(variantPart, recorded, leave).get(E)
      const waits = new Set([E, ...waitOf(part('footnote'), rowsOf([]), leave)])
      expect([...read].filter((k) => !waits.has(k))).toEqual([])
    }
  })
})

describe('layPage over such a unit', () => {
  const metrics: Metrics = {
    ready: () => true,
    advance: (_f, size, t) => (size * [...t].length) / 2,
    ink: () => [0.7, 0.2, 0],
  }
  const m: Placed = {
    ord: 0,
    kind: 'footnote',
    text: E,
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [[1, 0, 72, 400, 700, 707, 698, 72, 400, 0, 10]],
    room: { below: 20, next: 24 },
  }
  const part: Part = {
    format: 1,
    page: 1,
    ...{ paper: { ...variantPart.paper, faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } } },
    flows: [[m]],
  }
  const rows = rowsOf([
    ok(E, [T('Korrespondenz: W. Zhou.')]),
    ok(V, [T('Korrespondenz: '), EL('n0'), T('.')]),
    ok(B, [T('Wenshuai Yao'), EL('1'), T(', Wenyong Zhou'), EL('3'), T(',')]),
  ])
  const text = (leave: string[]) =>
    layPage(part, rows, rulesFor('de', { leave }), metrics)
      .members[0]!.lines.flatMap((l) => l[3].map((i) => i.s))
      .join('')
  it('draws the block’s name where the names are shown, the unit’s own translation where they are not', () => {
    expect(text([])).toContain('Wenyong Zhou')
    expect(text(['affiliation', 'author', 'inknames'])).toContain('W. Zhou')
  })
})
