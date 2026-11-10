// One person, one translation (docs/PDF-READER.md §19.15): the names the source's author declarations give, the block member
// whose row translates each, and the units that hold one elsewhere: in their own row where each name is a whole stretch of
// theirs, else in a variant whose names are elements. Synthetic units shaped as the corpus's are (2610.22065v1's literal names
// line and its reference format; 2604.14228v3's correspondence line; a footnote; a self-citation).
import { type Piece, type Unit, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { type BlockMember, NAMED_KIND, namesOf, PERSON_KIND, partNames, stretchesOf } from '../src/bundle/names.ts'
import type { PieceClass } from '../src/instrument.ts'

const t = (s: string): Piece => ({ t: 'text', s })
const el = (id: string, src: string, kind = 'math'): Piece => ({ t: 'el', id, kind, src })
const span = (id: string, content: Piece[]): Piece => ({ t: 'span', id, style: 'other', content })
const unit = (kind: string, content: Piece[], o: Partial<Unit> = {}): Unit => ({
  id: unitId(kind, content),
  kind,
  content,
  ...o,
})
const none = () => undefined
const block = (...xs: [number, Unit, string][]): BlockMember[] =>
  xs.map(([ord, u, kind]) => ({ ord, unit: u.id, kind }))

// 2610.22065v1: the block is the paper's own names line (an ink unit, the marks between its names), its \author units are set in
// the ACM reference format, away from the block (`textnames`)
const yao = unit('author', [t('Wenshuai Yao')])
const zhou = unit('author', [t('Wenyong Zhou')])
const line = unit('inknames', [t('Wenshuai Yao'), el('1', '$^{1}$'), t(', Wenyong Zhou'), el('3', '$^{2}$'), t(',')])

describe('the names and their anchors', () => {
  it('takes each name of the author declarations and the first block member whose stretch it is', () => {
    const got = namesOf([yao, zhou, line], none, block([146, line, 'inknames'], [1, yao, 'textnames']))
    expect(got.persons).toEqual([
      [line.id, 'inknames', 0],
      [line.id, 'inknames', 1],
    ])
    expect(got.splits.get(line.id)).toEqual([line.id, ['1', '3'], [], [0, 1]])
  })
  it('resolves a unit that is a name, whole, in its own row, and makes no variant of it', () => {
    const got = namesOf([yao, zhou, line], none, block([146, line, 'inknames'], [1, yao, 'textnames']))
    expect(got.named.get(zhou.id)).toEqual([zhou.id, '', [[0, 1]]])
    expect(got.splits.get(zhou.id)).toEqual([zhou.id, [], [], [0]])
    expect(got.variants.size).toBe(0)
  })
  it('makes a variant of a unit that holds a name in its sentence: the name an element, every other piece as it was', () => {
    const note = unit('footnote', [t('Corresponding author: Wenyong Zhou.')], { sentences: true })
    const got = namesOf([yao, zhou, line, note], none, block([146, line, 'inknames']))
    const v = got.variants.get(note.id)!
    const content = [t('Corresponding author: '), { ...el('n0', 'Wenyong Zhou', PERSON_KIND) }, t('.')]
    expect(v).toEqual({ id: unitId(NAMED_KIND, content), kind: NAMED_KIND, content, sentences: true })
    // (the element's name's length in the unit's projection, its offset in the variant's)
    expect(got.named.get(note.id)).toEqual([note.id, v.id, [['n0', 1, 12, 22]]])
  })
  it('makes a variant of a reference format paragraph that is one unit (the author-lines-3 shape), each name its element', () => {
    const acm = unit('inkorphan', [t('ACM Reference Format: Wenshuai Yao and Wenyong Zhou. 2027. A title.')])
    const got = namesOf([yao, zhou, line, acm], none, block([146, line, 'inknames']))
    const v = got.variants.get(acm.id)!
    expect(v.content).toEqual([
      t('ACM Reference Format: '),
      el('n0', 'Wenshuai Yao', PERSON_KIND),
      t(' and '),
      el('n1', 'Wenyong Zhou', PERSON_KIND),
      t('. 2027. A title.'),
    ])
    expect(got.named.get(acm.id)![2]).toEqual([
      ['n0', 0, 12, 22],
      ['n1', 1, 12, 28],
    ])
  })
  it('finds a name broken over source lines and inside a group, the element’s source the text as the unit writes it', () => {
    const ref = unit('reference', [span('1', [t('Wenyong\n  Zhou')]), t(', A. Other. 2025. Title.')])
    const got = namesOf([zhou, line, ref], none, block([146, line, 'inknames']))
    expect(got.variants.get(ref.id)!.content[0]).toEqual(span('1', [el('n0', 'Wenyong\n  Zhou', PERSON_KIND)]))
    expect(got.named.get(ref.id)![2]).toEqual([['n0', 0, 14, 0]])
  })
  it('takes a group’s edges as none of the anchor’s cuts (2604.14228v3: the block’s name in a group, the figure text whole)', () => {
    const shen = unit('author', [span('0', [t('Zhiqiang Shen')])])
    const corr = unit('inkfigures', [t('Zhiqiang Shen (')])
    const got = namesOf([shen, corr], none, block([4, shen, 'author']))
    expect(got.persons).toEqual([[shen.id, 'author', 0]])
    expect(got.named.get(corr.id)).toEqual([corr.id, '', [[0, 0]]])
  })
  it('reads a tie as a space and what sets nothing as nothing; a thin space, a forced break or a mark cuts', () => {
    const cls = new Map<string, PieceClass>([
      ['1', { cls: 'space' }],
      ['2', { cls: 'zero' }],
      ['3', { cls: 'space', glue: [0.1667, 'em'] }],
      ['4', { cls: 'space', brk: true }],
    ])
    const st = stretchesOf(
      [
        t('Junbo'),
        el('1', '~', 'space'),
        t('Zhang'),
        el('2', '\\vspace{1mm}', 'other'),
        el('3', '\\,', 'other'),
        t('X Y'),
      ],
      (id) => cls.get(id),
    )
    expect(st.texts).toEqual(['Junbo Zhang', 'X Y'])
    expect(st.cuts).toEqual(['3'])
    expect(st.spaces).toEqual(['1'])
    expect(stretchesOf([t('A B'), el('4', '\\\\', 'break'), t('C D')], (id) => cls.get(id)).cuts).toEqual(['4'])
  })
  it('takes no single word for a name (2609.36054v2’s “AI” of \\author{… Institute for Law \\& AI})', () => {
    const a = unit('author', [t('Alan Chan GovAI Institute for Law '), el('1', '\\&', 'macro'), t(' AI')])
    const body = unit('para', [t('The AI governs.')])
    const got = namesOf([a, body], none, block([1, a, 'author']))
    expect(got.persons).toEqual([[a.id, 'author', 0]])
    expect(got.named.size).toBe(0)
  })
  it('takes no occurrence inside a longer word or a longer name, nor the anchor’s own stretch; a kept unit none', () => {
    const jun = unit('author', [t('Jun Yang')])
    const junLi = unit('author', [t('Jun Yang Li')])
    const b = unit('inknames', [t('Jun Yang'), el('1', '$^1$'), t(', Jun Yang Li')])
    const ref = unit('reference', [t('Jun Yang Li and Jun Yangfu. 2020.')])
    const kept = unit('para', [t('Thanks to Jun Yang.')], { kept: true })
    const got = namesOf([jun, junLi, b, ref, kept], none, block([5, b, 'inknames']))
    expect(got.named.get(b.id)).toBeUndefined()
    expect(got.variants.get(ref.id)!.content).toEqual([
      el('n0', 'Jun Yang Li', PERSON_KIND),
      t(' and Jun Yangfu. 2020.'),
    ])
    expect(got.named.has(kept.id)).toBe(false)
  })
  it('names no person a block member does not hold whole (a list with no element between its names: no anchor)', () => {
    const list = unit('author', [t('Ying Wang, Yue Ju and Håkan Hjalmarsson')])
    const note = unit('footnote', [t('Ying Wang is with KTH.')])
    const got = namesOf([list, note], none, block([1, list, 'author']))
    expect(got.persons.map((p) => p[2])).toEqual([0])
    expect(got.named.size).toBe(0)
  })
  it('gives a variant’s elements ids no piece of the unit has', () => {
    const odd = unit('para', [el('n0', '\\x', 'macro'), t(' We thank Wenyong Zhou.')])
    const got = namesOf([zhou, line, odd], none, block([146, line, 'inknames']))
    expect(got.named.get(odd.id)![2]).toEqual([['nn0', 0, 12, 11]])
  })
})

describe('what a part states of them', () => {
  it('states its members’ units’ names, each person once and numbered in its order, with the splits its rows are cut by', () => {
    const note = unit('footnote', [t('Corresponding author: Wenyong Zhou.')])
    const got = namesOf([yao, zhou, line, note], none, block([146, line, 'inknames']))
    const v = got.variants.get(note.id)!.id
    expect(partNames(got, [note.id, zhou.id, 'x'.repeat(64)])).toEqual({
      named: [
        [note.id, v, [['n0', 0, 12, 22]]],
        [zhou.id, '', [[0, 0]]],
      ],
      persons: [[line.id, 'inknames', 1]],
      splits: [got.splits.get(line.id), got.splits.get(zhou.id)],
    })
    expect(partNames(got, [line.id])).toBeNull()
  })
})
