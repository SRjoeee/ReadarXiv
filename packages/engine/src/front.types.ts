// The one transition facade of the front half moved into this package (JavaScript as it was): the names the website's
// rebuilt server imports of it, each value re-exported with the type its hand declaration file states beside its old path
// (src/pdf-reader/engine/…/*.d.mts, read when it moved), and the types those name, copied: the package holds no declaration
// file and imports none outside it. But where front.ts reads one more closely than its declaration says: contentOf's content
// is format's pieces (a unit's id is made of them), its kindOf given a piece and its idOfNested a nested piece's unit;
// classesOf takes the pieces locate hands it (an index signature of the declaration's refused them). Exit: the typing of
// the moved modules replaces this file.
import type { Piece } from '@readarxiv/format'
import type { PdfLike } from './compile/base.ts'
import type { Instrument, PieceClass } from './instrument.ts'
import type { NameKey } from './marks/names.ts'
import type { CellPlace, SourceUnit } from './source/latex-front.ts'
import * as instrument_js from './instrument/instrument.ts'
import * as base_js from './compile/base.ts'
import * as guard_js from './compile/guard.ts'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as live_js from './compile/live.mjs'
import * as pdfLite_js from './compile/pdf-lite.ts'
import * as units_js from './instrument/units.ts'
import * as latexFront_js from './source/latex-front.ts'
import * as paperMeta_js from './source/paper-meta.ts'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as paper_js from './compile/paper.mjs'
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
export type MarkClass = 'math' | 'display' | 'cite' | 'ref' | 'eqref' | 'code' | 'url' | 'footnote' | 'macro' | 'number'
export type Switches = Record<string, string>
export type Complete = Record<string, number>
export interface LayoutMarks {
  schema: 15
  engine: string
  marking: {
    classes: MarkClass[]
    switches: Switches | null
    inkless: string[] | null
    texts: string[] | null
    names: Partial<Record<NameKey, 0 | 1>> | null
    lineskip: [number, number] | null
    complete: Complete | null
    apart: string[] | null
  }
  pages: number
  views: number[]
  columns: number[]
  marks: [name: string, page: number, x: number, y: number][]
  dropped: string[]
  lines: [id: number, n: number][]
  align: [id: number, code: AlignCode][]
  colours: [id: number, k: number, rgb: number][]
  words: string[]
  tokens: number[]
  chars: string[]
  owned: (string | number)[][]
  links: LinkRow[]
}
export type AlignCode = 'c' | 'l' | 'r' | 'j'
export type LinkRow = [
  dest: string,
  page: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  a: number,
  b: number,
  n: number,
  text: string,
]
declare function layoutMarksOf(
  marked: unknown,
  log: string,
  o: {
    engine: string
    classes?: readonly MarkClass[]
    switches?: Switches | null
    inkless?: readonly string[] | null
    texts?: readonly (readonly [string, string])[] | readonly string[] | null
    decorated?: readonly (readonly [string, string])[] | null
    names?: Partial<Record<NameKey, 0 | 1>> | null
    lineskip?: readonly [number, number] | null
    complete?: Complete | null
    apart?: readonly string[] | null
    units?: readonly SourceUnit[] | null
    OPS?: Record<string, number> | null
  },
): Promise<LayoutMarks>
export type MarkedOptions = Parameters<typeof layoutMarksOf>[2] & { paper?: boolean }
export type { NameKey }
export interface ConvergeRecord {
  drafts: number
  marked: number
  settled: boolean
  fallback?: 'no-files' | 'draft-failed' | 'aux-jobs' | 'bib-missing' | 'files-bound'
}
export const markedOfPaper = paper_js.markedOfPaper as (
  paper: Paper,
  o: MarkedCompileOptions,
) => Promise<
  | {
      pdf: Uint8Array
      log: string
      options: Omit<MarkedOptions, 'units' | 'OPS'>
      ms: { probe: number; compile: number; guard?: number; final?: number }
      cm?: ConvergeRecord
      guard?: GuardRecord
      base?: FinalPass
    }
  | {
      refused: MarkedRefusal
      why?: string
      limit?: RefusalLimit
      own?: OwnVerdict
      ms: Record<string, number>
      cm?: ConvergeRecord
      guard?: GuardRecord
    }
