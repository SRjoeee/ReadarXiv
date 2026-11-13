// The rule set's sv: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const SV: LanguageRules = {
  labels: {
    figure: 'Figur',
    table: 'Tabell',
    abstract: 'Sammanfattning',
    ref: 'Referenser',
    bib: 'Litteraturf\u00f6rteckning',
    contents: 'Inneh\u00e5ll',
    listfigure: 'Figurer',
    listtable: 'Tabeller',
    appendix: 'Bilaga',
    index: 'Sakregister',
    proof: 'Bevis',
    preface: 'F\u00f6rord',
    glossary: 'Ordlista',
  },
  noStart:
    '\u3001\u3002\uff0c\uff0e,.\uff01\uff1f!?\uff09)]\u300d\u300f\u3011\u3015\u3009\u300b\u3019\u3017\uff1a:\uff1b;\u30fb\u30fc\u301c\u2026\u3005\u309d\u309e\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308e\u30a1\u30a3\u30a5\u30a7\u30a9\u30c3\u30e3\u30e5\u30e7\u30ee\u30f5\u30f6%\uff05',
  latinPatterns: 'sv',
}
