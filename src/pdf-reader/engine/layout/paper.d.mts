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
}

/** the layout guard's record (layout/guard.mjs, markedOfPaper), where it did anything: the compiles it asked past the marked
 *  original's (`extra`, GUARD_EXTRA at most, the unmarked original's among them), the units left the paper's own, whether
 *  the babel names stayed marked, the checks the marked original failed ('braces' before its compile; 'ran', 'pages', 'aux',
 *  'errors' after), and why a check was left as it stood (`judged`) */
export interface GuardRecord { extra: number; unmarked: number[]; names: boolean; failed: ('braces' | 'ran' | 'pages' | 'aux' | 'errors')[]; judged?: string }
/** why a paper's marked original is refused: its probe (no log); TeX's own ('compile': the paper's own source does not make
 *  arXiv's pages here, a host's limit, a compile that threw, or a fault nothing told the guard was ours; 'texlive', as
 *  'compile' with the paper declaring another TeX Live year than the box's; 'engine', a compiler the host does not run or
 *  that ran no TeX); ours ('marks': the unmarked original makes the pages and the marked one, mended as the guard could,
 *  does not) */
export type MarkedRefusal = 'probe' | 'compile' | 'texlive' | 'engine' | 'marks'

/**
 * a paper's marked original: layoutMarksOfPaper's probe and marked compile without the reading (stages 1 and 2), for a host
 * that reads it elsewhere (layerOfPaper's `marked: { doc, log, options }`, a page at a time): the marked compile's PDF, its
 * last pass's log (lastTexLog), and readMarked's options but the units and the operator codes. `ms` times the probe and the
 * compile (and the guard's compiles, `guard`, where it asked any); a stage that fails gives { refused, why } (MarkedRefusal;
 * `why` with every refusal but the probe's), with `cm` where CM ran and `guard` where the guard did anything. The marked
 * original must be the paper (paper.mjs markedOfPaper's comment, layout/guard.mjs). Never throws
 */
export declare function markedOfPaper(paper: Paper, o: MarkedCompileOptions): Promise<
  | { pdf: Uint8Array; log: string; options: Omit<MarkedOptions, 'units' | 'OPS'>; ms: { probe: number; compile: number; guard?: number }; cm?: ConvergeRecord; guard?: GuardRecord }
  | { refused: MarkedRefusal; why?: string; ms: Record<string, number>; cm?: ConvergeRecord; guard?: GuardRecord }
>

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
 * (a native TeX Live and PDF.js in Node, the TeX page and a worker in a browser): this module imports neither. Never throws.
 * Without `converge` (the default), the original is one compile with every pass (`rerun`). With it (CM), the unmarked
 * original (originalFiles(paper, { lines: true })) is compiled in one or two drafts (`draft`, `files`), then the marked
 * original one pass at a time (`files`) in the files the passes before returned (in place of the paper's own, never of
 * the pass's), until a pass writes the bytes it was given or five TeX passes have run; `ms.compile` is all of them, `cm`
 * their record. A pass that returns no `files`, a draft that did not run through (a timeout too), a bibliography job beside the
 * main one's or a missing .bib gets today's compile; a marked pass that did not run through, or a compile that throws, is the compile's refusal
 */
export declare function layoutMarksOfPaper(paper: Paper, o: MarkedCompileOptions & {
  open(pdf: Uint8Array): Promise<{ doc: unknown; close(): Promise<void> }>
  OPS: Record<string, number>
}): Promise<{ marks: LayoutMarks; unitMarks: UnitMarks | null; ms: { probe: number; compile: number; marks: number; guard?: number }; cm?: ConvergeRecord; guard?: GuardRecord } | { refused: MarkedRefusal; why?: string; ms: Record<string, number>; cm?: ConvergeRecord; guard?: GuardRecord }>
