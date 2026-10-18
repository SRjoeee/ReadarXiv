// ref.mjs's types, for the tests: what they read of it
/** a local path as a record keeps it, with no user's name or machine's directory in it */
export declare function shownPath<T>(p: T, base?: string | null): T extends string ? string : T
/** a frozen reference: its pages' rows [id, kind, lines] (each line x0, x1, baseline, top, bottom, size), the units by id,
 *  then the names (`name:<occurrence>`) by occurrence */
export interface Ref { schema: number; from: Record<string, unknown> & { names?: number }; pages: Record<string, [number | string, string, number[]][]> }
/** the reference of a fixture from layout files' bytes (the first that locates a unit gives its rows, the first that
 *  locates any name the names) and the prototype's geometry for the units none locates */
export declare function makeRef(layouts: Uint8Array | Uint8Array[], geometry: Uint8Array | null, from?: Record<string, unknown>): Ref
/** a reference as it stands with the names of the first of `layouts` that locates any, its own names taken out */
export declare function withNames(ref: Ref, layouts: Uint8Array[]): Ref
