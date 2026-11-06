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
export { type Break, type Breaks, type BreaksInput, breaks, type LayoutUnit, type V0Piece } from './unit/breaks.ts'
export { type CropPart, cropFields, cropOfBox, cropPartsOfSegments, type SegBox } from './unit/crops.ts'
export {
  bracketed,
  type ElementReading,
  type Elements,
  type ElementsInput,
  elements,
  type Gap,
  type Res,
} from './unit/elements.ts'
export {
  type Glyph,
  type HeadLabel,
  headInTarget,
  headLabelInTarget,
  type LabelInput,
  type LabelPart,
  type Labelled,
  label,
  labelInTarget,
  spacedText,
  type UnitLabel,
} from './unit/label.ts'
export {
  type Admission,
  type AdmitInput,
  admit,
  kOfPieces,
  locatedWhole,
  refusalOf,
  translated,
  type V0Row,
} from './unit/admit.ts'
export { fontString, measure } from './breaker/measure.ts'
export { CJK, cjkClassRe, keptPair, kinsokuOf, noStart, SPACELESS } from './breaker/script.ts'
export { drawnText, plainTracker, shown, transformMap } from './breaker/text.ts'
export {
  caseRuns,
  cropPartsOf,
  droppedHeld,
  type Face,
  glueOf,
  markKind,
  type Reading,
  renameRuns,
  type Token,
  type TokenRules,
  type Tokens,
  type TokensInput,
  type TRes,
  type TStyle,
  tokens,
  upperOf,
} from './breaker/tokens.ts'
export { BODY_KINDS, type FillTarget, fillTarget, type Voter } from './shared/fill-target.ts'
