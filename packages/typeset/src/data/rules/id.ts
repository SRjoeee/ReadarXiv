// The rule set's id: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const ID: LanguageRules = {
  labels: {
    figure: 'Gambar',
    table: 'Tabel',
    abstract: 'Ringkasan',
    ref: 'Pustaka',
    bib: 'Bibliografi',
    contents: 'Daftar Isi',
    listfigure: 'Daftar Gambar',
    listtable: 'Daftar Tabel',
    appendix: 'Lampiran',
    index: 'Indeks',
    proof: 'Bukti',
    preface: 'Pendahuluan',
    glossary: 'Daftar Istilah',
  },
  latinPatterns: 'id',
}
