// The rule set's it: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import type { LanguageRules } from './types.ts'

export const IT: LanguageRules = {
  labels: {
    figure: 'Figura',
    table: 'Tabella',
    abstract: 'Sommario',
    ref: 'Riferimenti bibliografici',
    bib: 'Bibliografia',
    contents: 'Indice',
    listfigure: 'Elenco delle figure',
    listtable: 'Elenco delle tabelle',
    appendix: 'Appendice',
    index: 'Indice analitico',
    proof: 'Dimostrazione',
    preface: 'Prefazione',
    glossary: 'Glossario',
  },
  latinPatterns: 'it',
}
