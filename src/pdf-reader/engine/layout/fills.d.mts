// fills.mjs's types (JavaScript until the engine's port), for the maker's draw, the reader's page and their tests
import type { Glyph } from './ink.mjs'
/** an item, or a character, whose fill is not told */
export declare const UNKNOWN: -1
/** an item's fills: its every character's fill (0xRRGGBB, or UNKNOWN), or runs [offset, fill, offset, fill, …] by code point */
export type ItemFills = number | number[]
/** a text item as itemFills reads it: PDF.js's text content item, or a draw's row read as one */
export interface FillItem { str: string; transform: readonly number[]; width: number; height: number }
/** each item's fills from the page's glyphs (pageInk's; null or none: every item UNKNOWN), in order */
export declare function itemFills(items: readonly FillItem[], glyphs: readonly Pick<Glyph, 'u' | 'x0' | 'x1' | 'y' | 'size' | 'fill'>[] | null): ItemFills[]
/** whether `v` is an item's fills as itemFills writes them, for a string of `n` code points */
export declare function isItemFills(v: unknown, n: number): v is ItemFills
/** each code point's fill, for a string of `n` code points */
export declare function fillsByChar(v: ItemFills | null | undefined, n: number): number[]
