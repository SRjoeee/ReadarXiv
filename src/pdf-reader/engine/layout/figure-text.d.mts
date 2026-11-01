// figure-text.mjs's types: the text inside a vector figure of our final pass, cut into ink units (the content class `figures`)

/** a figure's ink unit: its text our glyphs', its place its run's (its first glyph's origin, along its direction, up across it) */
export interface FigureUnit {
  k: number
  page: number
  /** its optional-content group, `f<k>` */
  group: string
  text: string
  font: string
  size: number
  /** 0xRRGGBB, or -1 for a fill of no colour */
  fill: number
  /** degrees anticlockwise from the page's x */
  angle: number
  x: number
  y: number
  ux: number
  uy: number
  /** its box along its direction, PDF units */
  length: number
  /** its band, em: at least the line a translation is drawn in (DRAW_BAND) */
  ascent: number
  descent: number
  anchor: 'start' | 'centre' | 'end'
  /** its set's first unit's k: the units of one column or one baseline of one figure, fitted at one size (figure-fit.mjs) */
  set: number
  /** its room: the free line before its box's start and after its end along its direction, PDF units */
  before: number
  after: number
  /** shown inside a form XObject (an included PDF's) */
  form: boolean
  /** why it is not drawn, or null */
  why: FigureWhy | null
}
export type FigureWhy = 'crowded' | 'unicode' | 'shared' | 'page' | 'bounds'
export declare const RUN_DY: number
export declare const RUN_GAP: number
export declare const SPACE_GAP: number
export declare const ANCHOR_REACH: number
export declare const DRAW_BAND: readonly [number, number]
export declare const ALIGN_TOL: number
/** a level unit's column: the text lines within this many of its sizes above and below its baseline (columnAnchorOf) */
export declare const COLUMN_REACH: number
export declare const ROOM_MAX: number
export declare const ROOM_CLEAR: number
export declare const FIGURE_UNITS_PAGE: number
export declare const FIGURE_UNITS_DOC: number
export declare const FIGURE_TEXT_MAX: number
export declare const FIGURE_WHYS: readonly FigureWhy[]
export declare function figureGroup(k: number): string
/** the figure units of a document: each unit, and by page which glyph (level, and turned) is whose */
export declare function figureUnitsOf(pages: readonly object[], own: { glyphs: readonly (readonly (string | null)[])[] } | null, o?: { unitsPage?: number; unitsDoc?: number }): { units: FigureUnit[]; glyphs: Map<number, number>[]; turned: Map<number, number>[]; stats: { units: number; crowded: number; letters: number; runs: number; past: number; clipped: number; outsized: number; sets: number; grouped: number; aligned: number } }
