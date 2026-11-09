// A page's glyphs as readPdf makes them (read.ts docPageOf): each glyph's eight coordinates in its page's one Float64Array, in the
// order x0, x1, y, top, bottom, size, ix0, ix1, read by getters, and every other field its own. A coordinate held as a field of
// its own is a heap number of 16 bytes, eight a glyph and every copy of a glyph boxing its own: 180 MiB of a 163-page paper's two
// Docs (lane L9 §2), which the array holds in 64 bytes a glyph. The readers' `g.x0` is unchanged; no reader writes, spreads or
// enumerates a glyph's coordinates, and one that makes a glyph with a field changed makes it by glyphWith, never a spread (which
// copies a page glyph's own fields alone, and so none of its coordinates). A Doc a test builds by hand holds plain glyphs, which
// every reader takes alike.
import type { DocGlyph } from './doc.ts'

/** a glyph of a page read by readPdf: its coordinates in `c` from `i` */
export class PageGlyph implements DocGlyph {
  readonly c: Float64Array
  readonly i: number
  u: string
  code: number
  font: string
  base: string
  n: number
  k: number
  form: boolean
  blank: boolean
  fill: number
  fid: number | undefined
  pid: number | undefined
  clipped: true | undefined
  unseen: true | undefined
  nu?: true
  along?: number
  constructor(
    c: Float64Array,
    i: number,
    g: Omit<DocGlyph, 'x0' | 'x1' | 'y' | 'top' | 'bottom' | 'size' | 'ix0' | 'ix1'>,
  ) {
    this.c = c
    this.i = i
    this.u = g.u
    this.code = g.code
    this.font = g.font
    this.base = g.base
    this.n = g.n
    this.k = g.k
    this.form = g.form
    this.blank = g.blank
    this.fill = g.fill
    this.fid = g.fid
    this.pid = g.pid
    this.clipped = g.clipped
    this.unseen = g.unseen
    if (g.nu) this.nu = true
    if (g.along !== undefined) this.along = g.along
  }
  get x0(): number {
    return this.c[this.i] as number
  }
  get x1(): number {
    return this.c[this.i + 1] as number
  }
  get y(): number {
    return this.c[this.i + 2] as number
  }
  get top(): number {
    return this.c[this.i + 3] as number
  }
  get bottom(): number {
    return this.c[this.i + 4] as number
  }
  get size(): number {
    return this.c[this.i + 5] as number
  }
  get ix0(): number {
    return this.c[this.i + 6] as number
  }
  get ix1(): number {
    return this.c[this.i + 7] as number
  }
}

/** a page's glyphs from glyphs of any kind, their coordinates in one array of the page's (readPdf's; a test's) */
export function pageGlyphsOf(list: readonly DocGlyph[]): PageGlyph[] {
  const c = new Float64Array(8 * list.length)
  return list.map((g, j) => {
    const o = 8 * j
    c[o] = g.x0
    c[o + 1] = g.x1
    c[o + 2] = g.y
    c[o + 3] = g.top
    c[o + 4] = g.bottom
    c[o + 5] = g.size
    c[o + 6] = g.ix0
    c[o + 7] = g.ix1
    return new PageGlyph(c, o, g)
  })
}

/** a glyph with fields other than its coordinates changed, of its own kind: a page glyph keeps its page's array (a spread would
 *  copy its own fields alone), a plain glyph is its spread */
export function glyphWith<G extends DocGlyph>(
  g: G,
  patch: Partial<Omit<DocGlyph, 'x0' | 'x1' | 'y' | 'top' | 'bottom' | 'size' | 'ix0' | 'ix1'>>,
): G {
  return Object.assign(Object.create(Object.getPrototypeOf(g)) as G, g, patch)
}
