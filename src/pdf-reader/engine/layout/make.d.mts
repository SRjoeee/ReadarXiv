// make.mjs's types (JavaScript until the engine's port), for the container's prepare and the maker's tests
import type { SourceUnit } from '../latex-front.mjs'
import type { LayoutFile } from './file.mjs'
import type { LayoutMarks } from './marks.mjs'

export interface MakeInput {
  /** the paper's (openPaper(files).units), ids their indices */
  units: readonly SourceUnit[]
  /** of the marked original, made with the classes the marks file was made with */
  marks: LayoutMarks
  /** a PDF.js document of arXiv's PDF; the caller opens and destroys it */
  arxiv: unknown
  OPS: Record<string, number>
  paper: { id: string; version: number }
  left: string
  pdfjs: string
}
export interface LayoutStats {
  lines: { carried: number; total: number }
  /** `unplaced`: the units arXiv's text would place whose own marks were not carried there (they stay the original's) */
  units: { located: number; total: number; byKind: Record<string, [located: number, total: number]>; unplaced: number }
  /** `marked`: the placeholders of the located units the marked original marks (an opening mark at least), by kind
   *  found among them; `unmarked`: those it gives no mark (LOST, beside them); `inferred`: those found whose end is
   *  inferred, having no closing mark; `why`: the LOST among them by cause */
  ph: { marked: number; found: number; empty: number; lost: number; byKind: Record<string, [found: number, marked: number]>; unmarked: number; inferred: number; why: Record<string, number> }
  /** by the unit's kind: the units with a label, of the located units whose start mark was carried to their first line */
  labels: Record<string, [found: number, units: number]>
  frames: { units: number; split: number; lineCountChecked: number; lineCountEqual: number }
  /** |baseline − TeX's start or end mark|, pt */
  baselines: { first: number[]; last: number[] }
  /** pages past OPS_CAP */
  capped: number[]
  /** pages whose operator list did not come within OPS_MS, or after the paper's OPS_PAPER_MS, or failed: no ink */
  timedOut: number[]
  /** pages whose lines cost the carry more than its bound (carry.mjs `over`): no ink */
  over: number[]
  bytes: { raw: number; gzip: number }
  ms: { text: number; ops: number; carry: number; anchor: number; rows: number }
  /** why the file was refused, where it was ('bounds': the parser's refusal) */
  refusal?: { path: string; why: string }
}
/** a paper's layout file, or why none is made */
export declare function makeLayout(o: MakeInput): Promise<{ file: LayoutFile; stats: LayoutStats } | { refused: 'carry' | 'pages' | 'bounds'; stats: LayoutStats }>
/** the share of the marked original's lines that must be carried, else no file */
export declare const CARRY_MIN: number
/** a page's operator list waited for at most, ms; and a paper's in all */
export declare const OPS_MS: number
export declare const OPS_PAPER_MS: number
/** a font's PostScript name as the file holds it: 1 to 128 printable ASCII characters */
export declare function fontName(name: unknown): string
