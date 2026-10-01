// anchors.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a token of the document: its text (empty for the rest of a word given in parts), page and box in PDF units, the text
 *  item it was read from, and where an item of marks alone after it on its baseline ends (inkEdges) */
export interface DocToken { t: string; page: number; x: number; y: number; w: number; h: number; top: number; bottom: number; item?: unknown; sym?: number | null; far?: number | null }
/** a page's text as getTextContent gives it */
export interface TextPage { page: number; items: unknown[]; styles?: Record<string, unknown> }
export interface Rect { page: number; x0: number; y0: number; x1: number; y1: number }
/** a unit's place: its line rectangles and the document tokens they are made of */
export interface Anchor { rects: Rect[]; coverage: number; tokens: number[]; bounded: boolean }
/** a unit as the reader passes it: its text as that PDF has it, the offsets in it where a placeholder stood, and the
 *  letters of the displays it sets before its first words, after its last and between them (latex-front's
 *  displayOutside) */
export interface UnitText { id: number; text: string; gaps?: number[]; lead?: string; trail?: string; inner?: string }

export declare function tokens(s: string): { t: string; at: number; len: number }[]
export declare function tokenizeDocument(pages: TextPage[]): DocToken[]
/** marks (`${id}s` / `${id}e` → where, and the word carried with it) → id → [first token, last token] */
export declare function boundsFromMarks(doc: DocToken[], marks: Map<string, { page: number; x: number; y: number; t?: string | null }>): Map<string, [number, number]>
/** each mark with the word it stands by in `doc`, the document the marks were recorded in */
export declare function markWords(doc: DocToken[], marks: Map<string, { page: number; x: number; y: number }>): Map<string, { page: number; x: number; y: number; t: string | null }>
export declare function anchorUnits(doc: DocToken[], units: UnitText[], options?: { minCoverage?: number; bounds?: Map<string, [number, number]>; floating?: (id: number) => boolean }): Map<number, Anchor | null>
/** each token's ink across, its box widened over the marks its item sets against it (a full stop, a bracket) */
export declare function inkEdges(doc: DocToken[]): { l: Float32Array; r: Float32Array }
/** tokens → one rectangle per line: same page, baselines within half a line of each other */
export declare function lineRects(doc: DocToken[], idx: number[]): Rect[]
