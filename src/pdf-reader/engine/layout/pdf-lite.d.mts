// pdf-lite.mjs's types: PDF.js's worker without the images' pixels, for the server-side reads
/** the PDF.js the guard was made for */
export declare const LITE_PDFJS: string
/** `maxImageSize` of a document read without its images' pixels */
export declare const NO_IMAGE_PIXELS: number
/** the text of pdf.worker.mjs with the guard before its image decode; `version` (the host's pdfjs-dist) must be LITE_PDFJS; throws
 *  a RangeError unless the decode stands exactly once, a TypeError for a source that is no string */
export declare function liteWorkerSource(source: string, o?: { version?: string }): string
