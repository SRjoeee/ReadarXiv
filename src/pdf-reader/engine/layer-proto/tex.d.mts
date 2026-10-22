// tex.mjs's types: the layer's hybrid, v0's per-unit reading with its parts from the layout file where it locates a unit whole
import type { LayoutUnit } from '../layout/file.mjs'
import type { Rect } from './layer1.mjs'
import type { Char, Gap, Prepared, Unit, UnitParts } from './layer2.mjs'

/** locatedWhole's answer: whether the file locates the unit whole, why not, and each piece's source index */
export interface Whole { ok: boolean; why: 'unlocated' | 'pieces' | 'no row' | 'lost' | 'empty' | null; kOf?: number[] }
/** the unit's lines from the file as v0's rectangles, with each one's exact baseline and size and its line in the file */
export interface TexLines { rects: Rect[]; exact: Map<Rect, { baseline: number; size: number; top: number; bottom: number }>; lineOf: Map<Rect, number>; held: Rect[]; jOf: number[]; frameOf?: Map<number, number> }
/** each translated piece's source index from the units file's pieces (-1 for text), or null where they differ */
export declare function kOfPieces(unit: Unit, trPieces: readonly unknown[] | undefined): number[] | null
/** whether the file locates a unit whole: located, every placeholder v0 draws ink for found (a symbol drawn as text too
 *  only where `symbols` is 'strict'; with `held`, a LOST display its held lines cover) */
export declare function locatedWhole(lu: LayoutUnit | null, unit: Unit, trPieces: readonly unknown[] | undefined, o?: { symbols?: 'text' | 'strict'; held?: boolean }): Whole
/** the held run (its line indices) covering each displayed formula the unit's lines hold, by its piece index, read from the
 *  layout file and the source's order (kOf), never the translation's pieces; empty where the two do not agree */
export declare function displayCover(lu: LayoutUnit, unit: Unit, kOf: readonly number[]): Map<number, number[]>
/** whether a placeholder sets no ink by the file: a text macro it holds no row for */
/** each placeholder's fill by the file, by its piece index: 0xRRGGBB, MIXED_FILL (-1), or null */
export declare function fillOf(lu: LayoutUnit | null, kOf: readonly number[] | null): (k: number) => number | null
/** each colour piece's run's fill by the file, by its piece index: 0xRRGGBB, or null where the file has none */
export declare function colourOf(lu: LayoutUnit | null, kOf: readonly number[] | null): (k: number) => number | null
export declare function inklessOf(lu: LayoutUnit, kOf: readonly number[], p: { k: number; cls: string }): boolean
/** whether a placeholder of the unit's is one TeX set no ink for by the file (EMPTY), of a class the layer draws ink for but a
 *  text symbol: drawn as nothing on the file's lines */
export declare function emptyOf(lu: LayoutUnit, kOf: readonly number[], p: { k: number; cls: string }): boolean
/** LaTeX's forced line breaks: `\\` (starred, or with its optional space) and \newline */
export declare const FORCED_BREAK: RegExp
/** a forced break TeX set: the file's line after it, its frame's pitch, and the room TeX left between the two beyond it, in
 *  pitches (1 for `\\ \\`, 0 for a lone `\\`); both null where that line opens another frame or the frame has no pitch of
 *  its own (the text after it starts there) */
export interface ForcedBreak { next: number; room: number | null; pitch: number | null }
/** where each forced break of the unit's row ends a line of the file: each piece of a break group paired with TeX's breaks
 *  in order (the lines ended short of their frame's measure), by its index, to its break; empty where nothing pairs */
export declare function forcedBreaks(lu: LayoutUnit | null, unit: Unit, kOf?: readonly number[] | null, lineskip?: readonly [skip: number, limit: number] | null): Map<number, ForcedBreak>
/** the unit's lines from the file, on the pages up to maxPage; `held` those its source does not write, kept */
export declare function texRects(lu: LayoutUnit, maxPage?: number): TexLines
/** a segment of a row in the file: its page, its extent across, its baseline, and its box's top and bottom */
export interface Segment { page: number; x0: number; base: number; x1: number; top: number; bottom: number }
/** the unit's displayed formulas TeX set under a line of its own with its short skip (that line ends 2 em before the display,
 *  its top nearer than SHORT_SKIP of the line's size under its baseline): each such segment of a found display row, with that
 *  line's index in the file (`line`), once for each such line */
export declare function shortSkipsOf(lu: LayoutUnit): (Segment & { line: number })[]
/** a placeholder's rendering from its segments (stride 6): the unit's characters inside them and its ink's box */
export declare function renderingOf(segs: Float64Array, uc: readonly Char[], display: boolean): Gap | null
/** part 5 for any unit the hybrid draws, the safe rule's one place: every rendering proven by the file (the file's own
 *  rendering, a crop cut from its placeholder's segment on its page, that segment's baseline its own, page text or kept
 *  ink inside its segments, and one v0 found none for read from its row's segments: `unit` given; with `textRuns`, the
 *  file's lines, a LOST text piece by the run of the unit's leftover characters that spells it); the k of one nothing
 *  proves (its unit stays the original's), else -1 */
export declare function proofOf(lu: LayoutUnit | null, kOf: readonly number[] | null, shown?: number, o?: { textRuns?: boolean; whole?: boolean }): (out: Prepared, unit?: Unit | null) => number
/** a text piece: a placeholder whose plain text is its whole rendering (a code or URL mark, or a plain-text source, its
 *  argument literal): its plain text as written, or null */
export declare function textPieceOf(src: string | undefined | null): { text: string } | null
/** the unit's parts from the file: 'ph' its placeholders' renderings; 'lines' its lines and label too; extents 'tex' the
 *  file's erase rectangles; every use, the proof (proofOf) */
export declare function texParts(lu: LayoutUnit, kOf: readonly number[], o: { use: 'ph' | 'lines'; lines?: TexLines | null; extents?: 'v0' | 'tex'; shown?: number; lineskip?: readonly [skip: number, limit: number] | null }): UnitParts
