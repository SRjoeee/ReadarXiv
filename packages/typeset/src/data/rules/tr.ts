// The rule set's tr: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import type { LanguageRules } from './types.ts'

export const TR: LanguageRules = {
  labels: {
    figure: '\u015eekil',
    table: 'Tablo',
    abstract: '\u00d6zet',
    ref: 'Kaynaklar',
    bib: 'Kaynak\u00e7a',
    contents: '\u0130\u00e7indekiler',
    listfigure: '\u015eekil Listesi',
    listtable: 'Tablo Listesi',
    appendix: 'Ek',
    index: 'Dizin',
    proof: '\u0130spat',
    preface: '\u00d6ns\u00f6z',
    glossary: 'S\u00f6zl\u00fck\u00e7e',
  },
  latinPatterns: 'tr',
}
