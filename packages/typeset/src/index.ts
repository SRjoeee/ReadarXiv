/** What `@readarxiv/typeset` is for: layFlow, rules, language data and painters: a translated unit laid into its room */
export const TYPESET_PURPOSE =
  'layFlow, rules, language data and painters: a translated unit laid into its room' as const

export { type MeasureTable, MissingMeasure, tableMetrics } from './metrics/table.ts'
export { RULE_LIST, RULES, type RuleSpec, type RuleState } from './rules.ts'
export { NoRules, resolveRules, rulesFor } from './rules-for.ts'
export { HYPHENATION, LANGUAGES, type LanguageRules, SCRIPTS, type ScriptRules } from './data/rules/index.ts'
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
  RuleParams,
  Rows,
  Rules,
  Script,
  Step,
  Trace,
  Unlaid,
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
  carriedCrop,
  type DecorAfter,
  type DecorAfterInput,
  type DecorBefore,
  type DecorBeforeInput,
  type DecorBlock,
  type DecorChar,
  type DecorLabel,
  decorAfter,
  decorBefore,
  INK_UNIT_KINDS,
  type KeptRow,
  type LabelCrop,
  originalLines,
  type ShortSkip,
  type Side,
  shortSkipsTo,
  widen,
} from './unit/decor.ts'
export {
  type Band,
  baseStyleOf,
  CJK_CAPS_SIZE,
  cellBands,
  cjkAdvance,
  type HalfLead,
  leadOf,
  type Original,
  type Params,
  type ParamsInput,
  type ParamsRules,
  params,
  SOLID,
  sizeOf,
  unitSizeOf,
} from './unit/params.ts'
export { droppedHeld, dropMarks, type MarksAfter, type MarksTrace, markKind, mergeTail } from './unit/marks.ts'
export {
  jointOf,
  type Lead,
  type LeadChar,
  type LeadInput,
  type Led,
  lead,
  type NameLead,
  type NameRecord,
  styleOfChars,
  unlead,
} from './unit/lead.ts'
export {
  GENERATED_REF,
  type NameRow,
  nameOfRow,
  type RefNames,
  type Rename,
  type Renamable,
  refInTarget,
  refName,
  refNamesOf,
  rename,
  type TexNamesData,
} from './unit/rename.ts'
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
export {
  CJK_SLANT_DEG,
  type CjkFaces,
  capsLetters,
  faceFor,
  faceOf,
  ownSmallCaps,
  type Roles,
  type Run,
  rolesFor,
  scriptOf,
} from './breaker/faces.ts'
export { type FitMeasure, fitMeasure, fontString, measure } from './breaker/measure.ts'
export { type Cover, cover, runsOfTokens } from './breaker/cover.ts'
export { type RelayFollower, type RelayLead, relay } from './shared/relay.ts'
export { breakPoints, hyphenationOf, type Mins, type Patterns } from './breaker/hyph.ts'
export { footFloorOf, inFlow, PREDISPLAY, SHORT_SKIP, type Slot, slotsAt, texRoomOf } from './breaker/slots.types.ts'
export { type Broken, breakLines, lineExtent } from './breaker/break.types.ts'
export { type Cut, pageCutsOf, textless, withPageBreaks } from './breaker/cuts.types.ts'
export { laidOut } from './breaker/place.types.ts'
export { layoutUnit2, statesOf } from './fit/walk.types.ts'
export { layoutCut } from './fit/cut.types.ts'
export { layoutAt } from './fit/at.types.ts'
export { toLastLines } from './fit/last-lines.types.ts'
export { joinRuns, keepsPages, layoutRuns, type Run as FitRun, runParams, runsOf } from './fit/runs.types.ts'
export type { FitBlock, FitParams, FitState, LaidItem, LaidLine, Layout, Tokens as FitTokens } from './fit/types.ts'
export { keepsShare, type Share, shareOf } from './shared/share.types.ts'
export { closerLead, type FillRules, type FillUnit, fillLeadsOf } from './shared/fill-leads.types.ts'
export { type Row, type RowStart, type RowStartInput, rowStart } from './shared/row-start.ts'
export { clearLines, settleLayout } from './shared/settle.ts'
export { type OverFollower, type OverFollowerInput, overFollower } from './shared/over-follower.ts'
export {
  type FillDecision,
  type FillLaid,
  type FillTrace,
  type FillUnits,
  fillPage,
  fillUnitsOf,
  type PageRules,
} from './shared/fill-page.types.ts'
export { type Filled, fillPass, type PassUnit } from './shared/fill-pass.ts'
export { type OnLead, type OnLeadInput, onLeadRetry } from './shared/on-lead.ts'
export { type GroupMember, keptCell, type TableRead, tableRead } from './shared/table-read.ts'
export { type LaidCell, tableSettle } from './shared/table-settle.ts'
export { type NumberCrop, type NumberedInput, numberCrop, numberedLayout } from './fit/numbered.ts'
export { type Further, type FurtherInput, fitFurther } from './fit/further.ts'
export { type CatalogueFace, FACES, HOLDS, SMCP } from './data/faces.ts'
export { CJK, cjkClassRe, keptPair, kinsokuOf, noStart, SPACELESS } from './breaker/script.ts'
export { drawnText, plainTracker, shown, transformMap } from './breaker/text.ts'
export {
  baseOf,
  caseRuns,
  cropPartsOf,
  type Face,
  glueOf,
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
