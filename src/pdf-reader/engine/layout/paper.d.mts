// paper.mjs's types: a paper's layout marks in one call, for the server's prepare child, the extension's reader and the layer gate's maker
import type { Compiled, CompileRequest, Paper } from '../pipeline/live.mjs'
import type { LayoutMarks, MarkedOptions, UnitMarks } from './marks.mjs'

/** CM's record (converge then mark): the unmarked original's draft passes, the marked original's passes, whether the
 *  last marked pass wrote the files it was given (else the bound of five TeX passes was reached and its PDF kept), and
 *  why today's compile was asked instead, where it was: a host that returned no files, a draft that did not run
 *  through, a bibliography job beside the main one's (aux-jobs), a .bib the project lacks (bib-missing), or files to carry past the host's bound (files-bound, treated like an absent `files`). Pass counts enter no key and no file */
export interface ConvergeRecord { drafts: number; marked: number; settled: boolean; fallback?: 'no-files' | 'draft-failed' | 'aux-jobs' | 'bib-missing' | 'files-bound' }

/** markedOfPaper's and layoutMarksOfPaper's compile options: the host's compile and CM's bounds */
export interface MarkedCompileOptions {
  compile(req: CompileRequest): Promise<Compiled>
  converge?: boolean
  /** with `converge`: the host's compile budget for the paper, in ms of its wall (each answer's `ms`, else the time the
   *  compile took) across the probe and the passes; a bet (the second draft, a marked pass after the first) is not
   *  started with less left than 1.2 times the longest pass so far. Absent: unlimited */
  compileBudgetMs?: number | null
  /** with `converge`: the host's bound on the files of one compile, { count, bytes } (the web's 256 and 8 MiB). The files CM carries
   *  back accumulate across passes: before each pass that would carry them (carried + the previous pass's returned, the pass's
   *  own overrides aside) they are held to it, and past it today's compile is asked (`files-bound`). Absent: unlimited */
  filesBound?: { count: number; bytes: number } | null
  /** not read here (readMarked's, the host's): taken so that layoutMarksOfPaper's options may be passed as they are */
  OPS?: Record<string, number>
  /** the layout guard's: arXiv's page count, or a function asked once for it (a promise of it too); absent, null or not a
   *  page count: the page check is the page pass's alone */
  pages?: number | (() => number | null | Promise<number | null>) | null
  /** the guard's: the compilers the host runs; a paper of another is refused before any compile ('engine') */
  engines?: readonly string[] | null
  /** the TeX Live years the host compiled the paper's own source on before this box's tree, in order ('2023'); TeX's refusal
   *  names each before the box's year ("on TeX Live 2023 or 2025") and is 'texlive' only where the paper declares a year none
   *  of them is. Absent, null or empty: the box's year alone, the whys as before */
  tried?: readonly string[] | null
  /** the base page (layer route step 2, default true): every marked compile asks for the files it wrote (`files`), and once
   *  one stands the final pass is made over them (the result's `base`). false: no final pass, and no `base` */
  final?: boolean
  /** the day every compile after the probe is made on, seconds since the epoch (CompileRequest `sourceDate`; arXiv's PDF's
   *  day, its /CreationDate or else its XMP's: base.mjs creationEpochOf), or a function asked once for it after the probe. Absent, null, or not such a
   *  number: the host's clock */
  sourceDate?: number | (() => number | null | Promise<number | null>) | null
  /** each page's text of a compile's PDF (its text items' strings joined: base.mjs pageTextOf), or null where it cannot be
   *  read: no mark of ours may stand as text on a marked original's pages (design §3.3.2, the guard's 'text'). Absent: not
   *  checked here (the page pass checks the base page's own text) */
  textOf?: ((pdf: Uint8Array) => Promise<string[] | null>) | null
  /** the compiler arXiv's PDF says made it (guard.mjs compilerOfPdf), asked once before the probe where the package names none
   *  (`paper.meta.compilerGuessed`): `latex`, `pdflatex`, `xelatex` or `lualatex` becomes the paper's compiler (`meta.compiler`,
   *  `compilerFrom` 'pdf'); null, another word, or a failure leaves the guess. Absent: the guess stands */
  compilerOf?: (() => Promise<string | null>) | null
}
/** the final pass of the marked original (markedOfPaper `base`): its PDF and its log (lastTexLog), or why there is none
 *  ('final': no files of the compile that stands, no compile left in the budget, a pass that did not run through) */
