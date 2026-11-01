// links.mjs's types: the links of a laid page (3a; the contract is reader.d.mts `LinkRecord`)
import type { LinkRecord } from './reader.mjs'
import type { Line, LineRun, Token } from './layer2.mjs'

/** the schemes a record's `url` may have */
export declare const LINK_SCHEMES: readonly string[]
/** whether `url` is one a record may carry */
export declare function urlAllowed(url: unknown): boolean
/** a page's annotations as PDF.js reports them, or null: a throw, a rejection, a page with no such call, a reply that is no list. Never rejects */
export declare function readAnnots(page: unknown): Promise<unknown[] | null>
/** glyph points as parallel columns; the engine's characters' carry their key on the page (`item|k`) */
export interface GlyphPoints { x: number[]; y: number[]; ch: string[]; key?: string[] }
/** the glyph points of a page's text items: each non-space character's advance centre on its baseline (PDF.js's rule) */
export declare function pointsOf(items: readonly unknown[] | null | undefined): GlyphPoints
/** the most Link annotations read on a page, the most glyph points one may hold, and the freeze's budget of point-against-operation tests */
export declare const MAX_LINKS: number
export declare const MAX_GLYPHS: number
export declare const WORK_MAX: number
/** how far a browser's advances may part from the layout's, as a share of the distance from a run's start (a range starting
 *  deeper than half its first character's width allows is not placed) */
export declare const DRIFT_BOUND: number
/** the advance centres of the engine's characters on their baselines (pageChars2's), non-space only, each with its key */
export declare function charPoints(chars: readonly { ch: string; x0: number; x1: number; yb: number; item?: number; k?: number }[] | null | undefined): GlyphPoints
/** a Link annotation a reader can carry, as the page keeps it until it is final */
export interface Annot {
  i: number
  rect: number[]
  boxes: number[][]
  dest?: string | unknown[]
  url?: string
  /** PDF.js's overlaid text, white space collapsed */
  ov: string
  border: { width: number; rgb: number[]; style: 'solid' | 'dashed' | 'underline' } | null
  /** the glyph points inside it: the text items cut into characters of equal advance (the gate's instrument's), and the engine's characters' */
  g: GlyphPoints
  g2: GlyphPoints
  unsupported?: undefined
}
/** one a reader cannot carry */
export interface Unsupported { i: number; unsupported: true }
/** a page's Link annotations, in PDF.js's order (`i` the rank among them), with the counts of those carried and those not */
export declare function annotsOf(raw: readonly unknown[] | null | undefined, points: GlyphPoints, points2?: GlyphPoints | null): { list: (Annot | Unsupported)[]; total: number; unsupported: number }
/** whether a point (device pixels) lies where the operations left the paper erased */
export declare function erasedOf(ops: readonly unknown[] | null | undefined): (x: number, y: number) => boolean
/** a unit with lines on a page, as ownership reads it: its rectangles [page, x0, y0, x1, y1], and those its growth left on each
 *  page where it has grown (run.mjs) */
export interface OwnerUnit { id: number; stream: number; rects: readonly (readonly number[])[] | null; grown?: ReadonlyMap<number, readonly (readonly number[])[]>; grownRects?: ReadonlyMap<number, readonly (readonly number[])[]> }
/** the owner of each annotation of page q (its index in `ranked`, by annotation `i`): the first unit in order whose rectangles
 *  hold more than half of its points; `stop`, the last index looked at; `budget`, the tests it may spend; `skipped`, given, takes
 *  the `i` of each annotation the budget left unread */
export declare function ownersOf(list: readonly (Annot | Unsupported)[] | null | undefined, ranked: readonly Pick<OwnerUnit, 'rects' | 'grown' | 'grownRects'>[], q: number, o?: { stop?: number; budget?: { left: number }; skipped?: Set<number> | null }): Map<number, number>
/** the record of an annotation left over the original's ink (`order` set when the list is ranked). Its `name` is text from the
 *  PDF, which may hold control and bidirectional characters: a view sets it as text, never as markup */
export declare function inPlaceOf(a: Annot): LinkRecord
/** the attribution of a record: its source annotations [page, i] and the tier that made it ('geometry', 'key', 'url', 'order', 'whole'
 *  for a moved record, 'place' for one in place) */
export interface LinkSource { annots: [number, number][]; tier: string }
/** the annotations of page q unit `u` owns: of the units with lines on q in their growth rank there, the first whose rectangles
 *  hold more than half of an annotation's points (`before`: those ranked before u); `budget`: the tests it may spend; `skipped`,
 *  given, takes the `i` of each annotation the budget left unread */
