// live.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { inMemory, SourceUnit } from './latex-front.mjs'
import type { analyze } from './paper-meta.mjs'
import type { Strategy } from './scripts.mjs'
import type { Typeset } from './typeset/tex.mjs'
import type { Readings } from './cache.mjs'
import type { TrPiece } from './layer/pieces.mjs'

/** a paper's files (path → bytes) → what the pipeline works on */
export interface Paper { fsys: ReturnType<typeof inMemory>; meta: ReturnType<typeof analyze>; project: { main: string; units: SourceUnit[] }; units: SourceUnit[]; kept: Set<SourceUnit> }
export declare function openPaper(files: Map<string, Uint8Array>): Paper
/** the translation so far, with unit marks, set by one of strategiesFor: the files that differ from the paper's */
/** `spans`, where given, gets `lines()`: each unit's lines and bytes in the files as written, worked out when asked */
export declare function translationFiles(paper: Paper, translated: Map<SourceUnit, unknown[]>, options: { strategy: Pick<Strategy, 'engine' | 'pre'> & Partial<Strategy>; fonts: unknown; draft?: boolean; aux?: string | null; bbl?: string | null; typeset?: Typeset | null; evenSpaces?: boolean; spans?: { lines?: () => import('./tex-errors.mjs').UnitLines<SourceUnit>[] } | null; note?: (event: string, data: unknown) => void }): Map<string, Uint8Array>
/** the reader's versions: the extraction's (what a unit is; versions.mjs's, which a copy is judged by) and the typesetting's */
export { PIPELINE_VERSION } from './versions.mjs'
/** the earlier pipelines whose copies carry their translations over into this one, unit by unit, with the test each
 *  translation's pieces must pass (cache.mjs copyReuse) */
export declare const PIPELINE_CARRIES: Record<string, (pieces: unknown[]) => boolean>
export declare const TYPESETTING_VERSION: string
/** the font probe; with `width`, the width and size probes the typesetting rule measures the face by */
export declare function probeFiles(paper: Paper, options?: { width?: boolean; marks?: boolean }): Map<string, Uint8Array>
/** the original with unit marks; with `lines`, each unit's lines and the forced breaks in its log; `spans`, where
 *  given, gets `lines()`: each unit's lines and bytes in the files as written. `layout` null or absent: the bytes as at
 *  3cb5a733; else the units marked by layoutMarking (layout/marks.mjs) with those classes, and LAYOUT_TEX after MARK_DEF;
 *  `switches` (with `layout` only), the paper's own switch (readMarkProbe): marks off where TeX said they change what
 *  follows; `inkless` (with `layout` only), the macros TeX said set no ink (readInkProbe): no mark */
export declare function originalFiles(paper: Paper, options?: { lines?: boolean; spans?: { lines?: () => import('./tex-errors.mjs').UnitLines<SourceUnit>[] } | null; layout?: readonly import('./layout/marks.mjs').MarkClass[] | null; switches?: import('./layout/marks.mjs').Switches | null; inkless?: readonly string[] | null }): Map<string, Uint8Array>
/** the units a translation into `lang` leaves as they are */
export declare function keptFor(paper: Paper, lang: string): Set<SourceUnit>
/** whether a compile's last TeX pass stopped short of the document's end (a fatal error), whatever PDF it left: such a
 *  compile is one that failed */
