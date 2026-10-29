// shapes.mjs's types (JavaScript until the engine's port): the highlight's shapes on the shared reader view's panes
import type { ReadLeftPart } from '../layer-proto/format.mjs'
import type { Box, Float, Paths } from './floats.mjs'
import type { Layout, PageTable, PartRects, Run } from './highlight.mjs'

/** a rectangle on one of a pane's pages, in its PDF units */
export interface PageBox { page: number; x0: number; y0: number; x1: number; y1: number }
/** what a pane paints for the highlight, in its own pages' coordinates (the shapes seam, lighting.mjs's): a unit's runs
 *  (the objects the paint keeps what it drew by; a table's cell no unit holds by its id, units.mjs tableCellId), a run's
 *  block, a sentence's shape by the unit's starts, whether a unit's shapes hold its words by its starts (undefined where
 *  that is not to be told in a frame), what a point lights and what a click there levels by. No float is painted (the
 *  owner, 2026-10-30: docs/PDF-READER.md §17.1) */
export interface Shapes<R extends { page: number } = { page: number }> {
  runs(id: number): readonly R[]
  block(run: R, padX: number): PageBox
  sentence(run: R, starts: Int32Array, s: number, padX: number): PageBox[]
  fits(id: number, starts: Int32Array, now: boolean): boolean | undefined
  hit(page: number, x: number, y: number, padX: number, startsOf: (id: number) => Int32Array | null | undefined): { id: number; s: number } | null
  click(page: number, x: number, y: number, padX: number, startsOf: (id: number) => Int32Array | null | undefined): { id: number; line: number; f: number } | null
}
/** a left part as a page's part of a layout: the side's token ids from `first`; each unit's tokens, and its words beside
 *  the tokens they were matched to */
export interface LeftPageInput {
  page: number; first: number; table: PageTable
  spans: [id: number, tokens: Int32Array][]
  pairs: [id: number, words: Int32Array, tokens: Int32Array][]
}
/** a side's shapes made page by page from the layer's wire */
export interface SideShapes {
  readonly layout: Layout
  readonly shapes: Shapes<Run>
  /** the document part as the parts come (format.mjs ReadPart), in page order */
  addParts(parts: readonly PartRects[]): void
  /** a page's left part (the door's leftPageOf); false where it was in already or is refused, malformed or overlapping
   *  another page's ids (one warning a page) */
  addPage(left: Pick<ReadLeftPart, 'page' | 'first' | 'table' | 'spans' | 'pairs'>): boolean
  /** a page's left part refused: no shapes there, one warning a page; a later one is taken */
  refuse(page: number, error: unknown): void
  has(page: number): boolean
  /** a page out of the view's window: its geometry, floats and their inputs let go (made again on its next use, the
   *  floats once its drawing gives their inputs again) */
  forget(page: number): void
  /** a unit's sentence starts on the left by its plain source and its row's `sentences.src`, once every page it is on
   *  has come; null where it lights whole */
  starts(id: number, text: string, offsets: readonly number[] | undefined): Int32Array | null
  /** a page's floats from its drawing's figures and paths: made now where its part is in, else on its first use, and
   *  again on its first use after the document part moves; inputs that throw are let go, one warning */
  floats(page: number, regions?: Box[], paths?: Partial<Paths>): void
}
/** the right's shapes, the left's mirrored over copies of its own */
export interface MirroredShapes { readonly layout: Layout; readonly shapes: Shapes<Run>; forget(page: number): void; dispose(): void }

/** a laid page's words as the right's shapes read them (the door's PageWords) */
export interface LaidWords {
  tokens: PageTable
  word: Int32Array
  /** each token's place in the translation (the door's PageWords.at): a token with no word takes its sentence from it; a
   *  table without it gives its units no starts (they light whole) */
  at?: Int32Array
  spans: readonly (readonly [number, readonly number[]])[]
  original: readonly number[]
}
/** the right's shapes on the layer: the left's mirrored where its place shows the original, its own over a laid page's words */
export interface LayerShapes {
  readonly layout: Layout
  readonly shapes: Shapes<Run>
  /** a laid page's words (once a door): its part made once its left part is in; false where it was given already */
  lay(page: number, words: LaidWords): boolean
  laid(page: number): boolean
  /** a page whose place shows the original again (laid already, or its part still waiting for its left part): the mirror's
   *  there until `show`; whether its shapes changed */
  hide(page: number): boolean
  show(page: number): boolean
  /** a page that shows another target's layer (`on`), none of whose geometry the laid layout or the mirror holds: nothing of it
   *  lit or hit until it is unmuted, whatever reset() does; whether that changed anything */
  mute(page: number, on: boolean): boolean
  /** the pages muted, rising */
  muted(): number[]
  /** a unit's starts on the right: its words' where it is all on laid pages, `left` where it is on none, null else */
  starts(id: number, text: string, offsets: readonly number[] | undefined, left: Int32Array | null): Int32Array | null
  /** every page back to the mirror (a door opened again) */
  reset(): void
  forget(page: number): void
  dispose(): void
}
export declare function layerShapes(source: SideShapes): LayerShapes
export declare function pdfShapes(layout: Layout): Shapes<Run>
/** a unit's starts from its pairs (anchors.mjs sentenceStarts), each paired token's sentence by its word: the left's on the layer
 *  and a layout made whole alike */
export declare function startsOfPairs(anchor: { tokens: readonly number[]; pairs?: ReadonlyMap<number, number>; bounded?: boolean; coverage?: number } | null | undefined, text: string, offsets: readonly number[] | undefined): Int32Array | null
export declare function leftPageInput(left: Pick<ReadLeftPart, 'page' | 'first' | 'table' | 'spans' | 'pairs'>): LeftPageInput
export declare function createShapes(o?: { kindOf?: (id: number) => string | undefined; warn?: (what: string, error: unknown) => void }): SideShapes
export declare function mirror(source: SideShapes): MirroredShapes
