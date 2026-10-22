// facade.mjs's types: the layout file a door holds while its parts come
import type { LayoutIndex } from '../layout/file.mjs'
import type { ReadHead, ReadPart } from './format.mjs'

/** the parts' layouts as one layout file: `index` the same object for the door's life, answering from the parts added so far;
 *  `add` a part read by readPart, in the chain's order */
export declare function layoutFacade(head: ReadHead): { index: LayoutIndex; add(part: ReadPart): void }
