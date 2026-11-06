// design-a's entry over hand-made parts: one state per call (a row not in while more may come: the page waits, every member
// 'waiting', nothing off; a face not loaded: the same), a row that will not come ('none'), a member laid from its row and its
// facts alone (no Units object: its pieces made from the member's stated El, rowPieces), its text group off, an element
// drawn on a laid line off with it.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rowPieces, srcOfEl } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

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
