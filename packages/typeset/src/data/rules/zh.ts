// The rule set's zh: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const ZH: LanguageRules = {
  labels: {
    figure: '\u56fe',
    table: '\u8868',
    abstract: '\u6458\u8981',
    ref: '\u53c2\u8003\u6587\u732e',
    bib: '\u53c2\u8003\u6587\u732e',
    contents: '\u76ee\u5f55',
    listfigure: '\u63d2\u56fe',
    listtable: '\u8868\u683c',
    appendix: '\u9644\u5f55',
    index: '\u7d22\u5f15',
    proof: '\u8bc1\u660e',
    preface: '',
    glossary: '',
  },
}
