// bitmap-text.mjs's types: a bitmap figure's labels, read by the recogniser and placed on its page (PDF-READER §19.15)
/** a recognised line (src/shared/ocr.ts OcrLine's shape): its text, its corners normalised to the image (origin top left, in
 *  reading order), its confidence, and a line read on its side's angle and own length and thickness */
export interface OcrLine { text: string; quad: readonly (readonly [number, number])[]; conf: number; angle?: number; len?: number; thick?: number }

export type Pt = [number, number]
/** a label drawn: its text, its lines' count, its size (PDF units), its anchor, its ground's colour and its ink's (0xRRGGBB), and
 *  each line's quad and patch on the page (PDF units, ↖ ↗ ↘ ↙ in the line's reading) */
export interface OcrLabel { text: string; lines: number; size: number; anchor: 'start' | 'centre' | 'end'; bg: number; fg: number; quads: [Pt[], Pt[]][]; set: number }
/** an image's sets' counts: sets of two labels or more, the labels in them, the anchors their columns changed, the sizes their
 *  medians changed */
export interface OcrSets { sets: number; grouped: number; aligned: number; sized: number }
export type OcrWhy = 'busy' | 'crowded' | 'overlap' | 'covered' | 'clipped' | 'mirrored' | 'outside' | 'long' | 'past'
/** an image as PDF.js decodes one: kind 1 a bit a pixel, 2 RGB, 3 RGBA */
export interface DecodedImage { data: Uint8Array | Uint8ClampedArray; width: number; height: number; kind: number }
export declare const PATCH_PAD: number
export declare const RING: number
export declare const RING_FLAT: number
export declare const NEAR: number
export declare const CROWD: number
export declare const OCR_SIZE: number
export declare const ANCHOR_REACH: number
export declare const ANCHOR_RATIO: number
export declare const OCR_LINES_MAX: number
export declare const OCR_TEXT_MAX: number
export declare const OCR_UNITS_IMAGE: number
export declare const OCR_UNITS_DOC: number
export declare const OCR_WHYS: readonly OcrWhy[]
export declare const OCR_ANCHORS: readonly ['start', 'centre', 'end']
/** a pixel reader of a decoded image: each pixel as the page shows it over white */
export declare function pixelReader(image: DecodedImage): (x: number, y: number) => [number, number, number]
/** one placed image's labels: those drawn, and those left the original's with why */
export declare function labelsOf(o: {
  image: DecodedImage
  lines: readonly OcrLine[]
  place: { page: number; ctm: readonly number[]; clip: readonly (readonly Pt[])[] | 'complex' | null; view: readonly number[] | null }
  others?: { boxes: readonly (readonly number[])[]; segs: readonly (readonly number[])[]; fills?: readonly (readonly (readonly number[])[])[]; images?: readonly Pt[][] } | null
  taken?: Pt[][]
  limit?: number
}): { units: OcrLabel[]; left: { text: string; why: OcrWhy }[]; read: number; member: number; sets: OcrSets }
export declare const SET_ALIGN: number
export declare const SET_SIZE: number
/** an image's labels in their sets: each one's `set` (its set's first label's index), `anchor` and `size` set */
export declare function setsOf(units: Omit<OcrLabel, 'set'>[]): OcrSets
