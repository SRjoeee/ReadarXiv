// anchors.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a token of the document: its text (empty for the rest of a word given in parts), page and box in PDF units */
export interface DocToken { t: string; page: number; x: number; y: number; w: number; h: number; top: number; bottom: number }
/** a page's text as getTextContent gives it */
export interface TextPage { page: number; items: unknown[]; styles?: Record<string, unknown> }
export interface Rect { page: number; x0: number; y0: number; x1: number; y1: number }
/** a unit's place: its line rectangles and the document tokens they are made of */
export interface Anchor { rects: Rect[]; coverage: number; tokens: number[]; bounded: boolean }
/** a unit as the reader passes it: its text as that PDF has it, and the offsets in it where a placeholder stood */
export interface UnitText { id: number; text: string; gaps?: number[] }

export declare function tokens(s: string): { t: string; at: number; len: number }[]
export declare function tokenizeDocument(pages: TextPage[]): DocToken[]
/** marks (`${id}s` / `${id}e` → where, and the word carried with it) → id → [first token, last token] */
export declare function boundsFromMarks(doc: DocToken[], marks: Map<string, { page: number; x: number; y: number; t?: string | null }>): Map<string, [number, number]>
export declare function anchorUnits(doc: DocToken[], units: UnitText[], options?: { minCoverage?: number; bounds?: Map<string, [number, number]>; floating?: (id: number) => boolean }): Map<number, Anchor | null>
