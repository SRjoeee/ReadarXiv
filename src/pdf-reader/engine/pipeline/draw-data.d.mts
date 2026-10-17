// draw-data.mjs's types: a page's draw geometry read from PDF.js
import type { Draw } from '../layer-proto/draw.mjs'
/** a font's map as a Set of characters (layer2's mappedOf, kept apart), or null where there is none */
export declare function mappedChars(toUnicode: unknown): Set<string> | null
/** a page's text content as its draw reads it: each item with a string, [str, a, b, d, e, f, width, height, fontName or null], each
 *  font name's fallback family, and `bad` where an item could not be read (the rows end before it) */
export interface DrawText { rows: [string, number, number, number, number, number, number, number, string | null][]; families: Map<string, string | null>; bad: boolean }
export declare function drawTextOf(tc: unknown): DrawText
/** page `page`'s draw (a PDF.js page proxy whose operator list has been read) and its JSON, or null with the reason: 'read', 'props' (opened without fontExtraProperties), 'font' (not embedded and not Type3:
 *  hosts read it differently), 'shed' (a cap). A memory-class error is thrown. `annots`: the page's annotations read once for
 *  every reader of the page (null where they could not be read), else read here; `text`: step T's read of the page (drawTextOf), else read here */
export declare function drawDataOf(page: unknown, annots?: (() => Promise<unknown[] | null>) | null, text?: DrawText | null): Promise<{ draw: Draw | null; text?: string; /** the text's UTF-8 bytes */ bytes?: number; why: null | 'read' | 'props' | 'font' | 'shed' }>
