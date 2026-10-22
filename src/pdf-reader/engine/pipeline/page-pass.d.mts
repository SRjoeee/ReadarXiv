// page-pass.mjs's types: a paper's layer made and told a part at a time, for the container's prepare
import type { PartRefusal } from '../layer-proto/cut.mjs'
import type { LayoutRefusalRecord, Written } from '../layer-proto/format.mjs'
import type { ArxivText } from '../layout/arxiv.mjs'
import type { AddonChainState, RemoverAnswer } from '../layout/chain.mjs'
import type { LayoutStats, PageStreamRules } from '../layout/make.mjs'
import type { LayoutMarks, MarkedOptions, UnitMarks } from '../layout/marks.mjs'
import type { OwnVerdict } from '../layout/paper.mjs'
import type { ColumnRule } from '../view/highlight.mjs'
import type { FrameRule } from './anchors.mjs'
import type { LeftSide } from './left-side.mjs'

/** what is told of a part: its pages, its layout kept ('kept'), none in the paper ('none') or refused for it, and the lines of its
 *  marked pages [carried, total] */
export interface PartNote { pages: [number, number]; layout: 'kept' | 'none' | PartRefusal; lines: [carried: number, total: number] }
export interface LayerOptions {
  paper: { id: string; version: number }
  /** openPaper's paper: its units (ids their indices) and those it keeps; `meta.toplevels`, its toplevel sources (00README's, else guessed):
   *  with several, a marked original of fewer pages than arXiv's PDF is compared with arXiv's first pages, not refused */
  source: { units: readonly { kind: string; pieces: unknown[] }[]; kept: ReadonlySet<unknown>; inFloat?: readonly number[]; meta?: { toplevels?: number } }
  /** layoutMarksOfPaper's result: the marks and the unit marks, or why there are none (or `marked`); marks of fewer pages than
   *  arXiv's PDF are none, the compile's refusal (`stats.layout` { refused: 'compile', why }), their unit marks with them. A
   *  refusal's `own` (the unmarked original's verdict) is kept in `stats.layout`, never in a part */
  marks?: { marks: LayoutMarks; unitMarks: UnitMarks | null } | { refused: string; why?: string; own?: OwnVerdict } | null
  /** the marked original to be read here instead (a PDF.js document of it, the caller's to open and destroy, its last pass's log,
   *  and readMarked's options but the units and the operator codes, this pass's): a page at a time beside arXiv's in the page
   *  stream (the default rules, or an oracle), else whole first (readMarked); its refusal is the marks' ('marks'), and one of
   *  fewer pages than arXiv's PDF is not read: the compile's refusal, as `marks` of fewer pages */
  marked?: { doc: unknown; log: string; options: Omit<MarkedOptions, 'units' | 'OPS'> } | null
  /** a PDF.js document of arXiv's PDF (the caller opens and destroys it: for the draw, with pdf-lite's LINK_TEXT_PIXELS and
   *  fontExtraProperties, where the layout is made over it), and its text as readArxivText read it (step T, with `{ draw }` as
   *  this pass's where the layout is made over it: else the draw reads each page's text again). With `ours`, the left's and the
   *  line check's alone */
  arxiv: { doc: unknown; text?: ArxivText | null }
  OPS: Record<string, number>
  pdfjs: string
  /** arXiv's PDF: its bytes, its digest and its startxref (BUNDLE 8; the head's `orig`, and its base on a fallback) */
  orig?: { bytes: number; sha256: string; xref: number } | null
  /** our base page (BUNDLE 8): the final pass of the marked original (layout/paper.mjs markedOfPaper `base`), a PDF.js document
   *  of it (the caller's to open and destroy, opened as arXiv's for the draw), its bytes, digest and startxref (the head's base,
   *  which the remover's tails continue: the host's remover edits this PDF), its text as readArxivText read it (else read here,
   *  with `{ draw }` as this pass's), and `check`, a host's word that its marks were checked against the draft's (base.mjs
   *  finalCheck: layoutMarksOfPaper's `base.check`), needed where the marks are given (`marks`) and not read here (`marked`,
   *  whose document the check reads). Null, or { refused, why } (no final pass): no base of ours, the paper's fallback ('final') */
  ours?: { doc: unknown; bytes: number; sha256: string; xref: number; text?: ArxivText | null; check?: { marks: number } | null } | { refused: string; why?: string } | null
  /** the TeX Live year our compile was made on ('2025'), else the marked original's log's (its banner) */
  tree?: string | null
  /** a host of BUNDLE 7's: arXiv's PDF as `orig` is, where neither `orig` nor `ours` is given: the layout made over it, as before */
  base?: { bytes: number; sha256: string; xref: number } | null
  image: string
  /** the remover's transport (layout/chain.mjs chainedAddon's `remove`), null for none: no part has an add-on */
  remove?: ((ask: { from: number; to: number; plans: Uint8Array }) => Promise<RemoverAnswer>) | null
  onHead?: ((head: Written, units: (Written & { from: number; to: number })[]) => void | Promise<void>) | null
  onLeft(left: Written & { page: number }): void | Promise<void>
  onPart(part: Written & { from: number; to: number; leftParts: (Written & { page: number })[] }, note: PartNote): void | Promise<void>
  /** each part judged as it is cut (the carry's share of its marked pages' lines, its reader's reading); default on */
  verdicts?: boolean
  /** the frame's rule both anchorings are placed under where rules.frame is 'units' (anchors.mjs pageFrame by default); not read
   *  under rule 1 (rules.frame 'tokens', the default), whose frame is arXiv's text's */
  frame?: FrameRule
  /** the left's far-push columns' rule where rules.columns is 'units' (view/highlight.mjs pageColumns by default); not read under
   *  rule 4 (rules.columns 'tokens', the default), whose columns are arXiv's text's */
  columns?: ColumnRule
  /** the page stream's rules (layout/make.mjs RULES), DEFAULT_RULES' each where not given (rules 1, 3 and 4: the page stream);
   *  WHOLE_RULES for next's whole run; a rule given there is taken over `frame` and `columns` */
  rules?: Partial<PageStreamRules> | null
  /** tests and the lab: a whole run's maker frame predicate and columns' edges (`capture`'s); the maker made a page at a time
   *  and each part cut as soon as what it reads is final (`stats.closed`) */
  oracle?: LayerOracle | null
  /** an object the whole run writes its maker frame predicate and columns' edges into: an oracle */
  capture?: Partial<LayerOracle> | null
  /** tests and the lab: the whole path, the whole made first, whatever the rules (under rules 1, 3 and 4, the default, the pass
   *  is a page stream by itself, its parts cut early) */
  whole?: boolean
  /** each page's draw geometry in its left part (E-C: layout/make.mjs `draw`, pipeline/draw-data.mjs), default on; off, every page ships
   *  none. Its links' overlaid text is the document's: opened with pdf-lite's LINK_TEXT_PIXELS, PDF.js's own; with NO_IMAGE_PIXELS, none */
  draw?: boolean
}
/** a whole run's rules (`capture`'s): the maker's frame predicate and columns' edges, and the left's frame predicate and its
 *  pages' columns (those two for the marked original read a page at a time) */
