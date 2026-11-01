// stream.mjs's types (JavaScript until the engine's port), for the marks file and its tests
import type { InkPoint, PackedGlyphs } from './ink.mjs'

/** how a piece's ink was found, or why none was: the first OWNED are owned */
export declare const OWNED_HOW: readonly string[]
export declare const OWNED: number
/** the glyph columns ownedOf reads of a page, and the owned rows after it */
export declare const STREAM_COLUMNS: readonly ['x0', 'y', 'size', 'u']
/** a page's glyphs as ownedOf reads them: packGlyphs' columns STREAM_COLUMNS (more may be there) */
export type StreamGlyphs = Pick<PackedGlyphs, 'n' | 'x0' | 'y' | 'size' | 'u'>
/** the characters of the text after an opening point alone that it is found by */
export declare const WANT: number
/** a page of the marked compile as pageInk read it, its glyphs packed in stream order (packGlyphs), with its view (x0,
 *  y0, x1, y1) */
export interface StreamPage { glyphs: StreamGlyphs; boxes: number[]; points: InkPoint[]; boxAt: ArrayLike<number>; view: number[] }
/** what the marking says of a piece with an opening point: `closing`, it has a closing mark; `want`, the first WANT
 *  characters of the text after it in its unit (NFKC, lower case, no white space), '' for none; `ends`, the names of
 *  its unit's next marks (the next marked piece's opening mark, the unit's end marks); `blocked`, a visible piece with no
 *  mark follows it with no text between; `through` (the erasure's), past such pieces with nothing but white space between,
 *  the next marked piece's opening mark, else null; `rest`, the whole text after it up to its next visible piece as spellOf
 *  reads it; `display`, the piece is a display; `group`, a display's display group: the opening marks' names of the displays
 *  right after it with nothing visible between that have no opening point (the text after it and its next piece then
 *  the last one's) */
/** `moved` (marks.mjs followsOf): the punctuation mark that opens the text after a piece whose command may set it before its own
 *  ink, which a closed piece's first glyph then is and is not its own.
 *  `split` (marks.mjs followsOf): the one unmarked piece after a paper's macro, by its opening mark's name, the text the probe
 *  showed the macro sets, by which the maker's reading parts their ink to `through`, and where text follows the piece that text
 *  as an opening's (`want`, `rest`) and the points that may end it (`ends`) */
export interface Follow { closing: boolean; want: string; rest?: string; display?: boolean; ends: string[]; blocked: boolean; through?: string | null; group?: string[]; split?: { name: string; text: string; want?: string; rest?: string; ends?: string[] }; moved?: string }
/** a text's letters and digits, without their accents, lower case: the per-unit erasure's evidence that ink is a text's */
export declare function spellOf(s: string): string
export interface Owned { how: number; glyphs: [page: number, index: number][]; boxes: [page: number, index: number][] }
/** a display a unit opens with, which the marking passes over (marks.mjs headsOf), by its unit's start mark: the opening mark's
 *  name it would have had, and its display group's later displays' (none of them a point) */
export interface Head { name: string; group: string[] }
/** each piece's own glyphs and rules in the marked compile, by its opening point's name; `heads(start)` the display a unit opens
 *  with, by its start mark's name, found between the point before that mark and the mark */
export declare function ownedOf(pages: readonly StreamPage[], o: { follows: (name: string) => Follow | null; dropped?: readonly string[]; erasure?: boolean; heads?: ((start: string) => Head | null) | null }): Map<string, Owned>
/** ownedOf a page at a time: the pages added in order (`add`), each piece found once every page it may read is in (`take`,
 *  over the window held: `pages[p - 1]` page p), the rest at `end`; `twice()` the point names read more than once (the
 *  caller's 'a mark set twice'). `closing(name)`: the page of an opening point's piece's closing destination, or null */
export declare function ownedPages(o: { follows: (name: string) => Follow | null; dropped?: readonly string[]; closing?: (name: string) => number | null; heads?: ((start: string) => Head | null) | null }): {
  add(p: number, page: StreamPage, take: (name: string, e: Owned, pages: readonly StreamPage[]) => void): void
  end(take: (name: string, e: Owned, pages: readonly StreamPage[]) => void): void
  twice(): Set<string>
  /** the point names read a second time since this was last asked */
  repeats(): string[]
  /** the least page an opening point still to be found stands on (one past the last page added where none is) */
  found(): number
}
