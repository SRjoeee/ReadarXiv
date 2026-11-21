// feed.mjs's types: what a host hears of a paper's layer, merged into one, read by the format's readers
import type { LayerIndex, ReadPart, Ref } from '../layer-proto/format.mjs'

/** a reference as a host hears it: the format's Ref, a part's with the digest of the part it follows (`prev`, null for the
 *  first: the Worker's job updates and the look's 202s carry it; the catalog's parts do not) */
export type TellRef = Ref & { prev?: string | null }
export interface Told {
  units?: readonly TellRef[]
  head?: TellRef | null
  parts?: readonly TellRef[]
  end?: { through: number; refused?: string } | null
}
export interface FeedState {
  index: LayerIndex | null
  /** the parts read, in page order: the chain as told so far, as far as it reads */
  parts: readonly ReadPart[]
  end: { through: number; refused?: string } | null
  /** the parts read reach the end told */
  ended: boolean
  /** why there is no layer: the head, a units chunk or the index refused */
  refused: string | null
  /** the objects whose bytes are held now (fetched and not yet read) */
  held: number
}
export interface Feed {
  tell(refs: Told): void
  index(): Promise<LayerIndex | null>
  /** the units' kinds by id before the index (the chunks told from id 0, read as the index reads them), for an early wave of the
   *  faces; the index's once read; null where no chunk from 0 is told or one is refused */
  kinds(): Promise<readonly (string | null)[] | null>
  state(): FeedState
  dispose(): void
}
export declare function createFeed(o: {
  fetchObject(ref: Ref, signal: AbortSignal): Promise<Uint8Array>
  changed?(): void
  warn?(what: string, error: unknown): void
}): Feed
