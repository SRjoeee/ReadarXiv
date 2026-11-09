// The types of ink.mjs (today's pageInk, moved as it is, JavaScript until its port): what its declarations stated, now a
// TypeScript module of the package (the packages hold no declaration files), each value of ink.mjs re-exported with its type.
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as ink from './ink.mjs'

/** a glyph as PDF.js's canvas places it: its character, its advance across (x0, x1) and baseline, size and the font's
 *  PostScript name (its subset tag kept: the font table strips it); `top` and `bottom` its own ink up and down, `ix0` and
 *  `ix1` across, where PDF.js gives its outline (outlineBox), else its font's declared ascent and descent and its advance */
export interface Glyph {
  u: string
  x0: number
  x1: number
  y: number
  top: number
  bottom: number
  size: number
  font: string
  ix0: number
  ix1: number
  /** its fill colour, 0xRRGGBB (black 0), or NO_FILL for none (a pattern's, a transparent one); none given, NO_FILL */
  fill?: number
  /** a Type 3 glyph whose procedure paints its own colours (d0, a fill in it): `fill` no reading of its ink */
  ownColour?: boolean
  /** with `indices`: its text-showing operation's place among the page's own (-1 in an annotation's appearance), its
   *  place among that operation's glyphs, whether its Unicode is blank, and whether it is shown inside a form XObject */
  n?: number
  k?: number
  blank?: boolean
  form?: boolean
  /** with `turned` (the figures' reading): not wholly inside the clip in force (`clipped`); nothing of it shown (`unseen`: wholly
   *  outside the clip, or painted at an alpha of 0) */
  clipped?: true
  unseen?: true
}
/** a glyph's fill of no colour (a pattern's, PDF.js's transparent) */
export const NO_FILL = ink.NO_FILL as -1
/** a glyph's outline box in em from its origin ([x0, y0, x1, y1], y up), [] for none drawn, null where PDF.js gives none */
export const outlineBox = ink.outlineBox as (commonObjs: unknown, font: unknown, fontChar: unknown) => number[] | null
/** the operations read on a page at most: past it the page is capped */
export const OPS_CAP = ink.OPS_CAP as number
/** the glyphs a page's ink holds at most where its reader asks (`glyphsMax`): past it the page is capped */
export const GLYPHS_PAGE = ink.GLYPHS_PAGE as number
/** the boxes a page's ink holds at most, whatever its reader (an operation's many: a repeat's or a group's placements, a run of
 *  glyphs set turned): past it the page is capped; above the budget a dense page's boxes are merged under (BOXES_PAGE) */
export const BOXES_CAP = ink.BOXES_CAP as number
/** the steps a page's walk takes at most (`stepsMax`'s default): past it the page is capped */
export const STEPS_MAX = ink.STEPS_MAX as number
/** the boxes a page's ink keeps one by one at most where its reader asks (`boxesMax`): past it the page is degraded */
export const BOXES_PAGE = ink.BOXES_PAGE as number
/** the graphics state's levels that hold a copy at most: past it a level holds none, and ink placed in a state a restore
 *  past it could not give back caps the page */
export const STACK_MAX = ink.STACK_MAX as number
/** a merged box's kind in `paths` (a degraded page's): no path of the page's own */
export const MERGED = ink.MERGED as number
/** a point of the marked compile (`/axt-<name> ri`): its name, and the glyphs and boxes the page showed before it */
export interface InkPoint {
  name: string
  glyph: number
  box: number
}
/** a page's glyphs and graphics boxes (images, paths: x0, y0, x1, y1) from its operator list, in stream order, every
 *  painted glyph whatever its Unicode; the marked compile's points among them, and each glyph's boxes before it; `capped`
 *  when the walk stopped at OPS_CAP, `stepsMax`, a state lost past STACK_MAX, `glyphsMax` or BOXES_CAP, `timedOut` when it stopped past `msMax`
 *  (a wait a reader asks: none by default, no clock read); `degraded` when the boxes past `boxesMax` were merged by the grid's cells (after the others, from `mergedAt`,
 *  each MERGED in `paths`); `rotated` when the page's /Rotate is not 0 (then nothing is returned) */
