// PDF.js's image decoders as a library (pdfjs-dist's image_decoders build): the JPEG decoder the bitmap figures' pass reads a DCT
// stream with on the server (pipeline/ocr-image.mjs). pdfjs-dist ships no types for this build; this is what the pass uses of it.
declare module 'pdfjs-dist/legacy/image_decoders/pdf.image_decoders.mjs' {
  export class JpegImage {
    constructor(o?: { colorTransform?: number; decodeTransform?: Int32Array | null })
    width: number
    height: number
    numComponents: number
    parse(data: Uint8Array): void
    getData(o: { width: number; height: number; forceRGB?: boolean; forceRGBA?: boolean; isSourcePDF?: boolean }): Uint8ClampedArray
  }
}