export interface LayerOracle { frame: (t: unknown) => boolean; columnEdges: Map<string, [number, number]>; leftFrame?: (t: unknown) => boolean; columns?: unknown }
/** why a part has no layout, as its record says it: the paper's refusal (the marked original's, the page count's, the maker's)
 *  or the part's own (a verdict's, a part's bound's), TeX's and the carry's as such, every fault of the engine's own `marks` */
export declare function layoutRecordOf(r: { refused?: string; why?: string; lines?: [number, number]; stats?: { lines?: { carried: number; total: number } } } | null | undefined): LayoutRefusalRecord | null
/** a paper's layer made and told part by part, or refused before anything is told (`anchors`); `toplevels` where the paper has
 *  several toplevel sources (its marked original's pages against arXiv's) */
export declare function layerOfPaper(o: LayerOptions): Promise<
  | { through: number; count: number; stats: { left: LeftSide['stats']; layout: { stats?: LayoutStats; refused?: string; why?: string; own?: OwnVerdict; plansFailed?: string }; plans: { pages: number; dirty: number } | null; addon: AddonChainState | null; draw?: { pages: number; none: number; why: Record<string, number>; bytes: number; ms: number; /** left parts whose draw the writer shed (for size, or with tokens past a cap) */ shed: number }; closed?: [from: number, to: number, read: number][]; toplevels?: { files: number; pages: [marked: number | null, arxiv: number] } } }
  | { refused: 'anchors'; why: string }
>
