// The one transition facade of the front half moved into this package (JavaScript as it was): the names the website's
// rebuilt server imports of it, each value re-exported with the type its hand declaration file states beside its old path
// (src/pdf-reader/engine/…/*.d.mts, read when it moved), and the types those name, copied: the package holds no declaration
// file and imports none outside it. But where front.ts reads one more closely than its declaration says: contentOf's content
// is format's pieces (a unit's id is made of them), its kindOf given a piece and its idOfNested a nested piece's unit;
// classesOf takes the pieces locate hands it (an index signature of the declaration's refused them). Exit: the typing of
// the moved modules replaces this file.
import type { Piece } from '@readarxiv/format'
import type { Instrument, PieceClass } from './instrument.ts'
import type { NameKey } from './marks/names.ts'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as instrument_js from './instrument/instrument.mjs'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as base_js from './compile/base.mjs'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as guard_js from './compile/guard.mjs'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as live_js from './compile/live.mjs'
import * as pdfLite_js from './compile/pdf-lite.ts'
import * as units_js from './instrument/units.ts'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as latexFront_js from './source/latex-front.mjs'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as paperMeta_js from './source/paper-meta.mjs'
// @ts-ignore: JavaScript moved as it is, typed by this file alone
import * as paper_js from './compile/paper.mjs'
export type { BundlePiece, BundleUnit } from './instrument/units.ts'
export const bundleUnitsOf = units_js.bundleUnitsOf
export interface PdfLike {
  numPages: number
  getPage(p: number): Promise<{
    view?: number[]
    rotate?: number
    userUnit?: number
    getTextContent(): Promise<{ items?: { str?: string }[] }>
  }>
  getDestinations(): Promise<Record<string, unknown[] | null> | Map<string, unknown[] | null>>
  getPageIndex(ref: unknown): Promise<number>
  getMetadata?(): Promise<{
    info?: { CreationDate?: string; Custom?: Map<string, unknown> } | null
    metadata?: { getRaw?(): unknown } | null
  } | null>
}
export const DRIVER_OUTPUT_MARK = base_js.DRIVER_OUTPUT_MARK as 'axt-runner: dvipdfmx output'
export const DRIVER_OUTPUT_TRUNCATED = base_js.DRIVER_OUTPUT_TRUNCATED as 'axt-runner: dvipdfmx output truncated'
export const driverOutputGiven = base_js.driverOutputGiven as (log: string | null | undefined) => boolean
export const driverOutputTruncated = base_js.driverOutputTruncated as (log: string | null | undefined) => boolean
export const textOfPdf = base_js.textOfPdf as (doc: PdfLike) => Promise<string[]>
export const creationEpochOf = base_js.creationEpochOf as (doc: PdfLike) => Promise<number | null>
export const texLiveOfPdf = guard_js.texLiveOfPdf as (doc: PdfLike) => Promise<string | null>
export const compilerOfPdf = guard_js.compilerOfPdf as (
  doc: PdfLike,
) => Promise<'latex' | 'pdflatex' | 'xelatex' | 'lualatex' | null>
export const texRan = guard_js.texRan as (log: string | null | undefined) => boolean
export const limitOf = guard_js.limitOf as (c: (Compiled & { limit?: string }) | null | undefined) => string | null
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
export const contentOf = instrument_js.contentOf as (
  pieces: readonly unknown[],
  o?: {
    kindOf?: (p: { t: string; src?: string }) => string
    idOfNested?: (u: SourceUnit) => string | null
    nameOf?: (p: unknown) => { name?: string; lang?: string } | undefined
  },
) => Piece[]
export const classesOf = instrument_js.classesOf as (
  pieces: readonly { t: string; src?: string }[],
  colours?: ReadonlyMap<number, number> | null,
  texts?: ReadonlyMap<string, string> | null,
) => [string, PieceClass][]
export const elementKindOf = instrument_js.elementKindOf as (piece: { t: string; src?: string }) => string
export const unitFactsOf = instrument_js.unitFactsOf as (paper: Paper) => {
  float: Map<number, string>
  kept: Set<number>
  why: Map<number, 'pseudocode' | 'words' | 'paperNames' | 'namesBlock'>
}
export const instrumentOf = instrument_js.instrumentOf as (
  o: Record<string, unknown>,
) => Promise<{ instrument: Instrument; today: unknown }>
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
export interface CellPlace {
  table: number
  row: number
  col: number
  span: number
  head: boolean
}
export interface SourceUnit {
  kind: string
  title?: boolean
  depth?: number
  lead?: string
  trail?: string
  inner?: string
  front?: boolean
  held?: boolean
  stored?: boolean
  /** the block its source ties a note to (latex-front.mjs tieNotes): `author` */
  of?: 'author'
  bracketed?: boolean
  pieces: unknown[]
  cell?: CellPlace
}
export const inMemory = latexFront_js.inMemory as (map: Map<string, Uint8Array>) => {
  list(): string[]
  read(path: string): Uint8Array | null
}
export const analyze = paperMeta_js.analyze as (fsys: ReturnType<typeof inMemory>) => {
  main: string | null
  mainGuessed?: boolean
  compiler?: string
  compilerGuessed?: boolean
  compilerFrom?: 'pdf'
  bbl?: boolean
  tlVersion?: string | null
  toplevels?: number
  documentclass?: string | null
}
