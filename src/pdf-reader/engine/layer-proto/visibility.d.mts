// visibility.mjs's types: our groups by name, and a document's renders through its one optional-content configuration
export declare const GROUP_PREFIX: string
export declare function textGroup(id: number): string
export declare function placeholderGroup(id: number): string
export declare function labelGroup(id: number): string
export declare function nameGroup(occurrence: number): string
/** render B's hidden groups: every unit's text and label */
export declare function cropSourceOff(group: string): boolean
/** how many pages of a document keep their rendering state (PDF.js's operator list and decoded images) after a render */
export declare const WARM_PAGES: number
export interface Visibility {
  /** the configuration read (never rejects: a document whose configuration cannot be read holds no group of ours) */
  readonly ready: Promise<void>
  has(group: string): boolean
  readonly size: number
  /** the page rendered with the groups `off` names (or tests) hidden and every other group of ours shown, after every render asked
   *  before it */
  render(page: { render(params: object): { promise: Promise<unknown> }; cleanup?(): unknown }, params: object, off?: Iterable<string> | ((group: string) => boolean), live?: (() => boolean) | null): Promise<unknown>
  /** the pages kept warm after their renders (at most WARM_PAGES, the latest last; each the next render's state, the oldest let go
   *  by its `cleanup()`): a copy */
  readonly warm: readonly object[]
  /** the page held warm (never let go) until the release returned is called: a reading of its rendering state under way */
  pin(page: object): () => void
}
export declare function visibilityOf(doc: object): Visibility
