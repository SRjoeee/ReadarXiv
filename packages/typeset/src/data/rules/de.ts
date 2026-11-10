// The rule set's de: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

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
