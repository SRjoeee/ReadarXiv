// ocr-fit.mjs's types: a bitmap figure's label laid in its lines' boxes
import type { OcrPlace } from './ocr-rows.mjs'

/** a label's line as drawn: its text, on its baseline from (x, y) along `angle` (degrees anticlockwise), `width` long, PDF units */
export interface OcrLineLaid { text: string; x: number; y: number; angle: number; width: number }
/** the text's pieces a line may break after */
export declare function piecesOf(text: string): string[]
/** where a translation is drawn in a label's lines, or null where it does not fit at `floor` of the label's size */
export declare function fitOcr(place: OcrPlace, text: string, measure: (s: string) => number, floor: number): { size: number; lines: OcrLineLaid[] } | null
