// The rule set's cs: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import type { LanguageRules } from './types.ts'

export const CS: LanguageRules = {
  labels: {
    figure: 'Obr\u00e1zek',
    table: 'Tabulka',
    abstract: 'Abstrakt',
    ref: 'Reference',
    bib: 'Literatura',
    contents: 'Obsah',
    listfigure: 'Seznam obr\u00e1zk\u016f',
    listtable: 'Seznam tabulek',
    appendix: 'P\u0159\u00edloha',
    index: 'Rejst\u0159\u00edk',
    proof: 'D\u016fkaz',
    preface: 'P\u0159edmluva',
    glossary: 'Slovn\u00edk',
  },
  latinPatterns: 'cs',
}