export declare const stoppedShort: (log: string | null | undefined) => boolean
/** a compile as the TeX page answers it */
export interface Compiled { ok: boolean; pdf?: Uint8Array | null; aux?: string | null; bbl?: string | null; log?: string; ms?: number; error?: string; network?: string[] }
/** a compile asked of the TeX page */
export interface CompileRequest { main: string; engine: string; rerun: boolean; bibtex: boolean | null; overrides: Map<string, Uint8Array> }
/** the compiler a visit uses, opened when first needed and again after a compile the page failed */
export declare function compilerKeeper(open: () => Promise<{ compile: (req: CompileRequest) => Promise<Compiled>; close: () => void }>): { ready: () => Promise<void>; compile: (req: CompileRequest) => Promise<Compiled>; close: () => void }
/** the reader's run: translation as it comes in, the compiles, the final (the options as the reader passes them) */
export declare function runLive(paper: Paper, options: {
  lang: string
  compile: (req: CompileRequest) => Promise<Compiled>
  /** a compiler of its own for the marked original, asked from the run's start, beside the probe and the previews */
  compileOriginal?: ((req: CompileRequest) => Promise<Compiled>) | null
  translate: (texts: string[], cuts?: number[][]) => Promise<({ text: string; by: string | null } | null)[]>
  format?: 'markers' | 'tags' | 'runs'
  rank?: (i: number) => number
  onUpdate?: (u: { pdf: Uint8Array; texts: unknown[]; translated: number; final: boolean; captions?: Captions | null }) => void
  /** the marked original, with its last TeX pass's log (lastTexLog) */
  onOriginal?: (o: { pdf: Uint8Array; log: string }) => void
  /** each batch's translated units, once their results are set and before the next batch is asked; and once, before the
   *  first batch, the seeds taken as they are (`seeded`) */
  onBatch?: ((report: BatchReport) => void) | null
  note?: (event: string, data?: Record<string, unknown>) => void
  seed?: Map<number, unknown> | null
  marks?: Map<string, unknown> | null
  /** the original's readings as a run before gave them (readingsOf), taken with `marks` known: no original compiled */
  original?: Readings | null
  identity?: string | null
  pipelineCurrent?: boolean
  /** a PDF's unit marks and page columns (typeset/places.mjs marksOf on a PDF.js document of the bytes): with it, the
   *  typesetting rule sets the translation; without, it is set as today */
  readMarks?: ((pdf: Uint8Array) => Promise<import('./typeset/places.mjs').Marks>) | null
  /** false: no preview is compiled or shown; the original is compiled first where the run compiles it; a draft of the
   *  whole translation measures the final (compiled, not shown); the final is the one update. Default true: today's. A
   *  function of the marked original (null where the run compiles none, or it did not set) says which, once, as soon as
   *  the original is in, before any compile of the translation */
  previews?: boolean | ((original: { pdf: Uint8Array; log: string } | null) => boolean | Promise<boolean>)
}): Promise<{ settled: boolean; exhausted: boolean; changed: boolean; results: Map<number, unknown>; previews: number; translated: number; units: number; originalOk?: boolean; stopped?: string | null; compiler?: { down: 'network' | 'page'; error: string }; missing?: number; inSource?: number; shownPartial?: boolean | null; captions?: Captions | null; original: Readings | null; passing: boolean }>
/** a batch's translated units as the layer takes them (runLive's onBatch): each unit's pieces by their source indices
 *  (layer/pieces.mjs trPiecesOf; none where it has none), its sentences (mt.mjs sentencesOf's), its state and engine, as
 *  the run's results have them */
export interface BatchReport {
  seeded: boolean
  /** each unit's table group, where it is a table cell (groups.mjs groupOf) */
  units: { id: number; pieces: TrPiece[]; sentences: { src: number[]; tr: number[] } | null; state: 'whole' | 'partial' | 'none' | 'lost'; by: string | null; group?: string }[]
  /** the table cells held in the source as the translation stands, by index: a group kept whole, or waiting on a cell
   *  (groups.mjs decideGroups): the layer draws none of them, as the final sets none translated */
  held: number[]
}
/** what names a compile's figures and tables: the target's names babel gives (the layout rules' labels, rules/layout-rules.json), or the paper's own */
export interface Captions { figure: 'target' | 'source'; table: 'target' | 'source' }
/** the TeX that writes what names the floats to the log, at the document's end, in every compile of the translation */
export declare const CAPTIONS_PROBE: string
/** whether a compile labelled its figures and its tables with the target's names, from its log; null with no such line */
export declare function captionsOf(log: string | null | undefined): Captions | null
/** an aux's citation lines: every closed line whose first argument is a key it cites, \citation's and \newlabel's left out, in its order */
export declare function citationLines(aux: string | null | undefined): string
/** the marked original as the run and the rule read it: the lines of its last pass that are read, its marks, its citations and labels, its bibliography */
export declare function readingsOf(o: { log?: string; aux?: string | null; bbl?: string | null }, marks: import('./typeset/places.mjs').Marks): Readings
