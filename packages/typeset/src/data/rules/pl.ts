// The rule set's pl: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here.

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
