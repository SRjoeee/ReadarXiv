// A paragraph TeX opened inside a member's text at its first word (design-display 2a, the lay's half): the part states the
// word's offset in the unit's source projection and the line TeX opened the paragraph on (Placed.paras); the lay pairs it with
// the row's sentence start whose first word on A is that word, and opens a block there, the text before ending its own;
// where no start is paired (an offset inside a sentence, a row with no sentences) the text flows on and the member states it
// (Laid.paras). A point stated at a group the reply did not bring back between its texts falls back to that offset. Content of
// our own; the measure is the stand-in metrics' (half the size a character).
import type { OutPiece, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rowPieces } from '../../src/lay/read.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Item, Metrics, Rows } from '../../src/types.ts'
import { paraPieces, type V0Piece } from '../../src/unit/breaks.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const rules = rulesFor('de')
const id = 'b'.repeat(64)
const lineAt = (base: number, x1: number): Placed['lines'][number] => [
  1,
  0,
  72,
  x1,
  base,
  base + 7,
  base - 2,
  72,
  300,
  0,
  10,
]
// (the source, "First paragraph ends here. Second paragraph starts here and runs on to its end.", each word's offset in its
// projection, the line its first glyph stands on and that glyph's x: TeX ended the first paragraph on line 1, short, and opened
// the second on line 2)
const SOURCE = 'First paragraph ends here. Second paragraph starts here and runs on to its end.'
const wordsOf = (lineOf: (o: number) => number): NonNullable<Placed['words']> =>
  [...SOURCE.matchAll(/\S+/g)].map((w) => [w.index, lineOf(w.index), 72 + (w.index % 40) * 5])
const SECOND = SOURCE.indexOf('Second')
const member = (o: Partial<Placed & { paras: [number, number][] }> = {}): Placed =>
  ({
    ord: 0,
    kind: 'para',
    text: id,
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [lineAt(700, 300), lineAt(688, 150), lineAt(676, 300), lineAt(664, 200)],
    room: { below: 20, next: 24 },
    words: wordsOf((o) => (o < 6 ? 0 : o < SECOND ? 1 : o < SOURCE.indexOf('and') ? 2 : 3)),
    ...o,
  }) as Placed
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowsOf = (r: Row): Rows => ({ get: (k) => (k === r.id ? r : undefined), done: true })
// (the translation: two sentences, the second at its offset 29 of the translation's projection, the source's at SECOND)
const FIRST_DE = 'Der erste Absatz endet hier. '
const SECOND_DE = 'Der zweite Absatz beginnt hier und läuft bis zu seinem Ende weiter.'
const row = (content: OutPiece[], sentences?: Row & { ok: true } extends { sentences?: infer S } ? S : never): Row => ({
  id,
  ok: true,
  by: 'test',
  content,
  ...(sentences ? { sentences } : {}),
})
const plain: OutPiece[] = [{ t: 'text', s: FIRST_DE + SECOND_DE }]
const cuts = { src: [SECOND], tr: [FIRST_DE.length] }
const lay = (m: Placed, r: Row) => layPage(part(m), rowsOf(r), rules, metrics).members[0]!
const textOf = (l: { 3: Item[] }) =>
  l[3]
    .map((it) => it.s)
    .join('')
    .trim()

