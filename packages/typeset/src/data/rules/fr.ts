// The rule set's fr: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import type { LanguageRules } from './types.ts'

export const FR: LanguageRules = {
  labels: {
    figure: 'Figure',
    table: 'Table',
    abstract: 'R\u00e9sum\u00e9',
    ref: 'R\u00e9f\u00e9rences',
    bib: 'Bibliographie',
    contents: 'Table des mati\u00e8res',
    listfigure: 'Table des figures',
    listtable: 'Liste des tableaux',
    appendix: 'Annexe',
    index: 'Index',
    proof: 'D\u00e9monstration',
    preface: 'Pr\u00e9face',
    glossary: 'Glossaire',
  },
  latinPatterns: 'fr',
}
