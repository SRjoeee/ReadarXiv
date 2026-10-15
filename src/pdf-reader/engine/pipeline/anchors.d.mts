// anchors.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a token of the document: its text (empty for the rest of a word given in parts), page and box in PDF units, the text
 *  item it was read from, and where an item of marks alone after it on its baseline ends (inkEdges) */
export interface DocToken { t: string; page: number; x: number; y: number; w: number; h: number; top: number; bottom: number; item?: unknown; sym?: number | null; far?: number | null }
/** a page's text as getTextContent gives it */
export interface TextPage { page: number; items: unknown[]; styles?: Record<string, unknown> }
export interface Rect { page: number; x0: number; y0: number; x1: number; y1: number }
/** a unit's place: its line rectangles and the document tokens they are made of; with marks, the page token each word of
 *  its text was matched to, or -1 */
export interface Anchor { rects: Rect[]; coverage: number; tokens: number[]; bounded: boolean; pairs?: Map<number, number> }
/** a unit as the reader passes it: its text as that PDF has it, the offsets in it where a placeholder stood, and the
 *  letters of the displays it sets before its first words, after its last and between them (latex-front's
 *  displayOutside) */
export interface UnitText { id: number; text: string; gaps?: number[]; lead?: string; trail?: string; inner?: string }

export declare function tokens(s: string): { t: string; at: number; len: number }[]
export declare function tokenizeDocument(pages: TextPage[]): DocToken[]
/** marks (`${id}s` / `${id}e` → where, and the word carried with it) → id → [first token, last token] */
export declare function boundsFromMarks(doc: DocToken[], marks: Map<string, { page: number; x: number; y: number; t?: string | null }>): Map<string, [number, number]>
/** each mark with the word it stands by in `doc`, the document the marks were recorded in */
/** the token a mark sits right after on its baseline (its index in `doc`), or null: `byPage` each page's token indices */
export declare function tokenAtMark(doc: readonly DocToken[], byPage: Map<number, number[]>, mk: { page: number; x: number; y: number }, start: boolean): number | null
export declare function markWords(doc: DocToken[], marks: Map<string, { page: number; x: number; y: number }>): Map<string, { page: number; x: number; y: number; t: string | null }>
/** the pages' frame's rule: (doc, every unit's located tokens) → whether a token is inside the frame (pageFrame, today's) */
export type FrameRule = (doc: DocToken[], ms: readonly (number[] | null)[]) => (t: DocToken) => boolean
export declare const pageFrame: FrameRule
/** a unit's match (matchUnits): its matched tokens, coverage, bounds where it has marks, and the word → token map */
export interface UnitMatch { m: number[]; coverage: number; bounded: [number, number] | null; ws?: string[]; pairs?: Map<number, number> | null; textPairs?: Map<number, number> | null }
export interface MatchOptions { minCoverage?: number; bounds?: Map<string, [number, number]>; floating?: (id: number) => boolean; floatMatch?: Map<number, number[] | null> | null }
export declare function anchorUnits(doc: DocToken[], units: UnitText[], options?: MatchOptions & { frame?: FrameRule }): Map<number, Anchor | null>
/** every floating unit's match over the whole document (id → its tokens, or null), from the document and the words alone */
export declare function floatMatches(doc: DocToken[], units: UnitText[], floating?: (id: number) => boolean): Map<number, number[] | null>
/** anchorUnits' first half: each unit's match by the units' order (null: not found, or not in `only`) */
export declare function matchUnits(doc: DocToken[], units: UnitText[], options?: MatchOptions & { only?: ReadonlySet<number> | null }): (UnitMatch | null)[]
/** anchorUnits' second half, over these units and their matches */
export declare function placeUnits(doc: DocToken[], units: UnitText[], found: readonly (UnitMatch | null)[], options?: { frame?: FrameRule }): Map<number, Anchor | null>
/** where each of a unit's sentences after the first begins on the page: the page token of its first word found, rising */
export declare function sentenceStarts(anchor: Anchor | null | undefined, text: string, offsets: number[] | undefined): Int32Array | null
/** each token's ink across, its box widened over the marks its item sets against it (a full stop, a bracket) */
export declare function inkEdges(doc: DocToken[]): { l: Float32Array; r: Float32Array }
/** tokens → one rectangle per line: same page, baselines within half a line of each other */
export declare function lineRects(doc: DocToken[], idx: number[]): Rect[]
