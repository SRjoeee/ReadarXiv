// A document's ink as the back half of the prepare reads it: each page's glyphs in content-stream order as pageInk places
// them (the wrap's options: indices, every painted glyph), each with the character code and the font PDF.js read it by, its
// painted boxes (rules, images) in stream order with their kinds, and the page's points. Made by read.ts from a PDF, or by a
// test by hand: align, locate and the wrap's plan read nothing else of a PDF.

export interface DocGlyph {
  /** its Unicode, as PDF.js reads it */
  u: string
  /** the character code PDF.js read it by (originalCharCode), -1 where it gives none */
  code: number
  /** its font's name (pageInk's `font`) and that name with a subset's tag off (ABCDEF+): the font's base name */
  font: string
  base: string
  x0: number
  x1: number
  y: number
  top: number
  bottom: number
  size: number
  ix0: number
  ix1: number
  /** its show's place among the page's own shows (-1 in an annotation's appearance) and its place in that show */
  n: number
  k: number
  /** shown inside a form XObject */
  form: boolean
  /** its Unicode is blank (no ink by its text: not by its outline, which a blank Unicode can have, CMEX's bar) */
  blank: boolean
  /** its fill, 0xRRGGBB, -1 none */
  fill: number
  /** with `turned`: the form it is painted in, the picture it is set in */
  fid?: number | undefined
  pid?: number | undefined
  clipped?: true | undefined
  unseen?: true | undefined
  /** its Unicode is no reading of it (A17, today's `nu`): no character of its font's own map, or none Unicode stands for; read
   *  where the document was read `mapped` */
  nu?: true | undefined
}

/** a point of a marked compile (`/axt-<name> ri`): its name, and the glyphs and boxes the page showed before it */
export interface DocPoint {
  name: string
  glyph: number
  box: number
}

/** a glyph set turned (pageInk's `turned`: a figure's y-axis title, arXiv's margin stamp), which no line of the page holds:
 *  its Unicode and code, its font's base name, its show and place there, the level glyphs before it in the stream (`at`), its
 *  baseline from its origin to its advance's end, its direction, size, and its font's band in em */
export interface DocTurned {
  u: string
  code: number
  base: string
  n: number
  k: number
  at: number
  ox: number
  oy: number
  ex: number
  ey: number
  ux: number
  uy: number
  size: number
  ascent: number
  descent: number
  form: boolean
}

export interface DocPage {
  glyphs: DocGlyph[]
  /** the glyphs set turned, in stream order (none where the page was read without `turned`) */
  turned?: DocTurned[]
  /** every painted box, x0, y0, x1, y1 a box, in stream order */
  boxes: number[]
  /** each box's kind (pageInk's `paths`): a path by its constructPath's index (≥ 0), an image -3, an annotation -1, a
   *  shading -2, a turned glyph's -4, a merged box -5 */
  kinds: number[]
  /** each glyph's boxes before it */
  boxAt: number[]
  points: DocPoint[]
  view: [number, number, number, number]
  rotate: number
  /** why the page's ink is not read whole (rotated, capped, timedOut, degraded), null where it is */
  unread: string | null
}

export interface Doc {
  pages: DocPage[]
}

/** a box's kind in `kinds`: a path, an image */
export const IMAGE_BOX = -3
export const isPath = (kind: number): boolean => kind >= 0
export const isImage = (kind: number): boolean => kind === IMAGE_BOX
