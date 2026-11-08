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

describe('a small-capitals unit’s element in the page’s faked small capitals (triage S6)', () => {
  // (a heading TeX sets in faked small capitals (Style.sc 0.8 at 10 pt), its paper's macro's text all capitals at the small
  // capitals' size, 8 pt (El.style): today drew it in the layer's small capitals at the unit's capsRatio (smallCapsAt over
  // its characters, each set at most SMALL_CAPS_SHARE of the unit's size), never in full capitals at the unit's size)
  const id = 'h'.repeat(64)
  const heading = (elSize: number) =>
    member({
      kind: 'heading',
      text: id,
      align: 'c',
      style: { role: 'serif', size: 10, sc: 0.8, design: 'NimbusRomNo9L-Regu' },
      els: [
        [
          '0',
          {
            kind: 'umacro',
            ink: [[1, 100, 698, 140, 706, 700]],
            text: 'ACME',
            style: { role: 'serif', size: elSize, upper: 1, design: 'NimbusRomNo9L-Regu' },
          },
        ],
      ],
      lines: [[1, 0, 100, 200, 700, 707, 698, 72, 300, 0, 8]],
      room: { below: 12, next: 20, side: [72, 300] },
    })
  const sizeOf = (elSize: number) => {
    const r: Row = {
      id,
      ok: true,
      by: 'test',
      content: [
        { t: 'el', id: '0' },
        { t: 'text', s: ' \u65b9\u6cd5' },
      ],
    }
    const [laid] = layPage(part(heading(elSize)), rowsOf([r], true), rulesFor('zh'), metrics()).members
    return laid!.lines[0]![3].filter((it) => 'face' in it && /ACME/.test(it.s)).map((it) =>
      'size' in it ? it.size : 0,
    )
  }
  it('draws it at the unit’s capsRatio', () => {
    expect(sizeOf(8)).toEqual([8])
  })
  it('draws an element of full capitals (an acronym at the unit’s size) at its size', () => {
    expect(sizeOf(10)).toEqual([10])
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
    const m = member({
      kind: 'heading',
      align: 'c',
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