describe('a paragraph opened at its first word (Placed.paras), paired with the row’s sentence start', () => {
  it('opens the second paragraph on the line TeX opened it on, the first ending ragged on its own line', () => {
    const laid = lay(member({ paras: [[SECOND, 2]] }), row(plain, cuts))
    expect(laid.state).toBe('laid')
    const at = laid.lines.findIndex((l) => textOf(l).startsWith('Der zweite'))
    expect(at).toBeGreaterThan(0)
    expect(laid.lines[at]![0]).toBe(676)
    expect(laid.lines[at]![1]).toBe(72)
    expect(textOf(laid.lines[at - 1]!)).toMatch(/hier\.$/)
    // (the line before is its block's last: set at its words' width, not spread to the measure)
    expect(laid.lines[at - 1]![2]).toBeLessThan(300 - 5)
    expect(laid.paras).toEqual([1, 0, 0])
  })
  it('lays the unit as one paragraph where its part states no point, as before (no statement)', () => {
    const laid = lay(member(), row(plain, cuts))
    expect(laid.lines.some((l) => textOf(l).startsWith('Der zweite'))).toBe(false)
    expect(laid.paras).toBeUndefined()
  })
  it('falls back to the offset where the reply dropped the group TeX opened the paragraph at (its group put back at the end)', () => {
    // (the part states the point at the group's open, SpanAt.opens, and its first word's offset; the reply lost the group's
    // place, and the reading put it back at the unit's end with no text after it: the group opens nothing, the offset does)
    const spans: Placed['spans'] = [['7', { cmd: 'textbf', opens: 2 }]]
    const dropped: OutPiece[] = [...plain, { t: 'span', id: '7', content: [] }]
    const laid = lay(member({ spans, paras: [[SECOND, 2]] }), row(dropped, cuts))
    const at = laid.lines.findIndex((l) => textOf(l).startsWith('Der zweite'))
    expect(laid.lines[at]![0]).toBe(676)
    expect(laid.paras).toEqual([1, 0, 0])
    // (the group held between its texts: it opens the paragraph, the stronger fact, the offset not cut in a second time)
    const held: OutPiece[] = [
      { t: 'text', s: FIRST_DE },
      { t: 'span', id: '7', content: [{ t: 'text', s: 'Der zweite' }] },
      { t: 'text', s: SECOND_DE.slice('Der zweite'.length) },
    ]
    const laid2 = lay(member({ spans, paras: [[SECOND, 2]] }), row(held, cuts))
    const at2 = laid2.lines.findIndex((l) => textOf(l).startsWith('Der zweite'))
    expect(laid2.lines[at2]![0]).toBe(676)
    expect(laid2.paras).toEqual([1, 0, 0])
  })
  it('flows on where the point falls inside a sentence: no nearest start taken, the member states it', () => {
    // (TeX opened a paragraph at "here" of the first sentence, a float set in the middle of it: no start of the row's is that
    // word, so the text runs on)
    const HERE = SOURCE.indexOf('here')
    const m = member({
      paras: [[HERE, 2]],
      words: wordsOf((o) => (o < HERE ? 1 : 2)),
    })
    const laid = lay(m, row(plain, cuts))
    expect(laid.state).toBe('laid')
    expect(textOf(laid.lines[0]!)).toMatch(/^Der erste Absatz endet hier\. Der/)
    expect(laid.paras).toEqual([0, 1, 0])
  })
  it('flows on where the row carries no sentences, and states it apart', () => {
    const laid = lay(member({ paras: [[SECOND, 2]] }), row(plain))
    expect(laid.lines.some((l) => textOf(l).startsWith('Der zweite'))).toBe(false)
    expect(laid.paras).toEqual([0, 0, 1])
  })
})

