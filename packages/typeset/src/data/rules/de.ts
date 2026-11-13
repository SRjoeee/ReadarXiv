// The rule set's de: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const DE: LanguageRules = {
  labels: {
    figure: 'Abbildung',
    table: 'Tabelle',
    abstract: 'Zusammenfassung',
    ref: 'Literatur',
    bib: 'Literaturverzeichnis',
    contents: 'Inhaltsverzeichnis',
    listfigure: 'Abbildungsverzeichnis',
    listtable: 'Tabellenverzeichnis',
    appendix: 'Anhang',
    index: 'Index',
    proof: 'Beweis',
    preface: 'Vorwort',
    glossary: 'Glossar',
  },
  latinPatterns: 'de',
}
