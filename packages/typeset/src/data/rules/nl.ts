// The rule set's nl: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

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
