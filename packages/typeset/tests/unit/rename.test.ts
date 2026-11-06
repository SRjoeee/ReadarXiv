// U.rename on synthetic references, the branches the tap's sample does not show (a citation's note, a conjunction in the
// target's or the paper's own word, babel's name of a counter type and its letter-spacing dropped, a type's singular read
// in a target that does not inflect, a part with no word), and nameOfRow. Each expectation is what today's renameRefs and
// nameOfRow (engine 065c1d973) answered on the same case over today's tex-names.json; the table here holds the entries of it
// the cases read, as they stand there.
import { describe, expect, it } from 'vitest'
import { nameOfRow, refNamesOf, rename, type TexNamesData } from '../../src/unit/rename.ts'

const NAMES: TexNamesData = {
  types: {
    Equation: 'equation',
    Equations: 'equation',
    Figure: 'figure',
    Figures: 'figure',
    Section: 'section',
    Sections: 'section',
    Appendix: 'appendix',
    Theorem: 'theorem',
    Theorems: 'theorem',
    Lemma: 'lemma',
  },
  conjunctions: [' and ', ' to ', ', ', ', and '],
  singular: { equation: 'Equation', figure: 'Figure', appendix: 'Appendix', theorem: 'Theorem', section: 'Section' },
  targets: {
    zh: {
      heads: { Lemma: '\u5f15\u7406', Theorems: '\u5b9a\u7406', Theorem: '\u5b9a\u7406' },
      refs: { Figure: '\u56fe', Figures: '\u56fe', Appendix: '\u9644\u5f55' },
      conj: {},
    },
    'zh-TW': { heads: {}, refs: {}, conj: {} },
    ja: { heads: {}, refs: {}, conj: {} },
    de: {
      heads: { Lemma: 'Lemma', Theorems: 'Sätze', Theorem: 'Satz' },
      refs: { Figure: 'Abbildung', Figures: 'Abbildungen', Section: 'Abschnitt', Sections: 'Abschnitte' },
      conj: { ' to ': ' bis ', ' and ': ' und ', ', ': ', ', ', and ': ' und ' },
    },
    pl: { heads: { Lemma: 'Lemat', Theorems: 'Twierdzenia', Theorem: 'Twierdzenie' }, refs: {}, conj: {} },
  },
}
type R = { mode: string; src: string; text: string; sup?: boolean }
const of = (to: string, rs: R[], labels: Record<string, string> | null = null, own: [string, string][] = []) => [
  ...rename(
    rs.map((r, k) => [k, r] as const),
    refNamesOf(NAMES, to),
    labels,
    new Map(own),
  ),
]
const ref = (text: string, src = '\\cref{a}'): R => ({ mode: 'orig-text', src, text })

describe('U.rename', () => {
  it('renames a reference and its conjunctions in the target’s words, the numbers and punctuation kept', () => {
    expect(of('de', [ref('Figure 3', '\\autoref{f}'), ref('Figures 3 and 4')], { figure: 'Abbildung' })).toEqual([
      [0, [[0, 6, 'Abbildung']]],
      [
        1,
        [
          [0, 7, 'Abbildungen'],
          [9, 14, ' und '],
        ],
      ],
    ])
  })

  it('reads a conjunction the target’s packages do not name as the paper’s own name unit, its spaces the English’s', () => {
    expect(of('zh', [ref('Theorems 1 and 2')])).toEqual([])
    expect(
      of('zh', [ref('Theorems 1 and 2'), ref('Sections 5.2.1, 5.2.3 and 5.2.4')], null, [['and', '\u548c']]),
    ).toEqual([
      [
        0,
        [
          [0, 8, '\u5b9a\u7406'],
          [10, 15, ' \u548c '],
        ],
      ],
    ])
  })

  it('names a counter type by babel’s word where no package does: the singular where the target inflects, every form where not', () => {
    expect(of('pl', [ref('Figure 3'), ref('Figures 3 and 4')], { figure: 'Rysunek', table: 'Tabela' })).toEqual([
      [0, [[0, 6, 'Rysunek']]],
    ])
    // (babel's zh-TW appendix name is letter-spaced; a reference's word is not)
    expect(of('zh-TW', [ref('Appendix A')], { appendix: '\u9644 \u9304' })).toEqual([[0, [[0, 8, '\u9644\u9304']]]])
    expect(of('zh', [ref('Figures 3 and 4'), ref('Figure 3b')], { figure: '\u56fe' }, [['and', '\u548c']])).toEqual([
      [
        0,
        [
          [0, 7, '\u56fe'],
          [9, 14, ' \u548c '],
        ],
      ],
      [1, [[0, 6, '\u56fe']]],
    ])
  })

  it('reads a form with no word in a target that does not inflect as its singular’s name unit', () => {
    expect(
      of('ja', [ref('Equations 1, 2 and 3', '\\cref{a,b,c}')], null, [
        ['Equation', '\u5f0f'],
        ['and', '\u3068'],
      ]),
    ).toEqual([
      [
        0,
        [
          [0, 9, '\u5f0f'],
          [14, 19, ' \u3068 '],
        ],
      ],
    ])
  })

  it('renames a citation’s note where it is a name and its numbers, once and whole in the citation', () => {
    expect(of('zh', [ref('[see Smith, 2020, Lemma 1]', '\\citep[see][Lemma~1]{x}')])).toEqual([
      [0, [[18, 23, '\u5f15\u7406']]],
    ])
    // (a note found twice, a note of no letter, a note that is no name: the citation as it is)
    expect(of('zh', [ref('[Lemma 1, Lemma 1]', '\\cite[Lemma 1]{x}'), ref('[4, p. 3]', '\\cite[p.~3]{x}')])).toEqual([])
  })

  it('leaves a reference with a part that is no number, name or conjunction, a raised one, one not drawn as text', () => {
    expect(of('zh', [ref('Foo 3')])).toEqual([])
    expect(
      of('zh', [
        { ...ref('Theorem 3'), sup: true },
        { ...ref('Theorem 3'), mode: 'crop' },
      ]),
    ).toEqual([])
    expect(of('xx', [ref('Theorem 3')])).toEqual([])
    // (a reference of numbers alone renames nothing)
    expect(of('zh', [ref('3', '\\labelcref{a}')])).toEqual([])
  })

  it('reads a name unit’s row as its English and the target’s word', () => {
    expect(
      nameOfRow({
        kind: 'name',
        src: ' Main\n Claim ',
        state: 'whole',
        pieces: [
          { t: 'text', s: ' \u4e3b\u306a ' },
          { t: 'ph', s: 'x' },
          { t: 'text', s: '\u4e3b\u5f35\u3002' },
        ],
      }),
    ).toEqual(['Main Claim', '\u4e3b\u306a \u4e3b\u5f35'])
    expect(nameOfRow({ kind: 'name', src: 'Lemma', state: 'partial', pieces: [{ t: 'text', s: 'Lemme' }] })).toEqual([
      'Lemma',
      'Lemme',
    ])
    expect(nameOfRow({ kind: 'name', src: 'Lemma', state: 'none', pieces: [{ t: 'text', s: 'Lemme' }] })).toBeNull()
    expect(nameOfRow({ kind: 'para', src: 'Lemma', state: 'whole', pieces: [{ t: 'text', s: 'Lemme' }] })).toBeNull()
    expect(nameOfRow({ kind: 'name', src: 'Lemma', state: 'whole', pieces: [{ t: 'text', s: ' \uff0e' }] })).toBeNull()
  })
})
