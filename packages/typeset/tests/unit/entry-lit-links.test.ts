// design-a's entry over hand-made parts: what each pane lights of a member (Laid.lit: every member lit whole until a part states
// `cuts`, on A from its lines' boxes, as drawn from its laid lines', its kept ink the same on both) and the page's links as drawn
// (Page.links: moved with the pieces they are over, else at A's boxes, dropped where their ink is off and nothing of it drawn).
// The reader's highlight (packages/reader compose/highlight.ts) and link layer (compose/links.ts) read these as they are.
import type { Link, OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import type { LinkFate } from '../../src/lay/links.ts'
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
  it('lights the elements its elements’ group keeps shown where the translation omits them all (#626 review)', () => {
    // (a text-only translation of a member with a citation: no element is drawn otherwise, the entry leaves the elements' group
    // on, the citation's ink stays where it stands and lights with the member, its link kept at A's box)
    const m = member({ els: [['5', { kind: 'cite', ink: [[1, 250, 698, 270, 707, 700]] }]] })
    const link: Link = { box: [250, 697, 270, 708], to: { dest: '"cite.x"' }, owner: [0, '5'] }
    const p = layPage(part(m, [link]), rowsOf([row([{ t: 'text', s: 'Kurz.' }])]), rules, metrics())
    const [laid] = p.members
    expect(laid!.state).toBe('laid')
    expect(laid!.off).toBe(1)
    expect(p.links).toEqual([[link.box, link.to, 0]])
    expect(laid!.lit.own).toEqual([['5', [[250, 698, 270, 707]]]])
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
  it('lays each of a piece’s annotations of one text over its own occurrence, in their order on A, whatever their targets (#631 review)', () => {
    // (two works of one author and year cited in one citation: the same characters twice, each its own destination. One search
    // over the piece's drawn characters, moving forward only, in the annotations' order on A: the second never lands on the
    // first's occurrence)
    const m = cite({ text: '(Smith 2020; Smith 2020)', style: { role: 'serif', size: 10 } })
    const a: Link = { box: [150, 697, 158, 708], to: { dest: '"cite.smith-a"' }, owner: [0, '5'], text: 'Smith 2020' }
    const b: Link = { box: [161, 697, 169, 708], to: { dest: '"cite.smith-b"' }, owner: [0, '5'], text: 'Smith 2020' }
    const p = layPage(part(m, [a, b]), rowsOf([r]), rules, metrics())
    expect(p.links.map(([, to]) => to)).toEqual([a.to, b.to])
    const [ba, bb] = p.links.map(([box]) => box) as unknown as [number[], number[]]
    // (the first a character into its run "(Smith ", the second from the start of the run "Smith " after "2020; ")
    const f = p.members[0]!.fit!.size
    const runs = p.members[0]!.lines.flatMap(([, , , it]) => it).filter((it) => 'face' in it)
    expect(ba[0]).toBeCloseTo(runs.find((it) => it.s === '(Smith ')!.x + 0.5 * f, 6)
    expect(bb[0]).toBeCloseTo(runs.find((it) => it.s === 'Smith ')!.x, 6)
    expect(ba[2]!).toBeLessThanOrEqual(bb[0]!)
    // (the PDF listing them the other way: searched in their order on A all the same, each over its own occurrence, #626's
    // review)
    expect(layPage(part(m, [b, a]), rowsOf([r]), rules, metrics()).links).toEqual(p.links)
  })
  it('lays each annotation of a piece drawn as text over two pages over its own occurrence, on its page (#631 review)', () => {
    // (the same citation in a paragraph over pages 1 and 2, its translation drawing it across the page break: "(Smith 2020;" on
    // page 1, "Smith 2020)" on page 2; the first work's annotation on page 1, the second's on page 2, each part holding the
    // other's with its page. Searched among what page 2 draws alone, page 2's occurrence took page 1's destination, its own
    // annotation unplaced, Codex's case)
    const m = cite({
      text: '(Smith 2020; Smith 2020)',
      style: { role: 'serif', size: 10 },
      ink: [
        [1, 250, 98, 300, 107, 100],
        [2, 72, 698, 110, 707, 700],
      ],
    })
    const two = {
      ...m,
      lines: [
        [1, 0, 72, 300, 100, 107, 98, 72, 300, 0, 10],
        [2, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      ] as Placed['lines'],
    }
    const a: Link = { box: [250, 97, 300, 108], to: { dest: '"cite.smith-a"' }, owner: [0, '5'], text: 'Smith 2020' }
    const b: Link = { box: [72, 697, 110, 708], to: { dest: '"cite.smith-b"' }, owner: [0, '5'], text: 'Smith 2020' }
    const rr = row([
      { t: 'text', s: 'Ein Satz zuerst, dann folgt ' },
      { t: 'el', id: '5' },
      { t: 'text', s: ' und der Rest.' },
    ])
    const onPage = (n: 1 | 2) =>
      layPage(
        { ...part(two, n === 1 ? [a, { ...b, page: 2 }] : [b, { ...a, page: 1 }]), page: n },
        rowsOf([rr]),
        rules,
        metrics(),
      )
    const [p1, p2] = [onPage(1), onPage(2)]
    // (the citation's text drawn across the break: its first occurrence on page 1's line, its second on page 2's)
    const runsOn = (p: Page) => p.members[0]!.lines.flatMap(([, , , it]) => it).filter((it) => 'face' in it)
    expect(runsOn(p1).map((it) => it.s.trim())).toContain('(Smith')
    expect(runsOn(p2).map((it) => it.s.trim())).toContain('Smith')
    expect(p1.links.map(([, to]) => to)).toEqual([a.to])
    expect(p2.links.map(([, to]) => to)).toEqual([b.to])
    const f = p2.members[0]!.fit!.size
    expect(p1.links[0]![0][0]).toBeCloseTo(runsOn(p1).find((it) => it.s === '(Smith ')!.x + 0.5 * f, 6)
    expect(p2.links[0]![0][0]).toBeCloseTo(runsOn(p2).find((it) => it.s === 'Smith ')!.x, 6)
  })
  it('keeps a link at A’s box where the elements’ group the add-on could not part keeps its ink there, drawn or not (#626 review)', () => {
    // (Placed.fixed 2: the member's elements stay shown however they are drawn; the original citation keeps its anchor, by the
    // crop path and by the text path)
    const link = at([150, 697, 170, 708], [0, '5'])
    const crop = layPage(part(cite({}), [link]), rowsOf([r]), rules, metrics())
    expect(cropOf(crop.members[0]!)).toBeDefined()
    const fixedCrop = layPage(part({ ...cite({}), fixed: 2 }, [link]), rowsOf([r]), rules, metrics())
    expect(fixedCrop.members[0]!.off & 2).toBe(0)
    expect(fixedCrop.links).toEqual([[link.box, link.to, 0]])
    const asText = cite({ text: '[3]', style: { role: 'serif', size: 10 } })
    const fixedText = layPage(part({ ...asText, fixed: 2 }, [link]), rowsOf([r]), rules, metrics())
    expect(cropOf(fixedText.members[0]!)).toBeUndefined()
    expect(fixedText.links).toEqual([[link.box, link.to, 0]])
  })
  it('keeps at A’s box a link no member owns, and one whose owner is not laid', () => {
    const free = at([400, 600, 420, 610])
    expect(layPage(part(cite(), [free]), rowsOf([r]), rules, metrics()).links).toEqual([[free.box, free.to]])
    const owned = at([150, 697, 170, 708], [0, '5'])
    expect(layPage(part(cite(), [owned]), rowsOf([], true), rules, metrics()).links).toEqual([[owned.box, owned.to, 0]])
  })
  it('keeps every link at A’s box on a page that waits for its rows or its faces, the original shown there (#626 review)', () => {
    const owned = at([150, 697, 170, 708], [0, '5'])
    const free = at([400, 600, 420, 610])
    // (its row not in yet: the page waits, its members the original's)
    const forRows = layPage(part(cite(), [owned, free]), rowsOf([]), rules, metrics())
    expect(forRows.wait.rows.length).toBeGreaterThan(0)
    expect(forRows.links).toEqual([
      [owned.box, owned.to, 0],
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
      [owned.box, owned.to, 0],
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
  it('lays a link over the member’s text in a \\url group beside other text over that group’s drawing (#626 review)', () => {
    // (the prepare reads \url as a link group, as \href: its tokens tagged with the group, the annotation paired with it; the
    // whole tier takes no annotation over part of the paragraph)
    const m = member({ spans: [['1', { cmd: 'url' }]] })
    const link: Link = { box: [100, 697, 220, 708], to: { url: 'https://example.org/x' }, owner: [0, ''] }
    const rr = row([
      { t: 'text', s: 'Siehe ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'https://example.org/x' }] },
      { t: 'text', s: ' dort, wo es weiter geht.' },
    ])
    const fates: LinkFate[] = []
    const p = layPage(part(m, [link]), rowsOf([rr]), rules, metrics(), { linkFates: fates })
    const laid = p.members[0]!
    expect(laid.state).toBe('laid')
    expect(fates).toEqual(['pair'])
    const [b, to] = only(p)
    expect(to).toEqual({ url: 'https://example.org/x' })
    // (from the URL's run, after "Siehe ", to past its start)
    const url = laid.lines.flatMap(([, , , it]) => it).find((it) => 'face' in it && it.s.startsWith('https'))!
    expect(b[0]).toBeCloseTo(url.x, 6)
    expect(b[2]).toBeGreaterThan(url.x)
  })
  it('lays two \\href groups of one target each over its own translation, one annotation each (#626 review)', () => {
    // (two links to one address, one after the other: one run of one target, two groups drawn; each occurrence its group)
    const m = member({
      spans: [
        ['1', { cmd: 'href' }],
        ['3', { cmd: 'href' }],
      ],
    })
    const to = { url: 'https://example.org/' }
    const a: Link = { box: [100, 697, 130, 708], to, owner: [0, ''] }
    const b: Link = { box: [160, 697, 190, 708], to, owner: [0, ''] }
    const rr = row([
      { t: 'text', s: 'Siehe ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'hier' }] },
      { t: 'text', s: ' und ' },
      { t: 'span', id: '3', content: [{ t: 'text', s: 'dort' }] },
      { t: 'text', s: ' nach.' },
    ])
    const p = layPage(part(m, [a, b]), rowsOf([rr]), rules, metrics())
    expect(p.links).toHaveLength(2)
    const [x, y] = p.links.map(([box]) => box) as unknown as [number[], number[]]
    // ("hier" six characters from the line's start, "dort" fifteen: half a size each)
    const [, x0] = p.members[0]!.lines[0]!
    const f = p.members[0]!.fit!.size
    expect(x[0]).toBeCloseTo(x0 + 6 * 0.5 * f, 1)
    expect(y[0]).toBeCloseTo(x0 + 15 * 0.5 * f, 1)
  })
  it('lays a link of the member’s other page over its \\href group drawn on this one, and nothing of it where none is (#626 review)', () => {
    // (a paragraph over pages 1 and 2 whose translated group is drawn on page 1, its annotation on page 2: the part of page 1
    // holds it with its page)
    const m = member({
      spans: [['1', { cmd: 'href' }]],
      lines: [
        [1, 0, 72, 300, 100, 107, 98, 72, 300, 0, 10],
        [2, 0, 72, 200, 700, 707, 698, 72, 300, 0, 10],
      ],
    })
    const link: Link = { box: [72, 697, 160, 708], to: { url: 'https://example.org/' }, owner: [0, ''], page: 2 }
    const rr = row([
      { t: 'span', id: '1', content: [{ t: 'text', s: 'Die Seite' }] },
      { t: 'text', s: ' ist dort.' },
    ])
    const p = layPage(part(m, [link]), rowsOf([rr]), rules, metrics())
    const [b, to] = only(p)
    expect(to).toEqual(link.to)
    // (on page 1's first laid line, from its start)
    const [y, x0] = p.members[0]!.lines[0]!
    expect(b[0]).toBeCloseTo(x0, 6)
    expect(b[1]).toBeLessThan(y)
    // (its group not drawn on page 1: nothing of it there, its box is page 2's)
    const plain = row([{ t: 'text', s: 'Die Seite ist dort.' }])
    expect(layPage(part({ ...m, spans: [] }, [link]), rowsOf([plain]), rules, metrics()).links).toEqual([])
    // (its owner not laid: nothing on page 1 either)
    expect(layPage(part(m, [link]), rowsOf([], true), rules, metrics()).links).toEqual([])
  })
  it('pairs a member’s \\href groups with its annotations in their order on A, whatever order the PDF lists them in (#626 review)', () => {
    // (two groups of two addresses; the part keeps the PDF's annotation array's order, which need not be TeX's: listed right to
    // left, the left group's translation opened the right one's address, Codex's case through layPage)
    const m = member({
      spans: [
        ['1', { cmd: 'href' }],
        ['3', { cmd: 'href' }],
      ],
    })
    const left = { url: 'https://example.org/left' }
    const right = { url: 'https://example.org/right' }
    const rr = row([
      { t: 'text', s: 'Siehe ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'hier' }] },
      { t: 'text', s: ' und ' },
      { t: 'span', id: '3', content: [{ t: 'text', s: 'dort' }] },
      { t: 'text', s: ' nach.' },
    ])
    /** the start of each link, by its address */
    const starts = (links: Link[]) => {
      const p = layPage(part(m, links), rowsOf([rr]), rules, metrics())
      const [, x0] = p.members[0]!.lines[0]!
      const f = p.members[0]!.fit!.size
      const by = new Map(p.links.map(([b, to]) => ['url' in to ? to.url : '', b[0]] as const))
      // ("hier" six characters from the line's start, "dort" fifteen: half a size each)
      return { left: by.get(left.url)! - x0, right: by.get(right.url)! - x0, f, n: p.links.length }
    }
    const a = starts([
      { box: [160, 697, 190, 708], to: right, owner: [0, ''] },
      { box: [100, 697, 130, 708], to: left, owner: [0, ''] },
    ])
    expect(a.n).toBe(2)
    expect(a.left).toBeCloseTo(6 * 0.5 * a.f, 1)
    expect(a.right).toBeCloseTo(15 * 0.5 * a.f, 1)
    // (the left group's link TeX broke over A's two lines, its piece on the second line listed first and the right group's
    // annotation before both: its two pieces one run of its target, in their order on A, the right group's its own)
    const b = starts([
      { box: [150, 685, 180, 696], to: right, owner: [0, ''] },
      { box: [72, 685, 100, 696], to: left, owner: [0, ''] },
      { box: [260, 697, 300, 708], to: left, owner: [0, ''] },
    ])
    expect(b.n).toBe(2)
    expect(b.left).toBeCloseTo(6 * 0.5 * b.f, 1)
    expect(b.right).toBeCloseTo(15 * 0.5 * b.f, 1)
  })
  it('pairs a right-to-left line’s groups with its annotations in its own direction, the rightmost first (Codex on #634)', () => {
    // (a Hebrew paragraph's two \href groups: TeX set the first group's text at the line's right; sorted left to right, the first
    // group's translation took the second's address)
    const rtl = (l: Placed['lines'][number]) => [...l.slice(0, 9), 8, ...l.slice(10)] as Placed['lines'][number]
    const m = member({
      spans: [
        ['1', { cmd: 'href' }],
        ['3', { cmd: 'href' }],
      ],
    })
    const first = { url: 'https://example.org/first' }
    const second = { url: 'https://example.org/second' }
    const rr = row([
      { t: 'text', s: 'Siehe ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'hier' }] },
      { t: 'text', s: ' und ' },
      { t: 'span', id: '3', content: [{ t: 'text', s: 'dort' }] },
      { t: 'text', s: ' nach.' },
    ])
    const links: Link[] = [
      { box: [100, 697, 130, 708], to: second, owner: [0, ''] },
      { box: [160, 697, 190, 708], to: first, owner: [0, ''] },
    ]
    const p = layPage(part({ ...m, lines: m.lines.map(rtl) }, links), rowsOf([rr]), rules, metrics())
    const [, x0] = p.members[0]!.lines[0]!
    const f = p.members[0]!.fit!.size
    const by = new Map(p.links.map(([b, to]) => ['url' in to ? to.url : '', b[0]] as const))
    expect(p.links).toHaveLength(2)
    expect(by.get(first.url)! - x0).toBeCloseTo(6 * 0.5 * f, 1)
    expect(by.get(second.url)! - x0).toBeCloseTo(15 * 0.5 * f, 1)
  })
  it('pairs a member’s link groups with its annotations by the target each group states where their counts differ', () => {
    // (an \href to one address and a \hyperlink to a destination, and between them a link over text that is no group's: three
    // annotations, two groups, which no rule of order pairs (every link was dropped). The part states each group's target
    // (SpanAt.to), as today's url and name tiers read it from the source (links.mjs matchUnit); the URL compared in the WHATWG
    // parser's form, as today's urlOf compares two)
    const m = member({
      spans: [
        ['1', { cmd: 'href', to: { url: 'https://example.org/a' } }],
        ['3', { cmd: 'hyperlink', to: { dest: '"intro"' } }],
      ],
    })
    const rr = row([
      { t: 'text', s: 'Siehe ' },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'hier' }] },
      { t: 'text', s: ' und ' },
      { t: 'span', id: '3', content: [{ t: 'text', s: 'dort' }] },
      { t: 'text', s: ' nach.' },
    ])
    const links: Link[] = [
      { box: [100, 697, 130, 708], to: { url: 'HTTPS://Example.ORG/a' }, owner: [0, ''] },
      { box: [135, 697, 155, 708], to: { url: 'https://example.org/other' }, owner: [0, ''] },
      { box: [160, 697, 190, 708], to: { dest: '"intro"' }, owner: [0, ''] },
    ]
    const fates: LinkFate[] = []
    const p = layPage(part(m, links), rowsOf([rr]), rules, metrics(), { linkFates: fates })
    expect(fates).toEqual(['pair', 'unmatched', 'pair'])
    const [, x0] = p.members[0]!.lines[0]!
    const f = p.members[0]!.fit!.size
    expect(p.links.map(([, to]) => to)).toEqual([links[0]!.to, links[2]!.to])
    // ("hier" six characters from the line's start, "dort" fifteen: half a size each)
    expect(p.links[0]![0][0] - x0).toBeCloseTo(6 * 0.5 * f, 1)
    expect(p.links[1]![0][0] - x0).toBeCloseTo(15 * 0.5 * f, 1)
  })
  describe('a member over two pages, its groups set on either', () => {
    // (a paragraph whose first line is page 1's, its second page 2's: an \href to each of two addresses and a \hyperref, whose
    // destination its source does not name; the first address's annotation on page 1, the second's on page 2, the \hyperref's
    // none (three groups, two annotations: no rule of order pairs them over the member). Each page's part holds the member's
    // annotations of its other page with that page, as the bundle gives them)
    const m = member({
      spans: [
        ['1', { cmd: 'href', to: { url: 'https://example.org/one' } }],
        ['3', { cmd: 'href', to: { url: 'https://example.org/two' } }],
        ['5', { cmd: 'hyperref' }],
      ],
      lines: [
        [1, 0, 72, 300, 100, 107, 98, 72, 300, 0, 10],
        [2, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      ],
    })
    const one: Link = { box: [72, 97, 120, 108], to: { url: 'https://example.org/one' }, owner: [0, ''] }
    const two: Link = { box: [72, 697, 120, 708], to: { url: 'https://example.org/two' }, owner: [0, ''] }
    const onPage = (n: 1 | 2): Part => ({
      ...part(m, n === 1 ? [one, { ...two, page: 2 }] : [two, { ...one, page: 1 }]),
      page: n,
    })
    /** each page's links, by address, with the text drawn under each */
    const laidOn = (rr: Row) =>
      ([1, 2] as const).map((n) => {
        const p = layPage(onPage(n), rowsOf([rr]), rules, metrics())
        const items = p.members[0]!.lines.flatMap(([y, , , it]) => it.map((x) => ({ ...x, y })))
        return p.links.map(([b, to]) => {
          const under = items.filter((x) => 'face' in x && x.x >= b[0] - 1e-6 && x.x < b[2] && x.y > b[1] && x.y < b[3])
          return ['url' in to ? to.url : to.dest, under.map((x) => x.s.trim()).join(' ')]
        })
      })
    it('draws each link over its own group where the translation sets it, never over another’s', () => {
      // (both \href groups set on page 1, the \hyperref on page 2: page 1 draws both links, the second its other page's; page 2
      // draws none (by order, page 2's own annotation went to the one group drawn there, the \hyperref's translation))
      const rr = row([
        { t: 'span', id: '1', content: [{ t: 'text', s: 'Eins' }] },
        { t: 'text', s: ' und ' },
        { t: 'span', id: '3', content: [{ t: 'text', s: 'Zwei' }] },
        { t: 'text', s: ' sind die beiden Seiten, von denen ' },
        { t: 'text', s: 'hier die Rede ist, mehr steht ' },
        { t: 'span', id: '5', content: [{ t: 'text', s: 'weiter' }] },
        { t: 'text', s: ' unten.' },
      ])
      const [p1, p2] = laidOn(rr)
      expect(p1).toEqual([
        ['https://example.org/one', 'Eins'],
        ['https://example.org/two', 'Zwei'],
      ])
      expect(p2).toEqual([])
    })
    it('draws each annotation once over both pages, on the page its group falls on (neither lost nor drawn twice)', () => {
      // (both \href groups set on page 2: page 2 draws both, the first its other page's annotation; page 1 draws neither, at its
      // box or moved)
      const rr = row([
        { t: 'text', s: 'Ein langer Satz steht zuerst und füllt die erste Zeile ganz, ' },
        { t: 'span', id: '1', content: [{ t: 'text', s: 'Eins' }] },
        { t: 'text', s: ' und ' },
        { t: 'span', id: '3', content: [{ t: 'text', s: 'Zwei' }] },
        { t: 'text', s: ' mit ' },
        { t: 'span', id: '5', content: [{ t: 'text', s: 'dem' }] },
        { t: 'text', s: ' Rest.' },
      ])
      const [p1, p2] = laidOn(rr)
      expect(p1).toEqual([])
      expect(p2).toEqual([
        ['https://example.org/one', 'Eins'],
        ['https://example.org/two', 'Zwei'],
      ])
    })
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
  it('lays a link the part states holds every glyph of the member (Link.whole) over its whole drawing, whatever its ink', () => {
    // (2610.37668v1-zh p15: a contents entry's link round its title, its last glyph's ink 0.09 pt past the link's box: each
    // line's ink inside a box, every entry was dropped. The part states what today's whole tier asks, every own character's
    // glyph point under them)
    const entry = member({ kind: 'inkcontents', lines: [[1, 0, 66, 163.5, 700, 707, 698, 52, 300, 0, 10]] })
    const title: Link = { box: [51.81, 696, 163.41, 709], to: { dest: '"appendix.A"' }, owner: [0, ''], text: 'AHexel' }
    const rr = row([{ t: 'text', s: 'Hexel-Parametrisierung' }])
    const fates: LinkFate[] = []
    expect(layPage(part(entry, [title]), rowsOf([rr]), rules, metrics(), { linkFates: fates }).links).toEqual([])
    expect(fates).toEqual(['unmatched'])
    const f2: LinkFate[] = []
    const p = layPage(part(entry, [{ ...title, whole: 1 }]), rowsOf([rr]), rules, metrics(), { linkFates: f2 })
    expect(f2).toEqual(['whole'])
    expect(only(p)[0][0]).toBeCloseTo(p.members[0]!.lines[0]![1], 6)
  })
  describe('an annotation the part gives to the member’s text, of a kind its elements carry (today’s order tier)', () => {
    // (2608.25210v2-zh p13: hyperref's link round \ref's "7" takes in the comma after it, its glyph point inside the box by
    // the link's margin, so the part gives it to the text (the element owns one of its two glyphs, not more than half); the member
    // has no link group, and it was dropped. Today's matchUnit pairs what geometry leaves with the unit's pieces of its kind in
    // their orders (links.mjs:420): a destination with the references and \hyperref groups, a footnote's mark with the marks)
    const ref = (o: Record<string, unknown> = {}) => ({
      kind: 'num',
      cmd: 'ref',
      text: '7',
      style: { role: 'serif' as const, size: 10 },
      ink: [[1, 150, 698, 155, 707, 700]] as [number, number, number, number, number, number][],
      ...o,
    })
    const r7 = row([
      { t: 'text', s: 'Siehe Tabelle ' },
      { t: 'el', id: '5' },
      { t: 'text', s: ', dort steht es.' },
    ])
    const comma: Link = { box: [149, 697, 157, 708], to: { dest: '"table.7"' }, owner: [0, ''], text: '7,' }
    /** each drawn link's target with the drawn characters whose middles are under it (half a size each, as `metrics` sets) */
    const under = (p: Page) => {
      const f = p.members[0]!.fit!.size
      const chars = p.members[0]!.lines.flatMap(([y, , , it]) =>
        it.flatMap((x) => ('face' in x ? [...x.s].map((ch, j) => ({ ch, y, x: x.x + (j + 0.5) * 0.5 * f })) : [])),
      )
      return p.links.map(([b, to]) => [
        'url' in to ? to.url : to.dest,
        chars
          .filter((c) => c.x > b[0] && c.x < b[2] && c.y > b[1] && c.y < b[3])
          .map((c) => c.ch)
          .join('')
          .trim(),
      ])
    }
    it('lays it over the reference it stands over, drawn as text', () => {
      const fates: LinkFate[] = []
      const p = layPage(part(member({ els: [['5', ref()]] }), [comma]), rowsOf([r7]), rules, metrics(), {
        linkFates: fates,
      })
      expect(fates).toEqual(['text'])
      const [b, to] = only(p)
      expect(to).toEqual(comma.to)
      // (paired by order alone, its characters not found among the drawn ones: none, never over the whole piece, placeText)
      const f2: LinkFate[] = []
      const q = layPage(
        part(member({ els: [['5', ref()]] }), [{ ...comma, text: '9,' }]),
        rowsOf([r7]),
        rules,
        metrics(),
        {
          linkFates: f2,
        },
      )
      expect([f2, q.links]).toEqual([['unplaced'], []])
      // (over the drawn "7" alone: the comma is the text's, drawn after it)
      const seven = p.members[0]!.lines.flatMap(([, , , it]) => it).find((it) => 'face' in it && it.s.startsWith('7'))!
      expect(b[0]).toBeCloseTo(seven.x, 6)
      expect(b[2] - b[0]).toBeCloseTo(0.5 * p.members[0]!.fit!.size, 6)
    })
    it('lays a footnote’s mark the same way, and pairs a reference and a \\hyperref group in their source’s order', () => {
      // (a nested footnote's mark "1" with the full stop after it, Hfootnote.2: 2608.25210v2-zh p1)
      const mark = member({
        els: [['5', { kind: 'num', mark: 1, nested: 1, text: '1', ink: [[1, 150, 703, 153, 707, 700]] }]],
      })
      const stop: Link = { box: [149, 697, 157, 708], to: { dest: '"Hfootnote.2"' }, owner: [0, ''], text: '1.' }
      const fates: LinkFate[] = []
      layPage(part(mark, [stop]), rowsOf([r7]), rules, metrics(), { linkFates: fates })
      expect(fates).toEqual(['text'])
      // (a \hyperref group after the reference: two destinations, two pieces of their kind; the part made before paired none, the
      // order over all bare groups having one group for two annotations)
      const both = member({ els: [['5', ref()]], spans: [['7', { cmd: 'hyperref' }]] })
      const hyper: Link = { box: [200, 697, 240, 708], to: { dest: '"sec.2"' }, owner: [0, ''] }
      const rr = row([
        { t: 'text', s: 'Siehe Tabelle ' },
        { t: 'el', id: '5' },
        { t: 'text', s: ', und ' },
        { t: 'span', id: '7', content: [{ t: 'text', s: 'dort' }] },
        { t: 'text', s: ' mehr.' },
      ])
      const f2: LinkFate[] = []
      const p = layPage(part(both, [hyper, comma]), rowsOf([rr]), rules, metrics(), { linkFates: f2 })
      expect(f2).toEqual(['pair', 'text'])
      expect(under(p)).toEqual([
        ['"table.7"', '7'],
        ['"sec.2"', 'dort'],
      ])
    })
    it('pairs none where they are not as many (a destination no piece of its kind is left for)', () => {
      // (two such annotations, one reference: as today's assign, none of them, never a guess)
      const other: Link = { box: [250, 697, 258, 708], to: { dest: '"table.8"' }, owner: [0, ''], text: '8.' }
      const fates: LinkFate[] = []
      const p = layPage(part(member({ els: [['5', ref()]] }), [comma, other]), rowsOf([r7]), rules, metrics(), {
        linkFates: fates,
      })
      expect(fates).toEqual(['unmatched', 'unmatched'])
      expect(p.links).toEqual([])
      // (a reference that holds its own annotation takes no other of its kind)
      const own: Link = { box: [150, 697, 155, 708], to: { dest: '"table.7"' }, owner: [0, '5'], text: '7' }
      const f2: LinkFate[] = []
      layPage(part(member({ els: [['5', ref()]] }), [own, other]), rowsOf([r7]), rules, metrics(), { linkFates: f2 })
      expect(f2).toEqual(['text', 'unmatched'])
    })
  })
  it('keeps at A’s box a link over the member’s label, where its label stays (an endnote’s back-reference)', () => {
    // (2609.36054v2-zh p14: enotez's "3" before each endnote links back to its mark; the part gives it to the member with the
    // label's glyphs, Link.label. The label is not drawn anew: its ink stays on, and so does its link, as today's freeze keeps a
    // link no tier took whose glyphs no operation of the page erased)
    const note = member({
      kind: 'footnote',
      label: {
        kind: 'mark',
        ink: [1, 60, 700, 64, 707, 700],
        style: { role: 'serif', size: 10 },
        num: ['3', [1, 60, 700, 64, 707, 700]],
      },
    })
    const back: Link = { box: [59, 697, 65, 708], to: { dest: '"enz.3.backref"' }, owner: [0, ''], text: '3', label: 1 }
    const rr = row([{ t: 'text', s: 'Eine Anmerkung, die weiter läuft.' }])
    const fates: LinkFate[] = []
    const p = layPage(part(note, [back]), rowsOf([rr]), rules, metrics(), { linkFates: fates })
    expect(p.members[0]!.off & 4).toBe(0)
    expect(fates).toEqual(['kept'])
    expect(p.links).toEqual([[back.box, back.to, 0]])
    // (a theorem's head drawn anew in the target's word: its label's ink off, the link over it dropped, never left over
    // erased paper)
    const head = member({
      kind: 'theorem',
      label: {
        kind: 'head',
        ink: [1, 72, 698, 112, 707, 700],
        style: { role: 'serif', size: 10, bold: 1 },
        name: ['Theorem', [1, 72, 698, 105, 707, 700]],
        num: ['1', [1, 107, 698, 110, 707, 700]],
        punct: ['.', [1, 110, 698, 112, 707, 700]],
      },
    })
    const onHead: Link = { box: [106, 697, 111, 708], to: { dest: '"thm.1"' }, owner: [0, ''], text: '1', label: 1 }
    const f2: LinkFate[] = []
    const q = layPage(part(head, [onHead]), rowsOf([rr]), rules, metrics(), { linkFates: f2 })
    expect(q.members[0]!.off & 4).toBe(4)
    expect(f2).toEqual(['off'])
    expect(q.links).toEqual([])
  })
  it('lays an element’s own links where one round it holds them on A (a link left open over a footnote)', () => {
    // (2610.10069v1-zh p10, ord 74: a citation's link left open over a whole footnote, one annotation a line; its last line's
    // holds "Berry et al. (1995)." and the two of that citation, "Berry et al." and "1995", and the part gives it to the
    // citation, which owns most of its glyphs. Searched first, it took the citation's whole drawing and its own two were
    // unplaced. A link round others on A is not the element's own: its characters run past it (today's geometry tier: every
    // character the piece's) and it is the text's)
    const m = member({
      els: [
        [
          '9',
          {
            kind: 'cite',
            cmd: 'citet',
            text: 'Berry et al. (1995)',
            style: { role: 'serif', size: 10 },
            ink: [[1, 72, 698, 153, 707, 700]],
          },
        ],
      ],
    })
    const round: Link = {
      box: [71, 697, 301, 708],
      to: { dest: '"cite.f"' },
      owner: [0, '9'],
      text: 'Berryetal.(1995).',
    }
    const a: Link = { box: [71, 697, 123, 708], to: { dest: '"cite.blp"' }, owner: [0, '9'], text: 'Berryetal.' }
    const b: Link = { box: [128, 697, 150, 708], to: { dest: '"cite.blp"' }, owner: [0, '9'], text: '1995' }
    const rr = row([
      { t: 'el', id: '9' },
      { t: 'text', s: ' zeigen es, und der Satz läuft weiter.' },
    ])
    const fates: LinkFate[] = []
    const p = layPage(part(m, [round, a, b]), rowsOf([rr]), rules, metrics(), { linkFates: fates })
    expect(fates).toEqual(['unmatched', 'text', 'text'])
    const runs = p.members[0]!.lines.flatMap(([, , , it]) => it).filter((it) => 'face' in it)
    expect(p.links.map(([box, to]) => ['dest' in to ? to.dest : '', box[0]])).toEqual([
      ['"cite.blp"', runs.find((it) => it.s.startsWith('Berry'))!.x],
      ['"cite.blp"', expect.any(Number)],
    ])
  })
  it('lays a link of an element the translation moves across the page break over its drawing, on the page it is set on', () => {
    // (2610.20484v1-zh t62: a theorem from p6's last line onto p7, its \eqref "(8)" on p7; the translation sets "(8)" on p6's
    // line, cut from p7. p6 holds the annotation with its page; the member has no element ink on p6, so its elements' group
    // there was read as on, the element as staying, and the link was p7's at its box, where p7 drew nothing of it)
    const m = member({
      lines: [
        [1, 0, 72, 300, 100, 107, 98, 72, 300, 0, 10],
        [2, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
        [2, 0, 72, 200, 688, 695, 686, 72, 300, 0, 10],
      ],
      els: [['5', { kind: 'num', cmd: 'eqref', ink: [[2, 150, 698, 170, 707, 700]] }]],
    })
    const eq: Link = { box: [149, 697, 171, 708], to: { dest: '"equation.8"' }, owner: [0, '5'], text: '(8)' }
    const rr = row([
      { t: 'text', s: 'Nach ' },
      { t: 'el', id: '5' },
      { t: 'text', s: ' gilt es, und der Satz läuft über die Seite weiter bis zum Ende der Zeile.' },
    ])
    const onPage = (n: 1 | 2) => {
      const fates: LinkFate[] = []
      const p = layPage(
        { ...part(m, n === 1 ? [{ ...eq, page: 2 }] : [eq]), page: n },
        rowsOf([rr]),
        rules,
        metrics(),
        { linkFates: fates },
      )
      return { p, fates }
    }
    const one = onPage(1),
      two = onPage(2)
    // (the crop on page 1's line)
    expect(cropOf(one.p.members[0]!)).toBeDefined()
    expect(one.fates).toEqual(['crop'])
    expect(one.p.links).toHaveLength(1)
    expect(one.p.links[0]![0][0]).toBeCloseTo(cropOf(one.p.members[0]!)!.it.x, 6)
    // (page 2 draws nothing of it: its element is drawn on page 1)
    expect(two.fates).toEqual(['away'])
    expect(two.p.links).toEqual([])
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
  it('draws a turned one at its angle along its run about its anchor, its runs along it, lit by its turned box', () => {
    // (a y-axis title "Loss" set a quarter turned: its run from (150, 380) up for 20, centred, its room 20 before and after along
    // it (Placed.run's own: Room.side keeps its meaning, the side of its box across the page, the label's 120-180, which an
    // older typesetter reads as before); its line on A its box on the page)
    const quarter = label({
      dir: [0, 1],
      run: [150, 380, 20, 20, 20],
      lines: [[1, 0, 144, 152, 380, 400, 380, 144, 152, 0, 8]],
    })
    const m = layPage(part(quarter), rowsOf([rowF('Verlust')]), rules, metrics()).members[0]!
    expect(m).toMatchObject({ state: 'laid', off: 1 })
    // ("Verlust", 28 along at 8, centred on its run's middle (390): from 376 up; its line from its origin (150, 376) along (0, 1),
    // its runs' places along it from x0)
    const [y, x0, x1, items] = m.lines[0]!
    expect([y, x0, x1]).toEqual([376, 150, 178])
    expect(items).toEqual([expect.objectContaining({ s: 'Verlust', x: 150, size: 8, dir: [0, 1] })])
    // (lit turned with it, its boxes in its run's frame: along (0, 1) a point's y, across it (−1, 0) its −x. On A its run's box,
    // 380 to 400 along it from its origin, across it the band its box on the page tells, x 144-152 about 150: −152 to −144)
    expect(m.lit.dir).toEqual([0, 1])
    expect(m.lit.left).toEqual([[[380, -152, 400, -144]]])
    // (its box as drawn: along the run 376 to 404, across it its band at 8 on the run's left, the turned page's up: its baseline
    // 0.22 of its size under, 0.75 over, a Latin run's tokenBand)
    const [b] = m.lit.right[0]!
    for (const [v, w] of b!.map((v, k) => [v, [376, -151.76, 404, -144][k]!])) expect(v).toBeCloseTo(w!, 6)
    // (its room along its run is the run's: 4 before and after leave 28 to "Verluste", 32 at 8: its set at 7)
    const tight = label({ ...quarter, run: [150, 380, 20, 4, 4] })
    const t = layPage(part(tight), rowsOf([rowF('Verluste')]), rules, metrics()).members[0]!
    expect(t.state).toBe('laid')
    expect((t.lines[0]![3][0] as { size: number }).size).toBeCloseTo(7, 9)
    // (any angle the original states: one turned 30 degrees, set from its start, its room after it along its run; its line on A
    // the page's box its run's box stands in, 20 along it from (100, 300), 2 under its baseline and 6 over)
    const [ux, uy] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]
    const corners = [0, 20].flatMap((a) => [-2, 6].map((c) => [100 + a * ux - c * uy, 300 + a * uy + c * ux]))
    const [bx0, bx1] = [Math.min(...corners.map((q) => q[0]!)), Math.max(...corners.map((q) => q[0]!))]
    const [by0, by1] = [Math.min(...corners.map((q) => q[1]!)), Math.max(...corners.map((q) => q[1]!))]
    const slant = label({
      align: 'l',
      dir: [ux, uy],
      run: [100, 300, 20, 0, 60],
      lines: [[1, 0, bx0, bx1, 300, by1, by0, bx0, bx1, 0, 8]],
    })
    const s = layPage(part(slant), rowsOf([rowF('Verlust')]), rules, metrics()).members[0]!
    expect(s.state).toBe('laid')
    const [sy, sx0, sx1, sitems] = s.lines[0]!
    expect([sy, sx0, sx1]).toEqual([300, 100, 128])
    expect(sitems[0]).toMatchObject({ x: 100, dir: [ux, uy] })
    // (lit turned with it: on A its run's box, never the level box over it it stands in on the page; as drawn its line, 28
    // along it from its origin, its band across)
    const [os, ot] = [100 * ux + 300 * uy, 300 * ux - 100 * uy]
    expect(s.lit.dir).toEqual([ux, uy])
    const near = (got: number[] | undefined, want: number[]) => {
      expect(got).toHaveLength(4)
      for (const [k, v] of got!.entries()) expect(v).toBeCloseTo(want[k]!, 6)
    }
    near(s.lit.left[0]![0], [os, ot - 2, os + 20, ot + 6])
    near(s.lit.right[0]![0], [os, ot - 1.76, os + 28, ot + 6])
    // (one not drawn, its translation its source: the original's, lit from A on both panes, turned the same)
    const kept = layPage(part(slant), rowsOf([rowF('LOSS')]), rules, metrics()).members[0]!
    expect(kept.state).toBe('none')
    expect(kept.lit.dir).toEqual([ux, uy])
    near(kept.lit.left[0]![0], [os, ot - 2, os + 20, ot + 6])
    expect(kept.lit.right).toEqual(kept.lit.left)
  })
  it('lays no translation over a figure text whose ink stays: the part’s why, the original’s (#631 review)', () => {
    // (a label today's figure reading leaves where it stands, crowded: no group of it, the part states it unwrapped)
    const p = layPage(part(label({ why: 'unwrapped' })), rowsOf([rowF('Verlust')]), rules, metrics())
    expect(p.members[0]).toMatchObject({ state: 'unwrapped', off: 0, lines: [] })
  })
  it('keeps a failed row’s reason for a figure text, as for any member (#631 review)', () => {
    const failed: Row = { id: idF, ok: false, why: { kind: 'unavailable' } }
    expect(layPage(part(label()), rowsOf([failed]), rules, metrics()).members[0]).toMatchObject({
      state: 'unavailable',
      off: 0,
      lines: [],
    })
  })
  it('sets a figure text of a part that states no plain text of it as before S.figures read parts (#631 review)', () => {
    // (a part made before the prepare stated Placed.plain: S.figures would tell its translation from an empty source and redraw
    // even a label its translation leaves as it was. It is read as the entry read every figure text before (ec6715946's: a
    // paragraph's reading, its fit and its line), these numbers that entry's own on this part)
    const { plain: _, ...older } = label()
    const m = layPage(part(older), rowsOf([rowF('Loss')]), rules, metrics()).members[0]!
    expect(m).toMatchObject({ state: 'laid', off: 1, fit: { size: 8, lead: 1, track: 0, borrowed: 0 } })
    expect(m.lines.map(([y, x0, x1, items]) => [y, x0, x1, items.map((it) => [it.s, it.x])])).toEqual([
      [400, 124, 158, [['Loss ', 142]]],
    ])
  })
  it('leaves the original’s a turned one whose run the part does not state, and one whose anchor it does not state', () => {
    const turned = layPage(part(label({ dir: [0, 1] })), rowsOf([rowF('Verlust')]), rules, metrics()).members[0]!
    expect(turned).toMatchObject({ state: 'kind', off: 0, lines: [] })
    const before = layPage(part(label({ align: 'j' })), rowsOf([rowF('Verlust')]), rules, metrics()).members[0]!
    expect(before).toMatchObject({ state: 'kind', off: 0, lines: [] })
  })
})
