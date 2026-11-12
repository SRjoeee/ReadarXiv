// design-a's entry over hand-made parts: one state per call (a row not in while more may come: the page waits, every member
// 'waiting', nothing off; a face not loaded: the same), a row that will not come ('none'), a member laid from its row and its
// facts alone (no Units object: its pieces made from the member's stated El, rowPieces), its text group off, an element
// drawn on a laid line off with it.
import type { El, OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { rowLinesOf } from '../../src/lay/adapt.ts'
import { layPage } from '../../src/lay/entry.ts'
import { rowPieces, srcOfEl } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Metrics, Rows } from '../../src/types.ts'
import { statedBreaks } from '../../src/unit/breaks.ts'
import { coverDone, coverOf, newCover } from '../replay/cover.ts'

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
  it('lays nothing of a member whose unit the paper keeps as it is, a row of it given or not (Unit.kept: never translated)', () => {
    // (2608.25210v2-zh p7's Algorithm 1, its algorithm2e lines kept as the original (the owner's ruling of 2026-11-08): a row
    // of the unit stored before it was kept, or today's door row the parity hands in, drew it erased and set as one line)
    const kept: Rows = { ...rowsOf([row([{ t: 'text', s: 'ein Satz' }])], true), kept: (k) => k === id }
    const p = layPage(part(member()), kept, rules, metrics())
    expect(p.members[0]).toMatchObject({ state: 'none', off: 0, lines: [] })
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
  it("inks a CJK run that names no fill #141414, today's ink; its Latin runs the PDF's black; a coloured unit its own fill", () => {
    // (the owner's exception of 2026-11-08 to the PDF's black: the translation's CJK text at today's weight, #141414, its Latin,
    // digits and formulas in the PDF's black, a run TeX set in a colour in that colour)
    const zh = rulesFor('zh')
    const r = row([
      {
        t: 'text',
        s: '\u6211\u4eec\u63d0\u51fa\u4e86\u53d8\u6362\u5668 Transformer \u6a21\u578b\uff0c\u5b83\u5b8c\u5168\u4f9d\u8d56\u6ce8\u610f\u529b\u673a\u5236\u3002',
      },
    ])
    const inks = (m: Placed) =>
      layPage(part(m), rowsOf([r]), zh, metrics())
        .members[0]!.lines.flatMap((l) => l[3])
        .flatMap((it) => ('src' in it ? [] : [[it.s.trim(), it.fill]]))
    const plain = inks(member())
    expect(plain.length).toBeGreaterThan(2)
    for (const [s, fill] of plain)
      expect([s, fill]).toEqual([s, /[\u4e00-\u9fff]/u.test(s as string) ? 0x141414 : undefined])
    expect(plain.some(([s]) => s === 'Transformer')).toBe(true)
    // (a unit TeX set in a colour: each of its runs, CJK or Latin, in that colour)
    const blue = inks(member({ style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu', fill: 0x0000cc } }))
    expect(new Set(blue.map(([, fill]) => fill))).toEqual(new Set([0x0000cc]))
  })
  it('draws an ink unit’s colour group in the fill its span states, the rest of it in its own (2609.36054v2-zh p1’s grey e-mails)', () => {
    const m = member({ kind: 'inknotes', spans: [['1', { cmd: 'textcolor', colour: 0x7a7f80 }]] })
    const r = row([
      { t: 'text', s: 'Briefe an ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'a.b@example.org' }] },
      { t: 'text', s: ' bitte' },
    ])
    const runs = layPage(part(m), rowsOf([r]), rules, metrics())
      .members[0]!.lines.flatMap((l) => l[3])
      .flatMap((it) => ('src' in it || !it.s.trim() ? [] : [[it.s.trim(), it.fill]]))
    expect(runs).toEqual([
      ['Briefe', undefined],
      ['an', undefined],
      ['a.b@example.org', 0x7a7f80],
      ['bitte', undefined],
    ])
  })
  it('draws a link’s translation in the fill its group states, CJK or Latin, the rest in the unit’s own (1810.04805v2 p11)', () => {
    // (hyperref colours a link's text; the part states the group's fill read off its glyphs on A, SpanAt.colour, and the
    // translation keeps the link's group (a link span is `must`): its CJK words in the link's blue, not the CJK ink)
    const zh = rulesFor('zh')
    const to = { url: 'https://openreview.net/forum?id=rJvJXZb0W' }
    const m = member({ kind: 'reference', spans: [['5', { cmd: 'href', to, colour: 0x000080 }]] })
    const r = row([
      { t: 'text', s: '\u674e\u3002 ' },
      { t: 'span', id: '5', content: [{ t: 'text', s: '\u4e00\u4e2a\u9ad8\u6548\u7684\u6846\u67b6 ICLR' }] },
      { t: 'text', s: ' \u4f1a\u8bae\u3002' },
    ])
    const runs = layPage(part(m), rowsOf([r]), zh, metrics())
      .members[0]!.lines.flatMap((l) => l[3])
      .flatMap((it) => ('src' in it || !it.s.trim() ? [] : [[it.s.trim(), it.fill]]))
    expect(runs.filter(([s]) => /\u6846\u67b6|ICLR/u.test(s as string)).map(([, f]) => f)).toEqual([0x000080, 0x000080])
    expect(runs.filter(([s]) => /\u674e|\u4f1a\u8bae/u.test(s as string)).map(([, f]) => f)).toEqual([
      0x141414, 0x141414,
    ])
  })
  it('keeps an ink unit’s stated label where it stands, and carries it with a centred line as a crop (today’s `carried`)', () => {
    // (2610.22065v1-zh p1: an affiliation's raised "2" the part states as the unit's label, its group `.l`: on a line laid from
    // its start the label's group stays on and no crop is drawn; on a centred line it goes with the line, its ink a crop at the
    // line's start, its group off, as today's reader carries an ink unit's label, layer-proto/run.mjs)
    const label = {
      kind: 'number' as const,
      ink: [1, 66, 698.8, 70, 707, 703.5] as [number, number, number, number, number, number],
      style: { role: 'serif' as const, size: 6 },
      num: ['2', [1, 66, 698.8, 70, 707, 703.5]] as [string, number[]],
      line: 0,
    }
    const r = row([{ t: 'text', s: 'Abteilung der Physik' }])
    const at = (align: Placed['align']) =>
      layPage(
        part(
          member({
            kind: 'inknotes',
            align,
            label: label as Placed['label'],
            lines: [[1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10]],
          }),
        ),
        rowsOf([r]),
        rules,
        metrics(),
      ).members[0]!
    const crops = (m: ReturnType<typeof at>) => m.lines.flatMap((l) => l[3]).filter((it) => 'src' in it)
    const left = at('j')
    expect(left.off & 4).toBe(0)
    expect(crops(left)).toEqual([])
    const centred = at('c')
    expect(centred.off & 4).toBe(4)
    expect(crops(centred).map((it) => ('src' in it ? it.src[0] : null))).toEqual([1])
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
  it('asks a face’s readiness before any width: a face not loaded is waited for, never measured (PR #620 re-review)', () => {
    // (a host whose Metrics cannot measure a face not loaded throws, or measures it in a fallback face: the reading measured
    // its tokens before B.cover asked, so the member was 'error' and the page committed with no face to wait for)
    const loading: Metrics = {
      ready: () => false,
      advance: () => {
        throw new Error('a face not loaded measured')
      },
      ink: () => [0.7, 0.2, 0],
    }
    const p = layPage(part(member()), rowsOf([row([{ t: 'text', s: 'ein Satz' }])]), rules, loading)
    expect(p.wait.faces.length).toBeGreaterThan(0)
    expect(p.members.map((m) => m.state)).toEqual(['waiting'])
  })
  it('opens a run-in head’s follower only where the follower is set: one the reader leaves is no row to run over', () => {
    // (PR #620 re-review: a heading at 72-100 sharing its row with a paragraph from 105 the reader leaves: the paragraph's row
    // was in, so the heading's follower was open and its translation ran over the paragraph's original text, which stays)
    const head = member({
      ord: 0,
      kind: 'heading',
      align: 'l',
      lines: [[1, 0, 72, 100, 700, 707, 698, 72, 300, 0, 10]],
      // (its side to the paragraph's first glyph on its baseline, as locate states it)
      room: { below: 0, next: 300, side: [72, 105] },
    })
    const idB = 'b'.repeat(64)
    const para = member({
      ord: 1,
      text: idB,
      join: [5],
      lines: [
        [1, 0, 105, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
      ],
    })
    const pt: Part = { ...part(head), flows: [[head, para]] }
    const rows = rowsOf([
      row([{ t: 'text', s: 'Eine sehr lange Überschrift' }]),
      { ...row([{ t: 'text', s: 'ein Satz' }]), id: idB },
    ])
    const laid = layPage(pt, rows, rulesFor('de', { leave: ['para'] }), metrics()).members
    expect(laid[1]).toMatchObject({ state: 'left', off: 0 })
    // (no line of the head's on the paragraph's row past where the paragraph's original text begins: within its room, or
    // left the original's where it does not fit there (it ran to 207 over the paragraph's text before))
    expect(laid[0]!.lines.filter(([y, , x1]) => y === 700 && x1 > 105)).toEqual([])
    // (the paragraph set, the head runs on over its row as before)
    const both = layPage(pt, rows, rules, metrics()).members
    expect(both.map((m) => m.state)).toEqual(['laid', 'laid'])
  })
  it('lets a run-in head take its row before it shrinks: the head and its paragraph at their size (2611.03178v1-zh p16)', () => {
    // (a bold head at 72-100 on the row of its paragraph, which TeX set from 105 on: its translation, eight characters, 40 wide
    // at its size where its own line holds 28: the fit shrank it to 0.85 to fit there, and the size tie set its paragraph at
    // that scale, a paragraph at 0.85 of the body among paragraphs at full size and a hole under it, where one character more
    // clipped it and it ran on over its row at full size. TeX sets a run-in head on its paragraph's first line, as wide as its
    // text: the row is the head's room before its size)
    const idB = 'b'.repeat(64)
    const head = member({
      ord: 0,
      kind: 'heading',
      style: { role: 'serif', size: 10, bold: 1, design: 'NimbusRomNo9L-Medi' },
      lines: [[1, 0, 72, 100, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 0, next: 300, side: [72, 105] },
    })
    const para = member({
      ord: 1,
      text: idB,
      join: [5],
      lines: [
        [1, 0, 105, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
        [1, 0, 72, 300, 676, 683, 674, 72, 300, 0, 10],
      ],
    })
    const pt: Part = { ...part(head), flows: [[head, para]], ties: [{ rule: 'size', ords: [0, 1] }] }
    const rows = rowsOf([
      row([{ t: 'text', s: '\u673a\u5668\u5b66\u4e60\u7f16\u7801\u7801\u3002' }]),
      { ...row([{ t: 'text', s: '\u6587'.repeat(60) }]), id: idB },
    ])
    const laid = layPage(pt, rows, rulesFor('zh'), metrics()).members
    expect(laid.map((m) => m.state)).toEqual(['laid', 'laid'])
    expect(laid.map((m) => m.fit?.size)).toEqual([10, 10])
    // (the head on its row past where its original ended, the paragraph's first line on the row after it)
    const [hy, , hx1] = laid[0]!.lines[0]!
    expect(hy).toBe(700)
    expect(hx1).toBeGreaterThan(100)
    const first = laid[1]!.lines.find(([y]) => y === 700)
    expect(first?.[1]).toBeGreaterThanOrEqual(hx1 - 1e-6)
  })
  it('caps a size tie’s members alike on every page it is laid for (PR #620 re-review: a member on pages 1-2, one on 2)', () => {
    // (the tie's sizes were read off the members with a line on the page asked for: on page 1 the second member was no voter,
    // and the first laid at 10, on page 2 at the second's 8.5)
    const idB = 'b'.repeat(64)
    const a = member({
      ord: 0,
      lines: [
        [1, 0, 72, 300, 100, 107, 98, 72, 300, 0, 10],
        [2, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      ],
      room: { below: 0, next: 300 },
    })
    const b = member({
      ord: 1,
      text: idB,
      lines: [[2, 0, 72, 120, 600, 607, 598, 72, 120, 0, 10]],
      room: { below: 0, next: 300 },
    })
    const rows = rowsOf([row([{ t: 'text', s: 'kurz' }]), { ...row([{ t: 'text', s: 'abcdefghijk' }]), id: idB }])
    // (the page's fill off, as the review's case: the fill's growth is its own question)
    const still: typeof rules = { ...rules, set: { ...rules.set, adaptiveFill: false } as unknown as typeof rules.set }
    const on = (page: number) => {
      const pt: Part = { ...part(a), page, flows: [[a], [b]], ties: [{ rule: 'size', ords: [0, 1] }] }
      return layPage(pt, rows, still, metrics()).members.find((m) => m.ord === 0)!.fit!.size
    }
    expect(on(2)).toBeLessThan(10)
    expect(on(1)).toBe(on(2))
  })
  it('never grows a tie’s member past the tie’s size by the page’s fill (a paragraph’s parts one size, the fill on)', () => {
    // (the page's fill grows a page's body units to one larger size where all of them can take it; a member a size tie capped
    // at another's size took the page's growth over its cap: 11 beside its tie's 8.5, the paragraph's two parts unequal again)
    const idB = 'b'.repeat(64)
    const a = member({
      ord: 0,
      lines: [
        [1, 0, 72, 300, 100, 107, 98, 72, 300, 0, 10],
        [2, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      ],
      room: { below: 0, next: 300 },
    })
    const b = member({
      ord: 1,
      text: idB,
      lines: [[2, 0, 72, 120, 600, 607, 598, 72, 120, 0, 10]],
      room: { below: 0, next: 300 },
    })
    const rows = rowsOf([row([{ t: 'text', s: 'kurz' }]), { ...row([{ t: 'text', s: 'abcdefghijk' }]), id: idB }])
    const sizes = (page: number) => {
      const pt: Part = { ...part(a), page, flows: [[a], [b]], ties: [{ rule: 'size', ords: [0, 1] }] }
      return layPage(pt, rows, rules, metrics()).members.map((m) => m.fit?.size ?? null)
    }
    const [a2, b2] = sizes(2)
    expect(b2).toBeLessThan(10)
    expect(a2).toBe(b2)
    expect(sizes(1)[0]).toBe(b2)
  })
  // (a translation longer than its original by a line: 165 characters at half a size each, 45 to a line of 228 pt at 10 pt)
  const longer = 'wort '.repeat(33).trim()
  // (the owner's ruling of 2026-11-08, borrowing bounded by TeX's facts: a paragraph may take lines in the empty space under a
  // run of its lines, never past TeX's text block bottom in its column (Room.runs' third: the depth of that bottom under the
  // run's last baseline) nor so that the next ink under it (Room.runs' second: the depth of its baseline) stands nearer than
  // TeX's paragraph separation (Room.sep, \baselineskip and \parskip); before its size: a page's body keeps one size)
  const still: typeof rules = { ...rules, set: { ...rules.set, adaptiveFill: false } as unknown as typeof rules.set }
  const overBreak = (room: Placed['room']) =>
    member({
      lines: [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
        [2, 0, 72, 200, 700, 707, 698, 72, 300, 0, 10],
      ],
      room,
    })
  it('borrows a line at the foot of a page it runs on from, down to TeX’s text block bottom, before it shrinks', () => {
    // (2608.16117v1-de t23, 2602.23285v2-ja t29: a paragraph running on from page 1 to page 2; page 1's text block bottom 12 pt
    // under its last line there, the next ink 200 pt down (the page's foot line): one line of room)
    const lay = (a: Placed, page: number) =>
      layPage({ ...part(a), page }, rowsOf([row([{ t: 'text', s: longer }])]), still, metrics()).members[0]!
    const a = overBreak({
      below: 0,
      next: 300,
      runs: [
        [1, 200, 12],
        [2, 100, 650],
      ],
      sep: 12,
    })
    const [p1, p2] = [lay(a, 1), lay(a, 2)]
    expect([p1.state, p1.fit?.size, p1.fit?.borrowed]).toEqual(['laid', 10, 1])
    expect(p1.lines.map(([y]) => y)).toEqual([700, 688, 676])
    expect(p2.lines.map(([y]) => y)).toEqual([700])
    // (TeX's bottom 11 pt under it: no line's room, never past it; the whole paragraph shrinks evenly to its own lines)
    const short = overBreak({ below: 0, next: 300, runs: [[1, 200, 11]], sep: 12 })
    const [q1, q2] = [lay(short, 1), lay(short, 2)]
    expect(q1.fit!.size).toBeLessThan(10)
    expect(q2.fit!.size).toBe(q1.fit!.size)
    expect(q1.lines.map(([y]) => y)).toEqual([700, 688])
  })
  it('borrows a line above the next unit only where the next ink keeps TeX’s paragraph separation under it', () => {
    // (2602.23285v2-ja p4 t26: a paragraph's fifth line laid in the skip above heading 4.1. The next ink's baseline 30 pt under
    // its last line: with \baselineskip and \parskip 15 pt one line of room (its baseline 15 pt over the next one's); with 19,
    // 11 pt, none: it shrinks)
    const idB = 'b'.repeat(64)
    const b = member({ ord: 1, text: idB, lines: [[1, 0, 72, 300, 658, 665, 656, 72, 300, 0, 10]] })
    const text = 'wort '.repeat(20).trim()
    const rows = rowsOf([row([{ t: 'text', s: text }]), { ...row([{ t: 'text', s: 'ein Satz' }]), id: idB }])
    const lay = (sep: number) => {
      const a = member({ room: { below: 20, next: 30, runs: [[1, 30, 200]], sep } })
      return layPage({ ...part(a), flows: [[a], [b]] }, rows, still, metrics()).members[0]!
    }
    const [roomy, tight] = [lay(15), lay(19)]
    expect([roomy.state, roomy.fit?.size]).toEqual(['laid', 10])
    expect(roomy.lines.map(([y]) => y)).toEqual([700, 688, 676])
    expect(tight.fit!.size).toBeLessThan(10)
    expect(tight.lines.map(([y]) => y)).toEqual([700, 688])
  })
  it('borrows the room under a line where it holds no whole line: TeX’s \\lineskip rule sets the last line into it', () => {
    // (2602.23285v2-ja p5 t32: under a tall formula TeX's rule sets the translation's last line 1.25 pt lower, and the 10.82 pt
    // of room under the paragraph holds it, a pitch of 10.96 not; the room offered in whole lines offered none, and the
    // paragraph shrank. Here a 13 pt tall element on the last line: \lineskip 1 sets it about 2 pt lower; TeX's room 8 pt
    // (its bottom 8 under the last line), then 1 pt)
    const idEl = [['1', { kind: 'other', ink: [[1, 150, 698, 170, 713, 700]], copy: 'x' }]] as Placed['els']
    const r = row([
      { t: 'text', s: 'wort '.repeat(9) },
      { t: 'el', id: '1' },
      { t: 'text', s: ' ende' },
    ])
    const lay = (foot: number) => {
      const a = member({
        els: idEl,
        lines: [
          [1, 0, 72, 300, 700, 713, 698, 72, 300, 0, 10],
          [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
        ],
        room: { below: 0, next: 300, runs: [[1, 200, foot]], sep: 12 },
      })
      return layPage({ ...part(a), paper: { ...part(a).paper, lineskip: [1, 1] } }, rowsOf([r]), still, metrics())
        .members[0]!
    }
    const roomy = lay(8)
    expect([roomy.state, roomy.fit?.size]).toEqual(['laid', 10])
    const [y1, y2] = roomy.lines.map(([y]) => y)
    expect([y1, roomy.lines.length]).toEqual([700, 2])
    expect(y2).toBeLessThan(688 - 1)
    expect(y2).toBeGreaterThanOrEqual(688 - 8)
    // (1 pt of room: the line set lower is past TeX's bottom, never laid there; the paragraph shrinks)
    const tight = lay(1)
    expect(tight.fit!.size).toBeLessThan(10)
    expect(tight.lines.every(([y]) => y >= 687 - 0.05)).toBe(true)
  })
  it('keeps every line it lays off the ink that stays beside its lines, borrowed or not (Room.stays: a QED box)', () => {
    // (2610.40645v1-ja p12 t80: amsthm's QED box at the end of the proof's last line (it ends at 200, the box at 290-297); the
    // translation two lines longer, laid at its size with two borrowed lines: its last original row now full, which ran over
    // the box. A line on that row ends half an em before the box; the borrowed line under it, clear of it, runs full)
    const text = 'wort '.repeat(28).trim()
    const lay = (stays?: Placed['room']['stays']) => {
      const a = member({ room: { below: 0, next: 300, runs: [[1, 200, 30]], sep: 12, ...(stays ? { stays } : {}) } })
      return layPage(part(a), rowsOf([row([{ t: 'text', s: text }])]), still, metrics()).members[0]!
    }
    const bare = lay()
    expect([bare.state, bare.fit?.size, bare.lines.length]).toEqual(['laid', 10, 4])
    expect(bare.lines[1]![2]).toBeGreaterThan(290)
    const kept = lay([[1, 290, 686, 297, 693]])
    expect([kept.state, kept.fit?.size]).toEqual(['laid', 10])
    const onRow = kept.lines.find(([y]) => Math.abs(y - 688) < 1)!
    expect(onRow[2]).toBeLessThanOrEqual(290 - 5 + 0.01)
    expect(kept.lines.find(([y]) => Math.abs(y - 676) < 1)![2]).toBeGreaterThan(290)
  })
  it('keeps off ink that stays no farther than TeX kept its line off it: its own distance, half an em at most', () => {
    // (2610.20484v1-zh p1 t6: its first line set 1.5 pt after ink no unit owns at its left (an initial two lines high); the line
    // starts where TeX started it, not half an em off. 2608.25210v2-zh p8 t166: a QED glyph 2 pt after the last row's words;
    // the row may run to TeX's end, no farther)
    const text = 'wort '.repeat(20).trim()
    const lay = (lines: Placed['lines'], stays: Placed['room']['stays']) =>
      layPage(
        part(member({ lines, room: { below: 0, next: 300, runs: [[1, 200, 30]], sep: 12, stays } })),
        rowsOf([row([{ t: 'text', s: text }])]),
        still,
        metrics(),
      ).members[0]!
    const left = lay(
      [
        [1, 0, 100, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
      ],
      [[0, 80, 698, 98.5, 707]],
    )
    expect(left.lines[0]![1]).toBeCloseTo(100, 2)
    const right = lay(
      [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
      ],
      [[1, 202, 686, 207, 693]],
    )
    const onRow = right.lines.find(([y]) => Math.abs(y - 688) < 1)!
    expect(onRow[2]).toBeLessThanOrEqual(200 + 0.01)
    expect(onRow[2]).toBeGreaterThan(195)
  })
  it('sets its lines at TeX’s \\baselineskip (Placed.lead): a gap TeX’s \\lineskip rule opened is not counted again', () => {
    // (2602.23285v2-ja p4 t29: the original's third line, on TeX's text block bottom, set 16 pt under its second for a formula
    // 13 tall on it (its second line 2 deep, \lineskip 1), the \baselineskip 12. The translation sets the formula on its second
    // line, which TeX's rule pushes 2 pt down: with the pitch TeX set the paragraph at, its third line comes 12 under that,
    // over the bottom, and the paragraph keeps its size; with its pitch read as the upper median of its gaps, 16, the gap the
    // \lineskip rule made, the push was added to that gap, the third line fell past the bottom and the paragraph shrank. A part
    // that states no \baselineskip (Placed.read 'lead': its lead read off its lines) lays as before)
    const tall = [['1', { kind: 'other', ink: [[1, 150, 670, 170, 685, 672]], copy: 'x' }]] as Placed['els']
    const r = row([
      { t: 'text', s: `${'wort '.repeat(9)}` },
      { t: 'el', id: '1' },
      { t: 'text', s: ` ${'wort '.repeat(12).trim()}` },
    ])
    const lay = (read?: string[]) => {
      const a = member({
        els: tall,
        lines: [
          [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
          [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
          [1, 0, 72, 200, 672, 685, 670, 72, 300, 0, 10],
        ],
        room: { below: 0, next: 300, runs: [[2, 200, 0]], sep: 12 },
        ...(read ? { read } : {}),
      })
      return layPage({ ...part(a), paper: { ...part(a).paper, lineskip: [1, 1] } }, rowsOf([r]), still, metrics())
        .members[0]!
    }
    const stated = lay()
    expect([stated.state, stated.fit?.size]).toEqual(['laid', 10])
    // (to a tenth: the stub's text descends 0.02 pt, which the push takes in)
    expect(stated.lines.map(([y]) => Math.round(y * 10) / 10)).toEqual([700, 686, 674])
    expect(lay(['style', 'lead']).fit!.size).toBeLessThan(10)
  })
  it('borrows nothing where the part states no TeX room: a part made before, its runs’ room or its separation unstated', () => {
    // (a part made before 2026-11-08 may state the room under each run otherwise, Room.ends: read by nothing; its last line's
    // room alone, Room.below: no fact of TeX's bounds it. A run stated, no separation (a unit TeX set no paragraph for): none)
    const lay = (room: Placed['room']) =>
      layPage({ ...part(overBreak(room)), page: 1 }, rowsOf([row([{ t: 'text', s: longer }])]), still, metrics())
        .members[0]!
    for (const room of [
      { below: 40, next: 300, ends: [[1, 79, 600]] } as Placed['room'],
      { below: 40, next: 300 },
      { below: 40, next: 300, runs: [[1, 200, 50]] } as Placed['room'],
    ]) {
      const p = lay(room)
      expect(p.fit!.size).toBeLessThan(10)
      expect(p.lines.map(([y]) => y)).toEqual([700, 688])
    }
  })
  it('lays no line through a row of its own that stays under its text (P2: 2608.16117v1-de p27 t89 over its display)', () => {
    // (its last line a kept row (a held line, a display's row): its lines laid over the row, none under it)
    const idB = 'b'.repeat(64)
    const a = member({
      lines: [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 300, 688, 695, 686, 72, 300, 0, 10],
        [1, 0, 100, 250, 676, 683, 674, 72, 300, 1, 10],
      ],
      room: { below: 100, next: 300 },
    })
    const b = member({ ord: 1, text: idB, lines: [[1, 0, 72, 300, 500, 507, 498, 72, 300, 0, 10]] })
    const pt: Part = { ...part(a), flows: [[a], [b]] }
    // (a translation of 99 characters: two lines at 0.9 of its size)
    const text = 'wort '.repeat(20).trim()
    const [laid] = layPage(pt, rowsOf([row([{ t: 'text', s: text }])], true), rules, metrics()).members
    expect(laid!.state).toBe('laid')
    expect(laid!.lines.every(([y]) => y > 683)).toBe(true)
  })
  it('fills each frame of a paragraph over a page break at its own leading: a roomy frame is not held to a full one’s', () => {
    // (the owner on staging, 2026-11-08: 1810.04805v2 p6's "Our best performing system", the last paragraph of a column going on
    // to the next page, set at the original's pitch with its frame's last line empty, among paragraphs spread to 1.33. One
    // leading a unit: its part on the next page, two lines in two, held its part here, four lines in five, to the original's
    // pitch. Each frame of a paragraph is filled over its own block, as a run between displays is, at the paragraph's one size)
    const zh = rulesFor('zh')
    const lineAt = (page: number, y: number): Placed['lines'][number] => [
      page,
      0,
      72,
      300,
      y,
      y + 7,
      y - 2,
      72,
      300,
      0,
      10,
    ]
    const [idA, idB] = ['b'.repeat(64), 'c'.repeat(64)]
    // (two paragraphs over it on the page, each two lines of translation in four: the page's leading theirs, spread)
    const a = member({
      ord: 0,
      text: idA,
      lines: [700, 688, 676, 664].map((y) => lineAt(1, y)),
      room: { below: 20, next: 24 },
    })
    const b = member({
      ord: 1,
      text: idB,
      lines: [640, 628, 616, 604].map((y) => lineAt(1, y)),
      room: { below: 20, next: 24 },
    })
    const m = member({
      ord: 2,
      lines: [...[580, 568, 556, 544, 532].map((y) => lineAt(1, y)), lineAt(2, 700), lineAt(2, 688)],
      room: { below: 200, next: 212 },
    })
    const rows = rowsOf([
      row([{ t: 'text', s: '\u6587'.repeat(250) }]),
      { ...row([{ t: 'text', s: '\u6587'.repeat(80) }]), id: idA },
      { ...row([{ t: 'text', s: '\u6587'.repeat(80) }]), id: idB },
    ])
    const laid = (page: number) =>
      layPage({ ...part(m), page, flows: [[a], [b], [m]] }, rows, zh, metrics()).members.find((x) => x.ord === 2)!
    const [p1, p2] = [laid(1), laid(2)]
    expect([p1.state, p2.state, p1.fit?.size, p2.fit?.size]).toEqual(['laid', 'laid', 10, 10])
    // (four lines over the five of its frame here, to its foot; two in two on the next page)
    expect(p1.lines.map(([y]) => Math.round(y))).toEqual([580, 564, 548, 532])
    expect(p2.lines.map(([y]) => y)).toEqual([700, 688])
  })
  it('fills each frame at its own leading where the gap under the paragraph takes its leading closer than its fit’s too', () => {
    // (1810.04805v2 p6/p7 t119, five and two original lines: with the room under its last line on the next page offered (TeX's,
    // Room.runs, 10 of 22 there), its fit lays it at its own leading, four lines here and two there, the second in that room.
    // The gap under it at its own leading keeps the original's skip, so the page fill set it at a closer leading, the
    // original's pitch, where this frame holds five: five lines here and one of two characters alone on the next page, the
    // frame left unfilled. Each frame its own leading on that path too: four here over the frame, two there)
    const zh = rulesFor('zh')
    const lineAt = (page: number, y: number): Placed['lines'][number] => [
      page,
      0,
      72,
      300,
      y,
      y + 7,
      y - 2,
      72,
      300,
      0,
      10,
    ]
    const [idA, idB] = ['b'.repeat(64), 'c'.repeat(64)]
    const a = member({
      ord: 0,
      text: idA,
      lines: [700, 688, 676, 664].map((y) => lineAt(1, y)),
      room: { below: 20, next: 24 },
    })
    const b = member({
      ord: 1,
      text: idB,
      lines: [640, 628, 616, 604].map((y) => lineAt(1, y)),
      room: { below: 20, next: 24 },
    })
    const m = member({
      ord: 2,
      lines: [...[580, 568, 556, 544, 532].map((y) => lineAt(1, y)), lineAt(2, 700), lineAt(2, 688)],
      room: {
        below: 20,
        next: 22,
        runs: [
          [4, 10, 40],
          [6, 22, 300],
        ],
        sep: 12,
      },
    })
    const rows = rowsOf([
      row([{ t: 'text', s: '\u6587'.repeat(250) }]),
      { ...row([{ t: 'text', s: '\u6587'.repeat(80) }]), id: idA },
      { ...row([{ t: 'text', s: '\u6587'.repeat(80) }]), id: idB },
    ])
    const laid = (page: number) =>
      layPage({ ...part(m), page, flows: [[a], [b], [m]] }, rows, zh, metrics()).members.find((x) => x.ord === 2)!
    const [p1, p2] = [laid(1), laid(2)]
    expect([p1.state, p2.state, p1.fit?.size, p2.fit?.size]).toEqual(['laid', 'laid', 10, 10])
    expect(p1.lines.map(([y]) => Math.round(y))).toEqual([580, 564, 548, 532])
    expect(p2.lines.length).toBe(2)
  })
  it('holds a frame on the next page to the band of the page its paragraph begins on: every page’s lay sets it alike', () => {
    // (docs/PDF-READER.md §18.49; 2610.40645v1-ja p3/p4 t13. A Japanese paragraph of five original lines at the foot of page 1
    // and five at the top of page 2, its translation five full lines here and four there; beside it on page 1 a paragraph its
    // translation fills, under it on page 2 one whose two lines of translation stand in four. Page 1's band is 1.05; the last
    // frame's own fill leading, four lines over its five as the gap under it allows, 1.25; page 2's paragraph spreads to its
    // own, 1.42. The paragraph is filled where it begins, at page 1's band: page 1's lay holds none of page 2's paragraphs, and
    // a unit is laid alike by every page's lay (I6), so its frame on page 2 cannot read page 2's band; four lines 12.6 apart,
    // the last 10.2 over its original's)
    const ja = rulesFor('ja')
    const lineAt = (page: number, y: number): Placed['lines'][number] => [
      page,
      0,
      72,
      300,
      y,
      y + 7,
      y - 2,
      72,
      300,
      0,
      10,
    ]
    const [idA, idC] = ['b'.repeat(64), 'd'.repeat(64)]
    const a = member({ ord: 0, text: idA, lines: [700, 688].map((y) => lineAt(1, y)), room: { below: 10, next: 12 } })
    const m = member({
      ord: 1,
      lines: [
        ...[580, 568, 556, 544, 532].map((y) => lineAt(1, y)),
        ...[700, 688, 676, 664, 652].map((y) => lineAt(2, y)),
      ],
      room: { below: 10, next: 12 },
    })
    const c = member({
      ord: 2,
      text: idC,
      lines: [640, 628, 616, 604].map((y) => lineAt(2, y)),
      room: { below: 10, next: 12 },
    })
    // (45 characters a line: 228 pt of measure at 5 pt a character)
    const rows = rowsOf([
      row([{ t: 'text', s: '\u6587'.repeat(45 * 8 + 20) }]),
      { ...row([{ t: 'text', s: '\u6587'.repeat(65) }]), id: idA },
      { ...row([{ t: 'text', s: '\u6587'.repeat(65) }]), id: idC },
    ])
    const lay = (page: number) => layPage({ ...part(m), page, flows: [[a], [m], [c]] }, rows, ja, metrics())
    const [p1, p2] = [lay(1), lay(2)]
    const [m1, m2] = [p1, p2].map((p) => p.members.find((x) => x.ord === 1)!)
    expect([m1!.state, m2!.state, m1!.fit?.size, m2!.fit?.size]).toEqual(['laid', 'laid', 10, 10])
    expect(m1!.lines.map(([y]) => y)).toEqual([580, 568, 556, 544, 532])
    expect(m2!.lines.map(([y]) => Math.round(y * 10) / 10)).toEqual([700, 687.4, 674.8, 662.2])
    // (the paragraph under it, begun on page 2, at its own fill leading there: its two lines 17 apart)
    const c2 = p2.members.find((x) => x.ord === 2)!
    expect(Math.round((c2.lines[0]![0] - c2.lines[1]![0]) * 10) / 10).toBe(17)
  })
  // (a paragraph of ten original lines here and three on the next page whose translation, ten lines, fits at its own leading with
  // a line borrowed under its last on the next page, seven here and three there, where TeX's share is 10 x 10/13 = 7.7, eight;
  // two paragraphs over it on the page, their translations `chars` characters in four lines each, which sets the page's band)
  const sharePage = (chars: number) => {
    const zh = rulesFor('zh')
    const lineAt = (page: number, y: number): Placed['lines'][number] => [
      page,
      0,
      72,
      300,
      y,
      y + 7,
      y - 2,
      72,
      300,
      0,
      10,
    ]
    const [idA, idB] = ['b'.repeat(64), 'c'.repeat(64)]
    const a = member({
      ord: 0,
      text: idA,
      lines: [700, 688, 676, 664].map((y) => lineAt(1, y)),
      room: { below: 20, next: 24 },
    })
    const b = member({
      ord: 1,
      text: idB,
      lines: [640, 628, 616, 604].map((y) => lineAt(1, y)),
      room: { below: 20, next: 24 },
    })
    const ys = Array.from({ length: 10 }, (_, k) => 580 - 12 * k)
    const m = member({
      ord: 2,
      lines: [...ys.map((y) => lineAt(1, y)), lineAt(2, 700), lineAt(2, 688), lineAt(2, 676)],
      room: {
        below: 25,
        next: 25,
        runs: [
          [9, 30, 1],
          [12, 25, 300],
        ],
        sep: 12,
      },
    })
    const rows = rowsOf([
      row([{ t: 'text', s: '\u6587'.repeat(440) }]),
      { ...row([{ t: 'text', s: '\u6587'.repeat(chars) }]), id: idA },
      { ...row([{ t: 'text', s: '\u6587'.repeat(chars) }]), id: idB },
    ])
    const laid = (page: number) =>
      layPage({ ...part(m), page, flows: [[a], [b], [m]] }, rows, zh, metrics()).members.find((x) => x.ord === 2)!
    return [laid(1), laid(2)] as const
  }
  it('keeps each frame of a paragraph over a page break its share of the lines where that holds within the page’s band', () => {
    // (2610.22065v1-zh p5/p6 t94: the frame here set tighter, to 1.29, holds the text before its cut, its column ending on
    // TeX's last line, where the page's band reaches down that far: its neighbours spread to 1.33)
    const [p1, p2] = sharePage(120)
    expect([p1.state, p2.state]).toEqual(['laid', 'laid'])
    expect([p1.lines.length, p2.lines.length]).toEqual([8, 2])
    expect(p1.lines[0]![0]).toBe(580)
    expect(p1.lines.at(-1)![0]).toBeGreaterThanOrEqual(472 - 1 - 0.05)
  })
  it('leaves the fit’s split where holding the share would set a frame under the page’s band: no frame solid', () => {
    // (2610.37668v1-zh p17, 2610.21084v1-zh p1: the share set a column's foot solid, two lines at the original's pitch among
    // paragraphs spread to 1.38-1.5, which read worse than the one line its fit left there; its neighbours here spread to 1.67)
    const [p1, p2] = sharePage(80)
    expect([p1.lines.length, p2.lines.length]).toEqual([7, 3])
    expect(p1.lines[0]![0] - p1.lines[1]![0]).toBeGreaterThan(12.5)
  })
  it('holds the gap under a paragraph to its own leading alone, never the next paragraph’s: one that nearly fills its block keeps its own', () => {
    // (the owner's ruling of 2026-11-08, chosen on the preview of two rules: a paragraph whose translation takes 7 lines of its 8
    // between two that take 2 of 4. The 2026-10-17 gap rule held the gap under it to the next paragraph's leading too and pulled
    // it under the leading its own block allows (1810.04805v2 p8 t156: 1.08 among 1.38-1.5, its own 1.14))
    const zh = rulesFor('zh')
    const lineAt = (y: number): Placed['lines'][number] => [1, 0, 72, 300, y, y + 7, y - 2, 72, 300, 0, 10]
    const ids = ['b', 'c', 'd'].map((c) => c.repeat(64))
    const ys = (y0: number, n: number) => Array.from({ length: n }, (_, i) => lineAt(y0 - 12 * i))
    const a = member({ ord: 0, text: ids[0], lines: ys(700, 4), room: { below: 5, next: 12 } })
    const m = member({ ord: 1, text: ids[1], lines: ys(652, 8), room: { below: 5, next: 12 } })
    const b = member({ ord: 2, text: ids[2], lines: ys(556, 4), room: { below: 200, next: 212 } })
    const rows = rowsOf(
      [60, 300, 60].map((n, i) => ({ ...row([{ t: 'text', s: '\u6587'.repeat(n) }]), id: ids[i]! })),
      true,
    )
    const laid = layPage({ ...part(a), flows: [[a, m, b]] }, rows, zh, metrics()).members
    // (its own leading, 1.14: its 7 lines from its first baseline, the last a leading of its own over the next paragraph's
    // first; its neighbours as before)
    expect(laid.map((x) => x.fit?.lead)).toEqual([1.667, 1.14, 1.667])
    expect(laid.map((x) => x.lines[0]![0])).toEqual([700, 652, 556])
    expect(laid[1]!.lines.length).toBe(7)
    expect(laid[1]!.lines.at(-1)![0] - 556).toBeGreaterThanOrEqual(1.14 * 12 - 0.05)
  })
  // (a unit of two paragraphs TeX states between its blocks (SpanAt.opens): an item's run-in text, then its prompt TeX set in a
  // frame of its own, at another measure and size; between two paragraphs whose translations take two lines of four)
  const zhPage = () => {
    const zh = rulesFor('zh')
    const at = (y: number, x0 = 72, x1 = 300, size = 10): Placed['lines'][number] => [
      1,
      0,
      x0,
      x1,
      y,
      y + 0.7 * size,
      y - 0.2 * size,
      72,
      300,
      0,
      size,
    ]
    const ids = ['b', 'c'].map((c) => c.repeat(64))
    const ys = (y0: number, n: number, pitch: number, x0?: number, x1?: number, size?: number) =>
      Array.from({ length: n }, (_, i) => at(y0 - pitch * i, x0, x1, size))
    const a = member({ ord: 0, text: ids[0], lines: ys(700, 4, 12), room: { below: 20, next: 24 } })
    const b = member({ ord: 2, text: ids[1], lines: ys(520, 4, 12), room: { below: 200, next: 212 } })
    const lay = (m: Placed, content: OutPiece[]) => {
      const rows = rowsOf(
        [
          row(content),
          { ...row([{ t: 'text', s: '\u6587'.repeat(80) }]), id: ids[0]! },
          { ...row([{ t: 'text', s: '\u6587'.repeat(80) }]), id: ids[1]! },
        ],
        true,
      )
      return layPage({ ...part(m), flows: [[a, m, b]] }, rows, zh, metrics()).members.find((x) => x.ord === 1)!
    }
    return { at, ys, lay }
  }
  it('fills each paragraph TeX set inside a unit at its own leading: a roomy one is not held to a full one’s', () => {
    // (the owner's comment #9 on 2608.25210v2 p3: three prompt boxes, each a unit of two paragraphs, an item's run-in line and its
    // prompt in a frame. Where the run-in line's translation needs both of its lines, one leading a unit held the prompt, with
    // room to spare in its frame, to the original's pitch: set solid beside a box whose run-in line took one line and whose
    // prompt spread. A paragraph's leading is its own (the owner's ruling of 2026-11-08, (a)), each paragraph TeX states one)
    const { ys, lay } = zhPage()
    const m = member({
      ord: 1,
      lines: [...ys(640, 2, 12), ...ys(612, 4, 9, 82, 290, 8)],
      spans: [['4', { cmd: 'mypython', opens: 2 }]],
      room: { below: 25, next: 32 },
    })
    const laid = lay(m, [
      { t: 'text', s: '\u6587'.repeat(60) },
      { t: 'span', id: '4', content: [{ t: 'text', s: '\u5b57'.repeat(60) }] },
    ])
    expect(laid.state).toBe('laid')
    const prompt = laid.lines.filter((l) => l[3].some((it) => it.s.includes('\u5b57')))
    // (the run-in text on its two lines, at the original's pitch: it needs both)
    expect(laid.lines.slice(0, 2).map(([y]) => y)).toEqual([640, 628])
    // (the prompt from its own first line, its two lines spread over its frame as its neighbours' are, not at the pitch of 9)
    expect(prompt.length).toBe(2)
    expect(prompt[0]![0]).toBe(612)
    expect(prompt[0]![0] - prompt[1]![0]).toBeGreaterThan(1.5 * 9)
  })
  it('holds the gap under a paragraph inside a unit to that paragraph’s own leading, as under its last (the ruling of 2026-11-08)', () => {
    // (the first of two paragraphs TeX states in a unit, three lines of translation in four, filled at its own leading: its
    // last line no nearer the second paragraph's first than that leading, TeX's own skip there kept, as footFloorAt holds the gap
    // under the unit's last line; spread to its frame's foot it stood 12 over a paragraph its lines stood 18 apart in)
    const { ys, lay } = zhPage()
    const m = member({
      ord: 1,
      lines: [...ys(640, 4, 12), ...ys(592, 2, 12)],
      spans: [['4', { opens: 4 }]],
      room: { below: 30, next: 36 },
    })
    const laid = lay(m, [
      { t: 'text', s: '\u6587'.repeat(110) },
      { t: 'span', id: '4', content: [{ t: 'text', s: '\u5b57'.repeat(20) }] },
    ])
    expect(laid.state).toBe('laid')
    const first = laid.lines.filter((l) => l[3].some((it) => it.s.includes('\u6587'))).map(([y]) => y)
    const second = laid.lines.filter((l) => l[3].some((it) => it.s.includes('\u5b57'))).map(([y]) => y)
    expect([first.length, second]).toEqual([3, [592]])
    const pitch = (first[0]! - first[2]!) / 2
    expect(pitch).toBeGreaterThan(12)
    expect(first[2]! - 592).toBeGreaterThanOrEqual(pitch - 0.05)
  })
  // (a page of a column: paragraphs `units`, each [ord, kind, first baseline, original lines, characters of translation], 12 apart,
  // the room under each TeX's (Room.runs: the next ink `below` under its last line, its text block's bottom far; Room.sep 15, a
  // \parskip of 3)
  const listPage = (units: [number, string, number, number, number][], next: number) => {
    const zh = rulesFor('zh')
    const at = (y: number): Placed['lines'][number] => [1, 0, 72, 300, y, y + 7, y - 2, 72, 300, 0, 10]
    const ms = units.map(([ord, kind, y0, n], i) => {
      const below = (units[i + 1]?.[2] ?? next) - (y0 - 12 * (n - 1))
      return member({
        ord,
        kind,
        text: String(ord).padStart(64, 'e'),
        lines: Array.from({ length: n }, (_, k) => at(y0 - 12 * k)),
        room: { below: -below, next: -below, runs: [[n - 1, -below, 300]], sep: 15 },
      })
    })
    const rows = rowsOf(
      units.map(([ord, , , , chars]) => ({
        ...row([{ t: 'text', s: '\u6587'.repeat(chars) }]),
        id: String(ord).padStart(64, 'e'),
      })),
      true,
    )
    return layPage({ ...part(ms[0]!), flows: [ms] }, rows, zh, metrics()).members
  }
  it('lets a paragraph that borrows the room under it fill it at its own leading, its gap measured from the borrow’s limit', () => {
    // (option (i), shown to the owner before it is adopted: 1810.04805v2's references, an entry that needs all three of its
    // lines set at the original's pitch among entries spread to 1.38; the room under it TeX's (the next entry 22 under its last
    // line, its separation 15) was the borrow's, but the gap floor kept the original's whole skip under it at any looser leading)
    const laid = listPage(
      [
        [1, 'para', 700, 4, 80],
        [2, 'para', 640, 3, 130],
        [3, 'para', 594, 4, 80],
      ],
      540,
    )
    const m = laid.find((x) => x.ord === 2)!
    expect(m.lines.length).toBe(3)
    const pitch = m.lines[0]![0] - m.lines[1]![0]
    expect(pitch).toBeGreaterThan(13)
    // (its last line no nearer the next than its own pitch and the \parskip: the borrow's limit at its leading)
    expect(m.lines.at(-1)![0] - 594).toBeGreaterThanOrEqual(pitch + 3 - 0.05)
  })
  it('holds the gap under a paragraph’s one line at the top of the next column to its own leading: the paragraph under it starts lower', () => {
    // (the owner on staging, 2610.20967v1-zh p4: a paragraph spread over the foot of the left column ends in one line at the top
    // of the right, TeX's widow line, its next paragraph a pitch under it, no \parskip. That line cannot rise (the column's first
    // line) and the next paragraph's first line stays on TeX's: the gap stayed the original's pitch, 10.41, under a paragraph
    // set at 14.78 and over one at 13.43. A paragraph's leading is the whole paragraph's: its frame of one line has none of its
    // own and takes the frame before's, and where the paragraph cannot end higher the one under it starts lower)
    const zh = rulesFor('zh')
    const at = (y: number, x0: number, x1: number): Placed['lines'][number] => [
      1,
      0,
      x0,
      x1,
      y,
      y + 7,
      y - 2,
      x0,
      x1,
      0,
      10,
    ]
    const ids = ['b', 'c'].map((c) => c.repeat(64))
    const left = (y0: number, n: number) => Array.from({ length: n }, (_, i) => at(y0 - 12 * i, 72, 300))
    const right = (y0: number, n: number) => Array.from({ length: n }, (_, i) => at(y0 - 12 * i, 320, 548))
    // (a paragraph over the two columns, five lines and one, its translation three lines: two over the left's five, one on the
    // right's first; the next paragraph under it in the right column, two lines of translation in four)
    const a = member({ ord: 0, lines: [...left(640, 5), ...right(700, 1)], room: { below: 0, next: 12 } })
    const b = member({ ord: 1, text: ids[0], lines: right(688, 4), room: { below: 200, next: 212 } })
    const rows = rowsOf(
      [row([{ t: 'text', s: '\u6587'.repeat(110) }]), { ...row([{ t: 'text', s: '\u5b57'.repeat(80) }]), id: ids[0]! }],
      true,
    )
    const laid = layPage({ ...part(a), flows: [[a, b]] }, rows, zh, metrics()).members
    const [la, lb] = [laid.find((x) => x.ord === 0)!, laid.find((x) => x.ord === 1)!]
    expect([la.state, lb.state]).toEqual(['laid', 'laid'])
    const ys = la.lines.map(([y]) => y)
    // (its lines: those of the left column spread looser than the pitch, the last on the right column's first line)
    expect(ys.at(-1)).toBe(700)
    const own = ys[0]! - ys[1]!
    expect(own).toBeGreaterThan(12.5)
    // (the next paragraph's first line its own leading's distance under it, no nearer)
    expect(700 - lb.lines[0]![0]).toBeGreaterThanOrEqual(own - 0.05)
    expect(lb.lines.length).toBe(2)
  })
  it('grows a page’s body a step at a time, to the largest every body unit still holds, a page that holds none tried once', () => {
    // (the page fill's one size, today's effect (the owner, 2026-11-08: it should look about as today's does), found with the fewest lays:
    // from the original's size up a step (0.025) at a time, the first step a unit no longer holds ending it. A German paragraph
    // of two lines at the original's pitch is short of its frame; with room on its lines it grows (to 1.075), and filling them it
    // holds no step: tried at the first alone, whatever the cap (each try lays it: its lines' extents read, Metrics.ink, once
    // each). Today's halving tried 1.05 and then 1.025)
    const de = rulesFor('de')
    const grown = (x1: number, cap: number) => {
      let reads = 0
      const counted: Metrics = { ...metrics(), ink: () => (reads++, [0.7, 0.2, 0]) }
      const m = member({
        lines: [
          [1, 0, 72, x1, 700, 707, 698, 72, x1, 0, 10],
          [1, 0, 72, x1, 688, 695, 686, 72, x1, 0, 10],
        ],
        room: { below: 200, next: 212 },
      })
      const R = {
        ...de,
        set: { ...de.set, adaptiveFill: { ...(de.set.adaptiveFill as object), size: cap } },
      } as unknown as typeof de
      const [laid] = layPage(part(m), rowsOf([row([{ t: 'text', s: 'wort '.repeat(18).trim() }])]), R, counted).members
      return { size: laid!.fit!.size, reads }
    }
    expect(grown(300, 1.1).size).toBe(10.75)
    const [none, one, all] = [grown(286, 1), grown(286, 1.025), grown(286, 1.1)]
    expect([none.size, one.size, all.size]).toEqual([10, 10, 10])
    expect(one.reads).toBeGreaterThan(none.reads)
    expect(all.reads).toBe(one.reads)
  })
  it('keeps a page number’s size and its end: a foot line set flush right grows leftwards into its free row', () => {
    // (the owner's ruling of 2026-11-08: 2609.36054v2's "page 13 of 14" at the text block's right edge (548.28) was laid from the
    // original's start and shrunk to 0.825 of its size; its translation keeps the original's size and ends where it ends)
    const foot = (o: Partial<Placed> = {}) =>
      member({
        kind: 'inkheads',
        align: 'r',
        lines: [[1, 1, 494.57, 548.28, 34.64, 41.31, 32.69, 302.19, 550.02, 0, 10]],
        room: { below: 32.69, side: [302.19, 550.02] },
        ...o,
      })
    const still: typeof rules = { ...rules, set: { ...rules.set, adaptiveFill: false } as unknown as typeof rules.set }
    // (15 characters at half a size each: 75 pt, the original's line 53.71 pt)
    const [laid] = layPage(part(foot()), rowsOf([row([{ t: 'text', s: 'Seite 13 von 14' }])]), still, metrics()).members
    expect(laid!.state).toBe('laid')
    expect(laid!.fit!.size).toBe(10)
    // (its text from 473.28 to the original's end, its line the free row's from 302.19: a flush-right line's slack before it)
    const [, x0, x1, items] = laid!.lines[0]!
    expect([x0, items[0]!.x, x1]).toEqual([302.19, 473.28, 548.28])
    // (longer than the free row before it (the ink on its baseline at 480, half a size off: 63.28 pt), which it would fit at
    // 0.825 of its size: never shrunk, left the original's)
    const crowded = foot({ room: { below: 32.69, side: [480, 550.02] } })
    const [left] = layPage(
      part(crowded),
      rowsOf([row([{ t: 'text', s: 'Seite 13 von 14' }])]),
      still,
      metrics(),
    ).members
    expect(left!.state).not.toBe('laid')
    expect(left!.fit).toBeUndefined()
  })
  it('caps a size tie by scale, not by points: a run-in head of a smaller size keeps the original’s ratio (S3)', () => {
    // (2610.30034v1 p2: a head at 8.97 and its paragraph at 9.96, both laid at their size, the paragraph capped at 8.97, 0.9 of
    // its own; one paragraph's text even (the maintainer's ruling) is one scale for both)
    const idB = 'b'.repeat(64)
    const head = (o: Partial<Placed> = {}) =>
      member({
        ord: 0,
        kind: 'heading',
        style: { role: 'serif', size: 9, bold: 1, design: 'NimbusRomNo9L-Medi' },
        lines: [[1, 0, 72, 300, 700, 706.3, 698.2, 72, 300, 0, 9]],
        room: { below: 0, next: 300 },
        ...o,
      })
    const para = member({
      ord: 1,
      text: idB,
      lines: [[1, 0, 72, 300, 600, 607, 598, 72, 300, 0, 10]],
      room: { below: 0, next: 300 },
    })
    const sizes = (h: Placed, headText: string) => {
      const pt: Part = { ...part(h), flows: [[h], [para]], ties: [{ rule: 'size', ords: [0, 1] }] }
      const rows = rowsOf([row([{ t: 'text', s: headText }]), { ...row([{ t: 'text', s: 'ein Satz' }]), id: idB }])
      return layPage(pt, rows, rules, metrics()).members.map((m) => m.fit?.size)
    }
    // (both at their own size: the paragraph is not capped at the head's 9)
    expect(sizes(head(), 'Kopf')).toEqual([9, 10])
    // (the head shrunk to fit its line, the paragraph at the head's scale, not at its size in points)
    const [h, p] = sizes(head(), 'wort '.repeat(12).trim())
    expect(h).toBeLessThan(9)
    expect(p).toBeCloseTo((10 * h!) / 9, 6)
  })
  it('lays a size tie’s members at one scale where capping the one laid larger frees the other on the row they share', () => {
    // (2608.16117v1-de p19 t57 and t59, a paragraph TeX's float cut in two, the second starting on the first's last row: the
    // first laid at its 0.9, the second at 0.875; the first capped, its last line ended sooner, and the second, laid again
    // uncapped on the row it then had, came out at 0.975: one paragraph at two sizes)
    const idB = 'b'.repeat(64)
    const a = member({
      lines: [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 250, 688, 695, 686, 72, 300, 0, 10],
      ],
      room: { below: 0, next: 300 },
    })
    const b = member({
      ord: 1,
      text: idB,
      join: [6],
      lines: [[1, 0, 256, 300, 688, 695, 686, 72, 300, 2, 10]],
      room: { below: 0, next: 300 },
    })
    const words = (n: number) =>
      'wort '
        .repeat(Math.ceil(n / 5))
        .slice(0, n)
        .trim()
    const rows = rowsOf([row([{ t: 'text', s: words(82) }]), { ...row([{ t: 'text', s: words(12) }]), id: idB }])
    const still: typeof rules = { ...rules, set: { ...rules.set, adaptiveFill: false } as unknown as typeof rules.set }
    const sizes = (ties: Part['ties']) =>
      layPage({ ...part(a), flows: [[a, b]], ties }, rows, still, metrics()).members.map((m) => m.fit?.size)
    // (apart: the first at its size, the second shrunk on the row the first leaves it)
    const [fa, fb] = sizes([])
    expect(fa).toBe(10)
    expect(fb).toBeLessThan(10)
    // (tied: one size, the smaller)
    expect(sizes([{ rule: 'size', ords: [0, 1] }])).toEqual([fb, fb])
  })
  it('lays a member’s trail as its crop after its translation’s end, and the member after it on the row from there (2604.14228v3)', () => {
    // (a class's marks and separator after an author's name, no unit's, the leader's trail (El.trail): left where TeX set them,
    // the next name stood at its original's start past a hole; carried, the names run on as TeX's line did)
    const idB = 'b'.repeat(64)
    const liu = member({
      ord: 0,
      kind: 'author',
      align: 'l',
      lines: [[1, 0, 72, 158.4, 700, 707, 698, 72, 300, 0, 10]],
      els: [['~', { kind: 'other', copy: '1,*,', ink: [[1, 144, 701.8, 158.4, 707.2, 703]], trail: 1 }]],
      room: { below: 20, next: 24, side: [72, 300] },
    })
    const zhao = member({
      ord: 1,
      kind: 'author',
      align: 'l',
      text: idB,
      join: [3],
      lines: [[1, 0, 161.4, 233.4, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 20, next: 24, side: [72, 300] },
    })
    const rows = rowsOf([row([{ t: 'text', s: 'Jia' }]), { ...row([{ t: 'text', s: 'Zhao' }]), id: idB }], true)
    const laid = layPage({ ...part(liu), flows: [[liu, zhao]] }, rows, rules, metrics()).members
    expect(laid.map((m) => m.state)).toEqual(['laid', 'laid'])
    // (its trail cut from where TeX set it and drawn right after the translation, its group off with its text; set on its line
    // as TeX set it there: the crop's baseline the line's, so that its marks stand as far over the translation's baseline as
    // over the original's. By its glyphs' own baseline, all of them raised, 703, they were drawn 3 pt low, on the line:
    // 2610.10069v1 p1's daggers, 1706.03762v7 p1's first name's star)
    const items = laid[0]!.lines[0]![3]
    const crop = items.find((it) => 'src' in it) as Item & { src: number[]; x: number; w: number }
    expect(crop.src.slice(1)).toEqual([143.6, 701.5, 158.8, 707.5, 700])
    const text = items.find((it) => 'face' in it) as Item & { x: number }
    expect(crop.x).toBeCloseTo(text.x + 15, 5)
    expect(laid[0]!.off & 3).toBe(3)
    // (the next name from the trail's drawn end (its crop's, a crop's antialiased edge with it, as an element's at a line's end),
    // at TeX's separation: no hole)
    expect(laid[1]!.lines[0]![1]).toBeCloseTo(crop.x + crop.w + 3, 5)
    // (and a third from the second's end, though the second, laid from the first's, stands left of its own original: the row it
    // shares is where its block was laid from, not its original's extent alone; read so, the third stood at the second's
    // original start, 2610.22065v1's ACM reference format every other name)
    const idC = 'c'.repeat(64)
    const shang = member({
      ord: 2,
      kind: 'author',
      align: 'l',
      text: idC,
      join: [3],
      lines: [[1, 0, 236.4, 290.4, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 20, next: 24, side: [72, 300] },
    })
    const rows3 = rowsOf(
      [
        row([{ t: 'text', s: 'Jia' }]),
        { ...row([{ t: 'text', s: 'Zhao' }]), id: idB },
        { ...row([{ t: 'text', s: 'Shang' }]), id: idC },
      ],
      true,
    )
    // (the faces' ink reaching their advances' end, so that a name's ink ends where its text does)
    const inked: Metrics = { ...metrics(), ink: (_f, size, t) => [0.7, 0.2, (size * [...t].length) / 2] }
    const three = layPage({ ...part(liu), flows: [[liu, zhao, shang]] }, rows3, rules, inked).members
    expect(three[2]!.lines[0]![1]).toBeCloseTo(three[1]!.lines[0]![2] + 3, 5)
  })
  it('lays a trail TeX set past a word’s gap that far after the translation’s end (El.sep, 1706.03762v7’s last name)', () => {
    // (NeurIPS' `Illia Polosukhin\footnotemark[1]\hspace{1.7mm} \thanks{…}`: the ‡, 7.3 pt after the name, its trail (§18.58);
    // glued, it stood against the translation's last character where TeX set a skip)
    const illia = member({
      ord: 0,
      kind: 'author',
      align: 'c',
      lines: [[1, 0, 200, 279.5, 700, 707, 698, 72, 540, 0, 10]],
      els: [['~', { kind: 'other', copy: '‡', ink: [[1, 275.3, 699, 279.5, 706, 703.6]], trail: 1, sep: 7.3 }]],
      room: { below: 20, next: 24, side: [72, 540] },
    })
    const laid = layPage(part(illia), rowsOf([row([{ t: 'text', s: 'Illia' }])], true), rules, metrics()).members
    expect(laid[0]!.state).toBe('laid')
    const items = laid[0]!.lines[0]![3]
    const crop = items.find((it) => 'src' in it) as Item & { x: number }
    const text = items.find((it) => 'face' in it) as Item & { x: number }
    // (the text 25 pt, TeX's gap, then the crop: its rectangle opens 0.4 before its ink, as a glued trail's does)
    expect(laid[0]!.fit?.size).toBe(10)
    expect(crop.x).toBeCloseTo(text.x + 25 + 7.3, 5)
    // (the unit's own skip at its end, `\hspace{1.7mm}` an element, lies inside the gap TeX set: the gap is laid, not the skip
    // and the gap. Added, 1706.03762v7's ‡ stood 8.85 pt after the star where TeX set it 3.22 pt)
    const skip: El = { kind: 'zero', ink: [], glue: [4.82, 'bp', 1] }
    const ended = { ...illia, els: [['2', skip], ...(illia.els ?? [])] as Placed['els'] }
    const rowSkip = row([
      { t: 'text', s: 'Illia' },
      { t: 'el', id: '2' },
    ])
    const laid2 = layPage(part(ended), rowsOf([rowSkip], true), rules, metrics()).members
    const items2 = laid2[0]!.lines[0]![3]
    const crop2 = items2.find((it) => 'src' in it) as Item & { x: number }
    const text2 = items2.find((it) => 'face' in it) as Item & { x: number }
    expect(crop2.x).toBeCloseTo(text2.x + 25 + 7.3, 5)
  })
  it('lays a line of several members TeX centred as one run, centred where TeX centred the line (2610.21106v1’s “A AND B”)', () => {
    // (amsart's authors: one centred paragraph, its names two units and the "AND" between them text no unit owns, made on A;
    // each member's translation shorter than its original. Laid each by itself, the first name stood centred on its own
    // original's middle, the AND ran on after it, and the second name stayed centred on its own: a hole before it. TeX
    // centred the line as a whole: its names and separators run on, the run centred on the line's middle)
    const idB = 'b'.repeat(64),
      idC = 'c'.repeat(64)
    const line = (x0: number, x1: number) => [1, 0, x0, x1, 700, 707, 698, 72, 540, 0, 10] as Placed['lines'][number]
    const ni = member({
      ord: 0,
      kind: 'author',
      align: 'c',
      lines: [line(230, 280)],
      room: { below: 20, side: [72, 283.8] },
    })
    const and = member({
      ord: 1,
      kind: 'inkorphan',
      align: 'j',
      text: idB,
      join: [3.8],
      lines: [line(283.8, 304)],
      room: { below: 20, side: [280, 307.9] },
    })
    const yuni = member({
      ord: 2,
      kind: 'author',
      align: 'c',
      text: idC,
      join: [3.9],
      lines: [line(307.9, 376)],
      room: { below: 20, side: [304, 540] },
    })
    const rows3 = rowsOf(
      [
        row([{ t: 'text', s: 'Ni' }]),
        { ...row([{ t: 'text', s: 'und' }]), id: idB },
        { ...row([{ t: 'text', s: 'Yuni' }]), id: idC },
      ],
      true,
    )
    const inked: Metrics = { ...metrics(), ink: (_f, size, t) => [0.7, 0.2, (size * [...t].length) / 2] }
    const lay = (flows: Placed[][]) => layPage({ ...part(ni), flows }, rows3, rules, inked).members
    // (each member's drawn text: its first item's start, its line's end)
    const ends = (ms: ReturnType<typeof lay>) =>
      ms.map((m) => [(m.lines[0]![3][0] as Item & { x: number }).x, m.lines[0]![2]] as const)
    const run = lay([[ni, and, yuni]])
    expect(run.map((m) => m.state)).toEqual(['laid', 'laid', 'laid'])
    const [a, b, c] = ends(run)
    // (each from the one before's end at TeX's separation: no hole)
    expect(b![0]).toBeCloseTo(a![1] + 3.8, 5)
    expect(c![0]).toBeCloseTo(b![1] + 3.9, 5)
    // (the run centred on the line's middle, its first glyph's start and its last one's end as TeX set them)
    expect((a![0] + c![1]) / 2).toBeCloseTo((230 + 376) / 2, 5)
    // (a line TeX set flush left runs on from its start, as before: its first member where TeX set it)
    const left = ends(
      lay([
        [
          { ...ni, align: 'l' },
          { ...and, align: 'l' },
          { ...yuni, align: 'l' },
        ],
      ]),
    )
    expect(left[0]![0]).toBeCloseTo(230, 5)
    expect(left[2]![0]).toBeCloseTo(left[1]![1] + 3.9, 5)
    // (one TeX set flush right ends where TeX ended it, the run before it)
    const right = ends(
      lay([
        [
          { ...ni, align: 'r' },
          { ...and, align: 'r' },
          { ...yuni, align: 'r' },
        ],
      ]),
    )
    expect(right[1]![0]).toBeCloseTo(right[0]![1] + 3.8, 5)
    expect(right[2]![1]).toBeCloseTo(376, 5)
    // (and one whose members' marks state no alignment alike, or none of TeX's, is laid member by member as before: here the
    // second name's mark says justified, so the first name stays centred on its own original's middle)
    const mixed = ends(lay([[ni, and, { ...yuni, align: 'j' }]]))
    expect((mixed[0]![0] + mixed[0]![1]) / 2).toBeCloseTo(255, 5)
    // (in a CJK target, under the page's fill: the fill tracks a unit short of its leading's fill, which none of the run's may
    // be, its last one no more than those laid before another (S.share): tracked, the last name ran on past where the run was
    // centred, 2610.10069v1's third name 5.7 pt and its line 3.2 pt right of TeX's middle)
    const zh = rulesFor('zh')
    const body = member({
      ord: 3,
      text: 'd'.repeat(64),
      lines: [
        [1, 0, 72, 540, 600, 607, 598, 72, 540, 0, 10],
        [1, 0, 72, 540, 588, 595, 586, 72, 540, 0, 10],
        [1, 0, 72, 300, 576, 583, 574, 72, 540, 0, 10],
      ],
      room: { below: 20, next: 24 },
    })
    const rowsZh = rowsOf(
      [
        row([{ t: 'text', s: '\u502a\u9999' }]),
        { ...row([{ t: 'text', s: '\u4ee5\u53ca' }]), id: idB },
        { ...row([{ t: 'text', s: '\u718a\u5141\u59ae' }]), id: idC },
        { ...row([{ t: 'text', s: '\u8fd9\u662f\u4e00\u6bb5\u6b63\u6587\u3002'.repeat(12) }]), id: 'd'.repeat(64) },
      ],
      true,
    )
    const filled = layPage({ ...part(ni), flows: [[ni, and, yuni], [body]] }, rowsZh, zh, inked).members
    expect(filled.slice(0, 3).map((m) => m.state)).toEqual(['laid', 'laid', 'laid'])
    const [fa, , fc] = ends(filled)
    expect(filled.slice(0, 3).map((m) => m.fit?.track)).toEqual([0, 0, 0])
    expect((fa![0] + fc![1]) / 2).toBeCloseTo((230 + 376) / 2, 5)
  })
  it('lays a line of several members TeX set flush left as one run from its start, at their size (2609.20976v1’s names)', () => {
    // (JCAP's \author: `#2$^{#1}$\ ` for each, its names one flush-left line, each mark after a name the next name's label. Each
    // laid by itself, a member's room ended at the next one's label (Room.side), half its size before it, though that label
    // moves with the next member, laid from this one's end: the first name shrank to 0.9 there and the tie took the others
    // with it, the line's room free after the last. TeX set the line as a whole: its names and marks run on from its start)
    const ids = ['b', 'c'].map((c) => c.repeat(64))
    const ln = (x0: number, x1: number) => [1, 0, x0, x1, 700, 707, 698, 72, 540, 0, 10] as Placed['lines'][number]
    const mark = (x: number): Placed['label'] => ({
      kind: 'number',
      ink: [1, x, 703, x + 4, 708, 703],
      style: { role: 'serif', size: 7, design: 'NimbusRomNo9L-Regu' },
      line: 0,
    })
    const name = (o: Partial<Placed>) => member({ kind: 'author', align: 'l', ...o })
    const a = name({ ord: 0, lines: [ln(72, 130)], room: { below: 20, side: [72, 136] } })
    const b = name({
      ord: 1,
      text: ids[0],
      join: [16, 1],
      label: mark(136),
      lines: [ln(146, 200)],
      room: { below: 20, side: [130, 206] },
    })
    const c = name({
      ord: 2,
      text: ids[1],
      join: [16, 1],
      label: mark(206),
      lines: [ln(216, 270)],
      room: { below: 20, side: [200, 540] },
    })
    const rows3 = rowsOf(
      [
        row([{ t: 'text', s: 'Gautam Bhuyan' }]),
        { ...row([{ t: 'text', s: 'Tathagata' }]), id: ids[0]! },
        { ...row([{ t: 'text', s: 'Surhud' }]), id: ids[1]! },
      ],
      true,
    )
    const inked: Metrics = { ...metrics(), ink: (_f, size, t) => [0.7, 0.2, (size * [...t].length) / 2] }
    const lay = (flows: Placed[][]) => layPage({ ...part(a), flows }, rows3, rules, inked).members
    const laid = lay([[a, b, c]])
    expect(laid.map((m) => m.state)).toEqual(['laid', 'laid', 'laid'])
    // (every name at its size, the first from TeX's start, each after the one before at TeX's separation, its mark before it)
    expect(laid.map((m) => m.fit?.size)).toEqual([10, 10, 10])
    expect(laid[0]!.lines[0]![1]).toBeCloseTo(72, 5)
    const start = (k: number) => Math.min(...laid[k]!.lines[0]![3].map((it) => it.x))
    expect(start(1)).toBeCloseTo(laid[0]!.lines[0]![2] + 6, 5)
    expect(start(2)).toBeCloseTo(laid[1]!.lines[0]![2] + 6, 5)
    // (what stays as before: a line whose members no alignment of TeX's states alike, its marks' (here `read` says the prepare
    // read it off the page), each laid by itself as before; and a run that does not hold the translation, its line full to the
    // column's end, laid member by member as before)
    const unread = (m: Placed): Placed => ({ ...m, read: ['align'] })
    expect(lay([[unread(a), unread(b), unread(c)]]).map((m) => m.fit?.size)).toEqual([9, 10, 10])
    const full = (m: Placed, k: number): Placed => (k === 2 ? { ...m, lines: [ln(216, 540)] } : m)
    const longRows = rowsOf(
      [
        row([{ t: 'text', s: 'Gautam Bhuyan Gautam Bhuyan Gautam Bhuyan' }]),
        { ...row([{ t: 'text', s: 'Tathagata Tathagata Tathagata Tathagata' }]), id: ids[0]! },
        { ...row([{ t: 'text', s: 'Surhud More Surhud More Surhud More Surhud More' }]), id: ids[1]! },
      ],
      true,
    )
    const fullRow = [a, b, c].map(full)
    const before = layPage({ ...part(a), flows: [fullRow.map(unread)] }, longRows, rules, inked).members
    const after = layPage({ ...part(a), flows: [fullRow] }, longRows, rules, inked).members
    expect(after.map((m) => [m.fit?.size, m.lines.map((l) => [l[0], l[1], l[2]])])).toEqual(
      before.map((m) => [m.fit?.size, m.lines.map((l) => [l[0], l[1], l[2]])]),
    )
  })
  it('lays the names of a centred paragraph over several lines as one run, each line centred as TeX centred it (2611.00342v1)', () => {
    // (IJCAI's \author: its names one centred paragraph TeX broke over three lines, each \and's comma the next name's stated
    // label, a name over two lines. Laid each by itself, each name stood centred on its own original's middle with its comma
    // before it (a hole before each comma), a name over two lines broken over both, and a name's marks alone on the last line.
    // TeX set the paragraph as a whole: its names, commas and marks run on, each line centred on the paragraph's middle)
    const ids = ['b', 'c', 'd'].map((c) => c.repeat(64))
    const ln = (x0: number, x1: number, y = 700) =>
      [1, 0, x0, x1, y, y + 7, y - 2, 72, 540, 0, 10] as Placed['lines'][number]
    const comma = (x: number, y = 700): Placed['label'] => ({
      kind: 'number',
      ink: [1, x, y - 1, x + 2, y + 2, y],
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      punct: [',', [1, x, y - 1, x + 2, y + 2, y]],
      line: 0,
    })
    const name = (o: Partial<Placed>) => member({ kind: 'author', align: 'c', room: { below: 20 }, ...o })
    // (row 1: Aa Aa, its comma, Bb Bb, its comma and Cc's first word; row 2: Cc's second word, the comma, Dd Dd: centred on 300)
    const a = name({ ord: 0, lines: [ln(190, 250)], room: { below: 20, side: [72, 252] } })
    const b = name({
      ord: 1,
      text: ids[0],
      join: [8, 1],
      label: comma(252),
      lines: [ln(258, 318)],
      room: { below: 20, side: [250, 320] },
    })
    const c = name({ ord: 2, text: ids[1], join: [8, 1], label: comma(320), lines: [ln(326, 410), ln(250, 290, 688)] })
    const d = name({
      ord: 3,
      text: ids[2],
      join: [8, 1],
      label: comma(292, 688),
      lines: [ln(298, 350, 688)],
      room: { below: 20, side: [290, 540] },
    })
    const rows4 = rowsOf(
      [
        row([{ t: 'text', s: 'Aa' }]),
        { ...row([{ t: 'text', s: 'Bb' }]), id: ids[0]! },
        { ...row([{ t: 'text', s: 'Cc' }]), id: ids[1]! },
        { ...row([{ t: 'text', s: 'Dd' }]), id: ids[2]! },
      ],
      true,
    )
    const inked: Metrics = { ...metrics(), ink: (_f, size, t) => [0.7, 0.2, (size * [...t].length) / 2] }
    const laid = layPage({ ...part(a), flows: [[a, b, c, d]] }, rows4, rules, inked).members
    expect(laid.map((m) => m.state)).toEqual(['laid', 'laid', 'laid', 'laid'])
    // (the four short translations on the paragraph's first line, each name one line, none left on the second)
    expect(laid.map((m) => m.lines.map((l) => l[0]))).toEqual([[700], [700], [700], [700]])
    // (each name's comma, a mark no line opens with, at the end of the name before, from its ink's end at TeX's separation (its
    // crop from that end on A), and each name from the one before's ink end at TeX's separation, 8 pt, its comma between: no hole)
    const spans = laid.map((m) => [Math.min(...m.lines[0]![3].map((it) => it.x)), m.lines[0]![2]] as const)
    for (let k = 1; k < 4; k++) {
      const comma = laid[k - 1]!.lines[0]![3].at(-1)!
      expect('src' in comma && comma.s).toBe(',')
      expect(laid[k]!.lines[0]![3][0]!.x).toBeCloseTo(comma.x + 8, 5)
    }
    // (each comma drawn once: a name whose comma goes at the end of the name before has its label's group off on its page, as
    // where it drew the crop itself, so the original's comma is not drawn where it stands as well (Codex on #634, round 8 B5);
    // the first name has no label)
    expect(laid.map((m) => m.off & 4)).toEqual([0, 4, 4, 4])
    // (the whole of each name's `off`, as the review's reproduction states it: its text off, and its label's group off where
    // its comma went to the name before; the last name's was 1 before)
    expect(laid.map((m) => m.off)).toEqual([1, 5, 5, 5])
    // (one owner on both panes, the label's: each comma, drawn at the end of the name before, is lit with its owner's first
    // sentence on the right as on A, in no box of the name before's; the cover reads it as its owner's piece and finds it in one
    // sentence on each pane; and its crop is cut by its owner's label ink, not the name before's (lay/clips.ts). The
    // coordinator's ruling of 2026-11-11 on round 8 B6's merge of sent-cover's follow-up)
    const page4 = layPage({ ...part(a), flows: [[a, b, c, d]] }, rows4, rules, inked)
    const cv = newCover()
    coverOf(cv, page4, { ...part(a), flows: [[a, b, c, d]] }, inked)
    coverDone(cv)
    expect([...cv.faults]).toEqual([])
    const owners = [b, c, d]
    for (let k = 1; k < 4; k++) {
      const at = page4.members[k - 1]!.lines[0]!
      const crop = at[3].at(-1)! as Extract<Item, { src: unknown }>
      const mid = [crop.x + ((crop.src[3] - crop.src[1]) * (crop.k || 1)) / 2, at[0]] as const
      const holds = (boxes: number[][][]) =>
        boxes.flat().some((q) => q[0]! <= mid[0] && mid[0] <= q[2]! && q[1]! <= mid[1] && mid[1] <= q[3]!)
      expect([holds(page4.members[k]!.lit.right), holds(page4.members[k - 1]!.lit.right)]).toEqual([true, false])
      const own = owners[k - 1]!.label!.ink
      expect(crop.ink).toEqual([
        [own[1], own[2], own[3], own[4]],
        [own[1], own[2], own[3], own[4]],
      ])
    }
    // (the run centred on the paragraph's middle, 300)
    expect((spans[0]![0] + spans[3]![1]) / 2).toBeCloseTo(300, 5)
    // (translations a line does not hold: the last name goes on to the paragraph's next line whole, its comma closing the line
    // before as TeX's \and set it, never cut between its characters; each line centred on the middle)
    const zh = rulesFor('zh')
    const long = (c: string) => [{ t: 'text' as const, s: c.repeat(25) }]
    const rowsZh = rowsOf(
      [
        row(long('\u7532')),
        { ...row(long('\u4e59')), id: ids[0]! },
        { ...row(long('\u4e19')), id: ids[1]! },
        { ...row(long('\u4e01')), id: ids[2]! },
      ],
      true,
    )
    const wide = layPage({ ...part(a), flows: [[a, b, c, d]] }, rowsZh, zh, inked).members
    expect(wide.map((m) => m.state)).toEqual(['laid', 'laid', 'laid', 'laid'])
    const [y1, y2] = [wide[0]!.lines[0]![0], wide[3]!.lines.at(-1)![0]]
    expect(y2).toBeLessThan(y1)
    const textOn = (m: (typeof wide)[number], y: number) =>
      m.lines.filter((l) => l[0] === y).flatMap((l) => l[3].flatMap((it) => ('src' in it ? [] : [it.s])))
    expect(textOn(wide[3]!, y1)).toEqual([])
    expect(textOn(wide[3]!, y2).join('')).toBe('\u4e01'.repeat(25))
    // (its comma on the first line, after the third name, its last item)
    const last1 = wide[2]!.lines.find((l) => l[0] === y1)?.[3].at(-1)
    expect(last1 && 'src' in last1 && last1.s).toBe(',')
    const line2 = wide[3]!.lines.find((l) => l[0] === y2)!
    expect((line2[1] + line2[2]) / 2).toBeCloseTo(300, 0)
    // (a paragraph its run does not hold whole — ink of the page after its last member on its last line, which Room.side
    // states: 2608.16117v1 p1's places, another flow's places after them on that line — is no run: its lines would take
    // and lose its members' text beside what stays there; laid member by member, as before)
    // (a mark no line opens with, by the breaker's own rule (UAX 14's IS, the target's line-start marks): the comma before a name
    // the line no longer holds stays at the end of the line before, with the name before it, and never opens a line. Here the
    // third name ends the first line at the room's end: its comma, the fourth's label, opened the second line, as
    // 2611.00342v1's second line on staging (round 8 B3). Each comma once, at no line's start)
    const tightRows = rowsOf(
      [
        row(long('\u7532')),
        { ...row(long('\u4e59')), id: ids[0]! },
        { ...row([{ t: 'text', s: '\u4e19'.repeat(38) }]), id: ids[1]! },
        { ...row(long('\u4e01')), id: ids[2]! },
      ],
      true,
    )
    const tight = layPage({ ...part(a), flows: [[a, b, c, d]] }, tightRows, zh, inked).members
    expect(tight.map((m) => m.state)).toEqual(['laid', 'laid', 'laid', 'laid'])
    const commas = tight.flatMap((m) => m.lines.flatMap((l) => l[3].filter((it) => 'src' in it && it.s === ',')))
    expect(commas.length).toBe(3)
    expect(tight.map((m) => m.off & 4)).toEqual([0, 4, 4, 4])
    for (const m of tight)
      for (const l of m.lines) {
        const first = l[3].reduce((p, q) => (q.x < p.x ? q : p))
        expect('src' in first && first.s === ',').toBe(false)
      }
    expect(rowLinesOf([[a, b, c, d]]).size).toBe(4)
    expect(rowLinesOf([[a, b, c, { ...d, room: { below: 20, side: [290, 400] } }]]).size).toBe(0)
  })
  it('sets a babel name drawn on its own in the target’s word (S.names over the part); one that leads a unit is that unit’s', () => {
    // ("Abstract" centred over its column: the target's word at its size, its centre kept, its text group off)
    const name = member({
      ord: 0,
      kind: 'name',
      text: { name: 'abstract' },
      plain: 'Abstract',
      align: 'c',
      style: { role: 'serif', size: 10, bold: 1, design: 'NimbusRomNo9L-Medi' },
      lines: [[1, 0, 140, 180, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 12, next: 20, side: [72, 300] },
    })
    const [laid] = layPage(part(name), rowsOf([], true), rules, metrics()).members
    expect(laid).toMatchObject({ state: 'laid', off: 1 })
    const [y, x0, x1, items] = laid!.lines[0]!
    expect(items.map((it) => ('face' in it ? it.s : ''))).toEqual(['Zusammenfassung'])
    // (its centre the original's: 160; the word 75 wide at the table metrics' half a size a character)
    expect([y, x0, x1]).toEqual([700, 122.5, 197.5])
    // (its word the original's already: left)
    const same = layPage(part({ ...name, plain: 'Zusammenfassung' }), rowsOf([], true), rules, metrics()).members[0]
    expect(same).toMatchObject({ state: 'name', off: 0 })
  })
  it('lays a name the part binds to the member after it as that member’s lead (amsthm’s "Proof." on its first row)', () => {
    // (today's RUN_IN: the name's word, the joint TeX set after it (the member's label "."), its glue, then the translation, the
    // line from the name's start; the name's text off with its member, both the original's where its member is not laid)
    const idB = 'b'.repeat(64)
    const proof = member({
      ord: 0,
      kind: 'name',
      text: { name: 'proof' },
      plain: 'Proof',
      bound: 1,
      style: { role: 'serif', size: 10, slant: 1, design: 'NimbusRomNo9L-ReguItal' },
      lines: [[1, 0, 72, 100, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 12, next: 20, side: [72, 100] },
    })
    const para = member({
      ord: 1,
      kind: 'theorem',
      text: idB,
      join: [10, 1],
      label: {
        kind: 'head',
        ink: [1, 100, 698, 103, 707, 700],
        style: { role: 'serif', size: 10, slant: 1 },
        punct: ['.', [1, 100, 698, 103, 707, 700]],
      },
      lines: [
        [1, 0, 110, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
      ],
    })
    const pt: Part = { ...part(proof), flows: [[proof, para]] }
    const rows = rowsOf([{ ...row([{ t: 'text', s: 'ein Satz' }]), id: idB }], true)
    const both = layPage(pt, rows, rules, metrics())
    expect(both.members[0]).toMatchObject({ state: 'laid', off: 1, lines: [] })
    const led = both.members[1]!
    expect(led).toMatchObject({ state: 'laid' })
    expect(led.off & 5).toBe(5)
    const first = led.lines[0]!
    expect(first[1]).toBe(72)
    expect(first[3].map((it) => it.s).join('')).toMatch(/^Beweis\.\s*ein Satz/)
    // (its member not laid: the name the original's with it)
    const none = layPage(pt, rowsOf([], true), rules, metrics())
    expect(none.members.map((m) => [m.state, m.off])).toEqual([
      ['bound', 0],
      ['none', 0],
    ])
  })
  it('sets a name on its own where the part binds it to none, whatever stands on its baseline in the other column', () => {
    // (Devin on #623: nameOf took any member to the right on the name's page and baseline for its run-in follower; a left
    // column's "Abstract" at 72-120 and the right column's paragraph at 320 on baseline 700 left the name the original's)
    const name = member({
      ord: 0,
      kind: 'name',
      text: { name: 'abstract' },
      plain: 'Abstract',
      style: { role: 'serif', size: 10, bold: 1, design: 'NimbusRomNo9L-Medi' },
      lines: [[1, 0, 72, 120, 700, 707, 698, 72, 290, 0, 10]],
      room: { below: 12, next: 20, side: [72, 290] },
    })
    const right = member({ ord: 1, text: 'b'.repeat(64), lines: [[1, 1, 320, 540, 700, 707, 698, 320, 540, 0, 10]] })
    const pt: Part = { ...part(name), flows: [[name], [right]] }
    const [laid] = layPage(pt, rowsOf([], true), rules, metrics()).members
    expect(laid).toMatchObject({ state: 'laid', off: 1 })
    expect(laid!.lines[0]![3].map((it) => it.s)).toEqual(['Zusammenfassung'])
  })
  it('sets the counter TeX set after a name after the target’s word (Word.counter)', () => {
    const name = member({
      ord: 0,
      kind: 'name',
      text: { name: 'appendix', counter: ['A', [1, 126, 698, 132, 707, 700]] },
      plain: 'APPENDIX',
      align: 'c',
      style: { role: 'serif', size: 10, upper: 1, design: 'NimbusRomNo9L-Regu' },
      lines: [[1, 0, 72, 132, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 12, next: 20, side: [72, 300] },
    })
    const [laid] = layPage(part(name), rowsOf([], true), rules, metrics()).members
    expect(laid!.lines[0]![3].map((it) => it.s).join('')).toBe('ANHANG A')
  })
  it('lays a name with the number TeX set before it (its label) as one line, centred whole where TeX centred the two', () => {
    // (2610.20967v1 p5: spconf.sty's "9. REFERENCES", centred in its column 54-300; the number the name's label (own.mjs MR 6c).
    // Its crop and the target's word, the original's 18 between their starts, the whole on the line's middle 177: its label
    // off with its text. Before, the word was set alone and the number stayed: a line left of the column's middle)
    const name = member({
      ord: 0,
      kind: 'name',
      text: { name: 'ref' },
      plain: 'REFERENCES',
      align: 'c',
      style: { role: 'serif', size: 10, bold: 1, upper: 1, design: 'NimbusRomNo9L-Medi' },
      label: {
        kind: 'head',
        ink: [1, 138, 698, 150, 707, 700],
        style: { role: 'serif', size: 10, bold: 1 },
        num: ['9', [1, 138, 698, 144, 707, 700]],
        punct: ['.', [1, 144, 698, 150, 707, 700]],
        line: 0,
      },
      lines: [[1, 0, 156, 216, 700, 707, 698, 54, 300, 0, 10]],
      room: { below: 12, next: 20, side: [54, 300] },
    })
    const [laid] = layPage(part(name), rowsOf([], true), rules, metrics()).members
    expect(laid).toMatchObject({ state: 'laid', off: 5 })
    // ("LITERATUR" 45 wide at the table metrics' half a size a character: the whole 63, from 145.5 to 208.5)
    const [y, x0, x1, items] = laid!.lines[0]!
    expect([y, x0, x1]).toEqual([700, 145.5, 208.5])
    expect(items[0]).toMatchObject({ s: '9.', x: 145.5, src: [1, 138, 698, 150, 707, 700], k: 1, piece: 'label' })
    expect(items.slice(1).map((it) => [it.s, it.x])).toEqual([['LITERATUR', 163.5]])
    // (read justified: its left edge kept, the number drawn where it stood, the word at its own start)
    const [left] = layPage(part({ ...name, align: 'j' }), rowsOf([], true), rules, metrics()).members
    expect(left).toMatchObject({ state: 'laid', off: 5 })
    expect(left!.lines[0]!.slice(0, 3)).toEqual([700, 138, 201])
    expect(left!.lines[0]![3].map((it) => [it.s, it.x])).toEqual([
      ['9.', 138],
      ['LITERATUR', 156],
    ])
    // (a page whose labels the add-on folded into the text's group (Placed.fixed): the label hidden with the word, its crop drawn)
    const [merged] = layPage(part({ ...name, fixed: 4 }), rowsOf([], true), rules, metrics()).members
    expect(merged).toMatchObject({ state: 'laid', off: 1 })
    expect(merged!.lines[0]![3][0]).toMatchObject({ s: '9.', piece: 'label' })
  })
  it('lights a name’s label with the name on both panes, the label TeX set before it its first sentence’s', () => {
    // (2610.20967v1 p5, "9. REFERENCES": the number the name's label since refs-head; its lit on A the name's line alone, the
    // label in no sentence: I10's "left none label". A label is its unit's first sentence's, on both panes)
    const name = member({
      ord: 0,
      kind: 'name',
      text: { name: 'ref' },
      plain: 'REFERENCES',
      align: 'c',
      style: { role: 'serif', size: 10, bold: 1, upper: 1, design: 'NimbusRomNo9L-Medi' },
      label: {
        kind: 'head',
        ink: [1, 138, 698, 150, 707, 700],
        style: { role: 'serif', size: 10, bold: 1 },
        num: ['9', [1, 138, 698, 144, 707, 700]],
        punct: ['.', [1, 144, 698, 150, 707, 700]],
        line: 0,
      },
      lines: [[1, 0, 156, 216, 700, 707, 698, 54, 300, 0, 10]],
      room: { below: 12, next: 20, side: [54, 300] },
    })
    const holds = (bs: readonly number[][], [x0, y0, x1, y1]: number[]) =>
      bs.some((b) => b[0]! <= x0! && b[1]! <= y0! && b[2]! >= x1! && b[3]! >= y1!)
    for (const m of [name, { ...name, fixed: 4 }]) {
      const page = layPage(part(m), rowsOf([], true), rules, metrics())
      const [laid] = page.members
      expect(laid!.lit.left).toHaveLength(1)
      expect(holds(laid!.lit.left[0]!, [138, 698, 150, 707])).toBe(true)
      const c = newCover()
      coverOf(c, page, part(m), metrics())
      coverDone(c)
      expect([...c.faults]).toEqual([])
    }
  })
  it('sets a name in capitals where its style is the text’s capitals (Style.upper), none where they are faked small capitals', () => {
    // (cloud Codex on #623: the bundle states a name's case in Style.upper, the entry read Word.caps alone: "ABSTRACT" laid as
    // "Zusammenfassung")
    const name = member({
      ord: 0,
      kind: 'name',
      text: { name: 'abstract' },
      plain: 'ABSTRACT',
      align: 'c',
      style: { role: 'serif', size: 10, upper: 1, design: 'NimbusRomNo9L-Regu' },
      lines: [[1, 0, 140, 190, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 12, next: 20, side: [72, 300] },
    })
    const words = (m: Placed) =>
      layPage(part(m), rowsOf([], true), rules, metrics()).members[0]!.lines[0]?.[3].map((it) => [
        it.s,
        'size' in it ? it.size : 0,
      ])
    expect(words(name)).toEqual([['ZUSAMMENFASSUNG', 10]])
    // (in faked small capitals: its word in its own case, its lowercase drawn as small capitals)
    expect(words({ ...name, plain: 'Abstract', style: { ...name.style, upper: undefined, sc: 0.8 } })).toEqual([
      ['Z', 10],
      ['USAMMENFASSUNG', 8],
    ])
  })
  it('carries an italic name’s synthetic slant in a CJK target (its face oblique: the item skewed, as D.display’s)', () => {
    // (cloud Codex on #623: faceOf states the slant as face.oblique, the name's items dropped it: the Japanese word upright)
    const ja = rulesFor('ja')
    const name = member({
      ord: 0,
      kind: 'name',
      text: { name: 'abstract' },
      plain: 'Abstract',
      align: 'c',
      style: { role: 'serif', size: 10, slant: 1, design: 'NimbusRomNo9L-ReguItal' },
      lines: [[1, 0, 140, 190, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 12, next: 20, side: [72, 300] },
    })
    const [laid] = layPage(part(name), rowsOf([], true), ja, metrics()).members
    expect(laid).toMatchObject({ state: 'laid' })
    const items = laid!.lines[0]![3] as (Item & { skew?: 1 })[]
    expect(items.map((it) => it.s).join('')).toBe(ja.labels!.abstract)
    expect(items.every((it) => it.skew === 1)).toBe(true)
  })
  it('turns off on each page only the groups the member has there: an element moved across the page break, its label on the first page (triage-1 B)', () => {
    // (2608.16117v1-de t11, p3 to p4: an element of p3 drawn on p4's line as a crop set the member's elements off on p4, where
    // the add-on holds no group of its elements; 2608.25210v2-zh t196, p9 to p10: its label drawn anew set its label off on
    // p10, where it has none. The reader leaves a member whose groups the document lacks the original's: its text on that
    // page stayed English. Today's hide.mjs: each page hides its own groups, a placeholder's where its ink is, the label where
    // its box is)
    const m = member({
      kind: 'theorem',
      label: {
        kind: 'head',
        ink: [1, 72, 98, 112, 107, 100],
        style: { role: 'serif', size: 10, bold: 1 },
        name: ['Theorem', [1, 72, 98, 105, 107, 100]],
        num: ['1', [1, 107, 98, 110, 107, 100]],
        punct: ['.', [1, 110, 98, 112, 107, 100]],
      },
      lines: [
        [1, 0, 72, 300, 100, 107, 98, 72, 300, 0, 10],
        [2, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      ],
      els: [['1', { kind: 'other', ink: [[1, 150, 98, 170, 107, 100]], copy: 'x' }]],
      room: { below: 0, next: 300 },
    })
    const r = row([
      { t: 'text', s: 'Ein langer Satz, der die erste Zeile des Satzes ganz füllt, und dann ' },
      { t: 'el', id: '1' },
      { t: 'text', s: ' am Ende.' },
    ])
    // (its label drawn anew in the target's word, "Satz": the rules' head names, Rules.heads)
    const on = (page: number) => layPage({ ...part(m), page }, rowsOf([r]), rules, metrics()).members[0]!
    // (the groups the member has on a page: its text where a line of it stands, its elements where one's ink is, its label
    // where its box is)
    const has = (page: number) =>
      (m.lines.some((l) => l[0] === page) ? 1 : 0) |
      (m.els!.some(([, e]) => e.ink.some((k) => k[0] === page)) ? 2 : 0) |
      (m.label!.ink[0] === page ? 4 : 0)
    const p1 = on(1),
      p2 = on(2)
    expect([p1.state, p2.state]).toEqual(['laid', 'laid'])
    // (the element is drawn on p2's line, cut from its own page)
    const crops = p2.lines.flatMap((l) => l[3]).filter((it) => 'src' in it)
    expect(crops.map((it) => ('src' in it ? [it.piece, it.src[0]] : null))).toEqual([['1', 1]])
    // (p1: its text, its element (drawn on p2) and its label (drawn anew) off; p2: its text alone)
    expect(p1.off).toBe(7)
    expect(p2.off).toBe(1)
    for (const page of [1, 2]) expect(on(page).off & ~has(page)).toBe(0)
  })
  it('reads a CJK cell’s bands over its own rules, never over the bands of the cells its widened line spans (triage-1 S1)', () => {
    // (1706.03762v7-zh p8's t94, a header cell set over two rows of a booktabs table: its single line widened across the table
    // (Room.side), the band edge of the cells under a column group's \cmidrule, which stands in other columns, capped it at
    // 0.897; today's cellBands read the rules over the cell's own rectangle: cap 1)
    const zh = rulesFor('zh')
    const idN = 'd'.repeat(64)
    const head = member({
      ord: 0,
      kind: 'cell',
      align: 'l',
      lines: [[1, 0, 72, 100, 700, 707, 698, 72, 400, 0, 10]],
      room: { below: 0, next: 300, side: [72, 400], band: [680, 715] },
    })
    const under = member({
      ord: 1,
      kind: 'cell',
      align: 'l',
      text: idN,
      lines: [[1, 0, 250, 300, 692, 699, 690, 72, 400, 0, 10]],
      room: { below: 0, next: 300, side: [102, 400], band: [680, 702] },
    })
    const pt: Part = { ...part(head), flows: [[head], [under]] }
    // ("Model", "Score" in Chinese: the translations' text, escaped)
    const rows = rowsOf([
      row([{ t: 'text', s: '\u6a21\u578b' }]),
      { ...row([{ t: 'text', s: '\u5206\u6570' }]), id: idN },
    ])
    const laid = layPage(pt, rows, zh, metrics()).members
    expect(laid.map((m) => m.state)).toEqual(['laid', 'laid'])
    expect(laid[0]!.fit!.size).toBe(10)
  })
  it('reads no rule of a CJK cell where a band edge reaches into its line’s own glyphs, as today’s pageRules (triage-1 S1)', () => {
    // (2610.21880v1-zh p2 t15, a tightly set table: the \hline over the cell's line has its bottom edge at 698.67, 0.01 under
    // its glyphs' top 698.68; today's pageRules (cell-rules.mjs) took a rule through a line's own glyphs' band for none of its
    // own, cap 1; read as the rule over it, the band capped the cell at 0.817. Clear of the glyphs, it is the cell's rule)
    const zh = rulesFor('zh')
    const cellWith = (room: Placed['room']) =>
      member({
        kind: 'cell',
        align: 'l',
        lines: [[1, 0, 72, 100, 700, 707, 698, 72, 100, 0, 10]],
        room: { next: 300, ...room },
      })
    const sizeOf = (room: Placed['room']) => {
      const laid = layPage(part(cellWith(room)), rowsOf([row([{ t: 'text', s: '\u6a21\u578b' }])]), zh, metrics())
        .members[0]!
      expect(laid.state).toBe('laid')
      return laid.fit!.size
    }
    // (the rule over it into its glyphs' top, the rule under it clear of their bottom: the one under alone)
    expect(sizeOf({ below: 0, band: [697.6, 706.99] })).toBe(10)
    // (the rule over it clear of its glyphs: the band between the two caps it)
    expect(sizeOf({ below: 0, band: [697.6, 707.2] })).toBeLessThan(10)
    // (a band edge Room.bandOpen states no rule stands on is none: fx-facts' bandOpen, 1 under, 2 over)
    expect(sizeOf({ below: 0, band: [697.6, 707.2], bandOpen: 2 })).toBe(10)
    expect(sizeOf({ below: 0, band: [697.9, 708.8] })).toBeLessThan(10)
    expect(sizeOf({ below: 0, band: [697.9, 708.8], bandOpen: 1 })).toBe(10)
  })
  it('splits the free paper two cells share on one baseline at its middle: neither widens over the other', () => {
    // (1706.03762v7-zh p9 t123/t124, "(dev)" under "PPL" and under "BLEU": each cell's Room.side runs to the other's ink, so
    // each widened into the whole gap between them and both translations were drawn over each other, 13.3 × 7.72 pt. The
    // paper two members may both take is each one's half, as today's figure reading shares it between two figure texts. A
    // cell widens only where its own ink's width cannot set it at its floor (X.further, today's fitFurther): 45 pt at the
    // size, 36 at the floor, in 20)
    const idB = 'b'.repeat(64)
    const a = member({
      ord: 0,
      kind: 'cell',
      align: 'l',
      lines: [[1, 0, 100, 120, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 0, next: 300, side: [72, 160] },
    })
    const b = member({
      ord: 1,
      kind: 'cell',
      align: 'c',
      text: idB,
      lines: [[1, 0, 160, 180, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 0, next: 300, side: [120, 300] },
    })
    const pt: Part = { ...part(a), flows: [[a], [b]] }
    const rows = rowsOf([row([{ t: 'text', s: 'Entwickle' }]), { ...row([{ t: 'text', s: 'Entwickle' }]), id: idB }])
    const [la, lb] = layPage(pt, rows, rules, metrics()).members
    expect([la!.state, lb!.state]).toEqual(['laid', 'laid'])
    const [, , ax1] = la!.lines[0]!,
      [, bx0] = lb!.lines[0]!
    // (the gap 120-160, its middle 140: each widened to it at most, half way, as today's paperTo)
    expect(ax1).toBeLessThanOrEqual(140 + 1e-9)
    expect(bx0).toBeGreaterThanOrEqual(140 - 1e-9)
    expect(ax1).toBeGreaterThan(137.5)
  })
  it('keeps italic a unit a declaration at its start sets italic: its style is the state after it, not one to toggle', () => {
    // (2608.25210v2-zh p4 t72-t75, cells "{\em response_equality_human}": the part states the cell's style italic (A's glyphs),
    // and its row's \em toggled that base to upright: italic share 0 where today's 0.73-0.78. Today's base was its glyphs'
    // outside its styled pieces (measuredOf); v2's, its style less what its own groups and declarations set)
    const m = member({
      kind: 'cell',
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-ReguItal', slant: 1 },
      lines: [[1, 0, 72, 140, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 0, next: 300 },
      els: [['3', { bare: 1, cmd: 'em', kind: 'zero', ink: [] }]],
    })
    const r = row([
      { t: 'el', id: '3' },
      { t: 'text', s: 'Antwort' },
    ])
    const [laid] = layPage(part(m), rowsOf([r]), rules, metrics()).members
    expect(laid!.state).toBe('laid')
    const faces = laid!.lines.flatMap((l) => l[3]).flatMap((it) => ('face' in it && /\S/.test(it.s) ? [it.face] : []))
    expect(faces.length).toBeGreaterThan(0)
    for (const f of faces) expect(f).toMatch(/^italic /)
    // (a word of a paragraph set upright, its \em in a group of its own: italic, the rest upright as its style)
    const p = member({
      els: [['3', { bare: 1, cmd: 'em', kind: 'zero', ink: [] }]],
      spans: [['2', {}]],
    })
    const pr = row([
      { t: 'text', s: 'Ein ' },
      {
        t: 'span',
        id: '2',
        content: [
          { t: 'el', id: '3' },
          { t: 'text', s: 'Wort' },
        ],
      },
      { t: 'text', s: ' hier' },
    ])
    const [pl] = layPage(part(p), rowsOf([pr]), rules, metrics()).members
    const runs = pl!.lines
      .flatMap((l) => l[3])
      .flatMap((it) => ('face' in it ? [[it.s.trim(), /^italic /.test(it.face)]] : []))
    expect(runs.filter(([s]) => s)).toEqual([
      ['Ein', false],
      ['Wort', true],
      ['hier', false],
    ])
  })
  it('draws a group whose command names no style in the face its part states TeX set it in (SpanAt.style)', () => {
    // (2608.25210v2-zh p2: `\topic{…}`, the paper's `\newcommand{\topic}[1]{\vspace{.5pt} \noindent{\bf #1.}}`, its group come
    // back and drawn regular: no rule reads a style off the command `topic`. A command the tables name keeps its own: \textit)
    const heads = (spans: Placed['spans']) => {
      const m = member({ spans })
      const r = row([
        { t: 'span', id: '0', content: [{ t: 'text', s: 'Kopf.' }] },
        { t: 'text', s: ' Text hier' },
      ])
      const [laid] = layPage(part(m), rowsOf([r]), rules, metrics()).members
      expect(laid!.state).toBe('laid')
      return laid!.lines
        .flatMap((l) => l[3])
        .flatMap((it) => ('face' in it && /\S/.test(it.s) ? [[it.s.trim(), weightOf(it.face)]] : []))
    }
    // (a face as the items name it, CSS's font shorthand: `italic 400 …`, `700 …`)
    const weightOf = (f: string) => (/^italic /.test(f) ? 'italic' : /^[6-9]00 /.test(f) ? 'bold' : 'regular')
    expect(
      heads([['0', { cmd: 'topic', style: { role: 'serif', size: 10, bold: 1, design: 'NimbusRomNo9L-Medi' } }]]),
    ).toEqual([
      ['Kopf.', 'bold'],
      ['Text', 'regular'],
      ['hier', 'regular'],
    ])
    expect(heads([['0', { cmd: 'topic' }]])).toEqual([
      ['Kopf.', 'regular'],
      ['Text', 'regular'],
      ['hier', 'regular'],
    ])
    expect(heads([['0', { cmd: 'textit', style: { role: 'serif', size: 10, bold: 1 } }]])[0]).toEqual([
      'Kopf.',
      'italic',
    ])
  })
  it("draws a mark as TeX drew it, its ink at its size and raise, whatever unit holds it (1706.03762v7's author stars)", () => {
    // (a footnote mark (El.mark: \footnotemark, a \thanks mark) and a symbol TeX set as a superscript (El.sym's second) are
    // glyphs of their own font set raised, at TeX's script size: drawn as the page's text, their text in the target's face at
    // a superscript's share of the line's size, 1706.03762v7 p1's seven CMSY7 stars came out 1.6 pt tall where TeX's are 2.7
    // and its first author's, the same star as his trail's crop, at full size. Drawn as their ink, on the line TeX set them
    // on (El.ink's base, an element's line), each stands as far over the translation's baseline as over the original's. The
    // checkpoint's (10), a raised run drawn on the baseline, is kept: the crop's raise is its ink's)
    const ink: [number, number, number, number, number, number] = [1, 150, 703, 154, 706.2, 700]
    const drawn = (el: object) => {
      const r = row([
        { t: 'text', s: 'Ein Satz' },
        { t: 'el', id: '1' },
        { t: 'text', s: ' darin, der weiter l\u00e4uft.' },
      ])
      const [laid] = layPage(part(member({ els: [['1', el as never]] })), rowsOf([r]), rules, metrics()).members
      return laid!.lines.flatMap((l) => l[3].map((it) => ({ it, y: l[0] })))
    }
    const crop = (items: ReturnType<typeof drawn>) =>
      items.find((x) => 'src' in x.it) as { it: Item & { src: number[] }; y: number } | undefined
    for (const el of [
      {
        kind: 'num',
        mark: 1,
        ink: [ink],
        text: '\u2217',
        copy: '\u00b9',
        style: { role: 'serif', size: 6.97, design: 'CMSY7' },
      },
      { kind: 'num', mark: 1, ink: [ink], text: '3', style: { role: 'serif', size: 7 } },
      { kind: 'symbol', sym: ['\u2217', 1], copy: '^\u2217', ink: [ink] },
    ]) {
      const items = drawn(el)
      const c = crop(items)
      expect(c?.it.src.slice(1)).toEqual([149.6, 702.7, 154.4, 706.5, 700])
      expect(items.some((x) => 'face' in x.it && /[\u22173]/.test(x.it.s))).toBe(false)
    }
    // (glued to what precedes it, as TeX sets it, no glue between: never a line's first item after a CJK character a line
    // could break after, where its text was glued as a superscript's; drawn as a crop and free to break there, a footnote's
    // mark after a sentence's full stop began a line of its own, 1810.04805v2 p7's 12, 2609.36054v2 p5's 7)
    const zh = rulesFor('zh')
    const two = member({
      els: [['1', { kind: 'num', mark: 1, ink: [ink], text: '7', style: { role: 'serif', size: 7 } }]],
      lines: [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 72, 120, 688, 695, 686, 72, 300, 0, 10],
      ],
    })
    const full = row([
      { t: 'text', s: `${'\u4e2d'.repeat(48)}\u3002` },
      { t: 'el', id: '1' },
      { t: 'text', s: '\u4e2d'.repeat(30) },
    ])
    const [glued] = layPage(part(two), rowsOf([full]), zh, metrics()).members
    expect(glued!.state).toBe('laid')
    expect(glued!.lines.length).toBe(2)
    for (const l of glued!.lines) expect('src' in l[3][0]!).toBe(false)
    // (a symbol TeX set on the line, no superscript, stays the page's text, as before)
    const level = drawn({ kind: 'symbol', sym: ['\u2264'], copy: '\u2264', ink: [[1, 150, 699, 156, 705, 700]] })
    expect(crop(level)).toBeUndefined()
    expect(level.some((x) => 'face' in x.it && x.it.s.includes('\u2264'))).toBe(true)
  })
})

describe('a theorem-like head in the target, laid as the reader lays a page (PDF-READER §19.14: no options)', () => {
  // (today's headOf: translator's or ctex's word for the head (the rule set's heads), else the paper's own name unit's
  // translation (its row, through the part's paper.names); triage-1 S4: the reader called layPage with neither, every head
  // English. Its number and punctuation the original's)
  const idName = 'n'.repeat(64)
  const theorem = member({
    kind: 'theorem',
    label: {
      kind: 'head',
      ink: [1, 72, 698, 130, 707, 700],
      style: { role: 'serif', size: 10, bold: 1 },
      name: ['Theorem', [1, 72, 698, 110, 707, 700]],
      num: ['1.1', [1, 112, 698, 126, 707, 700]],
      punct: ['.', [1, 126, 698, 130, 707, 700]],
    },
    lines: [
      [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      [1, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
    ],
  })
  const headOf = (to: string, names: Part['paper']['names'], list: Row[]) => {
    const pt: Part = { ...part(theorem), paper: { ...part(theorem).paper, ...(names ? { names } : {}) } }
    const p = layPage(pt, rowsOf([row([{ t: 'text', s: 'x' }]), ...list], true), rulesFor(to), metrics())
    const m = p.members[0]!
    return [
      m.state,
      m.off & 4,
      m.lines[0]?.[3]
        .map((it) => it.s)
        .join('')
        .replace(/\s+/g, ' ')
        .trim(),
    ]
  }
  const nameRow = (s: string): Row => ({ id: idName, ok: true, by: 'test', content: [{ t: 'text', s }] })
  // (the head's word: U+5B9A U+7406, "theorem" in both targets)
  const word = '\u5b9a\u7406'
  it("relabels it in zh by ctex's word, its number and stop kept", () => {
    expect(headOf('zh', undefined, [])).toEqual(['laid', 4, `${word} 1.1. x`])
  })
  it("relabels it in ja, whose packages name no head, by the paper's own name unit's row", () => {
    // (the row's own full stop dropped, as today's nameOfRow)
    expect(headOf('ja', [['Theorem', idName]], [nameRow(`${word}\u3002`)])).toEqual(['laid', 4, `${word} 1.1. x`])
    // (no row of the name unit: the head the original's, the member laid after it)
    expect(headOf('ja', [['Theorem', idName]], [])).toEqual(['laid', 0, 'x'])
  })
})

describe('an element drawn as the page’s text in the font state TeX set its glyphs in (El.style)', () => {
  // (2608.06701v1 p5: `\periodicadvisor`, "Periodic Advisor", which the paper's macro sets in italic, was drawn upright in the
  // run's style, and `\approach`, "LIVEPLAN" in faked small capitals (L and P at 9.96 pt, IVE and LAN at 7.97), in full
  // capitals at 9.96: an element took the typewriter family alone of its own style, and small capitals only where its unit was
  // set in them, every capital of it small (triage S6). An element is text no translation replaces: its weight, its slant and
  // its small capitals are its own glyphs' (El.style), over the surrounding run's; the run's where it states none)
  const look = (f: string) => (/^italic /.test(f) ? 'italic' : /^[6-9]00 /.test(f) ? 'bold' : 'regular')
  const el = (text: string, x: number, style?: El['style']): El => ({
    kind: 'umacro',
    ink: [[1, x, 698, x + 30, 706, 700]],
    text,
    ...(style ? { style } : {}),
  })
  const items = (m: Placed, content: OutPiece[], to = 'de') => {
    const r: Row = { id, ok: true, by: 'test', content }
    const [laid] = layPage(part(m), rowsOf([r], true), to === 'de' ? rules : rulesFor(to), metrics()).members
    expect(laid!.state).toBe('laid')
    return laid!.lines.flatMap((l) => l[3]).flatMap((it) => ('face' in it && /\S/.test(it.s) ? [it] : []))
  }
  const words = (m: Placed, content: OutPiece[]) =>
    items(m, content).flatMap((it) =>
      it.s
        .trim()
        .split(/\s+/)
        .map((w) => [w, look(it.face)]),
    )
  it('draws an element in its own slant and weight, over the run’s', () => {
    const m = member({
      els: [
        ['1', el('Periodic Advisor', 100, { role: 'serif', size: 10, slant: 1, design: 'NimbusRomNo9L-ReguItal' })],
        ['3', el('BERT', 150, { role: 'serif', size: 10, bold: 1, design: 'NimbusRomNo9L-Medi' })],
      ],
    })
    expect(
      words(m, [
        { t: 'text', s: 'Wir nutzen ' },
        { t: 'el', id: '1' },
        { t: 'text', s: ' und ' },
        { t: 'el', id: '3' },
        { t: 'text', s: ' hier.' },
      ]),
    ).toEqual([
      ['Wir', 'regular'],
      ['nutzen', 'regular'],
      ['Periodic', 'italic'],
      ['Advisor', 'italic'],
      ['und', 'regular'],
      ['BERT', 'bold'],
      ['hier.', 'regular'],
    ])
  })
  it('keeps the run’s style on an element that states none of its own; one that states its own is drawn so inside a group', () => {
    // (an \emph group around two elements: one of no stated style takes the group's italic; one whose glyphs TeX set upright,
    // `\textup`, is upright in it, as its glyphs are)
    const m = member({
      spans: [['2', { cmd: 'emph' }]],
      els: [
        ['4', el('ACME', 100)],
        ['6', el('Zeta', 150, { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' })],
      ],
    })
    expect(
      words(m, [
        { t: 'text', s: 'Ein ' },
        {
          t: 'span',
          id: '2',
          content: [
            { t: 'text', s: 'Wort ' },
            { t: 'el', id: '4' },
            { t: 'text', s: ' und ' },
            { t: 'el', id: '6' },
          ],
        },
        { t: 'text', s: ' hier' },
      ]),
    ).toEqual([
      ['Ein', 'regular'],
      ['Wort', 'italic'],
      ['ACME', 'italic'],
      ['und', 'italic'],
      ['Zeta', 'regular'],
      ['hier', 'regular'],
    ])
  })
  // (an element in faked small capitals, as the part states it: its text in TeX's case, each small capital its source's
  // lowercase letter, and the share it is set at, El.style.sc)
  // (each run of the element and its size over the run's, the text around it laid at the size its fit gives it)
  const sizes = (m: Placed, k: string) => {
    const got = items(m, [
      { t: 'text', s: 'Wir ' },
      { t: 'el', id: k },
      { t: 'text', s: ' hier' },
    ])
    const run = got.find((it) => /Wir/.test(it.s))!
    const of = (it: Item) => ('size' in it && 'size' in run ? Math.round((100 * it.size) / run.size) / 100 : 0)
    return got.filter((it) => !/Wir|hier/.test(it.s)).map((it) => [it.s.trim(), of(it)])
  }
  const liveplan = (x = 100) => el('LivePlan', x, { role: 'serif', size: 10, sc: 0.7, design: 'NimbusRomNo9L-Regu' })
  it('draws an element in its own faked small capitals in a paragraph: its capitals at the run’s size, its small ones at its share', () => {
    expect(sizes(member({ els: [['1', liveplan()]] }), '1')).toEqual([
      ['L', 1],
      ['IVE', 0.7],
      ['P', 1],
      ['LAN', 0.7],
    ])
  })
  it('waits for an element’s own face as for a run’s: the page’s faces hold it, never a face the run alone needs', () => {
    // (an element drawn in its own face is a face the page needs: the lay asks it of the metrics (B.cover over every token) and
    // the page waits for it (Page.wait.faces), as for any run's, so the reader loads its slices before it measures and paints.
    // Drawn in the run's face before, an element's own face was never asked)
    const m = member({
      els: [
        ['1', el('Periodic Advisor', 100, { role: 'serif', size: 10, slant: 1, design: 'NimbusRomNo9L-ReguItal' })],
      ],
    })
    const r: Row = {
      id,
      ok: true,
      by: 'test',
      content: [
        { t: 'text', s: 'Wir ' },
        { t: 'el', id: '1' },
        { t: 'text', s: ' hier' },
      ],
    }
    const page = layPage(
      part(m),
      rowsOf([r], true),
      rules,
      metrics((face) => !/^italic /.test(face)),
    )
    // (each face with the characters it sets, once each: the element's own)
    expect(page.wait.faces.map(([face, text]) => [/^italic /.test(face), text])).toEqual([
      [true, [...new Set('Periodic Advisor')].join('')],
    ])
    expect(page.members.map((x) => x.state)).toEqual(['waiting'])
  })
  it('draws it so in a small-capitals heading, at its own share; an acronym of full capitals at the run’s size', () => {
    const heading = (e: El) =>
      member({
        kind: 'heading',
        align: 'c',
        style: { role: 'serif', size: 10, sc: 0.8, design: 'NimbusRomNo9L-Regu' },
        els: [['0', e]],
        lines: [[1, 0, 100, 200, 700, 707, 698, 72, 300, 0, 8]],
        room: { below: 12, next: 20, side: [72, 300] },
      })
    expect(sizes(heading(liveplan()), '0')).toEqual([
      ['L', 1],
      ['IVE', 0.7],
      ['P', 1],
      ['LAN', 0.7],
    ])
    expect(
      sizes(heading(el('ACME', 100, { role: 'serif', size: 10, upper: 1, design: 'NimbusRomNo9L-Regu' })), '0'),
    ).toEqual([['ACME', 1]])
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

describe('U.breaks over the part’s facts: TeX’s forced breaks and the paragraphs it opened inside a unit (triage L1)', () => {
  // (today's U.breaks (forcedBreaks, paragraphBreaks, finishUnit's maps) paired with the row in the translation's order: the
  // adapter stopped every member a break or a paragraph point names, its translation never laid (33 members over the corpus))
  const textOf = (l: { 3: Item[] }) =>
    l[3]
      .map((it) => it.s)
      .join('')
      .trim()
  const lay = (m: Placed, content: OutPiece[]) => {
    const [laid] = layPage(part(m), rowsOf([row(content)], true), rules, metrics()).members
    return laid!
  }
  const lineAt = (base: number, x0: number, x1: number): Placed['lines'][number] => [
    1,
    0,
    x0,
    x1,
    base,
    base + 7,
    base - 2,
    72,
    300,
    0,
    10,
  ]
  it('ends the laid line where TeX’s forced break ended its line, the text after it on TeX’s next baseline (design-a §2.5)', () => {
    const m = member({
      lines: [lineAt(700, 72, 180), lineAt(688, 72, 300), lineAt(676, 72, 240)],
      els: [['1', { kind: 'space', ink: [], brk: 1, ends: [0, 0] }]],
    })
    const laid = lay(m, [
      { t: 'text', s: 'Premier vers' },
      { t: 'el', id: '1' },
      { t: 'text', s: 'la suite du paragraphe, assez longue' },
    ])
    expect(laid.state).toBe('laid')
    expect(textOf(laid.lines[0]!)).toBe('Premier vers')
    expect(laid.lines[1]![0]).toBe(688)
  })
  it('starts a block where the break’s next line opens another frame: no pitch tells its room (a title’s two lines)', () => {
    // (a heading TeX sets no paragraph for states no \baselineskip: its lead read off its lines)
    const m = member({
      kind: 'heading',
      align: 'c',
      read: ['style', 'lead'],
      lines: [lineAt(700, 120, 250), lineAt(680, 90, 280)],
      els: [['1', { kind: 'space', ink: [], brk: 1, ends: [0, 0] }]],
    })
    const laid = lay(m, [
      { t: 'text', s: 'Ein Titel' },
      { t: 'el', id: '1' },
      { t: 'text', s: 'und seine zweite Zeile' },
    ])
    expect(laid.state).toBe('laid')
    expect(laid.lines.map((l) => [l[0], textOf(l)])).toEqual([
      [700, 'Ein Titel'],
      [680, 'und seine zweite Zeile'],
    ])
  })
  it('keeps a title’s first block on the original’s first baseline where it is set in fewer lines (Placed.title, X.lastLines)', () => {
    // (a paper title TeX broke with \\ after its second line (2610.11256v1 p1's t0, one of the four titles fx-breaks found laid
    // on their last lines where the entry handed title: false): its first block set in one line stands on the original's first
    // baseline, the title's rule, where a section heading's stands on its last; the block after the break follows at the
    // frame's pitch (TeX's room 0))
    const title = (flag: boolean) =>
      member({
        kind: 'heading',
        align: 'c',
        ...(flag ? { title: 1 as const } : {}),
        style: { role: 'serif', size: 14, bold: 1, design: 'NimbusRomNo9L-Regu' },
        lines: [lineAt(700, 90, 480), lineAt(683, 120, 450), lineAt(666, 200, 380)],
        els: [['1', { kind: 'space', ink: [], brk: 1, ends: [1, 0] }]],
      })
    const content: OutPiece[] = [
      { t: 'text', s: 'Ein kurzer Titel' },
      { t: 'el', id: '1' },
      { t: 'text', s: 'Untertitel' },
    ]
    const at = (flag: boolean) => lay(title(flag), content).lines.map((l) => [l[0], textOf(l)])
    expect(at(true)).toEqual([
      [700, 'Ein kurzer Titel'],
      [683, 'Untertitel'],
    ])
    expect(at(false)).toEqual([
      [683, 'Ein kurzer Titel'],
      [666, 'Untertitel'],
    ])
  })
  it('takes no read break whose line an element of the row before it stands under (today’s check of a read pairing)', () => {
    // (the line read by its short end (Placed.read 'breaks'), not TeX's point: an element the row sets before the break whose
    // ink stands on a later line says the pairing is wrong, and the unit is laid as one paragraph, as today's forcedBreaks did
    // (TEX:161-181); a break TeX's point states needs no such check)
    const m = (read: string[]) =>
      member({
        lines: [lineAt(700, 72, 180), lineAt(688, 72, 300), lineAt(676, 72, 240)],
        els: [
          ['1', { kind: 'space', ink: [], brk: 1, ends: [0, 0] }],
          ['2', { kind: 'other', ink: [[1, 100, 686, 120, 695, 688]], copy: 'x' }],
        ],
        read,
      })
    const content: OutPiece[] = [
      { t: 'text', s: 'Vers avec ' },
      { t: 'el', id: '2' },
      { t: 'el', id: '1' },
      { t: 'text', s: 'la suite' },
    ]
    expect(lay(m(['breaks']), content).lines.map(textOf)).toEqual(['Vers avec xla suite'])
    expect(lay(m([]), content).lines.map(textOf)).toEqual(['Vers avec x', 'la suite'])
  })
  it('takes no break the translation sets with no text after it (T19: a group of breaks between texts)', () => {
    const m = member({
      lines: [lineAt(700, 72, 180), lineAt(688, 72, 300), lineAt(676, 72, 240)],
      els: [['1', { kind: 'space', ink: [], brk: 1, ends: [0, 0] }]],
    })
    const laid = lay(m, [
      { t: 'text', s: 'Premier vers la suite du paragraphe' },
      { t: 'el', id: '1' },
    ])
    expect(laid.state).toBe('laid')
    expect(laid.lines.length).toBe(1)
  })
  // (2608.25210v2 p3 t57: an item's text, then `\mypython{…}`, its prompt a paragraph of its own TeX set in a frame at another
  // measure and size; today split the member there and laid the prompt from its own first line)
  const boxed = (opens: Placed['spans']) =>
    member({
      lines: [
        lineAt(700, 72, 300),
        lineAt(688, 72, 150),
        [1, 0, 82, 290, 672, 678, 670, 72, 300, 0, 8],
        [1, 0, 82, 290, 663, 669, 661, 72, 300, 0, 8],
        [1, 0, 82, 230, 654, 660, 652, 72, 300, 0, 8],
      ],
      spans: opens,
    })
  const boxedRow: OutPiece[] = [
    { t: 'text', s: 'Ein Punkt der Liste, der zwei Zeilen lang ist: ' },
    { t: 'span', id: '4', content: [{ t: 'text', s: 'Der Kasten mit seinem eigenen Absatz darin.' }] },
  ]
  it('starts the text of a group TeX set as a paragraph of its own on that paragraph’s first line (SpanAt.opens, T20)', () => {
    const laid = lay(boxed([['4', { cmd: 'mypython', opens: 2 }]]), boxedRow)
    expect(laid.state).toBe('laid')
    const at = laid.lines.findIndex((l) => l[3].some((it) => /Kasten/.test(it.s)))
    expect(laid.lines[at]![0]).toBe(672)
    expect(laid.lines[at]![1]).toBe(82)
    expect(textOf(laid.lines[at]!)).toMatch(/^Der Kasten/)
  })
  it('lays such a group as the paragraph’s text where the row holds it with no text before it (T20: between texts)', () => {
    const laid = lay(boxed([['4', { cmd: 'mypython', opens: 2 }]]), [boxedRow[1]!, boxedRow[0]!])
    expect(laid.state).toBe('laid')
    expect(laid.lines[0]![0]).toBe(700)
    expect(textOf(laid.lines[0]!)).toMatch(/^Der Kasten/)
  })
  it('reads a forced break’s frame at TeX’s \\baselineskip where the part states it, not the median of its gaps', () => {
    // (the frame's other gaps 14, a \lineskip gap TeX opened under a tall line, and 12, its \baselineskip: the median's 13
    // closed the break's gap to a pitch TeX never set the paragraph at)
    const lines = [lineAt(700, 72, 180), lineAt(676, 72, 300), lineAt(662, 72, 300), lineAt(650, 72, 240)]
    const els = new Map<string, El>([['1', { kind: 'space', ink: [], brk: 1, ends: [0, 1] }]])
    const pieces: Parameters<typeof statedBreaks>[1] = [
      { t: 'text', s: 'Premier vers' },
      { t: 'ph', src: '\\\\', k: 1 },
      { t: 'text', s: 'la suite' },
    ]
    const at = (pitch?: number) =>
      statedBreaks({ lines, els, spans: new Map(), ...(pitch ? { pitch } : {}) }, pieces, [null, null, null]).get(1)
    expect(at()).toEqual({ next: 1, room: 1, pitch: 13 })
    expect(at(12)).toEqual({ next: 1, room: 1, pitch: 12 })
  })
  it('starts at an element TeX opened a paragraph at, the element first on that line (El.opens)', () => {
    const m = member({
      lines: [lineAt(700, 72, 300), lineAt(688, 72, 150), lineAt(676, 72, 300), lineAt(664, 72, 200)],
      els: [['3', { kind: 'other', ink: [[1, 72, 674, 90, 683, 676]], copy: 'x', opens: 2 }]],
    })
    const laid = lay(m, [
      { t: 'text', s: 'Der erste Absatz, der ganze zwei Zeilen lang ist.' },
      { t: 'el', id: '3' },
      { t: 'text', s: ' und der zweite Absatz danach' },
    ])
    expect(laid.state).toBe('laid')
    const at = laid.lines.findIndex((l) => l[3].some((it) => 'src' in it))
    expect(laid.lines[at]![0]).toBe(676)
    expect('src' in laid.lines[at]![3][0]!).toBe(true)
    expect(textOf(laid.lines[at - 1]!)).toMatch(/ist\.$/)
  })
})

describe('a reference TeX’s cross-referencing packages generate, in the target’s names (U.rename, PDF-READER §19.11)', () => {
  // (today's renameRefs: cleveref's "Figure 3" drawn with its name in the target's (cleveref's, hyperref's words, translator's,
  // babel's, the paper's own name units'), its number the original's; a citation's note so; layPage derives it from the rules
  // and the part, no caller option)
  const ref = (cmd: string, text: string, note?: string) =>
    member({
      els: [
        [
          '1',
          {
            kind: cmd === 'cref' ? 'num' : 'cite',
            cmd,
            ...(note !== undefined ? { note } : {}),
            copy: '?',
            ink: [[1, 150, 698, 190, 707, 700]],
            text,
            style: { role: 'serif', size: 10 },
          },
        ],
      ],
    })
  const shown = (m: Placed, to: string) => {
    const r = row([
      { t: 'text', s: 'Siehe ' },
      { t: 'el', id: '1' },
      { t: 'text', s: ' für mehr.' },
    ])
    const [laid] = layPage(part(m), rowsOf([r], true), rulesFor(to as never), metrics()).members
    expect(laid!.state).toBe('laid')
    return laid!.lines.map((l) => l[3].map((it) => it.s).join('')).join(' ')
  }
  it('draws cleveref’s name in the target’s word, its number kept', () => {
    expect(shown(ref('cref', 'Figure 3'), 'de')).toContain('Abbildung 3')
    expect(shown(ref('cref', 'Figure 3'), 'de')).not.toContain('Figure')
  })
  it('draws a citation’s note’s name in the target’s word, the cited work’s own text kept', () => {
    expect(shown(ref('citep', '[Smith, 2020, Section 2]', 'Section~2'), 'de')).toContain('[Smith, 2020, Abschnitt 2]')
  })
})

describe('a unit set in small capitals, its Latin translation in them (today’s caps vote: Style.caps)', () => {
  // (today's base caps where most of its letters that can tell are faked small capitals (capsVote): its translation's Latin
  // letters drawn in the layer's small capitals at its capsRatio (Style.sc); a unit with one such word, its share stated and
  // no vote, keeps its translation in its own case)
  const head = (caps: boolean) =>
    member({
      kind: 'heading',
      align: 'l',
      style: { role: 'serif', size: 10, sc: 0.8, ...(caps ? { caps: 1 as const } : {}), design: 'NimbusRomNo9L-Regu' },
      lines: [[1, 0, 72, 200, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 12, next: 20, side: [72, 300] },
    })
  const runs = (caps: boolean) => {
    const [laid] = layPage(
      part(head(caps)),
      rowsOf([row([{ t: 'text', s: 'Versuche' }])], true),
      rules,
      metrics(),
    ).members
    expect(laid!.state).toBe('laid')
    return laid!.lines[0]![3].flatMap((it) => ('size' in it && it.s.trim() ? [[it.s.trim(), it.size]] : []))
  }
  it('draws its lowercase letters as small capitals at its share', () => {
    expect(runs(true)).toEqual([
      ['V', 10],
      ['ERSUCHE', 8],
    ])
  })
  it('draws a unit with no vote in its own case', () => {
    expect(runs(false)).toEqual([['Versuche', 10]])
  })
})
