// design-a's entry over hand-made parts: what each pane lights of a member (Laid.lit: every member lit whole until a part states
// `cuts`, on A from its lines' boxes, as drawn from its laid lines', its kept ink the same on both) and the page's links as drawn
// (Page.links: moved with the pieces they are over, else at A's boxes, dropped where their ink is off and nothing of it drawn).
// The reader's highlight (packages/reader compose/highlight.ts) and link layer (compose/links.ts) read these as they are.
import type { Link, OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Laid, Metrics, Page, Rows } from '../../src/types.ts'

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
const part = (m: Placed, links?: Link[]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
  ...(links ? { links } : {}),
})
const rowsOf = (list: Row[], done = false): Rows => {
  const by = new Map(list.map((r) => [r.id, r]))
  return { get: (k) => by.get(k), done }
}
const row = (content: OutPiece[]): Row => ({ id, ok: true, by: 'test', content })
const A = [
  [72, 698, 300, 707],
  [72, 686, 200, 695],
]
/** the page's one link */
const only = (p: Page) => {
  expect(p.links).toHaveLength(1)
  return p.links[0]!
}
/** the member's first crop of an element (not its label's) and the baseline it is drawn on */
const cropOf = (laid: Laid) =>
  laid.lines.flatMap(([y, , , items]) =>
    items.flatMap((it) =>
      'src' in it && it.piece !== 'label' && it.piece !== 'counter'
        ? [{ y, it: it as Extract<Item, { src: unknown }> & { w: number } }]
        : [],
    ),
  )[0]

