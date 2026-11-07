// design-a's entry over hand-made parts: one state per call (a row not in while more may come: the page waits, every member
// 'waiting', nothing off; a face not loaded: the same), a row that will not come ('none'), a member laid from its row and its
// facts alone (no Units object: its pieces made from the member's stated El, rowPieces), its text group off, an element
// drawn on a laid line off with it.
import type { OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rowPieces, srcOfEl } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Metrics, Rows } from '../../src/types.ts'

const metrics = (ready: Metrics['ready'] = () => true): Metrics => ({
  ready,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
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
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowsOf = (list: Row[], done = false): Rows => {
  const by = new Map(list.map((r) => [r.id, r]))
  return { get: (k) => by.get(k), done }
}
const row = (content: Row & { ok: true } extends { content: infer C } ? C : never): Row => ({
  id,
  ok: true,
  by: 'test',
  content,
})

describe('layPage (design-a §1.2) over a part and its rows', () => {
  it('waits for a row not in while more may come: every member waiting, nothing off, no line', () => {
    const p = layPage(part(member()), rowsOf([]), rules, metrics())
    expect(p.wait.rows).toEqual([id])
    expect(p.members.map((m) => [m.state, m.off, m.lines.length])).toEqual([['waiting', 0, 0]])
  })
  it('lays nothing of a member whose row will not come, and commits', () => {
    const p = layPage(part(member()), rowsOf([], true), rules, metrics())
    expect(p.wait).toEqual({ rows: [], faces: [] })
    expect(p.members[0]).toMatchObject({ state: 'none', off: 0 })
  })
  it('waits for a face not loaded, as for a row', () => {
    const p = layPage(
      part(member()),
      rowsOf([row([{ t: 'text', s: 'ein Satz' }])]),
      rules,
      metrics(() => false),
    )
    expect(p.wait.faces.length).toBeGreaterThan(0)
    expect(p.members[0]!.state).toBe('waiting')
  })
  it('lays a member from its row and its stated facts: its text off, its lines on its baselines', () => {
    const m = member({ els: [['1', { kind: 'other', ink: [[1, 150, 698, 170, 707, 700]], copy: 'x' }]] })
    const r = row([
      { t: 'text', s: 'Ein Satz mit ' },
      { t: 'el', id: '1' },
      { t: 'text', s: ' darin, der weiter läuft.' },
    ])
    const p = layPage(part(m), rowsOf([r]), rules, metrics())
    const [laid] = p.members
    expect(laid!.state).toBe('laid')
    expect(laid!.off & 1).toBe(1)
    expect(laid!.off & 2).toBe(2)
    expect(laid!.lines[0]![0]).toBe(700)
    expect(laid!.lines.flatMap((l) => l[3]).some((it) => 'src' in it && it.piece === '1')).toBe(true)
  })
  it('turns its elements off where one is drawn as text, not kept where it stands (today’s hide.mjs: its placeholders hidden)', () => {
    // (a citation drawn as the page's text in the translation: its ink on A must go with the text, or it shows twice)
    const m = member({
      els: [
        ['1', { kind: 'cite', ink: [[1, 150, 698, 170, 707, 700]], text: '[3]', style: { role: 'serif', size: 10 } }],
      ],
    })
    const r = row([
      { t: 'text', s: 'Ein Satz mit ' },
      { t: 'el', id: '1' },
      { t: 'text', s: ' darin, der weiter läuft.' },
    ])
    const [laid] = layPage(part(m), rowsOf([r]), rules, metrics()).members
    expect(laid!.state).toBe('laid')
    expect(laid!.lines.flatMap((l) => l[3]).some((it) => 'src' in it && it.piece === '1')).toBe(false)
    expect(laid!.off & 2).toBe(2)
  })
  it("lays the units of a size tie at one size, the smallest any of them is laid at (one paragraph of TeX's cut by a float)", () => {
    // (2608.16117v1 p19, the checkpoint's free-9: the paragraph's first part laid at its size, the part after the float shrunk to
    // fit; one size for both, the smaller)
    const idB = 'b'.repeat(64)
    const a = member({ ord: 0, lines: [[1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10]], room: { below: 0, next: 300 } })
    const b = member({
      ord: 1,
      text: idB,
      lines: [[1, 0, 72, 120, 600, 607, 598, 72, 120, 0, 10]],
      room: { below: 0, next: 300 },
    })
    const pt: Part = { ...part(a), flows: [[a], [b]], ties: [{ rule: 'size', ords: [0, 1] }] }
    const rows = rowsOf([row([{ t: 'text', s: 'kurz' }]), { ...row([{ t: 'text', s: 'abcdefghijk' }]), id: idB }])
    const sizes = (p: Part) =>
      layPage(p, rows, rules, metrics()).members.map((m) => [m.state, m.lines[0]?.[3].find((it) => 'size' in it)?.size])
    const apart = sizes({ ...pt, ties: [] })
    expect(apart[0]).toEqual(['laid', 10])
    expect(apart[1]![1]).toBeLessThan(10)
    expect(sizes(pt)).toEqual([
      ['laid', apart[1]![1]],
      ['laid', apart[1]![1]],
    ])
  })
  // (two cells of one table, a row of them: the second's row holds a paper's own macro the part states no ink and no text of)
  const idC = 'c'.repeat(64)
  const cell = (ord: number, x0: number, o: Partial<Placed> = {}): Placed =>
    member({
      ord,
      kind: 'cell',
      align: 'l',
      lines: [[1, 0, x0, x0 + 60, 700, 707, 698, x0, x0 + 60, 0, 10]],
      room: { below: 0, next: 300, side: [x0 - 2, x0 + 120] },
      ...o,
    })
  const twoCells = (o: Partial<Placed> = {}): Part => ({
    ...part(cell(0, 72)),
    flows: [[cell(0, 72)], [cell(1, 200, { text: idC, ...o })]],
    ties: [{ rule: 'cells', cells: [[0, 1]] }],
  })
  const cellRows = (second: OutPiece[] | null = [{ t: 'text', s: 'zwei' }]) =>
    rowsOf([row([{ t: 'text', s: 'eins' }]), ...(second ? [{ ...row(second), id: idC }] : [])], true)
  it("leaves a table's every cell the original's where one of them cannot be set before its lay (PR #620 review: one English cell, its peers laid)", () => {
    // (today's contract, RUN:1223 and settleGroup RUN:2411: a translated cell that cannot be drawn — unproven, its row refused
    // or never come, unfit — keeps every cell of its group the original's; the laid ones are withheld, 'cells', and turn
    // nothing off)
    const unproven = twoCells({ els: [['0', { kind: 'umacro', unknown: 1, cmd: 'sys', bare: 1, ink: [] }]] })
    const r2 = cellRows([
      { t: 'el', id: '0' },
      { t: 'text', s: ' zwei' },
    ])
    expect(layPage(unproven, r2, rules, metrics()).members.map((m) => [m.state, m.off, m.lines.length])).toEqual([
      ['cells', 0, 0],
      ['unproven', 0, 0],
    ])
    // (a translation that failed: the cell was to be translated with the rest)
    const failed = rowsOf([row([{ t: 'text', s: 'eins' }]), { id: idC, ok: false, why: { kind: 'refused' } }], true)
    expect(layPage(twoCells(), failed, rules, metrics()).members.map((m) => m.state)).toEqual(['cells', 'refused'])
    // (no row with every row in: a cell no translator was sent (a cell of digits), the original's in a table laid)
    expect(layPage(twoCells(), cellRows(null), rules, metrics()).members.map((m) => m.state)).toEqual(['laid', 'none'])
    // (both set: the table laid whole)
    expect(layPage(twoCells(), cellRows(), rules, metrics()).members.map((m) => m.state)).toEqual(['laid', 'laid'])
    // (a cell the wrap cannot hide is the original's alone, the rest of its table laid (the coordinator's ruling of
    // 2026-10-24); one that spans columns keeps its table whole)
    expect(layPage(twoCells({ why: 'unwrapped' }), cellRows(), rules, metrics()).members.map((m) => m.state)).toEqual([
      'laid',
      'unwrapped',
    ])
    const spanning: Part = {
      ...twoCells({ why: 'unwrapped' }),
      ties: [{ rule: 'cells', cells: [[0, 1]], spanning: [1] }],
    }
    expect(layPage(spanning, cellRows(), rules, metrics()).members.map((m) => m.state)).toEqual(['cells', 'unwrapped'])
  })
  it('leaves a member of a kind the reader leaves the original’s, nothing of it off, and waits for no row of it (Rules.leave)', () => {
    // (PR #620 review: the reader's "what to translate" was read nowhere, references laid and their ink turned off)
    const ref = member({ kind: 'reference' })
    const leave = rulesFor('de', { leave: ['reference'] })
    const p = layPage(part(ref), rowsOf([]), leave, metrics())
    expect(p.wait).toEqual({ rows: [], faces: [] })
    expect(p.members.map((m) => [m.state, m.off, m.lines.length])).toEqual([['left', 0, 0]])
    // (the next member of its flow starts where TeX set it, as after any member left the original's; one of another kind laid)
    const idB = 'b'.repeat(64)
    const after = member({ ord: 1, text: idB, lines: [[1, 0, 72, 300, 676, 683, 674, 72, 300, 0, 10]] })
    const both: Part = { ...part(ref), flows: [[ref, after]] }
    const rows = rowsOf([row([{ t: 'text', s: 'ein Satz' }]), { ...row([{ t: 'text', s: 'noch einer' }]), id: idB }])
    expect(layPage(both, rows, leave, metrics()).members.map((m) => [m.state, m.off])).toEqual([
      ['left', 0],
      ['laid', 1],
    ])
    expect(layPage(both, rows, rules, metrics()).members.map((m) => m.state)).toEqual(['laid', 'laid'])
  })
  it("carries a superscript's raise in the page's items (the checkpoint's (10): a raised run drawn on the baseline)", () => {
    // (a footnote's mark drawn as the page's text, raised whatever its rendering: design-a's Item had no raise, so the page's
    // drawing set it on the baseline)
    const m = member({
      els: [
        [
          '1',
          { kind: 'num', mark: 1, ink: [[1, 150, 703, 154, 709, 703]], text: '3', style: { role: 'serif', size: 7 } },
        ],
      ],
    })
    const r = row([
      { t: 'text', s: 'Ein Satz' },
      { t: 'el', id: '1' },
      { t: 'text', s: ' darin, der weiter läuft.' },
    ])
    const [laid] = layPage(part(m), rowsOf([r]), rules, metrics()).members
    const raised = laid!.lines
      .flatMap((l) => l[3])
      .filter((it): it is Extract<Item, { face: unknown }> => 'face' in it && !!it.rise)
    expect(raised.map((it) => it.s.trim())).toEqual(['3'])
    expect(raised[0]!.rise).toBeGreaterThan(0)
  })
})

describe('a row’s pieces from the member’s facts (rowPieces): each test a rule makes of a source answers as on the source', () => {
  it('makes a glue, a declaration, a forced break, a citation’s note, an identity and a group of what El and SpanAt state', () => {
    expect(srcOfEl('3', { kind: 'space', ink: [], glue: [1 / 6, 'em'] })).toBe('\\kern 0.16666666666666666em')
    expect(srcOfEl('3', { kind: 'zero', ink: [], cmd: 'bfseries', bare: 1 })).toBe('\\bfseries')
    expect(srcOfEl('3', { kind: 'zero', ink: [], brk: 1 })).toBe('\\\\')
    expect(srcOfEl('3', { kind: 'cite', ink: [], cmd: 'citep', note: 'p. 3' })).toBe('\\citep[p. 3]{=3}')
    expect(srcOfEl('5', { kind: 'cite', ink: [], cmd: 'citep', note: 'p. 3', same: '3' })).toBe('\\citep[p. 3]{=3}')
    const m = member({
      els: [['2', { kind: 'num', ink: [], mark: 1, nested: 1 }]],
      spans: [['0', { cmd: 'href', colour: 0xff0000 }]],
    })
    expect(
      rowPieces(m, [
        { t: 'span', id: '0', content: [{ t: 'text', s: 'Link' }] },
        { t: 'el', id: '2' },
      ]),
    ).toEqual([
      { t: 'open', src: '\\href{', id: 0, k: 0 },
      { t: 'text', tr: true, s: 'Link' },
      { t: 'close', src: '}', id: 0 },
      { t: 'nested', k: 2 },
    ])
  })
})
