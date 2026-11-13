// The rule set's ms: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

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
