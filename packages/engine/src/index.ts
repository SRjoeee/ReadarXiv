/** What `@readarxiv/engine` is for: source, marks, ink, align, locate, wrap, bundle and prepare: a paper in, its bundle out */
export const ENGINE_PURPOSE =
  'source, marks, ink, align, locate, wrap, bundle and prepare: a paper in, its bundle out' as const

// ---- today's modules, moved as they are (JavaScript, typed by their *.types.ts)
export * from './ink.ts'
export * from './delta-wire.ts'
export * from './memory.ts'
export * from './remove.ts'
export * from './section.ts'
export * from './tail.ts'
export * from './wrap.ts'
export * from './xref.ts'

// ---- the back half of the prepare
// (the unit's id, which the front half's adapter computes for the seam: format's)
export { unitId } from '@readarxiv/format'
// (a unit's run-in labels stated `must`, which the front half's adapter states for the seam)
export { type GroupFact, groupFacts } from './marks/faces.ts'
export { runIns } from './marks/run-ins.ts'
export { align, HOW, HUNK, type HunkClass, hunkName, type Mapping } from './align/align.ts'
export { lcs } from './align/myers.ts'
export { type BundleObject, bundle, type MemberState, stateOf } from './bundle/bundle.ts'
export type { Doc, DocGlyph, DocPage, DocPoint } from './doc.ts'
export {
  type Instrument,
  type InstrumentUnit,
  type Owners,
  ownersOf,
  type PieceClass,
  type SpanClass,
  ROLE,
  type Role,
  type TexFrame,
} from './instrument.ts'
export { linkTargetOf } from './locate/ink.ts'
export {
  boxedAlignOf,
  framesOf,
  type RefName,
  readAlign,
  readBoxAlign,
  readRefNames,
  readSkips,
} from './marks/channels.ts'
export { cutLines } from './locate/lines.ts'
// (whether a text holds a letter: a figure's decorated stretch a word (`cite`), and a cell's decorated piece one that holds its
// cell whole, the front half's adapter's decoratedCellsOf (PDF-READER §18.61))
export { holdsLetter } from './locate/figure-lines.ts'
export { type Located, locate, type Member, type Place } from './locate/locate.ts'
// (the prepare's one entry, front half then back half, which the box and the lab call alike; and its two halves)
export {
  type PrepareDeps,
  type PrepareEnd,
  type PrepareHost,
  type PrepareInputs,
  prepare,
  prepareBack,
  readArxiv,
  type Tally,
} from './prepare.ts'
export {
  type FrontHalf,
  type FrontInput,
  type FrontResult,
  originalFactsOf,
  type PrepareStage,
  prepareFront,
  type Refusal,
  type TreeDecision,
  treeOf,
} from './front.ts'
// (the stored half of the front half, a module of its own: what decides the instrument's stored objects, which a host keys them by)
export { type CompiledInput, type CompiledResult, compiledOf, type PreparePdfJs } from './compiled.ts'
// (the stored plan's codec, a module of its own: what a host keys the stored instrument by names it without the front half's
// readers of what is stored. Its reader is storedPlanOf here: `planOf` is the wrap's, wrap.types.ts's, which an explicit
// export of the same name would shadow)
export {
  type Kept,
  keeps,
  type OriginalFacts,
  opened,
  type PrepareWhy,
  planOf as storedPlanOf,
  type Plan as StoredPlan,
  type ReadPlan as ReadStoredPlan,
  type StoredInstrument,
  storedInstrumentOf,
  unkeep,
  withBbl,
} from './plan.ts'
export { OPS_PDFJS, type OpsPage, type OpsReader, readOps } from './opstream.ts'
export { type PdfJs, type ReadPage, type Recovered, readPdf } from './read.ts'
export { type Hole, type Holes, holesOf, PACKED_MAGIC, pack, unpack } from './sparse.ts'
export { RECOVER_SITES, reasonOf, siteOf } from './warnings.ts'
export { type AddOn, textGroupOf, type WrapPageA, wrap, wrapPageOf } from './wrap/wrap.ts'

// ---- the front half moved into this package as it is (JavaScript), typed by its one transition facade: the names the
// website's prepare imports (the source reader's paper, the marked compile, the instrument, the PDF's facts)
export {
  analyze,
  bibliographyKept,
  bundleUnitsOf,
  type Compiled,
  type CompileRequest,
  classesOf,
  compilerOfPdf,
  contentOf,
  creationEpochOf,
  DRIVER_OUTPUT_MARK,
  DRIVER_OUTPUT_TRUNCATED,
  driverOutputGiven,
  driverOutputTruncated,
  elementKindOf,
  float32Outlines,
  inMemory,
  instrumentOf,
  LINK_TEXT_PIXELS,
  LITE_PDFJS,
  limitOf,
  liteWorkerSource,
  madeBibliography,
  markedOfPaper,
  NO_DRIVER_GROUP,
  NO_IMAGE_PIXELS,
  openPaper,
  type Paper,
  ranThrough,
  texLiveOfPdf,
  texRan,
  textOfPdf,
  unitFactsOf,
} from './front.types.ts'
