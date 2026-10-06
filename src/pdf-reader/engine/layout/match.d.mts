// match.mjs's types (JavaScript until the engine's port), for the layout maker
/** the glyph visits a paper's matching may cost */
export declare const MATCH_WORK: number
/** arXiv's ink of a page as the maker holds it, by baseline */
export interface MatchInk { n: number; x0: Float64Array; x1: Float64Array; y: Float64Array; size: Float64Array; u: string[]; taken: Uint8Array; boxes: number[][]; boxTaken: Uint8Array }
export interface Matched { glyphs: [page: number, index: number][]; boxes: [page: number, index: number][]; why?: undefined }
/** a paper's matcher: each piece's own glyphs and rules carried and matched on arXiv's page, every one, or why not */
export declare function matcherOf(o: { ink: (MatchInk | null)[]; carry: (page: number, x: number, y: number) => { page: number; x: number; y: number } | null }): {
  match(items: { page: number; x0: number; y: number; size: number; u: string }[], rules: { page: number; x0: number; y0: number; x1: number; y1: number }[], A: { page: number; x: number; y: number } | null, B: { page: number; x: number; y: number } | null): Matched | { why: string }
  stats: { same: number; recoded: number; loose: number; vote: number; rejected: number; work: number; over: number }
}
