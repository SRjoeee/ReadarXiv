// arxiv.mjs's types: arXiv's text read once (the prepare's step T), for the left, the layout maker and the highlight's layout
import type { DocToken } from '../pipeline/anchors.mjs'

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
}
/** every page's view and text read once; the caller opens and destroys the document */
export declare function readArxivText(doc: { numPages: number; getPage(n: number): Promise<unknown> }): Promise<ArxivText>
