// The rule set's ms: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import type { LanguageRules } from './types.ts'

export const MS: LanguageRules = {
  labels: {
    figure: 'Gambar',
    table: 'Jadual',
    abstract: 'Abstrak',
    ref: 'Rujukan',
    bib: 'Bibliografi',
    contents: 'Kandungan',
    listfigure: 'Senarai Gambar',
    listtable: 'Senarai Jadual',
    appendix: 'Lampiran',
    index: 'Indeks',
    proof: 'Bukti',
    preface: 'Prakata',
    glossary: 'Istilah',
  },
  latinPatterns: 'id',
}