describe('a paragraph opened directly after the element that ended the one before (Placed.parasAfter)', () => {
  // (cas-sc's keywords, `Latent Twins \sep Stochastic Solution Operators \sep Wasserstein Approximation`, one a line: each
  // `\sep` is `\par` and sets nothing; the part names it beside each point, the row returns it in its place and carries no
  // sentences)
  const KW = 'Latent Twins \u0000 Stochastic Solution Operators \u0000 Wasserstein Approximation'
  const kwWords: NonNullable<Placed['words']> = [...KW.matchAll(/[A-Za-z]+/g)].map((w) => [
    w.index,
    w.index < 15 ? 0 : w.index < 47 ? 1 : 2,
    72,
  ])
  const sepEl: NonNullable<Placed['els']>[number][1] = {
    kind: 'umacro',
    ink: [],
    text: '',
    cmd: 'sep',
    bare: 1,
    unknown: 1,
  }
  const keywords = (o: Partial<Placed> = {}): Placed =>
    member({
      lines: [lineAt(700, 150), lineAt(688, 200), lineAt(676, 200)],
      words: kwWords,
      paras: [
        [15, 1],
        [47, 2],
      ],
      parasAfter: ['1', '3'],
      els: [
        ['1', sepEl],
        ['3', sepEl],
      ],
      ...o,
    })
  const kwRow = (a: string, b: string): Row =>
    row([
      { t: 'text', s: 'Latente Zwillinge' },
      { t: 'el', id: a },
      { t: 'text', s: ' Stochastische Lösungsoperatoren' },
      { t: 'el', id: b },
      { t: 'text', s: ' Wasserstein-Näherung' },
    ])
  it('sets one keyword a line, each on the line TeX opened it on, where no sentence start pairs the point', () => {
    const laid = lay(keywords(), kwRow('1', '3'))
    expect(laid.state).toBe('laid')
    expect(laid.lines.map((l) => [l[0], textOf(l)])).toEqual([
      [700, 'Latente Zwillinge'],
      [688, 'Stochastische Lösungsoperatoren'],
      [676, 'Wasserstein-Näherung'],
    ])
    expect(laid.lines.every((l) => l[1] === 72)).toBe(true)
    // (opened, none for want of a start or of sentences; opened by their element, none not returned once)
    expect(laid.paras).toEqual([2, 0, 0, 2, 0])
    // (the same row with no element named: the keywords run on, as before)
    const before = lay(keywords({ parasAfter: undefined }), kwRow('1', '3'))
    expect(before.lines.some((l) => textOf(l).startsWith('Stochastische'))).toBe(false)
    expect(before.paras).toEqual([0, 0, 2])
  })
  it('opens none at an element the translation does not return exactly once, nor at one two points name, and counts them', () => {
    // (the reply returns `\sep` 1 twice and 3 never)
    const twice = lay(keywords(), kwRow('1', '1'))
    expect(twice.state).toBe('laid')
    expect(twice.lines.some((l) => l[0] === 688 && textOf(l).startsWith('Stochastische'))).toBe(false)
    expect(twice.paras).toEqual([0, 0, 0, 0, 2])
    // (two points naming one element: neither opened)
    const shared = lay(keywords({ parasAfter: ['1', '1'] }), kwRow('1', '3'))
    expect(shared.lines.some((l) => textOf(l).startsWith('Wasserstein'))).toBe(false)
    expect(shared.paras).toEqual([0, 0, 0, 0, 2])
  })
  it('leaves a point a sentence start pairs as the sentence opens it (after `\\medbreak`, an element of no ink)', () => {
    const els: Placed['els'] = [['9', { kind: 'umacro', ink: [], text: '', cmd: 'medbreak', bare: 1, unknown: 1 }]]
    const content: OutPiece[] = [
      { t: 'text', s: FIRST_DE },
      { t: 'el', id: '9' },
      { t: 'text', s: SECOND_DE },
    ]
    // (the sentence's start at its first letter, past the element: the translation's offset 30)
    const sentences = { src: [SECOND], tr: [FIRST_DE.length + 1] }
    const named = lay(member({ els, paras: [[SECOND, 2]], parasAfter: ['9'] }), row(content, sentences))
    const unnamed = lay(member({ els, paras: [[SECOND, 2]] }), row(content, sentences))
    expect(named.lines).toEqual(unnamed.lines)
    expect(named.lines.find((l) => textOf(l).startsWith('Der zweite'))?.[0]).toBe(676)
    expect(named.paras).toEqual([1, 0, 0, 0, 0])
    expect(unnamed.paras).toEqual([1, 0, 0])
  })
})

describe('paraPieces: the row cut where its paired sentence begins, its projection unchanged', () => {
  const proj = (ps: readonly V0Piece[]) =>
    ps.map((p) => (p.t === 'text' ? p.s : p.t === 'ph' || p.t === 'nested' ? '￼' : '')).join('')
  it('cuts a text piece at the sentence’s first letter, a piece of the typesetter’s own between', () => {
    const m = member({ paras: [[SECOND, 2]] })
    const pieces = rowPieces(m, plain)
    const got = paraPieces(m, pieces, cuts)
    expect(got.pieces.map((p) => p.t)).toEqual(['text', 'par', 'text'])
    expect(got.pieces[1]).toEqual({ t: 'par', next: 2 })
    expect((got.pieces[2] as { s: string }).s.startsWith('Der zweite')).toBe(true)
    expect(proj(got.pieces)).toBe(proj(pieces))
  })
  it('stands before the opening marks set against the first word, and before an element that begins the sentence', () => {
    const m = member({
      paras: [[SECOND, 2]],
      els: [['3', { kind: 'num', ink: [[1, 72, 674, 90, 683, 676]], copy: '1', text: '1' }]],
    })
    const quoted = paraPieces(m, rowPieces(m, [{ t: 'text', s: `${FIRST_DE}(${SECOND_DE})` }]), cuts)
    expect((quoted.pieces[2] as { s: string }).s.startsWith('(Der zweite')).toBe(true)
    const el = paraPieces(
      m,
      rowPieces(m, [
        { t: 'text', s: FIRST_DE },
        { t: 'el', id: '3' },
        { t: 'text', s: ` ${SECOND_DE}` },
      ]),
      cuts,
    )
    expect(el.pieces.map((p) => p.t)).toEqual(['text', 'par', 'ph', 'text'])
  })
  it('gives the row’s pieces back as they are where the part states no point', () => {
    const m = member()
    const pieces = rowPieces(m, plain)
    expect(paraPieces(m, pieces, cuts)).toEqual({ pieces })
    expect(paraPieces(m, pieces, cuts).pieces).toBe(pieces)
  })
})
