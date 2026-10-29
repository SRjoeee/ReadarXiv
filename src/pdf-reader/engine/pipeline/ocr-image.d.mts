// ocr-image.mjs's types: a bitmap figure read from its own object in the PDF (PDF-READER §19.15)
export declare const OCR_READ_VERSION: string
export declare const OCR_READ_PIXELS: number
export declare const OCR_JPEG_PIXELS: number
export declare class OcrSourceRefusal extends Error { why: 'format' | 'big' }
export declare function refOf(s: string): { n: number; g: number } | null
export interface OcrSource {
  width: number; height: number; bpc: number; comps: number
  color: { kind: 'gray' | 'rgb' | 'cmyk'; comps: number } | { kind: 'indexed'; comps: 1; base: { kind: 'gray' | 'rgb' | 'cmyk'; comps: number }; hival: number; table: Uint8Array }
  decode: number[] | null; imageMask: boolean; filters: string[]
  predictor: { pred: number; colors: number; bpc: number; columns: number } | null; colorTransform: number
  data: Uint8Array; smask: OcrSource | null; mask: OcrSource | null; maskKey: number[] | null
}
export declare function ocrSourceOf(objects: { lookup(ref: unknown): unknown }, PL: Record<string, unknown>, ref: string): OcrSource
export declare function ocrSourceKey(src: OcrSource): Promise<string>
export declare function readSizeOf(width: number, height: number, max?: number): { width: number; height: number; scale: number }
export interface OcrView { x0: number; y0: number; x1: number; y1: number; width: number; height: number }
export declare function readOcrPixels(src: OcrSource, views: readonly OcrView[], o: { Jpeg: new (o?: { colorTransform?: number }) => unknown }): Promise<{ data: Uint8ClampedArray; width: number; height: number }[]>
