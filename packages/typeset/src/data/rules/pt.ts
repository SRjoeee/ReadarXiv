// The rule set's pt: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import type { LanguageRules } from './types.ts'

export const PT: LanguageRules = {
  labels: {
    figure: 'Figura',
    table: 'Tabela',
    abstract: 'Resumo',
    ref: 'Refer\u00eancias',
    bib: 'Bibliografia',
    contents: '\u00cdndice',
    listfigure: 'Lista de Figuras',
    listtable: 'Lista de Tabelas',
    appendix: 'Ap\u00eandice',
    index: '\u00cdndice Remissivo',
    proof: 'Demonstra\u00e7\u00e3o',
    preface: 'Pref\u00e1cio',
    glossary: 'Gloss\u00e1rio',
  },
  latinPatterns: 'pt',
}
