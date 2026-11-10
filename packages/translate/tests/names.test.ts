// A reference's abbreviated name sent as the referenced item's full name (src/names.ts; the owner's ruling of 2026-11-10):
// where the word tied to a reference is a case-insensitive prefix of the name the paper gives the referenced item's type,
// ending in a full stop ("Fig." of "Figure"), the translator is sent the full name; the unit itself, and so the original, never
// changes, and a row's sentences come back in the unit's own projection. Synthetic text only.
import { describe, expect, it } from 'vitest'
import { projectionOf } from '../src/accept.ts'
import type { Piece, Result, UnitIn } from '../src/contract.ts'
import { namedOf } from '../src/names.ts'
import { el, span, t, unit } from './pieces.ts'

const ref = (id: string, name?: string, kind = 'ref'): Piece =>
  name === undefined ? { t: 'el', id, kind } : { t: 'el', id, kind, name }
const tie = (id: string): Piece => ({ t: 'el', id, kind: 'space' })
const sent = (u: UnitIn): string => projectionOf(namedOf(u)?.unit.content ?? u.content)

describe('namedOf: the word tied to a reference, an abbreviation of the item’s own name, sent as that name', () => {
  it('sends the full name for an abbreviation tied by a tie or a space, its own case, white space kept', () => {
    expect(sent(unit('a', [t('Results are shown in Fig.'), tie('1'), ref('2', 'Figure'), t('.')]))).toBe(
      'Results are shown in Figure\uFFFC\uFFFC.',
    )
    expect(sent(unit('b', [t('as in Eq. '), ref('1', 'Equation', 'eqref'), t(' below')]))).toBe(
      'as in Equation \uFFFC below',
    )
    // (the word's case: a lower-case abbreviation the name in lower case, one in capitals the name in capitals; the
    // name's own case otherwise, its first letter the word's: hyperref's `section` for "Sec.")
    expect(sent(unit('c', [t('see fig.'), tie('1'), ref('2', 'Figure')]))).toBe('see figure\uFFFC\uFFFC')
    expect(sent(unit('d', [t('see FIG.'), tie('1'), ref('2', 'Figure')]))).toBe('see FIGURE\uFFFC\uFFFC')
    // (a word after an opening bracket is a word of its own)
    expect(sent(unit('p', [t('as shown (Fig.'), tie('1'), ref('2', 'Figure'), t(').')]))).toBe(
      'as shown (Figure\uFFFC\uFFFC).',
    )
    expect(sent(unit('e', [t('Sec.'), tie('1'), ref('2', 'section'), t(' concludes.')]))).toBe(
      'Section\uFFFC\uFFFC concludes.',
    )
  })

  it('leaves the text as it is where the word is no abbreviation of the name, or the name is unknown', () => {
    const none = (content: Piece[]) => expect(namedOf(unit('x', content))).toBeNull()
    // (a plural, an abbreviation of another word, the name written out, a word with no full stop)
    none([t('in Figs.'), tie('1'), ref('2', 'Figure'), t(' and '), ref('3', 'Figure')])
    none([t('by Thm.'), tie('1'), ref('2', 'Theorem')])
    none([t('see Figure.'), tie('1'), ref('2', 'Figure')])
    none([t('in Figure'), tie('1'), ref('2', 'Figure')])
    none([t('in'), tie('1'), ref('2', 'Figure')])
    // (no name stated: the type or its name unknown)
    none([t('in Fig.'), tie('1'), ref('2')])
    // (something that sets a word between them: the word is not tied to the reference)
    none([t('in Fig.'), el('1', 'cite'), ref('2', 'Figure')])
    none([t('Fig. a and'), tie('1'), ref('2', 'Figure')])
    // (a word that only ends in the letters: "configs." is no abbreviation of "Figure")
    none([t('the configs.'), tie('1'), ref('2', 'Figure')])
    // (the last letters of an abbreviation of several words: "i.e." is no word "e." of its own, 2608.16117v1's
    // "i.e. \cref{…}" to an equation)
    none([t('any value, i.e. '), ref('2', 'Equation')])
    none([t('the work-eq.'), tie('1'), ref('2', 'Equation')])
  })

  it('reads the word inside a group as it reads it at the unit’s level, and every reference of the unit', () => {
    const u = unit('g', [
      span('1', 'bold', [t('Fig.'), tie('2'), ref('3', 'Figure')]),
      t(' and Tab.'),
      tie('4'),
      ref('5', 'Table'),
      t(' agree.'),
    ])
    expect(sent(u)).toBe('Figure\uFFFC\uFFFC and Table\uFFFC\uFFFC agree.')
  })

  it('sends the name only where the language TeX declares for it is the one the translator is asked to translate from', () => {
    const named = (lang?: string): Piece =>
      lang === undefined
        ? { t: 'el', id: '2', kind: 'ref', name: 'Figura' }
        : { t: 'el', id: '2', kind: 'ref', name: 'Figura', nameLang: lang }
    // (an English text whose babel language is Brazilian Portuguese: its name "Figura" is no word of the English text)
    expect(namedOf(unit('b', [t('as shown in Fig.'), tie('1'), named('pt-BR')]))).toBeNull()
    // (a name in English, a region of it or none at all: English is the source; no language declared, the rule as before)
    expect(
      sent(unit('e', [t('see Fig.'), tie('1'), { t: 'el', id: '2', kind: 'ref', name: 'Figure', nameLang: 'en-US' }])),
    ).toBe('see Figure\uFFFC\uFFFC')
    expect(sent(unit('n', [t('see Fig.'), tie('1'), named()]))).toBe('see Figura\uFFFC\uFFFC')
    // (a tag compared by its language subtag, case aside: "EN-gb" is English, "eng" is no English tag of BCP 47's)
    expect(
      namedOf(
        unit('g', [t('see Fig.'), tie('1'), { t: 'el', id: '2', kind: 'ref', name: 'Figure', nameLang: 'EN-gb' }]),
      ),
    ).not.toBeNull()
    expect(
      namedOf(unit('x', [t('see Fig.'), tie('1'), { t: 'el', id: '2', kind: 'ref', name: 'Figure', nameLang: 'eng' }])),
    ).toBeNull()
    // (a language declared and undetermined, BCP 47's `und`: no agreement shown, the text as it is)
    expect(namedOf(unit('u', [t('see Fig.'), tie('1'), named('und')]))).toBeNull()
  })

  it('never changes the unit it is given (the original)', () => {
    const u = unit('o', [t('in Fig.'), tie('1'), ref('2', 'Figure')])
    const before = JSON.stringify(u)
    namedOf(u)
    expect(JSON.stringify(u)).toBe(before)
  })

  it('gives a row’s sentences back in the unit’s own projection, a start inside the word at the word’s start', () => {
    // "In Fig.¹² we see. Then Sec.³⁴ ends." -> "In Figure¹² we see. Then Section³⁴ ends."
    const u = unit(
      's',
      [t('In Fig.'), tie('1'), ref('2', 'Figure'), t(' we see. Then Sec.'), tie('3'), ref('4', 'Section'), t(' ends.')],
      true,
    )
    const named = namedOf(u)
    expect(named).not.toBeNull()
    const own = projectionOf(u.content)
    const theirs = projectionOf(named?.unit.content ?? [])
    expect(theirs.indexOf('Then')).toBe(own.indexOf('Then') + 2)
    const row: Result = {
      id: 's',
      ok: true,
      by: 'x',
      content: [],
      sentences: { src: [theirs.indexOf('Then'), theirs.indexOf('ends')], tr: [4, 9] },
    }
    expect(named?.back(row)).toEqual({
      ...row,
      sentences: { src: [own.indexOf('Then'), own.indexOf('ends')], tr: [4, 9] },
    })
    // (a start that fell inside the name, which no sentence's start does, is the word's start; two such the same, no row's)
    const inside: Result = { ...row, sentences: { src: [theirs.indexOf('Section') + 3], tr: [4] } } as Result
    expect(named?.back(inside)).toMatchObject({ sentences: { src: [own.indexOf('Sec.')], tr: [4] } })
    const twice: Result = {
      ...row,
      sentences: { src: [theirs.indexOf('Section') + 1, theirs.indexOf('Section') + 3], tr: [4, 6] },
    } as Result
    expect(named?.back(twice)).not.toHaveProperty('sentences')
    // (a failed row, or one with no sentences, as it is)
    const failed: Result = { id: 's', ok: false, why: { kind: 'refused' } }
    expect(named?.back(failed)).toBe(failed)
  })
})
