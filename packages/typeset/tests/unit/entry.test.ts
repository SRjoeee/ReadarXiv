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
