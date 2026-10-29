// pdf-lite.mjs's types: PDF.js's worker without the images' pixels, for the server-side reads
/** the PDF.js the guard was made for */
export declare const LITE_PDFJS: string
/** `maxImageSize` of a document read without its images' pixels */
export declare const NO_IMAGE_PIXELS: number
/** `maxImageSize` of a document read without its images' pixels whose Link annotations keep their overlaid text (the draw's) */
export declare const LINK_TEXT_PIXELS: number
/** `maxImageSize` of a document read for its images' objects (the bitmap figures' pass): no pixels, each image's paint operator
 *  naming its object, its id ending `~` and PDF.js's ref (`img_p0_3~12R`) */
export declare const OCR_IMAGE_PIXELS: number
/** the text of pdf.worker.mjs with the guard before its image decode; `version` (the host's pdfjs-dist) must be LITE_PDFJS; throws
 *  a RangeError unless each anchor stands exactly once, a TypeError for a source that is no string */
export declare function liteWorkerSource(source: string, o?: { version?: string }): string
