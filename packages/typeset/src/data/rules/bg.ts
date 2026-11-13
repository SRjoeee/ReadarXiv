// The rule set's bg: its own fields over its script's; its labels babel's captions for it (what each field mirrors:
// types.ts). The source, edited here; taken at engine 065c1d973 from today's rules/layout-rules.json (schema 10, version
// 10).

import type { LanguageRules } from './types.ts'

export const BG: LanguageRules = {
  labels: {
    figure: '\u0424\u0438\u0433\u0443\u0440\u0430',
    table: '\u0422\u0430\u0431\u043b\u0438\u0446\u0430',
    abstract: '\u0410\u0431\u0441\u0442\u0440\u0430\u043a\u0442',
    ref: '\u041b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430',
    bib: '\u0411\u0438\u0431\u043b\u0438\u043e\u0433\u0440\u0430\u0444\u0438\u044f',
    contents: '\u0421\u044a\u0434\u044a\u0440\u0436\u0430\u043d\u0438\u0435',
    listfigure: '\u0421\u043f\u0438\u0441\u044a\u043a \u043d\u0430 \u0444\u0438\u0433\u0443\u0440\u0438\u0442\u0435',
    listtable:
      '\u0421\u043f\u0438\u0441\u044a\u043a \u043d\u0430 \u0442\u0430\u0431\u043b\u0438\u0446\u0438\u0442\u0435',
    appendix: '\u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435',
    index: '\u0410\u0437\u0431\u0443\u0447\u0435\u043d \u0443\u043a\u0430\u0437\u0430\u0442\u0435\u043b',
    proof: '\u0414\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u0441\u0442\u0432\u043e',
    preface: '\u041f\u0440\u0435\u0434\u0433\u043e\u0432\u043e\u0440',
    glossary: '\u041f\u0440\u0438\u0442\u0443\u0440\u043a\u0430',
  },
  cyrillicPatterns: 'bg',
}
