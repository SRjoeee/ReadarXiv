/** What `@readarxiv/engine` is for: source, marks, ink, align, locate, wrap, bundle and prepare: a paper in, its bundle out */
export const ENGINE_PURPOSE =
  'source, marks, ink, align, locate, wrap, bundle and prepare: a paper in, its bundle out' as const

// ---- today's modules, moved as they are (JavaScript, typed by their *.types.ts)
export * from './ink.types.ts'
export * from './delta-wire.types.ts'
export * from './memory.types.ts'
export * from './remove.types.ts'
export * from './section.types.ts'
export * from './tail.types.ts'
export * from './wrap.types.ts'
export * from './xref.types.ts'

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
// cell whole, the front half's adapter's decoratedCellsOf (PDF-READER §18.57))
export { holdsLetter } from './locate/figure-lines.ts'
export { type Located, locate, type Member, type Place } from './locate/locate.ts'
export { type PrepareDeps, prepareBack, readArxiv, type Tally } from './prepare.ts'
export { OPS_PDFJS, type OpsPage, type OpsReader, readOps } from './opstream.ts'
export { type PdfJs, type ReadPage, type Recovered, readPdf } from './read.ts'
export { RECOVER_SITES, reasonOf, siteOf } from './warnings.ts'
export { type AddOn, textGroupOf, type WrapPageA, wrap, wrapPageOf } from './wrap/wrap.ts'
