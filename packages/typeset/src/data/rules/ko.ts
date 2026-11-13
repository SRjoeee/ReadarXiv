// The rule set's ko: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const KO: LanguageRules = {
  labels: {
    figure: '\uadf8\ub9bc',
    table: '\ud45c',
    abstract: '\uc694 \uc57d',
    ref: '\ucc38\uace0 \ubb38\ud5cc',
    bib: '\ucc38\uace0 \ubb38\ud5cc',
    contents: '\ucc28 \ub840',
    listfigure: '\uadf8\ub9bc \ucc28\ub840',
    listtable: '\ud45c \ucc28\ub840',
    appendix: '\ubd80\ub85d',
    index: '\ucc3e\uc544\ubcf4\uae30',
    proof: '\uc99d\uba85',
    preface: '\uc11c\ubb38',
    glossary: '\uc6a9\uc5b4\uc9d1',
  },
}
