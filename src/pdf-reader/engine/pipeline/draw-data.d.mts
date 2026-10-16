// draw-data.mjs's types: a page's draw geometry read from PDF.js
import type { Draw } from '../layer-proto/draw.mjs'
/** a font's map as a Set of characters (layer2's mappedOf, kept apart), or null where there is none */
export declare function mappedChars(toUnicode: unknown): Set<string> | null
/** page `page`'s draw (a PDF.js page proxy whose operator list has been read) or null with the reason: 'read', 'font' (not embedded and not Type3:
 *  hosts read it differently), 'shed' (a cap). A memory-class error is thrown */
export declare function drawDataOf(page: unknown): Promise<{ draw: Draw | null; why: null | 'read' | 'font' | 'shed' }>
