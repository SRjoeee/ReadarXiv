// The rule set's zh-TW: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const ZH_TW: LanguageRules = {
  labels: {
    figure: '\u5716',
    table: '\u8868',
    abstract: '\u6458 \u8981',
    ref: '\u53c3 \u8003 \u8cc7 \u6599',
    bib: '\u6587 \u737b',
    contents: '\u76ee \u9304',
    listfigure: '\u5716 \u76ee \u9304',
    listtable: '\u8868 \u76ee \u9304',
    appendix: '\u9644 \u9304',
    index: '\u7d22 \u5f15',
    proof: '',
    preface: '',
    glossary: '',
  },
}
