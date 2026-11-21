// The committed language table is the product's (UI.md §6, "Language names: one policy"): scripts/languages.ts wrote it
// from the CLDR its header names, and regenerating it on another Node is a deliberate step, reviewed as a diff — never
// a CI step (#614). What any regeneration must keep is held here: the policy's rules, name by name.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EN_NAMES, LANG_CODES, OWN_NAMES, ZH_NAMES } from '@/config/language-table'

/** the entries offered in another script than their language's usual one name it (rule 4) */
const SCRIPT_NOTES = ['bos', 'srp', 'uzn', 'azj', 'zlm']
/** the languages CLDR does not name in Simplified Chinese read their English name there (rule 1) */
const ZH_READS_ENGLISH = ['qug', 'hms', 'hnj', 'bjn', 'wls', 'hif']
const QUALIFIER = /\((?:macro|individual|\d{4})|\bStandard\b|\bModern\b|\d{4}-\)/i

describe('the language table under the naming policy (UI.md §6)', () => {
  it('records the CLDR, ICU and Node it was generated with', () => {
    expect(readFileSync('src/config/language-table.ts', 'utf8')).toMatch(/Unicode CLDR \d+(?:\.\d+)? \(ICU\s*(?:\/\/\s*)?[\d.]+, Node v\d+\.\d+\.\d+/)
  })

  it('every language has a name in every column, and none carries a qualifier', () => {
    for (const [column, names] of [['en', EN_NAMES], ['zh', ZH_NAMES], ['own', OWN_NAMES]] as const) {
      for (const code of LANG_CODES) {
        expect([column, code, names[code].trim().length > 0]).toEqual([column, code, true])
        expect([column, code, QUALIFIER.test(names[code])]).toEqual([column, code, false])
      }
    }
  })

  it('a parenthesis is a script note, on the entries offered in another script, in English and Chinese alike', () => {
    for (const code of LANG_CODES) {
      const noted = SCRIPT_NOTES.includes(code)
      expect([code, /\)$/.test(EN_NAMES[code])]).toEqual([code, noted])
      expect([code, /）$/.test(ZH_NAMES[code])]).toEqual([code, noted])
    }
  })

  it('the Chinese column ends in 语, Chinese itself in 中文, a script note after; the six CLDR does not name read English', () => {
    for (const code of LANG_CODES) {
      if (ZH_READS_ENGLISH.includes(code)) expect([code, ZH_NAMES[code]]).toEqual([code, EN_NAMES[code]])
      else expect([code, /(?:语|中文)(?:（[^）]+）)?$/.test(ZH_NAMES[code])]).toEqual([code, true])
    }
  })

  it('an own name is never the English one for a language written in another script than Latin', () => {
    for (const code of LANG_CODES) {
      if (/\p{Script=Latin}/u.test(OWN_NAMES[code]) && !/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(OWN_NAMES[code])) {
        const script = new Intl.Locale(code === 'cmn-Hant' ? 'zh-Hant' : code).maximize().script
        // a language whose usual script is not Latin but whose own name the sources give in Latin letters: Hmong Njua (its speakers' RPA)
        if (script !== 'Latn' && code !== 'hnj') expect([code, OWN_NAMES[code]]).toEqual([code, 'a name in its own script'])
      }
    }
  })
})
