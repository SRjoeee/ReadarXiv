// ocr-fit.mjs's types: a bitmap figure's label laid in its lines' boxes
import type { OcrPlace } from './ocr-rows.mjs'

/** a label's line as drawn: its text, on its baseline from (x, y) along `angle` (degrees anticlockwise), `width` long, PDF units */
export interface OcrLineLaid { text: string; x: number; y: number; angle: number; width: number }
/** the text's pieces a line may break after */
export declare function piecesOf(text: string): string[]
/** the largest factor of the label's size (1 down to `floor`) a translation fits its lines at, or null */
export declare function ocrNeed(place: OcrPlace, text: string, measure: (s: string) => number, floor: number): number | null
/** a set's one factor: the least need of its labels that fit, 1 where none does */
export declare function ocrSetFactor(needs: readonly (number | null)[]): number
/** where a translation is drawn in a label's lines at factor `k` of its size, or null where it does not fit at it */
export declare function layOcr(place: OcrPlace, text: string, measure: (s: string) => number, k: number): { size: number; lines: OcrLineLaid[] } | null
/** where a translation is drawn in a label's lines, alone (at its own need), or null where it does not fit at `floor` of the label's size */
export declare function fitOcr(place: OcrPlace, text: string, measure: (s: string) => number, floor: number): { size: number; lines: OcrLineLaid[] } | null
