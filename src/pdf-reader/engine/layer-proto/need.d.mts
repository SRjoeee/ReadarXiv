// need.mjs's types: the rule for what laying a page waits for (moved out of run.mjs)
/** one entry of the stream's K (the units v0 may place, by (slot, id)) as needsOf reads it: the pages each of its sources would draw it on, and every page their lines are on; `rects` null where only the layout file holds the unit */
export interface NeedEntry { lists: readonly (readonly number[])[]; reach: Iterable<number>; rects?: unknown }
/** what laying a paper's pages reads of its units, by page (an index into K): `lay[g]` up to which every unit must be in to lay page g's drawing; `done`, `complete` as the page passes add */
export declare function needsOf(K: readonly NeedEntry[], N: number, passes: boolean, fileOnly: (c: NeedEntry) => boolean): { lay: number[]; done: number[]; complete: number[] }
