// need.mjs's types: the rules for what laying the pages in order (needsOf) and one page alone (closureOf, Need(p)) wait for
/** one entry of the stream's K (the units v0 may place, by (slot, id)): the pages each of its sources would draw it on, and every
 *  page their lines are on; `rects` null where only the layout file holds the unit; `reads`, the pages of its placeholders'
 *  segments in the layout file ([] or absent where none); `group`, its table group (groups.mjs groupOf; null or absent where
 *  none); `id`, its unit, and `follows`, the id of the entry before it whose last row its first row continues on a shared
 *  line (rowLeadOf: its lay reads that one's; null or absent where none) */
export interface NeedEntry {
  lists: readonly (readonly number[])[]; reach: Iterable<number>; rects?: unknown
  reads?: readonly number[]
  group?: string | number | null
  id?: number
  follows?: number | null
}
/** a unit's lead on a shared line: the last row (layout file units, PDF units) of the unit its first row continues */
export interface RowLead { id: number; page: number; baseline: number; x0: number; x1: number; size: number }
/** a shared line's separation at most, in em of the row's size */
export declare const SHARED_SEP: number
/** the unit unit `id`'s first row continues on one of TeX's lines, by the layout file's index (indexLayout's `unit` and
 *  `onPage`, or the door's facade), or null; with `before`, chosen among the units it holds true of alone (those before `id`
 *  in K: the same however a door's parts come) */
export declare function rowLeadOf(index: { unit(id: number): { kind: string; lines: ArrayLike<number>; frames: ArrayLike<number>; held: readonly number[] } | null; onPage(page: number): readonly number[] } | null | undefined, id: number, before?: ((id: number) => boolean) | null): RowLead | null
/** the largest stream of the left units added so far whose first page is at most a page (-1 for none): the slot by the ids of
 *  a unit only the layout file holds that shares no line, over the units placed up to its own page */
export interface PagedBefore { add(page: number, stream: number): void; upTo(page: number): number }
export declare function pagedBefore(N: number): PagedBefore
/** the left's streams as lineAfterOf reads them: a unit's (undefined for one the left does not hold), the least over a value
 *  (Infinity for none), the greatest under it (-1 for none) */
export interface LeftStreams { of(id: number): number | undefined; above(v: number): number; below(v: number): number }
/** leftStreams over a Map of the left units' streams by id */
export declare function leftStreams(streamOf: ReadonlyMap<number, number>): LeftStreams
/** the stream a unit only the layout file holds stands right after (its K slot that plus a half) where it shares one of TeX's
 *  lines with a left unit, through the units the file alone holds between them on the line, in their order there; null where
 *  it shares none with one */
export declare function lineAfterOf(index: Parameters<typeof rowLeadOf>[0], id: number, streams: LeftStreams, lines: LineReader): number | null
/** a layout file's shared lines read once each (one reader a K): a unit's lead on its first row, the units a unit's last row
 *  leads on a page */
export interface LineReader { lead(id: number): number | null; followers(page: number, id: number): readonly number[] }
export declare function lineReader(index: Parameters<typeof rowLeadOf>[0]): LineReader
/** Need(p): the pages and K entries laying page p reads (`lay`, `rows`: K indices ascending; pages ascending, `draw` from page 1),
 *  the pages laid with it (`ready`, p among them) and the last page whose part it reads (`bound`) */
export interface Closure { pass: number[]; lay: number[]; draw: number[]; rows: number[]; ready: number[]; bound: number }
/** what laying a paper's pages reads of its units, by page (an index into K): `lay[g]` up to which every unit must be in to lay page g's drawing; `done`, `complete` as the page passes add; `bound[p]`, the latest page p may be done after */
export declare function needsOf(K: readonly NeedEntry[], N: number, passes: boolean, fileOnly: (c: NeedEntry) => boolean): { lay: number[]; done: number[]; complete: number[]; bound: number[] }
/** Need(p) over K for a paper of N pages (the 1b-D design §1.2). `fileOnly` (default: no `rects`) the entries only the layout file
 *  holds; `orderFree` false (default true): the prefix needsOf lays in order, with page passes or not (`passes`, default true) */
export declare function closureOf(K: readonly NeedEntry[], N: number, p: number, o?: { fileOnly?(c: NeedEntry): boolean; orderFree?: boolean; passes?: boolean }): Closure
/** each page's closureOf(K, N, p).bound, `[0]` 0 */
export declare function needBound(K: readonly NeedEntry[], N: number, o?: { fileOnly?(c: NeedEntry): boolean }): Int32Array