/** the host's limit or the compile budget a refusal was caused by (limitOf's name, or 'budget'): the one kind of refusal that
 *  may be transient (format.mjs baseRefusalRetryable); absent on every other */
export type RefusalLimit = string
export type FinalPass = { pdf: Uint8Array; log: string } | { refused: 'final'; why: string; limit?: RefusalLimit }

/** the unmarked original's verdict, which a refusal after its compile names (`own`): whether it ran through (live.mjs
 *  ranThrough, with a PDF); whether it did with fewer pages than arXiv's (`pages` given, a paper of one toplevel source);
 *  the host's limit it met ('time', 'memory': the web's `limit`), else null; the TeX Live year its engine's banner names
 *  ('2025'), null where TeX never ran or the compile threw. What handoverOf reads */
export interface OwnVerdict { ran: boolean; short: boolean; limit: string | null; tree: string | null }

/** the layout guard's record (layout/guard.mjs, markedOfPaper), where it did anything: the compiles it asked past the marked
 *  original's (`extra`, GUARD_EXTRA at most, the unmarked original's among them), the units left the paper's own, whether
 *  the babel names stayed marked, the checks the marked original failed ('braces' before its compile; 'ran', 'pages', 'aux',
 *  'errors' after), and why a check was left as it stood (`judged`) */
export interface GuardRecord { extra: number; unmarked: number[]; names: boolean; failed: ('braces' | 'ran' | 'pages' | 'aux' | 'text' | 'errors')[]; judged?: string }
/** why a paper's marked original is refused: its probe (no log); TeX's own ('compile': the paper's own source does not make
 *  arXiv's pages here, a host's limit, a compile that threw or ran no TeX, or a fault nothing told the guard was ours;
 *  'texlive', as 'compile' with the paper declaring another TeX Live year than the box's; 'engine', a compiler the host does
 *  not run, as `engines` or its answer ("unknown engine") names it); ours ('marks': the unmarked original makes the pages and the marked one, mended as the guard could,
 *  does not) */
export type MarkedRefusal = 'probe' | 'compile' | 'texlive' | 'engine' | 'marks'

/**
 * a paper's marked original: layoutMarksOfPaper's probe and marked compile without the reading (stages 1 and 2), for a host
 * that reads it elsewhere (layerOfPaper's `marked: { doc, log, options }`, a page at a time): the marked compile's PDF, its
 * last pass's log (lastTexLog), and readMarked's options but the units and the operator codes. `ms` times the probe and the
 * compile (and the guard's compiles, `guard`, where it asked any); a stage that fails gives { refused, why } (MarkedRefusal;
 * `why` with every refusal but the probe's), with `cm` where CM ran, `guard` where the guard did anything, and `own` where
 * the unmarked original was compiled (OwnVerdict). The marked original must be the paper (paper.mjs markedOfPaper's comment,
 * layout/guard.mjs). Never throws, but a failed allocation (pipeline/memory.mjs isMemoryError: the run's, never the
 * paper's), which goes on as itself
 */
export declare function markedOfPaper(paper: Paper, o: MarkedCompileOptions): Promise<
  | { pdf: Uint8Array; log: string; options: Omit<MarkedOptions, 'units' | 'OPS'>; ms: { probe: number; compile: number; guard?: number; final?: number }; cm?: ConvergeRecord; guard?: GuardRecord; base?: FinalPass }
  | { refused: MarkedRefusal; why?: string; limit?: RefusalLimit; own?: OwnVerdict; ms: Record<string, number>; cm?: ConvergeRecord; guard?: GuardRecord }
>

/** why madeBibliography made no entries (paper.mjs madeBibliography's comment) */
export type BibliographyKept = 'shipped' | 'none' | 'biblatex' | 'bib-missing' | 'engine' | 'compile' | 'no-files' | 'aux-jobs' | 'biber' | 'no-bbl' | 'moved'
/**
 * The bibliography BibTeX makes of a paper that ships none (PDF-READER §19.13): one draft pass of the unmarked original with
 * BibTeX, its files asked, and the paper opened again with the job's .bbl it wrote (`made`, its path and bytes, which the
 * host's every later compile and every opening of the paper must hold as the package's own file), its entries units after
 * every other, every other unit and name the bundle's byte for byte as before; else why not (`kept`) and the paper as it was.
 * `ms`, the call's wall. Never throws, but a failed allocation
 */
