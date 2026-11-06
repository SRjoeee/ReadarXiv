/** What `@readarxiv/typeset` is for: layFlow, rules, language data and painters: a translated unit laid into its room */
export const TYPESET_PURPOSE =
  'layFlow, rules, language data and painters: a translated unit laid into its room' as const

export { type MeasureTable, MissingMeasure, tableMetrics } from './metrics/table.ts'
export { RULE_LIST, RULES, type RuleSpec, type RuleState } from './rules.ts'
export type {
  Choices,
  Decided,
  FaceId,
  FaceTable,
  Given,
  Home,
  Hyphenation,
  Item,
  Json,
  Lang,
  Laid,
  LayFlow,
  LayPage,
  LedgerSlot,
  Metrics,
  Page,
  PageLedger,
  RuleId,
  Rows,
  Rules,
  Script,
  Step,
  Trace,
  Why,
} from './types.ts'
export { type Block, type BlocksInput, blocks, type LineInfo } from './unit/blocks.ts'
