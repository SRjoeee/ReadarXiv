// The one transition facade of the front half moved into this package (JavaScript as it was): the names the website's
// rebuilt server imports of it, each value re-exported with the type its hand declaration file states beside its old path
// (src/pdf-reader/engine/…/*.d.mts, read when it moved), and the types those name, copied: the package holds no declaration
// file and imports none outside it. But where front.ts reads one more closely than its declaration says: contentOf's content
// is format's pieces (a unit's id is made of them), its kindOf given a piece and its idOfNested a nested piece's unit;
// classesOf takes the pieces locate hands it (an index signature of the declaration's refused them). Exit: the typing of
// the moved modules replaces this file.
import type { PdfLike } from './compile/base.ts'
import type { CellPlace, SourceUnit } from './source/latex-front.ts'
import type { Compiled, CompileRequest, Paper } from './compile/live.ts'
import * as instrument_js from './instrument/instrument.ts'
import * as base_js from './compile/base.ts'
import * as guard_js from './compile/guard.ts'
import * as live_js from './compile/live.ts'
import * as pdfLite_js from './compile/pdf-lite.ts'
import * as units_js from './instrument/units.ts'
import * as latexFront_js from './source/latex-front.ts'
import * as paperMeta_js from './source/paper-meta.ts'
import * as paper_js from './compile/paper.ts'
export type { BundlePiece, BundleUnit } from './instrument/units.ts'
export const bundleUnitsOf = units_js.bundleUnitsOf
export type { PdfLike }
export const DRIVER_OUTPUT_MARK = base_js.DRIVER_OUTPUT_MARK
export const DRIVER_OUTPUT_TRUNCATED = base_js.DRIVER_OUTPUT_TRUNCATED
export const driverOutputGiven = base_js.driverOutputGiven
export const driverOutputTruncated = base_js.driverOutputTruncated
export const textOfPdf = base_js.textOfPdf
export const creationEpochOf = base_js.creationEpochOf
export const texLiveOfPdf = guard_js.texLiveOfPdf
export const compilerOfPdf = guard_js.compilerOfPdf
export const texRan = guard_js.texRan
export const limitOf = guard_js.limitOf
export const markedOfPaper = paper_js.markedOfPaper
export const madeBibliography = paper_js.madeBibliography
export const bibliographyKept = paper_js.bibliographyKept
export const LITE_PDFJS = pdfLite_js.LITE_PDFJS
export const NO_IMAGE_PIXELS = pdfLite_js.NO_IMAGE_PIXELS
export const LINK_TEXT_PIXELS = pdfLite_js.LINK_TEXT_PIXELS
export const liteWorkerSource = pdfLite_js.liteWorkerSource
export const float32Outlines = pdfLite_js.float32Outlines
export const contentOf = instrument_js.contentOf
export const classesOf = instrument_js.classesOf
export const elementKindOf = instrument_js.elementKindOf
export const unitFactsOf = instrument_js.unitFactsOf
export const instrumentOf = instrument_js.instrumentOf
export const openPaper = live_js.openPaper
export const NO_DRIVER_GROUP = live_js.NO_DRIVER_GROUP
export const ranThrough = live_js.ranThrough
export type { CellPlace, Compiled, CompileRequest, Paper, SourceUnit }
export const inMemory = latexFront_js.inMemory
export const analyze = paperMeta_js.analyze
