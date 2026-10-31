// live.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { inMemory, SourceUnit } from '../source/latex-front.mjs'
import type { analyze } from '../source/paper-meta.mjs'
import type { Strategy } from './scripts.mjs'
import type { Typeset } from './typeset/tex.mjs'
import type { Readings } from './cache.mjs'
import type { TrPiece } from '../layer/pieces.mjs'

/** a paper's files (path → bytes) → what the pipeline works on */
/** `inFloat`: the indices in `units` (rising) of the units written inside a float (latex-front.mjs loadProject's); `texOrder`: the
 *  indices in `units` in the order TeX sets them, where it is not theirs, else null (loadProject's) */
export interface Paper { fsys: ReturnType<typeof inMemory>; meta: ReturnType<typeof analyze>; project: { main: string; units: SourceUnit[]; inFloat: number[]; /** the bibliographies \\bibliography reads, by the names it gives (latex-front.mjs) */ bibliography?: string[] }; units: SourceUnit[]; inFloat: number[]; texOrder?: number[] | null; kept: Set<SourceUnit>; /** the structural names its TeX prints that no package names in every target (source/paper-names.mjs): units of kind `name` in its bundle, after its source's */ names: string[] }
export declare function openPaper(files: Map<string, Uint8Array>): Paper
/** the translation so far, with unit marks, set by one of strategiesFor: the files that differ from the paper's */
/** `spans`, where given, gets `lines()`: each unit's lines and bytes in the files as written, worked out when asked */
export declare function translationFiles(paper: Paper, translated: Map<SourceUnit, unknown[]>, options: { strategy: Pick<Strategy, 'engine' | 'pre'> & Partial<Strategy>; fonts: unknown; draft?: boolean; aux?: string | null; bbl?: string | null; typeset?: Typeset | null; evenSpaces?: boolean; spans?: { lines?: () => import('./tex-errors.mjs').UnitLines<SourceUnit>[] } | null; note?: (event: string, data: unknown) => void }): Map<string, Uint8Array>
/** the reader's versions: the extraction's (what a unit is; versions.mjs's, which a copy is judged by) and the typesetting's */
export { PIPELINE_VERSION } from './versions.mjs'
/** the earlier pipelines whose copies carry their translations over into this one, unit by unit, with the test each
 *  translation's pieces must pass (cache.mjs copyReuse) */
export declare const PIPELINE_CARRIES: Record<string, (pieces: unknown[], unit?: { pieces: unknown[] } | null) => boolean>
export declare const TYPESETTING_VERSION: string
/** the definitions a paper's .bbl makes for itself before its first entry, which the mark probe sets first: its \\providecommand and
 *  \\newcommand (as a \\providecommand), its conditionals on an undefined name whole, its \\@ifundefined, its own \\def and \\let
 *  set only where the name is undefined; '' where none */
export declare function bblProvides(fsys: { list(): string[]; read(path: string): Uint8Array | null }, main: string): string
/** the font probe; with `width`, the width and size probes the typesetting rule measures the face by; with `marks` and
 *  `preamble` (markedPreamble's text), that preamble in place of the paper's own */
export declare function probeFiles(paper: Paper, options?: { width?: boolean; marks?: boolean; preamble?: string | null }): Map<string, Uint8Array>
/** the main file's preamble as the marked original writes it, for the mark probe, with its first and last lines in the probe's
 *  main file; null where no unit of the main file stands in its preamble */
export declare function markedPreamble(paper: Paper, options?: { complete?: Complete | null }): { text: string; first: number; last: number } | null
/** the original with unit marks; with `lines`, each unit's lines and the forced breaks in its log; `spans`, where
 *  given, gets `lines()`: each unit's lines and bytes in the files as written. `layout` null or absent: the bytes as at
 *  3cb5a733; else the units marked by layoutMarking (layout/marks.mjs) with those classes, and LAYOUT_TEX after MARK_DEF;
 *  `switches` (with `layout` only), the paper's own switch (readMarkProbe): marks off where TeX said they change what
 *  follows; `inkless` (with `layout` only), the macros TeX said set no ink (readInkProbe): no mark. The layout guard's
 *  remedies (with `layout` only, layout/guard.mjs): `unmarked`, unit indices each written as the paper's own bytes, with no
 *  mark; `names` false, no babel name marked. `spans` gets `skip` too: the main file's head of ours, in bytes. `transcode`
 *  (default: on without `layout`, off with it): a Latin-1 family file that is not UTF-8 written as UTF-8 (on, the live path's
 *  original as it was), or as the paper's own bytes under its own inputenc (off) */
export declare function originalFiles(paper: Paper, options?: { lines?: boolean; spans?: { lines?: () => import('./tex-errors.mjs').UnitLines<SourceUnit>[]; skip?: number } | null; layout?: readonly import('../layout/marks.mjs').MarkClass[] | null; switches?: import('../layout/marks.mjs').Switches | null; inkless?: readonly string[] | null; complete?: import('../layout/marks.mjs').Complete | null; apart?: readonly string[] | null; unmarked?: Iterable<number> | null; names?: boolean; pastBegin?: boolean; transcode?: boolean }): Map<string, Uint8Array>
/** the units a translation into `lang` leaves as they are */
export declare function keptFor(paper: Paper, lang: string): Set<SourceUnit>
/** whether a compile's last TeX pass stopped short of the document's end (a fatal error), whatever PDF it left: such a
 *  compile is one that failed */