/** why madeBibliography would make no .bbl of a paper before any compile, or null where it asks its pass */
export declare function bibliographyKept(paper: Paper): Extract<BibliographyKept, 'shipped' | 'none' | 'biblatex' | 'bib-missing'> | null
export declare function madeBibliography(paper: Paper, o: { compile(req: CompileRequest): Promise<Compiled>; compilerOf?: (() => Promise<string | null>) | null; engines?: readonly string[] | null }): Promise<
  | { paper: Paper; made: { path: string; bytes: Uint8Array }; ms: number }
  | { kept: BibliographyKept; ms: number }
>

/**
 * The host's handover to another TeX Live tree, over a refusal's `own` (the TL2023 plan §2.3): the year of the tree to
 * compile the paper on next, or null. Where TeX failed on the paper's own source (it did not run through, or ran through
 * with fewer pages than arXiv's: `pages` must be given for that) and no host's limit stopped it: another of `served` (the
 * paper's `declared` year where it is one of them, else the first in `served`'s order), unless this tree is the host's
 * `last`. Never on no verdict (the unmarked original not compiled: a refusal before it, or ours with nothing told), ours
 * (it made the pages here), a host's limit, or a verdict with no year (TeX never ran, the compile threw: the host's own
 * failure, retried on the same tree)
 */
export declare function handoverOf(own: OwnVerdict | null | undefined, o: { declared?: string | null; served: readonly string[]; last?: boolean }): string | null

/**
 * a paper's layout marks: the mark probe compiled (probeFiles(paper, { marks: true }), one pass) and its answers read
 * (readMarkProbe, readInkProbe, readInkTexts), then the layout-marked original compiled (originalFiles(paper, { lines:
 * true, layout: LAYOUT_CLASSES, switches, inkless })) and read once (readMarked over a document of its PDF and its last
 * pass's log, with the units and OPS): `marks` in memory, as the maker takes them (marksFile writes them as the lab's file, or refuses where they pass the file's bounds),
 * and `unitMarks`, the unit marks the left is anchored by (null: by its text alone). `ms` times each stage. A stage that fails
 * gives { refused } naming it, with the times of the stages that ran: the probe where its compile gave no log, the
 * compile where the original's gave no PDF or did not run through (live.mjs ranThrough: stopped short, or its last pass
 * short of AXT-END; today's compile and CM's fallback alike), the marks where `open` or the reading failed. `open` is called once, on the
 * original's PDF, and its `close` is called whatever the reading did. The compile and the PDF opening are the caller's
 * (a native TeX Live and PDF.js in Node, the TeX page and a worker in a browser): this module imports neither. Never throws but a failed allocation, as markedOfPaper.
 * Without `converge` (the default), the original is one compile with every pass (`rerun`). With it (CM), the unmarked
 * original (originalFiles(paper, { lines: true, transcode: false })) is compiled in one or two drafts (`draft`, `files`), then the marked
 * original one pass at a time (`files`) in the files the passes before returned (in place of the paper's own, never of
 * the pass's), until a pass writes the bytes it was given or five TeX passes have run; `ms.compile` is all of them, `cm`
 * their record. A pass that returns no `files`, a draft that did not run through (a timeout too), a bibliography job beside the
 * main one's or a missing .bib gets today's compile; a marked pass that did not run through, or a compile that throws, is the compile's refusal
 */
export declare function layoutMarksOfPaper(paper: Paper, o: MarkedCompileOptions & {
  open(pdf: Uint8Array): Promise<{ doc: unknown; close(): Promise<void> }>
  OPS: Record<string, number>
}): Promise<{ marks: LayoutMarks; unitMarks: UnitMarks | null; ms: { probe: number; compile: number; marks: number; guard?: number; final?: number }; cm?: ConvergeRecord; guard?: GuardRecord; base?: { pdf: Uint8Array; log: string; check: { marks: number } } | { refused: 'final'; why: string; limit?: RefusalLimit } } | { refused: MarkedRefusal; why?: string; limit?: RefusalLimit; own?: OwnVerdict; ms: Record<string, number>; cm?: ConvergeRecord; guard?: GuardRecord }>