describe('Laid.lit: every member lit whole (no part states cuts)', () => {
  it('lights a laid member from its lines on A on the left and its laid lines as drawn on the right, one entry each', () => {
    const p = layPage(
      part(member()),
      rowsOf([row([{ t: 'text', s: 'Ein Satz, der weiter läuft und läuft.' }])]),
      rules,
      metrics(),
    )
    const [laid] = p.members
    expect(laid!.state).toBe('laid')
    expect(laid!.lit.left).toEqual([A])
    expect(laid!.lit.right).toHaveLength(1)
    // (each laid line one box: its tokens across, a Times-like face's band about its baseline at the size laid)
    const f = laid!.fit!.size
    expect(laid!.lit.right[0]).toHaveLength(laid!.lines.length)
    laid!.lit.right[0]!.forEach((b, j) => {
      const [y, x0] = laid!.lines[j]!
      expect(b[0]).toBeCloseTo(x0, 6)
      expect(b[1]).toBeCloseTo(y - 0.22 * f, 6)
      expect(b[3]).toBeCloseTo(y + 0.75 * f, 6)
      expect(b[2]).toBeGreaterThan(b[0])
    })
    expect(laid!.lit.own).toEqual([])
  })
  it('lights a member not laid, and a page that waits, from A on both panes (the right mirrors the left)', () => {
    const none = layPage(part(member()), rowsOf([], true), rules, metrics()).members[0]!
    expect(none.state).toBe('none')
    expect(none.lit).toEqual({ left: [A], right: [A], own: [] })
    const waiting = layPage(part(member()), rowsOf([]), rules, metrics()).members[0]!
    expect(waiting.state).toBe('waiting')
    expect(waiting.lit).toEqual({ left: [A], right: [A], own: [] })
  })
  it('lights a display kept where it stands as a block of its own, the same on both panes, its rows out of the text’s', () => {
    // (a paragraph ending with a display whose row the part states as a KEPT line: read.test.ts's case)
    const m = member({
      lines: [
        [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [1, 0, 120, 250, 680, 688, 676, 72, 300, 1, 10],
      ],
      els: [['1', { kind: 'display', keep: 1, ink: [[1, 120, 676, 250, 688, 680]] }]],
    })
    const [laid] = layPage(
      part(m),
      rowsOf([
        row([
          { t: 'text', s: 'Satz' },
          { t: 'el', id: '1' },
        ]),
      ]),
      rules,
      metrics(),
    ).members
    expect(laid!.state).toBe('laid')
    expect(laid!.lit.left).toEqual([[[72, 698, 300, 707]]])
    expect(laid!.lit.own).toEqual([['1', [[120, 676, 250, 688]]]])
    expect(laid!.lit.right[0]!.every((b) => b[3] > 690)).toBe(true)
  })
  it('lights a babel name drawn on its own on both panes: its line on A, its word as drawn', () => {
    const name = member({
      kind: 'name',
      text: { name: 'abstract' },
      plain: 'Abstract',
      align: 'c',
      lines: [[1, 0, 140, 180, 700, 707, 698, 72, 300, 0, 10]],
      room: { below: 12, next: 20, side: [72, 300] },
    })
    const [laid] = layPage(part(name), rowsOf([], true), rules, metrics()).members
    expect(laid!.lit.left).toEqual([[[140, 698, 180, 707]]])
    expect(laid!.lit.right).toEqual([[[122.5, 700 - 2.2, 197.5, 707.5]]])
  })
})

describe('Page.links: as drawn, moved with their pieces, else at A’s boxes', () => {
  // (the element's id is its place in the unit's source; its piece's place in the row is another: the tokens carry the row's)
  const cite = (o: Record<string, unknown> = {}) =>
    member({ els: [['5', { kind: 'cite', ink: [[1, 150, 698, 170, 707, 700]], ...o }]] })
  const r = row([
    { t: 'text', s: 'Ein Satz mit ' },
    { t: 'el', id: '5' },
    { t: 'text', s: ' darin, der weiter läuft.' },
  ])
  const at = (box: [number, number, number, number], owner?: [number, string]): Link => ({
    box,
    to: { dest: '"cite.x"' },
    ...(owner ? { owner } : {}),
  })
  it('moves a link over an element drawn as a crop with the crop (placeCrop: the crop’s own map)', () => {
    const p = layPage(part(cite(), [at([150, 697, 170, 708], [0, '5'])]), rowsOf([r]), rules, metrics())
    const c = cropOf(p.members[0]!)!
    expect(c).toBeDefined()
    // (the annotation's box mapped as the crop's source is (its ink with the crop's margin): across by the drawn width's share,
    // up and down by the line's scale about the baselines; clipped to what the crop draws)
    const [, s0, s1, s2, s3, base] = c.it.src
    const X = (v: number) => c.it.x + ((v - s0) * c.it.w) / (s2 - s0)
    const Y = (v: number) => c.y + (v - base) * c.it.k
    const [b, to] = only(p)
    expect(to).toEqual({ dest: '"cite.x"' })
    expect(b[0]).toBeCloseTo(Math.max(c.it.x, X(150)), 6)
    expect(b[2]).toBeCloseTo(Math.min(c.it.x + c.it.w, X(170)), 6)
    expect(b[1]).toBeCloseTo(Math.max(Y(s1), Y(697)), 6)
    expect(b[3]).toBeCloseTo(Math.min(Y(s3), Y(708)), 6)
    // (moved off A's box: the crop is drawn where the translation sets the citation)
    expect(b[0]).not.toBeCloseTo(150, 1)
  })
  it('lays a link over an element drawn as text over its drawn characters', () => {
    // (a citation the translation draws as the page's text: hide.mjs's case of entry.test.ts)
    const m = cite({ text: '[3]', style: { role: 'serif', size: 10 } })
    const p = layPage(part(m, [at([150, 697, 170, 708], [0, '5'])]), rowsOf([r]), rules, metrics())
    const laid = p.members[0]!
    expect(cropOf(laid)).toBeUndefined()
    const [b] = only(p)
    // (on the first laid line, after "Ein Satz mit ", over three characters of half a size each)
    const [y, x0] = laid.lines[0]!
    const f = laid.fit!.size
    expect(b[1]).toBeCloseTo(y - 0.22 * f, 6)
    expect(b[3]).toBeCloseTo(y + 0.75 * f, 6)
    expect(b[0]).toBeGreaterThan(x0)
    expect(b[2] - b[0]).toBeGreaterThan(0)
  })
  it('lays each target of a piece drawn as text over its own characters where the part states them (Link.text)', () => {
    // (an author-year citation of two works drawn as the page's text: today's placeText finds each annotation's characters, its
    // overlaidText, among the drawn ones; a part made before states none, and the two are not told apart)
    const m = cite({ text: '[3, 4]', style: { role: 'serif', size: 10 } })
    const a: Link = { box: [150, 697, 158, 708], to: { dest: '"cite.a"' }, owner: [0, '5'], text: '3' }
    const b: Link = { box: [161, 697, 169, 708], to: { dest: '"cite.b"' }, owner: [0, '5'], text: '4' }
    const p = layPage(part(m, [a, b]), rowsOf([r]), rules, metrics())
    expect(p.links.map(([, to]) => to)).toEqual([a.to, b.to])
    const [ba, bb] = p.links.map(([box]) => box) as unknown as [number[], number[]]
    // ("3" from its own edge, a character into "[3, ", to the next run where the rest of its token holds no letter (today's
    // spanOf); "4" from the start of its run "4] ")
    const f = p.members[0]!.fit!.size
    const items = p.members[0]!.lines.flatMap(([, , , it]) => it)
    const at = (s: string) => items.find((it) => it.s.startsWith(s))!.x
    expect(ba[0]).toBeCloseTo(at('[3') + 0.5 * f, 6)
    expect(bb[0]).toBeCloseTo(at('4]'), 6)
    expect(ba[2]!).toBeLessThanOrEqual(bb[0]!)
    const { text: _a, ...a0 } = a
    const { text: _b, ...b0 } = b
    expect(layPage(part(m, [a0, b0]), rowsOf([r]), rules, metrics()).links).toEqual([])
  })
  it('keeps at A’s box a link no member owns, and one whose owner is not laid', () => {
    const free = at([400, 600, 420, 610])
    expect(layPage(part(cite(), [free]), rowsOf([r]), rules, metrics()).links).toEqual([[free.box, free.to]])
    const owned = at([150, 697, 170, 708], [0, '5'])
    expect(layPage(part(cite(), [owned]), rowsOf([], true), rules, metrics()).links).toEqual([[owned.box, owned.to]])
  })
  it('keeps every link at A’s box on a page that waits for its rows or its faces, the original shown there (#626 review)', () => {
    const owned = at([150, 697, 170, 708], [0, '5'])
    const free = at([400, 600, 420, 610])
    // (its row not in yet: the page waits, its members the original's)
    const forRows = layPage(part(cite(), [owned, free]), rowsOf([]), rules, metrics())
    expect(forRows.wait.rows.length).toBeGreaterThan(0)
    expect(forRows.links).toEqual([
      [owned.box, owned.to],
      [free.box, free.to],
    ])
    // (its row in, a face not loaded yet: the page waits for the face)
    const forFaces = layPage(
      part(cite(), [owned, free]),
      rowsOf([r]),
      rules,
      metrics(() => false),
    )
    expect(forFaces.wait.faces.length).toBeGreaterThan(0)
    expect(forFaces.links).toEqual([
      [owned.box, owned.to],
      [free.box, free.to],
    ])
  })
  it('drops a link over an element whose ink is turned off and that the translation does not draw', () => {
    // (the translation leaves the citation out: its ink goes with the elements' group, a link there would open from the text
    // drawn over it)
    const two = member({
      els: [
        ['1', { kind: 'cite', ink: [[1, 150, 698, 170, 707, 700]] }],
        ['2', { kind: 'cite', ink: [[1, 180, 698, 190, 707, 700]] }],
      ],
    })
    const p = layPage(
      part(two, [at([180, 697, 190, 708], [0, '2'])]),
      rowsOf([
        row([
          { t: 'text', s: 'Ein Satz mit ' },
          { t: 'el', id: '1' },
          { t: 'text', s: ' darin.' },
        ]),
      ]),
      rules,
      metrics(),
    )
    expect(p.members[0]!.off & 2).toBe(2)
    expect(p.links).toEqual([])
  })
  it('lays a link over the member’s text in an \\href group over that group’s translation (placePair)', () => {
    const m = member({ spans: [['1', { cmd: 'href' }]] })
    const link: Link = { box: [100, 697, 160, 708], to: { url: 'https://example.org/' }, owner: [0, ''] }
    const rr = row([
      { t: 'text', s: 'Siehe ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'die Seite' }] },
      { t: 'text', s: ' dort.' },
    ])
    const p = layPage(part(m, [link]), rowsOf([rr]), rules, metrics())
    const laid = p.members[0]!
    expect(laid.state).toBe('laid')
    const [b, to] = only(p)
    expect(to).toEqual({ url: 'https://example.org/' })
    // ("die Seite" after "Siehe ": six characters of half a size each from the line's start)
    const [, x0] = laid.lines[0]!
    const f = laid.fit!.size
    expect(b[0]).toBeCloseTo(x0 + 6 * 0.5 * f, 1)
    expect(b[2]).toBeGreaterThan(b[0] + 8 * 0.5 * f)
  })
  it('lays a link that holds the member’s every line over its whole drawing (a contents entry), drops one over part of it', () => {
    const entry = member({ kind: 'inkcontents', lines: [[1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10]] })
    const whole: Link = { box: [71, 696, 301, 709], to: { dest: '"section.1"' }, owner: [0, ''] }
    const rr = row([{ t: 'text', s: 'Einleitung 3' }])
    const p = layPage(part(entry, [whole]), rowsOf([rr]), rules, metrics())
    const laid = p.members[0]!
    const [b] = only(p)
    expect(b[0]).toBeCloseTo(laid.lines[0]![1], 6)
    const some: Link = { ...whole, box: [71, 696, 200, 709] }
    expect(layPage(part(entry, [some]), rowsOf([rr]), rules, metrics()).links).toEqual([])
  })
})

describe('S.figures over the part: a figure text drawn in its translation where it fits', () => {
  const idF = 'f'.repeat(64),
    idG = 'e'.repeat(64)
  // (a level label "Loss" at 140-160 on baseline 400, centred (its anchor), its room 20 either side; its set alone)
  const label = (o: Partial<Placed> = {}): Placed =>
    member({
      ord: 0,
      kind: 'figure',
      text: idF,
      align: 'c',
      plain: 'Loss',
      style: { role: 'sans', size: 8 },
      lines: [[1, 0, 140, 160, 400, 406, 398, 108, 504, 0, 8]],
      room: { below: 1, next: 9, side: [120, 180] },
      ...o,
    })
  const rowF = (s: string, id = idF): Row => ({ id, ok: true, by: 'test', content: [{ t: 'text', s }] })
  it('draws a level one on its baseline about its anchor at its size, its text group off, lit on both panes', () => {
    const p = layPage(part(label()), rowsOf([rowF('Verlust')]), rules, metrics())
    const [m] = p.members
    expect(m).toMatchObject({ state: 'laid', off: 1 })
    const [y, x0, x1, items] = m!.lines[0]!
    // ("Verlust", 7 characters of half a size at 8: 28 wide, centred on 150; inside its room 120-180)
    expect(y).toBe(400)
    expect(items.map((it) => it.s).join('')).toBe('Verlust')
    expect(x0).toBeCloseTo(136, 6)
    expect(x1).toBeCloseTo(164, 6)
    expect(m!.lit.left).toEqual([[[140, 398, 160, 406]]])
    expect(m!.lit.right[0]).toHaveLength(1)
  })
  it('shrinks a set to one size where one of it needs it, and leaves the original’s what says nothing else', () => {
    // (two labels of one set: the second's translation, 16 characters at 8 (64 wide), centred in a free line of 50 (its box of 30
    // and 10 either side), needs 0.78 of its size, over the last floor)
    const a = label()
    const b = label({
      ord: 1,
      text: idG,
      plain: 'Accuracy',
      lines: [[1, 0, 200, 230, 400, 406, 398, 108, 504, 0, 8]],
      room: { below: 1, next: 9, side: [190, 240] },
    })
    const pt: Part = { ...part(a), flows: [[a], [b]], ties: [{ rule: 'size', ords: [0, 1] }] }
    const p = layPage(pt, rowsOf([rowF('Verlust'), rowF('Genauigkeitswert', idG)]), rules, metrics())
    const sizes = p.members.map((m) => (m.lines[0]?.[3][0] as { size?: number } | undefined)?.size)
    expect(sizes[0]).toBeCloseTo(sizes[1]!, 9)
    expect(sizes[0]!).toBeLessThan(8)
    // (its translation the same as its source: the original's)
    expect(layPage(part(label()), rowsOf([rowF('LOSS')]), rules, metrics()).members[0]!.state).toBe('none')
  })
  it('leaves the original’s a turned one (design-a’s Item has no turn) and one whose anchor the part does not state', () => {
    const turned = layPage(part(label({ dir: [0, 1] })), rowsOf([rowF('Verlust')]), rules, metrics()).members[0]!
    expect(turned).toMatchObject({ state: 'kind', off: 0, lines: [] })
    const before = layPage(part(label({ align: 'j' })), rowsOf([rowF('Verlust')]), rules, metrics()).members[0]!
    expect(before).toMatchObject({ state: 'kind', off: 0, lines: [] })
  })
})
