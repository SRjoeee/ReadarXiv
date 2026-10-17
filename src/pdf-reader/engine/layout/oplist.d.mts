// oplist.mjs's types: a page's operator list asked within a time, for the layout maker and the add-on's plans

/** a page's operator list waited for at most, ms: past it the page has no ink and no plan, that page alone */
export declare const OPS_MS: number
/** a promise's value, or null where it does not come within `ms` or fails */
export declare function within<T>(promise: Promise<T> | T, ms: number): Promise<T | null>
/** a page proxy as these read it: its operator list, and PDF.js's own cancellation and cleanup where it has them */
export interface ListPage {
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>
  cleanup?(): unknown
  _abortOperatorList?: unknown
  _intentStates?: unknown
}
/** who gave up (`who`, for the warning) and whether the warning that this PDF.js cancels nothing was given (once a reader) */
export interface GiveUpSeen { warned: boolean; who?: string }
/** a page's operator list given up on: PDF.js's cancellation of its stream, its intent state dropped and the page cleaned up */
export declare function giveUp(page: ListPage, seen: GiveUpSeen): void
/** a page's operator list within `ms` (OPS_MS), or null: given up on (giveUp) and let go (cleanup) where it does not come or fails */
export declare function listWithin(page: ListPage, seen: GiveUpSeen, ms?: number): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> } | null>
