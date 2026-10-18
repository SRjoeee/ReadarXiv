// doc-loads.mjs's types: the documents a fixture load opens
export interface LoadingTask<D> { promise: Promise<D>; destroy(): unknown }
export interface DocLoad<D> {
  /** whether a newer load has begun */
  stale(): boolean
  /** the document at a URL; it is closed with the load unless the load is kept */
  open(url: string): Promise<D>
  /** true where this load is still the newest (its documents are the caller's now); otherwise they are closed, and false */
  keep(): boolean
  /** every document this load opened, closed */
  close(): void
}
export declare function createDocLoads<D>(o: { getDocument: (bytes: Uint8Array) => LoadingTask<D>; fetchBytes: (url: string) => Promise<Uint8Array> }): { begin(): DocLoad<D> }