/** graphicx's draft option, the first line of every marked original's main file: the final pass makes it an empty line */
export declare const DRAFT_OPTION: string
export declare const stoppedShort: (log: string | null | undefined) => boolean
/** whether a compile ran through, the one test of a compile's success: `ok`, and its last TeX pass neither stopped short
 *  (stoppedShort) nor ended before END_TEX's AXT-END (completeLog). Whether it gave a PDF is the caller's to ask */
export declare const ranThrough: (c: Compiled | null | undefined) => boolean
/** whether a pass set a contents list from nothing: one its aux writes whose file the pass did not find ("No file
 *  <job>.<ext>."); `main`, the project's main file */
export declare const listsMissing: (r: { log?: string | null; aux?: string | null }, main: string) => boolean
/** the files a compile's last pass looked for and did not find ("No file <name>.") */
export declare const notFound: (log: string | null | undefined) => Set<string>
/** a compile as the TeX page answers it. `passes`, the TeX passes it ran (no tool), where the host counts them. `files`,
 *  asked with the request's `files`, with `ok` only: every regular file (no link) the compile — its pass, the
 *  bibliography step, makeindex — wrote in the project, a rewrite of the same bytes too (never a deletion), by its path
 *  there, the last step's bytes, but its outputs and the tools' own logs (*.pdf *.xdv *.dvi *.log *.blg *.ilg *.glg
 *  *.fls *.synctex.gz *.fdb_latexmk); absent where the host does not return them, or past the host's bound (the web's:
 *  256 files, 8 MiB; CM holds the files it carries back, accumulated across its passes, to the same bound: `filesBound`, and past it treats them as absent). A draft (`draft`) is `ok` where TeX ran to its end of its own (no limit, no signal) and left a
 *  log, with no PDF. `aux` and `bbl` may be decoded lossily: the files' bytes are what a compile is given back */
export interface Compiled { ok: boolean; pdf?: Uint8Array | null; aux?: string | null; bbl?: string | null; log?: string; ms?: number; error?: string; network?: string[]; passes?: number; files?: Map<string, Uint8Array> }
/** a compile asked of the TeX page. `draft` (with `rerun` false): one pass that writes no output (pdflatex
 *  -draftmode, xelatex -no-pdf with no driver, lualatex --draftmode). `files`: the files the compile wrote, returned
 *  (Compiled `files`), and, on a one-pass request, makeindex (-o ./<job>.ind ./<job>.idx) after the bibliography step
 *  where the pass wrote ./<job>.idx. The bibliography step (`bibtex: true`) is biber only where THIS pass wrote ./<job>.bcf (a
 *  shipped or carried copy does not count), else BibTeX on ./<job>. A host that knows neither answers without `files`; the files a compile is given
 *  back come in `overrides`, as every other input does. `engine` is the paper's compiler (paper-meta.mjs): pdflatex,
 *  xelatex, lualatex, or `latex`, arXiv's DVI compiler — pdfTeX in DVI mode, its DVI made a PDF by dvipdfmx (never dvips and
 *  ps2pdf, arXiv's own: the marks are dvipdfmx's specials, latex-front.mjs DVI_MARK_DEF), every pass by latexmk's -pdfdvi
 *  with dvipdfmx as its dvipdf, a one-pass compile latex then dvipdfmx, a draft latex -draftmode */
export interface CompileRequest {
  main: string; engine: string; rerun: boolean; bibtex: boolean | null; overrides: Map<string, Uint8Array>; draft?: boolean; files?: boolean
  /** the compile's date, seconds since the epoch: the host sets SOURCE_DATE_EPOCH to it with FORCE_SOURCE_DATE=1, so that
   *  \today and the PDF's dates are that day's (arXiv's PDF's day, its /CreationDate or else its XMP's: layout/base.mjs creationEpochOf). Absent: the
   *  host's clock, as before */
  sourceDate?: number
}
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
/** what names a compile's floats and its generated headings, by babel's key (names.mjs) */
export type { Captions } from '../layout/names.mjs'
import type { Captions } from '../layout/names.mjs'
import type { Complete } from '../layout/marks.mjs'
/** the TeX that writes what names the floats and the headings to the log, at the document's end, in every compile of the translation */
export declare const CAPTIONS_PROBE: string
/** whether a compile named each float and each generated heading with the target's names, from its log; null with no such row */
export declare function captionsOf(log: string | null | undefined): Captions | null
/** an aux's citation lines: every closed line whose first argument is a key it cites, \citation's and \newlabel's left out, in its order */
export declare function citationLines(aux: string | null | undefined): string
/** the marked original as the run and the rule read it: the lines of its last pass that are read, its marks, its citations and labels, its bibliography */
export declare function readingsOf(o: { log?: string; aux?: string | null; bbl?: string | null }, marks: import('./typeset/places.mjs').Marks): Readings
