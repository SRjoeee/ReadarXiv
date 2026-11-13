// The rule set's es: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const ES: LanguageRules = {
  labels: {
    figure: 'Figura',
    table: 'Cuadro',
    abstract: 'Resumen',
    ref: 'Referencias',
    bib: 'Bibliograf\u00eda',
    contents: '\u00cdndice',
    listfigure: '\u00cdndice de figuras',
    listtable: '\u00cdndice de cuadros',
    appendix: 'Ap\u00e9ndice',
    index: '\u00cdndice alfab\u00e9tico',
    proof: 'Demostraci\u00f3n',
    preface: 'Prefacio',
    glossary: 'Glosario',
  },
  latinPatterns: 'es',
}
