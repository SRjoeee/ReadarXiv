// stream.mjs's types (JavaScript until the engine's port), for the marks file and its tests
import type { Glyph, InkPoint } from './ink.mjs'

/** how a piece's ink was found, or why none was: the first OWNED are owned */
export declare const OWNED_HOW: readonly string[]
export declare const OWNED: number
/** the characters of the text after an opening point alone that it is found by */
export declare const WANT: number
/** a page of the marked compile as pageInk read it, with its view (x0, y0, x1, y1) */
export interface StreamPage { glyphs: Glyph[]; boxes: number[]; points: InkPoint[]; boxAt: number[]; view: number[] }
/** what the marking says of a piece with an opening point: `closing`, it has a closing mark; `want`, the first WANT
 *  characters of the text after it in its unit (NFKC, lower case, no white space), '' for none; `ends`, the names of
 *  its unit's next marks (the next marked piece's opening mark, the unit's end marks); `blocked`, a visible piece with no
 *  mark follows it with no text between */
export interface Follow { closing: boolean; want: string; ends: string[]; blocked: boolean }
export interface Owned { how: number; glyphs: [page: number, index: number][]; boxes: [page: number, index: number][] }
/** each piece's own glyphs and rules in the marked compile, by its opening point's name */
export declare function ownedOf(pages: readonly StreamPage[], o: { follows: (name: string) => Follow | null; dropped?: readonly string[] }): Map<string, Owned>
