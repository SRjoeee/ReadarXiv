// The rule set's pl: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import type { LanguageRules } from './types.ts'

export const PL: LanguageRules = {
  labels: {
    figure: 'Rysunek',
    table: 'Tablica',
    abstract: 'Streszczenie',
    ref: 'Literatura',
    bib: 'Bibliografia',
    contents: 'Spis tre\u015bci',
    listfigure: 'Spis rysunk\u00f3w',
    listtable: 'Spis tablic',
    appendix: 'Dodatek',
    index: 'Indeks',
    proof: 'Dow\u00f3d',
    preface: 'Przedmowa',
    glossary: 'S\u0142owniczek',
  },
  latinPatterns: 'pl',
}
