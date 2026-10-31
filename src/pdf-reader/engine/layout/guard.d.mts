// guard.mjs's types: the layout guard's checks of a marked original (markedOfPaper's), for its tests
import type { PdfLike } from './base.mjs'
import type { Compiled, Paper } from '../pipeline/live.mjs'
import type { UnitLines } from '../pipeline/tex-errors.mjs'

/** a text's `{` less its `}`, outside comments, \verb and verbatim environments, a control symbol taken as a symbol */
export declare function braceBalance(text: string): number
/** before the marked compile: the units whose writing changes their file's brace balance (each unit's rendering against its
 *  source, the innermost), and whether a file's balance moved by more than its units explain (`other`); `skip` the main
 *  file's head of ours */
export declare function unbalancedUnits(paper: Paper, files: Map<string, Uint8Array>, lines: UnitLines<unknown>[], skip?: number): { units: Set<number>; other: boolean }
/** the marks of ours a file TeX wrote holds where no text is set (outside a list entry's text and a label's title), by
 *  their argument as written */
export declare function marksOutOfPlace(text: string): string[]
/** the units those marks name, in the files a compile returned (`files`), else its main aux (`aux`), ids below `count` */
export declare function auxUnits(c: Compiled | null | undefined, count: number, job: string): Set<number>
/** the units the mark probe's errors stand at where TeX read the marked preamble: an error on a line from `first` to `last` whose
 *  text holds a mark of ours names its unit, ids below `count` */
export declare function preambleUnits(log: string | null | undefined, count: number, range: { first: number; last: number }): Set<number>
/** whether a compile's last pass wrote its PDF itself, so that its log names every destination of ours set twice */
export declare const tellsTwice: (log: string | null | undefined) => boolean
/** auxUnits' units judged by what TeX did with each: none where the compile is otherwise the paper's and its log tells twice */
export declare const copiesOutOfPlace: (units: Set<number>, o: { clean: boolean; log: string | null | undefined }) => Set<number>
/** the TeX errors of a compile's last pass */
export declare const errorCount: (log: string | null | undefined) => number
/** the pages the last pass wrote, as TeX says, else null */
export declare const pagesOfLog: (log: string | null | undefined) => number | null
/** the TeX Live year of the engine's banner, else null */
export declare const texLiveOf: (log: string | null | undefined) => string | null
/** the TeX Live year of the build arXiv's PDF says: the `PTEX.Fullbanner` of the Info dictionary PDF.js resolves, else null */
export declare const texLiveOfPdf: (doc: PdfLike) => Promise<string | null>
export declare const compilerOfPdf: (doc: PdfLike) => Promise<'latex' | 'pdflatex' | 'xelatex' | 'lualatex' | null>
/** whether TeX ran: its banner in the log */
export declare const texRan: (log: string | null | undefined) => boolean
/** the host's limit a compile met, else null */
export declare const limitOf: (c: (Compiled & { limit?: string }) | null | undefined) => string | null
/** a compile's first TeX error, with the line it names */
export declare function firstError(log: string | null | undefined): string | null
/** the unmarked original's errors, by identity (message, and the text around its place, our marks taken out) */
export declare const ownErrors: (log: string | null | undefined) => Set<string>
/** the units a marked compile's errors stand in, less the paper's own (`own`), and those at the line TeX ignored all text after */
export declare function errorUnits(paper: Paper, log: string | null | undefined, files: Map<string, Uint8Array>, lines: UnitLines<unknown>[], own?: Set<string> | null): Set<number>
/** the unmarked original's files: the main one with graphicx's draft and END_TEX on one line before its first */
export declare const unmarkedFiles: (paper: Paper) => Map<string, Uint8Array>
