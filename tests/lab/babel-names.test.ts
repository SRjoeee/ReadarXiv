// @vitest-environment node
// The release check's `babel-names` (lab/marks/babel-names.mjs): the babel names the layout marks wrap (marks/names.ts NAME_KEYS
// and NAME_ENGLISH, marks.ts NAME_MACROS) held to babel's English [captions] and to the rule babel.sty names a key's macro by.
// Here on files written for the test: the lists as they stand pass, and each seeded difference fails, named.
import { describe, expect, it } from 'vitest'
import { captionsOf, differencesOf, MACRO_RULE } from '../../lab/marks/babel-names.mjs'
import { NAME_MACROS } from '../../packages/engine/src/marks/marks.ts'
import { NAME_ENGLISH, NAME_KEYS } from '../../packages/engine/src/marks/names.ts'

const lists = { keys: NAME_KEYS, english: NAME_ENGLISH, macros: NAME_MACROS }
/** an ini of [captions] holding each name's English value, and `chapter` and `part`, which the lists leave out */
const iniOf = (values: Record<string, string>) =>
  ['; a locale file', '[identification]', 'charset = utf8', '[captions]', ...Object.entries(values).map(([k, v]) => `${k} = ${v}`), '[date.gregorian]', 'date.long = [d] [MMMM] [y]'].join('\n')
const english = { ...NAME_ENGLISH, chapter: 'Chapter', part: 'Part' }
const sty = `\\def\\bbl@ini@captions@aux#1#2{%\n  ${MACRO_RULE}{\\the\\toks@}}%\n`

describe("babel's names, against babel's own files", () => {
  it("reads a locale's [captions] alone, its keys and values trimmed, comments and other sections none of it", () => {
    expect(captionsOf(iniOf({ ref: 'References', abstract: 'Abstract' }))).toEqual(
      new Map([
        ['ref', 'References'],
        ['abstract', 'Abstract'],
      ]),
    )
  })
  it('passes the lists as they stand: every key a key of [captions], its value the English one, its macro the key and `name`', () => {
    expect(differencesOf({ ini: iniOf(english), sty }, lists)).toEqual([])
  })
  it('fails a key babel lacks, a value babel gives otherwise, and a babel.sty that names no macro so, each named', () => {
    const { glossary: _, ...noGlossary } = english
    expect(differencesOf({ ini: iniOf(noGlossary), sty }, lists)).toEqual([
      "glossary: NAME_KEYS holds it, babel-en.ini's [captions] does not",
    ])
    expect(differencesOf({ ini: iniOf({ ...english, ref: 'Refs' }), sty }, lists)).toEqual([
      'ref: NAME_ENGLISH "References", babel-en.ini "Refs"',
    ])
    expect(differencesOf({ ini: iniOf(english), sty: '\\def\\bbl@ini@captions@aux#1#2{}' }, lists)).toEqual([
      `babel.sty: no ${MACRO_RULE}, the line that names a key's macro`,
    ])
    expect(differencesOf({ ini: iniOf(english), sty }, { ...lists, macros: { ...NAME_MACROS, ref: 'referencesname' } })).toEqual([
      'ref: NAME_MACROS "referencesname", babel.sty\'s \\refname',
    ])
    expect(differencesOf({ ini: 'no section', sty }, lists)[0]).toBe('babel-en.ini: no [captions] section')
  })
})
