// figure-rows.mjs's types: the figure units a part carries (BUNDLE 10; its set and room since 11)
import type { FigureUnit } from '../layout/figure-text.mjs'

/** a row: [id, group, page, x, y, ux, uy, length, size, ascent, descent, anchor, fill, font, set, before, after] */
export type FigureRowWire = [number, number, number, number, number, number, number, number, number, number, number, number, number, string, number, number, number]
/** a figure row as a part's reader gives it */
export interface FigureRow { id: number; group: string; page: number; x: number; y: number; ux: number; uy: number; length: number; size: number; ascent: number; descent: number; anchor: 'start' | 'centre' | 'end'; fill: number; font: string; /** its set's first group (`f<k>`): the units fitted at one size */ set: string; /** its room before and after its box, PDF units */ before: number; after: number }
export declare const FIGURE_ROW: number
export declare const FIGURE_ROW_10: number
export declare const ANCHORS: readonly ['start', 'centre', 'end']
export declare const FONT_NAME_MAX: number
/** a unit's band's ascent and descent at most, em */
export declare const BAND_MAX: number
export declare function figureGroupOf(k: number): string
export declare function figureRow(id: number, u: Pick<FigureUnit, 'group' | 'page' | 'x' | 'y' | 'ux' | 'uy' | 'length' | 'size' | 'ascent' | 'descent' | 'anchor' | 'fill' | 'font'> & Partial<Pick<FigureUnit, 'set' | 'before' | 'after'>>): FigureRowWire
export declare function checkFigures(rows: unknown, o: { a: number; b: number; views: readonly number[]; unitCount: number; format?: string | null }): readonly FigureRow[]
/** whether a figure unit's run is level, read left to right: its words in the text layer, its original anchored on the left */
export declare const levelRun: (ux: number, uy: number) => boolean
