// B's pages as the instrument reads them: pageInk's reading of each page of the marked compile (lane L1's readPdf
// `pages[i].raw`), the fields the ownership reads.

export interface PageGlyph {
  u?: string
  x0: number
  x1: number
  y: number
  size: number
  /** its ink's extent where it reaches past its advance (an italic's overhang), and its top and bottom */
  ix0?: number
  ix1?: number
  top?: number
  bottom?: number
}
export interface PagePoint {
  name: string
  /** the glyphs and the boxes shown before it on its page */
  glyph: number
  box: number
}
export interface PageRead {
  glyphs: readonly PageGlyph[]
  /** four numbers a box: x0, y0, x1, y1 */
  boxes: ArrayLike<number>
  /** each box's painted path's index, or its kind where it is none (< 0: an image -3, a form's, a merged cell's) */
  paths?: ArrayLike<number>
  /** each glyph's count of boxes shown before it */
  boxAt?: ArrayLike<number>
  points: readonly PagePoint[]
  /** TeX's paragraph points (q<n>) and ends (qe<n>) */
  paras?: readonly PagePoint[]
  paraEnds?: readonly { glyph: number }[]
  view?: readonly number[]
}
/** a glyph's text as the stream reads it (stream.mjs charOf): NFKC, lower case, no white space, no variation selector */
export const charOf = (u: string): string =>
  u
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s|\p{Variation_Selector}/gu, '')
/** pageInk's kind of an image's box (layout/ink.mjs) */
export const IMAGE_BOX = -3
