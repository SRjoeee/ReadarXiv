// facade.mjs's types: the layout file a door holds while its parts come
import type { LayoutIndex } from '../layout/file.mjs'
import type { ReadHead, ReadPart } from './format.mjs'

/** whether the layer is drawn over this base: its `source` is 'ours' (arXiv's page, or none told: the layer draws nothing) */
export declare function drawsFrom(base: { source?: string } | null | undefined): boolean

/** the parts' layouts as one layout file: `index` the same object for the door's life, answering from the parts added so far;
 *  `add` a part read by readPart, in the chain's order */
export declare function layoutFacade(head: ReadHead): { index: LayoutIndex; add(part: ReadPart): void }
