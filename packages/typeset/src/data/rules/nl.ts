// The rule set's nl: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const NL: LanguageRules = {
  labels: {
    figure: 'Figuur',
    table: 'Tabel',
    abstract: 'Samenvatting',
    ref: 'Referenties',
    bib: 'Bibliografie',
    contents: 'Inhoudsopgave',
    listfigure: 'Lijst van figuren',
    listtable: 'Lijst van tabellen',
    appendix: 'Bijlage',
    index: 'Index',
    proof: 'Bewijs',
    preface: 'Voorwoord',
    glossary: 'Verklarende Woordenlijst',
  },
  latinPatterns: 'nl',
}
