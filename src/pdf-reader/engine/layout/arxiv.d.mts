// arxiv.mjs's types: arXiv's text read once (the prepare's step T), for the left, the layout maker and the highlight's layout
import type { DocToken } from '../pipeline/anchors.mjs'
import type { DrawText } from '../pipeline/draw-data.mjs'

export interface ArxivText {
  /** the document's pages */
  pages: number
  /** each page's view as PDF.js gives it, null where the page could not be had */
  views: (readonly number[] | null)[]
  /** each page and its text read (where not, its text is none) */
  ok: boolean[]
  /** tokenizeDocument's of every page, in page order, their items let go (`item` null) */
  tokens: DocToken[]
  /** each token's ink across (inkEdges), made while the items were there */
  edges: { l: Float32Array; r: Float32Array }
  /** each token's item's start and end across (NaN with none) */
  spans: { x0: Float64Array; x1: Float64Array }
  /** with `draw` asked, each page's text as its draw reads it (drawTextOf; null where not read), taken by the layout maker a page at
   *  a time and let go; else null */
  draw: (DrawText | null)[] | null
}
/** every page's view and text read once (`draw`: and kept as the draw geometry reads it); the caller opens and destroys the document */
export declare function readArxivText(doc: { numPages: number; getPage(n: number): Promise<unknown> }, o?: { draw?: boolean }): Promise<ArxivText>