>
export interface MarkedCompileOptions {
  compile(req: CompileRequest): Promise<Compiled>
  converge?: boolean
  compileBudgetMs?: number | null
  filesBound?: { count: number; bytes: number } | null
  OPS?: Record<string, number>
  pages?: number | (() => number | null | Promise<number | null>) | null
  engines?: readonly string[] | null
  tried?: readonly string[] | null
  final?: boolean
  sourceDate?: number | (() => number | null | Promise<number | null>) | null
  textOf?: ((pdf: Uint8Array) => Promise<string[] | null>) | null
  compilerOf?: (() => Promise<string | null>) | null
}
export type RefusalLimit = string
export type FinalPass = { pdf: Uint8Array; log: string } | { refused: 'final'; why: string; limit?: RefusalLimit }
export interface OwnVerdict {
  ran: boolean
  short: boolean
  limit: string | null
  tree: string | null
}
export interface GuardRecord {
  extra: number
  unmarked: number[]
  names: boolean
  failed: ('preamble' | 'braces' | 'ran' | 'pages' | 'aux' | 'text' | 'errors')[]
  judged?: string
}
export type MarkedRefusal = 'probe' | 'compile' | 'texlive' | 'engine' | 'marks'
export const madeBibliography = paper_js.madeBibliography as (
  paper: Paper,
  o: {
    compile(req: CompileRequest): Promise<Compiled>
    compilerOf?: (() => Promise<string | null>) | null
    engines?: readonly string[] | null
  },
) => Promise<
  { paper: Paper; made: { path: string; bytes: Uint8Array }; ms: number } | { kept: BibliographyKept; ms: number }
>
export type BibliographyKept =
  | 'shipped'
  | 'none'
  | 'biblatex'
  | 'bib-missing'
  | 'engine'
  | 'compile'
  | 'no-files'
  | 'aux-jobs'
  | 'biber'
  | 'no-bbl'
  | 'moved'
  | 'entries'
export const bibliographyKept = paper_js.bibliographyKept as (
  paper: Paper,
) => Extract<BibliographyKept, 'shipped' | 'none' | 'biblatex' | 'bib-missing'> | null
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
export interface Paper {
  fsys: ReturnType<typeof inMemory>
  meta: ReturnType<typeof analyze>
  project: { main: string; units: SourceUnit[]; inFloat: number[]; bibliography?: string[] }
  units: SourceUnit[]
  inFloat: number[]
  floatTypes?: [number, string][]
  pseudocode?: number[]
  /** R4's blocks (PDF-READER §18.72): each block's text cells, a cell's units by index or a cell of none that prints text */
  tableBlocks?: ({ units: number[] } | { name: true })[][]
  texOrder?: number[] | null
  names: string[]
  theoremNames?: string[]
}
export const openPaper = live_js.openPaper as (files: Map<string, Uint8Array>) => Paper
export const NO_DRIVER_GROUP = live_js.NO_DRIVER_GROUP as string
export const ranThrough = live_js.ranThrough as (c: Compiled | null | undefined) => boolean
export interface Compiled {
  ok: boolean
  pdf?: Uint8Array | null
  aux?: string | null
  bbl?: string | null
  log?: string
  ms?: number
  error?: string
  network?: string[]
  passes?: number
  files?: Map<string, Uint8Array>
}
export interface CompileRequest {
  main: string
  engine: string
  rerun: boolean
  bibtex: boolean | null
  overrides: Map<string, Uint8Array>
  draft?: boolean
  files?: boolean
  sourceDate?: number
}
export type { CellPlace, SourceUnit }
export const inMemory = latexFront_js.inMemory
export const analyze = paperMeta_js.analyze
