// @vitest-environment node
// The release check's `csquotes-styles` (lab/source/csquotes-styles.mjs): the source reader's table of csquotes' English style
// (source/latex-front.ts CSQUOTES_ENGLISH, CSQUOTES_NAMES, CSQUOTES_DEFAULT) held to csquotes.def, its marks read through
// tuenc.def. Here on files written for the test, in csquotes.def's and tuenc.def's forms: the table as it stands passes, and
// each seeded difference fails, named.
import { describe, expect, it } from 'vitest'
import { differencesOf, englishOf, symbolsOf } from '../../lab/source/csquotes-styles.mjs'
import { CSQUOTES_DEFAULT, CSQUOTES_ENGLISH, CSQUOTES_NAMES } from '../../packages/engine/src/source/latex-front.ts'

const table = { english: CSQUOTES_ENGLISH, names: CSQUOTES_NAMES, fallback: CSQUOTES_DEFAULT }
const tuenc = ['\\DeclareUnicodeSymbol{\\textquoteleft}       {"2018}', '\\DeclareUnicodeSymbol{\\textquoteright}      {"2019}', '\\DeclareUnicodeSymbol{\\textquotedblleft}    {"201C}', '\\DeclareUnicodeSymbol{\\textquotedblright}   {"201D}'].join('\n')
const style = (variant: string, a: string, b: string, c: string, d: string) =>
  `\\DeclareQuoteStyle[${variant}]{english}% a note\n  {\\${a}}\n  {\\${b}}\n  [0.05em]\n  {\\${c}}\n  {\\${d}}`
const AMERICAN = style('american', 'textquotedblleft', 'textquotedblright', 'textquoteleft', 'textquoteright')
const BRITISH = style('british', 'textquoteleft', 'textquoteright', 'textquotedblleft', 'textquotedblright')
const ALIASES = [
  '\\DeclareQuoteAlias[american]{english}{default}',
  ...['american', 'canadian', 'english'].map((n) => `\\DeclareQuoteAlias[american]{english}{${n}}`),
  ...['british', 'australian', 'newzealand'].map((n) => `\\DeclareQuoteAlias[british]{english}{${n}}`),
  '\\DeclareQuoteAlias{british}{latin/britishquotes}',
  '\\DeclareQuoteAlias{american}{USenglish}',
  '\\DeclareQuoteAlias{american}{usenglish}',
  '\\DeclareQuoteAlias{brazilian}{brazil}',
  '\\DeclareQuoteAlias{british}{UKenglish}',
  '\\DeclareQuoteAlias{british}{ukenglish}',
]
const def = (styles = [AMERICAN, BRITISH], aliases = ALIASES) => [...styles, '\\DeclareQuoteStyle{dutch}{a}{b}', ...aliases].join('\n')

describe("csquotes' English style, against csquotes.def", () => {
  it("reads tuenc.def's symbols, the English style's variants and every name of a variant, an alias's alias followed", () => {
    expect(symbolsOf(tuenc).get('\\textquotedblleft')).toBe('\u201c')
    const e = englishOf(def())
    expect(e.styles.get('british')).toEqual(['\\textquoteleft', '\\textquoteright', '\\textquotedblleft', '\\textquotedblright'])
    expect([e.names.get('UKenglish'), e.names.get('usenglish'), e.names.get('default'), e.names.has('brazil')]).toEqual(['british', 'american', 'american', false])
  })
  it('passes the table as it stands', () => {
    expect(differencesOf({ def: def(), tuenc }, table)).toEqual([])
  })
  it('fails a name the table gives another variant, one it holds that csquotes does not, one csquotes has it lack, and marks otherwise', () => {
    expect(differencesOf({ def: def(), tuenc }, { ...table, names: { ...CSQUOTES_NAMES, australian: 'american' } })).toEqual([
      "australian: the table's american, csquotes.def's british",
    ])
    expect(differencesOf({ def: def(), tuenc }, { ...table, names: { ...CSQUOTES_NAMES, scottish: 'british' } })).toEqual([
      'scottish: the table holds it, csquotes.def gives it no variant of english',
    ])
    expect(differencesOf({ def: def([AMERICAN, BRITISH], ALIASES.filter((a) => !a.endsWith('{ukenglish}'))), tuenc }, table)).toEqual([
      'ukenglish: the table holds it, csquotes.def gives it no variant of english',
    ])
    expect(differencesOf({ def: def([AMERICAN, BRITISH], [...ALIASES, '\\DeclareQuoteAlias{british}{irish}']), tuenc }, table)).toEqual([
      'irish: csquotes.def gives it british, the table does not hold it',
    ])
    expect(differencesOf({ def: def([AMERICAN, style('british', 'textquoteleft', 'textquoteright', 'textquoteleft', 'textquoteright')]), tuenc }, table)[0]).toMatch(
      /^british: the table's marks ‘ ’ “ ”, csquotes\.def's/,
    )
    expect(differencesOf({ def: def(), tuenc }, { ...table, fallback: 'british' })).toEqual(["default: the table's british, csquotes.def's american"])
  })
})
