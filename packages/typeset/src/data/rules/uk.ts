// The rule set's uk: its own fields over its script's.
// Today's rules/layout-rules.json (schema 10, version 10, engine 065c1d973), written by lab/typeset/rules-data.mjs; not
// edited by hand.

import type { LanguageRules } from './types.ts'

export const UK: LanguageRules = {
  labels: {
    figure: '\u0420\u0438\u0441.',
    table: '\u0422\u0430\u0431\u043b.',
    abstract: '\u0410\u043d\u043e\u0442\u0430\u0446\u0456\u044f',
    ref: '\u041b\u0456\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430',
    bib: '\u0411\u0456\u0431\u043b\u0456\u043e\u0491\u0440\u0430\u0444\u0456\u044f',
    contents: '\u0417\u043c\u0456\u0441\u0442',
    listfigure:
      '\u041f\u0435\u0440\u0435\u043b\u0456\u043a \u0456\u043b\u044e\u0441\u0442\u0440\u0430\u0446\u0456\u0439',
    listtable: '\u041f\u0435\u0440\u0435\u043b\u0456\u043a \u0442\u0430\u0431\u043b\u0438\u0446\u044c',
    appendix: '\u0414\u043e\u0434\u0430\u0442\u043e\u043a',
    index: '\u041f\u043e\u043a\u0430\u0436\u0447\u0438\u043a',
    proof: '\u0414\u043e\u0432\u0435\u0434\u0435\u043d\u043d\u044f',
    preface: '\u0412\u0441\u0442\u0443\u043f',
    glossary: '\u0421\u043b\u043e\u0432\u043d\u0438\u043a \u0442\u0435\u0440\u043c\u0456\u043d\u0456\u0432',
  },
  cyrillicPatterns: 'uk',
}
