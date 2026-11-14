/** What `@readarxiv/typeset` is for: layFlow, rules, language data and painters: a translated unit laid into its room */
export const TYPESET_PURPOSE =
  'layFlow, rules, language data and painters: a translated unit laid into its room' as const

// The entry is what the reader imports (packages/reader: its composer, its served faces and patterns, its harness page) and
// the types it names of them: a page laid (`layPage`) under a target's rules (`rulesFor`, `LANGUAGES`), the faces and the
// patterns it serves. The package's tests and the lab import its source files by path (design-reduction R8).
export { rulesFor } from './rules-for.ts'
export { LANGUAGES } from './data/rules/index.ts'
export type { Metrics, Rules } from './types.ts'
export { hyphenationOf, type Patterns } from './breaker/hyph.ts'
export { CJK_INK } from './emit/display.ts'
export { layPage } from './lay/entry.ts'
export { FACES } from './data/faces.ts'