export declare function ownedIn(list: readonly (Annot | Unsupported)[] | null | undefined, u: Pick<OwnerUnit, 'rects' | 'grown' | 'grownRects'>, before: readonly Pick<OwnerUnit, 'rects' | 'grown' | 'grownRects'>[], q: number, budget?: { left: number }, skipped?: Set<number> | null): Annot[]
/** what an annotation points to, as the match tells its kinds apart */
export declare function kindOfAnnot(a: Annot): 'url' | 'cite' | 'note' | 'internal'
/** a URL as the match compares two: TeX's escapes undone, the WHATWG parser's form; null where it is none */
export declare function urlOf(arg: unknown): string | null
/** the link a unit's piece may carry, by its source */
export declare function linkKindOf(piece: { t: string; src?: string } | null | undefined): { kind: 'cite'; keys: string[] } | { kind: 'url'; url: string } | { kind: 'internal'; name?: string } | { kind: 'note' } | null
/** whether a piece's source names one link target alone (a citation of one key, a url, a reference to one label, a mark) */
export declare function singleTarget(piece: { t: string; src?: string } | null | undefined, kind: ReturnType<typeof linkKindOf>): boolean
/** a piece of a unit a link may be matched to: a placeholder (its index `k`) or a link pair (its open's id), in the source's order */
export interface LinkTarget {
  /** its piece's index in the unit's source (never the translation's place), or null where unknown */
  ord: number | null
  k?: number
  pair?: number
  kind: 'cite' | 'url' | 'internal' | 'note' | null
  keys?: string[]
  url?: string
  /** a `\hyperlink`'s destination */
  name?: string
  /** its source names one target alone */
  single?: boolean
  /** the page characters its rendering took, by key `page|item|k` */
  gap: ReadonlySet<string> | null
  /** its segments in TeX's file: [page, x0, baseline, x1, top, bottom] */
  segs: readonly (readonly number[])[] | null
  /** how it is drawn: as text in the page's face, as a crop, as a pair's tokens, as the unit's whole drawing, or not (kept,
   *  nothing, not drawn) */
  draw: 'text' | 'crop' | 'pair' | 'whole' | null
  /** the whole drawing's: the unit's own characters the drawing replaces, by key `page|item|k`, and where each stands */
  own?: readonly { key: string; page: number; x0: number; x1: number; yb: number }[]
}
/** an annotation a unit owns, on its page */
export interface LinkCandidate { q: number; a: Annot }
/** a unit's annotations matched to its pieces: geometry, key, url, order, only certain matches made */
export declare function matchUnit(o: { cands: readonly LinkCandidate[]; targets: readonly LinkTarget[]; budget?: { left: number } }): { groups: { to: LinkTarget; annots: (LinkCandidate & { tier: string })[] }[]; tried: { q: number; i: number; why: 'ambiguous' | 'unplaced' }[] }
/** a laid line as placeUnit reads it: the line and its runs (layer2.mjs lineRuns) */
export interface PlacedLine { line: Line; runs: (LineRun | { crop: number })[] }
/** the records a unit's matched annotations make, in PDF units from the layout's own numbers */
export declare function placeUnit(o: {
  groups: { to: LinkTarget; annots: (LinkCandidate & { tier: string })[] }[]
  lines: readonly PlacedLine[]
  edge: (line: Line, run: LineRun, at: number) => number
  band: (t: Token, line: Line) => { top: number; bottom: number }
  scale: number
  budget?: { left: number }
}): { records: { page: number; li: number; x: number; rec: LinkRecord; sources: LinkSource }[]; tried: { q: number; i: number; why: 'unplaced' }[] }
/** a page's links once it is final: the annotations no unit took and none of whose points is erased, in place; any other dropped and counted by reason; sorted and ranked */
export declare function freezeLinks(o: {
  list: readonly (Annot | Unsupported)[] | null
  q: number
  ops: readonly unknown[] | null | undefined
  devOf: (x: number, y: number) => [number, number]
  units: readonly OwnerUnit[]
  consumed?: ReadonlySet<number> | null
  why?: ReadonlyMap<number, 'ambiguous' | 'unplaced'> | null
  moved?: readonly { rec: LinkRecord; stream?: number; id?: number; seq?: number; sources?: LinkSource }[]
  sources?: boolean
}): { records: LinkRecord[]; sources: LinkSource[] | null; inPlace: number; moved: number; dropped: { unmatched: number; ambiguous: number; unplaced: number } }
/** a copy of a page's kept links, none of its objects the record's */
export declare function copyLinks(records: readonly LinkRecord[] | null | undefined): LinkRecord[]