/** a paragraph's point (`q<n>`), kept apart from the marks' points */
export const PARA_POINT = ink.PARA_POINT as RegExp
export const PARA_END = ink.PARA_END as RegExp
/** a line TeX set in a region of a kind (regionsOfPoints): its glyphs from `from` up to `to`, stream order */
export interface InkRegion {
  kind: string
  from: number
  to: number
}
export const REGION_POINT = ink.REGION_POINT as RegExp
export const REGION_POINT_KINDS = ink.REGION_POINT_KINDS as Readonly<Record<string, string>>
export const regionsOfPoints = ink.regionsOfPoints as (
  points: readonly { name: string; glyph: number }[],
  glyphCount: number,
) => InkRegion[]
export const regionMask = ink.regionMask as (
  regions: readonly InkRegion[] | null | undefined,
  n: number,
  kind: string,
) => Uint8Array
/** what pageInk returns for a page */
export type PageInk = {
  glyphs: Glyph[]
  boxes: number[]
  points: InkPoint[]
  boxAt: number[]
  paras: InkPoint[]
  paraEnds?: (InkPoint & { point: number; para: number })[]
  regions: InkRegion[]
  paths?: number[]
  shows?: number
  turned?: TurnedGlyph[]
  shapes?: Map<number, Shape>
  pictures?: InkPoint[]
  figures?: Map<string, [number, number, number, number]>
  unseen?: Set<number>
  cut?: Map<number, [number, number, number, number]>
  capped: boolean
  timedOut: boolean
  degraded: boolean
  mergedAt: number | null
  rotated: boolean
}
export const pageInk = ink.pageInk as (
  OPS: Record<string, number>,
  ops: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
  commonObjs: { get(id: string): unknown },
  o: {
    rotate: number
    indices?: boolean
    outlines?: ReadonlyMap<string, number[]> | null
    collect?: Map<string, number[]> | null
    glyphsMax?: number
    boxesMax?: number
    stepsMax?: number
    msMax?: number
    glyphsOnly?: boolean
    turned?: boolean
    /** with `turned`: every painted path's lines (`shapes`), not a figure's alone */
    shapesAll?: boolean
    /** the reader's own table across its pages, each font's name by its object: read once a document (none: once a page) */
    names?: Map<unknown, string> | null
  },
) => PageInk
/** a glyph set turned (pageInk's `turned`): its baseline from its origin to its advance's end, its direction, its size, its
 *  font's band in em, its own ink up and down from its baseline in em (`up`, `down`: its outline's, else its font's band), its
 *  box's index (-1 for none), the level glyphs and the pictures' points before it; `clipped` where its own ink (its outline,
 *  else its font's band, across its advance) is not wholly inside the clip in force; `unseen` where nothing of it is shown (that ink
 *  wholly outside the clip, or painted at an alpha of 0) */
export interface TurnedGlyph {
  u: string
  n: number
  k: number
  ox: number
  oy: number
  ex: number
  ey: number
  ux: number
  uy: number
  size: number
  ascent: number
  descent: number
  up: number
  down: number
  font: string
  fill: number
  box: number
  at: number
  pt: number
  blank?: true
  form?: true
  clipped?: true
  unseen?: true
  fid?: number
  pid?: number
}
/** a figure's painted path as its lines (pageInk's `turned`): its segments on the page (x0, y0, x1, y1 stride 4), whether it strokes
 *  and fills, its half line width on the page, whether its fill is a tiling pattern's (`pattern`) and whether it covers what was
 *  painted under it (`opaque`: a colour at an alpha of 1, under no blend mode but Normal and no soft mask) */
export interface Shape {
  segs: Float32Array
  stroke: boolean
  fill: boolean
  hw: number
  pattern?: true
  opaque?: true
}
/** a TikZ picture's points (marks.mjs POINTS_TEX) */
export const PICTURE_START = ink.PICTURE_START as 'zs'
export const PICTURE_END = ink.PICTURE_END as 'ze'
/** why a page's ink is not read whole: nothing read, past a cap, past the walk's backstop; null where it is read whole */
export type Unread = 'rotated' | 'capped' | 'timedOut'
export const unreadOf = ink.unreadOf as (
  ink: { rotated?: boolean; capped?: boolean; timedOut?: boolean } | null | undefined,
) => Unread | null
/** a page's glyphs packed as columns (packGlyphs): the i-th of each the glyph `order[i]` (each in its own place where no
 *  order is given); `ix0` and `ix1` its ink across with its advance; `font` the id `fontIds` gives (-1 where none is
 *  asked); `most` the largest size */
export interface PackedGlyphs {
  n: number
  x0: Float64Array
  x1: Float64Array
  y: Float64Array
  top: Float64Array
  bottom: Float64Array
  ix0: Float64Array
  ix1: Float64Array
  size: Float64Array
  font: Int32Array
  u: string[]
  fill: Int32Array
  most: number
}
/** a column packGlyphs may keep */
export type GlyphColumn = 'x0' | 'x1' | 'y' | 'top' | 'bottom' | 'ix0' | 'ix1' | 'size' | 'font' | 'u' | 'fill'
/** every column packGlyphs may keep, its default */
export const GLYPH_COLUMNS = ink.GLYPH_COLUMNS as readonly GlyphColumn[]
type PackOptions = { order?: readonly number[] | null; fontIds?: ((font: string) => number) | null }
/** pageInk's glyphs as the columns a reading keeps past its page: every column, or those asked for */
/** a glyph's key in an outline table: its font's PostScript name, its character and its advance */
export const outlineKey = ink.outlineKey as (
  font: unknown,
  fontId: string,
  g: { fontChar?: unknown; unicode?: unknown; width?: unknown },
) => string
/** the outline boxes collected (pageInk's `collect`) as the reader is sent them, in thousandths of an em, by font */
export const outlineTable = ink.outlineTable as (
  collected: ReadonlyMap<string, number[]>,
) => Record<string, (string | number)[]>
/** an outline table back to the Map pageInk's `outlines` takes */
export const readOutlines = ink.readOutlines as (
  table: Record<string, (string | number)[]> | null | undefined,
) => Map<string, number[]>

export const packGlyphs = ink.packGlyphs as {
  (glyphs: readonly Glyph[], o?: PackOptions & { columns?: undefined }): PackedGlyphs
  <K extends GlyphColumn>(
    glyphs: readonly Glyph[],
    o: PackOptions & { columns: readonly K[] },
  ): Pick<PackedGlyphs, 'n' | 'most' | K>
}
