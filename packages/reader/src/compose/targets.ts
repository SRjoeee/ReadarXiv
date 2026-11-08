// The targets the reader's own typesetter sets (compose/typeset.ts), as hosts name them: the rule set's own tags (both hosts'
// preferences: zh, zh-TW, de, …), and Chinese by its script (the package's default preferences, zh-Hans). Stated here, not read
// from @readarxiv/typeset, so that the reader's first chunk carries none of the typesetter (its code chunk does); a test holds
// the list equal to the rule set's languages (tests/typeset-engine.test.ts)
export const TYPESET_TARGETS: readonly string[] = [
  'bg',
  'cs',
  'de',
  'es',
  'fr',
  'id',
  'it',
  'ja',
  'ko',
  'ms',
  'nl',
  'pl',
  'pt',
  'ru',
  'sv',
  'tr',
  'uk',
  'zh',
  'zh-TW',
  'zh-Hans',
  'zh-Hant',
]
