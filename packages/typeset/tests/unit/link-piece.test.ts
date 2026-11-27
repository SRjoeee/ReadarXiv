// Page.links' fifth member (link previews, docs/PDF-READER.md §20): each drawn link names the element of its owner that holds it
// on A (Link.owner[1]: an element's id, '' the member's text), moved or left at A's box, so that the numbers of one \cite are one
// bracket on the right as on the left. The first four members are what they were. Parts made by hand, as entry-lit-links'.
import type { Link, OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
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
const part = (m: Placed, links: Link[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
  links,
})
const rowsOf = (list: Row[], done = false): Rows => {
  const by = new Map(list.map((r) => [r.id, r]))
  return { get: (k) => by.get(k), done }
}
const row = (content: OutPiece[]): Row => ({ id, ok: true, by: 'test', content })
const cite = member({ els: [['5', { kind: 'cite', ink: [[1, 150, 698, 170, 707, 700]] }]] })
const r = row([
  { t: 'text', s: 'Ein Satz mit ' },
  { t: 'el', id: '5' },
  { t: 'text', s: ' darin, der weiter läuft.' },
])
const link = (box: [number, number, number, number], owner?: [number, string]): Link => ({
  box,
  to: { dest: '"cite.x"' },
  ...(owner ? { owner } : {}),
})

describe("Page.links' fifth member: the element of its owner that holds a link", () => {
  it('a moved link keeps its element’s id', () => {
    const p = layPage(part(cite, [link([150, 697, 170, 708], [0, '5'])]), rowsOf([r]), rules, metrics)
    expect(p.members[0]!.state).toBe('laid')
    expect(p.links).toHaveLength(1)
    const [box, , owner, border, piece] = p.links[0]!
    expect(box[0]).not.toBeCloseTo(150, 1)
    expect(owner).toBe(0)
    expect(border).toBeUndefined()
    expect(piece).toBe('5')
  })
  it('a link at A’s box keeps its owner’s piece (its owner not laid)', () => {
    const l = link([150, 697, 170, 708], [0, '5'])
    const p = layPage(part(cite, [l]), rowsOf([], true), rules, metrics)
    expect(p.links).toEqual([[l.box, l.to, 0, undefined, '5']])
  })
  it("a link of the owner's text is ''", () => {
    const m = member({ spans: [['1', { cmd: 'href' }]] })
    const href: Link = { box: [100, 697, 160, 708], to: { url: 'https://example.org/' }, owner: [0, ''] }
    const rr = row([
      { t: 'text', s: 'Siehe ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'die Seite' }] },
      { t: 'text', s: ' dort.' },
    ])
    const p = layPage(part(m, [href]), rowsOf([rr]), rules, metrics)
    expect(p.links).toHaveLength(1)
    expect(p.links[0]![4]).toBe('')
  })
  it('a link no member owns has no owner and no piece: its tuple as before', () => {
    const free = link([400, 600, 420, 610])
    expect(layPage(part(cite, [free]), rowsOf([r]), rules, metrics).links).toEqual([[free.box, free.to]])
  })
  it('the first four members are what they were: a border carried, the piece after it', () => {
    const green: Link['border'] = [1, 0x00ff00]
    const l: Link = { ...link([150, 697, 170, 708], [0, '5']), border: green }
    expect(layPage(part(cite, [l]), rowsOf([], true), rules, metrics).links).toEqual([[l.box, l.to, 0, green, '5']])
  })
})
